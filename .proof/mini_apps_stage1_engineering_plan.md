# MINI-APPS ECOSYSTEM — STAGE 1 · COMPREHENSIVE ENGINEERING PLAN

**Objective:** Every dock app + panel MUST work end-to-end (server/jarvis_live.html + backend in server/dashboard.py + real endpoints). Each invokable by JARVIS voice+text. NO stubs. Real job start-to-finish.

**Scope:** 11 dock apps + 4 glass panels + self-dev bar = 16 interactive features. All wired to REAL backends, all voice-enabled, all accessible (Hawking-class user on mobile/dwell/switch/gaze).

**Standard:** Apple design polish + Google engineering rigor + Meta UX velocity + Palantir ontology depth + NVIDIA graphics fidelity. Production-grade, 2026 SOTA.

---

## CURRENT STATE ANALYSIS

### Fully Wired (SHIPPING)
- **🛰 Live Tasks** (worklist overlay) — Stages 1–5 complete; client fetches /tasks + /swarms + /swarm details; renders live progress bars, pause/resume, cancel; M1–M3 fixes applied ✅
- **🛡 Guardian** (care monitor) — WebRTC iframe to `guardian?room=mum`; overlays open in #ovGuardian; video+consent+health integration (Stage-1 research done, Stage 2-3 queued per [[Care features C2]])
- **🛰 Dock carousel + animation layer** — iOS-style tiles with magnify-on-hover, drag-to-reorder, drag-to-pin from 3D world; persists in localStorage ✅

### Partially Wired (Functions exist, no backends)
- **🎤 Talk** — Focuses `#say` input; `askJarvis()` POSTs `/chat` with history; TTS via `jarvisSpeak()` (synth voice, no real TTS streaming); **NEEDS:** real Claude streaming + professional TTS
- **📚 Library** — `loadLib()` GETs `/library` → renders GLB grid; **NEEDS:** real media pipeline upstream
- **🎨 Image** — `quick('image')` prompts + `runMedia('genimage', prompt)` POSTs `/task?action=genimage` → async; **NEEDS:** real Stable Diffusion / Ideogram integration
- **🧊 3D** — `quick('3d')` prompts + `runMedia('gen3d', prompt)` POSTs `/task?action=gen3d` → async; **NEEDS:** real 3D generation (Tripo3D / similar)
- **☀ Climate** — `flyToBodyByName('climate')` tries to navigate to a 3D body; **NEEDS:** real AirTouch5/Daikin REST API + control UI
- **🤖 Agent OS** — `openAgentTools()` GETs `/agent/tools` → renders card with up to 8 tools; `runAgentTool(name)` POSTs `/agent/run?q=<name>`; **NEEDS:** wired agent tool catalog + execution
- **🩺 Vitals** — `openVitals()` reads `_m.health` from `/metrics` → shows card with alerts + gauges; **NEEDS:** real health scoring + alert engine
- **⚙ Upgrades** — `openUpgrades()` shows hardcoded list (rollback, scheduler, forecaster, approvals, replay); `doUpgrade(key)` POSTs `/upgrade?key=<key>`; **NEEDS:** suggestion engine + proposal reader
- **Status** — Top bar shows health chip (● ONLINE / ⚠ WARN / ⛔ CRITICAL); pulls from `/metrics` → health.level; **NEEDS:** health inference engine

### Fully Wired (Glass Panels)
- **4 Glass Panels** (§1 C) — 3-state toggles (slide-in/mid/full), render `/metrics` data:
  - **pInfra** — GPU VRAM, VPS CPU/RAM/Disk, reachability; **NEEDS:** real health gauge mapping
  - **pPipe** — Runner status (online/offline), CPU%, mem; **NEEDS:** daemon health synthesis
  - **pKnow** — Knowledge build %, topics, entities, growth deltas; **NEEDS:** real completion tracking
  - **pFab** — Inference tier calls, routing; **NEEDS:** real tier instrumentation

### Self-Development Bar
- **#sdev** — GETs `/suggestions` → renders blocks (title+detail+link+BUILD); link opens `/proposal?id=<id>` formatted text; BUILD POSTs `/upgrade?key=<id>` then refreshes; **NEEDS:** suggestion engine

---

## ARCHITECTURE DECISIONS

### 1. Communication Patterns

**Voice Intent Routing** (Preserved)
- User speaks → STT + `askJarvis(text)`
- Intent detection (command shortcuts in askJarvis + A11Y fallback)
- If matched: run directly (e.g., "image of X" → `runMedia('genimage', X)`)
- If not: POST `/chat` with history, stream response, TTS output
- **WIRING:** All dock app opens + major actions MUST have voice shortcuts in askJarvis() OR register as A11Y intents

**Task Dispatch** (Async Operations)
- User action → POST `/task?action=<action>&q=<query>&token=<CT>`
- Returns task ID immediately (enqueues in task_daemon)
- Client polls `/tasks` (part of worklist flow) OR `/taskresult?id=<id>` for standalone tasks
- Backend: tasks/ route + task_daemon.py handle lifecycle
- **WIRING:** genimage, gen3d, and future long-running ops use this pattern

**Real-time Metrics** (Polling + Push)
- Client `tick()` every 4s GETs `/metrics` (singleton, cached)
- Glass panels refresh from `_m`
- Worklist `pollTick()` every 3s GETs `/tasks`, `/swarms`, `/swarm?id=N` (detail fetch)
- **WIRING:** Health alerts, gauges, status synthesis happen in `/metrics` (backend compute), not client-side

