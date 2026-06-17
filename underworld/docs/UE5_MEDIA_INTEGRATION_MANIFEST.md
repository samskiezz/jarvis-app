# UE5 Media Integration Manifest — Underworld Rendered Assets

This doc maps every Higgsfield-rendered image and video to its UE5 placement so the 2D promo library becomes part of the playable world.

**Source manifest:** `underworld/data/media_assets/higgsfield_master_manifest.json`  
**Current library:** 761 assets (667 images + 94 videos), ~4.1 GB downloaded.

---

## 1. What these assets are (and are not)

- **Are:** high-quality 2D images and cinematic video clips.
- **Are not:** 3D meshes. They cannot be "stitched to UE5 mesh" directly as geometry.
- **How they fit UE5:** as textures on planes, decals, UI gallery cards, loading screens, media-texture billboards, and skybox backplates.

For true 3D playable geometry you still need the **840 base GLB meshes** (~20,000 Tripo credits) described in `data/master/PACKS.md` and `MASTER-GLB-LIST.md`.

---

## 2. Quick import into UE5

1. Download URLs from the manifest (CDN links are public).
2. Import images into `/Game/UnderworldMedia/Images/`.
3. Import videos into `/Game/UnderworldMedia/Videos/` (auto-creates MediaTexture + MediaPlayer).
4. Create materials:
   - `M_UI_Card` — unlit, masked, for UI gallery cards.
   - `M_Billboard` — unlit, double-sided, for world-space posters/billboards.
   - `M_Decal` — decal material for ground/wall posters.
5. Place billboard actors in `/Game/Maps/Underworld` using the appropriate material.

---

## 3. Asset placement map

### World-space billboards & posters
| Asset pattern | UE5 placement | Purpose |
|---------------|---------------|---------|
| `hero_world_poster` | City plaza mega-screen / main menu background | Key art |
| `era_*` | Museum / archive building interior walls | Era gallery |
| `biome_*` | Transit station backdrops / travel agency screens | Biome travel ads |
| `biome_weather_*` | Weather-control station screens / skybox hints | Environmental state |
| `building_*` | Corresponding civic building exterior sign | Building identity |
| `interior_*` | Matching interior walls | Room ambience |
| `interior2_*` | Secondary civic interiors (courtroom, server room, greenhouse, etc.) | Room ambience |
| `guild_*` & `guild_group_*` | Guild hall banners and recruitment posters | Faction identity |
| `guild_emotion_*` | Minion barracks mood boards / training posters | Guild character |
| `cross_*` | Era-district transition zones | District theming |
| `alt_cross_*` | Alternate era×biome establishing shots | Loading screens / gallery variants |
| `landmark_*` | Civic monument billboards / map icons | Landmark identity |
| `detail_building_*` | Civic building detail close-ups | Signage / info panels |
| `detail_tech_*` | Era-specific technology detail shots | Museum / research displays |
| `night_city_*` | Night-time cityscape backplates | Skybox / neon district backdrops |
| `guild_video_*` | Guild identity cinematic clips | Guild hall screens / recruitment loops |
| `saga_video_*` | Saga archetype cinematic clips | Story timeline / finale cutscenes |
| `soul_id_*` | Soul ID portrait gallery / character selection | Recurring hero minion roster |
| `hero_world_poster_*` | Seasonal/variant hero backdrops | Main menu / mega-screen variants |

### UI gallery / loading screens
| Asset pattern | UI screen |
|---------------|-----------|
| `situation_*` | Chronicle / event log cards |
| `saga_*` | Story timeline panels |
| `emotion_*` | Minion inspection emotion wheel |
| `lifestage_*` | Lifecycle tutorial screens |
| `interaction_*` | Social tutorial / relationship panels |
| `matrix_tod_*_*` | Weather/time preview in world settings |

