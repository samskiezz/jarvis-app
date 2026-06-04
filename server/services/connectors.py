"""SOURCE CONNECTOR FRAMEWORK — typed connectors, sample-preview, backfill/replay
and an auditable run-history (Palantir Foundry P1 #1/#9/#10/#12/#14).

This is the *ingestion edge* that sits ALONGSIDE the existing integration plane
(``server/services/pipelines.py`` connectors and ``server/services/datasets.py``
catalog). Where ``pipelines`` wires a handful of named live series and
``datasets`` is the catalog/lineage/health depth layer, this module gives you a
first-class, persisted, typed *connector registry* plus a runner that can land
its rows into the dataset catalog (reusing ``datasets.register_dataset`` /
``record_transform`` / ``add_lineage``), so a source becomes a dataset with a
provenance edge ``source -> dataset``.

Connector KINDS (each normalises to a list of flat ``dict`` rows):
  * ``rest_json`` — HTTP GET a JSON URL and extract rows at a dotted ``path``
    (e.g. ``"data.items"``). A list yields one row per element; a dict yields a
    single row. Network-guarded via stdlib :func:`_http_get`.
  * ``csv_url``   — HTTP GET a CSV and parse it with the stdlib ``csv`` module
    (header row → column names).
  * ``rss``       — HTTP GET an RSS/Atom feed and parse ``<item>``/``<entry>``
    elements with stdlib ``xml.etree``.
  * ``inline``    — rows supplied directly in the config (``config["rows"]``);
    no network. The honest substrate for tests and manual landing.

Two verbs per kind:
  * :func:`sample` / :func:`preview` — return the first N normalised rows WITHOUT
    landing anything (P1 #12, sample-preview). Offline → ``{rows: [], note: ...}``.
  * :func:`run` / :func:`run_connector` — fetch ALL normalised rows; optionally
    register + land into a dataset and record a run in the audit history.

backfill / replay (P1 #10):
  * :func:`backfill` re-runs a connector for a historical ``[since, until]``
    window IF its config declares a ``window_param`` convention (the names of
    query params to inject for the bounds; see :func:`backfill` docstring). If
    the connector has no ``window_param``, it returns an honest
    ``{ok: False, note: "connector has no time window"}`` rather than pretending.

Doctrine (mirrors ``history_lake`` / ``datasets`` / ``geo``):
  * stdlib only — ``sqlite3`` + ``urllib`` + ``csv`` + ``xml.etree``; no new dep.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``) + idempotent writes.
  * never raise on normal use — every public function degrades gracefully.
  * network-guarded + HONEST offline — a failed fetch NEVER fabricates data; it
    returns empty rows carrying ``note: "source unreachable"``.

DB path comes from env ``CONNECTORS_DB`` (default ``server/data/connectors.db``).
Tests pass a temp path via the env var. Dataset landing uses ``datasets.py``
(its own ``DATASETS_DB``), reused, never duplicated.
"""

from __future__ import annotations

import csv as _csv
import io
import json
import os
import sqlite3
import time
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from typing import Any, Optional

from . import datasets as ds

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "connectors.db"
)

KINDS = ("rest_json", "csv_url", "rss", "inline")


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``CONNECTORS_DB``."""
    return os.environ.get("CONNECTORS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS connector (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    kind        TEXT    NOT NULL,
    config_json TEXT    NOT NULL DEFAULT '{}',
    created_ts  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connector_run (
    id           TEXT    PRIMARY KEY,
    connector_id TEXT    NOT NULL,
    started_ts   INTEGER NOT NULL,
    n_rows       INTEGER NOT NULL DEFAULT 0,
    status       TEXT    NOT NULL DEFAULT 'ok',
    note         TEXT,
    mode         TEXT    NOT NULL DEFAULT 'run',
    dataset_id   TEXT
);
CREATE INDEX IF NOT EXISTS ix_run_connector ON connector_run (connector_id, started_ts);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL where possible. Mirrors history_lake/datasets."""
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
    """Create all tables/indexes if absent. Idempotent; never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── small helpers ────────────────────────────────────────────────────────────────
def _dumps(obj: Any, default: str) -> str:
    try:
        return json.dumps(obj if obj is not None else json.loads(default), default=str)
    except (TypeError, ValueError):
        return default


def _loads(text: Optional[str], fallback: Any) -> Any:
    try:
        return json.loads(text) if text else fallback
    except (TypeError, ValueError):
        return fallback


def _row_to_connector(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "kind": row["kind"],
        "config": _loads(row["config_json"], {}),
        "created_ts": row["created_ts"],
    }


# ── Network (stdlib urllib, network-guarded; mirrors geo._http_get) ───────────────
def _http_get(url: str, timeout: float = 12.0) -> Optional[bytes]:
    """GET a URL via stdlib urllib, returning raw bytes or ``None`` on any failure
    (offline / egress blocked / HTTP error). Never raises. Tests monkeypatch this
    so no real network is touched."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "jarvis-apex/connectors"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            return resp.read()
    except Exception:  # noqa: BLE001 - any fetch failure → honest fallback
        return None


