"""Physics kernel: Unit Ledger, Conservation Auditor, Violation Alarm, Feasibility Gate."""

from __future__ import annotations

import pytest

from underworld.server.physics import conservation, dimensions as dim, violations


# ── #1/#4/#5 dimensional homogeneity ─────────────────────────────────────────
def test_units_compose_dimensionally():
    # F = m·a  →  N == kg·m/s^2
    assert dim.FORCE == dim.MASS * dim.ACCELERATION
    # E = F·d  →  J
    assert dim.ENERGY == dim.FORCE * dim.LENGTH
    # P = E/t  →  W
    assert dim.POWER == dim.ENERGY / dim.TIME


def test_addition_requires_matching_dimensions():
    metres = dim.Quantity(3.0, dim.LENGTH)
    seconds = dim.Quantity(2.0, dim.TIME)
    assert (metres + dim.Quantity(1.0, dim.LENGTH)).value == 4.0
    with pytest.raises(dim.DimensionError):
        _ = metres + seconds                      # can't add metres to seconds


def test_equation_homogeneity_check():
    # v = d/t is homogeneous; v = d + t is not
    assert dim.check_equation(dim.VELOCITY, dim.LENGTH / dim.TIME)
    assert not dim.is_homogeneous(dim.LENGTH, dim.TIME)


# ── #2 conservation ──────────────────────────────────────────────────────────
def test_conservation_auditor_balances_books():
    ok = conservation.audit({"energy": 100}, {"energy": 100})
    assert conservation.all_conserved(ok)
    # energy appeared from nowhere → violation
    bad = conservation.audit({"energy": 100}, {"energy": 150})
    assert not conservation.all_conserved(bad)
    # ...unless a declared source (burning fuel) accounts for it
    sourced = conservation.audit({"energy": 100}, {"energy": 150}, sources={"energy": 50})
    assert conservation.all_conserved(sourced)


# ── #10 violation alarm ──────────────────────────────────────────────────────
def test_violation_alarm_catches_impossibilities():
    assert violations.detect_violations({"speed_m_s": 4e8})            # FTL
    assert violations.detect_violations({"energy_in": 10, "energy_out": 25})  # over-unity
    assert violations.detect_violations({"efficiency": 0.99, "t_cold_k": 300, "t_hot_k": 350})  # > Carnot
    assert violations.detect_violations({"charge_before": 5, "charge_after": 9})  # charge not conserved
    # a legitimate engine passes
    assert not violations.detect_violations(
        {"speed_m_s": 30, "efficiency": 0.3, "t_cold_k": 300, "t_hot_k": 600,
         "energy_in": 100, "energy_out": 30})


# ── #74 feasibility gate ─────────────────────────────────────────────────────
def test_feasibility_gate():
    over_unity = violations.feasibility_gate({"energy_in": 1, "energy_out": 100})
    assert over_unity["feasible"] is False and over_unity["verdict"] == "REJECTED"
    sound = violations.feasibility_gate({"energy_in": 100, "energy_out": 40})
    assert sound["feasible"] is True
    # even sound physics fails the gate without materials
    assert violations.feasibility_gate({"energy_in": 100, "energy_out": 40},
                                       materials_available=False)["feasible"] is False


# ── API ──────────────────────────────────────────────────────────────────────
def test_kernel_routes(client, headers):
    feas = client.post("/physics/kernel/feasibility", headers=headers,
                       json={"claim": {"speed_m_s": 4e8}}).json()
    assert feas["feasible"] is False and feas["violations"]

    cons = client.post("/physics/kernel/conserve", headers=headers,
                       json={"before": {"mass": 10}, "after": {"mass": 12}}).json()
    assert cons["conserved"] is False

    units = client.get("/physics/kernel/units", headers=headers).json()
    assert "N" in units["units"] and units["base"][0] == "m"
