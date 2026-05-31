"""Always-on autopilot + free-Llama provider + efficient sparse LLM."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.config import get_settings
from underworld.server.db.models import World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, scheduler
from underworld.server.tools import llm


def test_llm_provider_resolves_and_falls_back(monkeypatch):
    s = get_settings()
    # no key anywhere → no LLM, simulation uses heuristic+neural (still fully runs)
    monkeypatch.setattr(s, "llm_api_key", "")
    monkeypatch.setattr(s, "kimi_api_key", "")
    assert llm.has_llm() is False
    # a generic free-Llama key takes over and overrides Kimi
    monkeypatch.setattr(s, "llm_api_key", "gsk_free_groq_key")
    monkeypatch.setattr(s, "llm_base_url", "https://api.groq.com/openai/v1")
    monkeypatch.setattr(s, "llm_model", "llama-3.1-8b-instant")
    base, key, model = llm._provider()
    assert "groq" in base and key.startswith("gsk_") and "llama" in model
    assert llm.has_llm() is True


@pytest.mark.asyncio
async def test_new_worlds_default_to_auto_advance():
    plan = factory.SeedingPlan(aptitude_pool=10, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        w = await factory.create_world(s, name="Auto", cpc_class="H02J", plan=plan)
        assert w.auto_advance is True


@pytest.mark.asyncio
async def test_autostart_switches_paused_worlds_on():
    plan = factory.SeedingPlan(aptitude_pool=10, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        w = await factory.create_world(s, name="Paused", cpc_class="H02J", plan=plan,
                                       auto_advance=False)
        wid = w.id
    switched = await scheduler.autostart_all_worlds()
    assert switched >= 1
    async with session_scope() as s:
        w = await s.get(World, wid)
        assert w.auto_advance is True       # the whole system now runs hands-free


def test_autopilot_route(client, headers):
    # a world created through the API is auto-advancing from birth
    created = client.post("/worlds", headers=headers,
                          json={"name": "AutoAPI", "cpc_class": "H02J", "aptitude_pool": 10,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    assert created["auto_advance"] is True
