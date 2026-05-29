"""Tech-era progression, Patent Scanner build, and Ascension mechanics.

Implements the spec's "Stone-age → Information-age → Ascended" arc:
  doc I.22, I.50-54 (era progression + patent scanner mechanics)
  doc II.37-40 (ascension / enlightenment)
  doc III.3-9, III.23-26 (patent scanner build flow + TRL gating)

Three pure functions a tick can call:
  - `update_era(world, *, alive, total_skill, approved_inventions)`
  - `scanner_advance(world, *, contributors_skill)` — call when a Minion does
    `build_scanner` action; returns True if newly completed.
  - `try_ascend(session, minion, world)` — call when a Minion does
    `seek_ascension`; returns True if soul.ascended just flipped.

All three write Events so the timeline shows the milestones.
"""
from __future__ import annotations

from dataclasses import dataclass
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Invention, Minion, Skill, Soul, World


# ── Era progression ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class Era:
    name: str          # "stone", "bronze", …
    label: str         # "Stone Age"
    min_pop: int
    min_inventions: int
    min_avg_skill: float
    # Which action verbs are unlocked when the world is at or above this era.
    unlocks: tuple[str, ...] = ()


ERAS: list[Era] = [
    Era("stone",       "Stone Age",       min_pop=0,  min_inventions=0,   min_avg_skill=0.0, unlocks=("eat","drink","rest","meditate","socialise","study","teach","seek_partner","fork_self")),
    Era("bronze",      "Bronze Age",      min_pop=15, min_inventions=2,   min_avg_skill=1.2, unlocks=("kb_lookup",)),
    Era("iron",        "Iron Age",        min_pop=30, min_inventions=8,   min_avg_skill=2.0, unlocks=("propose_invention","build_scanner")),
    Era("industrial",  "Industrial Age",  min_pop=60, min_inventions=20,  min_avg_skill=3.0, unlocks=("search_patents",)),
    Era("information", "Information Age", min_pop=100, min_inventions=50, min_avg_skill=4.0, unlocks=("propose_with_party","seek_ascension")),
    Era("quantum",     "Quantum Age",     min_pop=160, min_inventions=120, min_avg_skill=5.5, unlocks=()),
]


def _era_index(name: str) -> int:
    for i, e in enumerate(ERAS):
        if e.name == name:
            return i
    return 0


def unlocked_actions(world_era: str) -> set[str]:
    """All actions available to a world at the given era (cumulative)."""
    idx = _era_index(world_era)
    out: set[str] = set()
    for e in ERAS[: idx + 1]:
        out.update(e.unlocks)
    return out


async def update_era(session: AsyncSession, world: World) -> str | None:
    """Promote the world's era when thresholds are met.

    Returns the new era name when a promotion happened, else None.
    """
    alive = int(await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0)
    approved = int(await session.scalar(
        select(func.count(Invention.id)).where(Invention.world_id == world.id, Invention.status == "approved")
    ) or 0)
    avg_skill = float(await session.scalar(
        select(func.coalesce(func.avg(Skill.level), 0.0))
        .join(Minion, Minion.id == Skill.minion_id)
        .where(Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0.0)

    current_idx = _era_index(world.era)
    promoted: str | None = None
    for i, era in enumerate(ERAS):
        if i <= current_idx:
            continue
        if alive >= era.min_pop and approved >= era.min_inventions and avg_skill >= era.min_avg_skill:
            world.era = era.name
            promoted = era.name
            session.add(Event(
                world_id=world.id,
                tick=world.tick,
                kind="era:promoted",
                actor_id=None,
                payload={
                    "from": ERAS[current_idx].name,
                    "to": era.name,
                    "alive": alive,
                    "approved": approved,
                    "avg_skill": round(avg_skill, 2),
                },
            ))
            current_idx = i  # allow multi-step promotion in one tick
    return promoted


# ── Patent Scanner build ────────────────────────────────────────────────

def scanner_advance(world: World, *, builder_intelligence: float) -> tuple[int, bool]:
    """Advance scanner_progress. Returns (delta, just_completed)."""
    if world.scanner_progress >= 100:
        return 0, False
    delta = max(1, int(builder_intelligence * 4))
    new = min(100, world.scanner_progress + delta)
    just_completed = world.scanner_progress < 100 and new >= 100
    world.scanner_progress = new
    return delta, just_completed


def scanner_ready(world: World) -> bool:
    return world.scanner_progress >= 100


# ── Ascension ────────────────────────────────────────────────────────────

ASCEND_MIN_REPUTATION = 2.0
ASCEND_MIN_INVENTIONS_APPROVED = 3
ASCEND_MIN_AGE_TICKS = 200
ASCEND_MIN_KARMA = 1.5


async def can_ascend(session: AsyncSession, minion: Minion, world: World) -> tuple[bool, str]:
    """Predicate + reason. Mirrors doc II.37-40 conditions."""
    if minion.reputation < ASCEND_MIN_REPUTATION:
        return False, f"reputation {minion.reputation:.2f} < {ASCEND_MIN_REPUTATION}"
    age = world.tick - minion.born_tick
    if age < ASCEND_MIN_AGE_TICKS:
        return False, f"age {age} < {ASCEND_MIN_AGE_TICKS}"
    inventor_inv = int(await session.scalar(
        select(func.count(Invention.id)).where(
            Invention.minion_id == minion.id,
            Invention.status == "approved",
        )
    ) or 0)
    if inventor_inv < ASCEND_MIN_INVENTIONS_APPROVED:
        return False, f"approved inventions {inventor_inv} < {ASCEND_MIN_INVENTIONS_APPROVED}"
    if minion.soul_id:
        soul = await session.get(Soul, minion.soul_id)
        if soul and soul.karma < ASCEND_MIN_KARMA:
            return False, f"karma {soul.karma:.2f} < {ASCEND_MIN_KARMA}"
    if world.era not in ("information", "quantum"):
        return False, f"world era {world.era} < information"
    return True, "ready"


async def try_ascend(session: AsyncSession, minion: Minion, world: World) -> tuple[bool, str]:
    ok, reason = await can_ascend(session, minion, world)
    if not ok:
        return False, reason
    if not minion.soul_id:
        return False, "no soul"
    soul = await session.get(Soul, minion.soul_id)
    if not soul:
        return False, "soul not found"
    soul.ascended = True
    soul.ancestral_summary = (
        (soul.ancestral_summary or "")
        + f"\n[ascended @ tick {world.tick}] {minion.name} {minion.surname} "
          f"reached enlightenment from the {minion.guild.value} guild."
    )[-2000:]
    minion.alive = False
    minion.died_tick = world.tick
    session.add(Event(
        world_id=world.id,
        tick=world.tick,
        kind="minion:ascended",
        actor_id=minion.id,
        payload={
            "name": f"{minion.name} {minion.surname}",
            "guild": minion.guild.value,
            "reputation": minion.reputation,
            "soul_id": soul.id,
        },
    ))
    return True, "ascended"
