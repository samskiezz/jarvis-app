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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-08-19: CommandPalette.jsx implemented & mounted in App.jsx; lists all PAGES + 10 cinematic scenes; ⌘K/Ctrl+K, ↑↓, Enter, Esc; build verified]
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-08-19: HeyJarvisListener.jsx implemented & mounted in App.jsx; uses Web SpeechRecognition to detect "JARVIS" wake word; dispatches jarvis:ask event to open JarvisBrain; WakeWordToggle UI; ambient hum while armed; build verified exit:0]
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-08-19: LiveTelemetryTicker.jsx implemented & mounted in App.jsx; 30 s polling both endpoints; colour-coded CPU/MEM/LOAD pills + NODES/SYNAPSES; hides until first data; build verified exit:0]
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-08-19: SceneKeyboardNav.jsx implemented & mounted in App.jsx; digits 1-9 jump scenes 01-09, 0 jumps scene 10, Esc navigates to /; shows HUD badge; ignores keypresses in inputs; build verified exit:0]
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-08-19: StatusReporter.jsx + SpokenStatusReport.jsx implemented & mounted in App.jsx; fetches /v1/jarvis/system/status + /v1/cinematic/brain; composes spoken text + TTS via /v1/voice/tts; HUD card auto-dismisses after 14 s; build verified]
- [ ] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins.
- [ ] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers.
- [ ] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier.
- [ ] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical.
- [ ] F10 Task board — /entities/Task → live mission cards with status.
- [ ] F11 Datasets browser — /v1/datasets → catalog list with row counts.
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
- [x] F31 Morning Mission Brief — ◎ MBRIEF button; parallel-fetches /entities/Task + /entities/RiskSignal + /v1/ops/events + /v1/investigations; AI-narrated 4–6 sentence mission brief via /v1/jarvis/agent/chat; brief history (last 5 stored); speaks via jarvis:speak-dossier; "mission brief / morning brief / mbrief" voice trigger. [2026-08-19: MorningMissionBrief.jsx mounted in App.jsx; isMBriefQuery+buildMBriefScript wired in JarvisBrain.jsx; build verified exit:0]
(Extend with more real features as endpoints allow. Prefer depth + real over count.)
