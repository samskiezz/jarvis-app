"""Minimal state-machine engine with explicit transition table.

Reference: PLEXIL state-table semantics + FSM patterns from fprime.
"""
from __future__ import annotations

import threading
import time
from typing import Any, NamedTuple


class WorkflowError(Exception):
    """Raised when a transition is rejected or required prerequisites missing."""


class Transition(NamedTuple):
    src: str
    event: str
    dst: str
    required: tuple[str, ...] = ()    # state names that must have been visited
    forbidden_after: tuple[str, ...] = ()  # state names that must NOT have been visited


class StateMachine:
    def __init__(self, name: str, states: list[str], initial: str,
                 transitions: list[Transition], terminal: tuple[str, ...] = ()) -> None:
        if initial not in states:
            raise ValueError(f"initial {initial!r} not in states")
        self.name = name
        self.states = list(states)
        self.initial = initial
        self.transitions = list(transitions)
        self.terminal = set(terminal)
        self._lock = threading.RLock()

    # ── Helpers ────────────────────────────────────────────────────────────
    def _table(self) -> dict[tuple[str, str], Transition]:
        return {(t.src, t.event): t for t in self.transitions}

    def allowed_events(self, state: str) -> list[str]:
        return [t.event for t in self.transitions if t.src == state]

    def is_allowed(self, state: str, event: str, history: list[str] | None = None) -> bool:
        try:
            self.next_state(state, event, history or [])
            return True
        except WorkflowError:
            return False

    def next_state(self, state: str, event: str, history: list[str]) -> str:
        table = self._table()
        t = table.get((state, event))
        if t is None:
            raise WorkflowError(f"no transition from {state!r} on event {event!r}")
        for r in t.required:
            if r not in history:
                raise WorkflowError(f"transition {state}-{event}->{t.dst} requires prior state {r}")
        for f in t.forbidden_after:
            if f in history:
                raise WorkflowError(f"transition {state}-{event}->{t.dst} forbidden after {f}")
        return t.dst

    # ── Instance ───────────────────────────────────────────────────────────
    def new_instance(self) -> "StateMachineInstance":
        return StateMachineInstance(self)


class StateMachineInstance:
    def __init__(self, sm: StateMachine) -> None:
        self.sm = sm
        self.state = sm.initial
        self.history: list[str] = [sm.initial]
        self.created_at = time.time()
        self.events: list[dict[str, Any]] = []
        self._lock = threading.RLock()

    def fire(self, event: str, *, detail: dict[str, Any] | None = None) -> str:
        with self._lock:
            nxt = self.sm.next_state(self.state, event, self.history)
            self.state = nxt
            self.history.append(nxt)
            self.events.append({"ts": time.time(), "event": event, "to": nxt, "detail": detail or {}})
            return nxt

    @property
    def terminated(self) -> bool:
        return self.state in self.sm.terminal

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "workflow": self.sm.name,
                "state": self.state,
                "history": list(self.history),
                "events_n": len(self.events),
                "created_at": self.created_at,
                "terminated": self.terminated,
            }
