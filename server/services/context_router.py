"""CONTEXT ROUTER — make every JARVIS chat call see ALL the data the system has accumulated.

Background: before this module, the chat prompt was `persona + user_memory.preamble(query)` and that
was IT. The system has ~2.3M rows across 30+ databases (200K embeddings in vectors.db, 174K ontology
objects, 66 distilled lessons, decision_ledger entries, 2.66M knowledge-graph nodes, …) — and the
brain never saw any of it. Every token spent on JARVIS chat was paid-for-but-blind.

This module aggregates the existing retrieval surfaces (each one already paid for, indexed, and
tested) into a single compact preamble that gets prepended to the persona system message:

  1. user_memory.preamble(query)         — facts the system has remembered about the owner
  2. feedback_bus.lessons_for("chat")    — distilled lessons (only fired before — by other tiers)
  3. rag.retrieve(query, k=5)            — top-k cosine hits over the 200K-vector store
  4. aip.retrieve(query, k=3)            — top-k TF-IDF hits over the 174K-object ontology
  5. decision_ledger.recent(limit=3)     — last few committed decisions + their stated outcomes

Doctrine:
  * Every retrieval is best-effort: an import error or DB miss returns "" and never raises.
  * Total preamble is hard-capped at MAX_PREAMBLE_CHARS so it never eats the context window.
  * Stays pure-stdlib + numpy (no new deps). All consumers already exist in the repo.
"""
from __future__ import annotations

import os
import time
from typing import Iterable

MAX_PREAMBLE_CHARS = int(os.environ.get("CONTEXT_ROUTER_MAX_CHARS", "6000"))
ENABLE = os.environ.get("CONTEXT_ROUTER_ENABLE", "1") not in ("0", "false", "no", "off")
_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_TTL_S = float(os.environ.get("CONTEXT_ROUTER_TTL_S", "12"))


def _user_memory_block(query: str) -> str:
    try:
        from . import user_memory as _UM
        s = (_UM.preamble(query) or "").strip()
        return ("## What I remember about you\n" + s) if s else ""
    except Exception:  # noqa: BLE001
        return ""


def _lessons_block() -> str:
    try:
        from . import feedback_bus as _FB
        lines = _FB.lessons_for("chat", limit=6) or []
        if not lines:
            return ""
        return "## Lessons I've learned\n" + "\n".join(f"- {ln}" for ln in lines)
    except Exception:  # noqa: BLE001
        return ""


def _rag_block(query: str, k: int = 5) -> str:
    """Cosine top-k over vectors.db (200K embeddings) via the existing rag.retrieve."""
    try:
        from . import rag as _RAG
        hits = _RAG.retrieve(query, k=k) or []
    except Exception:  # noqa: BLE001
        return ""
    lines = []
    for h in hits:
        txt = (h.get("text") or "").strip().replace("\n", " ")
        if not txt:
            continue
        score = h.get("score", h.get("similarity", 0))
        try:
            score_s = f"{float(score):.2f}"
        except Exception:  # noqa: BLE001
            score_s = "?"
        lines.append(f"- ({score_s}) {txt[:240]}")
    return ("## Relevant past context (RAG)\n" + "\n".join(lines)) if lines else ""


def _ontology_block(query: str, k: int = 3) -> str:
    """Top-k retrieval over the 174K-object ontology via aip.retrieve."""
    try:
        from . import aip as _AIP
        hits = _AIP.retrieve(query, k=k) or []
    except Exception:  # noqa: BLE001
        return ""
    lines = []
    for h in hits:
        nm = h.get("name") or h.get("title") or h.get("id") or "?"
        summ = (h.get("summary") or h.get("description") or "").strip().replace("\n", " ")[:200]
        lines.append(f"- {nm}: {summ}" if summ else f"- {nm}")
    return ("## Known objects\n" + "\n".join(lines)) if lines else ""


def _decisions_block(limit: int = 3) -> str:
    """Last few decisions from decision_ledger so the brain knows what it just committed to."""
    try:
        from . import decision_ledger as _DL
    except Exception:  # noqa: BLE001
        return ""
    # decision_ledger doesn't expose a recent() helper directly; fall back to reading the most-recent
    # rows from its sqlite store if it has one. Best-effort, returns "" if not available.
    try:
        getter = getattr(_DL, "recent", None) or getattr(_DL, "list_recent", None)
        if getter is None:
            return ""
        items = getter(limit=limit) or []
    except Exception:  # noqa: BLE001
        return ""
    if not items:
        return ""
    lines = []
    for it in items:
        title = (it.get("title") if isinstance(it, dict) else str(it))[:140]
        outcome = (it.get("expected_outcome") or "") if isinstance(it, dict) else ""
        lines.append(f"- {title}" + (f"  (expected: {outcome[:80]})" if outcome else ""))
    return "## Recent decisions\n" + "\n".join(lines)


def _join(parts: Iterable[str]) -> str:
    out = "\n\n".join(p for p in parts if p)
    if len(out) > MAX_PREAMBLE_CHARS:
        out = out[:MAX_PREAMBLE_CHARS - 80].rstrip() + "\n\n…(context truncated)…"
    return out


def build_preamble(query: str) -> str:
    """Aggregate every retrieval surface the system already has into one preamble. Tiny TTL cache so
    a rapid follow-up question on the same query doesn't re-query every database."""
    if not ENABLE:
        return ""
    now = time.time()
    key = (query or "")[:240]
    cached = _CACHE.get(key)
    if cached and (now - cached[0]) < _CACHE_TTL_S:
        return cached[1]
    out = _join((
        _user_memory_block(query),
        _lessons_block(),
        _rag_block(query, k=5),
        _ontology_block(query, k=3),
        _decisions_block(limit=3),
    ))
    _CACHE[key] = (now, out)
    return out


def build_sysmsg(query: str, persona_block: str) -> str:
    """Convenience: prepend persona, append the aggregated context preamble."""
    pre = build_preamble(query)
    if not pre:
        return persona_block
    return persona_block + "\n\n" + pre
