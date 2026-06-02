"""Tests for the Civilisation Knowledge Graph + Reality Validation Layer."""
from underworld.server.services.knowledge_graph import (
    ConfidenceClass,
    Edge,
    EdgeKind,
    KnowledgeGraph,
    Node,
    NodeKind,
    classify_invention,
    classify_narrative,
    classify_patent,
)


def _steam_engine_graph() -> KnowledgeGraph:
    """A small slice of the design's worked example: the steam engine and the
    real principles/materials it requires."""
    g = KnowledgeGraph()
    nodes = [
        ("boiling", NodeKind.PRINCIPLE, ConfidenceClass.A_PHYSICS),
        ("pressure", NodeKind.PRINCIPLE, ConfidenceClass.A_PHYSICS),
        ("metallurgy", NodeKind.SKILL, ConfidenceClass.B_LITERATURE),
        ("seals", NodeKind.MATERIAL, ConfidenceClass.B_LITERATURE),
        ("piston", NodeKind.METHOD, ConfidenceClass.B_LITERATURE),
        ("steam_engine", NodeKind.INVENTION, ConfidenceClass.D_SPECULATIVE),
    ]
    for nid, kind, conf in nodes:
        g.add_node(Node(id=nid, kind=kind, label=nid, confidence=conf))
    for dep in ("boiling", "pressure", "metallurgy", "seals", "piston"):
        g.add_edge(Edge("steam_engine", dep, EdgeKind.REQUIRES))
    # metallurgy itself requires fire (a deeper prereq, to test transitivity)
    g.add_node(Node(id="fire", kind=NodeKind.PRINCIPLE, label="fire",
                    confidence=ConfidenceClass.A_PHYSICS))
    g.add_edge(Edge("metallurgy", "fire", EdgeKind.REQUIRES))
    return g


def test_prerequisites_are_transitive():
    g = _steam_engine_graph()
    prereqs = g.prerequisites("steam_engine")
    # fire is only reachable via metallurgy — transitive closure must include it
    assert "fire" in prereqs
    assert {"boiling", "pressure", "metallurgy", "seals", "piston", "fire"} == prereqs


def test_comprehension_gate_blocks_until_all_known():
    g = _steam_engine_graph()
    known = {"boiling", "pressure", "metallurgy", "seals", "piston"}  # missing fire
    ok, missing = g.can_comprehend("steam_engine", known)
    assert ok is False
    assert missing == {"fire"}
    # once fire is learned, comprehension unlocks
    ok2, missing2 = g.can_comprehend("steam_engine", known | {"fire"})
    assert ok2 is True and missing2 == set()


def test_invention_frontier_surfaces_one_step_away():
    g = _steam_engine_graph()
    # know everything but fire → steam_engine is NOT on the frontier (2 missing:
    # fire, and metallurgy is known but its prereq fire isn't... actually only
    # fire missing transitively) — verify it IS reachable with one prereq left.
    known = {"boiling", "pressure", "metallurgy", "seals", "piston"}
    frontier = g.invention_frontier(known)
    assert "steam_engine" in frontier  # exactly one transitive prereq (fire) missing


def test_novelty_detects_anticipation():
    g = _steam_engine_graph()
    # Proposing the exact same prereq set as the existing steam_engine invention
    # should be flagged as anticipated (weak inventive step).
    res = g.novelty(["boiling", "pressure", "metallurgy", "seals", "piston"])
    assert res["anticipated_by"] == "steam_engine"
    assert res["inventive_step"] == "weak"


def test_novelty_rewards_cross_domain_combination():
    g = KnowledgeGraph()
    g.add_node(Node(id="a", kind=NodeKind.PRINCIPLE, label="a", confidence=ConfidenceClass.A_PHYSICS))
    g.add_node(Node(id="b", kind=NodeKind.MATERIAL, label="b", confidence=ConfidenceClass.B_LITERATURE))
    g.add_node(Node(id="c", kind=NodeKind.METHOD, label="c", confidence=ConfidenceClass.B_LITERATURE))
    res = g.novelty(["a", "b", "c"])  # three distinct kinds, all grounded
    assert res["anticipated_by"] is None
    assert res["novelty"] > 0.5
    assert res["inventive_step"] in ("medium", "strong")


def test_validation_breakdown_and_real_fraction():
    g = _steam_engine_graph()
    breakdown = g.validation_breakdown()
    # 3 physics (boiling, pressure, fire) + 3 literature + 1 speculative
    assert breakdown["A"] == 3
    assert breakdown["B"] == 3
    assert breakdown["D"] == 1
    # real fraction = (A+B)/total = 6/7
    assert abs(g.real_fraction() - 6 / 7) < 0.01


def test_confidence_class_semantics():
    assert ConfidenceClass.A_PHYSICS.is_real
    assert ConfidenceClass.B_LITERATURE.is_real
    assert not ConfidenceClass.C_SIMULATION.is_real
    assert not ConfidenceClass.E_NARRATIVE.is_real
    assert ConfidenceClass.A_PHYSICS.rank < ConfidenceClass.E_NARRATIVE.rank


def test_classifiers_map_rows_to_classes():
    assert classify_patent() is ConfidenceClass.B_LITERATURE
    assert classify_narrative() is ConfidenceClass.E_NARRATIVE
    assert classify_invention(replicated=True, physics_ok=True) is ConfidenceClass.C_SIMULATION
    assert classify_invention(replicated=False, physics_ok=True) is ConfidenceClass.D_SPECULATIVE
    assert classify_invention(replicated=True, physics_ok=False) is ConfidenceClass.D_SPECULATIVE
