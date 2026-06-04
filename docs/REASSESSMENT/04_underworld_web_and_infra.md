# 04 — Underworld Web Frontend & Repo Infrastructure: Complete Inventory

Exhaustive file-by-file inventory of the **3D Underworld frontend** (`underworld/web/`)
plus repo-wide **config / deploy / docs / scripts** (root configs, `forge/`, `*.toml`,
`*.yml`, Dockerfiles, `deploy/`, `docs/`). Every source file under
`underworld/web/src/` was read in full; the 3D asset pipeline, deploy stacks, CI agent,
and design docs were inventoried directly from disk. Paths are absolute.

> Scope note: This document covers the **web/UI/infra surface**. The Python simulation
> backend (`underworld/server/`, `server/`) is out of scope here except where the web
> client touches it (API contract).

---

## 0. Top-level layout of `underworld/web/`

```
underworld/web/
├── index.html                 # SPA entry (mounts /src/main.tsx)
├── package.json               # underworld-web@0.1.0 — React 18 + R3F + drei + postprocessing
├── vite.config.ts             # @ alias → ./src, dev port 5174 strictPort
├── vitest.config.ts           # jsdom + globals
├── tsconfig.json / .app.json / .node.json   # strict TS, ES2022, bundler resolution
├── tailwind.config.js         # "liquid-glass" ink/glow theme, keyframes
├── postcss.config.js          # tailwind + autoprefixer
├── eslint.config.js
├── .env.example               # VITE_UNDERWORLD_API_URL / _API_KEY / _PIXELSTREAM_URL
├── dist/                       # PRE-BUILT bundle present (assets/ index.html models/)
├── public/models/             # ~1,488 GLBs + textures/HDRIs/manifests (see §2)
└── src/                        # all app code (see §1)
```

The build is **single-package**: the repo-root Dockerfile (`underworld/Dockerfile`)
builds this `web/` and the FastAPI backend serves `web/dist` on the same port.

---

## 1. `underworld/web/src/` — every file, purpose + wired status

### 1.1 Bootstrap & routing

| File | Purpose | Status |
|---|---|---|
| `src/main.tsx` | React root. Wraps app in `QueryClientProvider` (TanStack Query: no refetch-on-focus, retry 1, staleTime 10s) + `BrowserRouter`. | **Wired** |
| `src/App.tsx` | Route table. Wraps everything in `<AuthGate><GameLoader>…`. Routes: `/` CommandCentre, `/worlds/:id` WorldDetail, `/population`, `/projects`, `/knowledge`, `/inventions`, `/inventions/:id`, `/patents`, `/guilds`, `/safety` — all under `<Layout>`. | **Wired** |
| `src/index.css` | 290-line Tailwind layer: design tokens, `.panel`, `.btn-*`, `.badge`, `.stat-card`, skeletons, animations. | **Wired** |
| `src/vite-env.d.ts` | Vite/`import.meta.env` types. | **Wired** |

### 1.2 Auth & loaders (the bootloader chain)

| File | Purpose | Status |
|---|---|---|
| `src/components/AuthGate.tsx` | Bearer-key gate. Reads stored key (`getApiKey`), validates via `useQuery(api.me)` against `/auth/me`. Shows a branded "UNDERWORLD v0.2 master reference" login form; on submit stores key + reloads. Falls through to children when authenticated. | **Wired** |
| `src/components/GameLoader.tsx` | RuneScape-style real-progress loader. `discoverAssets()` → `preloadAll()` drives 0→100% with phase labels (`TIPS`/`FLAVOUR`). Full-bleed key-art backdrop (`underworld_loadscreen.png`); "Enter the Underworld" gate appears only at 100%. Toggleable synthesised theme music (`loaderMusic`). A `● RECORD` button captures the GPU hero canvas via `recordCanvas`. **The 3D HeroAssembleLoader is gated off** (`{false && heroReady && …}`) — the static key-art is the current hero. | **Wired** (3D hero **dormant**) |
| `src/components/HeroAssembleLoader.tsx` | The "exploded logo assembles as it loads" 3D hero. Loads `/models/hero/underworld_hero.glb`, union-finds mesh into rigid pieces, patches PBR shader so pieces fly apart→reassemble driven by progress, with Bloom/ACES post. **Imported by GameLoader but its render path is disabled** (`&& false`) and gated on a HEAD probe for `underworld_logo.glb`. | **Dormant** (code complete, not rendered) |
| `src/components/Layout.tsx` | App shell: glass sidebar (Simulation nav: Command/Population/Projects/Inventions; Reference nav: Knowledge/Patents/Guilds/Safety), footer aggregate stats (alive/total/Σticks/worlds from `listWorlds`), top bar, Sign-out (`clearApiKey`). | **Wired** |

