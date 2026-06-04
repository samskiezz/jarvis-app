"""LINK-ANALYSIS graph service — interactive Gotham-style graph over the ontology.

Pure-python (numpy optional) graph analytics built on top of the live ontology
object/link model (:mod:`server.services.ontology_store`). Where the store isn't
importable (e.g. a stripped/test environment), it falls back to the static
``OBJECTS``/``LINKS`` seed shipped in ``server/data/ontology.py``.

Capabilities (all click-to-explore friendly, all undirected over the link set):

  * :func:`subgraph`      — BFS expand from a set of seed ids to ``depth`` hops.
  * :func:`expand`        — the immediate neighborhood of one node (click-expand).
  * :func:`shortest_path` — Dijkstra over links weighted by ``1/strength``.
  * :func:`all_paths`     — every simple path between two nodes up to ``max_len``.
  * :func:`centrality`    — degree centrality, upgraded to PageRank via the
                            underworld bridge when that platform is importable.
  * :func:`communities`   — connected components (a deterministic partition that
                            also seeds a stable label-propagation refinement).

Doctrine (matching the rest of the backend):
  * stdlib + optional numpy only;
  * NEVER raise — every public function degrades to a safe empty/zero value;
  * graceful when the bridge / security module is absent;
  * security redaction (:mod:`server.services.security`) applied per role when
    importable, so classified props never leak through the graph API.
"""

from __future__ import annotations

import heapq
from typing import Any, Iterable, Optional

# ── optional dependencies (all best-effort) ───────────────────────────────────
try:  # the live, persistent ontology store
    from . import ontology_store as _store  # type: ignore
except Exception:  # noqa: BLE001 - degrade to the static seed
    _store = None

try:  # per-role redaction of object props
    from . import security as _security  # type: ignore
except Exception:  # noqa: BLE001
    _security = None

try:  # underworld PageRank / graph analytics
    from . import underworld_bridge as _bridge  # type: ignore
except Exception:  # noqa: BLE001
    _bridge = None


# ── data access — store first, static seed fallback ───────────────────────────
def _static_objects() -> list[dict]:
    try:
        from ..data.ontology import OBJECTS, RISK_SIGNALS

        objs = [dict(o) for o in OBJECTS]
        for r in RISK_SIGNALS:
            objs.append(
                {
                    "id": str(r.get("id")),
                    "label": str(r.get("title") or r.get("id")),
                    "type": "risk",
                    "mark": "INTERNAL",
                    "props": {k: v for k, v in r.items() if k not in ("id", "title", "linked")},
                }
            )
        return objs
    except Exception:  # noqa: BLE001
        return []


def _static_links() -> list[dict]:
    try:
        from ..data.ontology import LINKS, RISK_SIGNALS

        out: list[dict] = []
        for lk in LINKS:
            out.append(
                {
                    "a": str(lk.get("a")),
                    "b": str(lk.get("b")),
                    "relation": str(lk.get("label") or lk.get("relation") or ""),
                    "strength": float(lk.get("strength") or 1),
                }
            )
        for r in RISK_SIGNALS:
            linked = r.get("linked")
            if linked:
                out.append(
                    {
                        "a": str(r.get("id")),
                        "b": str(linked),
                        "relation": "RISK_TO",
                        "strength": float(r.get("severity", 0)) / 100.0,
                    }
                )
        return out
    except Exception:  # noqa: BLE001
        return []


def _all_objects() -> list[dict]:
    """Every object as a plain dict, from the store if importable else the seed."""
    if _store is not None:
        try:
            objs = _store.query_objects()
            if objs:
                return objs
        except Exception:  # noqa: BLE001
            pass
    return _static_objects()


def _all_links() -> list[dict]:
    """Every link as a normalised ``{a, b, relation, strength}`` dict."""
    if _store is not None:
        try:
            objs = _store.query_objects()
            ids = [o.get("id") for o in objs]
            seen: set[str] = set()
            out: list[dict] = []
            for oid in ids:
                for lk in _store.links_for(oid):
                    lid = lk.get("id") or f"{lk.get('a')}|{lk.get('b')}|{lk.get('relation')}"
                    if lid in seen:
                        continue
                    seen.add(lid)
                    out.append(
                        {
                            "a": str(lk.get("a")),
                            "b": str(lk.get("b")),
                            "relation": str(lk.get("relation") or ""),
                            "strength": float(lk.get("strength") or 1),
                        }
                    )
            if out or objs:
                return out
        except Exception:  # noqa: BLE001
            pass
    return _static_links()


