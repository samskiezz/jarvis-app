# 03 — APEX Frontend Inventory (Jarvis Palantir / APEX / KGIK)

Exhaustive scan of every file under `/home/user/jarvis-app/src/`. Goal: state precisely
which UI surfaces are **FULLY WIRED** (live backend data + working actions) vs **UI SHELL**
(renders but mock/in-code data and/or dead-ish buttons), catalogue the data + design layers,
and list backend capabilities that have **no UI** (especially the underworld science methods).

Scope note: this document covers `src/` only. The Python backends live in
`/home/user/jarvis-app/server/` (the APEX backend) and `/home/user/jarvis-app/underworld/server/`
(the separate Underworld sim/science backend). They are referenced where the frontend
calls them or fails to surface them.

---

## 0. TL;DR for the "features aren't enabled" complaint

The app is **architecturally wired but data-starved and partly cosmetic**:

- **Real backend calls exist and work** for: `getLiveIntel`, `analystChat` (SSE), `predict`,
  the generic entity CRUD proxy (`/entities/{name}`), and the SSE game streams
  (`/streams/panopticon`, `/streams/counterstrike`).
- **BUT the entity store is an ephemeral in-memory dict** (`server/routes/entities.py`) that
  starts **empty** and is wiped on restart. So every page that lists `SwarmJob`, `Patent`,
  `Investment`, `RiskSignal`, `Contact`, `WorkflowMapping`, `IntelProfile`,
  `OmegaScanProgress` renders an **empty state until you click a SEED / + button**. The user's
  "nothing is enabled" perception largely comes from empty lists with no seeded data.
- **The legacy PSG/Gmail backend functions are stubs** that return
  `{"status":"not_implemented"}` (`server/routes/functions.py` `_STUB_FUNCTIONS`). They are
  exported in `src/api/backendFunctions.js` but **no page actually calls them** — dead exports.
- **Several "control" pages are pure local-state theater**: `ApexCore`, `PluginControlPlane`,
  `PluginIntegrationProof`, `TechTree` — their toggles/tests mutate React state only, never
  touch a backend. The plugin lists are hard-coded constants.
- **The entire underworld science layer (~489 method functions / the "464 science methods":
  submarine/sonar, meteor, ppm, buoys, flight, frequency, neurons, etc.) has ZERO frontend
  surface in `src/`.** Those endpoints live on the Underworld server under `/science/*` and a
  keyword field-router and are not even mounted by the APEX `server/main.py`.

---

## 1. App shell, routing, and the page registry

| File | Role | Wired? |
|---|---|---|
| `src/main.jsx` | React entry; mounts `<App/>` | n/a |
| `src/App.jsx` | Router. `/` → `Launcher`; `/apex/*` → `AppLayout` + every registry page. Lazy-loads pages. | WIRED (routing real) |
| `src/Layout.jsx` | `AppLayout`: DomainRail + sticky breadcrumb strip + `CommandPalette` + omnipresent `JarvisAssistant`. Passes all pages/entities/risks into JARVIS. | WIRED |
| `src/pages.config.js` | Legacy Base44 auto-gen stub (`Pages: {}`). **Unused** — real registry is `pageRegistry.js`. | DEAD (vestigial) |
| `src/lib/pageRegistry.js` | Single source of truth: `GROUPS` (7 nav groups) + `PAGES` (24 entries). Drives router, rail, palette, JARVIS nav. | WIRED |
| `src/utils/index.ts` | `createPageUrl(name)` → `/Name-With-Dashes`. | WIRED |
| `src/lib/PageNotFound.jsx` | 404 fallback. | WIRED |
| `src/lib/query-client.js` | TanStack QueryClient instance (provider mounted in App, but **no page actually uses react-query** — all pages use raw `fetch`/entity proxy + `useState`). | MOSTLY UNUSED |

### Auth
| File | Role | Wired? |
|---|---|---|
| `src/lib/app-params.js` | Resolves `apiBaseUrl` (`VITE_API_BASE_URL` → legacy → `http://localhost:8000`) + `apiKey` from URL/localStorage/env. | WIRED |
| `src/lib/AuthContext.jsx` | Calls `kimiClient.auth.me()` → `/auth/me` when an API key exists. | WIRED |
| `src/lib/AuthGate.jsx` | Gates the app **only when `VITE_REQUIRE_AUTH=true`**. Default = bypassed (`return children`), so local/dev is unauthenticated. API-key entry form posts to `/auth/me`. | WIRED (gate off by default) |
| `src/components/UserNotRegisteredError.jsx` | Light-theme "Access Restricted" card. **Not imported anywhere** — orphan, and stylistically off-brand (white gradient, not cyberpunk). | DEAD / orphan |