### 1.3 Pages (`src/pages/`)

| Page | Route | Purpose | Status |
|---|---|---|---|
| `CommandCentre.tsx` | `/` | Forge-a-world form (name, CPC class, starting pop, cap, starting age, auto-start), 8 CPC suggestion chips, aggregate StatCards, active-worlds grid w/ delete. Polls `listWorlds` @5s. | **Wired** |
| `WorldDetail.tsx` | `/worlds/:id` | The flagship page. Hosts the **3D `WorldScene3D`** (or `PixelStreamingViewer` via the `webgl`/`ue5` render-tier toggle), selection HUD (follow-cam / WASD override toggles), stat cards, tabs (Overview / Population / Systems / Events). Polls world/map/minions/events/inventions/population/actions/climate/thoughts (3–4s), live SSE via `useWorldStream`. Auto-starts a paused tick-0 world. | **Wired** |
| `Population.tsx` | `/population` | Demographic dashboard per selected world: births/deaths/forks sparklines, guild & swarm-role distribution, mood bar, living-minion roster with **breed (2-click pair)**, **fork**, **prune** mutations. | **Wired** |
| `Projects.tsx` | `/projects` | Section-8 research-project Kanban (7 stages hypothesis→approved), clinical/genetic/chem-synth flags, contribution drill-down. | **Wired** |
| `InventionList.tsx` | `/inventions` | Cross-world invention log (fans `listInventions` over all worlds), status filter, **operator "Charter" panel** (`charterInvention`). | **Wired** |
| `InventionDetail.tsx` | `/inventions/:id` | Single invention: brief, cited-patent links, feas/novelty/safety scores, **operator decision** (approve/reject/safety-veto → `decideInvention`), peer-review list. | **Wired** |
| `KnowledgeLibrary.tsx` | `/knowledge` | KB browser: Formulas (search + discipline/source filters + pagination), Concepts, Swarm Roles, Guardrails. Sources: V2 Master Ref + V4 Physics compendium. | **Wired** |
| `PatentScanner.tsx` | `/patents` | USPTO PatentsView search via `searchPatents` (expired-only toggle, quick queries), Google Patents links. | **Wired** |
| `Guilds.tsx` | `/guilds` | 11-guild lore cards + lore drawer (founding myth, hero tale, rituals, review checklist, starting skills). Reads `api.guilds`. | **Wired** |
| `Safety.tsx` | `/safety` | Hard-gate probe (`safetyCheck`) + recent blocks list (`listSafetyReviews`). CPC allow-list F/G/H/E/B; block A/C. | **Wired** |

### 1.4 Other shared components (`src/components/`)

| File | Purpose | Status |
|---|---|---|
| `MinionDrawer.tsx` | 480px right drawer for a selected minion. Polls 10 endpoints @3s: vital signs, **in-character chat** (`chatMinion` w/ history), cognition (neural dispositions / learned beliefs / trained ML models), personality (OCEAN+), DNA preview, soul/karma/ascension, skills, relationships, lineage, memories, fork button. | **Wired** |
| `WorldSystems.tsx` | "Systems" tab grid: climate, environment (food/water/soil/pollution/tectonics/epidemic), physics compendium, society/culture, discoveries, research gaps, species, memes. 9 read-only queries. | **Wired** |
| `MoodBar.tsx` | Stacked mood-distribution bar (7 moods). | **Wired** |
| `Sparkline.tsx` | SVG area+line sparkline. | **Wired** |
| `WorldSystems.tsx` | (above) | |
| `components/ui/*` | Presentational kit: `Avatar` (procedural hex portrait from id hash), `GuildBadge` (`GUILD_META`), `RoleBadge` (`ROLE_META`, 10 swarm roles), `StatCard`, `ProgressBar`, `Tabs`, `EmptyState`, `CopyButton`. | **Wired** |

### 1.5 The 3D scene system (`src/components/scene/`)

Renderer: **React-Three-Fiber + drei + @react-three/postprocessing** over Three r0.169.

