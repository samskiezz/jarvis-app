"""Not-done phase, batch 10 — trainable ML models (#58)."""

from __future__ import annotations

import random

import pytest
from sqlalchemy import select

from underworld.server.db.models import MLModel, Minion, World
from underworld.server.db.session import session_scope
from underworld.server.services import factory, mlmodels


def test_accuracy_climbs_with_samples_toward_skill_ceiling():
    a_few = mlmodels.accuracy_for(20, skill_level=8.0)
    many = mlmodels.accuracy_for(2000, skill_level=8.0)
    assert mlmodels.FLOOR <= a_few < many <= mlmodels.ceiling_for_skill(8.0) + 1e-6
    # a weak engineer can never match a master's ceiling
    assert mlmodels.ceiling_for_skill(2.0) < mlmodels.ceiling_for_skill(9.0)


def test_classify_matches_accuracy_roughly():
    model = MLModel(minion_id="x", task="t", samples=10_000, accuracy=0.8)
    rng = random.Random(0)
    hits = sum(mlmodels.classify(model, rng) for _ in range(2000))
    assert 0.74 < hits / 2000 < 0.86   # empirical accuracy ≈ stated accuracy


@pytest.mark.asyncio
async def test_training_persists_and_extends():
    plan = factory.SeedingPlan(aptitude_pool=12, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="ML", cpc_class="G06F", plan=plan)
    async with session_scope() as s:
        m = (await s.execute(select(Minion).where(Minion.world_id == world.id))).scalars().first()
        await mlmodels.train(s, m.id, "image_rec", new_samples=100, skill_level=6.0, tick=1)
        model = await mlmodels.train(s, m.id, "image_rec", new_samples=400, skill_level=6.0, tick=2)
        assert model.samples == 500              # samples accumulate across sessions
        first = mlmodels.accuracy_for(100, 6.0)
        assert model.accuracy > first            # more data → better model


def test_train_model_route(client, headers):
    created = client.post("/worlds", headers=headers,
                          json={"name": "MLAPI", "cpc_class": "G06F", "aptitude_pool": 12,
                                "patent_guild_seats": 2, "safety_guild_seats": 2}).json()
    wid = created["id"]
    mid = client.get(f"/worlds/{wid}/minions", headers=headers).json()[0]["id"]
    trained = client.post(f"/minions/{mid}/train-model", headers=headers,
                          json={"task": "sorter", "samples": 500}).json()
    assert trained["task"] == "sorter" and trained["accuracy"] > mlmodels.FLOOR
    listed = client.get(f"/minions/{mid}/models", headers=headers).json()
    assert any(m["task"] == "sorter" for m in listed)