**Control Actions** (Token-Gated)
- Pause/resume task: POST `/task?action=pause|resume&id=<id>&token=<CT>`
- Cancel task: POST `/task?action=cancel&id=<id>&token=<CT>`
- Clear tasks: POST `/task?action=clear&token=<CT>`
- Control daemon: POST `/control?action=start|stop|restart&name=<name>&token=<CT>`
- **WIRING:** Token persisted in CT (injected at `:388` via _tmpl); all control endpoints guarded

---

## MINI-APP SPECIFICATIONS

### 1. 🎤 Talk (Full Voice Conversation)

**Current:** Focuses input, runs askJarvis(); TTS via `jarvisSpeak()` (synth voice)

**Target:** Claude API streaming + professional TTS for natural conversation

**Data Flow:**
```
User speaks → STT → prompt
    ↓
POST /chat {q, history:8-turn, address:'sir'}
    ↓
Backend: stream Claude response (streaming + buffer for TTS)
    ↓
Client: render streaming text, TTS chunks as they arrive
    ↓
Show in crystal bubble + speak audio
    ↓
Add to chat history for context
```

**Backend Endpoint: POST /chat**
- Input: `{q: string, history: [{role, content}], address: 'sir' | 'command' | ...}`
- Output (streaming): `{delta: string, done: boolean}` OR `{reply: string, context: {...}}`
- Implementation:
  - Route in `server/routes/chat_predict.py` (or new `chat_live.py`)
  - Call Claude API with streaming + system prompt mentioning JARVIS context
  - Buffer 2–4 sentence chunks for TTS timing (not per-character)
  - Return as Server-Sent Events (text/event-stream) or streaming JSON

**Frontend (jarvis_live.html)**
- Enhance `askJarvis()`:
  - Show "thinking…" in crystal while waiting
  - If streaming endpoint: EventSource → incremental bubble updates
  - If batch: POST + await, show full response
  - Call `jarvisSpeak()` with full reply (or chunks if streaming TTS available)
  - Update `_chatHist` for next turn context
- Add toast for connection errors

**Voice Shortcuts:**
```
"talk to jarvis about X" → askJarvis("X") 
"ask jarvis why Y" → askJarvis("Why Y?")
"read my status" → readStatus() (existing)
(Default: any text input → askJarvis)
```

**TTS (Professional):**
- Option A: Google Cloud Text-to-Speech (real-time, natural, multilingual)
- Option B: ElevenLabs API (character voice, low latency, ~100ms/1k chars)
- Option C: Local espeak-ng + VITS (offline, free, lower quality)
- **RECOMMENDATION:** ElevenLabs (natural, low-latency, works for a disabled user in sync with visual feedback)

**Acceptance Criteria:**
- [ ] User can hold a multi-turn conversation; context preserved over 8 turns
- [ ] TTS plays within 1.5s of response arriving
- [ ] Streaming shows live text updates in crystal bubble
- [ ] Voice shortcut "talk about X" invokes chat with X as prompt
- [ ] No console errors on error scenarios (network, timeout, API fail)
- [ ] Accessible: ARIA live regions updated, captions shown in crystal, audio cues present

---

### 2. 📚 Library (Browse + Open Real Assets)

**Current:** `loadLib()` GETs `/library` → renders GLB grid + images

**Target:** Real media pipeline. Gallery of generated GLBs + images with metadata, searchable, playable

**Data Flow:**
```
User clicks Library icon
    ↓
setMode('library') → show #ovLib overlay
    ↓
loadLib() GETs /library
    ↓
Backend: scan underworld/web/public/media/ + metadata from DB
    ↓
Return [{file, prompt, created_at, model, size, ...}, ...]
    ↓
Client renders: <model-viewer> for GLBs, <img> for images
    ↓
User clicks → open in new tab OR preview in-place
```

**Backend Endpoint: GET /library**
- Output: `[{file: 'img_123.png' | 'model_456.glb', prompt: string, created_at: ts, model: string, size: bytes, ...}]`
- Implementation:
  - Route in `server/routes/jarvis_ui.py` or new `media.py`
  - Scan GLB_DIR (`underworld/web/public/models/generated`)
  - Query media metadata from a DB table (generated_media: file, prompt, created_at, model, size)
  - Sort by created_at DESC (newest first)
  - Limit to last 50–100 for UI responsiveness
  - Return JSON with full file paths (client uses <base href="/"> so paths work)

**Frontend:**
- Keep existing `loadLib()` logic (model-viewer + img tags)
- Add search/filter: search box in #libgrid header filters by prompt
- Add metadata: show creation date, model name, size
- Add actions: click image → preview overlay, right-click → save/download
- Lazy-load images (IntersectionObserver for large libraries)

**Voice Shortcuts:**
```
"show my library" → setMode('library')
"browse models" → setMode('library')
"open library" → setMode('library')
```

**Acceptance Criteria:**
- [ ] Gallery loads in <1s, renders 50+ items
- [ ] Model-viewer displays GLBs with auto-rotate + camera controls
- [ ] Images display with prompt metadata below
- [ ] Search by prompt filters in real-time
- [ ] Newest items appear first
- [ ] Works on mobile (responsive grid, touch-friendly)
- [ ] Accessible: ARIA labels on images, keyboard navigation (arrow keys)

---

### 3. 🎨 Image + 4. 🧊 3D (Generate Real Assets)

**Current:** `quick(kind)` prompts + `runMedia(action, prompt)` POSTs `/task?action=genimage|gen3d`

**Target:** Real Stable Diffusion (images) + real 3D generation (Tripo3D / similar)

