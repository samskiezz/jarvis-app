"""Tests for #7 CivOS — the unifying Civilisation Operating System.

Each OS module must produce sensible outputs for healthy vs stressed snapshots,
civ_dashboard must compose all six, overall_health must fall when resources go
scarce / knowledge is at risk / risks climb, and everything must be deterministic.
"""
from __future__ import annotations

import copy

from underworld.server.services.civos import (
    Risk,
    at_risk_knowledge,
    civ_dashboard,
    economic_state,
    institutional_capacity,
    knowledge_health,
    missing_institutions,
    research_throughput,
    resource_pressure,
    risk_register,
    shortage_risks,
)


# ── fixtures (plain-dict snapshots — exactly what callers hydrate) ───────────
def _healthy_snapshot() -> dict:
    return {
        "tech_level": 0.6,
        "resources": {
            "food": {"have": 200.0, "need": 100.0},
            "water": {"have": 300.0, "need": 150.0},
            "timber": {"have": 80.0, "need": 60.0},
            "stone": {"have": 90.0, "need": 50.0},
            "ores": {"have": 70.0, "need": 40.0},
            "fuels": {"have": 60.0, "need": 40.0},
            "rare_earths": {"have": 20.0, "need": 10.0},
            "medicines": {"have": 50.0, "need": 30.0},
            "textiles": {"have": 40.0, "need": 30.0},
            "energy": {"have": 120.0, "need": 80.0},
            "labour": {"have": 100.0, "need": 70.0},
            "knowledge": {"have": 100.0, "need": 60.0},
        },
        "institutions": {
            "families": {"strength": 0.9},
            "guilds": {"strength": 0.8},
            "temples": {"strength": 0.6},
            "courts": {"strength": 0.7},
            "governments": {"strength": 0.8},
            "militaries": {"strength": 0.6},
            "libraries": {"strength": 0.8},
            "universities": {"strength": 0.7},
        },
        "knowledge": {
            "facts": [
                {"id": "fire", "state": "known", "holders": 40, "docs": 10},
                {"id": "wheel", "state": "replicated", "holders": 30, "docs": 8},
                {"id": "writing", "state": "open", "holders": 50, "docs": 20},
                {"id": "smelting", "state": "known", "holders": 15, "docs": 5},
            ],
        },
        "economy": {
            "money_supply": 1000.0, "prev_money_supply": 980.0,
            "goods": 1000.0, "prev_goods": 980.0,
            "market": {
                "grain": {"supply": 200.0, "demand": 120.0, "price": 2.0,
                          "seller_share": 0.2},
                "iron": {"supply": 80.0, "demand": 60.0, "price": 8.0,
                         "seller_share": 0.25},
            },
        },
        "hazards": {
            "disease": 0.1, "tension": 0.1, "pollution": 0.1, "seismic": 0.05,
            "grid_overload": 0.0, "drought": 0.0, "inequality": 0.1, "fraud": 0.05,
        },
        "research": {
            "hypotheses": 20, "experiments": 30, "completed": 24,
            "replicated": 20, "fraud_risk": 0.05, "invention_candidates": 6,
        },
    }


def _stressed_snapshot() -> dict:
    """A civilisation in trouble: scarcity, fragile knowledge, hazards, fraud."""
    return {
        "tech_level": 0.85,
        "resources": {
            "food": {"have": 30.0, "need": 100.0},
            "water": {"have": 40.0, "need": 150.0},
            "timber": {"have": 10.0, "need": 60.0},
            "stone": {"have": 20.0, "need": 50.0},
            "ores": {"have": 5.0, "need": 40.0},
            "fuels": {"have": 5.0, "need": 40.0},
            "rare_earths": {"have": 1.0, "need": 10.0},
            "medicines": {"have": 5.0, "need": 30.0},
            "textiles": {"have": 5.0, "need": 30.0},
            "energy": {"have": 20.0, "need": 80.0},
            "labour": {"have": 20.0, "need": 70.0},
            "knowledge": {"have": 10.0, "need": 60.0},
        },
        "institutions": {
            "families": {"strength": 0.4},
            "guilds": {"strength": 0.2},
        },
        "knowledge": {
            "facts": [
                {"id": "fire", "state": "known", "holders": 1, "docs": 0},
                {"id": "wheel", "state": "disputed", "holders": 1, "docs": 0},
                {"id": "writing", "state": "lost", "holders": 0, "docs": 0},
                {"id": "smelting", "state": "banned", "holders": 2, "docs": 1},
            ],
        },
        "economy": {
            "money_supply": 2000.0, "prev_money_supply": 1000.0,
            "goods": 800.0, "prev_goods": 1000.0,
            "market": {
                "grain": {"supply": 20.0, "demand": 200.0, "price": 30.0,
                          "seller_share": 0.9},
                "iron": {"supply": 10.0, "demand": 90.0, "price": 50.0,
                         "seller_share": 0.85},
            },
        },
        "hazards": {
            "disease": 0.7, "tension": 0.8, "pollution": 0.7, "seismic": 0.4,
            "grid_overload": 0.6, "drought": 0.5, "inequality": 0.7, "fraud": 0.6,
        },
        "research": {
            "hypotheses": 40, "experiments": 30, "completed": 10,
            "replicated": 2, "fraud_risk": 0.6, "invention_candidates": 1,
        },
    }


