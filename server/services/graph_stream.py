"""GRAPH STREAM — real binary-delta encoding for the live graph WebSocket.

This is the backend the frontend ``engine/binaryTransport.BinaryDeltaSocket`` was
written against. It is NOT protobuf (we add no dependency) but it IS a real, compact,
self-describing binary frame format over a WebSocket — ArrayBuffer frames, not JSON.

Frame layout (big-endian; strings are uint16 length + UTF-8 bytes):
  op=1 NODE_UPSERT : str id, str label, str type, str mark, float32 conf, uint8 redacted
  op=2 EDGE_UPSERT : str a, str b, str relation, float32 strength
  op=3 NODE_REMOVE : str id
  op=4 HEARTBEAT   : float64 ts
  op=5 SNAPSHOT_END: (no payload)

The WebSocket route sends a SNAPSHOT of the current ontology graph as a burst of
NODE/EDGE frames terminated by SNAPSHOT_END, then streams DELTAS: on each poll it
diffs live ontology state and emits only changed/added/removed nodes & edges (plus
a heartbeat). So when a governed action mutates the ontology, the change really
streams to every connected client as binary deltas.

stdlib ``struct`` only. Never raises on encode.
"""

from __future__ import annotations

import hashlib
import struct
import time
from typing import Optional

try:
    from . import graph as graph_svc
except Exception:  # noqa: BLE001
    graph_svc = None  # type: ignore[assignment]

# Op codes
OP_NODE_UPSERT = 1
OP_EDGE_UPSERT = 2
OP_NODE_REMOVE = 3
OP_HEARTBEAT = 4
OP_SNAPSHOT_END = 5

_MAX_STR = 1024


# ── encode ───────────────────────────────────────────────────────────────────────
def _w_str(parts: list[bytes], s) -> None:
    b = str(s if s is not None else "").encode("utf-8")[:_MAX_STR]
    parts.append(struct.pack(">H", len(b)))
    parts.append(b)


def _f32(v, default: float = 1.0) -> bytes:
    try:
        return struct.pack(">f", float(v))
    except (TypeError, ValueError):
        return struct.pack(">f", default)


def encode_node(node: dict) -> bytes:
    parts = [struct.pack(">B", OP_NODE_UPSERT)]
    _w_str(parts, node.get("id"))
    _w_str(parts, node.get("label"))
    _w_str(parts, node.get("type"))
    _w_str(parts, node.get("mark"))
    parts.append(_f32(node.get("conf"), 1.0))
    parts.append(struct.pack(">B", 1 if node.get("redacted") else 0))
    return b"".join(parts)


def encode_edge(edge: dict) -> bytes:
    parts = [struct.pack(">B", OP_EDGE_UPSERT)]
    _w_str(parts, edge.get("a"))
    _w_str(parts, edge.get("b"))
    _w_str(parts, edge.get("relation"))
    parts.append(_f32(edge.get("strength"), 1.0))
    return b"".join(parts)


def encode_remove(node_id: str) -> bytes:
    parts = [struct.pack(">B", OP_NODE_REMOVE)]
    _w_str(parts, node_id)
    return b"".join(parts)


def encode_heartbeat(ts: Optional[float] = None) -> bytes:
    return struct.pack(">Bd", OP_HEARTBEAT, ts if ts is not None else time.time())


def encode_snapshot_end() -> bytes:
    return struct.pack(">B", OP_SNAPSHOT_END)


# ── decode (parity helper — used by tests; the live decoder is the JS one) ─────────
def decode_frame(buf: bytes) -> dict:
    op = buf[0]
    i = 1

    def rstr():
        nonlocal i
        (ln,) = struct.unpack_from(">H", buf, i)
        i += 2
        s = buf[i:i + ln].decode("utf-8", "ignore")
        i += ln
        return s

    if op == OP_NODE_UPSERT:
        d = {"op": "node", "id": rstr(), "label": rstr(), "type": rstr(), "mark": rstr()}
        (conf,) = struct.unpack_from(">f", buf, i)
        i += 4
        d["conf"] = conf
        d["redacted"] = bool(buf[i])
        return d
    if op == OP_EDGE_UPSERT:
        d = {"op": "edge", "a": rstr(), "b": rstr(), "relation": rstr()}
        (st,) = struct.unpack_from(">f", buf, i)
        d["strength"] = st
        return d
    if op == OP_NODE_REMOVE:
        return {"op": "remove", "id": rstr()}
    if op == OP_HEARTBEAT:
        (ts,) = struct.unpack_from(">d", buf, 1)
        return {"op": "heartbeat", "ts": ts}
    if op == OP_SNAPSHOT_END:
        return {"op": "snapshot_end"}
    return {"op": "unknown"}


# ── live graph + diffing ──────────────────────────────────────────────────────────
def fetch_graph(role: Optional[str] = None) -> dict:
    """Current full ontology graph as ``{nodes, edges}``. Never raises."""
    if graph_svc is None:
        return {"nodes": [], "edges": []}
    try:
        g = graph_svc.subgraph([], depth=1, role=role)
        return {"nodes": list(g.get("nodes", [])), "edges": list(g.get("edges", []))}
    except Exception:  # noqa: BLE001
        return {"nodes": [], "edges": []}


def _node_hash(n: dict) -> str:
    raw = f"{n.get('label')}|{n.get('type')}|{n.get('mark')}|{n.get('redacted')}"
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


def _edge_key(e: dict) -> str:
    a, b = str(e.get("a")), str(e.get("b"))
    return f"{a}__{b}" if a < b else f"{b}__{a}"


def _edge_hash(e: dict) -> str:
    return hashlib.sha1(f"{e.get('relation')}|{e.get('strength')}".encode()).hexdigest()[:12]


def state_of(graph: dict) -> tuple[dict, dict]:
    """A diff-able snapshot of the graph: (nodes{id:(hash,data)}, edges{key:(hash,data)})."""
    nodes = {str(n.get("id")): (_node_hash(n), n) for n in graph.get("nodes", [])}
    edges = {_edge_key(e): (_edge_hash(e), e) for e in graph.get("edges", [])}
    return nodes, edges


def snapshot_frames(graph: dict) -> list[bytes]:
    """Full graph as binary frames, terminated by SNAPSHOT_END."""
    frames = [encode_node(n) for n in graph.get("nodes", [])]
    frames += [encode_edge(e) for e in graph.get("edges", [])]
    frames.append(encode_snapshot_end())
    return frames


def delta_frames(prev: tuple[dict, dict], curr: tuple[dict, dict]) -> list[bytes]:
    """Binary frames for everything that changed between two states."""
    pn, pe = prev
    cn, ce = curr
    frames: list[bytes] = []
    for nid, (h, n) in cn.items():
        if nid not in pn or pn[nid][0] != h:
            frames.append(encode_node(n))
    for nid in pn:
        if nid not in cn:
            frames.append(encode_remove(nid))
    for k, (h, e) in ce.items():
        if k not in pe or pe[k][0] != h:
            frames.append(encode_edge(e))
    return frames
