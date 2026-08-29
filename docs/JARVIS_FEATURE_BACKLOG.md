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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (already implemented in CommandPalette.jsx + App.jsx; verified 2026-08-28)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (already implemented in HeyJarvisListener.jsx + App.jsx; verified 2026-08-28)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (already implemented in LiveTelemetryTicker.jsx + App.jsx; verified 2026-08-28)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (already implemented in SceneKeyboardNav.jsx + App.jsx; verified 2026-08-28)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (wired SpokenStatusReport into JarvisBrain.ask() on 2026-08-28; isStatusQuery() intercepts status/diagnostic queries → buildStatusScript() hits /v1/jarvis/system/status + /v1/cinematic/brain → TTS)
- [x] F06 Live World incident feed — WorldIncidentFeed.jsx; Three.js mini-globe with lat/lng pins + mag-colour halos + scrolling seismic list; fetches /functions/getLiveIntel every 60s; badge count; jarvis:ask intent wired; mounted App.jsx; vite build exit 0. (verified 2026-08-28)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (2026-08-28: MarketsTicker.jsx pre-implemented; wired isMarketsQuery+buildMarketsScript into JarvisBrain.ask(); mounted in App.jsx; vite build exit 0)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (2026-08-28: EntityQuickSearch.jsx pre-existed; wired isEntitySearchQuery+extractEntitySearchTerm+buildEntityDossierScript into JarvisBrain.ask(); dispatches jarvis:entity-search to open panel; vite build exit 0)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (2026-08-29: RiskBoard.jsx pre-existed with full UI + fetch; wired isRiskQuery+buildRiskScript into JarvisBrain.ask(); "JARVIS, risks" now speaks signal summary + opens board; vite build exit 0)
- [x] F10 Task board — /entities/Task → live mission cards with status. (2026-08-29: TaskBoard.jsx pre-existed with full UI + fetch; wired isTaskQuery+buildTaskScript into JarvisBrain.ask(); "JARVIS, tasks" now speaks mission summary + opens board; vite build exit 0)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (2026-08-29: DatasetsBrowser.jsx + App.jsx mount already present; wired isDatasetsQuery+buildDatasetsScript into JarvisBrain.ask(); "JARVIS, datasets/catalog/pipeline" now speaks dataset count + top names + opens panel; vite build exit 0)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (2026-08-29: InvestigationsList.jsx pre-existed mounted in App.jsx; wired isInvestigationsQuery+buildInvestigationsScript into JarvisBrain.ask(); "JARVIS, investigations/cases" now speaks case count + top names + panel auto-opens; vite build exit 0)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (2026-08-29: ScenarioLauncher.jsx pre-implemented + mounted in App.jsx; wired isScenarioQuery+buildScenarioScript into JarvisBrain.jsx; "JARVIS, scenarios/simulation/forecast" speaks available count + opens SIM panel; vite build exit 0)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (2026-08-29: DocumentSearch.jsx pre-existed + mounted in App.jsx; wired isDocumentQuery+buildDocumentScript into JarvisBrain.ask(); "JARVIS, documents/reports/knowledge" now speaks doc count + recent report names + opens DOCS panel; vite build exit 0)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (2026-08-29: SkillScorecard.jsx pre-existed + mounted in App.jsx; wired isSkillQuery+buildSkillScript into JarvisBrain.jsx; "JARVIS, skills/scorecard/aip/capability" now speaks skill count + top performers + opens SKILLS panel; vite build exit 0)
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. (2026-08-29: BrainGrowthSparkline.jsx pre-existed + mounted in App.jsx; wired isBrainQuery+buildBrainScript into JarvisBrain.ask(); "JARVIS, brain growth/trend" now speaks node/synapse counts + trend; opens sparkline panel; vite build exit 0)
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). (2026-08-29: PerSceneAnchorDrillDown.jsx pre-existed + mounted in App.jsx; added buildAnchorScript() fetching /v1/cinematic/scene/{id} + dispatching jarvis:anchor-drill-toggle; wired isAnchorDrillQuery+buildAnchorScript into JarvisBrain.ask(); "JARVIS, scene anchors/anchor drill/expand scene" speaks anchor count + opens panel; vite build exit 0)
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. (2026-08-29: JarvisBootSequence.jsx pre-implemented + mounted in App.jsx; fetches /v1/jarvis/system/status + /v1/cinematic/brain; cinematic terminal boot lines + "INITIALIZE VOICE" TTS button; sessionStorage guard prevents repeat; vite build exit 0)
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. (2026-08-29: AmbientReactorHum.jsx pre-existed with full WebAudio 60 Hz sawtooth + harmonics + LFO + noise synthesis; wired isAmbientQuery+jarvis:ambient-toggle dispatch into JarvisBrain.ask(); "JARVIS, ambient/hum/reactor hum" now toggles hum on/off + speaks "Toggling ambient reactor hum, sir."; vite build exit 0)
- [x] F20 "Show me" navigation — ShowMeRouter.jsx: isShowMeQuery+buildShowMeScript priority-routes "show [X]" to correct panel script; wired into JarvisBrain.ask() before all other checks; null default export satisfies App.jsx mount; vite build exit 0. (2026-08-29)
- [x] F21 Live clock + uptime (real process uptime from system status). (2026-08-29: LiveClockUptime.jsx pre-existed + mounted in App.jsx; wired isClockQuery+buildClockScript into JarvisBrain.ask(); "JARVIS, time/uptime/clock" now speaks current time + process uptime from /v1/jarvis/system/status; vite build exit 0)
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). (2026-08-29: AlertToasts.jsx pre-implemented + mounted in App.jsx; wired isAlertQuery+buildAlertScript into JarvisBrain.ask(); "JARVIS, alerts/warnings/critical alerts" now speaks open-alert summary + dispatches jarvis:alerts-toggle; vite build exit 0)
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. (2026-08-29: InvestmentWidget.jsx pre-implemented + mounted in App.jsx; wired isInvestmentQuery+buildInvestmentScript into JarvisBrain.ask(); "JARVIS, investments/portfolio/wealth/holdings" now speaks holding count + total value + top positions; panel auto-opens via jarvis:ask INVEST_RE listener; vite build exit 0)
- [x] F24 Contacts directory — /entities/Contact → searchable people list. (2026-08-29: ContactsDirectory.jsx pre-existed with full UI + fetch; wired isContactsQuery+buildContactsScript into JarvisBrain.ask(); "JARVIS, contacts/people/directory" now speaks contact count + top names + panel auto-opens via existing jarvis:ask listener; vite build exit 0)
- [ ] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress.
- [ ] F26 Graph centrality view — /v1/graph/centrality → top entities by influence.
- [ ] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status).
- [ ] F28 Command history — store + replay recent JARVIS commands (localStorage).
- [ ] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live.
- [ ] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each.
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
