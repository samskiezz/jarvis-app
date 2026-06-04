from __future__ import annotations

import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import require_bearer
from ..db.models import CauseOfDeath, Event, Memory, Minion, Relationship, Skill, Soul, World
from ..db.session import get_session
from ..genetics import dna as dna_mod
from ..services import lifecycle
from .schemas import (
    BreedRequest,
    ForkRequest,
    LineageNode,
    LineageOut,
    MemoryOut,
    MinionOut,
    RelationshipOut,
    SkillOut,
)

router = APIRouter(prefix="/minions", tags=["minions"])


def _to_minion_out(m: Minion, skill_count: int) -> MinionOut:
    return MinionOut(
        id=m.id,
        world_id=m.world_id,
        soul_id=m.soul_id,
        name=m.name,
        surname=m.surname or "",
        nickname=m.nickname or "",
        guild=m.guild,
        swarm_role=m.swarm_role,
        generation=m.generation,
        parent_a_id=m.parent_a_id,
        parent_b_id=m.parent_b_id,
        forked_from_id=m.forked_from_id,
        openness=m.openness,
        conscientiousness=m.conscientiousness,
        extraversion=m.extraversion,
        agreeableness=m.agreeableness,
        neuroticism=m.neuroticism,
        intelligence=m.intelligence,
        creativity=m.creativity,
        reputation=m.reputation,
        karma=m.karma,
        born_tick=m.born_tick,
        died_tick=m.died_tick,
        cause_of_death=m.cause_of_death,
        alive=m.alive,
        hunger=m.hunger,
        thirst=m.thirst,
        fatigue=m.fatigue,
        sanity=m.sanity,
        health=m.health,
        mood=m.mood,
        stress=m.stress,
        morale=m.morale if m.morale is not None else 0.5,
        purpose=m.purpose if m.purpose is not None else 0.5,
        injury=m.injury if m.injury is not None else 0.0,
        addiction=m.addiction if m.addiction is not None else 0.0,
        skill_count=skill_count,
    )


def _to_node(m: Minion) -> LineageNode:
    return LineageNode(
        id=m.id,
        name=m.name,
        surname=m.surname or "",
        guild=m.guild,
        generation=m.generation,
        alive=m.alive,
        born_tick=m.born_tick,
        died_tick=m.died_tick,
        parent_a_id=m.parent_a_id,
        parent_b_id=m.parent_b_id,
        forked_from_id=m.forked_from_id,
    )


async def _minion_or_404(session: AsyncSession, minion_id: str) -> Minion:
    m = await session.get(Minion, minion_id)
    if not m:
        raise HTTPException(status_code=404, detail="minion not found")
    return m


class ChatTurn(BaseModel):
    role: str
    content: str


class MinionChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatTurn] | None = None


class MinionChatResponse(BaseModel):
    reply: str
    in_character: bool
    used_llm: bool