# ── ResourceOS ───────────────────────────────────────────────────────────────
def test_resource_pressure_healthy_vs_stressed():
    healthy = resource_pressure(_healthy_snapshot())
    stressed = resource_pressure(_stressed_snapshot())
    # Surplus reads near zero; deep shortfall reads high.
    assert healthy["food"] == 0.0
    assert stressed["food"] > 0.6
    for name in healthy:
        assert 0.0 <= healthy[name] <= 1.0
        assert stressed[name] >= healthy[name]


def test_shortage_risks_flags_critical_vitals():
    risks = shortage_risks(_stressed_snapshot())
    names = {r["resource"] for r in risks}
    assert {"food", "water", "medicines", "energy"} <= names
    crit = {r["resource"] for r in risks if r["severity"] == "critical"}
    assert "food" in crit and "water" in crit
    # Worst-first ordering.
    severities = [r["pressure"] for r in risks]
    assert severities == sorted(severities, reverse=True)
    # Healthy world has no meaningful shortages.
    assert shortage_risks(_healthy_snapshot()) == []


# ── InstitutionOS ────────────────────────────────────────────────────────────
def test_institutional_capacity_orders_correctly():
    healthy = institutional_capacity(_healthy_snapshot())
    stressed = institutional_capacity(_stressed_snapshot())
    assert 0.0 <= stressed < healthy <= 1.0
    assert institutional_capacity({}) == 0.0


def test_missing_institutions_tracks_tech_level():
    snap = _healthy_snapshot()
    # At high tech, the healthy world still lacks labs/corporations/patent offices.
    missing_high = missing_institutions(snap, 0.85)
    assert "labs" in missing_high
    assert "patent_offices" in missing_high
    # At low tech nothing advanced is demanded yet.
    assert missing_institutions(snap, 0.0) == []


# ── KnowledgeOS ──────────────────────────────────────────────────────────────
def test_knowledge_health_healthy_vs_stressed():
    healthy = knowledge_health(_healthy_snapshot())
    stressed = knowledge_health(_stressed_snapshot())
    assert healthy["health"] > stressed["health"]
    assert healthy["durable_fraction"] > stressed["durable_fraction"]
    assert stressed["fragile_fraction"] > healthy["fragile_fraction"]
    assert knowledge_health({})["total"] == 0


def test_at_risk_knowledge_finds_thinly_held_facts():
    at_risk = at_risk_knowledge(_stressed_snapshot())
    ids = {f["id"] for f in at_risk}
    # fire (1 holder, 0 docs) is fragile; lost 'writing' is already gone, excluded.
    assert "fire" in ids
    assert "writing" not in ids
    # Healthy world: well-held facts are not at risk.
    assert at_risk_knowledge(_healthy_snapshot()) == []


# ── EconomyOS ────────────────────────────────────────────────────────────────
def test_economic_state_detects_inflation_and_monopoly():
    healthy = economic_state(_healthy_snapshot())
    stressed = economic_state(_stressed_snapshot())
    assert stressed["inflation"] > healthy["inflation"]
    assert stressed["monopoly"] > healthy["monopoly"]
    assert stressed["supply_demand"] > healthy["supply_demand"]
    assert stressed["stability"] < healthy["stability"]


