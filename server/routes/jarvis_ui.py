"""JARVIS UI routes — the self-building interface spec.

  * GET /v1/jarvis/ui/spec — windows/buttons/renders generated from LIVE ontology
    data; the frontend renders this dynamically so the UI grows as the data grows.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import optional_bearer
from ..services import jarvis_ui_builder as ui

router = APIRouter(prefix="/v1/jarvis/ui", tags=["jarvis-ui"])


@router.get("/spec")
async def spec(_t: str | None = Depends(optional_bearer)):
    return ui.spec()
