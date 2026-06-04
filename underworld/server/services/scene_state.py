"""Canonical scene-state — one renderer-agnostic description of the live world.

The bug behind "the frontend doesn't match the backend": Minions have no position
in the backend, so the WebGL scene *invents* positions client-side from an id
hash. Two renderers (WebGL today, UE5 via Pixel Streaming) would diverge, and
neither is authoritative.

This module makes the backend the single source of truth. `build_scene_state`
emits everything a renderer needs to draw the world identically — Minion
positions, animation states, appearance, mood, and their *active saga* — plus the
world frame (time-of-day, weather, biome, epoch, era, terrain reference). Both the
WebGL scene and the UE5 client consume this exact contract, so they match each
other and the simulation.

Positions are deterministic (id + world seed) so they're stable across frames and
identical on every client, without needing a full server-side movement sim.
"""
from __future__ import annotations

import hashlib
import math

# Animation states a renderer can map to a clip (UE5 AnimBP / three.js mixer).
ANIM_IDLE, ANIM_WALK, ANIM_WORK, ANIM_STUDY, ANIM_TALK, ANIM_REST, ANIM_CELEBRATE = (
    "idle", "walk", "work", "study", "talk", "rest", "celebrate")

# Guild → a stable accent colour + archetypal silhouette hint for appearance.
GUILD_LOOK = {
    "physics": {"color": "#6ea8ff", "role": "scholar"},
    "maths": {"color": "#b48cff", "role": "scholar"},
    "electrical": {"color": "#ffd166", "role": "engineer"},
    "mechanical": {"color": "#ff9f6e", "role": "engineer"},
    "civil": {"color": "#9ad29a", "role": "builder"},
    "materials": {"color": "#c0c0d0", "role": "smith"},
    "computing": {"color": "#5ee6c9", "role": "scholar"},
    "energy": {"color": "#ff6e9f", "role": "engineer"},
    "agriculture": {"color": "#9acd32", "role": "farmer"},
    "patent": {"color": "#d4af37", "role": "clerk"},
    "safety": {"color": "#ff5b5b", "role": "warden"},
}


def _h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest()[:12], 16)


def _position(minion_id: str, seed_int: int, *, town_radius: float = 60.0) -> tuple[float, float]:
    """Deterministic ground position in a settlement disc. Stable per Minion +
    world, identical on every client — the authoritative location."""
    h = _h(f"{seed_int}:{minion_id}")
    # spiral placement: spreads Minions into a town footprint, not a ring
    ang = (h % 10000) / 10000.0 * 2 * math.pi
    r = town_radius * math.sqrt(((h >> 16) % 10000) / 10000.0)
    return round(r * math.cos(ang), 3), round(r * math.sin(ang), 3)


def _elevation(heightmap: list[list[float]] | None, x: float, z: float,
               *, town_radius: float, scale: float) -> float:
    if not heightmap:
        return 0.0
    n = len(heightmap)
    u = int((x / (2 * town_radius) + 0.5) * (n - 1))
    v = int((z / (2 * town_radius) + 0.5) * (n - 1))
    u = max(0, min(n - 1, u)); v = max(0, min(n - 1, v))
    return round(heightmap[v][u] * scale, 3)


def _anim_for(mood: str, fatigue: float, sanity: float, role: str) -> str:
    """Map simulation state → an animation clip the renderer plays."""
    if fatigue < 0.25:
        return ANIM_REST
    if mood in ("inspired", "flow"):
        return ANIM_STUDY if role in ("scholar", "engineer") else ANIM_WORK
    if mood == "content":
        return ANIM_WORK if role in ("builder", "smith", "farmer", "engineer") else ANIM_STUDY
    if mood in ("anxious",) and sanity < 0.4:
        return ANIM_REST
    return ANIM_IDLE


def _tod_phase(frame_tod: dict) -> str:
    """Map the numeric time-of-day frame to a behavior phase name."""
    frac = float(frame_tod.get("fraction", 0.5)) if isinstance(frame_tod, dict) else 0.5
    if frac < 0.2:
        return "night"
    if frac < 0.35:
        return "dawn"
    if frac < 0.7:
        return "day"
    if frac < 0.85:
        return "dusk"
    return "night"


def _life_stage(m) -> str:
    try:
        from underworld.server.services.lifecycle import life_stage
        age = (getattr(m, "age_ticks", None)
               or (getattr(m, "_world_tick", 0) - (m.born_tick or 0)))
        return life_stage(int(age))
    except Exception:
        return "adult"


def _season_for(tick: int, *, year_length: int = 96) -> str:
    q = int((tick % year_length) / (year_length / 4)) % 4
    return ("spring", "summer", "autumn", "winter")[q]


def _companion_for(m) -> str:
    """Which social mode the Minion is in, from their strongest current bond."""
    brain = getattr(m, "brain", None) or {}
    return str(brain.get("companion", "alone"))


