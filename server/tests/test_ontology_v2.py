"""Ontology V2 tests — Actions Service + CDC Funnel + V2 routes.

Fully OFFLINE / deterministic. Temp DBs are used so the real on-disk stores are
never touched. Run:

    python3 -m pytest server/tests/test_ontology_v2.py -q
"""

import asyncio
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


# ── fixtures ─────────────────────────────────────────────────────────────────────
@pytest.fixture()
def v2_services(tmp_path, monkeypatch):
    """Fresh temp DBs for actions, funnel, ontology_store, and ontology_ext."""
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("ACTIONS_DB", str(tmp_path / "actions.db"))
    monkeypatch.setenv("FUNNEL_DB", str(tmp_path / "funnel.db"))
    monkeypatch.setenv("ONTOLOGY_EXT_DB", str(tmp_path / "ont_ext.db"))

    from server.services import ontology_store as store
    from server.services import actions_service as actions
    from server.services import funnel as funnel_svc
    from server.services import ontology_ext as ext

    importlib.reload(store)
    importlib.reload(actions)
    importlib.reload(funnel_svc)
    importlib.reload(ext)

    store.init_db()
    actions.init_db()
    funnel_svc.init_db()
    ext.init_db()

    store.upsert_object(
        {"id": "o1", "type": "widget", "label": "Widget 1", "props": {"status": "new", "priority": 3}}
    )
    store.upsert_object(
        {"id": "o2", "type": "widget", "label": "Widget 2", "props": {"status": "done", "priority": 7}}
    )

    return {"store": store, "actions": actions, "funnel": funnel_svc, "ext": ext}


@pytest.fixture()
def v2_client(tmp_path, monkeypatch):
    """FastAPI TestClient with ONLY the V2 router mounted (no full app side-effects)."""
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("ACTIONS_DB", str(tmp_path / "actions.db"))
    monkeypatch.setenv("FUNNEL_DB", str(tmp_path / "funnel.db"))
    monkeypatch.setenv("ONTOLOGY_EXT_DB", str(tmp_path / "ont_ext.db"))
    monkeypatch.setenv("JARVIS_API_KEY", "test-key")

    from fastapi import FastAPI  # noqa: E402
    from fastapi.testclient import TestClient  # noqa: E402

    from server.routes import ontology_ext as routes  # noqa: E402
    from server.services import ontology_store as store  # noqa: E402
    from server.services import actions_service as actions  # noqa: E402
    from server.services import funnel as funnel_svc  # noqa: E402
    from server.services import ontology_ext as ext  # noqa: E402

    importlib.reload(store)
    importlib.reload(actions)
    importlib.reload(funnel_svc)
    importlib.reload(ext)
    store.init_db()
    actions.init_db()
    funnel_svc.init_db()
    ext.init_db()

    store.upsert_object(
        {"id": "o1", "type": "widget", "label": "W1", "props": {"status": "new"}}
    )
    store.upsert_object(
        {"id": "o2", "type": "widget", "label": "W2", "props": {"status": "done"}}
    )

    app = FastAPI()
    app.include_router(routes.router_v2)
    return TestClient(app), store, actions, funnel_svc, ext


# ── Action Type tests ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_define_action_type(v2_services):
    actions = v2_services["actions"]
    res = await actions.define_action_type({"name": "approve_budget", "parameters": {}})
    assert res["ok"] is True
    assert "id" in res


@pytest.mark.asyncio
async def test_list_action_types(v2_services):
    actions = v2_services["actions"]
    await actions.define_action_type({"name": "type_a"})
    await actions.define_action_type({"name": "type_b"})
    items = await actions.list_action_types()
    names = {i["name"] for i in items}
    assert "type_a" in names
    assert "type_b" in names


@pytest.mark.asyncio
async def test_define_action_type_requires_name(v2_services):
    actions = v2_services["actions"]
    res = await actions.define_action_type({"name": ""})
    assert res["ok"] is False


