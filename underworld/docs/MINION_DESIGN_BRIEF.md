# Underworld Minions — Master Design Brief
## Hyper-Realistic Gameplay Simulation with Higgsfield
**Theme:** *Futuristic GTA 5 × The Sims 5 × Underworld Civilisation Simulation*  
**Date:** June 2026  
**Credits available:** 800 Higgsfield credits  
**Goal:** Turn every Underworld simulation tick into a cinematic, photorealistic render pipeline that looks like a cross between *GTA V NaturalVision Evolved*, *The Sims 5 / inZOI*, and a living research colony.

---

## 1. Executive Summary

Underworld is a long-running AI civilisation where autonomous Minions study expired patents, invent, breed, build cities, and form societies. Until now the simulation has been mostly data-driven. This brief defines how to **render that simulation as hyper-realistic gameplay** using Higgsfield's 2026 multi-model video/image stack.

We are not making concept art. We are making **simulated gameplay footage**:
- Minions that look like MetaHuman-grade digital actors (inZOI/Sims 5 realism).
- Cities and vehicles that look like a modded GTA 5 open world (NaturalVision Evolved).
- Camera work that looks like a AAA game trailer / cinematic tool (Higgsfield Cinema Studio 3.5).
- Lighting and weather that feel like Unreal Engine 5 with Lumen + Nanite.

Every render must be:
1. **Photorealistic first** — no anime, no oil-paint stylisation unless explicitly requested.
2. **Gameplay-native** — the shot should look like it was captured from a running game engine, not a static illustration.
3. **Consistent** — reuse Soul ID characters, world palettes, and camera rules so a world's gallery feels like one continuous game.
4. **Safe & backed-up** — all completed assets are downloaded locally to `underworld/data/media_assets/{world_id}/`.

---

## 2. Visual Thesis: GTA 5 × Sims 5 × Underworld

### 2.1 GTA 5 Realism Mod Stack (the "open-world" half)

The best photorealistic GTA 5 look in 2026 comes from stacked mods, not one preset:

| Layer | Reference | What it gives Underworld |
|-------|-----------|--------------------------|
| Base lighting/weather | **NaturalVision Evolved (NVE)** | Photoreal colour grading, volumetric clouds, screen-space rain/puddle reflections, day/night cycles |
| Shader framework | **U1D GFX Remastered** | Cinematic warmth, balanced shadows, road/vehicle material response |
| Colour/atmospheric | **VisualV** | Cleaner atmospheric depth without crushing shadows |
| Performance variant | **NaturalVision Lite** | Same art direction at lower GPU cost |

**Takeaway for prompts:** always describe *cinematic Los-Santos-grade open world*, *screen-space reflections on wet pavement*, *golden-hour/dusk city light*, *volumetric clouds*, *realistic road surfaces*.

### 2.2 The Sims 5 / inZOI (the "life-sim" half)

Krafton's **inZOI** (UE5 life simulator, 2025–2026 Early Access) is the closest public reference for *The Sims 5* realism:

- MetaHuman-style characters with subsurface-scatter skin, strand hair, believable eyes.
- Seamless open city with real-time lighting.
- Character creator with 250+ sliders; Zois have personality-driven walk styles and social AI.
- Photoreal interiors: furniture, kitchens, workplaces.

**Takeaway for prompts:** Minions are *not cartoons*. They are small, distinctive digital humans living in a seamless city. Describe their age (child/adult/elder), guild clothing, and current activity.

### 2.3 Underworld's Unique Layer (the "research civ" half)

Underworld adds:
- 11 guilds (physics, mechanical, electrical, civil, materials, energy, computing, maths, agriculture, patent, safety).
- Era progression: stone → bronze → iron → classical → medieval → industrial → modern → future.
- Patent scanner, research projects, inventions, discoveries, civil infrastructure.
- Mood/stress/needs, social relationships, breeding/forking.

**Takeaway:** the world is not just a city — it is a *research campus that evolves through history*. Visuals must show era-appropriate technology mixed with futuristic bioluminescence and holographic UI.

---

## 3. Minion Design Language

### 3.1 Proportions & Silhouette

- Height: ~1.0–1.8 m in-engine (roughly 1/10th the height of a tower).
- Body type: compact, slightly stylised but believable human proportions. Avoid chibi/cartoon.
- Skin: subtle subsurface scatter, natural pores, slight oiliness under direct light.
- Eyes: reflective catchlights; avoid dead-flat pupils.
- Clothing: guild-colour-coded practical workwear, augmented with era-appropriate tools and futuristic accents.

### 3.2 Guild Colour & Costume Codes

