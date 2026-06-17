"""Agent OS — append-only audit log (JSONL).

A durable, tamper-evident-ish record of the destructive-action chain
(verdict → approval/rejection → execution → result), separate from the
RAM-only EventBus and the post-hoc memory rows. Never raises; best-effort
fsync so a record survives a crash/restart.
"""
from __future__ import annotations

import json
import os
import threading
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOG_PATH = os.path.join(_ROOT, "server", "data", "agent_audit.jsonl")
_LOCK = threading.Lock()


def record(event: str, *, run_id=None, tool=None, risk=None, mode=None,
           actor=None, args=None, result_summary=None, backup_dir=None, extra=None) -> None:
    """Append one audit event. Best-effort durable; never raises."""
    rec = {
        "ts": time.time(), "event": event, "run_id": run_id, "tool": tool,
        "risk": risk, "mode": mode, "actor": actor, "args": args,
        "result_summary": result_summary, "backup_dir": backup_dir,
        **(extra or {}),
    }
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        line = json.dumps(rec, ensure_ascii=False, default=str)
        with _LOCK, open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())
    except Exception:  # noqa: BLE001
        pass