---

## 2. PAGES — full inventory (`src/pages/`, from `pageRegistry.js`)

Legend: **WIRED** = real backend data + working actions · **PARTIAL** = real backend but
empty-until-seeded or some local-only actions · **SHELL** = renders from in-code constants /
local state only, no backend.

### INTEL group

#### `JarvisTerminal.jsx` (1352 lines) — home page · route `/apex/JarvisTerminal`
The flagship Palantir-style draggable-window terminal. 11 panels via `src/panels/registry.js`
(`buildDefaultPanelState`) and `DraggablePanel`: MAP (Globe3D), VERTEX (force graph over
ontology), RISK, OBJECT EXPLORER, TIMELINE, MARKETS, EMAILS, WATCHLIST, ANALYST,
PANOPTICON, CS3D.
- Backend: `POST /functions/getLiveIntel {type:"all"}` (2-min poll, line 14/1126) feeds MAP
  earthquakes, MARKETS, TIMELINE (`corpus.timeline`), EMAILS (`corpus.*_emails`), status bar
  totals. ANALYST panel streams `POST /functions/analystChat` SSE. PANOPTICON/CS3D panels
  open SSE `${apiBaseUrl}/streams/{panopticon|counterstrike}` via `LiveGameRenderPanel`.
- **Status: WIRED for live intel + analyst + streams.** BUT VERTEX/EXPLORER/RISK/WATCHLIST
  render from **in-code domain data** (`ontology.js`, `risk.js`, `watchlist.js`), and MARKETS
  falls back to `markets.js` `MARKETS_FALLBACK` when the feed is empty. Watchlist toggle is
  local-only. So: live world feeds = real; the "intel graph" = static seed data about Sam/PSG.

#### `GlobalIntel.jsx` (120) — route `/apex/GlobalIntel`
Live world signals: earthquakes table + markets tiles + corpus stat tiles.
- Backend: `getLiveIntel({type:"all"})`. **WIRED.** Pure live data, no mock fallback.

#### `SystemIntel.jsx` (108) — route `/apex/SystemIntel`
Feed-health board (earthquakes/markets/corpus/panopticon/counterstrike signal counts), 30s poll.
- Backend: `getLiveIntel`. **WIRED.** Derives ONLINE/IDLE from live snapshot.

#### `AlertsNotificationCenter.jsx` (158) — route `/apex/AlertsNotificationCenter`
Risk-signal triage, severity-sorted, filter + local ACK.
- Backend: `RiskSignal.list()` (entity proxy). **PARTIAL** — entity store starts empty, so the
  queue is empty until RiskSignal records exist; ACK is local-only state (`acked`).

### COMMAND group

#### `CommandCenter.jsx` (171) — route `/apex/CommandCenter`
Ops hub: stat tiles (markets/quakes/profiles/risks/tasks) + quick-launch buttons +
inline analyst console (SSE).
- Backend: `getLiveIntel` + `IntelProfile.list()` + `RiskSignal.list()` + `Task.list()` +
  `analystChat` SSE. **WIRED** (markets/quakes always live; profiles/risks/tasks are 0 until
  entities seeded — `.catch(()=>[])` keeps it graceful). Quick-launch nav works.

#### `PipelineMonitor.jsx` (191) — route `/apex/PipelineMonitor`
Unifies `SwarmJob` + `OmegaScanProgress` into pipeline stages + `WorkflowMapping` list.
- Backend: those three entity lists. **PARTIAL** — real proxy calls, but empty until seeded
  (no seed button here — depends on MLHub launching jobs). Read-only.

### COGNITION group

#### `MLHub.jsx` (191) — route `/apex/MLHub`
Swarm job orchestration with **full CRUD**: launch form `SwarmJob.create`, `cancel`
(`update status:cancelled`), `delete` (`remove`).
- Backend: `SwarmJob` entity CRUD. **WIRED** (fully functional CRUD; list empty until you
  launch a job, but launch genuinely persists to the in-memory store).