| Guild | Primary | Secondary | Costume cue |
|-------|---------|-----------|-------------|
| Physics | Deep blue | Electric cyan | Lab coat, glowing equations, particle diagrams |
| Mechanical | Burnt orange | Steel grey | Goggles, leather apron, gears |
| Electrical | Neon yellow | Black | Insulated gloves, Tesla coils, LED strips |
| Civil | Terracotta | White | Hard hat, blueprints, surveying tools |
| Materials | Bronze | Charcoal | Metallurgy apron, sample cases |
| Energy | Plasma green | Dark grey | Reactor cores, power cells |
| Computing | Magenta | Jet black | Holographic screens, fiber-optic cables |
| Maths | Silver | Purple | Geometric patterns, chalk dust |
| Agriculture | Earth green | Straw | Overalls, plants, biome-appropriate crops |
| Patent | Burgundy | Gold | Formal robes, scroll cases, seals |
| Safety | High-vis lime | White | Reflective vest, hazard stripes, first-aid kit |

### 3.3 Age & Life Stages

The simulation already has infant/child/adolescent/young_adult/adult/elder stages. Prompts should call out the stage explicitly:

- **Infant/child:** softer faces, larger eyes, smaller hands, playful or curious poses.
- **Adult:** defined features, active work poses.
- **Elder:** wrinkles, grey/white hair, slower posture, dignified.

### 3.4 Mood & Expression

Minions carry `mood` (calm, happy, focused, anxious, despairing, etc.). The prompt should translate mood into facial expression and body language:

| Mood | Visual cue |
|------|------------|
| Calm | Neutral face, relaxed shoulders |
| Happy | Slight smile, open posture |
| Focused | Furrowed brow, leaning into task |
| Anxious | Tense shoulders, darting eyes |
| Despairing | Slumped posture, downcast eyes |
| Awe | Wide eyes, mouth slightly open, looking up |
| Flow | Deep concentration, dynamic action |

---

## 4. World / Environment Design

### 4.1 Era × Biome Matrix

Use the existing `design_spec.py` eras and biomes as the foundation, but render them photorealistically:

| Era | Visual identity |
|-----|-----------------|
| Stone | Cave settlements, firelight, bone/obsidian tools, misty forests |
| Bronze | Mud-brick cities, bronze anvils, early writing tablets, river valleys |
| Iron | Fortified walls, iron forges, dirt roads, banners |
| Classical | Marble forums, aqueducts, togas, olive groves |
| Medieval | Stone keeps, timber houses, cobblestone, torchlight |
| Industrial | Brick factories, smokestacks, railways, gas lamps |
| Modern | Concrete, glass offices, cars, power grids |
| Future | Holographic towers, fusion reactors, vertical farms, neon accents |

| Biome | Visual identity |
|-------|-----------------|
| Plains | Golden grass, distant wind turbines, straight roads |
| Forest | Dense canopy, dappled light, mossy ruins |
| Desert | Heat haze, sandstone, solar arrays, dust |
| Tundra | Snow, aurora, insulated buildings, steam vents |
| Coast | Salty air, docks, bioluminescent tide pools |
| Mountain | Terraced cities, cable cars, thin atmosphere |
| Wetland | Mangroves, stilt houses, reflective water |
| Volcanic | Lava glow, obsidian, sulphur vents, ash |

### 4.2 Time-of-Day & Weather

Always specify time and weather. These dramatically change realism:

- **Dawn:** soft orange-pink, long shadows, mist.
- **Day:** bright, high contrast, clear visibility.
- **Dusk:** golden-hour, warm bounce light, long shadows.
- **Night:** neon/holographic light sources, cool ambient, high contrast.

Weather: clear, cloud, rain, storm, snow, fog. Rain gives the best "GTA mod" look because of puddle reflections and wet materials.

### 4.3 Architectural Rules

- Mix **era-appropriate base materials** with **futuristic avatar accents** (glowing runes, holographic signage, bioluminescent plants).
- Buildings should feel lived-in: clutter, tools, laundry, market stalls.
- Research buildings get glass/clean surfaces + holographic displays.
- Civic buildings get monumental scale + warm stone + subtle glow.

---

## 5. Higgsfield Rendering Strategy (2026)

### 5.1 Available Models in Higgsfield (June 2026)

Higgsfield aggregates 15+ models. For Underworld we care about:

