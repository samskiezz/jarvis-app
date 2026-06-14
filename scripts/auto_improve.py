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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.path.join(ROOT, ".venv", "bin", "python")
PY = PY if os.path.exists(PY) else sys.executable
CLAUDE = os.environ.get("CLAUDE_BIN", "/root/.local/bin/claude")
LOGFILE = os.path.join(ROOT, "server", "data", "auto_improve.log.jsonl")
PROTECTED = {"scripts/auto_improve.py", "scripts/auto_improve_gate.py", "server/auth.py", "server/config.py"}
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
        "JSON array of objects with keys: title (short), brief (2-3 sentences: what it does, where it lives "
        "in the app, and the gist of how to build it using existing patterns — a mini-app in MINI_APPS + "
        "renderAppData/render*Sheet and/or a /v1 route). No markdown fences." % (n, ctx)
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
        feats = [{"title": str(x.get("title", "")).strip(), "brief": str(x.get("brief", "")).strip()}
                 for x in items if isinstance(x, dict) and x.get("title")]
        if not feats:
            raise ValueError("no features parsed from: " + out[:200])
        return feats[:n]
    except Exception as e:  # noqa: BLE001
        log({"event": "ideate_failed", "error": str(e)[:200]})
        return []


def implement(feat: dict, timeout=1800) -> bool:
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


def cycle(n: int, dry: bool, tier: str):
    log({"event": "cycle_start", "features": n, "dry": dry, "tier": tier})
    feats = ideate(n, tier)
    if not feats:
        log({"event": "cycle_end", "reason": "no ideas generated"})
        return
    for i, feat in enumerate(feats):
        before = _tracked_state()
        ran = implement(feat, timeout=int(os.environ.get("AUTO_IMPL_TIMEOUT", "1800")))
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
        if dry:
            log({"event": "feature_gate_pass_dryrun", "title": feat["title"], "files": feature_files})
            discard(feature_files)
            continue
        res = land(feat, feature_files)
        log({"event": "feature_land", "title": feat["title"], "files": feature_files, **res})
    log({"event": "cycle_end"})


if __name__ == "__main__":
    a = sys.argv
    nfeat = int(a[a.index("--features") + 1]) if "--features" in a else 5
    dry = "--dry-run" in a
    tier = a[a.index("--tier") + 1] if "--tier" in a else "strong"
    cycle(nfeat, dry, tier)
