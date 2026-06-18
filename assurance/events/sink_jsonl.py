"""Legacy-compatible JSONL sinks.

Lets the assurance EventBus tee into existing log files like
server/data/vast_events.jsonl so the new layer is purely additive.
"""
from __future__ import annotations

import json
import os
import threading
from collections.abc import Callable

from ..audit.redact import redact_value
from .types import Event


def make_tee_subscriber(path: str) -> Callable[[Event], None]:
    """Returns a Subscriber that appends every event to `path` as JSONL."""
    lock = threading.RLock()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    def _tee(event: Event) -> None:
        try:
            line = json.dumps(redact_value(event.model_dump()), separators=(",", ":"))
            with lock, open(path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            pass

    return _tee
