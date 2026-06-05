"""WORLD RUNTIME — scientific publications pipeline (one REAL vertical slice).

Mirrors the earthquake slice: connector -> parser (standard envelope) -> quality
gate -> ontology object + audit + lineage, against a fully-open, no-auth source
(Crossref `works` API). Crossref is an open scholarly metadata service; the public
REST API requires no key (a polite User-Agent with a mailto is requested), so this
is legally clear to actually run.

stdlib only. Live fetch is guarded; parser/gate/writer are pure + testable offline.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.request

try:
    from . import jarvis_ontology as ont
except Exception:  # noqa: BLE001
    ont = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from . import jarvis_aip as aip
except Exception:  # noqa: BLE001
    aip = None  # type: ignore

CROSSREF_FEED = "https://api.crossref.org/works?rows=50"
SOURCE_ID = "crossref.works"
USER_AGENT = "APEX-WorldRuntime/1.0 (mailto:ops@apex.local)"


# ── connector ────────────────────────────────────────────────────────────────
def fetch(url: str = CROSSREF_FEED, *, timeout: float = 12.0) -> dict | None:
    """Connector: pull the raw Crossref JSON. None on failure (never raises)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return None
            return json.loads(r.read().decode("utf-8", errors="ignore"))
    except Exception:  # noqa: BLE001
        return None


# ── parser: Crossref item -> standard envelope ───────────────────────────────
def parse_item(it: dict) -> dict:
    it = it or {}
    raw_hash = hashlib.sha256(json.dumps(it, sort_keys=True, default=str).encode()).hexdigest()
    doi = it.get("DOI", "") or ""
    title_list = it.get("title") or []
    title = title_list[0] if title_list else ""
    authors = "; ".join(
        f"{a.get('given', '')} {a.get('family', '')}".strip()
        for a in (it.get("author") or [])
    )
    date_parts = (((it.get("published") or {}).get("date-parts") or [[None]]))[0] or [None]
    year = str(date_parts[0]) if date_parts and date_parts[0] is not None else ""
    container = it.get("container-title") or []
    return {
        "source_id": SOURCE_ID,
        "record_id": doi,
        "record_type": "ScientificPublication",
        "observed_at": year,
        "valid_time": year,
        "location": {},
        "entities": [],
        "measurements": [],
        "relationships": [],
        "documents": [{"url": "https://doi.org/" + doi}] if doi else [],
        "quality": {},
        "provenance": {"source": SOURCE_ID, "feed": CROSSREF_FEED,
                       "fetched_ts": int(time.time() * 1000),
                       "type": it.get("type", ""),
                       "container": container[0] if container else ""},
        "raw_hash": raw_hash,
        "_title": title,
        "_authors": authors,
        "_year": year,
    }


# ── quality gate ─────────────────────────────────────────────────────────────
def quality_gate(env: dict) -> dict:
    """Return {pass, checks}. Requires a DOI (record_id) and a non-empty title."""
    checks = {}
    checks["has_record_id"] = bool(env.get("record_id"))
    checks["has_title"] = bool((env.get("_title") or "").strip())
    return {"pass": all(checks.values()), "checks": checks}


# ── writer: envelope -> ontology object + audit ──────────────────────────────
def _ensure_type() -> None:
    if ont is None:
        return
    try:
        ont.define_object_type("ScientificPublication",
                               {"title": "str", "authors": "str", "year": "str",
                                "doi": "str", "url": "str", "record_id": "str"},
                               states=["observed", "reviewed"], initial="observed")
    except Exception:  # noqa: BLE001
        pass


def run_pipeline(*, limit: int = 50, live: bool = True, raw: dict | None = None) -> dict:
    """Full slice: fetch -> parse -> gate -> write ontology object -> audit.
    ``raw`` lets tests inject a fixed Crossref response (no network)."""
    data = raw if raw is not None else (fetch() if live else None)
    items = ((data or {}).get("message") or {}).get("items")
    if not data or not isinstance(items, list):
        return {"status": "no_data", "ingested": 0, "rejected": 0}
    _ensure_type()
    ingested, rejected, samples = 0, 0, []
    for it in items[: max(1, int(limit))]:
        env = parse_item(it)
        gate = quality_gate(env)
        if not gate["pass"]:
            rejected += 1
            continue
        if ont is not None:
            try:
                obj = ont.create_object("ScientificPublication", {
                    "title": env["_title"], "authors": env["_authors"],
                    "year": env["_year"], "doi": env["record_id"],
                    "url": (env["documents"][0]["url"] if env["documents"] else ""),
                    "record_id": env["record_id"],
                }, role="analyst", actor="world-runtime")
                if obj.get("status") == "created":
                    ingested += 1
                    if aip is not None:
                        aip.record_lineage("world.ingest.publication", obj["id"],
                                           actor="world-runtime", derived_from=[env["record_id"]],
                                           meta={"source": SOURCE_ID, "raw_hash": env["raw_hash"]})
                    if len(samples) < 5:
                        samples.append({"title": env["_title"], "year": env["_year"], "id": obj["id"]})
            except Exception:  # noqa: BLE001
                rejected += 1
    if jos is not None:
        jos.audit("world.pipeline.publication", actor="world-runtime", target=SOURCE_ID,
                  meta={"ingested": ingested, "rejected": rejected})
    return {"status": "ok", "source": SOURCE_ID, "ingested": ingested,
            "rejected": rejected, "samples": samples}
