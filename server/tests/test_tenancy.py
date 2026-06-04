"""TENANCY tests — multi-tenant registry, membership, resolution + routes.

Fully OFFLINE. No network. A temp DB (env TENANCY_DB) is used so the real
on-disk tenancy.db is never touched. Run:

    python3 -m pytest server/tests/test_tenancy.py -q
"""

import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def svc(tmp_path, monkeypatch):
    """Reload tenancy against a fresh temp DB per test."""
    monkeypatch.setenv("TENANCY_DB", str(tmp_path / "tenancy.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("JARVIS_API_KEY", "dev-key")
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)
    from server.services import tenancy as tenancy_svc

    importlib.reload(tenancy_svc)
    tenancy_svc.init_db()
    return tenancy_svc


# ── tenant CRUD ─────────────────────────────────────────────────────────────────
def test_create_list_get(svc):
    t = svc.create_tenant("Acme Corp", "pro")
    assert t is not None
    assert t["id"] == "acme-corp"
    assert t["name"] == "Acme Corp"
    assert t["plan"] == "pro"
    assert t["settings"] == {}

    # ensure_default (run on import + in resolve) created 'default', so >= 2.
    ids = {x["id"] for x in svc.list_tenants()}
    assert "acme-corp" in ids
    assert "default" in ids

    got = svc.get_tenant("acme-corp")
    assert got is not None and got["name"] == "Acme Corp"
    assert svc.get_tenant("nope") is None


def test_create_is_idempotent(svc):
    a = svc.create_tenant("Acme Corp", "pro")
    b = svc.create_tenant("Acme Corp", "free")  # same slug → no duplicate, no overwrite
    assert a["id"] == b["id"]
    assert b["plan"] == "pro"  # original plan preserved
    matches = [x for x in svc.list_tenants() if x["id"] == "acme-corp"]
    assert len(matches) == 1


# ── membership ─────────────────────────────────────────────────────────────────
def test_add_member_and_members_and_tenants_for(svc):
    svc.create_tenant("Acme Corp")
    svc.create_tenant("Beta Inc")

    m = svc.add_member("acme-corp", "alice", "owner")
    assert m is not None and m["role"] == "owner"
    svc.add_member("acme-corp", "bob", "member")
    svc.add_member("beta-inc", "alice", "member")

    member_principals = {x["principal"] for x in svc.members("acme-corp")}
    assert member_principals == {"alice", "bob"}

    alice_tenants = {x["tenant_id"]: x["role"] for x in svc.tenants_for("alice")}
    assert alice_tenants == {"acme-corp": "owner", "beta-inc": "member"}

    assert svc.member_role("acme-corp", "alice") == "owner"
    assert svc.member_role("acme-corp", "nobody") is None


def test_add_member_role_update_idempotent(svc):
    svc.create_tenant("Acme Corp")
    svc.add_member("acme-corp", "alice", "member")
    svc.add_member("acme-corp", "alice", "owner")  # update, not duplicate
    rows = svc.members("acme-corp")
    assert len(rows) == 1
    assert rows[0]["role"] == "owner"


def test_add_member_to_missing_tenant_returns_none(svc):
    assert svc.add_member("ghost", "alice", "owner") is None


# ── resolution: THE IDP PLUG-IN SEAM ──────────────────────────────────────────────
def test_resolve_honors_x_tenant_id_header(svc):
    svc.create_tenant("Acme Corp")
    tid = svc.resolve_tenant({"X-Tenant-Id": "acme-corp"}, principal="alice")
    assert tid == "acme-corp"
    # tolerant of header casing
    tid2 = svc.resolve_tenant({"x-tenant-id": "acme-corp"}, principal="alice")
    assert tid2 == "acme-corp"
    # header naming an unknown tenant is NOT trusted → falls through to default
    assert svc.resolve_tenant({"X-Tenant-Id": "ghost"}, principal=None) == "default"


def test_resolve_falls_back_to_membership_then_default(svc):
    svc.create_tenant("Acme Corp")
    svc.add_member("acme-corp", "alice", "member")
    # no header → use the principal's membership
    assert svc.resolve_tenant(None, principal="alice") == "acme-corp"
    # unknown principal, no header → default
    assert svc.resolve_tenant(None, principal="stranger") == "default"
    assert svc.resolve_tenant(None, principal=None) == "default"


def test_resolve_honors_idp_claim_tenant(svc):
    # The IdP plug-in seam: a verified tenant claim names the active tenant.
    svc.create_tenant("Acme Corp")
    assert svc.resolve_tenant(None, principal="alice", claim_tenant="acme-corp") == "acme-corp"
    # an unknown claim is not trusted
    assert svc.resolve_tenant(None, principal="alice", claim_tenant="ghost") == "default"


def test_ensure_default_idempotent(svc):
    a = svc.ensure_default()
    b = svc.ensure_default()
    assert a == b == "default"
    defaults = [x for x in svc.list_tenants() if x["id"] == "default"]
    assert len(defaults) == 1


# ── store-adoption helpers ─────────────────────────────────────────────────────────
def test_tenant_db_path_namespaces(svc, monkeypatch):
    # namespaces a configured base path's dir + filename by tenant
    monkeypatch.setenv("ONTOLOGY_DB", os.path.join("/var", "lib", "ontology.db"))
    p = svc.tenant_db_path("ONTOLOGY_DB", "acme-corp")
    assert p == os.path.join("/var", "lib", "acme-corp", "ontology.db")

    # uses the `default` base when the env var is unset
    monkeypatch.delenv("ONTOLOGY_DB", raising=False)
    p2 = svc.tenant_db_path("ONTOLOGY_DB", "acme-corp", default=os.path.join("data", "ontology.db"))
    assert p2 == os.path.join("data", "acme-corp", "ontology.db")

    # tenant id is slugified into a single safe path segment → cannot traverse
    # out of the base directory (path separators are stripped from the id).
    monkeypatch.setenv("ONTOLOGY_DB", os.path.join("/var", "lib", "ontology.db"))
    p3 = svc.tenant_db_path("ONTOLOGY_DB", "../../etc")
    # the injected tenant segment sits directly under the base dir, no extra dirs
    assert os.path.dirname(os.path.dirname(p3)) == os.path.join("/var", "lib")
    assert os.sep not in svc._slug("../../etc")

    # :memory: / empty base returned unchanged (nothing to namespace)
    monkeypatch.setenv("ONTOLOGY_DB", ":memory:")
    assert svc.tenant_db_path("ONTOLOGY_DB", "acme-corp") == ":memory:"


def test_scope_filter_returns_tenant_id(svc):
    assert svc.scope_filter("acme-corp") == "acme-corp"
    assert svc.scope_filter("") == "default"
    assert svc.scope_filter(None) == "default"


# ── route smoke tests (TestClient) ─────────────────────────────────────────────────
@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("TENANCY_DB", str(tmp_path / "tenancy.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("JARVIS_API_KEY", "dev-key")
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)

    from server.services import tenancy as tenancy_svc

    importlib.reload(tenancy_svc)
    tenancy_svc.init_db()

    import server.config as config
    import server.auth as auth
    import server.auth_tenancy as auth_tenancy
    import server.routes.tenancy as tenancy_routes

    importlib.reload(config)
    importlib.reload(auth)
    importlib.reload(auth_tenancy)
    importlib.reload(tenancy_routes)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(tenancy_routes.router)
    return TestClient(app)


def test_route_create_and_whoami(client):
    # create requires bearer
    r = client.post("/v1/tenants", json={"name": "Acme Corp", "plan": "pro"})
    assert r.status_code == 401

    r = client.post(
        "/v1/tenants",
        json={"name": "Acme Corp", "plan": "pro"},
        headers={"Authorization": "Bearer dev-key"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["id"] == "acme-corp"

    # list
    r = client.get("/v1/tenants")
    assert r.status_code == 200
    ids = {x["id"] for x in r.json()["items"]}
    assert {"acme-corp", "default"} <= ids

    # whoami without header → default (anonymous principal)
    r = client.get("/v1/tenants/whoami")
    assert r.status_code == 200
    assert r.json()["tenant_id"] == "default"

    # whoami with X-Tenant-Id header (dev key principal) → that tenant
    r = client.get(
        "/v1/tenants/whoami",
        headers={"Authorization": "Bearer dev-key", "X-Tenant-Id": "acme-corp"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["tenant_id"] == "acme-corp"
    assert body["principal"] == "dev-key"
    assert body["role"] == "owner"  # creator was added as owner
    assert body["authenticated"] is True


def test_route_members(client):
    client.post(
        "/v1/tenants",
        json={"name": "Acme Corp"},
        headers={"Authorization": "Bearer dev-key"},
    )
    r = client.post(
        "/v1/tenants/acme-corp/members",
        json={"principal": "alice", "role": "analyst"},
        headers={"Authorization": "Bearer dev-key"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "analyst"

    r = client.get("/v1/tenants/acme-corp/members")
    assert r.status_code == 200
    principals = {x["principal"] for x in r.json()["items"]}
    assert {"dev-key", "alice"} <= principals

    # member add to missing tenant → 404
    r = client.post(
        "/v1/tenants/ghost/members",
        json={"principal": "x"},
        headers={"Authorization": "Bearer dev-key"},
    )
    assert r.status_code == 404


def test_route_get_tenant_404(client):
    r = client.get("/v1/tenants/ghost")
    assert r.status_code == 404
