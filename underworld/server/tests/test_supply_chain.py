"""Tests for real supply-chain / OR models — assert known formulas."""
import math

from underworld.server.services import supply_chain as sc


def test_eoq_matches_closed_form():
    r = sc.economic_order_quantity(annual_demand=1000, order_cost=50, holding_cost=2)
    assert abs(r["eoq"] - math.sqrt(2 * 1000 * 50 / 2)) < 1e-2     # rounds to 3dp


def test_source_concentration_single_vs_diversified():
    assert sc.source_concentration([1.0])["single_source"] is True
    assert sc.source_concentration([0.25, 0.25, 0.25, 0.25])["diversified"] is True


def test_dependency_critical_path_is_longest_lead():
    nodes = {
        "ore": {"deps": [], "lead": 2},
        "metal": {"deps": ["ore"], "lead": 3},
        "part": {"deps": ["metal"], "lead": 1},
        "paint": {"deps": [], "lead": 1},
    }
    g = sc.supply_dependency(nodes)
    assert g["critical_node"] == "part"
    assert abs(g["critical_lead_time"] - 6) < 1e-9       # 2+3+1


def test_dependency_detects_cycle():
    import pytest
    with pytest.raises(ValueError):
        sc.supply_dependency({"a": {"deps": ["b"]}, "b": {"deps": ["a"]}})


def test_bottleneck_risk_ranks_shortage():
    risks = sc.bottleneck_risk(supply={"x": 10, "y": 5}, demand={"x": 5, "y": 20})
    assert risks[0]["resource"] == "y"                   # biggest shortfall first
    assert risks[0]["at_risk"] is True


def test_reorder_point():
    assert sc.reorder_point(daily_demand=10, lead_time_days=5, safety_stock=20) == 70


def test_strategic_reserve_coverage():
    assert sc.strategic_reserve_coverage(reserve=900, daily_consumption=10)["secure"] is True
    assert sc.strategic_reserve_coverage(reserve=100, daily_consumption=10)["secure"] is False


def test_resource_depletion_closed_form():
    assert abs(sc.resource_depletion(reserve=1000, annual_consumption=100)["years_to_depletion"] - 10) < 1e-9
    # growth shortens the lifetime
    grown = sc.resource_depletion(reserve=1000, annual_consumption=100, growth=0.1)
    assert grown["years_to_depletion"] < 10


def test_trade_flow_balance():
    bal = sc.trade_flow_balance(imports={"oil": 100}, exports={"oil": 60, "wheat": 30})
    assert bal["net_by_commodity"]["oil"] == -40
    assert "oil" in bal["deficit_commodities"]


def test_disruption_impact_creates_shortfall():
    imp = sc.disruption_impact(baseline_supply=100, disruption_fraction=0.5, demand=80)
    assert imp["shortfall"] == 30
    assert imp["critical"] is True


def test_inventory_forecast_smooths():
    f = sc.inventory_forecast([10, 12, 11, 13], horizon=2)
    assert len(f["forecast"]) == 2
    assert 10 <= f["level"] <= 13


def test_supplier_reliability_from_history():
    good = sc.supplier_reliability([True] * 20)
    bad = sc.supplier_reliability([True, False, False, True, False])
    assert good["on_time_rate"] > bad["on_time_rate"]
    assert good["reliable"] is True and bad["reliable"] is False


def test_recycling_loop_multiplier():
    r = sc.recycling_loop(initial=100, recovery_rate=0.8, cycles=5)
    assert r["effective_multiplier"] > 1.0            # recycling extends material
    assert r["remaining_after_cycles"] < 100


def test_labour_and_tool_dependency():
    assert sc.labour_dependency(required=100, available=60)["shortage"] is True
    assert sc.tool_dependency(required_tools=["cnc", "press"],
                              available_tools=["cnc"])["blocked"] is True


def test_rare_earth_dependency_flags_criticality():
    crit = sc.rare_earth_dependency(consumption=100, domestic=10, reserve=50)
    assert crit["import_reliance"] > 0.5
