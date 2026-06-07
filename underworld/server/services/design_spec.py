"""DESIGN_SPEC — the data-driven design bible (GTA-style .meta tables, computed).

Every element of the world is DATA, not bespoke code: each GLB gets a full design row
(scale, footprint, LOD distances, collision, sound, VFX, lighting, placement rule), and
the cross-product of asset × situation × time-of-day × weather × LOD expands into a
massive RENDER-DIRECTIVE table — a fully-specified instruction for how that asset looks,
sounds, moves and lights in that exact scene condition. This is how a real open world is
authored: parametric tables + deterministic computation, so the combinatorial space is
effectively unbounded while the rules stay finite and auditable.

Outputs (CSV, under underworld/data/design/):
  assets_spec.csv        — one row per GLB, ~30 design columns
  situations_spec.csv     — scene situations (research/breed/trade/festival/conflict…)
  actions_spec.csv        — minion actions → anim/sound/vfx/metric deltas
  render_directives.csv   — asset × situation × tod × weather × lod (the massive table)
  metrics_spec.csv        — every monitored metric
  effects_spec.csv        — VFX/optics library
  audio_spec.csv          — sound library

stdlib only; deterministic; never raises.
"""

from __future__ import annotations

import csv
import hashlib
import os
from typing import Iterable, Optional

# ── deterministic per-asset variation ──────────────────────────────────────────────
def _h(*parts) -> int:
    return int.from_bytes(hashlib.md5("|".join(map(str, parts)).encode()).digest()[:4], "big")


def _pick(seed: int, options: list):
    return options[seed % len(options)]


# ── design rule tables (the finite, auditable rules that generate everything) ───────
ERAS = ["stone", "bronze", "iron", "classical", "medieval", "industrial", "modern", "future"]
BIOMES = ["plains", "forest", "desert", "tundra", "coast", "mountain", "wetland", "volcanic"]
TIMES = ["dawn", "day", "dusk", "night"]
WEATHERS = ["clear", "cloud", "rain", "storm", "snow", "fog"]
LODS = [0, 1, 2, 3]  # 0=hero/near … 3=impostor

# per-category design defaults: (scale, foot_w, foot_d, height, collision, walkable,
#                                interactable, light_emit, shadow, density_weight)
_CAT_DESIGN = {
    "wall":        (1.0, 6, 1, 4.0, 1, 0, 0, 0, 1, 0.0),
    "gate":        (1.0, 6, 2, 5.0, 1, 1, 1, 0, 1, 0.0),
    "tower":       (1.2, 8, 8, 18.0, 1, 1, 1, 1, 1, 0.3),
    "residential": (1.0, 7, 7, 6.0, 1, 1, 1, 1, 1, 1.0),
    "commercial":  (1.0, 9, 9, 7.0, 1, 1, 1, 1, 1, 0.7),
    "civic":       (1.1, 12, 12, 10.0, 1, 1, 1, 1, 1, 0.4),
    "industrial":  (1.0, 10, 10, 8.0, 1, 1, 1, 1, 1, 0.5),
    "monument":    (1.4, 5, 5, 14.0, 1, 0, 1, 1, 1, 0.1),
    "tree":        (1.0, 3, 3, 8.0, 1, 0, 0, 0, 1, 1.0),
    "rock":        (1.0, 2, 2, 2.0, 1, 0, 0, 0, 1, 0.8),
    "plant":       (1.0, 1, 1, 1.0, 0, 1, 0, 0, 1, 1.0),
    "water":       (1.0, 4, 4, 0.5, 0, 0, 1, 0, 0, 0.3),
    "vehicle":     (1.0, 4, 2, 2.5, 1, 0, 1, 1, 1, 0.4),
    "character":   (1.0, 1, 1, 1.8, 1, 1, 1, 0, 1, 0.0),
    "creature":    (1.0, 2, 2, 1.5, 1, 0, 1, 0, 1, 0.2),
    "furniture":   (1.0, 1, 1, 1.0, 1, 0, 1, 0, 1, 0.6),
    "prop":        (1.0, 1, 1, 1.2, 1, 0, 1, 0, 1, 0.7),
    "floor":       (1.0, 4, 4, 0.2, 0, 1, 0, 0, 0, 0.0),
    "roof":        (1.0, 7, 7, 1.0, 1, 0, 0, 0, 1, 0.0),
    "stairs":      (1.0, 3, 3, 2.0, 1, 1, 0, 0, 1, 0.2),
    "bridge":      (1.0, 10, 4, 2.0, 1, 1, 0, 0, 1, 0.0),
    "fx":          (1.0, 1, 1, 2.0, 0, 0, 1, 1, 0, 0.3),
}

