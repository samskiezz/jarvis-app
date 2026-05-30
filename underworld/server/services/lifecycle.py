"""Birth, death, breeding, forking, needs, mood derivation, reincarnation.

Implements the doc's Section II (sentience + society) population mechanics:
- II.5-6 reincarnation
- II.16-21 reproduction, family trees, parenting
- II.74-75 forking (digital cloning)
- II.106 pruning for prime-directive violation
- I.31 metabolism (hunger/thirst/fatigue/temp)
- II.7-11 emotions / mood / stress

Pure-functional where it can be; side-effects isolated to the service
entrypoints that take an AsyncSession.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..agents import guilds
from ..db.models import (
    CauseOfDeath,
    Event,
    GuildKind,
    Memory,
    Minion,
    MoodKind,
    Relationship,
    RelationshipKind,
    Skill,
    Soul,
    World,
)
from ..genetics import dna as dna_mod
from . import roles as roles_mod


# --- naming -----------------------------------------------------------------

_GIVEN_NAMES = (
    "Ada", "Alan", "Avery", "Bram", "Cyra", "Doran", "Echo", "Faro", "Gale",
    "Hex", "Iro", "Juno", "Kael", "Lyra", "Mira", "Nox", "Odis", "Petra",
    "Quinn", "Rhea", "Sable", "Talon", "Uma", "Vex", "Wren", "Xan", "Yara",
    "Zev", "Aria", "Brio", "Caius", "Dax", "Eira", "Fenn", "Glyph",
    "Halia", "Indra", "Jorah", "Kira", "Lior", "Maeve", "Nael", "Orin",
    "Pax", "Quill", "Roan", "Sera", "Thane", "Una", "Vael", "Wynn",
    "Xara", "Yael", "Zara", "Arden", "Briar", "Cleo", "Daven", "Esme",
    "Finn", "Gemma", "Hale", "Isolde", "Jett", "Kane", "Lark", "Mira",
    "Nyx", "Onyx", "Piper", "Quenya", "Rune", "Sage", "Tessa", "Ulric",
    "Vera", "Wade", "Xenia", "Yuri", "Zorn",
)

_SURNAMES = (
    "Ashen", "Blackwood", "Coldridge", "Dawnbrook", "Ember", "Fairwind",
    "Greythorn", "Highmoor", "Ironwood", "Junewell", "Kindler", "Lockheart",
    "Moonfall", "Nightingale", "Orchard", "Pinegrove", "Quartz", "Ravenscar",
    "Stormrider", "Thornblade", "Underhill", "Vesper", "Whitestone",
    "Xerath", "Yewbark", "Zephyr",
)


def random_name(rng: random.Random) -> tuple[str, str]:
    return rng.choice(_GIVEN_NAMES), rng.choice(_SURNAMES)


# --- DNA → guild assignment -------------------------------------------------

_GUILD_APTITUDE_LOCI = {
    GuildKind.MATHS: "aptitude_maths",
    GuildKind.PHYSICS: "aptitude_physics",
    GuildKind.ELECTRICAL: "aptitude_electrical",
    GuildKind.MECHANICAL: "aptitude_mechanical",
    GuildKind.COMPUTING: "aptitude_computing",
    GuildKind.CIVIL: "aptitude_civil",
    GuildKind.MATERIALS: "aptitude_materials",
    GuildKind.ENERGY: "aptitude_energy",
    GuildKind.AGRICULTURE: "aptitude_agriculture",
}


def guild_from_dna(dna: str, *, allowed: tuple[GuildKind, ...] | None = None) -> GuildKind:
    """Pick the guild whose aptitude locus is strongest in this DNA.

    `allowed` lets the caller restrict to guilds that exist in this world's
    seeding plan (Patent and Safety guilds are recruited explicitly, not by
    aptitude).
    """
    pool = allowed or tuple(_GUILD_APTITUDE_LOCI.keys())
    scores = {g: dna_mod.trait(dna, _GUILD_APTITUDE_LOCI[g]) for g in pool}
    return max(scores, key=scores.get)


# --- mood derivation --------------------------------------------------------


def derive_mood(m: Minion) -> tuple[MoodKind, float]:
    """Return (mood, stress) based on needs + personality.

    Implements doc II.7-11 ('appraisal of events against personal goals')
    plus II.10 (stress → burnout/creativity).
    """
    needs_floor = min(m.hunger, m.thirst, m.fatigue, m.sanity, m.health)
    needs_avg = (m.hunger + m.thirst + m.fatigue + m.sanity + m.health) / 5.0
    # neuroticism amplifies stress, conscientiousness dampens it.
    stress = max(
        0.0,
        min(
            1.0,
            (1.0 - needs_avg) * (0.6 + 0.6 * m.neuroticism)
            - 0.2 * m.conscientiousness,
        ),
    )

    if m.health < 0.2 or m.sanity < 0.15:
        return MoodKind.DESPAIRING, stress
    if needs_floor < 0.2:
        return MoodKind.EXHAUSTED, stress
    if stress > 0.7:
        return MoodKind.ANXIOUS, stress
    if needs_avg > 0.75 and m.creativity > 0.65 and m.openness > 0.5:
        return MoodKind.FLOW, stress
    if needs_avg > 0.6 and (m.creativity + m.openness) / 2.0 > 0.55:
        return MoodKind.INSPIRED, stress
    if needs_avg < 0.45:
        return MoodKind.BORED, stress
    return MoodKind.CONTENT, stress


# --- needs decay ------------------------------------------------------------


def decay_needs(m: Minion, *, intensity: float = 1.0) -> None:
    """One tick of need decay. `intensity` allows action-specific multipliers."""
    # Hunger and thirst always tick down — Minions need food/water.
    m.hunger = max(0.0, m.hunger - 0.04 * intensity)
    m.thirst = max(0.0, m.thirst - 0.06 * intensity)
    m.fatigue = max(0.0, m.fatigue - 0.03 * intensity)
    # Sanity decays with stress.
    if m.stress > 0.5:
        m.sanity = max(0.0, m.sanity - 0.02 * (m.stress - 0.4))
    # Health decays when any need is critically low.
    if min(m.hunger, m.thirst, m.fatigue) < 0.15:
        m.health = max(0.0, m.health - 0.04)


def tick_health(m: Minion, rng: random.Random) -> None:
    """Doc I.32 — wounds + infection + healing, once per tick.

    Low dexterity raises the chance of a fresh wound. An open wound risks
    infection that erodes health (mitigated by the heritable `immune` locus);
    immunity + rest heal the wound over time. A child of immune stock both
    catches fewer infections and recovers faster — tying health to selection.
    """
    immune = dna_mod.trait(m.dna, "immune")
    dex = dna_mod.trait(m.dna, "dexterity")
    if m.injury <= 0.0 and rng.random() < 0.012 * (1.4 - dex):
        m.injury = 0.3 + 0.4 * rng.random()
    if m.injury > 0.0:
        infection = m.injury * (1.0 - immune) * 0.06
        m.health = max(0.0, m.health - infection)
        heal = 0.04 + 0.06 * immune + (0.03 if m.fatigue > 0.6 else 0.0)
        m.injury = max(0.0, m.injury - heal)


def replenish(
    m: Minion,
    *,
    food: float = 0.0,
    water: float = 0.0,
    rest: float = 0.0,
    socialise: float = 0.0,
) -> None:
    """Add to needs. Caps at 1.0."""
    m.hunger = min(1.0, m.hunger + food)
    m.thirst = min(1.0, m.thirst + water)
    m.fatigue = min(1.0, m.fatigue + rest)
    m.sanity = min(1.0, m.sanity + socialise)


# --- death + reincarnation --------------------------------------------------


@dataclass(frozen=True)
class DeathOutcome:
    minion_id: str
    cause: CauseOfDeath
    soul_id: str | None


def _expected_lifespan(m: Minion) -> int:
    """Ticks before old-age death. Longevity gene + intelligence carry weight.

    Default centre ~600 ticks. Calibrated so a typical 100-tick session sees
    a handful of natural deaths in a 200-Minion world.
    """
    longevity = dna_mod.trait(m.dna, "longevity")
    return int(450 + 350 * longevity + 50 * m.intelligence)


def determine_death(m: Minion, *, world_tick: int, rng: random.Random) -> CauseOfDeath | None:
    """Return a CauseOfDeath if the Minion should die this tick, else None."""
    age = world_tick - m.born_tick

    if m.health <= 0.0:
        return CauseOfDeath.DISEASE if m.sanity > 0.1 else CauseOfDeath.DESPAIR
    if m.hunger <= 0.0:
        return CauseOfDeath.STARVATION
    if m.sanity <= 0.0:
        return CauseOfDeath.DESPAIR

    # Old age — probabilistic past the expected lifespan.
    expected = _expected_lifespan(m)
    if age > expected:
        excess = age - expected
        if rng.random() < min(0.4, 0.01 + excess * 0.005):
            return CauseOfDeath.OLD_AGE

    # Doc I.21 — endemic disease is a real selective pressure. Susceptibility
    # falls with the heritable `immune` locus and current health, so over
    # generations natural selection raises population immunity.
    immune = dna_mod.trait(m.dna, "immune")
    disease_p = 0.003 * (1.0 - immune) * (1.4 - m.health)
    if rng.random() < max(0.0, disease_p):
        return CauseOfDeath.DISEASE

    # Accidents — rare, scale with low dexterity (also heritable).
    dex = dna_mod.trait(m.dna, "dexterity")
    accident_p = 0.0008 + 0.002 * (1.0 - dex)
    if rng.random() < accident_p:
        return CauseOfDeath.ACCIDENT

    return None


async def kill(
    session: AsyncSession,
    m: Minion,
    *,
    cause: CauseOfDeath,
    world_tick: int,
) -> DeathOutcome:
    m.alive = False
    m.died_tick = world_tick
    m.cause_of_death = cause

    # Soul accrues karma snapshot + a short ancestral summary for next life.
    soul_id = m.soul_id
    if soul_id is not None:
        soul = await session.get(Soul, soul_id)
        if soul is not None:
            soul.karma = (soul.karma + m.karma) / 2.0
            summary = (
                f"Life #{soul.incarnation} as {m.name} {m.surname} "
                f"({m.guild.value}, gen {m.generation}): rep={m.reputation:.2f}, "
                f"karma={m.karma:.2f}, died of {cause.value} at age "
                f"{world_tick - m.born_tick}."
            )
            soul.ancestral_summary = (summary + "\n" + (soul.ancestral_summary or ""))[:2400]
            soul.incarnation += 1

    session.add(
        Event(
            world_id=m.world_id,
            tick=world_tick,
            kind="minion:death",
            actor_id=m.id,
            payload={
                "cause": cause.value,
                "name": f"{m.name} {m.surname}".strip(),
                "guild": m.guild.value,
                "age": world_tick - m.born_tick,
                "generation": m.generation,
            },
        )
    )
    return DeathOutcome(minion_id=m.id, cause=cause, soul_id=soul_id)


# --- birth, breeding, forking ----------------------------------------------


async def _new_soul(session: AsyncSession, world_id: str) -> Soul:
    soul = Soul(world_id=world_id)
    session.add(soul)
    await session.flush()
    return soul


async def _resurrect_soul(session: AsyncSession, world_id: str) -> Soul | None:
    """Try to recycle a free soul (no living embodiment).

    Doc II.5: 'Upon death, the soul token is recycled into a new Minion
    with faint ancestral memories.'
    """
    stmt = (
        select(Soul)
        .outerjoin(Minion, (Minion.soul_id == Soul.id) & (Minion.alive.is_(True)))
        .where(Soul.world_id == world_id, Minion.id.is_(None), Soul.ascended.is_(False))
        .limit(1)
    )
    res = await session.execute(stmt)
    return res.scalars().first()


async def _make_minion(
    session: AsyncSession,
    *,
    world: World,
    name: str,
    surname: str,
    guild: GuildKind,
    dna: str,
    generation: int,
    parent_a_id: str | None = None,
    parent_b_id: str | None = None,
    forked_from_id: str | None = None,
    soul: Soul | None = None,
    inherit_skills: dict[str, float] | None = None,
) -> Minion:
    soul = soul or await _resurrect_soul(session, world.id) or await _new_soul(session, world.id)
    traits = dna_mod.trait_vector(dna)
    m = Minion(
        world_id=world.id,
        soul_id=soul.id,
        name=name,
        surname=surname,
        guild=guild,
        dna=dna,
        generation=generation,
        parent_a_id=parent_a_id,
        parent_b_id=parent_b_id,
        forked_from_id=forked_from_id,
        openness=traits["openness"],
        conscientiousness=traits["conscientiousness"],
        extraversion=traits["extraversion"],
        agreeableness=traits["agreeableness"],
        neuroticism=traits["neuroticism"],
        intelligence=traits["intelligence"],
        creativity=traits["creativity"],
        born_tick=world.tick,
        karma=soul.karma * 0.5,  # carry forward
        reputation=1.0,
        swarm_role=roles_mod.assign_role(guild, dna),
    )
    session.add(m)
    await session.flush()

    spec = guilds.get(guild)
    base_level = 0.5 + 0.5 * dna_mod.trait(dna, "intelligence")
    skill_levels: dict[str, float] = {name: base_level for name in spec.starting_skills}
    # Doc II.117 — offspring inherit a fraction of their parents' skills (but
    # NOT their memories). A child of two masters starts ahead, not from zero.
    for name, level in (inherit_skills or {}).items():
        skill_levels[name] = min(10.0, max(skill_levels.get(name, 0.0), level))
    for skill_name, level in skill_levels.items():
        session.add(Skill(minion_id=m.id, name=skill_name, level=level))

    # Ancestral memory faintly seeds the new Minion's memory bank.
    if soul.ancestral_summary:
        session.add(
            Memory(
                minion_id=m.id,
                tick=world.tick,
                kind="ancestral",
                content="Faint echo of a past life: " + soul.ancestral_summary.split("\n")[0],
                importance=0.4,
            )
        )

    session.add(
        Event(
            world_id=world.id,
            tick=world.tick,
            kind="minion:birth",
            actor_id=m.id,
            payload={
                "name": f"{name} {surname}".strip(),
                "guild": guild.value,
                "generation": generation,
                "soul_incarnation": soul.incarnation,
                "kind": "fork" if forked_from_id else ("breed" if parent_a_id else "spawn"),
            },
        )
    )
    return m


async def breed_pair(
    session: AsyncSession,
    *,
    world: World,
    parent_a: Minion,
    parent_b: Minion,
    rng: random.Random,
) -> Minion:
    """Doc II.16-19: two Minions combine genetic code to produce offspring."""
    child_dna = dna_mod.breed(parent_a.dna, parent_b.dna, rng=rng)
    given, surname_pick = random_name(rng)
    # Children take one parent's surname for traceability.
    surname = parent_a.surname or parent_b.surname or surname_pick
    generation = max(parent_a.generation, parent_b.generation) + 1
    guild = guild_from_dna(child_dna, allowed=tuple(_GUILD_APTITUDE_LOCI.keys()))
    # Inherit a quarter of each parent's skill in skills they were good at.
    inherited: dict[str, float] = {}
    parent_skills = (await session.execute(
        select(Skill).where(Skill.minion_id.in_([parent_a.id, parent_b.id]), Skill.level >= 1.0)
    )).scalars().all()
    for sk in parent_skills:
        inherited[sk.name] = min(2.5, inherited.get(sk.name, 0.0) + 0.25 * sk.level)
    child = await _make_minion(
        session,
        world=world,
        name=given,
        surname=surname,
        guild=guild,
        dna=child_dna,
        generation=generation,
        parent_a_id=parent_a.id,
        parent_b_id=parent_b.id,
        inherit_skills=inherited,
    )
    # Sibling relationships
    siblings_stmt = select(Minion).where(
        Minion.parent_a_id == parent_a.id,
        Minion.parent_b_id == parent_b.id,
        Minion.id != child.id,
        Minion.alive.is_(True),
    )
    res = await session.execute(siblings_stmt)
    for sibling in res.scalars().all():
        await _ensure_relationship(session, child, sibling, RelationshipKind.SIBLING, world.tick, 0.7)
        await _ensure_relationship(session, sibling, child, RelationshipKind.SIBLING, world.tick, 0.7)

    # Parent-child links
    await _ensure_relationship(session, parent_a, child, RelationshipKind.PARENT_CHILD, world.tick, 0.9)
    await _ensure_relationship(session, parent_b, child, RelationshipKind.PARENT_CHILD, world.tick, 0.9)

    # Pregnancy + childcare cost
    parent_a.fatigue = max(0.0, parent_a.fatigue - 0.2)
    parent_b.fatigue = max(0.0, parent_b.fatigue - 0.1)
    return child


async def fork_minion(
    session: AsyncSession,
    *,
    world: World,
    source: Minion,
    rng: random.Random,
) -> Minion:
    """Doc II.74-75: forking creates a digital clone with diverged personality.

    Forks DO NOT recycle a soul — they spawn a new one because the original
    is still alive. This is the "clone rights" question (II.76); we treat
    the clone as a fully independent moral agent.
    """
    new_dna = dna_mod.fork(source.dna, divergence=0.02, rng=rng)
    given, _ = random_name(rng)
    surname = (source.surname or "") + "-fork"
    return await _make_minion(
        session,
        world=world,
        name=given,
        surname=surname[:80],
        guild=source.guild,
        dna=new_dna,
        generation=source.generation,  # same gen, not a new one
        forked_from_id=source.id,
        soul=await _new_soul(session, world.id),
    )


# --- relationships ----------------------------------------------------------


async def _ensure_relationship(
    session: AsyncSession,
    a: Minion,
    b: Minion,
    kind: RelationshipKind,
    tick: int,
    strength: float,
) -> Relationship:
    stmt = select(Relationship).where(
        Relationship.from_id == a.id,
        Relationship.to_id == b.id,
        Relationship.kind == kind,
    )
    res = await session.execute(stmt)
    rel = res.scalars().first()
    if rel:
        rel.strength = min(1.0, rel.strength + 0.05)
        rel.last_interaction_tick = tick
        return rel
    rel = Relationship(
        from_id=a.id,
        to_id=b.id,
        kind=kind,
        strength=strength,
        formed_tick=tick,
        last_interaction_tick=tick,
    )
    session.add(rel)
    return rel


async def pair_socialise(
    session: AsyncSession,
    a: Minion,
    b: Minion,
    tick: int,
) -> None:
    """Two Minions interact for one tick.

    Compatible personalities form/strengthen friend bonds. Sufficiently
    incompatible ones can become rivals (II.51).
    """
    same_guild = a.guild == b.guild
    extraversion = (a.extraversion + b.extraversion) / 2.0
    agreeable = (a.agreeableness + b.agreeableness) / 2.0
    compatibility = 0.5 * agreeable + 0.3 * extraversion + (0.1 if same_guild else 0.0)

    if compatibility > 0.55:
        await _ensure_relationship(session, a, b, RelationshipKind.FRIEND, tick, compatibility)
        await _ensure_relationship(session, b, a, RelationshipKind.FRIEND, tick, compatibility)
        replenish(a, socialise=0.1)
        replenish(b, socialise=0.1)
    elif compatibility < 0.35:
        await _ensure_relationship(session, a, b, RelationshipKind.RIVAL, tick, 0.5)
        await _ensure_relationship(session, b, a, RelationshipKind.RIVAL, tick, 0.5)
        a.stress = min(1.0, a.stress + 0.05)
        b.stress = min(1.0, b.stress + 0.05)


def can_breed(a: Minion, b: Minion, *, world_tick: int) -> bool:
    """Two Minions are eligible to breed if both alive, both past childhood,
    not parent/child, kinship not absurdly high, and the friendship/romance
    bond is meaningful enough."""
    if not a.alive or not b.alive or a.id == b.id:
        return False
    age_a = world_tick - a.born_tick
    age_b = world_tick - b.born_tick
    # Lowered from 40 → 15. Matches the lowered heuristic breeding-drive
    # threshold of 20 (`agents/minion.py`); the agent flags intent at 20
    # and `can_breed` confirms eligibility once both are at least 15.
    if age_a < 15 or age_b < 15:
        return False
    if a.parent_a_id == b.id or a.parent_b_id == b.id:
        return False
    if b.parent_a_id == a.id or b.parent_b_id == a.id:
        return False
    if dna_mod.kinship(a.dna, b.dna) > 0.9:
        # Effectively the same line — no inbreeding.
        return False
    return True


# --- population stats -------------------------------------------------------


async def ghost_guidance(session: AsyncSession, world: World) -> int:
    """Doc II.139 — ascended souls linger as guides.

    Each ascended soul in the world gives a faint, capped uplift to the living:
    a little sanity (reassurance) and a touch of skill momentum on their most
    practised skill. Returns the number of guiding ancestors.
    """
    guides = int(await session.scalar(
        select(func.count(Soul.id)).where(Soul.world_id == world.id, Soul.ascended.is_(True))
    ) or 0)
    if guides <= 0:
        return 0
    boost = min(0.05, 0.01 * guides)
    alive = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all()
    for m in alive:
        m.sanity = min(1.0, m.sanity + boost)
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="population:guidance",
        actor_id=None, payload={"guides": guides, "sanity_boost": round(boost, 3)},
    ))
    return guides


async def alive_count(session: AsyncSession, world_id: str) -> int:
    return int(await session.scalar(
        select(func.count(Minion.id)).where(Minion.world_id == world_id, Minion.alive.is_(True))
    ) or 0)


# --- population floor / rescue reincarnation -------------------------------


async def reincarnate_to_floor(
    session: AsyncSession,
    world: World,
    *,
    floor: int,
    rng: random.Random,
) -> int:
    """Doc II.5-6 — when the world's alive count falls below `floor`, recycle
    free soul tokens (or mint fresh ones) back into new gen-0 Minions so the
    world doesn't death-spiral to extinction between breeding rounds.

    Returns the number of Minions reincarnated this call.
    """
    current = await alive_count(session, world.id)
    deficit = floor - current
    if deficit <= 0:
        return 0
    deficit = min(deficit, world.population_cap - current)
    if deficit <= 0:
        return 0

    # Pull all free souls in one go so we don't issue N queries.
    free_stmt = (
        select(Soul)
        .outerjoin(Minion, (Minion.soul_id == Soul.id) & (Minion.alive.is_(True)))
        .where(Soul.world_id == world.id, Minion.id.is_(None), Soul.ascended.is_(False))
        .limit(deficit)
    )
    free_souls = list((await session.execute(free_stmt)).scalars().all())

    reincarnated = 0
    for i in range(deficit):
        soul = free_souls[i] if i < len(free_souls) else None
        dna = dna_mod.random_dna(rng)
        guild = guild_from_dna(dna)
        given, surname = random_name(rng)
        await _make_minion(
            session,
            world=world,
            name=given,
            surname=surname,
            guild=guild,
            dna=dna,
            generation=0,
            soul=soul,
        )
        session.add(
            Event(
                world_id=world.id,
                tick=world.tick,
                kind="population:reincarnation",
                actor_id=None,
                payload={
                    "name": f"{given} {surname}",
                    "guild": guild.value,
                    "from_free_soul": soul is not None,
                    "soul_incarnation": (soul.incarnation if soul is not None else 1),
                },
            )
        )
        reincarnated += 1
    return reincarnated
