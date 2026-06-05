"""BRAIN AUTOPILOT — the self-improving loop that auto-fills the vault's own
knowledge gaps.

The vault already *detects* gaps (``brain_health.health``), *suggests* orphan
links (``brain_health.heal_orphans`` — suggestions only), and *finds* emergent
un-named themes (``brain_think.emerge``). Those primitives are passive: they
report, they never write. This module is the active layer — it CLOSES the gaps
and grows the graph, then re-scans and repeats until improvement plateaus.

Every action is grounded in evidence already in the vault (no LLM, no fabricated
facts):

  * RESOLVE DANGLERS  — a ``gap`` is a ``[[wikilink]]`` to a title that has no
    note. We create that missing note as a real ``concept`` stub whose body
    cites the notes that referenced it, which back-fills the dangling links into
    real synapses. (closes gaps, +neurons, +synapses)
  * CONNECT ORPHANS   — apply ``heal_orphans`` suggestions above a similarity
    threshold by appending the suggested ``[[links]]`` to the orphan's body.
    (removes orphans, +synapses)
  * PROMOTE THEMES     — an emergent term used across many notes but not yet a
    title becomes a real ``concept`` note linked to the notes it emerged from.
    (+neurons, +synapses)

Design rules (mirror the rest of the backend): stdlib only, NEVER raise, every
public function degrades to an honest result. Writes go through
``second_brain.upsert_note`` so ontology-mirroring + embedding-indexing happen
for free and ids stay consistent.
"""

from __future__ import annotations

import re

try:
    from . import brain_health as bh
except Exception:  # noqa: BLE001
    bh = None  # type: ignore
try:
    from . import brain_think as bt
except Exception:  # noqa: BLE001
    bt = None  # type: ignore
try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore

# tuneable, conservative defaults — favour precision so the brain doesn't drift
ORPHAN_MIN_SCORE = 0.18      # min cosine similarity before we'll auto-link an orphan
ORPHAN_LINKS_EACH = 2        # max suggested links written per orphan per pass
THEME_MIN_COUNT = 3          # an emergent term must appear in >= this many notes
GAP_MIN_SOURCES = 1          # a missing title must be referenced at least this often


def _counts() -> tuple[int, int]:
    """(notes, links) currently in the vault — the honest neuron/synapse totals."""
    if sb is None:
        return (0, 0)
    try:
        cat = sb.index_catalog()
        notes = int(cat.get("total", 0))
    except Exception:  # noqa: BLE001
        notes = 0
    links = 0
    try:
        import sqlite3
        from .second_brain import _db_path  # type: ignore
        conn = sqlite3.connect(_db_path())
        try:
            links = int(conn.execute("SELECT COUNT(*) FROM note_link").fetchone()[0])
        finally:
            conn.close()
    except Exception:  # noqa: BLE001
        links = 0
    return (notes, links)


def scan() -> dict:
    """Report the vault's current knowledge gaps without changing anything.

    ``{notes, links, score, gaps, orphans, low_confidence, stale, themes,
    fixable}`` where ``fixable`` is an upper bound on what one run could close."""
    notes, links = _counts()
    out = {
        "notes": notes, "links": links, "score": 100,
        "gaps": 0, "orphans": 0, "low_confidence": 0, "stale": 0, "themes": 0,
        "fixable": 0,
    }
    if bh is None:
        return out
    try:
        h = bh.health()
        c = h.get("counts", {})
        out["score"] = int(h.get("score", 100))
        out["gaps"] = int(c.get("gaps", 0))
        out["orphans"] = int(c.get("orphans", 0))
        out["low_confidence"] = int(c.get("low_confidence", 0))
        out["stale"] = int(c.get("stale", 0))
    except Exception:  # noqa: BLE001
        pass
    try:
        if bt is not None:
            em = bt.emerge(days=3650, top=50)
            out["themes"] = sum(1 for t in em.get("terms", []) if int(t.get("count", 0)) >= THEME_MIN_COUNT)
    except Exception:  # noqa: BLE001
        pass
    out["fixable"] = out["gaps"] + out["orphans"] + out["themes"]
    return out


