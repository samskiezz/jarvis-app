"""ASSET_CATALOG — crawl, classify and index every GLB so the world can place them.

The linchpin (BUILD-PLAN Phase 0): with thousands of GLBs nothing downstream — the
φ/fractal layout, the renderers, the minions, the loader — can decide WHICH model is a
wall vs a house vs a tree. This builds a deterministic catalog:

  * crawl every .glb/.gltf under the assets root,
  * read the glTF/GLB header for cheap metadata (skinned? animated? node count, size),
  * CLASSIFY each into a category from path + filename keywords (covers the Kenney kits
    by directory and the named Tripo customs by keyword); anything unresolved is tagged
    ``prop`` and listed under ``unclassified`` so a GPU vision pass (minicpm-v) can
    refine it later,
  * emit a manifest: ``{categories: {cat: [rel_path…]}, assets: {rel_path: {meta}}}``.

The layout engine consumes ``categories``; the renderer resolves a slot's category to a
concrete GLB. stdlib only; never raises on a single bad file.
"""

from __future__ import annotations

import json
import os
import struct
from typing import Optional

# Canonical categories the layout + renderer understand.
CATEGORIES = (
    "wall", "gate", "tower", "floor", "roof", "stairs", "bridge",
    "residential", "commercial", "civic", "industrial", "monument",
    "tree", "rock", "plant", "water", "terrain",
    "vehicle", "character", "creature", "furniture", "prop", "fx",
)

# Directory → default category (the Kenney kits are cleanly named by folder).
_DIR_CATEGORY = {
    "city-kit-suburban": "residential",
    "city-kit-commercial": "commercial",
    "city-kit-roads": "floor",
    "castle-kit": "wall",
    "fantasy-town": "prop",
    "nature-kit": "tree",
    "car-kit": "vehicle",
    "mini-characters": "character",
    "blocky-characters": "character",
}

# Filename keyword → category (ordered: first match wins). Catches the named Tripo
# customs ("hay_cart", "mind_upload_substrate", "stone_wall"…) and refines kit items.
_KEYWORD_CATEGORY: tuple[tuple[tuple[str, ...], str], ...] = (
    (("flag", "banner", "pennant"), "prop"),
    (("siege", "ballista", "catapult", "trebuchet", "ram-", "battering"), "vehicle"),
    (("wall", "rampart", "palisade", "fence", "barrier"), "wall"),
    (("gate", "portcullis", "door", "archway"), "gate"),
    (("tower", "spire", "turret", "obelisk", "watchtower"), "tower"),
    (("roof", "rooftop"), "roof"),
    (("stair", "steps", "ladder"), "stairs"),
    (("bridge",), "bridge"),
    (("floor", "road", "path", "street", "tile", "pavement", "ground"), "floor"),
    (("house", "hut", "home", "cottage", "cabin", "residence", "dwelling", "tent"), "residential"),
    (("shop", "store", "market", "stall", "tavern", "inn", "bank", "office", "commercial"), "commercial"),
    (("temple", "shrine", "church", "hall", "palace", "castle", "keep", "academy", "library", "guild"), "civic"),
    (("forge", "factory", "mill", "mine", "workshop", "kiln", "smithy"), "industrial"),
    (("monument", "statue", "altar", "pillar", "monolith"), "monument"),
    (("tree", "oak", "pine", "palm", "bush", "shrub", "log", "stump"), "tree"),
    (("rock", "stone", "boulder", "cliff", "mountain", "ore"), "rock"),
    (("flower", "grass", "plant", "mushroom", "fern", "crop", "wheat", "hay"), "plant"),
    (("water", "river", "lake", "pond", "well", "fountain", "waterfall"), "water"),
    (("cart", "wagon", "boat", "ship", "car", "vehicle", "chariot"), "vehicle"),
    (("character", "minion", "person", "human", "avatar", "michelle", "xbot", "robot"), "character"),
    (("dragon", "beast", "creature", "animal", "horse", "wolf", "monster"), "creature"),
    (("chair", "table", "bench", "bed", "barrel", "crate", "chest", "furniture"), "furniture"),
    (("substrate", "crystal", "portal", "rune", "glow", "fx", "effect", "aura"), "fx"),
)


