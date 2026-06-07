#!/usr/bin/env python3
"""Build the FOCUSED generation list — meaningful distinct objects, science/tech FIRST.

Reassessed per direction: NO colour/swatch duplication (one fork, not 8), NO LOD/style as
separate generations. Each entry is a distinct OBJECT generated once. The science/tech machines
and work apparatus (minions actually doing the work) are merged in and PRIORITISED first.

Priority: 1 science/tech/work machines · 2 characters (minions working) · 3 buildings/vehicles/
infrastructure · 4 furniture/nature · 5 decor/trivial.

Out: data/master/gen_specs.jsonl (priority-sorted; generator runs top-down)
"""
from __future__ import annotations
import csv, json, os, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
def _load(name):
    s = importlib.util.spec_from_file_location(name, os.path.join(HERE, f"{name}.py"))
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
PE = _load("prompt_engine")
ST = _load("science_tech_assets")

ROOT = os.path.dirname(HERE)
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
OUT = os.path.join(ROOT, "data", "master", "gen_specs.jsonl")
CREDITS_PER_GEN = 24

WORK_KW = ("bench", "machine", "rig", "station", "lab", "console", "reactor", "furnace",
           "scanner", "microscope", "lathe", "mill", "drill", "press", "turbine", "robot",
           "operating", "telescope", "chamber", "spectrometer", "centrifuge", "terminal",
           "workbench", "anvil", "forge", "crucible", "conveyor", "exosuit", "incubator")
DECOR_KW = ("painting", "vase", "frame", "clock", "candle", "rug", "plant", "cushion",
            "doormat", "mirror", "ornament", "banner", "lamp")


def priority(domain, base, source=""):
    if source.startswith(("science:", "guild:", "work:")):
        return 1
    if domain == "character":
        return 2
    if any(k in base for k in WORK_KW) or domain in ("industrial",):
        return 1
    if domain in ("building", "vehicle", "urban"):
        return 3
    if domain in ("nature",) or "table" in base or "chair" in base or "bed" in base or "shelf" in base:
        return 4
    if any(k in base for k in DECOR_KW):
        return 5
    return 4


def main():
    # 1) distinct objects from the BOM (collapse swatch/style/lod -> one per base_item per domain)
    rows = [r for r in csv.DictReader(open(BOM)) if r["lod"] == "lod0"]
    objects = {}   # base_item -> (domain, category)
    for r in rows:
        if r["base_item"] not in objects:
            objects[r["base_item"]] = (r["domain"], r["category"])

    # 2) merge science/tech/work machines (the valuable "minions doing work" assets)
    for base, cat, src in ST.all_work_assets():
        objects.setdefault(base, ("work", cat))   # 'work' domain marks priority-1 origin
    src_of = {base: f"{cat}" for base, cat, _ in []}
    work_src = {base: src for base, cat, src in ST.all_work_assets()}

    specs = []
    for base, (domain, cat) in objects.items():
        src = work_src.get(base, "")
        dom_for_prompt = "interior" if domain == "work" else domain
        prio = priority(domain if domain != "work" else "prop", base, src)
        prompt = PE.build_prompt(base, cat, dom_for_prompt, style="modern", swatch="default")
        specs.append({
            "glb_id": f"{('work' if domain=='work' else domain)}_{base}",
            "base_item": base, "domain": dom_for_prompt, "category": cat,
            "source": src or domain, "priority": prio,
            "prompt": prompt,
            "tripo": {"texture": True, "pbr": True, "texture_quality": "detailed",
                       "model_version": "v2.0-20240919", "face_limit": 40000,
                       "emissive": PE.emissive_for(base, dom_for_prompt)},
            "out_glb": f"web/public/models/generated/uw/{dom_for_prompt}/{base}.glb",
        })
    specs.sort(key=lambda s: (s["priority"], s["base_item"]))
    with open(OUT, "w") as fh:
        for s in specs:
            fh.write(json.dumps(s) + "\n")

    from collections import Counter
    pc = Counter(s["priority"] for s in specs)
    print(f"FOCUSED generation list: {len(specs):,} distinct objects (NO colour/LOD duplication)")
    print(f"  ~credits @24: {len(specs)*CREDITS_PER_GEN:,}")
    print("  by priority:")
    names = {1: "science/tech/work machines", 2: "characters (minions working)",
             3: "buildings/vehicles/infra", 4: "furniture/nature", 5: "decor/trivial"}
    for p in sorted(pc): print(f"    P{p} {names[p]:32s} {pc[p]:,}")
    p1 = [s for s in specs if s["priority"] == 1]
    print(f"\n  P1 sample (generated first): {', '.join(s['base_item'] for s in p1[:12])}")
    print(f"out -> {OUT}")


if __name__ == "__main__":
    main()
