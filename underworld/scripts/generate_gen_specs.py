#!/usr/bin/env python3
"""Build the GENERATION specs — one UNIQUE themed prompt per distinct look (LOD0 row).

Preserves the variety of the BOM: every distinct color / style / era / season / outfit is its
OWN generation with its own detailed, futuristic, Avatar×Sims4×GTA5 prompt. Only the mechanical
LOD axis is auto-derived later (lod1/lod2 = decimation of the generated lod0). So instead of 840
collapsed bases you generate ~tens of thousands of unique assets — the full design intent.

Out: data/master/gen_specs.jsonl  (one Tripo job per distinct look)
"""
from __future__ import annotations
import csv, json, os
sys_path = os.path.dirname(os.path.abspath(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location("prompt_engine", os.path.join(sys_path, "prompt_engine.py"))
PE = importlib.util.module_from_spec(spec); spec.loader.exec_module(PE)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
OUT = os.path.join(ROOT, "data", "master", "gen_specs.jsonl")
CREDITS_PER_GEN = 24


def row_to_prompt(r):
    dom = r["domain"]
    if dom == "building":
        return PE.build_prompt(r["base_item"], r["category"], dom,
                               style="modern", swatch="default", era=r["style"])
    if dom == "nature":
        return PE.build_prompt(r["base_item"], r["category"], dom,
                               style="modern", swatch="default", season=r["swatch"])
    if dom == "character":
        # swatch holds the outfit; weave it in via style slot text
        p = PE.build_prompt(r["base_item"], r["category"], dom, style="modern", swatch="default")
        return p.replace("game character,", f"game character wearing {r['swatch'].replace('_',' ')} outfit,")
    return PE.build_prompt(r["base_item"], r["category"], dom, style=r["style"], swatch=r["swatch"])


def main():
    rows = [r for r in csv.DictReader(open(BOM)) if r["lod"] == "lod0"]
    seen = set(); specs = []
    for r in rows:
        # one generation per distinct look (base+style+swatch+domain); LODs derived later
        key = (r["domain"], r["base_item"], r["style"], r["swatch"])
        if key in seen:
            continue
        seen.add(key)
        specs.append({
            "glb_id": r["glb_id"], "base_item": r["base_item"], "domain": r["domain"],
            "category": r["category"], "style": r["style"], "swatch": r["swatch"],
            "prompt": row_to_prompt(r),
            "tripo": {"texture": True, "pbr": True, "texture_quality": "detailed",
                       "model_version": "v2.0-20240919", "face_limit": 40000,
                       "emissive": PE.emissive_for(r["base_item"], r["domain"])},
            "out_glb": f"web/public/models/generated/uw/{r['domain']}/{r['glb_id']}.glb",
        })
    with open(OUT, "w") as fh:
        for s in specs:
            fh.write(json.dumps(s) + "\n")

    from collections import Counter
    dc = Counter(s["domain"] for s in specs)
    em = sum(1 for s in specs if s["tripo"]["emissive"])
    print(f"UNIQUE generations (distinct looks): {len(specs):,}  (all PBR+textured+futuristic)")
    print(f"  ~credits @24/gen: {len(specs)*CREDITS_PER_GEN:,}  ({len(specs)*20:,}-{len(specs)*30:,})")
    print(f"  emissive (neon/holo): {em:,}")
    for d, n in dc.most_common(): print(f"  {d:10s} {n:,}")
    print(f"\nLODs (lod1/lod2) auto-derived from these — no extra credits.")
    print(f"out -> {OUT}")
    print("\nsample prompt:\n  " + specs[0]["prompt"][:300])


if __name__ == "__main__":
    main()
