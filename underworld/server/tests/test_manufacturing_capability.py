"""Tests for real manufacturing capability/yield models — assert known facts."""
import math

from underworld.server.services import manufacturing_capability as mc


def test_cp_of_centred_three_sigma_process_is_one():
    # USL-LSL = 6 sigma -> Cp = 1 exactly
    assert abs(mc.cp(usl=6.0, lsl=0.0, sigma=1.0) - 1.0) < 1e-9


def test_cpk_penalises_off_centre_mean():
    centred = mc.cpk(usl=6, lsl=0, mean=3, sigma=1)
    off = mc.cpk(usl=6, lsl=0, mean=4, sigma=1)
    assert abs(centred - 1.0) < 1e-9
    assert off < centred                       # shifting the mean lowers Cpk


def test_control_limits_and_violations():
    data = [10, 10.1, 9.9, 10.0, 10.2, 9.8] * 3 + [20.0]   # last is wild
    lim = mc.control_limits(data)
    viol = mc.out_of_control(data, lim)
    assert lim["lcl"] < lim["center"] < lim["ucl"]
    assert (len(data) - 1) in viol


def test_murphy_yield_above_poisson_for_clustering():
    # Murphy's clustering model gives higher yield than plain Poisson
    d, a = 0.5, 1.0
    assert mc.murphy_yield(d, a) > mc.poisson_yield(d, a)
    assert 0 < mc.murphy_yield(d, a) < 1


def test_wafer_yield_counts_good_dies():
    w = mc.wafer_yield(0.2, 0.5, dies_per_wafer=200, model="poisson")
    assert 0 < w["good_dies"] < 200
    assert abs(w["yield"] - math.exp(-0.1)) < 1e-4


def test_defect_rate_ppm():
    assert mc.defect_rate_ppm(0.999999) == 1.0


def test_iso_cleanroom_class_known_limit():
    # ISO class 5 limit at 0.5um is ~3520 particles/m3
    assert mc.iso_cleanroom_class(3000, size_um=0.5) <= 5
    assert mc.iso_cleanroom_class(50000, size_um=0.5) > 5
    gate = mc.cleanroom_gate(3000, required_class=5)
    assert gate["passes"] is True


def test_process_capable_tolerance_comparison():
    # machining (~25um) can hold 0.1mm but not 1um
    assert mc.process_capable("machining", 0.1)["capable"] is True
    assert mc.process_capable("machining", 0.001)["capable"] is False
    assert mc.process_capable("unknownproc", 0.1)["known"] is False


def test_scale_up_risk_flags_low_lab_cpk():
    assert mc.scale_up_risk(lab_cpk=2.0)["capable_at_scale"] is True
    assert mc.scale_up_risk(lab_cpk=1.4)["risk"] == "high"


def test_recipe_compile_orders_and_sums():
    r = mc.recipe_compile([{"name": "b", "order": 2, "time_min": 5, "cost": 2},
                           {"name": "a", "order": 1, "time_min": 3, "cost": 1}])
    assert r["sequence"] == ["a", "b"]
    assert r["total_time_min"] == 8.0


def test_bottleneck_is_lowest_throughput_stage():
    b = mc.bottleneck({"cut": 100, "weld": 40, "paint": 80})
    assert b["bottleneck"] == "weld"
    assert b["line_rate"] == 40


def test_statistical_process_control_flags_violations():
    spc = mc.statistical_process_control([10, 10.1, 9.9, 10.0, 10.05] * 3 + [30.0])
    assert spc["in_control"] is False
    assert len(spc["violations"]) >= 1


def test_quality_control_gate():
    good = mc.quality_control([10.0, 10.1, 9.9, 10.0], usl=11, lsl=9)
    bad = mc.quality_control([10.0, 8.0, 12.0, 9.0], usl=11, lsl=9)
    assert good["passes"] is True
    assert bad["passes"] is False


def test_yield_prediction_canonical():
    y = mc.yield_prediction(0.1, 0.5, dies_per_wafer=100)
    assert 0 < y["good_dies"] <= 100


def test_supply_substitution_ranks_by_compatibility():
    table = {"tungsten": {"molybdenum": 0.8, "tantalum": 0.6}}
    subs = mc.supply_substitution("tungsten", table)
    assert subs[0]["substitute"] == "molybdenum"


def test_tooling_requirements_maps_steps():
    req = mc.tooling_requirements(["casting", "machining"])
    assert "furnace" in req["by_step"]["casting"]
    assert req["tool_count"] >= 2
