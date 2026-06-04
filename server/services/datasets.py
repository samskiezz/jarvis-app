"""DATA-INTEGRATION DEPTH — dataset catalog, schema registry/versioning,
transforms, lineage/provenance graph, and data-health monitors (Foundry P1).

This is the *depth* layer that sits ALONGSIDE the existing pipelines integration
plane (``server/services/pipelines.py``). Where ``pipelines`` is a thin
name->series catalog plus connectors/transforms, this module implements the
richer Foundry-style data-management primitives requested by P1 #3/#4/#5/#7/#8:

  * **dataset catalog (#3)** — first-class ``dataset`` rows with a stable id,
    owner, kind, a registered JSON schema, freshness + row-count, and creation ts.
  * **transforms (#4)** — recorded ``transform`` rows (name, inputs, output
    dataset, language, code) so derivations are auditable code-as-data.
  * **lineage / provenance graph (#5)** — a generic directed-edge ``lineage``
    table (source->dataset, transform->dataset, dataset->dataset) exposed as a
    ``{nodes, edges}`` graph.
  * **data-health monitors (#7)** — ``health(dataset_id)`` computes honest checks
    (null-rate, row-count, staleness vs an SLA, simple mean-shift drift) from the
    backing History-Lake series when the dataset maps to one; otherwise it falls
    back to freshness/row-count from the catalog and says so.
  * **schema registry / versioning (#8)** — ``dataset_version`` rows keep the full
    history of a dataset's schema, with ``bump_version`` appending a new version.

Doctrine (mirrors ``history_lake`` / ``pipelines``):
  * stdlib ``sqlite3`` only — no new dependency.
  * idempotent DDL (``CREATE TABLE IF NOT EXISTS``) + idempotent writes.
  * never raise on normal use — every public function degrades gracefully and
    returns a sensible empty/zero value on error.

DB path comes from env ``DATASETS_DB`` (default ``server/data/datasets.db``).
Tests pass a temp path via the env var. The backing series store is the History
Lake (env ``HISTORY_LAKE_DB``), reused, never duplicated.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

from . import history_lake as lake

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "datasets.db"
)

# Default staleness SLA used by health monitors when a dataset doesn't declare
# one in its schema (``schema["sla_ms"]``). 36h covers daily feeds + slack.
_DEFAULT_SLA_MS = 36 * 60 * 60 * 1000


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``DATASETS_DB``."""
    return os.environ.get("DATASETS_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS dataset (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    owner       TEXT,
    kind        TEXT    NOT NULL DEFAULT 'table',
    schema_json TEXT    NOT NULL DEFAULT '{}',
    series_id   TEXT,
    freshness_ts INTEGER,
    row_count   INTEGER NOT NULL DEFAULT 0,
    created_ts  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_version (
    id          TEXT    PRIMARY KEY,
    dataset_id  TEXT    NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    schema_json TEXT    NOT NULL DEFAULT '{}',
    ts          INTEGER NOT NULL,
    note        TEXT,
    UNIQUE (dataset_id, version)
);
CREATE INDEX IF NOT EXISTS ix_dsver_dataset ON dataset_version (dataset_id, version);

CREATE TABLE IF NOT EXISTS transform (
    id             TEXT    PRIMARY KEY,
    name           TEXT    NOT NULL,
    inputs_json    TEXT    NOT NULL DEFAULT '[]',
    output_dataset TEXT,
    language       TEXT    NOT NULL DEFAULT 'sql',
    code           TEXT,
    ts             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_transform_output ON transform (output_dataset);

CREATE TABLE IF NOT EXISTS lineage (
    id   TEXT NOT NULL PRIMARY KEY,
    src  TEXT NOT NULL,
    dst  TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'dataset->dataset',
    ts   INTEGER NOT NULL,
    UNIQUE (src, dst, kind)
);
CREATE INDEX IF NOT EXISTS ix_lineage_src ON lineage (src);
CREATE INDEX IF NOT EXISTS ix_lineage_dst ON lineage (dst);
"""


# ── Connection management ────────────────────────────────────────────────────────
def _connect(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open a connection with WAL where possible. Mirrors history_lake."""
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
        conn.execute("PRAGMA foreign_keys=ON")
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


# ── helpers ────────────────────────────────────────────────────────────────────
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


def _row_to_dataset(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "owner": row["owner"],
        "kind": row["kind"],
        "schema": _loads(row["schema_json"], {}),
        "series_id": row["series_id"],
        "freshness_ts": row["freshness_ts"],
        "row_count": row["row_count"],
        "created_ts": row["created_ts"],
    }


# ── dataset catalog + schema registry (#3, #8) ───────────────────────────────────
def register_dataset(
    name: str,
    owner: Optional[str] = None,
    kind: str = "table",
    schema: Optional[dict] = None,
    *,
    series_id: Optional[str] = None,
    dataset_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict:
    """Register (or update) a dataset and seed/refresh its version-1 schema.

    ``name`` is the unique catalog key; a stable ``id`` is derived from it (or
    supplied). ``kind`` is a free label ('table'|'series'|'derived'|...).
    ``schema`` is a free-form descriptive dict (columns/units/sla_ms/...).
    ``series_id`` optionally binds the dataset to a History-Lake series so health
    can be computed from observations. Idempotent upsert on ``name``: re-register
    updates owner/kind/schema/series_id but never duplicates the row, and ensures
    a ``dataset_version`` row exists (version 1) without bumping. Never raises.
    """
    if not name:
        return {"ok": False, "error": "name required"}
    init_db(db_path)
    did = dataset_id or uuid.uuid5(uuid.NAMESPACE_URL, f"dataset|{name}").hex
    schema_json = _dumps(schema or {}, "{}")
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO dataset
                    (id, name, owner, kind, schema_json, series_id, freshness_ts,
                     row_count, created_ts)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                    owner=excluded.owner,
                    kind=excluded.kind,
                    schema_json=excluded.schema_json,
                    series_id=COALESCE(excluded.series_id, dataset.series_id)
                """,
                (did, name, owner, kind, schema_json, series_id, None, 0, now),
            )
            # Resolve the canonical id (a prior run may own a different id for name).
            row = conn.execute("SELECT id FROM dataset WHERE name=?", (name,)).fetchone()
            did = row["id"] if row else did
            # Ensure a version-1 row exists (idempotent) without bumping.
            existing = conn.execute(
                "SELECT 1 FROM dataset_version WHERE dataset_id=? LIMIT 1", (did,)
            ).fetchone()
            if existing is None:
                conn.execute(
                    """
                    INSERT INTO dataset_version (id, dataset_id, version, schema_json, ts, note)
                    VALUES (?,?,?,?,?,?)
                    ON CONFLICT(dataset_id, version) DO NOTHING
                    """,
                    (uuid.uuid4().hex, did, 1, schema_json, now, "initial"),
                )
            else:
                # Keep the latest registered schema reflected in v1 if it's the only
                # version, so a re-register before any bump stays consistent.
                conn.execute(
                    "UPDATE dataset_version SET schema_json=? WHERE dataset_id=? AND version=1",
                    (schema_json, did),
                )
            conn.commit()
        finally:
            conn.close()
        # Auto-refresh freshness/row-count if bound to a series.
        if series_id:
            update_freshness(did, db_path=db_path)
        return {"ok": True, "id": did, "name": name, "owner": owner,
                "kind": kind, "series_id": series_id}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


def get_dataset(dataset_id: str, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one dataset by id (or by name as a fallback). Returns None if absent.

    The returned dict includes ``current_version`` and a ``versions`` list (most
    recent first) so the schema registry is visible in one read."""
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT * FROM dataset WHERE id=? OR name=?", (dataset_id, dataset_id)
            ).fetchone()
            if row is None:
                return None
            ds = _row_to_dataset(row)
            vrows = conn.execute(
                "SELECT version, schema_json, ts, note FROM dataset_version "
                "WHERE dataset_id=? ORDER BY version DESC",
                (ds["id"],),
            ).fetchall()
            ds["versions"] = [
                {"version": v["version"], "schema": _loads(v["schema_json"], {}),
                 "ts": v["ts"], "note": v["note"]}
                for v in vrows
            ]
            ds["current_version"] = ds["versions"][0]["version"] if ds["versions"] else 0
            return ds
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_datasets(db_path: Optional[str] = None) -> list[dict]:
    """List the dataset catalog (most recently created first)."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM dataset ORDER BY created_ts DESC, name ASC"
            ).fetchall()
            return [_row_to_dataset(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def bump_version(
    dataset_id: str, schema: dict, note: Optional[str] = None, *, db_path: Optional[str] = None
) -> dict:
    """Append a new schema version for a dataset (schema registry / versioning #8).

    The new version is ``max(version)+1``; the dataset's live ``schema_json`` is
    updated to the new schema while ALL prior versions are retained. Returns
    ``{ok, id, version}``; never raises."""
    ds = get_dataset(dataset_id, db_path=db_path)
    if ds is None:
        return {"ok": False, "error": f"unknown dataset '{dataset_id}'"}
    did = ds["id"]
    schema_json = _dumps(schema or {}, "{}")
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            row = conn.execute(
                "SELECT COALESCE(MAX(version), 0) AS mx FROM dataset_version WHERE dataset_id=?",
                (did,),
            ).fetchone()
            nextv = int(row["mx"]) + 1
            conn.execute(
                """
                INSERT INTO dataset_version (id, dataset_id, version, schema_json, ts, note)
                VALUES (?,?,?,?,?,?)
                """,
                (uuid.uuid4().hex, did, nextv, schema_json, now, note),
            )
            conn.execute(
                "UPDATE dataset SET schema_json=? WHERE id=?", (schema_json, did)
            )
            conn.commit()
            return {"ok": True, "id": did, "version": nextv}
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


# ── transforms (#4) ──────────────────────────────────────────────────────────────
def record_transform(
    name: str,
    inputs: Optional[list],
    output_dataset: Optional[str],
    language: str = "sql",
    code: Optional[str] = None,
    *,
    add_lineage_edges: bool = True,
    db_path: Optional[str] = None,
) -> dict:
    """Record a transform (code-as-data) and, by default, the lineage edges it
    implies: one ``transform->dataset`` edge to its output and one
    ``dataset->dataset`` edge per input->output. ``inputs`` is a list of upstream
    dataset ids/names. Returns ``{ok, id}``; never raises."""
    if not name:
        return {"ok": False, "error": "name required"}
    init_db(db_path)
    tid = uuid.uuid4().hex
    inputs = list(inputs or [])
    inputs_json = _dumps(inputs, "[]")
    now = _now_ms()
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO transform
                    (id, name, inputs_json, output_dataset, language, code, ts)
                VALUES (?,?,?,?,?,?,?)
                """,
                (tid, name, inputs_json, output_dataset, language, code, now),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}
    if add_lineage_edges and output_dataset:
        # transform node id is namespaced so it never collides with a dataset id.
        add_lineage(f"transform:{tid}", output_dataset, "transform->dataset", db_path=db_path)
        for src in inputs:
            if src:
                add_lineage(str(src), output_dataset, "dataset->dataset", db_path=db_path)
    return {"ok": True, "id": tid, "output_dataset": output_dataset}


def list_transforms(db_path: Optional[str] = None) -> list[dict]:
    """List recorded transforms (most recent first)."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute("SELECT * FROM transform ORDER BY ts DESC").fetchall()
            return [
                {"id": r["id"], "name": r["name"],
                 "inputs": _loads(r["inputs_json"], []),
                 "output_dataset": r["output_dataset"],
                 "language": r["language"], "code": r["code"], "ts": r["ts"]}
                for r in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


# ── lineage / provenance graph (#5) ──────────────────────────────────────────────
def add_lineage(src: str, dst: str, kind: str = "dataset->dataset", *, db_path: Optional[str] = None) -> dict:
    """Add a directed lineage edge ``src -> dst`` of the given ``kind``
    (source->dataset | transform->dataset | dataset->dataset). Idempotent on
    (src, dst, kind). Returns ``{ok, id}``; never raises."""
    if not src or not dst:
        return {"ok": False, "error": "src and dst required"}
    init_db(db_path)
    eid = uuid.uuid5(uuid.NAMESPACE_URL, f"{src}|{dst}|{kind}").hex
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO lineage (id, src, dst, kind, ts)
                VALUES (?,?,?,?,?)
                ON CONFLICT(src, dst, kind) DO NOTHING
                """,
                (eid, src, dst, kind, _now_ms()),
            )
            conn.commit()
            return {"ok": True, "id": eid}
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


def lineage_graph(db_path: Optional[str] = None) -> dict:
    """Return the full provenance graph as ``{nodes, edges}``.

    Nodes are typed: every dataset id is a 'dataset' node; ``transform:<id>``
    endpoints are 'transform' nodes; any other src endpoint is a 'source' node.
    Never raises."""
    edges: list[dict] = []
    try:
        conn = _connect(db_path)
        try:
            erows = conn.execute(
                "SELECT src, dst, kind, ts FROM lineage ORDER BY ts"
            ).fetchall()
            drows = conn.execute("SELECT id, name FROM dataset").fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return {"nodes": [], "edges": []}

    dataset_ids = {r["id"] for r in drows}
    name_by_id = {r["id"]: r["name"] for r in drows}

    def _node_type(n: str) -> str:
        if n in dataset_ids:
            return "dataset"
        if str(n).startswith("transform:"):
            return "transform"
        return "source"

    node_ids: set[str] = set()
    for r in erows:
        edges.append({"src": r["src"], "dst": r["dst"], "kind": r["kind"], "ts": r["ts"]})
        node_ids.add(r["src"])
        node_ids.add(r["dst"])
    # Include catalogued datasets even if they have no edges yet.
    node_ids.update(dataset_ids)

    nodes = [
        {"id": n, "type": _node_type(n), "label": name_by_id.get(n, n)}
        for n in sorted(node_ids)
    ]
    return {"nodes": nodes, "edges": edges}


# ── freshness / row-count refresh ────────────────────────────────────────────────
def update_freshness(
    dataset_id: str, row_count: Optional[int] = None, *, db_path: Optional[str] = None
) -> dict:
    """Refresh a dataset's ``row_count`` + ``freshness_ts``.

    If ``row_count`` is given it is used directly (freshness_ts = now). Otherwise,
    when the dataset is bound to a History-Lake series, the count and last
    observation ts are read from the lake. Returns ``{ok, row_count, freshness_ts}``;
    never raises."""
    ds = get_dataset(dataset_id, db_path=db_path)
    if ds is None:
        return {"ok": False, "error": f"unknown dataset '{dataset_id}'"}
    did = ds["id"]
    if row_count is not None:
        rc = int(row_count)
        fresh = _now_ms()
    else:
        sid = ds.get("series_id")
        if sid:
            obs = lake.read_series(sid)
            rc = len(obs)
            fresh = int(obs[-1]["t"]) if obs else None
        else:
            rc = ds.get("row_count") or 0
            fresh = ds.get("freshness_ts")
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE dataset SET row_count=?, freshness_ts=? WHERE id=?",
                (int(rc), fresh, did),
            )
            conn.commit()
        finally:
            conn.close()
        return {"ok": True, "row_count": int(rc), "freshness_ts": fresh}
    except sqlite3.Error as exc:
        return {"ok": False, "error": str(exc)}


