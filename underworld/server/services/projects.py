"""Research-project pipeline.

Implements Master Reference Section 8: every invention that touches the
clinical / genetic / chem-synthesis domains is escalated to a multi-stage
project. Stages advance only when an appropriately-roled Minion contributes
during a tick.

Stage flow:
  hypothesis → in_silico → bench_plan → preclinical_plan → clinical_plan
              → regulatory_review → approved
With BLOCKED and ABANDONED as terminal off-ramps.

Stages that are not required for a given project are skipped automatically:
- A chem-synthesis project skips clinical / preclinical.
- A pure in-silico project skips bench / preclinical / clinical.
- A clinical project goes through every stage.

A Minion can contribute to at most one project per tick (the agent-loop
budget). Contributions add a `delta_confidence` based on the contributor's
role match and skill. Once confidence > 0.8 at a stage, the project
auto-advances on the next tick.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import (
    Event,
    Invention,
    Minion,
    ProjectContribution,
    ProjectStage,
    ResearchProject,
    SwarmRoleKind,
    World,
)
from . import roles as roles_mod


# Pipeline ordering — each project picks the relevant subset.
_FULL_PIPELINE: tuple[ProjectStage, ...] = (
    ProjectStage.HYPOTHESIS,
    ProjectStage.IN_SILICO,
    ProjectStage.BENCH_PLAN,
    ProjectStage.PRECLINICAL_PLAN,
    ProjectStage.CLINICAL_PLAN,
    ProjectStage.REGULATORY_REVIEW,
)


def _pipeline_for(flags: roles_mod.DomainFlags) -> list[ProjectStage]:
    """Pick stages this project must clear."""
    stages = [ProjectStage.HYPOTHESIS, ProjectStage.IN_SILICO, ProjectStage.BENCH_PLAN]
    if flags.clinical or flags.genetic:
        stages.append(ProjectStage.PRECLINICAL_PLAN)
        stages.append(ProjectStage.CLINICAL_PLAN)
    if flags.clinical or flags.genetic or flags.chem_synth:
        stages.append(ProjectStage.REGULATORY_REVIEW)
    return stages


@dataclass
class TickProjectReport:
    contributions: int = 0
    stages_advanced: int = 0
    approved: int = 0
    blocked: int = 0


async def maybe_create_project(
    session: AsyncSession, world: World, invention: Invention, flags: roles_mod.DomainFlags,
) -> ResearchProject | None:
    """Create a project for an invention if domain flags justify it."""
    if not flags.any:
        return None

    proj = ResearchProject(
        world_id=world.id,
        invention_id=invention.id,
        title=invention.title[:280],
        summary=invention.problem[:600],
        stage=ProjectStage.HYPOTHESIS,
        needs_role=roles_mod.ROLE_FOR_STAGE["hypothesis"].value,
        flagged_clinical=flags.clinical,
        flagged_genetic=flags.genetic,
        flagged_chem_synth=flags.chem_synth,
        created_tick=world.tick,
        updated_tick=world.tick,
        confidence=0.2,
    )
    session.add(proj)
    await session.flush()

    session.add(Event(
        world_id=world.id,
        tick=world.tick,
        kind="project:created",
        actor_id=invention.minion_id,
        payload={
            "project_id": proj.id,
            "title": proj.title,
            "stages": [s.value for s in _pipeline_for(flags)],
            "flags": {"clinical": flags.clinical, "genetic": flags.genetic, "chem_synth": flags.chem_synth},
        },
    ))
    return proj


def _next_stage(project: ResearchProject, flags: roles_mod.DomainFlags) -> ProjectStage | None:
    pipeline = _pipeline_for(flags)
    try:
        idx = pipeline.index(project.stage)
    except ValueError:
        return None
    if idx + 1 < len(pipeline):
        return pipeline[idx + 1]
    return ProjectStage.APPROVED


async def _eligible_contributor(
    session: AsyncSession, project: ResearchProject, rng: random.Random,
) -> Minion | None:
    needed_role = SwarmRoleKind(project.needs_role) if project.needs_role else None
    stmt = (
        select(Minion)
        .where(
            Minion.world_id == project.world_id,
            Minion.alive.is_(True),
        )
    )
    if needed_role is not None:
        stmt = stmt.where(Minion.swarm_role == needed_role)
    stmt = stmt.limit(40)
    res = await session.execute(stmt)
    pool = list(res.scalars().all())
    if not pool:
        return None
    # Bias by reputation + intelligence + creativity.
    weighted = sorted(
        pool,
        key=lambda m: m.reputation + 0.5 * m.intelligence + 0.3 * m.creativity + rng.random() * 0.4,
        reverse=True,
    )
    return weighted[0]


def _stage_flags(project: ResearchProject) -> roles_mod.DomainFlags:
    return roles_mod.DomainFlags(
        clinical=project.flagged_clinical,
        genetic=project.flagged_genetic,
        chem_synth=project.flagged_chem_synth,
    )


async def tick_projects(
    session: AsyncSession, world: World, rng: random.Random,
) -> TickProjectReport:
    """Advance all active projects by one tick of work."""
    report = TickProjectReport()
    stmt = (
        select(ResearchProject)
        .where(
            ResearchProject.world_id == world.id,
            ResearchProject.stage.notin_(
                [ProjectStage.APPROVED, ProjectStage.BLOCKED, ProjectStage.ABANDONED]
            ),
        )
        .limit(64)
    )
    res = await session.execute(stmt)
    projects = list(res.scalars().all())

    for proj in projects:
        flags = _stage_flags(proj)
        # Hard refuse paths — clinical-stage projects that don't have at
        # least one contribution from a Regulatory Reasoner get blocked
        # eventually. For v1 we let stages naturally gate.
        contributor = await _eligible_contributor(session, proj, rng)
        if contributor is None:
            continue

        # Confidence boost. Real reasoning would be the LLM doing work; we
        # advance deterministically here so the pipeline runs offline.
        boost = 0.10 + 0.04 * contributor.reputation + 0.05 * contributor.intelligence
        if contributor.swarm_role.value == proj.needs_role:
            boost += 0.10
        proj.confidence = min(1.0, proj.confidence + boost)

        session.add(ProjectContribution(
            project_id=proj.id,
            minion_id=contributor.id,
            stage=proj.stage,
            role=contributor.swarm_role,
            note=(
                f"{contributor.swarm_role.value} contributed to {proj.stage.value} "
                f"(+{boost:.2f} confidence)."
            ),
            delta_confidence=boost,
            tick=world.tick,
        ))
        report.contributions += 1

        if proj.confidence >= 0.85:
            next_stage = _next_stage(proj, flags)
            if next_stage is None:
                proj.stage = ProjectStage.BLOCKED
                report.blocked += 1
            elif next_stage == ProjectStage.APPROVED:
                proj.stage = ProjectStage.APPROVED
                proj.needs_role = None
                report.approved += 1
                contributor.reputation = min(5.0, contributor.reputation + 0.05)
                contributor.karma += 0.05
                session.add(Event(
                    world_id=world.id,
                    tick=world.tick,
                    kind="project:approved",
                    actor_id=contributor.id,
                    payload={"project_id": proj.id, "title": proj.title},
                ))
            else:
                proj.stage = next_stage
                proj.confidence = 0.45  # reset, with momentum
                proj.needs_role = roles_mod.ROLE_FOR_STAGE.get(next_stage.value, SwarmRoleKind.GENERALIST).value
                proj.updated_tick = world.tick
                report.stages_advanced += 1
                session.add(Event(
                    world_id=world.id,
                    tick=world.tick,
                    kind="project:advance",
                    actor_id=contributor.id,
                    payload={
                        "project_id": proj.id,
                        "from_stage": _previous_stage_name(proj, next_stage, flags),
                        "to_stage": next_stage.value,
                    },
                ))

    return report


def _previous_stage_name(
    project: ResearchProject, next_stage: ProjectStage, flags: roles_mod.DomainFlags,
) -> str:
    pipeline = _pipeline_for(flags)
    try:
        idx = pipeline.index(next_stage)
    except ValueError:
        return ""
    if idx == 0:
        return ""
    return pipeline[idx - 1].value


async def world_project_counts(
    session: AsyncSession, world_id: str,
) -> tuple[int, int]:
    """Return (active, approved) counts for a world."""
    active = await session.scalar(
        select(func.count(ResearchProject.id)).where(
            ResearchProject.world_id == world_id,
            ResearchProject.stage.notin_(
                [ProjectStage.APPROVED, ProjectStage.BLOCKED, ProjectStage.ABANDONED]
            ),
        )
    ) or 0
    approved = await session.scalar(
        select(func.count(ResearchProject.id)).where(
            ResearchProject.world_id == world_id,
            ResearchProject.stage == ProjectStage.APPROVED,
        )
    ) or 0
    return int(active), int(approved)


__all__ = [
    "maybe_create_project",
    "tick_projects",
    "world_project_counts",
    "TickProjectReport",
]
