"""Test CommandBus: register, dispatch, dry-run, idempotency, failures."""
from assurance.commands.bus import get_bus
from assurance.commands.types import Command


def test_dispatch_known_command_returns_success():
    bus = get_bus()
    cmd = Command(name="noop.echo", actor="alice", payload={"a": 1})
    out = bus.dispatch(cmd)
    assert out.ok is True
    assert out.payload_out["received"] == {"a": 1}
    assert out.actor == "alice"


def test_unknown_command_returns_failure():
    bus = get_bus()
    out = bus.dispatch(Command(name="totally.unknown", actor="x"))
    assert out.ok is False
    assert out.error_kind == "unknown_command"


def test_dangerous_command_without_approval_blocked():
    bus = get_bus()
    out = bus.dispatch(Command(name="gpu.dispose", actor="x", payload={"id": 1}))
    assert out.ok is False
    assert out.error_kind == "approval_required"


def test_dangerous_command_dry_run_succeeds():
    bus = get_bus()
    out = bus.dispatch(Command(name="gpu.dispose", actor="x", payload={"id": 1}, dry_run=True))
    assert out.ok is True
    assert out.payload_out["would"] == "gpu.dispose"


def test_dangerous_command_approved_succeeds():
    bus = get_bus()
    out = bus.dispatch(Command(name="gpu.dispose", actor="x", payload={"id": 1}, approved=True))
    assert out.ok is True


def test_idempotency_blocks_second_dispatch():
    bus = get_bus()
    a = bus.dispatch(Command(name="noop.echo", actor="x", idempotency_key="k1"))
    b = bus.dispatch(Command(name="noop.echo", actor="x", idempotency_key="k1"))
    assert a.ok is True
    assert b.ok is False
    assert b.error_kind == "idempotent_replay"


def test_handler_exception_becomes_failure():
    bus = get_bus()

    def _bad(cmd):
        raise RuntimeError("boom")

    bus.register("bad.one", _bad)
    out = bus.dispatch(Command(name="bad.one", actor="x"))
    assert out.ok is False
    assert out.error_kind == "handler_error"
    assert "boom" in out.error_message


def test_history_populated():
    bus = get_bus()
    for _ in range(3):
        bus.dispatch(Command(name="noop.echo", actor="x"))
    h = bus.history(limit=10)
    assert len(h) >= 3