| Model | Best for | Credit cost | Notes |
|-------|----------|-------------|-------|
| **Soul 2.0** (image) | Character portraits, Minion stills | Low (1–5) | 20+ presets; use Soul ID for consistency |
| **Seedream 5.0 / 4.5** (image) | General concept art, environments | Low | Good for world posters |
| **Nano Banana** (image) | Fast variations | Very low | Drafts only |
| **Kling 3.0** (video) | Hero cinematic motion, character continuity | High (~22 credits/5s) | Best motion quality |
| **Veo 3.1** (video) | Social clips, native audio, trends | Medium | Good for quick event clips |
| **Sora 2** (video) | Long-form, physics-rich hero shots | High | Best physics simulation |
| **WAN 2.6/2.7** (video) | Cinematic camera control, sound sync | Medium | Use with camera presets |
| **Seedance 1.5 Pro** (video) | Lip-sync, talking Minions | Medium | For narration/dialogue |
| **Higgsfield DoP** (video) | Camera-preset-native cinematic | Medium | 70+ presets, deterministic camera |

### 5.2 Credit Budget Plan (800 credits)

With 800 credits we can produce roughly:

| Asset type | Model | Cost each | Count | Total |
|------------|-------|-----------|-------|-------|
| World posters / era cards | Seedream / Soul | 2 | 50 | 100 |
| Minion portraits | Soul 2.0 | 2 | 60 | 120 |
| Event concept images | Seedream | 2 | 80 | 160 |
| Hero cinematic videos (5s) | Kling 3.0 / DoP | 22 | 10 | 220 |
| Explainer/event videos (5s) | WAN / Veo | 15 | 10 | 150 |
| Talking-head narrations | Seedance | 18 | 3 | 54 |
| Buffer / retries | — | — | — | ~96 |
| **Total** | | | **~213 assets** | **~800** |

**Rule:** never burn more than 50 credits on a single test. Iterate on cheap models (Soul, WAN) before rendering expensive hero shots (Kling, Sora).

### 5.3 Image Strategy

1. **Character lock:** create a Soul ID per recurring Minion using 5–20 consistent reference images. Reuse it for every portrait/action shot.
2. **World palette lock:** generate a single "world poster" per era and use it as a style reference (HEX / moodboard) for subsequent generations.
3. **Aspect ratio:**
   - Portraits / Minion cards: 9:16 or 4:5.
   - World posters / events: 16:9 or 21:9.
   - Square: 1:1 for thumbnails.

### 5.4 Video Strategy

1. **Image-first:** generate a high-quality still first, then animate it (image-to-video). This is far more controllable than text-to-video.
2. **Pick the camera before the prompt:** Higgsfield's moat is camera control. Choose the preset first, then write the action.
3. **Keep clips short:** 4–8 seconds is the sweet spot for Higgsfield. Stitch longer sequences in the frontend gallery.
4. **Avoid common fails:**
   - Fast human movement (running, fighting) = warped limbs.
   - Crowds = face drift.
   - Text/signage = garbled letters.
   - Whip-pans = motion blur artifacts.

---

## 6. Model Selection & Cost Guide

Use this decision tree for every asset:

```
Is it a character portrait or recurring Minion?
  → Soul 2.0 + Soul ID (cheap, consistent)

Is it a world/era/environment still?
  → Seedream 5.0 / Soul "General" preset

Is it a short event clip needing camera control?
  → Higgsfield DoP or WAN 2.6 with a preset

Is it a hero cinematic with complex motion/physics?
  → Kling 3.0 (image-to-video)

Is it a Minion speaking/narrating?
  → Seedance 1.5 Pro (lip-sync)

Is it a viral social clip with audio?
  → Veo 3.1
```

---

## 7. Prompt Engineering Templates

### 7.1 Universal Negative Prompts

Always append or use as guardrails:

```
No cartoon, no anime, no oil painting, no watercolor, no sketch, no 3D render look, 
no plastic skin, no oversaturated colours, no seven fingers, no crossed eyes, 
no text, no logos, no watermarks, no blurry faces, no smudged details.
```

### 7.2 Character Portrait Template

```
Photorealistic medium shot of {name}, a {age_stage} {guild} minion in the world of {world_name}. 
{appearance_detail}. Wearing {guild_colour} {era_appropriate_clothing} with {guild_tool}. 
Expression: {mood_expression}. Standing in a {location} during {time_of_day}, {weather}. 
Unreal Engine 5 metahuman quality, subsurface skin, natural catchlights, shallow depth of field, 
35mm lens, cinematic colour grading, slight film grain.
```

Example:
```
Photorealistic medium shot of Lira Vance, an adult computing-guild minion in the world of Aethelgard. 
Magenta-and-black technical coat with fiber-optic trim. Expression: focused curiosity. 
Standing in a future-era server cathedral at dusk, light rain. 
Unreal Engine 5 metahuman quality, subsurface skin, natural catchlights, shallow depth of field, 
35mm lens, cinematic colour grading, slight film grain.
```

