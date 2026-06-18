"""EventBus — append-only, threadsafe, JSONL-backed, with replay + subscribe."""
from __future__ import annotations

import json
import os
import threading
from collections.abc import Callable
from typing import Any

from ..audit.redact import redact_value
from .types import Event

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "server", "data", "assurance")
os.makedirs(DATA_DIR, exist_ok=True)
EVENTS_FILE = os.path.join(DATA_DIR, "events.jsonl")

Subscriber = Callable[[Event], None]


class EventBus:
    def __init__(self, path: str = EVENTS_FILE, *, max_history: int = 2000) -> None:
        self._path = path
        self._lock = threading.RLock()
        self._subs: list[Subscriber] = []
        self._history: list[Event] = []
        self._max_history = max_history

    def subscribe(self, fn: Subscriber) -> Callable[[], None]:
        with self._lock:
            self._subs.append(fn)

        def _unsub() -> None:
            with self._lock:
                if fn in self._subs:
                    self._subs.remove(fn)

        return _unsub

    def append(self, event: Event) -> Event:
        # In-memory record (mutable ring buffer of immutable events).
        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history :]

        # Sink to JSONL (best-effort).
        safe = redact_value(event.model_dump())
        line = json.dumps(safe, separators=(",", ":"), ensure_ascii=True)
        try:
            with open(self._path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            pass

        # Fan out.
        with self._lock:
            subs = list(self._subs)
        for s in subs:
            try:
                s(event)
            except Exception:  # noqa: BLE001
                # A misbehaving subscriber must not crash the bus.
                pass
        return event

    def history(self, limit: int = 200, name: str | None = None) -> list[Event]:
        with self._lock:
            items = list(self._history)
        if name:
            items = [e for e in items if e.name == name]
        return items[-limit:]

    def replay_file(self, fn: Subscriber, *, name: str | None = None,
                     since: float | None = None, limit: int | None = None) -> int:
        n = 0
        if not os.path.exists(self._path):
            return 0
        try:
            with open(self._path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        d: dict[str, Any] = json.loads(line)
                    except Exception:  # noqa: BLE001
                        continue
                    if name and d.get("name") != name:
                        continue
                    if since and (d.get("timestamp") or 0) < since:
                        continue
                    try:
                        evt = Event.model_validate(d)
                    except Exception:  # noqa: BLE001
                        continue
                    try:
                        fn(evt)
                    except Exception:  # noqa: BLE001
                        pass
                    n += 1
                    if limit and n >= limit:
                        break
        except OSError:
            return n
        return n


_BUS_LOCK = threading.RLock()
_BUS: EventBus | None = None


def get_bus() -> EventBus:
    global _BUS
    with _BUS_LOCK:
        if _BUS is None:
            _BUS = EventBus()
        return _BUS