# ── data-health monitors (#7) ────────────────────────────────────────────────────
def _check(name: str, status: str, value: Any, threshold: Any) -> dict:
    return {"name": name, "status": status, "value": value, "threshold": threshold}


def health(dataset_id: str, *, db_path: Optional[str] = None) -> dict:
    """Compute data-health checks for a dataset.

    When the dataset is backed by a History-Lake series, computes:
      * ``row_count``     — total observations (warn if 0).
      * ``null_rate``     — fraction of non-finite values (fail >5%, warn >0).
      * ``staleness``     — ms since last observation vs an SLA
                            (``schema["sla_ms"]`` or a 36h default); fail if over.
      * ``drift``         — abs mean-shift between the first and last window
                            (default 10 points each) normalised by the first
                            window mean; warn if > ``schema["drift_threshold"]``
                            (default 0.5 = 50%).

    When there is NO backing series, returns only ``row_count`` + ``freshness``
    checks from the catalog row and sets ``backed_by_series=False`` so the caller
    knows the health is partial/honest. The overall ``status`` is the worst of the
    individual check statuses (fail > warn > ok). Never raises.
    """
    ds = get_dataset(dataset_id, db_path=db_path)
    if ds is None:
        return {"ok": False, "found": False, "dataset_id": dataset_id,
                "status": "unknown", "backed_by_series": False, "checks": []}

    schema = ds.get("schema") or {}
    try:
        sla_ms = int(schema.get("sla_ms", _DEFAULT_SLA_MS))
    except (TypeError, ValueError):
        sla_ms = _DEFAULT_SLA_MS
    try:
        drift_threshold = float(schema.get("drift_threshold", 0.5))
    except (TypeError, ValueError):
        drift_threshold = 0.5
    try:
        window = max(1, int(schema.get("drift_window", 10)))
    except (TypeError, ValueError):
        window = 10

    checks: list[dict] = []
    sid = ds.get("series_id")
    backed = bool(sid)
    now = _now_ms()

    if not backed:
        # Honest fallback: freshness + row_count from the catalog only.
        rc = ds.get("row_count") or 0
        checks.append(_check("row_count", "ok" if rc > 0 else "warn", rc, ">0"))
        fresh_ts = ds.get("freshness_ts")
        if fresh_ts is None:
            checks.append(_check("freshness", "warn", None, f"<= {sla_ms} ms"))
        else:
            age = max(0, now - int(fresh_ts))
            checks.append(_check(
                "freshness", "fail" if age > sla_ms else "ok", age, f"<= {sla_ms} ms"))
        status = _worst(checks)
        return {"ok": True, "found": True, "dataset_id": ds["id"], "name": ds["name"],
                "backed_by_series": False, "status": status, "checks": checks,
                "note": "no backing History-Lake series; freshness/row_count only"}

    obs = lake.read_series(sid)
    n = len(obs)

    # row_count
    checks.append(_check("row_count", "ok" if n > 0 else "warn", n, ">0"))

    # null_rate
    if n == 0:
        checks.append(_check("null_rate", "warn", None, "<= 0.05"))
        checks.append(_check("staleness", "warn", None, f"<= {sla_ms} ms"))
        checks.append(_check("drift", "ok", None, f"<= {drift_threshold}"))
        status = _worst(checks)
        return {"ok": True, "found": True, "dataset_id": ds["id"], "name": ds["name"],
                "backed_by_series": True, "series_id": sid, "status": status, "checks": checks}

    nulls = sum(1 for p in obs if p["v"] is None or not math.isfinite(float(p["v"])))
    null_rate = nulls / n
    null_status = "fail" if null_rate > 0.05 else ("warn" if null_rate > 0 else "ok")
    checks.append(_check("null_rate", null_status, round(null_rate, 6), "<= 0.05"))

    # staleness vs SLA
    last_ts = int(obs[-1]["t"])
    age = max(0, now - last_ts)
    checks.append(_check(
        "staleness", "fail" if age > sla_ms else "ok", age, f"<= {sla_ms} ms"))

    # drift: mean shift between the first and last window
    vals = [float(p["v"]) for p in obs if p["v"] is not None and math.isfinite(float(p["v"]))]
    if len(vals) >= 2:
        w = min(window, len(vals) // 2) or 1
        first = vals[:w]
        last = vals[-w:]
        m0 = sum(first) / len(first)
        m1 = sum(last) / len(last)
        denom = abs(m0) if abs(m0) > 1e-12 else 1.0
        drift = abs(m1 - m0) / denom
        drift_status = "warn" if drift > drift_threshold else "ok"
        checks.append(_check("drift", drift_status, round(drift, 6), f"<= {drift_threshold}"))
    else:
        checks.append(_check("drift", "ok", 0.0, f"<= {drift_threshold}"))

    status = _worst(checks)
    return {"ok": True, "found": True, "dataset_id": ds["id"], "name": ds["name"],
            "backed_by_series": True, "series_id": sid, "rows": n,
            "status": status, "checks": checks}


def _worst(checks: list[dict]) -> str:
    """Roll individual check statuses up to a single overall status."""
    rank = {"ok": 0, "warn": 1, "fail": 2}
    worst = "ok"
    for c in checks:
        if rank.get(c.get("status"), 0) > rank.get(worst, 0):
            worst = c["status"]
    return worst


# ── seed from the History Lake so the catalog isn't empty ────────────────────────
def seed_from_history_lake(db_path: Optional[str] = None) -> dict:
    """Register one dataset per existing History-Lake series (idempotent).

    Dataset name is ``"{source}:{entity}:{metric}"``; it is bound to the series so
    health monitors work out of the box. Re-running updates freshness/row-count
    but never duplicates rows. Returns ``{ok, registered, total}``."""
    init_db(db_path)
    try:
        series = lake.list_series()
    except Exception:  # noqa: BLE001 - lake degrades to [] anyway, belt-and-braces
        series = []
    registered = 0
    for s in series:
        name = f"{s.get('source')}:{s.get('entity')}:{s.get('metric')}"
        schema = {
            "source": s.get("source"),
            "entity": s.get("entity"),
            "metric": s.get("metric"),
            "unit": s.get("unit"),
            "freq": s.get("freq"),
        }
        res = register_dataset(
            name, owner="history-lake", kind="series", schema=schema,
            series_id=s.get("series_id"), db_path=db_path,
        )
        if res.get("ok"):
            registered += 1
            # Record a source->dataset lineage edge so seeded datasets show provenance.
            add_lineage(
                f"source:{s.get('source')}", res["id"], "source->dataset", db_path=db_path
            )
    return {"ok": True, "registered": registered, "total": len(series)}


# Bootstrap the default DB on import so the first request finds the tables.
init_db()
