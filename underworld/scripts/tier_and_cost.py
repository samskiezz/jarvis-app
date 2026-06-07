#!/usr/bin/env python3
"""Tier the GLB BOM and cost it in TRIPO3D CREDITS (the real basis).

The honest model: you only GENERATE each distinct base mesh once on Tripo3D (~20-30 credits
with texture). Everything else in the BOM — swatches (recolor), LODs (auto-decimate), most
styles (material swap) — is DERIVED in-pipeline for ~zero extra credits. So the whole 1:1
world's geometry ≈ 840 base meshes ≈ ~20,000 credits, not the artist-rate figure.

Packs are cumulative; they differ mainly in how much VARIANT polish you derive, while base
generation is nearly flat (Easy already needs most base shapes to dress the world).

Reads data/master/glb_bom.csv, rewrites it with a `tier` column, writes data/master/PACKS.md.
"""
from __future__ import annotations
import csv, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
PACKS = os.path.join(ROOT, "data", "master", "PACKS.md")

DEFAULT_STYLES = {"modern", "std"}
DEFAULT_SWATCH = {"oak", "natural", "default", "std", "a", "uniform", "casual"}

# Tripo3D: credits per textured base-mesh generation (their cost, ~20-30; 24 typical)
CREDITS_PER_GEN_LOW, CREDITS_PER_GEN, CREDITS_PER_GEN_HIGH = 20, 24, 30
# rough $ per credit depending on Tripo plan (free daily credits offset a lot if batched)
USD_PER_CREDIT_LOW, USD_PER_CREDIT_HIGH = 0.004, 0.015

ORDER = ["easy", "average", "medium", "advanced"]


def tier_of(style, swatch, lod):
    s = style in DEFAULT_STYLES; w = swatch in DEFAULT_SWATCH
    if s and w and lod == "lod0": return "easy"
    if s and lod == "lod0":       return "average"
    if lod in ("lod0", "lod1"):   return "medium"
    return "advanced"


def main():
    rows = list(csv.DictReader(open(BOM)))
    for r in rows:
        r["tier"] = tier_of(r["style"], r["swatch"], r["lod"])
    with open(BOM, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

    idx = {t: i for i, t in enumerate(ORDER)}
    base_by_pack = defaultdict(set)     # distinct base meshes to GENERATE
    rows_by_pack = defaultdict(int)     # total GLB variants (derived)
    for r in rows:
        ti = idx[r["tier"]]
        for t in ORDER[ti:]:
            base_by_pack[t].add(r["base_item"]); rows_by_pack[t] += 1

    blurb = {
        "easy":     "one version of every object — world fully dressed, no variety",
        "average":  "+ a 2nd colourway & all sky/terrain — looks intentional",
        "medium":   "+ 3 styles, 4 swatches, near+mid LODs — reads like a real game",
        "advanced": "**1:1 real life** — every style/swatch/LOD/era/variant, full crowd & city",
    }
    L = ["# Underworld Minions — GLB Asset Packs & Cost (Tripo3D credits)\n",
         "**The real cost basis is Tripo3D credits.** You generate each distinct *base mesh* "
         "once (~20-30 credits, textured); swatches/LODs/most styles are derived for ~free. So "
         "the full **1:1 world ≈ 840 base meshes ≈ ~20,000 credits** — not artist $/asset.\n",
         "\nArt direction (all packs): **futuristic-avatar × GTA5 × Sims** — white sci-fi curves, "
         "saucer rooftops, holo-waterfalls, neon plumbob signage, GTA graffiti, jacaranda/rooftop "
         "gardens, Avatar billboards (see ART-DIRECTION.md).\n",
         "\n| Pack | Base meshes to generate | Tripo credits (~24/gen) | ≈ USD* | GLB variants (derived free) | What you get |",
         "|---|---:|---:|---:|---:|---|"]
    for t in ORDER:
        n = len(base_by_pack[t]); cr = n * CREDITS_PER_GEN
        usd = f"${cr*USD_PER_CREDIT_LOW:,.0f}–${cr*USD_PER_CREDIT_HIGH:,.0f}"
        L.append(f"| **{t.title()}** | {n:,} | ~{cr:,} ({n*CREDITS_PER_GEN_LOW:,}–{n*CREDITS_PER_GEN_HIGH:,}) "
                 f"| {usd} | {rows_by_pack[t]:,} | {blurb[t]} |")
    L += ["\n*USD is indicative — Tripo plans vary and free daily credits offset a lot if you "
          "batch generations over time (\"try hard\"). Credits are the real unit.*\n",
          f"\n**Bottom line:** the entire 1:1 world is **{len(base_by_pack['advanced'])} base-mesh "
          f"generations ≈ ~{len(base_by_pack['advanced'])*CREDITS_PER_GEN:,} Tripo credits**; the "
          f"{rows_by_pack['advanced']:,} total GLBs are derived from them in-pipeline.\n",
          "\n## How the 840 → 95,405 expansion works (no extra credits)\n",
          "- **swatch** (colourway) → recolor/material instance\n"
          "- **lod0/1/2** → automatic decimation\n"
          "- **style** (modern/industrial/…) → mostly material+trim swaps; only hero pieces re-gen\n"
          "- **season** (flora) → texture/tint variant\n- **era** (buildings) → material/detail pass\n"
          "- **swatch on people/vehicles** → outfit/paint material\n"]
    dom = defaultdict(set)
    for r in rows: dom[r["domain"]].add(r["base_item"])
    L.append("\n## Base meshes to generate, by domain (the actual Tripo work)\n")
    for d, s in sorted(dom.items(), key=lambda kv: -len(kv[1])):
        L.append(f"- {d}: {len(s)} base meshes\n")
    open(PACKS, "w").write("".join(x if x.endswith("\n") else x+"\n" for x in L))

    print("PACK        base-gen  Tripo credits      derived GLBs")
    for t in ORDER:
        n = len(base_by_pack[t])
        print(f"  {t.title():9s} {n:5,}   ~{n*CREDITS_PER_GEN:>6,}        {rows_by_pack[t]:,}")
    print(f"\nfull 1:1 world: {len(base_by_pack['advanced'])} base meshes ≈ "
          f"~{len(base_by_pack['advanced'])*CREDITS_PER_GEN:,} Tripo credits")
    print(f"wrote -> {PACKS}")


if __name__ == "__main__":
    main()
