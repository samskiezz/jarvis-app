"""The guild hierarchy — how 11 guilds genuinely span hundreds of thousands of
sciences. Each guild branches:

    guild  →  divisions (scientific fields)  →  specialisations (niches)

A guild isn't one of 11 flat buckets; it is a tree whose leaves are the
field × sub-topic × regime niches (science_niches). So a guild covers
len(fields) × 25 sub-topics × 21 regimes sciences (~9,000+ each), and every
Minion holds a deterministic career specialisation deep in the tree.
"""
from __future__ import annotations

from hashlib import blake2b

from . import taxonomy as T
from . import science_niches as SN

GUILDS = tuple(T.FIELDS_BY_GUILD.keys())          # 11 guilds


def divisions(guild: str) -> tuple[str, ...]:
    """A guild's divisions = its scientific fields."""
    return T.FIELDS_BY_GUILD.get(guild, ())


def sciences_in_guild(guild: str) -> int:
    """How many distinct sciences (niches) live under a guild."""
    return len(divisions(guild)) * len(SN.MODIFIERS) * len(SN.REGIMES)


def guild_hierarchy(guild: str) -> dict:
    """The full tree for one guild: divisions, each with its niche count + a few
    sample specialisations."""
    divs = []
    for field in divisions(guild):
        sample = [f"{field}::{m}::r{r}" for m in SN.MODIFIERS[:2] for r in (0, 5)]
        divs.append({"division": field,
                     "specialisations": len(SN.MODIFIERS) * len(SN.REGIMES),
                     "sample": sample[:3]})
    return {"guild": guild, "divisions": divs, "n_divisions": len(divs),
            "total_sciences": sciences_in_guild(guild)}


def total_sciences() -> int:
    """All sciences across all guilds (guild-mapped fields)."""
    return sum(sciences_in_guild(g) for g in GUILDS)


def specialisation_for(minion_id: str, guild: str) -> dict:
    """A Minion's lifelong career specialisation — a deterministic leaf of the
    guild tree (division + sub-topic + regime → a concrete niche)."""
    divs = divisions(guild) or T.CIVIC_FIELDS
    h = int.from_bytes(blake2b(str(minion_id).encode(), digest_size=8).digest(), "big")
    field = divs[h % len(divs)]
    sub = SN.MODIFIERS[(h >> 8) % len(SN.MODIFIERS)]
    reg = (h >> 16) % len(SN.REGIMES)
    return {"guild": guild, "division": field, "sub_topic": sub, "regime": reg,
            "niche": f"{field}::{sub}::r{reg}", "title": f"{sub} {field.replace('_', ' ')} specialist"}


def org_summary() -> dict:
    """Org-chart scale: guilds, divisions, sciences."""
    per = {g: {"divisions": len(divisions(g)), "sciences": sciences_in_guild(g)} for g in GUILDS}
    return {"guilds": len(GUILDS),
            "total_divisions": sum(v["divisions"] for v in per.values()),
            "total_sciences": total_sciences(),
            "per_guild": per}
