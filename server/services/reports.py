"""REPORTS — intelligence BRIEF generation + a saved-report store (P0).

A SQLite-backed (stdlib ``sqlite3``, no ORM) store of generated/saved reports,
plus a pure-python brief composer that assembles a structured intelligence brief
from the live services:

  * the relevant ontology **objects** (by case / explicit ids / search query),
  * their **links / neighbors** (the relationship graph around them),
  * related **risk signals** (risk-typed objects that touch them),
  * recent investigation **notes** (if a case is supplied),
  * the current **live markets** snapshot (best-effort, never blocks).

The composition is *pure python* — no LLM is required. If a Kimi API key is
present (``KIMI_API_KEY``) an optional polish pass can be attempted, but it
degrades gracefully (and silently) to the deterministic markdown on any failure.

Design doctrine (mirrors history_lake.py / cases.py / ontology_store.py):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``).
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/zero value on error.

DB path comes from the env var ``REPORTS_DB`` (default
``server/data/reports.db``). Tests pass an explicit temp path via the env var.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "reports.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``REPORTS_DB`` before
    the first connection."""
    return os.environ.get("REPORTS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, default=str)
    except (TypeError, ValueError):
        return "{}"


def _loads(text: Optional[str]) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return {}


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS report (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL DEFAULT '',
    meta_json  TEXT    NOT NULL DEFAULT '{}',
    created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_report_created ON report (created_ts);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL. ``check_same_thread=False`` so the FastAPI
    threadpool/asyncio loop can share it."""
    path = db_path or _db_path()
    if path != ":memory:":
        parent = os.path.dirname(path)
        if parent and not os.path.isdir(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except OSError:
                pass
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        if path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.Error:
        pass
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Create the report table/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── service accessors (lazy, never raise) ────────────────────────────────────────
def _ontology():
    try:
        from . import ontology_store

        return ontology_store
    except Exception:  # noqa: BLE001
        return None


def _markets_snapshot() -> list[dict]:
    """Best-effort live markets list. Returns [] without network / on any error.

    ``get_live_intel`` is async; we run it on a private loop so this composer can
    stay synchronous. Any failure (no network, timeout) degrades to []."""
    try:
        import asyncio

        from .live_intel import get_live_intel
    except Exception:  # noqa: BLE001
        return []
    try:
        try:
            asyncio.get_running_loop()
            # Already inside an event loop — don't block it; skip live fetch.
            return []
        except RuntimeError:
            pass
        snapshot = asyncio.run(get_live_intel())
        markets = snapshot.get("markets") if isinstance(snapshot, dict) else None
        return markets if isinstance(markets, list) else []
    except Exception:  # noqa: BLE001
        return []


# ── object collection ────────────────────────────────────────────────────────────
def _collect_object_ids(
    case_id: Optional[int],
    entity_ids: Optional[list[str]],
    query: Optional[str],
) -> list[str]:
    """Resolve the set of seed object ids the brief is about, from any of the
    three input modes. Order-preserving + deduped."""
    ids: list[str] = []

    def _add(eid: Any) -> None:
        s = str(eid)
        if s and s not in ids:
            ids.append(s)

    # 1. explicit entity ids
    for e in entity_ids or []:
        _add(e)

    # 2. a case's attached entities (+ its notes are pulled later)
    if case_id is not None:
        try:
            from . import cases as cases_svc

            case = cases_svc.get_case(case_id)
            if case:
                for e in case.get("entity_ids") or []:
                    _add(e)
        except Exception:  # noqa: BLE001
            pass

    # 3. a free-text search query → top hits from the search index
    if query:
        try:
            from . import search as search_svc

            for hit in search_svc.search(query, limit=10):
                if isinstance(hit, dict) and hit.get("id"):
                    _add(hit["id"])
        except Exception:  # noqa: BLE001
            pass

    return ids


def _gather(
    case_id: Optional[int],
    entity_ids: Optional[list[str]],
    query: Optional[str],
) -> dict:
    """Pull objects, their neighbors, risks, notes and markets into one bundle.

    Returns a dict the composer renders. Never raises — missing pieces are just
    empty."""
    ont = _ontology()
    ids = _collect_object_ids(case_id, entity_ids, query)

    objects: list[dict] = []
    seen_obj: set[str] = set()
    links: list[dict] = []
    seen_link: set[str] = set()
    neighbors: list[dict] = []
    seen_nb: set[str] = set()
    risks: list[dict] = []
    seen_risk: set[str] = set()

    if ont is not None:
        for oid in ids:
            try:
                obj = ont.get_object(oid)
            except Exception:  # noqa: BLE001
                obj = None
            if obj and obj["id"] not in seen_obj:
                seen_obj.add(obj["id"])
                objects.append(obj)
            # neighborhood (1 hop) — links + neighbor objects
            try:
                nb = ont.neighbors(oid, depth=1)
            except Exception:  # noqa: BLE001
                nb = {"objects": [], "links": []}
            for lk in nb.get("links") or []:
                lid = lk.get("id")
                if lid and lid not in seen_link:
                    seen_link.add(lid)
                    links.append(lk)
            for no in nb.get("objects") or []:
                nid = no.get("id")
                if not nid:
                    continue
                if no.get("type") == "risk":
                    if nid not in seen_risk:
                        seen_risk.add(nid)
                        risks.append(no)
                elif nid not in seen_nb and nid not in seen_obj:
                    seen_nb.add(nid)
                    neighbors.append(no)

    # notes from the case, if any
    notes: list[dict] = []
    case_title: Optional[str] = None
    if case_id is not None:
        try:
            from . import cases as cases_svc

            case = cases_svc.get_case(case_id)
            if case:
                case_title = case.get("title")
                ns = case.get("notes")
                if isinstance(ns, list):
                    notes = ns[-10:]  # most recent
        except Exception:  # noqa: BLE001
            pass

    markets = _markets_snapshot()

    return {
        "object_ids": ids,
        "objects": objects,
        "neighbors": neighbors,
        "links": links,
        "risks": risks,
        "notes": notes,
        "markets": markets,
        "case_id": case_id,
        "case_title": case_title,
        "query": query,
    }


# ── markdown composition ─────────────────────────────────────────────────────────
def _props_lines(props: Any) -> list[str]:
    out: list[str] = []
    if isinstance(props, dict):
        for k, v in props.items():
            out.append(f"  - **{k}:** {v}")
    return out


def _compose_markdown(title: str, bundle: dict) -> tuple[str, list[dict]]:
    """Build the markdown body + the structured sections list from a bundle."""
    objects = bundle["objects"]
    neighbors = bundle["neighbors"]
    links = bundle["links"]
    risks = bundle["risks"]
    notes = bundle["notes"]
    markets = bundle["markets"]

    sections: list[dict] = []

    # ── Summary ──
    primary = ", ".join(o.get("label") or o.get("id") for o in objects) or "—"
    summary_parts = [
        f"This brief covers **{len(objects)}** primary "
        f"{'entity' if len(objects) == 1 else 'entities'}"
        + (f" ({primary})" if objects else "")
        + ".",
        f"It maps **{len(links)}** relationship(s) to **{len(neighbors)}** "
        f"connected object(s)"
        + (f", and flags **{len(risks)}** related risk signal(s)" if risks else "")
        + ".",
    ]
    if notes:
        summary_parts.append(f"**{len(notes)}** recent investigation note(s) attached.")
    if markets:
        summary_parts.append(f"Live market snapshot includes **{len(markets)}** instrument(s).")
    if not objects:
        summary_parts.append(
            "No matching entities were resolved from the supplied inputs — "
            "the brief is empty beyond this summary."
        )
    summary_md = " ".join(summary_parts)
    sections.append({"title": "Summary", "body": summary_md})

    # ── Entities ──
    ent_lines: list[str] = []
    for o in objects:
        mark = f" `{o.get('mark')}`" if o.get("mark") else ""
        ent_lines.append(f"- **{o.get('label') or o.get('id')}** ({o.get('type')}){mark}")
        ent_lines.extend(_props_lines(o.get("props")))
    entities_md = "\n".join(ent_lines) if ent_lines else "_No entities resolved._"
    sections.append({"title": "Entities", "body": entities_md})

    # ── Relationships ──
    label_by_id: dict[str, str] = {}
    for o in objects + neighbors + risks:
        if o.get("id"):
            label_by_id[o["id"]] = o.get("label") or o["id"]
    rel_lines: list[str] = []
    for lk in links:
        a = label_by_id.get(lk.get("a"), lk.get("a"))
        b = label_by_id.get(lk.get("b"), lk.get("b"))
        rel = lk.get("relation") or "RELATED"
        rel_lines.append(f"- {a} —[{rel}]→ {b}")
    relationships_md = "\n".join(rel_lines) if rel_lines else "_No relationships found._"
    sections.append({"title": "Relationships", "body": relationships_md})

    # ── Risks ──
    risk_lines: list[str] = []
    for r in risks:
        props = r.get("props") or {}
        sev = props.get("severity")
        sev_txt = f" (severity {sev})" if sev is not None else ""
        risk_lines.append(f"- **{r.get('label') or r.get('id')}**{sev_txt}")
        risk_lines.extend(_props_lines(props))
    risks_md = "\n".join(risk_lines) if risk_lines else "_No related risk signals._"
    sections.append({"title": "Risks", "body": risks_md})

    # ── Notes (optional) ──
    if notes:
        note_lines = []
        for n in notes:
            by = n.get("by", "system")
            note_lines.append(f"- _{by}_: {n.get('text', '')}")
        sections.append({"title": "Notes", "body": "\n".join(note_lines)})

    # ── Data (live markets) ──
    data_lines: list[str] = []
    for m in markets:
        sym = m.get("display") or m.get("sym") or "?"
        price = m.get("price")
        chg = m.get("change_pct")
        chg_txt = f" ({chg:+.2f}%)" if isinstance(chg, (int, float)) else ""
        data_lines.append(f"- **{sym}**: {price}{chg_txt}")
    data_md = "\n".join(data_lines) if data_lines else "_No live market data available._"
    sections.append({"title": "Data", "body": data_md})

    # assemble full markdown
    parts = [f"# {title}", ""]
    for s in sections:
        parts.append(f"## {s['title']}")
        parts.append("")
        parts.append(s["body"])
        parts.append("")
    markdown = "\n".join(parts).rstrip() + "\n"
    return markdown, sections


def _maybe_polish(markdown: str) -> str:
    """Optional Kimi polish pass. Returns the original markdown unchanged on any
    failure / when no key is configured. Never raises, never blocks the brief."""
    try:
        from ..config import KIMI_API_KEY, KIMI_BASE_URL, KIMI_MODEL
    except Exception:  # noqa: BLE001
        return markdown
    if not KIMI_API_KEY:
        return markdown
    try:
        import httpx

        resp = httpx.post(
            f"{KIMI_BASE_URL.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {KIMI_API_KEY}"},
            json={
                "model": KIMI_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an intelligence analyst. Tighten and "
                        "professionalise the following markdown brief. Keep all "
                        "facts, headings and structure; return only markdown.",
                    },
                    {"role": "user", "content": markdown},
                ],
                "temperature": 0.2,
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        if isinstance(text, str) and text.strip():
            return text.strip() + "\n"
    except Exception:  # noqa: BLE001
        return markdown
    return markdown


# ── public: brief generation ─────────────────────────────────────────────────────
def generate_brief(
    case_id: Optional[int] = None,
    entity_ids: Optional[list[str]] = None,
    query: Optional[str] = None,
    *,
    polish: bool = False,
) -> dict:
    """Assemble a structured intelligence brief from any of case_id / entity_ids /
    query. Returns ``{title, sections, markdown}``. Never raises.

    ``sections`` is a list of ``{title, body}`` blocks (Summary, Entities,
    Relationships, Risks, [Notes], Data). ``polish=True`` attempts an optional
    Kimi rewrite of the markdown (silently skipped without a key)."""
    try:
        bundle = _gather(case_id, entity_ids, query)
    except Exception:  # noqa: BLE001 - never raise
        bundle = {
            "objects": [], "neighbors": [], "links": [], "risks": [],
            "notes": [], "markets": [], "object_ids": [], "case_title": None,
            "case_id": case_id, "query": query,
        }

    # title
    if bundle.get("case_title"):
        title = f"Intelligence Brief — {bundle['case_title']}"
    elif bundle["objects"]:
        labels = [o.get("label") or o.get("id") for o in bundle["objects"][:3]]
        title = "Intelligence Brief — " + ", ".join(labels)
    elif query:
        title = f"Intelligence Brief — \"{query}\""
    else:
        title = "Intelligence Brief"

    try:
        markdown, sections = _compose_markdown(title, bundle)
    except Exception:  # noqa: BLE001
        markdown, sections = f"# {title}\n", [{"title": "Summary", "body": ""}]

    if polish:
        markdown = _maybe_polish(markdown)

    return {"title": title, "sections": sections, "markdown": markdown}


# ── public: saved-report store ───────────────────────────────────────────────────
def _row_to_report(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "title": r["title"],
        "body": r["body"],
        "meta": _loads(r["meta_json"]),
        "created_ts": r["created_ts"],
    }


def save_report(
    title: str,
    body: str,
    meta: Optional[dict] = None,
    *,
    db_path: Optional[str] = None,
) -> Optional[int]:
    """Persist a report. Returns the new report id or None on error."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            cur = conn.execute(
                "INSERT INTO report (title, body, meta_json, created_ts) VALUES (?,?,?,?)",
                (str(title or "report"), str(body or ""), _dumps(meta or {}), _now_ms()),
            )
            conn.commit()
            return int(cur.lastrowid)
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def list_reports(db_path: Optional[str] = None) -> list[dict]:
    """List saved reports (newest first). Bodies are included (they are small)."""
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM report ORDER BY id DESC"
            ).fetchall()
            return [_row_to_report(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_report(report_id: int, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one saved report by id, or None."""
    try:
        conn = _connect(db_path)
        try:
            r = conn.execute(
                "SELECT * FROM report WHERE id=?", (int(report_id),)
            ).fetchone()
            return _row_to_report(r) if r else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def export(report_id: int, fmt: str = "md", *, db_path: Optional[str] = None) -> str:
    """Export a saved report as ``md`` (the markdown body) or ``json`` (the full
    record serialised). Returns an empty string if the report is missing."""
    rep = get_report(report_id, db_path=db_path)
    if rep is None:
        return ""
    if str(fmt).lower() == "json":
        return _dumps(rep)
    return rep.get("body") or ""


# Bootstrap the default DB on import so the first request finds the tables.
# Guarded so a read-only / missing-dir environment never breaks import.
init_db()