# ── Action Execution tests ───────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_submit_action(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type({"name": "move"})
    res = await actions.submit_action(at["id"], {"target_id": "o1"}, actor="admin")
    assert res["ok"] is True
    assert res["state"] == "pending"


@pytest.mark.asyncio
async def test_submit_unknown_type_fails(v2_services):
    actions = v2_services["actions"]
    res = await actions.submit_action("no-such-type", {}, actor="admin")
    assert res["ok"] is False


@pytest.mark.asyncio
async def test_approve_and_apply_action(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type({"name": "tag"})
    sub = await actions.submit_action(at["id"], {"tag": "urgent"}, actor="admin")
    eid = sub["id"]
    appr = await actions.approve_action(eid, actor="admin")
    assert appr["ok"] is True
    assert appr["state"] == "approved"
    appd = await actions.apply_action(eid)
    assert appd["ok"] is True
    assert appd["state"] == "applied"


@pytest.mark.asyncio
async def test_apply_without_approve_if_pending_allowed(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type({"name": "quick"})
    sub = await actions.submit_action(at["id"], {}, actor="admin")
    appd = await actions.apply_action(sub["id"])
    assert appd["ok"] is True


@pytest.mark.asyncio
async def test_list_executions_filter(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type({"name": "f1"})
    await actions.submit_action(at["id"], {}, actor="admin")
    await actions.submit_action(at["id"], {}, actor="admin")
    all_execs = await actions.list_executions()
    assert len(all_execs) == 2
    pending = await actions.list_executions(state="pending")
    assert len(pending) == 2
    applied = await actions.list_executions(state="applied")
    assert len(applied) == 0


# ── Criteria validation tests ────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_criteria_range(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type(
        {"name": "set_priority", "submission_criteria": {"priority": {"min": 1, "max": 5}}}
    )
    ok = await actions.submit_action(at["id"], {"priority": 3}, actor="admin")
    assert ok["ok"] is True
    bad = await actions.submit_action(at["id"], {"priority": 10}, actor="admin")
    assert bad["ok"] is False


@pytest.mark.asyncio
async def test_criteria_oneOf(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type(
        {"name": "choose_color", "submission_criteria": {"color": {"oneOf": ["red", "blue"]}}}
    )
    ok = await actions.submit_action(at["id"], {"color": "red"}, actor="admin")
    assert ok["ok"] is True
    bad = await actions.submit_action(at["id"], {"color": "green"}, actor="admin")
    assert bad["ok"] is False


@pytest.mark.asyncio
async def test_criteria_arraySize(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type(
        {"name": "tag_list", "submission_criteria": {"tags": {"minLength": 1, "maxLength": 3}}}
    )
    ok = await actions.submit_action(at["id"], {"tags": ["a"]}, actor="admin")
    assert ok["ok"] is True
    bad = await actions.submit_action(at["id"], {"tags": ["a", "b", "c", "d"]}, actor="admin")
    assert bad["ok"] is False


@pytest.mark.asyncio
async def test_criteria_objectQueryResult(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type(
        {
            "name": "widget_action",
            "submission_criteria": {
                "widget": {"objectQueryResult": {"objectType": "widget", "minResults": 1}}
            },
        }
    )
    ok = await actions.submit_action(at["id"], {}, actor="admin")
    assert ok["ok"] is True


# ── Clearance / redaction integration tests ──────────────────────────────────────
@pytest.mark.asyncio
async def test_clearance_check_blocks_low_actor(v2_services):
    actions = v2_services["actions"]
    at = await actions.define_action_type({"name": "secret", "required_clearance": "RESTRICTED"})
    res = await actions.submit_action(at["id"], {}, actor="PUBLIC")
    assert res["ok"] is False
    res2 = await actions.submit_action(at["id"], {}, actor="RESTRICTED")
    assert res2["ok"] is True


# ── Side effect tests ────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_side_effect_objectMutation(v2_services):
    actions = v2_services["actions"]
    store = v2_services["store"]
    at = await actions.define_action_type(
        {
            "name": "mark_done",
            "side_effects": [
                {"type": "objectMutation", "object": {"objectId": "o1", "status": "done"}}
            ],
        }
    )
    sub = await actions.submit_action(at["id"], {}, actor="admin")
    await actions.apply_action(sub["id"])
    obj = store.get_object("o1")
    assert obj["props"]["status"] == "done"


# ── Funnel / Sync tests ──────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_stage_and_sync_dataset_to_objects(v2_services):
    funnel = v2_services["funnel"]
    store = v2_services["store"]
    funnel.stage_rows(
        "ds1",
        [
            {"id": "r1", "name": "Alpha", "value": 10},
            {"id": "r2", "name": "Beta", "value": 20},
        ],
    )
    res = await funnel.sync_dataset_to_objects("ds1", "item", {"label": "name", "score": "value"})
    assert res["ok"] is True
    assert res["inserted"] == 2
    objs = store.query_objects(type="item")
    assert len(objs) == 2


@pytest.mark.asyncio
async def test_sync_detects_updates(v2_services):
    funnel = v2_services["funnel"]
    funnel.stage_rows("ds2", [{"id": "r1", "val": 1}])
    await funnel.sync_dataset_to_objects("ds2", "thing", {"score": "val"})
    funnel.stage_rows("ds2", [{"id": "r1", "val": 2}])
    res = await funnel.sync_dataset_to_objects("ds2", "thing", {"score": "val"})
    assert res["updated"] == 1
    assert res["inserted"] == 0


@pytest.mark.asyncio
async def test_sync_soft_delete(v2_services):
    funnel = v2_services["funnel"]
    store = v2_services["store"]
    funnel.stage_rows("ds3", [{"id": "r1", "val": 1}])
    await funnel.sync_dataset_to_objects("ds3", "thing", {"score": "val"}, soft_delete=True)
    funnel.clear_staged_rows("ds3")
    res = await funnel.sync_dataset_to_objects("ds3", "thing", {"score": "val"}, soft_delete=True)
    assert res["deleted"] == 1
    obj = store.query_objects(type="thing")[0]
    assert obj["props"].get("_deleted") is True


@pytest.mark.asyncio
async def test_sync_logs_exist(v2_services):
    funnel = v2_services["funnel"]
    funnel.stage_rows("ds4", [{"id": "r1", "val": 1}])
    await funnel.sync_dataset_to_objects("ds4", "thing", {"score": "val"})
    logs = funnel.get_sync_logs("ds4")
    assert len(logs) >= 1
    assert logs[0]["operation"] in ("insert", "noop")


@pytest.mark.asyncio
async def test_sync_status(v2_services):
    funnel = v2_services["funnel"]
    funnel.stage_rows("ds5", [{"id": "r1", "val": 1}])
    await funnel.sync_dataset_to_objects("ds5", "thing", {"score": "val"})
    status = funnel.get_sync_status("ds5")
    assert status["dataset_id"] == "ds5"
    assert status["total_operations"] >= 1
    assert status["tracked_rows"] == 1


@pytest.mark.asyncio
async def test_sync_objects_to_dataset(v2_services):
    funnel = v2_services["funnel"]
    store = v2_services["store"]
    store.upsert_object({"id": "x1", "type": "gadget", "label": "G1", "props": {"price": 99}})
    res = await funnel.sync_objects_to_dataset("gadget", "ds6")
    assert res["ok"] is True
    rows = funnel.get_staged_rows("ds6")
    assert len(rows) == 1
    assert rows[0]["price"] == 99


@pytest.mark.asyncio
async def test_watch_dataset_registers(v2_services):
    funnel = v2_services["funnel"]
    wid = await funnel.watch_dataset("ds7", lambda: None)
    assert len(wid) == 32
    watchers = funnel.list_watchers("ds7")
    assert any(w["id"] == wid for w in watchers)


# ── V2 Route tests (TestClient) ──────────────────────────────────────────────────
def test_v2_route_define_and_list_action_types(v2_client):
    client, *_ = v2_client
    r = client.post(
        "/v1/ontology/actions/types",
        json={"name": "rt1"},
        headers={"Authorization": "Bearer test-key"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    r2 = client.get("/v1/ontology/actions/types", headers={"Authorization": "Bearer test-key"})
    assert r2.status_code == 200
    assert any(i["name"] == "rt1" for i in r2.json()["items"])


def test_v2_route_submit_and_list_executions(v2_client):
    client, *_ = v2_client
    d = client.post(
        "/v1/ontology/actions/types",
        json={"name": "rt2"},
        headers={"Authorization": "Bearer test-key"},
    )
    atid = d.json()["id"]
    s = client.post(
        "/v1/ontology/actions/submit",
        json={"action_type_id": atid, "params": {"x": 1}},
        headers={"Authorization": "Bearer test-key"},
    )
    assert s.status_code == 200
    assert s.json()["state"] == "pending"
    l = client.get(
        "/v1/ontology/actions/executions",
        headers={"Authorization": "Bearer test-key"},
    )
    assert l.status_code == 200
    assert l.json()["count"] >= 1


def test_v2_route_approve_action(v2_client):
    client, *_ = v2_client
    d = client.post(
        "/v1/ontology/actions/types",
        json={"name": "rt3"},
        headers={"Authorization": "Bearer test-key"},
    )
    atid = d.json()["id"]
    s = client.post(
        "/v1/ontology/actions/submit",
        json={"action_type_id": atid, "params": {}},
        headers={"Authorization": "Bearer test-key"},
    )
    eid = s.json()["id"]
    a = client.post(
        "/v1/ontology/actions/approve",
        json={"execution_id": eid},
        headers={"Authorization": "Bearer test-key"},
    )
    assert a.status_code == 200
    assert a.json()["state"] == "approved"


def test_v2_route_sync_and_status(v2_client):
    client, *_ = v2_client
    s = client.post(
        "/v1/ontology/sync",
        json={
            "dataset_id": "ds_route",
            "object_type": "route_obj",
            "mapping": {"label": "name"},
            "direction": "dataset_to_objects",
        },
        headers={"Authorization": "Bearer test-key"},
    )
    # Sync fails because no staged rows exist yet — that's expected
    assert s.status_code == 200  # empty sync returns ok with 0 processed
    st = client.get(
        "/v1/ontology/sync/status?dataset_id=ds_route",
        headers={"Authorization": "Bearer test-key"},
    )
    assert st.status_code == 200
    assert st.json()["dataset_id"] == "ds_route"


def test_v2_route_object_sets(v2_client):
    client, *_ = v2_client
    r = client.post(
        "/v1/ontology/object-sets",
        json={"name": "my_set", "query": {"type": "widget"}},
        headers={"Authorization": "Bearer test-key"},
    )
    assert r.status_code == 200
    assert "id" in r.json()
    l = client.get("/v1/ontology/object-sets", headers={"Authorization": "Bearer test-key"})
    assert l.status_code == 200
    assert any(i["name"] == "my_set" for i in l.json()["items"])


def test_v2_route_bulk_action(v2_client):
    client, store, actions, *_ = v2_client
    # Create an action type with no criteria so it always submits
    d = client.post(
        "/v1/ontology/actions/types",
        json={"name": "bulk_tag", "side_effects": []},
        headers={"Authorization": "Bearer test-key"},
    )
    atid = d.json()["id"]
    r = client.post(
        "/v1/ontology/bulk-action",
        json={"action_type_id": atid, "params": {"object_type": "widget"}, "auto_approve": True},
        headers={"Authorization": "Bearer test-key"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["submitted"] == 2  # o1 and o2 seeded in fixture
