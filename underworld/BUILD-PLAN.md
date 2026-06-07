# Underworld — Full Build Plan (photoreal, 12,000 GLBs, Llama-driven sim)

Dependency-ordered. **Build top-to-bottom** — each phase needs the one above it.
Status: ✅ done · 🔨 in progress · ⬜ to build.

---

## PHASE 0 — ASSET INTELLIGENCE (the foundation everything depends on)
*Nothing can place or render 12k GLBs without knowing what each one IS.*

- ⬜ **0.1 Asset crawler** — walk all 12,000 GLBs, record path, size, bounding box,
  poly count, materials/textures present, has-skeleton (animatable?).
- ⬜ **0.2 Auto-classifier** — tag every GLB into a **category** (wall / floor / roof /
  residential / commercial / tower / civic / tree / rock / water / vehicle / character /
  prop / biome-stone/bronze/iron / era) from path + filename heuristics, falling back to
  **minicpm-v on the GPU** to classify a rendered thumbnail when ambiguous.
- ⬜ **0.3 Asset catalog DB** — `{category: [glb…]}` + per-asset metadata, served as a
  manifest. THIS is what the layout engine + renderer consume.
- ⬜ **0.4 Validation** — flag broken/oversized GLBs, dedupe, confirm PBR maps present.

## PHASE 1 — WORLD STRUCTURE (the φ/Fibonacci/fractal matrix)
- ✅ **1.1 Layout engine** — Fibonacci rings + golden-angle phyllotaxis + fractal
  golden-rectangle plots + fBm warp + L-system roads (`world_layout.py`).
- 🔨 **1.2 Catalog binding** — feed the 0.3 catalog into the layout so every slot gets a
  real GLB (residential ring → your house GLBs, wall ring → your wall GLBs, etc.).
- ⬜ **1.3 Terrain** — fBm/fractal heightmap + biome map (so rings sit on real ground).
- ⬜ **1.4 Rivers/coast/lakes** — fractal (midpoint-displacement) water network.
- ⬜ **1.5 Era progression** — stone→bronze→iron swaps the GLB set + density per tick.
- ⬜ **1.6 Collision + navmesh** — derived from placements so minions path around walls.
- ⬜ **1.7 Layout API** — `GET /worlds/{id}/layout` manifest (both renderers consume it).

## PHASE 2 — RENDERER (photoreal — the look)
*Pick the track. Both consume the Phase-1 manifest + Phase-0 catalog.*

### Track A — NVIDIA Omniverse RTX (path-traced, film-grade, free, on the 4090s)
- ⬜ **2A.1 Install Omniverse Kit** on the GPU box (verify it fits disk).
- ⬜ **2A.2 GLB→USD batch import** of all 12k (Kit Python; Nucleus or local USD).
- ⬜ **2A.3 Stage builder** — read the layout manifest, instance USD prims per slot.
- ⬜ **2A.4 RTX Path Tracing** + HDRI sun/sky + materials (MDL/PBR) + post.
- ⬜ **2A.5 Scene-state poller** (Kit Python ext) — spawn/move minion prims live.
- ⬜ **2A.6 Web streaming** (Omniverse Streaming → browser).

### Track B — Three.js max (interim, already live at :5180)
- ✅ rigged minions, postprocessing (ACES/Bloom/N8AO/SSR/SMAA), HDRI, water.
- ⬜ **2B.1 Consume the layout manifest** instead of the current Poisson placement.
- ⬜ **2B.2 Spatial streaming + instancing + LOD** — 12k GLBs can't all load; stream by
  camera proximity, GPU-instance repeats, swap LODs.

## PHASE 3 — MINIONS (full simulation, rendered)
- ✅ scene-state contract (position/anim/mood/saga/guild) drives both renderers.
- ⬜ **3.1 Rigged avatars** — per-guild skinned GLBs, anim state machine by activity
  (idle/walk/work/study/build/forge/breed/fight) from the `anim` field.
- ⬜ **3.2 Appearance** — guild skins/accessories, age, mood tints, equipment.
- ⬜ **3.3 Activity props** — minions carry/use the right GLB per saga (tools, carts).
- ⬜ **3.4 Vehicles + crowds** — instanced movers on the road network.
- ⬜ **3.5 Selection/inspection/camera** — click a minion, follow, free-fly immersion.

## PHASE 4 — SIM DEPTH (backend — mostly exists, verify end-to-end)
- ✅ lifecycle, breeding, economy, LLM decisions, scheduler (ticking now).
- ⬜ **4.1 Every feature executes start→finish** — audit each minion ability runs &
  renders (work, research/patents, build, trade, guild, family, conflict, death).
- ⬜ **4.2 Day/night + weather + seasons** fed to renderer (partly in scene-state).

## PHASE 5 — LOADER + PRODUCTION
- ✅ `HeroAssembleLoader` (glowing GLB assemble) + `GameLoader` staged loader exist.
- ⬜ **5.1 12k-asset staged streaming** — load_order across stages so the screen fills
  fast and never looks blank; progress UI.
- ⬜ **5.2 Perf budget** — draw-call/VRAM caps, instancing, frustum + occlusion cull.
- ⬜ **5.3 Production deploy** — services, persistence, scaling.

---

## CRITICAL PATH — what to build FIRST (in order)
1. **0.1–0.3 Asset catalog of the 12k GLBs** ← *blocks everything; start here.*
2. **1.2 bind catalog → layout** (the matrix already exists, just needs real GLBs).
3. **2B.1 Three.js consumes the manifest** → see the φ/fractal world with your assets NOW.
4. In parallel: **2A.1 Omniverse install** (the photoreal track) + **1.3 terrain/biomes**.
5. Then **3.1 rigged minions** on the new layout, then sim audit (4.1), then loader (5.1).

> Rationale: the catalog (0.1–0.3) is the linchpin — the layout engine, both renderers,
> minions, and the loader all need to know which of the 12k GLBs is a wall vs a house vs
> a tree. Build it once, everything downstream becomes deterministic.
