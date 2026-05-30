"""Closing partial items: government (#41) + legal systems (#42)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Discovery, Event, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, governance


# ── #41 government ───────────────────────────────────────────────────────────
def test_government_emerges_from_size_and_temperament():
    assert governance.government_for(population=5, avg_openness=0.5) == "tribe"
    assert governance.government_for(population=15, avg_openness=0.5) == "chiefdom"
    assert governance.government_for(population=30, avg_openness=0.5) == "kingdom"
    assert governance.government_for(population=100, avg_openness=0.7) == "democracy"
    assert governance.government_for(population=100, avg_openness=0.3) == "autocracy"


# ── #42 legal ────────────────────────────────────────────────────────────────
def test_legal_system_tracks_writing_and_knowledge():
    assert governance.legal_for(population=5, knowledge=0, has_writing=False) == "customary"
    # writing is a prerequisite for written law
    assert governance.legal_for(population=50, knowledge=50, has_writing=False) == "customary"
    assert governance.legal_for(population=50, knowledge=50, has_writing=True) == "codified"
    assert governance.legal_for(population=50, knowledge=200, has_writing=True) == "courts"
    assert governance.legal_for(population=50, knowledge=400, has_writing=True) == "constitutional"


@pytest.mark.asyncio
async def test_governance_reform_event_and_order_calms():
    plan = factory.SeedingPlan(aptitude_pool=30, patent_guild_seats=3, safety_guild_seats=3)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Gov", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # mature the society: writing discovered + lots of knowledge + stressed people
        s.add(Discovery(world_id=world.id, tech="writing", tick=0))
        people = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all()
        from underworld.server.db.models import Skill
        for i, m in enumerate(people):
            m.stress = 0.6
            s.add(Skill(minion_id=m.id, name=f"k{i}", level=9.0))
        world.government = "__none__"
        world.legal_system = "customary"
        await s.flush()
        changed = await governance.tick_governance(s, world)
        assert "government" in changed                     # institutions reformed
        assert world.legal_system in {"courts", "constitutional"}
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "society:government")
        )).scalars().first()
        assert ev is not None
        calmed = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        assert calmed.stress < 0.6                          # rule of law brought order


def test_society_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "SocAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    body = client.get(f"/worlds/{created['id']}/society", headers=headers).json()
    assert body["government"] in governance.GOVERNMENTS
    assert body["legal_system"] in governance.LEGAL_STAGES
