"""JARVIS SCRAPE routes — run the real crawlers, report fetched content.

  * POST /v1/jarvis/scrape  {engine?, limit?, workers?}  -> fetch real content
  * GET  /v1/jarvis/scrape/status                        -> scraped doc count

engine: 'scrapling' (default — concurrent, browser-TLS impersonation, beats blocks)
        or 'sequential' (the stdlib polite fetcher, no extra deps).
The big Scrapy crawler runs out-of-process via `python -m server.scrapers.run`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import optional_bearer, require_bearer
from ..services import jarvis_scrape as scr

router = APIRouter(prefix="/v1/jarvis/scrape", tags=["jarvis-scrape"])


class ScrapeRequest(BaseModel):
    engine: str = "scrapling"
    limit: int = 40
    workers: int = 16


@router.post("")
async def run_scrape(req: ScrapeRequest, _t: str = Depends(require_bearer)):
    if req.engine == "sequential":
        return scr.scrape_batch(limit=req.limit)
    return scr.scrapling_batch(limit=req.limit, workers=req.workers)


@router.get("/status")
async def scrape_status(_t: str | None = Depends(optional_bearer)):
    return {"scraped_documents": scr.scraped_count(),
            "pending_targets": len(scr.all_targets(skip_fetched=True))}
