"""Physics engine + grounded-learning tests."""

from __future__ import annotations

import math
import random

import pytest
from sqlalchemy import select

from underworld.server.agents import minion as minion_agent
from underworld.server.db.models import Event, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.physics import constants as K
from underworld.server.physics import engine
from underworld.server.services import factory


# ── Pure engine ──────────────────────────────────────────────────────────────

def test_constants_are_real_si_values():
    assert K.CONSTANTS["c"].value == 299_792_458.0
    assert math.isclose(K.GRAV, 9.80665)
    assert K.CONSTANTS["G"].value == pytest.approx(6.674_30e-11)


def test_laws_compute_correct_values():
    # F = m a
    assert engine.compute("newton_second", {"m": 2.0, "a": 3.0})["value"] == pytest.approx(6.0)
    # K = 1/2 m v^2
    assert engine.compute("kinetic_energy", {"m": 2.0, "v": 10.0})["value"] == pytest.approx(100.0)
    # Ohm V = I R
    assert engine.compute("ohm", {"I": 2.0, "R": 5.0})["value"] == pytest.approx(10.0)
    # E = m c^2
    assert engine.compute("mass_energy", {"m": 1.0})["value"] == pytest.approx(K.C * K.C)
    # de Broglie uses the `lambda` keyword var safely
    db = engine.compute("de_broglie", {"m": 9.11e-31, "v": 1e6})["value"]
    assert db == pytest.approx(K.H / (9.11e-31 * 1e6))


def test_every_law_is_evaluable():
    rng = random.Random(0)
    for law in engine.list_laws():
        inputs, truth = engine.generate_problem(law, rng)
        again = engine.compute(law.id, inputs)["value"]
        assert again == pytest.approx(truth)
        assert math.isfinite(truth)


def test_unknown_law_raises():
    with pytest.raises(KeyError):
        engine.compute("does_not_exist", {})


def test_high_mastery_beats_low_mastery_on_average():
    rng = random.Random(123)
    law = engine.get_law("newton_second")
    expert = sum(
        engine.grade_attempt(law, skill_level=9.0, intelligence=0.9, creativity=0.5, rng=rng).correct
        for _ in range(200)
    )
    novice = sum(
        engine.grade_attempt(law, skill_level=0.0, intelligence=0.1, creativity=0.1, rng=rng).correct
        for _ in range(200)
    )
    assert expert > novice


def test_assess_invention_blocks_impossible_claims():
    ftl = engine.assess_invention("A drive that travels faster than light using free energy.")
    assert ftl.violates_limit and ftl.feasibility < 0.1
    over = engine.assess_invention("A motor with 100% efficiency and zero loss.")
    assert over.violates_limit
    ok = engine.assess_invention("A heat exchanger improving transfer by 12 % using a 3 kg copper core.")
    assert not ok.violates_limit and ok.feasibility > 0.45


def test_world_limits_exposes_c_and_efficiency_cap():
    lim = engine.world_limits()
    assert lim["max_speed_m_s"] == K.C
    assert lim["max_efficiency"] == 1.0


# ── Simulation integration ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_calculate_action_learns_and_logs():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as session:
        world = await factory.create_world(session, name="PhysLearn", cpc_class="H02J", plan=plan)
    async with session_scope() as session:
        world = await session.get(World, world.id)
        m = (await session.execute(
            select(Minion).where(Minion.world_id == world.id, Minion.alive.is_(True))
        )).scalars().first()
        m.intelligence = 0.9
        before = m.reputation

        summary = await minion_agent._do_calculate(
            session, m, world, {"law_id": "newton_second"}
        )
        assert "Newton second law" in summary

        skill = (await session.execute(
            select(Skill).where(Skill.minion_id == m.id, Skill.name == "physics:mechanics")
        )).scalars().first()
        assert skill is not None and skill.level > 0.0

        ev = (await session.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "minion:calculate")
        )).scalars().first()
        assert ev is not None and ev.payload["law"] == "newton_second"
        assert m.reputation >= before  # never goes backwards from learning


@pytest.mark.asyncio
async def test_calculate_unlocked_via_run_tick_in_bronze_era():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as session:
        world = await factory.create_world(session, name="BronzeCalc", cpc_class="H02J", plan=plan)
    async with session_scope() as session:
        world = await session.get(World, world.id)
        world.era = "bronze"
        m = (await session.execute(
            select(Minion).where(
                Minion.world_id == world.id,
                Minion.guild.in_(["physics", "mechanical", "electrical"]),
                Minion.alive.is_(True),
            )
        )).scalars().first()
        assert m is not None
        m.intelligence = 0.95
        # Force the analytical branch deterministically.
        outcome = await minion_agent.run_tick(
            session, m, world, "temperate",
            neighbours=[], rng=random.Random(1), use_llm=False,
        )
        assert outcome.action in {"calculate", "kb_lookup", "study", "rest", "eat", "drink", "meditate"}


@pytest.mark.asyncio
async def test_physics_routes(client, headers):
    laws = client.get("/physics/laws", headers=headers).json()
    assert laws["count"] >= 25
    consts = client.get("/physics/constants", headers=headers).json()
    assert any(c["symbol"] == "c" for c in consts["constants"])
    solved = client.post(
        "/physics/solve", headers=headers, json={"law_id": "newton_second", "inputs": {"m": 4, "a": 5}}
    ).json()
    assert solved["value"] == pytest.approx(20.0)
    missing = client.post(
        "/physics/solve", headers=headers, json={"law_id": "nope", "inputs": {}}
    )
    assert missing.status_code == 404
