"""SECOND BRAIN — RESEARCH + INGEST + RECONCILE + SYNTHESIZE (stdlib only).

This is the layer that makes the vault BEAT markdown-only "obsidian-second-brain"
repos. Those repos give you hand-typed wikilinked notes; this layer makes the
vault **self-feeding** and **self-rewriting**:

  * :func:`research`   — query KEY-LESS public JSON/XML APIs (Wikipedia, HackerNews
                         Algolia, arXiv, Crossref, DuckDuckGo Instant Answer) over
                         stdlib ``urllib`` and aggregate an honest dossier. Every
                         source is network-guarded; offline → empty findings. We
                         NEVER fabricate a result.
  * :func:`ingest`     — pull a URL (or accept inline text), strip it to text,
                         summarize (first-N-sentences, stdlib), then apply the
                         TWO-OUTPUT RULE: (1) save an *immutable raw record* to a
                         local SQLite store and (2) upsert/rewrite the relevant
                         living note(s) via ``second_brain.upsert_note``.
  * :func:`reconcile`  — diff a note's current claim lines against the latest
                         ingested info and write a transparent **bi-temporal**
                         resolution ("believed X as of T1; updated to Y as of T2").
  * :func:`synthesize` — retrieve across notes (rag / embeddings), find cross-note
                         patterns, and upsert a ``kind=synthesis`` note that cites
                         the source notes. Honest when there are too few notes.

Design rules (mirror ``geo.py`` / ``second_brain.py``):
  * stdlib only (``urllib``, ``xml.etree``, ``sqlite3``, ``json``, ``re``) — no
    new dependency, no API keys.
  * every network fetch is guarded by :func:`_http_get`; offline / blocked egress
    / malformed payload → an honest empty result, never a fabricated one.
  * never raise on normal use — every public function degrades gracefully.
  * IMPORT ``second_brain`` (and rag/embeddings) and degrade silently if any of
    those imports fail.

The immutable raw-record DB path comes from the env var ``BRAIN_RESEARCH_DB``
(default ``server/data/brain_research.db``).
"""

from __future__ import annotations

import json as _json
import os
import re
import sqlite3
import time
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from typing import Any, Optional

# ── graceful sibling imports ──────────────────────────────────────────────────────
try:  # the living-vault store we rewrite notes into.
    from . import second_brain as sb  # type: ignore
except Exception:  # noqa: BLE001 - degrade gracefully if the vault is unavailable
    sb = None  # type: ignore

try:  # semantic retrieval for synthesize().
    from . import rag as _rag  # type: ignore
except Exception:  # noqa: BLE001
    _rag = None  # type: ignore

try:
    from . import embeddings as _embeddings  # type: ignore
except Exception:  # noqa: BLE001
    _embeddings = None  # type: ignore


# ── KEY-LESS public sources wired (all over stdlib urllib, no API keys) ─────────────
_WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
_HN_ALGOLIA = "https://hn.algolia.com/api/v1/search"
_ARXIV_API = "http://export.arxiv.org/api/query"
_CROSSREF_API = "https://api.crossref.org/works"
_DDG_INSTANT = "https://api.duckduckgo.com/"

_UA = "jarvis-apex/brain-research"

# ── DB location ──────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "brain_research.db",
)


