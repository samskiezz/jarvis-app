"""UI COMMAND BUS — one durable channel that lets ANY surface drive the live universe page.

The unified intent router (server/services/intent_router.py) and the swarm/agent layer
(server/agent/jarvis_capabilities.py) both produce *UI directives* — "fly to mars", "open
the task list", "speak this line". Those are browser actions, so they cannot run in the
Python process that decided them. This bus is the seam: a directive is pushed here, and any
open jarvis_live.html long-polls /ui/poll and executes it. That is what makes a voice command
spoken on her phone, or a tool the swarm calls, ACTUALLY move the universe on the wall screen —
not a fake confirmation.

Design mirrors the battle-tested a11y `_cmd` channel in dashboard.py: a small JSON file,
written atomically (POSIX os.replace), with a monotonic sequence so pollers never miss or
replay a directive. Pure stdlib, thread-safe, and NEVER raises — a broken bus can never take
the dashboard (or the disabled user's lifeline) down; the worst case is a directive is dropped
and the spoken reply still lands.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from typing import Any, Dict, List

# Co-located with the other live mirrors (a11y_state.json, watchdog_status.json) under server/data.
_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ui_bus.json")
_LOCK = threading.RLock()
_MAX = 64  # ring buffer — only the most recent directives are retained; pollers catch up via `seq`.

# In-process mirror so a hot push→poll round-trip never has to touch disk twice. The file is the
# durable backstop (survives a dashboard restart so a directive queued mid-restart is not lost).
_STATE: Dict[str, Any] = {"seq": 0, "items": []}
_LOADED = False


def _load() -> None:
    global _LOADED, _STATE
    if _LOADED:
        return
    _LOADED = True
    try:
        with open(_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            _STATE = {"seq": int(data.get("seq", 0) or 0), "items": data["items"][-_MAX:]}
    except Exception:  # noqa: BLE001 — missing/corrupt file is fine; start fresh.
        _STATE = {"seq": 0, "items": []}


def _persist() -> None:
    try:
        os.makedirs(os.path.dirname(_PATH), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(_PATH), suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(_STATE, f)
        os.replace(tmp, _PATH)  # atomic swap (POSIX)
    except Exception:  # noqa: BLE001
        pass


def push(directive: Dict[str, Any], *, source: str = "router") -> int:
    """Queue a UI directive for the live page(s). Returns its sequence number (0 on failure).

    `directive` is a small dict the browser knows how to execute, e.g.
        {"action": "navigate", "target": "mars"}
        {"action": "open_app", "app": "worklist"}
        {"action": "speak", "text": "Opening your task list."}
    Extra keys (reply text, capability id) ride along untouched. Never raises."""
    if not isinstance(directive, dict) or not directive.get("action"):
        return 0
    with _LOCK:
        _load()
        _STATE["seq"] = int(_STATE.get("seq", 0)) + 1
        item = {"seq": _STATE["seq"], "ts": int(time.time() * 1000), "source": str(source)[:24],
                **{k: v for k, v in directive.items() if k != "seq"}}
        _STATE["items"].append(item)
        if len(_STATE["items"]) > _MAX:
            _STATE["items"] = _STATE["items"][-_MAX:]
        _persist()
        return _STATE["seq"]


def poll(since: int = 0) -> Dict[str, Any]:
    """Return every directive with seq > `since` (capped), plus the current head `seq`.

    A poller passes back the last `seq` it saw; on the first poll it passes 0 and is fast-forwarded
    to the head WITHOUT replaying history (so reconnecting a page does not re-fire stale commands).
    Never raises."""
    with _LOCK:
        _load()
        head = int(_STATE.get("seq", 0))
        try:
            since_i = int(since or 0)
        except (TypeError, ValueError):
            since_i = 0
        if since_i <= 0:
            # First contact: hand back the head only — do not flood a freshly-loaded page with backlog.
            return {"ok": True, "seq": head, "items": []}
        items = [dict(it) for it in _STATE.get("items", []) if int(it.get("seq", 0)) > since_i]
        return {"ok": True, "seq": head, "items": items[-_MAX:]}


def state() -> Dict[str, Any]:
    """Debug/inspection snapshot of the whole buffer."""
    with _LOCK:
        _load()
        return {"seq": int(_STATE.get("seq", 0)), "count": len(_STATE.get("items", [])),
                "items": [dict(it) for it in _STATE.get("items", [])][-_MAX:]}
