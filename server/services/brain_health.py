"""BRAIN HEALTH — vault hygiene over the second-brain notes (the ``/health`` layer
of an obsidian-style vault, mirroring COG-second-brain's vault-health checks).

It reads the live vault via the imported second-brain store (never edited; only
imported) and flags the classic knowledge-vault problems:

  * ``orphans``        — notes with no links in AND no links out (islands).
  * ``stale``          — notes not updated in more than ``BRAIN_STALE_DAYS``
                         days (env, default 90).
  * ``gaps``           — ``[[wikilinks]]`` that point at a title no note has yet
                         (the "missing page" gaps you should fill).
  * ``low_confidence`` — notes whose stored confidence is below a threshold.
  * ``contradictions`` — a transparent heuristic: notes that, on the same topic,
                         carry lines making opposite claims (is/is not, will/
                         won't, increase/decrease, etc.).

It also offers ``heal_orphans()`` which SUGGESTS (does not write) likely links
for each orphan via semantic search over the vault.

Design rules (mirrors the rest of the backend):
  * stdlib only (+ the embeddings/rag modules already in the tree).
  * NEVER raise — every public function degrades to a safe empty value.
  * read-only: ``health`` and ``heal_orphans`` never mutate the vault.
"""

from __future__ import annotations

import os
import re
import time
from typing import Any, Optional

# ── graceful imports (never edit these; only use them) ──────────────────────────────
try:
    from . import second_brain as sb  # type: ignore
except Exception:  # noqa: BLE001
    sb = None  # type: ignore

try:
    from . import embeddings  # type: ignore
except Exception:  # noqa: BLE001
    embeddings = None  # type: ignore


_DEFAULT_STALE_DAYS = 90
_LOW_CONFIDENCE = 0.5

_WIKILINK_RE = re.compile(r"\[\[([^\[\]|]+?)(?:\|[^\[\]]*)?\]\]")

# Opposed claim markers for the contradiction heuristic (each pair is symmetric).
_OPPOSITES = [
    (re.compile(r"\bis not\b|\bisn't\b|\bnot\b", re.IGNORECASE), re.compile(r"\bis\b", re.IGNORECASE)),
    (re.compile(r"\bwon't\b|\bwill not\b", re.IGNORECASE), re.compile(r"\bwill\b", re.IGNORECASE)),
    (re.compile(r"\bdecrease|declin|drop|fell|down\b", re.IGNORECASE), re.compile(r"\bincrease|grow|rose|rise|up\b", re.IGNORECASE)),
    (re.compile(r"\bfalse\b|\bincorrect\b|\bwrong\b", re.IGNORECASE), re.compile(r"\btrue\b|\bcorrect\b|\bright\b", re.IGNORECASE)),
    (re.compile(r"\bdisagree|oppose|against\b", re.IGNORECASE), re.compile(r"\bagree|support|in favou?r\b", re.IGNORECASE)),
]


def _stale_days() -> int:
    try:
        return max(1, int(os.environ.get("BRAIN_STALE_DAYS", _DEFAULT_STALE_DAYS)))
    except (TypeError, ValueError):
        return _DEFAULT_STALE_DAYS


def _now_ms() -> int:
    return int(time.time() * 1000)


def _all_notes() -> list[dict]:
    if sb is None:
        return []
    try:
        return sb.list_notes() or []
    except Exception:  # noqa: BLE001
        return []