#### `MLDashboard.jsx` (157) — route `/apex/MLDashboard`
Derived charts (status dist, jobs-over-time, omega gauges) from `SwarmJob`+`OmegaScanProgress`.
- Backend: those entities. **PARTIAL** — real data, empty until MLHub seeds jobs. Read-only.

#### `TechTree.jsx` (183) — route `/apex/TechTree`
SVG capability dependency graph (LLM/GPU/RAG/Vision/Graph/Opt/Quantum/Agent) with
locked/unlocked gating.
- Backend: **NONE.** `NODES` is a hard-coded constant; unlock/lock is local `useState` cascade.
- **Status: SHELL** (cosmetic, no persistence, no backend). Interactive but meaningless to data.

#### `PredictionOracle.jsx` (467) — route `/apex/PredictionOracle`
Natural-language forecast box → `POST /functions/predict`; renders point estimate, CI,
probability, recharts history→forecast chart with uncertainty band, method/math, drivers,
assumptions, caveats. Auto-runs on `?q=` (from command palette).
- Backend: `kimiClient.functions.predict`. **WIRED** — the most genuinely "complete" feature
  page; real backend prediction engine (`server/services/prediction.py`).

### APEX CORE group

#### `ApexCore.jsx` (128) — route `/apex/ApexCore`
11 Apex plugins as cards with health dots + enable/disable toggles + ENABLE/DISABLE ALL.
- Backend: **NONE.** `PLUGINS` hard-coded; `enabled` is local state; `health` is a literal string.
- **Status: SHELL.** Toggles do nothing beyond local UI. This is exactly the "looks enabled but isn't" surface.

#### `PluginControlPlane.jsx` (139) — route `/apex/PluginControlPlane`
Same 11 plugins in a filterable/sortable table with version + per-row enable/disable.
- Backend: **NONE.** Hard-coded `PLUGINS`, local toggle/filter only.
- **Status: SHELL.**

#### `PluginIntegrationProof.jsx` (136) — route `/apex/PluginIntegrationProof`
"Wiring test" runner: per-plugin TEST + RUN ALL → fake running→pass/fail via `setTimeout`.
`FAILING = {quantum, eval}` is predetermined.
- Backend: **NONE.** Simulated test results only.
- **Status: SHELL** (ironically named "Integration Proof" while proving nothing real).

### KNOWLEDGE group

#### `PatentsSearch.jsx` (193) — route `/apex/PatentsSearch`
Full-text patent search over `Patent` entity + detail panel + **SEED SAMPLES** button.
- Backend: `kimiClient.entities.Patent` (`.list`, `.create`). **PARTIAL/WIRED** — real CRUD,
  but corpus empty until SEED SAMPLES creates the 6 hard-coded sample patents.

#### `PatentRegistry.jsx` (221) — route `/apex/PatentRegistry`
Master register, sortable columns, ADD form, SEED, per-row DELETE (full CRUD).
- Backend: `Patent` entity CRUD. **WIRED** (create/list/remove all work; empty until seeded/added).

#### `PatentIngest.jsx` (194) — route `/apex/PatentIngest`
Ingestion console: single-record form + INGEST SAMPLE BATCH + session ingest log + recent corpus.
- Backend: `Patent.create` / `Patent.list`. **WIRED** (real creates; session log is local).

#### `KGIKBrain.jsx` (177) — route `/apex/KGIKBrain`
Knowledge-graph explorer over the ontology: nodes-by-type, searchable entity index, entity
detail with properties + relations.
- Backend: **NONE.** Reads `OBJECTS`/`LINKS` from `src/domain/ontology.js` (in-code).
- **Status: SHELL** (functional UI, but the "knowledge graph" is the static Sam/PSG ontology
  constant, not a live KG).

#### `KGIKLedger.jsx` (169) — route `/apex/KGIKLedger`
Hash-chained append-only ledger; genesis → `WorkflowMapping` entries → local appends; APPEND form.
- Backend: `WorkflowMapping.list()` seeds the chain. **PARTIAL** — real entity read (empty
  until WorkflowMapping exists); appends are local session-only (not persisted to backend).

#### `TCIS.jsx` (215) — route `/apex/TCIS`
Temporal Causal Intelligence: merges live `earthquakes`/`markets` + `RiskSignal` onto one
timeline; causal hypotheses derived from ontology `LINKS`.
- Backend: `getLiveIntel` + `RiskSignal.list()`. **PARTIAL** — timeline live for seismic/market;
  hypotheses are derived from in-code `LINKS` (static).

