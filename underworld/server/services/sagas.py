"""Sagas — a procedural storyline engine that gives Minions' lives meaning.

Where epochs.py is the real historical *spine*, sagas are the emergent *flesh*:
recurring human stories — mentorship, prodigies, rivalries, plague-trials, lost
knowledge, renaissances — instantiated from the world's actual Minions, guilds,
discoveries and current epoch. Because each saga is (archetype × specific cast ×
guild × epoch × discovery), the space of distinct stories is effectively
unbounded — thousands upon thousands of unique arcs over a long-running world.

Crucially, a saga is not flavour text: it *assists Minion development*. Each one
yields concrete benefits — a mentorship that multiplies an apprentice's learning,
a sense of purpose that steadies sanity, a goal that focuses effort, morale that
lifts a guild after a breakthrough. The story and the simulation reinforce each
other: meaning makes Minions grow.

Pure functions over plain dicts so the engine is fully testable; the tick wiring
(tick_sagas) applies the benefits to real Minions and records the beats.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field


# ── archetypes: the recurring shapes of a life's story ───────────────────────
@dataclass(frozen=True)
class Archetype:
    id: str
    title_template: str       # {hero}, {mentor}, {rival}, {guild}, {epoch}, {tech}
    beats: tuple[str, ...]    # one narrative beat per act (call → trial → payoff)
    # development benefits granted across the arc:
    learn_multiplier: float   # apprentice/hero learning speed bonus while active
    morale: float             # per-tick morale/purpose lift to the cast
    sanity: float             # meaning steadies (or hardship strains) the mind
    cast_roles: tuple[str, ...]  # which roles this story needs filled
    goal: str                 # the developmental goal it sets the hero


ARCHETYPES: list[Archetype] = [
    Archetype("prodigy", "The Rise of {hero} the {guild}",
              ("{hero}, gifted beyond their years, is noticed by the guild.",
               "{hero} is tested against problems meant for elders — and does not break.",
               "{hero} surpasses their teachers, a new master of {guild}."),
              learn_multiplier=1.8, morale=0.04, sanity=0.03,
              cast_roles=("hero",), goal="achieve mastery of your craft"),
    Archetype("mentorship", "{mentor} Takes {hero} as Apprentice",
              ("Old master {mentor} sees promise in young {hero}.",
               "Through patient {guild} drills, {hero}'s hands learn what words cannot teach.",
               "{hero} comes into their own; {mentor}'s legacy lives on."),
              learn_multiplier=2.0, morale=0.05, sanity=0.04,
              cast_roles=("mentor", "hero"), goal="learn from your mentor"),
    Archetype("great_discovery", "{hero} and the Discovery of {tech}",
              ("{hero} glimpses a pattern no one in {guild} has seen.",
               "Doubt and dead ends — {hero} persists where others would quit.",
               "{tech} is established; the whole guild walks taller."),
              learn_multiplier=1.5, morale=0.06, sanity=0.03,
              cast_roles=("hero",), goal="make a discovery worthy of the guild"),
    Archetype("rivalry", "The Rivalry of {hero} and {rival}",
              ("{hero} and {rival} both reach for the same prize.",
               "Each pushes the other past what either could do alone.",
               "Their contest lifts all of {guild} — competition as a forge."),
              learn_multiplier=1.6, morale=0.03, sanity=0.0,
              cast_roles=("hero", "rival"), goal="outdo your rival"),
    Archetype("plague_trial", "{hero} in the {epoch} Plague",
              ("Sickness sweeps the world; the {epoch} is darkened.",
               "{hero} tends the suffering and studies the malady by lamplight.",
               "The plague breaks; {hero}'s notes become healing knowledge."),
              learn_multiplier=1.4, morale=-0.02, sanity=-0.03,
              cast_roles=("hero",), goal="endure the trial and learn from it"),
    Archetype("lost_knowledge", "The Lost Art of {mentor}",
              ("Master {mentor} passes, taking rare {guild} knowledge with them.",
               "{hero} pores over fragments, determined to rediscover it.",
               "{hero} rebuilds what was lost — knowledge made unbreakable."),
              learn_multiplier=1.7, morale=0.02, sanity=0.02,
              cast_roles=("mentor", "hero"), goal="rediscover what was lost"),
    Archetype("renaissance", "The {epoch} Flowering of {guild}",
              ("A spirit of inquiry takes hold across {guild}.",
               "Ideas cross-pollinate; every hand seems touched by inspiration.",
               "{hero} leads {guild} into its golden age."),
              learn_multiplier=1.5, morale=0.07, sanity=0.05,
              cast_roles=("hero",), goal="lead your guild's flourishing"),
    Archetype("first_of_kind", "{hero}, First into the {epoch}",
              ("The world stands at the threshold of the {epoch}.",
               "{hero} masters the new ways while others hesitate.",
               "{hero} is remembered as the first to cross into the {epoch}."),
              learn_multiplier=1.6, morale=0.05, sanity=0.03,
              cast_roles=("hero",), goal="be first to embody the new epoch"),
    Archetype("legacy", "The Line of {mentor}",
              ("{hero}, child of the great {mentor}, carries a famous name.",
               "{hero} must prove worthy of the legacy, not merely inherit it.",
               "{hero} honours the line — and adds a chapter of their own."),
              learn_multiplier=1.7, morale=0.04, sanity=0.04,
              cast_roles=("mentor", "hero"), goal="prove worthy of your lineage"),
    Archetype("wanderer", "{hero} the Seeker",
              ("{hero} is restless within one guild's walls.",
               "Wandering between crafts, {hero} gathers scattered wisdom.",
               "{hero} returns, uniquely broad — a bridge between guilds."),
              learn_multiplier=1.5, morale=0.03, sanity=0.02,
              cast_roles=("hero",), goal="learn widely across the crafts"),
    Archetype("reconciliation", "{hero} and {rival} Make Peace",
              ("A bitter feud divides {hero} and {rival}.",
               "Shared hardship forces them to see the other clearly.",
               "Reconciled, they accomplish what division never could."),
              learn_multiplier=1.4, morale=0.05, sanity=0.05,
              cast_roles=("hero", "rival"), goal="turn a rival into an ally"),
]

ARCHETYPE_BY_ID = {a.id: a for a in ARCHETYPES}


@dataclass
class Saga:
    id: str
    archetype: str
    title: str
    cast: dict[str, str]          # role -> minion id
    act: int = 0                  # 0,1,2
    started_tick: int = 0
    resolved: bool = False
    beats_seen: list[str] = field(default_factory=list)

    @property
    def hero(self) -> str | None:
        return self.cast.get("hero")


def _fill(template: str, *, hero="", mentor="", rival="", guild="", epoch="", tech="") -> str:
    return template.format(hero=hero, mentor=mentor, rival=rival, guild=guild,
                           epoch=epoch, tech=tech)


def instantiate(archetype_id: str, *, cast_names: dict[str, str], cast_ids: dict[str, str],
                guild: str, epoch: str, tech: str, tick: int) -> Saga:
    """Create a concrete saga instance from an archetype + real world entities.
    The combination of (archetype, cast, guild, epoch, tech) makes each unique."""
    arc = ARCHETYPE_BY_ID[archetype_id]
    title = _fill(arc.title_template, hero=cast_names.get("hero", ""),
                  mentor=cast_names.get("mentor", ""), rival=cast_names.get("rival", ""),
                  guild=guild.title(), epoch=epoch, tech=tech)
    sid = hashlib.sha256(f"{archetype_id}|{sorted(cast_ids.items())}|{tick}".encode()).hexdigest()[:12]
    return Saga(id=f"saga-{sid}", archetype=archetype_id, title=title,
                cast=dict(cast_ids), started_tick=tick)


def current_beat(saga: Saga, *, names: dict[str, str], guild: str, epoch: str, tech: str) -> str:
    """The narrative line for the saga's current act, filled with real names."""
    arc = ARCHETYPE_BY_ID[saga.archetype]
    beat = arc.beats[min(saga.act, len(arc.beats) - 1)]
    return _fill(beat, hero=names.get("hero", ""), mentor=names.get("mentor", ""),
                 rival=names.get("rival", ""), guild=guild.title(), epoch=epoch, tech=tech)


