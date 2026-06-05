"""JARVIS DOCUMENTS route — baseline reference-document ingestion."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..auth import require_bearer
from ..services import world_documents as wd

router = APIRouter(prefix="/v1/jarvis/documents", tags=["jarvis-documents"])

class IngestBody(BaseModel):
    limit: int = 20
    host: str | None = None

@router.post("/ingest-batch")
async def ingest_batch(body: IngestBody, _t: str = Depends(require_bearer)):
    return wd.ingest_batch(limit=body.limit, host=body.host)

class UrlBody(BaseModel):
    url: str
    subject_id: str = ""
    source_name: str = ""

@router.post("/ingest-url")
async def ingest_url(body: UrlBody, _t: str = Depends(require_bearer)):
    return wd.ingest_url(body.url, subject_id=body.subject_id, source_name=body.source_name)
