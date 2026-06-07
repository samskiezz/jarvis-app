"""AIP V2 cluster tests — LLM Router, Workflow Engine, Agent Studio, Evals.

Fully offline / deterministic. Temp DBs + monkeypatched LLM backends.
Run:
    python3 -m pytest server/tests/test_aip_v2.py -q
"""

from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402

# ── Fixtures ────────────────────────────────────────────────────────────────────


@pytest.fixture()
def logic_db(tmp_path, monkeypatch):
    """Fresh AIP Logic DB."""
    monkeypatch.setenv("AIP_LOGIC_DB", str(tmp_path / "logic.db"))
    from server.services import aip_logic as al
    importlib.reload(al)
    al.init_db()
    return al


@pytest.fixture()
def evals_db(tmp_path, monkeypatch):
    """Fresh AIP Evals DB."""
    monkeypatch.setenv("AIP_EVALS_DB", str(tmp_path / "evals.db"))
    from server.services import aip_evals as ev
    importlib.reload(ev)
    ev.init_db()
    return ev


@pytest.fixture()
def studio(monkeypatch):
    """Fresh AgentStudio with no LLM."""
    from server.services import agent_studio as ast
    importlib.reload(ast)
    monkeypatch.setattr(ast._llm, "backend", lambda: None)
    return ast


