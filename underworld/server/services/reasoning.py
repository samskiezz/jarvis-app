"""Causal reasoning (doc I.23).

A Minion observes the effect of its own actions and forms hypotheses of the form
"doing X improves my wellbeing". Each tick it appraises whether its wellbeing
rose or fell after the action it took (an intervention), and updates the matching
belief. Confidence is a Laplace-smoothed success rate, so beliefs start agnostic
(0.5) and sharpen with evidence — and the Minion can then exploit what it has
learned, which is genuine causal inference rather than a scripted preference.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import CausalBelief, Memory, Minion

# A belief needs this many trials before it's trusted enough to act on.
MIN_TRIALS_TO_ACT = 3
ACT_CONFIDENCE = 0.6


def wellbeing(m: Minion) -> float:
    """A single scalar a Minion can feel rise or fall: needs + morale + standing."""
    needs = (m.hunger + m.thirst + m.fatigue + m.sanity + m.health) / 5.0
    morale = 0.5 if m.morale is None else m.morale
    purpose = 0.5 if m.purpose is None else m.purpose
    return round(0.5 * needs + 0.2 * morale + 0.15 * purpose + 0.15 * min(1.0, m.reputation / 2.0), 4)


def _confidence(confirmations: int, trials: int) -> float:
    return round((confirmations + 1) / (trials + 2), 4)   # Laplace prior at 0.5


async def record(
    session: AsyncSession, minion_id: str, cause: str, *, confirmed: bool, tick: int,
    effect: str = "wellbeing",
) -> CausalBelief:
    belief = (await session.execute(
        select(CausalBelief).where(
            CausalBelief.minion_id == minion_id,
            CausalBelief.cause == cause,
            CausalBelief.effect == effect,
        )
    )).scalars().first()
    if belief is None:
        belief = CausalBelief(
            minion_id=minion_id, cause=cause, effect=effect,
            trials=0, confirmations=0, confidence=0.5, updated_tick=tick,
        )
        session.add(belief)
    belief.trials += 1
    belief.confirmations += 1 if confirmed else 0
    belief.confidence = _confidence(belief.confirmations, belief.trials)
    belief.updated_tick = tick
    return belief


async def beliefs(session: AsyncSession, minion_id: str) -> list[CausalBelief]:
    return list((await session.execute(
        select(CausalBelief).where(CausalBelief.minion_id == minion_id)
        .order_by(CausalBelief.confidence.desc())
    )).scalars().all())


async def best_action(
    session: AsyncSession, minion_id: str, candidates: set[str],
) -> str | None:
    """The action this Minion most believes will improve its wellbeing — only if
    it has enough evidence and the confidence clears the bar."""
    for b in await beliefs(session, minion_id):
        if b.cause in candidates and b.trials >= MIN_TRIALS_TO_ACT and b.confidence >= ACT_CONFIDENCE:
            return b.cause
    return None


async def reflect(session: AsyncSession, minion: Minion, tick: int) -> str | None:
    """Doc I.127 — meta-cognition: review beliefs for a reliably-unhelpful habit,
    record the lesson, and grow a little more deliberate (conscientiousness).
    Returns the action reflected upon, or None if there's nothing to learn yet."""
    bad = next(
        (b for b in await beliefs(session, minion.id)
         if b.trials >= MIN_TRIALS_TO_ACT and b.confidence < 0.4),
        None,
    )
    if bad is None:
        return None
    session.add(Memory(
        minion_id=minion.id, tick=tick, kind="reflection",
        content=(f"On reflection, '{bad.cause}' rarely helps me "
                 f"({bad.confidence:.0%} of the time). I'll be more deliberate."),
        importance=0.7,
    ))
    minion.conscientiousness = min(1.0, minion.conscientiousness + 0.02)
    return bad.cause
