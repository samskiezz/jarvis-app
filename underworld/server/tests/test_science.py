"""Expansion #71-80 — Minion science tooling."""

from __future__ import annotations

from underworld.server.services import science


# ── #71 Bayesian update ──────────────────────────────────────────────────────
def test_bayes_update_raises_belief_on_confirming_evidence():
    # prior 0.5, evidence 4x more likely under H than not-H → posterior > prior
    post = science.bayes_update(0.5, p_e_given_h=0.8, p_e_given_not_h=0.2)
    assert post > 0.5 and abs(post - 0.8) < 1e-9
    # disconfirming evidence lowers it
    assert science.bayes_update(0.5, 0.2, 0.8) < 0.5


# ── #72/#73 measurement + calibration + replication ──────────────────────────
def test_measurement_and_calibration():
    s = science.measurement_stats([9.8, 10.0, 10.2])
    assert abs(s["mean"] - 10.0) < 1e-9 and s["std"] > 0
    cal = science.calibrate([11.0, 11.2, 10.8], true_value=10.0)
    assert abs(cal["offset"] - 1.0) < 1e-6 and abs(cal["corrected_mean"] - 10.0) < 1e-6


def test_replication_acceptance():
    lo, hi = science.confidence_interval(10.0, 1.0, 100)
    assert lo < 10.0 < hi
    assert science.is_established(replications=5, agreement=0.9) is True
    assert science.is_established(replications=1, agreement=0.9) is False
    assert science.is_established(replications=5, agreement=0.4) is False


# ── #75 unit-checked formula parser ──────────────────────────────────────────
def test_formula_parser_validates_dimensions():
    ok = science.parse_equation("V = I*R", {"V": "V", "I": "A", "R": "ohm"})
    assert ok["valid"] is True
    bad = science.parse_equation("V = I*t", {"V": "V", "I": "A", "t": "s"})
    assert bad["valid"] is False     # A·s is charge, not voltage


# ── #77 prior-art physics graph ──────────────────────────────────────────────
def test_prior_art_links_by_shared_physics():
    patents = [
        {"id": "P1", "laws": ["ohm", "joule_heating"], "materials": ["copper"], "functions": ["heater"]},
        {"id": "P2", "laws": ["ohm", "faraday_emf"], "materials": ["copper"], "functions": ["motor"]},
        {"id": "P3", "laws": ["bernoulli"], "materials": ["steel"], "functions": ["pump"]},
    ]
    edges = science.prior_art_graph(patents)
    top = edges[0]
    assert {top["a"], top["b"]} == {"P1", "P2"}     # they share Ohm + copper
    assert all(e["weight"] > 0 for e in edges)
    assert not any({"P3"} & {e["a"], e["b"]} and e["weight"] > 0.3 for e in edges)


# ── #78 mastery by demonstration ─────────────────────────────────────────────
def test_mastery_is_product_of_factors():
    assert science.mastery_by_demonstration(1.0, 1.0, 1.0) == 1.0
    assert science.mastery_by_demonstration(0.5, 0.5, 0.5) == 0.125
    assert science.mastery_by_demonstration(0.9, 0.0, 0.9) == 0.0   # never repeated → no mastery


# ── #80 empty-patent constraint solver ───────────────────────────────────────
def test_optimizer_respects_constraints():
    # maximise x+y subject to x+y ≤ 10, over [0,8]^2 → optimum near 10
    res = science.optimize(
        objective=lambda v: v[0] + v[1],
        constraints=[lambda v: v[0] + v[1] - 10.0],
        bounds=[(0, 8), (0, 8)],
        samples=5000,
    )
    assert res["feasible"] and res["objective"] <= 10.0 + 1e-6 and res["objective"] > 8.0


def test_science_routes(client, headers):
    b = client.post("/science/bayes", headers=headers,
                   json={"prior": 0.5, "p_e_given_h": 0.8, "p_e_given_not_h": 0.2}).json()
    assert b["posterior"] > 0.5
    f = client.post("/science/parse-formula", headers=headers,
                   json={"equation": "V = I*R", "units": {"V": "V", "I": "A", "R": "ohm"}}).json()
    assert f["valid"] is True
    m = client.post("/science/mastery", headers=headers,
                   json={"accuracy": 0.9, "repeatability": 0.8, "explanation": 0.7}).json()
    assert 0 < m["mastery"] < 1
