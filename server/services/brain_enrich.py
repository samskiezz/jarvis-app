"""BRAIN ENRICH — gap-driven, multi-source external knowledge acquisition.

The autopilot (``brain_autopilot.py``) consolidates what the vault ALREADY knows.
This module goes outward: it takes the vault's real knowledge gaps (referenced-
but-missing concepts, low-confidence notes) and fetches genuine factual data for
them from a REGISTRY of open-data connectors (``brain_sources``), writing
GROUNDED, CITED notes with cross-source corroboration.

Integrity rules:
  * Only ACTUAL gaps are enriched (referenced-but-missing titles / low-confidence
    notes / explicit queries) — this fills holes, it doesn't dump a corpus.
  * Stored text is a BOUNDED factual summary + a source URL + license/attribution
    (snippet-scale, like a search result), never a wholesale copy of the source.
  * Every enriched note carries ``frontmatter.source`` + ``frontmatter.url`` +
    ``frontmatter.sources`` (all corroborating connectors) + ``frontmatter.fetched_ts``
    so provenance is explicit and auditable.
  * Network is optional: no egress / no result → honest empty, never raises.
  * stdlib only (urllib via brain_sources) — no new dependency.
"""

from __future__ import annotations

import re
import time

try:
    from . import brain_health as bh
except Exception:  # noqa: BLE001
    bh = None  # type: ignore
try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
try:
    from . import brain_sources as srcs
except Exception:  # noqa: BLE001
    srcs = None  # type: ignore

# terms that are code/structural noise, not real-world concepts worth scraping
_STOPish = {
    "async", "await", "return", "const", "let", "function", "export", "import",
    "router", "props", "params", "true", "false", "none", "null", "self",
    "class", "def", "from", "this", "value", "title", "body", "data", "type",
    "name", "list", "dict", "str", "int", "the", "and", "for", "with",
}


def network_ok() -> bool:
    """Cheap reachability probe via the primary connector."""
    if srcs is None:
        return False
    try:
        return srcs.fetch_wikipedia("Earth") is not None
    except Exception:  # noqa: BLE001
        return False


def sources_catalog() -> list[dict]:
    return srcs.catalog() if srcs else []


def sources_probe(names: list[str] | None = None) -> dict:
    return srcs.probe(names) if srcs else {}


def _is_concept_like(term: str) -> bool:
    t = (term or "").strip().lower()
    if len(t) < 4 or t in _STOPish:
        return False
    return bool(re.fullmatch(r"[a-z][a-z \-]+[a-z]", t))


def _gap_terms(limit: int) -> list[str]:
    """Real gap terms to enrich: missing-titles + low-confidence note titles."""
    if bh is None:
        return []
    terms: list[str] = []
    try:
        h = bh.health()
        for g in h.get("gaps", []):
            t = g.get("missing_title") or ""
            if _is_concept_like(t):
                terms.append(t)
        for lc in h.get("low_confidence", []):
            t = lc.get("title") or ""
            if _is_concept_like(t):
                terms.append(t)
    except Exception:  # noqa: BLE001
        return []
    seen, out = set(), []
    for t in terms:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out[: max(1, int(limit))]


def _write_enriched(primary: dict, hits: list[dict], *, referrers: list[str] | None = None) -> bool:
    if sb is None or not primary:
        return False
    cite = ""
    if referrers:
        cite = " Referenced by " + " ".join(f"[[{r}]]" for r in referrers[:6])
    # corroborating source line (multi-source provenance, deduped by name)
    seen, src_lines, src_meta = set(), [], []
    for h in hits:
        if h["source"] in seen:
            continue
        seen.add(h["source"])
        src_lines.append(f"- {h['source']} ({h['license']}): {h['url']}")
        src_meta.append({"name": h["source"], "url": h["url"], "license": h["license"]})
    body = (
        f"{primary['description']}\n\n{primary['extract']}\n\n"
        f"Sources ({len(src_meta)}):\n" + "\n".join(src_lines) + cite
    ).strip()
    fm = {
        "source": primary["source"],
        "url": primary["url"],
        "sources": src_meta,
        "kind": primary["kind"],
        "license": primary["license"],
        "fetched_ts": int(time.time() * 1000),
        "enriched": True,
    }
    # confidence rises with corroboration: 0.7 single, up to 0.9 multi-source
    conf = min(0.9, 0.7 + 0.05 * (len(src_meta) - 1))
    try:
        return bool(sb.upsert_note("concept", primary["title"], body, fm, conf))
    except Exception:  # noqa: BLE001
        return False


def enrich(terms: list[str] | None = None, *, limit: int = 20,
           only: list[str] | None = None) -> dict:
    """Fetch external knowledge for real gaps (or explicit ``terms``) across the
    connector registry and write grounded, cited, corroborated notes.

    Returns ``{requested, fetched, written, offline, sources_used, items:[...]}``.
    ``only`` restricts to a subset of connector names.
    """
    out = {"requested": 0, "fetched": 0, "written": 0, "offline": False,
           "sources_used": {}, "items": []}
    if sb is None or srcs is None:
        return out
    if not network_ok():
        out["offline"] = True
        return out

    referrers: dict[str, list[str]] = {}
    if terms is None:
        try:
            for g in (bh.health().get("gaps", []) if bh else []):
                mt = (g.get("missing_title") or "").lower()
                if mt:
                    referrers[mt] = g.get("linked_from", [])
        except Exception:  # noqa: BLE001
            referrers = {}
        terms = _gap_terms(limit)
    else:
        terms = [t for t in terms if _is_concept_like(t)][: max(1, int(limit))]

    out["requested"] = len(terms)
    for t in terms:
        primary, hits = srcs.fetch_best(t, only=only)
        if not primary:
            continue
        out["fetched"] += 1
        for h in hits:
            out["sources_used"][h["source"]] = out["sources_used"].get(h["source"], 0) + 1
        if _write_enriched(primary, hits, referrers=referrers.get(t.lower())):
            out["written"] += 1
            out["items"].append({
                "title": primary["title"], "url": primary["url"],
                "primary_source": primary["source"],
                "corroborated_by": sorted({h["source"] for h in hits}),
            })
        time.sleep(0.1)
    return out
