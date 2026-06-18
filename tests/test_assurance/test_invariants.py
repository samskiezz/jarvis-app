"""Test each invariant rule positively and negatively."""
from assurance.invariants.rules import (
    inv_actor_present,
    inv_dangerous_requires_approval,
    inv_idempotency_no_double,
    inv_no_secret_in_audit,
    inv_no_secret_in_events,
)
from assurance.invariants.runner import run_all


def test_dangerous_requires_approval_passes_when_only_approved():
    snap = {"commands": [{"name": "gpu.dispose", "approved": True, "dry_run": False, "ok": True}],
            "events": [], "audit": []}
    ok, _ = inv_dangerous_requires_approval(snap)
    assert ok


def test_dangerous_requires_approval_fails_on_unapproved():
    snap = {"commands": [{"name": "gpu.dispose", "approved": False, "dry_run": False, "ok": True}],
            "events": [], "audit": []}
    ok, _ = inv_dangerous_requires_approval(snap)
    assert not ok


def test_idempotency_no_double_fails_on_reuse():
    snap = {"commands": [
        {"name": "x", "command_id": "c1", "idempotency_key": "k", "ok": True},
        {"name": "x", "command_id": "c2", "idempotency_key": "k", "ok": True},
    ], "events": [], "audit": []}
    ok, _ = inv_idempotency_no_double(snap)
    assert not ok


def test_actor_present_fails_on_missing():
    snap = {"commands": [{"name": "x", "actor": ""}], "events": [], "audit": []}
    ok, _ = inv_actor_present(snap)
    assert not ok


def test_no_secret_in_events_detects_leak():
    snap = {"commands": [], "events": [{"name": "leak",
                                        "payload": {"k": "sk-LEAK1234567890abcdefghijklm"}}],
            "audit": []}
    ok, _ = inv_no_secret_in_events(snap)
    assert not ok


def test_no_secret_in_audit_detects_leak():
    snap = {"commands": [], "events": [],
            "audit": [{"detail": "bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789"}]}
    ok, _ = inv_no_secret_in_audit(snap)
    assert not ok


def test_run_all_returns_full_report_shape():
    rep = run_all()
    assert rep.total == 10
    assert all(r.name for r in rep.results)
