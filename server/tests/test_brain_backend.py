"""BRAIN_BACKEND selector tests — REAL, not mocked.

The sqlite path is ALWAYS tested (it is the default live store and must pass in
every environment): put_note + get round-trips and active_backend()=='sqlite'.

The postgres path is tested ONLY when ``brain_pg`` is importable AND
``brain_pg.available()`` (a live Postgres is reachable) — otherwise it is
skipped, so the suite stays green without a server. When it runs, it asserts the
selector routes to postgres for real (active_backend()=='postgres') and the note
round-trips through ``brain_pg``.

Run:
    python3 -m pytest server/tests/test_brain_backend.py -q
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402

from server.services import brain_backend  # noqa: E402

try:  # defensive — brain_pg may not exist / may not be reachable
    from server.services import brain_pg as _brain_pg  # noqa: E402
except Exception:  # noqa: BLE001
    _brain_pg = None

_PG_OK = False
if _brain_pg is not None:
    try:
        _PG_OK = bool(_brain_pg.available())
    except Exception:  # noqa: BLE001
        _PG_OK = False


def _uniq(suffix: str = "") -> str:
    """A unique 'TBB '-prefixed title so concurrent / repeat runs never collide."""
    return f"TBB {int(time.time() * 1000)}-{os.getpid()}{suffix}"


# --------------------------------------------------------------------------- #
# SQLITE PATH — always runs
# --------------------------------------------------------------------------- #
def test_sqlite_active_backend(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_BACKEND", "sqlite")
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain_tbb.db"))
    assert brain_backend.active_backend() == "sqlite"
    info = brain_backend.info()
    assert info["active"] == "sqlite"
    assert info["sqlite_available"] is True


def test_sqlite_put_get_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_BACKEND", "sqlite")
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain_tbb.db"))

    title = _uniq(" sqlite")
    body = "hello from the sqlite backend [[Other]]"
    note = brain_backend.put_note(
        "concept", title, body, frontmatter={"src": "test"}, confidence=0.42
    )
    assert note is not None
    assert note["title"] == title

    got = brain_backend.get(title)
    assert got is not None
    assert got["title"] == title
    assert got["body_md"] == body

    # also retrievable by id
    by_id = brain_backend.get(note["id"])
    assert by_id is not None
    assert by_id["id"] == note["id"]

    assert brain_backend.count() >= 1


def test_sqlite_when_postgres_requested_but_unavailable(monkeypatch, tmp_path):
    """Selecting postgres when it is NOT available must fall back to sqlite and
    still round-trip — the selector never raises."""
    if _PG_OK:
        pytest.skip("postgres IS available; falling-back case covered elsewhere")
    monkeypatch.setenv("BRAIN_BACKEND", "postgres")
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "brain_tbb.db"))

    assert brain_backend.active_backend() == "sqlite"  # degraded
    title = _uniq(" fallback")
    note = brain_backend.put_note("concept", title, "fallback body")
    assert note is not None and note["title"] == title
    assert brain_backend.get(title)["title"] == title


# --------------------------------------------------------------------------- #
# POSTGRES PATH — runs only against a live, reachable Postgres
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not _PG_OK, reason="no reachable Postgres (brain_pg.available() is False)")
def test_postgres_active_backend(monkeypatch):
    monkeypatch.setenv("BRAIN_BACKEND", "postgres")
    assert brain_backend.active_backend() == "postgres"
    info = brain_backend.info()
    assert info["active"] == "postgres"
    assert info["postgres_available"] is True


@pytest.mark.skipif(not _PG_OK, reason="no reachable Postgres (brain_pg.available() is False)")
def test_postgres_put_get_roundtrip(monkeypatch):
    monkeypatch.setenv("BRAIN_BACKEND", "postgres")
    # ensure the schema exists for a clean DB
    try:
        _brain_pg.init_db()
    except Exception:  # noqa: BLE001
        pass

    title = _uniq(" postgres")
    body = "hello from the postgres backend"
    note = brain_backend.put_note("concept", title, body, confidence=0.77)
    assert note is not None
    assert note.get("backend") == "postgres"
    assert note["id"] == f"concept:{brain_backend.slug(title)}"

    got = brain_backend.get(note["id"])
    assert got is not None
    assert got["title"] == title
    assert got["body_md"] == body

    # by title too
    by_title = brain_backend.get(title)
    assert by_title is not None and by_title["title"] == title

    assert brain_backend.count() >= 1
