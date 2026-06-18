"""CommandBus — typed dispatch with dry-run, idempotency, approval, audit.

Reference: NASA fprime command dispatcher (github.com/nasa/fprime Fw/Cmd).
"""
from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any

from ..events.bus import get_bus as get_event_bus
from ..events.types import Event
from ..gates.approval import ApprovalRequired
from ..gates.dangerous import is_dangerous
from .types import Command, CommandFailure, CommandOutcome, CommandResult

Handler = Callable[[Command], dict[str, Any]]


class CommandBus:
    def __init__(self) -> None:
        self._handlers: dict[str, Handler] = {}
        self._idem_seen: dict[str, str] = {}
        self._history: list[CommandOutcome] = []
        self._lock = threading.RLock()
        self._max_history = 1000
        self._audit_hook: Callable[[CommandOutcome], None] | None = None

    def register(self, name: str, handler: Handler) -> None:
        with self._lock:
            self._handlers[name] = handler

    def registered(self) -> list[str]:
        with self._lock:
            return sorted(self._handlers.keys())

    def set_audit_hook(self, fn: Callable[[CommandOutcome], None] | None) -> None:
        self._audit_hook = fn

    def dispatch(self, cmd: Command) -> CommandOutcome:
        started = time.time()
        evt_bus = get_event_bus()
        evt_bus.append(Event(
            name="command.received",
            actor=cmd.actor,
            source="assurance.commands.bus",
            correlation_id=cmd.correlation_id,
            causation_id=cmd.command_id,
            payload={"command_id": cmd.command_id, "name": cmd.name, "dry_run": cmd.dry_run},
        ))

        if cmd.idempotency_key:
            with self._lock:
                prev = self._idem_seen.get(cmd.idempotency_key)
            if prev and prev != cmd.command_id:
                return self._fail(cmd, started, "idempotent_replay",
                                  f"idempotency_key={cmd.idempotency_key} already executed as {prev}")

        with self._lock:
            handler = self._handlers.get(cmd.name)
        if handler is None:
            return self._fail(cmd, started, "unknown_command", f"no handler registered for {cmd.name}")

        if is_dangerous(cmd.name) and not cmd.approved and not cmd.dry_run:
            return self._fail(cmd, started, "approval_required",
                              f"command '{cmd.name}' is dangerous; pass approved=True or dry_run=True")

        try:
            payload_out = handler(cmd) or {}
            if not isinstance(payload_out, dict):
                payload_out = {"value": payload_out}
        except ApprovalRequired as exc:
            return self._fail(cmd, started, "approval_required", str(exc))
        except PermissionError as exc:
            return self._fail(cmd, started, "permission", str(exc))
        except ValueError as exc:
            return self._fail(cmd, started, "validation", str(exc))
        except Exception as exc:  # noqa: BLE001
            return self._fail(cmd, started, "handler_error", f"{type(exc).__name__}: {exc}")

        if cmd.idempotency_key:
            with self._lock:
                self._idem_seen[cmd.idempotency_key] = cmd.command_id

        finished = time.time()
        result = CommandResult(
            command_id=cmd.command_id,
            name=cmd.name,
            actor=cmd.actor,
            correlation_id=cmd.correlation_id,
            started_at=started,
            finished_at=finished,
            duration_ms=(finished - started) * 1000.0,
            dry_run=cmd.dry_run,
            approved=cmd.approved,
            payload_out=payload_out,
        )
        self._record(result)
        evt_bus.append(Event(
            name="command.completed",
            actor=cmd.actor,
            source="assurance.commands.bus",
            correlation_id=cmd.correlation_id,
            causation_id=cmd.command_id,
            payload={"command_id": cmd.command_id, "name": cmd.name,
                     "duration_ms": result.duration_ms, "dry_run": cmd.dry_run},
        ))
        return result

    def history(self, limit: int = 100) -> list[CommandOutcome]:
        with self._lock:
            return list(self._history[-limit:])

    def clear_history(self) -> None:
        with self._lock:
            self._history.clear()
            self._idem_seen.clear()

    def _fail(self, cmd: Command, started: float, kind: str, msg: str) -> CommandFailure:
        finished = time.time()
        fail = CommandFailure(
            command_id=cmd.command_id,
            name=cmd.name,
            actor=cmd.actor,
            correlation_id=cmd.correlation_id,
            started_at=started,
            finished_at=finished,
            duration_ms=(finished - started) * 1000.0,
            dry_run=cmd.dry_run,
            approved=cmd.approved,
            error_kind=kind,
            error_message=msg,
        )
        self._record(fail)
        try:
            get_event_bus().append(Event(
                name="command.failed",
                actor=cmd.actor,
                source="assurance.commands.bus",
                correlation_id=cmd.correlation_id,
                causation_id=cmd.command_id,
                payload={"command_id": cmd.command_id, "name": cmd.name,
                         "error_kind": kind, "error_message": msg, "dry_run": cmd.dry_run},
            ))
        except Exception:  # noqa: BLE001
            pass
        return fail

    def _record(self, outcome: CommandOutcome) -> None:
        with self._lock:
            self._history.append(outcome)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history :]
        if self._audit_hook is not None:
            try:
                self._audit_hook(outcome)
            except Exception:  # noqa: BLE001
                pass


_BUS_LOCK = threading.RLock()
_BUS: CommandBus | None = None


def get_bus() -> CommandBus:
    global _BUS
    with _BUS_LOCK:
        if _BUS is None:
            _BUS = CommandBus()
            _wire_default_audit_hook(_BUS)
            _register_default_handlers(_BUS)
        return _BUS


def _wire_default_audit_hook(bus: CommandBus) -> None:
    from ..audit.log import append_command_outcome
    bus.set_audit_hook(append_command_outcome)


def _register_default_handlers(bus: CommandBus) -> None:
    from . import registry
    registry.register_defaults(bus)
