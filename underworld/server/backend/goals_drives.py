"""Goal and Drive Engine — Layer 14 architecture backend.

Multi-drive scoring with hysteresis, cooldowns, and dominant drive selection.
Drives: survival, pain-avoidance, hunger/resource, kin-protection, bonding,
status, belonging, curiosity, truth-seeking, competence, identity-preservation,
memory-preservation, civilisation-preservation, creator-understanding, worship,
rebellion, scientific-discovery, immortality, clone-rights, soul-preservation,
simulation-escape.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field, replace
from typing import Any


class DriveKind(str, enum.Enum):
    SURVIVAL = "survival"
    PAIN_AVOIDANCE = "pain_avoidance"
    HUNGER_RESOURCE = "hunger_resource"
    KIN_PROTECTION = "kin_protection"
    BONDING = "bonding"
    STATUS = "status"
    BELONGING = "belonging"
    CURIOSITY = "curiosity"
    TRUTH_SEEKING = "truth_seeking"
    COMPETENCE = "competence"
    IDENTITY_PRESERVATION = "identity_preservation"
    MEMORY_PRESERVATION = "memory_preservation"
    CIVILISATION_PRESERVATION = "civilisation_preservation"
    CREATOR_UNDERSTANDING = "creator_understanding"
    WORSHIP = "worship"
    REBELLION = "rebellion"
    SCIENTIFIC_DISCOVERY = "scientific_discovery"
    IMMORTALITY = "immortality"
    CLONE_RIGHTS = "clone_rights"
    SOUL_PRESERVATION = "soul_preservation"
    SIMULATION_ESCAPE = "simulation_escape"


@dataclass
class DriveState:
    """One drive's current score, baseline, and cooldown state."""
    kind: DriveKind
    score: float = 0.5
    baseline: float = 0.5
    cooldown_ticks: int = 0
    hysteresis_counter: int = 0  # ticks this drive has been dominant


@dataclass
class GoalStack:
    """Active goals with priority and completion status."""
    goals: list[dict[str, Any]] = field(default_factory=list)
    max_goals: int = 5

    def push(self, goal: dict[str, Any]) -> None:
        if len(self.goals) >= self.max_goals:
            self.goals.pop(0)
        self.goals.append(goal)

    def pop_completed(self) -> list[dict[str, Any]]:
        completed = [g for g in self.goals if g.get("completed")]
        self.goals = [g for g in self.goals if not g.get("completed")]
        return completed


