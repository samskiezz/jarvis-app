"""BRAIN THINK — transparent, retrieval-grounded thinking tools over the vault
(the THINKING-TOOLS layer of the second brain, mirroring COG-second-brain's
red-team / panel / connect / emerge utilities).

These tools deliberately do NOT call an LLM and NEVER fabricate an answer. They
*assemble evidence* from the existing vault (via the semantic index + the graph)
and present it honestly, with cited note ids. When the vault is too sparse to
support a tool, the tool returns an honest empty result rather than inventing.

  * ``challenge(idea)``  — retrieve notes that CAUTION/CONTRADICT the idea and
                           lay out a structured counter-case, each point citing
                           the note id it came from.
  * ``panel(decision)``  — surface N relevant notes as distinct "perspective"
                           stubs (each a real note, framed as a viewpoint).
  * ``connect(a, b)``    — find a bridge between two concepts: shared graph
                           neighbours first, then nearest-concept overlap via
                           embeddings.
  * ``emerge(days=30)``  — frequent, un-named (not-yet-a-note-title) terms across
                           recent note bodies — emergent themes worth promoting.

Design rules (mirrors the rest of the backend):
  * stdlib only (+ embeddings/rag/graph already in the tree).
  * NEVER raise — every public function degrades to an honest empty value.
  * transparent: results carry the evidence and a ``heuristic``/``grounded`` flag
    so callers never mistake them for a generated answer.
"""

from __future__ import annotations

import re
import time
from collections import Counter
from typing import Any, Optional

# ── graceful imports (use, never edit) ──────────────────────────────────────────────
try:
    from . import second_brain as sb  # type: ignore
except Exception:  # noqa: BLE001
    sb = None  # type: ignore

try:
    from . import embeddings  # type: ignore
except Exception:  # noqa: BLE001
    embeddings = None  # type: ignore

try:
    from . import rag  # type: ignore
except Exception:  # noqa: BLE001
    rag = None  # type: ignore

try:
    from . import graph  # type: ignore
except Exception:  # noqa: BLE001
    graph = None  # type: ignore


# Words that, when present in a retrieved note, read as a caution / counter-signal.
_CAUTION_WORDS = (
    "but", "however", "risk", "risky", "concern", "concerned", "fail", "failed",
    "problem", "problematic", "caution", "downside", "drawback", "doubt",
    "disagree", "against", "won't", "cannot", "can't", "not ", "no ", "avoid",
    "warning", "danger", "expensive", "costly", "hard", "difficult", "unclear",
    "contradict", "however", "instead", "unfortunately", "blocker",
)

_STOPWORDS = {
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had",
    "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how",
    "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its",
    "let", "put", "say", "she", "too", "use", "this", "that", "with", "from",
    "they", "have", "will", "your", "what", "when", "them", "then", "than",
    "into", "some", "more", "very", "just", "like", "also", "been", "were",
    "about", "would", "there", "their", "which", "these", "those", "should",
    "could", "note", "notes", "concept", "idea", "thing", "things", "really",
}


def _retrieve(query: str, k: int = 6) -> list[dict]:
    if rag is not None:
        try:
            return rag.retrieve(query, k=k) or []
        except Exception:  # noqa: BLE001
            pass
    if embeddings is not None:
        try:
            return embeddings.search(query, k=k) or []
        except Exception:  # noqa: BLE001
            pass
    return []


def _label(hit: dict) -> str:
    meta = hit.get("meta") or {}
    return meta.get("title") or meta.get("label") or hit.get("id") or ""


def _snippet(text: str, width: int = 200) -> str:
    return " ".join(str(text or "").split())[:width]


# ── challenge ───────────────────────────────────────────────────────────────────────
def challenge(idea: str) -> dict:
    """Red-team an ``idea``: retrieve relevant notes, keep those that caution or
    contradict, and assemble a structured, cited counter-case.

    Returns ``{idea, counter_case:[{point, note_id, label, score}], considered,
    grounded, note}``. Honest empty ``counter_case`` when nothing in the vault
    pushes back. Never raises."""
    idea = str(idea or "").strip()
    base = {"idea": idea, "counter_case": [], "considered": 0,
            "grounded": True,
            "note": "evidence assembled from the vault; no answer is generated"}
    if not idea:
        return base

    hits = _retrieve(idea, k=8)
    base["considered"] = len(hits)
    counter: list[dict] = []
    for h in hits:
        text = str(h.get("text") or "")
        low = text.lower()
        if any(w in low for w in _CAUTION_WORDS):
            # pull the first cautioning sentence as the cited point
            point = _first_caution_sentence(text) or _snippet(text)
            counter.append({
                "point": point,
                "note_id": h.get("id"),
                "label": _label(h),
                "score": h.get("score"),
            })
    base["counter_case"] = counter
    return base


def _first_caution_sentence(text: str) -> Optional[str]:
    try:
        for sent in re.split(r"(?<=[.!?])\s+|\n", str(text or "")):
            low = sent.lower()
            if any(w in low for w in _CAUTION_WORDS) and sent.strip():
                return sent.strip()[:240]
    except Exception:  # noqa: BLE001
        return None
    return None


