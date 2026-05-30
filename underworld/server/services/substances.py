"""Stimulants & addiction (doc II.148-149).

Once a civilization can do chemistry, stimulants appear. A hit relieves fatigue
and stress in the short term — but every use builds dependency, dependency brings
tolerance (the same hit does less), and an addict who abstains suffers withdrawal
(stress up, sanity and health down). Recovery is slow. This is a real trade-off
the simulation applies, not a cosmetic flag.
"""

from __future__ import annotations

from ..db.models import Minion

RELIEF = 0.25          # baseline fatigue/stress relief from a fresh hit
ADDICT_GAIN = 0.12     # dependency added per use
TOLERANCE = 0.7        # how strongly addiction blunts the benefit
WITHDRAWAL = 0.06      # per-tick cost while addicted and abstaining
RECOVERY = 0.03        # addiction decay per clean tick
ADDICTED_AT = 0.3      # threshold above which withdrawal bites

# Stimulants require the chemistry of an industrial-or-later civilization.
AVAILABLE_ERAS = {"industrial", "electric", "information", "quantum"}


def _f(v: float | None, default: float = 0.0) -> float:
    return default if v is None else v


def use_stimulant(m: Minion) -> float:
    """Apply a stimulant hit. Returns the effective relief delivered."""
    addiction = _f(m.addiction)
    effect = RELIEF * (1.0 - TOLERANCE * addiction)   # tolerance blunts the high
    effect = max(0.0, effect)
    m.fatigue = min(1.0, m.fatigue + effect)
    m.stress = max(0.0, m.stress - 0.5 * effect)
    m.addiction = min(1.0, addiction + ADDICT_GAIN)
    return round(effect, 4)


def tick_addiction(m: Minion, *, used: bool) -> None:
    """Resolve dependency for one tick: withdrawal if abstaining, else recovery."""
    addiction = _f(m.addiction)
    if used:
        return
    if addiction >= ADDICTED_AT:
        bite = WITHDRAWAL * addiction
        m.sanity = max(0.0, m.sanity - bite)
        m.stress = min(1.0, m.stress + bite)
        m.health = max(0.0, m.health - 0.5 * bite)
    m.addiction = max(0.0, addiction - RECOVERY)


def wants_stimulant(m: Minion, era: str) -> bool:
    """Heuristic urge: available era, plus exhaustion or an existing habit."""
    if era not in AVAILABLE_ERAS:
        return False
    return m.fatigue < 0.3 or _f(m.addiction) >= ADDICTED_AT
