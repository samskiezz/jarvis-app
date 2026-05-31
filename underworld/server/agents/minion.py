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
    Relationship,
    RelationshipKind,
    Skill,
    TaskStatus,
    World,
)
from ..genetics import dna as dna_mod
from ..physics import engine as physics_engine
from ..services import lifecycle, mastery as mastery_mod, planning, progression, reasoning
from ..tools import llm, patent_search, safety
from .guild_lore import get_lore


_SYSTEM_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "minion_system.md").read_text(
    encoding="utf-8"
)


_ACTIONS = {
    "search_patents",
    "propose_invention",
    "propose_with_party",   # doc III.53-54: collaborative scanning party
    "build_scanner",        # doc III.3-9: build the Patent Scanner device
    "seek_ascension",       # doc II.37-40: enlightenment / ascension
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
    "calculate",            # run a real physics calculation + learn from it
}

# Doc II.131 — actions that advance the App's mission and so confer purpose.
_MISSION_ACTIONS = {
    "search_patents", "propose_invention", "propose_with_party", "build_scanner",
    "study", "teach", "kb_lookup", "calculate",
}

# Doc I.23 — actions a Minion may switch to when a learned belief is strong.
# Restricted to always-safe, self-contained actions so an override never fails.
_LEARNABLE_ACTIONS = {"study", "calculate", "kb_lookup", "meditate", "socialise"}

