"""Batch 4 partials → done:

#32        wounds / infection / healing, tied to the immune locus
#137/#139  ascended souls guide the living
#128       curiosity drives exploration over idleness
#91        full history timeline endpoint for rewind/replay
"""

from __future__ import annotations

import random
import types

import pytest
from sqlalchemy import select

from underworld.server.agents import minion as minion_agent
from underworld.server.db.models import (
    Event, GuildKind, Minion, Soul, SwarmRoleKind, World,
)
from underworld.server.db.session import session_scope
from underworld.server.services import factory, lifecycle


# ── #32 health ───────────────────────────────────────────────────────────────
def test_wound_infection_hurts_low_immune_more(monkeypatch):
    def run(immune: float) -> float:
        monkeypatch.setattr(lifecycle.dna_mod, "trait",
                            lambda dna, name: {"immune": immune, "dexterity": 0.5}.get(name, 0.5))
        m = Minion(world_id="w", name="t", guild=GuildKind.PHYSICS, dna="d",
                   health=1.0, fatigue=0.3, injury=0.6)
        rng = random.Random(0)
        for _ in range(10):
            lifecycle.tick_health(m, rng)
        return m.health

    weak = run(0.1)
    strong = run(0.9)
    assert weak < strong <= 1.0  # poor immunity loses more health to infection


def test_wound_heals_over_time():
    m = Minion(world_id="w", name="t", guild=GuildKind.PHYSICS,
               dna="x" * 900, health=1.0, fatigue=0.9, injury=0.7)
    rng = random.Random(0)
    for _ in range(20):
        lifecycle.tick_health(m, rng)
    assert m.injury < 0.7  # rest + immunity healed the wound


# ── #137/#139 ghost guidance ─────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_ascended_souls_guide_the_living():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Ghost", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # ascend one soul + drop everyone's sanity so the boost is observable
        soul = (await s.execute(select(Soul).where(Soul.world_id == world.id))).scalars().first()
        soul.ascended = True
        for m in (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().all():
            m.sanity = 0.5
        await s.flush()
        guides = await lifecycle.ghost_guidance(s, world)
        assert guides >= 1
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "population:guidance")
        )).scalars().first()
        assert ev is not None and ev.payload["guides"] >= 1
        m0 = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        assert m0.sanity > 0.5  # the living were reassured


# ── #128 curiosity ───────────────────────────────────────────────────────────
def test_high_openness_explores_instead_of_idling():
    def minion(openness: float):
        return types.SimpleNamespace(
            openness=openness, creativity=0.2, extraversion=0.2, agreeableness=0.2,
            neuroticism=0.2, conscientiousness=0.2, intelligence=0.4, reputation=1.0,
            hunger=0.9, thirst=0.9, fatigue=0.9, sanity=0.9, health=1.0,
            born_tick=0, guild=GuildKind.PATENT,  # reviewer guild → skips breeding
            swarm_role=types.SimpleNamespace(value="generalist"),
        )

    curious = minion(0.9)
    incurious = minion(0.1)
    curious_actions = {minion_agent._heuristic_decision(curious, random.Random(i), 50)["action"]
                       for i in range(40)}
    incurious_actions = {minion_agent._heuristic_decision(incurious, random.Random(i), 50)["action"]
                         for i in range(40)}
    assert "rest" not in curious_actions          # never idles
    assert curious_actions <= {"search_patents", "kb_lookup"}
    assert incurious_actions == {"rest"}          # nothing drives it to act


# ── #91 timeline endpoint ────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_timeline_endpoint(client, headers):
    # create + advance a world via the API so snapshots exist
    created = client.post("/worlds", headers=headers,
                          json={"name": "TL", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 3})
    tl = client.get(f"/worlds/{wid}/timeline", headers=headers).json()
    assert tl["count"] >= 3
    ticks = [p["tick"] for p in tl["series"]]
    assert ticks == sorted(ticks)  # ascending for replay
    assert "total_knowledge" in tl["series"][0] and "masters" in tl["series"][0]
