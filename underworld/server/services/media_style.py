"""Design-brief driven prompt engineering for Underworld media generation.

This module turns simulation state (world era/biome/weather, minion guild/mood,
event kind) into Higgsfield-ready prompts that match the visual thesis defined in
``docs/MINION_DESIGN_BRIEF.md``: GTA 5 photorealism × Sims 5/inZOI life-sim
× Underworld research civilisation.

It is deliberately dependency-light (stdlib only) so it can be imported by the
prompt builder, tests, and any future tooling without dragging in the full
service stack.
"""

from __future__ import annotations

from typing import Any

# ── Style & model defaults ───────────────────────────────────────────────────
SOUL_REALISM_PRESETS = [
    "Warm Ambient",
    "Subtle Flash",
    "Nature Light",
    "Editorial Street Style",
    "Digital Camera",
    "General",
]

# Presets that drift away from photorealism; avoid for the default "gameplay" look.
SOUL_STYLIZED_PRESETS = [
    "Candy Pop",
    "Drain",
    "Surreal Solarization",
    "Frutiger Aero",
    "Retro BW",
    "Y2K Street",
    "Y2K Studio",
    "2000s Band",
]

DEFAULT_IMAGE_STYLE = None  # Higgsfield v2 expects a UUID here; preset names are not accepted.
DEFAULT_NEGATIVE_PROMPT = (
    "cartoon, anime, oil painting, watercolor, sketch, 3D render look, "
    "plastic skin, oversaturated colours, seven fingers, crossed eyes, "
    "blurry faces, smudged details, text, logos, watermarks, distorted anatomy"
)

# ── Camera preset map (situation → Higgsfield DoP/WAN preset id) ───────────────
CAMERA_PRESETS = {
    "idle": "static_hero",
    "research": "push_in",
    "build": "crane_up",
    "trade": "handheld",
    "breed": "soft_close",
    "birth": "soft_close",
    "death": "slow_pull",
    "conflict": "shake_cut",
    "festival": "sweeping",
    "discovery": "reveal",
    "travel": "follow",
    "rest": "static_wide",
    "disaster": "shake_hard",
    "harvest": "low_dolly",
    "ritual": "circle",
}

# Human-readable descriptions used by the frontend.
CAMERA_PRESET_DESCRIPTIONS = {
    "static_hero": "Locked wide/hero shot, no camera motion — safest for realism.",
    "orbit_slow": "Slow 360° orbit around the subject.",
    "push_in": "Camera gently pushes toward the subject.",
    "dolly_in": "Smooth dolly toward the subject.",
    "dolly_out": "Camera pulls back to reveal the scene.",
    "crane_up": "Camera rises vertically for scale.",
    "low_dolly": "Low-angle dolly across the ground.",
    "handheld": "Slight natural camera shake, documentary feel.",
    "soft_close": "Slow intimate push-in.",
    "slow_pull": "Camera slowly pulls back, emotional distance.",
    "shake_cut": "Shaky action shot (use sparingly — high warp risk).",
    "sweeping": "Wide sweeping camera move, great for festivals/landscapes.",
    "reveal": "Dramatic reveal from behind an object.",
    "follow": "Camera follows a moving subject.",
    "static_wide": "Wide establishing shot, locked off.",
    "shake_hard": "Heavy shake for disaster/action (high artifact risk).",
    "circle": "Slow circular orbit, ceremonial/intimate.",
    "tilt_up": "Camera tilts from ground to sky.",
    "boom_down": "Camera descends from above.",
    "fpv_drone": "First-person drone flight through the scene.",
    "crash_zoom": "Fast zoom in (risky on humans; great for objects/discoveries).",
    "bullet_time": "Frozen-time multi-axis spin.",
    "whip_pan": "Fast pan (high motion-blur risk).",
}

# Safety tier for UI warnings.
CAMERA_PRESET_SAFETY = {
    "static_hero": "safe",
    "orbit_slow": "safe",
    "push_in": "safe",
    "dolly_in": "safe",
    "dolly_out": "safe",
    "crane_up": "safe",
    "tilt_up": "safe",
    "boom_down": "safe",
    "static_wide": "safe",
    "low_dolly": "medium",
    "handheld": "medium",
    "soft_close": "medium",
    "slow_pull": "medium",
    "follow": "medium",
    "circle": "medium",
    "reveal": "medium",
    "sweeping": "medium",
    "shake_cut": "risky",
    "shake_hard": "risky",
    "conflict": "risky",
    "whip_pan": "risky",
    "crash_zoom": "risky",
    "bullet_time": "risky",
    "fpv_drone": "risky",
}