| File | Purpose | Status |
|---|---|---|
| `WorldScene3D.tsx` | **Master scene component.** 1000-unit open world, amplitude 45. Builds the `<Canvas>` (PCFSoft shadows, ACES tone-map, low-power detection drops SSR/N8AO + caps DPR). Composes: HDRI `<Environment>`, `fogExp2`, `Lights`, `CelestialBodies`, `Terrain`, `Water`, `WorldEnvironment`, `GeneratedWorld`, `Vehicles`, `Weather`, up to **130 `MinionAvatar`s** (LOD-capped, "+N off-screen"), `OrbitControls`, `FollowRig` (eases camera to selected minion), `WasdInput` (camera-relative override movement). Post stack: N8AO, SSR, Bloom, Vignette, SMAA, ToneMapping, Hue/Saturation, Brightness/Contrast. Maps backend 5-state weather→3 rendered states. HUD overlay (time-of-day, season, temp, alive count). | **Wired** |
| `GeneratedWorld.tsx` | Places the **account-owned Tripo3D GLBs** (677, via `loadGeneratedAssets`) deterministically by category onto POIs: monument→obelisk, building/civic→huts, nature/biome→trees, terrain→rocks, furniture/object/community/infra/household→plaza props, vehicle (cap 12), prop (cap 60), weapon (cap 6, armory ring). Skips missing categories → Kenney placeholders remain. Renders each via `NormalizedGlb`. | **Wired** |
| `Terrain.tsx` | Displaced `PlaneGeometry` from the backend heightmap (`elevationAt` bilinear). **Custom 4-way splat shader** (sand/grass/dirt/rock) injected into `MeshStandardMaterial` via `onBeforeCompile`; slope-aware. Disposes geometry+material on re-seed. Exports `elevationAt`. | **Wired** |
| `Water.tsx` | three.js examples `Water` reflector mesh (512² reflection target), local `waternormals.jpg`, sun-direction synced to diurnal cycle without rebuild. Disposes target on resize. | **Wired** |
| `Weather.tsx` | 1,200-point rain/snow particle fields (animated per-frame). `weatherFor(biome, tick)` picks rain/snow/clear when no backend override. | **Wired** |
| `MinionAvatar.tsx` | Per-minion skinned humanoid. Loads the guild's Kenney mini-character GLB, `SkeletonUtils.clone` per instance, guild-colour tint, action→animation-clip mapping (sit/walk/emote/etc.), indoor "ghosting", mood ring, selection label + thought bubble (`<Html>`), per-frame movement: navmesh A* (`findPath`) + collider push-out (`clampToFree`) + wander, OR direct WASD when `controlled`. Disposes material clones on unmount. | **Wired** |
| `Environment.tsx` (`WorldEnvironment`) | The Kenney/procedural base layer (renders **under** GeneratedWorld). `CentralTower` (stacked castle GLB segments + glowing torus/beam), `InstancedCity` (GPU-instanced buildings/trees/rocks), dirt `Road` ribbons, civic landmarks (14-entry `CIVIC_ROSTER` w/ labelled beacons + detailed skyscraper GLBs), fountains, lanterns. | **Wired** |
| `InstancedCity.tsx` | GPU-instanced low-poly city: building bodies + pitched roofs + tree foliage/trunks + rocks in ~6 draw calls (mobile-friendly). Zoned residential/commercial/skyscraper. Civic landmarks excluded (rendered as GLBs). | **Wired** |
| `Vehicles.tsx` | Up to 24 Kenney cars driving cosmetic circular loops on the road rings. Preloads `CARS`. | **Wired** |
| `CelestialBodies.tsx` | Emissive sun + moon discs (core+halo) following the diurnal arc, sun point-light. `fog={false}` so they survive the fog far-plane. | **Wired** |
| `Lights.tsx` | `diurnal(tick, size)` 80-tick day/dusk/night/dawn model (exported, reused by sun/moon/water). Three-point rig (warm key=sun w/ 4096² shadow map, cool fill, warm rim). | **Wired** |
| `GlbModel.tsx` | Generic non-skinned GLB loader; clones per instance, emissive-glow heuristic via name regex, HDRI envMap intensity. Used by Environment. | **Wired** |
| `NormalizedGlb.tsx` | Auto-normalises arbitrary-scale Tripo GLBs: bbox-measure → scale to `targetSize` → recenter+ground-snap. Shadow-LOD for small props. Used by GeneratedWorld. | **Wired** |
| `GuildAccessory.tsx` | Procedural floating prop above each avatar per guild (atom, gear, flask, lightning, etc.) — no per-guild GLB needed. | **Wired** |
| `CharacterController.tsx` | Third-person follow-cam + WASD forwarder (spherical orbit, Q/E yaw). **Defined but NOT imported anywhere** — WorldScene3D uses its inline `FollowRig`+`WasdInput` instead. | **DORMANT / orphaned** |
| `PixelStreamingViewer.tsx` | UE5 Pixel-Streaming iframe bridge. Loads the signalling-server frontend in an iframe, forwards `set_world` + keyboard via `postMessage`, shows connect/error states. Used by WorldDetail's `ue5` render tier. | **Wired** (client done; **GPU backend does not exist** — see §5) |
| `assets.ts` | Catalogue of CC0 Kenney/Polyhaven assets by symbolic name: per-guild character map, city/commercial/skyscraper/castle/road/car/nature/fence/hedge lists, lantern/fountain, `TEXTURE_SETS`, `HDRI_SKY`. | **Wired** |
| `generatedAssets.ts` | Loads `/models/scraped/assets_manifest.json`, keeps `tripo:*` `.glb` entries, `groupByCategory`. Drives GeneratedWorld. | **Wired** |
| `generated.ts` | Loads the OLDER `/models/generated/manifest.json` (TripoSR single mushroom). `loadGeneratedManifest()` — **defined but not imported** by the scene (superseded by `generatedAssets.ts`). | **DORMANT / orphaned** |
| `pois.ts` | Bridson Poisson-disk POI sampler (obelisk, huts ≤380, plazas, trees ≤520, rocks ≤220), `mulberry32` RNG, `destinationForAction` (action/guild→POI target). | **Wired** |
| `colliders.ts` | `clampToFree` AABB-circle push-out for avatar collision. | **Wired** |
| `navmesh.ts` | Coarse occupancy grid (12u cells) + A* + line-of-sight string-pulling, WeakMap-cached per collider set. `findPath`. | **Wired** |
| `usePbrTexture.ts` | Loads a Polyhaven diff/normal/rough triplet with tiling/sRGB. **Defined but not imported** (Terrain inlines its own loader). | **DORMANT / orphaned** |

