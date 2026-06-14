#!/usr/bin/env python3
"""AUTONOMOUS SELF-IMPROVEMENT ORCHESTRATOR (owner-consented, crash-proof).

Every run (cron, every 12h) it:
  1. IDEATE   — asks the LLM for N concrete NEW user-facing UX features, informed by the live app's
                feature list + code-audit findings (deadzone/friction) + the suggestion engine.
  2. IMPLEMENT— for each feature, the Claude Code CLI implements it fully IN PLACE (it may research the
                web/forums itself). Only the files Claude *newly* touches are tracked for that feature.
  3. GATE     — scripts/auto_improve_gate.py runs the CRASH-PROOF checks: py_compile + JS syntax +
                theme-lock + pytest(collect) + a LIVE boot of the app on a throwaway port serving /health.
  4. LAND     — ONLY if the gate is green: commit just the feature's files, push origin main, restart the
                services, then HEALTH-CHECK the live app. If the live app is unhealthy → AUTO-ROLLBACK
                (git revert + push + restart). If the gate is red → discard the feature's changes.
  5. LEARN    — append a structured outcome to server/data/auto_improve.log.jsonl.

Safety: a feature can NEVER reach main unless the app compiled AND booted AND served /health in the gate;
after landing, a failing health-check auto-reverts. Pre-existing uncommitted files are never swept in
(only files that were CLEAN before Claude touched them are committed). Never modifies this script, the
gate, auth, or git history.

Usage:  python3 scripts/auto_improve.py [--features N] [--dry-run] [--tier claude|strong]
        --dry-run does ideate+implement+gate but never commits/pushes/restarts (for verifying the pipeline).
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audit_score import audit_score  # noqa: E402  (the 1,000-pt Claude scoring/merge-decision engine)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.path.join(ROOT, ".venv", "bin", "python")
PY = PY if os.path.exists(PY) else sys.executable
CLAUDE = os.environ.get("CLAUDE_BIN", "/root/.local/bin/claude")
LOGFILE = os.path.join(ROOT, "server", "data", "auto_improve.log.jsonl")
PROTECTED = {"scripts/auto_improve.py", "scripts/auto_improve_gate.py", "scripts/audit_score.py",
             "server/auth.py", "server/config.py"}
# Minimum 1,000-pt audit score required to auto-merge (the spec's auto-pass gate).
MERGE_MIN_SCORE = int(os.environ.get("AUTO_MERGE_MIN", "850"))
HEALTH = [("http://127.0.0.1:8001/health", 200), ("http://127.0.0.1:8095/jarvis_live.html", 200)]


def run(cmd, timeout=120, cwd=ROOT, env=None):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           env=dict(os.environ, **(env or {})))
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timeout {timeout}s"
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def log(event: dict):
    event["ts"] = int(time.time())
    try:
        with open(LOGFILE, "a") as f:
            f.write(json.dumps(event, default=str) + "\n")
    except Exception:  # noqa: BLE001
        pass
    print(json.dumps(event, default=str)[:400])


def _tracked_state():
    """Files currently dirty (modified or untracked) — so we never commit pre-existing changes."""
    rc, out = run(["git", "status", "--porcelain"], timeout=30)
    return {line[3:].strip() for line in out.splitlines() if line.strip()}


def ideate(n: int, tier: str) -> list[dict]:
    """LLM proposes N concrete NEW UX features, grounded in the real app."""
    ctx = ""
    try:
        sys.path.insert(0, ROOT)
        from server.services import dead_zone_finder as dz  # noqa
        findings = (dz.scan_assets(limit=0) if hasattr(dz, "scan_assets") else {})
    except Exception:  # noqa: BLE001
        findings = {}
    # current mini-apps for grounding
    try:
        import re
        html = open(os.path.join(ROOT, "server", "jarvis_live.html"), encoding="utf-8").read(120000)
        apps = re.findall(r"\{id:'([^']+)',ic:'[^']*',t:'([^']+)'", html)
        ctx = "Existing mini-apps: " + ", ".join(f"{t}" for _, t in apps[:40])
    except Exception:  # noqa: BLE001
        ctx = ""
    prompt = (
        "You are the product brain of the JARVIS assistant app (FastAPI backend + a single-page "
        "glassmorphic dashboard server/jarvis_live.html with mini-apps, a 3D universe, voice, and an "
        "LLM brain). Briefly RESEARCH current app/UX best practices on the web/forums, then propose %d NEW, "
        "genuinely useful, SMALL user-facing UX features or functions that fit the existing design and would "
        "help a disabled owner use the app more easily. Avoid duplicating existing apps. %s\n\nReturn ONLY a "
        "JSON array of objects with keys: title (short), category (one of: accessibility, productivity, "
        "voice, ui, automation, communication, health, other), brief (2-3 sentences: what it does, where it "
        "lives in the app, and the gist of how to build it using existing patterns — a mini-app in MINI_APPS "
        "+ renderAppData/render*Sheet and/or a /v1 route), and OPTIONALLY target (the single small existing "
        "backend file the change is fully contained to, e.g. server/routes/xyz.py — ONLY set target when the "
        "whole feature fits one small backend file; omit it for UI/HTML features). No markdown fences."
        % (n, ctx)
    )
    try:
        import re
        # Use the env-loaded live brain via /llm/chat (the implementer Claude later researches + expands each).
        body = json.dumps({"message": prompt, "tier": tier, "max_tokens": 900}).encode()
        req = urllib.request.Request("http://127.0.0.1:8095/llm/chat", data=body,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=90) as resp:
            out = json.loads(resp.read()).get("reply", "")
        m = re.search(r"\[.*\]", out, re.S) or re.search(r"\{.*\}", out, re.S)
        data = json.loads(m.group(0) if m else out)
        items = data.get("features", data.get("items", [])) if isinstance(data, dict) else data
        feats = [{"title": str(x.get("title", "")).strip(), "brief": str(x.get("brief", "")).strip(),
                  "category": str(x.get("category", "other")).strip().lower(),
                  "target": (str(x.get("target", "")).strip() or None)}
                 for x in items if isinstance(x, dict) and x.get("title")]
        if not feats:
            raise ValueError("no features parsed from: " + out[:200])
        return feats[:n]
    except Exception as e:  # noqa: BLE001
        log({"event": "ideate_failed", "error": str(e)[:200]})
        return []


def implement(feat: dict, timeout=1800, builder: str = "claude") -> bool:
    """Dispatch to a builder. 'claude' = the claude -p tool loop (can edit any/large file surgically);
    'kimi' = the local/cheap kimi tier doing a full-file rewrite of ONE small target file. Whoever builds,
    the SAME crash-proof gate + 1,000-pt Claude audit decide whether it lands — so a weak builder is safe."""
    if builder == "kimi":
        return _implement_kimi(feat)
    return _implement_claude(feat, timeout)


def _strip_fences(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9_-]*\n", "", t)
        t = re.sub(r"\n```\s*$", "", t)
    return t.strip("\n")


def _implement_kimi(feat: dict) -> bool:
    """Kimi builder: it cannot do blind diffs (it fabricates context lines), so we give it the REAL contents
    of one small target file and write back a full rewrite. Big files (jarvis_live.html) must use 'claude'."""
    target = feat.get("target") or feat.get("file")
    if not target:
        log({"event": "kimi_skip", "title": feat.get("title"), "reason": "no small target file specified"})
        return False
    path = os.path.join(ROOT, target)
    rel = os.path.relpath(path, ROOT)
    if rel in PROTECTED or not os.path.exists(path):
        log({"event": "kimi_skip", "title": feat.get("title"), "reason": "target missing or protected", "target": rel})
        return False
    src = open(path, encoding="utf-8").read()
    if len(src) > 60000:            # too big to rewrite reliably within the token ceiling → leave to claude
        log({"event": "kimi_skip", "title": feat.get("title"), "reason": "target too large for rewrite", "target": rel})
        return False
    prompt = (
        "You are editing the JARVIS app. Implement this feature by returning the COMPLETE, updated contents "
        "of the file below and NOTHING else — no prose, no markdown fences.\n"
        "Rules: smallest correct change; do NOT break existing code; keep all imports/exports intact; match "
        "the existing style. Output the entire file from first line to last.\n\n"
        "FEATURE: %s\n%s\n\n=== FILE %s ===\n%s" % (feat["title"], feat.get("brief", ""), rel, src)
    )
    try:
        body = json.dumps({"message": prompt, "tier": "kimi", "max_tokens": 16000}).encode()
        req = urllib.request.Request("http://127.0.0.1:8095/llm/chat", data=body,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=420) as resp:
            out = _strip_fences(json.loads(resp.read()).get("reply", ""))
    except Exception as e:  # noqa: BLE001
        log({"event": "kimi_error", "title": feat.get("title"), "error": str(e)[:160]})
        return False
    if len(out) < len(src) * 0.6:   # truncated / refused → reject so the gate never even sees garbage
        log({"event": "kimi_skip", "title": feat.get("title"), "reason": "rewrite too short (likely truncated)",
             "target": rel, "got": len(out), "src": len(src)})
        return False
    open(path, "w", encoding="utf-8").write(out)
    return True


def _implement_claude(feat: dict, timeout=1800) -> bool:
    """Claude Code implements the feature in place. Returns True if it ran (changes may or may not exist)."""
    prompt = (
        "Autonomously implement this NEW user-facing feature in the JARVIS app, COMPLETELY and SAFELY.\n\n"
        "FEATURE: %s\n%s\n\n"
        "RULES (follow exactly):\n"
        "- Research current best practices briefly if useful, then implement the SMALLEST correct change.\n"
        "- Follow existing patterns: mini-apps live in the MINI_APPS array + a render*Sheet()/renderAppData "
        "branch in server/jarvis_live.html; backend routes under server/routes/*.py or server/dashboard.py.\n"
        "- DO NOT break existing features. DO NOT touch server/auth.py, server/config.py, payments, or any "
        "auth/guardrail/safety code. DO NOT edit scripts/auto_improve*.py or git history.\n"
        "- If you edit server/jarvis_live.html: keep it valid (the <script> blocks must pass `node --check`), "
        "keep the theme lock intact (scripts/check_ui_theme_lock.py must pass), and bump the VER number by 1.\n"
        "- Ensure `python3 -m py_compile` passes for any .py you change and the app still boots.\n"
        "- No new heavy dependencies. Keep it self-contained.\n"
        % (feat["title"], feat["brief"])
    )
    pf = "/tmp/_ai_prompt.txt"
    open(pf, "w").write(prompt)
    of = "/tmp/_ai_out.json"
    cmd = ("%s -p \"$(cat %s)\" --model %s --output-format json --dangerously-skip-permissions > %s 2>&1"
           % (shlex.quote(CLAUDE), shlex.quote(pf), shlex.quote("claude-sonnet-4-6"), shlex.quote(of)))
    rc, _ = run(["bash", "-c", cmd], timeout=timeout, env={"IS_SANDBOX": "1"})  # allow claude skip-perms as root
    return rc == 0


def gate() -> dict:
    rc, out = run([PY, os.path.join(ROOT, "scripts", "auto_improve_gate.py"), "--changed-only"], timeout=480)
    try:
        return json.loads(out[out.index("{"):])
    except Exception:  # noqa: BLE001
        return {"pass": False, "checks": {"gate": {"ok": False, "detail": out[-400:]}}}


def health_ok() -> bool:
    for url, code in HEALTH:
        try:
            with urllib.request.urlopen(url, timeout=8) as r:
                if r.status != code:
                    return False
        except Exception:  # noqa: BLE001
            return False
    return True


def restart_services():
    run(["pm2", "restart", "jarvis-backend", "jarvis-dashboard", "--update-env"], timeout=60)
    time.sleep(8)


def land(feat: dict, feature_files: list[str]) -> dict:
    safe = [f for f in feature_files if f not in PROTECTED and os.path.exists(os.path.join(ROOT, f))]
    if not safe:
        return {"landed": False, "reason": "no committable feature files"}
    run(["git", "add", *safe], timeout=60)
    msg = "auto: %s\n\nAutonomous self-improvement (gated: compile+js+theme+tests+boot).\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" % feat["title"][:72]
    rc, out = run(["git", "commit", "-m", msg], timeout=60)
    if rc != 0:
        return {"landed": False, "reason": "commit failed: " + out[-200:]}
    rc, out = run(["git", "push", "origin", "main"], timeout=120)
    if rc != 0:
        run(["git", "reset", "--soft", "HEAD~1"], timeout=30)
        return {"landed": False, "reason": "push failed: " + out[-200:]}
    restart_services()
    if health_ok():
        return {"landed": True}
    # AUTO-ROLLBACK: the live app is unhealthy after landing → revert the feature commit.
    run(["git", "revert", "--no-edit", "HEAD"], timeout=60)
    run(["git", "push", "origin", "main"], timeout=120)
    restart_services()
    return {"landed": False, "reason": "health-check FAILED after land — auto-reverted", "rolled_back": True}


def discard(feature_files: list[str]):
    safe = [f for f in feature_files if f not in PROTECTED]
    # restore tracked, delete new untracked — discard Claude's failed attempt
    run(["git", "checkout", "--", *safe], timeout=60)
    for f in safe:
        fp = os.path.join(ROOT, f)
        rc, _ = run(["git", "ls-files", "--error-unmatch", f], timeout=10)
        if rc != 0 and os.path.exists(fp):
            try:
                os.remove(fp)
            except Exception:  # noqa: BLE001
                pass


def score_change(feat: dict, files: list[str]) -> dict:
    """Judge the just-implemented change: helpfulness 0-100 + category + one-line reason (via the brain)."""
    diff = ""
    try:
        diff = run(["git", "diff", "HEAD", "--", *files], timeout=30)[1][:6000]
    except Exception:  # noqa: BLE001
        pass
    if not diff:
        return {"score": None, "category": feat.get("category", "other"), "reason": "no diff to score"}
    prompt = (
        "Rate this just-implemented app feature for a DISABLED owner who relies on the app. "
        "Feature: %s — %s\n\nUnified diff (truncated):\n%s\n\n"
        "Return ONLY JSON: {\"score\": <integer 0-100, how helpful/impactful for the owner>, "
        "\"category\": \"<accessibility|productivity|voice|ui|automation|communication|health|other>\", "
        "\"reason\": \"<one short sentence>\"}." % (feat["title"], feat.get("brief", "")[:300], diff)
    )
    try:
        body = json.dumps({"message": prompt, "tier": "strong", "max_tokens": 300}).encode()
        req = urllib.request.Request("http://127.0.0.1:8095/llm/chat", data=body,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            out = json.loads(resp.read()).get("reply", "")
        import re
        m = re.search(r"\{.*\}", out, re.S)
        d = json.loads(m.group(0) if m else out)
        return {"score": int(d.get("score", 0)),
                "category": str(d.get("category", feat.get("category", "other"))).lower(),
                "reason": str(d.get("reason", ""))[:160]}
    except Exception as e:  # noqa: BLE001
        return {"score": None, "category": feat.get("category", "other"), "reason": "score failed: " + str(e)[:80]}


def cycle(n: int, dry: bool, tier: str, builder: str = "claude"):
    log({"event": "cycle_start", "features": n, "dry": dry, "tier": tier, "builder": builder})
    feats = ideate(n, tier)
    if not feats:
        log({"event": "cycle_end", "reason": "no ideas generated"})
        return
    for i, feat in enumerate(feats):
        # 'alternate' = use the cheap local kimi builder when the idea names a small target file, else claude.
        b = builder
        if builder == "alternate":
            b = "kimi" if (feat.get("target") or feat.get("file")) else "claude"
        feat["_builder"] = b
        before = _tracked_state()
        ran = implement(feat, timeout=int(os.environ.get("AUTO_IMPL_TIMEOUT", "1800")), builder=b)
        after = _tracked_state()
        feature_files = sorted(after - before)        # only files Claude newly touched (not pre-existing dirt)
        if not ran or not feature_files:
            log({"event": "feature_skip", "title": feat["title"], "reason": "claude made no tracked change", "ran": ran})
            discard(feature_files)
            continue
        g = gate()
        if not g.get("pass"):
            failed = [k for k, v in (g.get("checks") or {}).items() if not v.get("ok")]
            log({"event": "feature_gate_fail", "title": feat["title"], "failed": failed, "files": feature_files})
            discard(feature_files)
            continue
        # The 1,000-pt Claude audit is the merge decider: gate proves it BOOTS, audit proves it's WORTH it.
        au = audit_score(feat, feature_files, g)
        common = {
            "title": feat["title"], "category": feat.get("category", "other"),
            "builder": feat.get("_builder", builder),
            "score": au.get("final_score"), "verdict": au.get("verdict"),
            "advancement": au.get("advancement_score"),
            "delta": (au.get("delta") or {}).get("delta"),
            "reason": (au.get("improvement_proven") or au.get("error") or "")[:200],
            "audit": {"breakdown": au.get("breakdown"), "penalties": au.get("penalties"),
                      "penalty_total": au.get("penalty_total"), "hard_blockers": au.get("hard_blockers"),
                      "rollback_confidence": au.get("rollback_confidence"),
                      "required_fixes": au.get("required_fixes"), "next_action": au.get("next_action"),
                      "risk_depth": au.get("risk_depth")},
            "files": feature_files,
        }
        if dry:
            log({"event": "feature_gate_pass_dryrun", **common})
            discard(feature_files)
            continue
        if not au.get("merge_ok"):
            # gate green but audit says don't merge (score below threshold, hard blocker, or unproven gain)
            log({"event": "feature_reject", **common})
            discard(feature_files)
            continue
        res = land(feat, feature_files)
        log({"event": "feature_land", **common, **res})
    log({"event": "cycle_end"})


def _lock():
    """Single-instance lock so two cycles can never run at once and collide on git/restart."""
    import fcntl
    lf = open("/tmp/auto_improve.lock", "w")
    try:
        fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lf
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    a = sys.argv
    nfeat = int(a[a.index("--features") + 1]) if "--features" in a else 5
    dry = "--dry-run" in a
    tier = a[a.index("--tier") + 1] if "--tier" in a else "strong"
    builder = a[a.index("--builder") + 1] if "--builder" in a else "claude"
    held = _lock()
    if not held:
        log({"event": "abort", "reason": "another auto_improve instance is running"})
        sys.exit(0)
    if "--loop" in a:
        interval = float(os.environ.get("AUTO_INTERVAL_HRS", "3")) * 3600   # rest between cycles; 24/7 always-on
        log({"event": "loop_start", "interval_hrs": interval / 3600, "features": nfeat, "tier": tier,
             "builder": builder})
        while True:
            try:
                cycle(nfeat, dry, tier, builder)
            except Exception as e:  # noqa: BLE001
                log({"event": "cycle_crash", "error": str(e)[:300]})
            time.sleep(interval)
    else:
        cycle(nfeat, dry, tier, builder)
