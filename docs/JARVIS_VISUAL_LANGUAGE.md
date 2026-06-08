# JARVIS Visual Language Spec (render-locked, v1)

Source of truth: the 10 LOCKED TARGET RENDERS in
`design_pack/unpacked/jarvis_render_locked_immersive_uiux_pack_v5/01_locked_target_renders_do_not_ignore/`.
This document is my (Claude's) text impression of those renders. It is the art-direction bible and the
prompt-engineering basis for every generated asset (OpenAI `gpt-image` → Tripo `image_to_model` → PBR GLB).
If a generated asset does not obey this spec, reject and regenerate.

## Non-negotiables
- **Render-locked.** Every scene must be visually identifiable against its target render from layout alone.
- **No flat panels. No Three.js/r3f as the product.** The runtime is RTX-streamed (UE5 Pixel Streaming preferred; Omniverse/OpenUSD optional). React is only the stream/control shell.
- **Cinematic, volumetric, premium.** Stark Industries war-room. Think *Iron Man (2008–2013)* JARVIS HUD: cyan holography, depth, bloom, particles, reflective black floor — not a SaaS dashboard.

## Palette (locked)
| Token | Hex | Use |
|---|---|---|
| `bg.void` | `#05080D` | deepest background |
| `bg.deep` | `#0A0E16` | environment fill |
| `glass.panel` | `#0E1B2A` @ ~35% | holographic smoked-glass panels |
| `cyan.primary` | `#29E7FF` | primary hologram / edges / hero glow |
| `cyan.core` | `#18B8E6` | mid cyan, fills |
| `blue.deep` | `#0B3D66` | recessed depth, gradients |
| `green.ok` | `#29F0A0` | healthy/positive, gauges, uptrends, "OPTIMAL" |
| `red.alert` | `#FF4438` | critical alerts, threat |
| `amber.warn` | `#FFB020` | warnings, medium severity |
| `violet.acc` | `#7A5CFF` | rare accent, AI/agent emphasis |
| `text.bright` | `#DCEBF5` | primary text |
| `text.muted` | `#6E8AA0` | labels, secondary |

Data surfaces (analytics) may use a cyan→green→amber gradient ramp; everything else stays in the cyan/green/red system.

## Materials (RTX/MDL classes — name assets to these)
- `rtx_black_chrome_floor` — near-black polished chrome, ray-traced reflections, subtle radial gradient toward the hero dais.
- `holographic_smoked_glass` — transparent dark glass, cyan Fresnel edge, faint internal scanline, emissive cyan outline on borders/headers.
- `emissive_cyan_hologram` — additive emissive cyan, bloom-required, volumetric glow, depth-fade at silhouette; used for hero objects, globes, graphs, particles.
- `brushed_dark_metal` — environment structure (ceiling rings, dais, frames): dark gunmetal, low roughness, faint cyan rim light.

## Lighting & post
- Ceiling ring **area lights** (cool white→cyan), floor **emissive ring** under each hero, hero **point/area** key.
- Post: ACES filmic, **UnrealBloom** (strong on emissive cyan), volumetric fog/light shafts, mild chromatic aberration on holograms, FXAA/TAA, vignette.
- Reflections: floor must read true ray-traced reflections of the hero + panels.

## Layout grammar (every scene shares this)
- **Top bar:** JARVIS wordmark (L) · global status + clock `09:42:17` (C) · session/user/notifications + DIRECTOR/role (R).
- **Left icon rail (the 10 destinations):** COMMAND · INTELLIGENCE · OPERATIONS · WORLD VIEW · ENTITIES · AUTOMATION · ANALYTICS · DOCUMENTS · SIMULATION · SYSTEM.
- **Left dock:** filters / tools / source selectors / module controls (smoked-glass panels).
- **Center hero:** the scene's primary 3D model on a **circular projector dais with concentric light rings**.
- **Right stack:** selected entity / details / **critical alerts (red/amber)** / **system-health radial gauge (~96%, green)** / recommendations / live events.
- **Bottom:** conversational **command bar** ("Direct Secure Comm") scoped to the current scene + voice waveform + **active-context rail** (selected country/entity/doc/mission/metric/policy).

## Motion & behaviour
- Idle: hero slow-rotates/breathes; rings counter-rotate; ambient particles drift.
- Hydrate: data arrives as cyan particle streams into the target anchor; panels fade/scale in (no hard cuts).
- Alert: right stack pulses red/amber; hero emits a warning ripple; alert SFX.
- Select: push-in camera on selected object; active-context rail updates; right stack hydrates.

## The 10 scenes (hero object + signature)
1. **Command Atrium** — hero: **JARVIS data-orb** (cyan particle sphere, "JARVIS" wordmark) on dais; world-map ribbon strip below; exec briefing + active missions + critical alerts + 96% health.
2. **AI Core Chamber** — hero: **denser reasoning orb** with reasoning-stream filaments; source cards center; memory/approval/safety stacks.
3. **World Control Room** — hero: **holographic Earth** with city-light clusters, threat arcs, layer toggles; floor city clusters; live incident feed. LOD: continent→country→city→entity.
4. **Intelligence Graph Space** — hero: **entity constellation** node-graph; center primary entity; right **dossier** (e.g. person profile w/ confidence) + evidence; investigation timeline.
5. **Operations War Room** — hero: **mission table** with mission cards + **dependency flow lines**; escalation queue; approvals.
6. **Data Fusion Reactor** — hero: **reactor core** with **source towers** feeding **data streams**; sync status; processing queue; lineage.
7. **Document Intelligence Vault** — hero: **floating holographic document/book** (two-page spread); AI annotations + extracted entities (L); risk highlights + citations + linked evidence (R); doc command bar.
8. **Simulation Theatre** — hero: **branching decision paths** with **outcome windows**; variable sliders; outcome comparison; AI recommendation; driver sensitivity.
9. **Analytics Observatory** — hero: **analytics globe** + **3D multi-color trend surfaces**; KPI towers; forecast surfaces; anomaly detection.
10. **System Security Core** — hero: **holographic shield** with **access/permission nodes** orbiting; permissions matrix; sessions map; security event stream; threat fracture.

## Asset generation conventions (so all GLBs match)
For every `gen_specs` prompt, append the locked style suffix:
> "...Iron-Man JARVIS holographic command-center asset, emissive cyan hologram (#29E7FF) with Fresnel edges and volumetric glow, dark sci-fi, ray-traced black-chrome accents, premium cinematic RTX, on transparent/black background, single centered hero object, neutral studio lighting for clean PBR bake, game-ready, high-quality PBR textures."
- One hero object per GLB, centered, turntable-neutral pose, black/transparent backdrop (no scene clutter — environments are assembled in-engine).
- Tripo: `texture:true, pbr:true, texture_quality:detailed, face_limit:~40000, emissive` where the asset glows.
- Emissive masks: author so the cyan glow lives on an emissive channel (drives in-engine bloom).
- Naming: `jarvis_<scene>_<element>` (e.g. `jarvis_command_atrium_data_orb`, `jarvis_world_control_holo_earth`, `jarvis_security_core_shield`).

## Audio identity
- Reactor hum bed (60/90 Hz detuned), boot rising two-note, summon burst, confirm arpeggio, alert two-tone, soft ticks. Extend the existing sonic palette in `src/lib/jarvisSound.js` into UE5 MetaSounds.
- Voice: cinematic British-male JARVIS (real TTS), calm authority.

## Acceptance gate
A scene/asset passes only if: (a) identifiable against its target render from layout/silhouette alone, (b) obeys palette + materials, (c) emissive reads correctly under bloom, (d) no flat-React-panel look. Otherwise regenerate.
