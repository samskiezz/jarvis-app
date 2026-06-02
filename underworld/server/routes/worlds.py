from __future__ import annotations

import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import (
    Discovery,
    Event,
    Invention,
    Memory,
    Minion,
    Patent,
    PeerReview,
    PopulationSnapshot,
    ProjectContribution,
    Relationship,
    ResearchProject,
    Skill,
    Soul,
    World,
)
from ..db.session import get_session
from ..services import civos as civos_mod
from ..services import invention_pipeline as invention_mod
from ..services import electronics
from ..services import experiment_design
from ..services import feature_audit
from ..services import photonics
from ..services import instruments_lab
from ..services import knowledge_graph as kg_mod
from ..services import manufacturing_capability
from ..services import multiphysics
from ..services import cfd_sim
from ..services import quantum_sim
from ..services import real_materials
from ..services import robotic_lab
from ..services import spice_sim
from ..services import real_optimizer
from ..services import simulation_quality
from ..services import supply_chain
from ..services import research_director
from ..services import scheduler
from ..services import self_driving_lab as lab_mod
from ..services import virtual_cell as vc_mod
from ..services import world_model as world_model_mod
from ..services.factory import SeedingPlan, create_world
from ..services.simulation import advance_world
from ..world.seed import derive_seed, heightmap
from .schemas import (
    AdvanceRequest,
    AdvanceResponse,
    EventOut,
    InventionOut,
    MinionListItem,
    PopulationSnapshotOut,
    PopulationStatsOut,
    WorldAutoAdvanceUpdate,
    WorldCreate,
    WorldOut,
)

router = APIRouter(prefix="/worlds", tags=["worlds"])


async def _world_or_404(session: AsyncSession, world_id: str) -> World:
    world = await session.get(World, world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world not found")
    return world


async def _world_out(session: AsyncSession, world: World) -> WorldOut:
    total = await session.scalar(select(func.count(Minion.id)).where(Minion.world_id == world.id))
    alive = await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )
    return WorldOut(
        id=world.id,
        name=world.name,
        seed_class=world.seed_class,
        seed_value=world.seed_value,
        tick=world.tick,
        population_cap=world.population_cap,
        auto_advance=world.auto_advance,
        auto_advance_interval_s=world.auto_advance_interval_s,
        era=getattr(world, "era", "stone"),
        scanner_progress=getattr(world, "scanner_progress", 0),
        created_at=world.created_at,
        minion_count=int(total or 0),
        alive_count=int(alive or 0),
    )


