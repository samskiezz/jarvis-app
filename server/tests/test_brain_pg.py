"""Live PostgreSQL second-brain DAO tests.

Skips cleanly when no Postgres is reachable (keeps the suite green in
environments without a server); RUNS for real against a live Postgres when one
is up — proving the production note/link store actually works.

All rows created here use ids prefixed ``tpg:`` and are removed at the end so
the suite is repeatable.
"""

import pytest

from server.services import brain_pg


pytestmark = pytest.mark.skipif(
    not brain_pg.available(),
    reason="no reachable PostgreSQL (PLATFORM_PG_DSN)",
)


_NOTE_A = "tpg:note-a"
_NOTE_B = "tpg:note-b"
_TITLE_A = "tpg Title Alpha"


@pytest.fixture(scope="module", autouse=True)
def _schema_and_cleanup():
    """Ensure schema exists; clean up all tpg: rows after the module runs."""
    assert brain_pg.init_db()
    yield
    import psycopg2

    cn = psycopg2.connect(brain_pg._DSN, connect_timeout=3)
    cn.autocommit = True
    cur = cn.cursor()
    cur.execute("DELETE FROM brain_pg.note WHERE id LIKE 'tpg:%';")
    cur.execute(
        "DELETE FROM brain_pg.note_link WHERE src LIKE 'tpg:%' OR dst LIKE 'tpg:%';"
    )
    cur.execute("DELETE FROM brain_pg.embedding WHERE note_id LIKE 'tpg:%';")
    cn.close()


def test_init_db_idempotent():
    # Running init twice must be safe (CREATE ... IF NOT EXISTS).
    assert brain_pg.init_db() is True
    assert brain_pg.init_db() is True


def test_upsert_and_get_roundtrip():
    rid = brain_pg.upsert_note(
        _NOTE_A,
        kind="fact",
        title=_TITLE_A,
        body_md="# hello\nbody",
        frontmatter={"tags": ["x", "y"], "n": 1},
        confidence=0.8,
    )
    assert rid == _NOTE_A

    note = brain_pg.get_note(_NOTE_A)
    assert note is not None
    assert note["id"] == _NOTE_A
    assert note["kind"] == "fact"
    assert note["title"] == _TITLE_A
    assert note["body_md"] == "# hello\nbody"
    assert note["frontmatter"] == {"tags": ["x", "y"], "n": 1}
    assert abs(note["confidence"] - 0.8) < 1e-6
    assert isinstance(note["created_ts"], int) and note["created_ts"] > 0

    # Upsert again should update in place (same id), not duplicate.
    brain_pg.upsert_note(
        _NOTE_A, kind="fact", title=_TITLE_A, body_md="updated", frontmatter={}
    )
    note2 = brain_pg.get_note(_NOTE_A)
    assert note2["body_md"] == "updated"


def test_count_notes_increases():
    before = brain_pg.count_notes()
    brain_pg.upsert_note(
        _NOTE_B, kind="idea", title="tpg Title Beta", body_md="b", frontmatter={}
    )
    after = brain_pg.count_notes()
    assert after >= before + 1


def test_get_note_by_title():
    note = brain_pg.get_note(_TITLE_A)
    assert note is not None
    assert note["id"] == _NOTE_A


def test_add_link_and_count_links():
    before = brain_pg.count_links()
    assert brain_pg.add_link(_NOTE_A, _NOTE_B) is True
    after = brain_pg.count_links()
    assert after >= before + 1
    # Idempotent: re-adding the same link must not raise or double-count.
    assert brain_pg.add_link(_NOTE_A, _NOTE_B) is True
    assert brain_pg.count_links() == after


def test_list_notes_filter():
    notes = brain_pg.list_notes(kind="idea", limit=50)
    ids = {n["id"] for n in notes}
    assert _NOTE_B in ids
    for n in notes:
        assert n["kind"] == "idea"
