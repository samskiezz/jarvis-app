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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (implemented: CommandPalette.jsx mounted in App.jsx)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (implemented: HeyJarvisListener.jsx)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (implemented: LiveTelemetryTicker.jsx)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (implemented: SceneKeyboardNav.jsx)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (implemented: StatusReporter.jsx)
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. (implemented: WorldIncidentFeed.jsx)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (implemented: MarketsTicker.jsx)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (implemented: EntityQuickSearch.jsx)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (implemented: RiskBoard.jsx)
- [x] F10 Task board — /entities/Task → live mission cards with status. (implemented: TaskBoard.jsx)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (implemented: DatasetsBrowser.jsx)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (implemented: InvestigationsList.jsx)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (implemented: ScenarioLauncher.jsx)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (implemented: DocumentSearch.jsx)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (implemented: SkillScorecard.jsx)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (implemented: BrainGrowthSparkline.jsx)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (implemented: SceneAnchorDrillDown.jsx)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (implemented: JarvisBootSequence.jsx)
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (implemented: AmbientReactorHum.jsx)
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). (implemented: ShowMeNavigation.jsx)
- [x] F21 Live clock + uptime (real process uptime from system status). (implemented: LiveClockUptime.jsx)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (implemented: AlertToasts.jsx)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (implemented: InvestmentWidget.jsx)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (implemented: ContactsDirectory.jsx)
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. (implemented: SwarmJobsMonitor.jsx)
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. (implemented: GraphCentralityView.jsx)
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). (implemented: ServiceDiagnostics.jsx)
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). (implemented: CommandHistory.jsx)
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. (implemented: MultiVoiceToggle.jsx)
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. (implemented: SceneAutoTour.jsx)
- [x] F166 Skill × swarm automation coverage — /v1/aip/skill × /entities/SwarmJob; AUTOMATED vs MANUAL skills; automation %; ▶ ASSESS via agent chat + TTS. (2026-09-14: SwarmSkillCoverage.jsx, SKLSWM button left:55080)
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
