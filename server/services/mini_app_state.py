"""MINI_APP_STATE — lightweight persistent store for new mini apps.

Most new mini apps need small JSON-state (routines, modes, profiles, packs)
rather than full DB tables. This module provides a safe, atomic JSON-file
store with versioning and never-raise semantics, mirroring the style of
``server/services/panickey.py``.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "server", "data")

_LOCK = threading.RLock()


def _path(app: str) -> str:
    """Return the JSON state path for a given mini app."""
    return os.path.join(DATA_DIR, f"{app}_state.json")


def load(app: str, default: dict[str, Any] | None = None) -> dict[str, Any]:
    """Load state for ``app``. Returns ``default`` or empty dict on miss."""
    with _LOCK:
        try:
            with open(_path(app), encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception:  # noqa: BLE001
            pass
        return dict(default) if default else {}


def save(app: str, state: dict[str, Any]) -> bool:
    """Atomically save state for ``app``. Returns success."""
    with _LOCK:
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            tmp = _path(app) + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
            os.replace(tmp, _path(app))
            return True
        except Exception:  # noqa: BLE001
            return False


def ensure(app: str, defaults: dict[str, Any]) -> dict[str, Any]:
    """Load state, merge missing defaults, save, and return."""
    s = load(app)
    changed = False
    for k, v in defaults.items():
        if k not in s:
            s[k] = v
            changed = True
    if changed:
        save(app, s)
    return s


def mutate(app: str, fn: Any, default: dict[str, Any] | None = None) -> dict[str, Any]:
    """Load state, apply ``fn(state)`` (in-place), save, and return state."""
    s = ensure(app, default or {})
    try:
        fn(s)
    except Exception:  # noqa: BLE001
        pass
    save(app, s)
    return s


def now_ms() -> int:
    return int(time.time() * 1000)


def append_log(state: dict[str, Any], key: str, entry: dict[str, Any], limit: int = 500) -> None:
    """Append ``entry`` to ``state[key]`` list and trim to ``limit``."""
    logs = state.setdefault(key, [])
    if not isinstance(logs, list):
        logs = []
        state[key] = logs
    logs.append(entry)
    state[key] = logs[-limit:]
