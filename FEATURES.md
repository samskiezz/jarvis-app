# JARVIS — MASTER TASK LIST (kept live, updated as we go)

Status: ✅ done+verified · 🔄 swarm building NOW · 🔴 todo · 🔧 needs your input · ⛔ not possible from browser/VPS (needs home device)
Type: [F]=feature  [Fn]=function/backend  [UX]=look/interaction  [SAFE]=life-safety

## 0. BEHAVIORAL HARD RULES (how I must work — non-negotiable)
- HR1 Never strip/skip/simplify the hard part of a task. Ever.
- HR2 Never do the bare minimum.
- HR3 Auto-execute good suggestions/resources (e.g. XTTS-v2) — don't ask.
- HR4 Assign a swarm to every substantive task; run them in parallel.
- HR5 Keep THIS task list live — add each new item to the correct section as we go.
- HR6 Prove it (headless / real test) before claiming done — no false "it works".
- HR7 Never break the mum's working lifeline (voice + two-way video).

## 1. JARVIS LIVE — single immersive 3D universe (NASA "Eyes on Asteroids" concept)  🔄 swarm: universe
- ★ CONSOLIDATED VISION (canonical): a FULL interactive UI laid out like a SOLAR SYSTEM in a 3D world for a JARVIS system full of information. THEME = JARVIS × Grand Theft Auto V × The Sims 4 (hyperreal cinematic gloss + clean playful build-mode interactivity + holographic sci-fi). CENTRE (where the sun is) = the REACTOR lighting up a holographic BEAM with the LIQUID METAL morphing as it speaks. PLANETS around it = Correlation, Ontology, CPU, Data (each data domain a planet); MOONS = their sub-data. A MacBook DOCK locked at the BOTTOM with features + shortcuts.
- ★ GOVERNING PRINCIPLE (THE WHOLE POINT): it is ONE LIVING ORGANISM. The brain + planets + grid lines + clusters are a SINGLE connected system that morphs / breathes / reacts TOGETHER, in real time, to (a) JARVIS's voice (one shared speaking+listening amp signal drives ALL of them at once) and (b) live data changes (planets grow / move / are born / brighten as the data updates). NOTHING is static or independent — speak → the whole cosmos responds; data ticks → the cosmos evolves. Every element below must subscribe to this one shared pulse.
- [UX] 🔄 ONE immersive navigable 3D universe (orbit/zoom/fly), NOT a side-tab dashboard
- [UX] 🔴 Centre = the SUN = an OVERSIZED MORPHING FACE — a holographic liquid-metal (chrome/mercury) JARVIS VISAGE that forms and morphs as he speaks, projected up the reactor beam tube. It is the LARGEST object in the universe — bigger than ALL planets, moons, satellites and meteorites. The face morphs/talks to the voice (the heart of the living organism). Celestial hierarchy: SUN(face) > planets(data domains) > moons(sub-data) > satellites/meteorites(minor points).
- [UX] 🔴 THE DATA ARE THE PLANETS: every topic/datapoint is a PLANET (GLB body) orbiting the central JARVIS brain = the STAR/sun. Click a planet → fly to it → info card.
- ★ REAL ONTOLOGY DATA (use the paid-for brain.db — server/data/brain.db, ont_object/ont_link): the MAJOR PLANETS = the 16 real ontology domains, SIZED BY REAL COUNT (log-scaled): Measurement 111,558 · DataSource 92,000 · Document 34,331 · DomainSubject 10,000 · Topic 7,031 · SpeciesOccurrence 3,136 · ScientificPublication 3,100 · Vulnerability 1,260 · AcquisitionPoint 1,000 · Place 544 · Asset 430 · Concept 309 · EarthquakeEvent 269 · Event 86 · Sensor 25 · AppPage 17. MOONS/satellites = entities within each domain. CONNECTIONS = the 570,670 real ont_link relationships. FEATURES/FUNCTIONS = ont_action_type / ont_link_type. Surface real titles + props in the info cards. (Add a /worlddata endpoint reading brain.db if /metrics register + /graphdata aren't rich enough.)
- [UX] 🔴 EACH object = real GLB/PBR (no procedural primitives for the main bodies): planets/functions/features/major-topics load a GLB/PBR from the EXISTING database (GET /assetlist jarvis_assets/*.glb + GET /library 1,638 generated GLBs, mapped by type/topic) OR generated from an image via Asset Forge (gpt-image-2 → Tripo). PMREM env reflections on PBR. Caveat: the 600-node long-tail constellation stays lightweight/instanced (can't load 600×3MB GLBs); planets + functions + major topics get full GLB/PBR.
- [UX] 🔴 NO WHITE DOTS (current state unacceptable): every object must be GRAPHICALLY SHADED (GLB/PBR or textured + lit + bloom), carry its IMAGE/texture, show its TITLE/label, and CONNECTIONS between related objects drawn as visible glowing lines (from /graphdata edges). Shaded objects + images + titles + connections — not dots.
- [UX] 🔴 CORRECT ASSIGNMENT: each object mapped to the RIGHT GLB/image/title/data for its type & topic (deterministic mapping), not random — the asset must match what the planet represents.
- ★ EXISTING GLB ASSET MAP (48 curated GLBs served at /asset/<name>.glb — USE THESE, render the world from them):
  CENTRE SUN = morphing FACE: jarvis_iron_man_helmet.glb (the JARVIS/Iron-Man face) projected up the reactor — jarvis_fusion_reactor_core + jarvis_arc_reactor + jarvis_projector_dais + jarvis_fusion_core_containment_torus, with the chrome liquid-metal morphing.
  PLANETS (data domains): jarvis_kit_data_orb / jarvis_command_atrium_data_orb / jarvis_ai_core_reasoning_orb (generic data); jarvis_analytics_globe + jarvis_analytics_observatory_hero_globe (measurements/analytics); jarvis_world_control_holo_earth + jarvis_world_control_earth_graticule + jarvis_world_control_equatorial_ring (geo/world data); jarvis_intel_graph_constellation_core + jarvis_intel_graph_constellation + jarvis_intel_graph_primary_entity_ring (correlation/ontology); jarvis_document_vault_book / jarvis_docvault_hero_document_book (documents); jarvis_security_core_shield (security/guardian); jarvis_command_atrium_orb_wireframe_lattice (clusters); jarvis_simulation_branching_tree (pipelines).
  HUD/DOCK/PANELS: jarvis_holo_panel_frame, jarvis_ai_core_glass_panel_frame, jarvis_ai_core_command_bar, jarvis_ai_core_left_icon_rail, jarvis_ai_core_component_radial_gauge_92, jarvis_kit_holo_shield, jarvis_kit_reactor_core_tower.
  (Long-tail topic planets: instanced low-poly + texture; the 1,638 Tripo GLBs are on disk but not yet in /library — re-index later via Asset Forge.)
- [UX] 🔴 IMPORTANCE-BASED SIZING (no uniform planets): FUNCTIONS & FEATURES = the LARGEST planets (most important); topics/headlines sized by magnitude/importance; minor datapoints = small planets/moons. Clear size hierarchy.
- [UX] 🔴 SIMILARITY CLUSTERING: similar planets group into solar-systems/constellations (by type + topic similarity), not random scatter — a galaxy of systems around the brain-star.
- [UX] 🔴 TRUE DISTANCE ALGORITHM (FRACTAL × FIBONACCI × φ — explicit, deterministic, repeatable):
   • ANGLE: object i at θ_i = i × 137.50776° (the golden angle) — Fibonacci phyllotaxis → perfectly even, no clumping.
   • RADIUS: r_i = R0 + k·√i  (Vogel/sunflower spiral) scaled by relationship/importance — closer to the Sun = more related/important (radius ∝ inverse relationship-strength to JARVIS).
   • SIMILARITY/DIFFERENCE: inter-object distance ∝ graph dissimilarity (from /graphdata edges / brain.db ont_link) — similar objects sit close (same cluster), different ones far apart.
   • FRACTAL/SELF-SIMILAR: the SAME golden-angle spiral law applies RECURSIVELY at every nested level — when you enter an ontology planet's own solar system, its entities lay out by the same φ/Fibonacci equation (self-similar at all scales).
   • φ proportions (1.618) for sizes/orbital gaps throughout. Acceptance pass must confirm positions are computed by this formula, not random.
- [UX] 🔴 Pinstripe/grid lines (keep — liked) but MORE alive: flowing energy/pulse waves along the lines, ripple under the pointer (parallax/interactive), and they pulse/brighten to the voice amp when JARVIS speaks; subtle data-driven shimmer
- ★ NESTED SOLAR SYSTEMS (the core navigation): each ONTOLOGY domain is its OWN PLANET at the top level (orbiting the Sun). CLICK a planet → camera flies INTO it → it OPENS into its OWN solar system, populated with that domain's real entities from brain.db (e.g. enter "Measurement" → a system of its measurements; enter "Topic" → its topics) as sub-planets/moons, connected by their ont_links. Recursive drill-down (system → entity → its connections) with a "back out" to the parent universe. This is what "you go into" means — you travel into each ontology's world.
- [UX] 🔄 Click a body → camera flies to it → (top level) contextual info card / (ontology planet) ENTER its solar system — NOT permanent tabs
- [UX] 🔴 DOCK = Apple iOS-style (NOT the current strip): each item is an APP ICON tile with a short NAME label under it, rounded, glassy, magnify-on-hover. MOVABLE — the whole dock can be DRAGGED to ANY position (any edge or free-floating anywhere on screen), and its position PERSISTS (localStorage). Not locked to the bottom.
- [UX] 🔴 DRAG-TO-PIN: floating functions/tools in the 3D universe can be DRAGGED out of the 3D scene and DROPPED into the dock → pinned as a shortcut icon (and removable). Bridges WebGL ↔ the DOM dock.
- [UX/Fn] 🔴 SECOND DOCK — "SELF-DEVELOPMENT" bar BENEATH the iOS dock: thicker, rectangular, same glassmorphic crystal-bubble graphic but BIGGER. Contains BLOCKS of AI suggestions of "what to build next", each block = a short title + detail + a STYLED hyperlink (underline hidden until hover, NOT blue) → click → a FORMATTED TEXT PROPOSAL page you can read about the design → each block has a "BUILD" button → clicking it makes CLAUDE EXECUTE the build (via POST /upgrade → Claude Code on the VPS). The bar KEEPS REFRESHING with NEW AI suggestions as builds complete. Backend: a /suggestions generator (LLM analyses the system → list of {title, detail, proposal}) + /proposal?id= (formatted) + /upgrade?key= (Claude executes). [/upgrade route already wired]
- [UX] 🔴 Crystal caption bubble: very transparent glassmorphic + iridescent rainbow light-reflection ring, shows live speech
- ★ ACCEPTANCE BAR: FULLY RENDERED, PRODUCTION-READY, 2K — the 3D UNIVERSE / WebGL canvas itself renders at native screen resolution (2560×1440), full devicePixelRatio (NOT downscaled/grainy), crisp/cinematic, ZERO grain or placeholder/flat fallbacks visible. (This is the universe GRAPHICS resolution, separate from the camera video.) Anything less is not done.
- [UX] 🔴 SMOOTH render (fix grain): SMAA/MSAA after bloom + ACES tone-mapping + sRGB + PMREM reflections + full pixel-ratio + dithering + high-quality materials/lighting (GTA-V gloss + Sims-4 clean)
- ★ HOLLYWOOD-CINEMATIC RENDER (the world still looks flat — must be film-grade): full post-processing stack — ACES HDR + layered bloom + DEPTH-OF-FIELD/bokeh + VOLUMETRIC god-rays/light-shafts from the Sun + lens flare + subtle motion blur + atmospheric fog/haze (depth) + soft contact shadows + tasteful vignette + film grain + slight chromatic aberration + high-quality PBR & reflections (PMREM env). Cinematic easing camera moves on fly-to. It must read as a Hollywood movie shot, not a 3D toy.
- [F]  🔴 Restore ALL data as 3D bodies/cards: Documents, CPU/RAM/disk/load, GPU/VRAM, KPIs, Inference 6-tier + call counts, Cross-Correlation, LLM Router, Live Activity, Knowledge/Ontology, Alerts
- [UX] 🔴 4 KEY GLASS PANELS flanking the world (2 LEFT, 2 RIGHT): the 4 most important panels from the FIRST good build (dashboard_v2) — proposed: Infrastructure (CPU/RAM/GPU/VRAM) · Pipelines/Runners (toggles, Run/Stop/Restart) · Knowledge & Ontology · Inference Fabric (6-tier + call counts). Rendered as SEE-THROUGH glassmorphic crystal-bubble panels (blank/transparent, rainbow-edge), NOT solid tab cards. LAYOUT: 2 panels FIXED & stacked on the LEFT edge, 2 FIXED & stacked on the RIGHT edge — fixed position, flanking the central world.
- [UX] 🔴 BOTTOM BAR FULL-WIDTH: the EXISTING command/talk bar (the one with the ARCHON button) must span the FULL WIDTH along the very bottom edge of the page (left edge → right edge), fixed. The iOS dock + 2nd self-development dock sit just above it; the 4 glass tiles flank the sides. Nothing overlaps (fixes the current dock/talk-bar collision).
- [UX] 🔴 The 4 panels are INTERACTIVE DRAG-DROP zones: drag any planet/moon/satellite/meteorite (each = an ontology/feature/function object) OUT of the 3D world and DROP it into a panel to inspect/interact with it (and back). Bridge WebGL ↔ DOM, like the dock.
- [UX] 🔴 INDIVIDUAL OBJECT SIZING: each celestial object sized per its type/importance — some FIXED size (e.g. the GLB-creator function), others LARGER by importance/feature weight. Mixed fixed + importance-scaled sizes (no uniform sizing).
- [Fn] 🔴 WORKING controls in-universe: pipeline toggles on/off; runners Run/Stop/Restart; Run All/Pause/Stop/Sleep

## 2. VOICE & PERSONA
- [F]  🔄 swarm: HUMAN ~60yo softened British Cockney / working-class London MALE voice via XTTS-v2 (isolated service + Piper fallback + cache) — Piper alone is NOT human enough
- [Fn] ✅ Conversation on local LLM (qwen2.5:32b) — smart, in-character, never refuses to build
- [F]  ✅ JARVIS personality FILE (jarvis_persona.md) as his brain
- [Fn] ✅ Sir/ma'am speaker recognition (address param)
- [Fn] ✅ Voice modulator (pitch/tempo/EQ, live-tunable) — defaults clean until XTTS lands
- [Fn] ✅ Neural voice plays on first tap (greet-before-camera; plain <audio>; mobile audio-unlock) — proven headless

## 3. HER CARE / GUARDIAN  [SAFE]
- [SAFE] ✅ /talk companion: 1:1 JARVIS, back-to-back, never times out
- [SAFE] ✅ Two-way video mum⇄son (negotiation order fixed; both see each other) — proven headless
- [SAFE] 🔴 2K video both pages (currently 1280 on guardian) + H265/VP9 + zoom
- [SAFE] ✅ Emergency: Call 911 / family / "I've fallen" (tel:) + SOS + dead-man's-switch offline alarm
- [F]  🔄 Guardian camera/mic as a prominent option in the universe
- [SAFE] 🔴 Open her apps by voice (Rocky mobility, captions/hear-TV) — Android intents (best-effort)
- ⛔ Read notifications/Instagram, control any native app, run-when-locked, remote phone unlock — impossible from a browser (needs a native companion app)

## 4. AGENT OS (backend functions)  🔄 swarm: agent-os
- [Fn] 🔄 Tool Registry, Action Executor, Job Queue, Live Event Stream, Memory, Permission engine
- [Fn] 🔄 Real tools: disk audit, docker, storage compress/offload, gpu status, file ops, memory, knowledge stats

## 5. HOME / DEVICE CONTROL
- [F]  🔄 swarm: AirTouch 5 / Daikin climate ("I'm cold" → warms her zone) — console id 94302563, local TCP :9005 via a HOME BRIDGE (outbound tunnel) 🔧 needs the bridge run on a home device + her network
- [F]  🔴 Samsung TV via SmartThings (open remote / cloud token) 🔧 needs SmartThings token

## 6. CLAUDE / SELF-DEVELOPMENT
- [F]  ✅ Claude builder via /ask (governor picks model; Archon mode) — token now PERSISTENT (no more "unauthorized")
- [F]  ✅ Voice/chat build-routing: "build/make/code X" → Claude builder (saying = doing)
- [Fn] ✅ /upgrade self-development route wired (brief → web research → Claude executes)
- [F]  🔴 Surface Claude chat + Archon + upgrades + budget meter in the universe
- ⛔/🔧 Claude-as-root file/command agent — harness safety gate; needs your approved permission rule

## 7. ORIGINAL APEX / PALANTIR FOUNDATION (the trigger)
- [F] 🟡 Apex = Foundry+Gotham+Apollo+AIP; cross-section interfeed + consistency
- [Fn] 🟡 2×4090 hammered every tick: scrapers + OCR + Llama building the baseline KB (live_data/batch_loader/correlator produce; full sweep = verify)
- [Fn] 🟡 jarvis_scraper.py security/intel toolset (sqlmap/nuclei/ffuf/katana/httpx/scrapling/camoufox/botasaurus…) — verify wired
- [Fn] ✅ Ollama↔Vast GPU connection (box /v1) live

## DONE this session (verified headless)
persistent control token · /chat 32B brain · build-routing · greet-before-camera (silence fixed) · /upgrade route · voice modulator · /file + /asset endpoints · /tts neural voice ·
✅ IMMERSIVE 3D UNIVERSE FOUNDATION (jarvis_live.html, three@0.136 pinned): WebGL renders, render loop live, 31 data bodies + 600 constellation, click→fly→info card, minimal HUD no side-tabs, GLB brain (fusion_reactor_core+dais+torus) audio-reactive, greeting plays — universe_proof.cjs ✅ ·
✅ TWO-WAY LIVE VIDEO mum⇄son BOTH directions (guardian offer-churn bug fixed: offerSent latch + single poll + answer-state guard) — cam4.cjs both pc=connected remoteTrack[audio,video], cam2.cjs live frames both ways ✅

## INTEGRATION PASS (🔄 swarm: builds ON the proven universe foundation) — applies §1 governing principle + refinements
living-organism coupling (one shared pulse) · importance-sizing (functions/features = biggest planets) · similarity clustering · Mac dock · crystal caption bubble (rainbow ring) · smooth render (SMAA+ACES+PMREM+pixelratio+dither) · animated/interactive pinstripe grid · wire WORKING controls (toggles, runner Run/Stop/Restart, Run-All/Pause/Stop/Sleep) · keep three@0.136 + GLB brain + greeting + two-way video.
