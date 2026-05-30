"""Education institutions (doc I.45).

Knowledge transfer scales up as a civilization advances: apprenticeship →
school → academy → university. The institutional tier a world has reached is a
function of its accumulated knowledge + number of masters, and it grants the
young a passive learning rate each tick (formal schooling on top of one-to-one
teaching). This is what lets later generations start from the shoulders of the
earlier ones instead of re-deriving everything.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Minion, Skill, World
from . import mastery

MATURITY_TICKS = 15

# (min_knowledge, min_masters, tier, passive_rate)
_TIERS = (
    (400.0, 12, "university", 0.03),
    (150.0, 5, "academy", 0.02),
    (50.0, 2, "school", 0.01),
    (0.0, 0, "apprenticeship", 0.0),
)


def education_tier(total_knowledge: float, masters: int) -> tuple[str, float]:
    for min_k, min_m, tier, rate in _TIERS:
        if total_knowledge >= min_k or masters >= min_m:
            return tier, rate
    return "apprenticeship", 0.0


async def apply_education(session: AsyncSession, world: World) -> int:
    """Give the young a passive skill boost sized by the world's education tier.

    Returns the number of students taught this tick.
    """
    total_knowledge, masters = await mastery.world_knowledge(session, world.id)
    tier, rate = education_tier(total_knowledge, masters)
    if rate <= 0.0:
        return 0
    young = (await session.execute(
        select(Minion).where(
            Minion.world_id == world.id,
            Minion.alive.is_(True),
            (world.tick - Minion.born_tick) < MATURITY_TICKS,
        )
    )).scalars().all()
    if not young:
        return 0
    for m in young:
        skill = (await session.execute(
            select(Skill).where(Skill.minion_id == m.id, Skill.name == m.guild.value)
        )).scalars().first()
        if skill is None:
            skill = Skill(minion_id=m.id, name=m.guild.value, level=0.3,
                          last_practiced_tick=world.tick)
            session.add(skill)
        else:
            skill.level = min(10.0, skill.level + rate)
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="education:cohort", actor_id=None,
        payload={"tier": tier, "rate": rate, "students": len(young)},
    ))
    return len(young)