# ── RiskOS ───────────────────────────────────────────────────────────────────
def test_risk_register_ranks_and_attributes_drivers():
    register = risk_register(_stressed_snapshot())
    assert register, "stressed world must surface live risks"
    sev = [e.severity for e in register]
    assert sev == sorted(sev, reverse=True)
    risks = {e.risk for e in register}
    assert Risk.FAMINE in risks and Risk.KNOWLEDGE_LOSS in risks
    # Top entries carry named drivers, and all severities are in range.
    assert all(0.0 <= e.severity <= 1.0 for e in register)
    famine = next(e for e in register if e.risk == Risk.FAMINE)
    assert any("food" in d for d in famine.drivers)


def test_risk_register_quiet_for_healthy_world():
    healthy = risk_register(_healthy_snapshot())
    stressed = risk_register(_stressed_snapshot())
    healthy_top = healthy[0].severity if healthy else 0.0
    assert healthy_top < stressed[0].severity
    # Healthy world should not be flagged for collapse.
    assert Risk.COLLAPSE not in {e.risk for e in healthy}


# ── ResearchOS ───────────────────────────────────────────────────────────────
def test_research_throughput_rewards_replication_punishes_fraud():
    healthy = research_throughput(_healthy_snapshot())
    stressed = research_throughput(_stressed_snapshot())
    assert healthy["replication_rate"] > stressed["replication_rate"]
    assert healthy["soundness"] > stressed["soundness"]
    assert stressed["fraud_risk"] > healthy["fraud_risk"]
    assert research_throughput({})["throughput"] == 0.0


# ── civ_dashboard composition ────────────────────────────────────────────────
def test_civ_dashboard_composes_all_six_modules():
    dash = civ_dashboard(_healthy_snapshot())
    for key in ("resources", "institutions", "knowledge", "economy", "risk",
                "research"):
        assert key in dash["components"]
        assert 0.0 <= dash["components"][key] <= 1.0
    assert 0.0 <= dash["overall_health"] <= 1.0
    assert len(dash["top_concerns"]) <= 3


def test_overall_health_drops_under_stress():
    healthy = civ_dashboard(_healthy_snapshot())["overall_health"]
    stressed = civ_dashboard(_stressed_snapshot())["overall_health"]
    assert healthy > 0.6
    assert stressed < healthy
    assert stressed < 0.5


def test_dashboard_surfaces_actionable_concerns_under_stress():
    dash = civ_dashboard(_stressed_snapshot())
    assert dash["top_concerns"], "a stressed civilisation must surface concerns"
    # Concerns are severity-ordered.
    sev = [c["severity"] for c in dash["top_concerns"]]
    assert sev == sorted(sev, reverse=True)
    # Healthy world surfaces few/no high-severity concerns.
    healthy = civ_dashboard(_healthy_snapshot())
    assert all(c["severity"] <= dash["top_concerns"][0]["severity"]
               for c in healthy["top_concerns"])


def test_scarcity_specifically_lowers_resource_component():
    base = _healthy_snapshot()
    scarce = copy.deepcopy(base)
    for r in scarce["resources"].values():
        r["have"] = r["need"] * 0.1
    assert (civ_dashboard(scarce)["components"]["resources"]
            < civ_dashboard(base)["components"]["resources"])


def test_knowledge_at_risk_lowers_knowledge_component():
    base = _healthy_snapshot()
    fragile = copy.deepcopy(base)
    for f in fragile["knowledge"]["facts"]:
        f["holders"] = 1
        f["docs"] = 0
    assert (civ_dashboard(fragile)["components"]["knowledge"]
            < civ_dashboard(base)["components"]["knowledge"])


# ── determinism ──────────────────────────────────────────────────────────────
def test_determinism_same_snapshot_same_dashboard():
    snap = _stressed_snapshot()
    a = civ_dashboard(copy.deepcopy(snap))
    b = civ_dashboard(copy.deepcopy(snap))
    assert a == b
    # Module-level functions are deterministic too.
    assert resource_pressure(snap) == resource_pressure(snap)
    assert [e.severity for e in risk_register(snap)] == \
        [e.severity for e in risk_register(snap)]
