"""Default command handlers — overridable by subsystems (last register wins)."""
from __future__ import annotations

from typing import Any

from .types import Command


def _echo(cmd: Command) -> dict[str, Any]:
    return {"received": cmd.payload, "dry_run": cmd.dry_run}


def _noop_dangerous(cmd: Command) -> dict[str, Any]:
    if cmd.dry_run:
        return {"would": cmd.name, "args": cmd.payload}
    return {"executed_default_noop": True, "name": cmd.name}


def register_defaults(bus) -> None:  # noqa: ANN001
    bus.register("noop.echo", _echo)
    bus.register("ping", _echo)
    bus.register("gpu.dispose", _noop_dangerous)
    bus.register("gpu.launch_disposable", _noop_dangerous)
    bus.register("claude.run.archive", _echo)
    bus.register("claude.improve.land", _echo)
    bus.register("claude.improve.discard", _echo)
    bus.register("chat.dispatch", _echo)