### 7.3 World/Event Still Template

```
Cinematic wide shot of {world_name} in the {era} era, {biome} biome, {time_of_day}, {weather}. 
{key_landmarks}. {era_technology} mixed with {futuristic_accent}. 
NaturalVision Evolved GTA 5 photorealism, volumetric clouds, screen-space reflections, 
Lumen global illumination, 16:9, game-engine screenshot aesthetic.
```

### 7.4 Action/Gameplay Clip Template (image-to-video)

```
{minion_description} {action_verb} in {location}. Camera: {camera_preset}. 
Motion: {motion_detail}. Mood: {mood}. Time: {time_of_day}, {weather}. 
Photoreal gameplay capture, 24fps cinematic, subtle camera shake, natural motion blur.
```

Example:
```
Lira Vance typing on a holographic terminal in a server cathedral. Camera: slow dolly in. 
Motion: fingers tap keys, holograms flicker, hair sways slightly. Mood: focused. 
Time: dusk, light rain. Photoreal gameplay capture, 24fps cinematic, subtle camera shake.
```

### 7.5 Explainer/Research Campaign Template

Use the Supercomputer campaign pipeline:
1. **Concept image:** wide world/technology shot.
2. **Detail image:** close-up of the invention/Minion at work.
3. **Explainer video:** slow orbit or dolly over the detail image with narration text.

Prompt chain example for "graphene battery breakthrough":
- Concept: "Futuristic materials-guild lab in Aethelgard, industrial era, glowing graphene sheets..."
- Detail: "Close-up of a minion holding a transparent graphene battery, electric arcs inside..."
- Video: "Slow orbit around the battery. Blue energy pulses. Soft lab lights."

---

## 8. Camera / Motion Preset Map

Map Underworld simulation situations to Higgsfield camera presets. This is derived from `design_spec.SITUATIONS` and 2026 Higgsfield docs.

| Simulation situation | Recommended preset | Why |
|----------------------|--------------------|-----|
| idle / scenic | `static_hero` or `orbit_slow` | Establishing shot, no motion risk |
| research / study | `push_in` or `dolly_in` | Focus on concentration |
| build / forge | `crane_up` or `low_dolly` | Show scale and labour |
| trade / market | `handheld` or `dolly_out` | Busy, documentary feel |
| breed / birth / celebrate | `soft_close` or `circle` | Intimate, warm |
| death / disaster | `slow_pull` or `shake_hard` | Drama, distance |
| conflict / fight | `shake_cut` or `whip_pan` | Action (use sparingly) |
| festival | `sweeping` or `360_orbit` | Joy, scale |
| discovery / eureka | `reveal` or `crash_zoom` | Emphasis |
| travel | `follow` or `fpv_drone` | Movement through world |
| ritual | `circle` or `boom_down` | Ceremony |
| harvest | `low_dolly` or `tilt_up` | Landscape + labour |

### 8.2 Preset Safety Rules

- **Safe (low warp risk):** static_hero, orbit_slow, dolly_in, dolly_out, crane_up, tilt_up.
- **Medium:** handheld, circle, follow, low_dolly.
- **Risky (high warp/crowd risk):** whip_pan, shake_cut, crash_zoom on humans.

---

## 9. Production Workflow

### 9.1 Automated Pipeline (existing)

1. Scheduler ticks world.
2. `media_generator.handle_new_events()` inspects `Event` rows.
3. Events map to prompt templates + camera presets.
4. Jobs submitted to Higgsfield via v2 API.
5. `_media_loop()` polls status.
6. Completed assets downloaded to `underworld/data/media_assets/{world_id}/`.
7. Frontend gallery displays assets; zip export available.

### 9.2 Manual Override (frontend)

Users should be able to:
- Pick a world, Minion, event type.
- Choose image model (Soul/Seedream) and video model (Kling/DoP/WAN/Veo/Sora).
- Select a camera preset from a dropdown.
- Set aspect ratio and duration.
- Enter a custom prompt or use the auto-generated one.
- Trigger immediate generation.

### 9.3 Quality Gates

Before any asset is shown:
1. Red-line safety scan (existing).
2. Daily credit budget check (existing).
3. Prompt length ≤ 500 tokens.
4. Aspect ratio must be one of 9:16, 1:1, 16:9, 21:9, 4:5.
5. Video duration 4–10 seconds.
6. Motion strength 0.3–0.9 (lower for realism).

---

## 10. Troubleshooting & Common Fails

### 10.1 "Not enough credits" (403)

