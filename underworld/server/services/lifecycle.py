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


_NICKNAMES = (
    "the Sharp", "the Kind", "Brightspark", "the Bold", "Quickhand", "the Wise",
    "Ironwill", "the Curious", "Sunny", "the Quiet", "Trueheart", "the Restless",
    "Goldtongue", "the Steady", "Farsight", "the Tinkerer", "Lucky", "the Patient",
)


def random_name(rng: random.Random) -> tuple[str, str]:
    return rng.choice(_GIVEN_NAMES), rng.choice(_SURNAMES)


def maybe_nickname(dna: str, rng: random.Random) -> str:
    """Doc II.122 — charismatic Minions tend to earn a nickname at birth."""
    charisma = dna_mod.trait(dna, "charisma")
    if rng.random() < 0.25 + 0.5 * charisma:
        return rng.choice(_NICKNAMES)
    return ""


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
    """Return (mood, stress) from needs + personality + appraisal.

    Doc II.107-111 — mood is an *appraisal*: morale (how recent events measured
    up to goals) and purpose (mission fulfilment) shape it alongside raw needs.
    High stress with high morale + creativity is a breakthrough (INSPIRED);
    high stress with low morale is burnout (ANXIOUS); chronically low morale or
    purpose is an existential crisis (DESPAIRING, doc II.132).
    """
    needs_floor = min(m.hunger, m.thirst, m.fatigue, m.sanity, m.health)
    needs_avg = (m.hunger + m.thirst + m.fatigue + m.sanity + m.health) / 5.0
    morale = getattr(m, "morale", None)
    purpose = getattr(m, "purpose", None)
    morale = 0.5 if morale is None else morale
    purpose = 0.5 if purpose is None else purpose
    # neuroticism amplifies stress, conscientiousness dampens it; low morale and
    # low purpose both add stress.
    stress = max(0.0, min(1.0, (
        (1.0 - needs_avg) * (0.6 + 0.6 * m.neuroticism)
        - 0.2 * m.conscientiousness
        + 0.2 * (0.5 - morale)
        + 0.1 * (0.5 - purpose)
    )))

    if m.health < 0.2 or m.sanity < 0.15:
        return MoodKind.DESPAIRING, stress
    if needs_floor < 0.2:
        return MoodKind.EXHAUSTED, stress
    if stress > 0.7:
        if morale > 0.6 and m.creativity > 0.6:
            return MoodKind.INSPIRED, stress   # stress → breakthrough
        return MoodKind.ANXIOUS, stress         # stress → burnout
    if morale < 0.3 or purpose < 0.25:
        return MoodKind.DESPAIRING, stress      # existential crisis
    if needs_avg > 0.7 and morale > 0.65 and m.creativity > 0.6:
        return MoodKind.FLOW, stress
    if needs_avg > 0.6 and (morale > 0.6 or (m.creativity + m.openness) / 2.0 > 0.55):
        return MoodKind.INSPIRED, stress
    if needs_avg < 0.45 or purpose < 0.4:
        return MoodKind.BORED, stress
    return MoodKind.CONTENT, stress


def appraise(m: Minion, *, mission: bool, idle: bool, mood_signal: float) -> None:
    """Doc II.130-132 — update purpose from what the Minion just did, and morale
    from the appraisal of recent events (mood_signal from recalled memories).

    Mission-aligned work (scanning, inventing, calculating, teaching) fulfils;
    idling erodes purpose. Fulfilment feeds sanity; a purpose vacuum drains it.
    """
    if mission:
        m.purpose = min(1.0, m.purpose + 0.03)
    elif idle:
        m.purpose = max(0.0, m.purpose - 0.02)
    target = 0.5 + 0.4 * (m.purpose - 0.5) + 5.0 * mood_signal
    m.morale = max(0.0, min(1.0, m.morale + 0.1 * (target - m.morale)))
    if m.purpose > 0.7:
        m.sanity = min(1.0, m.sanity + 0.01)   # fulfilled (doc II.131)
    elif m.purpose < 0.25:
        m.sanity = max(0.0, m.sanity - 0.02)   # existential crisis (doc II.132)


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


# --- developmental stages, parenting, circadian (doc II.118-119, I.147) -------

DAY_LENGTH = 10  # ticks per full day; the back half is night


def life_stage(age_ticks: int) -> str:
    if age_ticks < 3:
        return "infant"
    if age_ticks < 8:
        return "child"
    if age_ticks < 15:
        return "adolescent"
    return "adult"


def capability(age_ticks: int) -> float:
    """Doc II.118 — the young can't yet contribute at full strength."""
    return {"infant": 0.0, "child": 0.3, "adolescent": 0.7, "adult": 1.0}[life_stage(age_ticks)]


def is_night(world_tick: int, *, day_length: int = DAY_LENGTH) -> bool:
    return (world_tick % day_length) >= day_length / 2


