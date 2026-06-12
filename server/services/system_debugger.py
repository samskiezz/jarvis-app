"""System Debugger — lightweight diagnostics + safe, idempotent fixes.

All checks are read-only. Fixes are explicit and gated; medium/high-risk fixes
require approval unless auto_approve=True.
"""
from __future__ import annotations

import os
import py_compile
import shutil
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any

from server.services._registry import is_lifeline, is_pausable

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRAIN_DB = os.path.join(ROOT, "server", "data", "brain.db")


def _run(cmd: list[str], timeout: int = 15) -> tuple[bool, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=ROOT)
        return r.returncode == 0, (r.stdout + r.stderr)[:500]
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:300]


def _pm2_list() -> list[dict[str, Any]]:
    try:
        j = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5).stdout
        import json
        return json.loads(j)
    except Exception:  # noqa: BLE001
        return []


def _disk_pct() -> float | None:
    try:
        s = shutil.disk_usage(ROOT)
        return round((s.used / s.total) * 100, 1)
    except Exception:  # noqa: BLE001
        return None


def _backend_ok() -> bool:
    base = os.environ.get("JARVIS_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
    try:
        with urllib.request.urlopen(base + "/health", timeout=3) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _brain_ok() -> bool:
    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    try:
        with urllib.request.urlopen(host + "/api/tags", timeout=2) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _check_syntax(path: str) -> tuple[bool, str]:
    try:
        py_compile.compile(path, doraise=True)
        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def _missing_env_vars() -> list[str]:
    # DASH_CONTROL_TOKEN is optional because dashboard falls back to a persisted file.
    wanted = ["OLLAMA_HOST", "JARVIS_BACKEND_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]
    return [k for k in wanted if not os.environ.get(k)]


def _import_check(module: str) -> tuple[bool, str]:
    try:
        __import__(module)
        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def diagnose() -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []

    # Syntax checks
    for rel in ["server/dashboard.py", "server/agent/core.py", "server/agent/catalog.py",
                "server/services/tiered_llm.py", "server/services/gpu_instances.py"]:
        path = os.path.join(ROOT, rel)
        ok, err = _check_syntax(path)
        if not ok:
            issues.append({
                "id": f"syntax:{rel}", "severity": "critical", "title": f"Syntax error in {rel}",
                "detail": err[:200], "fixable": False, "risk": "high",
                "hint": "Edit the file directly — the dashboard cannot auto-fix syntax errors."
            })

    # Import checks
    for mod in ["server.dashboard", "server.agent.core", "server.services.tiered_llm"]:
        ok, err = _import_check(mod)
        if not ok:
            issues.append({
                "id": f"import:{mod}", "severity": "critical", "title": f"Import failed: {mod}",
                "detail": err[:200], "fixable": False, "risk": "high",
                "hint": "Check for circular imports or missing dependencies."
            })

    # Backend health
    if not _backend_ok():
        issues.append({
            "id": "backend:down", "severity": "critical", "title": "Backend API unreachable",
            "detail": "GET /health on JARVIS_BACKEND_URL failed", "fixable": True, "risk": "medium",
            "fix": "restart_backend", "hint": "Restart jarvis-backend via PM2."
        })

    # GPU brain
    if not _brain_ok():
        issues.append({
            "id": "brain:offline", "severity": "warn", "title": "GPU brain offline",
            "detail": "Ollama box is not reachable at OLLAMA_HOST", "fixable": True, "risk": "medium",
            "fix": "ensure_brain_tunnel", "hint": "Open the brain tunnel to a running Vast GPU."
        })

    # Disk
    dpct = _disk_pct()
    if dpct is not None and dpct >= 85:
        issues.append({
            "id": "disk:full", "severity": "critical" if dpct >= 93 else "warn", "title": "Disk filling up",
            "detail": f"{dpct}% used", "fixable": True, "risk": "medium",
            "fix": "clear_temp", "hint": "Clear tmp files and compress old media."
        })

    # PM2 processes
    for p in _pm2_list():
        name = p.get("name", "")
        env = p.get("pm2_env", {})
        status = env.get("status")
        unstable = env.get("unstable_restarts") or 0
        if name.startswith("jarvis-") and status != "online" and not is_lifeline(name):
            issues.append({
                "id": f"pm2:down:{name}", "severity": "warn", "title": f"{name} is {status}",
                "detail": f"PM2 status = {status}", "fixable": True, "risk": "low",
                "fix": "pm2_restart", "fix_args": {"service": name},
                "hint": "Restart the daemon via PM2."
            })
        if unstable >= 3 and not is_lifeline(name):
            issues.append({
                "id": f"pm2:crash:{name}", "severity": "warn", "title": f"{name} crash-looping",
                "detail": f"{unstable} unstable restarts", "fixable": True, "risk": "low",
                "fix": "pm2_reset", "fix_args": {"service": name},
                "hint": "Reset the crash counter and restart."
            })

    # Missing env vars (informational, not fixable automatically)
    missing = _missing_env_vars()
    if missing:
        issues.append({
            "id": "env:missing", "severity": "warn", "title": "Optional env vars missing",
            "detail": ", ".join(missing), "fixable": False, "risk": "low",
            "hint": "Set them in your environment or .env file if you want those providers active."
        })

    # Knowledge pipeline idle (lightweight probe)
    try:
        conn = sqlite3.connect(BRAIN_DB, timeout=2)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM topics WHERE created_at > ?", (time.time() - 3600,))
        recent = cur.fetchone()[0]
        conn.close()
        if recent == 0:
            issues.append({
                "id": "pipeline:idle", "severity": "warn", "title": "Knowledge pipeline idle",
                "detail": "No new topics in the last hour", "fixable": True, "risk": "low",
                "fix": "wake_producers", "hint": "Restart the orchestrator and ingestor to wake producers."
            })
    except Exception:  # noqa: BLE001
        pass

    issues.sort(key=lambda x: {"critical": 0, "warn": 1, "ok": 2}.get(x["severity"], 2))
    return issues


def _research_fix(issue_id: str, fix: str) -> str:
    """Ask the LLM seam for a one-line risk summary before executing a fix."""
    try:
        from server.services import tiered_llm as T
        system = (
            "You are a cautious systems operator. A JARVIS diagnostic issue has been detected. "
            "In one short sentence, describe the risk of running the proposed fix. Be specific and calm."
        )
        user = f"Issue: {issue_id}. Proposed fix: {fix}. Is this safe?"
        r = T.complete(user, system=system, tier="base", max_tokens=120, module="server/services/system_debugger")
        if r.get("ok"):
            return (r.get("content") or "").strip().split("\n")[0]
    except Exception:  # noqa: BLE001
        pass
    return "No research summary available. Proceed with caution."


def _fix_pm2_restart(service: str) -> dict[str, Any]:
    ok, out = _run(["pm2", "restart", service])
    return {"ok": ok, "output": out}


def _fix_pm2_reset(service: str) -> dict[str, Any]:
    ok1, out1 = _run(["pm2", "reset", service])
    ok2, out2 = _run(["pm2", "restart", service])
    return {"ok": ok1 and ok2, "output": (out1 + " | " + out2)[:500]}


def _fix_clear_temp() -> dict[str, Any]:
    tmp = os.path.join(ROOT, "server", "data", "tmp")
    if not os.path.isdir(tmp):
        return {"ok": True, "output": "tmp dir does not exist"}
    count = 0
    for fn in os.listdir(tmp):
        p = os.path.join(tmp, fn)
        try:
            if os.path.isfile(p):
                os.remove(p)
                count += 1
        except Exception:  # noqa: BLE001
            pass
    return {"ok": True, "output": f"removed {count} tmp files"}


def _fix_ensure_brain_tunnel() -> dict[str, Any]:
    try:
        from server.services import gpu_instances as GI
        return GI.ensure_brain_tunnel()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def _fix_wake_producers() -> dict[str, Any]:
    out = []
    for svc in ["jarvis-orchestrator", "jarvis-ingestor"]:
        ok, msg = _run(["pm2", "restart", svc])
        out.append(f"{svc}: {'ok' if ok else 'fail'} {msg[:120]}")
    return {"ok": True, "output": " | ".join(out)}


def _fix_restart_backend() -> dict[str, Any]:
    return _fix_pm2_restart("jarvis-backend")


def run_fix(issue_id: str, fix_name: str | None = None, fix_args: dict[str, Any] | None = None,
            auto_approve: bool = False) -> dict[str, Any]:
    issues = diagnose()
    issue = next((i for i in issues if i["id"] == issue_id), None)
    if not issue:
        return {"ok": False, "error": "issue not found or already resolved"}
    if not issue.get("fixable"):
        return {"ok": False, "error": "this issue has no automatic fix"}

    fix = fix_name or issue.get("fix")
    args = fix_args or issue.get("fix_args") or {}
    risk = issue.get("risk", "low")

    research = _research_fix(issue_id, fix)
    if risk in ("medium", "high") and not auto_approve:
        return {"ok": False, "needs_approval": True, "research": research, "issue": issue}

    dispatch = {
        "pm2_restart": lambda: _fix_pm2_restart(args.get("service", "jarvis-dashboard")),
        "pm2_reset": lambda: _fix_pm2_reset(args.get("service", "jarvis-dashboard")),
        "clear_temp": _fix_clear_temp,
        "ensure_brain_tunnel": _fix_ensure_brain_tunnel,
        "wake_producers": _fix_wake_producers,
        "restart_backend": _fix_restart_backend,
    }
    fn = dispatch.get(fix)
    if not fn:
        return {"ok": False, "error": f"unknown fix {fix}"}

    result = fn()
    return {"ok": result.get("ok"), "research": research, "result": result, "issue": issue}


def run_auto_fixes(auto_approve: bool = False) -> dict[str, Any]:
    """Diagnose and automatically apply all safe fixes. Returns a report."""
    issues = diagnose()
    fixed: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for issue in issues:
        if not issue.get("fixable"):
            continue
        risk = issue.get("risk", "low")
        if risk in ("medium", "high") and not auto_approve:
            skipped.append({"id": issue["id"], "risk": risk, "reason": "needs approval"})
            continue
        try:
            res = run_fix(issue["id"], auto_approve=True)
            fixed.append({"id": issue["id"], "ok": res.get("ok"), "risk": risk, "result": res.get("result")})
        except Exception as e:  # noqa: BLE001
            fixed.append({"id": issue["id"], "ok": False, "risk": risk, "error": str(e)[:200]})
    return {"ok": True, "fixed": fixed, "skipped": skipped, "issues": issues}
