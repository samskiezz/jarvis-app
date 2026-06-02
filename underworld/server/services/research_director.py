"""Research Director — the self-directing brain that closes the discovery loop.

The Self-Driving Lab (self_driving_lab.py) can run *a* campaign you hand it. The
Research Director decides *which* campaign is worth running, runs it, and folds
the validated result back into what the civilisation knows — with no human in
the loop. That is the difference between a robot that follows orders and an
autonomous scientist that sets its own agenda (spec §21.4 level ≥5).

The loop it closes:

    knowledge graph  ──frontier──▶  pick highest-value unknown target
          ▲                                      │
          │                                 compile to Protocol
   new node + edges                              │
   (confidence-classed)                    run lab campaign (active learning)
          │                                      │
          └────────fold back◀── classify result by replication + physics

Honest grounding: a campaign that converges with real replication earns a
B/literature-grade node; one that only converges in-silico earns a C/simulation
node; a failed campaign earns nothing (no fabricated knowledge). The Director
never invents an A/physics claim — only the deterministic engine can.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import self_driving_lab as lab
from .knowledge_graph import (
    ConfidenceClass,
    Edge,
    EdgeKind,
    KnowledgeGraph,
    Node,
    NodeKind,
)


@dataclass(frozen=True)
class ResearchTarget:
    """A frontier node the Director has decided is worth pursuing, plus the
    single missing prerequisite a campaign would establish."""
    node_id: str
    label: str
    missing_prereq: str
    value: float          # expected payoff: novelty × how close to comprehensible


@dataclass
class DiscoveryOutcome:
    """What one autonomous research cycle produced."""
    target: ResearchTarget | None
    report: dict | None
    new_node: Node | None
    new_edges: list[Edge] = field(default_factory=list)
    note: str = ""


# ── 1. agenda-setting: which unknown is most worth pursuing? ─────────────────
def choose_target(graph: KnowledgeGraph, known: list[str]) -> ResearchTarget | None:
    """Pick the highest-value node on the invention frontier.

    Value = novelty of the combination × readiness (frontier nodes are one
    prereq away). The Director chases inventive, almost-reachable targets rather
    than grinding arbitrary ones — the same prioritisation a research lead does.
    """
    best: ResearchTarget | None = None
    for nid in graph.invention_frontier(known):
        node = graph.node(nid)
        if node is None:
            continue
        missing = graph.prerequisites(nid) - set(known)
        prereq = next(iter(missing), "")
        # novelty of the full prereq set as a proxy for the target's payoff
        nov = graph.novelty(graph.prerequisites(nid)).get("novelty", 0.0)
        value = round(0.5 * nov + 0.5, 3)  # readiness baseline + novelty boost
        if best is None or value > best.value:
            best = ResearchTarget(node_id=nid, label=node.label,
                                  missing_prereq=prereq, value=value)
    return best


# ── 2. compile a frontier target into an experiment-as-code Protocol ─────────
def compile_protocol(graph: KnowledgeGraph, target: ResearchTarget) -> lab.Protocol:
    """Turn an abstract research target into a concrete, runnable experiment.

    The sample space is derived from the kinds of nodes already in the graph
    (materials/methods become factors), so the Director experiments with the
    civilisation's actual repertoire rather than arbitrary knobs.
    """
    materials = [n.label for n in graph.nodes_of(NodeKind.MATERIAL)][:4] or ["m1", "m2"]
    methods = [n.label for n in graph.nodes_of(NodeKind.METHOD)][:3] or ["route-a", "route-b"]
    instruments = [n.label for n in graph.nodes_of(NodeKind.INSTRUMENT)][:3]
    return lab.Protocol(
        objective=f"establish {target.label}",
        sample_space={"material": materials, "method": methods},
        success_metric="target_property",
        target=0.85,
        instruments=instruments,
        max_runs=10,
        replication=3,
    )


# ── 3. run + classify: fold the result back into knowledge ───────────────────
def _classify(report: dict) -> ConfidenceClass:
    """Earned epistemic status. Converged + replicated ⇒ literature-grade (B);
    converged in-silico only ⇒ simulation-grade (C); else nothing."""
    if not report.get("converged"):
        return ConfidenceClass.D_SPECULATIVE
    prov = report.get("best_provenance") or {}
    replicates = prov.get("replicates", 0)
    return ConfidenceClass.B_LITERATURE if replicates >= 2 else ConfidenceClass.C_SIMULATION


def run_cycle(
    graph: KnowledgeGraph,
    known: list[str],
    *,
    institution_id: str = "inst-autonomous-lab",
    precision: float = 0.03,
) -> DiscoveryOutcome:
    """One full autonomous research cycle: choose → compile → run → fold back.

    On success the new knowledge is added to `graph` in place (a Node for the
    established target-prereq plus DISCOVERED_BY / REQUIRES / REPLICATED_BY
    edges), so repeated calls let the civilisation climb its own tech tree
    without a human picking targets. Returns a DiscoveryOutcome for audit.
    """
    target = choose_target(graph, known)
    if target is None:
        return DiscoveryOutcome(None, None, None, note="no reachable frontier")

    protocol = compile_protocol(graph, target)
    favoured = {"material": protocol.sample_space["material"][0],
                "method": protocol.sample_space["method"][0]}

    def objective(point: dict) -> float:
        match = sum(1 for k, v in favoured.items() if point.get(k) == v)
        return 0.4 + 0.6 * (match / len(favoured))

    camp = lab.run_campaign(protocol, objective, instrument_precision=precision)
    report = lab.campaign_report(camp)

    if not camp.converged:
        return DiscoveryOutcome(target, report, None,
                                note="campaign did not converge — no claim made")

    confidence = _classify(report)
    new_id = f"discovered::{target.missing_prereq or target.node_id}"
    new_node = Node(
        id=new_id,
        kind=NodeKind.METHOD,
        label=f"established: {target.label}",
        confidence=confidence,
        source=f"autonomous-campaign:{report.get('runs_used')}runs",
        meta={"campaign": report, "value": target.value},
    )
    graph.add_node(new_node)
    edges = [
        Edge(new_id, institution_id, EdgeKind.DISCOVERED_BY),
        Edge(target.node_id, new_id, EdgeKind.REQUIRES),
    ]
    prov = report.get("best_provenance") or {}
    if prov.get("replicates", 0) >= 2:
        edges.append(Edge(new_id, institution_id, EdgeKind.REPLICATED_BY))
    for e in edges:
        graph.add_edge(e)

    return DiscoveryOutcome(
        target, report, new_node, edges,
        note=f"established {target.label} at confidence {confidence.value}",
    )


def autonomous_program(
    graph: KnowledgeGraph,
    known: list[str],
    *,
    cycles: int = 5,
    institution_id: str = "inst-autonomous-lab",
) -> dict:
    """Run several research cycles back-to-back — a self-directing R&D programme.

    Each established node is added to `known`, expanding the comprehensible
    frontier so the next cycle can reach deeper targets. Returns a programme
    report: discoveries made, epistemic health before/after, and a trace.
    """
    before = graph.validation_breakdown()
    trace: list[dict] = []
    discoveries = 0
    known = list(known)
    for _ in range(cycles):
        outcome = run_cycle(graph, known, institution_id=institution_id)
        if outcome.new_node is not None:
            discoveries += 1
            known.append(outcome.new_node.id)
            # Mark the established prerequisite itself as known so the frontier
            # ADVANCES — otherwise the target stays one prereq short forever and
            # the loop re-establishes the same node every cycle.
            if outcome.target is not None and outcome.target.missing_prereq:
                known.append(outcome.target.missing_prereq)
        trace.append({
            "target": outcome.target.label if outcome.target else None,
            "result": outcome.note,
            "confidence": outcome.new_node.confidence.value if outcome.new_node else None,
        })
        if outcome.target is None:
            break
    return {
        "institution": institution_id,
        "cycles_run": len(trace),
        "discoveries": discoveries,
        "epistemic_before": before,
        "epistemic_after": graph.validation_breakdown(),
        "real_fraction": graph.real_fraction(),
        "trace": trace,
        "disclaimer": "Simulated autonomous R&D. Established nodes are in-silico "
                      "candidates pending physical replication.",
    }