def _db_path() -> str:
    """Resolve the raw-record DB path at call-time so tests can set the env var."""
    return os.environ.get("BRAIN_RESEARCH_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── network-guarded fetch (mirrors geo._http_get) ──────────────────────────────────
def _http_get(url: str, timeout: float = 12.0) -> Optional[bytes]:
    """GET a URL via stdlib urllib, returning raw bytes or ``None`` on any failure
    (offline / egress blocked / HTTP error). Never raises. Tests monkeypatch this
    single function to run fully offline."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            return resp.read()
    except Exception:  # noqa: BLE001 - any fetch failure → honest fallback
        return None


def _get_json(url: str, timeout: float = 12.0) -> Optional[Any]:
    """Fetch + parse JSON, or ``None`` on any failure. Never raises / fabricates."""
    raw = _http_get(url, timeout=timeout)
    if raw is None:
        return None
    try:
        return _json.loads(raw.decode("utf-8", "replace"))
    except (ValueError, TypeError):
        return None


def _quote(s: str) -> str:
    try:
        return urllib.parse.quote(str(s or ""), safe="")
    except Exception:  # noqa: BLE001
        return ""


def _qs(params: dict) -> str:
    try:
        return urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    except Exception:  # noqa: BLE001
        return ""


# ── text helpers (stdlib summarization) ─────────────────────────────────────────────
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _strip_tags(html: str) -> str:
    """Strip HTML/XML tags and collapse whitespace into plain text. Never raises."""
    try:
        text = str(html or "")
        # drop script/style blocks wholesale before stripping tags
        text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", text)
        text = _TAG_RE.sub(" ", text)
        # unescape a few common entities cheaply (stdlib html would also do)
        import html as _html

        text = _html.unescape(text)
        return _WS_RE.sub(" ", text).strip()
    except Exception:  # noqa: BLE001
        return ""


def _summarize(text: str, n_sentences: int = 3) -> str:
    """First-N-sentences extractive summary (stdlib, deterministic). No model."""
    clean = _WS_RE.sub(" ", str(text or "")).strip()
    if not clean:
        return ""
    try:
        sents = [s.strip() for s in _SENT_SPLIT_RE.split(clean) if s.strip()]
        if not sents:
            return clean[:500]
        return " ".join(sents[: max(1, int(n_sentences))])[:1000]
    except Exception:  # noqa: BLE001
        return clean[:500]


def _looks_like_url(s: str) -> bool:
    return bool(_URL_RE.match(str(s or "").strip()))


# ── per-source fetchers (each guarded; None / [] on failure, never fabricated) ──────
def _src_wikipedia(topic: str) -> list[dict]:
    data = _get_json(_WIKIPEDIA_SUMMARY + _quote(topic), timeout=10.0)
    if not isinstance(data, dict):
        return []
    extract = data.get("extract")
    if not extract:
        return []
    url = ((data.get("content_urls") or {}).get("desktop") or {}).get("page") or ""
    return [{
        "source": "wikipedia",
        "title": data.get("title") or topic,
        "url": url,
        "snippet": _summarize(extract, 3),
    }]


def _src_hackernews(topic: str) -> list[dict]:
    url = f"{_HN_ALGOLIA}?{_qs({'query': topic, 'tags': 'story', 'hitsPerPage': 5})}"
    data = _get_json(url, timeout=10.0)
    if not isinstance(data, dict):
        return []
    out: list[dict] = []
    for h in (data.get("hits") or [])[:5]:
        if not isinstance(h, dict):
            continue
        oid = h.get("objectID")
        link = h.get("url") or (f"https://news.ycombinator.com/item?id={oid}" if oid else "")
        title = h.get("title") or h.get("story_title")
        if not title:
            continue
        out.append({
            "source": "hackernews",
            "title": title,
            "url": link,
            "snippet": f"{h.get('points', 0)} points, {h.get('num_comments', 0)} comments",
        })
    return out


def _src_arxiv(topic: str) -> list[dict]:
    url = f"{_ARXIV_API}?{_qs({'search_query': f'all:{topic}', 'start': 0, 'max_results': 5})}"
    raw = _http_get(url, timeout=12.0)
    if raw is None:
        return []
    try:
        root = ET.fromstring(raw)
    except Exception:  # noqa: BLE001 - malformed XML → honest empty
        return []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out: list[dict] = []
    for entry in root.findall("a:entry", ns):
        try:
            title_el = entry.find("a:title", ns)
            summary_el = entry.find("a:summary", ns)
            id_el = entry.find("a:id", ns)
            title = (title_el.text or "").strip() if title_el is not None else ""
            if not title:
                continue
            out.append({
                "source": "arxiv",
                "title": _WS_RE.sub(" ", title),
                "url": (id_el.text or "").strip() if id_el is not None else "",
                "snippet": _summarize(summary_el.text if summary_el is not None else "", 2),
            })
        except Exception:  # noqa: BLE001
            continue
    return out


def _src_crossref(topic: str) -> list[dict]:
    url = f"{_CROSSREF_API}?{_qs({'query': topic, 'rows': 5})}"
    data = _get_json(url, timeout=12.0)
    if not isinstance(data, dict):
        return []
    items = ((data.get("message") or {}).get("items")) or []
    out: list[dict] = []
    for it in items[:5]:
        if not isinstance(it, dict):
            continue
        titles = it.get("title") or []
        title = titles[0] if isinstance(titles, list) and titles else (titles if isinstance(titles, str) else "")
        if not title:
            continue
        authors = it.get("author") or []
        who = ", ".join(
            f"{a.get('given', '')} {a.get('family', '')}".strip()
            for a in authors[:3] if isinstance(a, dict)
        )
        out.append({
            "source": "crossref",
            "title": str(title),
            "url": it.get("URL") or (f"https://doi.org/{it.get('DOI')}" if it.get("DOI") else ""),
            "snippet": " | ".join(
                p for p in [it.get("type"), it.get("publisher"), who] if p
            )[:500],
        })
    return out


def _src_duckduckgo(topic: str) -> list[dict]:
    url = f"{_DDG_INSTANT}?{_qs({'q': topic, 'format': 'json', 'no_html': 1, 'skip_disambig': 1})}"
    data = _get_json(url, timeout=10.0)
    if not isinstance(data, dict):
        return []
    out: list[dict] = []
    abstract = data.get("AbstractText") or data.get("Abstract")
    if abstract:
        out.append({
            "source": "duckduckgo",
            "title": data.get("Heading") or topic,
            "url": data.get("AbstractURL") or "",
            "snippet": _summarize(abstract, 3),
        })
    for rt in (data.get("RelatedTopics") or [])[:4]:
        if not isinstance(rt, dict):
            continue
        text = rt.get("Text")
        if not text:
            continue
        out.append({
            "source": "duckduckgo",
            "title": (text.split(" - ", 1)[0])[:120],
            "url": (rt.get("FirstURL") or ""),
            "snippet": _summarize(text, 2),
        })
    return out


# the ordered, key-less source roster.
_SOURCES = (
    ("wikipedia", _src_wikipedia),
    ("hackernews", _src_hackernews),
    ("arxiv", _src_arxiv),
    ("crossref", _src_crossref),
    ("duckduckgo", _src_duckduckgo),
)


# ── research() ──────────────────────────────────────────────────────────────────────
def research(topic: str) -> dict:
    """Query the key-less public sources for ``topic`` and aggregate an honest
    dossier.

    Returns ``{topic, findings, open_questions, sources_tried, fetched_ts}`` where
    ``findings`` is ``[{source, title, url, snippet}, ...]``. Each source is fetched
    independently and guarded — a source that is offline / blocked / malformed
    simply contributes nothing. When *every* source fails (e.g. fully offline) the
    findings list is empty: we never fabricate. Never raises."""
    topic = str(topic or "").strip()
    base = {
        "topic": topic,
        "findings": [],
        "open_questions": [],
        "sources_tried": [s for s, _ in _SOURCES],
        "fetched_ts": _now_ms(),
    }
    if not topic:
        return base

    findings: list[dict] = []
    for _name, fetch in _SOURCES:
        try:
            got = fetch(topic)
        except Exception:  # noqa: BLE001 - belt-and-braces; fetchers already guard
            got = []
        for f in got or []:
            if isinstance(f, dict) and f.get("title"):
                findings.append(f)

    base["findings"] = findings

    # honest open questions, derived transparently from what we did / didn't find.
    open_q: list[str] = []
    found_sources = {f.get("source") for f in findings}
    if not findings:
        open_q.append(
            "No sources returned results (offline / egress blocked / no match). "
            "Re-run research with network access — nothing was fabricated."
        )
    else:
        if "arxiv" not in found_sources and "crossref" not in found_sources:
            open_q.append(f"No peer-reviewed / preprint sources found for '{topic}'.")
        if "wikipedia" not in found_sources:
            open_q.append(f"No encyclopedic overview found for '{topic}'.")
        open_q.append(f"How do the {len(findings)} sources agree or contradict on '{topic}'?")
    base["open_questions"] = open_q
    return base


# ── immutable raw-record store ──────────────────────────────────────────────────────
_RAW_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS raw_record (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    url         TEXT,
    raw_text    TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL DEFAULT '',
    fetched_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_raw_fetched ON raw_record (fetched_ts);
"""


def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
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
    """Create the immutable raw-record table if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(_RAW_SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _save_raw(
    source: str,
    title: str,
    url: Optional[str],
    raw_text: str,
    summary: str,
    *,
    db_path: Optional[str] = None,
) -> Optional[str]:
    """Persist an *immutable* raw record (never updated; a fresh id each time) and
    return its id, or ``None`` on error."""
    rid = uuid.uuid4().hex
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO raw_record (id, source, title, url, raw_text, summary, fetched_ts)
                VALUES (?,?,?,?,?,?,?)
                """,
                (rid, str(source or ""), str(title or ""), url,
                 str(raw_text or ""), str(summary or ""), _now_ms()),
            )
            conn.commit()
            return rid
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def get_raw(raw_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one immutable raw record by id (for provenance). None on miss/error."""
    if not raw_id:
        return None
    try:
        init_db(db_path)
        conn = _connect(db_path)
        try:
            r = conn.execute("SELECT * FROM raw_record WHERE id=?", (str(raw_id),)).fetchone()
            return dict(r) if r else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


# ── ingest() ─────────────────────────────────────────────────────────────────────────
def ingest(source: str, title: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Ingest ``source`` (a URL or inline text) into the vault under the TWO-OUTPUT
    RULE:

      1. Save an **immutable raw record** (the provenance trail) to the local
         ``BRAIN_RESEARCH_DB`` SQLite store.
      2. **Upsert / rewrite** the relevant living note(s) via
         ``second_brain.upsert_note`` — an ``entity`` note for the subject and a
         ``log`` note recording the ingestion event linking to it.

    If ``source`` looks like a URL it is fetched (network-guarded) and stripped to
    text; otherwise it is treated as inline text. Returns
    ``{created, updated, raw_id, source_kind, summary}``. Never raises; if the
    fetch fails offline we still record an honest (empty-text) raw record and skip
    note creation rather than fabricating content."""
    result: dict[str, Any] = {
        "created": [],
        "updated": [],
        "raw_id": None,
        "source_kind": None,
        "summary": "",
    }
    src = str(source or "").strip()
    if not src:
        return result

    is_url = _looks_like_url(src)
    result["source_kind"] = "url" if is_url else "text"

    if is_url:
        raw = _http_get(src, timeout=14.0)
        if raw is None:
            # honest: fetch failed (offline / blocked). Record the attempt, no note.
            result["raw_id"] = _save_raw("url", title or src, src, "", "", db_path=db_path)
            result["summary"] = ""
            return result
        try:
            text = _strip_tags(raw.decode("utf-8", "replace"))
        except Exception:  # noqa: BLE001
            text = ""
        note_url = src
        provenance = "url"
    else:
        text = _WS_RE.sub(" ", src).strip()
        note_url = None
        provenance = "text"

    summary = _summarize(text, 3)
    result["summary"] = summary

    note_title = str(title or "").strip()
    if not note_title:
        # derive a title from the first sentence / line of the text.
        first = text.split(". ", 1)[0] if text else ""
        note_title = (first[:80].strip() or "Ingested " + time.strftime("%Y-%m-%d %H:%M", time.gmtime()))

    # OUTPUT 1: immutable raw record.
    raw_id = _save_raw(provenance, note_title, note_url, text, summary, db_path=db_path)
    result["raw_id"] = raw_id

    if not text:
        return result

    # OUTPUT 2: rewrite the living note(s).
    if sb is None:
        return result

    src_line = f"[Source]({note_url})" if note_url else "_(inline ingest)_"
    existing = None
    try:
        existing = sb.get_note(note_title)
    except Exception:  # noqa: BLE001
        existing = None

    body = (
        f"# {note_title}\n\n"
        f"{summary}\n\n"
        f"## Provenance\n"
        f"- ingested: {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())} UTC\n"
        f"- {src_line}\n"
        f"- raw_id: `{raw_id}`\n"
    )
    try:
        note = sb.upsert_note(
            "entity",
            note_title,
            body,
            frontmatter={"ingested": True, "source_url": note_url, "raw_id": raw_id},
            confidence=0.8,
            actor="brain_research.ingest",
        )
    except Exception:  # noqa: BLE001
        note = None

    if note is not None:
        bucket = "updated" if existing is not None else "created"
        result[bucket].append({"id": note.get("id"), "title": note.get("title"), "kind": note.get("kind")})

    # an immutable timeline log note linking back to the entity note.
    try:
        log = sb.log_session(
            f"Ingested {provenance} into [[{note_title}]] (raw_id {raw_id}).",
            links=[note_title],
            actor="brain_research.ingest",
        )
        if log is not None:
            result["created"].append({"id": log.get("id"), "title": log.get("title"), "kind": log.get("kind")})
    except Exception:  # noqa: BLE001
        pass

    return result


# ── reconcile() ───────────────────────────────────────────────────────────────────────
def _claim_lines(body: str) -> list[str]:
    """Extract candidate *claim* lines from a markdown body: non-empty,
    non-heading, non-metadata lines, stripped of list markers."""
    out: list[str] = []
    for raw in str(body or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(">"):
            continue
        # skip provenance / metadata bullets
        low = line.lower()
        if low.startswith(("- ingested:", "- raw_id:", "- source", "- [source")):
            continue
        line = line.lstrip("-*").strip()
        if line and not _looks_like_url(line):
            out.append(line)
    return out


def _normalize(s: str) -> str:
    return _WS_RE.sub(" ", str(s or "").lower()).strip().rstrip(".")


def reconcile(title: str, latest: Optional[str] = None, *, db_path: Optional[str] = None) -> dict:
    """Reconcile a note's current claims against the latest ingested information and
    write a transparent **bi-temporal** resolution into the note.

    ``latest`` may be supplied directly (the new claim text); when omitted we use
    the most recent immutable raw-record summary that matches ``title``. We diff the
    note's claim lines against the latest info heuristically (line-level set diff),
    record contradictions (lines that disappeared / changed), and append a
    bi-temporal block ("believed X as of T1; updated to Y as of T2") to the note.

    Returns ``{title, contradictions, resolution, updated}``. Transparent and
    heuristic — never raises, never fabricates a contradiction it cannot show."""
    title = str(title or "").strip()
    result: dict[str, Any] = {
        "title": title,
        "contradictions": [],
        "resolution": "",
        "updated": False,
        "heuristic": True,
    }
    if not title or sb is None:
        result["resolution"] = "no note store / empty title — nothing to reconcile"
        return result

    try:
        note = sb.get_note(title)
    except Exception:  # noqa: BLE001
        note = None
    if note is None:
        result["resolution"] = f"no note titled '{title}' to reconcile"
        return result

    old_lines = _claim_lines(note.get("body_md") or "")

    # resolve the latest info: explicit arg wins, else newest matching raw record.
    latest_text = str(latest or "").strip()
    latest_ts = note.get("learned_ts") or note.get("updated_ts")
    if not latest_text:
        try:
            init_db(db_path)
            conn = _connect(db_path)
            try:
                r = conn.execute(
                    "SELECT * FROM raw_record WHERE title=? COLLATE NOCASE "
                    "ORDER BY fetched_ts DESC LIMIT 1",
                    (title,),
                ).fetchone()
            finally:
                conn.close()
            if r is not None:
                latest_text = r["summary"] or r["raw_text"] or ""
                latest_ts = r["fetched_ts"]
        except sqlite3.Error:
            latest_text = ""

    if not latest_text:
        result["resolution"] = (
            "no newer ingested information found for this note — nothing to reconcile "
            "(nothing fabricated)"
        )
        return result

    new_lines = _claim_lines(latest_text) or [latest_text.strip()]
    new_norm = {_normalize(x) for x in new_lines}
    old_norm = {_normalize(x) for x in old_lines}

    # contradictions: prior claims absent from the latest info (changed / dropped).
    contradictions: list[dict] = []
    for line in old_lines:
        n = _normalize(line)
        if n and n not in new_norm:
            # try to find a "replacement" line in the new info sharing a keyword.
            replacement = None
            keys = set(re.findall(r"[a-z0-9]+", n))
            for nl in new_lines:
                if keys & set(re.findall(r"[a-z0-9]+", _normalize(nl))):
                    replacement = nl
                    break
            contradictions.append({"previously": line, "now": replacement})
    result["contradictions"] = contradictions

    t1 = note.get("learned_ts") or note.get("created_ts")
    t2 = latest_ts or _now_ms()

    def _fmt(ms: Any) -> str:
        try:
            return time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(int(ms) / 1000.0))
        except Exception:  # noqa: BLE001
            return "unknown"

    if contradictions:
        resolution_lines = []
        for c in contradictions:
            now = c["now"] or "(no replacement stated in latest info)"
            resolution_lines.append(
                f"- believed \"{c['previously']}\" as of {_fmt(t1)}; "
                f"updated to \"{now}\" as of {_fmt(t2)}"
            )
        resolution = "\n".join(resolution_lines)
    else:
        resolution = (
            f"- no contradictions; latest info (as of {_fmt(t2)}) is consistent with "
            f"the note as believed since {_fmt(t1)}"
        )
    result["resolution"] = resolution

    # write the bi-temporal reconciliation block into the note, learned_ts = t2.
    block = (
        f"\n\n## Reconciliation ({_fmt(t2)})\n"
        f"{resolution}\n\n"
        f"### Latest ingested claims\n"
        + "\n".join(f"- {nl}" for nl in new_lines)
        + "\n"
    )
    try:
        updated = sb.upsert_note(
            note.get("kind") or "entity",
            title,
            (note.get("body_md") or "") + block,
            frontmatter={**(note.get("frontmatter") or {}), "reconciled_ts": t2},
            confidence=note.get("confidence"),
            learned_ts=int(t2) if isinstance(t2, (int, float)) else None,
            actor="brain_research.reconcile",
        )
        result["updated"] = updated is not None
    except Exception:  # noqa: BLE001
        result["updated"] = False

    return result


# ── synthesize() ──────────────────────────────────────────────────────────────────────
def _retrieve_notes(topic: str, k: int = 8) -> list[dict]:
    """Retrieve indexed brain notes relevant to ``topic`` via rag/embeddings.
    Returns ``[{id, kind, score, text, meta}]``; empty on any failure."""
    hits: list[dict] = []
    if _rag is not None:
        try:
            hits = _rag.retrieve(topic, k=k) or []
        except Exception:  # noqa: BLE001
            hits = []
    if not hits and _embeddings is not None:
        try:
            hits = _embeddings.search(topic, k=k) or []
        except Exception:  # noqa: BLE001
            hits = []
    # keep only brain notes (kind starts with "brain:" at index time) when possible.
    brain = [h for h in hits if str(h.get("kind") or "").startswith("brain")]
    return brain or hits


def synthesize(topic: str, *, min_notes: int = 2) -> dict:
    """Synthesize a cross-note pattern note for ``topic``.

    Retrieves the most relevant notes (semantic search over the vault), extracts the
    shared/cross-cutting keywords, and — if at least ``min_notes`` relevant notes
    exist — upserts a ``kind=synthesis`` note that **cites the source notes** by
    ``[[wikilink]]``. If there are too few notes it is honest and creates nothing.

    Returns ``{topic, sources, patterns, note, created, message}``. Never raises."""
    topic = str(topic or "").strip()
    result: dict[str, Any] = {
        "topic": topic,
        "sources": [],
        "patterns": [],
        "note": None,
        "created": False,
        "message": "",
    }
    if not topic:
        result["message"] = "empty topic"
        return result

    hits = _retrieve_notes(topic, k=8)
    sources: list[dict] = []
    for h in hits:
        meta = h.get("meta") or {}
        ttl = meta.get("title") or h.get("id")
        if not ttl:
            continue
        sources.append({"id": h.get("id"), "title": ttl, "score": h.get("score")})
    result["sources"] = sources

    if len(sources) < max(1, int(min_notes)):
        result["message"] = (
            f"too few relevant notes ({len(sources)}) to synthesize honestly; "
            f"need at least {min_notes}. Capture/ingest more first — nothing fabricated."
        )
        return result

    # transparent cross-note pattern: keyword frequency across retrieved texts.
    freq: dict[str, int] = {}
    stop = {
        "the", "and", "for", "with", "that", "this", "from", "are", "was", "has",
        "have", "not", "but", "you", "all", "can", "into", "ingested", "raw",
        "source", "provenance", "utc", "note", "notes",
    }
    for h in hits:
        for tok in re.findall(r"[a-z0-9]{4,}", str(h.get("text") or "").lower()):
            if tok in stop:
                continue
            freq[tok] = freq.get(tok, 0) + 1
    patterns = [w for w, c in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0])) if c >= 2][:10]
    result["patterns"] = patterns

    if sb is None:
        result["message"] = "note store unavailable; synthesis not persisted"
        return result

    cites = " ".join(f"[[{s['title']}]]" for s in sources)
    body = (
        f"# Synthesis: {topic}\n\n"
        f"Cross-note synthesis over {len(sources)} relevant notes "
        f"(semantic retrieval; transparent keyword pattern extraction).\n\n"
        f"## Recurring patterns\n"
        + (("- " + "\n- ".join(patterns) + "\n") if patterns else "_No recurring multi-note keyword found._\n")
        + f"\n## Source notes\n{cites}\n\n"
        f"_Generated {time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())} UTC. "
        f"Honest: this is an extractive synthesis, not an LLM summary._\n"
    )
    try:
        note = sb.upsert_note(
            "synthesis",
            f"Synthesis: {topic}",
            body,
            frontmatter={"topic": topic, "source_count": len(sources)},
            confidence=0.6,
            actor="brain_research.synthesize",
        )
        result["note"] = note
        result["created"] = note is not None
        result["message"] = f"synthesized over {len(sources)} notes"
    except Exception:  # noqa: BLE001
        result["message"] = "synthesis upsert failed"

    return result


# Bootstrap the default raw-record DB on import (guarded), mirroring siblings.
init_db()
