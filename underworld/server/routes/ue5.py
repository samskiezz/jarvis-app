"""UE5 render-and-play routes.

Triggers the Higgsfield-to-UE5 automation pipeline:
- download completed Higgsfield media
- run the resumable UE5 build pipeline (GLB import, media import, level, package)
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_bearer
from ..services import ue5_generator

router = APIRouter(prefix="/worlds/{world_id}/ue5", tags=["ue5"])


class Ue5BuildRequest(BaseModel):
    media_only: bool = False
    skip_download: bool = False
    skip_package: bool = False
    chunk_size: int = 30


class Ue5BuildResponse(BaseModel):
    world_id: str
    started: bool
    media_only: bool
    skip_download: bool
    skip_package: bool
    status_file: str


@router.post("/build", response_model=Ue5BuildResponse, status_code=202)
async def build_ue5(
    world_id: str,
    body: Ue5BuildRequest,
    background_tasks: BackgroundTasks,
    _token: str = Depends(require_bearer),
):
    """Start the Higgsfield-to-UE5 build pipeline for this world.

    The actual work runs as a background task; poll the status file path returned
    in the response.  The pipeline is resumable, so re-triggering after a failure
    picks up where it left off.
    """
    # The pipeline is global (Underworld project), but we gate it behind a world
    # for auth/ownership consistency.
    status_file = ue5_generator.PIPELINE_SCRIPT.parent.parent / "Saved" / "ue5_pipeline_status.json"

    background_tasks.add_task(
        ue5_generator.sync_media_and_build,
        chunk_size=body.chunk_size,
        skip_download=body.skip_download,
        media_only=body.media_only,
        skip_package=body.skip_package,
    )

    return Ue5BuildResponse(
        world_id=world_id,
        started=True,
        media_only=body.media_only,
        skip_download=body.skip_download,
        skip_package=body.skip_package,
        status_file=str(status_file),
    )
