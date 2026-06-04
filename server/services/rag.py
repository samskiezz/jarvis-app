"""RAG — grounded retrieval over the semantic index (P9 #62/#67/#68).

This module does the *retrieval + grounding* half of Retrieval-Augmented
Generation. It deliberately does NOT call any LLM: it retrieves the most
relevant indexed documents (via :mod:`embeddings`) and assembles a compact,
cited grounding string + a structured source list that the chat / AIP layer can
drop into a prompt.

It also exposes a small, *transparent* natural-language → structured-filter
heuristic (:func:`nl_query`). It is an honest keyword parser, not a model —
every interpretation is reported in the response under ``interpreted`` and
flagged ``"heuristic": True`` so callers never mistake it for real NLU.

Design rules (mirrors the rest of the backend):
  * stdlib + numpy only.
  * never raise — degrades to empty/sensible values.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from . import embeddings


# ── retrieval ──────────────────────────────────────────────────────────────────────
def retrieve(query: str, k: int = 6, kind: Optional[str] = None) -> list[dict]:
    """Top-``k`` documents from the semantic index for ``query``.

    Returns the raw ``embeddings.search`` rows (``[{id,kind,score,text,meta}]``).
    Never raises; empty store / blank query → []."""
    try:
        return embeddings.search(query, k=k, kind=kind)
    except Exception:  # noqa: BLE001
        return []


def _snippet(text: str, width: int = 240) -> str:
    t = " ".join(str(text or "").split())
    return t[:width]


def build_context(query: str, k: int = 6, kind: Optional[str] = None) -> dict:
    """Assemble a grounding payload for an LLM prompt.

    Returns ``{query, context, sources, count}`` where:
      * ``context`` is a compact, numbered, citation-tagged block of the
        retrieved documents (``[1] label (type): text ...``), ready to be
        prepended to a prompt — NO LLM is called here.
      * ``sources`` is the structured list of retrieved docs with their cosine
        score and metadata, for UI citations / provenance.

    Never raises; empty retrieval → an empty-but-well-formed payload."""
    hits = retrieve(query, k=k, kind=kind)
    sources: list[dict] = []
    lines: list[str] = []
    for i, h in enumerate(hits, 1):
        meta = h.get("meta") or {}
        label = meta.get("label") or h.get("id")
        htype = meta.get("type") or h.get("kind")
        snippet = _snippet(h.get("text", ""))
        lines.append(f"[{i}] {label} ({htype}): {snippet}")
        sources.append(
            {
                "ref": i,
                "id": h.get("id"),
                "kind": h.get("kind"),
                "label": label,
                "type": htype,
                "score": h.get("score"),
                "snippet": snippet,
                "meta": meta,
            }
        )
    if lines:
        header = (
            "Use ONLY the following retrieved context to answer. "
            "Cite sources by their [n] reference.\n\n"
        )
        context = header + "\n".join(lines)
    else:
        context = "No relevant context was retrieved for this query."
    return {
        "query": query,
        "context": context,
        "sources": sources,
        "count": len(sources),
    }


# ── natural-language → structured filter (transparent heuristic) ────────────────────
# Word forms that hint at a type, mapped to the canonical ontology type ids.
_TYPE_ALIASES = {
    "person": "person",
    "people": "person",
    "persons": "person",
    "org": "org",
    "orgs": "org",
    "organization": "org",
    "organizations": "org",
    "organisation": "org",
    "company": "org",
    "companies": "org",
    "client": "client",
    "clients": "client",
    "investment": "invest",
    "investments": "invest",
    "invest": "invest",
    "asset": "asset",
    "assets": "asset",
    "property": "property",
    "properties": "property",
    "creative": "creative",
    "target": "target",
    "targets": "target",
    "risk": "risk",
    "risks": "risk",
}

# Phrases like "of type X", "type:X", "X objects".
_TYPE_PHRASE_RE = re.compile(
    r"\b(?:of\s+type|type\s*[:=]?|kind\s+of)\s+([a-z_]+)", re.IGNORECASE
)
_SINCE_RE = re.compile(
    r"\bsince\s+([0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?|[a-z]+\s*[0-9]{4})",
    re.IGNORECASE,
)
_NEAR_RE = re.compile(r"\bnear\s+([a-z0-9 ,.'-]+?)(?:\s+(?:since|of|with)\b|$)", re.IGNORECASE)


def nl_query(query: str, *, limit: int = 25) -> dict:
    """Parse a simple natural-language phrase into an ontology query and run it.

    This is a transparent keyword heuristic (NOT a language model). It recognizes:
      * a TYPE intent — "... of type X", "type:X", "show people/orgs/clients ...",
        or a bare type word anywhere in the phrase.
      * a NEAR intent — "near <place>" (recorded for the caller; geo filtering is
        left to the geo layer).
      * a SINCE intent — "since <year|date>" (recorded for the caller).

    Returns ``{query, interpreted, results, count, heuristic: True}`` where
    ``interpreted`` shows exactly what was parsed (type / near / since / terms)
    and ``results`` are the matching ontology objects from
    ``ontology_store.query_objects``. Never raises."""
    q = str(query or "")
    interpreted: dict[str, Any] = {
        "type": None,
        "near": None,
        "since": None,
        "terms": [],
        "heuristic": True,
        "note": "transparent keyword heuristic, not an LLM",
    }

    try:
        # explicit "of type X" / "type:X" phrasing wins.
        m = _TYPE_PHRASE_RE.search(q)
        if m:
            cand = m.group(1).lower()
            interpreted["type"] = _TYPE_ALIASES.get(cand, cand)

        # near <place>
        mnear = _NEAR_RE.search(q)
        if mnear:
            interpreted["near"] = mnear.group(1).strip(" ,.")

        # since <year|date>
        msince = _SINCE_RE.search(q)
        if msince:
            interpreted["since"] = msince.group(1).strip()

        tokens = re.findall(r"[a-z0-9]+", q.lower())
        # bare type word fallback (only if not already set explicitly).
        if interpreted["type"] is None:
            for tok in tokens:
                if tok in _TYPE_ALIASES:
                    interpreted["type"] = _TYPE_ALIASES[tok]
                    break

        # residual free-text terms (drop stopwords + recognized intent words).
        stop = {
            "show", "me", "all", "the", "of", "type", "kind", "near", "since",
            "with", "a", "an", "and", "list", "find", "get", "objects", "object",
        }
        consumed = set()
        if interpreted["type"]:
            for alias, canon in _TYPE_ALIASES.items():
                if canon == interpreted["type"]:
                    consumed.add(alias)
            consumed.add(str(interpreted["type"]))
        terms = [t for t in tokens if t not in stop and t not in consumed]
        interpreted["terms"] = terms
    except Exception:  # noqa: BLE001
        pass

    # run the structured query against the live ontology store.
    results: list[dict] = []
    try:
        from . import ontology_store

        results = ontology_store.query_objects(
            type=interpreted["type"], limit=limit
        )
        # if free-text terms remain, narrow by substring match on label/props text.
        terms = interpreted.get("terms") or []
        if terms and results:
            def _hit(obj: dict) -> bool:
                blob = (
                    f"{obj.get('label','')} {embeddings._object_text(obj)}"
                ).lower()
                return any(t in blob for t in terms)

            narrowed = [o for o in results if _hit(o)]
            # only narrow if it doesn't wipe everything (keep it honest/useful).
            if narrowed:
                results = narrowed
    except Exception:  # noqa: BLE001
        results = []

    return {
        "query": q,
        "interpreted": interpreted,
        "results": results,
        "count": len(results),
        "heuristic": True,
    }
