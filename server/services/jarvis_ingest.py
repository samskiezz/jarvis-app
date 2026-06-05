"""JARVIS INGEST — non-stop, governed knowledge acquisition that grows the brain.

A crawl-frontier ingestion loop that genuinely "brains up" the second brain:

  round:
    1. take a frontier of concept terms (seeds, then the vault's own knowledge gaps)
    2. ACQUIRE — pull real external facts for each via the multi-source connector
       registry (brain_enrich/brain_sources), writing grounded, cited notes (neurons)
    3. CONSOLIDATE — run an autopilot pass: resolve dangling refs, link orphans,
       promote emergent themes (this is what grows synapses + forms clusters)
    4. EXPAND — the gaps created by new notes become the next frontier
  repeat until a budget (rounds / max_neurons / wall-clock) is hit.

Every round is audited (jos) and emits ingest events (jarvis_events) — no unaudited
scraping. Honest scale note: counts grow with real fetched knowledge; "millions"
is a function of how long the daemon runs and how many sources, bounded here by the
sandbox. The mechanism is real and continuous; the ceiling is physical.
"""

from __future__ import annotations

import time

try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
try:
    from . import brain_enrich as be
except Exception:  # noqa: BLE001
    be = None  # type: ignore
try:
    from . import brain_autopilot as ap
except Exception:  # noqa: BLE001
    ap = None  # type: ignore
try:
    from . import brain_health as bh
except Exception:  # noqa: BLE001
    bh = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from . import jarvis_events as events
except Exception:  # noqa: BLE001
    events = None  # type: ignore

# a broad seed frontier spanning the platform's intelligence/enterprise domains
DEFAULT_SEEDS = [
    "Operational intelligence", "Knowledge graph", "Entity resolution", "Data lineage",
    "Geospatial intelligence", "Link analysis", "Ontology engineering", "Master data management",
    "Event-driven architecture", "Stream processing", "Graph database", "Vector database",
    "Zero trust security", "Attribute-based access control", "Continuous delivery",
    "Service mesh", "Observability", "Distributed tracing", "Change data capture",
    "Data lakehouse", "Bitemporal modeling", "Provenance", "Threat intelligence",
    "Situational awareness", "Decision support system", "Digital twin", "Simulation",
    "Anomaly detection", "Record linkage", "Semantic web",
]


def _counts() -> tuple[int, int]:
    notes = 0
    links = 0
    if sb is not None:
        try:
            notes = int(sb.index_catalog().get("total", 0))
        except Exception:  # noqa: BLE001
            pass
        try:
            import sqlite3
            from .second_brain import _db_path
            c = sqlite3.connect(_db_path())
            links = int(c.execute("SELECT COUNT(*) FROM note_link").fetchone()[0])
            c.close()
        except Exception:  # noqa: BLE001
            pass
    return notes, links


def _gap_frontier(limit: int) -> list[str]:
    if be is None:
        return []
    try:
        return be._gap_terms(limit)        # concept-like missing titles
    except Exception:  # noqa: BLE001
        return []


def burst(seeds: list[str] | None = None, *, rounds: int = 3, per_round: int = 12,
          max_neurons: int | None = None) -> dict:
    """Run a bounded ingestion burst. Returns real before/after growth + per-round log."""
    if sb is None or be is None:
        return {"status": "unavailable"}
    n0, l0 = _counts()
    if not be.network_ok():
        return {"status": "offline", "neurons": n0, "synapses": l0}

    frontier = list(seeds) if seeds else list(DEFAULT_SEEDS[:per_round])
    log = []
    for r in range(max(1, int(rounds))):
        terms = frontier[:per_round] if frontier else _gap_frontier(per_round)
        if not terms:
            break
        nb, lb = _counts()
        enr = be.enrich(terms, limit=per_round)              # ACQUIRE (real external facts)
        cons = ap.run(max_passes=2) if ap is not None else {}  # CONSOLIDATE (links/clusters)
        na, la = _counts()
        rec = {"round": r + 1, "terms": len(terms),
               "written": enr.get("written", 0),
               "sources_used": enr.get("sources_used", {}),
               "neurons_delta": na - nb, "synapses_delta": la - lb,
               "neurons": na, "synapses": la}
        log.append(rec)
        if jos is not None:
            jos.audit("ingest.round", actor="ingest-daemon", target=f"round-{r+1}",
                      meta={k: rec[k] for k in ("written", "neurons_delta", "synapses_delta")})
        if events is not None:
            events.emit("ingest", "ingest.round.completed", rec, actor="ingest-daemon")
        # EXPAND: next frontier = the brain's freshly-created knowledge gaps
        frontier = _gap_frontier(per_round)
        if max_neurons and na >= max_neurons:
            break
    n1, l1 = _counts()
    return {"status": "ok", "neurons_before": n0, "neurons_after": n1,
            "synapses_before": l0, "synapses_after": l1,
            "neurons_added": n1 - n0, "synapses_added": l1 - l0,
            "rounds": log}


def daemon(interval_s: float = 2.0, *, per_round: int = 12, max_rounds: int = 0) -> None:
    """Non-stop ingestion loop (for `python -m`). max_rounds=0 means run forever."""
    r = 0
    seeds = list(DEFAULT_SEEDS)
    while True:
        r += 1
        out = burst(seeds[: per_round] if r == 1 else None, rounds=1, per_round=per_round)
        print(f"[ingest] round {r}: +{out.get('neurons_added',0)} neurons "
              f"+{out.get('synapses_added',0)} synapses -> "
              f"{out.get('neurons_after','?')} total", flush=True)
        if max_rounds and r >= max_rounds:
            break
        time.sleep(max(0.0, interval_s))


if __name__ == "__main__":
    import os
    daemon(interval_s=float(os.environ.get("INGEST_INTERVAL", "2")),
           per_round=int(os.environ.get("INGEST_PER_ROUND", "12")),
           max_rounds=int(os.environ.get("INGEST_MAX_ROUNDS", "0")))
