"""BRAIN_BACKEND — a tiny façade that selects the storage backend for the
second brain at runtime, by the ``BRAIN_BACKEND`` environment variable.

Two backends:

  * ``sqlite``   (default) — the live local store in ``second_brain`` (a real
    ``sqlite3`` vault: notes + links + ontology/embedding mirrors).
  * ``postgres``           — the production Postgres DAO in ``brain_pg`` (real
    SQL via psycopg2 against a live server).

Selection rule (``active_backend``):
    'postgres' iff BRAIN_BACKEND == 'postgres' AND brain_pg is importable AND
    brain_pg.available(); otherwise 'sqlite'.

``brain_pg`` is imported DEFENSIVELY (try/except) — it may legitimately not exist
or its driver/server may be absent — so the sqlite path always works. Every
public function NEVER raises: any Postgres error degrades to the sqlite backend.

Env (resolved at call-time so tests can flip it):
    BRAIN_BACKEND   'sqlite' (default) | 'postgres'
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional

# second_brain is the always-present sqlite store (stdlib sqlite3 only).
from . import second_brain

# brain_pg is OPTIONAL — defensively imported; may not exist in some environments.
try:  # pragma: no cover - import guard
    from . import brain_pg as _brain_pg
except Exception:  # noqa: BLE001 - module/driver may be absent
    _brain_pg = None  # type: ignore


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _env_backend() -> str:
    """The requested backend from the environment (lower-cased). Default is now
    'postgres' — Postgres is the live default; ``active_backend`` still falls back
    to sqlite automatically when no Postgres server is reachable, so environments
    without a database degrade cleanly instead of failing."""
    return str(os.environ.get("BRAIN_BACKEND", "postgres") or "postgres").strip().lower()


def slug(text: str) -> str:
    """A url-ish slug: lowercase, non-alphanumerics collapsed to single hyphens,
    trimmed. Empty input yields ``''``. Never raises."""
    try:
        s = _SLUG_RE.sub("-", str(text or "").strip().lower()).strip("-")
        return s
    except Exception:  # noqa: BLE001
        return ""


def postgres_available() -> bool:
    """True iff brain_pg was importable AND its server is reachable. Never raises."""
    if _brain_pg is None:
        return False
    try:
        return bool(_brain_pg.available())
    except Exception:  # noqa: BLE001 - any driver/connection error => unavailable
        return False


def sqlite_available() -> bool:
    """True iff the sqlite store is importable (it always is here). Never raises."""
    return second_brain is not None


def active_backend() -> str:
    """Resolve the live backend: 'postgres' only when explicitly requested AND
    actually reachable, else 'sqlite'. Never raises."""
    if _env_backend() == "postgres" and postgres_available():
        return "postgres"
    return "sqlite"


def put_note(
    kind: str,
    title: str,
    body_md: str = "",
    frontmatter: Optional[dict] = None,
    confidence: float = 0.5,
) -> Optional[dict]:
    """Create/update a note in the active backend. Returns a note dict (sqlite) or
    the inserted-id dict (postgres). On ANY postgres error, falls back to sqlite.
    Never raises."""
    if active_backend() == "postgres":
        try:
            nid = f"{kind}:{slug(title)}"
            res = _brain_pg.upsert_note(  # type: ignore[union-attr]
                nid, kind, title, body_md, frontmatter or {}, confidence
            )
            if res:
                return {"id": res, "kind": kind, "title": title, "backend": "postgres"}
            # postgres returned falsy => degrade to sqlite below
        except Exception:  # noqa: BLE001 - never raise; fall back
            pass
    try:
        return second_brain.upsert_note(
            kind, title, body_md, frontmatter=frontmatter, confidence=confidence
        )
    except Exception:  # noqa: BLE001
        return None


def get(title_or_id: str) -> Optional[dict]:
    """Fetch a note (by id or title) from the active backend, falling back to
    sqlite on any postgres error. Never raises."""
    if active_backend() == "postgres":
        try:
            res = _brain_pg.get_note(title_or_id)  # type: ignore[union-attr]
            if res is not None:
                return res
        except Exception:  # noqa: BLE001
            pass
        # If postgres is active but the note isn't there, don't silently read
        # sqlite (different store); but never raise. Return None.
        return None
    try:
        return second_brain.get_note(title_or_id)
    except Exception:  # noqa: BLE001
        return None


def count() -> int:
    """Note count from the active backend. 0 on any error. Never raises."""
    if active_backend() == "postgres":
        try:
            return int(_brain_pg.count_notes())  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001
            return 0
    try:
        cat = second_brain.index_catalog()
        return int(cat.get("total", 0)) if isinstance(cat, dict) else 0
    except Exception:  # noqa: BLE001
        return 0


def info() -> dict[str, Any]:
    """Diagnostics: the active backend and which stores are available. Never raises."""
    return {
        "active": active_backend(),
        "sqlite_available": sqlite_available(),
        "postgres_available": postgres_available(),
    }
