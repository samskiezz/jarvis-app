#!/usr/bin/env python3
"""create_media_consumer.py — create a runtime video consumer in Underworld.umap.

Creates a single MediaPlate actor that plays a MediaPlaylist containing all
imported Higgsfield videos.  The playlist asset is saved under
/Game/UnderworldMedia/VideoPlaylist.

Run inside the Editor (headless commandlet):
    UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=Scripts/create_media_consumer.py \
      -unattended -nullrhi -stdout
"""
from __future__ import annotations

import json
import os
import sys

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
MANIFEST = os.path.join(PROJ, "Content", "UnderworldMedia", "imported_media.json")
LEVEL_PATH = "/Game/Maps/Underworld"
PLAYLIST_PKG = "/Game/UnderworldMedia"
PLAYLIST_NAME = "VideoPlaylist"
ACTOR_LABEL = "UW_VideoWall"

AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
ELL = unreal.EditorLevelLibrary


def _load_manifest() -> dict:
    if not os.path.isfile(MANIFEST):
        unreal.log_error(f"[media-consumer] manifest not found: {MANIFEST}")
        sys.exit(2)
    with open(MANIFEST, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _delete_asset_if_exists(asset_path: str) -> None:
    if EAL.does_asset_exist(asset_path):
        try:
            EAL.delete_asset(asset_path)
        except Exception as e:  # noqa: BLE001
            unreal.log_warning(f"[media-consumer] failed to delete {asset_path}: {e}")


def _create_playlist(videos: list[tuple[str, str]]) -> unreal.MediaPlaylist:
    pkg_path = PLAYLIST_PKG
    _delete_asset_if_exists(f"{pkg_path}/{PLAYLIST_NAME}")
    EAL.make_directory(pkg_path)

    playlist = AT.create_asset(
        PLAYLIST_NAME, pkg_path, unreal.MediaPlaylist, unreal.MediaPlaylistFactoryNew()
    )
    for name, src_path in videos:
        fms = EAL.load_asset(src_path)
        if fms is None:
            unreal.log_warning(f"[media-consumer] could not load {src_path}")
            continue
        playlist.add(fms)
        unreal.log(f"[media-consumer] playlist += {name}")

    EAL.save_loaded_asset(playlist)
    unreal.log(f"[media-consumer] saved playlist {pkg_path}/{PLAYLIST_NAME} "
               f"({playlist.num()} items)")
    return playlist


def _cleanup_existing_plate() -> None:
    for actor in ELL.get_all_level_actors():
        if actor.get_actor_label() == ACTOR_LABEL:
            try:
                ELL.destroy_actor(actor)
                unreal.log(f"[media-consumer] removed existing {ACTOR_LABEL}")
            except Exception as e:  # noqa: BLE001
                unreal.log_warning(f"[media-consumer] failed to remove existing actor: {e}")


def _spawn_plate(playlist: unreal.MediaPlaylist) -> unreal.MediaPlate:
    location = unreal.Vector(0.0, 0.0, 500.0)
    rotation = unreal.Rotator(0.0, 90.0, 0.0)
    actor = ELL.spawn_actor_from_class(unreal.MediaPlate, location, rotation)
    if actor is None:
        raise RuntimeError("spawn_actor_from_class returned None")

    actor.set_actor_label(ACTOR_LABEL)
    actor.tags = ["UW_MediaScreen"]
    actor.set_folder_path("UnderworldMedia")
    actor.set_actor_scale3d(unreal.Vector(4.0, 4.0, 4.0))

    comp = actor.get_component_by_class(unreal.MediaPlateComponent)
    if comp is None:
        raise RuntimeError("MediaPlate actor has no MediaPlateComponent")

    resource = unreal.MediaPlateResource()
    resource.import_text(
        f'(Type=Playlist,SourcePlaylist="{playlist.get_path_name()}")'
    )
    comp.set_editor_property("media_plate_resource", resource)
    comp.set_editor_property("play_on_open", True)
    comp.set_editor_property("auto_activate", True)
    comp.set_editor_property("loop", True)
    comp.set_editor_property("enable_audio", True)
    comp.set_editor_property("play_only_when_visible", False)
    comp.set_editor_property("start_time", 0.0)

    actor.modify()
    comp.modify()
    return actor


def main() -> int:
    data = _load_manifest()
    videos: list[tuple[str, str]] = []
    for name, meta in data.get("assets", {}).items():
        if "media_player" in meta:
            videos.append((name, meta["ue5_path"]))

    if not videos:
        unreal.log_error("[media-consumer] no video assets found")
        return 1

    playlist = _create_playlist(videos)

    if not ELL.load_level(LEVEL_PATH):
        unreal.log_error(f"[media-consumer] failed to load level {LEVEL_PATH}")
        return 1

    _cleanup_existing_plate()
    actor = _spawn_plate(playlist)

    if not ELL.save_current_level():
        unreal.log_error("[media-consumer] failed to save level")
        return 1

    unreal.log(f"[media-consumer] created {actor.get_actor_label()} in {LEVEL_PATH} "
               f"playing {playlist.num()} videos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
