"""SECURITY HARDENING tests — RevDB, Cross-Org, Extended Security API.

Fully OFFLINE. No network. Temp DBs (env REVDB_DB, CROSS_ORG_DB, AUDIT_DB,
ONTOLOGY_DB, TENANCY_DB) are used so real on-disk stores are never touched.
Minimum 15 tests covering all three new planes.

Run:

    python3 -m pytest server/tests/test_security_hardening.py -q
"""

import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def fresh_dbs(tmp_path, monkeypatch):
    """Point all new services at temp DBs and reload them."""
    monkeypatch.setenv("REVDB_DB", str(tmp_path / "revdb.db"))
    monkeypatch.setenv("CROSS_ORG_DB", str(tmp_path / "cross_org.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ontology.db"))
    monkeypatch.setenv("TENANCY_DB", str(tmp_path / "tenancy.db"))
    monkeypatch.setenv("JARVIS_API_KEY", "dev-key")
    monkeypatch.delenv("JARVIS_REQUIRE_AUTH", raising=False)

    from server.services import revdb as r
    from server.services import cross_org as co
    from server.services import audit as a
    from server.services import ontology_store as o
    from server.services import tenancy as t

    importlib.reload(r)
    importlib.reload(co)
    importlib.reload(a)
    importlib.reload(o)
    importlib.reload(t)

    r.init_db()
    co.init_db()
    a.init_db()
    o.init_db()
    t.init_db()
    t.ensure_default()

    return r, co, a, o, t


# ── revdb service tests ──────────────────────────────────────────────────────────
def test_revdb_commit_and_history(fresh_dbs):
    r, *_ = fresh_dbs
    commit = r._commit_sync("alice", "create person", [{"object_type": "person", "object_id": "p1", "operation": "create", "old_value": None, "new_value": {"id": "p1"}}])
    assert commit is not None
    assert commit["author"] == "alice"
    assert commit["parent_id"] is None  # first commit

    history = r._history_sync(object_id="p1")
    assert len(history) == 1
    assert history[0]["changes"][0]["operation"] == "create"


def test_revdb_diff(fresh_dbs):
    r, *_ = fresh_dbs
    c1 = r._commit_sync("alice", "create", [{"object_type": "x", "object_id": "o1", "operation": "create", "old_value": None, "new_value": {"v": 1}}])
    c2 = r._commit_sync("bob", "update", [{"object_type": "x", "object_id": "o1", "operation": "update", "old_value": {"v": 1}, "new_value": {"v": 2}}])
    d = r._diff_sync(c1["id"], c2["id"])
    assert d["commit_a"]["id"] == c1["id"]
    assert d["commit_b"]["id"] == c2["id"]
    assert len(d["changes_a"]) == 1
    assert len(d["changes_b"]) == 1


def test_revdb_branch(fresh_dbs):
    r, *_ = fresh_dbs
    c = r._commit_sync("system", "init", [])
    br = r._branch_sync("feature-a", c["id"])
    assert br["ok"] is True
    assert br["name"] == "feature-a"
    branches = r._list_branches_sync()
    assert any(b["name"] == "feature-a" for b in branches)


def test_revdb_revert_creates_commit(fresh_dbs):
    r, *_ = fresh_dbs
    c = r._commit_sync("alice", "baseline", [{"object_type": "t", "object_id": "o1", "operation": "create", "old_value": None, "new_value": {"id": "o1", "v": 1}}])
    # Reverting to the first commit should succeed and create a revert commit.
    rev = r._revert_sync(c["id"], "alice")
    assert rev["ok"] is True
    assert rev["revert_commit"] is not None
    assert rev["revert_commit"]["message"] == f"revert to {c['id']}"


def test_revdb_async_api(fresh_dbs):
    r, *_ = fresh_dbs
    import asyncio
    commit = asyncio.run(r.commit("async", "test", []))
    assert commit is not None
    hist = asyncio.run(r.history(limit=10))
    assert len(hist) >= 1


# ── cross-org service tests ──────────────────────────────────────────────────────
def test_create_trust_token(fresh_dbs):
    _, co, *_ = fresh_dbs
    import asyncio
    res = asyncio.run(co.create_trust_token("tenant-a", "tenant-b", {"read": True}))
    assert res["ok"] is True
    assert "token" in res
    assert res["tenant_a"] == "tenant-a"
    assert res["tenant_b"] == "tenant-b"


def test_validate_trust_token(fresh_dbs):
    _, co, *_ = fresh_dbs
    import asyncio
    created = asyncio.run(co.create_trust_token("a", "b", {"read": True}))
    validated = asyncio.run(co.validate_trust_token(created["token"]))
    assert validated is not None
    assert validated["tenant_a"] == "a"
    assert validated["permissions"]["read"] is True


def test_validate_expired_token(fresh_dbs):
    _, co, *_ = fresh_dbs
    import asyncio
    created = asyncio.run(co.create_trust_token("a", "b", {"read": True}, ttl_seconds=-1))
    validated = asyncio.run(co.validate_trust_token(created["token"]))
    assert validated is None


def test_share_object(fresh_dbs):
    _, co, *_ = fresh_dbs
    import asyncio
    res = asyncio.run(co.share_object("obj-1", "a", "b", {"read": True}))
    assert res["ok"] is True
    assert "share_id" in res
    shares = asyncio.run(co.list_shares(object_id="obj-1"))
    assert any(s["object_id"] == "obj-1" for s in shares)


