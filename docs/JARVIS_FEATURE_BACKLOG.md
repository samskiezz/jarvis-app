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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. *(2026-06-08 — already implemented in CommandPalette.jsx + wired in Layout.jsx; marked done)*
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. *(2026-06-08 — WakeWordToggle.jsx pill next to orb; onWake now opens panel; disarmWake added; build PASSED)*
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. *(2026-06-08 — TelemetryTicker.jsx polls both endpoints every 15s; mounted in Layout.jsx top strip; build PASSED)*
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. *(2026-06-08 — SceneKeyboardNav.jsx: global keydown 1-9/0/Esc, guards inputs, flashes HUD badge; mounted in JarvisBrain; build PASSED)*
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). *(2026-06-09 — SpokenStatusReport.jsx: isStatusQuery + buildStatusScript fetch /v1/jarvis/system/status + /v1/cinematic/brain, format spoken text, wired in JarvisBrain.ask(); build PASSED)*
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. *(2026-06-09 — WorldIncidentFeed.jsx: floating panel with mini Three.js globe + earthquake pins + scrolling seismic list; auto-refreshes every 60s; mounted in App.jsx; build PASSED)*
- [x] F07 Markets ticker — getLiveIntel crypto + FX → scrolling bottom-strip ticker; "JARVIS, markets" speaks top movers via isMarketsQuery + TTS early-return in JarvisBrain; expandable grid panel; build PASSED. *(2026-06-09)*
- [x] F08 Entity quick-search — query /v1/graph/subgraph + /entities/IntelProfile; floating search panel (Ctrl+Shift+E or "JARVIS, find X"); click a result to hear a one-line dossier via TTS; isEntitySearchQuery early-return wired in JarvisBrain; jarvis:speak-dossier event loop for panel → voice; build PASSED. *(2026-06-09)*
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards (critical/high/medium/low) with red pulse on critical; severity filter tabs; "JARVIS, risks" opens board via isRiskQuery + buildRiskScript TTS; mounted in App.jsx; build PASSED. *(2026-06-09)*
- [x] F10 Task board — /entities/Task → CRUD task board with kanban columns (TODO/IN_PROGRESS/DONE), new-task form, stat tiles; registered as TaskManager in pageRegistry.js jarvis group. *(2026-06-08)*
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts, filter input, row-count badges; "JARVIS, datasets" intent wired in JarvisBrain; DATA toggle button bottom-left strip; build PASSED. *(2026-06-09)*
- [x] F12 Investigations list — /v1/investigations → open cases panel; status-sorted cards (open/in-progress/pending/closed), priority badge, lead/assignee, filter input; "JARVIS, investigations" opens panel + TTS brief via isInvestigationsQuery in JarvisBrain; INTEL toggle button bottom-left strip; build PASSED. *(2026-06-09)*
- [x] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome. *(2026-06-09 — ScenarioLauncher.jsx: floating panel lists /v1/scenario/list; ▶ RUN button POSTs to /v1/scenario/{id}/run + shows outcome inline; isScenarioQuery TTS brief wired in JarvisBrain; SIM toggle bottom-left strip; build PASSED)*
- [x] F14 Document search — /v1/reports + /knowledge/* → combined catalog panel; src-filter tabs; search input; click → JARVIS TTS summary; isDocumentQuery wired in JarvisBrain; DOCS toggle bottom-left; build PASSED. *(2026-06-09)*
- [x] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live. *(2026-06-09 — SkillScorecard.jsx: floating panel fetches /v1/aip/skill, shows score bars + level badges + filter input; avg score in header; isSkillQuery + buildSkillScript TTS brief wired in JarvisBrain; SKILLS toggle at left:700 bottom-left; auto-refreshes every 60s; mounted in App.jsx; build PASSED)*
- [x] F16 Brain-growth sparkline — poll /v1/cinematic/brain → live nodes/synapses chart over time. *(2026-06-09 — BrainGrowthSparkline.jsx: floating panel with rolling 40-point AreaChart sparklines for nodes+synapses; BRAIN toggle at left:804; isBrainQuery+buildBrainScript TTS brief wired in JarvisBrain; auto-polls every 30s; mounted in App.jsx; build PASSED)*
- [x] F17 Per-scene anchor drill-down — click an anchor readout → expanded real detail (read-only). *(2026-06-09 — SceneAnchorDrillDown.jsx: detects /cinematic/:sceneId from URL, fetches /v1/cinematic/scene/{id}, lists all anchors as clickable rows; selected anchor expands into recursive field/array tree (read-only); isAnchorQuery+buildAnchorScript TTS brief wired in JarvisBrain; ⚓ ANCHORS toggle at left:908 bottom-left + Alt+A shortcut; build PASSED)*
- [x] F18 JARVIS boot sequence — first load plays a short spoken "all systems online" with the real counts. *(2026-06-09 — JarvisBootSequence.jsx: sessionStorage-gated cinematic overlay fetches /v1/jarvis/system/status + /v1/cinematic/brain, animates real counts line-by-line, speaks "JARVIS online" via /v1/voice/tts on user click; mounted in App.jsx; build PASSED)*
- [x] F19 Ambient reactor hum toggle — WebAudio loop; on/off in the assistant. *(2026-06-09 — AmbientReactorHum.jsx: 60Hz sawtooth + 120Hz harmonic + 30Hz sub-bass + bandpass noise + LFO tremolo; ◇ HUM toggle at left:1012 bottom strip; isAmbientQuery + jarvis:ambient-toggle wired in JarvisBrain; build PASSED)*
- [x] F20 "Show me" navigation — ShowMeNavigation.jsx exports isShowMeQuery+resolveShowMeQuery; JarvisBrain.ask() pre-routes "show/open/view X" to normalized jarvis:ask before overlay opens, covering all 10 panels (risks/markets/datasets/investigations/scenarios/docs/skills/brain/anchors/status); build PASSED. *(2026-06-09)*
- [x] F21 Live clock + uptime (real process uptime from system status). *(2026-06-09 — LiveClockUptime.jsx: ticking clock (1s interval) + process uptime polled every 30s from /v1/jarvis/system/status; fixed bottom-left display; isClockQuery+buildClockScript TTS wired in JarvisBrain; mounted in App.jsx; build PASSED)*
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