def circadian_factor(world_tick: int, *, day_length: int = DAY_LENGTH) -> float:
    """Doc I.147 — night work is less efficient."""
    return 0.65 if is_night(world_tick, day_length=day_length) else 1.0


def growth_multiplier(m: Minion, world_tick: int) -> float:
    """Combined learning multiplier: maturity × upbringing × circadian."""
    up = m.upbringing if m.upbringing is not None else 1.0
    return round(capability(world_tick - m.born_tick) * up * circadian_factor(world_tick), 4)


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
            # Doc II.104 — bank this life's peak knowledge + emotional tone.
            skill_sum = float(await session.scalar(
                select(func.coalesce(func.sum(Skill.level), 0.0)).where(Skill.minion_id == m.id)
            ) or 0.0)
            soul.knowledge = max(soul.knowledge, skill_sum)
            soul.temperament = m.mood.value
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
        nickname=maybe_nickname(dna, random.Random(hash(dna) & 0xFFFFFFFF)),
    )
    session.add(m)
    await session.flush()

    spec = guilds.get(guild)
    # Doc II.106 — talent skips generations: a soul that mastered much in a past
    # life seeds its next body with a head-start, even with no parents.
    talent_bonus = min(0.6, soul.knowledge / 60.0)
    base_level = (0.5 + 0.5 * dna_mod.trait(dna, "intelligence")) * (1.0 + talent_bonus)
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

    # Doc II.119 — parenting quality: capable, well-regarded, low-stress parents
    # raise children who learn faster as adults.
    parent_quality = (parent_a.reputation + parent_b.reputation) / 4.0  # rep is 0..5
    parent_calm = 1.0 - (parent_a.stress + parent_b.stress) / 2.0
    child.upbringing = round(max(0.6, min(1.6, 0.7 + 0.4 * parent_quality + 0.2 * parent_calm)), 4)

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

    # Doc I.150 — gossip: reputation spreads; both drift toward their shared mean.
    mean_rep = (a.reputation + b.reputation) / 2.0
    a.reputation = max(0.0, min(5.0, a.reputation + (mean_rep - a.reputation) * 0.05))
    b.reputation = max(0.0, min(5.0, b.reputation + (mean_rep - b.reputation) * 0.05))

    # Ostracism: the community shuns the disgraced (reputation < 0.6).
    if min(a.reputation, b.reputation) < 0.6:
        await _ensure_relationship(session, a, b, RelationshipKind.RIVAL, tick, 0.5)
        await _ensure_relationship(session, b, a, RelationshipKind.RIVAL, tick, 0.5)
        outcast = a if a.reputation < b.reputation else b
        outcast.sanity = max(0.0, outcast.sanity - 0.05)
        outcast.stress = min(1.0, outcast.stress + 0.05)
        return

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


async def guild_standings(session: AsyncSession, world_id: str) -> list[tuple[GuildKind, float]]:
    """Doc I.67 — guilds compete. Rank guilds by a prestige score combining the
    average reputation of their living members and their approved-invention
    output. Returns (guild, score) descending."""
    from ..db.models import Invention, TaskStatus  # local import avoids a cycle

    rep_rows = (await session.execute(
        select(Minion.guild, func.avg(Minion.reputation), func.count(Minion.id))
        .where(Minion.world_id == world_id, Minion.alive.is_(True))
        .group_by(Minion.guild)
    )).all()
    inv_rows = dict((await session.execute(
        select(Invention.inputs["guild"].as_string(), func.count(Invention.id))
        .where(Invention.world_id == world_id, Invention.status == TaskStatus.APPROVED)
        .group_by(Invention.inputs["guild"].as_string())
    )).all())
    scores: list[tuple[GuildKind, float]] = []
    for guild, avg_rep, _n in rep_rows:
        approved = float(inv_rows.get(guild.value, 0) or 0)
        scores.append((guild, float(avg_rep or 0.0) + 0.5 * approved))
    scores.sort(key=lambda t: t[1], reverse=True)
    return scores


async def apply_guild_competition(session: AsyncSession, world: World) -> dict[str, float]:
    """The leading guild gains prestige (a morale lift); the trailing guild feels
    pressure (a little stress). Logs a `guild:standings` event."""
    standings = await guild_standings(session, world.id)
    if len(standings) < 2:
        return {}
    top_guild = standings[0][0]
    bottom_guild = standings[-1][0]
    members = (await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all()
    for m in members:
        if m.guild == top_guild:
            m.morale = min(1.0, m.morale + 0.03)
        elif m.guild == bottom_guild:
            m.stress = min(1.0, m.stress + 0.02)
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="guild:standings", actor_id=None,
        payload={"leader": top_guild.value, "trailing": bottom_guild.value,
                 "scores": {g.value: round(s, 2) for g, s in standings}},
    ))
    return {g.value: round(s, 2) for g, s in standings}


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
