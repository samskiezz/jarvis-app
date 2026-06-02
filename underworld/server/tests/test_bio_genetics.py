"""Tests for real population genetics — assert textbook results."""
from underworld.server.services import bio_genetics as bg


def test_hardy_weinberg_sums_to_one():
    hw = bg.hardy_weinberg(0.6)
    assert abs(hw["AA"] + hw["Aa"] + hw["aa"] - 1.0) < 1e-9
    assert abs(hw["AA"] - 0.36) < 1e-9


def test_allele_frequency_from_counts():
    af = bg.allele_frequency(n_AA=25, n_Aa=50, n_aa=25)
    assert abs(af["p"] - 0.5) < 1e-9


def test_hw_equilibrium_test_detects_balance():
    # counts generated exactly from p=0.5 should be in equilibrium
    res = bg.hw_equilibrium_test(n_AA=25, n_Aa=50, n_aa=25)
    assert res["in_equilibrium"] is True


def test_selection_increases_beneficial_allele():
    p1 = bg.selection_step(p=0.3, w_AA=1.0, w_Aa=0.9, w_aa=0.5)
    assert p1 > 0.3                                   # A favoured -> rises


def test_genetic_drift_can_fix_or_lose():
    res = bg.genetic_drift(p=0.5, pop_size=10, generations=500, seed=3)
    assert res["fixed"] or res["lost"]               # small pop -> fixation


def test_heritability_bounds():
    assert bg.heritability(var_genetic=40, var_environment=60) == 0.4


def test_punnett_monohybrid_ratio():
    cross = bg.punnett("Aa", "Aa")
    # expect 1:2:1 -> AA 0.25, Aa 0.5, aa 0.25
    assert abs(cross.get("AA", 0) - 0.25) < 1e-9
    assert abs(cross.get("aa", 0) - 0.25) < 1e-9


def test_hill_activation_monotone():
    assert bg.hill_activation(concentration=10, k=5) > bg.hill_activation(concentration=1, k=5)


def test_speciation_distance():
    d = bg.speciation_distance("AAAAAAAAAA", "AAAAATTTTT")
    assert abs(d["p_distance"] - 0.5) < 1e-9
    assert d["distinct_species"] is True
