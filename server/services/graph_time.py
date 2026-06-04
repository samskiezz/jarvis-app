"""TEMPORAL GRAPH PLAYBACK (P5 #41) — time-aware views over the link graph.

A thin temporal layer composed on top of the existing graph + ontology stack. It
does NOT reimplement traversal/subgraph — it reuses
:mod:`server.services.graph` (``subgraph`` / its ``_node_payload`` /
``_edges_within`` helpers and the store-or-seed object/link readers) and the
ontology object timestamps (``created_ts``) recorded by
:mod:`server.services.ontology_store`.

Capabilities:
  * :func:`graph_at`  — the subgraph as it existed at an instant ``ts`` (only
    objects whose ``created_ts <= ts`` and links whose endpoints both existed by
    then; if links carry a ts/created_ts those are honoured too).
  * :func:`playback`  — N evenly-spaced snapshots across a time window so a UI
    scrubber can animate the graph growing over time.

Honesty: the ontology ``link`` table has no timestamp column, so by default a
link is dated by *when both of its endpoints existed* (max of the two
``created_ts``). When endpoint timestamps are themselves unavailable we fall back
to the full current graph and say so via a ``note`` field.

Doctrine (mirrors the rest of the backend):
  * stdlib only;
  * NEVER raise — every public function degrades to a safe value;
  * read-only — never mutates any store.
"""

from __future__ import annotations

from typing import Any, Optional

from . import graph as _graph

# Default per-frame node cap so a UI scrubber stays responsive.
_FRAME_NODE_CAP = 200


