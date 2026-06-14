"""Proactive Intelligence Loop — async background task that monitors, reasons,
proposes, and notifies.

The loop runs every ``PROACTIVE_LOOP_INTERVAL`` seconds (default 60) and is
opt-in via ``PROACTIVE_LOOP_ENABLED``.  It is safe to start/stop via lifespan
and never blocks request handling.

Design:
  * Monitors: system health, ontology changes, pending alerts, user inactivity
  * Reasoning: synthesizes "what the user needs to know now" using LLM when available
  * Proposal: generates a ``ProactiveNotification`` with severity (info/warning/action)
  * Notification: stores in SQLite; optionally streams via SSE (consumer pulls from DB)
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
import uuid
from typing import Any, Optional

# ── Config ───────────────────────────────────────────────────────────────────
_ENABLED = os.environ.get("PROACTIVE_LOOP_ENABLED", "").lower() in ("1", "true", "yes")
_INTERVAL = max(10, int(os.environ.get("PROACTIVE_LOOP_INTERVAL", "60")))
# Conservative default: the proactive loop's monitors are all cheap/rule-based. Its one
# optional LLM call (a 128-token summary when >=3 alerts pile up) stays OFF unless this is
# set, so the always-on "essential" loop never quietly hits the GPU.
_LLM_SUMMARY = os.environ.get("PROACTIVE_LLM_SUMMARY", "").lower() in ("1", "true", "yes")

_DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "proactive.db"
)
_DB_PATH = os.environ.get("PROACTIVE_DB", _DEFAULT_DB)

# ── Storage ──────────────────────────────────────────────────────────────────


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(_DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def _init_db_sync() -> None:
    try:
        c = _conn()
        try:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS proactive_notification (
                    id TEXT PRIMARY KEY,
                    ts INTEGER NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'info',
                    category TEXT NOT NULL DEFAULT 'general',
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    user_id TEXT,
                    acked INTEGER NOT NULL DEFAULT 0,
                    acked_at INTEGER,
                    meta TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_pn_user ON proactive_notification(user_id);
                CREATE INDEX IF NOT EXISTS idx_pn_ack ON proactive_notification(acked, ts DESC);
                CREATE INDEX IF NOT EXISTS idx_pn_severity ON proactive_notification(severity, ts DESC);
                """
            )
            c.commit()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        pass


async def init_db() -> None:
    await asyncio.to_thread(_init_db_sync)


# ── Notification CRUD ────────────────────────────────────────────────────────

# Notification discipline (2026 research: a proactive assistant that over-notifies gets muted by Friday).
# CRITICAL/safety always go through (vital for the care use-case); everything else respects QUIET HOURS
# and a small DAILY BUDGET so JARVIS stays calm and trusted instead of spammy.
_CRITICAL_SEV = {"critical", "emergency", "safety", "danger", "alert", "urgent", "high"}


def _quiet_hours_now() -> bool:
    import datetime
    try:
        qs = int(os.environ.get("PROACTIVE_QUIET_START", "21"))   # 21:00
        qe = int(os.environ.get("PROACTIVE_QUIET_END", "8"))      # 08:00
    except Exception:  # noqa: BLE001
        qs, qe = 21, 8
    h = datetime.datetime.now().hour
    return (qs <= h or h < qe) if qs > qe else (qs <= h < qe)


