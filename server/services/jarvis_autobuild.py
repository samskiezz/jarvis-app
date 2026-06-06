"""JARVIS AUTOBUILD — the system builds itself, every time it is turned on.

One idempotent orchestration that runs on boot (and on demand / on a schedule) so
the platform always rebuilds from the committed documents + database and keeps
growing on its own:

  1. RESTORE   the scraped document store from its committed snapshot.
  2. LOAD      all data points + priority acquisition points (Foundry).
  3. PROJECT   the corpus into the ontology graph (Gotham) + ensure topics.
  4. SCRAPE    a bounded number of document-finder batches (grows real content,
               rotates through sources via the seed ledger — resumable).
  5. SNAPSHOT  the document store so new content is durable for next boot.
  6. REPORT    a full rollup.

Everything reuses the existing, idempotent services and never raises, so a fresh
container or a re-run simply heals + advances the build.
"""

from __future__ import annotations

import time

try:
    from . import jarvis_system as sysmod
except Exception:  # noqa: BLE001
    sysmod = None  # type: ignore
try:
    from . import jarvis_scrape as scrape
except Exception:  # noqa: BLE001
    scrape = None  # type: ignore
try:
    from . import document_store as docstore
except Exception:  # noqa: BLE001
    docstore = None  # type: ignore
try:
    from . import jarvis_grow as grow
except Exception:  # noqa: BLE001
    grow = None  # type: ignore


def run_once(*, scrape_batches: int = 2, seeds_per_batch: int = 6, depth: int = 2) -> dict:
    """Build the whole platform once. Idempotent; never raises. Returns a report."""
    t0 = time.time()
    report: dict = {"steps": {}}

    # 1) restore durable scraped content
    if docstore is not None:
        try:
            report["steps"]["restore"] = docstore.restore()
        except Exception as e:  # noqa: BLE001
            report["steps"]["restore"] = {"ok": False, "error": str(e)}

    # 2+3) load + project (Foundry + Gotham) — reuse the governed startup
    if sysmod is not None:
        try:
            boot = sysmod.startup()
            report["steps"]["startup"] = {"ok": boot.get("booted"),
                                          "steps": list((boot.get("steps") or {}).keys())}
        except Exception as e:  # noqa: BLE001
            report["steps"]["startup"] = {"ok": False, "error": str(e)}

    # 3b) ensure the Gotham topic nodes exist
    if grow is not None:
        try:
            report["steps"]["topics"] = grow.ensure_topics()
        except Exception:  # noqa: BLE001
            report["steps"]["topics"] = "error"

    # 4) scrape a bounded amount of new content (grows all three planes)
    fetched = 0
    if scrape is not None and scrape_batches > 0:
        batches = []
        for _ in range(scrape_batches):
            try:
                r = scrape.document_finder(seeds_limit=seeds_per_batch, depth=depth)
            except Exception as e:  # noqa: BLE001
                r = {"ok": False, "error": str(e)}
            batches.append({"fetched": r.get("fetched", 0), "discovered": r.get("discovered", 0)})
            fetched += r.get("fetched", 0)
            if r.get("seeds", 1) == 0:  # all seeds crawled — nothing left this pass
                break
        report["steps"]["scrape"] = {"batches": batches, "fetched": fetched}

    # 5) snapshot the document store for durability
    if docstore is not None:
        try:
            report["steps"]["snapshot"] = docstore.snapshot()
        except Exception:  # noqa: BLE001
            report["steps"]["snapshot"] = {"ok": False}

    # 6) final rollup
    if sysmod is not None:
        try:
            report["status"] = sysmod.status()
        except Exception:  # noqa: BLE001
            report["status"] = None
    report["fetched_this_run"] = fetched
    report["seconds"] = round(time.time() - t0, 1)
    report["ok"] = True
    return report


def status() -> dict:
    """Lightweight build state (for monitoring the auto-build). Never raises."""
    out = {}
    try:
        if scrape is not None:
            out["seed_progress"] = scrape.seeds_progress()
            out["scraped_documents"] = scrape.scraped_count()
        if docstore is not None:
            out["document_store"] = docstore.stats()
    except Exception:  # noqa: BLE001
        pass
    return out
