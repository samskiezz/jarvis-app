"""Measurement Instruments — the technology that lets a civilisation *quantify*.

The design's "big-missing" #1: science does not advance by thinking alone. It
advances when instruments improve. A world can philosophise about heat forever,
but it cannot *do* thermodynamics until someone builds a thermometer; it cannot
see a cell until someone grinds a microscope; it cannot sequence a gene until it
has a genome sequencer. Each instrument both (a) puts numbers on a quantity with
bounded uncertainty, and (b) *unlocks* whole regions of the knowledge graph that
were physically unobservable before.

Pure core — no DB, no async, no LLM. Two ideas live here:

  measure()                 turn a true value + an instrument into a Measurement
                            whose uncertainty shrinks as the instrument improves.
  instrument gating         which science a set of instruments enables, and which
                            science stays blocked until the right tool is built
                            (the spec's "improve measurement → unlock" loop).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


# ── the instruments a civilisation can build, coarsest → finest ──────────────
class Instrument(str, Enum):
    RULER = "ruler"
    BALANCE = "balance"
    CLOCK = "clock"
    THERMOMETER = "thermometer"
    BAROMETER = "barometer"
    MICROSCOPE = "microscope"
    TELESCOPE = "telescope"
    VOLTMETER = "voltmeter"
    OSCILLOSCOPE = "oscilloscope"
    SPECTROMETER = "spectrometer"
    CHROMATOGRAPH = "chromatograph"
    MASS_SPECTROMETER = "mass_spectrometer"
    ELECTRON_MICROSCOPE = "electron_microscope"
    GENOME_SEQUENCER = "genome_sequencer"
    PARTICLE_DETECTOR = "particle_detector"


# Base precision = the relative resolution floor of each instrument (smaller is
# finer). A wooden RULER is coarse (~1%); an ELECTRON_MICROSCOPE resolves to
# parts-per-million. These set how tight a Measurement's error bound can get.
_BASE_PRECISION: dict[Instrument, float] = {
    Instrument.RULER: 1.0e-2,
    Instrument.BALANCE: 5.0e-3,
    Instrument.CLOCK: 2.0e-3,
    Instrument.THERMOMETER: 5.0e-3,
    Instrument.BAROMETER: 5.0e-3,
    Instrument.MICROSCOPE: 1.0e-3,
    Instrument.TELESCOPE: 1.0e-3,
    Instrument.VOLTMETER: 5.0e-4,
    Instrument.OSCILLOSCOPE: 2.0e-4,
    Instrument.SPECTROMETER: 1.0e-4,
    Instrument.CHROMATOGRAPH: 5.0e-5,
    Instrument.MASS_SPECTROMETER: 1.0e-5,
    Instrument.ELECTRON_MICROSCOPE: 1.0e-6,
    Instrument.GENOME_SEQUENCER: 1.0e-6,
    Instrument.PARTICLE_DETECTOR: 1.0e-7,
}


# What region of science each instrument makes *observable* for the first time.
# Returned ids look like knowledge-graph node ids so callers can wire unlocked
# science straight into the graph's prerequisite reasoning.
_UNLOCKS: dict[Instrument, tuple[str, ...]] = {
    Instrument.RULER: ("geometry", "metrology"),
    Instrument.BALANCE: ("conservation-of-mass", "stoichiometry"),
    Instrument.CLOCK: ("kinematics", "celestial-navigation"),
    Instrument.THERMOMETER: ("thermodynamics", "calorimetry"),
    Instrument.BAROMETER: ("gas-laws", "meteorology"),
    Instrument.MICROSCOPE: ("cell-theory", "germ-theory", "microbiology"),
    Instrument.TELESCOPE: ("astronomy", "heliocentrism"),
    Instrument.VOLTMETER: ("electrical-theory", "ohms-law"),
    Instrument.OSCILLOSCOPE: ("electronics", "signal-theory"),
    Instrument.SPECTROMETER: ("chemical-composition", "spectroscopy"),
    Instrument.CHROMATOGRAPH: ("analytical-chemistry", "separation-science"),
    Instrument.MASS_SPECTROMETER: ("isotope-analysis", "molecular-mass"),
    Instrument.ELECTRON_MICROSCOPE: ("nanostructure", "virology"),
    Instrument.GENOME_SEQUENCER: ("genetics", "molecular-biology"),
    Instrument.PARTICLE_DETECTOR: ("particle-physics", "standard-model"),
}


# Which instrument is *required* to quantify a given physical quantity. This is
# the gate: you cannot put a number on "temperature" without a THERMOMETER.
_REQUIRED_FOR: dict[str, Instrument] = {
    "length": Instrument.RULER,
    "distance": Instrument.RULER,
    "mass": Instrument.BALANCE,
    "weight": Instrument.BALANCE,
    "time": Instrument.CLOCK,
    "temperature": Instrument.THERMOMETER,
    "pressure": Instrument.BAROMETER,
    "cell-size": Instrument.MICROSCOPE,
    "star-position": Instrument.TELESCOPE,
    "voltage": Instrument.VOLTMETER,
    "waveform": Instrument.OSCILLOSCOPE,
    "spectrum": Instrument.SPECTROMETER,
    "composition": Instrument.CHROMATOGRAPH,
    "isotope-ratio": Instrument.MASS_SPECTROMETER,
    "nanostructure": Instrument.ELECTRON_MICROSCOPE,
    "dna-sequence": Instrument.GENOME_SEQUENCER,
    "particle-track": Instrument.PARTICLE_DETECTOR,
}


# Physical units each quantity is reported in (used to label Measurements).
_QUANTITY_UNIT: dict[str, str] = {
    "length": "m",
    "distance": "m",
    "mass": "kg",
    "weight": "N",
    "time": "s",
    "temperature": "K",
    "pressure": "Pa",
    "cell-size": "um",
    "star-position": "deg",
    "voltage": "V",
    "waveform": "V",
    "spectrum": "nm",
    "composition": "frac",
    "isotope-ratio": "ratio",
    "nanostructure": "nm",
    "dna-sequence": "bp",
    "particle-track": "GeV",
}


@dataclass(frozen=True)
class Measurement:
    """A single quantified reading with its honest error bar."""

    quantity: str
    value: float
    unit: str
    uncertainty: float
    instrument: Instrument


# ── taking a measurement ─────────────────────────────────────────────────────
def base_precision(instrument: Instrument) -> float:
    """Relative resolution floor of `instrument` (smaller = finer)."""
    return _BASE_PRECISION[instrument]


def measure(
    true_value: float,
    instrument: Instrument,
    *,
    quantity: str = "",
    calibration_error: float = 0.0,
    precision: float | None = None,
) -> Measurement:
    """Quantify `true_value` with `instrument`, returning a Measurement.

    The reported uncertainty is bounded by the instrument's own precision (its
    base resolution floor, overridable via `precision`) plus any calibration
    error. A better instrument has a smaller base precision, so its Measurement
    carries a tighter uncertainty — the whole point of "improve measurement":

        uncertainty = |true_value| * precision + |calibration_error|

    The reported value is the truth offset by the (systematic) calibration
    error; the uncertainty is the band we honestly claim around it. Nothing here
    is random — it is a deterministic worst-case bound, fully unit-testable.
    """
    res = base_precision(instrument) if precision is None else max(0.0, precision)
    magnitude = abs(true_value) if true_value != 0.0 else 1.0
    uncertainty = magnitude * res + abs(calibration_error)
    value = true_value + calibration_error
    unit = _QUANTITY_UNIT.get(quantity, "")  # label the reading when caller names it
    return Measurement(
        quantity=quantity,
        value=value,
        unit=unit,
        uncertainty=uncertainty,
        instrument=instrument,
    )


# ── what science the instruments unlock ──────────────────────────────────────
def instrument_unlocks(instrument: Instrument) -> list[str]:
    """Knowledge-node ids that `instrument` makes observable for the first time.

    A MICROSCOPE unlocks cells and germ theory; a SPECTROMETER unlocks chemical
    composition; a TELESCOPE unlocks astronomy; a GENOME_SEQUENCER unlocks
    genetics. Returned ids slot straight into the knowledge graph.
    """
    return list(_UNLOCKS.get(instrument, ()))


def required_instrument(quantity: str) -> Instrument | None:
    """Which instrument is needed to quantify `quantity` (None if unknown)."""
    return _REQUIRED_FOR.get(quantity)


def can_measure(quantity: str, available: set[Instrument]) -> bool:
    """Can a civilisation holding `available` instruments quantify `quantity`?

    Temperature needs a THERMOMETER, voltage needs a VOLTMETER, and so on. An
    unknown quantity (no instrument maps to it) can never be measured.
    """
    needed = _REQUIRED_FOR.get(quantity)
    return needed is not None and needed in available


def measurement_limited_science(available: set[Instrument]) -> list[str]:
    """Science that stays blocked because its enabling instrument isn't built.

    This is the spec's gating made explicit: collect every science region that
    *some* instrument would unlock, minus everything the instruments on hand
    already unlock. The result is the "you cannot study this yet — build the
    tool first" list. Sorted for deterministic output.
    """
    unlocked: set[str] = set()
    blocked: set[str] = set()
    for instrument, sciences in _UNLOCKS.items():
        if instrument in available:
            unlocked.update(sciences)
        else:
            blocked.update(sciences)
    return sorted(blocked - unlocked)
