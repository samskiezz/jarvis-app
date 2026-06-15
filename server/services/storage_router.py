"""Storage Router — the unified retrieval seam (the 2026 "data operating system" pattern, right-sized).

ONE retrieve() over the stores JARVIS ALREADY has — NO new servers, NO distributed stack:
  * vector semantic search  → embeddings.search() over vectors.db (~194k docs, 37 kinds)
  * keyword / full-text     → documents.db FTS5 (best-effort)
  * graph expansion         → brain.db ont_link 1-hop neighbours (relationship context)
  * object manifest         → cloud_storage.locate() (where a blob moved in Wasabi)

It MERGES results and RE-RANKS by blended relevance × source authority × freshness, then returns
CITED, provenance-tagged hits (which store, kind, score, ts, why). Every backend is best-effort:
one failing/missing store is skipped, never breaks retrieval. This is the doc's #51/#52/#56/#57/#74
implemented on the single box, reusing what exists rather than deploying Postgres/Kafka/Iceberg/etc.
"""
from __future__ import annotations

import os
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Source authority: human / source-of-truth kinds outrank generated/derived (doc rule #57).
AUTHORITY = {
    "document": 1.0, "person": 1.0, "ScientificPublication": 1.0, "DomainSubject": 0.95,
    "Place": 0.9, "Event": 0.9, "asset": 0.8, "Asset": 0.8, "concept": 0.8, "brain:concept": 0.8,
    "creative": 0.6, "document_summary": 0.65, "brain:log": 0.4, "brain:decision": 0.7,
}
DEFAULT_AUTHORITY = 0.7


def _now() -> int:
    return int(time.time())


def _vector(query: str, k: int, kind):
    """Primary semantic retrieval over vectors.db (best-effort)."""
    try:
        from server.services import embeddings
        out = []
        for h in embeddings.search(query, k=k, kind=kind) or []:
            out.append({
                "id": h.get("id"), "kind": h.get("kind") or "object",
                "text": (h.get("text") or "")[:400], "score": float(h.get("score", 0.0)),
                "ts": h.get("ts"), "store": "vector",
            })
        return out
    except Exception as e:  # noqa: BLE001
        return [{"_error": "vector: " + str(e)[:120]}]


def _fts(query: str, k: int):
    """Full-text over documents.db FTS5 (best-effort; schema-tolerant)."""
    db = os.path.join(ROOT, "server", "data", "documents.db")
    if not os.path.exists(db):
        return []
    try:
        con = sqlite3.connect(db, timeout=8)
        con.row_factory = sqlite3.Row
        q = " ".join(w for w in query.split() if w.isalnum())[:200] or query[:200]
        rows = con.execute(
            "SELECT d.id AS id, d.source_name AS src, "
            "snippet(document_fts, -1, '[', ']', '…', 12) AS snip "
            "FROM document_fts JOIN document d ON d.rowid = document_fts.rowid "
            "WHERE document_fts MATCH ? LIMIT ?", (q, k)).fetchall()
        con.close()
        return [{"id": r["id"], "kind": "document", "text": (r["snip"] or "")[:400],
                 "score": 0.6, "ts": None, "store": "fts", "source": r["src"]} for r in rows]
    except Exception:  # noqa: BLE001
        return []


def _graph_neighbours(ids, limit: int = 12):
    """1-hop relationship context from brain.db ont_link for the top object hits (best-effort)."""
    db = os.path.join(ROOT, "server", "data", "brain.db")
    if not os.path.exists(db) or not ids:
        return []
    try:
        con = sqlite3.connect(db, timeout=8)
        con.row_factory = sqlite3.Row
        qmarks = ",".join("?" * len(ids))
        rows = con.execute(
            "SELECT from_id, to_id, type FROM ont_link "
            "WHERE from_id IN (%s) OR to_id IN (%s) LIMIT ?" % (qmarks, qmarks),
            (*ids, *ids, limit)).fetchall()
        con.close()
        edges = []
        for r in rows:
            other = r["to_id"] if r["from_id"] in ids else r["from_id"]
            edges.append({"neighbour": other, "relation": r["type"], "store": "graph"})
        return edges
    except Exception:  # noqa: BLE001
        return []


def _object_location(hit: dict):
    """If a hit looks like a file path, note where it moved in cloud storage (best-effort)."""
    try:
        from server.services import cloud_storage as cs
        rid = str(hit.get("id") or "")
        if "/" in rid or "." in rid.split("/")[-1]:
            loc = cs.locate(rid)
            if loc:
                return {"bucket": loc["bucket"], "key": loc["key"], "status": loc["status"]}
    except Exception:  # noqa: BLE001
        pass
    return None


def _rerank(hits: list, now: int) -> list:
    """Blend relevance × authority × freshness (doc #56/#57). Freshness only if a ts is present."""
    for h in hits:
        auth = AUTHORITY.get(h.get("kind", ""), DEFAULT_AUTHORITY)
        fresh = 1.0
        ts = h.get("ts")
        if isinstance(ts, (int, float)) and ts > 0:
            age_days = max(0.0, (now - (ts / 1000 if ts > 1e11 else ts)) / 86400.0)
            fresh = 1.0 + 0.25 * (1.0 / (1.0 + age_days / 30.0))   # gentle recency boost, capped
        h["final_score"] = round(h.get("score", 0.0) * auth * fresh, 5)
        h["authority"] = auth
    return sorted(hits, key=lambda x: x.get("final_score", 0), reverse=True)


def retrieve(query: str, k: int = 10, kind=None, expand_graph: bool = True) -> dict:
    """Unified, cited, multi-store retrieval. Returns merged+reranked hits with provenance, plus
    relationship context and (when applicable) cloud object locations."""
    now = _now()
    raw = _vector(query, k, kind)
    vec = [h for h in raw if "_error" not in h]
    errs = [h["_error"] for h in raw if "_error" in h]
    fts = _fts(query, max(3, k // 2))
    # merge + dedupe by id (vector wins on dup)
    seen, merged = set(), []
    for h in vec + fts:
        rid = h.get("id")
        if rid in seen:
            continue
        seen.add(rid)
        loc = _object_location(h)
        if loc:
            h["cloud"] = loc
        merged.append(h)
    ranked = _rerank(merged, now)[:k]
    result = {"query": query, "k": k, "count": len(ranked), "results": ranked,
              "stores_hit": sorted({h["store"] for h in ranked})}
    if errs:
        result["store_errors"] = errs
    if expand_graph:
        top_ids = [h["id"] for h in ranked[:5] if h.get("id")]
        result["relationships"] = _graph_neighbours(top_ids)
    return result


if __name__ == "__main__":
    import json
    import sys
    q = sys.argv[1] if len(sys.argv) > 1 else "energy"
    print(json.dumps(retrieve(q, k=6), indent=2, default=str)[:2500])
