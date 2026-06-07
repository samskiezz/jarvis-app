"""LLM_ENRICH — the system enriches its OWN knowledge base with the GPU LLM.

This is the self-enrichment loop that runs on every build (and first start-up): the
Llama brain reads a bounded batch of scraped documents that have not yet been
enriched and distils each into grounded second-brain notes. It is:

  * grounded   — the model is told to use ONLY the document text, never to invent;
  * resumable  — enriched doc ids are marked, so each build advances onto fresh docs
                 and the KB keeps deepening start-up after start-up;
  * bounded    — ``limit`` docs per run keep a build fast; raise it to put more
                 sustained load on the GPU.
  * DEEP        — multiple model passes per document (summary / entities / relations
                 + analyst questions), gated by ``ENRICH_DEPTH``, so each doc is more
                 GPU work and yields a richer set of notes.
  * CONCURRENT  — the pending batch is fanned out across a ThreadPoolExecutor
                 (``ENRICH_WORKERS``, default 2 to match OLLAMA_NUM_PARALLEL) so the
                 GPU is kept fed by parallel requests.

Model-agnostic via ``llm_research`` (Ollama/Llama on the GPU when ``OLLAMA_HOST`` is
set, else the OpenAI-compatible path). With no LLM reachable it no-ops honestly.

Every model call is wrapped so a single failure never aborts the document or the
batch, and marking + note injection use short-lived per-write sqlite connections so
the concurrency path stays thread-safe and the resumable semantics are preserved.
"""

from __future__ import annotations

import os
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

try:
    from . import document_store as ds
except Exception:  # noqa: BLE001
    ds = None  # type: ignore
try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
try:
    from . import llm_research as lr
except Exception:  # noqa: BLE001
    lr = None  # type: ignore

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "enrich.db"
)


def _db_path() -> str:
    return os.environ.get("ENRICH_DB", _DEFAULT_DB)


def _depth() -> int:
    """How many enrichment passes per document: 1 = summary only (legacy), 2 = +
    entities, 3 = +relations + analyst questions (default — richer, heavier)."""
    try:
        return max(1, min(3, int(os.environ.get("ENRICH_DEPTH", "3"))))
    except (TypeError, ValueError):
        return 3


def _workers() -> int:
    """Concurrent worker threads feeding the GPU. Defaults to 2 to match the box's
    OLLAMA_NUM_PARALLEL=2; raise alongside that env to push more GPU load."""
    try:
        return max(1, int(os.environ.get("ENRICH_WORKERS", "2")))
    except (TypeError, ValueError):
        return 2


