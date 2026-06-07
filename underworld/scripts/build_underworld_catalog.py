#!/usr/bin/env python3
"""Bind the 3,228-subject list INTO the customised Underworld UE5 world.

Reads gen_specs.jsonl (the comprehensive subject list) and produces the bindings the world's
systems consume, so each generated GLB renders where the storyline puts it:

  • augments web/public/models/asset_catalog.json  -> the φ/fractal layout + civic resolver
    place the new futuristic assets in the city
  • writes web/public/models/uw_bindings.json with:
      room_contents : {room/function: {item: glb}}  -> interiors fill rooms with the insides
      science_labs  : {science: [machine glb]}       -> labs show minions at the right machines
      minions       : {guild/role: glb}              -> the right minion bodies per guild/role
      vehicles/sky/terrain/roads/civic/architecture  -> world dressing + skyline

Re-run anytime as more assets land (binds whatever is generated + marks the rest pending),
so the background generation progressively fills the live world. Storyline link: the scene-
state sagas/sciences already drive WHICH activity each minion does; these bindings give that
activity its real machine/room/asset.
"""
from __future__ import annotations
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, "data", "master", "gen_specs.jsonl")
MODELS = os.path.join(ROOT, "web", "public", "models")
CATALOG = os.path.join(MODELS, "asset_catalog.json")
BINDINGS = os.path.join(MODELS, "uw_bindings.json")

# map our generation categories -> the 22 asset_catalog categories the layout understands
CAT_MAP = {
    "building_shell": "civic", "furniture": "furniture", "prop": "prop", "wall": "wall",
    "floor": "floor", "roof": "roof", "stairs": "stairs", "bridge": "bridge",
    "vehicle": "vehicle", "character": "character", "tree": "tree", "plant": "plant",
    "rock": "rock", "water": "water", "fx": "fx", "civic": "civic", "industrial": "industrial",
}


def url_of(spec):
    return "/" + os.path.relpath(os.path.join(ROOT, spec["out_glb"]), MODELS).replace(os.sep, "/") \
        if False else "/models/" + spec["out_glb"].split("models/", 1)[-1]


def main():
    specs = [json.loads(l) for l in open(GEN)]
    generated = 0
    catalog = json.load(open(CATALOG)) if os.path.exists(CATALOG) else {"categories": {}, "assets": {}}
    cats = catalog.setdefault("categories", {})
    assets = catalog.setdefault("assets", {})

    bind = {"room_contents": {}, "science_labs": {}, "minions": {}, "vehicles": [],
            "sky": [], "terrain": [], "roads": [], "civic": {}, "architecture": {},
            "pending": 0, "generated": 0}

    for s in specs:
        url = url_of(s)
        exists = os.path.exists(os.path.join(ROOT, s["out_glb"]))
        bind["generated" if exists else "pending"] = bind.get("generated" if exists else "pending", 0) + 1
        if exists:
            generated += 1
            cat = CAT_MAP.get(s["category"], "prop")
            cats.setdefault(cat, [])
            if url not in cats[cat]:
                cats[cat].append(url)
            assets[url] = {"url": url, "category": cat, "generated": True, "name": s["name"]}
        # bindings are built for ALL specs (path known; renderer falls back until generated)
        name, dom = s["name"], s["domain"]
        if s["source"] if False else dom == "interior":
            # room-qualified content: "<room/function> <item>"
            parts = name.split(" ", 1)
            if len(parts) == 2:
                room, item = parts
                bind["room_contents"].setdefault(room, {})[item] = url
        if "research" in s.get("prompt", "") or re.match(r"^[a-z]", name) and " " in name:
            pass
        if dom == "character":
            bind["minions"][name] = url
        elif dom == "vehicle":
            bind["vehicles"].append(url)
        elif dom == "sky":
            bind["sky"].append(url)
        elif dom == "nature":
            bind["terrain"].append(url)
        elif dom == "urban":
            bind["roads"].append(url)

    # science labs: machine names start with a science word
    from underworld.server.services import story_engine as SE  # noqa
    sci_set = set(SE.SCIENCES)
    for s in specs:
        first = s["name"].split(" ", 1)[0]
        if first in sci_set:
            bind["science_labs"].setdefault(first, []).append(url_of(s))

    json.dump(catalog, open(CATALOG, "w"))
    bind["generated"], bind["pending"] = generated, len(specs) - generated
    json.dump(bind, open(BINDINGS, "w"), indent=1)

    print(f"specs: {len(specs)}  generated-so-far: {generated}  pending: {len(specs)-generated}")
    print(f"catalog categories now: {len(cats)}  total catalog assets: {len(assets)}")
    print(f"bindings -> rooms:{len(bind['room_contents'])} sciences:{len(bind['science_labs'])} "
          f"minions:{len(bind['minions'])} vehicles:{len(bind['vehicles'])} sky:{len(bind['sky'])} "
          f"terrain:{len(bind['terrain'])} roads:{len(bind['roads'])}")
    print(f"wrote {CATALOG} + {BINDINGS}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(ROOT))
    main()