### Media-texture screens / cinematic playback
| Asset pattern | Placement |
|---------------|-----------|
| `hero_world_trailer` | Main menu / attract mode loop |
| `video_confrontation` | Awakening story beat trigger |
| `video_god_bless`, `gameplay_bless` | Bless power cinematic |
| `gameplay_smite` | Smite power cinematic |
| `gameplay_cull` | Cull power cinematic |
| `gameplay_possession` | Possession transition |
| `gameplay_birth` / `gameplay_death` | Lifecycle event overlays |
| `gameplay_research`, `gameplay_build`, `gameplay_trade`, `gameplay_combat`, etc. | Tutorial videos / propaganda screens |
| `gameplay_farm`, `gameplay_forge`, `gameplay_market`, `gameplay_lab`, `gameplay_march`, `gameplay_storm`, `gameplay_funeral`, `gameplay_wedding`, `gameplay_riot`, `gameplay_resurrect`, `gameplay_trial`, `gameplay_fire`, `gameplay_flood`, `gameplay_time_warp`, `gameplay_ai_awakening`, `gameplay_graduation`, `gameplay_arrest`, `gameplay_protest`, `gameplay_space_launch`, `gameplay_surgery`, `gameplay_election`, `gameplay_concert` | Expanded gameplay vignettes |
| `video_weather_transition` | Weather system preview |
| `video_saga_*` | Saga finale cutscenes |
| `gameplay_era_transition` | Era advancement cutscene |
| `gameup_*` | Special god-pov intervention clips |

---

## 4. Manifest field reference

Each entry in `higgsfield_master_manifest.json` contains:

```json
{
  "name": "hero_world_poster",
  "kind": "image|video",
  "url": "https://...",
  "local_path": "data/media_assets/higgsfield_downloads/...",
  "status": "completed",
  "model": "seedream|kling-v2-1|dop-preview|...",
  "era": "modern",
  "biome": "plains",
  "guild": "physics",
  "situation": "research",
  "saga": "prodigy",
  "emotion": "joy",
  "building": "school",
  "tod": "dusk",
  "weather": "clear",
  "aspect_ratio": "16:9",
  "duration": 5
}
```

Use `name` prefix matching to batch-assign placements (e.g., all `building_*` go on civic signs).

---

## 5. Render rounds summary

| Round | Assets | Credits | Notes |
|-------|--------|---------|-------|
| Round 1 | 152 | ~584 | Core world, eras, biomes, guilds, situations, sagas, emotions, buildings, weather matrix, hero videos |
| Round 2 | 58 | ~214 | Era×biome cross shots, guild groups, interiors, extended gameplay videos |
| Round 3 | 206 | ~482 | Full era×biome matrix, biome weather studies, guild situations, landmarks, civic interiors, more gameplay |
| Round 4 | 9 | ~18 | Cleanup of remaining era×biome and weather gaps, one landmark, one guild portrait |
| Round 5 | 158 | ~454 | Alternate era×biome shots, detail stills, guild/saga/gameplay videos, night city backplates |
| Round 6 | 42 | ~156 | Final gap fill: missing emotions, lifestages, weather matrix, soul IDs, failed retries, extra gameplay videos |
| Round 7 | 136 | ~314 | Optional completion: full guild×situation matrix, cloudy weather matrix, more Soul IDs, hero variants, extra gameplay videos |
| **Total** | **761** | **~2,222** | **667 images + 94 videos, ~4.1 GB local media** |

Remaining Higgsfield budget: ~0 credits (overspent by ~212 against the 2,010 credit budget; Higgsfield is complete).

---

## 6. Blocker: playable 3D world

To make this world **playable** (walkable, spawnable minions, buildings you enter), UE5 still needs:

1. **840 base GLB meshes** — characters, buildings, props, vehicles, flora, sky/weather.
   - Cost: ~20,000 Tripo3D credits (see `data/master/PACKS.md`).
   - 43 are still in AUTHOR backlog (see `MASTER-GLB-LIST.md`).
2. **Unreal Editor 5.5** on a workstation to import, rig, build the level.
3. **GPU render box** with Vulkan + NVENC for Pixel Streaming.
   - See `deploy/ue5-project/UE5-FINISH-RUNBOOK.md`.

The C++ runtime, scene-state contract, and asset importer are already done in this repo. What remains is art generation + Editor work + packaging.

---

## 7. Next action if you want playable UE5

Provide a **Tripo3D API key/credits** and I can:
- Generate the 43 backlog GLBs headlessly.
- Update the UE5 manifest (`Content/UnderworldAssets/manifest.json`).
- Produce the Editor import commandlet script.

Without Tripo credits, the best I can deliver is the 2D media library you now have.
