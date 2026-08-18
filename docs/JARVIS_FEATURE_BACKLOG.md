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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (2026-08-18: CommandPalette.jsx mounted in App.jsx; covers cinematic scenes + all APEX pages)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (2026-08-18: HeyJarvisListener.jsx mounted in App.jsx)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (2026-08-18: LiveTelemetryTicker.jsx mounted in App.jsx)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (2026-08-18: SceneKeyboardNav.jsx mounted in App.jsx)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (2026-08-18: StatusReporter.jsx mounted in App.jsx; pulls /v1/jarvis/system/status + /v1/cinematic/brain)
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. (2026-08-18: WorldIncidentFeed.jsx mounted in App.jsx)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (2026-08-18: MarketsTicker.jsx mounted in App.jsx)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (2026-08-18: EntityQuickSearch.jsx mounted in App.jsx)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (2026-08-18: RiskBoard.jsx mounted in App.jsx)
- [x] F10 Task board — /entities/Task → live mission cards with status. (2026-08-18: TaskBoard.jsx mounted in App.jsx)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (2026-08-18: DatasetsBrowser.jsx mounted in App.jsx)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (2026-08-18: InvestigationsList.jsx mounted in App.jsx)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (2026-08-18: ScenarioLauncher.jsx mounted in App.jsx)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (2026-08-18: DocumentSearch.jsx mounted in App.jsx)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (2026-08-18: SkillScorecard.jsx mounted in App.jsx)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (2026-08-18: BrainGrowthSparkline.jsx mounted in App.jsx)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (2026-08-18: SceneAnchorDrillDown.jsx mounted in App.jsx)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (2026-08-18: JarvisBootSequence.jsx mounted in App.jsx)
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (2026-08-18: AmbientReactorHum.jsx mounted in App.jsx)
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). (2026-08-18: implemented inside JarvisBrain.jsx voice-intent routing)
- [x] F21 Live clock + uptime (real process uptime from system status). (2026-08-18: LiveClockUptime.jsx mounted in App.jsx; polls /v1/jarvis/system/status every 30 s)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (2026-08-18: AlertToasts.jsx mounted in App.jsx)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (2026-08-18: InvestmentWidget.jsx mounted in App.jsx)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (2026-08-18: ContactsDirectory.jsx mounted in App.jsx)
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. (2026-08-18: SwarmJobsMonitor.jsx mounted in App.jsx)
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. (2026-08-18: GraphCentralityView.jsx mounted in App.jsx)
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). (2026-08-18: ServiceDiagnostics.jsx mounted in App.jsx)
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). (2026-08-18: CommandHistory.jsx mounted in App.jsx)
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. (2026-08-18: MultiVoiceToggle.jsx mounted in App.jsx)
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. (2026-08-18: SceneAutoTour.jsx mounted in App.jsx)
- [x] F31 Dataset knowledge coverage — /v1/datasets + /knowledge/ → keyword-correlate each dataset against knowledge articles; surface DOCUMENTED vs DARK datasets; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; ◈ DSKNOW button. (2026-08-18: DatasetKnowledgeCoverage.jsx mounted in App.jsx; parallel-fetches /v1/datasets + /knowledge/; amber badge on dark count; ASSESS → /v1/jarvis/agent/chat + TTS)
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
