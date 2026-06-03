# Underworld UE5 project (Sims-4-grade renderer)

This scaffolds the **high-fidelity renderer**. UE5 (Lumen GI + Nanite + MetaHumans)
comfortably reaches and exceeds Sims-4-level graphics; this project consumes the
backend's **canonical scene-state contract** so what it renders *is* the live
simulation — same data the WebGL tier uses, so they never diverge.

> Honest scope: the repo provides the project config, the data contract, and the
> integration spec below. The **art** (MetaHuman Minions, furnished homes/lots,
> the neighbourhood) is asset work you drop in — that's the one thing code can't
> author. Everything to *drive* and *stream* it is here + in `../pixelstream/`.

## The data bridge (already live on the backend)

`GET /worlds/{id}/scene-state` returns the authoritative scene:

```jsonc
{
  "tick": 75, "era": "bronze",
  "frame": { "time_of_day": { "hour": 14.2, "sun_elevation": 0.6, "is_night": false },
             "weather": "clear", "biome": "forest", "epoch": { "name": "Iron Smelting" } },
  "terrain": { "seed": 5117306289, "biome": "forest", "town_radius": 60, "heightmap_size": 64 },
  "minions": [
    { "id": "...", "name": "Ada Volt", "guild": "physics", "role": "scholar",
      "color": "#6ea8ff", "position": [12.3, 1.1, -8.4], "facing": 210.0,
      "anim": "study", "scale": 1.0, "mood": "inspired",
      "saga": "The Rise of Ada Volt the Physics" }
  ]
}
```

Positions, animation states, appearance and each Minion's **saga** are
backend-owned → both WebGL and UE5 render the identical world.

## UE5-side integration (what to build in the editor)

1. **`SceneStateClient` actor** — on BeginPlay, opens an HTTP poll (or WebSocket)
   to `wss://<backend>/worlds/{id}/scene-state` every ~500 ms (or subscribe to the
   `/stream` SSE). Parse with `JsonBlueprintUtilities`.
2. **`MinionActor`** (MetaHuman-based) — spawned/updated from each `minions[]`
   entry: lerp to `position`, set `facing`, drive the AnimBP state machine from
   `anim` (idle/walk/work/study/talk/rest/celebrate), tint guild accent from
   `color`, scale by `scale` (masters render larger), float the `saga` title as a
   nameplate.
3. **World frame** — drive a Directional Light + Sky Atmosphere from
   `frame.time_of_day` (sun elevation), swap a weather VFX from `frame.weather`,
   pick the landscape material set from `terrain.biome`, sculpt the `Landmass`
   landscape from the backend heightmap (`GET /worlds/{id}/map`).
4. **PixelStreaming** — already enabled in `Underworld.uproject`; the packaged
   build is launched headless by `../pixelstream/run-ue5.sh`.

## Build → stream → see it

```bash
# 1. open Underworld.uproject in UE5.5, add MetaHuman Minions + environment art
# 2. Platforms -> Linux -> Package Project   (output -> ../pixelstream/game/)
# 3. cd ../pixelstream && follow that README  (vast.ai deploy + Stream UE5 toggle)
# 4. capture a true screenshot:  python ../pixelstream/capture_stream.py https://<host>/
```

## Why this matches the simulation
Every visible thing — where a Minion stands, what they're doing, who's a master,
which story they're living, the time of day, the weather, the epoch — comes from
`scene-state`, which the backend builds from the *same* DB the simulation runs on.
There is no second source of truth.