### 1.6 The api / hooks / lib layer (`src/lib/`)

| File | Purpose | Status |
|---|---|---|
| `api.ts` | Typed REST client. `request<T>` attaches `Authorization: Bearer`. ~70 methods: auth, worlds (create/get/delete/map/advance/auto-advance), latest-actions/thoughts, minions (list/get/skills/memories/relationships/dna/soul/lineage/beliefs/models/appearance/brain/breed/fork/kill/chat), patents, inventions (charter/decide/reviews), safety, knowledge base, projects, world-systems (discoveries/culture/environment/climate/society/gaps/species/memes), physics laws, SSE `streamUrl`. | **Wired** |
| `hooks.ts` | `useWorldStream` — fetch-based SSE reader (so it can send the Bearer header, unlike native `EventSource`), parses `data:` frames, drops heartbeats, keeps last 100 events. | **Wired** |
| `config.ts` | `API_BASE_URL` (env `VITE_UNDERWORLD_API_URL` ‖ `localhost:8000`), `getApiKey` (URL `?api_key` → localStorage → env), `setApiKey`/`clearApiKey`. | **Wired** |
| `types.ts` | Full TS mirror of the backend Pydantic schemas (Guild, Mood, SwarmRole, ProjectStage, World, Minion, Invention, PeerReview, PopulationStats, Lineage, DnaInfo, SoulInfo, KB types, etc.). | **Wired** |
| `assetPreloader.ts` | Loader engine. `discoverAssets()` prefers `/models/generated/load_order.json` (staged) → falls back to scraped+generated manifests. `preloadAll()` fetches with concurrency 6, never hangs (failures count as done). `buildAssetList` pure/testable. **Critical list references `/models/Michelle.glb` + `/models/RobotExpressive.glb`** (present in `public/models/`). | **Wired** |
| `loaderMusic.ts` | Web-Audio synthesised ambient theme (pad chords + pentatonic melody + convolution reverb); prefers a real `/music/login.(ogg\|mp3)` if present. | **Wired** |
| `recordCanvas.ts` | `MediaRecorder` on `canvas.captureStream` → downloads `underworld_loader.(mp4\|webm)`. Drives GameLoader's RECORD button. | **Wired** |
| `lib/__tests__/assetPreloader.test.ts` | vitest: dedupe, manifest-flatten, never-hang-on-failure. | **Wired (test)** |
| `lib/api.test.ts` | vitest: bearer header, ApiError on non-2xx, JSON POST body. | **Wired (test)** |

