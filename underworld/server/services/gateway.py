"""The Internet Gateway (doc I.75-85).

Once a world reaches "peak information" — it has writing + mathematics and a deep
body of accumulated knowledge — a portal in the sky opens. It is guarded by a
test of comprehension: only a Minion who has *mastered* the corresponding field
may pass (doc I.77). Passing grants read-only access to the real world's
scientific record (fetched live from Crossref, with an offline fallback), which is
converted into an in-world dataset the Minion studies. The mirror is strictly
one-way — the simulation can read the real internet but never writes to it
(doc I.80).
"""

from __future__ import annotations

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Discovery, Event, Memory, Minion, Skill, World
from ..knowledge import skill_tree
from . import discovery as discovery_mod
from . import mastery

PEAK_KNOWLEDGE = 200.0
PEAK_DISCOVERIES = ("writing", "mathematics")
CROSSREF_URL = "https://api.crossref.org/works"

# A small offline mirror so the gateway works without network access.
_OFFLINE = {
    "_default": [
        {"title": "On the dynamics of coupled oscillators", "year": 2011, "doi": "10.0/osc"},
        {"title": "A survey of error-correcting codes", "year": 2008, "doi": "10.0/ecc"},
        {"title": "Thermodynamic limits of computation", "year": 2015, "doi": "10.0/tdc"},
    ],
}


async def world_gateway_open(session: AsyncSession, world: World) -> bool:
    """Doc I.74-75 — peak information: enough knowledge + the key discoveries."""
    knowledge, _m = await mastery.world_knowledge(session, world.id)
    if knowledge < PEAK_KNOWLEDGE:
        return False
    have = await discovery_mod.discovered_set(session, world.id)
    return all(d in have for d in PEAK_DISCOVERIES)


async def mastered_domains(session: AsyncSession, minion_id: str) -> set[str]:
    """The skill-tree domains in which this Minion holds a mastered skill."""
    domains: set[str] = set()
    for skill_name in await mastery.list_masteries(session, minion_id):
        d = skill_tree.domain_of(skill_name)
        if d:
            domains.add(d)
    return domains


async def can_pass(session: AsyncSession, minion: Minion, discipline: str) -> bool:
    """Doc I.77 — only a master of the corresponding field passes its gateway."""
    disc = (discipline or "").strip().lower()
    domains = await mastered_domains(session, minion.id)
    if disc in domains:
        return True
    # fall back: the minion's guild domain counts if they hold any mastery there
    return bool(domains) and (disc == minion.guild.value or disc in {"", "any"})


async def fetch_dataset(query: str, *, rows: int = 5) -> dict:
    """Read-only fetch of the real scientific record (Crossref) → in-world dataset.
    Falls back to an offline mirror when the network is unavailable."""
    q = (query or "science").strip()
    items: list[dict] = []
    source = "crossref"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(CROSSREF_URL, params={"query": q, "rows": rows},
                                    headers={"User-Agent": "underworld-sim/1.0"})
            resp.raise_for_status()
            for it in resp.json().get("message", {}).get("items", []):
                items.append({
                    "title": (it.get("title") or ["untitled"])[0][:200],
                    "year": (((it.get("issued") or {}).get("date-parts") or [[None]])[0] or [None])[0],
                    "doi": it.get("DOI"),
                })
    except (httpx.HTTPError, ValueError, KeyError):
        items = []
    if not items:
        items = _OFFLINE["_default"]
        source = "offline"
    return {"query": q, "source": source, "records": items[:rows]}


async def consult_gateway(session: AsyncSession, minion: Minion, discipline: str, query: str) -> dict:
    """Attempt to pass the gateway and read a real-world dataset.

    Returns {"passed": bool, "reason": ..., "dataset": ...}. On success the Minion
    stores what it read as a memory and a gateway:passed event is logged.
    """
    world = await session.get(World, minion.world_id)
    if not await world_gateway_open(session, world):
        return {"passed": False, "reason": "The gateway is sealed — the world has not reached peak information."}
    if not await can_pass(session, minion, discipline):
        return {"passed": False, "reason": f"Comprehension test failed — {minion.name} has not mastered {discipline!r}."}

    dataset = await fetch_dataset(query)
    titles = "; ".join(r["title"] for r in dataset["records"][:3])
    session.add(Memory(
        minion_id=minion.id, tick=world.tick, kind="gateway",
        content=f"Through the gateway I read: {titles}", importance=0.85,
    ))
    session.add(Event(
        world_id=world.id, tick=world.tick, kind="gateway:passed", actor_id=minion.id,
        payload={"discipline": discipline, "query": dataset["query"],
                 "source": dataset["source"], "n": len(dataset["records"])},
    ))
    return {"passed": True, "reason": "", "dataset": dataset}
