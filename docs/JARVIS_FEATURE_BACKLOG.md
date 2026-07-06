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
- [x] F01 ⌘K command palette — CommandPalette.jsx lists all PAGES (pageRegistry) + 10 cinematic scenes; ⌘K opens, ↑↓ navigate, Enter runs; mounted in App.jsx (2026-07-06).
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. HeyJarvisListener.jsx + jarvisVoice.js + WakeWordToggle.jsx; Web Speech API; armed via WAKE pill button; dispatches jarvis:ask; mounted in App.jsx (2026-07-06).
- [x] F03 Live telemetry ticker (top bar) — LiveTelemetryTicker.jsx polls /v1/jarvis/system/status + /v1/cinematic/brain every 30 s; CPU/MEM/LOAD/NODES/SYNAPSES pills fixed top bar; mounted in App.jsx (2026-07-06).
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. SceneKeyboardNav.jsx maps digit keys to CINEMATIC_SCENES via cinematicSceneRegistry; shows 1600ms HUD badge on jump; mounted in App.jsx (2026-07-06).
- [x] F05 Spoken status report — isStatusQuery() intercept in JarvisBrain wires to buildStatusScript() → /v1/jarvis/system/status + /v1/cinematic/brain → spoken sentence via /v1/voice/tts (2026-07-06).
- [x] F06 Live World incident feed — WorldIncidentFeed.jsx: Three.js mini globe with earthquake magnitude pins + severity-sorted scrolling list from /functions/getLiveIntel; pulsing M5+/M6+ halos; 60s auto-refresh; INCIDENTS button bottom-left; mounted in App.jsx (2026-07-06).
- [x] F07 Markets ticker — getLiveIntel crypto + FX → scrolling bottom ticker (MarketsTicker.jsx, already mounted in App.jsx); wired isMarketsQuery/buildMarketsScript into JarvisBrain.jsx so "JARVIS, markets" speaks top movers via /v1/voice/tts (2026-07-06).
- [x] F08 Entity quick-search — EntityQuickSearch.jsx (already existed+mounted in App.jsx) fully wired: imported isEntitySearchQuery/extractEntitySearchTerm/buildEntityDossierScript into JarvisBrain.jsx; added entity-search branch in ask() that dispatches jarvis:entity-search + speaks dossier via /v1/graph/subgraph + /entities/IntelProfile; added jarvis:speak-dossier listener so clicking results speaks via /v1/voice/tts; Ctrl/Cmd+Shift+E opens panel; "who is / find / search for" voice triggers work (2026-07-06).
- [x] F09 Risk board — RiskBoard.jsx fetches /entities/RiskSignal, severity-sorted cards, red pulse on critical; isRiskQuery/buildRiskScript wired into JarvisBrain so "JARVIS, risks" speaks the board summary via /v1/voice/tts (2026-07-06).
- [x] F10 Task board — /entities/Task → live mission cards with status. (2026-07-06: TaskBoard.jsx, mounted)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (2026-07-06: DatasetsBrowser.jsx, mounted)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (2026-07-06: InvestigationsList.jsx, mounted)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (2026-07-06: ScenarioLauncher.jsx, mounted)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (2026-07-06: DocumentSearch.jsx, mounted)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (2026-07-06: SkillScorecard.jsx, mounted)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (2026-07-06: BrainGrowthSparkline.jsx, mounted)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (2026-07-06: SceneAnchorDrillDown.jsx, mounted)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (2026-07-06: JarvisBootSequence.jsx, mounted; fetches /v1/jarvis/system/status + /v1/cinematic/brain)
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (2026-07-06: AmbientReactorHum.jsx, mounted; 60 Hz sawtooth + LFO)
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). (2026-07-06: ShowMeNavigation.jsx wired into JarvisBrain.ask() as silent pre-router; "show me X" normalises to panel intent keyword, re-dispatches jarvis:ask with _sm flag to prevent agent-chat duplication; mounted null component in App.jsx)
- [x] F21 Live clock + uptime (real process uptime from system status). (2026-07-06: LiveClockUptime.jsx, mounted; 30-s poll /v1/jarvis/system/status)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (2026-07-06: AlertToasts.jsx, mounted; 20-s poll /v1/ops/alerts)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (2026-07-06: InvestmentWidget.jsx, mounted)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (2026-07-06: ContactsDirectory.jsx, mounted)
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. (2026-07-06: SwarmJobsMonitor.jsx, mounted; 20-s poll)
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. (2026-07-06: GraphCentralityView.jsx, mounted; 60-s poll)
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). (2026-07-06: ServiceDiagnostics.jsx, mounted; 30-s poll /v1/jarvis/system/status)
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). (2026-07-06: CommandHistory.jsx, mounted; captures jarvis:ask events, max 50)
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. (2026-07-06: MultiVoiceToggle.jsx, mounted; persists to localStorage)
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. (2026-07-06: SceneAutoTour.jsx, mounted; /v1/cinematic/scene/{id} + /v1/voice/tts)
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
