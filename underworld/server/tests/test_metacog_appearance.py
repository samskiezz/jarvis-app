"""Closing partial items: meta-cognition (#127) + appearance/body-mod (#144-146)."""

from __future__ import annotations

import types

import pytest
from sqlalchemy import select

from underworld.server.db.models import CausalBelief, Memory, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import appearance, factory, reasoning


# ── #127 meta-cognition ──────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_reflection_learns_from_a_bad_habit():
    plan = factory.SeedingPlan(aptitude_pool=8, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Reflect", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        # a reliably-unhelpful habit: 5 trials, only 1 success → confidence ~0.29
        s.add(CausalBelief(minion_id=m.id, cause="rest", effect="wellbeing",
                          trials=5, confirmations=1, confidence=0.286, updated_tick=0))
        await s.flush()
        c_before = m.conscientiousness
        reflected = await reasoning.reflect(s, m, tick=8)
        assert reflected == "rest"
        assert m.conscientiousness > c_before        # grew more deliberate
        lesson = (await s.execute(
            select(Memory).where(Memory.minion_id == m.id, Memory.kind == "reflection")
        )).scalars().first()
        assert lesson is not None and "rest" in lesson.content


@pytest.mark.asyncio
async def test_reflection_noop_without_a_bad_habit():
    plan = factory.SeedingPlan(aptitude_pool=8, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Reflect2", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        s.add(CausalBelief(minion_id=m.id, cause="study", effect="wellbeing",
                          trials=5, confirmations=5, confidence=0.857, updated_tick=0))
        await s.flush()
        assert await reasoning.reflect(s, m, tick=8) is None   # nothing to regret


# ── #144-146 appearance ──────────────────────────────────────────────────────
def test_features_unlock_with_technology():
    stone = appearance.unlocked_features("stone", set())
    info = appearance.unlocked_features("information", {"agriculture", "metallurgy"})
    assert stone["hair"] and stone["body_art"]
    assert not stone["cybernetics"]            # no implants in the stone age
    assert not stone["dyed_cloth"]
    assert info["cybernetics"]                 # information age unlocks body-mod
    assert info["dyed_cloth"] and info["jewellery"]


def test_appearance_is_deterministic_and_tech_bounded():
    m = types.SimpleNamespace(id="abc123", extraversion=0.9)
    stone_look = appearance.for_minion(m, "stone", set())
    info_look = appearance.for_minion(m, "information", {"agriculture", "metallurgy", "pottery"})
    assert stone_look == appearance.for_minion(m, "stone", set())   # deterministic
    assert stone_look["modifications"] == []                        # no cybernetics yet
    assert stone_look["garment"] in ("hides", "woven tunic", "robe")
    assert set(info_look["unlocked"]) >= {"cybernetics", "dyed_cloth"}


def test_appearance_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "Look", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    mid = client.get(f"/worlds/{wid}/minions", headers=headers).json()[0]["id"]
    look = client.get(f"/minions/{mid}/appearance", headers=headers).json()
    assert "hair" in look and "garment" in look and "unlocked" in look