# ── timestamp helpers ──────────────────────────────────────────────────────────
def _coerce_ts(value: Any) -> Optional[int]:
    """Best-effort coerce a created/updated/ts value to epoch-ms int. None if absent."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return None


def _object_ts(obj: dict) -> Optional[int]:
    """The instant an object first existed (its ``created_ts``)."""
    return _coerce_ts(obj.get("created_ts"))


def _link_ts(lk: dict, obj_ts: dict[str, Optional[int]]) -> Optional[int]:
    """The instant a link first existed.

    Prefer an explicit ``ts``/``created_ts`` on the link; otherwise fall back to
    the moment both endpoints existed (max of their ``created_ts``). Returns None
    only when neither the link nor its endpoints carry any timestamp.
    """
    explicit = _coerce_ts(lk.get("ts"))
    if explicit is None:
        explicit = _coerce_ts(lk.get("created_ts"))
    if explicit is not None:
        return explicit
    a, b = str(lk.get("a")), str(lk.get("b"))
    ta, tb = obj_ts.get(a), obj_ts.get(b)
    if ta is None or tb is None:
        return None
    return max(ta, tb)


def _links_have_timestamps(links: list[dict], obj_ts: dict[str, Optional[int]]) -> bool:
    """True if at least one link can be dated (explicitly or via its endpoints)."""
    for lk in links:
        if _link_ts(lk, obj_ts) is not None:
            return True
    return False


def time_bounds() -> dict:
    """The observed ``[t0, t1]`` time window across all object ``created_ts``.

    Returns ``{"t0", "t1", "has_object_ts"}``; ``t0``/``t1`` are None when no
    object carries a timestamp. Never raises.
    """
    try:
        objs = _graph._all_objects()
        tss = [t for t in (_object_ts(o) for o in objs) if t is not None]
        if not tss:
            return {"t0": None, "t1": None, "has_object_ts": False}
        return {"t0": min(tss), "t1": max(tss), "has_object_ts": True}
    except Exception:  # noqa: BLE001 - never raise
        return {"t0": None, "t1": None, "has_object_ts": False}


# ── 1. graph_at — the graph as it existed at an instant ─────────────────────────
def graph_at(
    ts: Optional[int],
    *,
    role: Optional[str] = None,
    cap: int = 0,
) -> dict:
    """Return the subgraph as it existed at time ``ts`` (epoch-ms, inclusive).

    Includes only objects with ``created_ts <= ts`` and links whose ts/created_ts
    (or endpoint-derived ts) ``<= ts``. When link timestamps are entirely absent,
    falls back to the current full graph and notes it. ``cap`` (>0) limits the
    node count (oldest objects first). Never raises.

    Returns ``{ts, n_nodes, n_edges, nodes, edges, note}``.
    """
    try:
        bound = _coerce_ts(ts)

        objs = _graph._all_objects()
        links = _graph._all_links()
        obj_ts: dict[str, Optional[int]] = {
            str(o.get("id")): _object_ts(o) for o in objs if o.get("id") is not None
        }
        any_obj_ts = any(v is not None for v in obj_ts.values())
        links_dateable = _links_have_timestamps(links, obj_ts)

        note: Optional[str] = None

        # No usable temporal information at all (or no ts bound supplied) -> the
        # current graph, honestly flagged.
        if bound is None or not any_obj_ts:
            note = (
                "no timestamp filter applied: "
                + ("no ts supplied" if bound is None else "objects carry no created_ts")
                + "; returning current graph"
            )
            return _current_graph(objs, links, role=role, cap=cap, ts=bound, note=note)

        # Objects that existed by `ts` (created_ts <= ts). Objects lacking a
        # created_ts are conservatively treated as always-present so the view is
        # never emptier than reality.
        live_ids: list[str] = []
        for o in objs:
            oid = o.get("id")
            if oid is None:
                continue
            t = obj_ts.get(str(oid))
            if t is None or t <= bound:
                live_ids.append(str(oid))
        live_set = set(live_ids)

        if not links_dateable:
            note = (
                "links carry no timestamps; edges kept whenever both endpoints "
                "existed by ts (objects filtered by created_ts)"
            )

        # Order oldest-first (deterministic) and cap if requested.
        live_ids.sort(key=lambda i: (obj_ts.get(i) if obj_ts.get(i) is not None else -1, i))
        if cap and cap > 0:
            live_ids = live_ids[:cap]
            live_set = set(live_ids)

        # Reuse graph._node_payload (redaction-aware) for node dicts.
        nodes = [_graph._node_payload(nid, role) for nid in live_ids]

        # Keep edges whose both endpoints are live AND whose link ts (explicit or
        # endpoint-derived) is <= ts. Reuse graph._edge_payload for the shape.
        edges: list[dict] = []
        seen: set[tuple] = set()
        for lk in links:
            a, b = str(lk.get("a")), str(lk.get("b"))
            if a not in live_set or b not in live_set:
                continue
            lt = _link_ts(lk, obj_ts)
            if lt is not None and lt > bound:
                continue
            key = (a, b, str(lk.get("relation") or ""))
            if key in seen:
                continue
            seen.add(key)
            edges.append(
                _graph._edge_payload(a, b, float(lk.get("strength") or 1), str(lk.get("relation") or ""))
            )

        return {
            "ts": bound,
            "n_nodes": len(nodes),
            "n_edges": len(edges),
            "nodes": nodes,
            "edges": edges,
            "note": note,
        }
    except Exception:  # noqa: BLE001 - never raise
        return {"ts": _coerce_ts(ts), "n_nodes": 0, "n_edges": 0, "nodes": [], "edges": [], "note": "error"}


def _current_graph(
    objs: list[dict],
    links: list[dict],
    *,
    role: Optional[str],
    cap: int,
    ts: Optional[int],
    note: Optional[str],
) -> dict:
    """The whole current graph (capped), reusing graph.subgraph with empty seeds."""
    try:
        ids = [str(o.get("id")) for o in objs if o.get("id") is not None]
        if cap and cap > 0:
            ids = ids[:cap]
        # graph.subgraph with explicit seeds + depth 0 yields exactly those nodes
        # and the edges among them — full reuse of the existing traversal code.
        res = _graph.subgraph(ids, depth=0, role=role)
        nodes = res.get("nodes", [])
        edges = res.get("edges", [])
        return {
            "ts": ts,
            "n_nodes": len(nodes),
            "n_edges": len(edges),
            "nodes": nodes,
            "edges": edges,
            "note": note,
        }
    except Exception:  # noqa: BLE001
        return {"ts": ts, "n_nodes": 0, "n_edges": 0, "nodes": [], "edges": [], "note": note or "error"}


# ── 2. playback — N snapshots across a time window ──────────────────────────────
def playback(
    frames: int = 24,
    t0: Optional[int] = None,
    t1: Optional[int] = None,
    *,
    role: Optional[str] = None,
    cap: int = _FRAME_NODE_CAP,
) -> dict:
    """Produce ``frames`` evenly-spaced graph snapshots across ``[t0, t1]``.

    Each frame is ``{ts, n_nodes, n_edges, nodes, edges}`` produced by
    :func:`graph_at` so the node count grows monotonically as time advances (a UI
    scrubber animation). ``t0``/``t1`` default to the observed object-timestamp
    window. Node count per frame is capped to ``cap`` (default 200). Never raises.

    Returns ``{frames, t0, t1, has_link_timestamps, note, snapshots:[...]}``.
    """
    try:
        try:
            n = max(1, int(frames))
        except (TypeError, ValueError):
            n = 24
        n = min(n, 240)  # sane upper bound

        objs = _graph._all_objects()
        links = _graph._all_links()
        obj_ts: dict[str, Optional[int]] = {
            str(o.get("id")): _object_ts(o) for o in objs if o.get("id") is not None
        }
        any_obj_ts = any(v is not None for v in obj_ts.values())
        links_dateable = _links_have_timestamps(links, obj_ts)

        bounds = time_bounds()
        lo = _coerce_ts(t0)
        hi = _coerce_ts(t1)
        if lo is None:
            lo = bounds["t0"]
        if hi is None:
            hi = bounds["t1"]

        note: Optional[str]
        if not any_obj_ts or lo is None or hi is None:
            # Without object timestamps every frame is identical (current graph).
            note = "objects carry no created_ts; every frame is the current graph"
            snap = graph_at(None, role=role, cap=cap)
            snapshots = [
                {
                    "ts": snap.get("ts"),
                    "n_nodes": snap["n_nodes"],
                    "n_edges": snap["n_edges"],
                    "nodes": snap["nodes"],
                    "edges": snap["edges"],
                }
                for _ in range(n)
            ]
            return {
                "frames": n,
                "t0": lo,
                "t1": hi,
                "has_link_timestamps": links_dateable,
                "note": note,
                "snapshots": snapshots,
            }

        if hi < lo:
            lo, hi = hi, lo

        # Evenly-spaced inclusive timestamps lo..hi (always includes both ends).
        if n == 1 or hi == lo:
            tss = [hi]
        else:
            span = hi - lo
            tss = [lo + round(i * span / (n - 1)) for i in range(n)]

        note = None
        if not links_dateable:
            note = (
                "links carry no timestamps; per-frame edges kept whenever both "
                "endpoints existed by that frame's ts"
            )

        snapshots: list[dict] = []
        for ts in tss:
            snap = graph_at(int(ts), role=role, cap=cap)
            snapshots.append(
                {
                    "ts": snap.get("ts"),
                    "n_nodes": snap["n_nodes"],
                    "n_edges": snap["n_edges"],
                    "nodes": snap["nodes"],
                    "edges": snap["edges"],
                }
            )

        return {
            "frames": n,
            "t0": lo,
            "t1": hi,
            "has_link_timestamps": links_dateable,
            "note": note,
            "snapshots": snapshots,
        }
    except Exception:  # noqa: BLE001 - never raise
        return {
            "frames": 0,
            "t0": _coerce_ts(t0),
            "t1": _coerce_ts(t1),
            "has_link_timestamps": False,
            "note": "error",
            "snapshots": [],
        }
