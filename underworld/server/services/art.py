"""Art, music & literature with stylistic evolution (doc I.47).

Minions create creative works whose available *forms* unlock with the era (cave
paintings in the stone age; novels need writing; film needs the information age),
and whose *style* evolves era to era — so a world's cultural corpus shows genuine
stylistic progression rather than a fixed catalogue. Acclaim reflects the creator's
creativity and standing.
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Artwork, Event, Minion, World

# forms unlocked at each era (cumulative)
_FORMS_BY_ERA = {
    "stone": ("cave_painting", "carving", "chant"),
    "bronze": ("sculpture", "poem", "fresco"),
    "iron": ("epic", "mosaic"),
    "industrial": ("novel", "symphony", "oil_painting"),
    "electric": ("photograph", "film"),
    "information": ("digital_art", "game"),
    "quantum": ("holographic_opera",),
}
_ERA_ORDER = ("stone", "bronze", "iron", "industrial", "electric", "information", "quantum")

# the dominant style of each era — the axis stylistic evolution runs along
_STYLE_BY_ERA = {
    "stone": "primal", "bronze": "classical", "iron": "heroic",
    "industrial": "romantic", "electric": "modernist", "information": "postmodern",
    "quantum": "synthetic",
}
_TITLES = ("Dawn", "The Hunt", "Echoes", "Ascension", "The Long Year", "Reverie",
           "Origin", "The Square in the Sky", "Hunger", "Bloom", "Static", "Homecoming")


def forms_for_era(era: str) -> list[str]:
    out: list[str] = []
    for e in _ERA_ORDER:
        out.extend(_FORMS_BY_ERA.get(e, ()))
        if e == era:
            break
    return out


def style_for_era(era: str) -> str:
    return _STYLE_BY_ERA.get(era, "primal")


async def create(session: AsyncSession, world: World, minion: Minion, rng: random.Random) -> Artwork:
    forms = forms_for_era(world.era) or ["cave_painting"]
    form = rng.choice(forms)
    acclaim = round(min(1.0, 0.4 * minion.creativity + 0.4 * (minion.reputation / 5.0) + rng.random() * 0.3), 3)
    art = Artwork(
        world_id=world.id, minion_id=minion.id, form=form,
        style=style_for_era(world.era), title=rng.choice(_TITLES), acclaim=acclaim,
        tick=world.tick,
    )
    session.add(art)
    minion.reputation = min(5.0, minion.reputation + 0.02 * acclaim)
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="art:created", actor_id=minion.id,
        payload={"form": form, "style": art.style, "title": art.title, "acclaim": acclaim},
    ))
    return art


async def tick_art(session: AsyncSession, world: World, rng: random.Random) -> Artwork | None:
    """A creative, content Minion occasionally makes something."""
    maker = (await session.execute(
        select(Minion).where(
            Minion.world_id == world.id, Minion.alive.is_(True), Minion.creativity > 0.6,
        ).order_by(Minion.creativity.desc()).limit(1)
    )).scalars().first()
    if maker is None or rng.random() > 0.5:
        return None
    return await create(session, world, maker, rng)
