"""System Settings — aggregated state and safe actions for the Settings mini-app."""
from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE_PATH = os.path.join(ROOT, "server", "data", "settings_state.json")


def _state() -> dict[str, Any]:
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _save_state(s: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
        with open(STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(s, f, indent=2)
    except Exception:  # noqa: BLE001
        pass


def _pm2_list() -> list[dict[str, Any]]:
    try:
        j = json.loads(subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5).stdout)
        now = time.time() * 1000
        out = []
        for p in j:
            e = p.get("pm2_env", {})
            m = p.get("monit", {})
            nm = p.get("name", "")
            out.append({
                "name": nm,
                "status": e.get("status"),
                "cpu": m.get("cpu"),
                "mem_mb": round((m.get("memory") or 0) / 1e6),
                "uptime_min": round((now - e.get("pm_uptime", now)) / 60000),
                "unstable_restarts": e.get("unstable_restarts") or 0,
                "jarvis": nm.startswith("jarvis-") and not nm.startswith("jarvis-frontend"),
            })
        return out
    except Exception:  # noqa: BLE001
        return []


def _version() -> dict[str, str]:
    try:
        n = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT,
                           capture_output=True, text=True, timeout=4).stdout.strip()
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                             capture_output=True, text=True, timeout=4).stdout.strip()
        return {"version": f"v1.0.{n}", "sha": sha}
    except Exception:  # noqa: BLE001
        return {"version": "v1.0.0", "sha": ""}


def _disk() -> dict[str, Any]:
    try:
        st = os.statvfs(ROOT)
        total = st.f_blocks * st.f_frsize / 1e9
        used = (st.f_blocks - st.f_bavail) * st.f_frsize / 1e9
        return {"total_gb": round(total, 1), "used_gb": round(used, 1), "pct": round(used / total * 100, 1)}
    except Exception:  # noqa: BLE001
        return {}


def _tmp_size() -> int:
    p = os.path.join(ROOT, "server", "data", "tmp")
    try:
        return sum(os.path.getsize(os.path.join(p, f)) for f in os.listdir(p) if os.path.isfile(os.path.join(p, f)))
    except Exception:  # noqa: BLE001
        return 0


def state() -> dict[str, Any]:
    s = _state()
    return {
        "ok": True,
        "cache_buster": "17",
        "backend_url": os.environ.get("JARVIS_BACKEND_URL", "http://127.0.0.1:8001"),
        "ollama_host": os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434"),
        "dashboard_port": int(os.environ.get("DASHBOARD_PORT", "8095")),
        "auto_mode": bool(s.get("auto_mode")),
        "voice_enabled": bool(s.get("voice_enabled", True)),
        "version": _version(),
        "services": _pm2_list(),
        "disk": _disk(),
        "tmp_bytes": _tmp_size(),
        "env_names": sorted([k for k in os.environ if k.startswith(("JARVIS_", "OLLAMA_", "DASHBOARD_", "OPENCLAW_", "CLIMATE_"))]),
    }


def _control_service(name: str, action: str) -> dict[str, Any]:
    if action not in ("start", "stop", "restart"):
        return {"ok": False, "error": "bad action"}
    if not name.startswith("jarvis-") or name.startswith("underworld-"):
        return {"ok": False, "error": "service not allowed"}
    try:
        r = subprocess.run(["pm2", action, name], capture_output=True, text=True, timeout=25)
        return {"ok": r.returncode == 0, "name": name, "action": action,
                "output": ((r.stdout or "") + (r.stderr or ""))[-200:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


def _clear_tmp() -> dict[str, Any]:
    p = os.path.join(ROOT, "server", "data", "tmp")
    removed = 0
    try:
        for fn in os.listdir(p):
            fp = os.path.join(p, fn)
            try:
                if os.path.isfile(fp):
                    os.remove(fp)
                    removed += 1
            except Exception:  # noqa: BLE001
                pass
        return {"ok": True, "removed": removed}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


def _reload_nginx() -> dict[str, Any]:
    try:
        r = subprocess.run(["sudo", "nginx", "-t"], capture_output=True, text=True, timeout=15)
        if r.returncode != 0:
            return {"ok": False, "error": (r.stdout + r.stderr)[-300:]}
        r2 = subprocess.run(["sudo", "systemctl", "reload", "nginx"], capture_output=True, text=True, timeout=15)
        return {"ok": r2.returncode == 0, "output": (r2.stdout + r2.stderr)[-200:]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)[:160]}


def _env_hint(key: str) -> dict[str, Any]:
    hints = {
        "OLLAMA_HOST": "Ollama / GPU brain endpoint, e.g. http://127.0.0.1:11434 or a tunnel URL.",
        "JARVIS_BACKEND_URL": "Main API server URL, e.g. http://127.0.0.1:8001.",
        "DASHBOARD_PORT": "Port this live dashboard listens on (default 8095).",
        "OPENCLAW_GATEWAY_TOKEN": "OpenClaw gateway token used by the bridge.",
        "CLIMATE_BRIDGE_KEY": "Secret key for the HOME-LAN AirTouch bridge.",
    }
    return {"ok": True, "key": key, "description": hints.get(key, "No description available.")}


def run_action(action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    s = _state()

    if action == "toggle_auto_mode":
        s["auto_mode"] = not bool(s.get("auto_mode"))
        _save_state(s)
        return {"ok": True, "auto_mode": s["auto_mode"]}

    if action == "toggle_voice":
        s["voice_enabled"] = not bool(s.get("voice_enabled", True))
        _save_state(s)
        return {"ok": True, "voice_enabled": s["voice_enabled"]}

    if action == "restart_dashboard":
        return _control_service("jarvis-dashboard", "restart")

    if action == "restart_backend":
        return _control_service("jarvis-backend", "restart")

    if action == "restart_service":
        return _control_service(payload.get("name", ""), payload.get("action", "restart"))

    if action == "reload_nginx":
        return _reload_nginx()

    if action == "clear_tmp":
        return _clear_tmp()

    if action == "run_diagnostics":
        from server.services import system_debugger as SD
        return {"ok": True, "issues": SD.diagnose()}

    if action == "set_env_hint":
        return _env_hint(payload.get("key", ""))

    if action in ("clear_local_storage", "reset_dock", "reset_theme"):
        return {"ok": True, "client_action": action}

    return {"ok": False, "error": "unknown action"}
