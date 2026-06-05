"""Live PostgreSQL object-store + RLS tests.

Skips cleanly when no Postgres is reachable (keeps the suite green in environments
without a server); RUNS for real against a live Postgres when one is up — proving
the production store and engine-enforced RLS actually work, not just on paper.
"""

import pytest

from server.services import pg_store


pytestmark = pytest.mark.skipif(not pg_store.available(),
                                reason="no reachable PostgreSQL (PLATFORM_PG_DSN)")


def test_pg_health():
    h = pg_store.health()
    assert h["available"] and "PostgreSQL" in h["engine"]
    assert h["platform_schemas"] >= 12


def test_pg_roundtrip_and_rls_classification_ceiling():
    pg_store.ensure_app_role()
    pg_store.put_object("t:official", "rlsT", "Person", {"n": "pub"}, classification="OFFICIAL")
    pg_store.put_object("t:secret", "rlsT", "Person", {"n": "hidden"}, classification="SECRET")

    low = {r["id"] for r in pg_store.query_objects("rlsT", "OFFICIAL", object_type="Person")}
    high = {r["id"] for r in pg_store.query_objects("rlsT", "SECRET", object_type="Person")}

    assert "t:official" in low and "t:secret" not in low      # RLS hides SECRET from OFFICIAL
    assert "t:official" in high and "t:secret" in high         # SECRET clearance sees both


def test_pg_rls_tenant_isolation():
    pg_store.ensure_app_role()
    pg_store.put_object("ti:a", "tenantA", "Person", {"n": "a"}, classification="UNCLASSIFIED")
    seen_other = {r["id"] for r in pg_store.query_objects("tenantB", "TOPSECRET")}
    assert "ti:a" not in seen_other                            # cross-tenant blocked by RLS
