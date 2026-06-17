#!/usr/bin/env python3
"""validate_ue5_prep.py — HEADLESS sanity check before moving to the UE5 Editor / GPU box.

Verifies the in-repo prep that can be done without the engine:
  • GLB manifest is present and non-empty
  • Higgsfield media is staged with 761 entries
  • DefaultGame.ini force-cooks /Game/UnderworldAssets, JarvisAssets, Maps, UnderworldMedia
  • DefaultGame.ini stages the non-uasset manifest files as UFS
  • Underworld.umap exists
  • The commandlet scripts exist
"""
from __future__ import annotations

import configparser
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)

ERRORS: list[str] = []


def error(msg: str) -> None:
    ERRORS.append(msg)
    print(f"[FAIL] {msg}")


def ok(msg: str) -> None:
    print(f"[OK]   {msg}")


def check_path(path: str, desc: str) -> bool:
    if not os.path.exists(path):
        error(f"{desc} missing: {path}")
        return False
    ok(f"{desc}: {path}")
    return True


def main() -> int:
    glb_manifest = os.path.join(PROJ, "Content", "UnderworldAssets", "manifest.json")
    media_manifest = os.path.join(PROJ, "Content", "UnderworldMedia", "media_manifest.json")
    default_game = os.path.join(PROJ, "Config", "DefaultGame.ini")
    umap = os.path.join(PROJ, "Content", "Maps", "Underworld.umap")

    if check_path(glb_manifest, "GLB manifest"):
        data = json.load(open(glb_manifest))
        total = data.get("total", 0)
        if total < 1:
            error("GLB manifest has no entries")
        else:
            ok(f"GLB manifest maps {total} GLBs to /Game assets")

    if check_path(media_manifest, "Higgsfield media manifest"):
        data = json.load(open(media_manifest))
        total = data.get("total", 0)
        by_kind = data.get("by_kind", {})
        if total != 761:
            error(f"media manifest total is {total}, expected 761")
        else:
            ok(f"media manifest has {total} assets ({by_kind})")

    if check_path(default_game, "DefaultGame.ini"):
        # Unreal .ini files aren't strict Python configparser (duplicate keys), so parse raw.
        body = open(default_game).read()
        for path in ("/Game/UnderworldAssets", "/Game/JarvisAssets", "/Game/Maps", "/Game/UnderworldMedia"):
            key = f'+DirectoriesToAlwaysCook=(Path="{path}")'
            if key not in body:
                error(f"DefaultGame.ini missing {key}")
            else:
                ok(f"DefaultGame.ini cooks {path}")
        for dir_name in ("UnderworldAssets", "JarvisAssets", "UnderworldMedia"):
            key = f'+DirectoriesToAlwaysStageAsUFS=(Path="{dir_name}")'
            if key not in body:
                error(f"DefaultGame.ini missing UFS staging for {dir_name}")
            else:
                ok(f"DefaultGame.ini stages {dir_name} as UFS")

    check_path(umap, "Underworld.umap")

    scripts = [
        "gen_manifest.py",
        "import_glbs.py",
        "stage_higgsfield_media.py",
        "make_underworld_materials.py",
        "import_higgsfield_media.py",
        "make_underworld_level.py",
    ]
    for s in scripts:
        check_path(os.path.join(PROJ, "Scripts", s), f"script {s}")

    if ERRORS:
        print(f"\n{len(ERRORS)} issue(s) found — fix before Editor/GPU work.")
        return 1
    print("\nAll headless UE5 prep checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