# Guilds whose minions naturally reach for real calculations.
_CALC_GUILDS = {
    "physics", "mechanical", "electrical", "civil",
    "materials", "energy", "computing", "maths",
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
    lore = get_lore(minion.guild)
    if lore is not None:
        rituals = "; ".join(lore.rituals)
        lore_fields = {
            "guild_motto": lore.motto,
            "guild_mission": lore.mission,
            "guild_hero": lore.hero_name,
            "guild_hero_tale": lore.hero_tale,
            "guild_rituals": rituals,
            "guild_obsession": lore.obsession,
            "guild_open_question": lore.open_question,
            "guild_nemesis": lore.nemesis,
        }
    else:
        lore_fields = {
            "guild_motto": "(no motto)",
            "guild_mission": "(no recorded mission)",
            "guild_hero": "(no recorded hero)",
            "guild_hero_tale": "",
            "guild_rituals": "(none)",
            "guild_obsession": "(unknown)",
            "guild_open_question": "(unknown)",
            "guild_nemesis": "(none)",
        }
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
        **lore_fields,
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

    # Analytical drive — physics-minded guilds turn knowledge into REAL
    # calculations, which is how they actually learn (grounded by the engine).
    if minion.guild.value in _CALC_GUILDS and minion.intelligence > 0.45 and r < 0.30:
        return {
            "thought": "Time to run the real numbers.",
            "action": "calculate",
            "args": {"discipline": physics_engine.discipline_for_guild(minion.guild.value)},
            "memory_to_store": "",
        }

    # Reproduction drive — kicks in once adult and not from a reviewer guild.
    # Patent + Safety guilds are functional roles; they breed less.
    reviewer_guild = minion.guild.value in {"patent", "safety"}
    # Lowered from 50 → 20 so fresh worlds (auto_advance starts immediately)
    # actually produce a 2nd generation in the first ~30 ticks instead of
    # idling for 50. Matches `lifecycle.can_breed` floor (15).
    breeding_age = age > 20
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
    # Curiosity (doc I.128): the highly open would rather investigate than idle.
    if minion.openness > 0.65:
        return {
            "thought": "Curiosity over idleness — investigating the unknown.",
            "action": "kb_lookup",
            "args": {"discipline": _ROLE_DEFAULT_DISCIPLINE.get(minion.swarm_role.value, "ai")},
            "memory_to_store": "",
        }
    return {"thought": "Resting briefly.", "action": "rest", "args": {}, "memory_to_store": ""}


def _memory_emotion_delta(salient: list[Memory]) -> float:
    """Doc I.94 — recalled memories colour mood. Returns a sanity delta:
    salient distress (deaths/grim observations) erodes sanity; salient wins
    (correct calculations, inspired thoughts, ancestral pride) lift it."""
    distress = sum(m.importance for m in salient
                   if m.kind in {"death", "observation"} and m.importance > 0.55)
    uplift = sum(m.importance for m in salient
                 if m.kind in {"calculation", "ancestral", "action"} and m.importance > 0.6)
    return round(0.04 * uplift - 0.05 * distress, 4)


async def _recall_salient(
    session: AsyncSession, minion_id: str, world_tick: int, *, limit: int = 6, pool: int = 24,
) -> list[Memory]:
    """Doc I.93/95 — a personal memory store with salience.

    Score each recent memory by importance × recency, return the most salient,
    REINFORCE those (recall strengthens them) and DECAY the rest (forgetting).
    """
    rows = list((await session.execute(
        select(Memory).where(Memory.minion_id == minion_id)
        .order_by(Memory.tick.desc()).limit(pool)
    )).scalars().all())
    if not rows:
        return []

    def score(m: Memory) -> float:
        return m.importance * (0.96 ** max(0, world_tick - m.tick))

    ranked = sorted(rows, key=score, reverse=True)
    top = ranked[:limit]
    top_ids = {m.id for m in top}
    for m in rows:
        if m.id in top_ids:
            m.importance = min(1.0, m.importance + 0.03)   # reinforcement
        else:
            m.importance = max(0.0, m.importance * 0.94)    # decay / forgetting
    # Return in chronological order for a coherent prompt.
    return sorted(top, key=lambda m: m.tick)


async def _maybe_mastery_event(
    session: AsyncSession, minion: Minion, world: World, skill: Skill, old_level: float,
) -> None:
    """Log a one-time mastery milestone when a skill crosses the threshold."""
    if mastery_mod.crossed_mastery(old_level, skill.level):
        minion.reputation = min(5.0, minion.reputation + 0.05)
        await _record_event(session, world.id, world.tick, "minion:mastery", minion.id,
                            {"skill": skill.name, "level": round(skill.level, 2)})
        await _store_memory(session, minion, world.tick, "observation",
                            f"Achieved mastery of {skill.name}.", importance=0.85)


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
    # Doc III.3-9: must have built the Patent Scanner before scanning.
    if not progression.scanner_ready(world):
        return (
            f"Scanner not ready (progress {world.scanner_progress}/100). "
            f"Build it first with the build_scanner action."
        ), []
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

    # The world obeys physics: assess the proposal against hard physical limits
    # (no FTL, over-unity, or >100% efficiency). The reviewer reads this back.
    assessment = physics_engine.assess_invention(combined)

    # Doc I.72 — an unscrupulous (low-conscientiousness, low-karma) Minion may
    # fabricate results: inflate the claimed feasibility to slip past review.
    # Replication later exposes it.
    fabricated = minion.conscientiousness < 0.35 and minion.karma < 0.0 and \
        (hash(inv_seed := f"{minion.id}:{world.tick}") % 100) < 25
    claimed_feasibility = min(0.95, assessment.feasibility + 0.4) if fabricated else assessment.feasibility
    inv = Invention(
        world_id=world.id,
        minion_id=minion.id,
        tick=world.tick,
        title=title[:280],
        problem=problem,
        hypothesis=hypothesis,
        related_patents=related,
        feasibility_score=claimed_feasibility,
        status=TaskStatus.NEEDS_SAFETY_REVIEW if blocked else TaskStatus.NEEDS_PEER_REVIEW,
        inputs={
            "guild": minion.guild.value,
            "generation": minion.generation,
            "fabricated": fabricated,
            "physics": {
                "feasibility": assessment.feasibility,
                "violates_limit": assessment.violates_limit,
                "notes": assessment.notes,
            },
        },
    )
    session.add(inv)
    await session.flush()
    extra = " — violates a physical limit" if assessment.violates_limit else ""
    return (
        f"Proposed invention {inv.id} titled {title!r} (status={inv.status.value}){extra}",
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
    # Doc II.118-119 / I.147 — maturity, upbringing and time-of-day scale learning.
    boost *= lifecycle.growth_multiplier(minion, world.tick)
    old_level = skill.level
    skill.level = min(10.0, skill.level + boost)
    skill.last_practiced_tick = world.tick
    minion.fatigue = max(0.0, minion.fatigue - 0.04)
    await _maybe_mastery_event(session, minion, world, skill, old_level)
    return f"Studied {skill_name!r}; level now {skill.level:.2f}"


async def _do_kb_lookup(session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]) -> str:
    """Query the knowledge base. Returns a short summary appended to memory.

    Prefers Physics V4 entries when available — they carry an explanation
    in addition to the equation, which makes for a richer memory.
    """
    discipline = (
        str(args.get("discipline") or "").strip().lower()
        or _ROLE_DEFAULT_DISCIPLINE.get(minion.swarm_role.value, "ai")
    )
    query = str(args.get("q") or args.get("query") or "").strip()

    async def _fetch(source: str | None) -> list[KnowledgeFormula]:
        stmt = select(KnowledgeFormula).where(KnowledgeFormula.discipline == discipline)
        if source is not None:
            stmt = stmt.where(KnowledgeFormula.source == source)
        if query:
            pattern = f"%{query}%"
            from sqlalchemy import or_ as _or
            stmt = stmt.where(_or(
                KnowledgeFormula.expression.ilike(pattern),
                KnowledgeFormula.name.ilike(pattern),
                KnowledgeFormula.description.ilike(pattern),
            ))
        return list((await session.execute(stmt.limit(6))).scalars().all())

    rows = await _fetch("physics_laws_v4")
    if not rows:
        rows = await _fetch(None)
    if not rows:
        return f"No formulas found for discipline={discipline} q={query!r}."

    picked = rows[hash(minion.id + str(world.tick)) % len(rows)]
    if picked.name and picked.description:
        return (
            f"Looked up [{picked.discipline}] {picked.name} — "
            f"{picked.description[:140]}"
        )
    return f"Looked up [{picked.discipline}] {picked.expression[:140]}"


async def _do_calculate(
    session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]
) -> str:
    """Run ONE real physics calculation and learn from the outcome.

    The minion picks a law (explicit `law_id`, else its guild's discipline),
    the engine generates a real problem and the true value, then grades the
    minion's prediction. Skill in that discipline, reputation, and karma move
    based on whether the answer was physically correct. The worked calculation
    is written to memory so the LLM/dashboards can see genuine reasoning.
    """
    law = None
    law_id = str(args.get("law_id") or "").strip()
    if law_id:
        law = physics_engine.get_law(law_id)
    if law is None:
        discipline = (
            str(args.get("discipline") or "").strip().lower()
            or physics_engine.discipline_for_guild(minion.guild.value)
        )
        pool = physics_engine.laws_for_discipline(discipline)
        # Deterministic pick from minion id + tick keeps ticks reproducible.
        law = pool[hash(minion.id + str(world.tick)) % len(pool)]

    skill_name = f"physics:{law.discipline}"
    stmt = select(Skill).where(Skill.minion_id == minion.id, Skill.name == skill_name)
    skill = (await session.execute(stmt)).scalars().first()
    if skill is None:
        skill = Skill(minion_id=minion.id, name=skill_name, level=0.0, last_practiced_tick=world.tick)
        session.add(skill)
        await session.flush()

    rng = random.Random(hash(minion.id) ^ (world.tick * 0x2545F491))
    result = physics_engine.grade_attempt(
        law,
        skill_level=skill.level,
        intelligence=minion.intelligence,
        creativity=minion.creativity,
        rng=rng,
    )

    old_level = skill.level
    skill.level = min(10.0, skill.level + result.skill_delta * lifecycle.growth_multiplier(minion, world.tick))
    skill.last_practiced_tick = world.tick
    minion.reputation = max(0.0, min(5.0, minion.reputation + result.reputation_delta))
    minion.karma += result.karma_delta
    minion.fatigue = max(0.0, minion.fatigue - 0.05)
    await _maybe_mastery_event(session, minion, world, skill, old_level)

    await _store_memory(
        session, minion, world.tick, "calculation", result.steps[:600],
        importance=0.7 if result.correct else 0.55,
    )
    await _record_event(
        session, world.id, world.tick, "minion:calculate", minion.id,
        {
            "law": law.id,
            "discipline": law.discipline,
            "correct": result.correct,
            "rel_error": round(result.rel_error, 4),
            "skill_now": round(skill.level, 3),
        },
    )
    verdict = "correct" if result.correct else f"off by {abs(result.rel_error)*100:.0f}%"
    return f"Calculated {law.name} ({verdict}); {skill_name} now {skill.level:.2f}."


