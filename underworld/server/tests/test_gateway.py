"""Big push 2 — the Internet Gateway (#75-85)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Discovery, Event, Memory, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, gateway


async def _open_world(s):
    """A world at peak information: writing + mathematics + lots of knowledge."""
    plan = factory.SeedingPlan(aptitude_pool=24, patent_guild_seats=3, safety_guild_seats=3)
    world = await factory.create_world(s, name="Gate", cpc_class="G06F", plan=plan)
    s.add_all([
        Discovery(world_id=world.id, tech="writing", tick=0),
        Discovery(world_id=world.id, tech="mathematics", tick=0),
    ])
    people = (await s.execute(
        select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
    )).scalars().all()
    for i, m in enumerate(people):
        s.add(Skill(minion_id=m.id, name=f"k{i}", level=9.0))   # push knowledge past peak
    await s.flush()
    return world, people


@pytest.mark.asyncio
async def test_gateway_sealed_before_peak_information():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Early", cpc_class="G06F", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        assert await gateway.world_gateway_open(s, world) is False
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        res = await gateway.consult_gateway(s, m, "physics", "energy")
        assert res["passed"] is False and "peak information" in res["reason"]


@pytest.mark.asyncio
async def test_only_a_master_passes_the_gateway():
    async with session_scope() as s:
        world, people = await _open_world(s)
        assert await gateway.world_gateway_open(s, world) is True
        novice = people[0]
        master = people[1]
        # give the master a mastered physics skill ("quantum" is a physics concept
        # and not a guild starting skill, so no unique-constraint clash)
        s.add(Skill(minion_id=master.id, name="quantum", level=7.0))
        await s.flush()
        assert await gateway.can_pass(s, master, "physics") is True
        assert await gateway.can_pass(s, novice, "astronomy") is False

        ok = await gateway.consult_gateway(s, master, "physics", "thermodynamics")
        assert ok["passed"] is True
        assert ok["dataset"]["records"]                         # read a real/offline dataset
        # the master stored what they read + a gateway event fired
        mem = (await s.execute(
            select(Memory).where(Memory.minion_id == master.id, Memory.kind == "gateway")
        )).scalars().first()
        assert mem is not None
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "gateway:passed")
        )).scalars().first()
        assert ev is not None


@pytest.mark.asyncio
async def test_fetch_dataset_is_read_only_and_structured():
    ds = await gateway.fetch_dataset("oscillators")
    assert ds["source"] in {"crossref", "offline"}
    assert ds["records"] and all("title" in r for r in ds["records"])


def test_gateway_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "GateAPI", "cpc_class": "G06F", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    mid = client.get(f"/worlds/{wid}/minions", headers=headers).json()[0]["id"]
    # early world → sealed, but the endpoint responds cleanly
    res = client.post(f"/minions/{mid}/gateway", headers=headers,
                      json={"discipline": "physics", "query": "energy"}).json()
    assert res["passed"] is False