def _classify(rel_path: str) -> str:
    p = rel_path.lower()
    name = os.path.basename(p)
    # filename keywords first (most specific), then directory default.
    for kws, cat in _KEYWORD_CATEGORY:
        if any(k in name for k in kws):
            return cat
    for d, cat in _DIR_CATEGORY.items():
        if d in p:
            return cat
    return "prop"


def _glb_meta(path: str) -> dict:
    """Cheap metadata from the GLB/glTF header: skinned? animated? node count.
    Reads only the JSON chunk, not the geometry. Never raises."""
    meta = {"skinned": False, "animated": False, "nodes": 0, "materials": 0}
    try:
        meta["bytes"] = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(12)
            if head[:4] == b"glTF":  # binary GLB
                # chunk 0 is JSON
                clen = struct.unpack("<I", f.read(4))[0]
                f.read(4)  # chunk type
                gltf = json.loads(f.read(clen).decode("utf-8", "ignore"))
            else:  # text .gltf
                f.seek(0)
                gltf = json.loads(f.read().decode("utf-8", "ignore"))
        meta["skinned"] = bool(gltf.get("skins"))
        meta["animated"] = bool(gltf.get("animations"))
        meta["nodes"] = len(gltf.get("nodes", []))
        meta["materials"] = len(gltf.get("materials", []))
    except Exception:  # noqa: BLE001 - one bad file never sinks the crawl
        pass
    return meta


def build_catalog(root: str, *, url_prefix: str = "/models",
                  with_meta: bool = True, limit: Optional[int] = None) -> dict:
    """Crawl ``root`` for GLBs, classify each, and return the catalog manifest.

    ``url_prefix`` is prepended to the path relative to ``root`` so the renderer can
    fetch it directly. Returns ``{categories, assets, counts}``. Never raises."""
    categories: dict[str, list[str]] = {c: [] for c in CATEGORIES}
    assets: dict[str, dict] = {}
    n = 0
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            if not fn.lower().endswith((".glb", ".gltf")):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace("\\", "/")
            url = f"{url_prefix.rstrip('/')}/{rel}"
            cat = _classify(rel)
            categories.setdefault(cat, []).append(url)
            rec = {"category": cat, "url": url}
            if with_meta:
                rec.update(_glb_meta(full))
            assets[url] = rec
            n += 1
            if limit and n >= limit:
                break
        if limit and n >= limit:
            break

    categories = {c: sorted(v) for c, v in categories.items() if v}
    counts = {c: len(v) for c, v in sorted(categories.items(), key=lambda kv: -len(kv[1]))}
    return {
        "version": 1,
        "root": root,
        "total": n,
        "categories": categories,
        "assets": assets,
        "counts": counts,
        # characters that are actually riggable (for minion avatars)
        "rigged_characters": sorted(
            u for u, r in assets.items()
            if r.get("category") == "character" and r.get("skinned")
        ),
    }


def write_catalog(root: str, out_path: str, **kw) -> dict:
    """Build the catalog and write it to ``out_path`` as JSON. Returns the catalog."""
    cat = build_catalog(root, **kw)
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(cat, f)
    except OSError:
        pass
    return cat


if __name__ == "__main__":  # quick CLI: python -m server.services.asset_catalog <root> <out>
    import sys
    r = sys.argv[1] if len(sys.argv) > 1 else "web/public/models"
    o = sys.argv[2] if len(sys.argv) > 2 else "web/public/models/asset_catalog.json"
    c = write_catalog(r, o)
    print(f"catalog: {c['total']} assets -> {o}")
    for cat, k in c["counts"].items():
        print(f"  {cat:14s} {k}")
