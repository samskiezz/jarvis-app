# PATTERN ORACLE / JARVIS — MASTER GAP MAP (Reassessment)
**Built from a line-by-line audit of every folder** (see `01`–`04` in this directory).
**Verdict in one sentence:** *Almost nothing is missing or lost — the app has an enormous, real backend capability that is simply **not surfaced in the UI**, and the two backends are **not connected**. The work isn't "rebuild lost features"; it's **expose + integrate + restyle** what already exists.*

---

## 0. The three real problems (not "lost code")
1. **EXPOSURE** — a massive backend (480+ science methods, the prediction/ML stack, the sim) has **no UI surface** and, in most cases, **no user-callable API endpoint**. It runs only inside the simulation or in tests.
2. **INTEGRATION** — there are **two separate backends** (`server/` = JARVIS/APEX, `underworld/server/` = the 480-method science engine). The APEX frontend **cannot reach the science engine at all** — it isn't even mounted.
3. **PRESENTATION** — the cyberpunk **glassmorphism** you want exists only on the app *chrome* (Launcher/rail/command palette). Every feature page uses an **opaque** `PageKit`, so the glass look stops at the shell.

Plus two smaller truths: several APEX pages are **UI shells / partial** (empty entity store), and the heavily-trained **OracleModel + History-Lake skill scorecard have no front end**.

---

## 1. Four-layer reality (from the audits)
| Layer | What's REAL & wired | What's built but DORMANT/hidden |
|---|---|---|
| **Underworld backend** (`underworld/server`) | 480 methods / 56 domains via 449-route registry, executed in-sim (`minion→discovery_lab→field_science→methods_registry`); ~30 deep engines (numpy/RDKit/PySCF/SymPy); 22 sims; ~20 `/worlds/{id}/{category}` + `/physics/solve` + `/science/*` routes | The **entire** method library has **no direct user endpoint**; 14 full modules tests-only (temporal_nodes, disease_models, exotic_quantum, ai_models, drug_discovery…) |
| **JARVIS backend** (`server`) | getLiveIntel, analystChat, predict, streams, entities, auth | **OracleModel** (trained, 1.36 MB) + **History Lake** + `/v1/predict/skill` + 11 `/functions/*` = **unused/stub**; no `/v1/` called by the UI |
| **APEX frontend** (`src`) | 9 pages fully wired (GlobalIntel, SystemIntel, CommandCenter, MLHub, PredictionOracle, Patent Registry/Ingest, InvestmentTracker, SystemHealth, war-stream) | 8 partial (empty store), 4 pure shells (ApexCore, PluginControlPlane, PluginIntegrationProof, TechTree); **KGIK = static `ontology.js`, not live**; **science engine: 0 UI** |
| **Underworld web** (`underworld/web`) | Full WebGL world: WorldScene3D + scene system, 10 pages, MinionDrawer/chat, live SSE, 677-GLB `GeneratedWorld`, real bootloader (now your key-art) | UE5 pixel-streaming tier dormant (no GPU streamer); 3 orphaned scene modules; 3D hero loader disabled |

---

## 2. Hidden-feature index (the things you said were "missing")
**All implemented — none lost — just not surfaced.** (exact file:function in `01_underworld_backend.md §6`)
| Feature you named | Where it actually lives | Reachable by UI today? |
|---|---|---|
| Submarine / **sonar** | `methods_acoustics*`, `methods_ocean` (SONAR range, transmission loss) | only `/science` acoustics subset |
| **Meteorites / asteroids** | `methods_astronomy`, impact/orbit methods | in-sim only |
| **Buoys / ocean** | `methods_ocean`, `methods_hydrology` (wave/buoy/current) | in-sim only |
| **ppm / air quality** | `methods_atmoschem` (18 files), emissions/dispersion | in-sim only |
| **Flight / aerospace** | `methods_aerodynamics`, `methods_aerospace`, trajectory | in-sim only |
| **Frequency / RF / spectrum** | `methods_rf`, `methods_signal`, `methods_optics` (83 freq refs) | in-sim only |
| **Neurons / neural** | `methods_neuro`, `neural.py`, disease GRN | in-sim only |
| **Clusters / graphs** | `methods_cs_ai` (k-means, PageRank, Dijkstra), `knowledge_graph`, `temporal_nodes` | in-sim only |

---

## 3. The plan to surface it all (prioritized, concrete)
**P1 — Bridge the two backends.** Mount the underworld `methods_registry` into APEX: add a JARVIS route `POST /functions/science {domain|method, params}` that calls `methods_registry.run(...)` (direct import if co-located, else HTTP to the underworld server). *Unlocks all 480 methods to the UI in one stroke.*

**P2 — Glassmorphism everywhere (one fix).** Convert `PageKit`'s `PanelCard`/`PageShell` to the glass tokens already used by the chrome (`backdrop-blur`, translucent bg, neon edge). Propagates the cyberpunk-glass look to every feature page at once.

**P3 — Surface the hidden features as real pages.** New APEX consoles driven by P1: **Sensor Grid** (ppm air-quality map + buoys/ocean), **Sky/Orbital** (meteorites/asteroids/satellites + flight paths), **RF/Spectrum scanner**, **Sonar/Submarine**, **Neuron/Cluster ball-graph** (live force-graph), and a **live KGIK** graph (replace static `ontology.js` with a real graph store + temporal_nodes).

**P4 — Wire the ML stack to the UI.** Surface OracleModel (conviction signals + volatility) and the History-Lake skill scorecard (`/v1/predict/skill`) in the Prediction Oracle page and the Jarvis chat ("predict X").

**P5 — Fill the shells / partial pages.** Seed the entity store or make the 8 partial pages self-load; build out the 4 shell pages or remove them.

**P6 — Underworld polish.** Re-enable/Composite the 3D hero on the key-art loader if wanted; resolve UE5 pixel-stream (real GPU streamer) or mark experimental.

---

## 4. Honest scorecard
- **Lost in the merge:** 0 files (git-verified, 2,296 files on main).
- **Backend capability:** very high (480 methods, full sim, trained ML) — **far more than the UI shows**.
- **UI exposure of that capability:** low — the single biggest gap.
- **Two backends connected:** no — the #1 integration fix.
- **Glassmorphic everywhere:** no — one-component fix.
- **Prediction accuracy:** honest — ~50% directional / calibrated intervals / conviction-selective edge; not 99% directional, never will be (information-theoretic limit).
- **Security:** local `.env` key is **not** in git (verified) — rotate as hygiene, keep it untracked.

> This map is the agreed source of truth for the build-out. Each P-item becomes a tracked work package.
