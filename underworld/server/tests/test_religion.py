"""Not-done phase, batch 7 — emergent religion & philosophy (#46/#133/#134)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, religion


def test_worldview_tracks_understanding():
    # low knowledge → animism/polytheism; high knowledge + open → naturalism/secular
    primitive = religion.dominant_worldview(
        avg_openness=0.3, avg_intelligence=0.3, knowledge_per_capita=0.5)
    learned = religion.dominant_worldview(
        avg_openness=0.7, avg_intelligence=0.7, knowledge_per_capita=8.0)
    middling = religion.dominant_worldview(
        avg_openness=0.4, avg_intelligence=0.4, knowledge_per_capita=3.0)
    assert primitive == "animism"
    assert learned == "secularism"
    assert middling in {"polytheism", "monotheism"}


def test_personal_stance_from_traits():
    assert religion.stance_for(0.9, 0.9) == "atheist"
    assert religion.stance_for(0.1, 0.1) == "believer"
    assert religion.stance_for(0.5, 0.5) == "agnostic"


@pytest.mark.asyncio
async def test_culture_assessment_and_reformation_event():
    plan = factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Faith", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        culture = await religion.assess_culture(s, world)
        assert sum(culture.stances.values()) >= 1
        assert culture.worldview in {
            "animism", "polytheism", "monotheism", "philosophical_naturalism", "secularism",
        }
        # force a reformation by pretending the world held a different view
        world.worldview = "__none__"
        changed = await religion.tick_culture(s, world)
        assert changed == culture.worldview
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "culture:belief")
        )).scalars().first()
        assert ev is not None and ev.payload["to"] == culture.worldview


def test_culture_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "FaithAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    body = client.get(f"/worlds/{wid}/culture", headers=headers).json()
    assert "worldview" in body and "stances" in body