def advance(saga: Saga) -> Saga:
    """Progress the saga one act; resolves after the final beat."""
    arc = ARCHETYPE_BY_ID[saga.archetype]
    if saga.act >= len(arc.beats) - 1:
        saga.resolved = True
    else:
        saga.act += 1
    return saga


def benefits(saga: Saga) -> dict:
    """The development benefits the saga confers on its cast *this tick*. This is
    the value to Minions: faster learning, steadier mind, sense of purpose, a
    goal worth pursuing."""
    arc = ARCHETYPE_BY_ID[saga.archetype]
    # benefits are strongest at the climactic middle act, taper at resolution
    intensity = {0: 0.7, 1: 1.0, 2: 0.85}.get(saga.act, 0.7)
    return {
        "learn_multiplier": round(1.0 + (arc.learn_multiplier - 1.0) * intensity, 3),
        "morale_delta": round(arc.morale * intensity, 4),
        "sanity_delta": round(arc.sanity * intensity, 4),
        "purpose": arc.goal,
        "mentor_id": saga.cast.get("mentor"),
        "apprentice_id": saga.cast.get("hero") if "mentor" in saga.cast else None,
    }


def choose_archetype(*, has_master: bool, in_hardship: bool, crossed_epoch: bool,
                     has_rival: bool, made_discovery: bool, seed: int) -> str:
    """Pick the archetype that best fits the current world moment — so the story
    that emerges reflects what is actually happening to the Minions."""
    if crossed_epoch:
        return "first_of_kind"
    if in_hardship:
        return "plague_trial"
    if made_discovery:
        return "great_discovery"
    if has_master and has_rival:
        return ["rivalry", "mentorship"][seed % 2]
    if has_master:
        return ["mentorship", "lost_knowledge", "legacy", "renaissance"][seed % 4]
    if has_rival:
        return ["rivalry", "reconciliation"][seed % 2]
    return ["prodigy", "wanderer"][seed % 2]


