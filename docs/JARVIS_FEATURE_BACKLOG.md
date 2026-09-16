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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-09-16: CommandPalette.jsx mounted in App.jsx; scenes + JARVIS pages; ⌘K opens, Enter navigates; build green]
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-09-16: HeyJarvisListener.jsx + WakeWordToggle.jsx + jarvisVoice.js + jarvisSound.js; mounted in App.jsx; Web SpeechRecognition wake-word loop; build green]
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-09-16: LiveTelemetryTicker.jsx polls both endpoints every 30 s; fixed top bar with Pill metrics; mounted in App.jsx; build green]
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-09-16: SceneKeyboardNav.jsx mounted in App.jsx; 1–9/0 → /cinematic/{id} via CINEMATIC_SCENES; Esc → /; HUD badge confirms jump; build green]
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-09-16: StatusReporter.jsx (HUD card) wired to jarvis:status event dispatched by JarvisBrain; TTS spoken via JarvisBrain speak(); real /v1/jarvis/system/status + /v1/cinematic/brain; build green]
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-09-16: LiveWorldIncidentFeed.jsx wired to getLiveIntel({type:"all"}) via backendFunctions; SVG globe + magnitude-scaled pins + scrolling sorted list; ⚡ QUAKES toggle; voice intent INTENT_RE; mounted in App.jsx line 1220; build green (exit 0)]
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-09-16: MarketsTicker.jsx scrolling strip + isMarketsQuery/buildMarketsScript wired into JarvisBrain; mounted App.jsx line 1142; build green (exit 0)]
- [x] F08 Entity quick-search — 2026-09-16 — EntityQuickSearch.jsx mounted in App.jsx; Ctrl+Shift+E or "JARVIS, find X"; queries /v1/graph/subgraph + /entities/IntelProfile; already implemented on branch.
- [x] F09 Risk board — 2026-09-16 — RiskBoard.jsx mounted; /entities/RiskSignal severity-sorted + red pulse on critical; already implemented on branch.
- [x] F10 Task board — 2026-09-16 — TaskBoard.jsx mounted; /entities/Task live mission cards; already implemented on branch.
- [x] F11 Datasets browser — 2026-09-16 — DatasetsBrowser.jsx mounted; /v1/datasets catalog with row counts; already implemented on branch.
- [x] F12 Investigations list — 2026-09-16 — InvestigationsList.jsx mounted; /v1/investigations open cases; already implemented on branch.
- [x] F13 Scenario launcher — 2026-09-16 — ScenarioLauncher.jsx mounted; /v1/scenario/list pick + run; already implemented on branch.
- [x] F14 Document search — 2026-09-16 — DocumentSearch.jsx mounted; /v1/reports + /knowledge/*; already implemented on branch.
- [x] F15 Skill scorecard — 2026-09-16 — SkillScorecard.jsx mounted; /v1/aip/skill live metrics; already implemented on branch.
- [x] F16 Brain-growth sparkline — 2026-09-16 — BrainGrowthSparkline.jsx mounted; /v1/cinematic/brain poll; already implemented on branch.
- [x] F17 Per-scene anchor drill-down — 2026-09-16 — SceneAnchorDrillDown.jsx + PerSceneAnchorDrillDown.jsx both mounted; already implemented on branch.
- [x] F18 JARVIS boot sequence — 2026-09-16 — JarvisBootSequence.jsx mounted; real system+brain counts + TTS; already implemented on branch.
- [x] F19 Ambient reactor hum toggle — 2026-09-16 — AmbientReactorHum.jsx mounted; WebAudio loop; already implemented on branch.
- [x] F20 "Show me" navigation — 2026-09-16 — wired resolveShowMeQuery() from ShowMeNavigation.jsx into JarvisBrain.ask() as silent pre-router; "show me X"/"open X"/"view X" now normalize before SCENE_INTENTS/panel-intent dispatch; <ShowMeNavigation /> mounted in App.jsx; build green.
- [x] F21 Live clock + uptime — 2026-09-16 — LiveClockUptime.jsx mounted; /v1/jarvis/system/status 30-s poll; already implemented on branch.
- [x] F22 Alert toasts — 2026-09-16 — AlertToasts.jsx mounted; polls /v1/ops alerts; CRITICAL spoken; already implemented on branch.
- [x] F23 Investment/wealth widget — 2026-09-16 — InvestmentWidget.jsx mounted; /entities/Investment; already implemented on branch.
- [x] F24 Contacts directory — 2026-09-16 — ContactsDirectory.jsx mounted; /entities/Contact searchable; already implemented on branch.
- [x] F25 Swarm jobs monitor — 2026-09-16 — SwarmJobsMonitor.jsx mounted; /entities/SwarmJob 20-s poll; already implemented on branch.
- [x] F26 Graph centrality view — 2026-09-16 — GraphCentralityView.jsx mounted; /v1/graph/centrality; already implemented on branch.
- [x] F27 "Diagnostics" — 2026-09-16 — ServiceDiagnostics.jsx mounted; /v1/jarvis/system/status per-service health; already implemented on branch.
- [x] F28 Command history — 2026-09-16 — CommandHistory.jsx mounted; localStorage max 50; replay + filter; already implemented on branch.
- [x] F29 Multi-voice toggle — 2026-09-16 — MultiVoiceToggle.jsx mounted; ash/fable/onyx; localStorage; already implemented on branch.
- [x] F30 Scene auto-tour — 2026-09-16 — SceneAutoTour.jsx mounted; cycles 10 scenes with TTS narration; already implemented on branch.
- [x] F31 Ops Event Gap Finder — 2026-09-16 — OpsEventGapFinder.jsx mounted; /v1/ops/events × /v1/investigations; COVERED/UNCOVERED classification; red pulse on critical gaps; ▶ ASSESS → /v1/jarvis/agent/chat + TTS; isOegapQuery+buildOegapScript wired in JarvisBrain; build green (exit 0).
- [x] F32 Report × Investigation Coverage — 2026-09-16 — ReportInvCoverage.jsx; /v1/reports × /v1/investigations; SUPPORTING/UNLINKED classification + dark-case count (investigations with no report); red pulse on dark cases; ▶ ASSESS → /v1/jarvis/agent/chat + TTS; isRinvQuery+buildRinvScript wired in JarvisBrain; ◈ RINV button left:989420; build green (exit 0).
- [x] F33 RiskSignal × Dataset × Knowledge Intelligence Depth — 2026-09-16 — RiskSignalDatasetKnowledgeDepth.jsx mounted in App.jsx; /entities/RiskSignal × /v1/datasets × /knowledge/; DEEP_INTEL/DATA_ONLY/KB_ONLY/SHALLOW; red pulse on SHALLOW; isRdkidepQuery+buildRdkidepScript wired JarvisBrain; build green (exit 0).
- [x] F34 Scenario × IntelProfile Blind Spots — 2026-09-16 — ScenarioIntelBlindSpots.jsx mounted in App.jsx; /v1/scenario/list × /entities/IntelProfile; COVERED/BLIND_SPOT + orphan intel panel; red pulse on BLIND SPOTS; isSipbsQuery+buildSipbsScript wired JarvisBrain; build green (exit 0).
- [x] F35 Contact × Investigation × Report Mission Dossier — 2026-09-16 — ContactInvestigationReportDossier.jsx; /entities/Contact × /v1/investigations × /v1/reports; FULLY_DOCUMENTED/INVESTIGATED/REPORTED/DARK; red pulse on DARK; split-pane expand left=investigations right=reports; isCirdossQuery+buildCirdossScript wired JarvisBrain; ◈ CIRDOSS button left:992000 zIndex:140; build green (exit 0).
- [x] F36 Contact × Dataset × RiskSignal Personnel Data Risk Matrix — 2026-09-16 — ContactDatasetRiskMatrix.jsx (new); /entities/Contact × /v1/datasets × /entities/RiskSignal; FULLY_EXPOSED/DATA_EXPOSED/RISK_EXPOSED/CLEAR; orange pulse on FULLY_EXPOSED; isCdrmatQuery+buildCdrmatScript wired JarvisBrain; ◈ CDRMAT button left:928960 zIndex:624; build green (exit 0).
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
