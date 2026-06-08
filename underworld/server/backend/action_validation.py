"""Action Validation Layer — Layer 40 architecture.

Formalised action proposal, validation, consequence logging, and illegal
action rejection. No direct world mutation without validation.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class ActionKind(str, enum.Enum):
    MOVE = "move"
    EAT = "eat"
    DRINK = "drink"
    REST = "rest"
    SEARCH_PATENTS = "search_patents"
    PROPOSE_INVENTION = "propose_invention"
    STUDY = "study"
    TEACH = "teach"
    SOCIALISE = "socialise"
    SEEK_PARTNER = "seek_partner"
    FORK_SELF = "fork_self"
    MEDITATE = "meditate"
    ATTACK = "attack"
    STEAL = "steal"
    BUILD = "build"
    RITUAL = "ritual"
    PRAY = "pray"
    EXPERIMENT = "experiment"
    COMMUNICATE = "communicate"


class ValidatorResult(str, enum.Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    DEFERRED = "deferred"


@dataclass
class ActionProposal:
    actor_id: str
    action: ActionKind
    preconditions: dict[str, Any] = field(default_factory=dict)
    risk_score: float = 0.0
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ActionValidation:
    proposal: ActionProposal
    result: ValidatorResult
    failure_reason: str | None = None
    consequence: dict[str, Any] = field(default_factory=dict)
    validator_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "actor_id": self.proposal.actor_id,
            "action": self.proposal.action.value,
            "preconditions": dict(self.proposal.preconditions),
            "risk_score": self.proposal.risk_score,
            "result": self.result.value,
            "failure_reason": self.failure_reason,
            "consequence": dict(self.consequence),
            "validator_id": self.validator_id,
        }


class ActionValidator:
    """Deterministic action validator with configurable rule set."""

    def __init__(self, strict_mode: bool = False) -> None:
        self.strict_mode = strict_mode
        self._log: list[ActionValidation] = []
        self._max_log = 50_000

    def validate(
        self,
        proposal: ActionProposal,
        *,
        body_state: dict[str, float] | None = None,
        world_state: dict[str, Any] | None = None,
        validator_id: str | None = None,
    ) -> ActionValidation:
        """Validate an action proposal against preconditions and world state."""
        failure_reason: str | None = None

        # --- precondition checks ---
        if proposal.action == ActionKind.EAT:
            if body_state and body_state.get("hunger", 1.0) > 0.95:
                failure_reason = "not_hungry"
        elif proposal.action == ActionKind.DRINK:
            if body_state and body_state.get("thirst", 1.0) > 0.95:
                failure_reason = "not_thirsty"
        elif proposal.action == ActionKind.REST:
            if body_state and body_state.get("fatigue", 1.0) > 0.95:
                failure_reason = "not_tired"
        elif proposal.action == ActionKind.ATTACK:
            if proposal.risk_score > 0.8 and self.strict_mode:
                failure_reason = "risk_too_high"
        elif proposal.action == ActionKind.FORK_SELF:
            if world_state and world_state.get("population", 0) >= world_state.get("population_cap", 9999):
                failure_reason = "population_cap_reached"
        elif proposal.action == ActionKind.SEEK_PARTNER:
            if body_state and body_state.get("fatigue", 1.0) < 0.3:
                failure_reason = "too_exhausted"

        # --- result ---
        if failure_reason:
            result = ActionValidation(
                proposal=proposal,
                result=ValidatorResult.REJECTED,
                failure_reason=failure_reason,
                validator_id=validator_id,
            )
        else:
            consequence = self._compute_consequence(proposal, body_state, world_state)
            result = ActionValidation(
                proposal=proposal,
                result=ValidatorResult.APPROVED,
                consequence=consequence,
                validator_id=validator_id,
            )

        self._append(result)
        return result

    def _compute_consequence(
        self,
        proposal: ActionProposal,
        body_state: dict[str, float] | None,
        world_state: dict[str, Any] | None,
    ) -> dict[str, Any]:
        cons: dict[str, Any] = {"action": proposal.action.value}
        if proposal.action in (ActionKind.EAT, ActionKind.DRINK, ActionKind.REST):
            cons["needs_change"] = "positive"
        elif proposal.action == ActionKind.ATTACK:
            cons["needs_change"] = "negative"
            cons["social_impact"] = "hostile"
        elif proposal.action == ActionKind.TEACH:
            cons["social_impact"] = "benevolent"
            cons["knowledge_spread"] = True
        elif proposal.action == ActionKind.RITUAL:
            cons["cultural_impact"] = "ritual"
        return cons

    def _append(self, rec: ActionValidation) -> None:
        if len(self._log) >= self._max_log:
            self._log.pop(0)
        self._log.append(rec)

    def recent(self, n: int = 10) -> list[ActionValidation]:
        return self._log[-n:]

    def by_actor(self, actor_id: str) -> list[ActionValidation]:
        return [v for v in self._log if v.proposal.actor_id == actor_id]

    def illegal_actions(self) -> list[ActionValidation]:
        return [v for v in self._log if v.result == ValidatorResult.REJECTED]

    def clear(self) -> None:
        self._log.clear()