def _wikilinks(body: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    try:
        for m in _WIKILINK_RE.finditer(str(body or "")):
            t = m.group(1).strip()
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
    except Exception:  # noqa: BLE001
        return out
    return out


def _title_index(notes: list[dict]) -> set[str]:
    return {str(n.get("title", "")).strip().lower() for n in notes if n.get("title")}


def _links_out(note: dict) -> list[str]:
    """Outgoing wikilink titles for a note — prefer the store's resolved links,
    fall back to parsing the body."""
    nid = note.get("id")
    if sb is not None and nid:
        try:
            rows = sb.links_of(nid) or []
            titles = [str(r.get("dst_title")) for r in rows if r.get("dst_title")]
            if titles:
                return titles
        except Exception:  # noqa: BLE001
            pass
    return _wikilinks(note.get("body_md", ""))


def _has_backlinks(title: str) -> bool:
    if sb is None or not title:
        return False
    try:
        return bool(sb.backlinks(title))
    except Exception:  # noqa: BLE001
        return False


def _contradiction_lines(body: str) -> list[tuple[str, str]]:
    """Find pairs of lines in one body that make opposed claims about (heuristically)
    the same subject — a transparent, honest contradiction signal, not an LLM."""
    pairs: list[tuple[str, str]] = []
    try:
        lines = [ln.strip() for ln in str(body or "").splitlines() if ln.strip()]
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                a, b = lines[i], lines[j]
                # require a shared content word (>3 chars) so it's the "same topic"
                wa = {w for w in re.findall(r"[a-z]{4,}", a.lower())}
                wb = {w for w in re.findall(r"[a-z]{4,}", b.lower())}
                if not (wa & wb):
                    continue
                for neg, pos in _OPPOSITES:
                    if (neg.search(a) and pos.search(b)) or (pos.search(a) and neg.search(b)):
                        pairs.append((a, b))
                        break
    except Exception:  # noqa: BLE001
        return pairs
    return pairs


def health() -> dict:
    """Run the full vault-health scan over every note. Returns
    ``{counts, orphans, stale, gaps, low_confidence, contradictions, score}``.

    ``score`` is a 0..100 health figure (100 = a perfectly clean vault). Honest
    zeros / empty lists when the vault is empty or unavailable. Never raises."""
    empty = {
        "counts": {"notes": 0, "orphans": 0, "stale": 0, "gaps": 0,
                   "low_confidence": 0, "contradictions": 0},
        "orphans": [], "stale": [], "gaps": [], "low_confidence": [],
        "contradictions": [], "score": 100,
    }
    notes = _all_notes()
    if not notes:
        return empty

    titles = _title_index(notes)
    stale_ms = _stale_days() * 24 * 3600 * 1000
    now = _now_ms()

    orphans: list[dict] = []
    stale: list[dict] = []
    low_conf: list[dict] = []
    contradictions: list[dict] = []
    gap_set: dict[str, set] = {}  # missing title -> set of source titles

    for n in notes:
        title = str(n.get("title", ""))
        out_links = _links_out(n)

        # orphan: no out-links AND nothing links to it
        if not out_links and not _has_backlinks(title):
            orphans.append({"id": n.get("id"), "title": title, "kind": n.get("kind")})

        # stale: updated_ts older than the threshold
        try:
            updated = int(n.get("updated_ts") or 0)
            if updated and (now - updated) > stale_ms:
                stale.append({
                    "id": n.get("id"), "title": title,
                    "updated_ts": updated,
                    "age_days": round((now - updated) / (24 * 3600 * 1000), 1),
                })
        except (TypeError, ValueError):
            pass

        # gaps: wikilinks to a title that no note has
        for tgt in out_links:
            if tgt.strip().lower() not in titles:
                gap_set.setdefault(tgt, set()).add(title)

        # low confidence
        try:
            conf = float(n.get("confidence")) if n.get("confidence") is not None else 1.0
            if conf < _LOW_CONFIDENCE:
                low_conf.append({"id": n.get("id"), "title": title, "confidence": conf})
        except (TypeError, ValueError):
            pass

        # contradictions inside one note's body
        for a, b in _contradiction_lines(n.get("body_md", "")):
            contradictions.append({"id": n.get("id"), "title": title, "lines": [a, b]})

    gaps = [
        {"missing_title": k, "linked_from": sorted(v)}
        for k, v in sorted(gap_set.items())
    ]

    counts = {
        "notes": len(notes),
        "orphans": len(orphans),
        "stale": len(stale),
        "gaps": len(gaps),
        "low_confidence": len(low_conf),
        "contradictions": len(contradictions),
    }

    # score: start at 100, deduct a weighted, capped penalty per problem class.
    problems = (len(orphans) + len(stale) + len(gaps)
                + len(low_conf) + 2 * len(contradictions))
    denom = max(1, len(notes))
    score = max(0, round(100 - 100 * min(1.0, problems / (denom * 2))))

    return {
        "counts": counts,
        "orphans": orphans,
        "stale": stale,
        "gaps": gaps,
        "low_confidence": low_conf,
        "contradictions": contradictions,
        "score": score,
    }


def heal_orphans(k: int = 3) -> dict:
    """For each orphan note, SUGGEST up to ``k`` likely links via semantic search
    over the rest of the vault. Suggestions ONLY — nothing is written.

    Returns ``{suggestions: [{title, id, candidates:[{title,id,score}]}], count}``.
    Honest empty when there are no orphans or no index. Never raises."""
    out = {"suggestions": [], "count": 0,
           "note": "suggestions only — no links are written to the vault"}
    try:
        k = max(1, int(k))
    except (TypeError, ValueError):
        k = 3

    h = health()
    orphans = h.get("orphans", [])
    if not orphans or sb is None or embeddings is None:
        return out

    suggestions: list[dict] = []
    for orph in orphans:
        title = orph.get("title") or ""
        note = None
        try:
            note = sb.get_note(orph.get("id") or title)
        except Exception:  # noqa: BLE001
            note = None
        query = f"{title}\n{note.get('body_md', '') if note else ''}".strip()
        candidates: list[dict] = []
        try:
            hits = embeddings.search(query, k=k + 1) or []
        except Exception:  # noqa: BLE001
            hits = []
        for hit in hits:
            meta = hit.get("meta") or {}
            cand_title = meta.get("title")
            # skip the orphan itself
            if hit.get("id") == orph.get("id"):
                continue
            if cand_title and str(cand_title).strip().lower() == title.strip().lower():
                continue
            candidates.append({
                "title": cand_title or hit.get("id"),
                "id": hit.get("id"),
                "score": hit.get("score"),
            })
            if len(candidates) >= k:
                break
        suggestions.append({"title": title, "id": orph.get("id"), "candidates": candidates})

    out["suggestions"] = suggestions
    out["count"] = len(suggestions)
    return out