# ── Guild visual identity ────────────────────────────────────────────────────
GUILD_LOOK = {
    "physics": {
        "primary": "#0A2540",
        "secondary": "#00D4AA",
        "costume": "lab coat, glowing equations, particle diagrams",
        "role": "scholar",
    },
    "maths": {
        "primary": "#C0C0C0",
        "secondary": "#6A0DAD",
        "costume": "geometric patterned coat, chalk dust, silver accents",
        "role": "scholar",
    },
    "electrical": {
        "primary": "#CFFF04",
        "secondary": "#111111",
        "costume": "insulated gloves, LED strips, Tesla coils",
        "role": "engineer",
    },
    "mechanical": {
        "primary": "#C44D34",
        "secondary": "#7A8B99",
        "costume": "goggles, leather apron, brass gears",
        "role": "engineer",
    },
    "civil": {
        "primary": "#B85C38",
        "secondary": "#F4F4F4",
        "costume": "hard hat, blueprints, surveying tools",
        "role": "builder",
    },
    "materials": {
        "primary": "#B87333",
        "secondary": "#2B2B2B",
        "costume": "metallurgy apron, sample cases, bronze tools",
        "role": "smith",
    },
    "computing": {
        "primary": "#FF00A0",
        "secondary": "#0A0A0A",
        "costume": "holographic screens, fiber-optic cables, magenta tech coat",
        "role": "scholar",
    },
    "energy": {
        "primary": "#39FF14",
        "secondary": "#333333",
        "costume": "reactor-core harness, power cells, plasma visor",
        "role": "engineer",
    },
    "agriculture": {
        "primary": "#4A7C59",
        "secondary": "#E3C565",
        "costume": "overalls, straw hat, biome-appropriate crops",
        "role": "farmer",
    },
    "patent": {
        "primary": "#800020",
        "secondary": "#FFD700",
        "costume": "formal robes, scroll cases, gold seals",
        "role": "clerk",
    },
    "safety": {
        "primary": "#CCFF00",
        "secondary": "#FFFFFF",
        "costume": "reflective vest, hazard stripes, first-aid kit",
        "role": "warden",
    },
}

# ── Era visual identity ───────────────────────────────────────────────────────
ERA_VISUALS = {
    "stone": "cave settlements, firelight, bone and obsidian tools, misty forests",
    "bronze": "mud-brick cities, bronze anvils, early writing tablets, river valleys",
    "iron": "fortified walls, iron forges, dirt roads, banners, smoke",
    "classical": "marble forums, aqueducts, togas, olive groves, white stone",
    "medieval": "stone keeps, timber houses, cobblestone streets, torchlight",
    "industrial": "brick factories, smokestacks, railways, gas lamps, steel",
    "modern": "concrete towers, glass offices, cars, power grids, asphalt",
    "future": "holographic towers, fusion reactors, vertical farms, neon accents",
}

# ── Biome visual identity ─────────────────────────────────────────────────────
BIOME_VISUALS = {
    "plains": "golden grass, distant wind turbines, straight dirt roads",
    "forest": "dense canopy, dappled light, mossy ruins, ferns",
    "desert": "heat haze, sandstone, solar arrays, dust devils",
    "tundra": "snow fields, aurora, insulated buildings, steam vents",
    "coast": "salty docks, bioluminescent tide pools, gulls, reeds",
    "mountain": "terraced cities, cable cars, thin atmosphere, crags",
    "wetland": "mangroves, stilt houses, reflective water, mist",
    "volcanic": "lava glow, obsidian, sulphur vents, ash falls",
}

# ── Mood → expression cue ─────────────────────────────────────────────────────
MOOD_EXPRESSION = {
    "calm": "neutral face, relaxed shoulders",
    "happy": "slight smile, open posture",
    "focused": "furrowed brow, leaning into task",
    "anxious": "tense shoulders, darting eyes",
    "despairing": "slumped posture, downcast eyes",
    "awe": "wide eyes, mouth slightly open, looking up",
    "flow": "deep concentration, dynamic action pose",
    "content": "soft smile, comfortable stance",
    "inspired": "bright eyes, uplifted posture",
    "stressed": "tight jaw, hurried movement",
    "exhausted": "drooping eyelids, slow posture",
    "ecstatic": "broad smile, energetic gesture",
}