**Data Flow (Image & 3D):**
```
User says "image of X" → quick('image') prompts OR skips if in voice mode
    ↓
Prompt filled: "image of a neon-lit city"
    ↓
runMedia('genimage', prompt)
    ↓
POST /task?action=genimage&q=<prompt>&token=<CT>
    ↓
Server: enqueue task in task_daemon
    ↓
Worker fetches from GPU box (Ollama or external):
  - Stable Diffusion 3 / Flux or similar (latest 2026 SOTA)
  - Input: prompt
  - Output: PNG (1024×1024 or 512×512)
  - Save to underworld/web/public/media/img_<ts>.png
  - Insert metadata row (prompt, model, created_at)
    ↓
Client: poll /tasks + /taskresult?id=<id>
    ↓
When done: loadLib() refreshes gallery
    ↓
Latest image appears in #libgrid, plays success chime
```

**Backend Endpoints:**
- **POST /task** (existing, expand action param)
  - Input: `{action: 'genimage' | 'gen3d', q: string, token: <CT>}`
  - Output: `{id: string, status: 'queued'}` 
  - Enqueues in task_daemon with action + prompt
  - Token-gated (prevent spam)

- **GET /tasks** (existing, used by worklist)
  - Returns recent tasks with status

- **GET /taskresult?id=<id>** (existing, used by worklist + standalone polls)
  - Returns `{status: 'running' | 'done' | 'failed', elapsed, pct, text, result, ...}`

**Image Generation (Stable Diffusion):**
- **Model:** Stable Diffusion 3 Medium or Flux (2026 SOTA, fastest, best quality)
- **Integration:** Call via Ollama on vast.ai box (already reachable at BOX env)
- **Prompt Engineering:** Auto-enhance with style hints (e.g., "cinematic, 8k, unreal engine 5")
- **Output:** Save PNG + metadata (prompt, model, seed for reproducibility)
- **Latency:** ~8–15s (SD3) or ~20–40s (Flux) for 1024×1024

**3D Generation (Tripo3D or similar):**
- **Model:** Tripo3D (text→3D via 2 image diffusion) or newer (e.g., Genie3D if available in 2026)
- **Integration:** API call or local inference (slower)
- **Pipeline:** text → 2-view images → 3D mesh → GLB export
- **Output:** Save GLB + metadata
- **Latency:** ~30–120s depending on model

**Frontend (jarvis_live.html):**
- Enhance `runMedia()`:
  - Show "Generating X…" in crystal
  - Spawn toast: "Your image is being created. Check the library when ready."
  - `jarvisSpeak()` confirms receipt
  - DO NOT block UI (async task in background)
  - Optional: show live progress bar in worklist if task appears there
- After 1.5s, call `loadLib()` to refresh gallery (in case task finishes fast)
- If task is still running, it appears in worklist with progress bar

**Voice Shortcuts:**
```
"image of X" → runMedia('genimage', 'X')
"draw X" → runMedia('genimage', 'X')
"3d model of Y" → runMedia('gen3d', 'Y')
"create a 3d Z" → runMedia('gen3d', 'Z')
```

**Acceptance Criteria:**
- [ ] Image generation completes in <30s (SD3) or <60s (Flux)
- [ ] 3D generation completes in <2 min
- [ ] Generated files saved with correct prompt metadata
- [ ] Gallery auto-refreshes and shows new item immediately
- [ ] User receives audio confirmation ("Image is being created")
- [ ] Works in worklist if task runs long
- [ ] Voice shortcut "image of X" works without prompt dialog
- [ ] Accessible: progress shown via ARIA live regions + captions

---

### 5. 🌡 Climate (Real AirTouch5/Daikin Control)

**Current:** `flyToBodyByName('climate')` tries to navigate to a 3D body; no real control

**Target:** Real AirTouch5/Daikin HVAC control panel

**Data Flow:**
```
User says "climate" or clicks Climate icon
    ↓
setMode('climate') OR flyToBodyByName('climate') + open control panel
    ↓
Panel GETs /climate/status
    ↓
Backend: query AirTouch5 REST API on local network (192.168.x.x:2025 or similar)
    ↓
Return: {temp_current, temp_setpoint, mode, fan_speed, status, zones: [{name, temp, power}]}
    ↓
Client renders: current temp, setpoint slider, mode buttons (cool/heat/auto), fan, zone toggles
    ↓
User adjusts: POST /climate/set {setpoint, mode, fan_speed, zones: {...}}
    ↓
Backend: send command to AirTouch5 API
    ↓
Confirmation: return {ok, status, ...} OR live WebSocket update
```

**Backend Endpoints:**

- **GET /climate/status**
  - Output: `{ok: bool, current_temp: float, setpoint: float, mode: 'cool' | 'heat' | 'auto' | 'off', fan: 'low' | 'mid' | 'high' | 'auto', power: bool, zones: [{name: string, current: float, setpoint: float, power: bool}]}`
  - Implementation: route in `server/routes/bridge.py` (or new `climate.py`)
    - Fetch from AirTouch5 REST endpoint (LAN, ~50ms latency)
    - Cache for 5s to avoid hammering the device
    - Fall back to cached state if device unreachable
    - Return as-is (never fake data per hard rule)

- **POST /climate/set**
  - Input: `{token: <CT>, setpoint?: float, mode?: string, fan?: string, zone_id?: string, power?: bool}`
  - Output: `{ok: bool, status: {...}, error?: string}`
  - Implementation:
    - Token-gated (lifeline safety)
    - Build command for AirTouch5 API (varies by model; check docs)
    - Send via HTTP POST to device LAN
    - Return result immediately (device should confirm asynchronously if needed)
    - Log all changes (audit trail for accessibility + safety)