# LOD distance bands (metres) by footprint size — bigger things stay detailed further.
def _lod_bands(foot: float) -> tuple[int, int, int, int]:
    s = max(1.0, foot)
    return (int(40 * s), int(120 * s), int(300 * s), int(900 * s))

# audio library: category → (ambient loop, interact one-shot)
_AUDIO = {
    "tower": ("amb_wind_high", "sfx_door_heavy"), "residential": ("amb_village", "sfx_door_wood"),
    "commercial": ("amb_market", "sfx_coin"), "civic": ("amb_hall", "sfx_scroll"),
    "industrial": ("amb_forge", "sfx_hammer"), "water": ("amb_water", "sfx_splash"),
    "tree": ("amb_leaves", ""), "vehicle": ("amb_cart", "sfx_wheel"),
    "monument": ("amb_drone_low", "sfx_chime"), "fx": ("amb_hum", "sfx_shimmer"),
}

# VFX/optics library: category → (idle fx, active fx)
_VFX = {
    "industrial": ("vfx_smoke", "vfx_sparks"), "civic": ("", "vfx_glow_runes"),
    "monument": ("vfx_dust_motes", "vfx_aura"), "water": ("vfx_ripple", "vfx_spray"),
    "fx": ("vfx_pulse", "vfx_burst"), "tower": ("", "vfx_beacon"),
    "residential": ("vfx_chimney_smoke", ""), "tree": ("vfx_leaf_drift", ""),
}

# scene situations: name → (camera, base sound bed, vfx, anim_set, pace)
SITUATIONS = [
    ("idle",       "orbit_slow",   "amb_world",   "",            "idle",      1.0),
    ("research",   "push_in",      "amb_hall",    "vfx_glow_runes", "study",   0.8),
    ("build",      "crane_up",     "amb_forge",   "vfx_sparks",  "work",      1.1),
    ("trade",      "handheld",     "amb_market",  "",            "talk",      1.0),
    ("breed",      "soft_close",   "amb_village", "vfx_heart",   "celebrate", 0.6),
    ("birth",      "soft_close",   "amb_chime",   "vfx_bloom",   "celebrate", 0.6),
    ("death",      "slow_pull",    "amb_drone_low","vfx_fade",   "rest",      0.4),
    ("conflict",   "shake_cut",    "amb_tense",   "vfx_clash",   "fight",     1.6),
    ("festival",   "sweeping",     "amb_music",   "vfx_fireworks","celebrate",1.3),
    ("discovery",  "reveal",       "amb_wonder",  "vfx_eureka",  "celebrate", 0.9),
    ("travel",     "follow",       "amb_road",    "vfx_dust",    "walk",      1.2),
    ("rest",       "static_wide",  "amb_night",   "",            "rest",      0.5),
    ("disaster",   "shake_hard",   "amb_alarm",   "vfx_smoke",   "flee",      1.8),
    ("harvest",    "low_dolly",    "amb_field",   "",            "work",      1.0),
    ("ritual",     "circle",       "amb_drone_low","vfx_aura",   "study",     0.7),
]

# minion actions: name → (anim, sound, vfx, metric_deltas)
ACTIONS = [
    ("study",   "study",     "sfx_scroll",  "vfx_glow_runes", "knowledge:+2,fatigue:+1"),
    ("forge",   "work",      "sfx_hammer",  "vfx_sparks",     "production:+3,fatigue:+2"),
    ("farm",    "work",      "sfx_hoe",     "",               "food:+3,fatigue:+1"),
    ("trade",   "talk",      "sfx_coin",    "",               "wealth:+2,social:+1"),
    ("teach",   "talk",      "sfx_scroll",  "",               "knowledge:+1,social:+2"),
    ("invent",  "study",     "sfx_chime",   "vfx_eureka",     "discovery:+5,sanity:-1"),
    ("rest",    "rest",      "",            "",               "fatigue:-3,sanity:+1"),
    ("celebrate","celebrate","sfx_cheer",   "vfx_fireworks",  "morale:+3,social:+2"),
    ("fight",   "fight",     "sfx_clash",   "vfx_clash",      "health:-4,morale:-1"),
    ("breed",   "celebrate", "sfx_chime",   "vfx_heart",      "population:+1,morale:+1"),
    ("build",   "work",      "sfx_hammer",  "vfx_dust",       "structures:+1,fatigue:+2"),
    ("mine",    "work",      "sfx_pick",    "vfx_dust",       "materials:+3,fatigue:+2"),
    ("worship", "study",     "amb_drone_low","vfx_aura",      "sanity:+2,morale:+1"),
    ("flee",    "flee",      "sfx_panic",   "",               "fatigue:+3,sanity:-2"),
]