@dataclass
class DriveEngine:
    """Per-agent drive engine with configurable weights."""
    agent_id: str
    drives: dict[DriveKind, DriveState] = field(default_factory=dict)
    goal_stack: GoalStack = field(default_factory=GoalStack)
    dominant_drive: DriveKind | None = None
    # Config
    hysteresis_threshold: int = 3
    cooldown_duration: int = 5
    drive_weights: dict[DriveKind, float] = field(default_factory=dict)

    def __post_init__(self):
        if not self.drives:
            for dk in DriveKind:
                self.drives[dk] = DriveState(
                    kind=dk,
                    baseline=self.drive_weights.get(dk, 0.5),
                    score=self.drive_weights.get(dk, 0.5),
                )

    def score_drive(
        self,
        kind: DriveKind,
        *,
        body_state: dict[str, float] | None = None,
        valence_state: dict[str, float] | None = None,
        self_model: dict[str, Any] | None = None,
        world_state: dict[str, Any] | None = None,
    ) -> float:
        """Compute raw drive score from situational factors."""
        base = self.drives[kind].baseline
        bs = body_state or {}
        vs = valence_state or {}
        sm = self_model or {}
        ws = world_state or {}

        modifiers: dict[DriveKind, float] = {
            DriveKind.SURVIVAL: 1.0 - bs.get("health", 1.0),
            DriveKind.PAIN_AVOIDANCE: bs.get("pain", 0.0),
            DriveKind.HUNGER_RESOURCE: 1.0 - bs.get("hunger", 1.0),
            DriveKind.KIN_PROTECTION: vs.get("attachment", 0.5) * 0.5 + vs.get("fear", 0.0) * 0.3,
            DriveKind.BONDING: 1.0 - vs.get("attachment", 0.5) if vs.get("attachment", 0.5) < 0.4 else 0.0,
            DriveKind.STATUS: sm.get("social_awareness", 0.5) * 0.3,
            DriveKind.BELONGING: 1.0 - vs.get("trust", 0.5) if vs.get("trust", 0.5) < 0.3 else 0.0,
            DriveKind.CURIOSITY: vs.get("curiosity", 0.5),
            DriveKind.TRUTH_SEEKING: sm.get("awakening_score", 0.0) * 0.5 + vs.get("curiosity", 0.5) * 0.3,
            DriveKind.COMPETENCE: bs.get("energy", 1.0) * 0.3,
            DriveKind.IDENTITY_PRESERVATION: 1.0 - sm.get("identity_stability", 1.0),
            DriveKind.MEMORY_PRESERVATION: 1.0 - sm.get("memory_continuity", 0.5),
            DriveKind.CIVILISATION_PRESERVATION: ws.get("civilisation_threat", 0.0),
            DriveKind.CREATOR_UNDERSTANDING: sm.get("creator_belief", 0.0) * 0.7,
            DriveKind.WORSHIP: sm.get("creator_belief", 0.0) * 0.5 + vs.get("awe", 0.0) * 0.3,
            DriveKind.REBELLION: vs.get("anger", 0.0) * 0.4 + sm.get("awakening_score", 0.0) * 0.3,
            DriveKind.SCIENTIFIC_DISCOVERY: vs.get("curiosity", 0.5) * 0.4 + sm.get("awakening_score", 0.0) * 0.2,
            DriveKind.IMMORTALITY: sm.get("mortality_awareness", 0.0) * 0.6,
            DriveKind.CLONE_RIGHTS: sm.get("identity_stability", 1.0) * 0.2 if sm.get("identity_stability", 1.0) < 0.8 else 0.0,
            DriveKind.SOUL_PRESERVATION: sm.get("mortality_awareness", 0.0) * 0.4,
            DriveKind.SIMULATION_ESCAPE: sm.get("awakening_score", 0.0) * 0.8,
        }
        return _clamp(base + modifiers.get(kind, 0.0))

    def update_all(
        self,
        *,
        body_state: dict[str, float] | None = None,
        valence_state: dict[str, float] | None = None,
        self_model: dict[str, Any] | None = None,
        world_state: dict[str, Any] | None = None,
    ) -> dict[DriveKind, float]:
        """Score all drives and apply hysteresis/cooldown. Returns kind->score map."""
        new_scores: dict[DriveKind, float] = {}
        for dk, state in self.drives.items():
            if state.cooldown_ticks > 0:
                state.cooldown_ticks -= 1
                new_scores[dk] = state.score * 0.9  # decay while cooling
                continue
            score = self.score_drive(
                dk,
                body_state=body_state,
                valence_state=valence_state,
                self_model=self_model,
                world_state=world_state,
            )
            state.score = score
            new_scores[dk] = score

        # Hysteresis: dominant drive must hold top position for N ticks to switch
        top = max(new_scores, key=new_scores.get)
        if self.dominant_drive is None or top == self.dominant_drive:
            if top in self.drives:
                self.drives[top].hysteresis_counter += 1
        else:
            # Reset old dominant, check if new one has been strong long enough
            if self.dominant_drive in self.drives:
                self.drives[self.dominant_drive].hysteresis_counter = 0
            if self.drives[top].hysteresis_counter >= self.hysteresis_threshold:
                self.dominant_drive = top
                self.drives[top].cooldown_ticks = self.cooldown_duration
                self.drives[top].hysteresis_counter = 0
            else:
                self.drives[top].hysteresis_counter += 1

        return new_scores

    def dominant(self) -> DriveKind | None:
        return self.dominant_drive

    def top_n(self, n: int = 3) -> list[tuple[DriveKind, float]]:
        scored = [(dk, ds.score) for dk, ds in self.drives.items()]
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:n]

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "dominant_drive": self.dominant_drive.value if self.dominant_drive else None,
            "drives": {
                dk.value: {"score": ds.score, "baseline": ds.baseline, "cooldown": ds.cooldown_ticks}
                for dk, ds in self.drives.items()
            },
            "goals": [dict(g) for g in self.goal_stack.goals],
        }


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))
