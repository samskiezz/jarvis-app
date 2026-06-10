# STAGE 2 — ACCESSIBILITY CORE · First-draft design / build spec

> **Purpose of this doc.** A clear, checkable first-draft spec of *exactly what to build and where* —
> file-by-file, symbol-by-symbol, with data shapes, CSS contract, intent grammar, agent-tool definitions,
> and a per-pillar acceptance matrix. **This is the reference the final build is compared against in
> Stage 9.** It operationalises the chosen architecture from `accessibility_core_stage1.md` (read that for
> the *why*; this doc is the *what/where/how*).
>
> **Anchors re-verified against the current (uncommitted) working tree this stage** — HEAD `c36e85df`, the
> three HTML files + `dashboard.py` are all dirty. Re-grep the named symbols before editing (line numbers
> drift); the **symbols** are the contract, not the digits.

---

## 0. One-paragraph definition of done

A single **Accessibility Core engine** — `server/a11y.js` (exposing `window.A11Y`) + shared `server/a11y.css`
— is loaded by `jarvis_voice.html`, `jarvis_live.html`, and `guardian.html`. It is driven by **one persisted,
cross-surface state object** (a superset of today's `ACCESS`/`jv_access`) and a **server mirror**
`server/data/a11y_state.json` exposed via an additive `GET/POST /a11y`. Every one of the **8 pillars** is
operable, and **every** accessibility capability is invokable through **four** entry points that all call the
same engine: (a) on-screen toggle, (b) **JARVIS voice** intent, (c) **text/chat** intent, (d) **agent/swarm
tool**. Everything is feature-detected → honest "not available on this device"; nothing throws; the pm2
lifeline (`jarvis-dashboard` / `jarvis-voiceclone` / `jarvis-tasks`) is never touched on a hot path; all
gaze/ASR/prediction inference is 100% on-device.

---

## 1. Non-negotiables (carried from build rules + Stage 1)

| # | Rule | How this spec satisfies it |
|---|---|---|
| N1 | Never break the pm2 lifeline | Backend delta is **one additive route** (`/a11y`) + **one new JSON file**; **zero edits** to `_chat`/`_vitals`/`_jarvis_chat`/`task_daemon` bodies (only an *insert* of one `if` branch + one `_a11y_handle` call). |
| N2 | Never a JS error | `a11y.js` wraps every capability in `try/catch`; **feature-detects** Web Speech, WebGPU, MediaPipe, camera, `/tts`, `/a11y`; missing capability → `A11Y.unavailable(pillar)` spoken + visible, never a throw. |
| N3 | Keep every feature REAL | IG feed / S25 notifications read-aloud **only** if a real source responds; otherwise spoken "I'm not connected to that yet." No fabricated content. |
| N4 | Preserve existing features | Engine is **additive**: `ACCESS` is migrated, not replaced; existing `applyAccess()`, Care-panel toggles, voice router, `/chat` all keep working. |
| N5 | Lane safety (concurrent swarms edit `dashboard.py`) | Client-first. The server touch is additive + idempotent; the JSON mirror is the only shared write, written with a temp-file-rename atomic swap. |
| N6 | On-device privacy / psychosis-safe | No camera frames, audio, or keystrokes leave the box. No covert-surveillance affordances; calm-mode copy is non-patronising. |

---

## 2. File manifest — what gets created vs edited

### 2.1 NEW files

| Path | Purpose | Size guess |
|---|---|---|
| `server/a11y.css` | All visual modes (CSS custom props + `body.*` classes), overlays (caption bar, scan highlight, dwell ring, gaze cursor, scanning keyboard), XL-target rules. | ~600 lines |
| `server/a11y.js` | The engine: `window.A11Y` = state + apply + all 8 pillar subsystems + the 4-entry-point dispatch + server-mirror sync. Pure vanilla, no build step. | ~1600 lines |
| `server/data/a11y_state.json` | Cross-surface state mirror `{state, ts, source}` (created on first POST; absent ⇒ engine runs local-only). | tiny |
| `server/a11y_keyboard.json` | Static ACAT-style on-screen scanning-keyboard layout (rows/keys) so the layout is data, not code. | small |

> **Heavy on-device models** (MediaPipe Face Landmarker WASM/`.task`, Moonshine/Whisper ONNX, transformers.js)
> are loaded **lazily from CDN with a vendored fallback under `server/services/.vendor136/a11y/`** and only when
> the relevant pillar is switched on — so the base page weight is unchanged and offline degrades honestly.

### 2.2 EDITED files (surgical, additive)

| Path | Edit | Anchor (verify) |
|---|---|---|
| `server/jarvis_voice.html` | (a) `<link>`+`<script src=a11y.js>`; (b) migrate `window.ACCESS` → `A11Y.state` (keep `jv_access` key for back-compat); (c) extend `applyAccess()` to delegate to `A11Y.apply()`; (d) add a11y intents to `handle(t)`; (e) extend the Care panel into a full **Accessibility panel**. | `:862` ACCESS, `:876` applyAccess, `:718` handle, `:872` openCare |
| `server/jarvis_live.html` | (a) load engine; (b) add a11y intents to `askJarvis()` **before** the chat fallthrough; (c) add the same Accessibility panel/launcher; (d) caption bar wired to `jarvisSpeak()`. | `:487` askJarvis, `:500` jarvisSpeak |
| `server/guardian.html` | (a) load engine; (b) **add caption bar** (JARVIS speech via `jarvis()` `:100` + remote-video ASR); (c) **add a11y toggles** (none today); (d) XL targets. | `:100` jarvis(), `:57` remote video |
| `server/dashboard.py` | (a) `GET /a11y` + `POST /a11y` (token-gated POST, like `/climate/cmd`); (b) `_a11y_handle(qtext,address)->dict|None` inserted in `/chat` **before** `_climate_handle`; (c) `from server import a11y_state` helper (or inline read/write). | `/chat` `:1985`, climate-first `:1998`, `do_POST` token `:2025`, `do_GET` `:1738` |
| `server/agent/catalog.py` | Register the `accessibility.*` tool family inside `register_catalog()`. | `:720` register_catalog, `:727` cpu.inspect pattern |

> **Dashboard-served pages** (`dashboard.py` HTML, e.g. guardian/live/voice served via `_tpl`/`HTML.replace`)
> already serve these files from `server/`; `a11y.js`/`a11y.css` are served by the same static path the HTML
> uses for sibling assets. If a page is inlined, add the `<link>/<script>` to that inline HTML instead.

---

## 3. The single source of truth — `A11Y.state`

Superset of today's `{bigtext,hc,voicecmd}` (`jarvis_voice.html:862`). Persisted to `localStorage['jv_access']`
**and** mirrored to `/a11y`. One writer (`A11Y.set`), one applier (`A11Y.apply`).

```js
A11Y.state = {
  // pillar 4 — visual
  hc:           false,   // high contrast (existing)
  contrastAuto: true,    // honor @media (prefers-contrast) / forced-colors
  scale:        100,     // text scale %, 100–220 (replaces one-step bigtext; bigtext=scale>=140)
  reduceMotion: false,   // also auto-true under prefers-reduced-motion
  // pillar 1 — voice
  voiceCmd:     false,   // always-listening command grammar (existing 'voicecmd')
  showLabels:   false,   // "show numbers" overlay active
  // pillar 2 — read aloud
  readAloud:    true,    // TTS queue enabled (default on for this user)
  rate:         0.98,    // TTS rate
  pitch:        0.9,     // TTS pitch
  // pillar 3 — switch / dwell / targets
  scan:         false,   // scanning engine on
  scanMode:     'auto',  // 'auto' | 'rowcol'
  scanMs:       1200,    // step interval
  switchKeys:   ['Space','Enter'], // + 'any' + facial-gesture
  dwell:        false,   // dwell-click on
  dwellMs:      900,     // hover→click countdown
  xlTargets:    true,    // enlarge every interactive target (default on for this user)
  targetPx:     64,      // min target size (WCAG 2.5.8 AA = 44; this user = 64)
  // pillar 5 — captions
  captions:     true,    // JARVIS-speech caption bar (default on)
  captionVideo: true,    // ASR-caption the two-way video remote speaker
  // pillar 6 — calm
  calm:         false,   // calm / simplified mode
  // pillar 7 — gaze
  gaze:         false,   // webcam gaze/head pointer
  gazeEngine:   'mediapipe', // 'mediapipe' | 'webgazer'
  gazeSensitivity: 1.0,
  gazeSwitch:   'blink', // facial-gesture used as the "switch": 'blink'|'brow'|'cheek'|'none'
  // pillar 8 — predictive typing
  predict:      true,    // word/next-word prediction in inputs
  kbd:          false,   // on-screen scanning keyboard visible
  // meta
  _ts:          0,       // last-write epoch ms (for mirror reconcile)
  _source:      'local'  // 'local' | 'voice' | 'chat' | 'agent'
};
```

**Defaults are tuned for this user** (read-aloud on, captions on, XL targets on, calm available). Migration
on first load: read old `jv_access` `{bigtext,hc,voicecmd}` → seed `{scale: bigtext?140:100, hc, voiceCmd:
voicecmd}` so nothing regresses.

---

## 4. The engine API — `window.A11Y.*`

One namespace; the routers + agent + toggles all call these. **Every method is total** (try/catch, returns a
result object, never throws).

```
// lifecycle / state
A11Y.init()                         // feature-detect, load state, apply, start mirror poll, bind inputs
A11Y.set(key, value, source?)       // mutate one field → persist → POST /a11y → apply()  (source default 'local')
A11Y.get(key)                       // read
A11Y.apply()                        // reconcile DOM/CSS to state (idempotent; safe to call any time)
A11Y.reset()                        // back to per-user defaults
A11Y.status()                       // -> {state, capabilities:{speech,webgpu,mediapipe,camera,tts,mirror}}
A11Y.unavailable(pillar, reason)    // speak + toast "X isn't available on this device" (honest fallback)

// pillar 1 — voice targeting
A11Y.showCommands()                 // speak + show the command sheet ("what can I say")
A11Y.showLabels(on)                 // number-badge every actionable control (Voice-Control "Show Numbers")
A11Y.activateByNumber(n)            // "tap 7" → SelectionCore.activate(target#n)
A11Y.resolveByName(phrase)          // natural-language → best-match control (fuzzy over registry)

// pillar 2 — read aloud  (TTS queue manager)
A11Y.speak(text, {priority,interrupt})   // enqueue; barge-in aware; uses /tts→speechSynthesis chain
A11Y.stopSpeaking()                       // flush queue (barge-in)
A11Y.readScreen(region?)                  // DOM linearize visible content → queue, with reading-cursor
A11Y.readTasks() / readCaptions() / readFeed() / readNotifications()  // real source or honest "not connected"

// pillar 3 — selection / switch / dwell
A11Y.SelectionCore.activate(el)     // the ONE primitive every input resolves into (click/focus/dwell)
A11Y.scan.start()/stop()            // auto / row-column scanning over the focus ring
A11Y.dwell.enable()/disable()       // hover→click with radial countdown
A11Y.targets.refresh()              // (re)apply XL sizing + collect actionable registry

// pillar 5 — captions
A11Y.caption(text, who)             // push a line to the caption bar (who: 'jarvis'|'remote'|'you')
A11Y.captions.attachVideo(stream)   // run on-device ASR on a remote MediaStream audio track

// pillar 6 — calm
A11Y.calm.enter()/exit()

// pillar 7 — gaze
A11Y.gaze.enable()/disable()/calibrate()   // MediaPipe primary, WebGazer fallback; drives dwell-click

// pillar 8 — predictive typing
A11Y.predict.attach(inputEl)        // live word/next-word suggestions chip-bar above input
A11Y.kbd.show()/hide()              // on-screen scanning keyboard
```

**`A11Y.intent(text, source)`** is the *single dispatch* the four entry points call. It matches `text`
against the **command grammar (§7.1)** and runs the mapped engine call; returns
`{handled:true, reply, spoke}` or `{handled:false}` so a non-a11y phrase falls through to chat/build. This is
what guarantees "one engine, four front-ends."

---

## 5. CSS contract — `a11y.css`

Custom properties on `:root` and `body.*` mode classes. Pages opt in by loading the file; the engine toggles
classes. (Matches existing `body.hc`/`body.bigtext` so current rules survive.)

| Selector | Effect |
|---|---|
| `:root{ --a11y-scale:1; --a11y-target:64px; --a11y-dwell-ms:900ms }` | Tunable knobs the engine sets inline. |
| `body.hc` | High contrast (extend existing voice-page rules to all pages). |
| `@media (prefers-contrast:more)` / `@media (forced-colors:active)` | Auto-HC when `contrastAuto`. |
| `body.a11y-scale` + `font-size:calc(100% * var(--a11y-scale))` w/ `rem`/`clamp()` | Text-scale slider 100–220%. |
| `body.reduce-motion *` → `animation:none!important; transition:none!important; scroll-behavior:auto` | Honors `@media (prefers-reduced-motion)` too. **Disables all engine overlay animations** (dwell ring, scan pulse) so they never fight the RTX scenes. |
| `body.xl-targets a,button,[role=button],input,.card,.eb{ min-width:var(--a11y-target); min-height:var(--a11y-target) }` | XL one-tap targets (≥64px). |
| `body.calm` | Density-down, palette soften, motion off, hide non-emergency urgency, larger spacing, plain-language reveal. |
| `#a11y-captions` | Persistent bottom-anchored caption bar, large, HC, `aria-live=polite`. |
| `.a11y-scan-hl`, `#a11y-dwell-ring`, `#a11y-gaze-cursor`, `#a11y-kbd`, `.a11y-numbadge` | Overlays — all `position:fixed`, `transform`-only, `will-change`, GPU-cheap, **fully suppressed under `reduce-motion`/`calm`**. |

All overlays are a **single top compositing layer** above the Three.js/RTX canvas (high `z-index`,
`pointer-events` only where interactive) so they never repaint the scene.

---

## 6. Per-pillar build spec

Each pillar: **Build**, **Where**, **Acceptance** (the Stage-9 check).

### Pillar 1 — Full voice-only control
- **Build:** complete declarative **CommandRegistry** (every actionable control → `{phrases[], run()}`), the
  `A11Y.intent()` matcher, the **"Show Numbers" overlay** (`showLabels`) so dynamic/unlabeled controls are
  reachable by "tap N", and **natural-language targeting** (`resolveByName`) so she describes a control
  instead of memorising a label. Web Speech `SpeechRecognition` continues to feed `handle(t)`; WebGPU
  Whisper/Moonshine is the noisy-room upgrade path (shared with pillar 5).
- **Where:** registry + matcher in `a11y.js`; intents added to `handle(t)` (`jarvis_voice.html:718`) and
  `askJarvis()` (`jarvis_live.html:487`); number-badges rendered over `.card/.eb/button`.
- **Acceptance:** with mic only, every primary control on all three pages is reachable by *either* a named
  phrase *or* "show numbers" → "tap N". "What can I say" speaks + shows the sheet.

### Pillar 2 — Read everything aloud
- **Build:** **TTS queue manager** (priority, interrupt/barge-in, rate/pitch from state) over the existing
  `/tts?text=` → `speechSynthesis` chain (`jarvis()` voice `:645`, `jarvisSpeak()` live `:500`, `jarvis()`
  guardian `:100`). **DOM linearizer** (visible text in reading order → string) + **reading cursor**
  highlight. Real source wiring: `readTasks()`→`/tasks`, `readCaptions()`→caption bar buffer; `readFeed()`
  (IG) / `readNotifications()` (S25) call their real endpoints **iff present**, else speak honest
  "not connected."
- **Where:** `a11y.js`; sources are existing endpoints; honest fallback per N3.
- **Acceptance:** "read the screen" reads visible content top-to-bottom with a moving highlight and stops on
  barge-in; "read my tasks" reads the real task list; IG/S25 either read real data or honestly decline.

### Pillar 3 — Switch / dwell / XL / one-tap
- **Build:** **ScanEngine** (auto-scan timer stepping the actionable registry; row-column for dense grids;
  single switch = `switchKeys` / any-key / Bluetooth switch / facial-gesture from pillar 7). **Dwell-click**
  (hover→`SelectionCore.activate` with radial-countdown ring). **XL-target** mode (CSS §5). **One-tap**:
  collapse confirm dialogs / multi-step flows into one dwellable action.
- **Where:** `a11y.js` + `a11y.css`; `SelectionCore.activate` is the shared primitive voice/scan/dwell/gaze
  all funnel through.
- **Acceptance:** with a **single key** (or single gesture) the user can scan to and activate any control;
  dwelling on a control for `dwellMs` activates it with a visible countdown; all targets ≥64px.

### Pillar 4 — Contrast / large text / reduce-motion
- **Build:** extend `body.hc`; add **text-scale slider** (`scale` 100–220 via `--a11y-scale`); add
  **`body.reduce-motion`** honoring `prefers-reduced-motion`; honor `prefers-contrast`/`forced-colors` when
  `contrastAuto`. Unify across **all three pages + dashboard pages** via `a11y.css`.
- **Where:** `a11y.css` + `applyAccess()` delegates to `A11Y.apply()` (`jarvis_voice.html:876`); same panel on
  live + guardian.
- **Acceptance:** every page honors HC, scale, and reduce-motion; OS-level `prefers-*` auto-applies; voice
  page's existing toggles still function.

### Pillar 5 — Always-on captions
- **Build:** **persistent caption bar** `#a11y-captions` (toggle, large, HC, bottom, `aria-live=polite`) fed
  by `A11Y.caption()` from every JARVIS-speech path. **On-device ASR** (Moonshine 26 MB primary;
  Whisper-WebGPU fallback) on the **WebRTC remote audio track** to caption the *other* speaker.
  **Add captions to `guardian.html`** (today has none).
- **Where:** caption bar injected by engine on all pages; `attachVideo()` taps the remote `<video>` stream
  (voice `:806` pc, guardian `:162` pc).
- **Acceptance:** JARVIS speech is captioned live on all three pages incl. guardian; when WebGPU is present
  the remote video speaker is captioned; absent → bar still shows JARVIS captions + honest "live
  transcription needs this device's GPU."

### Pillar 6 — Calm / simplified mode
- **Build:** `body.calm`: density-down, motion off, palette soften (no flashing; alarm-reds reserved for a
  *true* emergency), larger spacing, plain language, **one-thing-at-a-time** progressive disclosure, gentle
  TTS pacing. Trauma-informed, **never patronising**, no covert-surveillance affordance.
- **Where:** `a11y.css` `body.calm` + `A11Y.calm.enter/exit` (also lowers TTS rate, simplifies the panel).
- **Acceptance:** entering calm mode visibly reduces clutter/motion and softens tone without hiding the help
  button; copy reviewed for non-patronising, psychosis-safe language.

### Pillar 7 — Eye-gaze / head-tracking
- **Build:** **MediaPipe Face Landmarker** (WebGPU, on-device) → head-pose/iris **pointer**; **ACAT-style
  facial-gesture switch** (blink/brow/cheek = the trigger); **WebGazer** fallback; **calibration +
  sensitivity UI**. Pointer drives the pillar-3 **dwell-click**. **No frames leave the box.**
- **Where:** `a11y.js` `A11Y.gaze.*`; reuses the camera-permission path already present for WebRTC self-video
  (`getUserMedia` voice `:797`).
- **Acceptance:** with camera permission, a gaze/head cursor moves the pointer and a chosen facial gesture
  activates dwell; calibration runs; absent camera/WebGPU → honest decline, no throw.

### Pillar 8 — Predictive text
- **Build:** **word-completion + next-word + phrase** prediction (`predictionary` on-device, learns her
  vocabulary privately; optional transformers.js tier when WebGPU present) shown as a **suggestion chip-bar**
  above any input; paired with an **on-screen scanning keyboard** (`a11y_keyboard.json` ACAT layout) so
  switch/gaze users type with shrinking keystrokes.
- **Where:** `A11Y.predict.attach(inputEl)` bound to the text inputs (`#say` guardian `:75`, live `#say`
  `:312`, voice `talk()` `:690`); `A11Y.kbd.*` renders `#a11y-kbd`.
- **Acceptance:** typing in any input shows live predictions; selecting one inserts the word; the on-screen
  keyboard is operable by scan/dwell/gaze; the model is per-user + local (no network).

---

## 7. Autonomy wiring — voice + text + `/chat` + agent tool (the hard requirement)

Every capability is reachable through **all four** entry points, each calling the same engine (`A11Y.intent`
or a direct `A11Y.*` method).

### 7.1 Command grammar (shared by voice + text + server)

| Capability | Phrase regex (illustrative) | Engine call |
|---|---|---|
| Read screen | `/\b(read (the )?(screen|page)|read (it|this)( to me| out)?|read everything)\b/` | `A11Y.readScreen()` |
| Read tasks | `/\bread (me )?(my )?tasks?\b/` | `A11Y.readTasks()` |
| Read feed / notifs | `/\bread (my )?(instagram|feed|notifications?)\b/` | `A11Y.readFeed()` / `readNotifications()` |
| Stop talking | `/\b(stop|quiet|hush|be quiet)\b/` | `A11Y.stopSpeaking()` |
| Captions on/off | `/\b(captions?|subtitles?) (on|off)\b/` | `A11Y.set('captions', on)` |
| High contrast | `/\b(high|more) contrast\b/` | `A11Y.set('hc', true)` |
| Bigger / smaller text | `/\b(bigger|larger|smaller) text\b/` | `A11Y.set('scale', ±)` |
| Reduce motion | `/\b(reduce|less|stop) motion\b/` | `A11Y.set('reduceMotion', true)` |
| Calm / simple mode | `/\b(calm|simple|gentle) mode\b/` | `A11Y.calm.enter()` |
| Switch / scanning | `/\b(switch|scanning?) (on|off)\b/` | `A11Y.scan.start/stop()` |
| Dwell click | `/\bdwell( click)? (on|off)\b/` | `A11Y.dwell.enable/disable()` |
| Eye control | `/\b(eye (control|tracking)|track my eyes|control with my eyes)\b/` | `A11Y.gaze.enable()` |
| Big targets | `/\b(big|large) (buttons?|targets?)\b/` | `A11Y.set('xlTargets', true)` |
| Predictive keyboard | `/\b(keyboard|type for me|word help)\b/` | `A11Y.kbd.show()` |
| Show numbers / tap N | `/\bshow (numbers|labels)\b/`, `/\btap (\d+)\b/` | `A11Y.showLabels(true)` / `activateByNumber(n)` |
| What can I say | `/\bwhat can i (say|do)\b/` | `A11Y.showCommands()` |

- **Voice:** add the above as new branches in `handle(t)` (`jarvis_voice.html:718`) **before** the
  build/`openNamed` branches, each `return`-ing after dispatch; unmatched still falls to `talk(t)`.
- **Text:** mirror the same branches in `askJarvis()` (`jarvis_live.html:487`) **before** the `fetch('chat')`
  fallthrough.
- **Implementation note:** to avoid duplicating regex in two files, both routers call
  `if(window.A11Y){const r=A11Y.intent(t,'voice'|'text'); if(r.handled) return;}` first; the grammar lives
  once in `a11y.js`.

### 7.2 Server `/chat` intent — `_a11y_handle`

Copy the `_climate_handle` shape (`dashboard.py:1272`, returns `dict|None`). Insert its call in `/chat`
**before** the climate call (`dashboard.py:1998`) so external chat clients can drive a11y too:

```python
def _a11y_handle(qtext: str, address: str = "ma'am") -> dict | None:
    """Parse an accessibility request → mutate the a11y_state.json mirror → return a spoken confirmation.
    Returns None for non-a11y phrases so /chat falls through to climate/build/chat. Never raises."""
    l = (qtext or "").lower()
    # ...regex table mirroring §7.1; on match: _a11y_write({<field>:<val>}, source='chat'); return
    #    {"a11y": True, "reply": "<spoken confirmation>", "state": <patch>}
    return None
```

Wire-in at `:1998` (immediately before `_climate_handle`):
```python
try:
    _a = _a11y_handle(qtext, body.get("address", "ma'am"))
except Exception:
    _a = None
if _a is not None:
    self._send(json.dumps({"ok": True, **_a}).encode(), "application/json"); return
```

### 7.3 Server mirror — `GET/POST /a11y` + `a11y_state.json`

- **File:** `server/data/a11y_state.json` = `{"state": {…}, "ts": <epoch_ms>, "source": "local|voice|chat|agent"}`.
- **`GET /a11y`** (token-free read, like `/chat` is token-free for her page) in `do_GET` (`dashboard.py:1738`,
  beside `/agent/tools` `:1808`): returns the JSON (or `{"state":{}, "ts":0}` if absent).
- **`POST /a11y`** (token-gated, pattern from `/climate/cmd` `:1964` / the `do_POST` token guard `:2025`):
  body `{state:<partial>, source}` → **merge** into the file, stamp `ts`, write **atomically** (temp file +
  `os.replace`) so concurrent swarms never see a half file. Returns the merged state.
- **Client reconcile:** `A11Y` polls `/a11y` on the existing metrics cadence; if `ts` > local `_ts`,
  `apply()` the remote state (skip the field the user is actively dragging). So a change made on the voice
  page, by JARVIS voice, by `/chat`, or by an agent tool **propagates to every open surface**.
- **Honest fallback (N2):** if `/a11y` 404s/errors, the engine logs once and runs **local-only**
  (localStorage), no throw.

### 7.4 Agent / swarm tools — `accessibility.*`

Register in `register_catalog()` (`catalog.py:720`), pattern from `server.cpu.inspect` (`:727`). All writes
are `risk="safe_write"` (auto-runs per `permission.py:181`, and they write inside the repo → auto). Each
handler reads/merges `server/data/a11y_state.json` (the same atomic write as `_a11y_write`). They appear
automatically in `GET /agent/tools` (`dashboard.py:1610`) and run via `POST /agent/run` →
`CORE.execute(cmd, auto_only=True)` (`:1626`).

```python
register(Tool(id="accessibility.status", name="Accessibility status", risk="safe_read", timeout=10,
    description="Current accessibility state (modes, scale, captions, gaze, etc.).",
    input_schema={"type":"object","properties":{}}, tags=["a11y","status"], handler=_h_a11y_status))

register(Tool(id="accessibility.set_mode", name="Set accessibility mode", risk="safe_write", timeout=10,
    description="Turn an accessibility mode on/off: calm|hc|reduce_motion|captions|caption_video|"
                "scan|dwell|gaze|predict|xl|voice|read_aloud.",
    input_schema={"type":"object","properties":{
        "mode":{"type":"string"}, "on":{"type":"boolean","default":True}}, "required":["mode"]},
    tags=["a11y"], handler=_h_a11y_set_mode))

register(Tool(id="accessibility.text_scale", name="Set text scale", risk="safe_write", timeout=10,
    description="Set the text-scale percent (100–220).",
    input_schema={"type":"object","properties":{"scale":{"type":"integer","default":140}},
        "required":["scale"]}, tags=["a11y"], handler=_h_a11y_text_scale))

register(Tool(id="accessibility.read_screen", name="Read screen aloud", risk="safe_write", timeout=10,
    description="Ask the active surface to read the visible screen (or a region) aloud.",
    input_schema={"type":"object","properties":{"region":{"type":"string"}}},
    tags=["a11y","tts"], handler=_h_a11y_read_screen))

register(Tool(id="accessibility.read_aloud", name="Speak text", risk="safe_write", timeout=10,
    description="Speak a specific string on the active surface (TTS queue).",
    input_schema={"type":"object","properties":{"text":{"type":"string"}},"required":["text"]},
    tags=["a11y","tts"], handler=_h_a11y_read_aloud))

register(Tool(id="accessibility.captions.toggle", name="Toggle captions", risk="safe_write", timeout=10,
    description="Turn the caption bar (and optional video captions) on/off.",
    input_schema={"type":"object","properties":{"on":{"type":"boolean","default":True},
        "video":{"type":"boolean","default":False}}}, tags=["a11y","captions"], handler=_h_a11y_captions))
```

> `read_screen`/`read_aloud` are **commands the client consumes**: the handler writes a one-shot
> `{action:'read_screen'|'speak', text?, ts}` into the mirror's `_cmd` channel; the polling client executes
> and clears it. (Keeps the action client-side where the DOM/TTS actually live, while staying agent-drivable.)

`CATALOG_IDS` (`catalog.py` tail) gains the 6 new ids.

---

## 8. Build order — shippable, lane-safe increments

Each milestone is independently shippable and leaves no JS error / no lifeline risk.

| M | Deliverable | Pillars | Ship gate |
|---|---|---|---|
| M1 | `a11y.css` + `a11y.js` skeleton (`state/set/apply/init/status`, feature-detect), loaded on all 3 pages; migrate `ACCESS`→`A11Y.state`; unify **HC + text-scale + reduce-motion** + `prefers-*`. | 4 | All 3 pages honor HC/scale/motion; voice page's old toggles still work. |
| M2 | TTS queue + DOM linearizer + reading cursor; `readScreen/readTasks`; honest IG/S25. | 2 | "Read the screen / read my tasks" works; barge-in stops it. |
| M3 | Persistent caption bar on all pages incl. **guardian**; on-device ASR for remote video (WebGPU-gated). | 5 | JARVIS captions everywhere; video captions when GPU present, else honest. |
| M4 | ScanEngine + Dwell ring + XL targets + one-tap; `SelectionCore`. | 3 | Single key/gesture reaches + activates any control. |
| M5 | Calm mode. | 6 | Calm visibly simplifies; copy reviewed. |
| M6 | Predictive chip-bar + on-screen scanning keyboard. | 8 | Predictions + on-screen typing operable by scan/dwell. |
| M7 | Gaze/head pointer (MediaPipe → WebGazer fallback) + gesture switch + calibration. | 7 | Gaze cursor + gesture activate dwell; honest decline w/o camera/WebGPU. |
| Mx | **Autonomy wiring woven in as each M lands**: voice intents (`handle`), text intents (`askJarvis`), `_a11y_handle` (`/chat`), `accessibility.*` agent tools, `/a11y` mirror. | all | Each shipped capability is immediately voice + text + agent drivable and syncs across surfaces. |
| M8 | Unified **Accessibility panel** (extend the Care & Health modal `openCare` `:872`) + JARVIS-spoken first-run setup walkthrough. | all | One reachable hub; spoken walkthrough; every toggle present on all surfaces. |

> Autonomy (Mx) is **not** a final phase — each capability's four entry points land *with* that capability,
> so nothing ever ships that the user can't invoke hands-free.

---

## 9. Stage-9 acceptance matrix (the comparison checklist)

A capability **passes** only if it satisfies the 4-way invocation + honesty + no-regression rules.

### 9.1 Per-pillar × per-surface
| Pillar | voice.html | live.html | guardian.html | dashboard `/chat` | agent tool |
|---|---|---|---|---|---|
| 1 voice control | ☐ | ☐ | ☐ | n/a | ☐ `set_mode voice` |
| 2 read aloud | ☐ | ☐ | ☐ | ☐ | ☐ `read_screen/read_aloud` |
| 3 switch/dwell/XL | ☐ | ☐ | ☐ | n/a | ☐ `set_mode scan/dwell/xl` |
| 4 contrast/scale/motion | ☐ | ☐ | ☐ | ☐ | ☐ `set_mode/text_scale` |
| 5 captions (+video) | ☐ | ☐ | ☐ (**new**) | n/a | ☐ `captions.toggle` |
| 6 calm | ☐ | ☐ | ☐ | ☐ | ☐ `set_mode calm` |
| 7 gaze | ☐ | ☐ | ☐ | n/a | ☐ `set_mode gaze` |
| 8 predictive text | ☐ | ☐ | ☐ | n/a | n/a |

### 9.2 Cross-cutting gates
- ☐ **No JS error** in console on any page in any mode (incl. all features off + all on).
- ☐ **pm2 lifeline** unaffected: `_chat/_vitals/_jarvis_chat/task_daemon` bodies unchanged; only additive route + insert.
- ☐ **Honesty:** every unavailable capability speaks/shows "not available/connected" — never fakes.
- ☐ **Privacy:** no camera/audio/keystroke egress (verify in network panel with gaze + captions + predict on).
- ☐ **Cross-surface sync:** a toggle set on one surface (or by voice/chat/agent) propagates to the others via `/a11y`.
- ☐ **Performance:** overlays 60fps over the RTX scene; all overlay motion off under reduce-motion/calm.
- ☐ **Migration:** existing `jv_access` users keep their HC/bigtext/voicecmd settings.
- ☐ **Psychosis-safe copy:** calm-mode + first-run walkthrough language reviewed (non-patronising, no covert surveillance).

---

## 10. Risks & honest-fallback table

| Risk | Mitigation |
|---|---|
| WebGPU/MediaPipe/Moonshine absent | Feature-detect; gaze + video-captions degrade to honest "needs this device's GPU"; base UI unaffected. |
| Web Speech unavailable (non-Chromium) | Voice control degrades to switch/dwell/gaze/keyboard; `startListening()` already no-ops without `SR` (`:707`). |
| Camera denied | Gaze declines gracefully; reuses the existing WebRTC permission flow, no second prompt storm. |
| Concurrent swarm edits `dashboard.py` | Client-first; server delta is additive + atomic-write JSON; no hot-path edits. |
| Overlay fights the Three.js/RTX scene | Single fixed top layer, `transform`-only, `will-change`, fully disabled under reduce-motion/calm. |
| Mirror endpoint missing/old build | `/a11y` 404 → engine runs local-only; never blocks the UI. |
| TTS queue floods / talks over emergency | Priority + barge-in; a *true* emergency (`needHelp()` voice `:719`) pre-empts the queue. |

---

## 11. Defaults locked (no questions asked)

Gaze = **MediaPipe Face Landmarker** (WebGazer fallback) · video ASR = **Moonshine** (Whisper-WebGPU
fallback) · target size = **64px** · scan = **auto default, row-column for grids** · single-switch =
**Space/Enter + any-key + facial-gesture** · prediction = **predictionary on-device** (transformers.js
optional) · captions, read-aloud, XL targets = **ON by default for this user** · calm palette = soften,
alarm-reds reserved for true emergencies · state sync = **poll-reconciled `a11y_state.json`** · model
delivery = **lazy CDN + vendored fallback**, loaded only when its pillar is enabled.

---

## 12. What this spec deliberately does NOT do (scope guard)

- No edits to `_jarvis_chat`/LLM routing, climate, task_daemon, or any pm2-managed service body.
- No new server framework (stays stdlib `http.server`; client **polls**, no SSE/WebSocket).
- No cloud inference for gaze/ASR/prediction (on-device only).
- No fabricated IG/S25 content — real source or honest decline.
- No replacement of existing controls — purely additive + a unifying engine.
