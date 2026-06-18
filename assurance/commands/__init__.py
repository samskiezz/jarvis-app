"""Typed command bus.

Every state-changing action SHOULD route through the CommandBus for: typed
payload, dry-run, idempotency, approval gate, audit trail, replay.
"""
from .bus import CommandBus, get_bus  # noqa: F401
from .types import Command, CommandFailure, CommandResult  # noqa: F401

__all__ = ["CommandBus", "Command", "CommandFailure", "CommandResult", "get_bus"]
