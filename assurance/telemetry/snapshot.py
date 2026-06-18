"""Health snapshot generator."""
from __future__ import annotations

import os
import time
from typing import Any

from ..audit.log import audit_count
from ..commands.bus import get_bus as get_cmd_bus
from ..events.bus import get_bus as get_evt_bus
from .metrics import registry


def health_snapshot() -> dict[str, Any]:
    cmd_history = get_cmd_bus().history(limit=200)
    evt_history = get_evt_bus().history(limit=500)
    failures = [c for c in cmd_history if getattr(c, "ok", True) is False]
    return {
        "ok": True,
        "timestamp": time.time(),
        "uptime_s": _process_uptime_s(),
        "commands": {
            "total": len(cmd_history),
            "failures": len(failures),
            "recent_failures": [
                {"name": f.name, "kind": f.error_kind, "message": f.error_message[:200]}
                for f in failures[-10:]
            ],
        },
        "events": {
            "total": len(evt_history),
            "by_name": _by_name(evt_history),
        },
        "audit": {"total": audit_count()},
    }


def get_snapshot() -> dict[str, Any]:
    return {
        "health": health_snapshot(),
        "metrics": registry.export(),
    }


def _by_name(items) -> dict[str, int]:  # noqa: ANN001
    out: dict[str, int] = {}
    for it in items:
        out[it.name] = out.get(it.name, 0) + 1
    return out


_START = time.time()


def _process_uptime_s() -> float:
    return time.time() - _START


def proc_pid() -> int:
    return os.getpid()
