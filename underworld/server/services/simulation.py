"""Simulation tick loop.

A "tick" advances `world.tick` by one and runs `run_tick` for every alive
Minion. Then:
  - inventions submitted this tick run through safety + peer review
  - breeding requests resolve into new Minions (subject to population cap)
  - fork requests resolve into clones (cheap, limited per tick)
  - deaths (old age, accident, need-collapse) are processed
  - mood + needs decay
  - PopulationSnapshot row written
  - dead-but-souls-free can be reincarnated as new births if pop is below cap
    and there's no breeding eligible pair

The loop is bounded by `sim_max_ticks_per_request` to keep API calls
predictable. Background auto-advance lives in `services.scheduler`.
"""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents import minion as minion_agent
from ..agents import reviewer
from ..config import get_settings
from ..db.models import (
    CauseOfDeath,
    Event,
    Invention,
    Minion,
    MoodKind,
    PopulationSnapshot,
    TaskStatus,
    World,
)
from ..world.seed import derive_seed
from . import lifecycle, mastery, projects, roles


@dataclass
class TickReport:
    tick: int
    minion_outcomes: list[dict] = field(default_factory=list)
    inventions_reviewed: int = 0
    inventions_approved: int = 0
    births: int = 0
    deaths: int = 0
    forks: int = 0
    reincarnations: int = 0
    alive: int = 0
    projects_created: int = 0
    project_contributions: int = 0
    project_stages_advanced: int = 0
    projects_approved: int = 0
    replications: int = 0


def _payload(rep: TickReport) -> dict:
    return {
        "tick": rep.tick,
        "minion_outcomes": rep.minion_outcomes,
        "inventions_reviewed": rep.inventions_reviewed,
        "inventions_approved": rep.inventions_approved,
        "births": rep.births,
        "deaths": rep.deaths,
        "forks": rep.forks,
        "reincarnations": rep.reincarnations,
        "alive": rep.alive,
        "projects_created": rep.projects_created,
        "project_contributions": rep.project_contributions,
        "project_stages_advanced": rep.project_stages_advanced,
        "projects_approved": rep.projects_approved,
        "replications": rep.replications,
    }


def _population_floor(world: World, settings) -> int:
    pct = max(0.0, min(1.0, settings.sim_population_floor_pct))
    return max(8, int(world.population_cap * pct))


async def _gather_neighbours(
    session: AsyncSession,
    minion: Minion,
    world_id: str,
    rng: random.Random,
    limit: int = 6,
) -> list[Minion]:
    """Pick a sample of alive same-world Minions as 'in earshot' neighbours.

    Real implementation would use spatial grid. For v1 we sample by random
    offset since the world has no positions yet.
    """
    stmt = (
        select(Minion)
        .where(Minion.world_id == world_id, Minion.alive.is_(True), Minion.id != minion.id)
        .limit(64)
    )
    res = await session.execute(stmt)
    pool = list(res.scalars().all())
    rng.shuffle(pool)
    return pool[:limit]


async def _process_breeding(
    session: AsyncSession,
    world: World,
    requests: list[tuple[Minion, str]],
    rng: random.Random,
    pop_cap: int,
    current_pop: int,
) -> int:
    """Try to resolve breeding requests. Each request is (initiator, partner_id).

    Returns number of new minions born.
    """
    births = 0
    initiated: set[str] = set()
    for initiator, partner_id in requests:
        if current_pop + births >= pop_cap:
            break
        if initiator.id in initiated:
            continue
        partner = await session.get(Minion, partner_id)
        if not partner or not partner.alive:
            continue
        if partner.id in initiated:
            continue
        if not lifecycle.can_breed(initiator, partner, world_tick=world.tick):
            continue
        await lifecycle.breed_pair(
            session, world=world, parent_a=initiator, parent_b=partner, rng=rng
        )
        initiated.add(initiator.id)
        initiated.add(partner.id)
        births += 1
    return births


async def _process_forks(
    session: AsyncSession,
    world: World,
    requests: list[Minion],
    rng: random.Random,
    pop_cap: int,
    current_pop: int,
    limit_per_tick: int = 3,
) -> int:
    """Resolve fork-self requests. Limited per tick to prevent runaway cloning."""
    forks = 0
    candidates = [m for m in requests if m.alive]
    candidates.sort(key=lambda m: m.reputation, reverse=True)
    for m in candidates[:limit_per_tick]:
        if current_pop + forks >= pop_cap:
            break
        await lifecycle.fork_minion(session, world=world, source=m, rng=rng)
        forks += 1
    return forks


