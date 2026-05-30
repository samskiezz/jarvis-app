#!/usr/bin/env python3
"""Text prompt → 3D GLB, using only free public APIs.

Pipeline:
  1. Text prompt → image via pollinations.ai (no key, no quota).
  2. Image → 3D GLB via either:
       - TripoSR  (stabilityai/TripoSR HF Space — single-image SDF)
       - InstantMesh (TencentARC/InstantMesh — multiview + mesh)
       - Hunyuan3D-2 (tencent/Hunyuan3D-2 — Tencent's higher-quality)

HF Spaces have a free ZeroGPU quota (~5 minutes/day per IP). Set the
HF_TOKEN env var for higher quota — anonymous still works for a handful
of generations per day.

Usage:
  python scripts/generate_glb.py "low poly fantasy castle tower"
  python scripts/generate_glb.py --image /tmp/source.png "a wooden barrel"
  python scripts/generate_glb.py --provider triposr "an oak tree"

Output:
  underworld/web/public/models/generated/<slug>.glb
  + entry in underworld/web/public/models/generated/manifest.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO / "underworld" / "web" / "public" / "models" / "generated"
MANIFEST   = OUTPUT_DIR / "manifest.json"


# --- Step 1: text → image ---------------------------------------------------

def text_to_image(prompt: str, slug: str) -> pathlib.Path:
    """Pollinations.ai — free, no key, no quota."""
    q = urllib.parse.quote(prompt + " centered on plain white background, studio lighting, "
                                   "single subject, no text")
    url = f"https://image.pollinations.ai/prompt/{q}?width=512&height=512&seed=42&nologo=true"
    out = OUTPUT_DIR / "_tmp" / f"{slug}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    print(f"  ↳ fetching image from pollinations.ai...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (underworld-glb-gen)"})
    with urllib.request.urlopen(req, timeout=120) as r, open(out, "wb") as f:
        shutil.copyfileobj(r, f)
    print(f"  ✓ {out} ({out.stat().st_size/1024:.0f} KB)")
    return out


# --- Step 2: image → GLB ----------------------------------------------------

def image_to_glb_triposr(image_path: pathlib.Path) -> pathlib.Path:
    from gradio_client import Client, handle_file
    c = Client("stabilityai/TripoSR", verbose=False)
    print("  ↳ TripoSR: preprocess (remove background)...")
    processed = c.predict(handle_file(str(image_path)), True, 0.85, api_name="/preprocess")
    print("  ↳ TripoSR: generate mesh (mc_res=256)...")
    obj_path, glb_path = c.predict(handle_file(processed), 256, api_name="/generate")
    return pathlib.Path(glb_path)


def image_to_glb_instantmesh(image_path: pathlib.Path) -> pathlib.Path:
    from gradio_client import Client, handle_file
    c = Client("TencentARC/InstantMesh", verbose=False)
    print("  ↳ InstantMesh: preprocess...")
    processed = c.predict(handle_file(str(image_path)), True, api_name="/preprocess")
    print("  ↳ InstantMesh: generate multiviews (6 angles)...")
    _ = c.predict(handle_file(processed["path"] if isinstance(processed, dict) else processed),
                  75, 42, api_name="/generate_mvs")
    print("  ↳ InstantMesh: make3d (mesh from multiviews)...")
    obj_path, glb_path = c.predict(api_name="/make3d")
    return pathlib.Path(glb_path)


def image_to_glb_hunyuan(image_path: pathlib.Path) -> pathlib.Path:
    """Tencent Hunyuan3D-2 — generally higher quality, larger quota cost."""
    from gradio_client import Client, handle_file
    c = Client("tencent/Hunyuan3D-2", verbose=False)
    # Hunyuan exposes a `/generation_all` endpoint that returns a GLB.
    print("  ↳ Hunyuan3D-2: generation_all...")
    result = c.predict(
        handle_file(str(image_path)),  # image
        "",                              # text prompt (empty when using image)
        50,                              # steps
        7.5,                             # guidance
        1234,                            # seed
        128,                             # octree resolution
        False,                           # remove background (already done)
        False,                           # apply texture? we want untextured for speed
        api_name="/generation_all",
    )
    # Result is typically a tuple containing a model file path
    for r in (result if isinstance(result, (list, tuple)) else [result]):
        if isinstance(r, str) and r.endswith(".glb"):
            return pathlib.Path(r)
        if isinstance(r, dict) and "path" in r and r["path"].endswith(".glb"):
            return pathlib.Path(r["path"])
    raise RuntimeError(f"Hunyuan returned no GLB: {result}")


PROVIDERS = {
    "triposr":     image_to_glb_triposr,
    "instantmesh": image_to_glb_instantmesh,
    "hunyuan":     image_to_glb_hunyuan,
}


# --- Manifest ---------------------------------------------------------------

def update_manifest(slug: str, prompt: str, provider: str, glb_path: pathlib.Path):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    data = {}
    if MANIFEST.exists():
        data = json.loads(MANIFEST.read_text())
    data[slug] = {
        "prompt": prompt,
        "provider": provider,
        "glb": f"/models/generated/{glb_path.name}",
        "generated_at": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "size_bytes": glb_path.stat().st_size,
    }
    MANIFEST.write_text(json.dumps(data, indent=2, sort_keys=True))


# --- CLI --------------------------------------------------------------------

def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s[:60] or f"asset-{int(time.time())}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", help="Text description of the object to generate")
    ap.add_argument("--image", help="Skip image generation; use this file/URL instead")
    ap.add_argument("--provider", choices=list(PROVIDERS), default="triposr")
    ap.add_argument("--name", help="Override the asset slug")
    args = ap.parse_args()

    slug = args.name or slugify(args.prompt)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"=== {slug} ({args.provider}) ===")
    print(f"prompt: {args.prompt}")

    if args.image:
        if args.image.startswith("http"):
            img = OUTPUT_DIR / "_tmp" / f"{slug}-input.png"
            img.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(args.image, img)
        else:
            img = pathlib.Path(args.image)
    else:
        img = text_to_image(args.prompt, slug)

    glb_src = PROVIDERS[args.provider](img)

    dest = OUTPUT_DIR / f"{slug}.glb"
    shutil.copy(glb_src, dest)
    update_manifest(slug, args.prompt, args.provider, dest)

    size_kb = dest.stat().st_size / 1024
    print(f"\n✓ saved {dest.relative_to(REPO)} ({size_kb:.1f} KB)")
    print(f"  manifest: {MANIFEST.relative_to(REPO)}")
    print(f"\nReference from code:  '/models/generated/{slug}.glb'")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
