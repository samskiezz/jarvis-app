"""Big-missing: measurement instruments + standards/units (#1 cross-cutting)."""

from __future__ import annotations

from underworld.server.services import instruments, standards
from underworld.server.services.instruments import Instrument


# ── instruments: measurement uncertainty shrinks as instruments improve ──────
def test_better_instrument_gives_tighter_uncertainty():
    coarse = instruments.measure(100.0, Instrument.RULER)
    fine = instruments.measure(100.0, Instrument.ELECTRON_MICROSCOPE)
    assert fine.uncertainty < coarse.uncertainty
    # ordering follows the base-precision ladder
    assert instruments.base_precision(Instrument.ELECTRON_MICROSCOPE) < \
        instruments.base_precision(Instrument.RULER)


def test_calibration_error_widens_band_and_offsets_value():
    clean = instruments.measure(50.0, Instrument.BALANCE)
    biased = instruments.measure(50.0, Instrument.BALANCE, calibration_error=2.0)
    assert biased.uncertainty > clean.uncertainty
    assert biased.value == 52.0


def test_explicit_precision_overrides_base():
    m = instruments.measure(10.0, Instrument.RULER, precision=1e-5)
    # uncertainty ~ |value| * precision = 10 * 1e-5
    assert m.uncertainty < instruments.measure(10.0, Instrument.RULER).uncertainty
    assert m.instrument is Instrument.RULER


# ── instruments: unlock gating ───────────────────────────────────────────────
def test_instrument_unlocks_expected_science():
    assert "cell-theory" in instruments.instrument_unlocks(Instrument.MICROSCOPE)
    assert "germ-theory" in instruments.instrument_unlocks(Instrument.MICROSCOPE)
    assert "astronomy" in instruments.instrument_unlocks(Instrument.TELESCOPE)
    assert "genetics" in instruments.instrument_unlocks(Instrument.GENOME_SEQUENCER)
    assert "chemical-composition" in \
        instruments.instrument_unlocks(Instrument.SPECTROMETER)


def test_can_measure_requires_the_right_instrument():
    assert instruments.can_measure("temperature", {Instrument.THERMOMETER}) is True
    assert instruments.can_measure("temperature", {Instrument.RULER}) is False
    assert instruments.can_measure("voltage", {Instrument.VOLTMETER}) is True
    # unknown quantities can never be measured
    assert instruments.can_measure("happiness", set(Instrument)) is False


def test_measurement_limited_science_is_blocked_until_tool_built():
    none_built: set[Instrument] = set()
    blocked = instruments.measurement_limited_science(none_built)
    assert "thermodynamics" in blocked
    assert "genetics" in blocked
    # build the thermometer → thermodynamics is no longer blocked
    with_thermo = instruments.measurement_limited_science({Instrument.THERMOMETER})
    assert "thermodynamics" not in with_thermo
    assert "genetics" in with_thermo  # still no sequencer


def test_full_instrument_set_blocks_nothing():
    assert instruments.measurement_limited_science(set(Instrument)) == []


# ── standards: unit-system maturity rises with more standards ────────────────
def test_unit_system_maturity_rises_with_standards():
    empty = standards.unit_system_maturity({})
    partial = standards.unit_system_maturity(
        {"standards": {"units": True, "calibration": True}}
    )
    full = standards.unit_system_maturity(
        {"standards": {"units": True, "calibration": True,
                       "weights_and_measures": True,
                       "standard_temp_pressure": True, "tolerances": True}}
    )
    assert empty == 0.0
    assert 0.0 < partial < full
    assert full == 1.0


# ── standards: calibration corrects a systematic offset ──────────────────────
def test_calibrate_corrects_offset():
    # an instrument reading consistently ~2 low against a reference of 100
    cal = standards.calibrate([97.0, 98.0, 99.0], 100.0)
    assert cal["offset"] > 0  # must add to correct the under-reading
    assert abs(cal["corrected_mean"] - 100.0) < 1e-9
    assert cal["residual_error"] > 0  # spread that calibration can't remove


def test_calibrate_handles_empty_readings():
    cal = standards.calibrate([], 42.0)
    assert cal["offset"] == 0.0
    assert cal["scale"] == 1.0
    assert cal["corrected_mean"] == 42.0


# ── standards: tolerance grades tighten ──────────────────────────────────────
def test_tolerance_class_tightens_by_grade():
    # a part 1% off nominal: fine within coarse, fails precision
    coarse = standards.tolerance_class(10.1, 10.0, grade="coarse")
    precision = standards.tolerance_class(10.1, 10.0, grade="precision")
    assert coarse["within_tolerance"] is True
    assert precision["within_tolerance"] is False
    assert precision["allowed"] < coarse["allowed"]


# ── standards: interchangeable parts ─────────────────────────────────────────
def test_interchangeability_passes_tight_batch():
    parts = [{"dimension": d} for d in (10.000, 10.001, 9.999, 10.000)]
    result = standards.interchangeability(parts, grade="fine")
    assert result["interchangeable"] is True
    assert result["failures"] == []


def test_interchangeability_fails_loose_batch():
    parts = [{"dimension": d} for d in (10.0, 10.0, 12.5, 9.8)]
    result = standards.interchangeability(parts, grade="fine")
    assert result["interchangeable"] is False
    assert 2 in result["failures"]  # the 12.5 outlier
    assert result["max_deviation"] > 0


# ── standards: gaps for tech level ───────────────────────────────────────────
def test_standards_gaps_flag_missing_bodies():
    snap = {"tech_level": 0.9, "standards": {"units": True}}
    gaps = standards.standards_gaps(snap)
    assert "calibration" in gaps
    assert "tolerances" in gaps
    assert "units" not in gaps  # already established


def test_standards_gaps_empty_for_low_tech_with_units():
    snap = {"tech_level": 0.1, "standards": {"units": True}}
    assert standards.standards_gaps(snap) == []