---

## 2. The 3D asset pipeline & GLB inventory

### 2.1 On-disk assets — `underworld/web/public/models/`

**Total GLBs on disk: ~1,488.** Breakdown:

| Bucket | Path | Count | Notes |
|---|---|---|---|
| Kenney nature-kit | `kenney/nature-kit/` | 329 | trees, rocks, flowers, logs |
| Kenney fantasy-town | `kenney/fantasy-town/` | 167 | fences, hedges, lantern, fountain |
| Kenney castle-kit | `kenney/castle-kit/` | 76 | tower segments, gates, walls, flags |
| Kenney city-kit-roads | `kenney/city-kit-roads/` | 72 | road tiles |
| Kenney car-kit | `kenney/car-kit/` | 50 | drivable vehicles + debris |
| Kenney city-kit-commercial | `kenney/city-kit-commercial/` | 41 | shops, offices, skyscrapers |
| Kenney city-kit-suburban | `kenney/city-kit-suburban/` | 40 | houses A–P |
| Kenney blocky-characters | `kenney/blocky-characters/` | 18 | + `Textures/` a–r |
| Kenney mini-characters | `kenney/mini-characters/` | 12 | the per-guild humanoids actually used |
| **Tripo3D generated** | `generated/tripo/` | **677** | account-owned PBR GLBs (the real art layer) |
| Generated (legacy TripoSR) | `generated/low-poly-fantasy-mushroom.glb` | 1 | first-gen single asset |
| Top-level mixamo-style | `models/Michelle.glb, RobotExpressive.glb, Xbot.glb` | 3 | Michelle/RobotExpressive are in the **critical preload** list |
| Hero | `hero/underworld_hero.glb, underworld_logo.glb` | 2 | for the dormant 3D loader; `underworld_loadscreen.png` is the live key-art |