### WEALTH & SYSTEM group

#### `InvestmentTracker.jsx` (308) — route `/apex/InvestmentTracker`
Portfolio CRUD (`Investment`), live market tiles, $100M target progress, net-worth trend from
`WealthSnapshot`, weighted 24h change from live tickers. SEED SAMPLES + add/edit/delete.
- Backend: `Investment` CRUD + `WealthSnapshot.list()` + `getLiveIntel` markets. **WIRED**
  (full CRUD; markets live; holdings/snapshots empty until seeded).

#### `SystemHealth.jsx` (174) — route `/apex/SystemHealth`
Active backend probe: times `getLiveIntel`, checks feeds, probes `IntelProfile.list()`,
15s poll, derives service health rows + latency.
- Backend: `getLiveIntel` (raw fetch + timing) + `IntelProfile` entity. **WIRED** — genuinely
  reflects live backend reachability.

### WAR group

#### `War.jsx` (585) — route `/apex/War`
Unified battle theater, PANOPTICON ⇄ COUNTERSTRIKE toggle. Shared `useTacticalStream` hook →
SSE `${apiBaseUrl}/streams/{mode}` driving `LiveTactical3D`. Live scoreboard/event-feed/bomb/
alert overlays from the frame. Side panel: MATCH BOARD (from `SwarmJob`, falls back to
`SAMPLE_MATCHES`) or THREAT BOARD (from `RiskSignal`, falls back to `SAMPLE_SIGNALS`).
- Backend: `/streams/*` SSE (real) + `SwarmJob`/`RiskSignal` entities. **WIRED for the stream**;
  side boards seed sample data when entities empty. When stream offline it renders seeded
  CT/T units (so the 3D is never blank).

#### `GameLeaderboard.jsx` (199) — route `/apex/GameLeaderboard`
Ranked players from `Contact` (synthesized stats) else **SEED SAMPLE** demo board; sortable.
- Backend: `Contact.list()`. **PARTIAL** — real entity read but no Contacts exist → SEED SAMPLE
  shows the in-code `SAMPLE` array. Sorting works.

### SIM destination (not in APEX dock)

#### `Underworld.jsx` (226) — route `/apex/Underworld` (`dest:"underworld"`)
Monitor/control surface for the standalone 3D city sim. Map selector from
`getLiveIntel().panopticon/counterstrike.maps` (else `FALLBACK_MAPS`), live tiles, EventSource
panel on `${apiBaseUrl}/streams/panopticon` with reconnect/stale, synthetic canvas city-grid
placeholder.
- Backend: `getLiveIntel` + `/streams/panopticon` SSE. **PARTIAL/WIRED** — real stream monitor,
  but explicitly a monitor: the actual UE5/3D renderer is the separate `underworld/web` app, not
  embedded. Canvas is a placeholder, not the real sim view.

#### `Launcher.jsx` (126) — route `/`
Two-tile destination picker (APEX vs UNDERWORLD). Glass tiles with hover glow.
- Backend: none needed. **WIRED** (navigation works). Uses `SHELL` glass tokens — cyberpunk-correct.

---

## 3. COMPONENTS (`src/components/`)

