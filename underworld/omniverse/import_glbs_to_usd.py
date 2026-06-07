"""Batch-convert the catalogued GLBs -> USD for the RTX stage.

Run inside Kit (it uses omni.kit.asset_converter):
  kit --exec import_glbs_to_usd.py --/glb_root=<web/public/models> --/usd_root=<out>

Mirrors the catalog tree: /models/kenney/x.glb -> <usd_root>/kenney/x.usd, so
scene_builder._usd_path_for_glb resolves every layout slot. Converts the glTF PBR
materials to USD/MDL so the RTX path tracer renders the operator's photoreal textures.
Idempotent (skips already-converted). Honest: needs Omniverse Kit; no-op otherwise.
"""

from __future__ import annotations

import asyncio
import os


async def _convert_one(src: str, dst: str) -> bool:
    import omni.kit.asset_converter as ac
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ctx = ac.AssetConverterContext()
    ctx.ignore_materials = False          # keep PBR materials/textures
    ctx.embed_textures = True
    task = ac.get_instance().create_converter_task(src, dst, None, ctx)
    ok = await task.wait_until_finished()
    if not ok:
        import carb
        carb.log_warn(f"[uw-import] failed: {src} -> {task.get_error_message()}")
    return ok


async def main():
    import carb

    s = carb.settings.get_settings()
    glb_root = s.get("/glb_root") or "/opt/jarvis-app-1/underworld/web/public/models"
    usd_root = s.get("/usd_root") or "/Underworld/Assets"
    n = ok = 0
    for dp, _d, files in os.walk(glb_root):
        for f in files:
            if not f.lower().endswith((".glb", ".gltf")):
                continue
            src = os.path.join(dp, f)
            rel = os.path.relpath(src, glb_root).rsplit(".", 1)[0]
            dst = os.path.join(usd_root, rel + ".usd")
            n += 1
            if os.path.exists(dst):
                ok += 1
                continue
            ok += 1 if await _convert_one(src, dst) else 0
    carb.log_info(f"[uw-import] converted/checked {ok}/{n} assets -> {usd_root}")


if __name__ == "__main__":
    asyncio.ensure_future(main())
