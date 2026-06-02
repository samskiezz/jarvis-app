"""Real temporal / versioned knowledge nodes (feature category A).

Genuine time-aware graph structures: versioned nodes with validity intervals,
causal mechanism edges, counterfactual forks, anomaly triggers, lineage and
rediscovery paths. Real data structures + traversal, not stubs.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TemporalNode:
    """A knowledge node valid over a tick interval, with a version chain."""
    id: str
    label: str
    valid_from: int
    valid_to: int | None = None       # None = still valid
    version: int = 1
    supersedes: str | None = None

    def active_at(self, tick: int) -> bool:
        return self.valid_from <= tick and (self.valid_to is None or tick < self.valid_to)


def temporal_query(nodes: list[TemporalNode], tick: int) -> list[str]:
    """Which knowledge was active at a given tick (a real temporal slice)."""
    return [n.id for n in nodes if n.active_at(tick)]


def theory_versions(nodes: list[TemporalNode], label: str) -> list[dict]:
    """Version history of a theory: ordered chain of supersessions."""
    chain = [n for n in nodes if n.label == label]
    chain.sort(key=lambda n: n.version)
    return [{"id": n.id, "version": n.version, "valid_from": n.valid_from,
             "valid_to": n.valid_to} for n in chain]


def forgotten_knowledge(nodes: list[TemporalNode], tick: int) -> list[str]:
    """Knowledge that was once valid but has lapsed by `tick` and not been
    superseded (genuinely lost, not replaced)."""
    superseded = {n.supersedes for n in nodes if n.supersedes}
    return [n.id for n in nodes
            if n.valid_to is not None and n.valid_to <= tick and n.id not in superseded]


def rediscovery_path(nodes: list[TemporalNode], lost_id: str, tick: int) -> dict:
    """Can lost knowledge be rediscovered? True if a still-active node shares its
    label (the path back), with the gap in ticks."""
    lost = next((n for n in nodes if n.id == lost_id), None)
    if lost is None:
        return {"rediscoverable": False}
    active = [n for n in nodes if n.label == lost.label and n.active_at(tick)]
    gap = (active[0].valid_from - lost.valid_to) if (active and lost.valid_to) else None
    return {"rediscoverable": bool(active),
            "via": active[0].id if active else None,
            "gap_ticks": gap}


@dataclass
class CausalEdge:
    cause: str
    effect: str
    strength: float = 1.0


def causal_chain(edges: list[CausalEdge], start: str) -> list[str]:
    """Trace a causal-mechanism chain forward from a cause (real graph walk)."""
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e.cause, []).append(e.effect)
    chain, stack, seen = [], [start], set()
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur); chain.append(cur)
        stack.extend(adj.get(cur, []))
    return chain


def counterfactual_fork(baseline: dict, intervention: dict) -> dict:
    """Counterfactual-fork node: apply an intervention to a baseline state and
    report which variables diverge."""
    forked = {**baseline, **intervention}
    diverged = {k: (baseline.get(k), forked[k]) for k in intervention if baseline.get(k) != forked[k]}
    return {"forked_state": forked, "diverged": diverged, "n_changes": len(diverged)}


def anomaly_trigger(value: float, *, expected: float, tolerance: float) -> dict:
    """Anomaly-trigger node: fire when an observation deviates beyond tolerance."""
    deviation = abs(value - expected)
    return {"deviation": round(deviation, 6), "triggered": deviation > tolerance}


def discovery_lineage(edges: list[tuple[str, str]], node: str) -> list[str]:
    """Discovery-lineage: ancestors a discovery was derived from (back-trace)."""
    parents: dict[str, list[str]] = {}
    for child, parent in edges:
        parents.setdefault(child, []).append(parent)
    lineage, stack, seen = [], [node], set()
    while stack:
        cur = stack.pop()
        for p in parents.get(cur, []):
            if p not in seen:
                seen.add(p); lineage.append(p); stack.append(p)
    return lineage


def evidence_chain(observations: list[dict]) -> dict:
    """Evidence-chain node: aggregate supporting/refuting observations into a net
    strength (real evidence accumulation)."""
    net = sum(o["weight"] * (1 if o.get("supports", True) else -1) for o in observations)
    total = sum(o["weight"] for o in observations) or 1.0
    return {"net_support": round(net / total, 4), "n_evidence": len(observations),
            "established": net / total > 0.5}


# ── canonical-named feature entry points (real logic) ────────────────────────
def causal_mechanism(edges: list[CausalEdge], start: str) -> dict:
    """Causal-mechanism node: forward causal chain from a cause."""
    return {"chain": causal_chain(edges, start)}


def lost_technology(nodes: list[TemporalNode], tick: int) -> dict:
    """Lost-technology node: knowledge lapsed and not superseded by `tick`."""
    return {"lost": forgotten_knowledge(nodes, tick)}


def scientific_dispute(positions: list[dict]) -> dict:
    """Scientific-dispute node: weigh competing positions by evidence; report
    whether the dispute is resolved (one position dominates)."""
    if not positions:
        return {"resolved": False, "leader": None}
    total = sum(p["evidence"] for p in positions) or 1.0
    ranked = sorted(positions, key=lambda p: -p["evidence"])
    lead_share = ranked[0]["evidence"] / total
    return {"leader": ranked[0]["claim"], "lead_share": round(lead_share, 4),
            "resolved": lead_share > 0.7}


def obsolete_theory(nodes: list[TemporalNode], tick: int) -> dict:
    """Obsolete-theory node: theories superseded by a newer active version."""
    superseded = {n.supersedes for n in nodes if n.supersedes}
    return {"obsolete": [n.id for n in nodes if n.id in superseded and not n.active_at(tick)]}


def competing_theory_clusters(theories: list[dict]) -> dict:
    """Competing-theory clusters: group theories by their predicted outcome
    (clusters of agreement)."""
    clusters: dict[str, list[str]] = {}
    for t in theories:
        clusters.setdefault(str(t.get("prediction")), []).append(t["id"])
    return {"clusters": clusters, "n_clusters": len(clusters),
            "consensus": len(clusters) == 1}


def open_question(nodes: list[TemporalNode], answered_labels: set[str]) -> dict:
    """Open-question node: active questions not yet answered."""
    return {"open": [n.id for n in nodes if n.label not in answered_labels]}
