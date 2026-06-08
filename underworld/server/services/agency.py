"""AGENCY — autonomy + the focal-set selector (Bible Annex A.9 / L.7).

Per-minion `autonomy ∈ [0,1]` rises with awareness/reputation/saga-involvement/age and governs:
override RESISTANCE, the possession EXPEL threshold (the most awakened cannot be fully puppeted),
and saga-initiation eligibility (high-autonomy minions start sagas, defy laws, act against the
creator — the rebellion is mechanically funded).

    autonomy = clamp01(0.4·awareness + 0.3·norm(reputation) + 0.2·saga_involvement + 0.1·norm(age))

select_hot (L.7): today the hot set is purely ORDER BY reputation DESC LIMIT n; the canonical set
is the UNION with what the player is looking at / the live story / the worn body / override
targets, capped at the LLM budget with priority eviction so the focal set is never starved:

    hot = top_reputation(N) ∪ gaze_focus ∪ saga_cast ∪ possessed ∪ override_targets   (cap=BUDGET)
    eviction priority (keep first): possessed/confront > gaze > saga > reputation
"""
from __future__ import annotations

from typing import Iterable, Optional

HOT_BUDGET = 24                       # mirrors the concurrent-LLM governor


def _clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def compute_autonomy(m, *, world_tick: int = 0) -> float:
    """The L.7 formula. Reads awareness/saga from brain, reputation/age from the row. Cheap;
    recomputed in the Director step and stored at brain['autonomy']."""
    brain = m.brain if isinstance(getattr(m, "brain", None), dict) else {}
    awareness = float(brain.get("awareness", 0.0))
    reputation = float(getattr(m, "reputation", 1.0) or 1.0)
    norm_rep = _clamp01(reputation / 5.0)                 # rep ~1 baseline, ~5 = renowned
    saga = brain.get("saga")
    saga_inv = _clamp01(float(brain.get("saga_involvement", 1.0 if saga else 0.0)))
    born = int(getattr(m, "born_tick", 0) or 0)
    age = max(0, world_tick - born)
    norm_age = _clamp01(age / 200.0)                      # ~200 ticks ≈ a full life
    a = 0.4 * awareness + 0.3 * norm_rep + 0.2 * saga_inv + 0.1 * norm_age
    return round(_clamp01(a), 4)


def expel_threshold(autonomy: float) -> float:
    """Possession expel point (L.6): expel when rapport_drift > 0.3 + 0.6·autonomy — the more
    awakened, the more easily it throws the rider."""
    return round(0.3 + 0.6 * _clamp01(autonomy), 4)


def select_hot(*, by_reputation: list[str], gaze_focus: Iterable[str] = (),
               saga_cast: Iterable[str] = (), possessed: Iterable[str] = (),
               override_targets: Iterable[str] = (), budget: int = HOT_BUDGET) -> list[str]:
    """Priority-merge the candidate sets into the focal set, capped at budget. The order of the
    tiers IS the eviction order (L.7): possessed/confront > gaze > saga > reputation."""
    out: list[str] = []
    seen: set[str] = set()

    def take(ids: Iterable[str]):
        for mid in ids:
            if mid and mid not in seen and len(out) < budget:
                seen.add(mid)
                out.append(mid)

    take(possessed)          # the worn body / confront candidate — never starved
    take(gaze_focus)         # what the player is looking at thinks richly
    take(saga_cast)          # the live story
    take(override_targets)   # what the creator just touched
    take(by_reputation)      # fill the rest with the most prominent
    return out
