#!/usr/bin/env python3
"""Validate that the UW_VideoWall MediaPlate can actually open/play media."""
import time
import unreal

ELL = unreal.EditorLevelLibrary
out = []

if not ELL.load_level("/Game/Maps/Underworld"):
    out.append("FAIL: could not load level")
else:
    plate = None
    for actor in ELL.get_all_level_actors():
        if actor.get_actor_label() == "UW_VideoWall":
            plate = actor
            break
    if plate is None:
        out.append("FAIL: UW_VideoWall actor not found")
    else:
        comp = plate.get_component_by_class(unreal.MediaPlateComponent)
        out.append(f"found component: {comp is not None}")
        out.append(f"before open: is_media_plate_playing={comp.is_media_plate_playing}")
        comp.open()
        time.sleep(0.5)
        comp.play()
        time.sleep(1.0)
        playing = comp.is_media_plate_playing
        out.append(f"after play: is_media_plate_playing={playing}")
        mp = comp.get_media_player()
        if mp:
            out.append(f"media_player is_playing={mp.is_playing}")
            out.append(f"media_player get_url={mp.get_url()}")
            out.append(f"media_player get_time={mp.get_time()}")
            tex = comp.get_media_texture()
            out.append(f"media_texture={tex.get_path_name() if tex else None}")
        if playing:
            out.append("PASS: MediaPlate is playing")
        else:
            out.append("FAIL: MediaPlate did not start playing")

path = "/tmp/uw_validate_consumer.txt"
with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(out))
unreal.log(f"[validate] wrote {path}")
