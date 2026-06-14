"""OpenClaw / Kimi Claw manager — dashboard-facing helpers for the existing Docker instance."""
from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any

from server.services._http import external_json as _external_json

CONTAINER = os.environ.get("OPENCLAW_CONTAINER", "openclaw-8zfp-openclaw-1")
COMPOSE_DIR = "/docker/openclaw-8zfp"
BRIDGE_URL = os.environ.get("OPENCLAW_BRIDGE_URL", "http://127.0.0.1:18790")
_TOKEN: str | None = None
_TOKEN_TS: float = 0.0


def _token() -> str:
    """Read the gateway token from the running container env (cached 60s)."""
    global _TOKEN, _TOKEN_TS
    if _TOKEN and (time.time() - _TOKEN_TS) < 60:
        return _TOKEN
    try:
        r = subprocess.run(
            ["docker", "exec", CONTAINER, "printenv", "OPENCLAW_GATEWAY_TOKEN"],
            capture_output=True, text=True, timeout=10
        )
        tok = r.stdout.strip()
        if tok:
            _TOKEN = tok
            _TOKEN_TS = time.time()
            return _TOKEN
    except Exception:  # noqa: BLE001
        pass
    # Fallback to env if the container is temporarily unreachable.
    tok = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "")
    if tok:
        _TOKEN = tok
        _TOKEN_TS = time.time()
        return _TOKEN
    raise RuntimeError("OpenClaw gateway token not available")


def _bridge(method: str, path: str, body: dict[str, Any] | None = None, _retry: bool = True) -> dict[str, Any]:
    global _TOKEN
    url = BRIDGE_URL.rstrip("/") + path
    headers = {"Authorization": f"Bearer {_token()}"}
    r = _external_json(method, url, payload=body, headers=headers)
    # Self-heal: the gateway token can rotate (container restart / re-provision) and leave the 60s
    # cache stale, so the bridge returns {"error":"unauthorized"}. Bust the cache, re-read the token
    # fresh from the container, and retry ONCE — otherwise the mini-app stays broken for up to 60s.
    if _retry and isinstance(r, dict) and str(r.get("error", "")).strip().lower() == "unauthorized":
        _TOKEN = None
        return _bridge(method, path, body, _retry=False)
    return r


def _container_running() -> bool:
    try:
        r = subprocess.run(
            ["docker", "ps", "--filter", f"name={CONTAINER}", "--format", "{{.Status}}"],
            capture_output=True, text=True, timeout=10
        )
        return bool(r.stdout.strip())
    except Exception:  # noqa: BLE001
        return False


def _pm2_status(name: str) -> dict[str, Any]:
    try:
        j = json.loads(subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5).stdout)
        for p in j:
            if p.get("name") == name:
                env = p.get("pm2_env", {})
                return {"status": env.get("status"), "uptime_min": round((time.time() * 1000 - env.get("pm_uptime", 0)) / 60000)}
    except Exception:  # noqa: BLE001
        pass
    return {"status": "unknown"}


def status() -> dict[str, Any]:
    out: dict[str, Any] = {"container": CONTAINER, "container_running": _container_running()}
    out["bridge"] = _pm2_status("openclaw-bridge")
    out["gateway"] = _pm2_status("openclaw-gateway")
    health = _bridge("GET", "/api/health")
    out["bridge_reachable"] = bool(health.get("ok"))
    out["health"] = health.get("data") if health.get("ok") else {"error": health.get("error")}
    return out


def restart_container() -> dict[str, Any]:
    try:
        r = subprocess.run(
            ["docker", "compose", "-f", os.path.join(COMPOSE_DIR, "docker-compose.yml"), "restart"],
            capture_output=True, text=True, timeout=120, cwd=COMPOSE_DIR
        )
        return {"ok": r.returncode == 0, "output": (r.stdout + r.stderr)[-400:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def restart_bridge() -> dict[str, Any]:
    ok, out = _pm2_run(["restart", "openclaw-bridge"])
    return {"ok": ok, "output": out}


def restart_gateway() -> dict[str, Any]:
    ok, out = _pm2_run(["restart", "openclaw-gateway"])
    return {"ok": ok, "output": out}


def logs(lines: int = 50) -> dict[str, Any]:
    try:
        r = subprocess.run(
            ["docker", "compose", "-f", os.path.join(COMPOSE_DIR, "docker-compose.yml"), "logs", "--tail", str(lines)],
            capture_output=True, text=True, timeout=30, cwd=COMPOSE_DIR
        )
        return {"ok": r.returncode == 0, "logs": (r.stdout + r.stderr).splitlines()[-lines:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:200]}


def chat(message: str) -> dict[str, Any]:
    msg = (message or "").strip()
    if not msg:
        return {"ok": False, "error": "empty message"}
    return _bridge("POST", "/api/agent", {"message": msg, "agent": "main", "sessionId": "agent:main:main"})


def _pm2_run(args: list[str]) -> tuple[bool, str]:
    try:
        r = subprocess.run(["pm2"] + args, capture_output=True, text=True, timeout=20)
        return r.returncode == 0, (r.stdout + r.stderr)[-300:]
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:200]
