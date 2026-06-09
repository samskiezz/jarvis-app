"""PIPELINE SCHEDULER — a lightweight, in-process job scheduler registry (P0).

A stdlib-only (``sqlite3`` + ``asyncio``) scheduler that lets the backend run a
handful of registered maintenance jobs (e.g. ``ingest_all``, a pipeline refresh)
on a fixed interval — without pulling in APScheduler/celery or any new dependency.

Design:
  * **schedule defs** are persisted in SQLite (env ``SCHEDULER_DB``, default
    ``server/data/scheduler.db``) so enabling/disabling a job survives restarts.
    ``schedule()`` / ``list_schedules()`` / ``set_enabled()`` are the registry CRUD.
  * **fn_key** binds a schedule to a registered callable in ``_JOBS`` (a small,
    explicit allow-list — schedules can only ever invoke known, safe jobs; an
    unknown key is simply skipped, never executed).
  * **scheduler_loop()** is an OPT-IN asyncio task (started from the app lifespan
    only when env ``SCHEDULER_ENABLED`` is truthy). It polls due schedules each
    tick and runs them in a threadpool so the event loop is never blocked.

Doctrine (mirrors history_lake / ingestion):
  * stdlib only; never raise on normal use — every public function degrades
    gracefully and returns a safe value on error.
  * NEVER auto-run on import: importing this module touches no network and starts
    no loop. The loop runs only if explicitly awaited AND ``SCHEDULER_ENABLED``.
"""

from __future__ import annotations

import asyncio
import os
import sqlite3
import time
from typing import Callable, Optional

# ── DB location ────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "scheduler.db"
)


def _db_path() -> str:
    """Resolve the DB path at call-time so tests can set ``SCHEDULER_DB``."""
    return os.environ.get("SCHEDULER_DB", _DEFAULT_DB)


def _now_ms() -> int:
    return int(time.time() * 1000)


def scheduler_enabled() -> bool:
    """True iff the env flag opts the loop in. Anything in
    {1,true,yes,on} (case-insensitive) enables it; default is OFF."""
    val = os.environ.get("SCHEDULER_ENABLED", "")
    return str(val).strip().lower() in {"1", "true", "yes", "on"}


# ── job registry (explicit allow-list) ───────────────────────────────────────────
def _job_ingest_all() -> dict:
    """Run every ingestion adapter once (offline-tolerant)."""
    from . import ingestion

    return ingestion.ingest_all()


def _job_scrape_feeds() -> dict:
    """Run every enabled declarative feed once (offline-tolerant)."""
    from . import feed_scraper

    return feed_scraper.scrape_feeds()


def _job_pipeline_refresh() -> dict:
    """Re-run the registered connectors for every catalog dataset that was
    sourced from a live connector. Offline-tolerant; never raises."""
    from . import pipelines as pl

    refreshed = 0
    results: list[dict] = []
    try:
        known = {c["connector"] for c in pl.connectors()}
        for ds in pl.list_datasets():
            source = ds.get("source")
            if source in known and source not in ("derived",):
                schema = ds.get("schema") or {}
                params = schema.get("params") or {}
                res = pl.run_connector(source, params)
                results.append(res)
                refreshed += 1
    except Exception as exc:  # noqa: BLE001 - belt-and-braces: never raise
        return {"refreshed": refreshed, "results": results, "error": str(exc)}
    return {"refreshed": refreshed, "results": results}


# fn_key -> callable. The ONLY jobs a schedule may run.
_JOBS: dict[str, Callable[[], object]] = {
    "ingest_all": _job_ingest_all,
    "scrape_feeds": _job_scrape_feeds,
    "pipeline_refresh": _job_pipeline_refresh,
}


def job_keys() -> list[str]:
    """The registered job fn_keys a schedule may bind to."""
    return sorted(_JOBS.keys())


# ── Schema (idempotent) ─────────────────────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schedule (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name    TEXT    NOT NULL,
    fn_key      TEXT    NOT NULL,
    interval_s  INTEGER NOT NULL DEFAULT 900,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_ts  INTEGER NOT NULL,
    last_run_ts INTEGER,
    last_status TEXT,
    run_count   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (job_name)
);
CREATE INDEX IF NOT EXISTS ix_schedule_enabled ON schedule (enabled);
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
    """Create the schedule table/indexes if absent. Idempotent. Never raises."""
    try:
        conn = _connect(db_path)
        try:
            conn.executescript(SCHEMA_SQL)
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d.get("enabled"))
    d["fn_key_known"] = d.get("fn_key") in _JOBS
    return d


def _load_raw(conn: sqlite3.Connection, schedule_id: int) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM schedule WHERE id=?", (int(schedule_id),)
    ).fetchone()


