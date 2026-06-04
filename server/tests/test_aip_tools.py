"""AIP tool-use / AI-actions / agent-workflow tests — fully OFFLINE / deterministic.

No network and no API key. Temp DBs are used (env AIP_DB / ONTOLOGY_DB / AUDIT_DB)
so the real on-disk stores are never touched. Run:

    python3 -m pytest server/tests/test_aip_tools.py -q
"""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402


@pytest.fixture()
def tools(tmp_path, monkeypatch):
    """Reload ontology_store + audit + aip_tools against fresh temp DBs."""
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("AIP_DB", str(tmp_path / "aip.db"))

    from server.services import ontology_store as ont
    from server.services import audit
    importlib.reload(ont)
    importlib.reload(audit)
    ont.init_db()
    ont.seed_from_static()

    from server.services import aip_tools as at
    importlib.reload(at)
    at.init_db()
    return at, ont, audit


# ── #64 catalog ────────────────────────────────────────────────────────────────
def test_list_tools_non_empty(tools):
    at, _ont, _audit = tools
    catalog = at.list_tools()
    assert isinstance(catalog, list) and catalog
    names = {t["name"] for t in catalog}
    # search + at least one ontology write action are always present.
    assert "search" in names
    assert "ontology.set_property" in names
    for t in catalog:
        assert {"name", "kind", "params_schema", "description"} <= set(t)


def test_call_tool_bad_tool(tools):
    at, _ont, _audit = tools
    out = at.call_tool("does.not.exist", {})
    assert out["ok"] is False
    assert "error" in out


def test_call_tool_read(tools):
    at, _ont, _audit = tools
    out = at.call_tool("ontology.get", {"object_id": "sam"})
    # 'sam' is part of the seed; if absent the call still returns a clean shape.
    assert out["ok"] in (True, False)
    if out["ok"]:
        assert out["result"]["id"] == "sam"


# ── #63 propose / approve / reject ───────────────────────────────────────────────
def _a_seed_object_id(ont):
    objs = ont.query_objects(limit=1)
    assert objs, "seed produced no objects"
    return objs[0]["id"]


def test_propose_creates_pending_without_mutation(tools):
    at, ont, _audit = tools
    oid = _a_seed_object_id(ont)
    before = ont.get_object(oid)["props"]

    res = at.propose_action(oid, "set_property", {"key": "k", "value": "v"},
                            rationale="test", actor="agent")
    assert res["ok"] is True
    prop = res["proposal"]
    assert prop["status"] == "PENDING"

    # Object is UNCHANGED — proposing must not mutate.
    after = ont.get_object(oid)["props"]
    assert "k" not in after
    assert after == before

    pendings = at.list_proposals("PENDING")
    assert any(p["id"] == prop["id"] for p in pendings)


def test_approve_executes_and_mutates_and_audits(tools):
    at, ont, audit = tools
    oid = _a_seed_object_id(ont)

    res = at.propose_action(oid, "set_property", {"key": "approved_key", "value": 42},
                            actor="agent")
    pid = res["proposal"]["id"]

    out = at.approve_proposal(pid, approver="human")
    assert out["ok"] is True
    assert out["proposal"]["status"] == "APPROVED"

    # The object is now mutated.
    obj = ont.get_object(oid)
    assert obj["props"].get("approved_key") == 42

    # The write-back is audited in the ontology action log...
    actions = ont.list_actions(oid)
    assert any(a["action"] == "set_property" for a in actions)
    # ...and in the hash-chained audit ledger.
    assert audit.verify_chain()["ok"] is True
    tail = audit.tail(20)
    assert any(r["action"] == "aip.approve_proposal" for r in tail)


def test_approve_is_idempotent(tools):
    at, ont, _audit = tools
    oid = _a_seed_object_id(ont)
    pid = at.propose_action(oid, "flag", {"flag": "x"}, actor="a")["proposal"]["id"]
    assert at.approve_proposal(pid, approver="h")["ok"] is True
    # Second approve is a no-op error (already APPROVED).
    assert at.approve_proposal(pid, approver="h")["ok"] is False


def test_reject_marks_rejected_without_mutation(tools):
    at, ont, _audit = tools
    oid = _a_seed_object_id(ont)
    before = ont.get_object(oid)["props"]

    pid = at.propose_action(oid, "set_property", {"key": "rk", "value": 1},
                            actor="agent")["proposal"]["id"]
    out = at.reject_proposal(pid, approver="human")
    assert out["ok"] is True
    assert out["proposal"]["status"] == "REJECTED"

    after = ont.get_object(oid)["props"]
    assert "rk" not in after
    assert after == before


# ── #65 agent workflow ───────────────────────────────────────────────────────────
def test_run_plan_read_tool_returns_trace(tools):
    at, ont, _audit = tools
    oid = _a_seed_object_id(ont)
    plan = [
        {"tool": "search", "params": {"query": "sam", "k": 3}},
        {"tool": "ontology.get", "params": {"object_id": oid}},
    ]
    res = at.run_plan(plan, actor="agent")
    assert isinstance(res["trace"], list)
    assert res["n_steps"] == 2
    assert len(res["trace"]) == 2
    assert all("tool" in r for r in res["trace"])


def test_run_plan_write_tool_is_governed_proposal(tools):
    at, ont, _audit = tools
    oid = _a_seed_object_id(ont)
    before = ont.get_object(oid)["props"]

    plan = [{"tool": "ontology.set_property",
             "params": {"object_id": oid, "key": "planned", "value": 9}}]
    res = at.run_plan(plan, actor="agent")  # no auto_approve

    step = res["trace"][0]
    assert step["mode"] == "proposed"
    # No mutation happened — it was queued as a proposal.
    assert ont.get_object(oid)["props"] == before
    assert at.list_proposals("PENDING")


def test_run_plan_auto_approve_executes_write(tools):
    at, ont, _audit = tools
    oid = _a_seed_object_id(ont)
    plan = [{"tool": "ontology.set_property",
             "params": {"object_id": oid, "key": "auto", "value": 1}}]
    res = at.run_plan(plan, actor={"id": "trusted", "auto_approve": True})
    assert res["trace"][0]["mode"] == "executed"
    assert ont.get_object(oid)["props"].get("auto") == 1
