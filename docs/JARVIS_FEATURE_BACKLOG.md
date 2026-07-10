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
- [x] F166 Morning mission brief (MBRIEF) — parallel-fetches /entities/Task + /entities/RiskSignal + /v1/ops/events + /v1/investigations; AI narrative via /v1/jarvis/agent/chat; speaks via jarvis:speak-dossier; stores last 5 briefs in localStorage; auto-generates on open when stale >4h; "morning brief"/"mission brief"/"mbrief" voice trigger wired in JarvisBrain; build exit 0 (2026-07-06).
- [x] F167 Ops Cases Monitor — /v1/cases (within /v1/ops/*) → status-filtered case board; open-count badge; AI brief via /v1/jarvis/agent/chat + TTS; "ops cases"/"case files" voice trigger; jarvis:opcases-toggle event; 30-s auto-refresh (2026-07-06: OpsCasesMonitor.jsx, mounted).
- [x] F168 Swarm–Risk Coverage Map — parallel-fetches /entities/SwarmJob + /entities/RiskSignal; keyword-correlates active jobs against open risks; COVERED/UNCOVERED split; red badge on uncovered count; per-risk AI assessment via /v1/jarvis/agent/chat + TTS; isSwarmCoverageQuery+buildSwarmCoverageScript wired in JarvisBrain; "swarm coverage"/"risk coverage"/"swarm risk map" voice trigger; jarvis:swarmcoverage-toggle; 60-s auto-refresh (2026-07-06: SwarmRiskCoverageMap.jsx mounted in App.jsx, voice wired in JarvisBrain.jsx).
- [x] F169 Decision Intelligence Completeness Monitor (DICOM) — /v1/decision/list × /v1/reports × /knowledge/; tiers each decision COMPLETE/EVIDENCE-ONLY/KNOW-ONLY/BLIND; amber badge on blind count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isDicomQuery+buildDicomScript wired in JarvisBrain; ◈ DICOM button left:56200; build exit 0 (2026-07-06).
- [x] F170 Graph Node × Investigation Coverage — /v1/graph/centrality × /v1/investigations → INVESTIGATED/UNMONITORED coverage; violet badge; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isGninvQuery+buildGninvScript wired in JarvisBrain; ◈ GNINV button left:56760; 90-s auto-refresh; build exit 0 (2026-07-09).
- [x] F171 Threat Attribution Mapper (TATTR) — /entities/IntelProfile × /entities/RiskSignal → ATTRIBUTED/UNATTRIBUTED risk signals; red badge on unattributed count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isTattrQuery+buildTattrScript wired in JarvisBrain; "threat attribution"/"actor risk"/"tattr" voice trigger; ◈ TATTR button left:57320; 60-s auto-refresh; build exit 0 (2026-07-09).
- [x] F172 Graph Community × Scenario Coverage (GCSCEN) — /v1/graph/communities × /v1/scenario/list → SCENARIO/GAP coverage; red badge on gap count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isGcscenQuery+buildGcscenScript wired in JarvisBrain; "community scenario"/"scenario gap"/"gcscen" voice trigger; ◈ GCSCEN button left:57880; 90-s auto-refresh; build exit 0 (2026-07-09).
- [x] F173 Knowledge × Skill Coverage Gap (KSCOV) — /v1/aip/skill × /knowledge/; keyword-correlates each skill dimension against knowledge articles; COVERED/GAP split; blue badge on gap count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isKscovQuery+buildKscovScript wired in JarvisBrain; "knowledge skills"/"kscov"/"skill coverage" voice triggers; jarvis:kscov-toggle; ◈ KSCOV button left:58440; 90-s auto-refresh; build exit 0 (2026-07-09).
- [x] F174 Ops Alert × Investigation Coverage Tracker (OALINV) — /v1/ops/alerts × /v1/investigations; keyword-correlates each active alert against open investigation cases; INVESTIGATED/UNINVESTIGATED split; orange badge on uninvestigated count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isOalinvQuery+buildOalinvScript wired in JarvisBrain; "alert investigation"/"uninvestigated alerts"/"oalinv" voice triggers; jarvis:oalinv-toggle; ◈ OALINV button left:59000; 60-s auto-refresh; build exit 0 (2026-07-09).
- [x] F175 Graph Node × Intel Profile Coverage (GNINTEL) — /v1/graph/centrality × /entities/IntelProfile → ATTRIBUTED/UNTRACKED split; red badge on untracked count; centrality bar per node; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isGnintelQuery+buildGnintelScript wired in JarvisBrain; "graph intel"/"node threat actor"/"gnintel" voice triggers; jarvis:gnintel-toggle; ◈ GNINTEL button left:59560; 90-s auto-refresh; build exit 0 (2026-07-09).
- [x] F176 Dataset × Risk Signal Coverage (DSRISK) — /v1/datasets × /entities/RiskSignal → IMPLICATED/CLEAR split; amber badge on implicated count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; isDsriskQuery+buildDsriskScript wired in JarvisBrain; "dataset risk"/"dsrisk"/"data exposure"/"risky datasets" voice triggers; jarvis:dsrisk-toggle; ◈ DSRISK button left:60120; 90-s auto-refresh; build exit 0 (2026-07-10).
- [x] F177 Contact × Investment Coverage (CONVIN) — /entities/Contact × /entities/Investment → MANAGED/UNMANAGED split; teal badge on unmanaged count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; "contact investment"/"convin" voice trigger; jarvis:convin-toggle; ◈ CONVIN button left:60680; 90-s auto-refresh; build exit 0 (2026-07-10).
- [x] F178 Report × Investigation Intelligence Bridge (RIIB) — /v1/reports × /v1/investigations → SUPPORTED/BLIND split; amber badge on blind count; ▶ ASSESS via /v1/jarvis/agent/chat + TTS; "report investigation"/"investigation evidence"/"riib"/"unsupported investigations"/"evidence gap" voice trigger; jarvis:riib-toggle; ◈ RIIB button left:61240 zIndex:119; 90-s auto-refresh; build exit 0 (2026-07-10).
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