# ── Time / weather lighting cues ──────────────────────────────────────────────
TOD_LIGHT = {
    "dawn": "soft orange-pink light, long shadows, mist",
    "day": "bright high-contrast sunlight, clear visibility",
    "dusk": "golden-hour warmth, long shadows, amber bounce light",
    "night": "neon and holographic light sources, cool ambient, high contrast",
}

WEATHER_FX = {
    "clear": "clear sky",
    "cloud": "overcast diffused light",
    "rain": "rain, wet pavement, screen-space puddle reflections",
    "storm": "heavy storm, lightning, dramatic clouds",
    "snow": "falling snow, soft diffuse light, breath mist",
    "fog": "thick fog, low visibility, silhouettes",
}

# ── Recommended models per asset type ─────────────────────────────────────────
# Normalized model hints for the Higgsfield platform API v2.
# The higgsfield client maps these to the correct /v1/* endpoint and model slug.
# Seedream accepts "basic"/"high" quality; Soul requires "720p"/"1080p".
MODEL_IMAGE = "seedream"
MODEL_WORLD = "seedream"
MODEL_VIDEO_HERO = "kling-v2-1-master"
MODEL_VIDEO_CINEMATIC = "dop-preview"
MODEL_VIDEO_SOCIAL = "kling-v2-1"
MODEL_VIDEO_TALKING = "kling-v2-1-master"


def _fallback(value: Any, default: Any) -> Any:
    return value if value is not None else default


def _guild_look(guild: str | None) -> dict[str, str]:
    return GUILD_LOOK.get((guild or "").lower(), {
        "primary": "#888888",
        "secondary": "#CCCCCC",
        "costume": "simple practical clothing",
        "role": "scholar",
    })


def _minion_age_stage(minion) -> str:
    try:
        from underworld.server.services.lifecycle import life_stage
        world_tick = getattr(minion, "_world_tick", 0) or getattr(minion, "age_ticks", 0)
        age = world_tick - (minion.born_tick or 0)
        return life_stage(int(age))
    except Exception:
        return "adult"


def _minion_name(minion) -> str:
    if not minion:
        return "a minion"
    surname = getattr(minion, "surname", None) or ""
    return f"{minion.name} {surname}".strip()


def _mood_cue(minion) -> str:
    if not minion:
        return "neutral face, relaxed shoulders"
    mood = getattr(minion, "mood", None)
    mood_val = getattr(mood, "value", str(mood)) if mood is not None else "calm"
    return MOOD_EXPRESSION.get(mood_val, MOOD_EXPRESSION["calm"])


def negative_prompt(extra: str | None = None) -> str:
    """Return the universal negative prompt, optionally appended."""
    base = DEFAULT_NEGATIVE_PROMPT
    if extra:
        return f"{base}, {extra}"
    return base


def camera_preset_for(situation: str | None) -> str:
    """Map a simulation situation to a Higgsfield camera preset."""
    return CAMERA_PRESETS.get((situation or "").lower(), "static_hero")


def model_for_event(event_kind: str, kind: str) -> str:
    """Recommend a Higgsfield model for an event/asset kind."""
    if kind == "video":
        if event_kind in ("director:god_beat", "saga:begins"):
            return MODEL_VIDEO_HERO
        return MODEL_VIDEO_CINEMATIC
    if event_kind in ("era:promoted", "discovery:tech", "art:created"):
        return MODEL_WORLD
    return MODEL_IMAGE


def aspect_ratio_for(event_kind: str, kind: str) -> str:
    """Recommend an aspect ratio for the asset."""
    if kind == "video":
        return "16:9"
    if event_kind in ("director:god_beat", "saga:begins"):
        return "9:16"  # portrait for character-focused shots
    if event_kind in ("era:promoted", "discovery:tech"):
        return "16:9"
    return "1:1"


def duration_for(event_kind: str) -> int:
    """Recommended video duration in seconds."""
    return 5


