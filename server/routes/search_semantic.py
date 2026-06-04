"""SEMANTIC SEARCH + RAG routes (P4 #34, P9 #62/#67/#68).

A vector/semantic layer that lives *alongside* the existing keyword search
(``routes/search.py`` is untouched). Backed by :mod:`services.embeddings`
(hashing TF-IDF + SQLite vector store) and :mod:`services.rag` (grounded
retrieval + a transparent NL→filter heuristic).

Endpoints (optional_bearer; reindex requires a bearer when auth is on):
  * ``POST /v1/semantic/reindex``                  — re-embed all ontology objects.
  * ``GET  /v1/semantic/search?q=&k=&kind=``        — cosine top-k semantic search.
  * ``POST /v1/semantic/rag``   body {query,k,kind} — retrieve + build grounding ctx.
  * ``POST /v1/semantic/nl``    body {query}        — NL→structured ontology query.

Mount in ``main.py`` with::

    from .routes import search_semantic as search_semantic_routes
    app.include_router(search_semantic_routes.router)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import optional_bearer
from ..services import embeddings, rag

router = APIRouter(prefix="/v1/semantic", tags=["semantic"])


@router.post("/reindex")
async def reindex_endpoint(_token: str | None = Depends(optional_bearer)):
    """Re-embed and upsert every ontology object into the vector store."""
    n = embeddings.reindex_ontology()
    return {"ok": True, "indexed": n, "total": embeddings.count()}


@router.get("/search")
async def search_endpoint(
    q: str = Query("", description="semantic query"),
    k: int = Query(10, ge=1, le=100),
    kind: Optional[str] = Query(None, description="filter by doc kind / object type"),
    _token: str | None = Depends(optional_bearer),
):
    """Cosine top-k semantic search over the vector store."""
    hits = embeddings.search(q, k=k, kind=kind)
    return {"query": q, "k": k, "kind": kind, "count": len(hits), "results": hits}


class RagBody(BaseModel):
    query: str
    k: int | None = 6
    kind: str | None = None


@router.post("/rag")
async def rag_endpoint(
    body: RagBody,
    _token: str | None = Depends(optional_bearer),
):
    """Retrieve top-k docs and assemble a cited grounding context (no LLM call)."""
    k = body.k if body.k and body.k > 0 else 6
    return rag.build_context(body.query, k=k, kind=body.kind)


class NlBody(BaseModel):
    query: str


@router.post("/nl")
async def nl_endpoint(
    body: NlBody,
    _token: str | None = Depends(optional_bearer),
):
    """Transparent NL→structured-filter heuristic over the ontology."""
    return rag.nl_query(body.query)
