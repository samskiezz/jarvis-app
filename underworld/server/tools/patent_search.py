"""Real patent search using USPTO PatentsView v1 + a public-fallback path.

Doc reference: section III "App Integration & Patent Scanning Mechanics" plus
"Patent Engine" build tickets (line 5783).

PatentsView is the USPTO's official free API:
- https://search.patentsview.org/api/v1/patent/
- As of mid-2024 it requires a free API key in the X-Api-Key header.

When no key is set OR upstream fails, we fall back to a small, embedded
sample so the rest of the simulation still runs in development.

Every result is passed through `safety.check_cpc` before it leaves this module.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import get_settings
from . import safety


@dataclass(frozen=True)
class PatentRecord:
    id: str
    title: str
    abstract: str
    cpc_class: str | None
    grant_date: str | None
    expired: bool
    source: str
    raw: dict[str, Any]


# Tiny offline corpus so dev mode still surfaces results when no API key is set.
# All items are deliberately within the safe allow-list (mechanical, electrical,
# civil, computing, energy).
_OFFLINE_CORPUS: list[PatentRecord] = [
    PatentRecord(
        id="US3192570A",
        title="Self-bearing roller skate",
        abstract="A roller skate having ball-bearing wheels arranged so the skate can pivot freely about a vertical axis.",
        cpc_class="B62B",
        grant_date="1965-07-06",
        expired=True,
        source="offline",
        raw={},
    ),
    PatentRecord(
        id="US3056883A",
        title="Mechanical recording mechanism for telephone calls",
        abstract="Electromechanical apparatus for capturing telephone call duration on a paper tape using a stylus and clock-driven feed roller.",
        cpc_class="H04M",
        grant_date="1962-10-02",
        expired=True,
        source="offline",
        raw={},
    ),
    PatentRecord(
        id="US4344146A",
        title="Optical recording medium having a chalcogenide layer",
        abstract="An optical recording medium comprising a substrate, a reflective layer, and a recording layer of a chalcogenide glass.",
        cpc_class="G11B",
        grant_date="1982-08-10",
        expired=True,
        source="offline",
        raw={},
    ),
    PatentRecord(
        id="US4131973A",
        title="Suspended canopy",
        abstract="A retractable canopy assembly suspended from a building facade via tensioned cable trusses.",
        cpc_class="E04F",
        grant_date="1979-01-02",
        expired=True,
        source="offline",
        raw={},
    ),
    PatentRecord(
        id="US4055768A",
        title="Light-emitting diode display structure",
        abstract="A multi-character LED display with a printed-circuit substrate and a translucent overlay focusing emitted light.",
        cpc_class="H01L",
        grant_date="1977-10-25",
        expired=True,
        source="offline",
        raw={},
    ),
    PatentRecord(
        id="US3987387A",
        title="Method of separating solid particles from a fluid stream",
        abstract="A centrifugal separator using a tangential inlet and a fluid-bed collection chamber for high-throughput separation.",
        cpc_class="B01D",
        grant_date="1976-10-19",
        expired=True,
        source="offline",
        raw={},
    ),
]


def _is_expired(grant_date: str | None) -> bool:
    """US utility patents expire 20 years after the earliest priority date.

    We use the grant date as a conservative-enough approximation for v1.
    """
    if not grant_date or len(grant_date) < 4:
        return False
    try:
        year = int(grant_date[:4])
    except ValueError:
        return False
    return year <= 2003  # ~20 years before 2024; v1 doesn't need to be exact


def _to_record(item: dict[str, Any], source: str) -> PatentRecord | None:
    patent_id = item.get("patent_id") or item.get("patent_number") or item.get("id")
    if not patent_id:
        return None
    cpcs = item.get("cpc_current") or item.get("cpcs") or []
    cpc_class: str | None = None
    if cpcs and isinstance(cpcs, list):
        first = cpcs[0]
        if isinstance(first, dict):
            cpc_class = first.get("cpc_subclass_id") or first.get("cpc_subclass") or first.get("cpc_class")
        elif isinstance(first, str):
            cpc_class = first
    grant_date = item.get("patent_date") or item.get("grant_date")
    return PatentRecord(
        id=str(patent_id),
        title=item.get("patent_title") or item.get("title") or "",
        abstract=item.get("patent_abstract") or item.get("abstract") or "",
        cpc_class=cpc_class,
        grant_date=str(grant_date) if grant_date else None,
        expired=_is_expired(str(grant_date) if grant_date else None),
        source=source,
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


async def search(query: str, *, limit: int = 10, only_expired: bool = True) -> list[PatentRecord]:
    """Search PatentsView; gracefully fall back to the offline corpus.

    Returned records are always filtered through the safety gate.
    """
    settings = get_settings()
    limit = max(1, min(limit, 50))

    if not settings.patentsview_api_key:
        return _filter_safe([r for r in _OFFLINE_CORPUS if (not only_expired or r.expired)])[:limit]

    url = f"{settings.patentsview_base_url}/patent/"
    body = {
        "q": {"_text_phrase": {"patent_title": query}},
        "f": [
            "patent_id",
            "patent_title",
            "patent_abstract",
            "patent_date",
            "cpc_current.cpc_subclass_id",
        ],
        "o": {"size": limit},
        "s": [{"patent_date": "desc"}],
    }
    headers = {"X-Api-Key": settings.patentsview_api_key, "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, headers=headers, content=json.dumps(body))
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError):
        return _filter_safe([r for r in _OFFLINE_CORPUS if (not only_expired or r.expired)])[:limit]

    raw_items = data.get("patents") or data.get("results") or []
    records: list[PatentRecord] = []
    for item in raw_items:
        rec = _to_record(item, source="patentsview")
        if rec is None:
            continue
        if only_expired and not rec.expired:
            continue
        records.append(rec)
    return _filter_safe(records)[:limit]


__all__ = ["PatentRecord", "search"]
