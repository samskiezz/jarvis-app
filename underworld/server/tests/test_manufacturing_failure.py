"""Big-missing: manufacturing tolerance + supply-chain, failure modes + safety."""

from __future__ import annotations

from underworld.server.services import failure_modes, manufacturing
from underworld.server.services.failure_modes import FailureMode, SafetyCheck
from underworld.server.services.manufacturing import Process


# ── manufacturing: capability gate ───────────────────────────────────────────
def test_transistor_blocked_for_low_tech_civ():
    transistor = {
        "required_processes": [Process.LITHOGRAPHY, Process.CLEAN_ROOM],
        "required_precision": 0.95,
    }
    bronze_age = {Process.HAND_TOOLS, Process.CASTING, Process.FORGING}
    ok, missing = manufacturing.can_manufacture(transistor, bronze_age)
    assert ok is False
    assert Process.LITHOGRAPHY.value in missing
    assert Process.CLEAN_ROOM.value in missing


def test_transistor_passes_for_high_tech_civ():
    transistor = {
        "required_processes": [Process.LITHOGRAPHY, Process.CLEAN_ROOM],
        "required_precision": 0.95,
    }
    fab = {
        Process.LITHOGRAPHY,
        Process.CLEAN_ROOM,
        Process.METROLOGY,
        Process.CNC,
    }
    ok, missing = manufacturing.can_manufacture(transistor, fab)
    assert ok is True
    assert missing == []


def test_precision_shortfall_blocks_even_with_processes():
    # Has the required process, but its toolset can't hit the demanded tolerance.
    req = {"required_processes": [Process.HAND_TOOLS], "required_precision": 0.9}
    ok, missing = manufacturing.can_manufacture(req, {Process.HAND_TOOLS})
    assert ok is False
    assert any(m.startswith("precision:") for m in missing)


def test_process_precision_ordering():
    # Lithography is ultra-fine; hand tools are coarse.
    assert manufacturing.process_precision(Process.LITHOGRAPHY) > \
        manufacturing.process_precision(Process.HAND_TOOLS)
    assert 0.0 <= manufacturing.process_precision(Process.HAND_TOOLS) <= 1.0


# ── manufacturing: supply-chain depth ────────────────────────────────────────
def test_supply_chain_expands_radio_to_leaves():
    recipe = {
        "radio": ["wire", "vacuum_tube", "chassis"],
        "wire": ["drawn_copper", "insulation"],
        "drawn_copper": ["copper_ingot"],
        "copper_ingot": ["copper_ore"],
        "copper_ore": [],          # leaf — mined
        "insulation": ["rubber"],
        "rubber": [],              # leaf
        "vacuum_tube": ["glass", "filament"],
        "glass": [],               # leaf
        "filament": [],            # leaf
        "chassis": ["steel_sheet"],
        "steel_sheet": [],         # leaf
    }
    chain = manufacturing.supply_chain("radio", recipe)
    names = {entry["artifact"] for entry in chain}
    # The deep upstream dependency copper-ore is reached.
    assert "copper_ore" in names
    assert "rubber" in names
    # Leaves are flagged, and the root's direct inputs sit at depth 1.
    leaves = {e["artifact"] for e in chain if e["leaf"]}
    assert "copper_ore" in leaves and "glass" in leaves
    depths = {e["artifact"]: e["depth"] for e in chain}
    assert depths["wire"] == 1
    assert depths["copper_ore"] > depths["wire"]


def test_supply_chain_handles_cycle_safely():
    recipe = {"a": ["b"], "b": ["a"]}  # pathological cycle
    chain = manufacturing.supply_chain("a", recipe)
    # Terminates and does not blow the stack.
    assert any(e["artifact"] == "b" for e in chain)


# ── manufacturing: yield ─────────────────────────────────────────────────────
def test_yield_falls_with_complexity():
    simple = manufacturing.yield_rate(0.8, complexity=0.1)
    complex_ = manufacturing.yield_rate(0.8, complexity=0.9)
    assert simple > complex_
    assert 0.0 <= complex_ <= simple <= 1.0


def test_yield_rises_with_precision():
    coarse = manufacturing.yield_rate(0.3, complexity=0.5)
    fine = manufacturing.yield_rate(0.95, complexity=0.5)
    assert fine > coarse


# ── failure modes: FMEA ──────────────────────────────────────────────────────
def test_fmea_ranks_risks_by_rpn_descending():
    device = {
        "materials": ["steel", "rubber"],
        "operating_temp": 120.0,
        "complexity": 0.8,
        "maintenance_level": 0.2,
        "environment": "marine",
    }
    risks = failure_modes.fmea(device)
    assert len(risks) >= 3
    rpns = [r.rpn for r in risks]
    assert rpns == sorted(rpns, reverse=True)
    # Every risk carries a self-consistent RPN.
    for r in risks:
        expected = round(r.probability * r.severity * (1 - r.detectability) * 1000.0, 3)
        assert r.rpn == expected


def test_fmea_environment_gates_corrosion():
    benign = {"materials": ["steel"], "environment": "benign"}
    marine = {"materials": ["steel"], "environment": "marine"}
    benign_modes = {r.mode for r in failure_modes.fmea(benign)}
    marine_modes = {r.mode for r in failure_modes.fmea(marine)}
    assert FailureMode.CORROSION not in benign_modes
    assert FailureMode.CORROSION in marine_modes


# ── failure modes: MTTF ──────────────────────────────────────────────────────
def test_mttf_drops_as_risks_rise():
    safe = {
        "materials": ["plastic"],
        "operating_temp": 20.0,
        "complexity": 0.1,
        "maintenance_level": 0.95,
        "environment": "benign",
    }
    dangerous = {
        "materials": ["steel"],
        "operating_temp": 250.0,
        "complexity": 0.95,
        "maintenance_level": 0.05,
        "environment": "corrosive",
    }
    safe_mttf = failure_modes.mean_time_to_failure(
        failure_modes.fmea(safe), base_hours=10000.0)
    danger_mttf = failure_modes.mean_time_to_failure(
        failure_modes.fmea(dangerous), base_hours=10000.0)
    assert danger_mttf < safe_mttf
    # No-risk device lasts the full base lifetime.
    assert failure_modes.mean_time_to_failure([], base_hours=10000.0) == 10000.0


# ── failure modes: safety engineering ────────────────────────────────────────
def test_safety_flags_high_pressure_high_voltage_controls():
    boiler = {
        "operating_temp": 250.0,
        "pressure": 800.0,
        "voltage": 240.0,
        "moving_parts": True,
    }
    result = failure_modes.safety_assessment(boiler)
    assert result["passed"] is False
    assert SafetyCheck.PRESSURE_VESSEL.value in result["violations"]
    assert SafetyCheck.ELECTRICAL_ISOLATION.value in result["violations"]
    assert "pressure_relief_valve" in result["required_controls"]
    assert "electrical_isolation" in result["required_controls"]


def test_safety_passes_when_controls_present():
    device = {
        "pressure": 800.0,
        "voltage": 240.0,
        "controls": ["pressure_relief_valve", "electrical_isolation"],
    }
    result = failure_modes.safety_assessment(device)
    assert result["passed"] is True
    assert result["violations"] == []
    assert result["required_controls"] == []


def test_safety_benign_device_passes_clean():
    result = failure_modes.safety_assessment({"operating_temp": 30.0})
    assert result["passed"] is True
    assert result["violations"] == []
