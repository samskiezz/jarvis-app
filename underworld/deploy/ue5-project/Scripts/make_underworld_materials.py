#!/usr/bin/env python3
"""make_underworld_materials.py — headless Editor commandlet to create the core media materials.

Creates three reusable materials in /Game/UnderworldMedia/Materials:
  • M_Billboard   — unlit, double-sided, translucent blend, texture param BaseTexture
  • M_UI_Card     — unlit, masked, two-sided off, texture param BaseTexture
  • M_Decal       — decal blend, texture param BaseTexture

These are referenced by the billboard / UI gallery spawners. Run once after the project
compiles, before importing media.
"""
from __future__ import annotations

import os
import sys

import unreal

PKG = "/Game/UnderworldMedia/Materials"

ME = unreal.MaterialEditingLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary


def _tex_param(mat, name: str, default_path: str = ""):
    p = ME.create_material_expression(mat, unreal.MaterialExpressionTextureSampleParameter2D, -420, 0)
    p.set_editor_property("parameter_name", name)
    if default_path:
        tex = unreal.load_asset(default_path)
        if tex:
            p.set_editor_property("texture", tex)
    return p


def _make(name: str, blend, shading, two_sided: bool):
    path = f"{PKG}/{name}"
    if EAL.does_asset_exist(path):
        EAL.delete_asset(path)
    mat = AT.create_asset(name, PKG, unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("blend_mode", blend)
    mat.set_editor_property("shading_model", shading)
    mat.set_editor_property("two_sided", two_sided)

    tex = _tex_param(mat, "BaseTexture")
    ME.connect_material_property(tex, "", unreal.MaterialProperty.MP_BASE_COLOR)
    ME.connect_material_property(tex, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

    # For masked/UI cards, route alpha to opacity mask.
    if blend in (unreal.BlendMode.BLEND_MASKED,):
        ME.connect_material_property(tex, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    elif blend == unreal.BlendMode.BLEND_TRANSLUCENT:
        ME.connect_material_property(tex, "A", unreal.MaterialProperty.MP_OPACITY)

    ME.recompile_material(mat)
    EAL.save_asset(path)
    unreal.log(f"[materials] {path}")
    return mat


def main() -> int:
    if not EAL.does_directory_exist(PKG):
        EAL.make_directory(PKG)

    _make("M_Billboard", unreal.BlendMode.BLEND_TRANSLUCENT, unreal.MaterialShadingModel.MSM_UNLIT, True)
    _make("M_UI_Card", unreal.BlendMode.BLEND_MASKED, unreal.MaterialShadingModel.MSM_UNLIT, False)
    _make("M_Decal", unreal.BlendMode.BLEND_TRANSLUCENT, unreal.MaterialShadingModel.MSM_UNLIT, True)

    unreal.log("[materials] Underworld media materials ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
