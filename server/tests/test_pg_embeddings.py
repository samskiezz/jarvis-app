"""Live PostgreSQL embedding-store + cosine-search tests.

Skips cleanly when no Postgres is reachable; RUNS for real against a live server
when one is up — proving the bytea vector store and cosine ranking actually work.
"""

import pytest

from server.services import pg_embeddings


pytestmark = pytest.mark.skipif(
    not pg_embeddings.available(),
    reason="no reachable PostgreSQL (PLATFORM_PG_DSN)",
)

# Unique, easy-to-clean note ids.
_DOCS = {
    "tpe:graph": "graph database systems",
    "tpe:cooking": "french cooking recipes",
    "tpe:kafka": "distributed kafka streaming",
    "tpe:bread": "baking sourdough bread",
}


def _cleanup():
    import psycopg2  # available() already proved this imports

    cn = psycopg2.connect(pg_embeddings._DSN, connect_timeout=3)
    try:
        with cn, cn.cursor() as cur:
            cur.execute(
                "DELETE FROM brain_pg.embedding WHERE note_id LIKE 'tpe:%'"
            )
    finally:
        cn.close()


def test_pg_embeddings_cosine_ranks_kafka_first():
    pg_embeddings.init_db()
    try:
        for note_id, text in _DOCS.items():
            assert pg_embeddings.index_text(note_id, text) is True

        results = pg_embeddings.search("apache kafka event streaming", k=5)
        ours = [r for r in results if r["note_id"].startswith("tpe:")]
        assert ours, "no indexed tpe: docs came back from search"

        top = ours[0]["note_id"]
        assert top == "tpe:kafka", f"expected kafka doc rank 1, got {top}: {ours}"
        assert top != "tpe:cooking"  # a cooking doc is NOT rank 1
    finally:
        _cleanup()
