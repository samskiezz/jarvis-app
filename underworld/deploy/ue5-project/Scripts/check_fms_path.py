#!/usr/bin/env python3
import unreal
EAL = unreal.EditorAssetLibrary
fms = EAL.load_asset("/Game/UnderworldMedia/Videos/vi/video_confrontation")
path = "/tmp/uw_fms_path.txt"
with open(path, "w", encoding="utf-8") as f:
    f.write(f"class={fms.get_class().get_name()}\n")
    f.write(f"file_path={fms.get_editor_property('file_path')}\n")
unreal.log(f"[check-fms] wrote {path}")