def minion_visual(m, *, seed_int: int, heightmap=None, town_radius: float = 60.0,
                  terrain_scale: float = 8.0, saga_title: str | None = None,
                  tod_phase: str = "day", biome: str = "plains", era: str = "iron",
                  weather: str = "clear", season: str = "spring") -> dict:
    """The full visual record for one Minion — position, animation, appearance,
    their current story, AND the micro-behavior the renderer should play out.
    Renderer-agnostic."""
    guild = m.guild.value if hasattr(m.guild, "value") else str(m.guild)
    mood = m.mood.value if hasattr(m.mood, "value") else str(m.mood)
    look = GUILD_LOOK.get(guild, {"color": "#cccccc", "role": "scholar"})
    x, z = _position(m.id, seed_int, town_radius=town_radius)
    y = _elevation(heightmap, x, z, town_radius=town_radius, scale=terrain_scale)
    anim = _anim_for(mood, m.fatigue or 0.5, m.sanity or 0.85, look["role"])
    # prominence: masters / high-reputation Minions render larger & adorned
    prominence = round(min(1.5, 0.8 + 0.14 * (m.reputation or 1.0)), 3)

    # The behavior bridge: expand this Minion's abstract state into the continuous
    # micro-interaction stream (go to bench → sit → operate tool → emote …).
    behavior = None
    try:
        from underworld.server.services.behavior import behavior_for_minion
        role = m.swarm_role.value if hasattr(getattr(m, "swarm_role", None), "value") else \
            str(getattr(m, "swarm_role", "generalist") or "generalist")
        proj_stage = (m.brain or {}).get("project_stage", "hypothesis")
        skill_level = float((m.brain or {}).get("top_skill", 2.0) or 2.0)
        behavior = behavior_for_minion(
            {"last_action": (m.brain or {}).get("last_action", "rest"),
             "guild": guild, "role": role, "mood": mood, "life_stage": _life_stage(m),
             "health": getattr(m, "health", 1.0), "fatigue": getattr(m, "fatigue", 0.85)},
            time_of_day=tod_phase, biome=biome, era=era, project_stage=proj_stage,
            weather=weather, season=season, companion=_companion_for(m), skill_level=skill_level,
        )
    except Exception:
        behavior = None

    return {
        "id": m.id,
        "name": f"{m.name} {m.surname or ''}".strip(),
        "guild": guild, "role": look["role"], "color": look["color"],
        "mood": mood, "generation": m.generation,
        "position": [x, y, z],
        "facing": round((_h(m.id) % 360), 1),
        "anim": anim,
        "scale": prominence,
        "needs": {"hunger": round(m.hunger or 0, 3), "fatigue": round(m.fatigue or 0, 3),
                  "sanity": round(m.sanity or 0, 3)},
        "saga": saga_title or (m.brain or {}).get("saga", {}).get("title"),
        "behavior": behavior,
        # When a Minion has just done CRISPR work, expose the colour-coded helix +
        # edit so the renderer can visualise the unzip and the cut/insert.
        "gene_edit": (m.brain or {}).get("gene_edit"),
        "alive": bool(m.alive),
    }


def time_of_day(tick: int, *, day_length: int = 24) -> dict:
    """Tick → continuous time-of-day so renderers place the sun/moon and grade
    the light identically (matches Lights.diurnal on the WebGL side)."""
    frac = (tick % day_length) / day_length
    sun_angle = frac * 2 * math.pi - math.pi / 2          # sunrise at frac=0
    is_night = frac < 0.25 or frac > 0.75
    return {"fraction": round(frac, 4), "hour": round(frac * 24, 2),
            "sun_angle_rad": round(sun_angle, 4), "is_night": is_night,
            "sun_elevation": round(math.sin(sun_angle), 4)}


def build_scene_state(world, seed, minions, *, heightmap=None, weather: str = "clear",
                      epoch: dict | None = None, town_radius: float = 60.0) -> dict:
    """Assemble the canonical scene every renderer draws. This IS the world the
    backend says exists — positions, looks, stories, and the world frame."""
    seed_int = getattr(seed, "seed_int", 0)
    biome = getattr(seed, "biome_hint", "plains")
    era = getattr(world, "era", "iron")
    tod = time_of_day(world.tick)
    tod_phase = _tod_phase(tod)
    season = _season_for(world.tick)
    for m in minions:
        setattr(m, "_world_tick", world.tick)  # lets _life_stage derive age
    visuals = [minion_visual(m, seed_int=seed_int, heightmap=heightmap,
                             town_radius=town_radius, tod_phase=tod_phase,
                             biome=biome, era=era, weather=weather, season=season)
               for m in minions if m.alive]
    return {
        "world_id": world.id, "tick": world.tick, "era": world.era,
        "sim_year": round(world.sim_year, 1),
        "frame": {
            "time_of_day": time_of_day(world.tick),
            "weather": weather,
            "biome": getattr(seed, "biome_hint", "plains"),
            "epoch": epoch,
        },
        "terrain": {
            "seed": seed_int,
            "biome": getattr(seed, "biome_hint", "plains"),
            "elevation_bias": getattr(seed, "elevation_bias", 0.0),
            "town_radius": town_radius,
            "heightmap_size": len(heightmap) if heightmap else 0,
        },
        "minions": visuals,
        "population": len(visuals),
        "contract_version": 1,
        "note": "Authoritative scene state — WebGL and UE5 render this identically.",
    }
