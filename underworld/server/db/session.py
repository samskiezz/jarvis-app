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
        _engine = create_async_engine(url, future=True, echo=False)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    assert _sessionmaker is not None
    return _engine, _sessionmaker


async def init_db() -> None:
    """Create tables. For real production use Alembic migrations; for v1 this is fine."""
    engine, _ = _ensure_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


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
