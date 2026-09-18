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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-09-18: CommandPalette.jsx wired in App.jsx; ⌘K/Ctrl+K search across all pages and cinematic scenes; arrow-key + Enter navigation complete]
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-09-18: HeyJarvisListener.jsx mounted in App.jsx; always-listening SpeechRecognition toggle wired to jarvis:ask]
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-09-18: LiveTelemetryTicker.jsx mounted in App.jsx; polls /v1/jarvis/system/status + /v1/cinematic/brain]
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-09-18: SceneKeyboardNav.jsx mounted in App.jsx; keys 1-0 navigate to the 10 cinematic scenes]
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-09-18: wired via JarvisBrain → /v1/jarvis/agent/chat + /v1/voice/tts; "status" keyword triggers spoken report]
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-09-18: WorldIncidentFeed.jsx mounted in App.jsx; polls /functions/getLiveIntel for earthquakes]
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-09-18: MarketsTicker.jsx mounted in App.jsx; polls /functions/getLiveIntel for crypto+FX data]
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. [2026-09-18: EntityQuickSearch.jsx mounted in App.jsx; queries /v1/graph + /entities/IntelProfile]
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. [2026-09-18: RiskBoard.jsx mounted in App.jsx; polls /entities/RiskSignal; critical signals pulse red]
- [x] F10 Task board — /entities/Task → live mission cards with status. [2026-09-18: TaskBoard.jsx mounted in App.jsx; polls /entities/Task for live mission status]
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. [2026-09-18: DatasetsBrowser.jsx mounted in App.jsx; fetches /v1/datasets catalog]
- [x] F12 Investigations list — /v1/investigations → open cases panel. [2026-09-18: InvestigationsList.jsx mounted in App.jsx; fetches /v1/investigations open cases]
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. [2026-09-18: ScenarioLauncher.jsx mounted in App.jsx; fetches /v1/scenario/list; run dispatches to agent]
- [x] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes. [2026-09-18: DocumentSearch.jsx mounted in App.jsx; queries /v1/reports + /knowledge/* endpoints]
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. [2026-09-18: SkillScorecard.jsx mounted in App.jsx; polls /v1/aip/skill for metrics]
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. [2026-09-18: BrainGrowthSparkline.jsx mounted in App.jsx; polls /v1/cinematic/brain for node/synapse counts]
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). [2026-09-18: SceneAnchorDrillDown.jsx mounted in App.jsx; expands anchor data from /v1/cinematic/scene/{id}]
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. [2026-09-18: JarvisBootSequence.jsx mounted in App.jsx; on first load fetches system+brain counts and speaks via /v1/voice/tts]
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. [2026-09-18: AmbientReactorHum.jsx mounted in App.jsx; WebAudio oscillator loop toggled via "ambient" voice command]
- [x] F20 "Show me" navigation — extended keyword map to 100+ data-drill phrases. [2026-09-18: isShowMeQuery+resolveShowMeQuery wired in JarvisBrain.ask() as pre-router; 100+ "show me X" / "open X" / "view X" phrases now directly open matching panels via jarvis:ask re-dispatch; ShowMeNavigation.jsx covers risks, markets, datasets, investigations, contacts, tasks, portfolio, swarm, and more]
- [x] F21 Live clock + uptime (real process uptime from system status). [2026-09-18: LiveClockUptime.jsx mounted in App.jsx; clock ticks every second; polls /v1/jarvis/system/status every 30s for uptime; isClockQuery+buildClockScript wired in JarvisBrain; "JARVIS, time/clock/uptime" speaks current time + uptime]
- [x] F22 Alert toasts — poll /v1/ops alerts → JARVIS announces new criticals (spoken). [2026-09-18] AlertToasts.jsx already mounted (polls /v1/alerts?status=open, auto-TTS criticals); wired isAlertQuery+buildAlertScript into JarvisBrain.ask() so "JARVIS, alerts" speaks live alert summary.
- [x] F23 Investment/wealth widget — /entities/Investment + WealthSnapshot → portfolio readout. [2026-09-18: InvestmentWidget.jsx already mounted in App.jsx; wired isInvestmentQuery+buildInvestmentScript into JarvisBrain.jsx for voice dispatch; "JARVIS, investments/portfolio/wealth" speaks live portfolio brief + opens panel]
- [x] F24 Contacts directory — /entities/Contact → searchable people list. [2026-09-18: ContactsDirectory.jsx already mounted in App.jsx; wired isContactsQuery+buildContactsScript into JarvisBrain.jsx for voice dispatch; "JARVIS, contacts/people/directory" speaks live directory brief + opens panel]
- [x] F25 Swarm jobs monitor — /entities/SwarmJob → running jobs with progress. [2026-09-18: SwarmJobsMonitor.jsx already mounted in App.jsx (polls /entities/SwarmJob every 20s; stat tiles + filter tabs + progress bars; red pulse on failures); wired isSwarmQuery+buildSwarmScript into JarvisBrain.jsx; "JARVIS, swarm" now speaks live job summary via TTS]
- [ ] F26 Graph centrality view — /v1/graph/centrality → top entities by influence.
- [ ] F27 "Diagnostics" — JARVIS reads health of each service (via the dashboard's real status).
- [ ] F28 Command history — store + replay recent JARVIS commands (localStorage).
- [ ] F29 Multi-voice toggle — switch JARVIS TTS voice (ash/fable/onyx) live.
- [ ] F30 Scene auto-tour — cycle the 10 scenes hands-free with spoken narration of each.
- [x] F31 Investigation × Scenario linker — /v1/investigations × /v1/scenario/list; keyword-correlates open cases against scenarios; COVERED/UNCOVERED filter; ▶ ASSESS → agent + TTS; voice: "investigation scenario link". [2026-09-18: InvestigationScenarioLinker.jsx mounted in App.jsx; isInvScenLinkerQuery wired in JarvisBrain for voice dispatch]
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
