#!/usr/bin/env python3
"""import_higgsfield_media.py — UE5 Editor commandlet: import staged Higgsfield media.

Reads Content/UnderworldMedia/media_manifest.json (produced by stage_higgsfield_media.py)
and creates real UE5 assets:
  • images  → UTexture2D via AssetImportTask
  • videos  → FileMediaSource + MediaPlayer + MediaTexture

Video workaround:
  UE5 on Linux has no built-in MP4/H.264 player, so we transcode each staged MP4
  to VP8 WebM with ffmpeg and point the FileMediaSource at the WebM.  The WebMMedia
  plugin (enabled in Underworld.uproject) plays WebM/VP8 on Linux.

Run inside the Editor (headless commandlet):
    UnrealEditor-Cmd Underworld.uproject -run=pythonscript -script=Scripts/import_higgsfield_media.py \
      -unattended -nullrhi -stdout
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
MANIFEST = os.path.join(PROJ, "Content", "UnderworldMedia", "media_manifest.json")

AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary


def _ensure_dir(package_path: str) -> None:
    if not EAL.does_directory_exist(package_path):
        EAL.make_directory(package_path)


def _delete_asset_if_exists(asset_path: str) -> None:
    if EAL.does_asset_exist(asset_path):
        try:
            EAL.delete_asset(asset_path)
        except Exception as e:  # noqa: BLE001
            unreal.log_warning(f"[media-import] failed to delete existing {asset_path}: {e}")


def import_image(name: str, src: str, dest_pkg: str) -> str | None:
    _ensure_dir(dest_pkg)
    asset_name = os.path.basename(src)
    asset_name = os.path.splitext(asset_name)[0]

    task = unreal.AssetImportTask()
    task.filename = src
    task.destination_path = dest_pkg
    task.destination_name = asset_name
    task.automated = True
    task.save = True
    task.replace_existing = True

    try:
        AT.import_asset_tasks([task])
    except Exception as e:  # noqa: BLE001
        unreal.log_warning(f"[media-import] image import failed for {name}: {e}")
        return None

    path = f"{dest_pkg}/{asset_name}"
    unreal.log(f"[media-import] image {name} -> {path}")
    return path


def _content_fs_dir(dest_pkg: str) -> str:
    """Map a /Game/... package path to its filesystem Content directory."""
    parts = dest_pkg.strip("/").split("/")
    if parts and parts[0] == "Game":
        parts = parts[1:]
    return os.path.join(PROJ, "Content", *parts)


def _webm_path(src: str, dest_pkg: str) -> str:
    """Place the transcoded WebM in the project's Content directory next to the staged MP4."""
    base_name = os.path.splitext(os.path.basename(src))[0]
    return os.path.join(_content_fs_dir(dest_pkg), base_name + ".webm")


def _transcode_to_webm(mp4_path: str, webm_path: str) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        unreal.log_error("[media-import] ffmpeg not found; cannot transcode video")
        return False

    # VP8 / WebM — WebMMedia on Linux can play this.  Tune quality/speed as needed.
    # VP8 video + silent Vorbis audio. WebMMedia on Linux requires both a video
    # and an audio track; the source MP4s are silent, so we generate silence.
    cmd = [
        ffmpeg,
        "-y",
        "-i", mp4_path,
        "-f", "lavfi",
        "-i", "anullsrc=r=48000:cl=mono",
        "-c:v", "libvpx",
        "-crf", "10",
        "-b:v", "4M",
        "-auto-alt-ref", "0",
        "-threads", "0",
        "-c:a", "libvorbis",
        "-b:a", "96k",
        "-shortest",
        webm_path,
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as e:
        unreal.log_error(f"[media-import] ffmpeg failed for {mp4_path}: {e}")
        return False
    return True


def import_video(name: str, src: str, dest_pkg: str) -> dict | None:
    _ensure_dir(dest_pkg)

    base_name = os.path.splitext(os.path.basename(src))[0]
    webm_src = _webm_path(src, dest_pkg)
    os.makedirs(os.path.dirname(webm_src), exist_ok=True)

    # Transcode MP4 → WebM if the WebM is missing or stale.
    if not os.path.isfile(webm_src) or os.path.getmtime(src) > os.path.getmtime(webm_src):
        unreal.log(f"[media-import] transcoding {name} -> {webm_src}")
        if not _transcode_to_webm(src, webm_src):
            return None

    # Create / overwrite the media asset triple.
    try:
        _delete_asset_if_exists(f"{dest_pkg}/{base_name}")
        fms = AT.create_asset(base_name, dest_pkg, unreal.FileMediaSource, unreal.FileMediaSourceFactoryNew())
        # Use set_file_path so UE5 converts an absolute Content path into a
        # packaged-build-friendly relative path (./UnderworldMedia/...).
        fms.set_file_path(webm_src)
        EAL.save_loaded_asset(fms)

        _delete_asset_if_exists(f"{dest_pkg}/{base_name}_Player")
        mp = AT.create_asset(base_name + "_Player", dest_pkg, unreal.MediaPlayer, unreal.MediaPlayerFactoryNew())
        mp.set_editor_property("play_on_open", True)
        mp.set_editor_property("loop", True)
        EAL.save_loaded_asset(mp)

        _delete_asset_if_exists(f"{dest_pkg}/{base_name}_Tex")
        mt = AT.create_asset(base_name + "_Tex", dest_pkg, unreal.MediaTexture, unreal.MediaTextureFactoryNew())
        mt.set_editor_property("media_player", mp)
        EAL.save_loaded_asset(mt)
    except Exception as e:  # noqa: BLE001
        unreal.log_warning(f"[media-import] video asset creation failed for {name}: {e}")
        return None

    result = {
        "file_path": webm_src,
        "mp4_path": src,
        "ue5_path": f"{dest_pkg}/{base_name}",
        "media_player": f"{dest_pkg}/{base_name}_Player",
        "media_texture": f"{dest_pkg}/{base_name}_Tex",
    }
    unreal.log(f"[media-import] video {name} -> {result['ue5_path']}")
    return result


def main() -> int:
    if not os.path.isfile(MANIFEST):
        unreal.log_error(f"[media-import] manifest not found: {MANIFEST}")
        return 2

    data = json.load(open(MANIFEST, "r", encoding="utf-8"))
    entries = data.get("entries", {})
    if not entries:
        unreal.log_warning("[media-import] manifest empty")
        return 0

    results: dict[str, dict] = {}
    images_ok, videos_ok, failed = 0, 0, 0

    for name, meta in entries.items():
        kind = meta.get("kind")
        ue5_path = meta.get("ue5_path")
        src = meta.get("source")
        if not kind or not ue5_path or not src or not os.path.isfile(src):
            unreal.log_warning(f"[media-import] skipping {name}: missing meta/source")
            failed += 1
            continue

        dest_pkg = os.path.dirname(ue5_path)
        if kind == "image":
            path = import_image(name, src, dest_pkg)
            if path:
                results[name] = {"texture": path}
                images_ok += 1
            else:
                failed += 1
        elif kind == "video":
            out = import_video(name, src, dest_pkg)
            if out:
                results[name] = out
                videos_ok += 1
            else:
                failed += 1
        else:
            failed += 1

    out_manifest = os.path.join(PROJ, "Content", "UnderworldMedia", "imported_media.json")
    payload = {
        "total": len(results),
        "images": images_ok,
        "videos": videos_ok,
        "failed": failed,
        "assets": results,
    }
    with open(out_manifest, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    unreal.log(f"[media-import] DONE — images={images_ok}, videos={videos_ok}, failed={failed}")
    unreal.log(f"[media-import] wrote {out_manifest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