# ── registry CRUD ─────────────────────────────────────────────────────────────────
def schedule(
    job_name: str,
    fn_key: str,
    interval_s: int = 900,
    enabled: bool = True,
    *,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """Register (or update) a schedule def. Idempotent upsert on ``job_name``.

    ``fn_key`` must name a registered job (see :func:`job_keys`); an unknown key
    is still stored but will never execute (``fn_key_known`` flags this). Returns
    the persisted schedule dict, or ``None`` on error."""
    name = str(job_name or "").strip()
    if not name:
        return None
    key = str(fn_key or "").strip()
    try:
        ival = max(1, int(interval_s))
    except (TypeError, ValueError):
        ival = 900
    init_db(db_path)
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                """
                INSERT INTO schedule
                    (job_name, fn_key, interval_s, enabled, created_ts)
                VALUES (?,?,?,?,?)
                ON CONFLICT(job_name) DO UPDATE SET
                    fn_key=excluded.fn_key,
                    interval_s=excluded.interval_s,
                    enabled=excluded.enabled
                """,
                (name, key, ival, 1 if enabled else 0, _now_ms()),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM schedule WHERE job_name=?", (name,)
            ).fetchone()
            return _row_to_dict(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def list_schedules(db_path: Optional[str] = None) -> list[dict]:
    """List all schedule defs (newest first). Never raises."""
    try:
        conn = _connect(db_path)
        try:
            rows = conn.execute(
                "SELECT * FROM schedule ORDER BY id DESC"
            ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def get_schedule(schedule_id: int, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Fetch one schedule by id (or ``None``)."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, schedule_id)
            return _row_to_dict(row) if row else None
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def set_enabled(
    schedule_id: int, enabled: bool, *, db_path: Optional[str] = None
) -> Optional[dict]:
    """Enable/disable a schedule by id. Returns the updated schedule, or ``None``
    if it does not exist / on error."""
    try:
        conn = _connect(db_path)
        try:
            row = _load_raw(conn, schedule_id)
            if row is None:
                return None
            conn.execute(
                "UPDATE schedule SET enabled=? WHERE id=?",
                (1 if enabled else 0, int(schedule_id)),
            )
            conn.commit()
            return _row_to_dict(_load_raw(conn, schedule_id))
        finally:
            conn.close()
    except (sqlite3.Error, TypeError, ValueError):
        return None


def toggle(schedule_id: int, *, db_path: Optional[str] = None) -> Optional[dict]:
    """Flip a schedule's enabled flag. Returns the updated schedule or ``None``."""
    cur = get_schedule(schedule_id, db_path=db_path)
    if cur is None:
        return None
    return set_enabled(schedule_id, not cur.get("enabled"), db_path=db_path)


def _record_run(
    schedule_id: int, status: str, ts: int, *, db_path: Optional[str] = None
) -> None:
    """Stamp a schedule's last_run_ts/last_status and bump run_count."""
    try:
        conn = _connect(db_path)
        try:
            conn.execute(
                "UPDATE schedule SET last_run_ts=?, last_status=?, "
                "run_count=run_count+1 WHERE id=?",
                (int(ts), str(status)[:200], int(schedule_id)),
            )
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error:
        pass


# ── execution ─────────────────────────────────────────────────────────────────────
def _due_schedules(now_ms: int, db_path: Optional[str] = None) -> list[dict]:
    """Enabled schedules whose interval has elapsed since ``last_run_ts`` (or that
    have never run). Returns dicts; never raises."""
    out: list[dict] = []
    for s in list_schedules(db_path=db_path):
        if not s.get("enabled"):
            continue
        last = s.get("last_run_ts")
        interval_ms = max(1, int(s.get("interval_s", 900))) * 1000
        if last is None or (now_ms - int(last)) >= interval_ms:
            out.append(s)
    return out


def run_due(now_ms: Optional[int] = None, *, db_path: Optional[str] = None) -> list[dict]:
    """Run every due schedule once (synchronously, in-thread). Returns a list of
    per-run summaries ``{id, job_name, fn_key, status}``. Never raises — a failing
    or unknown job is recorded as ``error``/``skipped`` and never aborts the rest.

    This is the unit the async loop drives each tick; it is also directly callable
    (used by tests) without an event loop."""
    now = int(now_ms) if now_ms is not None else _now_ms()
    summaries: list[dict] = []
    for s in _due_schedules(now, db_path=db_path):
        sid = int(s["id"])
        key = s.get("fn_key")
        fn = _JOBS.get(key)
        if fn is None:
            _record_run(sid, "skipped:unknown_fn_key", now, db_path=db_path)
            summaries.append({"id": sid, "job_name": s.get("job_name"),
                              "fn_key": key, "status": "skipped"})
            continue
        try:
            fn()
            status = "ok"
        except Exception as exc:  # noqa: BLE001 - one job failing never aborts the rest
            status = f"error:{exc}"
        _record_run(sid, status, now, db_path=db_path)
        summaries.append({"id": sid, "job_name": s.get("job_name"),
                          "fn_key": key, "status": status.split(":", 1)[0]})
    return summaries


async def scheduler_loop(tick_s: int = 30, *, db_path: Optional[str] = None) -> None:
    """OPT-IN async scheduler loop. Started from the app lifespan ONLY when env
    ``SCHEDULER_ENABLED`` is truthy.

    Each ``tick_s`` seconds it runs any due schedules in a threadpool (so blocking
    jobs never stall the event loop). If the env flag is not set it returns
    immediately without doing anything — so awaiting it on import/test is a no-op.
    Never lets a job error kill the loop; respects cancellation."""
    if not scheduler_enabled():
        return
    init_db(db_path)
    while True:
        try:
            await asyncio.to_thread(run_due, None, db_path=db_path)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - never let the loop die on a job error
            pass
        try:
            await asyncio.sleep(max(1, int(tick_s)))
        except asyncio.CancelledError:
            raise


# NOTE: no init_db()/loop on import — the scheduler is fully opt-in. init_db() is
# called lazily by schedule() and by scheduler_loop() when enabled.
