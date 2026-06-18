"""Motor-intent predictor routes — gap-fix #3 (accessibility, no hardware).

Endpoints:

* ``POST /v1/motor/record``  — log a dock-app open (called by jarvis_live.html)
* ``GET  /v1/motor/predict`` — rank the next-most-likely dock apps
* ``GET  /v1/motor/stats``   — quick health snapshot for the UI
* ``POST /v1/motor/train``   — force a re-train (idempotent; respects the
  ≥accuracy gate)

Auth: uses the project-standard ``optional_bearer`` dependency. ``record`` is
intentionally public-writable by default (matching how the dock itself runs in
the browser); flip ``JARVIS_REQUIRE_AUTH=true`` to lock it.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..auth import optional_bearer
from ..services import motor_predictor as M

router = APIRouter(prefix="/v1/motor", tags=["motor"])


class RecordRequest(BaseModel):
    action_id: str = Field(..., min_length=1, max_length=64,
                           description="Dock-app id the user just opened.")
    ts: Optional[float] = Field(None, description="Optional unix-epoch ts; "
                                                  "defaults to server time.")


@router.post("/record")
def motor_record(req: RecordRequest, _auth: str | None = Depends(optional_bearer)):
    """Append a (action_id, ts) row to the action-history log."""
    return M.record(req.action_id, req.ts)


@router.get("/predict")
def motor_predict(
    recent: str = Query("", description="Comma-separated list of recent action ids, "
                                        "oldest -> newest."),
    top_k: int = Query(3, ge=1, le=10),
    _auth: str | None = Depends(optional_bearer),
):
    """Rank the next-most-likely actions; always returns a usable result."""
    recent_list = [s for s in (recent or "").split(",") if s.strip()]
    return M.predict_next(recent_list, top_k=top_k)


@router.get("/stats")
def motor_stats(_auth: str | None = Depends(optional_bearer)):
    """Health snapshot: event counts, model state, gating flag."""
    return M.stats()


@router.post("/train")
def motor_train(_auth: str | None = Depends(optional_bearer)):
    """Force a retrain (saves the model only if the accuracy bar is cleared)."""
    return M.train()
