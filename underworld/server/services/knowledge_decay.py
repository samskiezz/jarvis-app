"""Information loss + libraries (doc I.64-65).

Knowledge is not permanent. A skill left unpracticed atrophies — the individual
analogue of books decaying and oral tradition drifting. A civilization fights this
by building a library: once it has writing and a real body of accumulated
knowledge, records preserve skills and the rate of forgetting drops sharply.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Discovery, Minion, Skill, World
from . import mastery

GRACE = 30              # ticks of disuse before a skill begins to fade
DECAY = 0.02            # level lost per atrophy application
FLOOR = 0.1             # skills never decay below this residual
LIBRARY_FACTOR = 0.3    # a library cuts forgetting to 30%
LIBRARY_MIN_KNOWLEDGE = 80.0


async def has_library(session: AsyncSession, world: World) -> bool:
    writing = (await session.scalar(
        select(func.count(Discovery.id)).where(
            Discovery.world_id == world.id, Discovery.tech == "writing")
    ) or 0) > 0
    knowledge, _m = await mastery.world_knowledge(session, world.id)
    return writing and knowledge >= LIBRARY_MIN_KNOWLEDGE


async def tick_atrophy(session: AsyncSession, world: World) -> int:
    """Fade skills left unpracticed past the grace period. Returns count faded."""
    factor = LIBRARY_FACTOR if await has_library(session, world) else 1.0
    stale = (await session.execute(
        select(Skill).join(Minion, Minion.id == Skill.minion_id).where(
            Minion.world_id == world.id,
            Minion.alive.is_(True),
            Skill.last_practiced_tick < world.tick - GRACE,
            Skill.level > FLOOR,
        )
    )).scalars().all()
    for sk in stale:
        sk.level = max(FLOOR, sk.level - DECAY * factor)
    return len(stale)
