"""Not-done phase, batch 5 — the Socratic Oracle (#56/#57)."""

from __future__ import annotations

import pytest

from underworld.server.services import oracle


@pytest.mark.asyncio
async def test_oracle_gives_socratic_hints_not_answers():
    res = await oracle.consult("How do I compute the period of a pendulum?",
                               discipline="mechanics")
    assert res["source"] == "oracle"
    assert "?" in res["hint"]                       # it questions back
    assert res["grounded_in"] == "mechanics"
    # never reveals a direct answer
    assert "the answer is" not in res["hint"].lower()


@pytest.mark.asyncio
async def test_oracle_grounds_in_skill_tree_concept():
    res = await oracle.consult("I want to understand thermodynamics better")
    assert res["grounded_in"] == "thermodynamics"   # matched a real tree concept
    assert "thermodynamics" in res["hint"].lower()


@pytest.mark.asyncio
async def test_oracle_handles_empty_question():
    res = await oracle.consult("")
    assert res["hint"].endswith("?")                # asks for clarification


def test_oracle_route(client, headers):
    body = client.post("/knowledge/oracle", headers=headers,
                       json={"question": "Why does iron rust?", "discipline": "metallurgy"}).json()
    assert "?" in body["hint"] and body["source"] == "oracle"