**Frontend (jarvis_live.html):**
- Create new function `openClimate()`:
  - Show overlay or glass panel with climate controls
  - GETs `/climate/status` on open
  - Renders:
    - **Current temp** (display only, updates every 10s)
    - **Setpoint slider** (18–30°C, 1° increments, visual feedback)
    - **Mode buttons** (cool/heat/auto/off, highlights active, disabled if not supported)
    - **Fan speed** (buttons: low/mid/high/auto)
    - **Zone toggles** (each zone has on/off + optional setpoint)
  - On input change:
    - Optimistic UI update (slider moves immediately)
    - POST `/climate/set` with new value
    - If error: revert to last good state, show toast
  - Refresh status every 10s (long poll) or WebSocket if available

**Voice Shortcuts:**
```
"set temperature to 22" → setClimate({setpoint: 22})
"cool mode" → setClimate({mode: 'cool'})
"turn off climate" → setClimate({power: false})
"fan speed high" → setClimate({fan: 'high'})
"climate" → openClimate()
```

**AirTouch5 Integration:**
- Device IP: configured via env var (AIRTOUCH_IP=192.168.1.x)
- Shared secret: CLIMATE_BRIDGE_KEY (from dashboard.py init)
- Protocol: REST API (JSON POST) or proprietary binary (check specs)
- Latency: <500ms for control (LAN)
- Safety: NEVER send fake confirmations; always reflect true device state

**Acceptance Criteria:**
- [ ] Current temp reads within 30s on open
- [ ] Setpoint slider moves in real-time, updates via POST within 1s
- [ ] Mode/fan buttons toggle with visual feedback
- [ ] Zone toggles control individual zones
- [ ] Error handling: network fail → show "Device unavailable" (never fake data)
- [ ] Voice shortcuts work: "set temperature to X", "cool mode", etc.
- [ ] All changes logged (audit trail)
- [ ] Accessible: keyboard navigation (arrow keys for slider), ARIA labels, screen reader support

---

### 6. 🛡 Guardian (Live Care Monitor)

**Current:** Opens #ovGuardian iframe to `guardian?room=mum`; WebRTC negotiation exists

**Status:** Stage-1 research done per [[Care features C2]]. Queued for Stage 2–3 build.

**Summary:**
- Real video streaming (H.265 if 2026 standard, else H.264)
- Granular consent controls (user approves who can watch, when, what data)
- Health integrations (sync with health wearable, show vitals)
- Remote co-control (caregiver can trigger alerts, call back)

**For Stage 1 Plan:** Keep existing iframe wiring; queue detailed spec for Stage 2.

---

### 7. 🤖 Agent OS (Real Agent Tools)

**Current:** `openAgentTools()` GETs `/agent/tools` → renders card with up to 8 tools; `runAgentTool(name)` POSTs `/agent/run?q=<name>`

**Target:** Real agent tool catalog + execution framework

**Data Flow:**
```
User clicks Agent OS icon
    ↓
openAgentTools() OR flyToBodyByName('agentos')
    ↓
GETs /agent/tools
    ↓
Backend: fetch tool catalog from server/agent/catalog.py
    ↓
Return: [{id, name, desc, risk, icon}, ...] sorted by risk/frequency
    ↓
Client renders card: tool list + up to 8 actionable buttons
    ↓
User clicks tool
    ↓
runAgentTool(name)
    ↓
POST /agent/run?q=<name>&token=<CT>
    ↓
Backend: route to agent/core.py, load tool schema, execute
    ↓
Store result in task (appears in worklist if long-running)
    ↓
Return {ok, status, result, ...} OR stream if async
    ↓
Client updates card or shows toast with result
```

**Backend Endpoints:**

- **GET /agent/tools**
  - Output: `{tools: [{id, name, desc, risk: 'safe' | 'caution' | 'danger', icon: string}], status: string}`
  - Implementation: route in `server/routes/jarvis_agent.py` (or expand existing)
    - Read from `server/agent/catalog.py` (tool registry)
    - Each tool: name + description + risk level + input schema
    - Return first 20 tools, sorted by risk (safe first) + frequency

- **POST /agent/run** (existing, expand)
  - Input: `{token: <CT>, q: string (tool name)}`
  - Output: `{ok: bool, id: string, status: 'queued' | 'running' | 'done', result?: any}`
  - Implementation:
    - Token-gated
    - Lookup tool in catalog
    - If simple (synchronous): execute + return result
    - If complex (async): enqueue as task, return task ID
    - Task appears in worklist if runs > 2s

**Agent Tool Catalog (server/agent/catalog.py):**
Register real tools (examples; adjust to JARVIS capabilities):
1. **search_knowledge** (safe) — search brain DB by keyword
2. **summarize_topic** (safe) — AI summary of a topic from KB
3. **list_entities** (safe) — show entities matching a pattern
4. **check_system_health** (safe) — run health diagnostics
5. **optimize_pipeline** (caution) — rebalance inference routing
6. **rebuild_indexes** (caution) — reindex knowledge graph
7. **snapshot_brain** (caution) — full DB backup
8. **auto_upgrade** (danger) — trigger self-upgrade (archon-only)
9. **cancel_all_tasks** (danger) — stop all running work
10. **factory_reset** (danger) — wipe and restart

**Frontend (jarvis_live.html):**
- Enhance `openAgentTools()`:
  - Show tool list in card
  - Color-code by risk (green=safe, yellow=caution, red=danger)
  - On tool click:
    - If requires input: pop a dialog ("search for what?")
    - POST `/agent/run?q=<tool_name>&token=<CT>` with optional input
    - Show "Running…" toast
    - If async: task appears in worklist
    - If sync: show result in card or toast
  - Auto-refresh tool list every 30s (tools may be registered dynamically)

**Voice Shortcuts:**
```
"search knowledge for X" → agent tool search_knowledge with X
"check system health" → agent tool check_system_health
"show agent tools" → openAgentTools()
"rebuild indexes" → agent tool rebuild_indexes (archon-only?)
```

