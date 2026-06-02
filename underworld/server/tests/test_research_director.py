"""Tests for the Research Director self-directing discovery loop."""
from underworld.server.services.knowledge_graph import (
    ConfidenceClass,
    Edge,
    EdgeKind,
    KnowledgeGraph,
    Node,
    NodeKind,
)
from underworld.server.services.research_director import (
    autonomous_program,
    choose_target,
    compile_protocol,
    run_cycle,
)


def _graph_with_frontier() -> tuple[KnowledgeGraph, list[str]]:
    """A small graph: two known materials/methods, plus a target invention that
    needs one more prerequisite the lab can establish."""
    g = KnowledgeGraph()
    g.add_node(Node("inst-autonomous-lab", NodeKind.INSTITUTION, "Lab", ConfidenceClass.B_LITERATURE))
    g.add_node(Node("mat-li", NodeKind.MATERIAL, "Li", ConfidenceClass.B_LITERATURE))
    g.add_node(Node("mat-i", NodeKind.MATERIAL, "I", ConfidenceClass.B_LITERATURE))
    g.add_node(Node("meth-sinter", NodeKind.METHOD, "sinter", ConfidenceClass.B_LITERATURE))
    g.add_node(Node("instr-xrd", NodeKind.INSTRUMENT, "xrd", ConfidenceClass.A_PHYSICS))
    # a missing prerequisite principle, and a target that requires it + known mats
    g.add_node(Node("prin-conduct", NodeKind.PRINCIPLE, "fast-ion conduction", ConfidenceClass.C_SIMULATION))
    g.add_node(Node("inv-electrolyte", NodeKind.INVENTION, "solid electrolyte", ConfidenceClass.D_SPECULATIVE))
    g.add_edge(Edge("inv-electrolyte", "mat-li", EdgeKind.REQUIRES))
    g.add_edge(Edge("inv-electrolyte", "prin-conduct", EdgeKind.REQUIRES))
    known = ["mat-li", "mat-i", "meth-sinter", "instr-xrd"]
    return g, known


def test_choose_target_picks_reachable_frontier():
    g, known = _graph_with_frontier()
    target = choose_target(g, known)
    assert target is not None
    assert target.node_id == "inv-electrolyte"
    assert target.missing_prereq == "prin-conduct"  # the one missing prereq


def test_choose_target_none_when_nothing_reachable():
    g = KnowledgeGraph()
    g.add_node(Node("isolated", NodeKind.FACT, "f", ConfidenceClass.B_LITERATURE))
    assert choose_target(g, []) is None


def test_compile_protocol_uses_graph_repertoire():
    g, known = _graph_with_frontier()
    target = choose_target(g, known)
    proto = compile_protocol(g, target)
    assert "Li" in proto.sample_space["material"]
    assert "sinter" in proto.sample_space["method"]
    assert proto.replication >= 2
    assert "establish" in proto.objective


def test_run_cycle_folds_back_a_new_node():
    g, known = _graph_with_frontier()
    before = len(g)
    outcome = run_cycle(g, known)
    assert outcome.new_node is not None
    assert len(g) == before + 1            # knowledge grew
    # replicated campaign -> literature-grade, not fabricated physics
    assert outcome.new_node.confidence in (ConfidenceClass.B_LITERATURE,
                                           ConfidenceClass.C_SIMULATION)
    assert g.node(outcome.new_node.id) is not None


def test_run_cycle_emits_provenance_edges():
    g, known = _graph_with_frontier()
    outcome = run_cycle(g, known)
    kinds = {e.kind for e in outcome.new_edges}
    assert EdgeKind.DISCOVERED_BY in kinds
    assert EdgeKind.REQUIRES in kinds


def test_run_cycle_no_target_makes_no_claim():
    g = KnowledgeGraph()
    outcome = run_cycle(g, [])
    assert outcome.new_node is None
    assert "no reachable frontier" in outcome.note


def test_autonomous_program_climbs_and_improves_epistemics():
    g, known = _graph_with_frontier()
    report = autonomous_program(g, known, cycles=3)
    assert report["discoveries"] >= 1
    # made a real (A/B) claim -> real_fraction is a valid share
    assert 0.0 <= report["real_fraction"] <= 1.0
    assert report["cycles_run"] >= 1
    assert report["trace"][0]["target"] is not None


def test_program_advances_frontier_not_reloops_same_target():
    # single-target graph: must establish the one missing prereq ONCE, then the
    # frontier empties — not re-establish the same node every cycle.
    g, known = _graph_with_frontier()
    before = len(g)
    report = autonomous_program(g, known, cycles=5)
    assert report["discoveries"] == 1         # established once, not 5×
    assert report["cycles_run"] <= 2          # discover, then no frontier left
    assert len(g) == before + 1               # exactly one new node, no re-loop


def test_program_never_fabricates_physics_grade_knowledge():
    g, known = _graph_with_frontier()
    autonomous_program(g, known, cycles=3)
    # the Director only ever earns B or C for discovered methods, never A
    for n in g.nodes_of(NodeKind.METHOD):
        if n.id.startswith("discovered::"):
            assert n.confidence != ConfidenceClass.A_PHYSICS
