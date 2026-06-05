"""JARVIS POLICY routes — ABAC/PBAC Policy Decision Point HTTP surface.

Mounted under ``/v1/jarvis/policy``:

  * GET  /summary            — levels + subject/label counts.
  * POST /subjects           — set a subject's clearance / compartments / purposes.
  * GET  /subjects/{id}      — read a subject.
  * POST /classify           — label an object or property with a classification.
  * POST /decide             — runtime access decision (the PDP).
  * GET  /view/{object_id}   — policy-filtered object view (property redaction).

Mutating endpoints require a bearer token; reads use optional bearer. Never raise.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_policy as pol

router = APIRouter(prefix="/v1/jarvis/policy", tags=["jarvis-policy"])


class SubjectBody(BaseModel):
    id: str
    clearance: str = "UNCLASSIFIED"
    compartments: list[str] = Field(default_factory=list)
    purposes: list[str] = Field(default_factory=list)


class ClassifyBody(BaseModel):
    resource_id: str
    prop: str = ""
    level: str = "OFFICIAL"
    compartment: str = ""
    purpose: str = ""


class DecideBody(BaseModel):
    subject_id: str
    action: str = "read"
    resource_id: str
    prop: str = ""
    purpose: str = ""


@router.get("/summary")
async def get_summary(_t: str | None = Depends(optional_bearer)):
    return pol.summary()


@router.post("/subjects")
async def post_subject(body: SubjectBody, _t: str = Depends(require_bearer)):
    return pol.set_subject(body.id, clearance=body.clearance,
                           compartments=body.compartments, purposes=body.purposes)


@router.get("/subjects/{subject_id}")
async def get_subject(subject_id: str, _t: str | None = Depends(optional_bearer)):
    return pol.get_subject(subject_id)


@router.post("/classify")
async def post_classify(body: ClassifyBody, _t: str = Depends(require_bearer)):
    return pol.classify(body.resource_id, prop=body.prop, level=body.level,
                        compartment=body.compartment, purpose=body.purpose)


@router.post("/decide")
async def post_decide(body: DecideBody, _t: str = Depends(require_bearer)):
    return pol.decide(body.subject_id, body.action, body.resource_id,
                      prop=body.prop, purpose=body.purpose)


@router.get("/view/{object_id}")
async def get_view(object_id: str, subject_id: str, purpose: str = "",
                   _t: str | None = Depends(optional_bearer)):
    return pol.view_object(subject_id, object_id, purpose=purpose)
