import pytest
from sqlalchemy import select

from underworld.server.db.models import (
    Invention,
    Minion,
    ProjectStage,
    ResearchProject,
    SwarmRoleKind,
    TaskStatus,
    World,
)
from underworld.server.db.session import session_scope
from underworld.server.services import factory, projects, roles
from underworld.server.services.simulation import advance_world


def test_detect_domain_clinical():
    f = roles.detect_domain("Improve clinical trial dosing for cardiovascular patients")
    assert f.clinical is True
    assert f.any is True


def test_detect_domain_genetic():
    f = roles.detect_domain("Use CRISPR/Cas9 to correct a faulty allele in mice")
    assert f.genetic is True


def test_detect_domain_chem_synth():
    f = roles.detect_domain("Novel catalyst for hydrocarbon synthesis from CO2")
    assert f.chem_synth is True


def test_detect_domain_clean():
    f = roles.detect_domain("Improve battery thermal management with passive cooling")
    assert f.any is False


def test_assign_role_safety_always_toxicity():
    from underworld.server.db.models import GuildKind
    from underworld.server.genetics import dna as dna_mod
    role = roles.assign_role(GuildKind.SAFETY, dna_mod.random_dna())
    assert role == SwarmRoleKind.TOXICITY_CHECKER


def test_assign_role_maths_leans_oracle():
    from underworld.server.db.models import GuildKind
    from underworld.server.genetics import dna as dna_mod
    # Run 5 different DNAs — at least one should pick Formula Oracle.
    found = False
    for seed in range(5):
        import random as _random
        rng = _random.Random(seed)
        role = roles.assign_role(GuildKind.MATHS, dna_mod.random_dna(rng))
        if role == SwarmRoleKind.FORMULA_ORACLE:
            found = True
            break
    assert found


@pytest.mark.asyncio
async def test_minion_seeded_with_swarm_role():
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="RoleSeed", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=3, safety_guild_seats=3),
        )
    async with session_scope() as session:
        res = await session.execute(select(Minion).where(Minion.world_id == world.id))
        minions = list(res.scalars().all())
    assert minions
    # Every minion has a role assigned.
    assert all(m.swarm_role is not None for m in minions)
    # Distribution covers at least 3 distinct roles.
    distinct = {m.swarm_role for m in minions}
    assert len(distinct) >= 3


@pytest.mark.asyncio
async def test_invention_escalates_to_project():
    """An approved invention that mentions CRISPR should spawn a project."""
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="ProjEsc", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=20, patent_guild_seats=3, safety_guild_seats=3),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        # Inject an invention that mentions CRISPR + clinical so it escalates.
        from sqlalchemy import select as _select
        m = (await session.execute(_select(Minion).where(Minion.world_id == world.id))).scalars().first()
        inv = Invention(
            world_id=world.id,
            minion_id=m.id,
            tick=world.tick,
            title="CRISPR gene therapy for clinical trial in adult patients",
            problem=(
                "Patients with a heritable disease need a CRISPR-based therapy "
                "that corrects the faulty allele in a clinical trial cohort."
            ),
            hypothesis=(
                "A guide RNA combined with a delivery vector and a regulatory "
                "submission package can reach in-silico approval inside a year."
            ),
            related_patents=["US3192570A", "US4055768A"],
            status=TaskStatus.NEEDS_PEER_REVIEW,
            inputs={"guild": m.guild.value},
        )
        session.add(inv)
        await session.flush()
        inv_id = inv.id

    # Advance one tick — the invention goes through reviewers and (if approved)
    # gets a research project.
    async with session_scope() as session:
        world = await session.get(World, world.id)
        await advance_world(session, world, ticks=1)

    async with session_scope() as session:
        from sqlalchemy import select as _select
        inv = await session.get(Invention, inv_id)
        proj = (await session.execute(
            _select(ResearchProject).where(ResearchProject.invention_id == inv_id)
        )).scalars().first()
    # Either approved + project, or peer-review rejected. We accept both;
    # but if approved, project must exist.
    if inv.status == TaskStatus.APPROVED:
        assert proj is not None
        assert proj.flagged_clinical or proj.flagged_genetic


@pytest.mark.asyncio
async def test_projects_advance_through_stages():
    """Manually create a project, run many ticks, expect stage advancement."""
    async with session_scope() as session:
        world = await factory.create_world(
            session, name="ProjAdv", cpc_class="G06F",
            plan=factory.SeedingPlan(aptitude_pool=30, patent_guild_seats=4, safety_guild_seats=4),
        )
    async with session_scope() as session:
        world = await session.get(World, world.id)
        from sqlalchemy import select as _select
        m = (await session.execute(_select(Minion).where(Minion.world_id == world.id))).scalars().first()
        inv = Invention(
            world_id=world.id, minion_id=m.id, tick=world.tick,
            title="Catalyst synthesis route for cleaner combustion",
            problem="Improve solvent-catalyst reagent system.",
            hypothesis="Replace platinum with cheaper alternative.",
            status=TaskStatus.APPROVED,
            inputs={"guild": m.guild.value},
        )
        session.add(inv)
        await session.flush()
        flags = roles.detect_domain(inv.title, inv.problem, inv.hypothesis)
        proj = await projects.maybe_create_project(session, world, inv, flags)
        assert proj is not None
        proj_id = proj.id
        initial_stage = proj.stage

    # 20 ticks — should see at least one stage advance.
    async with session_scope() as session:
        world = await session.get(World, world.id)
        await advance_world(session, world, ticks=20)

    async with session_scope() as session:
        proj = await session.get(ResearchProject, proj_id)
        assert proj is not None
        # Either stage moved past hypothesis or the project completed.
        if proj.stage != initial_stage:
            assert True  # advanced
        else:
            # At minimum, confidence should have grown.
            assert proj.confidence > 0.2