| File | Purpose | Wired? |
|---|---|---|
| `Jarvis/JarvisAssistant.jsx` (323) | Omnipresent arc-reactor orb + chat. Voice (Web Speech), intent routing (`jarvisAgent`), SSE `analystChat`, self-pulls `getLiveIntel` for briefings, listens for `jarvis:ask`/`jarvis:open-palette` window events. | **WIRED** — real SSE + voice + nav actions. Most complete component. |
| `CommandPalette.jsx` (254) | ⌘K palette (cmdk). Pages + global actions + "Predict:" + "Ask Jarvis:" rows. Runs `jarvisAgent.interpret` per keystroke to float nav hits. | **WIRED** — nav real; Predict routes to Oracle with `?q=`; Ask dispatches to JARVIS. |
| `DomainRail.jsx` (185) | Collapsible icon nav rail, ⌘1..6 jumps, ⌘\ toggle, flyout per group. | **WIRED**. |
| `DraggablePanel.jsx` (160) | Generic drag/resize/min/close window chrome (used by JarvisTerminal). | **WIRED** (presentational). |
| `Globe3D.jsx` (215) | three.js globe, country spikes from `COUNTRIES`, earthquake markers from props, drag-rotate. | **WIRED** — earthquakes are live (passed from JarvisTerminal); countries are in-code. |
| `LiveTactical3D.jsx` (489) | three.js tactical renderer: lerped units, HP bars, tracers, bombsites/bomb (CS), objectives/alert tint (panopticon). Optional GLTF map + HDRI/textures via `VITE_RENDER_*`. | **WIRED** (presentational; driven by War/JarvisTerminal stream frames). |
| `PageKit.jsx` (77) | Shared design primitives: `PageShell`, `PanelCard`, `StatTile`, `Grid`, `Badge`, `DataState`. Every rebuilt page composes these. | **WIRED** (design system core). |
| `UserNotRegisteredError.jsx` (31) | Orphan light-theme error card. | **DEAD** (not imported; off-brand). |
| `components/ui/*` (≈55 files) | shadcn/ui primitives (accordion…tooltip). Standard Radix wrappers. **Almost none are used by the feature pages** (pages use inline-styled PageKit instead). `sonner`/`toaster` wired via App; `chart.jsx` (recharts wrapper) not used (Oracle imports recharts directly). | Mostly **UNUSED** scaffolding. |
| `hooks/use-mobile.jsx` | viewport hook (shadcn sidebar). | Unused by features. |

**KGIK graph viz note:** there is no dedicated KGIK graph component — graph rendering is the
canvas `VertexGraph` *inside* JarvisTerminal.jsx (lines 39–240) and the SVG/list views in
`KGIKBrain.jsx`/`TechTree.jsx`. All three draw from in-code `ontology.js`, not a live KG service.

---

## 4. DATA LAYER

### API clients (`src/api/`)
| File | What | Real vs static |
|---|---|---|
| `kimiClient.js` | Generic client: `request()`, `functions` Proxy (`POST /functions/{name}`), `entities` Proxy (`/entities/{name}` CRUD: POST=list, GET=get, PUT=create, PATCH=update, DELETE=remove), `auth` (`/auth/me`, logout). | **REAL transport.** Every function/entity name resolves to a live HTTP call. |
| `entities.js` | Named exports: `SolarProduct, ProductRecall, Investment, WealthSnapshot, Task, Contact, OmegaScanProgress, SwarmJob, IntelProfile, RiskSignal, GmailSyncState, WorkflowMapping`, `User=auth`. Plus pages reference `Patent` directly via `kimiClient.entities.Patent`. | **Backed by the generic in-memory dict store** (`server/routes/entities.py`) — real CRUD but **ephemeral, starts empty, lost on restart, no schema/validation.** |
| `backendFunctions.js` | Named exports: `checkUrgentEmail, runOmegaScanBatch, psgJobPipeline, gmailJobWatcher, psgEmailToOpenSolarToSM8, psgEmailToOpenSolarToServiceM8, gmailJobWatcherV2, addJobComponents, psgPipelineHandler, loadOmegaContext, getJarvisIntel, getLiveIntel, getLiveIntel`. | `getLiveIntel` = **REAL**. **All the PSG/Gmail/Omega functions are backend STUBS** (`server/routes/functions.py` returns `{"status":"not_implemented"}`) AND **no page imports them** — pure dead exports. `analystChat`/`predict` are called directly via the proxy, not from this file. |

### Lib (`src/lib/`)
| File | What | Real vs static |
|---|---|---|
| `pageRegistry.js` | 24 pages, 7 groups. | in-code config (canonical). |
| `app-params.js` | API base/key resolution. | env/runtime. |
| `jarvisAgent.js` (184) | Deterministic intent router (`interpret`) + spoken `LINES`. Unit-tested (`jarvisAgent.test.js`). | in-code logic; no backend. |
| `jarvisVoice.js` (166) | Web Speech TTS/STT wrapper, feature-detected no-op fallback. | browser API. |
| `assetCatalog.js` | Resolves unit/map/vfx assets from a manifest + `VITE_ASSET_SOURCE_*`. | env-driven; used by LiveTactical3D/War. |
| `AuthContext/AuthGate/PageNotFound` | see §1. | — |
| `query-client.js` | QueryClient (provider mounted, **unused by pages**). | scaffolding. |

