"""Test dangerous-command gates."""
from assurance.commands.bus import get_bus
from assurance.commands.types import Command
from assurance.gates.dangerous import is_dangerous, mark_dangerous


def test_known_dangerous_names():
    assert is_dangerous("gpu.dispose")
    assert is_dangerous("storage.delete")
    assert is_dangerous("payment.execute")


def test_dangerous_prefixes_match():
    assert is_dangerous("delete.everything")
    assert is_dangerous("destroy.universe")


def test_safe_command_not_dangerous():
    assert not is_dangerous("noop.echo")


def test_mark_dangerous_registers_at_runtime():
    mark_dangerous("custom.dangerous")
    assert is_dangerous("custom.dangerous")


def test_dispatch_logs_failure_on_unapproved_dangerous():
    bus = get_bus()
    out = bus.dispatch(Command(name="gpu.dispose", actor="alice", payload={"id": 99}))
    assert out.ok is False
    assert out.error_kind == "approval_required"
    hist = bus.history(limit=5)
    assert any(getattr(h, "error_kind", None) == "approval_required" for h in hist)