_BOND_KINDS = {
    RelationshipKind.FRIEND, RelationshipKind.MENTOR,
    RelationshipKind.ROMANCE, RelationshipKind.SOUL_BOND,
}
_TEACH_COOLDOWN = 3  # ticks — knowledge transfer takes time (doc I.63)


async def _do_teach(
    session: AsyncSession, teacher: Minion, world: World, args: dict[str, Any],
    neighbours: list[Minion] | None = None,
) -> str:
    """Teach a nearby same-guild Minion.

    Doc I.63 — transfer requires PROXIMITY (must be a neighbour in earshot),
    a shared LANGUAGE (same guild), and TIME (a per-pair cooldown + effort cost).
    Doc II.115 — LOVE/cooperation: a bonded student (friend/mentor/romance/
    soul-bond) learns markedly faster, and teaching strengthens the bond.
    """
    skill_name = str(args.get("skill") or teacher.guild.value).strip()[:80]
    pool = [n for n in (neighbours or [])
            if n.alive and n.id != teacher.id and n.guild == teacher.guild]
    if not pool:
        return "No one nearby to teach (need a same-guild neighbour)."

    rels = {
        r.to_id: r for r in (await session.execute(
            select(Relationship).where(
                Relationship.from_id == teacher.id,
                Relationship.to_id.in_([n.id for n in pool]),
            )
        )).scalars().all()
    }

    def bond_strength(n: Minion) -> float:
        r = rels.get(n.id)
        return r.strength if (r and r.kind in _BOND_KINDS) else 0.0

    student = max(pool, key=bond_strength)
    bond = bond_strength(student)

    # TIME: don't re-teach the same student within the cooldown window.
    mentor_rel = rels.get(student.id)
    if mentor_rel and mentor_rel.kind == RelationshipKind.MENTOR \
            and world.tick - mentor_rel.last_interaction_tick < _TEACH_COOLDOWN:
        return f"Taught {student.name} recently; letting the lesson settle."

    # Doc I.10 — noisy weather (rain/storm) makes the lesson harder to hear.
    from ..services import acoustics
    clarity = acoustics.speech_clarity(world.weather)
    transfer = 0.12 * (1.0 + bond) * clarity  # bonded students learn up to ~2x faster
    skill = (await session.execute(
        select(Skill).where(Skill.minion_id == student.id, Skill.name == skill_name)
    )).scalars().first()
    if not skill:
        skill = Skill(minion_id=student.id, name=skill_name, level=0.3, last_practiced_tick=world.tick)
        session.add(skill)
        await session.flush()
    old_level = skill.level
    skill.level = min(10.0, skill.level + transfer)
    skill.last_practiced_tick = world.tick

    teacher.reputation = min(5.0, teacher.reputation + 0.02)
    teacher.fatigue = max(0.0, teacher.fatigue - 0.03)  # effort/time cost
    await lifecycle._ensure_relationship(
        session, teacher, student, RelationshipKind.MENTOR, world.tick, 0.6)
    await _maybe_mastery_event(session, student, world, skill, old_level)
    extra = " (bonded — learned fast)" if bond > 0 else ""
    return f"Taught {skill_name} to {student.name}{extra}; +{transfer:.2f}."