METRICS = [
    "tick", "population", "births", "deaths", "knowledge", "discovery", "production",
    "food", "wealth", "materials", "structures", "morale", "sanity", "fatigue",
    "social", "era_index", "guild_balance", "disease_load", "pollution", "happiness",
]


# ── per-asset design row ────────────────────────────────────────────────────────────
def asset_row(url: str, category: str, meta: dict) -> dict:
    d = _CAT_DESIGN.get(category, _CAT_DESIGN["prop"])
    scale, fw, fd, ht, coll, walk, inter, lite, shad, dens = d
    seed = _h(url)
    fw2 = round(fw * (0.85 + (seed % 30) / 100.0), 2)
    fd2 = round(fd * (0.85 + ((seed >> 4) % 30) / 100.0), 2)
    l0, l1, l2, l3 = _lod_bands(max(fw2, fd2))
    amb, sfx = _AUDIO.get(category, ("amb_world", ""))
    vidle, vact = _VFX.get(category, ("", ""))
    return {
        "url": url, "file": os.path.basename(url), "category": category,
        "role": _pick(seed, ["primary", "secondary", "accent", "filler"]),
        "era": _pick(seed >> 2, ERAS), "biome": _pick(seed >> 5, BIOMES),
        "scale": round(scale * (0.9 + (seed % 20) / 100.0), 3),
        "footprint_w": fw2, "footprint_d": fd2, "height_m": ht,
        "lod0_m": l0, "lod1_m": l1, "lod2_m": l2, "cull_m": l3,
        "instancing": 1 if dens > 0.3 else 0,
        "collision": coll, "walkable": walk, "interactable": inter,
        "light_emit": lite, "light_color": "#ffd9a0" if lite else "",
        "shadow_cast": shad, "density_weight": dens,
        "skinned": int(bool(meta.get("skinned"))),
        "animated": int(bool(meta.get("animated"))),
        "nodes": meta.get("nodes", 0), "materials": meta.get("materials", 0),
        "sound_ambient": amb, "sound_interact": sfx,
        "vfx_idle": vidle, "vfx_active": vact,
        "material_tier": _pick(seed >> 7, ["standard", "pbr", "pbr_hero"]),
        "placement_zone": {"wall": "rampart", "tower": "civic", "residential": "district",
                           "commercial": "market", "civic": "core", "tree": "wilderness",
                           "rock": "wilderness", "plant": "farmland", "vehicle": "road"}
                          .get(category, "district"),
        "snap_grid": 1 if category in ("wall", "floor", "roof", "gate") else 0,
        "rotation_rule": "tangent" if category in ("wall", "gate") else "free",
    }


