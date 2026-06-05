"""JARVIS DB routes — reports the active brain backend (SQLite vs PostgreSQL).

Mounted under ``/v1/jarvis/db``:

  * GET /health  — which backend is configured, live Postgres health, the SQLite
                   brain path, and the resolved active backend.
  * GET /stats   — live counts from the SQLite second-brain and (if reachable)
                   from PostgreSQL (``brain_pg.note``).

Both endpoints are read-only and use ``optional_bearer``. They never raise: every
live probe is wrapped so a missing/broken backend degrades to a partial result.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends

from ..auth import optional_bearer
from ..services import pg_store
from ..services import second_brain

router = APIRouter(prefix="/v1/jarvis/db", tags=["jarvis-db"])


def _resolve_active(backend: str) -> str:
    """Active backend is 'postgres' only when configured AND reachable."""
    if backend == "postgres":
        try:
            if pg_store.available():
                return "postgres"
        except Exception:  # noqa: BLE001
            return "sqlite"
    return "sqlite"


@router.get("/health")
async def get_health(_t: str | None = Depends(optional_bearer)):
    backend = os.environ.get("BRAIN_BACKEND", "sqlite")

    try:
        pg = pg_store.health()
    except Exception as exc:  # noqa: BLE001
        pg = {"available": False, "engine": "postgresql", "error": str(exc)}

    try:
        sqlite_brain_path = second_brain._db_path()
    except Exception:  # noqa: BLE001
        sqlite_brain_path = None

    return {
        "backend": backend,
        "postgres": pg,
        "sqlite_brain_path": sqlite_brain_path,
        "active": _resolve_active(backend),
    }


@router.get("/stats")
async def get_stats(_t: str | None = Depends(optional_bearer)):
    backend = os.environ.get("BRAIN_BACKEND", "sqlite")
    active = _resolve_active(backend)

    # SQLite live count (index_catalog already degrades to zeros on error).
    sqlite_total = 0
    try:
        sqlite_total = int(second_brain.index_catalog().get("total", 0))
    except Exception:  # noqa: BLE001
        sqlite_total = 0

    # PostgreSQL live count — only if reachable; never raise.
    postgres_available = False
    postgres_total = 0
    try:
        if pg_store.available():
            postgres_available = True
            cn = pg_store._owner()
            try:
                cur = cn.cursor()
                cur.execute("SELECT to_regclass('brain_pg.note')")
                exists = cur.fetchone()[0]
                if exists:
                    cur.execute("SELECT count(*) FROM brain_pg.note")
                    postgres_total = int(cur.fetchone()[0])
                else:
                    postgres_total = 0
            finally:
                cn.close()
    except Exception:  # noqa: BLE001
        postgres_total = 0

    return {
        "backend": backend,
        "active": active,
        "sqlite": {"total": sqlite_total},
        "postgres": {"available": postgres_available, "total": postgres_total},
    }
