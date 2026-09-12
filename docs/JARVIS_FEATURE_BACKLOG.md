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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-09-12: implemented in src/components/cinematic/CommandPalette.jsx, mounted via App.jsx; lists all pageRegistry pages + 10 cinematic scenes, keyboard nav (↑↓/Enter/Esc), real navigation on run]
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-09-12: HeyJarvisListener.jsx (SpeechRecognition wake word) + WakeWordToggle.jsx + jarvisVoice.js; mounted in App.jsx; dispatches jarvis:ask to open JarvisBrain; ambient hum armed on toggle; build verified OK]
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-09-12: LiveTelemetryTicker.jsx polls both endpoints every 30 s; Pill readouts for CPU/MEM/LOAD/NODES/SYNAPSES; hides until first real data; mounted via App.jsx line 1137; build verified OK]
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-09-12: SceneKeyboardNav.jsx — global keydown listener maps 1–9→scene01–09, 0→scene10, Esc→/; skips when input/textarea focused; shows 1.6 s HUD badge confirming jump; uses CINEMATIC_SCENES registry; mounted via App.jsx; build verified exit 0]
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-09-12: SpokenStatusReport.jsx builds script from /v1/jarvis/system/status + /v1/cinematic/brain; wired in JarvisBrain.jsx via isStatusQuery/buildStatusScript/speak(); speaks via /v1/voice/tts; build verified exit 0]
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-09-12: LiveWorldIncidentFeed.jsx — polls getLiveIntel every 60 s; SVG equirectangular world map with magnitude-scaled hover-tooltip pins; scrolling incident list sorted by mag; M5+/M7+ stat tiles; ⚡ QUAKES button left:8700; voice intent isIncidentFeedQuery + buildIncidentFeedScript; mounted in App.jsx; build exit 0]
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-09-12: MarketsTicker.jsx — scrolling ticker strip polls /functions/getLiveIntel crypto+FX every 60 s; isMarketsQuery/buildMarketsScript wired in JarvisBrain.jsx; mounted in App.jsx; build exit 0]
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. [2026-09-12: EntityQuickSearch.jsx — queries /v1/graph/subgraph + /entities/IntelProfile; Ctrl+Shift+E shortcut; jarvis:entity-search event via JarvisBrain; click result dispatches jarvis:speak-dossier; mounted in App.jsx; build exit 0]
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. [2026-09-12: RiskBoard.jsx — polls /entities/RiskSignal every 90 s; severity-sorted (critical/high/medium/low) cards with red pulse on critical; isRiskQuery+buildRiskScript wired in JarvisBrain; ◈ RISKS button; mounted App.jsx; build verified]
- [x] F10 Task board — /entities/Task → live mission cards with status. [2026-09-12: TaskBoard.jsx polls /entities/Task every 90 s; status-sorted cards (in_progress→pending→blocked→completed); colour-coded by status; active tasks pulse cyan; TASKS button bottom-left; isTaskQuery+buildTaskScript wired in JarvisBrain; mounted App.jsx line 1068; Vite build exit 0]
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. [2026-09-12: DatasetsBrowser.jsx polls /v1/datasets every 120 s; name/row-count/type/description cards; filter input; stats bar shows total records; ⬡ DATA button; isDatasetsQuery+buildDatasetsScript wired; mounted App.jsx:1070; vite build exit 0]
- [x] F12 Investigations list — /v1/investigations → open cases panel. [2026-09-12: InvestigationsList.jsx + InvestigationsBoard.jsx mounted in App.jsx; polls /v1/investigations every 90 s; status/priority sorted; ASSESS → agent chat + TTS; build verified]
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. [2026-09-12: ScenarioLauncher.jsx + ScenarioImpactMatrix.jsx; /v1/scenario/list + /v1/scenario/{id}/run; outcome display; mounted App.jsx; build verified]
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. [2026-09-12: DocumentSearch.jsx; combines /v1/reports + /knowledge/; filter + TTS summary; mounted App.jsx; build verified]
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. [2026-09-12: SkillScorecard.jsx; polls /v1/aip/skill; score bars + trend; mounted App.jsx; build verified]
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. [2026-09-12: BrainGrowthSparkline.jsx; polls /v1/cinematic/brain every 60 s; SVG sparkline; mounted App.jsx; build verified]
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). [2026-09-12: SceneAnchorDrillDown.jsx + PerSceneAnchorDrillDown.jsx; /v1/cinematic/scene/{id}; mounted App.jsx; build verified]
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. [2026-09-12: JarvisBootSequence.jsx; fetches /v1/jarvis/system/status + /v1/cinematic/brain on mount; TTS via /v1/voice/tts; mounted App.jsx; build verified]
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. [2026-09-12: AmbientReactorHum.jsx; WebAudio oscillator loop; on/off toggle + jarvis:ambient-toggle event; mounted App.jsx; build verified]
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). [2026-09-12: ShowMeNavigation.jsx + ShowMeRouter.jsx; isShowMeQuery/buildShowMeScript wired in JarvisBrain; navigates to relevant panels; build verified]
- [x] F21 Live clock + uptime (real process uptime from system status). [2026-09-12: LiveClockUptime.jsx; polls /v1/jarvis/system/status; real uptime + live clock; mounted App.jsx; build verified]
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). [2026-09-12: AlertToasts.jsx; polls /v1/ops/alerts; TTS on new criticals; mounted App.jsx; build verified]
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. [2026-09-12: InvestmentWidget.jsx; /entities/Investment + /entities/WealthSnapshot; P&L + holdings; mounted App.jsx; build verified]
- [x] F24 Contacts directory — /entities/Contact → searchable people list. [2026-09-12: ContactsDirectory.jsx; polls /entities/Contact; search + dossier; mounted App.jsx; build verified]
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. [2026-09-12: SwarmJobsMonitor.jsx; polls /entities/SwarmJob every 60 s; progress bars + status; mounted App.jsx; build verified]
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. [2026-09-12: GraphCentralityView.jsx; polls /v1/graph/centrality; ranked influence list; mounted App.jsx; build verified]
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). [2026-09-12: ServiceDiagnostics.jsx; /v1/jarvis/system/status service breakdown; mounted App.jsx; build verified]
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). [2026-09-12: CommandHistory.jsx; persists last 50 commands in localStorage; replay on click; mounted App.jsx; build verified]
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. [2026-09-12: MultiVoiceToggle.jsx; cycles ash/fable/onyx; updates TTS requests; mounted App.jsx; build verified]
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. [2026-09-12: SceneAutoTour.jsx; navigates scenes 01–10 on interval; TTS narration via /v1/voice/tts; mounted App.jsx; build verified]
- [x] F31 Attention nudge — after 5 min idle, fetches /entities/Task + /entities/RiskSignal, speaks via /v1/voice/tts. [2026-09-12: AttentionNudge.jsx; ⚠ NUDGE toggle top-right; resets on jarvis:ask; off by default; isNudgeQuery wired in JarvisBrain; Vite build exit 0]
- [x] F32 Vitals Dashboard — /v1/vitals/latest + /v1/vitals/trend; HR/HRV/SpO2/steps/sleep/weight stat tiles; per-metric sparklines; ASSESS → /v1/jarvis/agent/chat + TTS. [2026-09-12: VitalsDashboard.jsx already existed; mounted in App.jsx; isVtlsQuery+buildVtlsScript wired in JarvisBrain; jarvis:vtls-toggle event; ⊕ VTLS button; Vite build exit 0]
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
