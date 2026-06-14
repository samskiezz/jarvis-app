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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-06-14] GlobalCommandPalette.jsx mounts in App.jsx; covers cinematic+home routes (AppLayout already owns /apex); lists 10 scenes + all APEX pages + global nav + JARVIS ask fallback; vite build green.
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-06-14] HeyJarvisListener.jsx mounts in App.jsx; uses createVoice() wake-word engine + WakeWordToggle pill UI; armed state starts reactor hum; on detection dispatches jarvis:ask to open JarvisBrain; no-ops on unsupported browsers; vite build green.
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-06-14] TelemetryTicker.jsx polls both endpoints every 15s; displays CPU/MEM/LOAD/NODES/SYN inline in Layout.jsx sticky top strip; vite build green.
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-06-14] SceneKeyboardNav.jsx (pre-built) mounted in App.jsx; 1–9 jump to scenes 01–09, 0 → scene 10, Esc → /; HUD badge confirms jump; ignored while typing; vite build green.
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-06-14] SpokenStatusReport.jsx (isStatusQuery + buildStatusScript) wired in JarvisBrain.jsx; fetches /v1/jarvis/system/status + /v1/cinematic/brain; speaks CPU/mem/load/nodes/synapses via /v1/voice/tts; verified present in codebase.
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-06-14] WorldIncidentFeed.jsx mounted in App.jsx; mini Three.js globe with earthquake pins + scrolling list; polls getLiveIntel every 60s; bottom-left INCIDENTS toggle; vite build exit 0.
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-06-14] Mounted MarketsTicker.jsx in App.jsx; scrolling bottom strip + expandable grid; voice handled by JarvisBrain (isMarketsQuery/buildMarketsScript already wired); vite build exit 0.
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. (2026-06-14: EntityQuickSearch.jsx mounted in App.jsx; Ctrl+Shift+E or "JARVIS, find <term>" triggers panel; /v1/graph/subgraph + /entities/IntelProfile; click result speaks dossier via jarvis:speak-dossier → JarvisBrain TTS; vite build exit 0)
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. [2026-06-14] RiskBoard.jsx (pre-built, fully wired) mounted in App.jsx; polls /entities/RiskSignal every 90s; severity-sorted cards (critical/high/medium/low); red pulse animation on criticals; RISKS toggle button + "JARVIS, risks" voice trigger; isRiskQuery/buildRiskScript already imported in JarvisBrain; vite build exit 0.
- [x] F10 Task board — /entities/Task → live mission cards with status. [2026-06-14] TaskBoard.jsx mounted in App.jsx; polls /entities/Task every 90s; status-sorted cards (in_progress/pending/blocked/completed); filter tabs; "JARVIS, tasks" voice trigger; due-date overdue highlighting; isTaskQuery/buildTaskScript exports; vite build exit 0.
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. [2026-06-14] DatasetsBrowser.jsx (pre-built) mounted in App.jsx; polls /v1/datasets every 120s; catalog cards with row counts, filter input, total records bar; button left:420 (after TASKS at 286); "JARVIS, datasets" voice trigger; vite build exit 0.
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