def _get_object(node_id: str) -> Optional[dict]:
    if _store is not None:
        try:
            o = _store.get_object(node_id)
            if o is not None:
                return o
        except Exception:  # noqa: BLE001
            pass
    for o in _static_objects():
        if str(o.get("id")) == str(node_id):
            return o
    return None


# ── adjacency (undirected, strength-weighted) ─────────────────────────────────
def _adjacency(links: Optional[list[dict]] = None) -> dict[str, list[tuple[str, float, str]]]:
    """Undirected adjacency: ``{node: [(neighbor, strength, relation), ...]}``."""
    links = links if links is not None else _all_links()
    adj: dict[str, list[tuple[str, float, str]]] = {}
    for lk in links:
        a, b = str(lk.get("a")), str(lk.get("b"))
        if not a or not b:
            continue
        s = float(lk.get("strength") or 1) or 1.0
        rel = str(lk.get("relation") or "")
        adj.setdefault(a, []).append((b, s, rel))
        adj.setdefault(b, []).append((a, s, rel))
    return adj


def _node_payload(node_id: str, role: Optional[str]) -> dict:
    """A graph node dict for the UI, redacted per ``role`` when security is on."""
    obj = _get_object(node_id)
    if obj is None:
        return {"id": str(node_id), "label": str(node_id), "type": "unknown"}
    if _security is not None and role is not None:
        try:
            obj = _security.redact(obj, role)
        except Exception:  # noqa: BLE001
            pass
    return {
        "id": obj.get("id", node_id),
        "label": obj.get("label", node_id),
        "type": obj.get("type", "object"),
        "mark": obj.get("mark"),
        "props": obj.get("props", {}),
        "redacted": obj.get("redacted", False),
    }


def _edge_payload(a: str, b: str, strength: float, relation: str) -> dict:
    return {"a": str(a), "b": str(b), "strength": float(strength), "relation": relation}


def _edges_within(node_ids: set[str], links: list[dict]) -> list[dict]:
    """Every link whose both endpoints are inside ``node_ids`` (deduped)."""
    out: list[dict] = []
    seen: set[tuple] = set()
    for lk in links:
        a, b = str(lk.get("a")), str(lk.get("b"))
        if a in node_ids and b in node_ids:
            key = (a, b, str(lk.get("relation") or ""))
            if key in seen:
                continue
            seen.add(key)
            out.append(_edge_payload(a, b, float(lk.get("strength") or 1), str(lk.get("relation") or "")))
    return out


