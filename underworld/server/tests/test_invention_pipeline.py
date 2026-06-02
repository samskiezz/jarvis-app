"""Tests for #5 the Empty-Patent → Autonomous Invention pipeline."""
from underworld.server.services.invention_pipeline import (
    DISCLAIMER,
    Gap,
    combine,
    detect_gap,
    find_relevant_patents,
    invention_disclosure,
    peer_review,
    run_pipeline,
    simulate,
)
from underworld.server.services.knowledge_graph import (
    ConfidenceClass,
    Edge,
    EdgeKind,
    KnowledgeGraph,
    Node,
    NodeKind,
)


# ── fixtures ─────────────────────────────────────────────────────────────────
def _graph(*, with_anticipator: bool = False) -> KnowledgeGraph:
    """A small slice combining a thermal principle, an electrical principle and a
    material — the raw teachings our candidate patents contribute."""
    g = KnowledgeGraph()
    nodes = [
        ("thermo", NodeKind.PRINCIPLE, ConfidenceClass.A_PHYSICS),
        ("seebeck", NodeKind.PRINCIPLE, ConfidenceClass.A_PHYSICS),
        ("alloy", NodeKind.MATERIAL, ConfidenceClass.B_LITERATURE),
    ]
    for nid, kind, conf in nodes:
        g.add_node(Node(id=nid, kind=kind, label=nid, confidence=conf))
    if with_anticipator:
        # An existing invention that already REQUIRES exactly this set →
        # the novelty engine must flag anticipation.
        g.add_node(Node(id="existing_teg", kind=NodeKind.INVENTION,
                        label="existing thermoelectric", confidence=ConfidenceClass.D_SPECULATIVE))
        for dep in ("thermo", "seebeck", "alloy"):
            g.add_edge(Edge("existing_teg", dep, EdgeKind.REQUIRES))
    return g


def _signals() -> list[dict]:
    return [
        {"id": "gap-tec", "problem": "Recover waste heat with no rare earths.",
         "domain": "energy", "relevant_domains": ["thermal", "electrical"],
         "source": "paper", "confidence": ConfidenceClass.B_LITERATURE},
        {"id": "pain-1", "problem": "Foundries waste 40% of process heat.",
         "domain": "materials", "relevant_domains": ["materials"],
         "source": "industrial_need"},
    ]


def _patent_pool() -> list[dict]:
    return [
        {"id": "US-A", "expired": True, "cpc": ["thermal"], "principles": ["thermo"]},
        {"id": "US-B", "expired": True, "keywords": ["electrical"], "principles": ["seebeck"]},
        {"id": "US-C", "expired": True, "domains": ["materials"], "principles": ["alloy"]},
        {"id": "US-D", "expired": False, "cpc": ["thermal"], "principles": ["thermo"]},
        {"id": "US-E", "expired": True, "cpc": ["unrelated"], "principles": ["xyz"]},
    ]


def _models(*, all_pass: bool = True) -> dict:
    base = {"pass": True, "physics_consistent": True, "replicated": True}
    bad = {"pass": False, "physics_consistent": False, "replicated": False}
    axes = ("thermal", "electrical", "mechanical", "cost", "failure", "environmental")
    return {a: dict(base if all_pass else (base if a != "failure" else bad)) for a in axes}


def _reviews(*, n: int = 4, fraud: bool = False) -> list[dict]:
    out = [{"lab": f"lab-{i}", "replicated": True, "fabricated": False} for i in range(n)]
    if fraud:
        out.append({"lab": "lab-bad", "replicated": True, "fabricated": True})
    return out


# ── step 1 ───────────────────────────────────────────────────────────────────
def test_detect_gap_fuses_signals_and_picks_strongest():
    gap = detect_gap(_signals())
    assert isinstance(gap, Gap)
    # The literature-backed paper outranks the speculative industrial need.
    assert gap.id == "gap-tec"
    assert gap.source == "paper"
    assert gap.confidence is ConfidenceClass.B_LITERATURE
    # Domains pool across every signal.
    assert "thermal" in gap.relevant_domains
    assert "materials" in gap.relevant_domains


