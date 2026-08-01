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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (2026-08-01: CommandPalette.jsx mounted in App.jsx; lists all PAGES + 10 cinematic scenes)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (2026-08-01: HeyJarvisListener.jsx mounted in App.jsx)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (2026-08-01: LiveTelemetryTicker.jsx mounted in App.jsx)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (2026-08-01: SceneKeyboardNav.jsx mounted in App.jsx)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (2026-08-01: StatusReporter.jsx mounted in App.jsx)
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. (2026-08-01: WorldIncidentFeed.jsx mounted in App.jsx)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (2026-08-01: MarketsTicker.jsx mounted in App.jsx)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (2026-08-01: EntityQuickSearch.jsx mounted in App.jsx)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (2026-08-01: RiskBoard.jsx mounted in App.jsx)
- [x] F10 Task board — /entities/Task → live mission cards with status. (2026-08-01: TaskBoard.jsx mounted in App.jsx)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (2026-08-01: DatasetsBrowser.jsx mounted in App.jsx)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (2026-08-01: InvestigationsList.jsx mounted in App.jsx)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (2026-08-01: ScenarioLauncher.jsx mounted in App.jsx)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (2026-08-01: DocumentSearch.jsx mounted in App.jsx)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (2026-08-01: SkillScorecard.jsx mounted in App.jsx)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (2026-08-01: BrainGrowthSparkline.jsx mounted in App.jsx)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (2026-08-01: SceneAnchorDrillDown.jsx mounted in App.jsx)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (2026-08-01: JarvisBootSequence.jsx mounted in App.jsx)
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (2026-08-01: AmbientReactorHum.jsx mounted in App.jsx)
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). (2026-08-01: SCENE_INTENTS regex map in JarvisBrain.jsx; dispatches jarvis:ask to panels via ShowMeNavigation)
- [x] F21 Live clock + uptime (real process uptime from system status). (2026-08-01: LiveClockUptime.jsx mounted in App.jsx)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (2026-08-01: AlertToasts.jsx mounted in App.jsx)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (2026-08-01: InvestmentWidget.jsx mounted in App.jsx)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (2026-08-01: ContactsDirectory.jsx mounted in App.jsx)
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. (2026-08-01: SwarmJobsMonitor.jsx mounted in App.jsx)
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. (2026-08-01: GraphCentralityView.jsx mounted in App.jsx)
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). (2026-08-01: ServiceDiagnostics.jsx mounted in App.jsx)
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). (2026-08-01: CommandHistory.jsx mounted in App.jsx)
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. (2026-08-01: MultiVoiceToggle.jsx mounted in App.jsx)
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. (2026-08-01: SceneAutoTour.jsx mounted in App.jsx)
- [x] F31 Ops task coverage checker — /v1/ops/events × /entities/Task; surfaces uncovered critical events needing a task; red badge; ASSESS → /v1/jarvis/agent/chat + TTS. (2026-08-01: OpsTaskCoverageChecker.jsx mounted in App.jsx; ◎ OPSCOV button at left:6732)
- [x] F32 Scene-risk coverage map — all 10 /v1/cinematic/scene/{id} anchor sets × /entities/RiskSignal; CAPTURED vs DARK risk signals; red badge on dark criticals; ALL/CAPTURED/DARK tabs + search; ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS; "scene risk"/"dark risks"/"scrisk" voice trigger. (2026-08-01: SceneRiskCoverageMap.jsx mounted in App.jsx; ◈ SCRISK button at left:8604)
- [x] F33 Ops event severity dashboard — /v1/ops/events → group by CRITICAL/WARNING/INFO severity; count tiles + most-recent event per level; red badge on critical count; ASSESS → /v1/jarvis/agent/chat 2-sentence severity brief + TTS; "ops severity"/"event severity"/"severity dashboard"/"sevdash" voice trigger. (2026-08-01: OpsEventSeverityDashboard.jsx mounted in App.jsx; ◈ SEVDASH button at left:55080)
- [x] F34 Graph node × report coverage — /v1/graph/centrality × /v1/reports; REPORTED vs UNREPORTED; amber badge; ▶ ASSESS → agent chat + TTS. (2026-08-01: GraphNodeReportCoverage.jsx mounted in App.jsx; ◈ GPREP button at left:55640)
- [x] F35 Live Intel × Task Activator — /functions/getLiveIntel (quakes/crypto/FX) × /entities/Task → TRIGGERED vs DORMANT tasks; red badge on triggered count; ASSESS → /v1/jarvis/agent/chat + TTS; ◈ LITA button; isLitaQuery+buildLitaScript wired in JarvisBrain. (2026-08-01: LiveIntelTaskActivator.jsx mounted in App.jsx; build exit 0)
- [x] F36 Skill × Live Intel World Demand Gauge — /v1/aip/skill × /functions/getLiveIntel → ACTIVATED vs IDLE skills by world event relevance; amber badge; ASSESS → agent chat + TTS. (2026-08-01: SkillLiveIntelDemand.jsx mounted in App.jsx; ◈ SKILD button at left:56200; isSkildQuery+buildSkildScript wired in JarvisBrain; build exit 0)
- [x] F37 Contact × Live Intel Exposure Monitor — /entities/Contact × /functions/getLiveIntel → EXPOSED vs CLEAR contacts by live world event correlation; red badge (escalated on seismic); ASSESS → agent chat + TTS. (2026-08-01: ContactLiveIntelExposure.jsx mounted in App.jsx; ◈ CXLINTEL button at left:56760; isCxlintelQuery+buildCxlintelScript wired in JarvisBrain; build exit 0)
- [x] F38 Crypto × risk signal correlator — /functions/getLiveIntel (crypto+FX) × /entities/RiskSignal → EXPOSED vs ISOLATED signals by live market keyword overlap; ◈ CRYPTORSK button; red badge; ASSESS → agent/chat + TTS. (2026-08-01: CryptoRiskCorrelator.jsx mounted in App.jsx; isCryptorskQuery+buildCryptorskScript already wired in JarvisBrain; build exit 0)
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
