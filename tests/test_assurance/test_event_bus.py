"""Test EventBus: append, subscribe, replay, correlation propagation."""
from assurance.events.bus import get_bus
from assurance.events.types import Event


def test_append_returns_event_and_keeps_in_history():
    bus = get_bus()
    e = bus.append(Event(name="x.y", source="test"))
    assert e.name == "x.y"
    h = bus.history(limit=5)
    assert any(x.name == "x.y" for x in h)


def test_subscribe_receives_events():
    bus = get_bus()
    seen = []
    bus.subscribe(lambda e: seen.append(e.name))
    bus.append(Event(name="a", source="t"))
    bus.append(Event(name="b", source="t"))
    assert "a" in seen and "b" in seen


def test_subscribe_unsub_stops_delivery():
    bus = get_bus()
    seen = []
    un = bus.subscribe(lambda e: seen.append(e.name))
    bus.append(Event(name="first", source="t"))
    un()
    bus.append(Event(name="second", source="t"))
    assert "first" in seen and "second" not in seen


def test_history_filter_by_name():
    bus = get_bus()
    bus.append(Event(name="foo", source="t"))
    bus.append(Event(name="bar", source="t"))
    bus.append(Event(name="foo", source="t"))
    foos = bus.history(limit=100, name="foo")
    assert all(e.name == "foo" for e in foos)
    assert len(foos) >= 2


def test_correlation_id_carries_through_history():
    bus = get_bus()
    e1 = bus.append(Event(name="evt", source="t", correlation_id="abc"))
    h = bus.history(limit=5, name="evt")
    assert any(x.correlation_id == "abc" for x in h)
    assert e1.correlation_id == "abc"


def test_replay_file_returns_count_after_persistence(tmp_path):
    from assurance.events.bus import EventBus

    p = str(tmp_path / "events.jsonl")
    b = EventBus(path=p)
    b.append(Event(name="z", source="t", correlation_id="c1"))
    b.append(Event(name="z", source="t", correlation_id="c2"))
    seen = []
    n = b.replay_file(lambda e: seen.append(e.correlation_id))
    assert n == 2
    assert "c1" in seen and "c2" in seen
