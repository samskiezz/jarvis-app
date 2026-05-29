from __future__ import annotations

from fastapi import APIRouter, Depends

from ..agents import guilds
from ..agents.guild_lore import get_lore
from ..auth import require_bearer

router = APIRouter(prefix="/guilds", tags=["guilds"])


@router.get("")
async def list_guilds(_token: str = Depends(require_bearer)):
    out = []
    for spec in guilds.GUILDS.values():
        lore = get_lore(spec.kind)
        item = {
            "kind": spec.kind.value,
            "name": spec.name,
            "domain": spec.domain,
            "checklist": list(spec.checklist),
            "starting_skills": list(spec.starting_skills),
        }
        if lore is not None:
            item.update(
                motto=lore.motto,
                founding_myth=lore.founding_myth,
                mission=lore.mission,
                hero_name=lore.hero_name,
                hero_tale=lore.hero_tale,
                rituals=list(lore.rituals),
                color_hex=lore.color_hex,
                glyph=lore.glyph,
                nemesis=lore.nemesis,
                obsession=lore.obsession,
                open_question=lore.open_question,
            )
        out.append(item)
    return out