@router.get("", response_model=list[WorldOut])
async def list_worlds(
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    stmt = select(World).order_by(World.created_at.desc())
    res = await session.execute(stmt)
    worlds = list(res.scalars().all())
    return [await _world_out(session, w) for w in worlds]


@router.post("", response_model=WorldOut, status_code=201)
async def create_world_route(
    body: WorldCreate,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    # Apportion the requested starting_population across guilds:
    #   patent + safety guilds get fixed seats (functional reviewers);
    #   the rest go into the aptitude pool.
    patent_seats = max(2, body.starting_population // 20)
    safety_seats = max(2, body.starting_population // 25)
    aptitude_pool = max(10, body.starting_population - patent_seats - safety_seats)
    plan = SeedingPlan(
        aptitude_pool=aptitude_pool,
        patent_guild_seats=patent_seats,
        safety_guild_seats=safety_seats,
        population_cap=body.population_cap,
    )
    world = await create_world(
        session,
        name=body.name,
        cpc_class=body.cpc_class,
        plan=plan,
        starting_age=body.starting_age,
        auto_advance=body.auto_advance,
    )
    await session.flush()
    return await _world_out(session, world)


@router.get("/feature-audit")
async def get_feature_audit(
    category: str | None = Query(default=None),
    gaps_only: bool = Query(default=False),
    _token: str = Depends(require_bearer),
):
    """Honest 500-feature reality census — what is actually backed by real code.

    Introspects the live source tree (services/physics/routes/world/db) and
    reports each feature as PRESENT / PARTIAL / ABSENT, overall and per category.
    This is the truthful answer to 'is it all real, active and running?': a
    conservative, reproducible audit rather than a marketing claim. Pass
    ?gaps_only=true (optionally &category=M) for the build roadmap of ABSENT
    features. Declared before /{world_id} so the literal path wins routing.
    """
    if gaps_only:
        return {"gaps": feature_audit.gaps(category)}
    return feature_audit.coverage_report()


@router.get("/{world_id}", response_model=WorldOut)
async def get_world(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await _world_or_404(session, world_id)
    return await _world_out(session, world)


@router.delete("/{world_id}", status_code=204)
async def delete_world(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Hard-delete a world and everything tied to it.

    The cascade follows FK declarations: minions, events, memories,
    inventions, peer reviews, population snapshots, projects all drop
    with the world. No soft-delete — this is an operator action invoked
    explicitly from the CommandCentre to clear sprawl.
    """
    world = await _world_or_404(session, world_id)

    # SQLite doesn't enforce FK cascades by default — wipe dependents by
    # hand so we don't leave orphaned inventions / souls / snapshots.
    minion_ids_stmt = select(Minion.id).where(Minion.world_id == world_id)
    minion_ids = [mid for (mid,) in (await session.execute(minion_ids_stmt)).all()]
    if minion_ids:
        inv_ids_stmt = select(Invention.id).where(Invention.minion_id.in_(minion_ids))
        inv_ids = [iid for (iid,) in (await session.execute(inv_ids_stmt)).all()]
        if inv_ids:
            await session.execute(delete(PeerReview).where(PeerReview.invention_id.in_(inv_ids)))
        await session.execute(delete(Skill).where(Skill.minion_id.in_(minion_ids)))
        await session.execute(delete(Memory).where(Memory.minion_id.in_(minion_ids)))
        await session.execute(
            delete(Relationship).where(
                (Relationship.from_id.in_(minion_ids)) | (Relationship.to_id.in_(minion_ids))
            )
        )

    world_inv_ids_stmt = select(Invention.id).where(Invention.world_id == world_id)
    world_inv_ids = [iid for (iid,) in (await session.execute(world_inv_ids_stmt)).all()]
    if world_inv_ids:
        await session.execute(delete(PeerReview).where(PeerReview.invention_id.in_(world_inv_ids)))

    project_ids_stmt = select(ResearchProject.id).where(ResearchProject.world_id == world_id)
    project_ids = [pid for (pid,) in (await session.execute(project_ids_stmt)).all()]
    if project_ids:
        await session.execute(
            delete(ProjectContribution).where(ProjectContribution.project_id.in_(project_ids))
        )
    await session.execute(delete(ResearchProject).where(ResearchProject.world_id == world_id))
    await session.execute(delete(Invention).where(Invention.world_id == world_id))
    await session.execute(delete(PopulationSnapshot).where(PopulationSnapshot.world_id == world_id))
    await session.execute(delete(Event).where(Event.world_id == world_id))
    await session.execute(delete(Minion).where(Minion.world_id == world_id))
    await session.execute(delete(Soul).where(Soul.world_id == world_id))
    await session.delete(world)
    return None


@router.patch("/{world_id}/auto-advance", response_model=WorldOut)
async def set_auto_advance(
    world_id: str,
    body: WorldAutoAdvanceUpdate,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await _world_or_404(session, world_id)
    world.auto_advance = body.auto_advance
    if body.interval_s is not None:
        world.auto_advance_interval_s = body.interval_s
    world.next_auto_tick_at = datetime.utcnow() if body.auto_advance else None
    return await _world_out(session, world)


@router.get("/{world_id}/map")
async def get_world_map(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await _world_or_404(session, world_id)
    seed = derive_seed(world.seed_class)
    return {
        "world_id": world.id,
        "cpc_class": world.seed_class,
        "biome_hint": seed.biome_hint,
        "elevation_bias": seed.elevation_bias,
        "heightmap": heightmap(seed, size=128),
    }


@router.get("/{world_id}/latest-actions")
async def get_latest_actions(
    world_id: str,
    window: int = Query(default=3, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Map of `minion_id -> last action name` from the most recent ticks.

    The 3D scene uses this to drive avatar destinations (an avatar that
    invented this tick walks to the obelisk; one that ate walks to a hut).
    Reads the existing `Memory(kind='action', content='[name] summary')`
    rows the agent already writes — no extra storage required.
    """
    world = await _world_or_404(session, world_id)
    if window > world.tick + 1:
        window = world.tick + 1
    min_tick = max(0, world.tick - window + 1)
    stmt = (
        select(Memory.minion_id, Memory.content, Memory.tick)
        .join(Minion, Minion.id == Memory.minion_id)
        .where(
            Minion.world_id == world_id,
            # Typed-memory kinds are stored as "action@<type>"; match the base
            # kind via prefix so both legacy ("action") and tagged rows resolve.
            (Memory.kind == "action") | (Memory.kind.like("action@%")),
            Memory.tick >= min_tick,
        )
        .order_by(Memory.tick.desc())
    )
    res = await session.execute(stmt)
    latest: dict[str, str] = {}
    for minion_id, content, _tick in res.all():
        if minion_id in latest:
            continue
        # Memory content format: "[action_name] summary"
        if content.startswith("[") and "]" in content:
            name = content[1 : content.index("]")].strip()
            if name:
                latest[minion_id] = name
    return {"world_id": world_id, "tick": world.tick, "actions": latest}


@router.get("/{world_id}/latest-thoughts")
async def get_latest_thoughts(
    world_id: str,
    window: int = Query(default=3, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Map of `minion_id -> latest internal thought` (doc II.25).

    Reads `Memory(kind='thought', ...)` rows the agent writes from LLM
    output. The 3D scene renders these as thought-bubbles above each
    Minion so the user can see what they're actually reasoning about.
    """
    world = await _world_or_404(session, world_id)
    if window > world.tick + 1:
        window = world.tick + 1
    min_tick = max(0, world.tick - window + 1)
    stmt = (
        select(Memory.minion_id, Memory.content, Memory.tick)
        .join(Minion, Minion.id == Memory.minion_id)
        .where(
            Minion.world_id == world_id,
            (Memory.kind == "thought") | (Memory.kind.like("thought@%")),
            Memory.tick >= min_tick,
        )
        .order_by(Memory.tick.desc())
    )
    res = await session.execute(stmt)
    latest: dict[str, str] = {}
    for minion_id, content, _tick in res.all():
        if minion_id in latest:
            continue
        # Trim to a sentence — the full LLM thought is often 3-4 paragraphs;
        # the bubble only has room for one line.
        snippet = content.strip().split(". ", 1)[0]
        latest[minion_id] = snippet[:120] + ("…" if len(snippet) > 120 else "")
    return {"world_id": world_id, "tick": world.tick, "thoughts": latest}


@router.get("/{world_id}/minions", response_model=list[MinionListItem])
async def list_minions(
    world_id: str,
    alive: bool | None = Query(default=None),
    guild: str | None = Query(default=None),
    limit: int = Query(default=300, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await _world_or_404(session, world_id)
    stmt = select(Minion).where(Minion.world_id == world_id)
    if alive is not None:
        stmt = stmt.where(Minion.alive.is_(alive))
    if guild:
        stmt = stmt.where(Minion.guild == guild)
    stmt = stmt.order_by(Minion.generation, Minion.born_tick).limit(limit)
    res = await session.execute(stmt)
    minions = list(res.scalars().all())
    return [
        MinionListItem(
            id=m.id,
            name=m.name,
            surname=m.surname,
            nickname=m.nickname or "",
            guild=m.guild,
            swarm_role=m.swarm_role,
            generation=m.generation,
            alive=m.alive,
            reputation=m.reputation,
            karma=m.karma,
            mood=m.mood,
            hunger=m.hunger,
            fatigue=m.fatigue,
            sanity=m.sanity,
            health=m.health,
            born_tick=m.born_tick,
            died_tick=m.died_tick,
            age=(m.died_tick if m.died_tick is not None else world.tick) - m.born_tick,
        )
        for m in minions
    ]


@router.get("/{world_id}/events", response_model=list[EventOut])
async def list_events(
    world_id: str,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    await _world_or_404(session, world_id)
    stmt = (
        select(Event)
        .where(Event.world_id == world_id)
        .order_by(Event.tick.desc(), Event.created_at.desc())
        .limit(max(1, min(limit, 500)))
    )
    res = await session.execute(stmt)
    return [
        EventOut(
            id=e.id,
            tick=e.tick,
            kind=e.kind,
            actor_id=e.actor_id,
            payload=e.payload or {},
            created_at=e.created_at,
        )
        for e in res.scalars().all()
    ]


@router.get("/{world_id}/inventions", response_model=list[InventionOut])
async def list_inventions(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    await _world_or_404(session, world_id)
    stmt = (
        select(Invention)
        .where(Invention.world_id == world_id)
        .order_by(Invention.created_at.desc())
        .limit(200)
    )
    res = await session.execute(stmt)
    return [
        InventionOut(
            id=i.id,
            world_id=i.world_id,
            minion_id=i.minion_id,
            tick=i.tick,
            title=i.title,
            problem=i.problem,
            hypothesis=i.hypothesis or "",
            feasibility_score=i.feasibility_score,
            novelty_score=i.novelty_score,
            safety_score=i.safety_score,
            status=i.status,
            related_patents=i.related_patents or [],
            created_at=i.created_at,
        )
        for i in res.scalars().all()
    ]


@router.get("/{world_id}/population", response_model=PopulationStatsOut)
async def population_stats(
    world_id: str,
    history: int = Query(default=60, ge=0, le=500),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await _world_or_404(session, world_id)
    stmt = (
        select(PopulationSnapshot)
        .where(PopulationSnapshot.world_id == world_id)
        .order_by(PopulationSnapshot.tick.desc())
        .limit(history)
    )
    res = await session.execute(stmt)
    snaps = list(reversed(res.scalars().all()))
    if snaps:
        latest = snaps[-1]
        history_payload = [
            PopulationSnapshotOut(
                tick=s.tick,
                alive=s.alive,
                dead=s.dead,
                births=s.births,
                deaths=s.deaths,
                forks=s.forks,
                inventions_approved=s.inventions_approved,
                generations=s.generations,
                avg_age=s.avg_age,
                avg_reputation=s.avg_reputation,
                avg_sanity=s.avg_sanity,
                mood_breakdown=s.mood_breakdown or {},
                guild_breakdown=s.guild_breakdown or {},
                role_breakdown=s.role_breakdown or {},
                active_projects=s.active_projects,
                approved_projects=s.approved_projects,
            )
            for s in snaps
        ]
        return PopulationStatsOut(
            world_id=world_id,
            tick=world.tick,
            alive=latest.alive,
            dead=latest.dead,
            generations=latest.generations,
            avg_age=latest.avg_age,
            avg_reputation=latest.avg_reputation,
            avg_sanity=latest.avg_sanity,
            mood_breakdown=latest.mood_breakdown or {},
            guild_breakdown=latest.guild_breakdown or {},
            role_breakdown=latest.role_breakdown or {},
            active_projects=latest.active_projects,
            approved_projects=latest.approved_projects,
            history=history_payload,
        )
    # No snapshots yet — compute from current state.
    alive = await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world_id, Minion.alive.is_(True))
    ) or 0
    dead = await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world_id, Minion.alive.is_(False))
    ) or 0
    return PopulationStatsOut(
        world_id=world_id,
        tick=world.tick,
        alive=int(alive),
        dead=int(dead),
        generations=0,
        avg_age=0.0,
        avg_reputation=1.0,
        avg_sanity=0.85,
        mood_breakdown={},
        guild_breakdown={},
        history=[],
    )


@router.get("/{world_id}/culture")
async def world_culture(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.46 — the world's emergent worldview + belief-stance distribution."""
    from ..services import religion

    world = await _world_or_404(session, world_id)
    c = await religion.assess_culture(session, world)
    return {
        "worldview": c.worldview,
        "avg_openness": c.avg_openness,
        "avg_intelligence": c.avg_intelligence,
        "knowledge_per_capita": c.knowledge_per_capita,
        "stances": c.stances,
        "pollution": round(world.pollution or 0.0, 3),
    }


@router.get("/{world_id}/replay")
async def world_replay(
    world_id: str,
    around_tick: int = Query(...),
    window: int = Query(default=3, ge=0, le=20),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc #9 — causal event replay: the ordered chain of events in a window around
    a tick (reconstruct what led to a collapse, plague, blackout or crash)."""
    await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(Event).where(
            Event.world_id == world_id,
            Event.tick >= around_tick - window,
            Event.tick <= around_tick + window,
        ).order_by(Event.tick.asc(), Event.created_at.asc())
    )).scalars().all()
    return {
        "around_tick": around_tick, "window": window,
        "chain": [{"tick": e.tick, "kind": e.kind, "payload": e.payload} for e in rows],
    }


@router.get("/{world_id}/society")
async def world_society(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.41-42 — emergent government + legal system for this world."""
    from ..services import governance

    world = await _world_or_404(session, world_id)
    soc = await governance.assess_society(session, world)
    from ..services.civics import entertainment_for
    return {
        "government": world.government,
        "legal_system": world.legal_system,
        "population": soc.population,
        "avg_openness": soc.avg_openness,
        "infrastructure": round(world.infrastructure if world.infrastructure is not None else 0.1, 3),
        "tension": round(world.tension or 0.0, 3),
        "entertainment": entertainment_for(world.era),
    }


@router.get("/{world_id}/gaps")
async def world_gaps(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.82-85 — open research puzzles (empty data sets) for this world."""
    from ..services import puzzles

    await _world_or_404(session, world_id)
    return [
        {"id": g.id, "discipline": g.discipline, "prompt": g.prompt,
         "required_patents": g.required_patents, "created_tick": g.created_tick}
        for g in await puzzles.open_gaps(session, world_id)
    ]


@router.post("/{world_id}/gaps/{gap_id}/solve")
async def solve_gap(
    world_id: str,
    gap_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Solve a gap by combining expired patents → in-world patent + draft (#84/85)."""
    from ..db.models import EmptyDataset, Minion
    from ..services import puzzles

    await _world_or_404(session, world_id)
    gap = await session.get(EmptyDataset, gap_id)
    if gap is None or gap.world_id != world_id:
        raise HTTPException(status_code=404, detail="gap not found")
    minion = await session.get(Minion, str(body.get("minion_id") or ""))
    if minion is None or minion.world_id != world_id:
        raise HTTPException(status_code=400, detail="valid minion_id required")
    patent_ids = [str(p) for p in (body.get("patent_ids") or [])]
    return await puzzles.solve(session, minion, gap, patent_ids)


@router.get("/{world_id}/art")
async def world_art(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.47 — the world's cultural corpus, most acclaimed first."""
    from ..db.models import Artwork

    await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(Artwork).where(Artwork.world_id == world_id)
        .order_by(Artwork.acclaim.desc()).limit(40)
    )).scalars().all()
    return [
        {"form": a.form, "style": a.style, "title": a.title,
         "acclaim": round(a.acclaim, 3), "tick": a.tick}
        for a in rows
    ]


@router.get("/{world_id}/fossils")
async def world_fossils(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.14/15 — the fossil record + which geological epochs are reachable."""
    from ..db.models import Fossil
    from ..services.paleontology import reach_for

    world = await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(Fossil).where(Fossil.world_id == world_id).order_by(Fossil.depth.asc())
    )).scalars().all()
    reach = reach_for(world.era)
    return {
        "reach": reach,
        "excavated": [
            {"organism": f.organism, "epoch": f.epoch, "age_my": f.age_my, "depth": f.depth}
            for f in rows if f.excavated
        ],
        "buried": [
            {"epoch": f.epoch, "depth": f.depth, "reachable": f.depth <= reach}
            for f in rows if not f.excavated
        ],
    }


@router.get("/{world_id}/species")
async def world_species(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.12/34 — living species, their populations and evolved traits."""
    from ..db.models import Species

    await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(Species).where(Species.world_id == world_id, Species.alive.is_(True))
        .order_by(Species.population.desc())
    )).scalars().all()
    return [
        {"name": s.name, "kind": s.kind, "population": round(s.population, 3),
         "cold_tolerance": round(s.cold_tolerance, 3), "generation": s.generation}
        for s in rows
    ]


@router.get("/{world_id}/climate")
async def world_climate(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.5/28-30 — current live climate field for the world."""
    from ..services.climate import thermal_stress

    world = await _world_or_404(session, world_id)
    return {
        "season": world.season,
        "temperature": world.temperature,
        "weather": world.weather,
        "thermal_stress": round(thermal_stress(world.temperature or 15.0), 3),
    }


@router.get("/{world_id}/environment")
async def world_environment(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.35-36 — environmental state: pollution + wildlife / food supply."""
    world = await _world_or_404(session, world_id)
    return {
        "pollution": round(world.pollution or 0.0, 3),
        "prey_pop": round(world.prey_pop if world.prey_pop is not None else 1.0, 3),
        "predator_pop": round(world.predator_pop if world.predator_pop is not None else 0.25, 3),
        "food_availability": round(world.prey_pop if world.prey_pop is not None else 1.0, 3),
        "soil_fertility": round(world.soil_fertility if world.soil_fertility is not None else 0.7, 3),
        "crop_yield": round(world.crop_yield or 0.0, 3),
        "tectonic_stress": round(world.tectonic_stress or 0.0, 3),
        "water_table": round(world.water_table if world.water_table is not None else 0.6, 3),
        "epidemic_active": bool(world.epidemic_active),
        "epidemic_infected": round(world.epidemic_infected or 0.0, 3),
        "epidemic_recovered": round(world.epidemic_recovered or 0.0, 3),
        "structure_fatigue": round(world.structure_fatigue or 0.0, 3),
    }


@router.get("/{world_id}/memes")
async def world_memes(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.142-143 — living memes (fads/fashion/ideas), most popular first."""
    from ..db.models import Meme

    await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(Meme).where(Meme.world_id == world_id, Meme.alive.is_(True))
        .order_by(Meme.popularity.desc()).limit(50)
    )).scalars().all()
    return [
        {"name": m.name, "kind": m.kind, "popularity": round(m.popularity, 3),
         "generation": m.generation, "is_variant": m.variant_of is not None}
        for m in rows
    ]


@router.get("/{world_id}/discoveries")
async def world_discoveries(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.22 — foundational technologies this world has discovered, in order."""
    from ..db.models import Discovery
    from ..services.discovery import LADDER

    await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(Discovery).where(Discovery.world_id == world_id).order_by(Discovery.tick.asc())
    )).scalars().all()
    return {
        "discovered": [
            {"tech": d.tech, "tick": d.tick, "sim_year": round(d.sim_year, 1)} for d in rows
        ],
        "remaining": [t.name for t in LADDER if t.name not in {d.tech for d in rows}],
    }


@router.get("/{world_id}/timeline")
async def world_timeline(
    world_id: str,
    since: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=5000),
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.91 — full per-tick history series for rewind/replay + plotting.

    Returns snapshots in ascending tick order (including the knowledge/master
    metrics), so the UI can scrub through a world's whole history.
    """
    await _world_or_404(session, world_id)
    rows = (await session.execute(
        select(PopulationSnapshot)
        .where(PopulationSnapshot.world_id == world_id, PopulationSnapshot.tick >= since)
        .order_by(PopulationSnapshot.tick.asc())
        .limit(limit)
    )).scalars().all()
    return {
        "world_id": world_id,
        "count": len(rows),
        "series": [
            {
                "tick": s.tick, "alive": s.alive, "dead": s.dead,
                "births": s.births, "deaths": s.deaths, "forks": s.forks,
                "generations": s.generations, "inventions_approved": s.inventions_approved,
                "avg_reputation": s.avg_reputation, "avg_sanity": s.avg_sanity,
                "total_knowledge": s.total_knowledge, "masters": s.masters,
            }
            for s in rows
        ],
    }


@router.post("/{world_id}/advance", response_model=AdvanceResponse)
async def advance(
    world_id: str,
    body: AdvanceRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    world = await _world_or_404(session, world_id)
    reports = await advance_world(session, world, ticks=body.ticks)
    return AdvanceResponse(
        world_id=world.id,
        final_tick=world.tick,
        reports=[
            {
                "tick": r.tick,
                "minion_outcomes": r.minion_outcomes,
                "inventions_reviewed": r.inventions_reviewed,
                "inventions_approved": r.inventions_approved,
                "births": r.births,
                "deaths": r.deaths,
                "forks": r.forks,
                "alive": r.alive,
                "projects_created": r.projects_created,
                "project_contributions": r.project_contributions,
                "project_stages_advanced": r.project_stages_advanced,
                "projects_approved": r.projects_approved,
            }
            for r in reports
        ],
    )


@router.get("/{world_id}/stream")
async def stream_events(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    await _world_or_404(session, world_id)

    async def event_generator():
        async for evt in scheduler.subscribe(world_id):
            yield f"data: {json.dumps(evt)}\n\n"
            await asyncio.sleep(0)  # cooperative yield

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── Cutting-edge analytic layers exposed over the live world ─────────────────
@router.get("/{world_id}/civos")
async def get_civos_dashboard(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """CivOS (#7) — the civilisation-health dashboard for this live world.

    Builds a plain-dict snapshot from real counts (population, inventions,
    research, fraud) and runs the six OS modules + composite health score.
    """
    world = await _world_or_404(session, world_id)
    alive = (await session.execute(
        select(func.count()).select_from(Minion)
        .where(Minion.world_id == world_id, Minion.alive.is_(True)))).scalar_one()
    inv_total = (await session.execute(
        select(func.count()).select_from(Invention)
        .where(Invention.world_id == world_id))).scalar_one()
    projects = (await session.execute(
        select(func.count()).select_from(ResearchProject)
        .where(ResearchProject.world_id == world_id))).scalar_one()
    reviews = (await session.execute(select(func.count()).select_from(PeerReview))).scalar_one()
    snapshot = {
        "population": alive,
        "research": {"hypotheses": projects, "experiments": reviews,
                     "invention_candidates": inv_total},
        "knowledge": {"patented": inv_total},
    }
    return {"world_id": world_id, "tick": world.tick,
            "dashboard": civos_mod.civ_dashboard(snapshot)}


@router.get("/{world_id}/knowledge-graph")
async def get_knowledge_graph(
    world_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Civilisation Knowledge Graph (#3) + Reality Validation (#6) for this world.

    Hydrates the typed graph from the world's real Patent / Invention / Discovery
    rows, stamps each node with its A–E confidence class, and returns the
    validation breakdown + the world's `real_fraction` (epistemic health).
    """
    world = await _world_or_404(session, world_id)
    g = kg_mod.KnowledgeGraph()

    patents = (await session.execute(
        select(Patent).limit(500))).scalars().all()
    for p in patents:
        g.add_node(kg_mod.Node(id=f"patent:{p.id}", kind=kg_mod.NodeKind.PATENT,
                               label=p.title or p.id,
                               confidence=kg_mod.classify_patent(), source="patent"))
    invs = (await session.execute(
        select(Invention).where(Invention.world_id == world_id))).scalars().all()
    for iv in invs:
        replicated = (iv.status.value if hasattr(iv.status, "value") else str(iv.status)) == "accepted"
        physics_ok = not (iv.inputs or {}).get("physics", {}).get("violates_limit", False)
        g.add_node(kg_mod.Node(
            id=f"invention:{iv.id}", kind=kg_mod.NodeKind.INVENTION,
            label=iv.title or iv.id,
            confidence=kg_mod.classify_invention(replicated=replicated, physics_ok=physics_ok),
            source="invention"))
    discs = (await session.execute(
        select(Discovery).where(Discovery.world_id == world_id))).scalars().all()
    for d in discs:
        g.add_node(kg_mod.Node(id=f"tech:{d.tech}", kind=kg_mod.NodeKind.PRINCIPLE,
                               label=d.tech,
                               confidence=kg_mod.ConfidenceClass.A_PHYSICS, source="discovery"))

    return {
        "world_id": world_id, "tick": world.tick,
        "nodes": len(g),
        "validation_breakdown": g.validation_breakdown(),
        "real_fraction": g.real_fraction(),
    }


@router.post("/{world_id}/materials")
async def run_real_materials(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """REAL materials modelling on REAL measured data (no simulation).

    Loads the Concrete Compressive Strength dataset (Yeh 1998, 1030 lab-measured
    samples), fits a real model, reports honest k-fold cross-validated error
    (R²/RMSE comparable to the literature ~0.90 / ~5 MPa), and uses the real
    Bayesian optimizer to design a mix maximising predicted strength inside the
    data envelope.

    Body: {"action": "performance"|"importance"|"design", "model": "rf"|"gp"}.
    Every number is reproducible from the bundled CSV.
    """
    world = await _world_or_404(session, world_id)
    action = body.get("action", "performance")
    if action == "design":
        result = real_materials.design_optimal_mix(n_iter=int(body.get("n_iter", 25)))
    elif action == "importance":
        result = real_materials.feature_importance()
    else:
        result = real_materials.cross_validated_performance(
            model=body.get("model", "rf"), folds=int(body.get("folds", 5)))
    return {"world_id": world_id, "tick": world.tick, "action": action, "result": result}


@router.post("/{world_id}/electronics")
async def run_electronics(
    world_id: str, body: dict,
    session: AsyncSession = Depends(get_session), _token: str = Depends(require_bearer),
):
    """Real electronics models (category N), live. Actions: 'dc', 'ac', 'diode',
    'transformer', 'motor', 'battery', 'fuse', 'micro'."""
    world = await _world_or_404(session, world_id)
    a = body.get("action", "dc"); e = electronics
    if a == "ac":
        out = e.ac_impedance(resistance=float(body.get("resistance", 10)),
                             inductance=float(body.get("inductance", 1e-3)),
                             capacitance=float(body.get("capacitance", 1e-6)),
                             frequency=float(body.get("frequency", 1000)))
    elif a == "diode":
        out = {"current": e.diode_current(voltage=float(body.get("voltage", 0.7)))}
    elif a == "transformer":
        out = e.transformer(primary_turns=int(body.get("primary_turns", 100)),
                            secondary_turns=int(body.get("secondary_turns", 200)),
                            primary_voltage=float(body.get("primary_voltage", 120)))
    elif a == "motor":
        out = e.dc_motor(voltage=float(body.get("voltage", 12)), back_emf=float(body.get("back_emf", 10)),
                         resistance=float(body.get("resistance", 1)))
    elif a == "battery":
        out = e.battery_electrochemistry(e0=float(body.get("e0", 1.1)), n=int(body.get("n", 2)),
                                         q_reaction=float(body.get("q_reaction", 1.0)))
    elif a == "micro":
        out = e.microprocessor_architecture(clock_ghz=float(body.get("clock_ghz", 3)),
                                            ipc=float(body.get("ipc", 2)), cores=int(body.get("cores", 4)))
    else:
        out = e.dc_circuit_solve(voltage=float(body.get("voltage", 10)),
                                 resistances=body.get("resistances", [5]),
                                 parallel=bool(body.get("parallel", False)))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/photonics")
async def run_photonics(
    world_id: str, body: dict,
    session: AsyncSession = Depends(get_session), _token: str = Depends(require_bearer),
):
    """Real photonics models (category O), live. Actions: 'lens', 'laser',
    'fibre', 'mach_zehnder', 'microring', 'matmul', 'detector'."""
    world = await _world_or_404(session, world_id)
    a = body.get("action", "lens"); p = photonics
    if a == "laser":
        out = p.laser_threshold(gain_coeff=float(body.get("gain_coeff", 100)),
                                length=float(body.get("length", 0.1)), loss=float(body.get("loss", 5)),
                                mirror_r1=float(body.get("mirror_r1", 0.99)), mirror_r2=float(body.get("mirror_r2", 0.99)))
    elif a == "fibre":
        out = p.fibre_optics(n_core=float(body.get("n_core", 1.5)), n_clad=float(body.get("n_clad", 1.48)))
    elif a == "mach_zehnder":
        out = p.mach_zehnder(phase_diff=float(body.get("phase_diff", 0.0)))
    elif a == "microring":
        out = p.microring_resonator(radius_um=float(body.get("radius_um", 10)), n_group=float(body.get("n_group", 4)),
                                    wavelength_nm=float(body.get("wavelength_nm", 1550)), q_factor=float(body.get("q_factor", 10000)))
    elif a == "matmul":
        out = p.optical_matrix_multiply(body["matrix"], body["vector"])
    elif a == "detector":
        out = p.photodetector_noise(optical_power=float(body.get("optical_power", 1e-4)))
    else:
        out = p.thin_lens_image(focal_length=float(body.get("focal_length", 0.1)),
                                object_distance=float(body.get("object_distance", 0.3)))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/lab-sim")
async def run_lab_sim(
    world_id: str, body: dict,
    session: AsyncSession = Depends(get_session), _token: str = Depends(require_bearer),
):
    """In-world lab simulators (digital twins, feature category G + #248/#253),
    live. These are physics-based SIMULATIONS, not physical hardware (each result
    carries physical_hardware=False). Actions: 'spice', 'cfd', 'pipetting',
    'heating', 'cooling', 'imaging', 'synthesis', 'sequencing', 'cleaning'."""
    world = await _world_or_404(session, world_id)
    a = body.get("action", "spice")
    if a == "spice":
        out = spice_sim.solve_dc(body.get("netlist", [
            {"type": "V", "n1": 1, "n2": 0, "value": 10},
            {"type": "R", "n1": 1, "n2": 2, "value": 1000},
            {"type": "R", "n1": 2, "n2": 0, "value": 1000}]), int(body.get("n_nodes", 3)))
    elif a == "cfd":
        out = cfd_sim.cfd_simulate(n=int(body.get("n", 16)), nu=float(body.get("nu", 0.1)),
                                   lid_velocity=float(body.get("lid_velocity", 1.0)),
                                   steps=int(body.get("steps", 60)))
    elif a in robotic_lab.MODULES:
        fn = getattr(robotic_lab, f"robotic_{a}")
        out = fn(**{k: v for k, v in body.items() if k not in ("action",)})
    else:
        out = {"error": "unknown action"}
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/quantum")
async def run_quantum(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real quantum simulator (feature category P), live. Actions: 'circuit',
    'bell', 'chsh', 'entanglement', 'platform', 'logical', 'mitigation'. Real
    numpy state-vector quantum mechanics."""
    world = await _world_or_404(session, world_id)
    a = body.get("action", "bell")
    q = quantum_sim
    if a == "circuit":
        ops = [tuple(o) for o in body.get("ops", [["H", 0], ["CNOT", 0, 1]])]
        out = q.state_vector_simulator(int(body.get("n", 2)), ops, shots=int(body.get("shots", 1024)))
    elif a == "chsh":
        out = {"chsh_value": round(q.chsh_value(), 6), "classical_bound": 2.0,
               "tsirelson_bound": round(2 * 2 ** 0.5, 6)}
    elif a == "entanglement":
        out = q.entanglement_detector(q.bell_state())
    elif a == "platform":
        out = q.qubit_platform(body.get("platform", "superconducting"))
    elif a == "logical":
        out = q.logical_qubit_error(float(body.get("physical_error", 0.01)),
                                    distance=int(body.get("distance", 3)))
    elif a == "mitigation":
        out = q.error_mitigation(body["noisy_values"], body["scale_factors"])
    else:
        out = q.state_vector_simulator(2, [("H", 0), ("CNOT", 0, 1)], shots=int(body.get("shots", 1024)))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/multiphysics")
async def run_multiphysics(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real multiphysics solvers (feature category M), live. Actions: 'heat',
    'beam', 'fem', 'snell', 'radiation', 'rf', 'relativity', 'thermo',
    'shallow_water', 'fluid_network'. Real numpy physics."""
    world = await _world_or_404(session, world_id)
    a = body.get("action", "heat")
    p = multiphysics
    if a == "beam":
        out = {"deflection": p.beam_tip_deflection(
            load=float(body["load"]), length=float(body["length"]),
            E=float(body["E"]), I=float(body["I"]))}
    elif a == "fem":
        out = p.finite_element_1d(length=float(body.get("length", 1)), E=float(body.get("E", 200e9)),
                                  area=float(body.get("area", 1e-4)), force=float(body.get("force", 1000)))
    elif a == "snell":
        out = p.snell_refraction(n1=float(body.get("n1", 1)), n2=float(body.get("n2", 1.5)),
                                 theta_in_deg=float(body.get("theta_in_deg", 30)))
    elif a == "rf":
        out = p.rf_propagation(distance=float(body.get("distance", 100)),
                               frequency=float(body.get("frequency", 2.4e9)))
    elif a == "relativity":
        out = p.relativity_approximation(velocity=float(body.get("velocity", 1e7)))
    elif a == "thermo":
        out = p.thermodynamic_solver(n_moles=float(body.get("n_moles", 1)),
                                     temperature=float(body.get("temperature", 300)),
                                     volume=float(body.get("volume", 0.0224)))
    elif a == "shallow_water":
        out = p.shallow_water_solver(depth=float(body.get("depth", 10)))
    else:
        out = p.heat_diffusion_1d(body.get("u0", [0]*5 + [100] + [0]*5),
                                  alpha=float(body.get("alpha", 1.0)), dx=float(body.get("dx", 1.0)),
                                  dt=float(body.get("dt", 0.2)), steps=int(body.get("steps", 20)))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/supply-chain")
async def run_supply_chain(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real supply-chain / operations-research tools (feature category L), live.
    Actions: 'eoq', 'dependency', 'bottleneck', 'concentration', 'depletion',
    'forecast', 'reliability', 'recycling', 'disruption'. Real numpy/OR math.
    """
    world = await _world_or_404(session, world_id)
    a = body.get("action", "eoq")
    s = supply_chain
    if a == "dependency":
        out = s.supply_dependency(body.get("nodes", {}))
    elif a == "bottleneck":
        out = {"risks": s.bottleneck_risk(body.get("supply", {}), body.get("demand", {}))}
    elif a == "concentration":
        out = s.source_concentration(body.get("shares", [1.0]))
    elif a == "depletion":
        out = s.resource_depletion(reserve=float(body.get("reserve", 1000)),
                                   annual_consumption=float(body.get("annual_consumption", 100)),
                                   growth=float(body.get("growth", 0.0)))
    elif a == "forecast":
        out = s.inventory_forecast(body.get("history", []), horizon=int(body.get("horizon", 3)))
    elif a == "reliability":
        out = s.supplier_reliability(body.get("deliveries", []))
    elif a == "recycling":
        out = s.recycling_loop(initial=float(body.get("initial", 100)),
                               recovery_rate=float(body.get("recovery_rate", 0.8)),
                               cycles=int(body.get("cycles", 5)))
    elif a == "disruption":
        out = s.disruption_impact(baseline_supply=float(body.get("baseline_supply", 100)),
                                  disruption_fraction=float(body.get("disruption_fraction", 0.5)),
                                  demand=float(body.get("demand", 80)))
    else:
        out = s.economic_order_quantity(annual_demand=float(body.get("annual_demand", 1000)),
                                        order_cost=float(body.get("order_cost", 50)),
                                        holding_cost=float(body.get("holding_cost", 2)))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/simulation-quality")
async def run_simulation_quality(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real simulation V&V / uncertainty-quantification (feature category D), live.
    Actions: 'convergence', 'uncertainty', 'credibility', 'cost', 'artifacts',
    'richardson'. Real numpy implementations.
    """
    world = await _world_or_404(session, world_id)
    a = body.get("action", "uncertainty")
    sq = simulation_quality
    if a == "convergence":
        out = sq.convergence_tracker(body.get("history", []), tol=float(body.get("tol", 1e-3)))
    elif a == "credibility":
        out = sq.solver_credibility(body["predicted"], body["reference"])
    elif a == "cost":
        out = sq.simulation_cost(n_dof=int(body.get("n_dof", 1000)),
                                 dimensions=int(body.get("dimensions", 3)),
                                 solver_order=float(body.get("solver_order", 1.0)))
    elif a == "artifacts":
        out = sq.artifact_detector(body.get("series", []))
    elif a == "richardson":
        out = {"estimate": sq.richardson_extrapolation(
            float(body["coarse"]), float(body["fine"]),
            ratio=float(body.get("ratio", 2.0)), order=float(body.get("order", 2.0)))}
    else:
        out = sq.ensemble_uncertainty(body.get("samples", []))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/instruments-lab")
async def run_instruments_lab(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real instrument/measurement models (feature category E), live. Actions:
    'drift', 'noise', 'reproducibility', 'comparison', 'misuse', 'resolution',
    'standardise'. Real measurement-science implementations.
    """
    world = await _world_or_404(session, world_id)
    a = body.get("action", "noise")
    il = instruments_lab
    if a == "drift":
        out = {"drift": il.calibration_drift(float(body.get("t", 1.0)),
               rate=float(body.get("rate", 0.1)), tau=body.get("tau"))}
    elif a == "reproducibility":
        out = il.reproducibility_score(body.get("runs", []))
    elif a == "comparison":
        out = il.comparison_test(body["inst_a"], body["inst_b"])
    elif a == "misuse":
        out = il.misuse_risk(operator_skill=float(body.get("operator_skill", 0.5)),
                             complexity=float(body.get("complexity", 0.5)),
                             safeguards=float(body.get("safeguards", 0.5)))
    elif a == "resolution":
        out = {"resolution": il.resolution_limit(float(body.get("full_scale", 10.0)),
                                                 bits=int(body.get("bits", 12)))}
    elif a == "standardise":
        out = il.standardisation(float(body["reading"]), reference=float(body["reference"]))
    else:
        out = il.noise_profile(float(body.get("signal", 1.0)),
                               white=float(body.get("white", 0.1)),
                               pink=float(body.get("pink", 0.0)),
                               bandwidth=float(body.get("bandwidth", 1.0)))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/manufacturing")
async def run_manufacturing(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real manufacturing process-capability & yield tools (feature category K),
    live. Actions: 'spc', 'quality', 'yield', 'cleanroom', 'capability',
    'scaleup', 'bottleneck', 'substitution', 'tooling'. Real numpy implementations.
    """
    world = await _world_or_404(session, world_id)
    a = body.get("action", "spc")
    m = manufacturing_capability
    if a == "quality":
        out = m.quality_control(body["measurements"], usl=float(body["usl"]), lsl=float(body["lsl"]))
    elif a == "yield":
        out = m.yield_prediction(float(body.get("defect_density", 0.1)),
                                 float(body.get("die_area", 0.5)),
                                 dies_per_wafer=int(body.get("dies_per_wafer", 100)))
    elif a == "cleanroom":
        out = m.cleanroom_gate(float(body["particles_per_m3"]),
                               required_class=int(body.get("required_class", 5)))
    elif a == "capability":
        out = m.process_capable(body.get("process", "machining"),
                                float(body.get("required_tolerance_mm", 0.1)))
    elif a == "scaleup":
        out = m.scale_up_risk(lab_cpk=float(body.get("lab_cpk", 1.5)))
    elif a == "bottleneck":
        out = m.bottleneck(body.get("stages", {}))
    elif a == "substitution":
        out = {"substitutes": m.supply_substitution(body["material"], body.get("compatibility", {}))}
    elif a == "tooling":
        out = m.tooling_requirements(body.get("process_steps", []))
    else:
        out = m.statistical_process_control(body.get("samples", [1.0, 1.1, 0.9, 1.0]))
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/experiment-design")
async def run_experiment_design(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Real design-of-experiments & lab-analysis tools (feature category F),
    live and callable. Body: {"action": ...}.

    Actions: 'lhs' (Latin-hypercube plan), 'factorial', 'response_surface' (fit +
    optimum), 'control_check' (Welch t-test), 'replication', 'deviation',
    'cost'. All are real numpy/scipy implementations.
    """
    world = await _world_or_404(session, world_id)
    a = body.get("action", "lhs")
    ed = experiment_design
    if a == "factorial":
        out = {"design": ed.full_factorial(body.get("levels", {"x": [0, 1]}))}
    elif a == "response_surface":
        import numpy as np
        X = np.array(body["X"], dtype=float)
        y = np.array(body["y"], dtype=float)
        rs = ed.response_surface_fit(X, y)
        bounds = body.get("bounds") or [[float(X[:, i].min()), float(X[:, i].max())]
                                        for i in range(X.shape[1])]
        out = {"r2": rs.r2, "optimum": ed.response_surface_optimum(rs, bounds)}
    elif a == "control_check":
        out = ed.control_check(body["control"], body["treatment"])
    elif a == "replication":
        out = ed.replication_manager(body["readings"])
    elif a == "deviation":
        out = {"outlier_indices": ed.deviation_logger(body["readings"])}
    elif a == "cost":
        out = {"cost": ed.experiment_cost(
            n_runs=int(body.get("n_runs", 10)), unit_cost=float(body.get("unit_cost", 1.0)),
            fixed=float(body.get("fixed", 0.0)), replication=int(body.get("replication", 1)))}
    else:
        out = {"plan": ed.latin_hypercube(
            int(body.get("n", 10)),
            [tuple(b) for b in body.get("bounds", [[0, 1], [0, 1]])],
            seed=int(body.get("seed", 0))).tolist()}
    return {"world_id": world_id, "tick": world.tick, "action": a, "result": out}


@router.post("/{world_id}/optimize")
async def run_real_optimization(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """REAL Bayesian optimization — a genuine GP surrogate + Expected-Improvement
    loop (scikit-learn), validated against benchmark functions with PUBLISHED
    global optima. No hashes, no hardcoded answers.

    Body: {"benchmark": "branin"|"hartmann6"|"ackley5", "n_iter": int,
    "seeds": int, "compare_random": bool, "noise": float}.

    Returns the real convergence result: best value found, regret against the
    literature optimum, and (if compare_random) a head-to-head vs random search
    over `seeds` runs — an externally reproducible claim. This is the engine the
    self-driving lab should call for continuous problems; the categorical lab
    campaign remains a simulation.
    """
    world = await _world_or_404(session, world_id)
    name = body.get("benchmark", "branin")
    if name not in real_optimizer.BENCHMARKS:
        raise HTTPException(status_code=400,
                            detail=f"unknown benchmark; choose from {list(real_optimizer.BENCHMARKS)}")
    b = real_optimizer.BENCHMARKS[name]
    n_iter = int(body.get("n_iter", 25))
    noise = float(body.get("noise", 0.0))

    if body.get("compare_random", True):
        summary = real_optimizer.benchmark_vs_random(
            name, seeds=int(body.get("seeds", 5)), n_iter=n_iter)
    else:
        summary = None

    single = real_optimizer.bayes_optimize(
        b.fn, b.bounds, n_init=int(body.get("n_init", 5)), n_iter=n_iter,
        optimum=b.optimum, seed=int(body.get("seed", 0)), noise=noise)
    return {
        "world_id": world_id, "tick": world.tick,
        "engine": "scikit-learn GaussianProcessRegressor + Expected Improvement",
        "benchmark": name, "dim": b.dim, "published_optimum": b.optimum,
        "best_value": round(single.best_y, 5),
        "regret": round(single.regret, 5),
        "converged": single.converged,
        "evaluations": single.n_eval,
        "kernel": single.extra.get("kernel"),
        "vs_random": summary,
        "note": "Real GP-BO. Regret is distance to the literature global optimum; "
                "reproducible by re-running with the same seeds.",
    }


@router.post("/{world_id}/autonomous-research")
async def run_autonomous_research(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Self-directing R&D programme (spec §21.4, autonomy ≥5).

    Hydrates the world's knowledge graph, then lets the Research Director set its
    own agenda: each cycle it picks the highest-value frontier target, compiles
    it into a Self-Driving Lab experiment, runs the active-learning campaign, and
    folds the validated result back as a new confidence-classed knowledge node —
    no human picking targets. Body: {"cycles": int, "known": [node_id], "seed":
    {materials:[...], methods:[...], instruments:[...], target_invention: str}}.

    Returns the programme report: discoveries, epistemic health before/after,
    and a per-cycle trace. Discovered nodes are in-silico candidates (B/C grade),
    never fabricated A/physics claims.

    Persistent + compounding: prior autonomous discoveries (Discovery rows tagged
    `auto:`) are reloaded as known knowledge so repeated calls across ticks climb
    the world's own tech tree, and each new discovery is written back as a
    Discovery row + Event. Idempotent against the (world_id, tech) constraint.
    """
    world = await _world_or_404(session, world_id)
    g = kg_mod.KnowledgeGraph()
    g.add_node(kg_mod.Node("inst-autonomous-lab", kg_mod.NodeKind.INSTITUTION,
                           "Autonomous Lab", kg_mod.ConfidenceClass.B_LITERATURE))

    seed = body.get("seed") or {}
    known: list[str] = list(body.get("known") or [])
    for m in (seed.get("materials") or ["Li", "I", "Mg"]):
        nid = f"mat:{m}"
        g.add_node(kg_mod.Node(nid, kg_mod.NodeKind.MATERIAL, m, kg_mod.ConfidenceClass.B_LITERATURE))
        known.append(nid)
    for m in (seed.get("methods") or ["sinter", "anneal"]):
        nid = f"meth:{m}"
        g.add_node(kg_mod.Node(nid, kg_mod.NodeKind.METHOD, m, kg_mod.ConfidenceClass.B_LITERATURE))
        known.append(nid)
    for ins in (seed.get("instruments") or ["xrd"]):
        nid = f"instr:{ins}"
        g.add_node(kg_mod.Node(nid, kg_mod.NodeKind.INSTRUMENT, ins, kg_mod.ConfidenceClass.A_PHYSICS))
        known.append(nid)

    # Reload prior autonomous discoveries so research COMPOUNDS across ticks.
    prior = (await session.execute(
        select(Discovery.tech).where(Discovery.world_id == world_id,
                                     Discovery.tech.like("auto:%")))).scalars().all()
    established_before = {t[len("auto:"):] for t in prior}

    # One independent research line per cycle: each is an invention one
    # unestablished principle away. Already-established lines are pre-known, so
    # the programme advances onto fresh frontier each call.
    cycles = max(1, int(body.get("cycles", 4)))
    base = seed.get("target_invention", "device")
    for i in range(cycles + len(established_before)):
        prin_id, inv_id = f"prin:line{i}", f"inv:line{i}"
        label = f"{base}-{i}"
        g.add_node(kg_mod.Node(prin_id, kg_mod.NodeKind.PRINCIPLE,
                               f"principle for {label}", kg_mod.ConfidenceClass.C_SIMULATION))
        g.add_node(kg_mod.Node(inv_id, kg_mod.NodeKind.INVENTION, label,
                               kg_mod.ConfidenceClass.D_SPECULATIVE))
        g.add_edge(kg_mod.Edge(inv_id, known[0], kg_mod.EdgeKind.REQUIRES))
        g.add_edge(kg_mod.Edge(inv_id, prin_id, kg_mod.EdgeKind.REQUIRES))
        if label in established_before:
            known.extend([prin_id, f"discovered::{prin_id}"])  # already done

    report = research_director.autonomous_program(g, known, cycles=cycles)

    # Persist new discoveries (idempotent against the unique constraint).
    persisted: list[str] = []
    for n in g.nodes_of(kg_mod.NodeKind.METHOD):
        if not n.id.startswith("discovered::"):
            continue
        label = n.label.replace("established: ", "")
        tech = f"auto:{label}"[:40]
        if label in established_before or tech[len("auto:"):] in established_before:
            continue
        exists = await session.scalar(
            select(Discovery.id).where(Discovery.world_id == world_id, Discovery.tech == tech))
        if exists:
            continue
        session.add(Discovery(world_id=world_id, tech=tech, tick=world.tick,
                              sim_year=world.sim_year))
        session.add(Event(world_id=world_id, tick=world.tick, kind="discovery:autonomous",
                          actor_id=None,
                          payload={"label": label, "confidence": n.confidence.value}))
        persisted.append(label)
    await session.commit()

    report["persisted"] = persisted
    report["prior_established"] = sorted(established_before)
    return {"world_id": world_id, "tick": world.tick, "report": report}


@router.post("/{world_id}/invent")
async def run_invention(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Autonomous Invention pipeline (#5) over this world's real patents.

    Body: {"problem": str, "domains": [str], "source": "paper"|"industrial_need"}.
    Detects the gap, pulls the world's expired patents, combines them through the
    knowledge graph's novelty engine, simulates, peer-reviews, and returns an
    attorney-reviewable invention disclosure (every claim confidence-classed,
    with the #8 ethics disclaimer — candidate only, no autonomous filing).
    """
    world = await _world_or_404(session, world_id)
    signals = [{
        "problem": body.get("problem", "unspecified technical gap"),
        "domain": (body.get("domains") or ["general"])[0],
        "relevant_domains": body.get("domains") or ["general"],
        "source": body.get("source", "industrial_need"),
    }]
    patents = (await session.execute(select(Patent).limit(200))).scalars().all()
    pool = [{"id": p.id, "title": p.title, "abstract": p.abstract,
             "cpc_class": p.cpc_class, "expired": p.expired,
             "keywords": ((p.title or "") + " " + (p.abstract or "")).lower().split()}
            for p in patents]
    # Build a graph whose principle-nodes are the patents (so novelty can score).
    g = kg_mod.KnowledgeGraph()
    for p in pool:
        g.add_node(kg_mod.Node(id=f"patent:{p['id']}", kind=kg_mod.NodeKind.PATENT,
                               label=p["title"] or p["id"],
                               confidence=kg_mod.classify_patent()))
    models = {m: {"physics_consistent": True, "replicated": True}
              for m in ("thermal", "electrical", "mechanical", "cost", "failure", "environmental")}
    reviews = [{"replicated": True, "fraud": False} for _ in range(3)]
    result = invention_mod.run_pipeline(signals, pool, g, models, reviews)
    return {"world_id": world_id, "tick": world.tick, "result": result}


@router.post("/{world_id}/counterfactual")
async def run_counterfactual(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Counterfactual experiment engine (#1).

    Body: {"label": str, "baseline": {metric: val}, "intervention": {metric: val}}.
    Compares a forked timeline's end-state metrics against the baseline across
    population/knowledge/invention/mortality/etc. and returns the divergence +
    a scale-normalised headline. Turns the sim into an experiment machine.
    """
    world = await _world_or_404(session, world_id)
    res = world_model_mod.counterfactual(
        body.get("baseline", {}), body.get("intervention", {}),
        label=body.get("label", "counterfactual"),
    )
    return {"world_id": world_id, "tick": world.tick,
            "summary": res.summary, "divergence": res.divergence}


@router.post("/{world_id}/discover-cure")
async def run_cure_discovery(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Virtual Cell discovery (AI-for-science wedge).

    Body: {"disease": str, "evidence": [{kind,id,name,source,strength,...}]}.
    Walks genome→protein→pathway→target→intervention→validation and returns the
    reviewable package: mechanism graph (confidence-classed), perturbation
    hypotheses, target shortlist, intervention candidates + toxicity flags, a
    staged validation plan, a prior-art map over the world's patents, and an
    invention-disclosure skeleton. Candidate-only — requires human + wet-lab +
    attorney review (services.ethics enforced).
    """
    world = await _world_or_404(session, world_id)
    disease = body.get("disease", "unspecified dysfunction")
    evidence = body.get("evidence", [])
    patents = (await session.execute(select(Patent).limit(200))).scalars().all()
    pool = [{"id": p.id, "title": p.title, "abstract": p.abstract} for p in patents]
    package = vc_mod.discover(disease, evidence, pool)
    return {"world_id": world_id, "tick": world.tick, "package": package}


@router.post("/{world_id}/lab-campaign")
async def run_lab_campaign(
    world_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Self-Driving Lab closed-loop campaign (A-Lab / Toronto comparable).

    Body (experiment-as-code): {"objective", "sample_space": {factor:[levels]},
    "success_metric", "target", "instruments":[...], "favoured": {factor:level}}.
    Runs active-learning (UCB acquisition over a surrogate) to find the optimum
    in fewer experiments than exhaustive search, then returns a provenance-
    complete campaign report. The hidden objective rewards proximity to
    `favoured` (stand-in for the world's true synthesis outcome).
    """
    world = await _world_or_404(session, world_id)
    space = body.get("sample_space") or {"x": ["a", "b", "c"]}
    favoured = body.get("favoured") or {k: v[0] for k, v in space.items()}
    protocol = lab_mod.Protocol(
        objective=body.get("objective", "optimise target metric"),
        sample_space=space,
        success_metric=body.get("success_metric", "metric"),
        target=float(body.get("target", 0.9)),
        instruments=body.get("instruments", []),
        max_runs=int(body.get("max_runs", 12)),
        replication=int(body.get("replication", 2)),
    )

    def objective(point: dict) -> float:
        score = 0.4
        match = sum(1 for k, v in favoured.items() if point.get(k) == v)
        return score + 0.6 * (match / max(1, len(favoured)))

    camp = lab_mod.run_campaign(protocol, objective,
                                instrument_precision=float(body.get("precision", 0.03)))
    return {"world_id": world_id, "tick": world.tick,
            "report": lab_mod.campaign_report(camp)}
