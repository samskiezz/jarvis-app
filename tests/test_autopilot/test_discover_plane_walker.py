"""plane_walker: discovers all 11 planes (or missing)."""
from autopilot.discover.plane_walker import walk, PLANES


def test_walk_returns_all_planes():
    out = walk()
    assert out["n_planes"] == len(PLANES)
    assert "planes" in out
    assert len(out["planes"]) == len(PLANES)


def test_walk_classifies_existing_planes():
    out = walk()
    # ontology-plane exists in this repo
    assert "ontology-plane" in out["planes"]
    # status should be one of the known classifiers
    ont = out["planes"]["ontology-plane"]
    if ont["exists"]:
        assert ont["status"] in ("alive", "dormant_scaffold", "dormant_docs", "empty")
