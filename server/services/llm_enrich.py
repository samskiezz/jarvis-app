"""LLM_ENRICH — the system enriches its OWN knowledge base with the GPU LLM.

This is the self-enrichment loop that runs on every build (and first start-up): the
Llama brain reads a bounded batch of scraped documents that have not yet been
enriched, distils each into grounded factual bullets (key facts / entities /
relationships), and injects the result as a second-brain note. It is:

  * grounded  — the model is told to use ONLY the document text, never to invent;
  * resumable — enriched doc ids are marked, so each build advances onto fresh docs
                and the KB keeps deepening start-up after start-up;
  * bounded   — ``limit`` docs per run keep a build fast; raise it to put more
                sustained load on the GPU.

Model-agnostic via ``llm_research`` (Ollama/Llama on the GPU when ``OLLAMA_HOST`` is
set, else the OpenAI-compatible path). With no LLM reachable it no-ops honestly.
"""

from __future__ import annotations

import os
import sqlite3
import time
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
            "backend": lr.backend() if lr is not None else None}


def enrich_documents(limit: int = 12, *, inject: bool = True, max_chars: int = 6000) -> dict:
    """Run the LLM over up to ``limit`` not-yet-enriched scraped documents and inject a
    grounded factual summary per document. Resumable; never raises.

    Returns ``{available, backend, enriched, pending_remaining, samples}``."""
    if lr is None or not lr.available():
        return {"available": False, "backend": None, "enriched": 0,
                "reason": "no LLM reachable (set OLLAMA_HOST to your Llama)"}
    docs = ds.all_docs() if ds is not None else []
    done = _enriched_ids()
    pending = [d for d in docs if str((d or {}).get("id")) not in done]
    bk = lr.backend()
    n = 0
    samples: list[str] = []
    for d in pending[: max(1, int(limit))]:
        did = str(d.get("id"))
        title = str(d.get("title") or did)
        url = str(d.get("url") or "")
        text = (d.get("full_text") or "")[: int(max_chars)]
        if not text.strip():
            _mark(did)
            continue
        summary = lr.llm_complete(
            "You are building an intelligence knowledge base. From the document below, "
            "write 3-5 dense factual bullet points capturing the key facts, entities and "
            "relationships. Ground EVERY claim only in the text; never invent.\n\n"
            f"TITLE: {title}\n\nDOCUMENT:\n{text}",
            system="You are a precise intelligence analyst. Output concise factual bullets only.",
            max_tokens=400,
        )
        if summary and summary.strip():
            if inject and sb is not None:
                try:
                    src = f"\n\nSource: {url}" if url else ""
                    sb.upsert_note(
                        "document_summary", title,
                        f"{summary.strip()}{src}\n\nEnriched by LLM ({bk}).",
                        {"llm_enriched": True, "backend": bk, "doc_id": did, "url": url}, 0.7,
                    )
                except Exception:  # noqa: BLE001
                    pass
            samples.append(title)
            n += 1
        _mark(did)
    return {"available": True, "backend": bk, "enriched": n,
            "pending_remaining": max(0, len(pending) - min(len(pending), int(limit))),
            "samples": samples[:5]}
