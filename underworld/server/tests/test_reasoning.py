"""Not-done phase, batch 3 — causal reasoning (#23).

Minions form hypotheses ("doing X improves my wellbeing") from experience,
update them with evidence, and act on confident beliefs.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import CausalBelief, GuildKind, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, reasoning
from underworld.server.services.simulation import advance_world


def test_wellbeing_is_monotonic_in_needs():
    good = Minion(world_id="w", name="a", guild=GuildKind.PHYSICS, dna="d",
                  hunger=0.9, thirst=0.9, fatigue=0.9, sanity=0.9, health=0.9,
                  morale=0.8, purpose=0.8, reputation=2.0)
    bad = Minion(world_id="w", name="b", guild=GuildKind.PHYSICS, dna="d",
                 hunger=0.2, thirst=0.2, fatigue=0.2, sanity=0.2, health=0.2,
                 morale=0.2, purpose=0.2, reputation=0.5)
    assert reasoning.wellbeing(good) > reasoning.wellbeing(bad)


@pytest.mark.asyncio
async def test_belief_confidence_tracks_evidence():
    plan = factory.SeedingPlan(aptitude_pool=8, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Bel", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        # five confirmations of "study" → high confidence
        for t in range(5):
            await reasoning.record(s, m.id, "study", confirmed=True, tick=t)
        # three disconfirmations of "rest" → low confidence
        for t in range(3):
            await reasoning.record(s, m.id, "rest", confirmed=False, tick=t)
        await s.flush()
        bel = {b.cause: b for b in await reasoning.beliefs(s, m.id)}
        assert bel["study"].confidence > 0.7 and bel["study"].trials == 5
        assert bel["rest"].confidence < 0.3
        # the Minion will act on the strong belief, not the weak one
        chosen = await reasoning.best_action(s, m.id, {"study", "rest", "calculate"})
        assert chosen == "study"


@pytest.mark.asyncio
async def test_minions_accrue_beliefs_during_simulation():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Learn", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await advance_world(s, world, ticks=4)
    async with session_scope() as s:
        beliefs = (await s.execute(select(CausalBelief))).scalars().all()
        assert beliefs, "minions should have formed causal beliefs from their actions"
        assert all(b.trials >= 1 for b in beliefs)
        assert all(0.0 <= b.confidence <= 1.0 for b in beliefs)


def test_beliefs_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "BelAPI", "cpc_class": "H02J", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 3})
    minions = client.get(f"/worlds/{wid}/minions", headers=headers).json()
    beliefs = client.get(f"/minions/{minions[0]['id']}/beliefs", headers=headers).json()
    assert isinstance(beliefs, list)
    if beliefs:
        assert {"cause", "confidence", "trials"} <= set(beliefs[0])