def _conn() -> sqlite3.Connection:
    path = _db_path()
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            pass
    c = sqlite3.connect(path, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE IF NOT EXISTS enriched (doc_id TEXT PRIMARY KEY, ts INTEGER)")
    return c


def _enriched_ids() -> set:
    try:
        c = _conn()
        try:
            return {r[0] for r in c.execute("SELECT doc_id FROM enriched").fetchall()}
        finally:
            c.close()
    except sqlite3.Error:
        return set()


def _mark(doc_id: str) -> None:
    # Short-lived per-write connection: safe to call concurrently from worker threads.
    try:
        c = _conn()
        try:
            c.execute("INSERT OR REPLACE INTO enriched (doc_id, ts) VALUES (?,?)",
                      (str(doc_id), int(time.time() * 1000)))
            c.commit()
        finally:
            c.close()
    except sqlite3.Error:
        pass


def status() -> dict:
    """How far self-enrichment has progressed. Never raises."""
    done = len(_enriched_ids())
    total = len(ds.all_docs()) if ds is not None else 0
    return {"enriched": done, "documents": total, "pending": max(0, total - done),
            "backend": lr.backend() if lr is not None else None,
            "depth": _depth(), "workers": _workers()}


# Back-compat / explicit alias some callers / tooling may reach for.
def enrich_status() -> dict:
    """Alias of :func:`status` (also reports configured depth/workers)."""
    return status()


def _complete(prompt: str, *, system: str, max_tokens: int = 400,
              fmt: Optional[str] = None) -> Optional[str]:
    """Single guarded model call — never raises, returns None on any failure so one
    bad pass never aborts the document or the batch."""
    if lr is None:
        return None
    try:
        return lr.llm_complete(prompt, system=system, max_tokens=max_tokens, fmt=fmt)
    except Exception:  # noqa: BLE001
        return None


def _inject(kind: str, title: str, body: str, fm: dict) -> bool:
    """Idempotent note injection on (kind, title). Returns True if written."""
    if sb is None or not body or not body.strip():
        return False
    try:
        sb.upsert_note(kind, title, body, fm, 0.7)
        return True
    except Exception:  # noqa: BLE001
        return False


def _enrich_one(d: dict, bk: Optional[str], max_chars: int, inject: bool,
                depth: int) -> dict:
    """Run the multi-pass enrichment for ONE document. Always marks the doc enriched
    (so it is never retried) and returns a small per-doc result. Never raises."""
    res = {"title": None, "passes": 0, "notes": 0, "enriched": False}
    try:
        did = str(d.get("id"))
        title = str(d.get("title") or did)
        url = str(d.get("url") or "")
        text = (d.get("full_text") or "")[: int(max_chars)]
        res["title"] = title
        if not text.strip():
            _mark(did)
            return res

        base_fm = {"llm_enriched": True, "backend": bk, "doc_id": did, "url": url}
        src = f"\n\nSource: {url}" if url else ""
        notes = 0
        passes = 0

        # Pass 1 (always): grounded factual-bullet summary.
        passes += 1
        summary = _complete(
            "You are building an intelligence knowledge base. From the document below, "
            "write 3-5 dense factual bullet points capturing the key facts, entities and "
            "relationships. Ground EVERY claim only in the text; never invent.\n\n"
            f"TITLE: {title}\n\nDOCUMENT:\n{text}",
            system="You are a precise intelligence analyst. Output concise factual bullets only.",
        )
        if summary and summary.strip():
            if inject and _inject(
                "document_summary", title,
                f"{summary.strip()}{src}\n\nEnriched by LLM ({bk}).",
                {**base_fm, "pass": "summary"},
            ):
                notes += 1

        # Pass 2 (depth>=2): structured entity list (people/orgs/places/systems).
        if depth >= 2:
            passes += 1
            entities = _complete(
                "Extract the named entities from the document below as JSON of the form "
                '{"people": [...], "organizations": [...], "places": [...], "systems": [...]}. '
                "Use ONLY entities that appear in the text; never invent. Omit empty lists.\n\n"
                f"TITLE: {title}\n\nDOCUMENT:\n{text}",
                system="You are an entity-extraction engine. Output only valid JSON.",
                fmt="json",
            )
            if entities and entities.strip():
                if inject and _inject(
                    "document_entities", title,
                    f"```json\n{entities.strip()}\n```{src}\n\nEntities extracted by LLM ({bk}).",
                    {**base_fm, "pass": "entities"},
                ):
                    notes += 1

        # Pass 3 (depth>=3): key relationships/claims + analyst questions answered.
        if depth >= 3:
            passes += 1
            relations = _complete(
                "From the document below, list the key relationships and claims as dense "
                "bullets in the form 'A — relation — B' or 'CLAIM: ...'. Ground every line "
                "ONLY in the text; never invent.\n\n"
                f"TITLE: {title}\n\nDOCUMENT:\n{text}",
                system="You map relationships and claims. Output concise bullets only.",
            )
            if relations and relations.strip():
                if inject and _inject(
                    "document_relations", title,
                    f"{relations.strip()}{src}\n\nRelations mapped by LLM ({bk}).",
                    {**base_fm, "pass": "relations"},
                ):
                    notes += 1

            passes += 1
            questions = _complete(
                "Write 2-3 sharp analyst questions that THIS document answers, then give a "
                "one-line grounded answer to each, using ONLY the text below.\n\n"
                f"TITLE: {title}\n\nDOCUMENT:\n{text}",
                system="You are an intelligence analyst. Output Q/A pairs grounded in the text.",
            )
            if questions and questions.strip():
                if inject and _inject(
                    "document_questions", title,
                    f"{questions.strip()}{src}\n\nAnalyst Q/A by LLM ({bk}).",
                    {**base_fm, "pass": "questions"},
                ):
                    notes += 1

        res["passes"] = passes
        res["notes"] = notes
        res["enriched"] = notes > 0
        _mark(did)
    except Exception:  # noqa: BLE001 - one doc must never abort the batch
        try:
            _mark(str(d.get("id")))
        except Exception:  # noqa: BLE001
            pass
    return res


def enrich_documents(limit: int = 12, *, inject: bool = True, max_chars: int = 6000) -> dict:
    """Run a DEEP, CONCURRENT LLM pass over up to ``limit`` not-yet-enriched scraped
    documents, injecting grounded notes per document. Resumable; never raises.

    Depth is controlled by ``ENRICH_DEPTH`` (1=summary, 2=+entities, 3=+relations+
    questions; default 3) and concurrency by ``ENRICH_WORKERS`` (default 2).

    Returns ``{available, backend, enriched, pending_remaining, samples, passes,
    notes_written, depth, workers}``."""
    if lr is None or not lr.available():
        return {"available": False, "backend": None, "enriched": 0,
                "reason": "no LLM reachable (set OLLAMA_HOST to your Llama)"}
    docs = ds.all_docs() if ds is not None else []
    done = _enriched_ids()
    pending = [d for d in docs if str((d or {}).get("id")) not in done]
    batch = pending[: max(1, int(limit))]
    bk = lr.backend()
    depth = _depth()
    workers = max(1, min(_workers(), len(batch) or 1))

    n = 0
    passes_total = 0
    notes_total = 0
    samples: list[str] = []

    results: list[dict] = []
    if workers <= 1 or len(batch) <= 1:
        for d in batch:
            results.append(_enrich_one(d, bk, max_chars, inject, depth))
    else:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [ex.submit(_enrich_one, d, bk, max_chars, inject, depth) for d in batch]
            for f in as_completed(futs):
                try:
                    results.append(f.result())
                except Exception:  # noqa: BLE001
                    pass

    for r in results:
        passes_total += int(r.get("passes") or 0)
        notes_total += int(r.get("notes") or 0)
        if r.get("enriched"):
            n += 1
            if r.get("title"):
                samples.append(str(r["title"]))

    return {"available": True, "backend": bk, "enriched": n,
            "pending_remaining": max(0, len(pending) - len(batch)),
            "samples": samples[:5], "passes": passes_total,
            "notes_written": notes_total, "depth": depth, "workers": workers}
