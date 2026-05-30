"""Not-done phase, batch 4 — economy & trade (#39/#40)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, World
from underworld.server.db.session import session_scope
from underworld.server.services import economy, factory
from underworld.server.services.simulation import advance_world
from underworld.server.world.seed import derive_seed


def test_clearing_price_responds_to_scarcity_and_demand():
    cheap = economy.clearing_price(10.0, supply=100, demand=10)
    dear = economy.clearing_price(10.0, supply=1, demand=100)
    assert dear > cheap                                  # scarce + wanted → expensive
    more_people = economy.clearing_price(10.0, supply=50, demand=50)
    fewer_people = economy.clearing_price(10.0, supply=50, demand=5)
    assert more_people > fewer_people                    # demand lifts price


def test_geology_sets_relative_prices():
    plains = derive_seed("A01B")     # agriculture — ore-poor
    mountain = derive_seed("E21B")   # mining — ore-rich
    iron_plains = economy.market(plains, 100)["iron_ore"]["price"]
    iron_mtn = economy.market(mountain, 100)["iron_ore"]["price"]
    assert iron_plains > iron_mtn     # iron is dearer where it's scarce


def test_population_drives_inflation_of_the_index():
    seed = derive_seed("H02J")
    small = economy.price_index(economy.market(seed, 20))
    large = economy.price_index(economy.market(seed, 500))
    assert large > small              # more mouths → higher overall prices


def test_inflation_when_money_outpaces_goods():
    assert economy.inflation(100, 200, 100, 100) > 0     # money doubled, goods flat
    assert economy.inflation(100, 110, 100, 110) < economy.inflation(100, 200, 100, 100)


@pytest.mark.asyncio
async def test_market_snapshot_logged_during_simulation():
    plan = factory.SeedingPlan(aptitude_pool=16, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="Econ", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        await advance_world(s, world, ticks=10)   # tick 10 triggers a snapshot
    async with session_scope() as s:
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "economy:prices")
        )).scalars().first()
        assert ev is not None
        assert ev.payload["price_index"] > 0 and ev.payload["dearest"]


def test_economy_route(client, headers):
    body = client.get("/substrate/economy?cpc_class=A01B&population=200", headers=headers).json()
    assert body["price_index"] > 0
    assert "iron_ore" in body["market"] and body["market"]["iron_ore"]["price"] > 0
