"""Tests for the SQLite -> PostgreSQL brain migrator.

Skips entirely if Postgres is not reachable. Builds a throwaway TEMP SQLite db
with 3 notes + 2 links, migrates into a random throwaway PG schema
``mig_test_<random>``, asserts row counts + idempotency, then DROPs the schema.

The real ``brain_pg`` schema and the real ``server/data/brain.db`` are never
touched.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import uuid

import pytest

from services import brain_migrate

pytestmark = pytest.mark.skipif(
    not brain_migrate.available(),
    reason="Postgres not available",
)


def _build_sqlite(path: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE note (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL DEFAULT 'concept',
                title TEXT NOT NULL,
                frontmatter_json TEXT NOT NULL DEFAULT '{}',
                body_md TEXT NOT NULL DEFAULT '',
                confidence REAL NOT NULL DEFAULT 1.0,
                created_ts INTEGER NOT NULL,
                learned_ts INTEGER NOT NULL,
                updated_ts INTEGER NOT NULL
            );
            CREATE TABLE note_link (
                src_id TEXT NOT NULL,
                dst_title TEXT NOT NULL,
                dst_id TEXT,
                relation TEXT NOT NULL DEFAULT 'LINKS_TO',
                PRIMARY KEY (src_id, dst_title, relation)
            );
            """
        )
        conn.executemany(
            "INSERT INTO note (id, kind, title, frontmatter_json, body_md, "
            "confidence, created_ts, learned_ts, updated_ts) VALUES (?,?,?,?,?,?,?,?,?)",
            [
                ("n1", "concept", "Alpha", '{"tag":"x"}', "# Alpha [[Beta]]", 0.9, 100, 100, 110),
                ("n2", "concept", "Beta", "{}", "# Beta [[Gamma]]", 0.5, 200, 200, 210),
                ("n3", "project", "Gamma", '{"k":1}', "# Gamma body", 0.7, 300, 300, 310),
            ],
        )
        conn.executemany(
            "INSERT INTO note_link (src_id, dst_title, dst_id, relation) VALUES (?,?,?,?)",
            [
                ("n1", "Beta", "n2", "LINKS_TO"),
                ("n2", "Gamma", "n3", "LINKS_TO"),
            ],
        )
        conn.commit()
    finally:
        conn.close()


def _drop_schema(schema: str) -> None:
    import psycopg2

    conn = psycopg2.connect(brain_migrate._DEFAULT_DSN)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
    finally:
        conn.close()


def _count(schema: str, table: str) -> int:
    import psycopg2

    conn = psycopg2.connect(brain_migrate._DEFAULT_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {schema}.{table}")
            return int(cur.fetchone()[0])
    finally:
        conn.close()


def test_migrate_and_idempotency():
    schema = "mig_test_" + uuid.uuid4().hex[:12]
    fd, sqlite_path = tempfile.mkstemp(suffix=".db", prefix="brainmig_")
    os.close(fd)
    _build_sqlite(sqlite_path)

    try:
        # First migration copies everything.
        res = brain_migrate.migrate(sqlite_path=sqlite_path, target_schema=schema, batch=2)
        assert res["notes_total"] == 3
        assert res["links_total"] == 2
        assert res["notes_migrated"] == 3
        assert res["links_migrated"] == 2

        # Rows actually landed in Postgres.
        assert _count(schema, "note") == 3
        assert _count(schema, "note_link") == 2

        # Second migration is idempotent: nothing new inserted.
        res2 = brain_migrate.migrate(sqlite_path=sqlite_path, target_schema=schema, batch=2)
        assert res2["notes_total"] == 3
        assert res2["links_total"] == 2
        assert res2["notes_migrated"] == 0
        assert res2["links_migrated"] == 0

        # Counts unchanged.
        assert _count(schema, "note") == 3
        assert _count(schema, "note_link") == 2
    finally:
        _drop_schema(schema)
        try:
            os.remove(sqlite_path)
        except OSError:
            pass
