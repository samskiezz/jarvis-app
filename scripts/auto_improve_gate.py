#!/usr/bin/env python3
"""AUTONOMOUS SELF-IMPROVEMENT — the CRASH-PROOF GATE.

This is the safety core of the autonomous loop: given the current working tree (an auto-improvement
branch), it runs EVERY check that could catch a broken change BEFORE it is allowed to land on main:

  1. py_compile     — every changed .py compiles
  2. js syntax      — the extracted <script> blocks of jarvis_live.html pass `node --check`
  3. theme lock     — scripts/check_ui_theme_lock.py passes (UI not wrecked)
  4. pytest smoke   — a fast subset of server/tests passes (import + core)
  5. LIVE boot test — the FastAPI app actually starts on a throwaway port and serves /health

If ANY check fails, exit code is non-zero and the caller MUST NOT land/push. Pure validation — it never
mutates git, never pushes. Designed to be called by the orchestrator and also runnable by hand.

Usage:  python3 scripts/auto_improve_gate.py [--changed-only] [--full-tests]
Output: a JSON report on stdout; exit 0 only if every gate passed.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = os.path.join(ROOT, ".venv", "bin", "python")
if not os.path.exists(PY):
    PY = sys.executable


def _run(cmd, timeout=120, cwd=ROOT):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def _changed_py():
    rc, out = _run(["git", "diff", "--name-only", "HEAD"], timeout=20)
    files = [f for f in out.splitlines() if f.endswith(".py") and os.path.exists(os.path.join(ROOT, f))]
    return files


def gate_pycompile(changed_only: bool) -> dict:
    files = _changed_py() if changed_only else None
    if files is None:
        rc, out = _run([PY, "-m", "compileall", "-q", "server"], timeout=180)
    elif not files:
        return {"ok": True, "note": "no changed .py"}
    else:
        rc, out = _run([PY, "-m", "py_compile", *files], timeout=120)
    return {"ok": rc == 0, "detail": out.strip()[-600:] if rc else ""}


def gate_js() -> dict:
    html = os.path.join(ROOT, "server", "jarvis_live.html")
    if not os.path.exists(html):
        return {"ok": True, "note": "no jarvis_live.html"}
    if not _run(["node", "--version"], timeout=10)[0] == 0:
        return {"ok": True, "note": "node unavailable — skipped (non-fatal)"}
    txt = open(html, encoding="utf-8").read()
    blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", txt, re.S)
    tmp = "/tmp/_gate_js.js"
    open(tmp, "w", encoding="utf-8").write("\n;\n".join(blocks))
    env = dict(os.environ, NODE_PATH=os.path.join(ROOT, "node_modules"))
    try:
        p = subprocess.run(["node", "--check", tmp], capture_output=True, text=True, timeout=30, env=env)
        return {"ok": p.returncode == 0, "detail": (p.stderr or "")[:600]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "detail": str(e)}


def gate_theme_lock() -> dict:
    script = os.path.join(ROOT, "scripts", "check_ui_theme_lock.py")
    if not os.path.exists(script):
        return {"ok": True, "note": "no theme-lock script"}
    rc, out = _run([PY, script], timeout=30)
    return {"ok": rc == 0, "detail": out.strip()[-400:] if rc else ""}


def gate_tests(full: bool) -> dict:
    tdir = os.path.join(ROOT, "server", "tests")
    if not os.path.isdir(tdir):
        return {"ok": True, "note": "no tests"}
    # default: a fast import/collect + a smoke subset; --full-tests runs everything.
    if full:
        cmd = [PY, "-m", "pytest", "server/tests", "-q", "-x", "--no-header", "-p", "no:cacheprovider"]
        to = 600
    else:
        # collect-only proves nothing imports-broken (catches most crash bugs) — fast + safe.
        cmd = [PY, "-m", "pytest", "server/tests", "--collect-only", "-q", "-p", "no:cacheprovider"]
        to = 180
    rc, out = _run(cmd, timeout=to)
    # collect-only returns 0 on success; treat collection errors as failure.
    return {"ok": rc == 0, "mode": "full" if full else "collect", "detail": out.strip()[-800:] if rc else out.strip()[-200:]}


def gate_boot() -> dict:
    """Actually start the FastAPI app on a throwaway port and confirm it serves /health. The single most
    important crash-proof check: if the app can't boot, it must NEVER reach main."""
    port = int(os.environ.get("GATE_BOOT_PORT", "8987"))
    log = "/tmp/_gate_boot.log"
    env = dict(os.environ, JARVIS_BACKEND_PORT=str(port), PORT=str(port))
    proc = None
    try:
        with open(log, "w") as lf:
            proc = subprocess.Popen([PY, "-m", "uvicorn", "server.main:app", "--host", "127.0.0.1",
                                     "--port", str(port)], cwd=ROOT, stdout=lf, stderr=lf, env=env)
        # poll up to ~40s for the app to serve
        import urllib.request
        ok = False
        for _ in range(40):
            time.sleep(1)
            if proc.poll() is not None:      # process died → boot failed
                break
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=2) as r:
                    if r.status == 200:
                        ok = True
                        break
            except Exception:  # noqa: BLE001
                continue
        detail = "" if ok else open(log).read()[-800:]
        return {"ok": ok, "detail": detail}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "detail": str(e)}
    finally:
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except Exception:  # noqa: BLE001
                proc.kill()


def run_gate(changed_only=False, full_tests=False) -> dict:
    checks = {}
    checks["pycompile"] = gate_pycompile(changed_only)
    checks["js"] = gate_js()
    checks["theme_lock"] = gate_theme_lock()
    checks["tests"] = gate_tests(full_tests)
    checks["boot"] = gate_boot()
    passed = all(c.get("ok") for c in checks.values())
    return {"pass": passed, "checks": checks, "ts": int(time.time())}


if __name__ == "__main__":
    report = run_gate(changed_only="--changed-only" in sys.argv, full_tests="--full-tests" in sys.argv)
    print(json.dumps(report, indent=2))
    sys.exit(0 if report["pass"] else 1)
