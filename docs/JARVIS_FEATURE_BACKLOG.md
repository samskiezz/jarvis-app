# JARVIS Feature Backlog — REAL, grounded, no fake

The overnight builder works through this list, one feature per run. RULES (non-negotiable):
- **Nothing fake.** Every feature must wire to a REAL backend endpoint that returns real data,
  or perform a real navigation/action. If the endpoint doesn't exist or returns nothing, SKIP
  the feature and note why — never stub fake data.
- **Additive only.** New components/files. Do NOT rewrite or delete user-edited files
  (CinematicShell.jsx, CinematicHome.jsx, JarvisLoader.jsx). Mount via App.jsx or JarvisBrain.
- **Zero-downtime deploy:** `bash scripts/safe-deploy-frontend.sh` (atomic swap; old dist stays
  live on failure). Backend edits: syntax-check (`python -c`) BEFORE any pm2 restart.
- Mark each `[x]` done with the date + a one-line note when implemented + deployed + verified.

## Confirmed-real endpoints to build on
`/v1/cinematic/scene/{id}` (10 scenes, real anchors) · `/v1/cinematic/brain` (graph stats) ·
`/functions/getLiveIntel` (quakes/crypto/fx) · `/v1/jarvis/system/status` · `/v1/jarvis/agent/chat`
(persona) · `/v1/voice/tts` (JARVIS voice) · `/entities/{Task,RiskSignal,IntelProfile,SwarmJob,
Investment,Contact}` · `/v1/graph/*` · `/v1/ops/*` · `/v1/datasets` · `/v1/investigations` ·
`/v1/scenario/list` · `/v1/aip/skill` · `/v1/reports` · `/knowledge/*`

## Backlog (real features)
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-08-27: pre-implemented as src/components/cinematic/CommandPalette.jsx; mounted in App.jsx; build verified]
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-08-27: pre-implemented as src/components/cinematic/HeyJarvisListener.jsx; mounted in App.jsx; uses SpeechRecognition API, dispatches jarvis:ask, wires to WakeWordToggle; vite build verified (exit 0)]
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-08-27: pre-implemented as src/components/cinematic/LiveTelemetryTicker.jsx; mounted in App.jsx; polls both real endpoints every 30 s; colour-coded pills; hides until first data; vite build verified (exit 0)]
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-08-27: SceneKeyboardNav.jsx already implemented and mounted in App.jsx; maps keys 1–9/0 → scenes 01–10 via CINEMATIC_SCENES; Esc → /; shows centered HUD badge on jump; vite build passed (exit 0)]
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-08-27: pre-implemented as src/components/cinematic/StatusReporter.jsx + SpokenStatusReport.jsx; listens for jarvis:status event; fetches /v1/jarvis/system/status + /v1/cinematic/brain in parallel; composes spoken text; calls /v1/voice/tts; shows HUD card with live numbers; mounted in App.jsx; routed in JarvisBrain.jsx; vite build verified (exit 0)]
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-08-27: pre-implemented as src/components/cinematic/WorldIncidentFeed.jsx (329 lines); Three.js MiniGlobe with lat/lng pins + magnitude-coloured markers; scrolling seismic incident list; M4.5+/M5+/M6+ stat strip; floats as toggle panel; mounted in App.jsx; vite build verified (exit 0)]
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-08-28: pre-implemented as src/components/cinematic/MarketsTicker.jsx; scrolling ticker strip at bottom, expandable grid, isMarketsQuery/buildMarketsScript wired into JarvisBrain.jsx; polls /functions/getLiveIntel every 60s; vite build verified (exit 0)]
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. [2026-08-28: EntityQuickSearch.jsx fully implemented; Ctrl/Cmd+Shift+E or "JARVIS, find/search/who is X" opens floating panel; queries /v1/graph/subgraph + /entities/IntelProfile, debounced 350 ms; click result dispatches jarvis:speak-dossier → JarvisBrain TTS; JarvisBrain.jsx wires isEntitySearchQuery/extractEntitySearchTerm/buildEntityDossierScript; vite build verified (exit 0)]
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. [2026-08-28: RiskBoard.jsx implemented; severity-sorted cards (critical/high/medium/low), red pulse animation on critical signals, filter tabs, 90s auto-refresh from /entities/RiskSignal; isRiskQuery/buildRiskScript wired into JarvisBrain.jsx; mounted in App.jsx; vite build verified (exit 0)]
- [x] F10 Task board — /entities/Task → live mission cards with status. [2026-08-28: TaskBoard.jsx (290 lines) fully implemented; status-sorted cards (in_progress/pending/blocked/completed); filter tabs; 90s auto-refresh; "JARVIS, tasks/missions" voice trigger; isTaskQuery+buildTaskScript wired into JarvisBrain.jsx; mounted in App.jsx; vite build verified (exit 0)]
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. [2026-08-28: pre-implemented as src/components/cinematic/DatasetsBrowser.jsx; mounted in App.jsx; filterable catalog with row-count badges; isDatasetsQuery/buildDatasetsScript wired in JarvisBrain; vite build verified (exit 0)]
- [x] F12 Investigations list — /v1/investigations → open cases panel. [2026-08-28: pre-implemented as src/components/cinematic/InvestigationsList.jsx (321 lines); mounted in App.jsx; status-sorted cards (open/active/in-progress/pending/closed); filter text search; open-case count badge; 120s auto-refresh; jarvis:ask listener opens panel; isInvestigationsQuery+buildInvestigationsScript wired in JarvisBrain.jsx; vite build verified (exit 0)]
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. [2026-08-28: ScenarioLauncher.jsx (180 lines); fetches /v1/scenario/list; pick → POST /v1/scenario/{id}/run; shows outcome with status; isScenarioQuery+buildScenarioScript wired in JarvisBrain.jsx; mounted in App.jsx; vite build verified (exit 0)]
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. [2026-08-28: DocumentSearch.jsx pre-implemented; fetches /v1/reports + /knowledge/ in parallel; combined searchable list with source filter tabs (ALL/REPORTS/KNOWLEDGE); amber vault accent; 120s auto-refresh; click any result → JARVIS speaks summary via jarvis:ask TTS; isDocumentQuery+buildDocumentScript wired in JarvisBrain.jsx; mounted in App.jsx; vite build verified (exit 0)]
- [ ] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live.
- [ ] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time.
- [ ] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only).
- [ ] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts.
- [ ] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant.
- [ ] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks").
- [ ] F21 Live clock + uptime (real process uptime from system status).
- [ ] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken).
- [ ] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout.
- [ ] F24 Contacts directory — /entities/Contact → searchable people list.
- [ ] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress.
- [ ] F26 Graph centrality view — /v1/graph/centrality → top entities by influence.
- [ ] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status).
- [ ] F28 Command history — store + replay recent JARVIS commands (localStorage).
- [ ] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live.
- [ ] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each.
- [x] F31 Knowledge Freshness Monitor — /knowledge/ → classify articles as FRESH/CURRENT/STALE by updated_at age; red badge on stale count; voice "knowledge freshness / stale knowledge". [2026-08-28: KnowledgeFreshnessMonitor.jsx (230 lines); polls /knowledge/ with path fallbacks; FRESH<24h/CURRENT 1-7d/STALE>7d classification; filter tabs; isKfmQuery+buildKfmScript wired in JarvisBrain; ⬡ KFM button left:8580; jarvis:kfm-toggle event; 120-s auto-refresh; mounted in App.jsx; vite build verified (exit 0)]
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
