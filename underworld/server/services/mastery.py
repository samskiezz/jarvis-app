"""Mastery + community knowledge tracking.

Doc I.68-70:
- (68) "Each Minion eventually develops a mastery in a specific domain."
- (69) "Mastery enhances their problem-solving in that niche."  (the physics
  engine already makes accuracy rise with skill level; crossing the mastery
  threshold is the recognised milestone.)
- (70) "The app tracks every Minion's contribution to the community's total
  knowledge."
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Invention, Minion, Skill, TaskStatus

MASTERY_THRESHOLD = 6.0


def is_master(level: float) -> bool:
    return level >= MASTERY_THRESHOLD


def crossed_mastery(old_level: float, new_level: float) -> bool:
    return old_level < MASTERY_THRESHOLD <= new_level


async def list_masteries(session: AsyncSession, minion_id: str) -> list[str]:
    rows = await session.execute(
        select(Skill.name).where(Skill.minion_id == minion_id, Skill.level >= MASTERY_THRESHOLD)
    )
    return [r[0] for r in rows.all()]


async def world_knowledge(session: AsyncSession, world_id: str) -> tuple[float, int]:
    """Return (total_knowledge, masters) for the alive population of a world.

    total_knowledge = Σ skill levels of alive Minions + approved inventions.
    masters = number of alive Minions holding at least one mastered skill.
    """
    skill_sum = await session.scalar(
        select(func.coalesce(func.sum(Skill.level), 0.0))
        .select_from(Skill)
        .join(Minion, Minion.id == Skill.minion_id)
        .where(Minion.world_id == world_id, Minion.alive.is_(True))
    ) or 0.0
    approved = await session.scalar(
        select(func.count(Invention.id)).where(
            Invention.world_id == world_id, Invention.status == TaskStatus.APPROVED
        )
    ) or 0
    masters = await session.scalar(
        select(func.count(func.distinct(Skill.minion_id)))
        .select_from(Skill)
        .join(Minion, Minion.id == Skill.minion_id)
        .where(
            Minion.world_id == world_id,
            Minion.alive.is_(True),
            Skill.level >= MASTERY_THRESHOLD,
        )
    ) or 0
    return float(skill_sum) + float(approved), int(masters)