def _today_noncritical_count() -> int:
    import datetime
    start = int(datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    c = _conn()
    try:
        placeholders = ",".join("?" for _ in _CRITICAL_SEV)
        row = c.execute(
            f"SELECT COUNT(*) FROM proactive_notification WHERE ts>=? AND lower(severity) NOT IN ({placeholders})",
            (start, *(s for s in _CRITICAL_SEV))).fetchone()
        return int(row[0]) if row else 0
    except Exception:  # noqa: BLE001
        return 0
    finally:
        c.close()


async def store_notification(
    title: str,
    body: str,
    severity: str = "info",
    category: str = "general",
    user_id: str | None = None,
    meta: dict | None = None,
) -> dict:
    await init_db()
    nid = uuid.uuid4().hex[:16]
    now = int(time.time())
    # DISCIPLINE: critical always fires; non-critical honours quiet hours + a daily budget.
    sev = (severity or "info").lower()
    if sev not in _CRITICAL_SEV:
        if _quiet_hours_now():
            return {"ok": True, "suppressed": "quiet_hours", "id": None}
        try:
            budget = int(os.environ.get("PROACTIVE_DAILY_BUDGET", "5"))
        except Exception:  # noqa: BLE001
            budget = 5
        if await asyncio.to_thread(_today_noncritical_count) >= budget:
            return {"ok": True, "suppressed": "daily_budget", "id": None}
    try:

        def _insert():
            c = _conn()
            try:
                c.execute(
                    "INSERT INTO proactive_notification (id,ts,severity,category,title,body,user_id,acked,meta) VALUES (?,?,?,?,?,?,?,?,?)",
                    (nid, now, severity, category, title, body, user_id or "all", 0, json.dumps(meta or {}, default=str)),
                )
                c.commit()
            finally:
                c.close()

        await asyncio.to_thread(_insert)
        return {"ok": True, "id": nid, "ts": now, "severity": severity}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


async def list_notifications(
    user_id: str | None = None,
    acked: bool | None = False,
    severity: str | None = None,
    limit: int = 50,
) -> list[dict]:
    await init_db()
    lim = max(1, int(limit))
    uid = user_id or "all"
    try:

        def _query():
            c = _conn()
            try:
                # A notification is visible to a user if it is addressed to them
                # OR is a global broadcast (user_id='all', the proactive loop's
                # default). Without the 'all' fallback the UI (which asks for a
                # specific user_id) never sees the loop's own notifications.
                if severity:
                    rows = c.execute(
                        "SELECT * FROM proactive_notification WHERE (user_id=? OR user_id='all') AND severity=? AND acked=? ORDER BY ts DESC LIMIT ?",
                        (uid, severity, 1 if acked else 0, lim),
                    ).fetchall()
                else:
                    rows = c.execute(
                        "SELECT * FROM proactive_notification WHERE (user_id=? OR user_id='all') AND acked=? ORDER BY ts DESC LIMIT ?",
                        (uid, 1 if acked else 0, lim),
                    ).fetchall()
            finally:
                c.close()
            out = []
            for r in rows:
                d = dict(r)
                d["acked"] = bool(d["acked"])
                d["meta"] = json.loads(d.get("meta") or "{}")
                out.append(d)
            return out

        return await asyncio.to_thread(_query)
    except Exception:  # noqa: BLE001
        return []


async def ack_notification(notification_id: str) -> dict:
    await init_db()
    now = int(time.time())
    try:

        def _update():
            c = _conn()
            try:
                c.execute(
                    "UPDATE proactive_notification SET acked=1, acked_at=? WHERE id=?",
                    (now, notification_id),
                )
                c.commit()
                return c.total_changes
            finally:
                c.close()

        changed = await asyncio.to_thread(_update)
        return {"ok": True, "acked": changed > 0}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


async def prune_notifications(older_than_seconds: int = 604800) -> dict:
    """Remove acked notifications older than the threshold (default 7 days)."""
    await init_db()
    cutoff = int(time.time()) - older_than_seconds
    try:

        def _delete():
            c = _conn()
            try:
                c.execute("DELETE FROM proactive_notification WHERE acked=1 AND ts < ?", (cutoff,))
                c.commit()
                return c.total_changes
            finally:
                c.close()

        n = await asyncio.to_thread(_delete)
        return {"ok": True, "pruned": n}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


# ── Monitors (lightweight, no LLM) ───────────────────────────────────────────

async def _monitor_system_health() -> list[dict]:
    """Lightweight health checks. Returns alert dicts if degraded."""
    alerts: list[dict] = []
    # Check disk space of the project directory
    try:
        import shutil

        total, used, free = shutil.disk_usage("/opt/jarvis-app-1")
        pct_used = used / total
        if pct_used > 0.95:
            alerts.append({
                "severity": "action",
                "category": "system",
                "title": "Critical disk usage",
                "body": f"Disk usage is {pct_used:.0%}. Free space critically low.",
            })
        elif pct_used > 0.85:
            alerts.append({
                "severity": "warning",
                "category": "system",
                "title": "High disk usage",
                "body": f"Disk usage is {pct_used:.0%}. Consider cleanup.",
            })
    except Exception:  # noqa: BLE001
        pass
    return alerts


async def _monitor_ontology_changes() -> list[dict]:
    """Detect recent ontology modifications via DB mtime heuristics."""
    alerts: list[dict] = []
    try:
        db_path = os.path.join(os.path.dirname(_DB_PATH), "ontology.db")
        if os.path.exists(db_path):
            mtime = os.path.getmtime(db_path)
            age = time.time() - mtime
            if age < _INTERVAL * 2:
                alerts.append({
                    "severity": "info",
                    "category": "ontology",
                    "title": "Ontology updated",
                    "body": "The ontology database was modified recently.",
                })
    except Exception:  # noqa: BLE001
        pass
    return alerts


async def _monitor_pending_alerts() -> list[dict]:
    """Surface unacknowledged high-severity notifications as re-escalations."""
    alerts: list[dict] = []
    try:
        pending = await list_notifications(acked=False, severity="action", limit=5)
        for p in pending:
            age_hours = (time.time() - p["ts"]) / 3600
            if age_hours > 1:
                alerts.append({
                    "severity": "action",
                    "category": "escalation",
                    "title": f"Unresolved action: {p['title']}",
                    "body": f"This item has been pending for {age_hours:.1f} hours. {p['body']}",
                })
    except Exception:  # noqa: BLE001
        pass
    return alerts


async def _monitor_user_inactivity() -> list[dict]:
    """Placeholder: in a real deployment this would check session / heartbeat tables."""
    return []


# ── Reasoning (LLM-assisted, graceful degradation) ───────────────────────────

async def _reason_and_notify(alerts: list[dict]) -> None:
    """Store raw alerts. Optionally synthesize via LLM if available."""
    for a in alerts:
        await store_notification(
            title=a["title"],
            body=a["body"],
            severity=a.get("severity", "info"),
            category=a.get("category", "general"),
        )
    # If we have many alerts, optionally synthesize a single summary via LLM. Off by
    # default (conservative) — set PROACTIVE_LLM_SUMMARY=1 to allow this GPU/LLM call.
    if _LLM_SUMMARY and len(alerts) >= 3:
        try:
            from ..services import llm_research as _llm

            backend = _llm.backend()
            if backend:
                summary_prompt = (
                    "Synthesize the following system alerts into ONE concise sentence "
                    "telling the user what they need to know most:\n\n"
                    + "\n".join(f"- [{a['severity'].upper()}] {a['title']}: {a['body']}" for a in alerts)
                )
                summary = _llm.llm_complete(summary_prompt, system="You are a terse systems assistant.", max_tokens=128)
                if summary:
                    await store_notification(
                        title="Proactive summary",
                        body=summary.strip(),
                        severity="info",
                        category="synthesis",
                    )
        except Exception:  # noqa: BLE001
            pass


# ── Main loop ────────────────────────────────────────────────────────────────

async def proactive_loop(app_state: dict | None = None) -> None:
    """Run the proactive intelligence loop forever (or until cancelled).

    Args:
        app_state: Optional shared application state dict (for future use).
    """
    await init_db()
    while True:
        try:
            all_alerts: list[dict] = []
            all_alerts.extend(await _monitor_system_health())
            all_alerts.extend(await _monitor_ontology_changes())
            all_alerts.extend(await _monitor_pending_alerts())
            all_alerts.extend(await _monitor_user_inactivity())
            if all_alerts:
                await _reason_and_notify(all_alerts)
            # Light housekeeping
            await prune_notifications()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(_INTERVAL)


def is_enabled() -> bool:
    return _ENABLED
