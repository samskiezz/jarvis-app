"""Forge Scheduler — activates the dormant Forge agent on a safe schedule.

Runs ``forge/forge_agent.py`` in a background task started from the app lifespan.
All configuration is env-driven; defaults are conservative (dry-run, long
interval) so the scheduler is safe to enable without surprise mutations.
"""

from __future__ import annotations

import asyncio
import os
import sqlite3
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

# ── Config via env ────────────────────────────────────────────────────────────

FORGE_SCHEDULE_ENABLED = os.environ.get("FORGE_SCHEDULE_ENABLED", "").lower() in ("1", "true", "yes")
FORGE_INTERVAL_HOURS = max(1, int(os.environ.get("FORGE_INTERVAL_HOURS", "24")))
FORGE_DRY_RUN = os.environ.get("FORGE_DRY_RUN", "1") != "0"
FORGE_WHATSAPP_ENABLED = os.environ.get("FORGE_WHATSAPP_ENABLED", "").lower() in ("1", "true", "yes")
FORGE_MAX_CYCLE_S = max(60, int(os.environ.get("FORGE_MAX_CYCLE_S", "1800")))

# ── DB ────────────────────────────────────────────────────────────────────────
_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "pattern_oracle.db",
)


def _db_path() -> str:
    return os.environ.get("PATTERN_ORACLE_DB", _DEFAULT_DB)


_MEMORY_CONN: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS forge_runs (
    id          TEXT PRIMARY KEY,
    started_ts  INTEGER NOT NULL,
    finished_ts INTEGER,
    status      TEXT NOT NULL DEFAULT 'running',
    branch      TEXT,
    dry_run     INTEGER NOT NULL DEFAULT 1,
    whatsapp    INTEGER NOT NULL DEFAULT 0,
    report      TEXT,
    error       TEXT
);
"""


def _conn() -> sqlite3.Connection:
    global _MEMORY_CONN
    path = _db_path()
    if path == ":memory:":
        if _MEMORY_CONN is None:
            _MEMORY_CONN = sqlite3.connect(path, check_same_thread=False)
            _MEMORY_CONN.row_factory = sqlite3.Row
            _MEMORY_CONN.executescript(_SCHEMA)
        return _MEMORY_CONN
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    return conn


# ── Core helpers ──────────────────────────────────────────────────────────────

def _app_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _current_branch() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=_app_root(),
            capture_output=True,
            text=True,
            check=True,
        )
        return out.stdout.strip()
    except Exception:
        return ""


def _is_forge_branch() -> bool:
    branch = _current_branch()
    return branch.startswith("forge/") or branch == ""


def _next_02_00() -> float:
    """Seconds until the next 02:00 local time."""
    now = datetime.now()
    target = now.replace(hour=2, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _run_forge_cycle() -> dict[str, Any]:
    """Execute one Forge cycle as a subprocess.  Returns a report dict."""
    env = os.environ.copy()
    env["FORGE_APPLY"] = "0" if FORGE_DRY_RUN else "1"
    env["FORGE_PUSH"] = "0"
    env["FORGE_OPEN_PR"] = "0"
    if FORGE_WHATSAPP_ENABLED:
        env["FORGE_APPROVAL"] = "whatsapp"
    env["FORGE_MAX_CYCLES"] = "1"
    env["FORGE_MAX_RUNTIME_S"] = str(FORGE_MAX_CYCLE_S)
    env["FORGE_INTERVAL_S"] = "0"

    cmd = [sys.executable, "-m", "forge.forge_agent"]
    # If that fails (forge not a package), try direct script
    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=_app_root(),
            capture_output=True,
            text=True,
            timeout=FORGE_MAX_CYCLE_S,
            env=env,
        )
    except Exception as exc:
        return {"status": "error", "error": str(exc), "stdout": "", "stderr": ""}

    return {
        "status": "success" if proc.returncode == 0 else "failed",
        "returncode": proc.returncode,
        "stdout": proc.stdout[-8000:] if len(proc.stdout) > 8000 else proc.stdout,
        "stderr": proc.stderr[-4000:] if len(proc.stderr) > 4000 else proc.stderr,
        "elapsed_s": round(time.time() - started, 2),
    }


async def _run_one_cycle() -> dict[str, Any]:
    """Run a single Forge cycle, log it, and return the report."""
    run_id = str(uuid.uuid4())
    started = int(time.time() * 1000)
    branch = _current_branch()
    dry = 1 if FORGE_DRY_RUN else 0
    wa = 1 if FORGE_WHATSAPP_ENABLED else 0

    # Insert start record
    try:
        with _conn() as conn:
            conn.execute(
                "INSERT INTO forge_runs (id, started_ts, status, branch, dry_run, whatsapp) VALUES (?,?,?,?,?,?)",
                (run_id, started, "running", branch, dry, wa),
            )
    except Exception:
        pass

    report: dict[str, Any] = {"run_id": run_id, "dry_run": bool(dry), "whatsapp": bool(wa)}
    try:
        if not _is_forge_branch() and not FORGE_DRY_RUN:
            report["status"] = "skipped"
            report["reason"] = f"current branch ({branch}) is not a forge/* branch; refusing to apply"
        else:
            result = await asyncio.to_thread(_run_forge_cycle)
            report.update(result)
    except Exception as exc:
        report["status"] = "error"
        report["error"] = str(exc)

    finished = int(time.time() * 1000)
    try:
        with _conn() as conn:
            conn.execute(
                "UPDATE forge_runs SET finished_ts=?, status=?, report=?, error=? WHERE id=?",
                (
                    finished,
                    report.get("status", "unknown"),
                    str(report.get("stdout", ""))[:4000],
                    report.get("error", ""),
                    run_id,
                ),
            )
    except Exception:
        pass
    return report


async def _scheduler_loop():
    """The background loop: sleep until next 02:00, run, repeat."""
    while True:
        try:
            delay = _next_02_00()
            # Cap sleep to interval as a safety backstop
            delay = min(delay, FORGE_INTERVAL_HOURS * 3600.0)
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            return
        try:
            await _run_one_cycle()
        except asyncio.CancelledError:
            return
        except Exception:
            # Never let the scheduler die
            pass


async def start_forge_scheduler(app_state: dict) -> asyncio.Task:
    """Start the Forge background scheduler if enabled.

    Returns the asyncio Task so the lifespan can cancel it on shutdown.
    The scheduler is a no-op when ``FORGE_SCHEDULE_ENABLED`` is false.
    """
    if not FORGE_SCHEDULE_ENABLED:
        return asyncio.create_task(_noop_task())
    task = asyncio.create_task(_scheduler_loop())
    app_state["forge_scheduler_task"] = task
    return task


async def _noop_task():
    """Placeholder task that sleeps forever when scheduler is disabled."""
    while True:
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            return


async def forge_scheduler_status() -> dict[str, Any]:
    """Health/read-out of the Forge scheduler."""
    try:
        with _conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM forge_runs").fetchone()[0]
            last = conn.execute(
                "SELECT * FROM forge_runs ORDER BY started_ts DESC LIMIT 1"
            ).fetchone()
    except Exception:
        total, last = 0, None
    return {
        "enabled": FORGE_SCHEDULE_ENABLED,
        "dry_run": FORGE_DRY_RUN,
        "whatsapp": FORGE_WHATSAPP_ENABLED,
        "interval_hours": FORGE_INTERVAL_HOURS,
        "total_runs": total,
        "last_run": dict(last) if last else None,
    }