### Domain (`src/domain/`) — **all static in-code data**
| File | Content |
|---|---|
| `ontology.js` | 14 `OBJECTS` (Sam, Harrison, Nisha, PSG, Hilts, IFZA, Pangani, Zanzibar, Dubai, crypto, etc.) + 21 typed `LINKS`. **This is the "KGIK"/graph data.** Hard-coded, real personal facts. |
| `colors.js` | `COLORS`, `SHELL` design tokens, `DOMAIN_ACCENTS`, `glow()`, `riskColor`, `earthquakeColor`. |
| `countries.js` | 6 countries with positions/risk for the globe. |
| `risk.js` | 8 `RISK_SIGNALS` (Defended freight, Congo spillover, etc.). |
| `markets.js` | `MARKETS_FALLBACK` (8 tickers) — used when live markets empty. |
| `watchlist.js` | 5 `WATCHLIST_INIT` items. |
| `ontology.test.js` | tests. |

`src/panels/registry.js` — 11-panel layout registry for JarvisTerminal (in-code config) + tests.

**Bottom line on data:** Live from backend = earthquakes, markets (CoinGecko+FX), corpus
(emails/timeline/facts), analyst chat, predictions, game streams. Static/in-code = the entire
"intelligence graph" (ontology, risks, countries, watchlist, plugin lists, tech tree). Entity
store = real CRUD but ephemeral + empty by default.

---

## 5. STYLING / UX — design system

**Verdict: it IS a cyberpunk dark theme, but glassmorphism is INCONSISTENT.** There are two
parallel design systems, and only the newer one is truly "glass":

1. **`SHELL` tokens (cyberpunk glassmorphic) — `domain/colors.js`:**
   `glass: rgba(4,10,18,0.82)`, `glassRail: rgba(2,6,10,0.86)`, `blur: blur(12px)`, hairline
   borders, `glow()` recipe (only on focus/active). Used by the **chrome**: `Launcher`,
   `DomainRail`, `CommandPalette`, and the `AppLayout` top strip. These use real
   `backdropFilter: blur(12px)` glass. ✅ cyberpunk-glassmorphic.

2. **`COLORS`/`PageKit` (flat dark, NOT glass) — `components/PageKit.jsx`:**
   `PanelCard`/`PageShell` use **opaque** `C.panel = rgba(4,10,16,0.95)` with a box-shadow and
   `1px` border — **no backdrop-blur**. **Every feature page** (GlobalIntel, MLHub, Patents,
   War side panels, etc.) is built on PageKit → so the bulk of the app is **flat translucent-dark,
   not glassmorphic.** Glass blur appears only in scattered overlays (War scoreboard/event-feed
   use `backdropFilter: blur(6px)`; CommandPalette backdrop `blur(2px)`).

3. **JarvisTerminal** uses its own near-opaque `Glass` helper (`rgba(4,10,16,0.98)`, **no blur**)
   and a `Courier New` "Gotham/Gridline" aesthetic — visually a third sub-style.

**Tailwind/CSS:** `tailwind.config.js` + `src/index.css` define a full HSL dark token set
(`--primary: 157 100% 39%` neon green, charts, sidebar) and JetBrains Mono as the body font.
But **feature pages barely use Tailwind classes** — they're inline-styled from `COLORS`. So the
Tailwind theme mostly powers the unused shadcn `ui/*` primitives.

**To deliver "cyberpunk glassmorphic throughout" the user wants:** the fix is concentrated —
add `backdropFilter: SHELL.blur` + translucent `SHELL.glass` to `PageKit.PanelCard`/`PageShell`
(and the JarvisTerminal `Glass` helper). That single change would propagate glass to ~all pages
since they all compose PageKit.

Fonts: Inter (UI labels) + JetBrains Mono (machine voice / IDs), loaded via Google Fonts in
`index.css`. Accent palette: green `#00c878` (intel), blue `#0096d4` (command), purple `#a855f7`
(cognition), orange `#f07820` (apex), gold `#e8a800` (knowledge), slate `#566878` (wealth),
red `#e8203c` (war).

---

## 6. WIRED-vs-SHELL MATRIX

