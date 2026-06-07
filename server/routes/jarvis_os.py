"""JARVIS OS routes — the enterprise spine + governed AIP action layer HTTP surface.

Mounted under ``/v1/jarvis``:

  * GET  /architecture        — the 10-layer Palantir/Jarvis map with honest status.
  * GET  /audit               — tamper-evident audit log (hash-chained).
  * GET  /audit/verify        — recompute the chain to prove integrity.
  * GET  /metrics             — observability roll-up (latency p50/p95, cost, errors).
  * GET  /traces              — recent spans.
  * GET  /actions             — the governed action/tool registry.
  * POST /actions/execute     — run an action through the full AIP governance flow.
  * GET  /approvals           — pending/decided human-in-the-loop gates.
  * POST /approvals/{id}      — approve/deny a gate.
  * GET  /lineage             — provenance of produced objects.

Reads use ``optional_bearer``; executing actions / deciding approvals require a
bearer token. Services never raise.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_aip as aip
from ..services import jarvis_os as jos

try:
    from ..services import daddys_home as _greeting
except Exception:  # noqa: BLE001
    _greeting = None  # type: ignore[assignment]

try:
    from ..data import memory_store as _mem
except Exception:  # noqa: BLE001
    _mem = None  # type: ignore[assignment]

try:
    from ..services import persona_engine as _pe
except Exception:  # noqa: BLE001
    _pe = None  # type: ignore[assignment]

try:
    from ..services import proactive_loop as _pl
except Exception:  # noqa: BLE001
    _pl = None  # type: ignore[assignment]

router = APIRouter(prefix="/v1/jarvis", tags=["jarvis-os"])


class ExecuteBody(BaseModel):
    action: str = Field(..., description="Registered action name, e.g. 'knowledge.enrich'.")
    role: str = Field(default="viewer", description="Caller role for RBAC (viewer/analyst/operator/admin).")
    params: dict = Field(default_factory=dict, description="Action parameters.")
    actor: str = Field(default="api", description="Who is performing the action (for audit).")
    approval_id: str | None = Field(default=None, description="Approval id, once a gate is granted.")


class DecideBody(BaseModel):
    approve: bool = Field(..., description="True to approve, False to deny.")
    decided_by: str = Field(default="operator", description="Approver identity.")
    reason: str = Field(default="", description="Decision rationale (audited).")


class MemoryBody(BaseModel):
    key: str = Field(..., description="Memory key.")
    value: str = Field(..., description="Memory value.")
    importance: float = Field(default=0.5, ge=0.0, le=1.0, description="Importance score.")


class PersonaBody(BaseModel):
    persona: str = Field(..., description="Persona id to activate.")


class AckBody(BaseModel):
    notification_id: str = Field(..., description="Notification id to acknowledge.")


@router.get("/architecture")
async def get_architecture(_t: str | None = Depends(optional_bearer)):
    return jos.architecture()


@router.get("/audit")
async def get_audit(limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"entries": jos.audit_log(limit)}


@router.get("/audit/verify")
async def get_audit_verify(_t: str | None = Depends(optional_bearer)):
    return jos.verify_chain()


@router.get("/metrics")
async def get_metrics(_t: str | None = Depends(optional_bearer)):
    return jos.metrics()


@router.get("/traces")
async def get_traces(limit: int = 100, _t: str | None = Depends(optional_bearer)):
    return {"spans": jos.traces(limit)}


@router.get("/actions")
async def get_actions(_t: str | None = Depends(optional_bearer)):
    return {"actions": aip.registry()}


@router.post("/actions/execute")
async def post_execute(body: ExecuteBody, _t: str = Depends(require_bearer)):
    return aip.execute(body.action, role=body.role, params=body.params,
                       actor=body.actor, approval_id=body.approval_id)


@router.get("/approvals")
async def get_approvals(status: str | None = None, limit: int = 100,
                        _t: str | None = Depends(optional_bearer)):
    return {"approvals": jos.approvals(status, limit)}


@router.post("/approvals/{approval_id}")
async def post_decide(approval_id: str, body: DecideBody, _t: str = Depends(require_bearer)):
    return jos.decide(approval_id, body.approve, decided_by=body.decided_by, reason=body.reason)


@router.get("/lineage")
async def get_lineage(target: str | None = None, limit: int = 100,
                      _t: str | None = Depends(optional_bearer)):
    return {"lineage": aip.lineage(target, limit)}


# ── Proactive JARVIS + Personality cluster (additive only) ───────────────────

@router.get("/greeting")
async def get_greeting(user_id: str = "anonymous", _t: str | None = Depends(optional_bearer)):
    """Return the structured 'Daddy's Home' greeting."""
    if _greeting is None:
        return {"salutation": "Welcome back, sir.", "status_summary": "Systems online.",
                "health_alerts": [], "simulation_results": [], "pending_proposals": [],
                "wit": "At your service.", "persona": "default"}
    return await _greeting.generate_greeting(user_id)


@router.post("/memory")
async def post_memory(body: MemoryBody, user_id: str = "anonymous", _t: str | None = Depends(optional_bearer)):
    """Store a memory for a user."""
    if _mem is None:
        return {"ok": False, "error": "memory_store unavailable"}
    return await _mem.remember(user_id, body.key, body.value, body.importance)


@router.get("/memory")
async def get_memory(user_id: str = "anonymous", key: str | None = None, limit: int = 10,
                     _t: str | None = Depends(optional_bearer)):
    """Recall memories for a user."""
    if _mem is None:
        return {"memories": []}
    return {"memories": await _mem.recall(user_id, key, limit)}


@router.get("/persona")
async def get_persona(_t: str | None = Depends(optional_bearer)):
    """List available personas."""
    if _pe is None:
        return {"personas": [], "active": "default"}
    return {"personas": _pe.list_personas(), "active": None}


@router.post("/persona")
async def post_persona(body: PersonaBody, user_id: str = "anonymous", _t: str = Depends(require_bearer)):
    """Set the active persona for a user."""
    if _pe is None:
        return {"ok": False, "error": "persona_engine unavailable"}
    return _pe.set_active_persona(user_id, body.persona)


@router.get("/notifications")
async def get_notifications(user_id: str = "anonymous", acked: bool = False, limit: int = 50,
                            _t: str | None = Depends(optional_bearer)):
    """Proactive notification inbox."""
    if _pl is None:
        return {"notifications": []}
    return {"notifications": await _pl.list_notifications(user_id, acked=acked, limit=limit)}


@router.post("/notifications/ack")
async def post_notifications_ack(body: AckBody, _t: str | None = Depends(optional_bearer)):
    """Acknowledge a notification."""
    if _pl is None:
        return {"ok": False, "error": "proactive_loop unavailable"}
    return await _pl.ack_notification(body.notification_id)
