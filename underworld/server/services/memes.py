"""Memetics — fads, fashion, and ideas that replicate and evolve (doc I.142-143).

A meme is a unit of culture. Each tick the living "carry" memes: popular ones
spread faster (proportional to current popularity and the population's
extraversion), all of them decay (fashions fade), the weakest die out, and a
thriving meme occasionally mutates into a variant — Dawkinsian replication with
variation and selection. New memes are also seeded from the civilization's own
output (an approved invention or a fresh discovery becomes a talking point).
"""

from __future__ import annotations

import random

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Event, Meme, Minion, World

SPREAD = 0.6        # how fast a popular meme recruits new carriers
DECAY = 0.08        # baseline fashion fade per tick
MUTATE_P = 0.15     # chance a thriving meme spawns a variant
CULL_BELOW = 0.02   # memes this unpopular die out

_SLANG = ("grok", "spark", "the long-think", "skyward", "deepcurrent", "the hum",
          "brightwork", "old-ways", "the leap", "quietmind")


async def seed_meme(session: AsyncSession, world: World, name: str, kind: str = "idea",
                    *, popularity: float = 0.08, variant_of: str | None = None,
                    generation: int = 0) -> Meme:
    m = Meme(world_id=world.id, name=name[:60], kind=kind, popularity=popularity,
             variant_of=variant_of, generation=generation, born_tick=world.tick, alive=True)
    session.add(m)
    return m


async def tick_memes(session: AsyncSession, world: World, rng: random.Random) -> dict:
    """Advance the world's memetic ecology one tick. Returns a small summary."""
    avg_extra = float(await session.scalar(
        select(func.avg(Minion.extraversion)).where(
            Minion.world_id == world.id, Minion.alive.is_(True))
    ) or 0.5)

    memes = list((await session.execute(
        select(Meme).where(Meme.world_id == world.id, Meme.alive.is_(True))
    )).scalars().all())

    # Occasionally a brand-new meme appears out of idle social chatter.
    if rng.random() < 0.3:
        await seed_meme(session, world, rng.choice(_SLANG), kind="slang",
                        popularity=0.05 + 0.05 * rng.random())

    mutated = 0
    for m in memes:
        # logistic recruitment vs a flat fashion-fade. Below a critical mass the
        # fade wins and the meme dies; above it the meme catches on.
        growth = SPREAD * m.popularity * (1.0 - m.popularity) * (0.3 + avg_extra)
        m.popularity = max(0.0, min(1.0, m.popularity + growth - DECAY))
        if m.popularity < CULL_BELOW:
            m.alive = False
            continue
        # a thriving meme mutates into a competing variant (evolution)
        if m.popularity > 0.4 and rng.random() < MUTATE_P:
            await seed_meme(
                session, world, f"{m.name}+", kind=m.kind,
                popularity=m.popularity * 0.4, variant_of=m.id, generation=m.generation + 1,
            )
            m.popularity *= 0.8   # the variant siphons carriers
            mutated += 1

    alive = [m for m in memes if m.alive]
    dominant = max(alive, key=lambda x: x.popularity, default=None)
    if dominant and world.tick % 10 == 0:
        session.add(Event(
            world_id=world.id, tick=world.tick, kind="culture:fashion", actor_id=None,
            payload={"dominant": dominant.name, "popularity": round(dominant.popularity, 3),
                     "alive_memes": len(alive), "mutations": mutated},
        ))
    return {"alive": len(alive), "mutated": mutated,
            "dominant": dominant.name if dominant else None}