def test_detect_gap_requires_a_signal():
    try:
        detect_gap([])
    except ValueError:
        return
    raise AssertionError("expected ValueError on empty signals")


def test_detect_gap_industrial_need_defaults_to_speculative():
    gap = detect_gap([{"id": "x", "problem": "p", "domain": "d", "source": "industrial_need"}])
    assert gap.confidence is ConfidenceClass.D_SPECULATIVE


# ── step 2 ───────────────────────────────────────────────────────────────────
def test_find_relevant_patents_intersects_domains_and_excludes_unexpired():
    gap = detect_gap(_signals())
    found = find_relevant_patents(gap, _patent_pool())
    ids = {p["id"] for p in found}
    assert ids == {"US-A", "US-B", "US-C"}  # D unexpired, E no domain overlap
    assert "US-D" not in ids
    assert "US-E" not in ids


def test_find_relevant_patents_caps_at_ten():
    gap = Gap("g", "p", "d", ["d"], "paper", ConfidenceClass.B_LITERATURE)
    pool = [{"id": f"P{i}", "expired": True, "domains": ["d"]} for i in range(20)]
    assert len(find_relevant_patents(gap, pool)) == 10


# ── step 3 ───────────────────────────────────────────────────────────────────
def test_combine_scores_novelty_via_graph():
    gap = detect_gap(_signals())
    patents = find_relevant_patents(gap, _patent_pool())
    cand = combine(gap, patents, _graph())
    assert cand["combined_from"] == ["US-A", "US-B", "US-C"]
    assert cand["anticipated_by"] is None
    assert cand["novelty"] > 0.0
    assert cand["inventive_step"] in ("weak", "medium", "strong")
    assert cand["sufficient_prior_art"] is True


def test_combine_flags_anticipation_when_graph_already_covers_it():
    gap = detect_gap(_signals())
    patents = find_relevant_patents(gap, _patent_pool())
    cand = combine(gap, patents, _graph(with_anticipator=True))
    assert cand["anticipated_by"] == "existing_teg"
    assert cand["inventive_step"] == "weak"


# ── step 4 ───────────────────────────────────────────────────────────────────
def test_simulate_all_pass_yields_class_c():
    sim = simulate({"title": "t"}, _models(all_pass=True))
    assert sim["feasibility"] == 1.0
    assert sim["physics_consistent"] is True
    assert sim["replicated"] is True
    assert sim["confidence_class"] is ConfidenceClass.C_SIMULATION


def test_simulate_failure_drops_feasibility_and_class_d():
    sim = simulate({"title": "t"}, _models(all_pass=False))
    assert sim["per_model"]["failure"] is False
    assert sim["feasibility"] < 1.0
    assert sim["confidence_class"] is ConfidenceClass.D_SPECULATIVE


def test_simulate_missing_lens_is_not_a_pass():
    models = _models(all_pass=True)
    del models["cost"]
    sim = simulate({"title": "t"}, models)
    assert sim["per_model"]["cost"] is False
    assert sim["confidence_class"] is ConfidenceClass.D_SPECULATIVE


# ── step 5 ───────────────────────────────────────────────────────────────────
def test_peer_review_accepts_replicated():
    review = peer_review({}, _reviews(n=4))
    assert review["accepted"] is True
    assert review["fraud_flag"] is False
    assert review["replication_confidence"] == 1.0


def test_peer_review_flags_fraud():
    review = peer_review({}, _reviews(n=4, fraud=True))
    assert review["fraud_flag"] is True
    assert review["accepted"] is False


def test_peer_review_rejects_failed_replication():
    reviews = [{"lab": f"l{i}", "replicated": False, "fabricated": False} for i in range(4)]
    review = peer_review({}, reviews)
    assert review["accepted"] is False
    assert review["replication_confidence"] == 0.0


