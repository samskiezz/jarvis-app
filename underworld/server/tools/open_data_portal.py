"""USPTO Open Data Portal adapter — the post-PatentsView patent source.

Doc reference: master spec system #4 "Patent Intelligence Engine — USPTO Open
Data Portal (post-2026-03-20)". The USPTO is migrating its patent search APIs
from PatentsView to the Open Data Portal (ODP) on 2026-03-20; this adapter
targets ODP while preserving the exact contract of `patent_search.search`.

It deliberately mirrors `patent_search.py`:
- same async ``search(query, *, limit, only_expired)`` signature,
- the same offline-fallback behaviour (return the embedded sample when no API
  key is configured OR upstream fails),
- the same safety filtering (every record passes through `safety.check_cpc` /
  `safety.check_text` before leaving the module),
- and it REUSES `PatentRecord` from `patent_search` rather than redefining it,
  so downstream code (patent_intelligence, the knowledge graph) is identical
  regardless of which source produced the record.

Self-contained and resilient: any network/parse error degrades to the offline
corpus instead of raising. The base URL is configurable (settings, then env,
then the documented default) so a deployment can repoint it post-migration.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from ..config import get_settings
from . import safety
from .patent_search import PatentRecord, _is_expired


# Documented default ODP host. Overridable via settings.open_data_portal_base_url
# or the OPEN_DATA_PORTAL_BASE_URL env var so a deployment can repoint it.
_DEFAULT_BASE_URL = "https://data.uspto.gov/api/v1"


# Small embedded sample, kept inside the safe allow-list (B/E/F/G/H), so dev
# mode still surfaces results without an API key. Sourced from the same
# expired-patent universe as patent_search's offline corpus, tagged distinctly.
_OFFLINE_SAMPLE: list[PatentRecord] = [
    PatentRecord(
        id="US4314693A",
        title="Direct current motor with non-superimposed armature windings",
        abstract="A direct current motor employing armature windings arranged to reduce torque ripple and improve efficiency at low speed.",
        cpc_class="H02K",
        grant_date="1982-02-09",
        expired=True,
        source="open_data_portal_offline",
        raw={},
    ),
    PatentRecord(
        id="US4099118A",
        title="Electronic distance measuring instrument",
        abstract="An instrument measuring distance by phase comparison of a modulated optical beam reflected from a remote target.",
        cpc_class="G01C",
        grant_date="1978-07-04",
        expired=True,
        source="open_data_portal_offline",
        raw={},
    ),
    PatentRecord(
        id="US3990047A",
        title="Hydraulic pump control system",
        abstract="A control system regulating the displacement of a variable hydraulic pump in response to sensed load pressure.",
        cpc_class="F04B",
        grant_date="1976-11-02",
        expired=True,
        source="open_data_portal_offline",
        raw={},
    ),
    PatentRecord(
        id="US4203153A",
        title="Stepper motor drive circuit",
        abstract="A drive circuit energising the phase windings of a stepper motor in a controlled sequence for precise angular positioning.",
        cpc_class="H02P",
        grant_date="1980-05-13",
        expired=True,
        source="open_data_portal_offline",
        raw={},
    ),
]


def _base_url() -> str:
    settings = get_settings()
    return (
        getattr(settings, "open_data_portal_base_url", None)
        or os.environ.get("OPEN_DATA_PORTAL_BASE_URL")
        or _DEFAULT_BASE_URL
    )


def _api_key() -> str:
    settings = get_settings()
    # Prefer a dedicated ODP key; fall back to the PatentsView key during the
    # migration window, then to the env var.
    return (
        getattr(settings, "open_data_portal_api_key", "")
        or getattr(settings, "patentsview_api_key", "")
        or os.environ.get("OPEN_DATA_PORTAL_API_KEY", "")
    )


def _to_record(item: dict[str, Any]) -> PatentRecord | None:
    """Map one ODP result object into a PatentRecord.

    ODP field names differ from PatentsView; we read several aliases so the
    adapter survives minor schema drift around the 2026-03-20 migration.
    """
    patent_id = (
        item.get("patentNumber")
        or item.get("patent_number")
        or item.get("patentId")
        or item.get("id")
    )
    if not patent_id:
        return None

    cpc_class: str | None = None
    cpcs = item.get("cpcClasses") or item.get("cpc_current") or item.get("cpcs") or []
    if isinstance(cpcs, list) and cpcs:
        first = cpcs[0]
        if isinstance(first, dict):
            cpc_class = (
                first.get("cpcSubclass")
                or first.get("cpc_subclass_id")
                or first.get("subclass")
            )
        elif isinstance(first, str):
            cpc_class = first
    elif isinstance(cpcs, str):
        cpc_class = cpcs

    grant_date = item.get("grantDate") or item.get("patent_date") or item.get("grant_date")
    grant_date = str(grant_date) if grant_date else None

    return PatentRecord(
        id=str(patent_id),
        title=item.get("inventionTitle") or item.get("patent_title") or item.get("title") or "",
        abstract=item.get("abstractText") or item.get("patent_abstract") or item.get("abstract") or "",
        cpc_class=cpc_class,
        grant_date=grant_date,
        expired=_is_expired(grant_date),
        source="open_data_portal",
        raw=item,
    )


def _filter_safe(records: list[PatentRecord]) -> list[PatentRecord]:
    out: list[PatentRecord] = []
    for r in records:
        if safety.check_cpc(r.cpc_class).blocked:
            continue
        if safety.check_text(r.title + " " + r.abstract).blocked:
            continue
        out.append(r)
    return out


def _offline(limit: int, only_expired: bool) -> list[PatentRecord]:
    return _filter_safe(
        [r for r in _OFFLINE_SAMPLE if (not only_expired or r.expired)]
    )[:limit]


async def search(query: str, *, limit: int = 10, only_expired: bool = True) -> list[PatentRecord]:
    """Search the USPTO Open Data Portal; fall back to the offline sample.

    Mirrors `patent_search.search`: returns safety-filtered `PatentRecord`s,
    and degrades gracefully to the embedded offline sample when no API key is
    configured or the upstream call fails for any reason.
    """
    limit = max(1, min(limit, 50))

    api_key = _api_key()
    if not api_key:
        return _offline(limit, only_expired)

    url = f"{_base_url().rstrip('/')}/patent/search"
    params = {
        "q": query,
        "limit": limit,
        "sort": "grantDate desc",
    }
    headers = {"X-Api-Key": api_key, "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        return _offline(limit, only_expired)

    raw_items = (
        data.get("patents")
        or data.get("results")
        or data.get("patentBag")
        or []
    )
    if not isinstance(raw_items, list):
        return _offline(limit, only_expired)

    records: list[PatentRecord] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        rec = _to_record(item)
        if rec is None:
            continue
        if only_expired and not rec.expired:
            continue
        records.append(rec)

    safe = _filter_safe(records)[:limit]
    # If upstream returned nothing usable, still give the caller a working set.
    return safe or _offline(limit, only_expired)


__all__ = ["PatentRecord", "search"]