| Page | Route | Functional? | Backend it uses / needs |
|---|---|---|---|
| JarvisTerminal | `/apex/JarvisTerminal` | **WIRED** (feeds) / static graph | `getLiveIntel`, `analystChat` SSE, `/streams/*`; VERTEX/RISK/WATCHLIST = in-code |
| GlobalIntel | `/apex/GlobalIntel` | **WIRED** | `getLiveIntel` |
| SystemIntel | `/apex/SystemIntel` | **WIRED** | `getLiveIntel` |
| AlertsNotificationCenter | `/apex/AlertsNotificationCenter` | **PARTIAL** (empty until seeded) | `RiskSignal` entity |
| CommandCenter | `/apex/CommandCenter` | **WIRED** | `getLiveIntel`, `IntelProfile`/`RiskSignal`/`Task`, `analystChat` |
| PipelineMonitor | `/apex/PipelineMonitor` | **PARTIAL** (empty until jobs exist) | `SwarmJob`, `OmegaScanProgress`, `WorkflowMapping` |
| MLHub | `/apex/MLHub` | **WIRED** (full CRUD) | `SwarmJob` entity CRUD |
| MLDashboard | `/apex/MLDashboard` | **PARTIAL** (empty until jobs) | `SwarmJob`, `OmegaScanProgress` |
| TechTree | `/apex/TechTree` | **SHELL** | none — hard-coded nodes, local state |
| PredictionOracle | `/apex/PredictionOracle` | **WIRED** | `POST /functions/predict` |
| ApexCore | `/apex/ApexCore` | **SHELL** | none — hard-coded plugins, local toggles |
| PluginControlPlane | `/apex/PluginControlPlane` | **SHELL** | none — hard-coded plugins, local toggles |
| PluginIntegrationProof | `/apex/PluginIntegrationProof` | **SHELL** | none — simulated `setTimeout` tests |
| PatentsSearch | `/apex/PatentsSearch` | **PARTIAL/WIRED** (seed) | `Patent` entity (`list`/`create`) |
| PatentRegistry | `/apex/PatentRegistry` | **WIRED** (CRUD) | `Patent` entity CRUD |
| PatentIngest | `/apex/PatentIngest` | **WIRED** (create) | `Patent` entity |
| KGIKBrain | `/apex/KGIKBrain` | **SHELL** | none — `ontology.js` in-code |
| KGIKLedger | `/apex/KGIKLedger` | **PARTIAL** (appends local) | `WorkflowMapping` entity (read) |
| TCIS | `/apex/TCIS` | **PARTIAL** | `getLiveIntel` + `RiskSignal`; hypotheses in-code |
| InvestmentTracker | `/apex/InvestmentTracker` | **WIRED** (CRUD) | `Investment` CRUD, `WealthSnapshot`, `getLiveIntel` |
| SystemHealth | `/apex/SystemHealth` | **WIRED** | `getLiveIntel` (probe) + `IntelProfile` |
| War | `/apex/War` | **WIRED** (stream) | `/streams/{panopticon|counterstrike}` SSE, `SwarmJob`, `RiskSignal` |
| GameLeaderboard | `/apex/GameLeaderboard` | **PARTIAL** (sample) | `Contact` entity |
| Underworld | `/apex/Underworld` | **PARTIAL** (monitor only) | `getLiveIntel`, `/streams/panopticon` SSE |
| Launcher | `/` | **WIRED** (nav) | none |

Tally: 9 WIRED · 8 PARTIAL · 4 SHELL (TechTree, ApexCore, PluginControlPlane,
PluginIntegrationProof) · Launcher nav.

---

## 7. MISSING SURFACES — backend capabilities with NO UI

### 7a. The underworld science engine (the "464 science methods") — entirely unsurfaced
The Underworld backend (`/home/user/jarvis-app/underworld/server/`) contains a huge verified
science layer — **~489 public method functions across ~40 `methods_*.py` modules**, unified by
`services/methods_registry.py` (a keyword→callable `ROUTES` table) and exposed via
`underworld/server/routes/science.py` (`/science/*`) and a field router (`field_science.py`).
**None of it is reachable from the APEX `src/` frontend:**

- The APEX server (`server/main.py`) mounts only `auth, functions, predict, entities, streams,
  history` — **it never mounts the `/science` router.** So even the API base the frontend points
  at doesn't serve these methods.
- A `grep` of `src/` for `science|sonar|submarine|meteor|buoy|flight|neuron|spectro|/methods`
  finds **zero real references** (the 3 hits in PipelineMonitor/JarvisTerminal/PredictionOracle
  are coincidental words like "flight"/"frequency" in sample text).