def test_peer_review_no_reviews():
    review = peer_review({}, [])
    assert review["accepted"] is False
    assert review["replications"] == 0


# ── step 6 ───────────────────────────────────────────────────────────────────
def test_invention_disclosure_has_all_keys_disclaimer_and_class():
    gap = detect_gap(_signals())
    patents = find_relevant_patents(gap, _patent_pool())
    cand = combine(gap, patents, _graph())
    sim = simulate(cand, _models(all_pass=True))
    review = peer_review(cand, _reviews(n=4))
    disc = invention_disclosure(gap, cand, sim, review)

    required = {
        "title", "background", "summary", "detailed_description", "claim_tree",
        "prior_art_table", "novelty_hypothesis", "test_evidence", "risks",
        "attorney_questions", "confidence_class", "disclaimer",
    }
    assert required <= set(disc)
    assert disc["disclaimer"] == DISCLAIMER
    assert "CANDIDATE" in disc["disclaimer"]
    assert "attorney" in disc["disclaimer"].lower()
    # No autonomous filing / AI inventor — the ethics boundary surfaces.
    assert any("AI" in q for q in disc["attorney_questions"])
    assert disc["claim_tree"]["independent"] and disc["claim_tree"]["dependent"]
    assert len(disc["prior_art_table"]) == 3
    assert isinstance(disc["confidence_class"], ConfidenceClass)
    # Accepted + class-C simulation → disclosure is C.
    assert disc["confidence_class"] is ConfidenceClass.C_SIMULATION


def test_invention_disclosure_unaccepted_is_speculative_and_lists_risk():
    gap = detect_gap(_signals())
    patents = find_relevant_patents(gap, _patent_pool())
    cand = combine(gap, patents, _graph())
    sim = simulate(cand, _models(all_pass=False))
    review = peer_review(cand, _reviews(n=1))
    disc = invention_disclosure(gap, cand, sim, review)
    assert disc["confidence_class"] is ConfidenceClass.D_SPECULATIVE
    assert disc["risks"]


def test_invention_disclosure_flags_anticipation_risk():
    gap = detect_gap(_signals())
    patents = find_relevant_patents(gap, _patent_pool())
    cand = combine(gap, patents, _graph(with_anticipator=True))
    sim = simulate(cand, _models(all_pass=True))
    review = peer_review(cand, _reviews(n=4))
    disc = invention_disclosure(gap, cand, sim, review)
    assert any("anticipation" in r.lower() for r in disc["risks"])


# ── step 7 ───────────────────────────────────────────────────────────────────
def test_run_pipeline_end_to_end():
    out = run_pipeline(_signals(), _patent_pool(), _graph(), _models(all_pass=True), _reviews(n=4))
    assert isinstance(out["gap"], Gap)
    disc = out["disclosure"]
    assert disc["disclaimer"] == DISCLAIMER
    assert disc["confidence_class"] is ConfidenceClass.C_SIMULATION
    # Trace covers every step in order.
    steps = [t["step"] for t in out["trace"]]
    assert steps == [
        "detect_gap", "find_relevant_patents", "combine",
        "simulate", "peer_review", "invention_disclosure",
    ]
    assert out["review"]["accepted"] is True


def test_run_pipeline_trace_carries_anticipation_and_fraud():
    out = run_pipeline(_signals(), _patent_pool(), _graph(with_anticipator=True),
                       _models(all_pass=False), _reviews(n=4, fraud=True))
    combine_step = next(t for t in out["trace"] if t["step"] == "combine")
    assert combine_step["anticipated_by"] == "existing_teg"
    review_step = next(t for t in out["trace"] if t["step"] == "peer_review")
    assert review_step["fraud_flag"] is True
    assert out["disclosure"]["confidence_class"] is ConfidenceClass.D_SPECULATIVE
