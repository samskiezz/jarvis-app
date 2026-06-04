"""Bridge from the APEX backend to the WHOLE underworld platform.

Where :mod:`server.services.science_bridge` exposes only the 449-method science
registry, this module reaches the *rest* of the underworld platform in-process:

  * the civilisation **knowledge graph** + graph analytics (PageRank influence,
    prerequisite reasoning, novelty scoring, shortest path),
  * the hybrid **world model** counterfactual engine,
  * the real Bayesian **optimizer** over benchmark objectives (Branin/Hartmann),
  * the **temporal knowledge graph** (time-slice queries + causal chains),
  * a best-effort **world summary** if a shared underworld DB/api is reachable.

Design rules (identical contract to science_bridge):
  * Every underworld import is best-effort and isolated in a try/except. If it
    fails, APEX must still boot and its tests must still pass — so every public
    wrapper degrades to ``{"status": "unavailable", "reason": ...}`` instead of
    raising.
  * The wrappers NEVER raise. Any runtime failure becomes
    ``{"status": "error", "reason": ...}``.
"""
from __future__ import annotations

from typing import Any

# ── Best-effort import of the underworld platform modules ────────────────────
# A single try/except: if any of these are missing the whole bridge degrades
# gracefully rather than half-importing.
_IMPORT_ERROR: str | None = None
try:  # pragma: no cover - exercised both ways across environments
    import numpy as _np
    from underworld.server.services import knowledge_graph as _kg
    from underworld.server.services import graph_extras as _gx
    from underworld.server.services import world_model as _wm
    from underworld.server.services import real_optimizer as _opt
    from underworld.server.services import temporal_nodes as _tn
except Exception as exc:  # noqa: BLE001 - any failure must degrade, not raise
    _np = None
    _kg = None
    _gx = None
    _wm = None
    _opt = None
    _tn = None
    _IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


def available() -> bool:
    """True when the underworld platform modules imported successfully."""
    return _kg is not None and _opt is not None and _tn is not None and _wm is not None


def _unavailable() -> dict:
    out: dict[str, Any] = {
        "status": "unavailable",
        "reason": "underworld platform not importable in this process",
    }
    if _IMPORT_ERROR:
        out["detail"] = _IMPORT_ERROR
    return out


def _error(exc: Exception) -> dict:
    return {"status": "error", "reason": f"{type(exc).__name__}: {exc}"}


