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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (done: CommandPalette.jsx — ⌘K/Ctrl+K, pages + scenes, keyboard nav, Enter runs)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (done: HeyJarvisListener.jsx — SpeechRecognition API, always-listening mic toggle)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (done: LiveTelemetryTicker.jsx — top-bar HUD, 30-s poll)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (done: SceneKeyboardNav.jsx — 1–0 jumps to cinematic scenes, Esc→home)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (done: StatusReporter.jsx — fetches /v1/jarvis/system/status + /v1/cinematic/brain, TTS)
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. (done: WorldIncidentFeed.jsx — earthquake feed, severity-sorted)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (done: MarketsTicker.jsx — crypto+FX scrolling strip, TTS top movers)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (done: EntityQuickSearch.jsx — Ctrl+Shift+E, graph+IntelProfile search, spoken dossier)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (done: RiskBoard.jsx — severity-sorted cards, red critical pulse)
- [x] F10 Task board — /entities/Task → live mission cards with status. (done: TaskBoard.jsx — live mission cards, status badge)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (done: DatasetsBrowser.jsx — dataset catalog, row counts)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (done: InvestigationsList.jsx — open cases, INTEL toggle)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (done: ScenarioLauncher.jsx — list+run scenarios, outcome display)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (done: DocumentSearch.jsx — reports+knowledge search, AI summary via TTS)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (done: SkillScorecard.jsx — skill cards with score bars, 60-s poll)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (done: BrainGrowthSparkline.jsx — area chart, 30-s poll, BRAIN toggle)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (done: SceneAnchorDrillDown.jsx — ⚓ ANCHORS toggle, recursive anchor detail)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (done: JarvisBootSequence.jsx — once-per-session, cinematic terminal, TTS "all systems online")
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (done: AmbientReactorHum.jsx — WebAudio 60 Hz sawtooth + LFO, ◇/◈ HUM toggle)
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). (done: wired in JarvisBrain.jsx SCENE_INTENTS, keyword map dispatches scene nav)
- [x] F21 Live clock + uptime (real process uptime from system status). (done: LiveClockUptime.jsx — bottom-left HUD, real uptime from /v1/jarvis/system/status, 30-s poll)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (done: AlertToasts.jsx — 20-s poll /v1/alerts, HIGH/CRITICAL toasts, spoken CRITICAL)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (done: InvestmentWidget.jsx — ◆ WEALTH button, holdings + allocation bars + P&L)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (done: ContactsDirectory.jsx — searchable by name/role/email/dept/tags, 5-min refresh)
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. (done: SwarmJobsMonitor.jsx — running/queued/failed/done tiles + progress bars, 20-s poll)
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. (done: GraphCentralityView.jsx — top-node influence bars, type-filter tabs, 60-s poll)
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). (done: ServiceDiagnostics.jsx — ⬡ DIAG button, per-service health board, CPU/MEM/LOAD tiles)
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). (done: CommandHistory.jsx — ◷ HIST button, localStorage up to 50 commands, filter + replay)
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. (done: MultiVoiceToggle.jsx — ◈ VOICE button, ash/fable/onyx, persists to localStorage)
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. (done: SceneAutoTour.jsx — ⟳ TOUR button, all 10 scenes, spoken narration, play/pause/stop)
- [x] F46 Skill gap advisor — /v1/aip/skill → bottom-3 weakest skills → AI training recommendations per gap. (done 2026-08-07: SkillGapAdvisor.jsx wired into App.jsx — ◈ GAPS button, score bars, urgency labels, 5-min poll, AI recs via /v1/jarvis/agent/chat)
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
