"""Gotham case engine — minimal SQLite-backed case store.

Schema lifted from world_os/gotham_runtime/case_engine/case_engine_schema.sql
(adapted to SQLite: TIMESTAMPTZ → REAL, JSONB → TEXT JSON).
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "server", "data", "gotham.db")

_DDL = """
CREATE TABLE IF NOT EXISTS gotham_case (
  case_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at REAL DEFAULT (strftime('%s', 'now') * 1.0),
  priority TEXT,
  linked_objects TEXT,
  evidence TEXT,
  audit_ids TEXT
);
CREATE TABLE IF NOT EXISTS gotham_event (
  event_id TEXT PRIMARY KEY,
  case_id TEXT,
  kind TEXT,
  payload TEXT,
  ts REAL DEFAULT (strftime('%s', 'now') * 1.0),
  FOREIGN KEY (case_id) REFERENCES gotham_case (case_id)
);
"""


def _con() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.executescript(_DDL)
    return con


def list_cases(limit: int = 100) -> list[dict[str, Any]]:
    with _con() as con:
        cur = con.cursor()
        cur.execute("SELECT case_id, title, status, priority, created_at "
                     "FROM gotham_case ORDER BY created_at DESC LIMIT ?", (limit,))
        return [dict(zip(["case_id", "title", "status", "priority", "created_at"], r))
                for r in cur.fetchall()]


def list_events(limit: int = 200) -> list[dict[str, Any]]:
    with _con() as con:
        cur = con.cursor()
        cur.execute("SELECT event_id, case_id, kind, ts FROM gotham_event "
                     "ORDER BY ts DESC LIMIT ?", (limit,))
        return [dict(zip(["event_id", "case_id", "kind", "ts"], r))
                for r in cur.fetchall()]


def create_case(*, title: str, created_by: str, priority: str = "normal",
                 linked_objects: list | None = None,
                 evidence: list | None = None) -> dict[str, Any]:
    case_id = f"case-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
    with _con() as con:
        con.execute(
            "INSERT INTO gotham_case "
            "(case_id, title, status, created_by, priority, linked_objects, evidence, audit_ids) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (case_id, title, "open", created_by, priority,
             json.dumps(linked_objects or []), json.dumps(evidence or []),
             json.dumps([])),
        )
    return {"case_id": case_id, "title": title, "status": "open",
            "priority": priority, "created_by": created_by,
            "created_at": time.time()}
