"""Pydantic schemas shared across routes."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from ..db.models import (
    CauseOfDeath,
    GuildKind,
    MoodKind,
    RelationshipKind,
    ReviewVerdict,
    TaskStatus,
)


class WorldOut(BaseModel):
    id: str
    name: str
    seed_class: str
    seed_value: int
    tick: int
    population_cap: int
    auto_advance: bool
    auto_advance_interval_s: float
    created_at: datetime
    minion_count: int = 0
    alive_count: int = 0


class WorldCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    cpc_class: str = Field(..., min_length=1, max_length=16)
    starting_population: int = Field(default=128, ge=10, le=300)
    population_cap: int = Field(default=400, ge=50, le=1000)


class WorldAutoAdvanceUpdate(BaseModel):
    auto_advance: bool
    interval_s: float | None = Field(default=None, ge=1.0, le=60.0)


class MinionOut(BaseModel):
    id: str
    world_id: str
    soul_id: str | None
    name: str
    surname: str
    guild: GuildKind
    generation: int
    parent_a_id: str | None
    parent_b_id: str | None
    forked_from_id: str | None
    openness: float
    conscientiousness: float
    extraversion: float
    agreeableness: float
    neuroticism: float
    intelligence: float
    creativity: float
    reputation: float
    karma: float
    born_tick: int
    died_tick: int | None
    cause_of_death: CauseOfDeath | None
    alive: bool
    hunger: float
    thirst: float
    fatigue: float
    sanity: float
    health: float
    mood: MoodKind
    stress: float
    skill_count: int = 0


class MinionListItem(BaseModel):
    """Slim payload for the population grid — keeps list endpoint cheap."""
    id: str
    name: str
    surname: str
    guild: GuildKind
    generation: int
    alive: bool
    reputation: float
    karma: float
    mood: MoodKind
    hunger: float
    fatigue: float
    sanity: float
    health: float
    born_tick: int
    died_tick: int | None
    age: int


class SkillOut(BaseModel):
    name: str
    level: float
    last_practiced_tick: int


class MemoryOut(BaseModel):
    id: str
    tick: int
    kind: str
    content: str
    importance: float


class RelationshipOut(BaseModel):
    id: str
    from_id: str
    to_id: str
    other_name: str
    kind: RelationshipKind
    strength: float
    formed_tick: int
    last_interaction_tick: int


class PatentOut(BaseModel):
    id: str
    title: str
    abstract: str
    cpc_class: str | None = None
    grant_date: str | None = None
    expired: bool
    source: str


class InventionOut(BaseModel):
    id: str
    world_id: str
    minion_id: str | None
    tick: int
    title: str
    problem: str
    hypothesis: str
    feasibility_score: float
    novelty_score: float
    safety_score: float
    status: TaskStatus
    related_patents: list[str]
    created_at: datetime


class PeerReviewOut(BaseModel):
    id: str
    invention_id: str
    reviewer_guild: GuildKind
    verdict: ReviewVerdict
    rationale: str
    created_at: datetime


class EventOut(BaseModel):
    id: str
    tick: int
    kind: str
    actor_id: str | None
    payload: dict[str, Any]
    created_at: datetime


class AdvanceRequest(BaseModel):
    ticks: int = Field(default=1, ge=1, le=100)


class AdvanceResponse(BaseModel):
    world_id: str
    final_tick: int
    reports: list[dict]


class PatentSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    limit: int = Field(default=10, ge=1, le=50)
    only_expired: bool = True


class PopulationSnapshotOut(BaseModel):
    tick: int
    alive: int
    dead: int
    births: int
    deaths: int
    forks: int
    inventions_approved: int
    generations: int
    avg_age: float
    avg_reputation: float
    avg_sanity: float
    mood_breakdown: dict[str, int]
    guild_breakdown: dict[str, int]


class PopulationStatsOut(BaseModel):
    world_id: str
    tick: int
    alive: int
    dead: int
    generations: int
    avg_age: float
    avg_reputation: float
    avg_sanity: float
    mood_breakdown: dict[str, int]
    guild_breakdown: dict[str, int]
    history: list[PopulationSnapshotOut]


class LineageNode(BaseModel):
    id: str
    name: str
    surname: str
    guild: GuildKind
    generation: int
    alive: bool
    born_tick: int
    died_tick: int | None
    parent_a_id: str | None
    parent_b_id: str | None
    forked_from_id: str | None


class LineageOut(BaseModel):
    root: str
    ancestors: list[LineageNode]
    descendants: list[LineageNode]
    siblings: list[LineageNode]
    forks: list[LineageNode]


class BreedRequest(BaseModel):
    parent_a_id: str
    parent_b_id: str


class ForkRequest(BaseModel):
    minion_id: str