# ── 1. Graph analytics ───────────────────────────────────────────────────────
def graph_analytics(objects: list[dict] | None, links: list[dict] | None) -> dict:
    """Run knowledge-graph + graph-analytics reasoning on a supplied small graph.

    ``objects``: ``[{"id", "kind"?, "label"?, "confidence"?}, ...]`` — nodes.
    ``links``:   ``[{"src", "dst", "kind"?, "weight"?}, ...]`` — typed edges.

    Returns (all on the supplied graph, nothing invented):
      * ``pagerank``        — citation-style influence (graph_extras.citation_graph),
      * ``most_influential``— the highest-ranked node,
      * ``prerequisites``   — transitive REQUIRES closure per node,
      * ``novelty``         — novelty score of combining every leaf node,
      * ``shortest_path``   — BFS hop path between the first and last node,
      * ``validation_breakdown`` / ``real_fraction`` — epistemic health.
    """
    if not available():
        return _unavailable()
    try:
        objects = objects or []
        links = links or []

        g = _kg.KnowledgeGraph()

        def _kind(raw: str | None, default):
            if raw is None:
                return default
            try:
                return _kg.NodeKind(str(raw))
            except Exception:  # noqa: BLE001 - unknown label -> default kind
                return default

        def _edge_kind(raw: str | None):
            if raw is None:
                return _kg.EdgeKind.REQUIRES
            try:
                return _kg.EdgeKind(str(raw))
            except Exception:  # noqa: BLE001
                return _kg.EdgeKind.REQUIRES

        def _conf(raw: str | None):
            if raw is None:
                return _kg.ConfidenceClass.B_LITERATURE
            try:
                return _kg.ConfidenceClass(str(raw))
            except Exception:  # noqa: BLE001
                return _kg.ConfidenceClass.B_LITERATURE

        for o in objects:
            nid = str(o.get("id"))
            g.add_node(_kg.Node(
                id=nid,
                kind=_kind(o.get("kind"), _kg.NodeKind.PRINCIPLE),
                label=str(o.get("label", nid)),
                confidence=_conf(o.get("confidence")),
                source=str(o.get("source", "supplied")),
            ))

        citations: list[tuple[str, str]] = []
        for e in links:
            src, dst = str(e.get("src")), str(e.get("dst"))
            g.add_edge(_kg.Edge(src=src, dst=dst, kind=_edge_kind(e.get("kind")),
                                weight=float(e.get("weight", 1.0))))
            citations.append((src, dst))

        # PageRank-style influence over the directed edge set.
        pr = _gx.citation_graph(citations) if citations else {"influence": {}, "most_influential": None}

        # Prerequisite closure per node (REQUIRES edges only).
        prereqs = {n.id: sorted(g.prerequisites(n.id)) for n in [g.node(str(o.get("id"))) for o in objects] if n}

        # Novelty of combining the leaf nodes (nodes that nothing requires further
        # is overkill — just use all supplied node ids as the candidate combo).
        node_ids = [str(o.get("id")) for o in objects]
        novelty = g.novelty(node_ids) if node_ids else {"novelty": 0.0}

        # Shortest hop path between first and last node over the directed graph.
        shortest = None
        if len(node_ids) >= 2:
            shortest = _bfs_path(links, node_ids[0], node_ids[-1])

        return {
            "status": "ok",
            "n_nodes": len(g),
            "n_edges": len(links),
            "pagerank": pr.get("influence", {}),
            "most_influential": pr.get("most_influential"),
            "prerequisites": prereqs,
            "novelty": novelty,
            "shortest_path": shortest,
            "validation_breakdown": g.validation_breakdown(),
            "real_fraction": g.real_fraction(),
        }
    except Exception as exc:  # noqa: BLE001 - bridge must never raise
        return _error(exc)


def _bfs_path(links: list[dict], start: str, goal: str) -> list[str] | None:
    """Plain BFS shortest hop path over the directed edge list."""
    adj: dict[str, list[str]] = {}
    for e in links:
        adj.setdefault(str(e.get("src")), []).append(str(e.get("dst")))
    if start == goal:
        return [start]
    seen = {start}
    queue: list[list[str]] = [[start]]
    while queue:
        path = queue.pop(0)
        for nxt in adj.get(path[-1], []):
            if nxt in seen:
                continue
            if nxt == goal:
                return path + [nxt]
            seen.add(nxt)
            queue.append(path + [nxt])
    return None


# ── 2. Counterfactual (world model) ──────────────────────────────────────────
def counterfactual(baseline: dict | None, intervention: dict | None,
                   label: str = "intervention") -> dict:
    """Compare a forked timeline against a baseline across the world-model metrics.

    ``baseline`` / ``intervention`` are end-state metric snapshots (e.g.
    ``{"population": 120, "knowledge": 0.4, "war_risk": 0.2}``). Delegates to
    :func:`world_model.counterfactual`.
    """
    if not available():
        return _unavailable()
    try:
        res = _wm.counterfactual(baseline or {}, intervention or {}, label=label)
        return {
            "status": "ok",
            "intervention": res.intervention,
            "baseline": res.baseline,
            "forked": res.forked,
            "divergence": res.divergence,
            "summary": res.summary,
        }
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 3. Optimizer (real Bayesian optimization) ────────────────────────────────
def optimize(objective_name: str = "branin", bounds: list | None = None,
             n_iter: int = 25, *, seed: int = 0) -> dict:
    """Run real Bayesian optimization on a named benchmark objective.

    ``objective_name`` is one of the published-optimum benchmarks (``branin``,
    ``hartmann6``, ``ackley5``) so the result is demoable + externally checkable.
    ``bounds`` overrides the benchmark's default search box if supplied (a list
    of ``[lo, hi]`` pairs). Returns the best value found and the regret against
    the published global optimum.
    """
    if not available():
        return _unavailable()
    try:
        name = (objective_name or "branin").lower()
        bench = _opt.BENCHMARKS.get(name)
        if bench is None:
            return {
                "status": "error",
                "reason": f"unknown objective {objective_name!r}",
                "available": sorted(_opt.BENCHMARKS),
            }
        box = _np.array(bounds, dtype=float) if bounds is not None else bench.bounds
        res = _opt.bayes_optimize(
            bench.fn, box, n_iter=max(1, int(n_iter)),
            optimum=bench.optimum, seed=int(seed),
        )
        return {
            "status": "ok",
            "objective": name,
            "dim": bench.dim,
            "published_optimum": bench.optimum,
            "best_value": round(float(res.best_y), 6),
            "best_x": [round(float(v), 6) for v in res.best_x],
            "regret": round(float(res.regret), 6),
            "n_eval": res.n_eval,
            "converged": bool(res.converged),
        }
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