# ── normalisation per kind ────────────────────────────────────────────────────────
def _dig(data: Any, path: Optional[str]) -> Any:
    """Walk a dotted ``path`` (e.g. ``"data.items"``) into a parsed JSON object.
    Empty/None path returns the object unchanged. Returns None if a segment is
    missing."""
    if not path:
        return data
    cur = data
    for seg in str(path).split("."):
        seg = seg.strip()
        if not seg:
            continue
        if isinstance(cur, dict) and seg in cur:
            cur = cur[seg]
        else:
            return None
    return cur


def _as_rows(extracted: Any) -> list[dict]:
    """Coerce an extracted JSON node into a list of flat dict rows. A list yields
    one row per element (non-dict elements are wrapped as ``{"value": x}``); a
    single dict becomes a one-row list; everything else → []."""
    if isinstance(extracted, list):
        out: list[dict] = []
        for el in extracted:
            if isinstance(el, dict):
                out.append(el)
            else:
                out.append({"value": el})
        return out
    if isinstance(extracted, dict):
        return [extracted]
    return []


def _normalize_rest_json(raw: bytes, config: dict) -> list[dict]:
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except (ValueError, TypeError):
        return []
    return _as_rows(_dig(data, config.get("path")))


def _normalize_csv(raw: bytes, config: dict) -> list[dict]:
    try:
        text = raw.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return []
    delim = config.get("delimiter") or ","
    try:
        reader = _csv.DictReader(io.StringIO(text), delimiter=str(delim)[:1] or ",")
        return [dict(r) for r in reader]
    except (_csv.Error, ValueError):
        return []


def _strip_ns(tag: str) -> str:
    """Drop an XML namespace prefix from a tag (``{ns}item`` → ``item``)."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _normalize_rss(raw: bytes, config: dict) -> list[dict]:
    """Parse RSS ``<item>`` or Atom ``<entry>`` elements into flat rows. Each
    direct child element becomes a column (text content), namespace stripped."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    items: list[Any] = []
    for el in root.iter():
        if _strip_ns(el.tag).lower() in ("item", "entry"):
            items.append(el)
    rows: list[dict] = []
    for it in items:
        row: dict[str, Any] = {}
        for child in list(it):
            key = _strip_ns(child.tag)
            val = (child.text or "").strip()
            if not val:
                # Atom <link href="..."> carries the url in an attribute.
                val = child.attrib.get("href", "") or ""
            if key in row:
                # keep first non-empty; collect duplicates into a list
                existing = row[key]
                if isinstance(existing, list):
                    existing.append(val)
                else:
                    row[key] = [existing, val]
            else:
                row[key] = val
        if row:
            rows.append(row)
    return rows


# ── columns from rows ──────────────────────────────────────────────────────────
def _columns(rows: list[dict]) -> list[str]:
    """Stable union of keys across rows, preserving first-seen order."""
    cols: list[str] = []
    seen: set[str] = set()
    for r in rows:
        if not isinstance(r, dict):
            continue
        for k in r.keys():
            if k not in seen:
                seen.add(k)
                cols.append(k)
    return cols