async def _process_deaths(
    session: AsyncSession,
    world: World,
    alive_minions: list[Minion],
    rng: random.Random,
) -> int:
    deaths = 0
    for m in alive_minions:
        cause = lifecycle.determine_death(m, world_tick=world.tick, rng=rng)
        if cause is not None:
            await lifecycle.kill(session, m, cause=cause, world_tick=world.tick)
            deaths += 1
    return deaths


async def _write_snapshot(
    session: AsyncSession,
    world: World,
    *,
    births: int,
    deaths: int,
    forks: int,
    inventions_approved: int,
) -> None:
    stmt = select(Minion).where(Minion.world_id == world.id)
    res = await session.execute(stmt)
    minions = list(res.scalars().all())
    alive = [m for m in minions if m.alive]
    dead = [m for m in minions if not m.alive]

    mood_breakdown = Counter(m.mood.value for m in alive)
    guild_breakdown = Counter(m.guild.value for m in alive)
    role_breakdown = Counter(m.swarm_role.value for m in alive)
    avg_age = (
        sum(world.tick - m.born_tick for m in alive) / len(alive) if alive else 0.0
    )
    avg_reputation = sum(m.reputation for m in alive) / len(alive) if alive else 0.0
    avg_sanity = sum(m.sanity for m in alive) / len(alive) if alive else 0.0
    generations = max((m.generation for m in alive), default=0)
    active_projects, approved_projects = await projects.world_project_counts(session, world.id)
    total_knowledge, masters = await mastery.world_knowledge(session, world.id)

    session.add(
        PopulationSnapshot(
            world_id=world.id,
            tick=world.tick,
            alive=len(alive),
            dead=len(dead),
            births=births,
            deaths=deaths,
            forks=forks,
            inventions_approved=inventions_approved,
            generations=generations,
            avg_age=round(avg_age, 2),
            avg_reputation=round(avg_reputation, 3),
            avg_sanity=round(avg_sanity, 3),
            mood_breakdown=dict(mood_breakdown),
            guild_breakdown=dict(guild_breakdown),
            role_breakdown=dict(role_breakdown),
            active_projects=active_projects,
            approved_projects=approved_projects,
            total_knowledge=round(total_knowledge, 2),
            masters=masters,
        )
    )


