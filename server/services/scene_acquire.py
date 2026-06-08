"""Self-healing data acquisition — the non-negotiable rule.

When a cinematic scene anchor has no data, the backend must NOT show a dead
placeholder. It goes back to the scraper/research subsystem, fetches REAL data
from the web or documents, persists it (so it becomes permanent + queryable),
and returns it. This module is the bounded, non-blocking dispatcher.

Flow:
  acquire(key, topic) ->
    - if a fresh result is cached  -> {"status":"acquired", data}
    - if a job is already running  -> {"status":"acquiring"}
    - else submit a background job -> {"status":"acquiring"}  (real scrape kicks off)

The background job calls the real acquisition functions (verified APIs):
  - brain_research.research(topic)  : multi-source public web (Wikipedia, arXiv,
    Crossref, HackerNews, DuckDuckGo) — no API key, no LLM required.
  - brain_research.ingest(url)      : fetch + persist a finding into brain.db
    (note + ont_object + vector index), so future hydrations read it as real data.

Bounded: a small thread pool; results cached with a TTL. Never raises into the
request path.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

_POOL = ThreadPoolExecutor(max_workers=3, thread_name_prefix="scene-acquire")
_LOCK = threading.Lock()
_RESULTS: dict[str, dict] = {}   # key -> {"data": ..., "ts": float}
_JOBS: dict[str, float] = {}     # key -> started_ts
_TTL = 1800.0                    # 30-minute cache before a topic is re-scraped


def _now() -> float:
    return time.time()


def _run(key: str, topic: str, kind: str) -> None:
    data: dict
    try:
        from . import brain_research as br  # noqa: PLC0415

        if kind == "ingest_url":
            data = br.ingest(topic)
        else:
            res = br.research(topic) or {}
            findings = res.get("findings") or []
            persisted = 0
            for f in findings[:2]:
                url = f.get("url")
                if url:
                    try:
                        br.ingest(url, title=f.get("title"))
                        persisted += 1
                    except Exception:  # noqa: BLE001
                        pass
            data = {
                "topic": topic,
                "findings": findings[:8],
                "sources_tried": res.get("sources_tried"),
                "persisted": persisted,
                "fetched_ts": res.get("fetched_ts"),
            }
    except Exception as e:  # noqa: BLE001 — acquisition failure is reported, not faked
        data = {"topic": topic, "error": str(e)}
    with _LOCK:
        _RESULTS[key] = {"data": data, "ts": _now()}
        _JOBS.pop(key, None)


def acquire(key: str, topic: str, kind: str = "research") -> dict:
    """Return acquired data if ready, else kick a background scrape/research and
    report ``acquiring``. Never returns a dead placeholder."""
    with _LOCK:
        hit = _RESULTS.get(key)
        if hit and (_now() - hit["ts"] < _TTL):
            return {"status": "acquired", "source": "scraper", "topic": topic, "data": hit["data"]}
        if key in _JOBS:
            return {"status": "acquiring", "source": "scraper", "topic": topic, "since": _JOBS[key]}
        _JOBS[key] = _now()
    _POOL.submit(_run, key, topic, kind)
    return {"status": "acquiring", "source": "scraper", "topic": topic, "since": _now()}


def status(key: str | None = None) -> dict:
    with _LOCK:
        if key is not None:
            if key in _RESULTS:
                return {"state": "ready", "ts": _RESULTS[key]["ts"]}
            if key in _JOBS:
                return {"state": "acquiring", "since": _JOBS[key]}
            return {"state": "idle"}
        return {"jobs": dict(_JOBS), "ready": sorted(_RESULTS.keys()), "ttl_s": _TTL}
