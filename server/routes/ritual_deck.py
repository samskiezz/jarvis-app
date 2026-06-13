"""RITUAL DECK routes — repeatable routine launcher.

Mounted under ``/v1/ritual``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import optional_bearer, require_bearer
from ..services import ritual_deck as rd

router = APIRouter(prefix="/v1/ritual", tags=["ritual-deck"])


class Step(BaseModel):
    label: str = Field(..., min_length=1)
    action: str = ""
    destructive: bool = False


class RoutineBody(BaseModel):
    id: str | None = None
    name: str = Field(..., min_length=1)
    steps: list[Step] = Field(default_factory=list)


class StartBody(BaseModel):
    safe: bool = True


class AdvanceBody(BaseModel):
    action: str = "next"  # next, skip, stop


@router.get("/list")
async def ritual_list(_token: str | None = Depends(optional_bearer)):
    return {"items": rd.list_routines()}


@router.get("/status/{run_id}")
async def ritual_status(run_id: str, _token: str | None = Depends(optional_bearer)):
    result = rd.run_status(run_id)
    if not result.get("ok"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=result.get("error", "run not found"))
    return result


@router.post("/pause/{run_id}")
async def ritual_pause(run_id: str, _token: str = Depends(require_bearer)):
    result = rd.pause_run(run_id)
    if not result.get("ok"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=result.get("error", "run not found"))
    return result


@router.get("/{routine_id}")
async def ritual_get(routine_id: str, _token: str | None = Depends(optional_bearer)):
    r = rd.get_routine(routine_id)
    if r is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="routine not found")
    return {"routine": r}


@router.post("/save")
async def ritual_save(body: RoutineBody, _token: str = Depends(require_bearer)):
    steps = [s.model_dump() for s in body.steps]
    return rd.save_routine({"id": body.id, "name": body.name, "steps": steps})


@router.delete("/{routine_id}")
async def ritual_delete(routine_id: str, _token: str = Depends(require_bearer)):
    return rd.delete_routine(routine_id)


@router.post("/{routine_id}/start")
async def ritual_start(routine_id: str, body: StartBody, _token: str = Depends(require_bearer)):
    return rd.start_run(routine_id, safe=body.safe)


@router.post("/run/{run_id}/advance")
async def ritual_advance(run_id: str, body: AdvanceBody, _token: str = Depends(require_bearer)):
    return rd.advance_run(run_id, body.action)