def _resolve_danglers() -> int:
    """Create concept stubs for referenced-but-missing titles. Returns # closed."""
    if bh is None or sb is None:
        return 0
    closed = 0
    try:
        gaps = bh.health().get("gaps", [])
    except Exception:  # noqa: BLE001
        return 0
    for g in gaps:
        # health() gaps: {"missing_title": <title>, "linked_from": [<source titles>]}
        title = (g.get("missing_title") or g.get("title") or "").strip()
        if not title:
            continue
        sources = g.get("linked_from") or g.get("sources") or []
        if len(sources) < GAP_MIN_SOURCES and sources:
            continue
        cite = " ".join(f"[[{str(s)}]]" for s in sources[:8]) if sources else ""
        body = f"Concept referenced across the vault.{(' Referenced by ' + cite) if cite else ''}".strip()
        try:
            if sb.upsert_note("concept", title, body, {"autopilot": "resolved_dangler"}, 0.5):
                closed += 1
        except Exception:  # noqa: BLE001
            continue
    return closed


def _connect_orphans() -> int:
    """Apply high-confidence heal-orphan suggestions as real links. Returns # linked."""
    if bh is None or sb is None:
        return 0
    linked = 0
    try:
        sug = bh.heal_orphans(k=ORPHAN_LINKS_EACH + 2).get("suggestions", [])
    except Exception:  # noqa: BLE001
        return 0
    for s in sug:
        oid = s.get("id")
        title = s.get("title")
        cands = [c for c in s.get("candidates", []) if float(c.get("score", 0)) >= ORPHAN_MIN_SCORE]
        cands = cands[:ORPHAN_LINKS_EACH]
        if not cands or not (oid or title):
            continue
        try:
            note = sb.get_note(oid or title)
            if not note:
                continue
            add = " ".join(f"[[{c['title']}]]" for c in cands)
            body = (note.get("body_md") or "").rstrip()
            if add and add not in body:
                body = f"{body}\n\nRelated: {add}".strip()
                if sb.upsert_note(note.get("kind", "concept"), note["title"], body,
                                  note.get("frontmatter"), note.get("confidence")):
                    linked += 1
        except Exception:  # noqa: BLE001
            continue
    return linked


def _promote_themes() -> int:
    """Promote frequent un-named terms into real concept notes. Returns # promoted."""
    if bt is None or sb is None:
        return 0
    promoted = 0
    try:
        terms = bt.emerge(days=3650, top=50).get("terms", [])
    except Exception:  # noqa: BLE001
        return 0
    for t in terms:
        term = str(t.get("term", "")).strip()
        cnt = int(t.get("count", 0))
        if not term or len(term) < 3 or cnt < THEME_MIN_COUNT:
            continue
        # link the new theme note to a few notes it actually emerged from
        cite = ""
        try:
            from . import embeddings
            hits = embeddings.search(term, k=4, kind="note") if embeddings else []
            cite = " ".join(f"[[{h['meta'].get('title')}]]" for h in hits
                            if isinstance(h.get("meta"), dict) and h["meta"].get("title"))
        except Exception:  # noqa: BLE001
            cite = ""
        body = f"Emergent theme appearing in ~{cnt} notes.{(' Seen in ' + cite) if cite else ''}".strip()
        try:
            if sb.upsert_note("concept", term, body, {"autopilot": "promoted_theme", "frequency": cnt}, 0.6):
                promoted += 1
        except Exception:  # noqa: BLE001
            continue
    return promoted


def run_pass() -> dict:
    """One improvement pass. Returns the real before/after deltas."""
    n0, l0 = _counts()
    s0 = scan().get("score", 100)
    danglers = _resolve_danglers()
    orphans = _connect_orphans()
    themes = _promote_themes()
    n1, l1 = _counts()
    s1 = scan().get("score", 100)
    return {
        "danglers_resolved": danglers,
        "orphans_connected": orphans,
        "themes_promoted": themes,
        "neurons_added": n1 - n0,
        "synapses_added": l1 - l0,
        "score_before": s0, "score_after": s1,
        "notes_after": n1, "links_after": l1,
        "did_work": (danglers + orphans + themes) > 0,
    }


def run(max_passes: int = 5) -> dict:
    """Run improvement passes until the brain stops improving (convergence) or
    ``max_passes`` is hit. Returns the per-pass log + cumulative totals."""
    try:
        max_passes = max(1, min(20, int(max_passes)))
    except (TypeError, ValueError):
        max_passes = 5
    n0, l0 = _counts()
    s0 = scan().get("score", 100)
    passes = []
    for _ in range(max_passes):
        p = run_pass()
        passes.append(p)
        if not p["did_work"]:
            break
    n1, l1 = _counts()
    s1 = scan().get("score", 100)
    return {
        "passes_run": len(passes),
        "converged": bool(passes and not passes[-1]["did_work"]),
        "neurons_added": n1 - n0,
        "synapses_added": l1 - l0,
        "score_before": s0, "score_after": s1,
        "notes_total": n1, "links_total": l1,
        "passes": passes,
    }
