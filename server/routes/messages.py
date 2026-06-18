"""MESSAGES routes — fills mini-app gap #25 (Messages).

Cluster C6 product-spec skeleton. 2026 reference stacks for outbound + inbound
text:

  * signal-cli-rest-api (https://github.com/bbernhard/signal-cli-rest-api) —
    dockerized REST wrapper around signal-cli; POST /v2/send. Free, self-host.
  * Matrix via matrix-nio or matrix-commander — open federation; well-suited
    if the user already runs a Synapse server.
  * SMTP for plain email — universal fallback.

This route stores every outbound + inbound message in SQLite and, when wired,
forwards to the configured backend. With nothing configured it just queues the
message locally (still 200 OK) so the UI never sees a 500.

Env:
  MESSAGES_BACKEND=signal|matrix|smtp|none   (default: none)
  SIGNAL_REST_URL=http://localhost:8080
  SIGNAL_NUMBER=+15555550123

Endpoints:
  POST /v1/messages/send
      { "to": "+15...", "text": "...", "channel": "signal|matrix|email" }

  GET  /v1/messages/recent?limit=50&direction=in|out|any

  POST /v1/messages/inbound          # webhook target for signal-cli-rest-api
      { "from": "...", "text": "...", "ts": <epoch_s>, "channel": "signal" }
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Body, Depends, Query

from ..auth import optional_bearer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("MESSAGES_DB", os.path.join(ROOT, "data", "messages.db"))

_BACKEND = os.environ.get("MESSAGES_BACKEND", "none").strip().lower()
_SIGNAL_URL = os.environ.get("SIGNAL_REST_URL", "").rstrip("/")
_SIGNAL_NUM = os.environ.get("SIGNAL_NUMBER", "").strip()

router = APIRouter(prefix="/v1/messages", tags=["messages"])

# 2026 default schema follows signal-cli-rest-api v0.94+ + Matrix-spec v1.11 +
# Twilio Conversations API. Each message row carries id, ts, direction,
# channel, peer, text, status. Reference:
# https://github.com/bbernhard/signal-cli-rest-api (REST v2)
# https://spec.matrix.org/v1.11/client-server-api/#room-events
_DEFAULT_MESSAGES: list[dict[str, Any]] = [
    {
        "id": 0,
        "ts": 0,
        "direction": "in",
        "channel": "signal",
        "peer": "+15555550100",
        "text": "Welcome — wire MESSAGES_BACKEND=signal to enable real delivery.",
        "status": "received",
    }
]


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.execute(
        """CREATE TABLE IF NOT EXISTS messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            direction TEXT NOT NULL,   -- 'in' or 'out'
            channel TEXT NOT NULL,     -- 'signal' / 'matrix' / 'email' / 'queue'
            peer TEXT NOT NULL,        -- to (for out) or from (for in)
            text TEXT NOT NULL,
            status TEXT DEFAULT 'queued',
            meta TEXT
        )"""
    )
    c.execute("CREATE INDEX IF NOT EXISTS ix_msg_ts ON messages(ts DESC)")
    c.commit()
    return c


def _send_signal(to: str, text: str) -> tuple[str, str]:
    """Returns (status, detail)."""
    if not _SIGNAL_URL or not _SIGNAL_NUM:
        return "queued", "SIGNAL_REST_URL or SIGNAL_NUMBER unset"
    try:
        import urllib.request

        payload = json.dumps(
            {"message": text, "number": _SIGNAL_NUM, "recipients": [to]}
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{_SIGNAL_URL}/v2/send",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as r:  # nosec B310
            body = r.read().decode("utf-8", "ignore")[:400]
            return ("sent", body) if 200 <= r.status < 300 else ("error", body)
    except Exception as e:  # noqa: BLE001
        return "error", str(e)


@router.post("/send")
async def send_message(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    try:
        to = str(body.get("to") or "").strip()
        text = str(body.get("text") or "").strip()
        if not to or not text:
            return {"ok": False, "error": "to and text required"}
        channel = str(body.get("channel") or _BACKEND or "queue").strip().lower()
        status = "queued"
        detail = ""
        if channel == "signal" and _BACKEND in ("signal", "auto"):
            status, detail = _send_signal(to, text)
        elif channel == "signal":
            # Wire-ready but backend not enabled: queue and tell the caller.
            status, detail = "queued", "MESSAGES_BACKEND != signal"
        c = _db()
        try:
            cur = c.execute(
                "INSERT INTO messages(ts, direction, channel, peer, text, status, meta) "
                "VALUES(?,?,?,?,?,?,?)",
                (int(time.time()), "out", channel, to, text, status, detail[:400]),
            )
            c.commit()
            return {
                "ok": True,
                "id": cur.lastrowid,
                "status": status,
                "channel": channel,
                "source": "live" if status == "sent" else "stub-pending-spec",
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "source": "stub-pending-spec"}


@router.get("/recent")
async def recent_messages(
    limit: int = Query(50, ge=1, le=500),
    direction: str = Query("any", pattern="^(in|out|any)$"),
    _t: str | None = Depends(optional_bearer),
) -> dict[str, Any]:
    try:
        c = _db()
        try:
            sql = (
                "SELECT id, ts, direction, channel, peer, text, status "
                "FROM messages"
            )
            args: list[Any] = []
            if direction != "any":
                sql += " WHERE direction = ?"
                args.append(direction)
            sql += " ORDER BY ts DESC LIMIT ?"
            args.append(limit)
            rows = c.execute(sql, args).fetchall()
            items = [
                {
                    "id": r[0],
                    "ts": r[1],
                    "direction": r[2],
                    "channel": r[3],
                    "peer": r[4],
                    "text": r[5],
                    "status": r[6],
                }
                for r in rows
            ]
            if not items:
                items = [dict(m) for m in _DEFAULT_MESSAGES]
                source = "default-schema"
            else:
                source = "live"
            return {
                "ok": True,
                "items": items,
                "count": len(items),
                "schema_version": "2026.1",
                "source": source,
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "items": [], "source": "stub-pending-spec"}


@router.post("/inbound")
async def inbound_message(
    body: dict[str, Any] = Body(...), _t: str | None = Depends(optional_bearer)
) -> dict[str, Any]:
    """Webhook target — point signal-cli-rest-api / Matrix bridge here."""
    try:
        peer = str(body.get("from") or "").strip()
        text = str(body.get("text") or "").strip()
        if not peer or not text:
            return {"ok": False, "error": "from and text required"}
        ts = int(body.get("ts") or time.time())
        channel = str(body.get("channel") or "signal")
        c = _db()
        try:
            cur = c.execute(
                "INSERT INTO messages(ts, direction, channel, peer, text, status) "
                "VALUES(?,?,?,?,?,?)",
                (ts, "in", channel, peer, text, "received"),
            )
            c.commit()
            return {"ok": True, "id": cur.lastrowid}
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