# ── 1. subgraph (BFS expand from seeds) ───────────────────────────────────────
def subgraph(seed_ids: Iterable[str], depth: int = 1, *, role: Optional[str] = None) -> dict:
    """BFS-expand a neighborhood from ``seed_ids`` out to ``depth`` hops.

    Returns ``{"nodes": [...], "edges": [...]}`` — the reachable nodes (including
    the seeds) and every link interconnecting them. Never raises.
    """
    try:
        if isinstance(seed_ids, str):
            seeds = [seed_ids]
        else:
            seeds = [str(s) for s in (seed_ids or []) if s is not None and str(s) != ""]
        try:
            depth = max(0, int(depth))
        except (TypeError, ValueError):
            depth = 1

        links = _all_links()
        adj = _adjacency(links)

        visited: set[str] = set(seeds)
        frontier = list(seeds)
        for _ in range(depth):
            nxt: list[str] = []
            for node in frontier:
                for neighbor, _s, _r in adj.get(node, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        nxt.append(neighbor)
            frontier = nxt
            if not frontier:
                break

        nodes = [_node_payload(nid, role) for nid in visited]
        edges = _edges_within(visited, links)
        return {"nodes": nodes, "edges": edges}
    except Exception:  # noqa: BLE001 - never raise
        return {"nodes": [], "edges": []}


# ── 2. expand (immediate neighbors — click-to-expand) ─────────────────────────
def expand(node_id: str, *, role: Optional[str] = None) -> dict:
    """Return the immediate (1-hop) neighborhood of ``node_id`` for click-expand.

    ``{"nodes": [center + neighbors], "edges": [incident links]}``. Never raises.
    """
    try:
        node_id = str(node_id)
        links = _all_links()
        adj = _adjacency(links)
        ids: set[str] = {node_id}
        for neighbor, _s, _r in adj.get(node_id, []):
            ids.add(neighbor)
        nodes = [_node_payload(nid, role) for nid in ids]
        edges = _edges_within(ids, links)
        # only keep edges touching the center so the response is the local star
        edges = [e for e in edges if e["a"] == node_id or e["b"] == node_id]
        return {"nodes": nodes, "edges": edges}
    except Exception:  # noqa: BLE001
        return {"nodes": [], "edges": []}


# ── 3. shortest_path (Dijkstra over 1/strength) ───────────────────────────────
def shortest_path(a: str, b: str, *, role: Optional[str] = None) -> dict:
    """Lowest-cost path between ``a`` and ``b`` over links, weighted by strength.

    Edge cost is ``1 / strength`` so stronger relations are preferred. Returns
    ``{"path": [ids], "edges": [...]}`` — empty ``path`` if no route. Never raises.
    """
    try:
        a, b = str(a), str(b)
        links = _all_links()
        adj = _adjacency(links)
        if a not in adj and a != b:
            return {"path": [], "edges": []}
        if a == b:
            return {"path": [a] if _get_object(a) else [], "edges": []}

        # Dijkstra.
        dist: dict[str, float] = {a: 0.0}
        prev: dict[str, str] = {}
        pq: list[tuple[float, str]] = [(0.0, a)]
        done: set[str] = set()
        while pq:
            d, node = heapq.heappop(pq)
            if node in done:
                continue
            done.add(node)
            if node == b:
                break
            for neighbor, strength, _rel in adj.get(node, []):
                cost = 1.0 / (float(strength) or 1.0)
                nd = d + cost
                if neighbor not in dist or nd < dist[neighbor]:
                    dist[neighbor] = nd
                    prev[neighbor] = node
                    heapq.heappush(pq, (nd, neighbor))

        if b not in dist:
            return {"path": [], "edges": []}

        # reconstruct
        path = [b]
        while path[-1] != a:
            path.append(prev[path[-1]])
        path.reverse()
        edges = _path_edges(path, links)
        return {"path": path, "edges": edges}
    except Exception:  # noqa: BLE001
        return {"path": [], "edges": []}


def _path_edges(path: list[str], links: list[dict]) -> list[dict]:
    """The actual links connecting consecutive nodes in ``path`` (best strength)."""
    out: list[dict] = []
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        best = None
        for lk in links:
            la, lb = str(lk.get("a")), str(lk.get("b"))
            if {la, lb} == {u, v}:
                s = float(lk.get("strength") or 1)
                if best is None or s > best[0]:
                    best = (s, str(lk.get("relation") or ""))
        if best is not None:
            out.append(_edge_payload(u, v, best[0], best[1]))
        else:
            out.append(_edge_payload(u, v, 1.0, ""))
    return out


# ── 4. all_paths (bounded simple-path enumeration) ────────────────────────────
def all_paths(a: str, b: str, max_len: int = 4) -> list[list[str]]:
    """Every simple path between ``a`` and ``b`` with at most ``max_len`` edges.

    Returns a list of id-lists, shortest first. Never raises.
    """
    try:
        a, b = str(a), str(b)
        try:
            max_len = max(1, int(max_len))
        except (TypeError, ValueError):
            max_len = 4
        adj = _adjacency()
        if a not in adj:
            return [[a]] if a == b else []
        results: list[list[str]] = []

        def _dfs(node: str, path: list[str], visited: set[str]) -> None:
            if node == b:
                results.append(list(path))
                return
            if len(path) - 1 >= max_len:
                return
            for neighbor, _s, _r in adj.get(node, []):
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                path.append(neighbor)
                _dfs(neighbor, path, visited)
                path.pop()
                visited.discard(neighbor)

        if a == b:
            return [[a]]
        _dfs(a, [a], {a})
        results.sort(key=len)
        return results
    except Exception:  # noqa: BLE001
        return []


# ── 5. centrality (degree, PageRank via bridge when available) ────────────────
def centrality() -> dict:
    """Per-node centrality score.

    Tries the underworld PageRank bridge first; on any failure (bridge missing /
    unavailable / error) falls back to normalised degree centrality. Returns
    ``{id: score}`` for every node. Never raises.
    """
    try:
        objs = _all_objects()
        links = _all_links()
        ids = [str(o.get("id")) for o in objs]
        if not ids:
            # derive ids from links if the object table is empty
            id_set: set[str] = set()
            for lk in links:
                id_set.add(str(lk.get("a")))
                id_set.add(str(lk.get("b")))
            ids = sorted(id_set)
        if not ids:
            return {}

        # 1) try the underworld pagerank bridge
        pr = _pagerank_via_bridge(objs or [{"id": i} for i in ids], links)
        if pr:
            # ensure every node has a score
            for i in ids:
                pr.setdefault(i, 0.0)
            return pr

        # 2) fallback: degree centrality, normalised by (n-1)
        adj = _adjacency(links)
        n = len(ids)
        denom = float(n - 1) if n > 1 else 1.0
        return {i: round(len(adj.get(i, [])) / denom, 6) for i in ids}
    except Exception:  # noqa: BLE001
        return {}


def _pagerank_via_bridge(objs: list[dict], links: list[dict]) -> dict:
    """Best-effort PageRank using the underworld bridge. ``{}`` on any failure."""
    if _bridge is None:
        return {}
    try:
        if not _bridge.available():
            return {}
        bridge_objs = [{"id": str(o.get("id")), "label": str(o.get("label", o.get("id")))} for o in objs]
        bridge_links = [
            {"src": str(lk.get("a")), "dst": str(lk.get("b")), "weight": float(lk.get("strength") or 1)}
            for lk in links
        ]
        res = _bridge.graph_analytics(bridge_objs, bridge_links)
        if isinstance(res, dict) and res.get("status") == "ok":
            pr = res.get("pagerank") or {}
            if isinstance(pr, dict) and pr:
                return {str(k): round(float(v), 6) for k, v in pr.items()}
        return {}
    except Exception:  # noqa: BLE001
        return {}


# ── 6. communities (connected components + label propagation refinement) ──────
def communities() -> dict:
    """Partition the graph into communities.

    Starts from connected components (each gets a stable integer label), then runs
    a few rounds of synchronous label propagation so densely-linked sub-clusters
    inside a component can split off. Returns ``{id: cluster}``. Never raises.
    """
    try:
        objs = _all_objects()
        links = _all_links()
        ids = [str(o.get("id")) for o in objs]
        id_set = set(ids)
        for lk in links:
            id_set.add(str(lk.get("a")))
            id_set.add(str(lk.get("b")))
        nodes = sorted(id_set)
        if not nodes:
            return {}

        adj = _adjacency(links)

        # connected components via BFS — deterministic component labels.
        comp: dict[str, int] = {}
        cid = 0
        for start in nodes:
            if start in comp:
                continue
            comp[start] = cid
            queue = [start]
            while queue:
                node = queue.pop()
                for neighbor, _s, _r in adj.get(node, []):
                    if neighbor not in comp:
                        comp[neighbor] = cid
                        queue.append(neighbor)
            cid += 1

        # label-propagation refinement seeded by each node's own index, but only
        # within its connected component (labels never cross components, so the
        # partition stays at least as fine as the components).
        index = {nid: i for i, nid in enumerate(nodes)}
        label = dict(index)
        for _ in range(5):
            changed = False
            for node in nodes:
                neigh = adj.get(node, [])
                if not neigh:
                    continue
                # weighted vote across neighbor labels
                votes: dict[int, float] = {}
                for neighbor, strength, _r in neigh:
                    votes[label[neighbor]] = votes.get(label[neighbor], 0.0) + float(strength or 1)
                # pick the highest vote, tie-broken by lowest label for stability
                best_label = min(votes, key=lambda lab: (-votes[lab], lab))
                if best_label != label[node]:
                    label[node] = best_label
                    changed = True
            if not changed:
                break

        # combine component id (coarse) with propagated label (fine), then
        # renumber to dense 0..k-1 ids for a clean partition.
        combined = {nid: (comp[nid], label[nid]) for nid in nodes}
        remap: dict[tuple, int] = {}
        out: dict[str, int] = {}
        for nid in nodes:
            key = combined[nid]
            if key not in remap:
                remap[key] = len(remap)
            out[nid] = remap[key]
        return out
    except Exception:  # noqa: BLE001
        return {}
