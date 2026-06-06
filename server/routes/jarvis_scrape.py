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
from ..services import scrape_engines as eng

router = APIRouter(prefix="/v1/jarvis/scrape", tags=["jarvis-scrape"])


class ScrapeRequest(BaseModel):
    engine: str = "auto"   # auto|scrapling|cloudscraper|sequential
    limit: int = 40
    workers: int = 16


@router.post("")
async def run_scrape(req: ScrapeRequest, _t: str = Depends(require_bearer)):
    engine = eng.best_content_engine() if req.engine == "auto" else req.engine
    if engine == "sequential":
        return scr.scrape_batch(limit=req.limit)
    if engine == "cloudscraper":
        return scr.cloudscraper_batch(limit=req.limit, workers=req.workers)
    return scr.scrapling_batch(limit=req.limit, workers=req.workers)


@router.get("/engines")
async def engines(_t: str | None = Depends(optional_bearer)):
    """Every scraping/recon engine in the bundle and whether it's installed here."""
    return eng.list_engines()


class DiscoverRequest(BaseModel):
    seed: str
    depth: int = 2
    max_urls: int = 200


@router.post("/discover")
async def discover(req: DiscoverRequest, _t: str = Depends(require_bearer)):
    """Katana link discovery (read-only crawl) from a seed URL."""
    return eng.katana_discover(req.seed, depth=req.depth, max_urls=req.max_urls)


class ReconRequest(BaseModel):
    tool: str                 # katana | ffuf | kiterunner
    target: str
    authorized: bool = False  # must be true AND target on RECON_ALLOWLIST
    extra: list[str] | None = None


@router.post("/recon")
async def recon(req: ReconRequest, _t: str = Depends(require_bearer)):
    """Governed recon/fuzz against an authorised, allow-listed target (your assets)."""
    return eng.run_recon(req.tool, req.target, authorized=req.authorized, extra=req.extra)


class FindRequest(BaseModel):
    seeds_limit: int = 8
    depth: int = 1
    per_seed_max: int = 25
    workers: int = 16


@router.post("/find")
async def find_documents(req: FindRequest, _t: str = Depends(require_bearer)):
    """THE DOCUMENT FINDER: katana discovers deeper document URLs from catalogue
    sources, then fetches + stores them as real Documents with provenance."""
    return scr.document_finder(seeds_limit=req.seeds_limit, depth=req.depth,
                               per_seed_max=req.per_seed_max, workers=req.workers)


@router.get("/document/{doc_id}")
async def get_document(doc_id: str, _t: str | None = Depends(optional_bearer)):
    """Full stored content + provenance of a fetched document."""
    from ..services import document_store as ds
    d = ds.get(doc_id)
    return d or {"error": "not found", "id": doc_id}


@router.get("/search")
async def search_documents(q: str, k: int = 10, _t: str | None = Depends(optional_bearer)):
    """Full-text (FTS5) search over everything that's been scraped + stored."""
    from ..services import document_store as ds
    return {"query": q, "results": ds.search(q, k)}


@router.post("/snapshot")
async def snapshot(_t: str = Depends(require_bearer)):
    """Gzip the document store to documents.db.gz so it survives an ephemeral container."""
    from ..services import document_store as ds
    return ds.snapshot()


@router.get("/status")
async def scrape_status(_t: str | None = Depends(optional_bearer)):
    from ..services import document_store as ds
    return {"scraped_documents": scr.scraped_count(),
            "stored_full_text": ds.stats(),
            "pending_targets": len(scr.all_targets(skip_fetched=True)),
            "seed_progress": scr.seeds_progress(),
            "best_engine": eng.best_content_engine()}
