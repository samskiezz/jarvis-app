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
- [ ] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS).
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
- [x] F20 "Show me" navigation — ShowMeRouter.jsx wires capture-phase jarvis:ask intercept; re-dispatches normalized panel queries from ShowMeNavigation map; mounted in App.jsx (2026-07-06).
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
