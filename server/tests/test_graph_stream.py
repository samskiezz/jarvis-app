"""Tests for the binary graph-delta stream: codec parity + live WebSocket."""

from __future__ import annotations

import os

# config.API_KEY is read once at import; match the value test_routes uses so the
# two suites agree regardless of which imports server.config first (test ordering).
os.environ.setdefault("JARVIS_API_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from server.main import create_app  # noqa: E402
from server.services import graph_stream as gs  # noqa: E402


def test_codec_roundtrip_node_and_edge():
    node = {"id": "n1", "label": "PSG", "type": "org", "mark": "PII",
            "conf": 0.9, "redacted": True}
    d = gs.decode_frame(gs.encode_node(node))
    assert d["op"] == "node" and d["id"] == "n1" and d["label"] == "PSG"
    assert d["type"] == "org" and d["mark"] == "PII" and d["redacted"] is True
    assert abs(d["conf"] - 0.9) < 1e-6

    edge = {"a": "n1", "b": "n2", "relation": "OWNS", "strength": 3.0}
    e = gs.decode_frame(gs.encode_edge(edge))
    assert e["op"] == "edge" and e["a"] == "n1" and e["b"] == "n2"
    assert e["relation"] == "OWNS" and abs(e["strength"] - 3.0) < 1e-6


def test_remove_and_heartbeat_and_snapshot_end():
    assert gs.decode_frame(gs.encode_remove("gone"))["id"] == "gone"
    assert gs.decode_frame(gs.encode_heartbeat(123.5))["ts"] == 123.5
    assert gs.decode_frame(gs.encode_snapshot_end())["op"] == "snapshot_end"


def test_delta_detects_add_change_remove():
    g0 = {"nodes": [{"id": "a", "label": "A", "type": "t", "mark": ""}],
          "edges": []}
    g1 = {"nodes": [{"id": "a", "label": "A2", "type": "t", "mark": ""},
                    {"id": "b", "label": "B", "type": "t", "mark": ""}],
          "edges": [{"a": "a", "b": "b", "relation": "R", "strength": 1.0}]}
    frames = gs.delta_frames(gs.state_of(g0), gs.state_of(g1))
    ops = [gs.decode_frame(f) for f in frames]
    # 'a' changed (label A->A2), 'b' added, edge added.
    assert any(o["op"] == "node" and o["id"] == "a" and o["label"] == "A2" for o in ops)
    assert any(o["op"] == "node" and o["id"] == "b" for o in ops)
    assert any(o["op"] == "edge" for o in ops)

    # removal
    frames2 = gs.delta_frames(gs.state_of(g1), gs.state_of(g0))
    ops2 = [gs.decode_frame(f) for f in frames2]
    assert any(o["op"] == "remove" and o["id"] == "b" for o in ops2)


def test_live_websocket_streams_binary_snapshot():
    app = create_app()
    client = TestClient(app)
    with client.websocket_connect("/v1/graph/stream?interval=0.5") as ws:
        saw_node = saw_end = False
        for _ in range(2000):
            frame = ws.receive_bytes()
            assert isinstance(frame, (bytes, bytearray))
            op = frame[0]
            if op == gs.OP_NODE_UPSERT:
                saw_node = True
            if op == gs.OP_SNAPSHOT_END:
                saw_end = True
                break
        assert saw_end
        # the live ontology has nodes, so we should have seen at least one
        assert saw_node
        # after the snapshot, a heartbeat must arrive on the next poll
        got_heartbeat = False
        for _ in range(50):
            frame = ws.receive_bytes()
            if frame[0] == gs.OP_HEARTBEAT:
                got_heartbeat = True
                break
        assert got_heartbeat
