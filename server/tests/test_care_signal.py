"""Care/guardian lifeline signalling: reliability (stale-peer eviction, peer_last_seen)
and the consent + append-only co-control audit trail. The existing post/poll/rooms
contract must keep working unchanged."""
from server.services import care_signal as CS


def _reset():
    CS._ROOMS.clear()


def test_post_poll_roundtrip_and_additive_shape():
    _reset()
    CS.post("r1", "guardian", "patient", "offer", {"sdp": "x"})
    out = CS.poll("r1", "patient", 0)
    assert out["ok"] and out["room"] == "r1" and out["role"] == "patient"
    assert any(m["kind"] == "offer" for m in out["msgs"])
    assert "peer_last_seen" in out                      # new additive field, doesn't break clients


def test_patient_hello_records_consent():
    _reset()
    CS.post("mum", "patient", "guardian", "hello", {})
    ev = CS.audit("mum")
    assert any(e["action"] == "consent" and e["detail"]["granted"] for e in ev)


def test_control_speak_text_is_redacted():
    _reset()
    CS.post("mum", "guardian", "patient", "ctrl", {"speak": "secret medical instruction"})
    speak = [e for e in CS.audit("mum") if e["action"] == "control:speak"]
    assert speak and speak[0]["detail"]["speak"] == "<text>"   # body never stored in audit
    # but the message itself still carries the real text to the patient channel
    msgs = CS.poll("mum", "patient", 0)["msgs"]
    assert any(m["payload"].get("speak") == "secret medical instruction" for m in msgs)


def test_control_cam_recorded_plain():
    _reset()
    CS.post("mum", "guardian", "patient", "ctrl", {"cam": False})
    assert any(e["action"] == "control:cam" and e["detail"]["cam"] is False
               for e in CS.audit("mum"))


def test_stale_peer_evicted(monkeypatch):
    _reset()
    t = [1000.0]
    monkeypatch.setattr(CS, "_now", lambda: t[0])
    CS.poll("mum", "patient", 0)                     # patient present at t=1000
    t[0] = 1000.0 + CS._PRESENCE_TTL + 5             # advance past the eviction window
    CS.poll("mum", "guardian", 0)                    # poll 1: prune evicts the stale patient
    out = CS.poll("mum", "guardian", 0)              # poll 2: patient now gone from peers
    assert "patient" not in out["peers"]
    assert any(e["action"] == "left" and e["actor"] == "patient" for e in CS.audit("mum"))


def test_audit_ring_is_bounded():
    _reset()
    for i in range(CS._AUDIT_MAX + 50):
        CS.post("mum", "guardian", "patient", "ctrl", {"ring": i})
    assert len(CS.audit("mum")) <= CS._AUDIT_MAX     # memory stays bounded


def test_audit_is_read_only_and_filters_since():
    _reset()
    CS.post("mum", "patient", "guardian", "hello", {})
    ev = CS.audit("mum")
    assert ev
    latest = max(e["ts"] for e in ev)
    assert CS.audit("mum", since_ts=latest) == []     # since-latest -> empty
