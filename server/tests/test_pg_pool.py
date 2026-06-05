"""Live PostgreSQL connection-pool tests.

Skips cleanly when no Postgres is reachable (keeps the suite green in
environments without a server); RUNS for real against a live Postgres when one
is up — exercising the ThreadedConnectionPool, connection reuse, parameterized
queries, and concurrent borrowing from many threads.
"""

import threading

import pytest

from server.services import pg_pool


pytestmark = pytest.mark.skipif(not pg_pool.available(),
                                reason="no reachable PostgreSQL (PLATFORM_PG_DSN)")


@pytest.fixture(autouse=True)
def _clean_pool():
    """Each test gets a fresh pool; tear it down afterwards."""
    pg_pool.closeall()
    yield
    pg_pool.closeall()


def test_select_one():
    assert pg_pool.query("SELECT 1", fetch="one") == (1,)


def test_pool_reuse_sequential():
    """20 sequential queries share the pool and all succeed."""
    pool = pg_pool.get_pool()
    for i in range(20):
        assert pg_pool.query("SELECT %s", (i,), fetch="one") == (i,)
    # Same singleton pool was used throughout, not re-created per call.
    assert pg_pool.get_pool() is pool


def test_query_with_params():
    row = pg_pool.query("SELECT %s::int + %s::int AS s", (40, 2), fetch="one")
    assert row == (42,)

    rows = pg_pool.query(
        "SELECT g FROM generate_series(%s, %s) AS g ORDER BY g",
        (1, 5), fetch="all")
    assert rows == [(1,), (2,), (3,), (4,), (5,)]


def test_query_fetch_none():
    assert pg_pool.query("SELECT 1", fetch="none") is None


def test_concurrent_eight_threads():
    """8 threads hammer the pool concurrently; every query must succeed."""
    pg_pool.get_pool()  # warm the singleton before fan-out
    counter_lock = threading.Lock()
    successes = {"n": 0}
    errors = []
    barrier = threading.Barrier(8)

    def worker(tid):
        try:
            barrier.wait()  # maximize contention
            for _ in range(15):
                row = pg_pool.query("SELECT %s::int", (tid,), fetch="one")
                assert row == (tid,)
                with counter_lock:
                    successes["n"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"thread errors: {errors}"
    assert successes["n"] == 8 * 15
