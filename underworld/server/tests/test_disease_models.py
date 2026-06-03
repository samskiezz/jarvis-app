"""Tests for real epidemiology/pharmacology — assert theory."""
from underworld.server.services import disease_models as dm


def test_r0_and_herd_immunity():
    assert dm.r0(beta=0.4, gamma=0.1) == 4.0
    assert abs(dm.herd_immunity_threshold(4.0) - 0.75) < 1e-9


def test_sir_epidemic_when_r0_above_1():
    res = dm.sir_simulate(s0=999, i0=1, beta=0.4, gamma=0.1)
    assert res["epidemic"] is True
    assert res["peak_infected"] > 1                   # an outbreak grows


def test_sir_no_epidemic_when_r0_below_1():
    res = dm.sir_simulate(s0=999, i0=1, beta=0.05, gamma=0.1)
    assert res["epidemic"] is False


def test_dose_response_half_at_ec50():
    assert abs(dm.dose_response(dose=5.0, ec50=5.0) - 0.5) < 1e-6


def test_therapeutic_index():
    assert dm.therapeutic_index(ld50=1000, ed50=10)["safe_margin"] is True


def test_resistance_emerges_over_generations():
    early = dm.pathogen_resistance(generations=1, mutation_rate=1e-6, drug_pressure=1.0)
    late = dm.pathogen_resistance(generations=1000, mutation_rate=1e-6, drug_pressure=1.0)
    assert late["resistant_fraction"] > early["resistant_fraction"]


def test_gene_perturbations():
    expr = {"g1": 1.0, "g2": 2.0}
    assert dm.gene_knockout(expr, "g1")["expression"]["g1"] == 0.0
    assert dm.gene_knockdown(expr, "g2", fraction=0.5)["expression"]["g2"] == 1.0
    assert dm.overexpression(expr, "g1", fold=3)["expression"]["g1"] == 3.0


def test_gene_knockout_propagates_through_network():
    # g1 activates g2 (w=+0.8); g2 activates g3 (w=+0.5). Knock out g1 → both fall.
    expr = {"g1": 1.0, "g2": 1.0, "g3": 1.0}
    net = {"g1": {"g2": 0.8}, "g2": {"g3": 0.5}}
    r = dm.gene_knockout(expr, "g1", network=net)
    assert r["expression"]["g1"] == 0.0
    assert r["expression"]["g2"] < 1.0                      # downstream activator lost → g2 falls
    assert r["expression"]["g3"] < 1.0                      # ripples a second hop to g3
    assert r["downstream_affected"] >= 2 and "g2" in r["downstream_shifts"]


def test_overexpression_repressor_lowers_downstream():
    # g1 represses g2 (w=-0.6). Overexpress g1 → g2 should drop.
    expr = {"g1": 1.0, "g2": 1.0}
    net = {"g1": {"g2": -0.6}}
    r = dm.overexpression(expr, "g1", fold=3, network=net)
    assert r["expression"]["g2"] < 1.0
    assert r["downstream_shifts"]["g2"] < 0


def test_no_network_is_backward_compatible():
    expr = {"g1": 1.0, "g2": 2.0}
    r = dm.gene_knockout(expr, "g1")
    assert r["expression"] == {"g1": 0.0, "g2": 2.0} and r["downstream_affected"] == 0


def test_therapy_candidate_score():
    s = dm.therapy_candidate_score(efficacy=0.8, safety=0.8, deliverability=0.8)
    assert s["promising"] is True
