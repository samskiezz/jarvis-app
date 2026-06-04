"""The drug-discovery pipeline must combine the real tools into a sane triage."""
from underworld.server.services import drug_discovery as DD

# a short real target peptide + a few real drug molecules
TARGET = "MKWVTFISLLFLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFKALVLIAFAQYLQQCPF"
ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"
IBUPROFEN = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"


def test_screen_candidate_shape_and_bounds():
    r = DD.screen_candidate(TARGET, ASPIRIN)
    assert 0.0 <= r["promise"] <= 1.0
    assert 0.0 <= r["binding_estimate"] <= 1.0
    assert "requires wet-lab" in r["disclaimer"]
    assert r["geometry"]["converged"]                 # real 3D minimisation ran


def test_rank_library_orders_by_promise():
    ranked = DD.rank_library(TARGET, {"aspirin": ASPIRIN, "caffeine": CAFFEINE,
                                      "ibuprofen": IBUPROFEN})
    proms = [x["promise"] for x in ranked if "promise" in x]
    assert proms == sorted(proms, reverse=True)        # ranked best-first
    assert len(ranked) == 3


def test_invalid_smiles_is_handled():
    ranked = DD.rank_library(TARGET, {"bad": "not_a_molecule"})
    assert "error" in ranked[0]
