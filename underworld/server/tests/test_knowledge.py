import pytest
from sqlalchemy import select

from underworld.server.db.models import (
    KnowledgeConcept,
    KnowledgeFormula,
    KnowledgeGuardrail,
    KnowledgeSwarmRole,
)
from underworld.server.db.session import session_scope
from underworld.server.knowledge.seed import seed_knowledge_base


@pytest.mark.asyncio
async def test_seed_knowledge_loads_all_tables():
    counts = await seed_knowledge_base()
    # First run may insert thousands; second run is idempotent.
    counts2 = await seed_knowledge_base()
    async with session_scope() as session:
        concept_count = await session.scalar(select(KnowledgeConcept.id).limit(1))
        formula_count = await session.scalar(select(KnowledgeFormula.id).limit(1))
        role_count = await session.scalar(select(KnowledgeSwarmRole.id).limit(1))
        guard_count = await session.scalar(select(KnowledgeGuardrail.id).limit(1))
    assert concept_count is not None
    assert formula_count is not None
    assert role_count is not None
    assert guard_count is not None
    # Second call should be a no-op.
    assert all(v == 0 for v in counts2.values())


def test_knowledge_summary_route(client, headers):
    res = client.get("/knowledge/summary", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["formulas"] > 1000
    assert body["swarm_roles"] >= 9
    assert body["guardrails"] >= 5
    assert "mathematics" in body["formulas_by_discipline"]


def test_knowledge_formula_search(client, headers):
    res = client.get("/knowledge/formulas?discipline=ai&limit=5", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] > 0
    assert len(body["items"]) <= 5
    assert all(f["discipline"] == "ai" for f in body["items"])


def test_knowledge_formula_q_filter(client, headers):
    res = client.get("/knowledge/formulas?q=ridge&limit=5", headers=headers)
    assert res.status_code == 200
    items = res.json()["items"]
    assert any("ridge" in f["expression"].lower() for f in items)


def test_swarm_roles_listed(client, headers):
    res = client.get("/knowledge/swarm-roles", headers=headers)
    assert res.status_code == 200
    rows = res.json()
    role_ids = {r["id"] for r in rows}
    for required in (
        "literature_scout", "genome_analyst", "protein_modeller",
        "chemistry_generator", "toxicity_checker", "trial_simulator",
        "regulatory_reasoner",
    ):
        assert required in role_ids, f"missing role {required}"


def test_guardrails_listed(client, headers):
    res = client.get("/knowledge/guardrails", headers=headers)
    assert res.status_code == 200
    stages = {g["stage"] for g in res.json()}
    for required in ("in_silico", "bench", "preclinical", "clinical", "regulatory", "red_lines"):
        assert required in stages