# ── Doc III.3-9: Patent Scanner build action ──────────────────────────────

async def _do_build_scanner(
    session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]
) -> str:
    """Contribute intelligence × 4 to the Patent Scanner build meter (0..100).

    Minions can keep calling this until the scanner is complete. Once it
    is, `search_patents` becomes usable for everyone in the world.
    """
    if progression.scanner_ready(world):
        return f"Scanner already complete (100/100)."
    delta, done = progression.scanner_advance(world, builder_intelligence=minion.intelligence)
    if done:
        session.add(Event(
            world_id=world.id, tick=world.tick, kind="scanner:completed",
            actor_id=minion.id,
            payload={"by": f"{minion.name} {minion.surname}", "guild": minion.guild.value},
        ))
        return f"Patent Scanner complete (100/100)! Built by {minion.name}."
    return f"Worked on Patent Scanner (+{delta} → {world.scanner_progress}/100)."


# ── Doc III.53-54: collaborative scanning party (multi-minion invention) ──

async def _do_propose_with_party(
    session: AsyncSession, leader: Minion, world: World, args: dict[str, Any]
) -> tuple[str, str | None, bool]:
    """Co-create an invention with up to two same-guild collaborators.

    Returns (summary, invention_id, blocked_by_safety). The resulting
    Invention has a 'party' field listing all contributors and starts
    with a small feasibility/novelty bonus to model collaboration synergy.
    """
    title = str(args.get("title") or "").strip()
    problem = str(args.get("problem") or "").strip()
    if not title or not problem:
        return "Party invention rejected — missing title or problem.", None, False
    hypothesis = str(args.get("hypothesis") or "").strip()
    related = [str(p).strip() for p in (args.get("related_patents") or []) if str(p).strip()]

    # Find up to 2 nearby same-guild collaborators.
    party_stmt = (
        select(Minion)
        .where(
            Minion.world_id == world.id,
            Minion.guild == leader.guild,
            Minion.alive.is_(True),
            Minion.id != leader.id,
        )
        .order_by(Minion.reputation.desc())
        .limit(2)
    )
    party = list((await session.execute(party_stmt)).scalars().all())
    contributor_ids = [leader.id] + [m.id for m in party]
    contributor_names = [f"{leader.name} {leader.surname}"] + [f"{m.name} {m.surname}" for m in party]

    combined = " ".join([title, problem, hypothesis])
    safety_result = safety.check_text(combined)
    blocked = safety_result.blocked

    inv = Invention(
        world_id=world.id,
        minion_id=leader.id,
        tick=world.tick,
        title=title[:280],
        problem=problem,
        hypothesis=hypothesis,
        related_patents=related,
        status=TaskStatus.NEEDS_SAFETY_REVIEW if blocked else TaskStatus.NEEDS_PEER_REVIEW,
        inputs={
            "guild": leader.guild.value,
            "generation": leader.generation,
            "party_ids": contributor_ids,
            "party_names": contributor_names,
            "collaborative": True,
            # Synergy bonus applied at review time — picked up by reviewer.
            "synergy_bonus": 0.15 * len(party),
        },
    )
    session.add(inv)
    await session.flush()

    # Reputation bump for the whole party.
    for m in [leader] + party:
        m.reputation = min(5.0, m.reputation + 0.02)

    return (
        f"Party-invented {inv.id} '{title}' with {len(party)} collaborator(s): "
        f"{', '.join(contributor_names)}",
        inv.id,
        blocked,
    )


