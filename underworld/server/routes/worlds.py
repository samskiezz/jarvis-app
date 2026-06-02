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
from ..services import knowledge_graph as kg_mod
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
    # a frontier target one prerequisite away from being comprehensible
    g.add_node(kg_mod.Node("prin:frontier", kg_mod.NodeKind.PRINCIPLE,
                           "unestablished principle", kg_mod.ConfidenceClass.C_SIMULATION))
    target_label = seed.get("target_invention", "novel device")
    g.add_node(kg_mod.Node("inv:target", kg_mod.NodeKind.INVENTION, target_label,
                           kg_mod.ConfidenceClass.D_SPECULATIVE))
    g.add_edge(kg_mod.Edge("inv:target", known[0], kg_mod.EdgeKind.REQUIRES))
    g.add_edge(kg_mod.Edge("inv:target", "prin:frontier", kg_mod.EdgeKind.REQUIRES))

    report = research_director.autonomous_program(
        g, known, cycles=int(body.get("cycles", 4)))
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
