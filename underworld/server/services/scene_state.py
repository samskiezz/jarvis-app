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


# The sim→scene bridge: a Minion's REAL last_action (from the agent's decide()) maps to
# the BUILDING they go to (a function-tagged slot in the φ/fractal layout) and the
# animation they play there. This is what makes the world show what minions actually do.
_ACTION_MAP: dict[str, tuple[str, str]] = {
    # action            (target building function, animation)
    "eat":              ("market", "rest"),
    "drink":            ("market", "rest"),
    "rest":             ("home", "rest"),
    "sleep":            ("home", "rest"),
    "meditate":         ("monument", "study"),
    "worship":          ("monument", "study"),
    "kb_lookup":        ("academy", "study"),
    "calculate":        ("academy", "study"),
    "study":            ("academy", "study"),
    "research":         ("academy", "study"),
    "experiment":       ("academy", "study"),
    "search_patents":   ("academy", "study"),
    "invent":           ("academy", "celebrate"),
    "discover":         ("academy", "celebrate"),
    "craft":            ("workshop", "work"),
    "forge":            ("workshop", "work"),
    "build":            ("workshop", "work"),
    "mine":             ("workshop", "work"),
    "manufacture":      ("workshop", "work"),
    "trade":            ("market", "talk"),
    "sell":             ("market", "talk"),
    "teach":            ("academy", "talk"),
    "forage":           ("farm", "work"),
    "farm":             ("farm", "work"),
    "harvest":          ("farm", "work"),
    "seek_partner":     ("home", "talk"),
    "breed":            ("home", "celebrate"),
    "fork_self":        ("home", "celebrate"),
    "celebrate":        ("plaza", "celebrate"),
    "fight":            ("gate", "fight"),
    "propose_invention":("academy", "celebrate"),
    "build_scanner":    ("workshop", "work"),
    "socialise":        ("market", "talk"),
    "socialize":        ("market", "talk"),
    "gossip":           ("market", "talk"),
    "patrol":           ("gate", "walk"),
    "explore":          ("plaza", "walk"),
    "heal":             ("home", "rest"),
    "pray":             ("monument", "study"),
}


def _action_target(last_action: str, mood: str) -> tuple[str, str, str]:
    """(action, target_building_function, anim) from the Minion's real last action."""
    a = (last_action or "rest").lower()
    bld, anim = _ACTION_MAP.get(a, ("home", ""))
    return a, bld, anim


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
    # POSITION — server-tracked movement is the source of truth (minions WALK). If the
    # minion hasn't been stepped yet (no kin), fall back to the deterministic spawn spot.
    kin = None
    try:
        from underworld.server.services import movement
        kin = movement.kin_visual(m)
    except Exception:  # noqa: BLE001
        kin = None
    if kin:
        x, z = kin["pos"]
    else:
        x, z = _position(m.id, seed_int, town_radius=town_radius)
    y = _elevation(heightmap, x, z, town_radius=town_radius, scale=terrain_scale)
    anim = _anim_for(mood, m.fatigue or 0.5, m.sanity or 0.85, look["role"])
    # The minion's REAL current activity → where they go + how they animate. Only let the
    # action-map override the mood/fatigue anim when there's an ACTUAL recorded action — a minion
    # the sim hasn't stepped yet (no last_action) must keep its mood-derived state, not be forced
    # to "rest" by the default (which would mask inspired/working bodies as idle).
    recorded_action = (m.brain or {}).get("last_action")
    last_action = recorded_action or "rest"
    action, target_building, act_anim = _action_target(last_action, mood)
    if act_anim and recorded_action is not None:
        anim = act_anim                      # the real task overrides the idle/mood anim
    # prominence: masters / high-reputation Minions render larger & adorned
    prominence = round(min(1.5, 0.8 + 0.14 * (m.reputation or 1.0)), 3)

    # STORYLINE → ASSET: the generated machine/prop this Minion is working at (science lab rig,
    # forge, drill, etc.), so the renderer places them AT the right object for their activity.
    using_asset = None
    try:
        from underworld.server.services import scene_assets
        using_asset = scene_assets.using_asset(
            guild, action, look["role"],
            science=(m.brain or {}).get("project_science"), seed=seed_int ^ _h(m.id))
    except Exception:  # noqa: BLE001
        using_asset = None

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
        # MOVEMENT v2 — live velocity/state so the renderer steers + foots the walk cycle
        # instead of teleporting. facing follows the velocity heading when walking.
        "velocity": (kin or {}).get("vel", [0.0, 0.0]),
        "move_state": (kin or {}).get("move_state", "idle"),
        "speed": (kin or {}).get("speed", 3.2),
        "target_pos": (kin or {}).get("target"),
        "facing": (round(math.degrees(math.atan2(kin["vel"][1], kin["vel"][0])), 1)
                   if kin and (kin["vel"][0] or kin["vel"][1]) else round((_h(m.id) % 360), 1)),
        "anim": ("walk" if kin and kin.get("move_state") == "walk" else anim),
        # what the minion is REALLY doing this tick + the building they head to.
        "action": action,
        "target_building": target_building,
        # the generated machine/prop they're working at (storyline → asset)
        "using_asset": using_asset,
        # cognition / sentience (populated by the Global-Workspace cognition loop)
        "thought": (m.brain or {}).get("thought"),
        "awareness": round(float((m.brain or {}).get("awareness", 0.0)), 3),
        "identity": ((m.brain or {}).get("self_model") or {}).get("identity"),
        "drive": (m.brain or {}).get("dominant_drive"),
        "awakened": bool((m.brain or {}).get("awakened_tick")),
        # OVERRIDE PILLAR — is the creator currently wearing this body? (renderers show a halo /
        # hand control to the player for the possessed minion). Authoritative, server-owned.
        "possessed": bool((m.brain or {}).get("controlled_by_creator")),
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
    # THE AI DIRECTOR — the colony's collective consciousness + ambient chatter + any
    # irreversible God-beat, refreshed by the director loop. Hung on the frame for renderers.
    try:
        from underworld.server.services import director
        director_frame = director.frame(world.id)
    except Exception:  # noqa: BLE001
        director_frame = {"overmind": None, "chatter": [], "god_beat": None}
    # OVERRIDE PILLAR — which body (if any) the creator is currently wearing, so every renderer
    # agrees and hands control to the player for that one minion.
    try:
        from underworld.server.services import possession
        possessed_id = possession.possessed_id(world.id)
    except Exception:  # noqa: BLE001
        possessed_id = None
    # WATCHED-CREATOR loop (§4.5/L.8) — attention hotspots + whether the creator is present, so
    # renderers cluster behaviour in / flee where the god is looking.
    try:
        from underworld.server.services import presence
        presence_frame = presence.frame_block(
            world.id, {v["id"]: v["position"] for v in visuals})
    except Exception:  # noqa: BLE001
        presence_frame = {"attention_hotspots": [], "creator_present": False}
    return {
        "world_id": world.id, "tick": world.tick, "era": world.era,
        "sim_year": round(world.sim_year, 1),
        "frame": {
            "time_of_day": time_of_day(world.tick),
            "weather": weather,
            "biome": getattr(seed, "biome_hint", "plains"),
            "epoch": epoch,
            "overmind": director_frame.get("overmind"),
            "chatter": director_frame.get("chatter", []),
            "god_beat": director_frame.get("god_beat"),
            "possessed_id": possessed_id,
            "presence": presence_frame,
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
        "contract_version": 2,
        "note": "Authoritative scene state — WebGL and UE5 render this identically.",
    }
