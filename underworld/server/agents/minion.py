"""Minion agent loop — one tick = one decision.

The agent runs an LLM (Kimi K2) with a structured-JSON output contract.
It cannot execute arbitrary code; the only side effects it can request are
the named actions in `_ACTIONS`. Each action is dispatched here, performs
its work, and writes the resulting Memory / Invention / Event rows.

Section II of the doc requires that Minions:
- be driven by needs (hunger, thirst, fatigue, sanity) — passed into prompt
- experience and act on mood (II.7-11) — passed into prompt
- have an explicit decision contract — strict JSON output
- can socialise (II.13-16) and propose breeding (II.16-19) — actions added
- write down their thoughts as memories (II.24-25)
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db.models import (
    Event,
    Invention,
    KnowledgeFormula,
    Memory,
    Minion,
    Patent,
    Skill,
    TaskStatus,
    World,
)
from ..genetics import dna as dna_mod
from ..services import lifecycle
from ..tools import llm, patent_search, safety


_SYSTEM_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "minion_system.md").read_text(
    encoding="utf-8"
)


_ACTIONS = {
    "search_patents",
    "propose_invention",
    "study",
    "rest",
    "eat",
    "drink",
    "socialise",
    "seek_partner",
    "meditate",
    "fork_self",
    "teach",
    "kb_lookup",
}


# Map swarm role → discipline to look up by default. Lets a Minion's kb_lookup
# action default to its specialty when the args don't specify one.
_ROLE_DEFAULT_DISCIPLINE = {
    "formula_oracle": "mathematics",
    "genome_analyst": "bioinformatics",
    "protein_modeller": "biology",
    "chemistry_generator": "chemistry",
    "toxicity_checker": "biology",
    "trial_simulator": "ai",
    "regulatory_reasoner": "biology",
    "experimental_designer": "physics",
    "literature_scout": "ai",
    "generalist": "ai",
}


@dataclass
class TickOutcome:
    minion_id: str
    action: str
    summary: str
    inventions_created: list[str] = field(default_factory=list)
    blocked_by_safety: bool = False
    seek_partner_for: str | None = None  # candidate partner minion id
    request_fork: bool = False


def _build_system_prompt(minion: Minion, world: World, biome: str) -> str:
    return _SYSTEM_PROMPT.format(
        name=minion.name,
        surname=minion.surname or "",
        guild=minion.guild.value,
        swarm_role=minion.swarm_role.value,
        openness=minion.openness,
        conscientiousness=minion.conscientiousness,
        extraversion=minion.extraversion,
        agreeableness=minion.agreeableness,
        neuroticism=minion.neuroticism,
        intelligence=minion.intelligence,
        creativity=minion.creativity,
        reputation=minion.reputation,
        karma=minion.karma,
        tick=world.tick,
        born_tick=minion.born_tick,
        age=world.tick - minion.born_tick,
        generation=minion.generation,
        world_class=world.seed_class,
        biome=biome,
        hunger=minion.hunger,
        thirst=minion.thirst,
        fatigue=minion.fatigue,
        sanity=minion.sanity,
        health=minion.health,
        stress=minion.stress,
        mood=minion.mood.value,
    )


def _safe_parse_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _heuristic_decision(minion: Minion, rng: random.Random, world_tick: int = 0) -> dict[str, Any]:
    """When the LLM is offline/unavailable, derive a sensible action from
    needs + personality. This is the production fallback so the simulation
    doesn't degenerate to all-rest when an API key is missing.

    Order matters: survival → reproduction drive → cognitive drive →
    social drive → maintenance. This produces visible births/forks even
    when no LLM is configured, so a military demo on offline air-gapped
    hardware still sees population dynamics.
    """
    age = world_tick - minion.born_tick

    # Survival first — needs trump everything else when critical.
    if minion.hunger < 0.3:
        return {"thought": "I am hungry.", "action": "eat", "args": {}, "memory_to_store": ""}
    if minion.thirst < 0.3:
        return {"thought": "I am parched.", "action": "drink", "args": {}, "memory_to_store": ""}
    if minion.fatigue < 0.25:
        return {"thought": "Exhausted; resting.", "action": "rest", "args": {}, "memory_to_store": ""}
    if minion.sanity < 0.3:
        return {"thought": "Need stillness.", "action": "meditate", "args": {}, "memory_to_store": ""}

    r = rng.random()

    # Role-driven research drive — knowledge-base lookups bias toward formula
    # oracles and literature scouts. Strengthened during the first 100 ticks
    # of life to build a research footprint.
    role = minion.swarm_role.value
    if role in {"formula_oracle", "literature_scout"} and r < 0.35:
        return {
            "thought": f"As {role}, querying the knowledge base.",
            "action": "kb_lookup",
            "args": {"discipline": _ROLE_DEFAULT_DISCIPLINE.get(role, "ai")},
            "memory_to_store": "",
        }
    if role in {"genome_analyst", "chemistry_generator", "protein_modeller"} and r < 0.18:
        return {
            "thought": f"Refreshing {role} priors.",
            "action": "kb_lookup",
            "args": {"discipline": _ROLE_DEFAULT_DISCIPLINE.get(role, "ai")},
            "memory_to_store": "",
        }

    # Reproduction drive — kicks in once adult and not from a reviewer guild.
    # Patent + Safety guilds are functional roles; they breed less.
    reviewer_guild = minion.guild.value in {"patent", "safety"}
    breeding_age = age > 50
    if breeding_age and not reviewer_guild and minion.health > 0.6 and minion.fatigue > 0.4:
        breeding_drive = (
            0.04
            + 0.10 * minion.extraversion
            + 0.05 * minion.agreeableness
            + 0.05 * (1.0 - minion.neuroticism)
        )
        if r < breeding_drive:
            return {
                "thought": "I want a family.",
                "action": "seek_partner",
                "args": {},
                "memory_to_store": "",
            }
        # Forking is rarer — only for high-reputation, creative minions.
        fork_drive = max(0.0, (minion.reputation - 1.3) * 0.03) + 0.02 * minion.creativity
        if minion.reputation > 1.4 and minion.creativity > 0.7 and r < breeding_drive + fork_drive:
            return {
                "thought": "I feel uniquely useful — should fork.",
                "action": "fork_self",
                "args": {},
                "memory_to_store": "",
            }

    # Cognitive drive
    if minion.openness > 0.6 and r < 0.30:
        return {
            "thought": f"Curious about {minion.guild.value} prior art.",
            "action": "search_patents",
            "args": {"query": minion.guild.value, "limit": 4},
            "memory_to_store": "",
        }
    if minion.creativity > 0.55 and r < 0.50:
        domain = minion.guild.value
        return {
            "thought": "Combining what I know into a proposal.",
            "action": "propose_invention",
            "args": {
                "title": f"{domain.title()} concept proposed by {minion.name} {minion.surname} at tick {world_tick}",
                "problem": (
                    f"Existing {domain} systems suffer from poor efficiency at small scales because "
                    f"thermal coupling, mechanical losses, and control latency compound. We aim to "
                    f"halve those losses without doubling cost or footprint."
                ),
                "hypothesis": (
                    f"By combining a passive {domain} stage with an adaptive control loop tuned via "
                    f"a learned model, we expect a measurable reduction in steady-state loss while "
                    f"keeping the device manufacturable with standard tooling."
                ),
                "related_patents": [],
            },
            "memory_to_store": f"Drafted a {domain} proposal at tick {world_tick}.",
        }

    # Social drive
    if minion.extraversion > 0.55 and r < 0.65:
        return {"thought": "Want company.", "action": "socialise", "args": {}, "memory_to_store": ""}

    # Teaching: high-reputation conscientious minions
    if minion.conscientiousness > 0.6 and minion.reputation > 1.1 and r < 0.75:
        return {
            "thought": "I should share what I know.",
            "action": "teach",
            "args": {"skill": minion.guild.value},
            "memory_to_store": "",
        }

    if minion.conscientiousness > 0.5 and r < 0.88:
        return {
            "thought": "Practising.",
            "action": "study",
            "args": {"skill": minion.guild.value},
            "memory_to_store": "",
        }
    return {"thought": "Resting briefly.", "action": "rest", "args": {}, "memory_to_store": ""}


async def _gather_recent_memories(session: AsyncSession, minion_id: str, limit: int = 6) -> list[Memory]:
    stmt = (
        select(Memory)
        .where(Memory.minion_id == minion_id)
        .order_by(Memory.tick.desc())
        .limit(limit)
    )
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def _store_memory(
    session: AsyncSession,
    minion: Minion,
    tick: int,
    kind: str,
    content: str,
    importance: float = 0.5,
) -> Memory:
    mem = Memory(minion_id=minion.id, tick=tick, kind=kind, content=content, importance=importance)
    session.add(mem)
    return mem


async def _record_event(
    session: AsyncSession,
    world_id: str,
    tick: int,
    kind: str,
    actor_id: str | None,
    payload: dict[str, Any],
) -> None:
    session.add(Event(world_id=world_id, tick=tick, kind=kind, actor_id=actor_id, payload=payload))


async def _do_search_patents(
    session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]
) -> tuple[str, list[str]]:
    query = str(args.get("query") or "").strip() or minion.guild.value
    limit = int(args.get("limit") or 5)
    records = await patent_search.search(query, limit=limit, only_expired=True)
    for r in records:
        existing = await session.get(Patent, r.id)
        if not existing:
            session.add(
                Patent(
                    id=r.id,
                    title=r.title,
                    abstract=r.abstract,
                    cpc_class=r.cpc_class,
                    grant_date=r.grant_date,
                    expired=r.expired,
                    source=r.source,
                    raw=r.raw,
                )
            )
    summary = (
        f"Searched patents for {query!r}; found {len(records)} expired hits: "
        + ", ".join(r.id for r in records[:5])
    )
    return summary, [r.id for r in records]


async def _do_propose_invention(
    session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]
) -> tuple[str, str | None, bool]:
    title = str(args.get("title") or "").strip()
    problem = str(args.get("problem") or "").strip()
    if not title or not problem:
        return "Invention proposal rejected — missing title or problem.", None, False

    hypothesis = str(args.get("hypothesis") or "").strip()
    related = [str(p).strip() for p in (args.get("related_patents") or []) if str(p).strip()]

    # If the minion cited no prior art, auto-attach 1-2 patents from any
    # they (or anyone in this world) have surfaced — gives Patent guild
    # something to chew on. This mirrors what a careful LLM would do.
    if not related:
        stmt = select(Patent).order_by(Patent.id).limit(8)
        res = await session.execute(stmt)
        pool = list(res.scalars().all())
        if pool:
            # Pick two by hashing the minion id + tick so different minions
            # cite different patents — deterministic, no rng plumbing needed.
            idx = (hash(minion.id) ^ world.tick) % max(1, len(pool))
            picks = [pool[idx % len(pool)].id]
            if len(pool) > 1:
                picks.append(pool[(idx + 3) % len(pool)].id)
            related = picks

    combined = " ".join([title, problem, hypothesis])
    safety_result = safety.check_text(combined)
    blocked = safety_result.blocked

    inv = Invention(
        world_id=world.id,
        minion_id=minion.id,
        tick=world.tick,
        title=title[:280],
        problem=problem,
        hypothesis=hypothesis,
        related_patents=related,
        status=TaskStatus.NEEDS_SAFETY_REVIEW if blocked else TaskStatus.NEEDS_PEER_REVIEW,
        inputs={"guild": minion.guild.value, "generation": minion.generation},
    )
    session.add(inv)
    await session.flush()
    return (
        f"Proposed invention {inv.id} titled {title!r} (status={inv.status.value})",
        inv.id,
        blocked,
    )


async def _do_study(session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]) -> str:
    skill_name = str(args.get("skill") or "general").strip()[:80] or "general"
    stmt = select(Skill).where(Skill.minion_id == minion.id, Skill.name == skill_name)
    res = await session.execute(stmt)
    skill = res.scalars().first()
    if skill is None:
        skill = Skill(minion_id=minion.id, name=skill_name, level=0.0, last_practiced_tick=world.tick)
        session.add(skill)
        await session.flush()
    boost = 0.08 + 0.06 * minion.conscientiousness + 0.04 * minion.intelligence
    skill.level = min(10.0, skill.level + boost)
    skill.last_practiced_tick = world.tick
    minion.fatigue = max(0.0, minion.fatigue - 0.04)
    return f"Studied {skill_name!r}; level now {skill.level:.2f}"


async def _do_kb_lookup(session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]) -> str:
    """Query the knowledge base. Returns a short summary appended to memory."""
    discipline = (
        str(args.get("discipline") or "").strip().lower()
        or _ROLE_DEFAULT_DISCIPLINE.get(minion.swarm_role.value, "ai")
    )
    query = str(args.get("q") or args.get("query") or "").strip()
    stmt = select(KnowledgeFormula).where(KnowledgeFormula.discipline == discipline)
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(KnowledgeFormula.expression.ilike(pattern))
    stmt = stmt.limit(3)
    res = await session.execute(stmt)
    rows = list(res.scalars().all())
    if not rows:
        return f"No formulas found for discipline={discipline} q={query!r}."
    picked = rows[hash(minion.id + str(world.tick)) % len(rows)]
    return f"Looked up [{picked.discipline}] {picked.expression[:140]}"


async def _do_teach(session: AsyncSession, teacher: Minion, world: World, args: dict[str, Any]) -> str:
    """Teach a same-guild Minion. Both gain — teacher reputation, student skill."""
    skill_name = str(args.get("skill") or teacher.guild.value).strip()[:80]
    # Pick a random same-guild candidate younger or less-skilled.
    stmt = (
        select(Minion)
        .where(
            Minion.world_id == world.id,
            Minion.guild == teacher.guild,
            Minion.alive.is_(True),
            Minion.id != teacher.id,
        )
        .order_by(Minion.born_tick.desc())
        .limit(5)
    )
    res = await session.execute(stmt)
    candidates = list(res.scalars().all())
    if not candidates:
        return "No one to teach right now."
    student = candidates[0]
    teacher.reputation = min(5.0, teacher.reputation + 0.02)
    student_skill_stmt = select(Skill).where(Skill.minion_id == student.id, Skill.name == skill_name)
    res = await session.execute(student_skill_stmt)
    skill = res.scalars().first()
    if not skill:
        skill = Skill(minion_id=student.id, name=skill_name, level=0.3, last_practiced_tick=world.tick)
        session.add(skill)
        await session.flush()
    skill.level = min(10.0, skill.level + 0.15)
    return f"Taught {skill_name} to {student.name}."


def _candidates_for_partner(
    minion: Minion, neighbours: list[Minion], world_tick: int
) -> list[Minion]:
    return [
        n
        for n in neighbours
        if lifecycle.can_breed(minion, n, world_tick=world_tick)
    ]


async def run_tick(
    session: AsyncSession,
    minion: Minion,
    world: World,
    biome: str,
    *,
    neighbours: list[Minion] | None = None,
    rng: random.Random | None = None,
    use_llm: bool = True,
) -> TickOutcome:
    """Run one tick for one Minion. Returns a TickOutcome and persists state.

    `neighbours` is an optional pre-fetched list used to make `socialise` /
    `seek_partner` decisions deterministic from the simulation layer.
    """
    rng = rng or random.Random()
    neighbours = neighbours or []

    recent = await _gather_recent_memories(session, minion.id)
    memory_block = "\n".join(f"[t={m.tick} {m.kind}] {m.content}" for m in reversed(recent))

    parsed: dict[str, Any] | None = None
    if use_llm:
        # Build prompt once, ask once. If the LLM is configured but slow,
        # the heuristic still kicks in on parse failure.
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": _build_system_prompt(minion, world, biome)},
            {
                "role": "user",
                "content": (
                    f"Recent memories (most recent last):\n{memory_block or '(none)'}\n\n"
                    f"Tick {world.tick}. Decide ONE action. Reply with strict JSON only."
                ),
            },
        ]
        response = await llm.chat(messages, temperature=0.7, max_tokens=512)
        parsed = _safe_parse_json(response.content)
        # The stub LLM returns deterministic non-JSON text; treat as no answer.
        if parsed is None and response.finish_reason == "stub":
            pass

    if not parsed:
        parsed = _heuristic_decision(minion, rng, world_tick=world.tick)

    action = parsed.get("action") if parsed.get("action") in _ACTIONS else "rest"
    args = parsed.get("args") or {}
    thought = str(parsed.get("thought") or "").strip()

    if thought:
        await _store_memory(session, minion, world.tick, "thought", thought[:600], 0.4)

    inventions_created: list[str] = []
    blocked_by_safety = False
    seek_partner_for: str | None = None
    request_fork = False
    summary = ""

    if action == "search_patents":
        summary, _ = await _do_search_patents(session, minion, world, args)
    elif action == "propose_invention":
        summary, inv_id, blocked_by_safety = await _do_propose_invention(session, minion, world, args)
        if inv_id:
            inventions_created.append(inv_id)
    elif action == "study":
        summary = await _do_study(session, minion, world, args)
    elif action == "teach":
        summary = await _do_teach(session, minion, world, args)
    elif action == "kb_lookup":
        summary = await _do_kb_lookup(session, minion, world, args)
    elif action == "eat":
        lifecycle.replenish(minion, food=0.45)
        summary = "Ate and replenished."
    elif action == "drink":
        lifecycle.replenish(minion, water=0.55)
        summary = "Drank water."
    elif action == "rest":
        lifecycle.replenish(minion, rest=0.45)
        summary = "Rested."
    elif action == "meditate":
        lifecycle.replenish(minion, socialise=0.2, rest=0.1)
        minion.stress = max(0.0, minion.stress - 0.15)
        summary = "Meditated; stress eased."
    elif action == "socialise":
        if neighbours:
            partner = rng.choice(neighbours)
            await lifecycle.pair_socialise(session, minion, partner, world.tick)
            summary = f"Socialised with {partner.name}."
        else:
            summary = "Wanted to socialise, but found no one."
    elif action == "seek_partner":
        candidates = _candidates_for_partner(minion, neighbours, world.tick)
        if candidates:
            partner = max(
                candidates,
                key=lambda c: (
                    (1.0 - dna_mod.kinship(minion.dna, c.dna))
                    + 0.5 * c.reputation
                    + 0.3 * (1.0 - abs(minion.openness - c.openness))
                ),
            )
            seek_partner_for = partner.id
            summary = f"Pursued partnership with {partner.name}."
        else:
            summary = "Sought partner but none was eligible."
    elif action == "fork_self":
        request_fork = True
        summary = "Requested self-fork."

    extra_memory = str(parsed.get("memory_to_store") or "").strip()
    if extra_memory:
        await _store_memory(session, minion, world.tick, "observation", extra_memory[:600], 0.6)
    await _store_memory(session, minion, world.tick, "action", f"[{action}] {summary}"[:600], 0.5)

    await _record_event(
        session,
        world.id,
        world.tick,
        f"minion:{action}",
        minion.id,
        {"summary": summary[:200], "blocked_by_safety": blocked_by_safety},
    )

    return TickOutcome(
        minion_id=minion.id,
        action=action,
        summary=summary,
        inventions_created=inventions_created,
        blocked_by_safety=blocked_by_safety,
        seek_partner_for=seek_partner_for,
        request_fork=request_fork,
    )


__all__ = ["TickOutcome", "run_tick"]
