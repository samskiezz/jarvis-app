#!/usr/bin/env python3
"""Build the COMPREHENSIVE Underworld generation list — thousands of distinct subjects.

Prompt format (no embellishments, exactly as directed):
    "Futuristic Avatar movie Sims 4 x GTA 5 Futuristic <thing>"
e.g. "...hospital", "...hospital bed", "...hospital desk computer".

Covers, custom to Underworld and not limited to:
  • every building/function + every room + every room CONTENT (the insides), room-qualified
  • room PERSONALITY dressing (so rooms feel individual, not cloned)
  • every science + its machines, every guild workshop, every work/feature apparatus
  • the modular architecture kit (walls/floors/roofs/doors/windows/stairs/facades/bridges)
  • world subjects: vehicles (cars/drones/planes/boats/rail), sky/celestial (sun/moon/stars),
    terrain/landforms, roads/infrastructure, wildlife, flora/crops, era kits, civic buildings
NO colour/LOD/style duplication — one generation per distinct subject. Priority-sorted.

Out: data/master/gen_specs.jsonl
"""
from __future__ import annotations
import json, os, re, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
def _load(n):
    s = importlib.util.spec_from_file_location(n, os.path.join(HERE, f"{n}.py"))
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
ST = _load("science_tech_assets"); ARCH = _load("architecture_assets"); WS = _load("world_subjects")

ROOT = os.path.dirname(HERE)
import sys; sys.path.insert(0, os.path.dirname(ROOT))
from underworld.server.services import interiors as IN
from underworld.server.services import civic_assets as CA
from underworld.server.services import story_engine as SE

OUT = os.path.join(ROOT, "data", "master", "gen_specs.jsonl")
PHRASE = "Futuristic Avatar movie Sims 4 x GTA 5 Futuristic"
CREDITS_PER_GEN = 24

# a few personality/mood dressings so each room reads individual (not clones) — kept small
ROOM_PERSONALITY = ["cozy", "minimalist", "cluttered", "luxury", "rustic", "high_tech"]
PERSONALITY_PROPS = ["wall_art", "rug", "potted_plant", "shelf_clutter", "mood_lighting", "personal_photos"]


def hum(s): return re.sub(r"[_\-]+", " ", str(s)).strip()


def main():
    items = {}   # name -> (category, domain, priority)
    def add(name, cat, domain, prio):
        name = name.strip()
        if name and name not in items:
            items[name] = (cat, domain, prio)

    # 1) science / tech / guild / work machines (minions doing the work) — P1
    for base, cat, src in ST.all_work_assets():
        add(hum(base), cat, "interior", 1)
    for sci, machines in ST.SCIENCE_MACHINES.items():
        for m in machines:
            add(f"{hum(sci)} {hum(m)}", "prop", "interior", 1)   # science-qualified

    # 2) buildings/functions + rooms + room CONTENTS (the insides), room-qualified — P2/P3
    for fn, program in IN._PROGRAMS.items():
        add(hum(fn), "building_shell", "building", 3)            # the building, e.g. "hospital"
        for room, *_ in program:
            add(f"{hum(fn)} {hum(room)}", "building_shell", "building", 3)   # "hospital ward"
            for item in IN._ROOM_FURNITURE.get(room, ()):
                add(f"{hum(fn)} {hum(item)}", "furniture", "interior", 2)    # "hospital bed"
            # room personality dressing so rooms feel individual
            for pers in ROOM_PERSONALITY:
                for pp in PERSONALITY_PROPS:
                    add(f"{pers} {hum(room)} {hum(pp)}", "furniture", "interior", 4)
    # generic room contents (room-qualified, for homes/offices everywhere)
    for room, contents in IN._ROOM_FURNITURE.items():
        add(hum(room), "building_shell", "building", 3)
        for item in contents:
            add(f"{hum(room)} {hum(item)}", "furniture", "interior", 2)

    # 3) civic building types — P3
    for ct in CA.CIVIC_TYPES:
        add(hum(ct), "civic", "building", 3)

    # 4) architecture / modular kit (interior + exterior design) — P2
    for base, cat in ARCH.all_architecture():
        add(hum(base), cat, "building", 2)

    # 5) world subjects — vehicles/sky/terrain/roads/wildlife/flora/era — P3/P4
    DOMPRIO = {"vehicle": 3, "sky": 3, "nature": 4, "urban": 3, "wildlife": 3, "era": 3}
    for base, cat, dom in WS.all_subjects():
        add(hum(base), cat, dom if dom != "wildlife" else "character", DOMPRIO.get(dom, 4))

    # 6) MINIONS — the Underworld characters themselves (accurate to the population) — P2
    for g in SE.GUILDS:
        add(f"{g} guild minion", "character", "character", 2)
    for stage in ["infant", "child", "adolescent", "young adult", "adult", "elder"]:
        add(f"{stage} minion", "character", "character", 2)
    for role in ["scientist", "engineer", "builder", "farmer", "trader", "teacher", "medic",
                 "guard", "inventor", "miner", "researcher", "artisan"]:
        add(f"minion {role}", "character", "character", 2)
    for special in ["awakened sentient minion", "minion avatar", "robotic minion",
                    "minion at work", "minion in lab coat", "minion with tool",
                    "underworld minion citizen", "minion scientist operating machine"]:
        add(special, "character", "character", 2)

    # 7) eras (the story spine) — P4
    for era in SE.ERAS:
        add(f"{era} era street", "floor", "urban", 4)
        add(f"{era} era minion", "character", "character", 4)

    # build specs
    EMK = ("sign","billboard","neon","holo","light","lamp","screen","display","led","aurora",
           "star","plasma","monitor","tv","sun","moon","fx","reactor","laser")
    specs = []
    for name, (cat, domain, prio) in items.items():
        gid = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        specs.append({
            "glb_id": gid, "name": name, "category": cat, "domain": domain, "priority": prio,
            "prompt": f"{PHRASE} {name}",
            "tripo": {"texture": True, "pbr": True, "texture_quality": "detailed",
                       "model_version": "v2.0-20240919", "face_limit": 40000,
                       "emissive": any(k in name.lower() for k in EMK)},
            "out_glb": f"web/public/models/generated/uw/{domain}/{gid}.glb",
        })
    specs.sort(key=lambda s: (s["priority"], s["name"]))
    with open(OUT, "w") as fh:
        for s in specs:
            fh.write(json.dumps(s) + "\n")

    from collections import Counter
    pc = Counter(s["priority"] for s in specs); dc = Counter(s["domain"] for s in specs)
    print(f"COMPREHENSIVE list: {len(specs):,} distinct subjects  (~{len(specs)*CREDITS_PER_GEN:,} credits)")
    print("by priority:", dict(sorted(pc.items())))
    print("by domain:  ", dict(dc.most_common()))
    print("\nsample prompts:")
    for s in specs[:3] + [x for x in specs if x['name'].startswith('hospital')][:3]:
        print("  ", s["prompt"])


if __name__ == "__main__":
    main()