async def advance_world(
    session: AsyncSession,
    world: World,
    ticks: int,
    *,
    use_llm: bool | None = None,
) -> list[TickReport]:
    """Advance the given world by `ticks` ticks. Returns one report per tick."""
    settings = get_settings()
    ticks = max(1, min(ticks, settings.sim_max_ticks_per_request))
    seed = derive_seed(world.seed_class)
    reports: list[TickReport] = []
    use_llm = bool(settings.kimi_api_key) if use_llm is None else use_llm

    for _ in range(ticks):
        world.tick += 1
        rng = random.Random(seed.seed_int ^ (world.tick * 0x9E3779B1))
        report = TickReport(tick=world.tick)

        # 1. Fetch alive population.
        stmt = (
            select(Minion)
            .where(Minion.world_id == world.id, Minion.alive.is_(True))
            .order_by(Minion.created_at)
        )
        res = await session.execute(stmt)
        alive_minions = list(res.scalars().all())

        # 2. Per-minion tick: decide an action, perform it, decay needs, derive mood.
        breeding_requests: list[tuple[Minion, str]] = []
        fork_requests: list[Minion] = []

        for m in alive_minions:
            # Pre-action: derive current mood from prior state so the LLM sees fresh mood.
            mood, stress = lifecycle.derive_mood(m)
            m.mood = mood
            m.stress = stress

            neighbours = await _gather_neighbours(session, m, world.id, rng)
            outcome = await minion_agent.run_tick(
                session, m, world, seed.biome_hint,
                neighbours=neighbours, rng=rng, use_llm=use_llm,
            )

            report.minion_outcomes.append(
                {
                    "minion_id": outcome.minion_id,
                    "name": m.name,
                    "guild": m.guild.value,
                    "action": outcome.action,
                    "summary": outcome.summary,
                    "mood": mood.value,
                    "inventions": outcome.inventions_created,
                    "blocked_by_safety": outcome.blocked_by_safety,
                }
            )
            if outcome.seek_partner_for:
                breeding_requests.append((m, outcome.seek_partner_for))
            if outcome.request_fork:
                fork_requests.append(m)

            # Post-action: decay needs.
            intensity = (
                1.5 if outcome.action in {"study", "search_patents", "propose_invention", "teach"}
                else 1.0
            )
            lifecycle.decay_needs(m, intensity=intensity)
            # Re-derive mood so it's persisted with the post-tick state.
            m.mood, m.stress = lifecycle.derive_mood(m)

        # 3. Resolve inventions submitted this tick.
        stmt = select(Invention).where(
            Invention.world_id == world.id,
            Invention.status.in_([TaskStatus.NEEDS_SAFETY_REVIEW, TaskStatus.NEEDS_PEER_REVIEW]),
        )
        res = await session.execute(stmt)
        pending = list(res.scalars().all())
        for inv in pending:
            if inv.status == TaskStatus.NEEDS_SAFETY_REVIEW:
                blocked = await reviewer.safety_review(session, inv)
                if blocked is not None:
                    report.inventions_reviewed += 1
                    continue
                inv.status = TaskStatus.NEEDS_PEER_REVIEW
            await reviewer.peer_review(session, inv)
            report.inventions_reviewed += 1
            if inv.status == TaskStatus.APPROVED:
                report.inventions_approved += 1
                # Inventions that touch regulated domains escalate to projects.
                flags = roles.detect_domain(inv.title, inv.problem, inv.hypothesis)
                if flags.any:
                    created = await projects.maybe_create_project(session, world, inv, flags)
                    if created is not None:
                        report.projects_created += 1

        # 3b. Tick the active research projects.
        proj_report = await projects.tick_projects(session, world, rng)
        report.project_contributions = proj_report.contributions
        report.project_stages_advanced = proj_report.stages_advanced
        report.projects_approved = proj_report.approved

        # 3c. Independent replication of approved inventions (doc I.71).
        report.replications = await reviewer.replicate_pending(session, world, rng)

        # 4. Process births, forks, deaths.
        current_pop = len(alive_minions)
        report.births = await _process_breeding(
            session, world, breeding_requests, rng, world.population_cap, current_pop,
        )
        report.forks = await _process_forks(
            session, world, fork_requests, rng,
            world.population_cap, current_pop + report.births,
        )
        report.deaths = await _process_deaths(session, world, alive_minions, rng)

        # 4b. Population floor — if the world is collapsing, recycle free
        # souls (or mint new ones) back into gen-0 Minions. Implements doc
        # II.5-6 reincarnation as an autonomic process, not just an
        # opportunistic carry-over inside births.
        floor = _population_floor(world, settings)
        report.reincarnations = await lifecycle.reincarnate_to_floor(
            session, world, floor=floor, rng=rng,
        )

        # 5. Snapshot.
        await _write_snapshot(
            session,
            world,
            births=report.births,
            deaths=report.deaths,
            forks=report.forks,
            inventions_approved=report.inventions_approved,
        )

        # 6. Finalise alive count.
        report.alive = await lifecycle.alive_count(session, world.id)

        # 6b. Era progression — promote the world if pop/inventions/skill
        # thresholds have been met. Doc I.22, III.23-26.
        from .progression import update_era as _update_era
        await _update_era(session, world)

        # 7. Population health event if a generation milestone was reached.
        if report.births > 0:
            stmt = select(func.max(Minion.generation)).where(Minion.world_id == world.id)
            max_gen = await session.scalar(stmt) or 0
            session.add(
                Event(
                    world_id=world.id,
                    tick=world.tick,
                    kind="population:births",
                    actor_id=None,
                    payload={"births": report.births, "max_generation": max_gen},
                )
            )
        if report.deaths > 0:
            session.add(
                Event(
                    world_id=world.id,
                    tick=world.tick,
                    kind="population:deaths",
                    actor_id=None,
                    payload={"deaths": report.deaths, "alive_after": report.alive},
                )
            )
        if report.reincarnations > 0:
            session.add(
                Event(
                    world_id=world.id,
                    tick=world.tick,
                    kind="population:floor_restored",
                    actor_id=None,
                    payload={
                        "reincarnated": report.reincarnations,
                        "alive_after": report.alive,
                        "floor": floor,
                    },
                )
            )

        reports.append(report)

    return reports


__all__ = ["TickReport", "advance_world"]