Also under `public/models/`: **Polyhaven** PBR texture sets (grass/dirt/rock/sand ×3 + `sky_puresky_1k.hdr` + `waternormals.jpg`), **kenney/*/Textures** colormaps, and **scraped/** (ambientCG `.bin` textures, polyhaven HDRIs + `.gltf` models). `scraped/.gitignore` ignores all binaries except `assets_manifest.json` — **the GLB binaries are reproduced by a scraper, only the manifest is the git record.**

### 2.2 Manifests

- `public/models/scraped/assets_manifest.json` — **692 keys, 677 `tripo:*`** entries. Each has `path`, `category`, `name`, `prompt`, `task_id`, signed `source_url` (Tripo CDN, expiring), `licence: account-owned`. Tripo categories (counts): terrain 87, instrument 79, prop 52, fx 52, nature 42, object 41, epoch 39, furniture 27, vehicle 32, weapon 25, building 24, culture 21, community 19, biome 19, civic 18, infra 15, medical 13, monument 11, household 20, interior 10, role 10, agri 10, family 7, safety 4. → consumed by `generatedAssets.ts` / GeneratedWorld.
- `public/models/generated/manifest.json` — legacy single TripoSR mushroom; loaded by the orphaned `generated.ts`.
- `public/models/generated/load_order.json` — **680 ordered assets, 7 staged packages**: (1) Core World & Biomes 242, (2) Home & Daily Life 64, (3) Guild Work & Roles 130, (4) Community & Economy 40, (5) Society Systems 42, (6) Epoch Ladder 39, (7) Movement & Polish 120, plus 3 `critical` (sky HDR + Michelle + RobotExpressive). This is the **preferred** preload order (`discoverAssets`).

### 2.3 Generation script

`underworld/scripts/generate_glb.py` — text-prompt→GLB using **only free public APIs**: pollinations.ai (text→image, no key) → TripoSR / InstantMesh / Hunyuan3D-2 HF Spaces (image→3D). Writes to `web/public/models/generated/` + appends to `manifest.json`. (The 677 Tripo assets themselves came from the paid Tripo3D account pipeline, not this free script.)

### 2.4 How the world renders the assets (layered)

1. **Terrain** displaced from backend heightmap, splat-textured (Polyhaven).
2. **`WorldEnvironment`** = Kenney/procedural base (instanced city, central tower, roads, civic GLBs, fountains, lanterns) — always visible so the world is never empty.
3. **`GeneratedWorld`** layers the 677 Tripo PBR GLBs on top of the POIs (normalised + category-placed). Missing categories simply leave the Kenney base showing.
4. **Avatars** = Kenney mini-characters (one per guild), animated.
5. **Vehicles / Weather / CelestialBodies / Water** dress the scene; post-FX stack finishes it.

---

## 3. CONFIG / INFRA

### 3.1 `underworld/web/` build config

- **`package.json`** scripts: `dev` (vite :5174), `build` (`tsc -b && vite build`), `preview`, `lint` (eslint --max-warnings 0), `test` / `test:watch` (vitest). Deps: `@react-three/fiber@8`, `@react-three/drei@9`, `@react-three/postprocessing@2`, `three@0.169`, `@tanstack/react-query@5`, `react-router-dom@6`, `lucide-react`. Dev: vite 6, vitest 2, tailwind 3.4, typescript 5.8, jsdom.
- **`vite.config.ts`** — react plugin, `@`→`./src`, port 5174 strict.
- **`vitest.config.ts`** — jsdom + globals.
- **`tsconfig.app.json`** — strict, ES2022, bundler resolution, `noUnusedLocals/Parameters`, excludes tests. (`*.tsbuildinfo` present = previously built.)
- **`tailwind.config.js`** — "liquid-glass" theme: `ink` 0–5, `glow` (iOS-accent palette), glass shadows, gradients, keyframes (fade-in, slide-in-right, pulse-glow, tick, shimmer).
- **`postcss.config.js`** — tailwind + autoprefixer.
- **`.env.example`** — `VITE_UNDERWORLD_API_URL`, `VITE_UNDERWORLD_API_KEY`, `VITE_UNDERWORLD_PIXELSTREAM_URL` (default `https://projectsolar.cloud/pixelstream/`).
- **`dist/`** — a **pre-built bundle is committed/present** (assets/ index.html models/).

### 3.2 Backend deploy (single-image: backend serves web/dist)

- **`underworld/Dockerfile`** — 2-stage: node:20 builds `web/` → python:3.11 runs `uvicorn server.main:app`, copies `web/dist` to `/app/web/dist`, `/data` volume for SQLite, honours `$PORT`.
- **`underworld/render.yaml`** — one-click Render blueprint (docker, 1GB disk at `/data`, auto-generates `UNDERWORLD_API_KEY`, optional Kimi/Moonshot env, scheduler on).
- **`underworld/fly.toml`** — Fly.io (region `syd`, `/data` mount, health `/healthz`, suspend-when-idle but `min_machines_running=1` so the world keeps ticking, Kimi env).
- **`underworld/DEPLOY.md`** — Render / Fly / any-Docker-host instructions.
- **`underworld/requirements.txt`**, `pyproject.toml`, `.dockerignore`.
- **`underworld/observe_minds.py`, `prove_llm.py`, `prove_underworld.py`** — CLI prove/observe scripts (backend, not web).

### 3.3 Pixel-Streaming GPU stack — `underworld/deploy/`

- **`deploy/pixelstream/docker-compose.yml`** — 3 services on host networking: `ue5` (packaged UE5 game, headless `-RenderOffscreen`, NVENC, `runtime: nvidia`), `signalling` (Epic Pixel-Streaming-Infrastructure SignallingWebServer, serves the frontend the React iframe loads), `turn` (coturn STUN/TURN for NAT). Needs NVIDIA Container Toolkit.
- **`deploy/pixelstream/Dockerfile.ue5`** — wraps a user-supplied packaged Linux UE5 build on Epic's `runtime-pixel-streaming` base.
- **`deploy/pixelstream/run-ue5.sh`** (launch wrapper), **`vast-deploy.sh`** (rent+bootstrap a vast.ai GPU node), **`onstart.sh`** (host Docker+NVIDIA bootstrap), **`capture_stream.py`** (screenshot the live stream from any box), **`.env.example`**, **`README.md`** (3-command deploy).
- **`deploy/ue5-project/`** — UE5 project scaffold ONLY: `Underworld.uproject` (UE5.5, PixelStreaming/MetaHuman/Water plugins, driven by `/worlds/{id}/scene-state`), `Config/DefaultEngine.ini`, `README.md`. **No actual UE5 source/content** — the game must be built.

### 3.4 CI agent — `forge/`

**APEX Forge** — autonomous app-evolution agent (Python). Scans the codebase, researches via free APIs (DuckDuckGo/arXiv/GitHub trending), asks a **local Ollama** model (`deepseek-coder:6.7b`) to improve files, lands changes through a **test-gated, branch-only, never-touch-main** pipeline. Files:
- `forge/forge_agent.py` — the engine (dry-run default; `FORGE_APPLY/PUSH/OPEN_PR` opt-in; output validation; backups to `.forge/backups/`; file-lock + shard for parallel replicas; exits at `FORGE_MAX_RUNTIME_S` for K8s restart).
- `forge/webhook.py` — FastAPI WhatsApp approval webhook: `APPROVE <id>` merges the `forge/*` branch into main + pushes.
- `forge/approvals.py` (SQLite queue), `forge/notify.py` (Twilio/Meta/console), `forge/Dockerfile`, `forge/requirements.txt`, `forge/deploy/forge-k3s.yaml` (StatefulSet), `forge/tests/` (test_forge, test_whatsapp), `forge/README.md`.
- `.forge/` (repo root) — runtime state: `approvals.db` (12KB), `forge.lock`.

### 3.5 Repo-root config (the Jarvis app, not Underworld)

> The repo root is a **separate Vite app (the "Jarvis" frontend)** — `src/`, `server/`, its own `package.json`/`vite.config.js`. Underworld is a sub-app under `underworld/`.

- `vite.config.js` (root) — node-env vitest scoped to root `./src`, **explicitly does NOT glob into `underworld/web`** (which has its own jsdom config).
- `package.json`, `tailwind.config.js`, `eslint.config.js`, `jsconfig.json`, `postcss.config.js`, `index.html`, `components.json` (shadcn/ui, new-york style, lucide).
- **Deploy:** `netlify.toml` (SPA build → `dist`, `/* → /index.html`), `vercel.json` (same rewrite). These deploy the **root Jarvis SPA**, not Underworld.
- `.env.example` (root) — Jarvis backend `VITE_API_BASE_URL` / `VITE_API_KEY` / tactical stream URLs.
- `dist/` (root) — pre-built Jarvis bundle.

---

## 4. DOCS inventory

### 4.1 `underworld/docs/`
- `Sentient_Patent_Minion_World_Spec.txt` (2,710 lines) — the master design corpus.
- `CUTTING-EDGE-MASTER-SPEC.md` — 8 master systems + staged build order (keystones #3 Knowledge Graph, #6 Reality Validation DONE).
- `FRONTIER-SPEC-2026.md` — 18 engines → honest code-status table (`WorldTruth ≠ MinionBelief`).
- `Underworld-spec-progress.md` (137) — progress tracker.
- `Autopilot-and-free-LLM.md` (52) — free-LLM / autopilot config.
- `GPU-pixel-streaming.md` (52) — **the honest GPU-path status** (see §5).
- `Physics_Laws_Equations_Master_Compendium_V4.pdf` (215KB) — the V4 physics source feeding KnowledgeLibrary.

### 4.2 `docs/` (repo root)
- **`docs/PATTERN_ORACLE/`** — a 15-file, ~19,200-line **master engineering spec** for "Pattern Oracle" (a world-scale self-improving prediction engine inside APEX/KGIK). `00_MASTER_INDEX.md` is the spine; sections 01–14 (mission, current-state audit, evidence base, architecture, data model, algorithms, API contracts, MLOps/self-improvement, NL-orchestration, compute/GPU, validation, security/legal, phased build, risks) + `VERSION_LOG.md`. **This is a prediction-engine spec, largely orthogonal to the Underworld web frontend** (it references `underworld/server/services/*` only as existing-code grounding).
- `docs/Underworld-design.txt` (5,893) — the canonical "800+ features" design (Stone-Age → transcendence).
- `docs/AI_Swarms_Master_Reference.docx` (94KB) — the V2 swarm-roles/guardrails source (KB "V2 Master Ref").
- `docs/Physics_Laws_Equations_Master_Compendium_V4.pdf` (dup of underworld copy).
- `docs/DEPLOY.md` (78), `docs/PAGE-BUILD-SPEC.md` (40).
- `docs/REASSESSMENT/` — this document's home (was empty).

---

## 5. WIRED vs DORMANT — Underworld-web feature matrix

**Fully wired & functional** (renders + talks to backend):
- Entire WebGL renderer (`WorldScene3D` + all scene children), all 10 pages, MinionDrawer (incl. in-character chat), WorldSystems, live SSE, asset preloader/loader, music/record, breed/fork/prune/charter/decide/safety mutations, the 677-Tripo GeneratedWorld layer.

**Dormant / placeholder (code present, not rendered/wired):**
- `HeroAssembleLoader` — fully implemented 3D assembling-logo loader but **hard-disabled** in GameLoader (`{false && …}`); the static `underworld_loadscreen.png` is the live hero.
- `CharacterController.tsx` — complete 3rd-person controller, **never imported** (WorldScene3D uses its own inline FollowRig/WasdInput).
- `scene/generated.ts` (`loadGeneratedManifest`) — superseded by `generatedAssets.ts`, **not imported**.
- `scene/usePbrTexture.ts` — **not imported** (Terrain inlines its loader).

**Pixel-streaming / GPU path (the `ue5` render tier):**
- The **client** (`PixelStreamingViewer.tsx`) is complete and pre-wired to `https://projectsolar.cloud/pixelstream/` (override `VITE_UNDERWORLD_PIXELSTREAM_URL`). The WorldDetail `webgl`/`ue5` toggle works.
- The **server side does NOT exist**: per `docs/GPU-pixel-streaming.md`, *"The UE5 Underworld app does not exist yet"* — there is only the `deploy/ue5-project/` scaffold (`.uproject` + config, no engine source/content) and the vast.ai deploy stack. So clicking **"Stream UE5"** today shows the "GPU host up?" error unless a streamer is independently built and run. **The functional renderer is the in-browser WebGL/Three.js scene.**

---

## 6. GAPS / half-built / referenced-but-missing / risks

1. **UE5 Pixel-Streaming backend is unbuilt** — biggest gap. Client done; the actual Unreal game + GPU streamer is "weeks of work, not in this repo" (`GPU-pixel-streaming.md`). The default endpoint `projectsolar.cloud/pixelstream/` is aspirational.
2. **3 orphaned scene modules** — `CharacterController.tsx`, `generated.ts`, `usePbrTexture.ts` are dead imports (the inline equivalents won). Candidates for deletion.
3. **Dormant 3D hero loader** — `HeroAssembleLoader` is gated off behind `&& false`; the HEAD-probe + RECORD button reference `underworld_logo.glb`/`underworld_hero.glb` that exist but are unused while the static PNG is the hero.
4. **`loaderMusic` real-track path** probes `/music/login.(ogg|mp3)` — **no `public/music/` dir exists**, so it always falls back to synthesis (intended fallback, but the real-track path is referenced-but-missing).
5. **Tripo `source_url`s in `assets_manifest.json` are signed/expiring CDN links** (`DateLessThan` policy ~epoch 1780531200). The local `generated/tripo/*.glb` binaries are what's served; the manifest URLs would 403 after expiry. Re-fetch depends on the (gitignored) scraper.
6. **`scraped/` binaries are gitignored** (`*` except manifest) — a fresh clone has the manifest but must re-run the scraper / rely on the committed `generated/tripo/` GLBs to actually render the paid layer. (The 677 `generated/tripo/*.glb` ARE on disk here, so it renders locally.)
7. **Backend coupling**: every page assumes the FastAPI backend (`/worlds`, `/minions`, `/knowledge`, `/projects`, `/safety`, `/auth/me`, SSE) is live at `VITE_UNDERWORLD_API_URL`. The web app is non-functional standalone (login + all data require it).
8. **SECURITY — committed live secret**: `underworld/.env` contains a **real Moonshot/Kimi API key** in plaintext (`UNDERWORLD_KIMI_API_KEY=sk-1Dz…`). The file header says "gitignored, never committed" and `underworld/.gitignore` should cover it, but the key is present on disk — it should be rotated and confirmed out of git history.
9. **`scene/generated.ts` vs `generatedAssets.ts`** dual-manifest design is confusing leftover; only the latter feeds the world.
10. **`PixelStreamingViewer` references a backend `WorldClient` / `OnInputEvent` / `/worlds/{id}/scene-state` contract** that has no implementation in this repo (the UE5 side that would consume it doesn't exist).

---

*End of inventory.*