def style_id_for(event_kind: str) -> str | None:
    """Recommended Soul 2.0 style preset.

    Higgsfield v2 accepts a UUID style_id, not a preset name. Until a style
    UUID map is available, return None to avoid 422 validation errors.
    """
    return None


def width_and_height_for(aspect_ratio: str) -> str:
    """Map aspect ratio to a Higgsfield v2 image width_and_height string."""
    mapping = {
        "9:16": "896x1536",
        "1:1": "1536x1536",
        "16:9": "1536x896",
        "21:9": "1920x816",
        "4:5": "1216x1536",
    }
    return mapping.get(aspect_ratio, "1536x1536")


def build_event_prompt(
    event,
    world,
    minion=None,
    *,
    time_of_day: str = "dusk",
    weather: str = "clear",
) -> dict[str, Any]:
    """Build a design-brief prompt package from a simulation event.

    Returns a dict with everything the media_generator needs:
      - prompt
      - negative_prompt
      - model
      - camera_preset (for video)
      - aspect_ratio
      - duration
      - style_id
      - style_strength
      - width_and_height
      - era, biome, world_name, tick
    """
    payload = event.payload or {}
    world_name = getattr(world, "name", "Underworld")
    era = getattr(world, "era", "iron")
    era_desc = ERA_VISUALS.get(era, ERA_VISUALS["iron"])
    biome = getattr(world, "weather", "plains")  # existing fallback
    biome_desc = BIOME_VISUALS.get(biome, BIOME_VISUALS["plains"])
    tod_desc = TOD_LIGHT.get(time_of_day, TOD_LIGHT["dusk"])
    wx_desc = WEATHER_FX.get(weather, WEATHER_FX["clear"])

    guild = minion.guild.value if minion and hasattr(minion.guild, "value") else None
    look = _guild_look(guild)
    name = _minion_name(minion)
    age_stage = _minion_age_stage(minion) if minion else "adult"
    mood_cue = _mood_cue(minion)

    event_kind = event.kind
    situation = "idle"  # derived below

    # Build the descriptive core.
    if event_kind == "era:promoted":
        situation = "discovery"
        core = (
            f"Cinematic establishing shot of {world_name} ascending to the {payload.get('to', era)} era. "
            f"{era_desc}. {biome_desc}. {tod_desc}, {wx_desc}. "
            "NaturalVision Evolved GTA 5 photorealism, volumetric clouds, "
            "screen-space reflections, Unreal Engine 5 Lumen lighting, 16:9 gameplay screenshot."
        )

    elif event_kind == "saga:begins":
        situation = "discovery"
        saga_title = payload.get("title") or payload.get("name") or "an untold saga"
        core = (
            f"Cinematic character shot from the saga '{saga_title}' in {world_name}. "
            f"{name}, a {age_stage} {guild or 'scholar'} minion, stands at the center. "
            f"Wearing {look['costume']} in {look['primary']} and {look['secondary']}. "
            f"Expression: {mood_cue}. {era_desc}, {biome_desc}. {tod_desc}, {wx_desc}. "
            "Unreal Engine 5 MetaHuman quality, subsurface skin, natural catchlights, "
            "shallow depth of field, 35mm lens, cinematic colour grading, slight film grain."
        )

    elif event_kind == "invention:operator_approve":
        situation = "research"
        title = payload.get("title") or "an invention"
        core = (
            f"Photoreal concept art of the approved invention '{title}' in {world_name}. "
            f"A {guild or 'scholar'} minion inspects the functioning prototype. "
            f"{era_desc}, {biome_desc}. {tod_desc}, {wx_desc}. "
            "Clean cinematic lighting, futuristic-avatar palette, 16:9."
        )

    elif event_kind == "project:approved":
        situation = "research"
        title = payload.get("title") or "a research project"
        core = (
            f"Research milestone: '{title}' approved in {world_name}. "
            f"Minions celebrate in a futuristic lab amid holographic displays. "
            f"{era_desc}, {biome_desc}. {tod_desc}, {wx_desc}. "
            "Cinematic, 16:9."
        )

    elif event_kind == "discovery:tech":
        situation = "discovery"
        tech = payload.get("name") or payload.get("tech") or "a discovery"
        core = (
            f"The colony of {world_name} discovers {tech}. "
            f"{era_desc}, {biome_desc}. {tod_desc}, {wx_desc}. "
            "Holographic diagrams, awestruck minions, cinematic 16:9."
        )

    elif event_kind == "art:created":
        situation = "festival"
        title = payload.get("title") or "a new artwork"
        artist = name
        core = (
            f"Artwork unveiled in {world_name}: '{title}' by {artist}. "
            f"Futuristic gallery, bioluminescent frames, {era_desc}, {biome_desc}. "
            f"{tod_desc}, {wx_desc}. Cinematic 16:9."
        )

    elif event_kind == "gateway:passed":
        situation = "discovery"
        core = (
            f"{name} passes the existential gateway in {world_name}. "
            f"A glowing portal, futuristic ruins, {era_desc}, {biome_desc}. "
            f"{tod_desc}, {wx_desc}. Cinematic, awe-inspiring, 16:9."
        )

    elif event_kind == "director:god_beat":
        situation = "discovery"
        beat = payload.get("beat") or "an awakened being confronts the watcher"
        core = (
            f"An awakened minion turns to camera in {world_name}. '{beat}'. "
            f"Close-up portrait, MetaHuman-grade face, path-traced cinematic lighting, "
            f"{mood_cue}, {era_desc}, {tod_desc}, {wx_desc}. 9:16 vertical cinematic."
        )

    else:
        situation = "idle"
        core = (
            f"Event in {world_name}: {event_kind}. Era: {era}. "
            f"{era_desc}, {biome_desc}. {tod_desc}, {wx_desc}. "
            "Futuristic-avatar civilization, cinematic concept art."
        )

    kind = "image" if event_kind != "director:god_beat" else "video"
    camera = camera_preset_for(situation)
    aspect = aspect_ratio_for(event_kind, kind)

    return {
        "prompt": core,
        "negative_prompt": negative_prompt(),
        "model": model_for_event(event_kind, kind),
        "camera_preset": camera,
        "aspect_ratio": aspect,
        "duration": duration_for(event_kind),
        "style_id": style_id_for(event_kind),
        "style_strength": 0.7 if style_id_for(event_kind) else None,
        "width_and_height": width_and_height_for(aspect),
        "motion_id": camera,
        "motion_strength": 0.6 if CAMERA_PRESET_SAFETY.get(camera, "safe") != "risky" else 0.4,
        "era": era,
        "biome": biome,
        "world_name": world_name,
        "tick": event.tick,
        "situation": situation,
        "time_of_day": time_of_day,
        "weather": weather,
    }


