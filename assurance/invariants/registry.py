"""Registry: build the snapshot dict and hold rule lookup."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..audit.log import read_recent as read_audit
from ..commands.bus import get_bus as get_cmd_bus
from ..events.bus import get_bus as get_evt_bus
from .rules import all_rules

REGISTRY: dict[str, Callable[[dict], tuple[bool, str]]] = all_rules()


def register(name: str, fn: Callable[[dict], tuple[bool, str]]) -> None:
    REGISTRY[name] = fn


def registered_names() -> list[str]:
    return sorted(REGISTRY.keys())


def build_snapshot(*, max_commands: int = 200, max_events: int = 500,
                   max_audit: int = 500) -> dict[str, Any]:
    cmds = [c.model_dump() for c in get_cmd_bus().history(limit=max_commands)]
    evts = [e.model_dump() for e in get_evt_bus().history(limit=max_events)]
    aud = read_audit(limit=max_audit)
    return {"commands": cmds, "events": evts, "audit": aud, "workflow_instances": []}