# ── security_ext route tests ─────────────────────────────────────────────────────
@pytest.fixture()
def client(fresh_dbs):
    """Build a TestClient with the new routers mounted."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import server.config as config
    import server.auth as auth
    import server.auth_tenancy as auth_tenancy
    import server.routes.revdb as revdb_routes
    import server.routes.security_ext as security_ext_routes

    importlib.reload(config)
    importlib.reload(auth)
    importlib.reload(auth_tenancy)
    importlib.reload(revdb_routes)
    importlib.reload(security_ext_routes)

    app = FastAPI()
    app.include_router(revdb_routes.router)
    app.include_router(security_ext_routes.router)
    return TestClient(app)


def test_route_acl(client):
    r = client.get("/v1/security/acl")
    assert r.status_code == 200
    body = r.json()
    assert "role" in body
    assert "clearance" in body


def test_route_acl_check_permitted(client):
    r = client.post("/v1/security/acl/check", json={"action": "read", "resource": "r1", "mark": "PUBLIC"})
    assert r.status_code == 200
    body = r.json()
    assert body["permitted"] is True


def test_route_acl_check_denied(client):
    # public role cannot view RESTRICTED
    r = client.post("/v1/security/acl/check", json={"action": "read", "resource": "r1", "mark": "RESTRICTED"})
    assert r.status_code == 200
    body = r.json()
    assert body["permitted"] is False
    assert body["reason"] == "insufficient_clearance"


def test_route_compliance_status(client):
    r = client.get("/v1/security/compliance/status")
    assert r.status_code == 200
    body = r.json()
    assert "audit" in body
    assert "revdb" in body
    assert "tenancy" in body
    assert "overall" in body


def test_route_security_audit(client):
    r = client.get("/v1/security/audit?n=10")
    assert r.status_code == 200
    body = r.json()
    assert "audit_chain" in body
    assert "revdb" in body


def test_route_marks(client, fresh_dbs):
    _, _, _, o, _ = fresh_dbs
    o.upsert_object({"id": "test-obj", "type": "note", "label": "Note", "mark": "PUBLIC"})
    r = client.get("/v1/security/marks?object_id=test-obj")
    assert r.status_code == 200
    assert r.json()["mark"] == "PUBLIC"


def test_route_mark_requires_admin(client, fresh_dbs):
    _, _, _, o, _ = fresh_dbs
    o.upsert_object({"id": "test-obj2", "type": "note", "label": "Note"})
    # No bearer → 401 (require_bearer)
    r = client.post("/v1/security/mark", json={"object_id": "test-obj2", "mark": "INTERNAL"})
    assert r.status_code == 401

    # With dev-key bearer → 200 (admin)
    r = client.post(
        "/v1/security/mark",
        json={"object_id": "test-obj2", "mark": "INTERNAL"},
        headers={"Authorization": "Bearer dev-key"},
    )
    assert r.status_code == 200
    assert o.get_object("test-obj2").get("mark") == "INTERNAL"


# ── revdb route tests ────────────────────────────────────────────────────────────
def test_route_revdb_commit(client):
    r = client.post(
        "/v1/revdb/commit",
        json={"message": "manual", "changes": []},
        headers={"Authorization": "Bearer dev-key"},
    )
    assert r.status_code == 200
    assert r.json()["message"] == "manual"


def test_route_revdb_history(client, fresh_dbs):
    r, *_ = fresh_dbs
    import asyncio
    asyncio.run(r.commit("test", "seed", [{"object_type": "t", "object_id": "x", "operation": "create", "old_value": None, "new_value": {}}]))
    res = client.get("/v1/revdb/history?object_id=x")
    assert res.status_code == 200
    assert len(res.json()["items"]) >= 1


def test_route_revdb_branch(client):
    # first create a commit to branch from
    c = client.post(
        "/v1/revdb/commit",
        json={"message": "for branch", "changes": []},
        headers={"Authorization": "Bearer dev-key"},
    )
    cid = c.json()["id"]
    r = client.post(
        "/v1/revdb/branch",
        json={"name": "release", "from_commit": cid},
        headers={"Authorization": "Bearer dev-key"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True

    br = client.get("/v1/revdb/branches")
    assert br.status_code == 200
    assert any(b["name"] == "release" for b in br.json()["items"])


# ── integration: ontology write auto-generates revdb commit ──────────────────────
def test_ontology_upsert_auto_revdb(fresh_dbs):
    r, _, _, o, _ = fresh_dbs
    o.upsert_object({"id": "auto-1", "type": "test", "label": "Auto"})
    hist = r._history_sync(object_id="auto-1")
    assert any(h["changes"] and h["changes"][0]["object_id"] == "auto-1" for h in hist)


def test_ontology_delete_auto_revdb(fresh_dbs):
    r, _, _, o, _ = fresh_dbs
    o.upsert_object({"id": "auto-2", "type": "test", "label": "Auto"})
    o.delete_object("auto-2")
    hist = r._history_sync(object_id="auto-2")
    ops = [c["operation"] for h in hist for c in h["changes"]]
    assert "delete" in ops
