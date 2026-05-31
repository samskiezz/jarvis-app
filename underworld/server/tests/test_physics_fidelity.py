"""Physics kernel pt2: Solver Fidelity Ladder (#4) + Dimensional Debugger (#5)."""

from __future__ import annotations

from underworld.server.physics import fidelity


def test_courant_stability():
    assert fidelity.is_stable(10, 0.05, 1.0)           # C = 0.5 ≤ 1
    assert not fidelity.is_stable(10, 0.2, 1.0)        # C = 2.0 > 1
    # the reported max stable dt sits exactly on the limit
    dt = fidelity.max_stable_dt(10, 1.0)
    assert abs(fidelity.courant_number(10, dt, 1.0) - 1.0) < 1e-9


def test_fidelity_tier_scales_with_attention():
    assert fidelity.fidelity_tier(observed=True, importance=0.0) == "exact"
    assert fidelity.fidelity_tier(observed=False, importance=0.9) == "exact"
    assert fidelity.fidelity_tier(observed=False, importance=0.05) == "low"
    assert fidelity.fidelity_tier(observed=False, importance=0.6) == "high"


def test_truncation_error_grows_with_step():
    assert fidelity.truncation_error(0.1, 0.1) < fidelity.truncation_error(1.0, 1.0)


def test_stability_route(client, headers):
    body = client.post("/physics/kernel/stability", headers=headers,
                       json={"velocity": 10, "dt": 0.2, "dx": 1.0}).json()
    assert body["stable"] is False and body["courant"] == 2.0


def test_dimensional_debugger_route(client, headers):
    # v = d/t  → term1 [m^1], term2 [m^1, s^-1]?  Build two velocity terms.
    ok = client.post("/physics/kernel/check-equation", headers=headers,
                     json={"terms": [[["m/s", 1]], [["m", 1], ["s", -1]]]}).json()
    assert ok["homogeneous"] is True
    # adding a length to a time is not homogeneous
    bad = client.post("/physics/kernel/check-equation", headers=headers,
                      json={"terms": [[["m", 1]], [["s", 1]]]}).json()
    assert bad["homogeneous"] is False
