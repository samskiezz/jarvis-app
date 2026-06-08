"""gen_manifest.py — HEADLESS manifest pre-generator (no Unreal Editor needed).

The Editor commandlet `import_glbs.py` does two things: (1) import each GLB as a cooked Nanite
StaticMesh (needs the Editor), and (2) write `manifest.json` — the glb-url → /Game asset-path map
the C++ world spawner loads at runtime (`AUnderworldWorldManager::LoadManifest`). Step (2) is
PURELY DETERMINISTIC from the filenames + `asset_catalog.json`, so we can generate it now, headless,
to (a) hand the C++ resolver a real manifest before the Editor step and (b) VALIDATE the asset set:
name collisions (two GLBs that import to the same /Game path → one silently overwrites the other)
and category coverage. Run the Editor import later and it produces the identical map.

Convention (must match import_glbs.py AND the C++ resolver):
    web/public/models/<rel>/<name>.glb   ->   /Game/UnderworldAssets/<category>/<SafeName>
    by_url key = "/models/<rel>/<name>.glb"  (exactly what the backend chunk/scene-state emit)
"""
from __future__ import annotations

import json
import os
import re
import sys

GLB_ROOT = os.environ.get("UW_GLB_ROOT", "/opt/jarvis-app-1/underworld/web/public/models")
CATALOG = os.environ.get("UW_CATALOG", os.path.join(GLB_ROOT, "asset_catalog.json"))
DEST_ROOT = "/Game/UnderworldAssets"
HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)


def _safe(name: str) -> str:
    """UE asset-name rules: alnum + underscore. MUST mirror import_glbs.py::_safe + the C++ resolver."""
    return re.sub(r"[^A-Za-z0-9_]", "_", os.path.splitext(name)[0])


def _category_maps() -> tuple[dict, dict]:
    """The catalog's `assets` is a DICT keyed by url ("/models/...glb") → {category,url,...}; it also
    has `categories` (cat → [urls]). Return (url→cat, basename→cat) for exact-then-fallback lookup."""
    url_cat, base_cat = {}, {}
    try:
        d = json.load(open(CATALOG))
        assets = d.get("assets", {})
        items = assets.values() if isinstance(assets, dict) else assets
        for a in items:
            if not isinstance(a, dict):
                continue
            url = a.get("url") or ""
            cat = a.get("category") or "prop"
            if url:
                url_cat[url] = cat
                base_cat.setdefault(os.path.basename(url).lower(), cat)
        # also fold in the `categories` map (cat → [urls]) for any urls not in `assets`
        for cat, urls in (d.get("categories") or {}).items():
            for url in urls:
                url_cat.setdefault(url, cat)
                base_cat.setdefault(os.path.basename(url).lower(), cat)
    except Exception as e:  # noqa: BLE001
        print(f"[gen-manifest] catalog unreadable ({e}); all -> prop", file=sys.stderr)
    return url_cat, base_cat


def main() -> int:
    if not os.path.isdir(GLB_ROOT):
        print(f"[gen-manifest] GLB_ROOT missing: {GLB_ROOT}", file=sys.stderr)
        return 2
    url_cat, base_cat = _category_maps()
    by_url, by_cat = {}, {}
    used_paths: dict[str, str] = {}      # /Game path -> the url that owns it (collision-free)
    uncatalogued = 0
    disambiguated = 0

    for dp, _d, files in os.walk(GLB_ROOT):
        for f in sorted(files):
            if not f.lower().endswith((".glb", ".gltf")):
                continue
            src = os.path.join(dp, f)
            rel = os.path.relpath(src, GLB_ROOT).replace(os.sep, "/")
            url = f"/models/{rel}"
            cat = url_cat.get(url) or base_cat.get(f.lower())
            if cat is None:
                cat = "prop"
                uncatalogued += 1
            asset = _safe(f)
            path = f"{DEST_ROOT}/{cat}/{asset}"
            # collision-free: if this /Game path is already owned by a DIFFERENT glb, disambiguate
            # with a short, stable hash of the source sub-path. The manifest is the source of truth,
            # so the C++ resolver follows by_url regardless of the chosen name.
            if path in used_paths and used_paths[path] != url:
                import hashlib
                suffix = hashlib.sha1(rel.encode()).hexdigest()[:6]
                path = f"{DEST_ROOT}/{cat}/{asset}_{suffix}"
                disambiguated += 1
            used_paths[path] = url
            by_url[url] = path
            by_cat.setdefault(cat, []).append(path)

    payload = {"dest_root": DEST_ROOT, "total": len(by_url),
               "categories": {k: len(v) for k, v in sorted(by_cat.items())},
               "by_url": by_url, "by_category": by_cat,
               "_generated_headless": True,
               "_warnings": {"uncatalogued_default_prop": uncatalogued,
                             "disambiguated_collisions": disambiguated}}

    content_dir = os.path.join(PROJ, "Content", "UnderworldAssets")
    os.makedirs(content_dir, exist_ok=True)
    for dst in (os.path.join(HERE, "manifest.json"), os.path.join(content_dir, "manifest.json")):
        json.dump(payload, open(dst, "w"), indent=2)

    print(f"[gen-manifest] {len(by_url)} GLBs -> {len(by_cat)} categories")
    print(f"[gen-manifest] categories: {payload['categories']}")
    print(f"[gen-manifest] uncatalogued (default prop): {uncatalogued}")
    print(f"[gen-manifest] collisions disambiguated (now unique paths): {disambiguated}")
    print(f"[gen-manifest] wrote manifest.json -> {content_dir}/ + {HERE}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
