"""When BRAIN_PG_MIRROR is on and Postgres is reachable, every second_brain write
is also persisted to the Postgres brain store. Skips cleanly without Postgres."""

import os
import pytest

from server.services import brain_pg, second_brain as sb

pytestmark = pytest.mark.skipif(not brain_pg.available(), reason="no reachable PostgreSQL")


def test_brain_write_mirrors_to_postgres(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_PG_MIRROR", "1")
    monkeypatch.setenv("BRAIN_DB", str(tmp_path / "mirror.db"))   # isolated sqlite
    title = "PG Mirror Probe Concept"
    note = sb.upsert_note("concept", title, "Body mentions [[Postgres]] and [[Mirror]].")
    assert note is not None
    # it must now exist in the Postgres brain store
    pg = brain_pg.get_note(note["id"])
    assert pg is not None and pg["title"] == title
    # links mirrored too
    assert brain_pg.count_links() >= 1