Concretely missing UI for backend domains that DO exist (mapped from `methods_registry.py`
`ROUTES` and the `methods_*` modules):

| Hidden backend capability | Where it lives | UI surface in APEX `src/`? |
|---|---|---|
| Sonar / submarine / ocean acoustics (`buoyancy_frequency`, `methods_ocean`, `methods_acoustics2` doppler/beat) | `underworld .../methods_ocean.py`, `methods_acoustics2.py` | **NONE** |
| Meteor / astronomy / orbital (`methods_astronomy`, `discovery_astro`) | `methods_astronomy.py`, `discovery_astro.py` | **NONE** |
| PPM / spectroscopy / measurement (`methods_spectroscopy`, `science.measurement_stats`, ppm chemistry) | `methods_spectroscopy.py`, `science.py` | **NONE** |
| Buoys / oceanography stratification | `methods_ocean.py` | **NONE** |
| Flight / aerodynamics (`methods_aerodynamics`, `methods_control`) | `methods_aerodynamics.py` | **NONE** (Oracle only does generic forecasts) |
| Frequency / RF / signal (`methods_rf` doppler, `methods_signal` nyquist/aliasing, `plasma_freq`, `rlc_resonant_frequency`) | `methods_rf.py`, `methods_signal.py`, `methods_plasma.py` | **NONE** |
| Neurons (`methods_neuro.lif_neuron`, 17 neuro defs) | `methods_neuro.py` | **NONE** |
| Seismology methods, tribology, combustion, electrochem, photovoltaics, metallurgy, quantum/qcomputing, food science, biology/genetics, epidemiology/disease, linguistics, robotics, geology, optics, statmech, multiphysics | the ~40 `methods_*.py` | **NONE** |
| Verified-science gates: `/science/bayes`, `/measurement`, `/parse-formula`, `/prior-art`, `/mastery`, `/building-code`, `/ethics-gate`, `/anomaly` | `underworld/.../routes/science.py` | **NONE** |
| Substances / substrate routes (`/substrate`) | `underworld/.../routes/substrate.py` | **NONE** |

> What's needed: a "Science Methods" / "Field Lab" page (or a panel) that hits the underworld
> `/science` + field-router endpoints — **and** the APEX server (or the frontend's API base)
> would first need to actually mount/proxy those routes. Today there is no page, no nav entry,
> and no client wrapper for any of them.

### 7b. The Underworld 3D sim itself
`Underworld.jsx` is a stream *monitor* with a placeholder canvas. The real renderer is the
separate `underworld/web` React app (pages `CommandCentre, Guilds, InventionDetail/List,
KnowledgeLibrary, PatentScanner, Population, Projects, Safety, WorldDetail`) — none of which
is reachable from APEX. So Underworld's invention/patent/population/guild/safety UIs are
effectively a different product not linked from this frontend.

### 7c. Backend functions exposed but unused
`backendFunctions.js` exports 11 PSG/Gmail/Omega functions; the backend implements them as
not-implemented stubs and **no page calls them**. Either build pages for them or remove the
dead exports.

### 7d. Entities defined but never surfaced
`SolarProduct`, `ProductRecall`, `GmailSyncState` are exported from `entities.js` but **no page
reads them** — no UI for solar product recalls / Gmail sync state.

### 7e. `history` route
`server/routes/history.py` (`/history/*`, the "History Lake") is mounted server-side and written
to by the predict route, but **no frontend page reads it** — there's no forecast-accuracy /
backtest history UI.

---

## 8. Quick-win priorities to make the app feel "enabled"
1. **Add glass to `PageKit.PanelCard`/`PageShell`** (one change → cyberpunk glassmorphism on ~all pages).
2. **Seed the entity store on backend boot** (or auto-seed on first load) so Pipeline/MLDashboard/
   Alerts/Leaderboard/KGIKLedger aren't empty by default.
3. **Wire the 4 SHELL pages** (ApexCore, PluginControlPlane, PluginIntegrationProof, TechTree) to a
   real plugin/capability endpoint instead of hard-coded constants + local toggles.
4. **Build a Science/Field-Lab surface** for the ~489 underworld methods (and mount `/science`
   in the APEX server) — the single biggest "hidden backend with no UI."
5. **Remove or implement** the dead PSG/Gmail function exports and unused entities.