# ── core fetch: returns (rows, note, reachable) ──────────────────────────────────
def _fetch(kind: str, config: dict, *, limit: Optional[int] = None) -> tuple[list[dict], Optional[str], bool]:
    """Fetch + normalise rows for ``kind``/``config``.

    Returns ``(rows, note, reachable)``. ``reachable`` is False only when a
    network kind could not reach its source (honest offline). ``note`` is a short
    human string when something noteworthy happened (unreachable / no url)."""
    config = config or {}
    kind = str(kind or "")

    if kind == "inline":
        rows = config.get("rows")
        if not isinstance(rows, list):
            return [], "inline connector has no 'rows' list", True
        norm = [r if isinstance(r, dict) else {"value": r} for r in rows]
        if limit is not None:
            norm = norm[: max(0, int(limit))]
        return norm, None, True

    if kind not in ("rest_json", "csv_url", "rss"):
        return [], f"unknown connector kind '{kind}'", True

    url = config.get("url")
    if not url:
        return [], "connector config has no 'url'", True

    raw = _http_get(str(url), timeout=float(config.get("timeout", 12.0)))
    if raw is None:
        return [], "source unreachable", False

    if kind == "rest_json":
        rows = _normalize_rest_json(raw, config)
    elif kind == "csv_url":
        rows = _normalize_csv(raw, config)
    else:  # rss
        rows = _normalize_rss(raw, config)

    if limit is not None:
        rows = rows[: max(0, int(limit))]
    return rows, None, True


# ── kind-level public API (sample / run) ──────────────────────────────────────────
def sample(config: dict, kind: Optional[str] = None, n: int = 5) -> dict:
    """Preview the first ``n`` normalised rows for a connector config WITHOUT
    landing anything (P1 #12). ``kind`` may be supplied separately or carried in
    ``config["kind"]``. Returns ``{columns, rows, note}``; offline → empty rows
    with ``note="source unreachable"``. Never raises."""
    config = dict(config or {})
    k = kind or config.get("kind")
    try:
        nn = max(0, int(n))
    except (TypeError, ValueError):
        nn = 5
    rows, note, _reachable = _fetch(str(k or ""), config, limit=nn)
    return {"columns": _columns(rows), "rows": rows, "note": note}


def run(config: dict, kind: Optional[str] = None) -> dict:
    """Fetch ALL normalised rows for a connector config (no landing). ``kind`` may
    be supplied separately or carried in ``config["kind"]``. Returns
    ``{ok, rows, columns, note, reachable}``; never raises."""
    config = dict(config or {})
    k = kind or config.get("kind")
    rows, note, reachable = _fetch(str(k or ""), config, limit=None)
    return {"ok": True, "rows": rows, "columns": _columns(rows),
            "note": note, "reachable": reachable}


