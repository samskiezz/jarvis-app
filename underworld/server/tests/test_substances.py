"""Closing partial item: stimulants & addiction (#148/#149)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import GuildKind, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, substances
from underworld.server.services.simulation import advance_world


def _m(**kw):
    base = dict(world_id="w", name="a", guild=GuildKind.PHYSICS, dna="d",
                hunger=0.5, thirst=0.5, fatigue=0.2, sanity=0.8, health=0.9,
                stress=0.5, addiction=0.0)
    base.update(kw)
    return Minion(**base)


def test_stimulant_relieves_then_tolerance_blunts_it():
    fresh = _m(addiction=0.0, fatigue=0.2)
    e1 = substances.use_stimulant(fresh)
    assert e1 > 0 and fresh.fatigue > 0.2 and fresh.addiction > 0   # relief + dependency
    hooked = _m(addiction=0.8, fatigue=0.2)
    e2 = substances.use_stimulant(hooked)
    assert e2 < e1                                                   # tolerance blunts the high


def test_withdrawal_hits_abstaining_addicts():
    addict = _m(addiction=0.7, sanity=0.8, health=0.9, stress=0.3)
    s0, h0, st0 = addict.sanity, addict.health, addict.stress
    substances.tick_addiction(addict, used=False)
    assert addict.sanity < s0 and addict.health < h0 and addict.stress > st0
    assert addict.addiction < 0.7                                   # slow recovery while clean
    # a clean Minion suffers no withdrawal
    clean = _m(addiction=0.0, sanity=0.8)
    substances.tick_addiction(clean, used=False)
    assert clean.sanity == 0.8


def test_availability_gated_by_era():
    m = _m(fatigue=0.1)
    assert substances.wants_stimulant(m, "stone") is False
    assert substances.wants_stimulant(m, "industrial") is True


@pytest.mark.asyncio
async def test_addiction_emerges_for_an_exhausted_industrial_population():
    # Drives the exact per-tick substance step the simulation runs, on an
    # exhausted population in the industrial era — dependency should build.
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Stim", cpc_class="C07D", plan=plan)
    async with session_scope() as s:
        people = (await s.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().all()
        for _ in range(3):
            for m in people:
                m.fatigue = 0.1   # stays exhausted between hits
                used = substances.wants_stimulant(m, "industrial")
                if used:
                    substances.use_stimulant(m)
                substances.tick_addiction(m, used=used)
        assert any(m.addiction > 0.0 for m in people)
        # ...whereas in the stone age the same exhaustion yields no stimulants
        clean = people[0]
        clean.addiction = 0.0
        assert substances.wants_stimulant(clean, "stone") is False
