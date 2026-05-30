"""SQLAlchemy ORM models for the Underworld simulation.

Schema covers the doc's `I. Data Architecture` plus the doc's explicit
mandates from Section II:
- "soul seed" (II.18) — `soul_token`, persistent across reincarnation
- digital DNA (II.19-20) — `dna`, `generation`, lineage FKs
- emotions / mood (II.7-11) — `mood`, `sanity`, `stress`
- relationships (II.13-16) — `Relationship` rows
- reproduction & forking (II.16, II.74) — `Minion.parent_a_id`, `parent_b_id`, `forked_from_id`
- reincarnation (II.5-6) — `Soul` row carries karma+memories between bodies
- needs (Section IV "Sims-like") — hunger, thirst, fatigue, sanity
- family tree (II.21) — derived from parent FKs
- death (Section I.32) — `Minion.died_tick`, `cause_of_death`
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.utcnow()


class Base(DeclarativeBase):
    pass


class GuildKind(str, enum.Enum):
    MATHS = "maths"
    PHYSICS = "physics"
    ELECTRICAL = "electrical"
    MECHANICAL = "mechanical"
    CIVIL = "civil"
    MATERIALS = "materials"
    COMPUTING = "computing"
    ENERGY = "energy"
    AGRICULTURE = "agriculture"
    PATENT = "patent"
    SAFETY = "safety"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    NEEDS_PEER_REVIEW = "needs_peer_review"
    NEEDS_SAFETY_REVIEW = "needs_safety_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FAILED = "failed"


class ReviewVerdict(str, enum.Enum):
    APPROVE = "approve"
    REQUEST_CHANGES = "request_changes"
    REJECT = "reject"
    BLOCK_SAFETY = "block_safety"


class CauseOfDeath(str, enum.Enum):
    OLD_AGE = "old_age"
    STARVATION = "starvation"
    DISEASE = "disease"
    ACCIDENT = "accident"
    DESPAIR = "despair"
    PRUNED = "pruned"  # doc II.106 — Minions who violate prime directive get reset
    ASCENDED = "ascended"  # doc II.37-39 — enlightenment lifts soul to assistant tier


class RelationshipKind(str, enum.Enum):
    FRIEND = "friend"
    RIVAL = "rival"
    ROMANCE = "romance"
    MENTOR = "mentor"
    PARENT_CHILD = "parent_child"
    SIBLING = "sibling"
    SOUL_BOND = "soul_bond"  # doc II.72-73


class SwarmRoleKind(str, enum.Enum):
    """Specialised research roles from the Master Reference Section 2.

    Each Minion gets exactly one role at birth, derived from their DNA
    aptitudes + guild. Roles shape what kinds of actions they prefer and
    which projects they can join.
    """

    LITERATURE_SCOUT = "literature_scout"
    GENOME_ANALYST = "genome_analyst"
    PROTEIN_MODELLER = "protein_modeller"
    CHEMISTRY_GENERATOR = "chemistry_generator"
    TOXICITY_CHECKER = "toxicity_checker"
    TRIAL_SIMULATOR = "trial_simulator"
    REGULATORY_REASONER = "regulatory_reasoner"
    EXPERIMENTAL_DESIGNER = "experimental_designer"
    FORMULA_ORACLE = "formula_oracle"
    GENERALIST = "generalist"  # default when no role fits


class ProjectStage(str, enum.Enum):
    """Validation pipeline stages from Section 8 of the Master Reference."""

    HYPOTHESIS = "hypothesis"
    IN_SILICO = "in_silico"
    BENCH_PLAN = "bench_plan"
    PRECLINICAL_PLAN = "preclinical_plan"
    CLINICAL_PLAN = "clinical_plan"
    REGULATORY_REVIEW = "regulatory_review"
    APPROVED = "approved"
    BLOCKED = "blocked"
    ABANDONED = "abandoned"


class MoodKind(str, enum.Enum):
    """Derived each tick from needs + recent events.

    The doc (II.7-11) wants a computational model of affect; we use a
    discrete bucket because it is what the LLM and the UI can act on.
    """
    FLOW = "flow"            # high focus + creative
    INSPIRED = "inspired"
    CONTENT = "content"
    BORED = "bored"
    ANXIOUS = "anxious"
    EXHAUSTED = "exhausted"
    DESPAIRING = "despairing"


class World(Base):
    __tablename__ = "worlds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    seed_class: Mapped[str] = mapped_column(String(32), nullable=False)
    seed_value: Mapped[int] = mapped_column(Integer, nullable=False)
    tick: Mapped[int] = mapped_column(Integer, default=0)
    population_cap: Mapped[int] = mapped_column(Integer, default=400)
    auto_advance: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_advance_interval_s: Mapped[float] = mapped_column(Float, default=5.0)
    next_auto_tick_at: Mapped[datetime | None] = mapped_column(nullable=True)
    # Doc I.22-29 + III.5-9: civilisations progress through eras gated by
    # cumulative invention approvals + total skill level. Tech eras unlock
    # which actions are even available — e.g. patent scanning requires
    # Industrial.
    era: Mapped[str] = mapped_column(String(24), default="stone", index=True)
    # Doc III.3: Minions must BUILD a Patent Scanner before they can use
    # the action — tracked as an integer progress meter (0..100). When
    # 100, scanner is operational.
    scanner_progress: Mapped[int] = mapped_column(Integer, default=0)
    # Doc I.16 — in-world calendar. Early ages run fast (many years per tick),
    # later complex ages slow down, so sim_year advances by a complexity-scaled
    # amount each tick rather than linearly.
    sim_year: Mapped[float] = mapped_column(Float, default=0.0)
    # Doc I.46/II.133-134 — the civilization's dominant worldview, which emerges
    # from population traits + how much it understands the App Console.
    worldview: Mapped[str] = mapped_column(String(28), default="animism")
    # Doc I.36 — accumulated environmental pollution (0 = pristine, 1 = toxic),
    # driven by industrial activity and decaying with remediation.
    pollution: Mapped[float] = mapped_column(Float, default=0.0)
    # Doc I.35 — wildlife populations (fraction of carrying capacity) driving the
    # food supply. Overhunting collapses prey → famine.
    prey_pop: Mapped[float] = mapped_column(Float, default=1.0)
    predator_pop: Mapped[float] = mapped_column(Float, default=0.25)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    minions: Mapped[list["Minion"]] = relationship(back_populates="world", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship(back_populates="world", cascade="all, delete-orphan")


class Soul(Base):
    """Persistent identity across reincarnation. Doc II.3-6, II.165.

    A single Soul can be embodied by many Minions over time (the current
    embodiment is whichever Minion has `soul_id = soul.id` and `alive=True`).
    Karma, accumulated knowledge embeddings, and ancestral memory all live
    on the Soul, NOT on the Minion body.
    """

    __tablename__ = "souls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    token: Mapped[str] = mapped_column(String(64), unique=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False, index=True)
    incarnation: Mapped[int] = mapped_column(Integer, default=1)
    karma: Mapped[float] = mapped_column(Float, default=0.0)
    ascended: Mapped[bool] = mapped_column(Boolean, default=False)
    # Doc II.104 — the soul accumulates knowledge (peak Σ skill levels reached)
    # + an emotional tone across lives; II.106 lets talent skip generations.
    knowledge: Mapped[float] = mapped_column(Float, default=0.0)
    temperament: Mapped[str] = mapped_column(String(24), default="")
    # Faint ancestral memory — short text summaries of past lives.
    ancestral_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(default=_now)


class Minion(Base):
    __tablename__ = "minions"
    __table_args__ = (
        Index("ix_minion_world_alive", "world_id", "alive"),
        Index("ix_minion_world_generation", "world_id", "generation"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False, index=True)
    soul_id: Mapped[str | None] = mapped_column(ForeignKey("souls.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    surname: Mapped[str] = mapped_column(String(80), default="")
    guild: Mapped[GuildKind] = mapped_column(Enum(GuildKind), nullable=False)

    # Genetics — Section II.19-21
    dna: Mapped[str] = mapped_column(Text, nullable=False)
    generation: Mapped[int] = mapped_column(Integer, default=0)
    parent_a_id: Mapped[str | None] = mapped_column(ForeignKey("minions.id"), nullable=True)
    parent_b_id: Mapped[str | None] = mapped_column(ForeignKey("minions.id"), nullable=True)
    forked_from_id: Mapped[str | None] = mapped_column(ForeignKey("minions.id"), nullable=True)

    # Personality (Big Five) — derived from DNA at birth but stored for fast lookup.
    openness: Mapped[float] = mapped_column(Float, default=0.5)
    conscientiousness: Mapped[float] = mapped_column(Float, default=0.5)
    extraversion: Mapped[float] = mapped_column(Float, default=0.5)
    agreeableness: Mapped[float] = mapped_column(Float, default=0.5)
    neuroticism: Mapped[float] = mapped_column(Float, default=0.5)
    intelligence: Mapped[float] = mapped_column(Float, default=0.5)
    creativity: Mapped[float] = mapped_column(Float, default=0.5)

    # Reputation, karma snapshot, age — Section II.4, II.51
    reputation: Mapped[float] = mapped_column(Float, default=1.0)
    karma: Mapped[float] = mapped_column(Float, default=0.0)
    born_tick: Mapped[int] = mapped_column(Integer, default=0)
    died_tick: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cause_of_death: Mapped[CauseOfDeath | None] = mapped_column(Enum(CauseOfDeath), nullable=True)
    alive: Mapped[bool] = mapped_column(Boolean, default=True)

    # Sims-like needs (Section I.31 + Section IV) — 0..1, lower is worse.
    hunger: Mapped[float] = mapped_column(Float, default=0.85)
    thirst: Mapped[float] = mapped_column(Float, default=0.85)
    fatigue: Mapped[float] = mapped_column(Float, default=0.85)
    sanity: Mapped[float] = mapped_column(Float, default=0.85)
    health: Mapped[float] = mapped_column(Float, default=1.0)
    # Doc I.32 — current wound severity (0 = unhurt). An untreated wound risks
    # infection (erodes health); the heritable `immune` locus + rest heal it.
    injury: Mapped[float] = mapped_column(Float, default=0.0)

    # Mood + stress — derived each tick from needs and recent events.
    mood: Mapped[MoodKind] = mapped_column(Enum(MoodKind), default=MoodKind.CONTENT)
    stress: Mapped[float] = mapped_column(Float, default=0.2)
    # Doc II.107-111 — morale is an appraisal of how recent events measured up to
    # goals (drives flow/inspiration vs burnout/despair). Doc II.130-132 — purpose
    # is fulfilment from the App's mission; chronically low purpose → crisis.
    morale: Mapped[float] = mapped_column(Float, default=0.5)
    purpose: Mapped[float] = mapped_column(Float, default=0.5)
    # Doc II.122 — an optional earned nickname.
    nickname: Mapped[str] = mapped_column(String(40), default="")

    # Swarm role — derived from DNA + guild at birth. Drives action bias and
    # project eligibility. See Master Reference Section 2.
    swarm_role: Mapped[SwarmRoleKind] = mapped_column(
        Enum(SwarmRoleKind), default=SwarmRoleKind.GENERALIST, index=True,
    )

    created_at: Mapped[datetime] = mapped_column(default=_now)

    world: Mapped["World"] = relationship(back_populates="minions")
    skills: Mapped[list["Skill"]] = relationship(back_populates="minion", cascade="all, delete-orphan")
    memories: Mapped[list["Memory"]] = relationship(back_populates="minion", cascade="all, delete-orphan")


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("minion_id", "name", name="uq_skill_per_minion"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    minion_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    level: Mapped[float] = mapped_column(Float, default=0.0)
    last_practiced_tick: Mapped[int] = mapped_column(Integer, default=0)

    minion: Mapped["Minion"] = relationship(back_populates="skills")


class Memory(Base):
    __tablename__ = "memories"
    __table_args__ = (Index("ix_memory_minion_tick", "minion_id", "tick"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    minion_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False, index=True)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    importance: Mapped[float] = mapped_column(Float, default=0.5)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    minion: Mapped["Minion"] = relationship(back_populates="memories")


class Discovery(Base):
    """Doc I.22 — a foundational technology a civilization has discovered from
    scratch (fire, toolmaking, language, writing, …). One row per world+tech."""

    __tablename__ = "discoveries"
    __table_args__ = (UniqueConstraint("world_id", "tech", name="uq_discovery_per_world"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False, index=True)
    tech: Mapped[str] = mapped_column(String(40), nullable=False)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    sim_year: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class Meme(Base):
    """Doc I.142-143 — a unit of culture (fad, fashion, idea) that replicates
    through the social network, mutates into variants, and fades over time."""

    __tablename__ = "memes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), default="idea")  # idea | fashion | slang | ritual
    popularity: Mapped[float] = mapped_column(Float, default=0.05)
    generation: Mapped[int] = mapped_column(Integer, default=0)
    variant_of: Mapped[str | None] = mapped_column(String(36), nullable=True)
    born_tick: Mapped[int] = mapped_column(Integer, default=0)
    alive: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class MLModel(Base):
    """Doc I.58 — an in-world machine-learning model a Minion trains on its own
    data. Accuracy climbs with training samples toward a ceiling set by the
    trainer's computing skill; it is never free."""

    __tablename__ = "ml_models"
    __table_args__ = (UniqueConstraint("minion_id", "task", name="uq_model_per_minion_task"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    minion_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False, index=True)
    task: Mapped[str] = mapped_column(String(40), nullable=False)
    samples: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    updated_tick: Mapped[int] = mapped_column(Integer, default=0)


class CausalBelief(Base):
    """Doc I.23 — a Minion's learned cause→effect hypotheses.

    Each row is a hypothesis ("doing `cause` improves my `effect`") with a
    running count of trials and confirmations. Confidence is a Laplace-smoothed
    success rate the Minion can act on (intervene) and keep updating (Bayesian-
    ish belief revision).
    """

    __tablename__ = "causal_beliefs"
    __table_args__ = (UniqueConstraint("minion_id", "cause", "effect", name="uq_belief_per_minion"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    minion_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False, index=True)
    cause: Mapped[str] = mapped_column(String(40), nullable=False)
    effect: Mapped[str] = mapped_column(String(40), default="wellbeing")
    trials: Mapped[int] = mapped_column(Integer, default=0)
    confirmations: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    updated_tick: Mapped[int] = mapped_column(Integer, default=0)


class Relationship(Base):
    """Directed bond from A → B. Bonds are usually mirrored but can be asymmetric.

    Doc II.13-16: friendships, rivalries, romance, soul bonds.
    Doc II.72-73: soul bonds enable telepathic exchange — handled in agent
    layer by sharing memories between bonded pairs.
    """

    __tablename__ = "relationships"
    __table_args__ = (
        UniqueConstraint("from_id", "to_id", "kind", name="uq_rel_triple"),
        Index("ix_rel_from", "from_id"),
        Index("ix_rel_to", "to_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    from_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False)
    to_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False)
    kind: Mapped[RelationshipKind] = mapped_column(Enum(RelationshipKind), nullable=False)
    strength: Mapped[float] = mapped_column(Float, default=0.5)
    formed_tick: Mapped[int] = mapped_column(Integer, default=0)
    last_interaction_tick: Mapped[int] = mapped_column(Integer, default=0)


class Patent(Base):
    __tablename__ = "patents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(400), nullable=False)
    abstract: Mapped[str] = mapped_column(Text, default="")
    cpc_class: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    grant_date: Mapped[str | None] = mapped_column(String(16), nullable=True)
    expired: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source: Mapped[str] = mapped_column(String(40), default="patentsview")
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Invention(Base):
    __tablename__ = "inventions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False, index=True)
    minion_id: Mapped[str | None] = mapped_column(ForeignKey("minions.id"), nullable=True)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(280), nullable=False)
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    hypothesis: Mapped[str] = mapped_column(Text, default="")
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    outputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    feasibility_score: Mapped[float] = mapped_column(Float, default=0.0)
    novelty_score: Mapped[float] = mapped_column(Float, default=0.0)
    safety_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.PENDING)
    related_patents: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Doc I.71 — an approved result is not "established" until an independent
    # Minion reproduces it.
    replicated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    replicated_by: Mapped[str | None] = mapped_column(ForeignKey("minions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class PeerReview(Base):
    __tablename__ = "peer_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    invention_id: Mapped[str] = mapped_column(ForeignKey("inventions.id"), nullable=False, index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("minions.id"), nullable=True)
    reviewer_guild: Mapped[GuildKind] = mapped_column(Enum(GuildKind), nullable=False)
    verdict: Mapped[ReviewVerdict] = mapped_column(Enum(ReviewVerdict), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(default=_now)


class SafetyReview(Base):
    __tablename__ = "safety_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    subject_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    rule: Mapped[str] = mapped_column(String(80), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="")
    blocked: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_event_world_tick", "world_id", "tick"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False, index=True)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=_now)

    world: Mapped["World"] = relationship(back_populates="events")


# --- knowledge base (ingested from docs/AI_Swarms_Master_Reference.docx) ---


class KnowledgeConcept(Base):
    """Prose section from the Master Reference (e.g. 'Genomics, CRISPR…')."""

    __tablename__ = "kb_concepts"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    section: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)


class KnowledgeFormula(Base):
    """A single formula / named law from one of the master compendia.

    Multiple sources feed this table:
      - `AI Swarms Master Reference (V2 Expanded)` — bare formula lines.
      - `Physics Laws & Equations Master Compendium (V4)` — named laws
        with explanation prose stored in `name` + `description`.
    """

    __tablename__ = "kb_formulas"
    __table_args__ = (
        Index("ix_kb_formula_discipline", "discipline"),
        Index("ix_kb_formula_catalogue", "catalogue"),
        Index("ix_kb_formula_source", "source"),
    )

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    discipline: Mapped[str] = mapped_column(String(40), nullable=False)
    catalogue: Mapped[str] = mapped_column(String(200), nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Richer fields (nullable — older docx-sourced rows leave them blank).
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="master_reference_v2")


class KnowledgeSwarmRole(Base):
    """Swarm-role taxonomy from Master Reference Section 2."""

    __tablename__ = "kb_swarm_roles"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    guild_hint: Mapped[str] = mapped_column(String(40), nullable=False)


class KnowledgeGuardrail(Base):
    """Validation-pipeline guardrail from Master Reference Section 8."""

    __tablename__ = "kb_guardrails"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    stage: Mapped[str] = mapped_column(String(40), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)


# --- research projects (Section 8 validation pipeline) ---


class ResearchProject(Base):
    """A multi-stage research project. Created when an invention crosses into a
    domain that requires the doc's full validation pipeline (medical, gene,
    chemical-synthesis), or when explicitly chartered.
    """

    __tablename__ = "research_projects"
    __table_args__ = (Index("ix_research_world_stage", "world_id", "stage"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False)
    invention_id: Mapped[str | None] = mapped_column(ForeignKey("inventions.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(280), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    stage: Mapped[ProjectStage] = mapped_column(
        Enum(ProjectStage), default=ProjectStage.HYPOTHESIS, index=True,
    )
    needs_role: Mapped[str | None] = mapped_column(String(40), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    flagged_clinical: Mapped[bool] = mapped_column(Boolean, default=False)
    flagged_genetic: Mapped[bool] = mapped_column(Boolean, default=False)
    flagged_chem_synth: Mapped[bool] = mapped_column(Boolean, default=False)
    created_tick: Mapped[int] = mapped_column(Integer, default=0)
    updated_tick: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class ProjectContribution(Base):
    """One Minion's contribution to a project at a given stage."""

    __tablename__ = "project_contributions"
    __table_args__ = (Index("ix_proj_contrib", "project_id", "tick"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("research_projects.id"), nullable=False)
    minion_id: Mapped[str] = mapped_column(ForeignKey("minions.id"), nullable=False)
    stage: Mapped[ProjectStage] = mapped_column(Enum(ProjectStage), nullable=False)
    role: Mapped[SwarmRoleKind] = mapped_column(Enum(SwarmRoleKind), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="")
    delta_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=_now)


class PopulationSnapshot(Base):
    """One row per world per tick — used for dashboards + research replay."""

    __tablename__ = "population_snapshots"
    __table_args__ = (Index("ix_popsnap_world_tick", "world_id", "tick"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    world_id: Mapped[str] = mapped_column(ForeignKey("worlds.id"), nullable=False)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    alive: Mapped[int] = mapped_column(Integer, default=0)
    dead: Mapped[int] = mapped_column(Integer, default=0)
    births: Mapped[int] = mapped_column(Integer, default=0)
    deaths: Mapped[int] = mapped_column(Integer, default=0)
    forks: Mapped[int] = mapped_column(Integer, default=0)
    inventions_approved: Mapped[int] = mapped_column(Integer, default=0)
    generations: Mapped[int] = mapped_column(Integer, default=0)
    avg_age: Mapped[float] = mapped_column(Float, default=0.0)
    avg_reputation: Mapped[float] = mapped_column(Float, default=0.0)
    avg_sanity: Mapped[float] = mapped_column(Float, default=0.0)
    mood_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    guild_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    role_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    active_projects: Mapped[int] = mapped_column(Integer, default=0)
    approved_projects: Mapped[int] = mapped_column(Integer, default=0)
    # Doc I.70 — community's total accumulated knowledge (Σ skill levels +
    # approved inventions) and the count of domain masters (I.68-69).
    total_knowledge: Mapped[float] = mapped_column(Float, default=0.0)
    masters: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(default=_now)