def build_manual_prompt(
    *,
    prompt: str,
    kind: str,
    world_name: str = "Underworld",
    era: str = "iron",
    biome: str = "plains",
    guild: str | None = None,
    time_of_day: str = "dusk",
    weather: str = "clear",
    camera_preset: str | None = None,
    style_id: str | None = None,
) -> dict[str, Any]:
    """Wrap a user's manual prompt with the design-brief visual language."""
    look = _guild_look(guild)
    era_desc = ERA_VISUALS.get(era, ERA_VISUALS["iron"])
    biome_desc = BIOME_VISUALS.get(biome, BIOME_VISUALS["plains"])
    tod_desc = TOD_LIGHT.get(time_of_day, TOD_LIGHT["dusk"])
    wx_desc = WEATHER_FX.get(weather, WEATHER_FX["clear"])

    camera = camera_preset or (camera_preset_for("idle") if kind == "video" else "static_hero")
    aspect = aspect_ratio_for("manual", kind)

    # Inject the visual thesis if the user prompt is short and doesn't already mention it.
    enhanced = prompt
    if len(prompt) < 120:
        enhanced = (
            f"{prompt}. Photorealistic Underworld gameplay capture in {world_name}, "
            f"{era} era, {biome_desc}, {tod_desc}, {wx_desc}."
        )

    return {
        "prompt": enhanced,
        "negative_prompt": negative_prompt(),
        "model": model_for_event("manual", kind),
        "camera_preset": camera,
        "aspect_ratio": aspect,
        "duration": duration_for("manual"),
        "style_id": style_id,
        "style_strength": 0.7 if style_id else None,
        "width_and_height": width_and_height_for(aspect),
        "motion_id": camera,
        "motion_strength": 0.6,
        "era": era,
        "biome": biome,
        "world_name": world_name,
        "situation": "manual",
        "time_of_day": time_of_day,
        "weather": weather,
    }
