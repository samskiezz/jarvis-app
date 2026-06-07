"""Async SQLAlchemy session + engine + dependency for FastAPI."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import get_settings
from .models import Base

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _ensure_engine() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().database_url
        # WAL + busy_timeout so the cognition loop, the scheduler and read requests
        # don't trip "database is locked" under concurrency (sqlite single-writer).
        connect_args = {"timeout": 30} if url.startswith("sqlite") else {}
        _engine = create_async_engine(url, future=True, echo=False,
                                      connect_args=connect_args)
        if url.startswith("sqlite"):
            from sqlalchemy import event

            @event.listens_for(_engine.sync_engine, "connect")
            def _sqlite_pragmas(dbapi_conn, _rec):  # noqa: ANN001
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA busy_timeout=30000")
                cur.execute("PRAGMA synchronous=NORMAL")
                cur.close()
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    assert _sessionmaker is not None
    return _engine, _sessionmaker


async def init_db() -> None:
    """Create tables and apply tiny in-line migrations.

    For production use Alembic; this lightweight `ADD COLUMN IF NOT EXISTS`
    pattern keeps existing databases compatible when we extend the schema.
    """
    engine, _ = _ensure_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Backfill new columns added after table creation (SQLite-only path —
        # PostgreSQL would use proper migrations).
        await _ensure_column(conn, "worlds", "era", "VARCHAR(24) DEFAULT 'stone'")
        await _ensure_column(conn, "worlds", "scanner_progress", "INTEGER DEFAULT 0")


async def _ensure_column(conn, table: str, column: str, decl: str) -> None:
    """Add `column` to `table` if it isn't there. SQLite-only convenience."""
    from sqlalchemy import text
    res = await conn.execute(text(f"PRAGMA table_info({table})"))
    if column in {r[1] for r in res.fetchall()}:
        return
    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {decl}"))


async def dispose() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Context-manager session for non-request code (sim loop, scripts)."""
    _, sm = _ensure_engine()
    async with sm() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    _, sm = _ensure_engine()
    async with sm() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def _reset_for_tests() -> None:
    """Tests use this to point at a fresh sqlite file per run."""
    global _engine, _sessionmaker
    _engine = None
    _sessionmaker = None
