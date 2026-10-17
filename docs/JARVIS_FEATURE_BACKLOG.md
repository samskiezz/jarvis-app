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
- [x] F01 ⌘K command palette — searchable list of every JARVIS command; Enter runs it. [2026-10-17] CommandPalette.jsx wired in App.jsx: ⌘K/Ctrl+K opens palette listing all cinematic scenes + APEX pages, arrow-key navigation, Enter to navigate, Esc to close — build verified.
- [x] F02 "Hey JARVIS" wake word (always-listening toggle) → opens the assistant. [2026-10-17] HeyJarvisListener.jsx uses browser SpeechRecognition API (createVoice), arms/disarms on toggle, dispatches jarvis:ask to open JarvisBrain; WakeWordToggle UI; build verified.
- [x] F03 Live telemetry ticker (top bar) — real CPU/mem/load from /v1/jarvis/system/status + brain nodes/synapses from /v1/cinematic/brain, refreshing. [2026-10-17] LiveTelemetryTicker.jsx polls both endpoints every 30 s; fixed 22 px strip at top; colour-coded CPU/MEM/LOAD pills; hides until first data; mounted in App.jsx line 618. Build verified (exit 0).
- [x] F04 Keyboard scene-jump (keys 1–0 → the 10 scenes); Esc → home selector. [2026-10-17] SceneKeyboardNav.jsx: global keydown listener maps 1–9/0 to the 10 cinematic scene routes via useNavigate, Esc → /, ignores input focus, shows centred HUD badge 1.6 s. Mounted App.jsx:547. Build verified (exit 0).
- [x] F05 Spoken status report — "JARVIS, status" → reads real system+brain numbers aloud (TTS). [2026-10-17] SpokenStatusReport.jsx: isStatusQuery + buildStatusScript fetch /v1/jarvis/system/status + /v1/cinematic/brain; composes spoken sentence with real CPU/MEM/load/nodes/synapses; wired in JarvisBrain.jsx. Build verified (exit 0).
- [x] F06 Live World incident feed — /functions/getLiveIntel earthquakes → scrolling list + globe pins. [2026-10-17] WorldIncidentFeed.jsx: mini Three.js globe with colour-coded earthquake pins + scrolling seismic list, M5+/M6+ stat filters, 60-s auto-refresh from /functions/getLiveIntel; mounted App.jsx:549. Build verified (exit 0).
- [x] F07 Markets ticker — getLiveIntel crypto + FX → live ticker; "JARVIS, markets" speaks top movers. [2026-10-17] MarketsTicker.jsx: scrolling bottom strip from /functions/getLiveIntel markets; expanded grid on click or "JARVIS markets" voice intent; isMarketsQuery + buildMarketsScript in JarvisBrain; mounted App.jsx:551. Build verified (exit 0).
- [x] F08 Entity quick-search — query /v1/graph + IntelProfile entities; JARVIS speaks a one-line dossier. [2026-10-17] EntityQuickSearch.jsx: Ctrl+Shift+E or "JARVIS find X" opens floating panel; queries /v1/graph/subgraph + /entities/IntelProfile with debounced search; clicking a result dispatches jarvis:speak-dossier; added jarvis:speak-dossier listener in JarvisBrain so TTS fires on result click; build verified (exit 0).
- [x] F09 Risk board — /entities/RiskSignal → severity-sorted cards; red pulse on critical. [2026-10-17] RiskBoard.jsx (already mounted in App.jsx) wired voice intent isRiskQuery+buildRiskScript into JarvisBrain.jsx; "JARVIS risks" now speaks severity summary and opens board; build verified (exit 0).
- [x] F10 Task board — /entities/Task → live mission cards with status. [2026-10-17] TaskBoard.jsx status-sorted mission cards (in_progress/pending/blocked/done) fetching /entities/Task; "JARVIS, tasks/missions" voice intent speaks live summary; mounted App.jsx; build verified (exit 0).
- [x] F11 Datasets browser — /v1/datasets → catalog list with row counts. [2026-10-17] DatasetsBrowser.jsx wired in App.jsx + JarvisBrain isDatasetsQuery/buildDatasetsScript: floating ⬡ DATA panel with filter, row counts, type/status badges, 120-s auto-refresh; "JARVIS datasets" speaks catalog count + top names; build verified (exit 0).
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
