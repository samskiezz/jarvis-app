"""JARVIS PAGE DATA — serves live topic-mapped data for every app page."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import optional_bearer
from ..services import live_api_hub as hub
from ..services import topic_engine as te

router = APIRouter(prefix="/v1/jarvis/page-data", tags=["jarvis-page-data"])


@router.get("/summary")
async def page_data_summary(_t: str | None = Depends(optional_bearer)):
    """Summary of how many topics map to each page."""
    return te.page_summary()


@router.get("/{page_name}")
async def page_data(page_name: str, limit: int = 100, _t: str | None = Depends(optional_bearer)):
    """Live data for a specific page (measurements, events, documents, topics)."""
    return hub.get_page_data(page_name, limit=limit)


@router.post("/fetch-live")
async def fetch_live_data(
    cities_limit: int = 50,
    weather: bool = True,
    air_quality: bool = True,
    marine: bool = True,
    earthquakes: bool = True,
    nws_alerts: bool = True,
    flights: bool = True,
    crypto: bool = True,
    _t: str | None = Depends(optional_bearer),
):
    """Trigger a live data fetch from all APIs. Returns summary."""
    return hub.fetch_all_live_data(
        cities_limit=cities_limit,
        weather=weather,
        air_quality=air_quality,
        marine=marine,
        earthquakes=earthquakes,
        nws_alerts=nws_alerts,
        flights=flights,
        crypto=crypto,
    )


@router.post("/ingest-topics")
async def ingest_topics(_t: str | None = Depends(optional_bearer)):
    """Ingest all 7000 scraper-sheet topics into brain.db."""
    return te.ingest_all_actions()


@router.post("/link-topics")
async def link_topics(_t: str | None = Depends(optional_bearer)):
    """Link all topics to their mapped pages."""
    return te.link_topics_to_pages()