**Acceptance Criteria:**
- [ ] Tool catalog loads in <500ms
- [ ] Each tool has clear description + risk indicator
- [ ] Running a tool enqueues or executes within <2s
- [ ] Long-running tools appear in worklist with progress
- [ ] Results displayed in card or toast
- [ ] Voice shortcuts work for common tools
- [ ] Accessible: ARIA labels on tool buttons, keyboard nav (arrow keys)
- [ ] Archon mode gates dangerous tools (auto_upgrade, factory_reset)

---

### 8. 🩺 Vitals (System + Health Vitals)

**Current:** `openVitals()` reads `_m.health` from `/metrics` → shows card with alerts + gauges

**Target:** Real health scoring + alert engine

**Data Flow:**
```
User clicks Vitals icon → openVitals()
    ↓
Reads `_m.health` from last /metrics tick
    ↓
Backend (/metrics): compute health score
    ↓
Collects: disk%, mem%, cpu%, gpu VRAM%, daemon count, pipeline health
    ↓
Scores each gauge (0–100)
    ↓
Triggers alerts if critical (e.g., disk >90% → critical)
    ↓
Returns: {score: 0–100, level: 'ok' | 'warn' | 'critical', alerts: [...], gauges: {...}, summary: string}
    ↓
Client renders: health score, status chip (● ONLINE / ⚠ WARN / ⛔ CRITICAL)
    ↓
Card shows: alerts + gauges + actions
```

**Backend Endpoint: GET /metrics** (expand health computation)
- Current output: includes `{health: {...}}`
- Enhanced:
  ```json
  {
    "health": {
      "score": 92,
      "level": "ok",
      "summary": "All systems nominal",
      "alerts": [
        {
          "level": "critical",
          "title": "Disk space low",
          "detail": "9.2 / 10.0 GB used",
          "hint": "Run cleanup"
        }
      ],
      "gauges": {
        "disk_pct": 92,
        "mem_pct": 74,
        "cpu_pct": 34,
        "vram_pct": 68,
        "daemons_up": 6,
        "daemons_total": 7
      }
    }
  }
  ```
