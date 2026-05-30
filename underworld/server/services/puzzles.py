"""Empty-dataset research puzzles (doc I.82-85).

The app generates "empty data sets" — open questions mirroring real unsolved
problems. A Minion fills the gap by combining several *expired patents* in a novel
way (doc I.84). A solved gap produces an in-world patent (an Invention) and the app
drafts a suggested real-world patent application (doc I.85).
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import EmptyDataset, Event, Invention, Minion, Patent, TaskStatus, World

# Open-question templates per discipline (the "unresolved questions").
_GAPS: dict[str, tuple[str, ...]] = {
    "energy": (
        "Store grid-scale energy for a week with no rare earths.",
        "Double photovoltaic efficiency using only abundant materials.",
    ),
    "materials": (
        "A room-temperature, low-cost superconductor for power lines.",
        "A fully recyclable structural composite stronger than steel.",
    ),
    "computing": (
        "Error-correct a noisy channel at near-Shannon limit cheaply.",
        "Train a useful classifier from a hundred labelled samples.",
    ),
    "mechanical": (
        "A passive heat pump with no moving parts for cold climates.",
        "A bridge span doubling reach with the same material budget.",
    ),
    "physics": (
        "Measure a tiny displacement below the standard quantum limit.",
        "Guide light around a sharp corner with negligible loss.",
    ),
}
_DISCIPLINES = tuple(_GAPS.keys())


async def open_gaps(session: AsyncSession, world_id: str) -> list[EmptyDataset]:
    return list((await session.execute(
        select(EmptyDataset).where(
            EmptyDataset.world_id == world_id, EmptyDataset.solved.is_(False))
    )).scalars().all())


async def generate(session: AsyncSession, world: World, rng: random.Random) -> EmptyDataset:
    discipline = rng.choice(_DISCIPLINES)
    prompt = rng.choice(_GAPS[discipline])
    gap = EmptyDataset(
        world_id=world.id, discipline=discipline, prompt=prompt,
        required_patents=rng.choice((2, 2, 3)), created_tick=world.tick,
    )
    session.add(gap)
    await session.flush()
    return gap


def _draft(gap: EmptyDataset, patents: list[Patent], inventor: Minion) -> dict:
    """Doc I.85 — a suggested real-world patent-application draft."""
    cited = [p.id for p in patents]
    return {
        "title": f"Method addressing: {gap.prompt[:80]}",
        "abstract": (
            f"A {gap.discipline} approach to the problem '{gap.prompt}', synthesised by "
            f"combining the teachings of {len(patents)} expired patents "
            f"({', '.join(cited)}) in a novel configuration."
        ),
        "claims": [
            f"1. A system for {gap.prompt.rstrip('.').lower()}.",
            f"2. The system of claim 1, integrating prior art {cited[0] if cited else 'N/A'}.",
            "3. The system of claim 1, wherein the combination yields a non-obvious improvement.",
        ],
        "inventor": f"{inventor.name} {inventor.surname}".strip(),
        "cited_prior_art": cited,
    }


async def solve(
    session: AsyncSession, minion: Minion, gap: EmptyDataset, patent_ids: list[str],
) -> dict:
    """Attempt to solve a gap by combining expired patents.

    Returns {"solved": bool, "reason"/"patent_draft"/"invention_id"}.
    """
    if gap.solved:
        return {"solved": False, "reason": "Already solved."}
    patents = list((await session.execute(
        select(Patent).where(Patent.id.in_(patent_ids))
    )).scalars().all())
    expired = [p for p in patents if p.expired]
    if len(expired) < gap.required_patents:
        return {"solved": False,
                "reason": f"Needs ≥{gap.required_patents} expired patents combined; got {len(expired)}."}

    inv = Invention(
        world_id=gap.world_id, minion_id=minion.id, tick=gap.created_tick,
        title=f"Solution: {gap.prompt[:120]}", problem=gap.prompt,
        hypothesis="Synthesis of expired prior art into a novel combination.",
        related_patents=[p.id for p in expired], feasibility_score=0.7,
        status=TaskStatus.NEEDS_PEER_REVIEW,
        inputs={"guild": minion.guild.value, "from_gap": gap.id},
    )
    session.add(inv)
    await session.flush()

    draft = _draft(gap, expired, minion)
    gap.solved = True
    gap.solved_by = minion.id
    gap.solution_invention_id = inv.id
    gap.patent_draft = draft
    minion.reputation = min(5.0, minion.reputation + 0.1)
    session.add(Event(
        world_id=gap.world_id, tick=gap.created_tick, kind="gateway:solved", actor_id=minion.id,
        payload={"gap": gap.id, "discipline": gap.discipline, "invention": inv.id,
                 "patents_combined": len(expired)},
    ))
    return {"solved": True, "invention_id": inv.id, "patent_draft": draft}