@pytest.fixture()
def router(monkeypatch):
    """Fresh LLM router with no keys."""
    from server.services import llm_router as lr
    importlib.reload(lr)
    monkeypatch.setenv("KIMI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    return lr


@pytest.fixture()
def client(monkeypatch):
    """TestClient with auth key set."""
    import os
    os.environ["JARVIS_API_KEY"] = "test-key"
    # Auth reads config at import time; patch it live so earlier imports don't matter.
    import server.config as cfg
    monkeypatch.setattr(cfg, "API_KEY", "test-key", raising=False)
    import server.auth as auth
    monkeypatch.setattr(auth, "API_KEY", "test-key", raising=False)
    from fastapi.testclient import TestClient  # noqa: E402
    from server.main import app  # noqa: E402
    return TestClient(app)


HEADERS = {"Authorization": "Bearer test-key"}


# ── 1. LLM Router ───────────────────────────────────────────────────────────────


def test_list_providers_returns_all(router):
    providers = router.list_providers()
    ids = {p["id"] for p in providers}
    assert ids >= {"kimi", "openai", "anthropic", "ollama"}


def test_stream_chat_no_providers_diagnostic(router):
    async def _consume():
        chunks = []
        async for c in router.stream_chat("hello"):
            chunks.append(c)
        return chunks

    chunks = asyncio.run(_consume())
    text = "".join(chunks)
    assert "No LLM provider available" in text or "//" in text


def test_stream_chat_forced_provider(router, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    forced = router._provider_from_env()
    assert forced == "openai"


def test_health_check_unknown_provider(router):
    async def _check():
        return await router.health_check("not_a_provider")

    res = asyncio.run(_check())
    assert res["healthy"] is False
    assert "unknown" in res.get("error", "")


# ── 2. AIP Logic Workflow Engine ────────────────────────────────────────────────


def test_create_and_get_workflow(logic_db):
    wf = logic_db.AIPWorkflow(name="Test", workflow_type="research", steps=[{"type": "llm", "config": {"prompt": "hi"}}])
    res = logic_db.create_workflow(wf, actor="tester")
    assert res["ok"] is True
    wid = res["workflow_id"]
    fetched = logic_db.get_workflow(wid)
    assert fetched is not None
    assert fetched["name"] == "Test"
    assert fetched["workflow_type"] == "research"


def test_list_workflows_by_type(logic_db):
    logic_db.create_workflow(logic_db.AIPWorkflow(name="A", workflow_type="monitor"), actor="t")
    logic_db.create_workflow(logic_db.AIPWorkflow(name="B", workflow_type="monitor"), actor="t")
    logic_db.create_workflow(logic_db.AIPWorkflow(name="C", workflow_type="research"), actor="t")
    mons = logic_db.list_workflows("monitor")
    assert len(mons) == 2
    assert all(w["workflow_type"] == "monitor" for w in mons)


def test_execute_workflow_not_found(logic_db):
    async def _run():
        return await logic_db.execute_workflow("nonexistent", inputs={}, actor="t")

    res = asyncio.run(_run())
    assert res["ok"] is False
    assert "not found" in res.get("error", "")


def test_execute_workflow_llm_step(logic_db, monkeypatch):
    from server.services import aip_logic as al
    monkeypatch.setattr(al._llm, "llm_complete", lambda *a, **k: "synthetic answer")
    wf = al.AIPWorkflow(
        name="LLM step",
        workflow_type="research",
        steps=[{"type": "llm", "config": {"prompt": "say hi", "output_key": "reply"}}],
    )
    created = al.create_workflow(wf)
    wid = created["workflow_id"]

    async def _run():
        return await al.execute_workflow(wid, inputs={}, actor="t")

    res = asyncio.run(_run())
    assert res["ok"] is True
    assert any(s["type"] == "llm" for s in res["trace"])


def test_execute_workflow_tool_step(logic_db, monkeypatch, tmp_path):
    # Ensure ontology_store is on a temp DB so search works
    monkeypatch.setenv("ONTOLOGY_DB", str(tmp_path / "ont.db"))
    from server.services import ontology_store as ont
    importlib.reload(ont)
    ont.init_db()
    ont.seed_from_static()

    from server.services import aip_logic as al
    importlib.reload(al)
    al.init_db()
    wf = al.AIPWorkflow(
        name="Tool step",
        workflow_type="research",
        steps=[{"type": "tool", "config": {"tool": "ontology.query", "params": {"limit": 2}, "output_key": "objs"}}],
    )
    created = al.create_workflow(wf)
    wid = created["workflow_id"]

    async def _run():
        return await al.execute_workflow(wid, inputs={}, actor="t")

    res = asyncio.run(_run())
    assert res["ok"] is True
    assert any(s["type"] == "tool" for s in res["trace"])


def test_execute_workflow_condition_true(logic_db, monkeypatch):
    from server.services import aip_logic as al
    monkeypatch.setattr(al._llm, "llm_complete", lambda *a, **k: "ok")
    wf = al.AIPWorkflow(
        name="Cond true",
        workflow_type="monitor",
        steps=[
            {"type": "llm", "config": {"prompt": "x", "output_key": "flag"}},
            {"type": "condition", "config": {"expression": "True"}},
            {"type": "llm", "config": {"prompt": "y", "output_key": "out"}},
        ],
    )
    created = al.create_workflow(wf)
    res = asyncio.run(al.execute_workflow(created["workflow_id"], inputs={}, actor="t"))
    assert res["ok"] is True
    assert len(res["trace"]) == 3


def test_execute_workflow_condition_false(logic_db, monkeypatch):
    from server.services import aip_logic as al
    monkeypatch.setattr(al._llm, "llm_complete", lambda *a, **k: "ok")
    wf = al.AIPWorkflow(
        name="Cond false",
        workflow_type="monitor",
        steps=[
            {"type": "condition", "config": {"expression": "False"}},
            {"type": "llm", "config": {"prompt": "never reached"}},
        ],
    )
    created = al.create_workflow(wf)
    res = asyncio.run(al.execute_workflow(created["workflow_id"], inputs={}, actor="t"))
    assert res["ok"] is True
    # Stops after condition evaluates false
    assert len(res["trace"]) == 1


def test_ensure_builtin_workflows_idempotent(logic_db):
    r1 = logic_db.ensure_builtin_workflows(actor="t")
    r2 = logic_db.ensure_builtin_workflows(actor="t")
    assert r1["created"] >= 4
    assert r2["skipped"] >= 4


# ── 3. Agent Studio ─────────────────────────────────────────────────────────────


def test_list_agents(studio):
    agents = studio.AgentStudio().list_agents()
    types = {a["type"] for a in agents}
    assert types >= {"analyst", "scientist", "security", "ops"}


def test_run_multi_agent_empty_task(studio):
    async def _run():
        return await studio.run_multi_agent("", agents=["analyst"])

    res = asyncio.run(_run())
    assert res["answer"] == ""


def test_run_multi_agent_invalid_agent(studio):
    async def _run():
        return await studio.run_multi_agent("do something", agents=["ghost"])

    res = asyncio.run(_run())
    assert res["ok"] is False
    assert "no valid agents" in res.get("error", "")


def test_run_multi_agent_no_backend(studio):
    async def _run():
        return await studio.run_multi_agent("summarise data", agents=["analyst"])

    res = asyncio.run(_run())
    assert res["ok"] is True
    assert "analyst" in (res["results"][0]["agent"] if res["results"] else "")


# ── 4. AIP Evals ────────────────────────────────────────────────────────────────


def test_create_and_list_test_cases(evals_db):
    case = {"suite_id": "s1", "name": "exact", "prompt": "Say hello", "system": "", "expect": {"text": "hello"}}
    res = evals_db.create_test_case(case, actor="t")
    assert res["ok"] is True
    cases = evals_db.list_test_cases("s1")
    assert any(c["name"] == "exact" for c in cases)


def test_score_run_exact_match(evals_db):
    m = evals_db.score_run("Hello world", {"text": "hello world"})
    assert m["exact"] == 1.0
    assert m["overall"] > 0.5


def test_score_run_cosine_similarity(evals_db):
    m = evals_db.score_run("the quick brown fox", {"text": "a fast brown fox"})
    assert m["cosine"] > 0.0
    assert m["cosine"] <= 1.0


def test_score_run_json_schema(evals_db):
    schema = {"required": ["name"], "properties": {"name": "string", "age": "number"}}
    m = evals_db.score_run('{"name": "Ada", "age": 30}', {"json_schema": schema})
    assert m["schema"] == 1.0

    m2 = evals_db.score_run('{"name": 42}', {"json_schema": schema})
    assert m2["schema"] == 0.0


def test_score_run_regex(evals_db):
    m = evals_db.score_run("Error: disk full", {"regex": r"disk full"})
    assert m["regex"] == 1.0
    m2 = evals_db.score_run("All good", {"regex": r"disk full"})
    assert m2["regex"] == 0.0


def test_run_eval_no_backend(evals_db, monkeypatch):
    monkeypatch.setattr(evals_db._llm, "backend", lambda: None)
    monkeypatch.setattr(evals_db._llm, "llm_complete", lambda *a, **k: None)
    case = {"id": "e1", "prompt": "hi", "system": "", "expect": {"text": "hi", "threshold": 1.0}}
    res = asyncio.run(evals_db.run_eval(case, "kimi"))
    assert res["ok"] is True
    assert res["passed"] is False  # empty output vs exact match


def test_benchmark_empty_suite(evals_db):
    res = asyncio.run(evals_db.benchmark(["kimi"], "empty_suite"))
    assert res["ok"] is False
    assert "no test cases" in res.get("error", "")


# ── 5. Routes ───────────────────────────────────────────────────────────────────


def test_route_providers(client):
    res = client.get("/v1/aip/providers")
    assert res.status_code == 200
    assert "providers" in res.json()


def test_route_workflow_create(client, monkeypatch, tmp_path):
    monkeypatch.setenv("AIP_LOGIC_DB", str(tmp_path / "route_logic.db"))
    from server.services import aip_logic as al
    importlib.reload(al)
    al.init_db()
    payload = {
        "name": "RouteWF",
        "workflow_type": "research",
        "steps": [{"type": "llm", "config": {"prompt": "hello"}}],
        "execute": False,
    }
    r = client.post("/v1/aip/workflow", json=payload, headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data["created"]["ok"] is True


def test_route_agent_studio(client, monkeypatch):
    from server.services import agent_studio as ast
    monkeypatch.setattr(ast._llm, "backend", lambda: None)
    payload = {"task": "check status", "agents": ["ops"], "max_steps": 2}
    r = client.post("/v1/aip/agent-studio", json=payload, headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True


def test_route_eval(client, monkeypatch, tmp_path):
    monkeypatch.setenv("AIP_EVALS_DB", str(tmp_path / "route_evals.db"))
    from server.services import aip_evals as ev
    importlib.reload(ev)
    ev.init_db()
    monkeypatch.setattr(ev._llm, "backend", lambda: None)
    monkeypatch.setattr(ev._llm, "llm_complete", lambda *a, **k: "42")
    payload = {
        "suite_id": "suite1",
        "name": "meaning",
        "prompt": "What is the answer?",
        "system": "",
        "expect": {"text": "42", "threshold": 0.9},
        "model": "kimi",
    }
    r = client.post("/v1/aip/eval", json=payload, headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data["result"]["ok"] is True


def test_route_eval_benchmark(client, monkeypatch, tmp_path):
    monkeypatch.setenv("AIP_EVALS_DB", str(tmp_path / "route_bench.db"))
    from server.services import aip_evals as ev
    importlib.reload(ev)
    ev.init_db()
    # seed one case
    ev.create_test_case(
        {"suite_id": "bench_suite", "name": "t1", "prompt": "p", "system": "", "expect": {"text": "x"}},
        actor="t",
    )
    monkeypatch.setattr(ev._llm, "backend", lambda: None)
    monkeypatch.setattr(ev._llm, "llm_complete", lambda *a, **k: "x")
    r = client.get("/v1/aip/eval/benchmark?suite_id=bench_suite&models=kimi", headers=HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert "report" in data