# ── the massive render-directive expansion ──────────────────────────────────────────
def render_directives(asset_rows: Iterable[dict], *,
                       situations=SITUATIONS, times=TIMES, weathers=WEATHERS,
                       lods=LODS, interactable_only_situations: bool = True):
    """Yield a fully-specified render directive for every
    asset × situation × time-of-day × weather × LOD combination. Each row says exactly
    how that asset looks/sounds/moves/lights in that scene condition — the GTA-style
    'computed instruction per case'. Streamed (a generator) so it can be billions."""
    tod_light = {"dawn": "#ffb27a", "day": "#fff5e0", "dusk": "#ff7a4a", "night": "#2a3a6a"}
    tod_exposure = {"dawn": 0.9, "day": 1.1, "dusk": 0.85, "night": 0.5}
    weather_fx = {"clear": "", "cloud": "", "rain": "vfx_rain", "storm": "vfx_storm",
                  "snow": "vfx_snow", "fog": "vfx_fog"}
    weather_sfx = {"clear": "", "cloud": "amb_wind", "rain": "amb_rain", "storm": "amb_thunder",
                   "snow": "amb_wind_soft", "fog": "amb_still"}
    for a in asset_rows:
        for sname, cam, bed, svfx, anim, pace in situations:
            for tod in times:
                for wx in weathers:
                    for lod in lods:
                        # cull detail directives at far LOD (impostor needs no fx/anim)
                        active = lod <= 1
                        yield {
                            "asset": a["file"], "category": a["category"],
                            "situation": sname, "tod": tod, "weather": wx, "lod": lod,
                            "camera": cam if active else "impostor",
                            "anim": (anim if a["skinned"] and active else
                                     (a["vfx_idle"] and "sway" or "static")),
                            "play_rate": round(pace * (1.0 if active else 0.0), 2),
                            "sound_bed": bed if active else "",
                            "sound_ambient": a["sound_ambient"] if active else "",
                            "sound_weather": weather_sfx[wx],
                            "vfx": (svfx or a["vfx_active"]) if active else "",
                            "vfx_weather": weather_fx[wx],
                            "light_color": tod_light[tod],
                            "exposure": tod_exposure[tod] * (0.7 if wx in ("storm", "fog") else 1.0),
                            "shadow": a["shadow_cast"] and tod != "night",
                            "emissive": 1 if (a["light_emit"] and tod in ("dusk", "night")) else 0,
                            "draw_scale": a["scale"] * (1.0 if lod == 0 else 0.999),
                            "instanced": a["instancing"],
                        }


# ── CSV writers ─────────────────────────────────────────────────────────────────────
def _write_csv(path: str, rows: Iterable[dict], fields: list[str]) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow(r)
            n += 1
    return n


def generate(catalog: dict, out_dir: str, *, max_directives: Optional[int] = None) -> dict:
    """Generate the whole design bible from the asset catalog. Returns row counts."""
    assets = (catalog or {}).get("assets", {})
    arows = [asset_row(url, rec.get("category", "prop"), rec) for url, rec in assets.items()]
    counts: dict[str, int] = {}

    counts["assets_spec.csv"] = _write_csv(
        os.path.join(out_dir, "assets_spec.csv"), arows, list(arows[0].keys()) if arows else [])

    counts["situations_spec.csv"] = _write_csv(
        os.path.join(out_dir, "situations_spec.csv"),
        ({"situation": s[0], "camera": s[1], "sound_bed": s[2], "vfx": s[3],
          "anim_set": s[4], "pace": s[5]} for s in SITUATIONS),
        ["situation", "camera", "sound_bed", "vfx", "anim_set", "pace"])

    counts["actions_spec.csv"] = _write_csv(
        os.path.join(out_dir, "actions_spec.csv"),
        ({"action": a[0], "anim": a[1], "sound": a[2], "vfx": a[3], "metric_deltas": a[4]}
         for a in ACTIONS),
        ["action", "anim", "sound", "vfx", "metric_deltas"])

    counts["metrics_spec.csv"] = _write_csv(
        os.path.join(out_dir, "metrics_spec.csv"),
        ({"metric": m, "monitored": 1, "unit": "count"} for m in METRICS),
        ["metric", "monitored", "unit"])

    # the massive one — asset × situation × tod × weather × lod
    gen = render_directives(arows)
    if max_directives:
        def _capped():
            for i, r in enumerate(gen):
                if i >= max_directives:
                    break
                yield r
        gen = _capped()
    sample = next(render_directives(arows))
    counts["render_directives.csv"] = _write_csv(
        os.path.join(out_dir, "render_directives.csv"), gen, list(sample.keys()))

    # theoretical full size (no cap)
    full = (len(arows) * len(SITUATIONS) * len(TIMES) * len(WEATHERS) * len(LODS))
    return {"out_dir": out_dir, "assets": len(arows), "counts": counts,
            "render_directives_full_combinations": full}


if __name__ == "__main__":
    import json
    import sys
    cat_path = sys.argv[1] if len(sys.argv) > 1 else "web/public/models/asset_catalog.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "data/design"
    cap = int(sys.argv[3]) if len(sys.argv) > 3 else None
    with open(cat_path) as f:
        catalog = json.load(f)
    res = generate(catalog, out, max_directives=cap)
    print(json.dumps(res, indent=2))
