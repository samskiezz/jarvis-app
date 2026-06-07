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

# Live domain ingestion pipelines — pull REAL world data (USGS quakes, GBIF species,
# NVD CVEs, NWS weather, Crossref publications) into the ontology each build, adding
# genuine detail + strength beyond the scraped documents.
_DOMAINS = {}
for _name in ("world_earthquake", "world_species", "world_cve", "world_weather", "world_publications"):
    try:
        _DOMAINS[_name.replace("world_", "")] = __import__(f"server.services.{_name}", fromlist=[_name])
    except Exception:  # noqa: BLE001
        pass


def run_once(*, scrape_batches: int = 2, seeds_per_batch: int = 6, depth: int = 2,
             domain_limit: int = 50, enrich_limit: int = 12) -> dict:
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

    # 4b) live domain ingestion — real-world data for extra detail + strength
    ingested = {}
    for dname, mod in _DOMAINS.items():
        try:
            r = mod.run_pipeline(limit=domain_limit, live=True)
            ingested[dname] = (r.get("ingested") or r.get("stored") or r.get("count")
                               or (r.get("objects") if isinstance(r.get("objects"), int) else None) or 0)
        except Exception as e:  # noqa: BLE001
            ingested[dname] = f"error: {e}"
    if ingested:
        report["steps"]["live_domains"] = ingested
        # re-project so the new live objects strengthen the graph
        try:
            from . import jarvis_corpus_projection as proj
            report["steps"]["reproject"] = {"ok": proj.project().get("ok")}
        except Exception:  # noqa: BLE001
            pass

    # 4c) rebuild the self-building UI spec so new object types get windows+renders
    try:
        from . import jarvis_ui_builder as uib
        uib.invalidate()
        s = uib.build_spec()
        report["steps"]["ui_spec"] = {"windows": s["object_types"],
                                      "renders": s["renders_assigned"], "gaps": len(s["render_gaps"])}
    except Exception:  # noqa: BLE001
        pass

    # 4d) embed the knowledge base into the semantic index — on the GPU when
    # OLLAMA_EMBED_MODEL is set (graceful CPU-hashing fallback otherwise). This is
    # the step that puts the freshly scraped + projected corpus through the GPU
    # embedder, so the box actually does work as the base KB is built: the ontology
    # objects PLUS every scraped document (chunked) become semantically searchable.
    try:
        from . import embeddings as emb
        objs = emb.reindex_ontology()                       # ontology objects -> index
        docs = docstore.all_docs() if docstore is not None else []
        docres = emb.index_documents(docs)                  # scraped docs (chunked) -> GPU
        report["steps"]["embed_index"] = {
            "objects_indexed": objs,
            "documents_indexed": docres.get("documents"),
            "chunks_embedded": docres.get("chunks"),
            "backend": docres.get("backend"),
            "dim": docres.get("dim"),
            "index_total": emb.count(),
        }
    except Exception as e:  # noqa: BLE001
        report["steps"]["embed_index"] = {"ok": False, "error": str(e)}

    # 4e) self-enrichment with the GPU LLM — the Llama brain reads a bounded batch of
    # scraped documents and writes grounded factual summaries back into the knowledge
    # base. This is how the system deepens itself on every start-up (and the step that
    # puts sustained GPU load on the box). Resumable: each build advances onto fresh
    # docs. Raise enrich_limit to enrich (and GPU-process) more per build.
    if enrich_limit and enrich_limit > 0:
        try:
            from . import llm_enrich as enrich
            er = enrich.enrich_documents(limit=int(enrich_limit))
            report["steps"]["llm_enrich"] = {
                "enriched": er.get("enriched"),
                "backend": er.get("backend"),
                "available": er.get("available"),
                "pending_remaining": er.get("pending_remaining"),
            }
        except Exception as e:  # noqa: BLE001
            report["steps"]["llm_enrich"] = {"ok": False, "error": str(e)}

    # 5) snapshot the document store for durability
    if docstore is not None:
        try:
            report["steps"]["snapshot"] = docstore.snapshot()
        except Exception:  # noqa: BLE001
            report["steps"]["snapshot"] = {"ok": False}

    # 5b) auto-sync the new artifacts to GitHub (gated by GIT_AUTOSYNC) — the
    # platform commits + pushes its own fresh data so the repo self-updates.
    try:
        from . import jarvis_gitsync as gs
        if gs.enabled():
            report["steps"]["gitsync"] = gs.sync(
                message=f"data(autosync): build +{fetched} docs {time.strftime('%Y-%m-%d %H:%M')}")
    except Exception:  # noqa: BLE001
        report["steps"]["gitsync"] = {"ok": False}

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