- Confirmed: auth works, account needs top-up at `https://cloud.higgsfield.ai`.
- Mitigation: the backend already enforces daily budgets and cheap-model-first rendering.

### 10.2 Warped faces / seven fingers

- Cause: fast motion, full-body shots at low resolution, no face-fix.
- Fix: use Soul ID; crop to medium/close shots; add `close-up portrait` to prompt.

### 10.3 Inconsistent character across shots

- Cause: no persistent identity.
- Fix: create Soul ID with 10–20 consistent photos; use same `style_id` / preset.

### 10.4 Rubbery motion

- Cause: text-to-video on complex action.
- Fix: always image-to-video; keep motion slow; use DoP presets instead of free prompt motion.

### 10.5 Oversaturated / plastic look

- Cause: CFG too high or wrong preset.
- Fix: use Soul 2.0 presets like `Warm Ambient`, `Subtle Flash`, or `Nature Light`; avoid `Candy Pop`/`Drain` for realism.

### 10.6 Garbled text / signs

- Cause: AI cannot render readable text reliably.
- Fix: explicitly request `no text, no logos, no signage` in negative prompt.

### 10.7 Long render times / queue stalls

- Cause: premium models at peak.
- Fix: use WAN/Seedance for drafts; schedule Kling/Sora renders during off-peak; cancel stalled jobs via API.

---

## 11. Implementation Notes for Engineers

### 11.1 Files to touch

- `underworld/server/services/media_generator.py` — prompt templates and event mapping.
- `underworld/server/services/higgsfield.py` — model/preset routing.
- `underworld/server/config.py` — new style/preset defaults.
- `underworld/server/routes/media.py` — manual override endpoints.
- `server/jarvis_live.html` — frontend controls for style, preset, model, aspect ratio.

### 11.2 New constants to add

```python
# Style presets for Soul 2.0 realism
SOUL_REALISM_PRESETS = [
    "Warm Ambient", "Subtle Flash", "Nature Light", "Editorial Street Style",
    "Digital Camera", "General",
]
# Avoid for realism: "Candy Pop", "Drain", "Surreal Solarization", "Frutiger Aero"

# Camera presets mapped to simulation situations
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

# Guild colour hex map
GUILD_COLOURS = {
    "physics": ("#0A2540", "#00D4AA"),
    "mechanical": ("#C44D34", "#7A8B99"),
    "electrical": ("#CFFF04", "#111111"),
    "civil": ("#B85C38", "#F4F4F4"),
    "materials": ("#B87333", "#2B2B2B"),
    "energy": ("#39FF14", "#333333"),
    "computing": ("#FF00A0", "#0A0A0A"),
    "maths": ("#C0C0C0", "#6A0DAD"),
    "agriculture": ("#4A7C59", "#E3C565"),
    "patent": ("#800020", "#FFD700"),
    "safety": ("#CCFF00", "#FFFFFF"),
}
```

### 11.3 Prompt builder contract

Every generated prompt should be a single string produced by:

```python
build_prompt(
    event_kind: str,
    world: World,
    minion: Minion | None,
    situation: str,
    style: str = "photoreal",
    time_of_day: str = "dusk",
    weather: str = "clear",
) -> dict[str, Any]
```

Return dict includes:
- `prompt`: final string
- `negative_prompt`: string
- `model`: recommended model
- `camera_preset`: for video
- `aspect_ratio`: str
- `duration`: int
- `style_id`: Soul preset name (optional)

---

## 12. References

- GTA 5 photorealism: NaturalVision Evolved, U1D GFX Remastered, VisualV (2026 mod roundups).
- Sims 5 / life-sim realism: inZOI (Krafton, UE5, 2025–2026 Early Access).
- MetaHuman avatars: Unreal Engine 5 MetaHuman documentation.
- Higgsfield 2026 features: Cinema Studio 3.5, Soul 2.0, Soul ID, DoP, Kling 3.0, Veo 3.1, Sora 2, WAN 2.6/2.7, Seedance 1.5 Pro.
- Higgsfield camera presets: dolly in/out, crane up/down, orbit, 360 orbit, FPV drone, handheld, tilt up, boom down, static hero, push in, slow pull, whip pan, crash zoom, bullet time.
- Higgsfield Soul 2.0 presets: Warm Ambient, Subtle Flash, Nature Light, Editorial Street Style, Digital Camera, General, Mystique City, Siren, Theatrical Light, Y2K Studio, Retro BW, Frutiger Aero, etc.

---

*End of brief. This document should be treated as the single source of truth for all Underworld media generation styling, model selection, and prompt engineering.*