# ── panel ──────────────────────────────────────────────────────────────────────────
def panel(decision: str, n: int = 4) -> dict:
    """Convene a "panel": surface up to ``n`` distinct relevant notes as
    perspective stubs to weigh a ``decision`` against.

    Returns ``{decision, perspectives:[{angle, note_id, label, snippet, score}],
    grounded, note}``. Honest empty when the vault has nothing relevant. Never
    raises."""
    decision = str(decision or "").strip()
    base = {"decision": decision, "perspectives": [], "grounded": True,
            "note": "each perspective is a real vault note, not a generated voice"}
    if not decision:
        return base
    try:
        n = max(1, int(n))
    except (TypeError, ValueError):
        n = 4

    hits = _retrieve(decision, k=n * 2)
    perspectives: list[dict] = []
    seen: set = set()
    for h in hits:
        nid = h.get("id")
        if nid in seen:
            continue
        seen.add(nid)
        perspectives.append({
            "angle": _label(h),
            "note_id": nid,
            "label": _label(h),
            "snippet": _snippet(h.get("text", "")),
            "score": h.get("score"),
        })
        if len(perspectives) >= n:
            break
    base["perspectives"] = perspectives
    return base


# ── connect ────────────────────────────────────────────────────────────────────────
def connect(a: str, b: str) -> dict:
    """Find a bridge between concepts ``a`` and ``b``.

    Strategy (transparent): 1) look for SHARED graph neighbours of the two notes;
    2) failing that, find the concept(s) nearest to BOTH via embeddings (overlap
    of each side's top semantic hits). Returns ``{a, b, bridge, method, grounded}``
    — ``bridge`` is empty (honest) when no connection is found. Never raises."""
    a = str(a or "").strip()
    b = str(b or "").strip()
    base = {"a": a, "b": b, "bridge": [], "method": None, "grounded": True,
            "note": "bridge found via graph neighbours / nearest concepts"}
    if not a or not b:
        return base

    # 1) shared graph neighbours
    shared = _shared_neighbours(a, b)
    if shared:
        base["bridge"] = shared
        base["method"] = "shared_graph_neighbours"
        return base

    # 2) semantic overlap: concepts near BOTH a and b
    overlap = _semantic_bridge(a, b)
    if overlap:
        base["bridge"] = overlap
        base["method"] = "nearest_concepts"
    return base


def _note_id_for(title: str) -> Optional[str]:
    if sb is None:
        return None
    try:
        note = sb.get_note(title)
        return note.get("id") if note else None
    except Exception:  # noqa: BLE001
        return None


def _shared_neighbours(a: str, b: str) -> list[dict]:
    if graph is None:
        return []
    ida = _note_id_for(a)
    idb = _note_id_for(b)
    if not ida or not idb:
        return []
    try:
        ea = graph.expand(ida)
        eb = graph.expand(idb)
    except Exception:  # noqa: BLE001
        return []
    na = {n.get("id") for n in (ea.get("nodes") or [])} - {ida}
    nb = {n.get("id") for n in (eb.get("nodes") or [])} - {idb}
    shared_ids = (na & nb) - {ida, idb}
    out: list[dict] = []
    label_by_id = {}
    for n in (ea.get("nodes") or []) + (eb.get("nodes") or []):
        label_by_id[n.get("id")] = n.get("label")
    for sid in shared_ids:
        out.append({"id": sid, "label": label_by_id.get(sid, sid)})
    return out


def _semantic_bridge(a: str, b: str, k: int = 6) -> list[dict]:
    if embeddings is None:
        return []
    try:
        ha = {h["id"]: h for h in (embeddings.search(a, k=k) or [])}
        hb = {h["id"]: h for h in (embeddings.search(b, k=k) or [])}
    except Exception:  # noqa: BLE001
        return []
    out: list[dict] = []
    for nid in (set(ha) & set(hb)):
        h = ha[nid]
        meta = h.get("meta") or {}
        out.append({
            "id": nid,
            "label": meta.get("title") or meta.get("label") or nid,
            "score": round((ha[nid].get("score", 0) + hb[nid].get("score", 0)) / 2, 6),
        })
    out.sort(key=lambda x: -(x.get("score") or 0))
    return out


# ── emerge ───────────────────────────────────────────────────────────────────────────
def emerge(days: int = 30, top: int = 15) -> dict:
    """Surface emergent THEMES: frequently-used terms across recent note bodies
    that are NOT yet a note title (i.e. un-named concepts worth promoting).

    Returns ``{days, terms:[{term, count}], scanned, note}``. Honest empty when
    the vault is sparse / no terms clear the frequency bar. Never raises."""
    try:
        days = max(1, int(days))
    except (TypeError, ValueError):
        days = 30
    base = {"days": days, "terms": [], "scanned": 0,
            "note": "frequent terms not yet promoted to a note title"}
    if sb is None:
        return base

    try:
        notes = sb.list_notes() or []
    except Exception:  # noqa: BLE001
        return base

    cutoff = int(time.time() * 1000) - days * 24 * 3600 * 1000
    recent = [n for n in notes if int(n.get("updated_ts") or 0) >= cutoff] or notes
    base["scanned"] = len(recent)

    # existing note titles (and their words) are "named" — exclude them.
    titles = {str(n.get("title", "")).strip().lower() for n in notes}
    title_words: set = set()
    for t in titles:
        title_words.update(re.findall(r"[a-z]{3,}", t))

    counter: Counter = Counter()
    for n in recent:
        for w in re.findall(r"[a-z]{4,}", str(n.get("body_md") or "").lower()):
            if w in _STOPWORDS or w in title_words:
                continue
            counter[w] += 1

    # an emergent term needs to appear at least twice to count as a theme.
    terms = [{"term": w, "count": c} for w, c in counter.most_common(top) if c >= 2]
    base["terms"] = terms
    return base
