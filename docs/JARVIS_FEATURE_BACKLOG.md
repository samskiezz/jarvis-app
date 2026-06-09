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
- [ ] F12 Investigations list — /v1/investigations → open cases panel.
- [ ] F13 Scenario launcher — /v1/scenario/list → pick + run; show outcome.
- [ ] F14 Document search — /v1/reports + /knowledge/* → query → results JARVIS summarizes.
- [ ] F15 Skill scorecard — /v1/aip/skill → the self-improvement metrics, live.
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