- Implementation:
  - Route in `server/routes/jarvis_system.py` (or extend dashboard.py)
  - Compute gauges from /proc/* + pm2 status
  - Thresholds: disk/mem/cpu ≥90% = critical, ≥75% = warn; daemons (all up = ok, 1+ down = warn)
  - Generate alerts in priority order (critical → warn → ok)
  - Score = weighted average (disk 30%, mem 25%, cpu 20%, daemons 15%, pipeline 10%)

**Frontend (jarvis_live.html):**
- Current `openVitals()` already reads `_m.health` and renders card
- Enhance:
  - Show health score as large number (0–100) at top
  - Color-code level (green/yellow/red)
  - List alerts in priority order (critical first)
  - Show gauges with color fills (red ≥90, yellow ≥75, green <75)
  - Add action buttons:
    - "↻ Run all" → `cmdAll('run')` (start pipelines)
    - "🧹 Cleanup" → clear temp files, old tasks (POST `/admin/cleanup?token=<CT>`)
    - "📄 Dashboard" → open `http://127.0.0.1:8095` in new tab

**Voice Shortcuts:**
```
"check system health" / "read status" → openVitals()
"run all" → cmdAll('run')
"show vitals" → openVitals()
```

**Acceptance Criteria:**
- [ ] Health score computes from gauges (weighted average)
- [ ] Alerts trigger at correct thresholds (disk 90%, mem 90%, daemons down)
- [ ] Card displays score + level + alerts + gauges
- [ ] Status chip in top bar reflects health level
- [ ] "Run all" button restarts failed daemons
- [ ] Voice shortcut "check system health" works
- [ ] Accessible: high contrast gauges, ARIA labels, captions for alerts

---

### 9. ⚙ Upgrades (Real Self-Development Builds)

**Current:** `openUpgrades()` shows hardcoded list (rollback, scheduler, forecaster, approvals, replay); `doUpgrade(key)` POSTs `/upgrade?key=<key>`

**Target:** Real suggestion engine that proposes improvements + executes them

**Data Flow:**
```
Client GET /suggestions
    ↓
Backend: analyze codebase + system state
    ↓
LLM suggests improvements (e.g., "Add caching to pipeline", "Optimize query")
    ↓
Return: [{id, title, detail, difficulty, impact}, ...]
    ↓
Client renders suggestions in #sdev bar
    ↓
User clicks "Read the proposal" → GET /proposal?id=<id>
    ↓
Backend: return detailed spec (markdown formatted)
    ↓
Client opens #prop overlay with formatted text
    ↓
User clicks "BUILD" → POST /upgrade?key=<id>&archon=<0|1>
    ↓
Backend: spawn Claude agent (server/agent/core.py) with proposal as task
    ↓
Agent researches approach, edits code, runs tests, commits
    ↓
Task appears in worklist with live progress
    ↓
On completion: client refreshes suggestions (loop keeps iterating)
```

**Backend Endpoints:**

- **GET /suggestions** (optional query param `?force=1` to skip cache)
  - Output: `{suggestions: [{id, title, detail, difficulty, impact}, ...], timestamp}`
  - Implementation: route in `server/routes/jarvis_platform.py` (or new `suggestions.py`)
    - Cache for 1 hour (expensive analysis)
    - Analyze codebase: git history, test coverage, TODO comments, slow endpoints
    - Run LLM prompt: "Given this codebase state, what's the ONE highest-impact improvement we should build next?"
    - Return top 5–10 ideas ranked by impact
    - Fallback seed list if no analysis result (e.g., "Add caching", "Optimize startup time")

- **GET /proposal?id=<id>**
  - Output: `{ok: bool, title: string, text: string, difficulty, estimate_hours}`
  - Implementation:
    - Lookup suggestion by ID (from cache or regenerate)
    - If cached: return cached proposal markdown
    - If not: run LLM to generate detailed spec (20–50 lines of markdown)
    - Format: problem statement + technical approach + acceptance criteria

- **POST /upgrade?key=<id>&token=<CT>&archon=<0|1>** (existing, expand)
  - Input: `{key: string, token: <CT>, archon: 0|1}`
  - Output: `{ok: bool, task_id: string}`
  - Implementation:
    - Token-gated
    - Archon-gated if difficulty >= 'hard'
    - Lookup proposal by id
    - Enqueue as agent task: "Implement this proposal: <title>. Spec: <text>. Commit with message mentioning the improvement."
    - Return task ID (appears in worklist)
    - Agent will: research, code, test, commit, push (if enabled)

**Frontend (jarvis_live.html):**
- Keep existing `openUpgrades()` + enhance:
  - Show suggestions from /suggestions (not hardcoded)
  - On "Read the proposal": `openProposal(id)` (existing, already works)
  - On "BUILD": `buildSuggestion(id)` (existing, already works)
  - Auto-refresh suggestions after 1 hour (or on force refresh)
- In #sdev bar:
  - Similar structure: render suggestions as blocks
  - Link → proposal reader
  - BUILD button → POST /upgrade + refresh

**Voice Shortcuts:**
```
"what should we build next?" → loadSuggestions(); openUpgrades()
"build the next improvement" → buildSuggestion(<first_id>)
"upgrades" → openUpgrades()
```

**Acceptance Criteria:**
- [ ] Suggestions load in <2s (or show cached list)
- [ ] Each suggestion has clear title + impact
- [ ] Proposal details show in formatted overlay
- [ ] BUILD button enqueues task, returns task ID
- [ ] Task appears in worklist with progress
- [ ] On completion: suggestions refresh (loop continues)
- [ ] Archon mode required for high-difficulty tasks
- [ ] Voice shortcuts work
- [ ] Accessible: ARIA labels, keyboard nav

---

### 10. Status Chip (Top Bar)

**Current:** Reads `_m.health.level` → displays ● ONLINE / ⚠ WARN / ⛔ CRITICAL

**Target:** Real health synthesis, clickable to open Vitals card

**Implementation:**
- Already mostly done (see Vitals section)
- Add click handler: `$('status').onclick = () => openVitals()`
- Sync color with health level

---

### 11–14. Glass Panels (§1 C)

**pInfra, pPipe, pKnow, pFab** — render from `/metrics`; 3-state toggles persist

**Current:** Render functions in place (`renderInfraPanel()`, etc.); refresh in `refreshGlassPanels()`

**Enhancements:**
1. **pInfra:** Add GPU temp gauge (if available via nvidia-smi or vast.ai API)
2. **pPipe:** Add pipeline throughput (tasks/min, latency)
3. **pKnow:** Add embedding status (VRAM reserved, dimensions)
4. **pFab:** Add error rate gauge (failed / total inferences)

**Acceptance Criteria:**
- [ ] Each panel displays live data from /metrics
- [ ] 3-state toggle persists in localStorage
- [ ] Drag-drop from 3D world works
- [ ] Responsive on mobile (collapse to tabs if needed)
- [ ] Accessible: ARIA labels on gauges, keyboard accessible

---

### 15. Self-Dev Bar (#sdev)

**Current:** Renders suggestions from /suggestions; BUILD button POSTs /upgrade

**Target:** Keep existing flow; ensure suggestions refresh loop

**Implementation:**
- Already functional per Upgrades spec
- Ensure /suggestions endpoint exists and returns real data
- Refresh after build completes (existing code does this)

---

## BACKEND ARCHITECTURE

### Data Layer
- **Metrics DB:** `/proc/*` + pm2 status (real-time, no persistence)
- **Tasks DB:** task_daemon.py (SQLite, task tracking)
- **Media DB:** generated_media table (file path, prompt, model, created_at)
- **Agent Catalog:** server/agent/catalog.py (tool registry, in-memory)
- **Suggestions Cache:** in-memory or Redis (1 hour TTL)

### Compute Layer
- **Metrics:** /metrics endpoint computes health score
- **Suggestions:** LLM analysis (Claude or local) every hour
- **Media Generation:** Vast GPU box (Ollama for SD3, Flux)
- **Agent Execution:** server/agent/core.py (Claude API + tool execution)
- **Climate Control:** AirTouch5 LAN bridge

### Communication
- **HTTP (FastAPI):** all REST endpoints
- **Server-Sent Events (SSE):** /chat streaming, /upgrade task progress
- **WebSocket (optional):** live metrics push for fast UI updates
- **Task Daemon:** background process (task_daemon.py), runs on interval

---

## VOICE + TEXT WIRING (AUTONOMY)

### Intent Detection in askJarvis()

```javascript
async function askJarvis() {
  const t = ($('say').value || '').trim();
  if (!t) return;
  const l = t.toLowerCase();
  
  // Mini-app shortcuts (add to existing list)
  if (/^(open\s+)?library/i.test(l)) return setMode('library');
  if (/^(open\s+)?climate/i.test(l)) return openClimate();
  if (/^(open\s+)?vitals|check.*(health|system)/i.test(l)) return openVitals();
  if (/^(open\s+)?agent|show.*(tools|agent)/i.test(l)) return openAgentTools();
  if (/^(open\s+)?upgrades|what.*(build|next)/i.test(l)) return openUpgrades();
  if (/^(talk|chat|conversation)/i.test(l)) return askJarvis(); // continue conversation
  if (/^climate.*set.*(\d+)/i.test(l)) {
    const temp = l.match(/(\d+)/)[1];
    return POST('/climate/set', {setpoint: parseInt(temp)});
  }
  if (/^(set|change).*temp.*to\s+(\d+)/i.test(l)) {
    const temp = l.match(/(\d+)/)[1];
    return POST('/climate/set', {setpoint: parseInt(temp)});
  }
  // Existing shortcuts (image, 3d, run all, etc.)
  if (/^(image|picture|draw)\b/.test(l)) return runMedia('genimage', t.replace(/^(image|picture|draw)\s*(of)?\s*/i, ''));
  if (/\b3d\b|^(model|sculpt)\b/.test(l)) return runMedia('gen3d', t.replace(/\b3d\b|model|sculpt/ig, '').trim());
  // ... rest of existing shortcuts
  
  // Default: chat
  unlockAudio();
  bubble('You', esc(t));
  $('coreSay').textContent = '…';
  try {
    const r = await (await fetch('chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: t, history: _chatHist.slice(-8), address: 'sir' })
    })).json();
    const reply = (r && r.reply) || "I'm here, sir.";
    _chatHist.push({ role: 'user', content: t });
    _chatHist.push({ role: 'assistant', content: reply });
    bubble('JARVIS', esc(reply));
    jarvisSpeak(reply);
  } catch (e) {
    bubble('JARVIS', 'connection error');
  }
}
```

### A11Y Intent Handler (server/a11y_intent.py)

Register mini-apps as tools that A11Y layer can invoke:
```python
def register_intents():
  intents = {
    'open_library': {'fn': setMode('library'), 'shortcut': 'lib'},
    'open_climate': {'fn': openClimate(), 'shortcut': 'clim'},
    'open_vitals': {'fn': openVitals(), 'shortcut': 'vit'},
    'open_agent': {'fn': openAgentTools(), 'shortcut': 'agent'},
    'open_upgrades': {'fn': openUpgrades(), 'shortcut': 'upg'},
    # ... etc
  }
  # These become voice shortcuts + switch/dwell/gaze targets
