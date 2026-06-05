"""PG_POOL — a real, pooled PostgreSQL access layer (production path).

A thin, honest wrapper around :class:`psycopg2.pool.ThreadedConnectionPool`.
Connections are borrowed for the duration of a single ``query`` call and ALWAYS
returned to the pool (try/finally), so the pool never leaks under concurrency.

Resilience: a transient :class:`psycopg2.OperationalError` (server hiccup, the
pool's cached socket went stale) is retried exactly once after re-creating the
pool from scratch.

Degrades cleanly: if there is no driver or no reachable server, ``available()``
returns False and nothing raises — callers can fall back to another store.

Config: the DSN comes from env ``PLATFORM_PG_DSN`` (same default as ``pg_store``).
Stdlib + psycopg2 only.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Optional, Sequence

try:
    import psycopg2
    import psycopg2.pool
    from psycopg2 import OperationalError
except Exception:  # noqa: BLE001
    psycopg2 = None  # type: ignore

    class OperationalError(Exception):  # type: ignore
        """Fallback so module imports even without psycopg2 installed."""


_DEFAULT_DSN = "host=127.0.0.1 user=platform password=platform dbname=platform"


def _dsn() -> str:
    return os.environ.get("PLATFORM_PG_DSN", _DEFAULT_DSN)


_MINCONN = 1
_MAXCONN = 16

# Lazy singleton pool guarded by a lock so concurrent callers create it once.
_POOL: Optional["psycopg2.pool.ThreadedConnectionPool"] = None
_POOL_DSN: Optional[str] = None
_LOCK = threading.RLock()


def available() -> bool:
    """True iff the driver is present and a server is reachable. Never raises."""
    if psycopg2 is None:
        return False
    try:
        cn = psycopg2.connect(_dsn(), connect_timeout=2)
        cn.close()
        return True
    except Exception:  # noqa: BLE001
        return False


def get_pool(dsn: Optional[str] = None) -> "psycopg2.pool.ThreadedConnectionPool":
    """Return the lazily-created singleton pool.

    If ``dsn`` is given and differs from the pool currently in use, the existing
    pool is closed and a fresh one is built for the new DSN.
    """
    if psycopg2 is None:
        raise RuntimeError("psycopg2 is not installed")
    global _POOL, _POOL_DSN
    target = dsn or _dsn()
    with _LOCK:
        if _POOL is None or _POOL_DSN != target:
            if _POOL is not None:
                try:
                    _POOL.closeall()
                except Exception:  # noqa: BLE001
                    pass
                _POOL = None
            _POOL = psycopg2.pool.ThreadedConnectionPool(
                _MINCONN, _MAXCONN, target, connect_timeout=3
            )
            _POOL_DSN = target
        return _POOL


def _recreate_pool(dsn: Optional[str]) -> "psycopg2.pool.ThreadedConnectionPool":
    """Tear down and rebuild the pool — used to recover from a stale connection."""
    global _POOL, _POOL_DSN
    with _LOCK:
        if _POOL is not None:
            try:
                _POOL.closeall()
            except Exception:  # noqa: BLE001
                pass
        _POOL = None
        _POOL_DSN = None
    return get_pool(dsn)


def _run(pool: "psycopg2.pool.ThreadedConnectionPool",
         sql: str, params: Optional[Sequence[Any]], fetch: str) -> Any:
    """Borrow a connection, execute, and ALWAYS return the connection."""
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        if fetch == "one":
            result = cur.fetchone()
        elif fetch == "all":
            result = cur.fetchall()
        elif fetch == "none":
            result = None
        else:
            raise ValueError(f"invalid fetch mode: {fetch!r}")
        conn.commit()
        cur.close()
        return result
    except Exception:
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        pool.putconn(conn)


def query(sql: str, params: Optional[Sequence[Any]] = None,
          fetch: str = "all", *, dsn: Optional[str] = None) -> Any:
    """Execute ``sql`` against a pooled connection and return results.

    ``fetch`` is one of ``'all'`` (list of rows), ``'one'`` (single row or None),
    or ``'none'`` (returns None, e.g. for writes). Retries once on
    :class:`psycopg2.OperationalError` after re-creating the pool.
    """
    pool = get_pool(dsn)
    try:
        return _run(pool, sql, params, fetch)
    except OperationalError:
        # Stale/broken connection or transient server loss — rebuild and retry once.
        pool = _recreate_pool(dsn)
        return _run(pool, sql, params, fetch)


def closeall() -> None:
    """Close every connection and drop the singleton pool. Never raises."""
    global _POOL, _POOL_DSN
    with _LOCK:
        if _POOL is not None:
            try:
                _POOL.closeall()
            except Exception:  # noqa: BLE001
                pass
        _POOL = None
        _POOL_DSN = None
