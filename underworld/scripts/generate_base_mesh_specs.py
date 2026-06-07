#!/usr/bin/env python3
"""Turn the 95k-GLB BOM into the ~840 BASE-MESH generation specs to run on Tripo3D.

You only generate each distinct base mesh once (with PBR + textures); swatches/LODs/styles
derive from it. This writes one art-directed, PBR-explicit prompt per base mesh, ready for
tripo_generate.py. Prompts encode the Underworld look: futuristic-avatar × GTA5 × Sims
(see ART-DIRECTION.md) and request PBR metal/rough + emissive where neon/holo applies.

Out: data/master/base_mesh_specs.jsonl  (one job per line)
"""
from __future__ import annotations
import csv, json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOM = os.path.join(ROOT, "data", "master", "glb_bom.csv")
OUT = os.path.join(ROOT, "data", "master", "base_mesh_specs.jsonl")

# global art-direction suffix appended to every prompt (the house style)
STYLE = ("futuristic-avatar meets GTA5 meets Sims, sleek modern, sci-fi accents, "
         "physically based PBR materials, metal/roughness workflow, real-world scale, "
         "clean topology, game-ready, neutral lighting, white background")
# domains/categories that should carry emissive (neon/holo) channels
EMISSIVE_HINT = {"sky", "urban"}
EMISSIVE_KW = ("sign", "billboard", "neon", "hologram", "holo", "light", "lamp", "screen",
               "display", "led", "aurora", "star", "plasma", "monitor", "tv")
# per-domain prompt framing
DOMAIN_FRAME = {
    "interior": "interior {item}, household/commercial object",
    "building": "modern {item} building exterior, white curved sci-fi forms with glass and "
                "concrete, rooftop garden, neon plumbob signage, saucer rooftop crown",
    "nature": "natural {item}, realistic foliage/terrain",
    "sky": "{item}, sky/celestial element, glowing",
    "urban": "modern city {item}, street furniture",
    "vehicle": "modern {item} vehicle, sleek near-future design, drivable game asset",
    "character": "stylized realistic human {item}, game character, rigged-ready, modular outfit",
}


def humanize(base: str) -> str:
    return base.replace("_", " ").replace("-", " ").strip()


def main():
    rows = list(csv.DictReader(open(BOM)))
    # one spec per distinct base_item; keep its dominant domain/category
    by_base = {}
    dom_count = defaultdict(lambda: defaultdict(int))
    for r in rows:
        b = r["base_item"]
        dom_count[b][r["domain"]] += 1
        by_base.setdefault(b, {"category": r["category"], "zone": r["zone"]})
    specs = []
    for base, meta in sorted(by_base.items()):
        domain = max(dom_count[base].items(), key=lambda kv: kv[1])[0]
        item = humanize(base)
        frame = DOMAIN_FRAME.get(domain, "{item}").format(item=item)
        emissive = (domain in EMISSIVE_HINT) or any(k in base for k in EMISSIVE_KW)
        prompt = f"{frame}, {STYLE}"
        if emissive:
            prompt += ", emissive neon/holographic glow channel"
        specs.append({
            "base_item": base, "domain": domain, "category": meta["category"],
            "prompt": prompt,
            "tripo": {"texture": True, "pbr": True, "texture_quality": "detailed",
                       "model_version": "v2", "face_limit": 40000,
                       "emissive": bool(emissive)},
            "out_glb": f"web/public/models/generated/uw/{domain}/{base}.glb",
        })
    with open(OUT, "w") as fh:
        for s in specs:
            fh.write(json.dumps(s) + "\n")

    from collections import Counter
    dc = Counter(s["domain"] for s in specs)
    em = sum(1 for s in specs if s["tripo"]["emissive"])
    print(f"base-mesh generation specs: {len(specs)}  (all PBR+textured)")
    print(f"  with emissive (neon/holo): {em}")
    for d, n in dc.most_common(): print(f"  {d:10s} {n}")
    print(f"out -> {OUT}")
    print("sample:", json.dumps(specs[0], indent=2)[:400])


if __name__ == "__main__":
    main()
