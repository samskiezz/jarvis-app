"""Bake vibrancy into the GLB materials so they pop in ANY viewer (not just our
renderer): set an emissive factor (+ KHR_materials_emissive_strength) on glowing
hero assets, and a saturation/brightness tint on the base-colour factor.

This is a real glTF material edit via pygltflib — it does NOT re-encode the
(large) textures, so it's fast and doesn't bloat the repo much. Glow assets are
detected by name (fx_*, crystal, lantern, neon, …). Emissive makes the renderer's
bloom actually blaze on hero pieces.

  python -m underworld.assets.tripo.enhance_glb --glow-only        # just hero glow
  python -m underworld.assets.tripo.enhance_glb --all              # + saturation tint
  python -m underworld.assets.tripo.enhance_glb --dry-run
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

from pygltflib import GLTF2

HERE = Path(__file__).resolve().parent
GLB_DIR = HERE.parents[1] / "web" / "public" / "models" / "generated" / "tripo"

GLOW_RE = re.compile(r"(fx_|glow|crystal|lantern|neon|plasma|energy|hologram|rune|"
                     r"spirit|lumino|orb|core|ember|fire|torch|brazier|reactor|"
                     r"portal|conduit|sun_disc|moon_disc)", re.I)

EMISSIVE_STRENGTH = 2.5     # KHR_materials_emissive_strength (renderer bloom feeds on this)
SAT_TINT = 1.12             # mild base-colour saturation lift for non-glow assets


def _is_glow(name: str) -> bool:
    return bool(GLOW_RE.search(name))


def _saturate_rgb(rgb: list[float], k: float) -> list[float]:
    """Push a linear RGB factor away from its grey (luma) → more saturated."""
    r, g, b = rgb[:3]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    out = [max(0.0, min(1.0, luma + (c - luma) * k)) for c in (r, g, b)]
    return out + rgb[3:]


def enhance(path: Path, *, glow_only: bool) -> str:
    g = GLTF2().load(str(path))
    name = path.stem
    glow = _is_glow(name)
    changed = False
    for mat in g.materials or []:
        if glow:
            base = (mat.pbrMetallicRoughness.baseColorFactor
                    if mat.pbrMetallicRoughness and mat.pbrMetallicRoughness.baseColorFactor
                    else [1, 1, 1, 1])
            mat.emissiveFactor = [min(1.0, base[0]), min(1.0, base[1]), min(1.0, base[2])]
            # emit through the base-colour TEXTURE so the glow follows the surface
            # (intricate, textured glow) instead of a flat colour.
            bct = mat.pbrMetallicRoughness.baseColorTexture if mat.pbrMetallicRoughness else None
            if bct is not None:
                from pygltflib import TextureInfo
                mat.emissiveTexture = TextureInfo(index=bct.index, texCoord=bct.texCoord or 0)
            ext = mat.extensions or {}
            ext["KHR_materials_emissive_strength"] = {"emissiveStrength": EMISSIVE_STRENGTH}
            mat.extensions = ext
            changed = True
        elif not glow_only and mat.pbrMetallicRoughness:
            bcf = mat.pbrMetallicRoughness.baseColorFactor or [1, 1, 1, 1]
            mat.pbrMetallicRoughness.baseColorFactor = _saturate_rgb(list(bcf), SAT_TINT)
            changed = True
    if changed:
        if g.extensionsUsed is None:
            g.extensionsUsed = []
        if glow and "KHR_materials_emissive_strength" not in g.extensionsUsed:
            g.extensionsUsed.append("KHR_materials_emissive_strength")
        g.save(str(path))
    return "glow" if glow else ("tint" if changed else "skip")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--glow-only", action="store_true", help="only set emissive on hero glow assets")
    ap.add_argument("--all", action="store_true", help="glow + saturation tint on everything")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", default=None, help="comma list of asset ids")
    args = ap.parse_args(argv)
    glow_only = not args.all      # default: glow-only (safe, fast, no texture churn)

    files = sorted(GLB_DIR.glob("*.glb"))
    if args.only:
        want = {x.strip() for x in args.only.split(",")}
        files = [f for f in files if f.stem in want]
    counts = {"glow": 0, "tint": 0, "skip": 0}
    for f in files:
        if args.dry_run:
            counts["glow" if _is_glow(f.stem) else "skip"] += 1
            continue
        counts[enhance(f, glow_only=glow_only)] += 1
    print(f"{'DRY-RUN ' if args.dry_run else ''}enhanced {len(files)} GLBs: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
