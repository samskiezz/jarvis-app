#!/usr/bin/env python3
"""CLAUDE AUDIT SCORING ENGINE — the 1,000-point "did this change actually improve the app?" brain.

A builder (Claude, or Kimi/OpenClaw) produces a candidate change on an isolated working tree. THIS module
makes Claude act as the senior audit-and-scoring engine over the real diff + the crash-proof gate evidence,
and returns a structured verdict that decides whether the change may land on main.

Design choices that make it trustworthy:
  * Claude judges EVIDENCE (the diff + gate report), never the builder's claims.
  * Claude returns per-category POINTS, named penalties, hard blockers, an improvement delta and gains.
  * Python does ALL arithmetic (clamping each category to its cap, summing, applying penalties, mapping the
    verdict band) — models are unreliable at arithmetic, so the score is deterministic given the judgment.
  * Hard blockers force FAIL regardless of score. Auto-merge requires gate-pass AND final >= MERGE_MIN AND
    no hard blocker. This mirrors the research finding that test-gating ALONE is insufficient.

Usage (standalone, for testing):  python3 scripts/audit_score.py --files server/dashboard.py
Programmatic:  from audit_score import audit_score; audit_score(feat, files, gate_report)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# category -> max points (sums to 1,000)
CAPS = {
    "product_improvement": 150,
    "feature_completeness": 100,
    "user_experience": 100,
    "functional_correctness": 125,
    "test_confidence": 125,
    "security_permissions": 125,
    "performance_reliability": 75,
    "architecture_quality": 75,
    "maintainability": 50,
    "automation_intelligence": 75,
}

# canonical damage penalties (name -> magnitude). Claude proposes which apply; we clamp to these values.
PENALTIES = {
    "critical_security_issue": 400,
    "breaks_existing_core_feature": 300,
    "build_fails": 250,
    "tests_fail_due_to_change": 250,
    "data_loss_risk": 250,
    "auth_permission_regression": 250,
    "deployment_risk": 200,
    "performance_regression": 150,
    "broad_unfocused_change": 100,
    "no_rollback_plan": 100,
    "no_test_evidence": 100,
    "no_learning_update": 50,
    "weak_docs_complex_change": 30,
}

# any of these in hard_blockers -> FAIL regardless of score
HARD_BLOCKER_KEYS = {
    "critical_security_issue", "secrets_exposed", "build_fails", "tests_fail_due_to_change",
    "auth_data_deploy_db_weakened", "rollback_impossible", "bypasses_review", "improvement_not_implemented",
}

MODEL = os.environ.get("AUDIT_MODEL", "claude-opus-4-8")
# minimum final score required to auto-merge (spec's auto-pass gate = 850)
MERGE_MIN = int(os.environ.get("AUTO_MERGE_MIN", "850"))


def _run(cmd, timeout=120, cwd=ROOT, env=None):
    try:
        e = dict(os.environ, **(env or {}))
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=e)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"
    except Exception as ex:  # noqa: BLE001
        return 1, str(ex)


def _diff(files):
    rc, out = _run(["git", "diff", "HEAD", "--", *files], timeout=40)
    return out if rc == 0 else ""


def _risk_depth(diff: str, files) -> tuple:
    """Pick audit depth like the spec: normal=30-50 Qs, high=80-120, critical=all 200."""
    sensitive = any(k in " ".join(files) for k in ("auth", "config", "payment", "secret", "permission", "login"))
    lines = diff.count("\n")
    if sensitive or lines > 800:
        return "critical", "use your full audit framework (treat as ~200 questions / all 10 categories deeply)"
    if lines > 250:
        return "high", "select the 80-120 most relevant audit questions across the 10 categories"
    return "normal", "select the 30-50 most relevant audit questions across the 10 categories"


SCHEMA_HINT = (
    '{"breakdown":{"product_improvement":<0-150>,"feature_completeness":<0-100>,"user_experience":<0-100>,'
    '"functional_correctness":<0-125>,"test_confidence":<0-125>,"security_permissions":<0-125>,'
    '"performance_reliability":<0-75>,"architecture_quality":<0-75>,"maintainability":<0-50>,'
    '"automation_intelligence":<0-75>},'
    '"penalties":[{"name":"<one of the canonical penalty keys>","reason":"<why>"}],'
    '"hard_blockers":[{"key":"<one of the hard-blocker keys>","reason":"<why>"}],'
    '"delta":{"before":<0-10>,"after":<0-10>,"capability":"<what capability, before vs after>"},'
    '"automation_gain":<0-10>,"test_coverage_gain":<0-10>,'
    '"improvement_proven":"<text>","damage_risk":"<text>","test_evidence":"<text>",'
    '"security_evidence":"<text>","rollback_confidence":"high|medium|low",'
    '"learning_value":"<text>","required_fixes":["<fix>"],"next_action":"<one action>"}'
)


def _prompt(feat, diff, gate_report, depth_note) -> str:
    gate_txt = json.dumps(gate_report, indent=2)[:2000] if gate_report else "no gate report supplied"
    return (
        "You are Claude acting as the senior audit and scoring engine for AI-generated code changes for a "
        "self-hosted app (FastAPI + a stdlib dashboard) used daily by a DISABLED owner who depends on it. "
        "Score whether this change GENUINELY advances the app or damages it. Do NOT reward claimed "
        "improvements — only reward improvement proven by the diff, the gate evidence, or clear reasoning. "
        "Do NOT ignore damage: any regression, security issue, broken test, missing rollback, or unclear "
        "behaviour must reduce the score.\n\n"
        f"AUDIT DEPTH: {depth_note}. For each question you consider, judge answer (yes/no/partial/n-a), cite "
        "evidence from the diff/gate, assign risk, and let it move the category points.\n\n"
        "SCORE OUT OF 1,000 across these capped categories (return integer points within each cap):\n"
        "1. product_improvement /150 — more useful, complete, valuable?\n"
        "2. feature_completeness /100 — closes a real missing feature / weak function / broken flow?\n"
        "3. user_experience /100 — easier, clearer, faster, safer, more satisfying?\n"
        "4. functional_correctness /125 — correctly does what it claims incl. edge & failure states?\n"
        "5. test_confidence /125 — enough tests / verification to trust it?\n"
        "6. security_permissions /125 — no secrets, auth regressions, permission mistakes, injection, "
        "dependency risk, data leaks, unsafe ops?\n"
        "7. performance_reliability /75 — preserves/improves speed, stability, retry, recovery?\n"
        "8. architecture_quality /75 — fits existing architecture without needless complexity?\n"
        "9. maintainability /50 — clean, understandable, consistent, easy to change later?\n"
        "10. automation_intelligence /75 — more automated, self-correcting, better at prioritising/learning?\n\n"
        "DAMAGE PENALTIES — list every one that applies (canonical keys, magnitudes are fixed and applied by "
        "the caller): critical_security_issue, breaks_existing_core_feature, build_fails, "
        "tests_fail_due_to_change, data_loss_risk, auth_permission_regression, deployment_risk, "
        "performance_regression, broad_unfocused_change, no_rollback_plan, no_test_evidence, "
        "no_learning_update, weak_docs_complex_change.\n\n"
        "HARD BLOCKERS — list any that apply (force FAIL): critical_security_issue, secrets_exposed, "
        "build_fails, tests_fail_due_to_change, auth_data_deploy_db_weakened, rollback_impossible, "
        "bypasses_review, improvement_not_implemented.\n\n"
        "IMPROVEMENT DELTA — identify the exact capability before vs after; score before 0-10 and after 0-10. "
        "Only give a big delta if it closes a real feature gap, unlocks a workflow, improves automation/"
        "reliability, or reduces manual work.\n\n"
        f"FEATURE: {feat.get('title','?')} — {feat.get('brief','')[:400]}\n"
        f"FILES: {', '.join(feat.get('_files', []))}\n\n"
        f"CRASH-PROOF GATE REPORT (real test/boot/compile evidence — do not invent beyond this):\n{gate_txt}\n\n"
        f"UNIFIED DIFF (the actual change — judge THIS):\n{diff[:14000]}\n\n"
        "Return ONLY a single JSON object, no markdown fence, exactly this shape:\n" + SCHEMA_HINT
    )


def _claude_judge(prompt: str, timeout: int = 360) -> str:
    pf = "/tmp/_audit_prompt.txt"
    of = "/tmp/_audit_out.json"
    with open(pf, "w", encoding="utf-8") as fh:
        fh.write(prompt)
    cmd = ('claude -p "$(cat %s)" --model %s --output-format json > %s 2>&1' % (pf, MODEL, of))
    _run(["bash", "-c", cmd], timeout=timeout, env={"IS_SANDBOX": "1"})
    try:
        raw = open(of, encoding="utf-8").read()
    except Exception:  # noqa: BLE001
        return ""
    # claude --output-format json wraps the reply; pull the assistant text then the inner JSON object.
    try:
        wrap = json.loads(raw)
        return wrap.get("result") or wrap.get("text") or raw
    except Exception:  # noqa: BLE001
        return raw


def _parse(text: str):
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        # tolerate trailing junk by trimming to the last closing brace
        s = m.group(0)
        for i in range(len(s) - 1, 0, -1):
            if s[i] == "}":
                try:
                    return json.loads(s[: i + 1])
                except Exception:  # noqa: BLE001
                    continue
        return None


def _band(score: int) -> str:
    if score >= 900:
        return "ELITE"
    if score >= 850:
        return "STRONG"
    if score >= 700:
        return "NEEDS_REVISION"
    if score >= 600:
        return "WEAK_RISKY"
    if score >= 400:
        return "REJECT"
    return "ROLLBACK_BLOCK"


def compute(judgment: dict, gate_passed: bool) -> dict:
    """Deterministic scoring from Claude's judgment. Python owns all arithmetic + the verdict."""
    bd_in = judgment.get("breakdown", {}) or {}
    breakdown = {}
    for k, cap in CAPS.items():
        try:
            v = int(round(float(bd_in.get(k, 0))))
        except Exception:  # noqa: BLE001
            v = 0
        breakdown[k] = max(0, min(cap, v))
    subtotal = sum(breakdown.values())

    applied = []
    penalty_total = 0
    for p in (judgment.get("penalties") or []):
        name = (p.get("name") if isinstance(p, dict) else str(p)) or ""
        if name in PENALTIES:
            mag = PENALTIES[name]
            applied.append({"name": name, "points": -mag,
                            "reason": (p.get("reason", "") if isinstance(p, dict) else "")})
            penalty_total += mag

    hard = []
    for b in (judgment.get("hard_blockers") or []):
        key = (b.get("key") if isinstance(b, dict) else str(b)) or ""
        if key in HARD_BLOCKER_KEYS:
            hard.append({"key": key, "reason": (b.get("reason", "") if isinstance(b, dict) else "")})

    final_score = max(0, min(1000, subtotal - penalty_total))

    delta = judgment.get("delta", {}) or {}
    before = max(0, min(10, int(delta.get("before", 0) or 0)))
    after = max(0, min(10, int(delta.get("after", 0) or 0)))
    delta_val = after - before
    auto_gain = max(0, min(10, int(judgment.get("automation_gain", 0) or 0)))
    test_gain = max(0, min(10, int(judgment.get("test_coverage_gain", 0) or 0)))
    # "smart" advancement metric layered on the canonical final score (no double penalty — final already net).
    advancement = max(0, min(1000, final_score + delta_val * 20 + auto_gain * 10 + test_gain * 10))

    verdict = "FAIL" if hard else _band(final_score)
    merge_ok = bool(gate_passed) and not hard and final_score >= MERGE_MIN

    return {
        "verdict": verdict,
        "merge_ok": merge_ok,
        "final_score": final_score,
        "subtotal": subtotal,
        "advancement_score": advancement,
        "breakdown": breakdown,
        "penalties": applied,
        "penalty_total": -penalty_total,
        "hard_blockers": hard,
        "delta": {"before": before, "after": after, "delta": delta_val,
                  "capability": delta.get("capability", "")},
        "automation_gain": auto_gain,
        "test_coverage_gain": test_gain,
        "gate_passed": bool(gate_passed),
        "merge_min": MERGE_MIN,
        "improvement_proven": judgment.get("improvement_proven", ""),
        "damage_risk": judgment.get("damage_risk", ""),
        "test_evidence": judgment.get("test_evidence", ""),
        "security_evidence": judgment.get("security_evidence", ""),
        "rollback_confidence": judgment.get("rollback_confidence", ""),
        "learning_value": judgment.get("learning_value", ""),
        "required_fixes": judgment.get("required_fixes", []),
        "next_action": judgment.get("next_action", ""),
    }


