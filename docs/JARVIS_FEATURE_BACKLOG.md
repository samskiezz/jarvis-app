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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (2026-09-19: CommandPalette.jsx wired in App.jsx; build verified)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (2026-09-19: HeyJarvisListener.jsx wired in App.jsx; build verified)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (2026-09-19: LiveTelemetryTicker.jsx wired in App.jsx; build verified)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (2026-09-19: SceneKeyboardNav.jsx wired in App.jsx; build verified)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (2026-09-19: StatusReporter.jsx wired in App.jsx; build verified)
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. (2026-09-19: WorldIncidentFeed.jsx wired in App.jsx; build verified)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (2026-09-19: MarketsTicker.jsx wired in App.jsx; build verified)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (2026-09-19: EntityQuickSearch.jsx wired in App.jsx; build verified)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (2026-09-19: RiskBoard.jsx wired in App.jsx; build verified)
- [x] F10 Task board — /entities/Task → live mission cards with status. (2026-09-19: TaskBoard.jsx wired in App.jsx; build verified)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (2026-09-19: DatasetsBrowser.jsx wired in App.jsx; build verified)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (2026-09-19: InvestigationsList.jsx wired in App.jsx; build verified)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (2026-09-19: ScenarioLauncher.jsx wired in App.jsx; build verified)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (2026-09-19: DocumentSearch.jsx wired in App.jsx; build verified)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (2026-09-19: SkillScorecard.jsx wired in App.jsx; build verified)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (2026-09-19: BrainGrowthSparkline.jsx wired in App.jsx; build verified)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (2026-09-19: SceneAnchorDrillDown.jsx wired in App.jsx; build verified)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (2026-09-19: JarvisBootSequence.jsx wired in App.jsx; build verified)
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (2026-09-19: AmbientReactorHum.jsx wired in App.jsx; build verified)
- [x] F20 "Show me" navigation — extend keyword map to data drill (e.g. "show risks"). (2026-09-19: ShowMeNavigation.jsx resolveShowMeQuery/isShowMeQuery wired into JarvisBrain.ask() pre-router; build verified)
- [x] F21 Live clock + uptime (real process uptime from system status). (2026-09-19: LiveClockUptime.jsx wired in App.jsx; build verified)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (2026-09-19: AlertToasts.jsx wired in App.jsx; build verified)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (2026-09-19: InvestmentWidget.jsx wired in App.jsx; build verified)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (2026-09-19: ContactsDirectory.jsx wired in App.jsx; build verified)
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. (2026-09-19: SwarmJobsMonitor.jsx wired in App.jsx; build verified)
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. (2026-09-19: GraphCentralityView.jsx wired in App.jsx; build verified)
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). (2026-09-19: ServiceDiagnostics.jsx wired in App.jsx; build verified)
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). (2026-09-19: CommandHistory.jsx wired in App.jsx; build verified)
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. (2026-09-19: MultiVoiceToggle.jsx wired in App.jsx; build verified)
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. (2026-09-19: SceneAutoTour.jsx wired in App.jsx; build verified)
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
