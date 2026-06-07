"""AIP TOOL-USE + AI-ACTIONS + AGENT-WORKFLOWS routes (P9 #63/#64/#65).

Mounts the ``services.aip_tools`` surface ALONGSIDE the existing ``routes.aip``
router (which also uses prefix ``/v1/aip`` for ``/ask``, ``/predict``,
``/oracle``, ``/skill``). To avoid ANY path collision with those, this router
also uses prefix ``/v1/aip`` but only registers NEW subpaths that the existing
router does not define:

  * GET  /v1/aip/tools                      — tool catalog (#64), public read.
  * POST /v1/aip/call                       — dispatch a tool (#64), bearer.
  * GET  /v1/aip/proposals                  — list AI-proposed actions (#63), read.
  * POST /v1/aip/proposals                  — propose an action (#63), bearer.
  * POST /v1/aip/proposals/{id}/approve     — approve + execute (#63), bearer.
  * POST /v1/aip/proposals/{id}/reject      — reject (#63), bearer.
  * POST /v1/aip/plan/run                   — run an agent plan (#65), bearer.

These paths are disjoint from routes/aip.py, so mounting both is safe.

Mount in ``server/main.py`` with:

    from .routes import aip_tools as aip_tools_routes
    app.include_router(aip_tools_routes.router)

Every handler delegates to a service function that never raises, so these routes
do not 500 on ordinary input.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import aip_tools
from ..services import aip_logic as _aip_logic
from ..services import agent_studio as _agent_studio
from ..services import aip_evals as _aip_evals
from ..services import llm_router as _llm_router

router = APIRouter(prefix="/v1/aip", tags=["aip-tools"])


# ── request bodies ─────────────────────────────────────────────────────────────
class CallToolRequest(BaseModel):
    name: str
    params: Optional[dict[str, Any]] = None


class ProposeRequest(BaseModel):
    object_id: str
    action: str
    payload: Optional[dict[str, Any]] = None
    rationale: str = ""


class PlanRequest(BaseModel):
    steps: list[dict[str, Any]]
    actor: Optional[Any] = None  # str or {"id", "auto_approve"}


# ── #64 TOOL-USE ─────────────────────────────────────────────────────────────────
@router.get("/tools")
async def tools_route(_token: str | None = Depends(optional_bearer)):
    """Catalog of callable tools (ontology actions, science methods, search)."""
    return {"tools": aip_tools.list_tools()}


@router.post("/call")
async def call_route(req: CallToolRequest, token: str = Depends(require_bearer)):
    """Dispatch a tool to its real implementation. Returns ``{ok, result|error}``."""
    return aip_tools.call_tool(req.name, req.params, actor=token)


# ── #63 AI-PROPOSED GOVERNED ACTIONS ─────────────────────────────────────────────
@router.get("/proposals")
async def list_proposals_route(
    status: Optional[str] = Query(None, description="PENDING/APPROVED/REJECTED"),
    _token: str | None = Depends(optional_bearer),
):
    """List AI-proposed governed actions, newest first (optional status filter)."""
    return {"proposals": aip_tools.list_proposals(status)}


@router.post("/proposals")
async def propose_route(req: ProposeRequest, token: str = Depends(require_bearer)):
    """Persist a PENDING proposal WITHOUT mutating the ontology."""
    return aip_tools.propose_action(
        req.object_id, req.action, req.payload, req.rationale, actor=token
    )


@router.post("/proposals/{proposal_id}/approve")
async def approve_route(proposal_id: str, token: str = Depends(require_bearer)):
    """Approve + execute a pending proposal via the governed write-back path."""
    return aip_tools.approve_proposal(proposal_id, approver=token)


@router.post("/proposals/{proposal_id}/reject")
async def reject_route(proposal_id: str, token: str = Depends(require_bearer)):
    """Reject a pending proposal WITHOUT executing it."""
    return aip_tools.reject_proposal(proposal_id, approver=token)


# ── #65 AGENT WORKFLOWS ──────────────────────────────────────────────────────────
@router.post("/plan/run")
async def plan_run_route(req: PlanRequest, token: str = Depends(require_bearer)):
    """Run an agent plan: read tools execute live, write tools emit proposals
    (unless the actor carries the ``auto_approve`` capability)."""
    actor = req.actor if req.actor is not None else token
    return aip_tools.run_plan(req.steps, actor)


# ── AIP V2 — LLM Router + Workflow + Agent Studio + Evals ──────────────────────
class WorkflowCreateRequest(BaseModel):
    name: str = ""
    workflow_type: str = "research"
    steps: list[dict[str, Any]]
    inputs: Optional[dict[str, Any]] = None
    execute: bool = False


class WorkflowExecuteRequest(BaseModel):
    workflow_id: str
    inputs: Optional[dict[str, Any]] = None


class AgentStudioRequest(BaseModel):
    task: str
    agents: list[str]
    max_steps: int = 8


class EvalRequest(BaseModel):
    suite_id: Optional[str] = "default"
    name: str = ""
    prompt: str = ""
    system: str = ""
    expect: Optional[dict[str, Any]] = None
    model: str = "kimi"


@router.post("/workflow")
async def workflow_route(req: WorkflowCreateRequest, token: str = Depends(require_bearer)):
    """Create a workflow definition; optionally execute it immediately."""
    wf = _aip_logic.AIPWorkflow(name=req.name, workflow_type=req.workflow_type, steps=req.steps)
    created = _aip_logic.create_workflow(wf, actor=token)
    if not created.get("ok"):
        return created
    if req.execute:
        executed = await _aip_logic.execute_workflow(
            created["workflow_id"], inputs=req.inputs or {}, actor=token
        )
        return {"created": created, "executed": executed}
    return {"created": created}


@router.post("/agent-studio")
async def agent_studio_route(req: AgentStudioRequest, token: str = Depends(require_bearer)):
    """Run a multi-agent task via the conductor + specialist pattern."""
    return await _agent_studio.run_multi_agent(
        req.task, req.agents, max_steps=req.max_steps, actor=token
    )


@router.post("/eval")
async def eval_route(req: EvalRequest, token: str = Depends(require_bearer)):
    """Run a single eval test case. Persists the test case if it has no id."""
    case = {
        "suite_id": req.suite_id or "default",
        "name": req.name,
        "prompt": req.prompt,
        "system": req.system,
        "expect": req.expect or {},
    }
    # persist so benchmarks can reuse it
    persisted = _aip_evals.create_test_case(case, actor=token)
    if persisted.get("ok"):
        case["id"] = persisted["eval_id"]
    result = await _aip_evals.run_eval(case, req.model)
    return {"persisted": persisted, "result": result}


@router.get("/eval/benchmark")
async def eval_benchmark_route(
    suite_id: str = Query("default"),
    models: str = Query("kimi,openai,anthropic,ollama"),
    token: str = Depends(require_bearer),
):
    """Run a benchmark suite across models."""
    model_list = [m.strip() for m in models.split(",") if m.strip()]
    return await _aip_evals.benchmark(model_list, suite_id)


@router.get("/providers")
async def providers_route(_token: str | None = Depends(optional_bearer)):
    """List available LLM providers + health status."""
    providers = _llm_router.list_providers()
    return {"providers": providers}
