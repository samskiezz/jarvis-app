"""Tests for the Virtual Cell discovery engine."""
from underworld.server.services.knowledge_graph import ConfidenceClass, NodeKind
from underworld.server.services.virtual_cell import (
    BioKind,
    Modality,
    discover,
    evidence_confidence,
    intervention_candidates,
    mechanism_graph,
    perturbation_hypotheses,
    target_shortlist,
)


def _evidence():
    return [
        {"kind": "gene", "id": "LRRK2", "name": "LRRK2", "source": "gwas",
         "statement": "GWAS hit in Parkinson's cohorts", "strength": 0.8},
        {"kind": "protein", "id": "LRRK2p", "name": "LRRK2 kinase", "source": "structure",
         "statement": "kinase domain druggable pocket", "strength": 0.7,
         "links": [("requires", "gene:LRRK2")]},
        {"kind": "pathway", "id": "autophagy", "name": "autophagy-lysosomal", "source": "literature",
         "statement": "dysregulated in disease", "strength": 0.6},
        {"kind": "gene", "id": "GBA", "name": "GBA", "source": "omics", "strength": 0.5},
    ]


def test_evidence_confidence_maps_sources():
    assert evidence_confidence("gwas") is ConfidenceClass.B_LITERATURE
    assert evidence_confidence("structure") is ConfidenceClass.C_SIMULATION
    assert evidence_confidence("hypothesis") is ConfidenceClass.D_SPECULATIVE


def test_mechanism_graph_builds_nodes_and_classes():
    g = mechanism_graph("Parkinsons", _evidence())
    assert g.node("disease:Parkinsons") is not None
    assert g.node("gene:LRRK2").confidence is ConfidenceClass.B_LITERATURE
    assert g.node("protein:LRRK2p").confidence is ConfidenceClass.C_SIMULATION
    # the protein REQUIRES its gene -> shows up in prerequisites
    assert "gene:LRRK2" in g.prerequisites("protein:LRRK2p")


def test_no_node_without_evidence():
    g = mechanism_graph("Parkinsons", _evidence())
    # only disease + the 4 evidence items -> 5 nodes, nothing invented
    assert len(g) == 5


def test_perturbations_ranked_by_strength():
    g = mechanism_graph("Parkinsons", _evidence())
    hyps = perturbation_hypotheses(g, "Parkinsons")
    assert hyps  # one per gene/protein
    # highest-strength target ranks first
    assert hyps[0]["prior"] >= hyps[-1]["prior"]
    assert all(h["confidence"] == ConfidenceClass.D_SPECULATIVE.value for h in hyps)


def test_target_shortlist_grounded_first():
    g = mechanism_graph("Parkinsons", _evidence())
    targets = target_shortlist(g, "Parkinsons", top_k=5)
    assert targets
    # literature-backed targets sort ahead of simulation-inferred ones
    assert targets[0].confidence.rank <= targets[-1].confidence.rank


def test_intervention_modalities_and_tox():
    g = mechanism_graph("Parkinsons", _evidence())
    targets = target_shortlist(g, "Parkinsons")
    cands = intervention_candidates(targets)
    assert cands
    # a protein target yields a small-molecule option; every candidate has tox flags
    assert any(c.modality is Modality.SMALL_MOLECULE for c in cands)
    assert all(c.toxicity_flags for c in cands)
    # kinase target triggers the cardiotox flag
    assert any("hERG" in " ".join(c.toxicity_flags) for c in cands)


def test_candidate_confidence_never_exceeds_simulation():
    g = mechanism_graph("Parkinsons", _evidence())
    cands = intervention_candidates(target_shortlist(g, "Parkinsons"))
    # predicted candidates are at best C (simulation-inferred), never A/B
    assert all(c.confidence in (ConfidenceClass.C_SIMULATION, ConfidenceClass.D_SPECULATIVE)
               for c in cands)


def test_discover_full_package():
    patents = [
        {"id": "US1", "title": "LRRK2 kinase inhibitor", "abstract": "treating parkinsons"},
        {"id": "US2", "title": "unrelated widget", "abstract": "mechanical"},
    ]
    pkg = discover("Parkinsons", _evidence(), patents)
    assert pkg["disease"] == "Parkinsons"
    for key in ("mechanism_graph", "perturbation_hypotheses", "target_shortlist",
                "intervention_candidates", "validation_plan", "prior_art_map",
                "invention_disclosure_skeleton"):
        assert key in pkg
    # prior-art map found the relevant patent, not the widget
    matched = [p["patent"] for p in pkg["prior_art_map"]]
    assert "US1" in matched and "US2" not in matched
    # disclosure skeleton carries the candidate-only disclaimer
    assert "disclaimer" in pkg["invention_disclosure_skeleton"]
    assert pkg["invention_disclosure_skeleton"]["disclaimer"]


def test_validation_plan_has_staged_gates():
    pkg = discover("Parkinsons", _evidence())
    plan = pkg["validation_plan"]
    stages = [s["stage"] for s in plan]
    assert stages[0] == "in_silico" and "clinical" in stages
    assert any(s["blocking"] for s in plan)


def test_real_fraction_reflects_evidence_quality():
    # all-speculative evidence -> low real fraction
    weak = [{"kind": "gene", "id": "X", "name": "X", "source": "hypothesis", "strength": 0.4}]
    g = mechanism_graph("D", weak)
    # disease node is B, the gene is D -> 1/2 real
    assert g.real_fraction() == 0.5