# ── connector registry ────────────────────────────────────────────────────────────
def register_connector(
    name: str, kind: str, config: Optional[dict] = None, *, db_path: Optional[str] = None
) -> dict:
    """Register (or update) a typed connector. ``name`` is the unique key; a
    stable id is derived from it. Idempotent upsert on ``name`` (re-register
    refreshes kind/config without duplicating). Returns ``{ok, id, ...}`` or
    ``{ok: False, error}``. Never raises."""
    if not name:
        return {"ok": False, "error": "name required"}
    if kind not in KINDS:
        return {"ok": False, "error": f"unknown kind '{kind}' (one of {list(KINDS)})"}
    init_db(db_path)
    cid = uuid.uuid5(uuid.NAMESPACE_URL, f"connector|{name}").hex
    config_json = _dumps(config or {}, "{}")
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO connector (id, name, kind, config_json, created_ts)
                VALUES (?,?,?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    kind=excluded.kind,
                    config_json=excluded.config_json
                """,
                (cid, name, kind, config_json, now),
            )
            row = conn.execute("SELECT id FROM connector WHERE name=?", (name,)).fetchone()
            cid = row["id"] if row else cid
            conn.commit()
        finally:
            conn.close()
        return {"ok": True, "id": cid, "name": name, "kind": kind,
                "config": _loads(config_json, {})}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


def list_connectors(db_path: Optional[str] = None) -> list[dict]:
    """List registered connectors (most recently created first). Never raises."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM connector ORDER BY created_ts DESC, name ASC"
            ).fetchall()
            return [_row_to_connector(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_connector(connector_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one connector by id (or by name as a fallback). None if absent."""
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT * FROM connector WHERE id=? OR name=?",
                (connector_id, connector_id),
            ).fetchone()
            return _row_to_connector(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def delete_connector(connector_id: str, *, db_path: Optional[str] = None) -> dict:
    """Delete a connector (and its run history) by id or name. Returns
    ``{ok, deleted}``; never raises."""
    c = get_connector(connector_id, db_path=db_path)
    if c is None:
        return {"ok": True, "deleted": 0}
    try:
        conn = _connect(db_path)
        try:
            conn.execute("DELETE FROM connector_run WHERE connector_id=?", (c["id"],))
            cur = conn.execute("DELETE FROM connector WHERE id=?", (c["id"],))
            conn.commit()
            return {"ok": True, "deleted": cur.rowcount}
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


# ── preview (registered connector OR ad-hoc config) ───────────────────────────────
def preview(
    connector_id_or_config: Any, n: int = 5, *, db_path: Optional[str] = None
) -> dict:
    """Sample-preview WITHOUT landing (P1 #12).

    Accepts EITHER a connector id/name (string) OR an inline/ad-hoc config dict
    ``{"kind": ..., ...config}``. Returns ``{columns, rows, note}``; offline →
    ``{rows: [], note: "source unreachable"}``. Never raises."""
    if isinstance(connector_id_or_config, dict):
        cfg = dict(connector_id_or_config)
        kind = cfg.pop("kind", None)
        # allow nested {"config": {...}}
        if "config" in cfg and isinstance(cfg["config"], dict) and len(cfg) == 1:
            cfg = cfg["config"]
        return sample(cfg, kind=kind, n=n)
    c = get_connector(str(connector_id_or_config), db_path=db_path)
    if c is None:
        return {"columns": [], "rows": [], "note": "unknown connector"}
    return sample(c["config"], kind=c["kind"], n=n)


# ── run-history (audit) ────────────────────────────────────────────────────────────
def _record_run(
    connector_id: str,
    n_rows: int,
    status: str,
    note: Optional[str],
    *,
    mode: str = "run",
    dataset_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> str:
    """Insert one connector_run audit row. Returns the run id (or '' on error)."""
    rid = uuid.uuid4().hex
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO connector_run
                    (id, connector_id, started_ts, n_rows, status, note, mode, dataset_id)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (rid, connector_id, _now_ms(), int(n_rows), status, note, mode, dataset_id),
            )
            conn.commit()
            return rid
        finally:
            conn.close()
    except sqlite3.Error:
        return ""


def list_runs(connector_id: str, limit: int = 50, *, db_path: Optional[str] = None) -> list[dict]:
    """Audit history for a connector (most recent first). Accepts a connector id
    or name (resolved to its id). Never raises."""
    try:
        lim = max(1, int(limit))
    except (TypeError, ValueError):
        lim = 50
    # Runs are stored under the connector's id; resolve a name to its id.
    c = get_connector(connector_id, db_path=db_path)
    cid = c["id"] if c else connector_id
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM connector_run WHERE connector_id=? "
                "ORDER BY started_ts DESC, id DESC LIMIT ?",
                (cid, lim),
            ).fetchall()
            return [
                {"id": r["id"], "connector_id": r["connector_id"],
                 "started_ts": r["started_ts"], "n_rows": r["n_rows"],
                 "status": r["status"], "note": r["note"], "mode": r["mode"],
                 "dataset_id": r["dataset_id"]}
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── run a connector (optionally landing into a dataset) ───────────────────────────
def _land_dataset(connector: dict, rows: list[dict], dataset_name: str) -> Optional[str]:
    """Register/update a dataset for the landed rows and wire provenance via
    datasets.py: a ``source -> dataset`` lineage edge and a recorded transform
    (code-as-data) describing the connector. Returns the dataset id (or None)."""
    cols = _columns(rows)
    schema = {
        "columns": cols,
        "connector": connector.get("name"),
        "connector_kind": connector.get("kind"),
    }
    res = ds.register_dataset(
        dataset_name, owner="connector", kind="table", schema=schema
    )
    if not res.get("ok"):
        return None
    did = res["id"]
    # row_count + freshness now reflect the landed rows.
    ds.update_freshness(did, row_count=len(rows))
    # provenance: a source node for the connector -> the dataset.
    src_node = f"source:connector:{connector.get('name')}"
    ds.add_lineage(src_node, did, "source->dataset")
    # record the connector as a transform (code-as-data) for auditability.
    ds.record_transform(
        name=f"connector:{connector.get('name')}",
        inputs=[src_node],
        output_dataset=did,
        language="connector",
        code=_dumps({"kind": connector.get("kind"), "config": connector.get("config")}, "{}"),
        add_lineage_edges=False,  # we added the source->dataset edge above
    )
    return did


def run_connector(
    connector_id: str,
    dataset_name: Optional[str] = None,
    *,
    config_override: Optional[dict] = None,
    mode: str = "run",
    db_path: Optional[str] = None,
) -> dict:
    """Run a registered connector: fetch all rows, optionally land them into a
    dataset, and ALWAYS record a run in the audit history.

    If ``dataset_name`` is given and rows were fetched, the rows are landed via
    :func:`datasets.register_dataset` (row_count + a ``source->dataset`` lineage
    edge + a recorded connector transform). ``config_override`` lets backfill
    inject window params without mutating the stored config.

    Returns ``{ok, n_rows, status, note, run_id, dataset_id?}``. Honest offline:
    a network kind that is unreachable yields ``status="unreachable"``,
    ``n_rows=0`` and lands nothing. Never raises."""
    c = get_connector(connector_id, db_path=db_path)
    if c is None:
        return {"ok": False, "error": "unknown connector", "n_rows": 0}

    cfg = dict(c["config"] or {})
    if config_override:
        cfg.update(config_override)

    rows, note, reachable = _fetch(c["kind"], cfg, limit=None)
    n = len(rows)

    if not reachable:
        status = "unreachable"
        rid = _record_run(c["id"], 0, status, note or "source unreachable",
                          mode=mode, db_path=db_path)
        return {"ok": True, "n_rows": 0, "status": status,
                "note": note or "source unreachable", "run_id": rid}

    dataset_id: Optional[str] = None
    if dataset_name and n > 0:
        dataset_id = _land_dataset(c, rows, dataset_name)

    status = "ok" if n > 0 else "empty"
    rid = _record_run(c["id"], n, status, note, mode=mode,
                      dataset_id=dataset_id, db_path=db_path)
    out = {"ok": True, "n_rows": n, "status": status, "note": note, "run_id": rid}
    if dataset_id:
        out["dataset_id"] = dataset_id
    return out


# ── backfill / replay (#10) ────────────────────────────────────────────────────────
def backfill(
    connector_id: str,
    since: Any = None,
    until: Any = None,
    *,
    dataset_name: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Re-run a connector for a historical ``[since, until]`` window (replay, #10).

    CONVENTION: a connector opts into backfill by declaring a ``window_param`` in
    its config. It may be either:
      * a string — the single query-param name to set to ``since`` (e.g.
        ``"start"``), or
      * a dict ``{"since": "<param>", "until": "<param>"}`` — the param names for
        each bound (either may be omitted).
    The bounds are injected as extra query-string params appended to the
    connector's ``url`` for this run only (the stored config is never mutated).

    If the connector declares no ``window_param``, this returns an HONEST
    ``{ok: False, note: "connector has no time window"}`` — it does NOT silently
    do a full re-run and pretend it was a windowed backfill.

    On a supported connector it delegates to :func:`run_connector` with
    ``mode="replay"`` so the audit history distinguishes replays from live runs.
    Never raises."""
    c = get_connector(connector_id, db_path=db_path)
    if c is None:
        return {"ok": False, "error": "unknown connector"}

    cfg = dict(c["config"] or {})
    wp = cfg.get("window_param")
    if not wp:
        # honest: nothing to do, don't fabricate a windowed run.
        _record_run(c["id"], 0, "skipped", "connector has no time window",
                    mode="replay", db_path=db_path)
        return {"ok": False, "note": "connector has no time window"}

    # Resolve which query-param names carry each bound.
    if isinstance(wp, dict):
        since_param = wp.get("since")
        until_param = wp.get("until")
    else:
        since_param = str(wp)
        until_param = None

    params: dict[str, Any] = {}
    if since is not None and since_param:
        params[since_param] = since
    if until is not None and until_param:
        params[until_param] = until

    override: dict[str, Any] = {}
    url = cfg.get("url")
    if url and params:
        sep = "&" if "?" in str(url) else "?"
        from urllib.parse import urlencode
        override["url"] = f"{url}{sep}{urlencode(params)}"

    res = run_connector(
        c["id"], dataset_name=dataset_name,
        config_override=override or None, mode="replay", db_path=db_path,
    )
    res["replay"] = True
    res["window"] = {"since": since, "until": until}
    return res


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
