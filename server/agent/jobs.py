"""Agent OS — job store + async runner (sqlite).

Every tool invocation the agent decides to actually run becomes a *job*: a row in
`server/data/agent_jobs.db` plus a daemon thread that executes a handler, streams
job.* events onto the EventBus, and captures logs + a JSON result.

Lifecycle / status:
    queued    -> created, not yet started
    running   -> worker thread executing the handler
    completed -> handler returned
    failed    -> handler raised (traceback captured in `error` + logs)
    cancelled -> cancel() was called before/while running (cooperative)

The handler signature is `handler(args: dict, ctx) -> result`, where `ctx` gives
the handler `ctx.progress(pct, msg)`, `ctx.log(msg)`, and `ctx.cancelled` so it
can stream progress and bail out early. The same ctx shape is produced by
tools.call(), so tool handlers run unchanged whether invoked directly or via a job.

Nothing here raises to the caller; failures are recorded on the job row.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import traceback
from typing import Any, Callable, Dict, List, Optional

from .events import BUS

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(_ROOT, "server", "data", "agent_jobs.db")

_INIT_LOCK = threading.Lock()
_INITED = False

# Live cancellation flags keyed by job_id (threads are not in the DB).
_CANCEL: Dict[int, threading.Event] = {}
_CANCEL_LOCK = threading.Lock()


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    try:
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA busy_timeout=8000")
        c.execute("PRAGMA synchronous=NORMAL")
    except Exception:  # noqa: BLE001
        pass
    return c


def _ensure() -> None:
    global _INITED
    if _INITED:
        return
    with _INIT_LOCK:
        if _INITED:
            return
        try:
            c = _connect()
            try:
                c.execute(
                    """
                    CREATE TABLE IF NOT EXISTS jobs (
                        id          INTEGER PRIMARY KEY AUTOINCREMENT,
                        tool        TEXT NOT NULL DEFAULT '',
                        args        TEXT NOT NULL DEFAULT '{}',
                        status      TEXT NOT NULL DEFAULT 'queued',
                        progress    INTEGER NOT NULL DEFAULT 0,
                        message     TEXT NOT NULL DEFAULT '',
                        result      TEXT,
                        error       TEXT,
                        logs        TEXT NOT NULL DEFAULT '',
                        run_id      TEXT,
                        created_ts  REAL NOT NULL DEFAULT 0,
                        started_ts  REAL,
                        ended_ts    REAL
                    )
                    """
                )
                c.execute("CREATE INDEX IF NOT EXISTS ix_jobs_created ON jobs(created_ts DESC)")
                c.execute("CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status)")
                c.commit()
            finally:
                c.close()
            _INITED = True
        except Exception:  # noqa: BLE001
            pass


def _row_to_dict(r: sqlite3.Row) -> Dict[str, Any]:
    d = dict(r)
    for k in ("args", "result"):
        v = d.get(k)
        if isinstance(v, str) and v:
            try:
                d[k] = json.loads(v)
            except Exception:  # noqa: BLE001
                pass
    return d


def create(tool: str, args: Optional[Dict[str, Any]] = None, run_id: Optional[str] = None) -> int:
    """Insert a queued job. Returns job_id (or -1 on failure). Emits job.queued."""
    _ensure()
    try:
        args_s = json.dumps(args or {}, ensure_ascii=False, default=str)
    except Exception:  # noqa: BLE001
        args_s = "{}"
    try:
        c = _connect()
        try:
            cur = c.execute(
                "INSERT INTO jobs(tool, args, status, run_id, created_ts) VALUES (?,?,?,?,?)",
                (str(tool or ""), args_s, "queued", (str(run_id) if run_id else None), time.time()),
            )
            c.commit()
            jid = int(cur.lastrowid)
        finally:
            c.close()
        BUS.emit("job.queued", {"job_id": jid, "tool": str(tool or ""), "args": args or {}, "run_id": run_id})
        return jid
    except Exception:  # noqa: BLE001
        return -1


def _set(job_id: int, **fields: Any) -> None:
    if not fields:
        return
    try:
        cols = []
        vals = []
        for k, v in fields.items():
            cols.append(f"{k}=?")
            if k in ("result",) and not isinstance(v, (str, type(None))):
                v = json.dumps(v, ensure_ascii=False, default=str)
            vals.append(v)
        vals.append(int(job_id))
        c = _connect()
        try:
            c.execute(f"UPDATE jobs SET {', '.join(cols)} WHERE id=?", vals)
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


def _append_log(job_id: int, line: str) -> None:
    try:
        stamp = time.strftime("%H:%M:%S")
        c = _connect()
        try:
            c.execute(
                "UPDATE jobs SET logs = logs || ? WHERE id=?",
                (f"[{stamp}] {line}\n", int(job_id)),
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


class _JobCtx:
    """Execution context handed to a handler. Streams to the bus + job row."""

    def __init__(self, job_id: int, tool: str, run_id: Optional[str], cancel_evt: threading.Event) -> None:
        self.job_id = job_id
        self.tool = tool
        self.run_id = run_id
        self._cancel_evt = cancel_evt

    @property
    def cancelled(self) -> bool:
        return self._cancel_evt.is_set()

    def progress(self, pct: Any, msg: str = "") -> None:
        try:
            p = max(0, min(100, int(pct)))
        except (TypeError, ValueError):
            p = 0
        _set(self.job_id, progress=p, message=str(msg)[:500])
        BUS.emit("tool.progress", {"job_id": self.job_id, "tool": self.tool, "pct": p, "msg": str(msg)})
        BUS.emit("job.progress", {"job_id": self.job_id, "tool": self.tool, "pct": p, "msg": str(msg)})

    def log(self, msg: str) -> None:
        _append_log(self.job_id, str(msg))


def run(job_id: int, handler: Callable[[Dict[str, Any], _JobCtx], Any], wait: bool = False) -> threading.Thread:
    """Start `handler` for `job_id` in a daemon thread. Emits job.running/completed/
    failed and tool.started/completed/failed. Returns the Thread (already started).

    If `wait` is True, blocks until the thread finishes (handy for tests/sync use).
    """
    _ensure()

    cancel_evt = threading.Event()
    with _CANCEL_LOCK:
        # If cancel() was called between create() and run(), honour it.
        existing = _CANCEL.get(job_id)
        if existing is not None and existing.is_set():
            cancel_evt.set()
        _CANCEL[job_id] = cancel_evt

    # Load tool/args/run_id off the row.
    tool = ""
    args: Dict[str, Any] = {}
    run_id = None
    try:
        c = _connect()
        try:
            r = c.execute("SELECT tool, args, run_id FROM jobs WHERE id=?", (int(job_id),)).fetchone()
        finally:
            c.close()
        if r:
            tool = r["tool"] or ""
            run_id = r["run_id"]
            try:
                args = json.loads(r["args"] or "{}")
            except Exception:  # noqa: BLE001
                args = {}
    except Exception:  # noqa: BLE001
        pass

    ctx = _JobCtx(job_id, tool, run_id, cancel_evt)

    def _worker() -> None:
        if cancel_evt.is_set():
            _set(job_id, status="cancelled", ended_ts=time.time(), message="cancelled before start")
            BUS.emit("job.failed", {"job_id": job_id, "tool": tool, "error": "cancelled", "run_id": run_id})
            return
        _set(job_id, status="running", started_ts=time.time(), message="running")
        BUS.emit("job.running", {"job_id": job_id, "tool": tool, "args": args, "run_id": run_id})
        BUS.emit("tool.started", {"job_id": job_id, "tool": tool, "args": args, "run_id": run_id})
        _append_log(job_id, f"started tool={tool} args={json.dumps(args, default=str)[:400]}")
        try:
            result = handler(args, ctx)
            if cancel_evt.is_set():
                _set(job_id, status="cancelled", ended_ts=time.time(), progress=100, message="cancelled")
                BUS.emit("job.failed", {"job_id": job_id, "tool": tool, "error": "cancelled", "run_id": run_id})
                return
            _set(job_id, status="completed", ended_ts=time.time(), progress=100,
                 message="completed", result=result)
            _append_log(job_id, "completed ok")
            BUS.emit("tool.completed", {"job_id": job_id, "tool": tool, "result": result, "run_id": run_id})
            BUS.emit("job.completed", {"job_id": job_id, "tool": tool, "result": result, "run_id": run_id})
        except Exception as e:  # noqa: BLE001
            tb = traceback.format_exc()
            _set(job_id, status="failed", ended_ts=time.time(), message=str(e)[:500], error=tb)
            _append_log(job_id, f"FAILED: {e}")
            BUS.emit("tool.failed", {"job_id": job_id, "tool": tool, "error": str(e), "run_id": run_id})
            BUS.emit("job.failed", {"job_id": job_id, "tool": tool, "error": str(e), "run_id": run_id})
        finally:
            with _CANCEL_LOCK:
                _CANCEL.pop(job_id, None)

    th = threading.Thread(target=_worker, name=f"agentjob-{job_id}", daemon=True)
    th.start()
    if wait:
        th.join()
    return th


def get(job_id: int) -> Optional[Dict[str, Any]]:
    _ensure()
    try:
        c = _connect()
        try:
            r = c.execute("SELECT * FROM jobs WHERE id=?", (int(job_id),)).fetchone()
            return _row_to_dict(r) if r else None
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return None


def list_recent(n: int = 25) -> List[Dict[str, Any]]:
    _ensure()
    try:
        n = max(1, min(int(n), 500))
    except (TypeError, ValueError):
        n = 25
    try:
        c = _connect()
        try:
            rows = c.execute(
                "SELECT * FROM jobs ORDER BY created_ts DESC, id DESC LIMIT ?", (n,)
            ).fetchall()
            return [_row_to_dict(r) for r in rows]
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []


def cancel(job_id: int) -> bool:
    """Cooperatively cancel a job. Sets the cancel flag (so a running handler that
    checks ctx.cancelled will stop) and marks queued jobs cancelled immediately.
    Returns True if the job exists and was signalled. Never raises."""
    _ensure()
    try:
        with _CANCEL_LOCK:
            evt = _CANCEL.get(int(job_id))
            if evt is None:
                evt = threading.Event()
                _CANCEL[int(job_id)] = evt
            evt.set()
        cur = get(job_id)
        if cur is None:
            return False
        if cur.get("status") in ("queued",):
            _set(job_id, status="cancelled", ended_ts=time.time(), message="cancelled")
            BUS.emit("job.failed", {"job_id": int(job_id), "tool": cur.get("tool"), "error": "cancelled"})
        return True
    except Exception:  # noqa: BLE001
        return False


if __name__ == "__main__":
    # Self-contained smoke test: real sqlite + real daemon threads + real bus events.
    # Uses a throwaway DB so it never touches the live agent_jobs.db.
    import tempfile

    def check(cond: bool, label: str) -> None:
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            raise SystemExit(1)

    # Point the store at a temp DB and reset init state.
    _tmpdir = tempfile.mkdtemp(prefix="agentjobs_test_")
    DB_PATH = os.path.join(_tmpdir, "agent_jobs.db")
    _INITED = False

    # Capture every event the store emits so we can assert the lifecycle.
    _seen: List[Dict[str, Any]] = []
    _orig_emit = BUS.emit

    def _spy(type: str, data: Optional[Dict[str, Any]] = None) -> int:  # type: ignore[override]
        _seen.append({"type": type, "data": data or {}})
        return _orig_emit(type, data)

    BUS.emit = _spy  # type: ignore[assignment]

    def _types() -> List[str]:
        return [e["type"] for e in _seen]

    # 1) create() inserts a queued row and emits job.queued.
    jid = create("disk.audit", {"path": "/opt"}, run_id="run-1")
    check(jid > 0, "create() returns a positive job_id")
    row = get(jid)
    check(row is not None and row["status"] == "queued", "new job is queued")
    check(row["tool"] == "disk.audit" and row["args"] == {"path": "/opt"}, "tool/args persisted + args JSON-decoded")
    check(row["run_id"] == "run-1", "run_id persisted")
    check("job.queued" in _types(), "create() emits job.queued")

    # 2) run() executes a handler in a daemon thread, streams progress, captures result.
    def _ok_handler(args: Dict[str, Any], ctx: _JobCtx) -> Dict[str, Any]:
        check(ctx.job_id == jid and ctx.tool == "disk.audit" and ctx.run_id == "run-1", "ctx exposes job_id/tool/run_id")
        check(ctx.cancelled is False, "ctx.cancelled starts False")
        ctx.log("doing the work")
        ctx.progress(50, "halfway")
        return {"summary": "ok", "echo": args.get("path")}

    th = run(jid, _ok_handler, wait=False)
    check(th.daemon is True and th.name == f"agentjob-{jid}", "run() uses a named daemon thread")
    th.join(timeout=10)
    check(not th.is_alive(), "worker thread finished")

    done = get(jid)
    check(done["status"] == "completed", "completed job has status=completed")
    check(done["progress"] == 100, "completed job progress forced to 100")
    check(done["result"] == {"summary": "ok", "echo": "/opt"}, "handler result captured + JSON round-trips")
    check("[" in done["logs"] and "doing the work" in done["logs"], "logs timestamped + appended")
    t = _types()
    for evt in ("job.running", "tool.started", "tool.progress", "job.progress", "tool.completed", "job.completed"):
        check(evt in t, f"emitted {evt}")
    check(done["error"] is None, "successful job has no error")

    # 3) run() captures a raising handler as failed with a traceback.
    jid2 = create("boom", {})

    def _bad_handler(args: Dict[str, Any], ctx: _JobCtx) -> Any:
        raise RuntimeError("kaboom")

    run(jid2, _bad_handler, wait=True)
    failed = get(jid2)
    check(failed["status"] == "failed", "raising handler -> status=failed")
    check("kaboom" in (failed["error"] or "") and "Traceback" in (failed["error"] or ""), "failure stores traceback")
    check("kaboom" in failed["message"], "failure message captured")
    check("tool.failed" in _types() and "job.failed" in _types(), "emitted tool.failed + job.failed")

    # 4) cooperative cancellation: handler observes ctx.cancelled and the job ends cancelled.
    jid3 = create("slow", {})
    _started = threading.Event()

    def _slow_handler(args: Dict[str, Any], ctx: _JobCtx) -> Any:
        _started.set()
        for _ in range(200):
            if ctx.cancelled:
                return {"bailed": True}
            time.sleep(0.01)
        return {"bailed": False}

    th3 = run(jid3, _slow_handler, wait=False)
    _started.wait(timeout=5)
    check(cancel(jid3) is True, "cancel() of a running job returns True")
    th3.join(timeout=10)
    cancelled = get(jid3)
    check(cancelled["status"] == "cancelled", "cooperatively cancelled job -> status=cancelled")

    # 5) cancel() before run() is honoured (job never executes the body as completed).
    jid4 = create("preempt", {})
    check(cancel(jid4) is True, "cancel() of a queued job returns True")
    pre = get(jid4)
    check(pre["status"] == "cancelled", "queued job cancelled immediately")
    _ran = {"v": False}

    def _never(args: Dict[str, Any], ctx: _JobCtx) -> Any:
        _ran["v"] = True
        return {}

    run(jid4, _never, wait=True)
    after = get(jid4)
    check(after["status"] == "cancelled", "pre-cancelled job stays cancelled after run()")

    # 6) list_recent() returns newest-first and includes our jobs.
    recent = list_recent(10)
    check(len(recent) >= 4 and recent[0]["id"] >= jid, "list_recent() returns jobs, newest first")

    # 7) get() of a missing job is None; cancel() of a missing job is False.
    check(get(10_000_000) is None, "get() of missing job -> None")
    check(cancel(10_000_001) is False, "cancel() of a non-existent job -> False")

    BUS.emit = _orig_emit  # type: ignore[assignment]
    print("ALL JOBSTORE SMOKE TESTS PASSED")
