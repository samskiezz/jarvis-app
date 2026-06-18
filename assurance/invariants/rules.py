"""The 10 invariant rules from the brief.

Each rule has signature  check(snapshot: dict) -> InvariantOutcome
where InvariantOutcome is a tuple (passed: bool, evidence: str).

`snapshot` is the dict returned by build_snapshot() in registry.py — it
contains samples of recent command outcomes, recent events, recent audit
entries, and arbitrary repo facts (e.g. file existence).
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..audit.redact import has_secret
from ..gates.dangerous import is_dangerous

InvariantOutcome = tuple[bool, str]


def _commands(snap: dict[str, Any]) -> list[dict[str, Any]]:
    return list(snap.get("commands", []))


def _events(snap: dict[str, Any]) -> list[dict[str, Any]]:
    return list(snap.get("events", []))


def _audit(snap: dict[str, Any]) -> list[dict[str, Any]]:
    return list(snap.get("audit", []))


def inv_dangerous_requires_approval(snap: dict) -> InvariantOutcome:
    """Destructive commands require approval (or must be dry-run)."""
    bad: list[str] = []
    for c in _commands(snap):
        if not is_dangerous(c.get("name", "")):
            continue
        if c.get("ok") is False:
            continue  # already rejected
        if not c.get("dry_run") and not c.get("approved", False):
            bad.append(c.get("name", "?"))
    return (len(bad) == 0, f"{len(bad)} unapproved-dangerous: {bad[:5]}")


def inv_command_creates_audit(snap: dict) -> InvariantOutcome:
    """Every dispatched command produces an audit entry."""
    cmd_ids = {c.get("command_id") for c in _commands(snap)}
    audit_ids = set()
    for a in _audit(snap):
        d = a.get("detail") or {}
        cid = d.get("command_id")
        if cid:
            audit_ids.add(cid)
    missing = cmd_ids - audit_ids
    return (len(missing) == 0, f"{len(missing)} commands without audit")


def inv_event_has_correlation(snap: dict) -> InvariantOutcome:
    """Events emitted FROM the assurance bus must carry correlation_id."""
    bad = 0
    total = 0
    for e in _events(snap):
        if not str(e.get("source", "")).startswith("assurance."):
            continue
        total += 1
        if not e.get("correlation_id"):
            bad += 1
    return (bad == 0, f"{bad}/{total} assurance-source events missing correlation_id")


def inv_privileged_action_audited(snap: dict) -> InvariantOutcome:
    """Admin / dangerous-name commands always produce an audit entry."""
    cmd_priv = [c for c in _commands(snap)
                if is_dangerous(c.get("name", "")) or "admin" in c.get("name", "")]
    cmd_ids = {c.get("command_id") for c in cmd_priv}
    audit_ids = {(a.get("detail") or {}).get("command_id") for a in _audit(snap)}
    audit_ids.discard(None)
    missing = cmd_ids - audit_ids
    return (len(missing) == 0, f"{len(missing)} privileged commands missing audit")


def inv_idempotency_no_double(snap: dict) -> InvariantOutcome:
    """No two successful dispatches share an idempotency_key."""
    seen: dict[str, str] = {}
    for c in _commands(snap):
        k = c.get("idempotency_key")
        if not k or c.get("ok") is False:
            continue
        if k in seen and seen[k] != c.get("command_id"):
            return (False, f"idempotency_key={k} reused")
        seen[k] = c.get("command_id", "?")
    return (True, f"checked {len(seen)} idem keys")


def inv_failed_sync_not_silent(snap: dict) -> InvariantOutcome:
    """Any external-sync failure is recorded as a failed command AND emits a
    `sync.failed` event."""
    sync_failures = [c for c in _commands(snap)
                     if c.get("ok") is False and "sync" in c.get("name", "")]
    sync_fail_events = [e for e in _events(snap) if e.get("name") == "sync.failed"]
    # We require at least an event for each failure (one-way containment).
    if len(sync_failures) == 0:
        return (True, "no sync failures in window")
    fail_ids = {c.get("command_id") for c in sync_failures}
    event_ids = {(e.get("payload") or {}).get("command_id") for e in sync_fail_events}
    missing = fail_ids - event_ids
    return (len(missing) == 0, f"{len(missing)} silent sync failures")


def inv_no_secret_in_audit(snap: dict) -> InvariantOutcome:
    """Audit entries must never contain a raw secret string."""
    leaks = 0
    for a in _audit(snap):
        if has_secret(str(a)):
            leaks += 1
    return (leaks == 0, f"{leaks} audit entries with secret pattern")


def inv_no_secret_in_events(snap: dict) -> InvariantOutcome:
    """Events must never contain a raw secret string."""
    leaks = 0
    for e in _events(snap):
        if has_secret(str(e)):
            leaks += 1
    return (leaks == 0, f"{leaks} events with secret pattern")


def inv_actor_present(snap: dict) -> InvariantOutcome:
    """State-changing commands carry an actor identifier."""
    missing = [c.get("name") for c in _commands(snap) if not c.get("actor")]
    return (len(missing) == 0, f"{len(missing)} commands missing actor: {missing[:5]}")


def inv_workflow_no_skip(snap: dict) -> InvariantOutcome:
    """Workflow cannot reach a 'terminal' state from initial in zero events."""
    wfs = snap.get("workflow_instances", [])
    bad = []
    for w in wfs:
        history = w.get("history") or []
        if len(history) < 2 and w.get("terminated"):
            bad.append(w.get("workflow"))
    return (len(bad) == 0, f"{len(bad)} workflows terminated with zero events: {bad}")


def all_rules() -> dict[str, Callable[[dict], InvariantOutcome]]:
    return {
        "dangerous_requires_approval":   inv_dangerous_requires_approval,
        "command_creates_audit":         inv_command_creates_audit,
        "event_has_correlation":         inv_event_has_correlation,
        "privileged_action_audited":     inv_privileged_action_audited,
        "idempotency_no_double":         inv_idempotency_no_double,
        "failed_sync_not_silent":        inv_failed_sync_not_silent,
        "no_secret_in_audit":            inv_no_secret_in_audit,
        "no_secret_in_events":           inv_no_secret_in_events,
        "actor_present":                 inv_actor_present,
        "workflow_no_skip":              inv_workflow_no_skip,
    }
