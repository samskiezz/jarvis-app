"""Ontology V2 Pydantic models — Actions Service, CDC Funnel, ObjectSets.

Purely additive; does not modify existing ontology.py models.
Used by :mod:`server.routes.ontology_ext` (V2 router) and the V2 services.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── ActionType ───────────────────────────────────────────────────────────────────
class ActionTypeDefinition(BaseModel):
    name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    submission_criteria: dict[str, Any] = Field(default_factory=dict)
    side_effects: list[dict[str, Any]] = Field(default_factory=list)
    required_clearance: Optional[str] = None


class ActionTypeOut(BaseModel):
    id: str
    name: str
    parameters: dict[str, Any]
    submission_criteria: dict[str, Any]
    side_effects: list[dict[str, Any]]
    required_clearance: Optional[str]
    created_ts: int


# ── ActionExecution ──────────────────────────────────────────────────────────────
class ActionSubmitIn(BaseModel):
    action_type_id: str
    params: dict[str, Any] = Field(default_factory=dict)


class ActionApproveIn(BaseModel):
    execution_id: str


class ActionExecutionOut(BaseModel):
    id: str
    action_type_id: str
    params: dict[str, Any]
    state: str
    actor: str
    approver: Optional[str]
    created_ts: int
    applied_ts: Optional[int]
    error: Optional[str]


# ── ObjectSet ────────────────────────────────────────────────────────────────────
class ObjectSetIn(BaseModel):
    name: str
    query: dict[str, Any] = Field(default_factory=dict)


class ObjectSetOut(BaseModel):
    id: str
    name: str
    query: dict[str, Any]
    created_ts: int


# ── Funnel / Sync ────────────────────────────────────────────────────────────────
class SyncTriggerIn(BaseModel):
    dataset_id: str
    object_type: str
    mapping: dict[str, str] = Field(default_factory=dict)
    direction: str = "dataset_to_objects"
    soft_delete: bool = True


class SyncStatusOut(BaseModel):
    dataset_id: str
    last_sync_ts: Optional[int]
    total_operations: int
    operations: dict[str, int]
    tracked_rows: int


# ── BulkAction ───────────────────────────────────────────────────────────────────
class BulkActionIn(BaseModel):
    object_set_id: Optional[str] = None
    action_type_id: str
    params: dict[str, Any] = Field(default_factory=dict)
    auto_approve: bool = False
