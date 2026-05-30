"""Pending-change approval store for APEX Forge.

A tiny sqlite-backed ledger of proposed changes awaiting human sign-off. Forge
writes a PENDING row + notifies WhatsApp; the inbound webhook flips it to
APPROVED / REJECTED, which triggers the merge (or branch cleanup).
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

PENDING = "pending"
APPROVED = "approved"
REJECTED = "rejected"
LANDED = "landed"
FAILED = "failed"


@dataclass
class Change:
    id: str
    branch: str
    base: str
    files: list[str]
    summary: str
    diff: str
    status: str
    created_at: float
    decided_at: float | None = None
    decided_by: str | None = None
    note: str = ""


def _default_db() -> Path:
    root = Path(os.environ.get("APP_ROOT", ".")).resolve()
    return Path(os.environ.get("FORGE_APPROVALS_DB", str(root / ".forge" / "approvals.db")))


class ApprovalStore:
    def __init__(self, db_path: Path | str | None = None):
        self.db_path = Path(db_path) if db_path else _default_db()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS changes (
                    id TEXT PRIMARY KEY, branch TEXT, base TEXT, files TEXT,
                    summary TEXT, diff TEXT, status TEXT, created_at REAL,
                    decided_at REAL, decided_by TEXT, note TEXT
                )"""
            )

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex[:8]

    def create(self, *, branch: str, base: str, files: list[str], summary: str, diff: str,
               change_id: str | None = None) -> Change:
        cid = change_id or self.new_id()
        ch = Change(id=cid, branch=branch, base=base, files=files, summary=summary,
                    diff=diff, status=PENDING, created_at=time.time())
        with self._conn() as c:
            c.execute(
                "INSERT INTO changes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (ch.id, ch.branch, ch.base, json.dumps(ch.files), ch.summary, ch.diff,
                 ch.status, ch.created_at, None, None, ""),
            )
        return ch

    def get(self, change_id: str) -> Change | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM changes WHERE id=?", (change_id,)).fetchone()
        return self._row(row) if row else None

    def list(self, status: str | None = None) -> list[Change]:
        q = "SELECT * FROM changes"
        args: tuple = ()
        if status:
            q += " WHERE status=?"
            args = (status,)
        q += " ORDER BY created_at DESC"
        with self._conn() as c:
            rows = c.execute(q, args).fetchall()
        return [self._row(r) for r in rows]

    def latest_pending(self) -> Change | None:
        items = self.list(PENDING)
        return items[0] if items else None

    def set_status(self, change_id: str, status: str, *, by: str | None = None, note: str = "") -> Change | None:
        with self._conn() as c:
            c.execute(
                "UPDATE changes SET status=?, decided_at=?, decided_by=?, note=? WHERE id=?",
                (status, time.time(), by, note, change_id),
            )
        return self.get(change_id)

    @staticmethod
    def _row(row: sqlite3.Row) -> Change:
        return Change(
            id=row["id"], branch=row["branch"], base=row["base"],
            files=json.loads(row["files"]), summary=row["summary"], diff=row["diff"],
            status=row["status"], created_at=row["created_at"],
            decided_at=row["decided_at"], decided_by=row["decided_by"], note=row["note"] or "",
        )