# ── Doc II.37-40: Ascension ────────────────────────────────────────────────

async def _do_seek_ascension(
    session: AsyncSession, minion: Minion, world: World, args: dict[str, Any]
) -> str:
    """Try to ascend. On success the Minion 'dies' (alive=False) but the
    soul gets ascended=True and persists as a guide entity."""
    ok, reason = await progression.try_ascend(session, minion, world)
    if ok:
        return f"{minion.name} ascended — soul {minion.soul_id} now operates as a guide entity."
    return f"Ascension not yet possible: {reason}"


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

    recent = await _recall_salient(session, minion.id, world.tick)
    # Doc I.94 — what a Minion recalls shifts its emotional state.
    sanity_delta = _memory_emotion_delta(recent)
    if sanity_delta:
        minion.sanity = max(0.0, min(1.0, minion.sanity + sanity_delta))
    memory_block = "\n".join(f"[t={m.tick} {m.kind}] {m.content}" for m in recent)

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

    # Doc I.23 — snapshot wellbeing before the action so we can learn its effect.
    wb_before = reasoning.wellbeing(minion)

    if thought:
        await _store_memory(session, minion, world.tick, "thought", thought[:600], 0.4)

    inventions_created: list[str] = []
    blocked_by_safety = False
    seek_partner_for: str | None = None
    request_fork = False
    summary = ""

    # Era-gated actions: if the world hasn't unlocked this action yet,
    # silently fall through to "rest" so a stale agent decision doesn't
    # crash the tick.
    if action not in progression.unlocked_actions(world.era):
        await _store_memory(
            session, minion, world.tick, "observation",
            f"Action '{action}' is locked at era {world.era}; resting instead.", 0.3,
        )
        action = "rest"

    # Doc I.23/I.126 — if about to idle, don't: a thoughtful (high-intelligence)
    # Minion deliberates with a tree-of-thought + Monte-Carlo rollout over its
    # options; others fall back to acting on their strongest learned belief.
    if action == "rest":
        candidates = sorted(_LEARNABLE_ACTIONS & set(progression.unlocked_actions(world.era)))
        if minion.intelligence > 0.6 and candidates:
            beliefs = {b.cause: b.confidence for b in await reasoning.beliefs(session, minion.id)}
            planned = planning.plan_action(minion, candidates, beliefs, rng=rng)
            if planned and planned != "rest":
                action = planned
                await _store_memory(
                    session, minion, world.tick, "thought",
                    f"Weighing my options, {planned} looks like the best use of my time.", 0.45,
                )
        else:
            learned = await reasoning.best_action(session, minion.id, _LEARNABLE_ACTIONS)
            if learned and learned in progression.unlocked_actions(world.era):
                action = learned
                await _store_memory(
                    session, minion, world.tick, "thought",
                    f"I've learned that {learned} reliably helps me — doing it on purpose.", 0.45,
                )

    if action == "search_patents":
        summary, _ = await _do_search_patents(session, minion, world, args)
    elif action == "build_scanner":
        summary = await _do_build_scanner(session, minion, world, args)
    elif action == "propose_invention":
        summary, inv_id, blocked_by_safety = await _do_propose_invention(session, minion, world, args)
        if inv_id:
            inventions_created.append(inv_id)
    elif action == "propose_with_party":
        summary, inv_id, blocked_by_safety = await _do_propose_with_party(session, minion, world, args)
        if inv_id:
            inventions_created.append(inv_id)
    elif action == "seek_ascension":
        summary = await _do_seek_ascension(session, minion, world, args)
    elif action == "study":
        summary = await _do_study(session, minion, world, args)
    elif action == "teach":
        summary = await _do_teach(session, minion, world, args, neighbours=neighbours)
    elif action == "kb_lookup":
        summary = await _do_kb_lookup(session, minion, world, args)
    elif action == "calculate":
        summary = await _do_calculate(session, minion, world, args)
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

    # Doc II.130-132 — appraise the action: did it serve the mission? Update
    # purpose + morale (mood_signal carries the emotional colour of recalled
    # memories computed earlier this tick).
    lifecycle.appraise(
        minion,
        mission=action in _MISSION_ACTIONS,
        idle=action in {"rest", "meditate"},
        mood_signal=sanity_delta,
    )

    # Doc I.23 — observe the action's effect on wellbeing and update the belief.
    wb_after = reasoning.wellbeing(minion)
    await reasoning.record(
        session, minion.id, action, confirmed=wb_after > wb_before, tick=world.tick,
    )
    # Doc I.127 — periodic meta-cognition: reflect on mistakes and adjust.
    if world.tick % 8 == 0:
        await reasoning.reflect(session, minion, world.tick)

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
