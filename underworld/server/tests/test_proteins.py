"""Tests for real protein biochemistry — assert known values."""
import math
from underworld.server.services import proteins as pr


def test_molecular_weight_known_peptide():
    # glycine dipeptide-ish sanity: MW positive and scales with length
    assert pr.molecular_weight("GG") > pr.molecular_weight("G")


def test_gravy_hydrophobic_vs_charged():
    assert pr.gravy("IIIVVV") > 0                     # hydrophobic
    assert pr.gravy("DDDEEE") < 0                     # charged/hydrophilic


def test_michaelis_menten_half_vmax_at_km():
    v = pr.michaelis_menten(substrate=5.0, vmax=100, km=5.0)
    assert abs(v - 50) < 1e-6                          # [S]=Km -> v=Vmax/2


def test_binding_affinity_and_inverse():
    dg = pr.binding_affinity(kd=1e-9)["delta_g_kcal_mol"]
    kd_back = pr.dissociation_constant(delta_g=dg)
    assert abs(kd_back - 1e-9) / 1e-9 < 1e-3          # round-trip


def test_protein_stability_folded_fraction():
    stable = pr.protein_stability(ddg=-2.0)["fraction_folded"]
    unstable = pr.protein_stability(ddg=2.0)["fraction_folded"]
    assert stable > unstable


def test_interaction_network_hub():
    net = pr.interaction_network([("A", "B"), ("A", "C"), ("A", "D"), ("B", "C")])
    assert net["hub"] == "A"


def test_mutation_effect_flags_big_change():
    eff = pr.mutation_effect("AIA", 1, "D")           # Ile->Asp big hydropathy swing
    assert eff["likely_destabilising"] is True
