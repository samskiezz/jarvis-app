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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. (2026-07-10: verified implemented in src/components/cinematic/CommandPalette.jsx, mounted in App.jsx; build passes)
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. (2026-07-10: HeyJarvisListener.jsx uses real SpeechRecognition API + Web Audio sounds; WakeWordToggle pill button fixed-positioned; dispatches jarvis:ask custom event; mounted in App.jsx; build EXIT:0)
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. (2026-07-10: LiveTelemetryTicker.jsx 30 s dual-poll, colour-coded pills cpu/mem/load/nodes/synapses, fixed top-bar strip z-index 19000, mounted in App.jsx; build EXIT:0)
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. (2026-07-11: SceneKeyboardNav.jsx uses keydown listener mapped via CINEMATIC_SCENES; ignores input/textarea focus; shows brief centre-screen HUD badge on jump; mounted in App.jsx; build EXIT:0)
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). (2026-07-11: StatusReporter.jsx + SpokenStatusReport.jsx already implemented; wired isStatusQuery import + jarvis:status dispatch into JarvisBrain.jsx ask() so "status"/"diagnostic"/"system report" queries route to StatusReporter which fetches /v1/jarvis/system/status + /v1/cinematic/brain and speaks via /v1/voice/tts; build EXIT:0)
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. (2026-07-11: WorldIncidentFeed.jsx — Three.js mini-globe with lat/lng pins colour-coded by magnitude + scrolling seismic incident list; polls /functions/getLiveIntel every 60 s; badge count; jarvis:ask "incident/seismic/quake" voice trigger; mounted in App.jsx; build EXIT:0)
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. (2026-07-11: MarketsTicker.jsx scrolling strip + grid already mounted in App.jsx; wired isMarketsQuery/buildMarketsScript into JarvisBrain.jsx ask() so "market/crypto/bitcoin/fx/mover" queries fetch real getLiveIntel data and speak top movers via TTS; MarketsTicker also auto-expands grid on jarvis:ask; build EXIT:0)
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (2026-07-11: EntityQuickSearch.jsx already existed + mounted in App.jsx; wired isEntitySearchQuery/extractEntitySearchTerm/buildEntityDossierScript into JarvisBrain.jsx ask() so "search/find/who is <term>" voice queries dispatch jarvis:entity-search, open the panel, fetch real /v1/graph/subgraph + /entities/IntelProfile, and speak a one-line dossier via TTS; added jarvis:speak-dossier listener so clicking a result card also speaks; build EXIT:0)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. (2026-07-11: RiskBoard.jsx already existed + mounted in App.jsx; wired isRiskQuery/buildRiskScript into JarvisBrain.jsx ask() so "risk/signal/critical/threat" voice queries open the panel and speak a severity summary via TTS; build EXIT:0)
- [x] F10 Task board — /entities/Task → live mission cards with status. (2026-07-11: TaskBoard.jsx already existed + mounted in App.jsx; wired isTaskQuery/buildTaskScript into JarvisBrain.jsx ask() so "task/mission/todo/objective" voice queries open the panel and speak a task summary via TTS; build EXIT:0)
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. (2026-07-11: wired isDatasetsQuery/buildDatasetsScript from DatasetsBrowser.jsx into JarvisBrain.jsx ask() so "dataset/catalog/ingest/pipeline" voice queries open the panel and speak a catalog summary via TTS; build EXIT:0)
- [x] F12 Investigations list — /v1/investigations → open cases panel. (2026-07-11: wired isInvestigationsQuery/buildInvestigationsScript from InvestigationsList.jsx into JarvisBrain.jsx ask(); "investig/case/open.case/operation/inquiry" voice queries open the INTEL panel and speak a case brief via TTS; InvestigationsList already mounted in App.jsx polling /v1/investigations every 120 s; build EXIT:0)
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. (2026-07-11: wired isScenarioQuery/buildScenarioScript into JarvisBrain.jsx ask(); ScenarioLauncher.jsx polls /v1/scenario/list every 120 s + POST /v1/scenario/{id}/run + shows outcome; SIM toggle button + filter panel; already mounted in App.jsx; voice "scenario/simulation/predict/playbook/drill" opens panel and speaks brief via TTS; build EXIT:0)
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. (2026-07-11: DocumentSearch.jsx was already implemented + mounted in App.jsx; wired isDocumentQuery/buildDocumentScript into JarvisBrain.jsx ask() so "document/report/knowledge/vault/dossier/brief/paper/file" voice queries open the DOCS panel and speak a vault brief via TTS; build EXIT:0)
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. (2026-07-11: SkillScorecard.jsx already existed + mounted in App.jsx; wired isSkillQuery/buildSkillScript into JarvisBrain.jsx ask() so "skill/scorecard/aip/capability" voice queries open the panel and speak a metrics brief via TTS; polls /v1/aip/skill every 60 s; score bars, level badges, filter input; build EXIT:0)
- [ ] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time.
- [ ] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only).
- [ ] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts.
- [ ] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant.
- [ ] F20 "Show me" navigation — already in JarvisBrain; extend keyword map to data drill (e.g. "show risks").
- [ ] F21 Live clock + uptime (real process uptime from system status).
- [ ] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken).
- [ ] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout.
- [ ] F24 Contacts directory — /entities/Contact → searchable people list.
- [ ] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress.
- [ ] F26 Graph centrality view — /v1/graph/centrality → top entities by influence.
- [ ] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status).
- [ ] F28 Command history — store + replay recent JARVIS commands (localStorage).
- [ ] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live.
- [ ] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each.
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