@router.get("/{minion_id}", response_model=MinionOut)
async def get_minion(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    minion = await _minion_or_404(session, minion_id)
    skill_count = await session.scalar(
        select(Skill.id).where(Skill.minion_id == minion_id).limit(1)
    )
    return _to_minion_out(minion, 1 if skill_count else 0)


@router.post("/{minion_id}/chat", response_model=MinionChatResponse)
async def chat_minion(
    minion_id: str,
    body: MinionChatRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Talk directly to a Minion — it answers AS ITSELF, grounded in its live
    state. Uses Kimi K2 when configured, with a local in-character fallback so
    the feature always works offline. Never 500s on a normal chat."""
    from ..services import minion_chat

    minion = await _minion_or_404(session, minion_id)
    history = [{"role": t.role, "content": t.content} for t in (body.history or [])]
    try:
        result = await minion_chat.reply(session, minion, body.message, history)
    except Exception:  # noqa: BLE001 — chat must never hard-fail the request
        result = {
            "reply": f"{minion.name} looks at you but says nothing right now.",
            "in_character": True,
            "used_llm": False,
        }
    return MinionChatResponse(**result)


@router.get("/{minion_id}/dna")
async def get_dna(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    minion = await _minion_or_404(session, minion_id)
    return {
        "minion_id": minion.id,
        "length": len(minion.dna),
        "dna_preview": minion.dna[:128],
        "traits": dna_mod.trait_vector(minion.dna),
    }


@router.get("/{minion_id}/soul")
async def get_soul(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    minion = await _minion_or_404(session, minion_id)
    soul = await session.get(Soul, minion.soul_id) if minion.soul_id else None
    if not soul:
        raise HTTPException(status_code=404, detail="soul not found")
    return {
        "id": soul.id,
        "token": soul.token,
        "incarnation": soul.incarnation,
        "karma": soul.karma,
        "ascended": soul.ascended,
        "ancestral_summary": soul.ancestral_summary,
    }


@router.get("/{minion_id}/skills", response_model=list[SkillOut])
async def list_skills(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    await _minion_or_404(session, minion_id)
    stmt = select(Skill).where(Skill.minion_id == minion_id).order_by(Skill.level.desc())
    res = await session.execute(stmt)
    return [
        SkillOut(name=s.name, level=s.level, last_practiced_tick=s.last_practiced_tick)
        for s in res.scalars().all()
    ]


@router.get("/{minion_id}/models")
async def list_models(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.58 — the ML models this Minion has trained."""
    from ..services import mlmodels

    await _minion_or_404(session, minion_id)
    return [
        {"task": m.task, "samples": m.samples, "accuracy": m.accuracy, "updated_tick": m.updated_tick}
        for m in await mlmodels.models_for(session, minion_id)
    ]


@router.post("/{minion_id}/train-model")
async def train_model(
    minion_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Train (or extend) an ML model on `samples` of the Minion's own data."""
    from ..db.models import Minion, Skill, World
    from ..services import mlmodels

    minion = await _minion_or_404(session, minion_id)
    task = str(body.get("task") or "classifier")[:40]
    samples = int(body.get("samples") or 100)
    skill = (await session.execute(
        select(Skill).where(Skill.minion_id == minion_id, Skill.name == "computing")
    )).scalars().first()
    skill_level = skill.level if skill else max(1.0, 5.0 * minion.intelligence)
    world = await session.get(World, minion.world_id)
    model = await mlmodels.train(session, minion_id, task, new_samples=samples,
                                 skill_level=skill_level, tick=world.tick if world else 0)
    return {"task": model.task, "samples": model.samples, "accuracy": model.accuracy}


@router.post("/{minion_id}/gateway")
async def consult_gateway(
    minion_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.75-85 — attempt to pass the Internet Gateway and read a real dataset."""
    from ..services import gateway

    minion = await _minion_or_404(session, minion_id)
    return await gateway.consult_gateway(
        session, minion,
        str(body.get("discipline") or minion.guild.value),
        str(body.get("query") or "science"),
    )


@router.get("/{minion_id}/appearance")
async def get_appearance(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc II.144-146 — the Minion's look, drawn from its world's unlocked tech."""
    from ..db.models import Discovery, World
    from ..services import appearance

    minion = await _minion_or_404(session, minion_id)
    world = await session.get(World, minion.world_id)
    discovered = {
        r[0] for r in (await session.execute(
            select(Discovery.tech).where(Discovery.world_id == minion.world_id)
        )).all()
    }
    return appearance.for_minion(minion, world.era if world else "stone", discovered)


@router.get("/{minion_id}/brain")
async def get_brain(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc II.101 — this Minion's neural policy: its current action dispositions."""
    from ..services import neural

    minion = await _minion_or_404(session, minion_id)
    scores = neural.policy(minion)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return {
        "dispositions": [{"action": a, "score": s} for a, s in ranked],
        "trained": bool((minion.brain or {}).get("b2")),
    }


@router.get("/{minion_id}/beliefs")
async def list_beliefs(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Doc I.23 — the Minion's learned cause→effect hypotheses, most confident first."""
    from ..services import reasoning

    await _minion_or_404(session, minion_id)
    return [
        {
            "cause": b.cause, "effect": b.effect, "trials": b.trials,
            "confirmations": b.confirmations, "confidence": b.confidence,
            "updated_tick": b.updated_tick,
        }
        for b in await reasoning.beliefs(session, minion_id)
    ]


@router.get("/{minion_id}/memories", response_model=list[MemoryOut])
async def list_memories(
    minion_id: str,
    limit: int = 30,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    await _minion_or_404(session, minion_id)
    stmt = (
        select(Memory)
        .where(Memory.minion_id == minion_id)
        .order_by(Memory.tick.desc(), Memory.created_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    res = await session.execute(stmt)
    return [
        MemoryOut(id=m.id, tick=m.tick, kind=m.kind, content=m.content, importance=m.importance)
        for m in res.scalars().all()
    ]


@router.get("/{minion_id}/relationships", response_model=list[RelationshipOut])
async def list_relationships(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    await _minion_or_404(session, minion_id)
    stmt = select(Relationship).where(
        or_(Relationship.from_id == minion_id, Relationship.to_id == minion_id)
    )
    res = await session.execute(stmt)
    rels = list(res.scalars().all())
    if not rels:
        return []
    other_ids = {r.from_id if r.from_id != minion_id else r.to_id for r in rels}
    name_stmt = select(Minion).where(Minion.id.in_(other_ids))
    name_res = await session.execute(name_stmt)
    name_map = {m.id: f"{m.name} {m.surname}".strip() for m in name_res.scalars().all()}
    return [
        RelationshipOut(
            id=r.id,
            from_id=r.from_id,
            to_id=r.to_id,
            other_name=name_map.get(
                r.to_id if r.from_id == minion_id else r.from_id, "?",
            ),
            kind=r.kind,
            strength=r.strength,
            formed_tick=r.formed_tick,
            last_interaction_tick=r.last_interaction_tick,
        )
        for r in rels
    ]


@router.get("/{minion_id}/lineage", response_model=LineageOut)
async def get_lineage(
    minion_id: str,
    depth: int = 3,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    root = await _minion_or_404(session, minion_id)
    depth = max(1, min(depth, 6))

    # Ancestors — BFS up via parent_a_id / parent_b_id.
    ancestors: dict[str, Minion] = {}
    frontier = [pid for pid in (root.parent_a_id, root.parent_b_id) if pid]
    for _ in range(depth):
        if not frontier:
            break
        stmt = select(Minion).where(Minion.id.in_(frontier))
        res = await session.execute(stmt)
        new_frontier: list[str] = []
        for m in res.scalars().all():
            if m.id in ancestors:
                continue
            ancestors[m.id] = m
            for pid in (m.parent_a_id, m.parent_b_id):
                if pid and pid not in ancestors:
                    new_frontier.append(pid)
        frontier = new_frontier

    # Descendants — BFS down by querying children.
    descendants: dict[str, Minion] = {}
    parent_layer = [root.id]
    for _ in range(depth):
        if not parent_layer:
            break
        stmt = select(Minion).where(
            or_(
                Minion.parent_a_id.in_(parent_layer),
                Minion.parent_b_id.in_(parent_layer),
            )
        )
        res = await session.execute(stmt)
        new_layer: list[str] = []
        for child in res.scalars().all():
            if child.id in descendants:
                continue
            descendants[child.id] = child
            new_layer.append(child.id)
        parent_layer = new_layer

    # Siblings — same parents, not self.
    siblings: list[Minion] = []
    if root.parent_a_id or root.parent_b_id:
        sib_stmt = select(Minion).where(
            Minion.id != root.id,
            or_(
                Minion.parent_a_id == root.parent_a_id if root.parent_a_id else False,
                Minion.parent_b_id == root.parent_b_id if root.parent_b_id else False,
            ),
        )
        sib_res = await session.execute(sib_stmt)
        siblings = list(sib_res.scalars().all())

    # Forks — branched copies of this minion or things this was forked from.
    fork_stmt = select(Minion).where(
        or_(Minion.forked_from_id == root.id, Minion.id == root.forked_from_id)
    )
    fork_res = await session.execute(fork_stmt)
    forks = list(fork_res.scalars().all())

    return LineageOut(
        root=root.id,
        ancestors=[_to_node(m) for m in ancestors.values()],
        descendants=[_to_node(m) for m in descendants.values()],
        siblings=[_to_node(m) for m in siblings],
        forks=[_to_node(m) for m in forks],
    )


@router.post("/breed", response_model=MinionOut, status_code=201)
async def breed(
    body: BreedRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Manually breed two Minions (admin-style endpoint for the UI)."""
    a = await _minion_or_404(session, body.parent_a_id)
    b = await _minion_or_404(session, body.parent_b_id)
    if a.world_id != b.world_id:
        raise HTTPException(status_code=400, detail="parents must live in the same world")
    world = await session.get(World, a.world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world missing")
    if not lifecycle.can_breed(a, b, world_tick=world.tick):
        raise HTTPException(status_code=409, detail="parents are not eligible to breed")
    rng = random.Random(world.seed_value ^ (world.tick * 0xBADD0BAD))
    child = await lifecycle.breed_pair(session, world=world, parent_a=a, parent_b=b, rng=rng)
    return _to_minion_out(child, len(child.skills) if "skills" in child.__dict__ else 0)


@router.post("/{minion_id}/kill", response_model=MinionOut)
async def kill_minion(
    minion_id: str,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    """Prune a Minion. Doc II.106: operator-initiated reset.

    Soft-kill: sets alive=False with cause=PRUNED so the soul persists
    for reincarnation. Records a Memory + Event row so the audit trail
    shows the kill came from the operator and not from natural lifecycle.
    """
    m = await _minion_or_404(session, minion_id)
    if not m.alive:
        raise HTTPException(status_code=409, detail="minion already dead")
    world = await session.get(World, m.world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world missing")
    m.alive = False
    m.died_tick = world.tick
    m.cause_of_death = CauseOfDeath.PRUNED
    session.add(
        Memory(
            minion_id=m.id,
            tick=world.tick,
            kind="death",
            content=f"Pruned by operator at tick {world.tick}.",
            importance=1.0,
        )
    )
    session.add(
        Event(
            world_id=world.id,
            tick=world.tick,
            kind="minion:pruned",
            actor_id=m.id,
            payload={"name": f"{m.name} {m.surname}".strip(), "guild": m.guild.value},
        )
    )
    skill_count = await session.scalar(select(Skill.id).where(Skill.minion_id == m.id).limit(1))
    return _to_minion_out(m, 1 if skill_count else 0)


@router.post("/fork", response_model=MinionOut, status_code=201)
async def fork(
    body: ForkRequest,
    session: AsyncSession = Depends(get_session),
    _token: str = Depends(require_bearer),
):
    source = await _minion_or_404(session, body.minion_id)
    if not source.alive:
        raise HTTPException(status_code=409, detail="cannot fork a dead minion")
    world = await session.get(World, source.world_id)
    if not world:
        raise HTTPException(status_code=404, detail="world missing")
    rng = random.Random(world.seed_value ^ (world.tick * 0xFEEDF00D))
    clone = await lifecycle.fork_minion(session, world=world, source=source, rng=rng)
    return _to_minion_out(clone, 0)
