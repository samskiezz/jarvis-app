"""JARVIS Nexus — Python registration client (stdlib only, fire-and-forget).

The 5-line client every Python service calls on boot to announce itself to the
registry, and on its loop tick to heartbeat. Uses urllib (no httpx dependency)
on a daemon thread with a short timeout, so a registry outage NEVER blocks or
crashes the calling service. Part of Nexus Phase 1.

    from server.services import nexus_client
    nexus_client.announce("jarvis-worker", port=None, role="worker")
    nexus_client.heartbeat("jarvis-worker")
"""
from __future__ import annotations

import json
import os
import threading
import urllib.request

_BASE = (
    os.environ.get("JARVIS_BACKEND_URL")
    or os.environ.get("JARVIS_API_BASE")
    or "http://127.0.0.1:8001"
).rstrip("/")


def _post(path: str, body: dict, timeout: float = 2.0) -> None:
    def run() -> None:
        try:
            data = json.dumps(body).encode()
            req = urllib.request.Request(
                _BASE + path, data=data,
                headers={"Content-Type": "application/json"}, method="POST",
            )
            urllib.request.urlopen(req, timeout=timeout).read()
        except Exception:  # noqa: BLE001 — never let registry I/O affect the caller
            pass

    try:
        threading.Thread(target=run, daemon=True).start()
    except Exception:  # noqa: BLE001
        pass


def announce(
    id: str, name: str = "", port: int | None = None, role: str = "",
    base_url: str = "", health_path: str = "/health",
    routes: list[str] | None = None, meta: dict | None = None,
    heartbeat_secs: float = 30.0,
) -> None:
    """Announce a service once, then auto-heartbeat for the process lifetime.

    One call at boot is all a service needs — the daemon heartbeat keeps it
    'alive' in the registry without any per-loop wiring.
    """
    pid: int | None
    try:
        pid = os.getpid()
    except Exception:  # noqa: BLE001
        pid = None
    payload = {
        "id": id, "name": name or id, "port": port, "role": role,
        "base_url": base_url, "health_path": health_path,
        "routes": routes or [], "pid": pid, "meta": meta or {},
    }
    _post("/v1/registry/announce", payload)
    if heartbeat_secs and heartbeat_secs > 0:
        def _beat() -> None:
            import time as _t
            while True:
                _t.sleep(heartbeat_secs)
                # re-announce (full upsert) = self-healing: survives a backend restart
                _post("/v1/registry/announce", payload)
        try:
            threading.Thread(target=_beat, daemon=True).start()
        except Exception:  # noqa: BLE001
            pass


def heartbeat(id: str, status: str = "ok", metrics: dict | None = None) -> None:
    _post("/v1/registry/heartbeat", {"id": id, "status": status, "metrics": metrics or {}})


def emit(topic: str, type: str, payload: dict | None = None, source: str = "") -> None:
    """Publish an event onto the shared Nexus bus (fire-and-forget)."""
    _post("/v1/bus/emit", {"topic": topic, "type": type, "source": source, "payload": payload or {}})
