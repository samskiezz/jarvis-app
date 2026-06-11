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
- ★ GLB↔TOPIC SEMANTIC ASSIGNMENT (CORRECTION — not generic planets): each topic/object renders as the GLB whose NAME/PROMPT SEMANTICALLY MATCHES that topic — the 1,638 Tripo GLBs were generated FROM topics (e.g. topic "balance scale" → gen_tripo__balance_scale_lab.glb; "picture window" → its window GLB). Match each topic/entity to its closest topic-GLB by name similarity (use scripts/index_generated_glbs.py names). The solar-system is ONLY the layout/navigation REFERENCE (NASA Eyes) — this is NOT a space/astronomy theme. Objects = JARVIS's real topics rendered as their own matching models.
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
- [Fn] 🔴 TASK PROGRESS TICKER (broken — fix): a LIVE task log in the UI polling GET /tasks (~2.5s) showing EACH task with a live % progress bar + status + elapsed/ETA + pause/cancel/clear. Claude builds (/ask), media gen, /upgrade all stream % here (task_daemon already tracks pct; /tasks exists — the universe page just isn't polling/rendering it). Ask JARVIS to build → the job appears and climbs 0→100%.

## 1b. NASA "EYES ON ASTEROIDS" FEATURE PARITY — build EVERY interaction the same (mapped to our ontology cosmos)
- [Fn] 🔴 CAMERA/NAV: left-drag = orbit (all directions); scroll/pinch = zoom (close-inspection ↔ macro); WASD + Z/C keys (Z/C zoom) for expert move; hold SHIFT = move faster; smooth inertia; reset-view button. Click ANY planet/label/icon → camera FLIES to it + opens its info panel.
- [Fn] 🔴 SEARCH bar: query the ENTIRE ontology (entities/topics/domains/measurements from brain.db) → fly to the result (+ jump to its date/time on the timeline). (NASA: "type in search bar… fast-forward to a date".)
- [Fn] 🔴 LIVE WATCH (= 'Asteroid Watch'): panel of the next/top live events — newest measurements, recent correlations/SAME_AS merges, alerts — with live countdown/timestamps.
- [Fn] 🔴 TIME SCRUBBER (bottom timeline): scrub backward/forward through the data's time — play/pause, speed rate, "now" button, date readout — the cosmos evolves to that moment (planet counts/positions at that time).
- [Fn] 🔴 FILTERS: show only one ontology type at a time (Measurements / Documents / Topics / Vulnerabilities / DataSource / …) — like comets/asteroids/PHOs.
- [Fn] 🔴 SETTINGS menu: toggle display LAYERS (orbits, labels, connection lines, clusters), incremental zoom +/−, lighting control, FULLSCREEN.
- [Fn] 🔴 LEARN / TOURS: guided explanations + cinematic fly-alongs (e.g. "how cross-correlation works", fly to the biggest domain).
- [Fn] 🔴 EVENTS tab: animated views of live system events (a pipeline running, a correlation merge, a scrape) — like the spacecraft-encounter animations.
- [Fn] 🔴 INFO PANEL on selection: real data for the selected object (from /detail + brain.db) — props, connections, actions, drill-in.
- [UX] 🔴 Hover highlight; labels that scale with distance + leader lines; loading screen; share/link; units toggle.
- [UX] 🔴 PLACEMENT ON OUR EXISTING DOCKS (put NASA features where they belong, don't add new bars):
   • TOP BAR (top-right): SEARCH box · SETTINGS ⚙ (layers/lighting/units) · RESET-VIEW · FULLSCREEN.
   • iOS APP DOCK (movable): app-icon shortcuts → Live-Watch · Filters · Learn · Events · Library · Image · 3D · Guardian · Agent · Studio.
   • BOTTOM FULL-WIDTH ARCHON BAR: keep Talk-input + mic + send + ARCHON + budget, AND add the TIME-SCRUBBER row across it (play/pause · "now" · speed · date readout).
   • SELF-DEV DOCK (the 2nd dock): the AI build-suggestions (already there).
   • 2 SIDE GLASS PANELS/side: the 4 data panels (Infra · Pipelines · Knowledge/Ontology · Inference) + Live-Watch/close-events + Filters live in these.
   • 3D CANVAS: WASD/drag/scroll nav + a small reset/help chip in a corner.

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

## 8. SWARM ENGINE & RESILIENCE (✅ built+proven this session — the autonomous build system)
- ✅ WATCHDOG (jarvis-watchdog pm2): auto-heals hung/crashed lifeline services (proven: healed jarvis-tasks in 26s); `pm2 save` keeps reboot-resurrect current.
- ✅ AGENTS SURVIVE RESTARTS (proven, parent=init): every Claude agent launches fully DETACHED + reparented to init via setsid, so a pm2/daemon restart can't kill it — boot-reclaim re-attaches by PID. Also survives crashes (auto-retry ×2), reboots (boot-reclaim + pm2 resurrect), and your session closing (server-side daemon).
- ✅ DURABLE SWARM RUNNER: each swarm = an ordered 13-stage pipeline; plan+per-stage results+position checkpointed to sqlite (swarms table) → resumes from EXACTLY where it was after any restart; prior-stage memory carried forward (no loss between layers).
- ✅ 13-STAGE PIPELINE per task: research → draft → engineer → review-plan → code → review-code → revise → final-review → STANDARDS-GATE → publish+compare-to-draft → production → master-smoke-test → finalize.
- ✅ LANE-PARALLEL (file-safe): swarms run in lanes (universe=jarvis_live.html, backend=dashboard.py+services, care=jarvis_voice/guardian); ≤1 swarm per lane at once (never 2 agents on the same file) but lanes run concurrently (~4×). PRIORITY field orders run within a lane.
- ✅ STANDING RULES injected into EVERY stage of EVERY swarm: WHO-THIS-IS-FOR (severely disabled, Stephen-Hawking-type, end-of-life — build it right + accessible for her) · NO STUBS/full implementations · RESEARCH-WHEN-UNSURE (≥1 webpage + 1 forum + 1 doc, from real GitHub/npm/official/patent 2026 sources) · billion-dollar bar (Apple/Palantir/Google/NVIDIA) · Hollywood-cinematic / never-easier-option · hands-free voice+text access for every feature · never break the lifeline.
- ✅ MODEL TIERING (better+faster, from research): Opus forced on code/revise/standards-gate; lighter stages auto-tier to faster models via the token governor.
- ✅ JARVIS SWARM ABILITY: voice/text "build me X" → /swarm → durable pipeline, JARVIS narrates progress + completion.
- 🔄 NO PRs — IN-APP REVIEW (replaces deploy-PR): work ships live; you review + Approve/Decline in the app's live task list. Approve→commit+push+merge to main needs YOUR git permission rule (I cannot self-grant it).

## 9. UNIVERSE ADDITIONS (this session — on top of §1)
- 🔴 NASA-EYES 1:1 REPLICA (eyes.nasa.gov/apps/asteroids/#/home): PLANETS=features/functions · MOONS=sub-features · SATELLITES=orbiting subtopic/sub-sub info · METEORITES=minor analogies — all rendered as their topic-assigned semantic GLBs (the 4,132 real GLBs found, or created).
- ✅ GLB FIX: the 677 /media gen_tripo stubs were broken 0-byte files; /media now serves the REAL high-grade models (tripo 14.5MB, uw 3.3MB) custom per body; mobile swaps the heavy tripo for light /asset GLBs.
- 🔴 EVERY MINI-APP + PANEL WORKS END-TO-END (no stubs): Talk/Library/Create/Image/3D/Guardian/Climate/Agent OS/Vitals/Upgrades/Status/Studio + the 4 glass panels + self-dev — each completes its real task, wired to real backend + JARVIS voice.
- 🔴 DOCK CAROUSEL: slide/blend carousel of mini-apps; GLOBAL animation + interaction layer applied to ALL apps/pages/panels where missing.
- 🔴 HYPER-REAL RENDER (HDRP-grade → three.js): + subsurface scattering, decals, hair/fabric/eye shaders, MeshPhysicalMaterial clearcoat/sheen/anisotropy, SSAO/GTAO+SSR, BokehPass DOF, physically-based light units, volumetric, AOV image-seq → ffmpeg H.265 master.
- 🔴 HIGH-END THREE.JS STACK (researched refs): three.js official examples (LOD world-streaming, GPU particles, instancing), Codrops Blender→web pipeline, THREE.js PathTracing renderer (GI/glass/metal), Bruno Simon nav; KTX2 textures + Draco/Meshopt compression + BVH collision + WebGPU renderer with WebGL fallback; React-Three-Fiber where it helps.
- 🔴 MOBILE RESPONSIVE (her phone): dock fits/scrolls, the 4 panels reachable on mobile (not hidden <1180px); ADAPTIVE PERF tier for Samsung S25 (auto-scale DPR/particles/post-FX + low-power 2D fallback).
- 🔴 PWA: install to home screen + auto-reconnect + offline so her lifeline survives network drops.
- 🔴 HIDE the 86 legacy pages behind the universe.

## 10. ACCESSIBILITY CORE (for a Stephen-Hawking-type user — foundational)
- 🔴 FULL VOICE-ONLY operation (every action by speech) · READ-EVERYTHING-ALOUD (screen, Instagram feed, S25 notifications, captions, task list) · SWITCH-ACCESS + dwell-click + extra-large targets + one-tap · HIGH-CONTRAST + large-text + reduce-motion · ALWAYS-ON CAPTIONS (JARVIS speech + two-way video) · CALM/simplified mode (psychosis-safe, never patronising) · webcam EYE-GAZE/head-tracking pointer · predictive text/word-completion.
- 🔴 JARVIS gets VOICE+TEXT access to EVERY feature (unified intent router); every capability also a tool the swarm/agent layer can call.

## 11. CARE ADDITIONS (this session — on top of §3)
- 🔴 SECURE REMOTE SUPPORT: WireGuard VPN + remote CO-CONTROL (carer operates her device when she can't tap) — transparent, no MITM.
- 🔴 HEALTH: emergency contacts · medication/appointment reminders · health alerts · health-data link (HealthKit / Google Health Connect) · OAuth sign-in (consented, legit only — NO disguised access).
- 🔴 SOLAR/BATTERY monitor on HER OWN system (official inverter API) + medical-backup reserve + low-power alert (keeps CPAP/heating/med-fridge powered).
- 🔴 READ-ALOUD her Instagram feed + Samsung S25 notifications on open · control Rocky mobility (anti-fall) · CC captions (hear TV) · TV via Samsung remote/SmartThings.

## 12. PLATFORM / AGENT-OS ARCHITECTURE (this session)
- 🔴 GPU OFFLOAD to Vast 2×4090 (embeddings/heavy compute, CPU fallback) · Palantir Gotham/Foundry AIP INVESTIGATION mode (graph link-analysis over 570k ont_link) · ANYWHERE-SHORTCUTS launcher (pin files/folders/images/docs/links).
- 🔴 AGENT OS beyond the 17 tools: State Engine · Automation Runner · GPU Worker Control · Live Event Stream UI · File/Server Control · UI Command Centre · token/cost UI.
- 🔴 DATA: restart producers (live_data/live_docs/correlator/enrich) so the KB grows (+/h>0, currently OFF) · scrape-on-gap (no 'pending') · brain.db/data-store backup & failover (hard-protect) · regenerate 677 Tripo GLBs + GLB v2 'script-code' handling.
- 🔴 BACKEND REAL: /vitals (CPU/mem/disk/GPU/pm2) · /vpn (WireGuard) · /solar · /tasks pause/cancel/clear · fix /swarm?id= empty bug · fix 'reconnecting' + suggestion engine · hunt every fake/non-loading module.

## 13. LIVE SWARM STATUS (server-side, durable)
- ~27 swarms running lane-parallel, 13 stages each, priority-ordered. Key: #13 universe hierarchy/semantic-GLBs (boosted) · #33 control-surface in-app review · #40 every-app-end-to-end · #37 accessibility · #38 carousel+animation · #39 high-end three.js · #34 theme · #35 Agent-OS · #36 JARVIS-access · #19/#20 backend+data · #21/#22 care · plus #14-#18 universe + #24-#31.

## 14. 🟡 NEEDS YOU (cannot be done autonomously)
- ADD the git-push permission rule in YOUR Claude Code settings (`Bash(git push:*)` etc.) → enables one-click Approve→main. I am blocked from self-granting it.
- Run the Daikin/AirTouch5 HOME-BRIDGE on her network · give her inverter brand+model+login (solar) · top up the Tripo budget (GLB regen).


## DONE 2026-06-10 (verified live — honest audit)
- ✅ DEPLOY-PATH FIX: /jarvis/ 404 trap (fetch/XHR/EventSource prefix wrapper) — planets/moons/satellites load on the public URL
- ✅ SERVICE-WORKER CACHE FIX (solar-flow2 sw.js v3): /jarvis/ navigations bypass stale cache — always loads fresh
- ✅ BLUE-ORB ROOT CAUSE: brainFallback double-scale (22×22≈484u giant faceted ball) — fixed + holographic fallback
- ✅ FUNCTIONAL HIERARCHY (user model): app PLANETS sized by importance (Talk 660 > … > Upgrades 564) ▸ MOONS = real sub-features (each opens its real fn) ▸ SATELLITES = real pm2 services under Vitals▸Services ▸ METEORITES = live alerts under Vitals▸Alerts — STRICT containment, nothing floats free
- ✅ SIZE RATIO CHAIN (user spec): planet = 50× moon · moon = 25× meteorite · meteorite = 20× satellite; CORE SUPREME (×60, nothing bigger than the AI core)
- ✅ φ ALGORITHM VERIFIED LIVE: golden angle 137.50776° measured 15/15 between galaxies; Vogel radii; relRadius (most-related innermost); recursive self-similar at moon level
- ✅ VAST SPACE: galaxy field 25k–60k · app ring 12k · telemetry band off the core (4.5k–10.5k) · topic belt → 200k backdrop · stars 220k · zoom 6→150k · core-POV start (camera at core looking out)
- ✅ VISUALS: holographic everything (translucent core + wireframe grid + fresnel 3D depth) · dashed orbit lines · full orbital motion every tier · hover/select glow + selection ring + SFX (off by default) · open black space (no enclosing orb) · glow restored (bloom 0.9/0.62)
- ✅ REAL PANELS: bodies pickable; cards fetch real ont_link relationships; satellite cards = real pm2 restart/logs; progressive disclosure (galaxy→planets→moons drill-in); lock-on camera follow
- ✅ VOICE (the big one): XTTS clone now conditions on the DESIGNED JARVIS refs (jarvis_01/02 — Cockney moved to ref_backup_cockney) · greeting pre-warmed (4ms cached, plays in HIS voice on tap) · web fallback can never sound female (deep pitch if no male voice) · GENDER-DETECT from live mic pitch → ma'am/sir (was hardcoded 'sir'!) · NEUTRAL until voice assessed · butler-refinement persona · always-on listening + barge-in
- ✅ DATA PRODUCERS RESTARTED (§12): stopped knowledge daemons started; vitals warnings 4→2
- 🔴 STILL OPEN (next): 2K/H265 guardian video · PWA install+offline · WireGuard/co-control · health reminders/OAuth · solar monitor · NASA parity (time scrubber/filters/tours/events) · dock carousel + global animation layer · hyper-real render pass · GPU offload · mobile adaptive perf tiers

## CAPTURED REQUESTS (auto-logged from chat — explicit make/do/run, execute accordingly)
- 🔴 [2026-06-10 04:01] make a test feature and run it
