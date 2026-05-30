"""Batch 7 partials → done:

#61  structured skill tree — hundreds of nodes with real prerequisite chains
#45  education institutions — tiered passive learning for the young
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from underworld.server.db.models import Event, Minion, Skill, World
from underworld.server.db.session import session_scope
from underworld.server.knowledge import skill_tree as st
from underworld.server.services import education, factory


# ── #61 skill tree ───────────────────────────────────────────────────────────
def test_skill_tree_is_a_large_valid_dag():
    assert st.stats()["nodes"] >= 200
    for node in st.SKILL_TREE.values():
        for p in node.prerequisites:
            assert p in st.SKILL_TREE          # every prereq is a real node
            assert st.SKILL_TREE[p].level == node.level - 1  # and exactly one tier below


def test_prerequisites_gate_progression():
    frontier = "physics:optics:3"
    assert st.get_node(frontier).level == 3
    assert not st.prerequisites_satisfied(frontier, owned=set())
    # owning the advanced node unlocks the frontier node
    owned = {"physics:optics:2"}
    assert st.prerequisites_satisfied(frontier, owned)
    assert frontier in st.unlockable(owned | {"physics:optics:0", "physics:optics:1"})


def test_skill_tree_route(client, headers):
    body = client.get("/knowledge/skill-tree", headers=headers).json()
    assert body["stats"]["nodes"] >= 200
    only = client.get("/knowledge/skill-tree?domain=physics", headers=headers).json()
    assert only["nodes"] and all(n["domain"] == "physics" for n in only["nodes"])


# ── #45 education ─────────────────────────────────────────────────────────────
def test_education_tier_thresholds():
    assert education.education_tier(0, 0)[0] == "apprenticeship"
    assert education.education_tier(60, 0)[0] == "school"
    assert education.education_tier(200, 0)[0] == "academy"
    assert education.education_tier(0, 12)[0] == "university"
    # higher tiers grant a higher passive rate
    assert education.education_tier(500, 20)[1] > education.education_tier(60, 0)[1]


@pytest.mark.asyncio
async def test_school_boosts_the_young():
    plan = factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=2, safety_guild_seats=2)
    async with session_scope() as s:
        world = await factory.create_world(s, name="School", cpc_class="H02J", plan=plan)
    async with session_scope() as s:
        world = await s.get(World, world.id)
        # push the world to at least "school" tier via a couple of masters
        masters = (await s.execute(
            select(Minion).where(Minion.world_id == world.id).limit(2)
        )).scalars().all()
        for mm in masters:
            s.add(Skill(minion_id=mm.id, name="bootstrap", level=7.0))
        # a fresh young student
        young = (await s.execute(
            select(Minion).where(Minion.world_id == world.id)
        )).scalars().first()
        young.born_tick = world.tick      # age 0 → a student
        before = Skill(minion_id=young.id, name=young.guild.value, level=1.0,
                       last_practiced_tick=0)
        s.add(before)
        await s.flush()

        taught = await education.apply_education(s, world)
        assert taught >= 1
        after = (await s.execute(
            select(Skill).where(Skill.minion_id == young.id, Skill.name == young.guild.value)
        )).scalars().first()
        assert after.level > 1.0          # the school lifted the student
        ev = (await s.execute(
            select(Event).where(Event.world_id == world.id, Event.kind == "education:cohort")
        )).scalars().first()
        assert ev is not None and ev.payload["students"] >= 1
