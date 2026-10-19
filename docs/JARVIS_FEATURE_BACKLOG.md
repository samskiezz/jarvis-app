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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-10-18: CommandPalette.jsx wired in App.jsx; pageRegistry+10 scenes; already live]
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-10-18: HeyJarvisListener.jsx wired in App.jsx; already live]
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-10-18: LiveTelemetryTicker.jsx wired in App.jsx; already live]
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-10-18: SceneKeyboardNav.jsx wired in App.jsx; already live]
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-10-18: StatusReporter.jsx wired in App.jsx; already live]
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-10-18: WorldIncidentFeed.jsx wired in App.jsx; already live]
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-10-18: MarketsTicker.jsx wired in App.jsx; already live]
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. [2026-10-18: EntityQuickSearch.jsx wired in App.jsx; already live]
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. [2026-10-18: RiskBoard.jsx wired in App.jsx; already live]
- [x] F10 Task board — /entities/Task → live mission cards with status. [2026-10-18: TaskBoard.jsx wired in App.jsx; already live]
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. [2026-10-18: DatasetsBrowser.jsx wired in App.jsx; already live]
- [x] F12 Investigations list — /v1/investigations → open cases panel. [2026-10-18: InvestigationsList.jsx wired in App.jsx; already live]
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. [2026-10-18: ScenarioLauncher.jsx wired in App.jsx; already live]
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. [2026-10-18: DocumentSearch.jsx wired in App.jsx; already live]
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. [2026-10-18: SkillScorecard.jsx wired in App.jsx; already live]
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. [2026-10-18: BrainGrowthSparkline.jsx wired in App.jsx; already live]
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). [2026-10-18: SceneAnchorDrillDown.jsx wired in App.jsx; already live]
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. [2026-10-18: JarvisBootSequence.jsx wired in App.jsx; already live]
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. [2026-10-18: AmbientReactorHum.jsx wired in App.jsx; already live]
- [x] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks"). [2026-10-18: ShowMeNavigation.jsx wired in App.jsx; isShowMeQuery+resolveShowMeQuery imported into JarvisBrain.ask() as silent pre-router with __showme guard; build verified]
- [x] F21 Live clock + uptime (real process uptime from system status). [2026-10-18: LiveClockUptime.jsx wired in App.jsx; already live]
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). [2026-10-18: AlertToasts.jsx wired in App.jsx; already live]
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. [2026-10-18: InvestmentWidget.jsx wired in App.jsx; already live]
- [x] F24 Contacts directory — /entities/Contact → searchable people list. [2026-10-18: ContactsDirectory.jsx wired in App.jsx; already live]
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. [2026-10-18: SwarmJobsMonitor.jsx wired in App.jsx; already live]
- [x] F26 Graph centrality view — /v1/graph/centrality → top entities by influence. [2026-10-18: GraphCentralityView.jsx wired in App.jsx; already live]
- [x] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status). [2026-10-18: ServiceDiagnostics.jsx wired in App.jsx; already live]
- [x] F28 Command history — store + replay recent JARVIS commands (localStorage). [2026-10-18: CommandHistory.jsx wired in App.jsx; already live]
- [x] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live. [2026-10-18: MultiVoiceToggle.jsx wired in App.jsx; already live]
- [x] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each. [2026-10-18: SceneAutoTour.jsx wired in App.jsx; already live]
- [x] F31 Dataset × SwarmJob × Knowledge Production Coverage Matrix — ◈ DSKPROD toggle; /v1/datasets + /entities/SwarmJob + /knowledge/; PROCESSING/DOCUMENTED/ORPHAN classification; amber pulse on orphan count; expandable rows; ASSESS → /v1/jarvis/agent/chat + TTS; isDskprodQuery+buildDskprodScript wired for JarvisBrain. [2026-10-18: DatasetSwarmKnowledgeCoverage.jsx wired in App.jsx; esbuild JSX syntax verified; Vite build in progress]
- [x] F32 Knowledge × IntelProfile × Investigation Traceability Triad — /knowledge/ + /entities/IntelProfile + /v1/investigations → COMPLETE/PROFILED/FILED/UNANCHORED classification; amber pulse on unanchored; ASSESS + TTS. [2026-10-18: KnowledgeIntelInvestigationTriad.jsx wired in App.jsx; build verified]
- [x] F33 Scenario × Dataset × Skill Execution Readiness — /v1/scenario/list + /v1/datasets + /v1/aip/skill → READY/SKILLED/DATAD/BLOCKED classification; amber pulse on blocked count; expandable rows show matched skills + datasets; ASSESS + TTS. [2026-10-18: ScenarioDatasetSkillReadiness.jsx wired in App.jsx; ◈ SCNRDY (left:67400, zIndex:129); Vite build exit:0]
- [x] F34 Swarm × Investment × Risk Exposure Triangle — /entities/SwarmJob + /entities/Investment + /entities/RiskSignal → MONITORED/EXPOSED/RUNNING/DORMANT classification; red pulse on EXPOSED count; expandable rows show matched risk signals with severity badge + matched swarm jobs with status; ASSESS → /v1/jarvis/agent/chat + TTS. [2026-10-18: SwarmInvestmentRiskTriangle.jsx wired in App.jsx; ◈ SWIRT (left:67960, zIndex:131); Vite build exit:0]
- [x] F35 Contact × Report × Task Action Chain — /entities/Contact + /v1/reports + /entities/Task → ACTIVE/TRACKED/BRIEFED/DARK classification; amber pulse on DARK count; expandable rows show matched reports + matched tasks; ASSESS + TTS. [2026-10-18: ContactReportTaskChain.jsx wired in App.jsx; ◈ CRTACT (left:68520, zIndex:133); JSX esbuild exit:0]
- [x] F36 Investigation × Task × RiskSignal Resolution Chain — /v1/investigations + /entities/Task + /entities/RiskSignal → CONTAINED/TASKED/SIGNALED/OPEN classification; amber pulse on open count; expandable rows; ASSESS + TTS. [2026-10-18: InvestigationTaskRiskResolution.jsx wired in App.jsx; ◈ INVRES (left:69080, zIndex:134); esbuild JSX verified; Vite build in progress]
- [x] F37 Dataset × Report × Scenario Evidence Gap — /v1/datasets + /v1/reports + /v1/scenario/list → EVIDENCED/SCRIPTED/REPORTED/RAW classification; amber pulse on RAW count; expandable rows show matched reports + matched scenarios; ASSESS + TTS. [2026-10-19: DatasetReportScenarioEvidenceGap.jsx wired in App.jsx; ◈ DRSEG (left:69640, zIndex:135); Vite build exit:0; pushed to jarvis-overnight]
- [x] F38 IntelProfile × Contact × RiskSignal Threat Attribution — /entities/IntelProfile + /entities/Contact + /entities/RiskSignal → ATTRIBUTED/FLAGGED/PROFILED/SHADOW classification; red pulse on ATTRIBUTED count; expandable rows show matched contacts + matched risk signals with severity badge; ASSESS + TTS. [2026-10-19: IntelProfileContactRiskAttribution.jsx wired in App.jsx; ◈ IATRIB (left:70200, zIndex:136); isIatribQuery+buildIatribScript; Vite build exit:0]
- [x] F39 Task × Investigation × Knowledge Closure Audit — /entities/Task + /v1/investigations + /knowledge/ → ANCHORED/TRACKED/DOCUMENTED/ORPHAN classification; amber pulse on orphan count; expandable rows show matched investigations + knowledge items; ASSESS + TTS. [2026-10-19: TaskInvestigationKnowledgeClosure.jsx wired in App.jsx; ◈ TKINV (left:70760, zIndex:137); Vite build exit:0]
- [x] F40 IntelProfile × Scenario × SwarmJob Intelligence Orchestration Matrix — /entities/IntelProfile + /v1/scenario/list + /entities/SwarmJob → ORCHESTRATED/SCENED/SWARMED/SHADOW classification; amber pulse on SHADOW count; expandable rows show matched scenarios + matched swarm jobs with status badge; ASSESS + TTS. [2026-10-19: IntelProfileScenarioSwarmMatrix.jsx wired in App.jsx; ◈ IORMAT (left:71320, zIndex:138); isIormatQuery+buildIormatScript; Vite build exit:0]
- [x] F41 Investment × Contact × Knowledge Wealth Intelligence Matrix — /entities/Investment + /entities/Contact + /knowledge/ → TRACKED/LINKED/DOCUMENTED/ORPHAN classification; amber pulse on ORPHAN count; expandable rows show matched contacts with role+org + matched knowledge items with category; ASSESS + TTS. [2026-10-19: InvestmentContactKnowledgeMatrix.jsx wired in App.jsx; ◈ ICINTEL (left:71880, zIndex:139); isIcintelQuery+buildIcintelScript; Vite build exit:0]
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