# ── 4. Temporal knowledge graph ──────────────────────────────────────────────
def temporal_query(nodes: list[dict] | None, tick: int) -> dict:
    """Which knowledge nodes were active at ``tick`` (a real temporal slice).

    ``nodes``: ``[{"id", "label"?, "valid_from", "valid_to"?, "version"?,
    "supersedes"?}, ...]``.
    """
    if not available():
        return _unavailable()
    try:
        tnodes = [_to_temporal_node(n) for n in (nodes or [])]
        active = _tn.temporal_query(tnodes, int(tick))
        forgotten = _tn.forgotten_knowledge(tnodes, int(tick))
        return {
            "status": "ok",
            "tick": int(tick),
            "active": active,
            "n_active": len(active),
            "forgotten": forgotten,
        }
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


def causal_chain(edges: list[dict] | None, start: str) -> dict:
    """Trace a causal-mechanism chain forward from a cause (real graph walk).

    ``edges``: ``[{"cause", "effect", "strength"?}, ...]``.
    """
    if not available():
        return _unavailable()
    try:
        cedges = [
            _tn.CausalEdge(
                cause=str(e.get("cause")),
                effect=str(e.get("effect")),
                strength=float(e.get("strength", 1.0)),
            )
            for e in (edges or [])
        ]
        chain = _tn.causal_chain(cedges, str(start))
        return {"status": "ok", "start": str(start), "chain": chain, "length": len(chain)}
    except Exception as exc:  # noqa: BLE001
        return _error(exc)


def _to_temporal_node(n: dict):
    return _tn.TemporalNode(
        id=str(n.get("id")),
        label=str(n.get("label", n.get("id"))),
        valid_from=int(n.get("valid_from", 0)),
        valid_to=(int(n["valid_to"]) if n.get("valid_to") is not None else None),
        version=int(n.get("version", 1)),
        supersedes=(str(n["supersedes"]) if n.get("supersedes") is not None else None),
    )


# ── 5. World summary (shared underworld DB/api, if reachable) ─────────────────
def world_summary() -> dict:
    """Summarize the shared underworld platform if a DB/api is reachable.

    APEX and underworld run as two separate backends (see
    docs/RUN_BOTH_BACKENDS.md). There is no shared in-process DB session here, so
    unless an underworld DB is configured and reachable this returns the graceful
    ``unavailable`` shape. When the platform modules import we still report what
    capabilities are wired so callers can introspect the bridge.
    """
    if not available():
        return _unavailable()
    try:
        return {
            "status": "ok",
            "reachable": False,
            "reason": "no shared underworld DB session in the APEX process; "
                      "run the underworld backend separately (see "
                      "docs/RUN_BOTH_BACKENDS.md)",
            "capabilities": {
                "graph_analytics": True,
                "counterfactual": True,
                "optimize": True,
                "temporal_query": True,
                "causal_chain": True,
                "benchmarks": sorted(_opt.BENCHMARKS),
            },
        }
    except Exception as exc:  # noqa: BLE001
        return _error(exc)
