"""Build the ordered load manifest the game loader consumes — so the world's GLBs
stream in a sensible, staged order (core world & biomes first, then homes, then
guild/lab equipment, then society, then the epoch ladder, then polish) instead of
an arbitrary dict order. Only assets actually present in the art manifest are
included, each tagged with its stage + phase so the loader can show real progress
and the renderer can bring the world up layer by layer.

  python -m underworld.assets.tripo.build_load_order
  -> web/public/models/generated/load_order.json
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1] / "web" / "public" / "models"
MANIFEST = WEB / "scraped" / "assets_manifest.json"
OUT = WEB / "generated" / "load_order.json"

# Critical bundled assets that must load before anything (sky + base characters).
CRITICAL = [
    {"path": "/models/polyhaven/sky_puresky_1k.hdr", "phase": "skies", "stage": 0},
    {"path": "/models/Michelle.glb", "phase": "characters", "stage": 0},
    {"path": "/models/RobotExpressive.glb", "phase": "characters", "stage": 0},
]


def build() -> dict:
    from .design_list import STAGES, PHASE_ORDER, DESIGNS

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    have = {k[len("tripo:"):]: v for k, v in manifest.items() if k.startswith("tripo:")}
    cat_of = {d[0]: d[1] for d in DESIGNS}
    phase_index = {c: i for i, c in enumerate(PHASE_ORDER)}

    packages = []
    ordered_assets = list(CRITICAL)
    for stage_no, stage in STAGES.items():
        cats = set(stage["categories"])
        # assets in this stage that actually exist, sorted by phase then id
        ids = sorted((aid for aid, c in cat_of.items() if c in cats and aid in have),
                     key=lambda a: (phase_index.get(cat_of[a], 99), a))
        assets = []
        for aid in ids:
            rec = have[aid]
            assets.append({"id": aid, "path": rec.get("path"),
                           "category": cat_of[aid], "phase": cat_of[aid]})
            ordered_assets.append({"path": rec.get("path"), "phase": cat_of[aid],
                                   "stage": stage_no})
        packages.append({"stage": stage_no, "name": stage["name"],
                         "asset_count": len(assets), "assets": assets})

    return {
        "version": 1,
        "note": "Ordered GLB load packages — load stage by stage; render the world "
                "layer by layer as each stage completes.",
        "total_assets": len(ordered_assets),
        "critical": CRITICAL,
        "packages": packages,
        "ordered": ordered_assets,            # flat, in exact load order
    }


def main() -> int:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2))
    print(f"wrote {OUT}: {data['total_assets']} assets across {len(data['packages'])} stages")
    for p in data["packages"]:
        print(f"  stage {p['stage']} {p['name']:<22} {p['asset_count']} assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