```

### A11Y Integration (Per [[accessibility-core]])

All mini-apps MUST support:
1. **Voice commands** (via intent shortcuts above)
2. **Switch access** (dwell/click to open, arrow keys to navigate, enter to select)
3. **Gaze tracking** (eye-tracker focus → dwell highlight)
4. **Text captions** (every audio → text in crystal bubble + live region)
5. **High contrast** (all buttons/text ≥4.5:1 WCAG AA)
6. **Keyboard nav** (Tab/Shift+Tab, arrow keys, Enter/Escape)
7. **Screen reader** (ARIA labels, live regions, semantic HTML)

---

## LIFELINE SAFETY

**pm2 services MUST NOT crash:**
- jarvis-dashboard (port 8095, metrics)
- jarvis-voiceclone (TTS)
- jarvis-tasks (task_daemon, work runner)

**Rules:**
1. NO direct edits to these services from mini-app code
2. Control endpoints (pause/resume/cancel) are token-gated
3. Long-running operations (generation, build) enqueue as tasks, don't block main loop
4. Error handling: always show "unavailable" rather than fake data
5. Resource limits: cap concurrent tasks, timeout long-running jobs
6. Logging: audit trail of all control actions for user review

---

## ACCEPTANCE CRITERIA (STAGE 1 PLAN)

### Functional
- [ ] **Talk:** Multi-turn conversation with streaming TTS; voice shortcuts work
- [ ] **Library:** Browse 50+ generated images + GLBs; search by prompt; responsive
- [ ] **Image & 3D:** Real generation via SD3 + Tripo3D; <60s completion; saved with metadata
- [ ] **Climate:** Real AirTouch5 control; setpoint/mode/fan/zones; voice shortcuts
- [ ] **Guardian:** WebRTC iframe continues working; Stage 2 queued
- [ ] **Agent OS:** Tool catalog loads; 8 tools rendered; execution enqueues; voice shortcuts
- [ ] **Vitals:** Health score computes; alerts trigger; card shows gauges; status chip updates
- [ ] **Upgrades:** Suggestions load; proposals render; BUILD enqueues agent task
- [ ] **Glass Panels:** All 4 render; 3-state toggle persists; drop-zones work
- [ ] **Status:** Clickable → opens Vitals; reflects health level
- [ ] **Self-Dev:** Suggestions render; BUILD works; loop continues

### Accessibility (Hawking-class user)
- [ ] **Voice:** All features accessible via voice commands (askJarvis + A11Y intents)
- [ ] **Switch:** Dwell/switch access to all buttons; arrow keys for lists
- [ ] **Gaze:** Eye-tracker can focus buttons (screen reader reads them)
- [ ] **Captions:** All audio → text (crystal bubble + live regions)
- [ ] **Contrast:** All text ≥4.5:1; buttons ≥44px hit target
- [ ] **Keyboard:** Tab/arrow/enter/escape fully control all features
- [ ] **Screen Reader:** ARIA labels complete; live regions announce changes

### Performance
- [ ] **Startup:** Climate status <500ms; tools list <500ms; library <1s
- [ ] **Responsiveness:** UI updates within 100ms of user action
- [ ] **Polling:** /metrics every 4s, /tasks every 3s (worklist)
- [ ] **Generation:** Images <30s, 3D <2min
- [ ] **Mobile:** Responsive grid; touch-friendly hit targets; no layout collapse

### Reliability
- [ ] **No JS Errors:** Every page load, every feature, no console errors
- [ ] **Fallbacks:** Network fail → show "unavailable" (not fake data)
- [ ] **Lifeline Safety:** pm2 services never crash; control endpoints token-gated
- [ ] **Task Persistence:** Long-running tasks survive tab refresh
- [ ] **Logging:** Audit trail of all control actions

### Code Quality
- [ ] **Type Safety:** No `any` types; TypeScript or JSDoc
- [ ] **Tests:** Unit tests for health score, climate command, suggestion ranking
- [ ] **Docs:** Each endpoint documented (URL, method, input/output, error codes)
- [ ] **Comments:** Only for non-obvious logic (why, not what)

---

## ADVERSARIAL REVIEW (PRE-IDENTIFIED RISKS)

### Risk 1: Climate Control Latency
**Issue:** AirTouch5 may respond slowly (LAN <500ms, but device queue may add 1–2s)
**Mitigation:** Optimistic UI update (slider moves instantly), with timeout rollback if POST fails within 3s

### Risk 2: Vast GPU Box Offline
**Issue:** If Ollama on vast.ai box goes down, image/3D generation fails
**Mitigation:** Return "Device unavailable" immediately (not queued forever); cache last-known box status to show in pInfra

### Risk 3: Claude API Rate Limit
**Issue:** Multiple users/agents calling Claude simultaneously may hit quotas
**Mitigation:** Queue tasks in task_daemon with exponential backoff; never lose work (persisted in SQLite)

### Risk 4: Mobile UX Collapse
**Issue:** Glass panels + dock + talk bar don't fit on small screens
**Mitigation:** Hide dock + panels on mobile unless explicitly opened (responsive breakpoint 820px)

### Risk 5: Accessibility Regression
**Issue:** New features added without ARIA/keyboard/voice support
**Mitigation:** Checklist per feature (see Accessibility section); automated a11y tests via axe-core

### Risk 6: Long-Running Agents Block Worklist
**Issue:** If agent task consumes 100% CPU, worklist polling stalls
**Mitigation:** Separate process (task_daemon) on worker thread; timeout jobs at 5min, allow checkpoint/resume

### Risk 7: User Mistakes (Climate)
**Issue:** User accidentally sets temp to 40°C, dangerous situation
**Mitigation:** Confirmation dialog for extreme values (>28°C or <15°C); log all changes; caregiver can review history

### Risk 8: Suggestion Loop Never Terminates
**Issue:** If agent auto-builds suggestions forever, system resource exhaustion
**Mitigation:** Archon-only for dangerous suggestions; user must approve via BUILD button; auto-build disabled by default

### Risk 9: Glass Panel Drop-Zone Collision
**Issue:** If dragging a large GLB, panel drop zone may be obscured
**Mitigation:** Panels slide out to 'full' state on drag-over (visual feedback); drop zone clearly highlighted

### Risk 10: Worklist Polling Contention
**Issue:** 27 running swarms fan-out to /swarm?id=N per 3s; non-WAL SQLite locks (blocker B4 from Stage 4 review)
**Mitigation:** 
- Top-K sort: fan-out only to top 6 running swarms (bounded concurrency ≤4)
- Remaining: render from coarse /swarms fields as "queued"
- Cache plan[] per swarm (immutable) — fetch ≤once
- Comment concurrency cap in code

---

## IMPLEMENTATION ORDER (STAGE 1 → 5)

### Stage 1 (This Plan)
- Research latest 2026 tech
- Design architecture + endpoints
- Produce acceptance criteria
- Adversarial review (this doc)

### Stage 2 (Backend Scaffold)
- Implement /climate/status + /climate/set endpoints
- Implement /chat streaming endpoint (Claude API)
- Implement /agent/tools + /agent/run (execute existing tools)
- Implement /suggestions + /proposal endpoints
- Expand /metrics with health scoring

### Stage 3 (Frontend Wiring)
- Wire Talk (full conversation + streaming)
- Wire Climate (real HVAC control)
- Wire Agent OS (tool execution)
- Wire Upgrades (suggestion loop)
- Wire Vitals (health card)

### Stage 4 (Media Pipeline)
- Integrate Stable Diffusion 3 for image generation
- Integrate Tripo3D (or SOTA 2026 model) for 3D generation
- Wire Library (media browsing)
- Implement media metadata DB (file, prompt, model, created_at)

### Stage 5 (Accessibility + Polish)
- Full a11y audit + fixes (voice, switch, gaze, captions, contrast)
- Mobile responsive redesign
- Performance optimization (lazy load, caching, minify)
- Integration tests end-to-end
- Formal ship gate

---

## RESEARCH GAPS (Awaiting 2026 Tech Intel)

1. **Latest image generation SOTA** — SD3 vs Flux vs Ideogram (speed, quality, license)
2. **Latest 3D generation SOTA** — Tripo3D vs Genie3D vs newer (pipeline, quality)
3. **Professional TTS 2026 standard** — ElevenLabs vs Google Cloud vs local VITS
4. **AirTouch5 REST API** — exact endpoint format, auth, supported commands
5. **Vast GPU box API** — monitoring VRAM, GPU temp, cost in real-time
6. **WebSocket vs SSE for metrics** — which pattern scales better for 2026?
7. **Agent swarm orchestration patterns** — multi-agent memory, tool composition

---

## CONCLUSION

This plan outlines a complete overhaul of JARVIS's mini-app ecosystem to **production-grade end-to-end**. Every feature is invokable by voice + text, accessible to a disabled user, wired to real backends, and built to Apple/Google/Meta tier.

**Next step:** Team review of this plan + stage-2 backend scaffold buildout.

---

*Generated: 2026-06-10*  
*Status: Awaiting 2026 tech research; plan complete subject to research findings*