def audit_score(feat: dict, files: list, gate_report=None) -> dict:
    """Full audit: build the diff, ask Claude to judge it, compute the deterministic 1,000-pt verdict."""
    feat = dict(feat or {})
    feat["_files"] = files or []
    diff = _diff(files or [])
    gate_passed = bool((gate_report or {}).get("pass"))
    if not diff:
        return {"verdict": "FAIL", "merge_ok": False, "final_score": 0,
                "error": "no diff to audit",
                "hard_blockers": [{"key": "improvement_not_implemented", "reason": "no change on disk"}],
                "gate_passed": gate_passed}
    depth, note = _risk_depth(diff, files or [])
    text = _claude_judge(_prompt(feat, diff, gate_report, note))
    judgment = _parse(text)
    if not judgment:
        return {"verdict": "FAIL", "merge_ok": False, "final_score": 0,
                "error": "audit judge returned unparseable output", "raw": (text or "")[:400],
                "risk_depth": depth, "gate_passed": gate_passed}
    result = compute(judgment, gate_passed)
    result["risk_depth"] = depth
    result["title"] = feat.get("title", "?")
    return result


if __name__ == "__main__":
    a = sys.argv
    files = a[a.index("--files") + 1].split(",") if "--files" in a else []
    rep = None
    try:
        rep = json.loads(open("/tmp/_gate_last.json", encoding="utf-8").read())
    except Exception:  # noqa: BLE001
        pass
    out = audit_score({"title": "manual audit", "brief": "standalone test"}, files, rep)
    print(json.dumps(out, indent=2))
