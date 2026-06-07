"""SCENE ASSETS — stitch the generated GLBs to the STORYLINE.

Given what a Minion is doing this tick (guild + action + role + current science), resolve the
generated futuristic asset it is interacting with — the science machine, guild-workshop rig, or
work apparatus — so the renderer can place the Minion AT that object. This is what makes the
UE5 world show the actual story: a crystallography researcher stands at the crystallography
machine; a smith works the forge; a builder drives the auto-bricklayer.

Backed by uw_bindings.json (built by build_underworld_catalog.py). Degrades to None when the
asset hasn't been generated yet, so the renderer falls back gracefully.
"""
from __future__ import annotations
import json, os
from typing import Optional

_BIND = None

# guild → its representative sciences (so a guild member uses that guild's machines)
GUILD_SCIENCE = {
    "maths": ["math"], "physics": ["physics", "quantum", "optics"],
    "electrical": ["electronics", "electrochem", "rf", "signal"],
    "mechanical": ["robotics", "engineering", "tribology"],
    "civil": ["structural", "geotechnical", "hydrology"],
    "materials": ["materials", "metallurgy", "polymer", "crystallography"],
    "computing": ["cs_ai", "qcomputing", "crypto", "semiconductor"],
    "energy": ["nuclear", "photovoltaics", "combustion", "plasma"],
    "agriculture": ["agronomy", "biology", "foodscience", "veterinary"],
    "patent": ["engineering", "economics"],
    "safety": ["epidemiology", "immunology", "medicine", "pharmacology"],
}
# action → work apparatus key (matches science_tech_assets.WORK_PROPS names)
ACTION_WORK = {
    "study": "research_desk_setup", "research": "lab_experiment_bench",
    "forge": "blacksmith_anvil_forge", "craft": "inventor_workbench",
    "farm": "futuristic_plough_drone", "trade": "market_trading_stall",
    "teach": "lecture_podium_holo", "invent": "inventor_workbench",
    "build": "construction_exosuit", "mine": "mining_drill_rig",
    "heal": "medic_treatment_station", "experiment": "lab_experiment_bench",
    "propose_invention": "prototype_assembly_arm",
}


def _bindings() -> dict:
    global _BIND
    if _BIND is None:
        path = os.environ.get("UW_BINDINGS") or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "web", "public", "models", "uw_bindings.json")
        try:
            _BIND = json.load(open(path))
        except Exception:  # noqa: BLE001
            _BIND = {}
    return _BIND


def _h(*p) -> int:
    h = 1469598103934665603
    for x in p:
        for b in str(x).encode():
            h = ((h ^ b) * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return h


def using_asset(guild: str, action: str, role: str = "", *, science: Optional[str] = None,
                seed: int = 0) -> Optional[dict]:
    """Resolve the generated asset this Minion is interacting with → {glb, kind, science?}."""
    b = _bindings()
    labs = b.get("science_labs", {})
    a = (action or "").lower()

    # 1) science machine — if we know the minion's science (or pick one from its guild)
    sciences = [science] if science else GUILD_SCIENCE.get((guild or "").lower(), [])
    sciences = [s for s in sciences if s and s in labs]
    if sciences and a in ("study", "research", "experiment", "invent", "propose_invention", "teach"):
        sci = sciences[_h(seed, guild) % len(sciences)]
        pool = labs.get(sci) or []
        if pool:
            url = pool[_h(seed, sci, a) % len(pool)]
            return {"glb": url, "kind": os.path.basename(url).rsplit(".", 1)[0], "science": sci}

    # 2) work apparatus by action (forge/build/mine/heal/farm/trade…) — match the full work
    #    name against any bound asset's glb basename (work props are bound by name)
    work_name = ACTION_WORK.get(a)
    if work_name:
        for url in _all_binding_urls(b):
            base = os.path.basename(url).rsplit(".", 1)[0].lower()
            if work_name in base or work_name.split("_")[0] in base:
                return {"glb": url, "kind": base}
    return None


def _all_binding_urls(b: dict) -> list:
    urls = []
    for items in b.get("room_contents", {}).values():
        urls.extend(items.values())
    for pool in b.get("science_labs", {}).values():
        urls.extend(pool)
    return urls
