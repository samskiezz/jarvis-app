#!/usr/bin/env python3
"""Tier the GLB BOM into Easy / Average / Medium / Advanced packs and cost each.

Advanced = 1:1 real-life simulation (the full BOM, every item × style × swatch × LOD).
Tiers are cumulative (Average ⊃ Easy, etc.). Costs use category-weighted per-asset rates
under three production methods so the choice is honest. Reads data/master/glb_bom.csv,
writes glb_bom.csv with a `tier` column + data/master/PACKS.md.
"""
from __future__ import annotations
import csv, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
PACKS = os.path.join(ROOT, "data", "master", "PACKS.md")

# default (canonical) variant per axis — the "one good version" an Easy pack ships
DEFAULT_STYLES = {"modern", "std"}
DEFAULT_SWATCH = {"oak", "natural", "default", "std", "a", "uniform", "casual"}

# per-asset cost (USD) by production method, then weighted by category (hero vs bulk)
METHOD_RATE = {            # average $ per finished GLB
    "diy_ai":   0.80,      # your 4090s + Tripo/Meshy/Hunyuan3D self-hosted + light cleanup
    "hybrid":  15.0,       # AI base + artist retopo/PBR/rig pass
    "studio": 150.0,       # full studio photoreal (GTA5/Sims quality)
}
CAT_WEIGHT = defaultdict(lambda: 1.0, {
    "building_shell": 3.5, "character": 4.0, "vehicle": 3.0, "tower": 3.5,
    "water": 1.5, "tree": 1.2, "fx": 0.5, "floor": 0.6, "prop": 1.0, "furniture": 1.0,
})


def tier_of(style, swatch, lod):
    s_def = style in DEFAULT_STYLES
    w_def = swatch in DEFAULT_SWATCH
    if s_def and w_def and lod == "lod0":
        return "easy"
    if s_def and lod == "lod0":
        return "average"
    if lod in ("lod0", "lod1"):
        return "medium"
    return "advanced"


ORDER = ["easy", "average", "medium", "advanced"]


def main():
    rows = list(csv.DictReader(open(BOM)))
    # assign tier + rewrite with tier column
    for r in rows:
        r["tier"] = tier_of(r["style"], r["swatch"], r["lod"])
    fieldnames = list(rows[0].keys())
    with open(BOM, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames); w.writeheader(); w.writerows(rows)

    # cumulative membership: a pack includes its tier and all lighter tiers
    idx = {t: i for i, t in enumerate(ORDER)}
    packs = {t: [] for t in ORDER}
    for r in rows:
        ti = idx[r["tier"]]
        for t in ORDER[ti:]:           # this row belongs to its tier and all heavier packs
            packs[t].append(r)

    def cost(rs, method):
        rate = METHOD_RATE[method]
        return sum(rate * CAT_WEIGHT[r["category"]] for r in rs)

    # build report
    lines = ["# Underworld Minions — GLB Asset Packs & Cost\n",
             "Pick a pack. **Advanced = 1:1 real-life simulation** (the complete itemized BOM: "
             "every item × style × swatch × LOD, all eras/variants). Packs are cumulative.\n",
             "\nArt direction for ALL packs: **futuristic-avatar × GTA5 × Sims** — sleek white "
             "sci-fi curves, saucer rooftops, holo-waterfalls, neon plumbob signage, GTA graffiti, "
             "jacaranda/rooftop gardens, Avatar billboards, glass balconies, warm interiors. "
             "(see ART-DIRECTION.md)\n",
             "\n| Pack | GLBs | DIY (AI on your 4090s) | Hybrid (AI+artist) | Studio (photoreal) | What you get |",
             "|---|---:|---:|---:|---:|---|"]
    blurb = {
        "easy":     "one good version of every object — world fully dressed, no variety",
        "average":  "+ a 2nd colourway & all sky/terrain at base — looks intentional",
        "medium":   "+ 3 styles, 4 swatches, near+mid LODs — reads like a real game",
        "advanced": "**1:1 real life** — every style/swatch/LOD/era/variant, full crowd & city",
    }
    for t in ORDER:
        rs = packs[t]
        c = {m: cost(rs, m) for m in METHOD_RATE}
        lines.append(f"| **{t.title()}** | {len(rs):,} | ${c['diy_ai']:,.0f} | "
                     f"${c['hybrid']:,.0f} | ${c['studio']:,.0f} | {blurb[t]} |")
    lines.append("\n*DIY assumes self-hosted AI 3D-gen (Tripo/Meshy/Hunyuan3D) on your Vast 4090s "
                 "+ light cleanup; cost is mostly your time/compute. Hero assets (buildings, "
                 "characters, vehicles) are weighted 3–4× bulk props.*\n")

    # per-domain split of the full (advanced) pack
    dom = defaultdict(int)
    for r in rows: dom[r["domain"]] += 1
    lines.append("\n## Advanced (1:1) by domain\n")
    for d, n in sorted(dom.items(), key=lambda kv: -kv[1]):
        lines.append(f"- {d}: {n:,}")
    open(PACKS, "w").write("\n".join(lines) + "\n")

    # console
    print("PACK         GLBs        DIY-AI     Hybrid       Studio")
    for t in ORDER:
        rs = packs[t]; c = {m: cost(rs, m) for m in METHOD_RATE}
        print(f"{t.title():10s} {len(rs):8,}  ${c['diy_ai']:9,.0f}  ${c['hybrid']:10,.0f}  ${c['studio']:11,.0f}")
    print(f"\nwrote tier column -> {BOM}\nwrote -> {PACKS}")


if __name__ == "__main__":
    main()