# ── live tick wiring: sagas emerge from real world moments and aid Minions ────
async def tick_sagas(session, world, rng, *, max_new: int = 2, max_active: int = 40) -> dict:
    """Spawn, advance and resolve sagas for this world's Minions, applying the
    development benefits to real Minions. Stories emerge from what is actually
    happening — a new master, a hardship, an epoch crossing — and in turn make
    the Minions grow faster and steadier. Returns a small report."""
    from sqlalchemy import func, select

    from ..db.models import Event, Minion, Skill
    from . import epochs as epochs_mod
    from . import progression

    MASTERY = 6.0
    alive = list((await session.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all())
    if not alive:
        return {"spawned": 0, "active": 0, "resolved": 0}

    # who already carries a saga, and which are masters (potential mentors)
    masters_by_guild: dict[str, list[Minion]] = {}
    master_ids = {r[0] for r in (await session.execute(
        select(Skill.minion_id).join(Minion, Minion.id == Skill.minion_id)
        .where(Minion.world_id == world.id, Minion.alive.is_(True), Skill.level >= MASTERY)
    )).all()}
    for m in alive:
        if m.id in master_ids:
            masters_by_guild.setdefault(m.guild.value, []).append(m)

    # world moment
    hardship = (world.pollution or 0.0) > 0.6 or (getattr(world, "infrastructure", 1.0) or 1.0) < 0.1
    idx = epochs_mod.knowledge_index(
        discoveries=int(await session.scalar(select(func.count()).select_from(
            __import__("underworld.server.db.models", fromlist=["Discovery"]).Discovery
        ).where(__import__("underworld.server.db.models", fromlist=["Discovery"]).Discovery.world_id == world.id)) or 0),
        avg_expertise=2.0, approved_inventions=0)
    epoch_name = epochs_mod.epoch_for(idx).name

    active = [m for m in alive if (m.brain or {}).get("saga")]
    spawned = resolved = 0

    # 1) advance + apply benefits + resolve existing sagas
    for m in active:
        brain = dict(m.brain or {})
        sg = brain["saga"]
        saga = Saga(id=sg["id"], archetype=sg["archetype"], title=sg["title"],
                    cast=sg.get("cast", {}), act=sg.get("act", 0),
                    started_tick=sg.get("started", world.tick), resolved=False)
        ben = benefits(saga)
        m.morale = max(0.0, min(1.0, (m.morale or 0.5) + ben["morale_delta"]))
        m.purpose = max(0.0, min(1.0, (m.purpose or 0.5) + abs(ben["morale_delta"])))
        m.sanity = max(0.0, min(1.0, (m.sanity or 0.85) + ben["sanity_delta"]))
        brain["saga_learn_mult"] = ben["learn_multiplier"]   # read by _do_study
        # progress every ~6 ticks
        if world.tick - sg.get("last_advance", saga.started_tick) >= 6:
            advance(saga)
            sg["act"] = saga.act
            sg["last_advance"] = world.tick
            if saga.resolved:
                resolved += 1
                m.reputation = min(5.0, (m.reputation or 1.0) + 0.15)  # a lasting mark
                brain.pop("saga", None)
                brain.pop("saga_learn_mult", None)
                session.add(Event(world_id=world.id, tick=world.tick, kind="saga:resolved",
                                  actor_id=m.id, payload={"title": sg["title"]}))
            else:
                brain["saga"] = sg
        else:
            brain["saga"] = sg
        m.brain = brain

    # 2) spawn new sagas for promising Minions without one
    candidates = [m for m in alive if not (m.brain or {}).get("saga")
                  and (m.conscientiousness >= 0.35 or m.intelligence >= 0.45 or m.creativity > 0.55)]
    rng.shuffle(candidates)
    room = max(0, max_active - (len(active) - resolved))
    for hero in candidates[:min(max_new, room)]:
        guild = hero.guild.value
        mentor = next((mm for mm in masters_by_guild.get(guild, []) if mm.id != hero.id), None)
        rival = next((mm for mm in alive if mm.guild.value == guild and mm.id != hero.id
                      and (not mentor or mm.id != mentor.id)), None)
        arche = choose_archetype(
            has_master=mentor is not None, in_hardship=hardship,
            crossed_epoch=(world.tick < 8), has_rival=rival is not None,
            made_discovery=hero.id in master_ids, seed=rng.randint(0, 999))
        arc = ARCHETYPE_BY_ID[arche]
        names = {"hero": f"{hero.name} {hero.surname or ''}".strip()}
        ids = {"hero": hero.id}
        if "mentor" in arc.cast_roles and mentor is not None:
            names["mentor"] = f"{mentor.name} {mentor.surname or ''}".strip(); ids["mentor"] = mentor.id
        elif "mentor" in arc.cast_roles:
            continue  # needs a mentor but none available
        if "rival" in arc.cast_roles and rival is not None:
            names["rival"] = f"{rival.name} {rival.surname or ''}".strip(); ids["rival"] = rival.id
        elif "rival" in arc.cast_roles:
            continue
        saga = instantiate(arche, cast_names=names, cast_ids=ids, guild=guild,
                           epoch=epoch_name, tech=epoch_name, tick=world.tick)
        beat = current_beat(saga, names=names, guild=guild, epoch=epoch_name, tech=epoch_name)
        brain = dict(hero.brain or {})
        brain["saga"] = {"id": saga.id, "archetype": arche, "title": saga.title,
                         "cast": ids, "act": 0, "started": world.tick,
                         "last_advance": world.tick, "goal": arc.goal}
        hero.brain = brain
        session.add(Event(world_id=world.id, tick=world.tick, kind="saga:begins",
                          actor_id=hero.id, payload={"title": saga.title, "beat": beat,
                                                     "goal": arc.goal, "archetype": arche}))
        spawned += 1

    return {"spawned": spawned, "active": len(active) - resolved + spawned, "resolved": resolved}
