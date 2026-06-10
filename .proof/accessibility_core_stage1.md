# STAGE 1 — ACCESSIBILITY CORE · Research + chosen best-in-class architecture

**Task (queued):** Make the ENTIRE app operable by a SEVERELY disabled, psychologically-vulnerable user
(Hawking-class: limited/unreliable motor control, no reliable tapping) across `server/jarvis_voice.html`
+ `server/jarvis_live.html` + `server/guardian.html` + `server/dashboard.py`. Eight pillars:
(1) full **voice-only** control of every action; (2) **read-everything-aloud** (screen, IG feed, S25
notifications, captions, task list); (3) **switch-access + dwell-click + XL targets + one-tap**;
(4) **high-contrast + large-text + reduce-motion**; (5) **always-on captions** for JARVIS speech AND the
two-way video; (6) a **calm / simplified** mode (psychosis-safe, never patronising); (7) optional webcam
**eye-gaze / head-tracking** pointer (Hawking-style); (8) **predictive text / word completion** for any typing.
Every capability ALSO invokable by JARVIS via **voice + text + the agent/swarm tool layer**. Billion-dollar
polish, all REAL (honest "not connected" on gaps), never break the pm2 lifeline, never leave a JS error.

> First-draft research doc, grounded in the working tree read this stage (line anchors are from the
> **uncommitted** working tree; HEAD is `c36e85df`). Re-grep before editing — the three HTML files and
> `dashboard.py` are all dirty in `git status`.

---

## 0. One-line goal

A single **Accessibility Core engine** (`server/a11y.js`, loaded by all three pages) driven by **one
persisted, cross-surface settings object** and exposed as `window.A11Y`, that makes every existing control
reachable by **voice, switch, dwell, gaze, or one tap** — with read-aloud, live captions, calm mode and
predictive typing layered on top — and a **server-side `a11y_state.json` mirror** so JARVIS (voice, `/chat`
text, AND a registered agent tool) can drive the same state hands-free. Reuse what's already real; build
the missing 80%; fake nothing.

---

## A. REPO FINDINGS — current-state truth table (verified this stage; do **not** rebuild what's real)

### A.1 Per-pillar truth table

| # | Pillar | State today | Evidence (file:line) | What remains to build |
|---|---|---|---|---|
| 1 | Voice-only control | ⚠️ **PARTIAL** | `jarvis_voice.html` `handle(t)` regex router `:717-729`; `startListening()` `:707-715` (`en-GB`, continuous, interim). Mirror in `jarvis_live.html` `askJarvis()` `:487-501`. | Only ~8 intents each; most on-screen controls are NOT voice-reachable. Need a **complete command grammar + "show labels/numbers" fallback** so *every* control is speakable. |
| 2 | Read-everything-aloud | ⚠️ **PARTIAL** | TTS via `/tts?text=` audio + `speechSynthesis` fallback: `jarvis()` voice `:633-655`, `jarvisSpeak()` live `:411-421`, `jarvis()` guardian `:100`. ARIA live regions exist (`#caption`/`#srlog` voice; `#crystal`/`#coreSay`/`#srlog` live). | No **Select-to-Speak / read-the-whole-screen**; no read-IG-feed, read-S25-notifications, read-task-list. Need a **TTS queue manager + DOM linearizer + reading cursor**, wired to real data sources (honest "not connected"). |
| 3 | Switch / dwell / XL targets / one-tap | ❌ **MISSING** | Buttons are native + ≥48px (voice), 56px (guardian); keyboard Enter/Space works; no scanning, no dwell, no global size scaling. | Build a **scanning engine** (auto/row-column, single-switch), **dwell-click** (hover→click w/ radial countdown), **XL-target mode**, **one-tap flow collapse**. |
| 4 | Contrast / large-text / reduce-motion | ⚠️ **PARTIAL** | `body.hc` `:224-228` + `body.bigtext` `:229-233` + toggles in Care panel `:329-335`, persisted `jv_access` `:862`, applied via `applyAccess()`. **Only on `jarvis_voice.html`.** | No reduce-motion anywhere; no `prefers-contrast`/`forced-colors`; one-step bigtext (no scale slider); `jarvis_live.html`/`guardian.html`/dashboard pages have **no toggles**. Unify across all surfaces. |
| 5 | Always-on captions | ⚠️ **PARTIAL** | JARVIS-speech captions exist (`#caption` voice `:249`, `#crystal` live `:307`). | **No captions for the two-way video remote speaker** anywhere; **guardian.html has no captions at all** (identified gap). Need a **persistent caption bar** + **on-device ASR** for the WebRTC remote track. |
| 6 | Calm / simplified mode | ❌ **MISSING** | — | New `body.calm` mode: density-down, motion-off, soften palette, plain language, one-thing-at-a-time, suppress non-emergency urgency. Trauma-informed. |
| 7 | Eye-gaze / head-tracking | ❌ **MISSING** | Webcam already requested for WebRTC self-video (`getUserMedia`), so camera-permission path exists. | Build on-device **MediaPipe Face Landmarker** head-pose + iris pointer, ACAT-style facial-gesture "switch", **WebGazer** fallback, calibration UI. No video leaves the box. |
| 8 | Predictive text | ❌ **MISSING** | Text inputs: guardian `#say` `:75`, voice internal `talk()` `:690`, live `#say` `:312`. | On-screen **scanning keyboard** + **word/next-word/phrase prediction** (on-device, learns privately). |

### A.2 The wiring substrate we REUSE (verified anchors)

| Capability | Symbol / location | Anchor |
|---|---|---|
| Voice intent router (client) | `handle(t)` regex → handler → `talk(t)` fallthrough | `jarvis_voice.html:717-729` |
| Text/chat intent router (client) | `askJarvis()` regex → handler → `fetch('chat')` fallthrough | `jarvis_live.html:487-501` |
| Server intent router | `/chat` handler: `_climate_handle()` → build-regex → `_jarvis_chat()` | `dashboard.py:1985-2024` |
| Climate-style "parse → act → return dict\|None" pattern to copy | `_climate_handle(qtext, address)` | `dashboard.py:1272-1320` |
| Persisted a11y state + apply | `window.ACCESS = load('jv_access',{...})` `:862`; `setAccess(k,v)` `:883-886`; `applyAccess()` | `jarvis_voice.html` |
| TTS endpoint + fallback chain | `/tts?text=` audio element → `speechSynthesis.speak()` | all 3 pages |
| ARIA live regions already present | `#caption`/`#srlog` (voice), `#crystal`/`#coreSay`/`#srlog` (live) | voice `:249,:293`; live `:304,:307,:359` |
| WebRTC two-way video (caption source) | `RTCPeerConnection`, remote/self `<video>`, H.265→VP9→H.264 codec pref | voice `:792-840`; guardian `:92-120` |
| Agent **tool registry** (for the swarm/agent layer) | `Tool` dataclass `:74-83`; `register(tool)` `:102-106`; `call(id,args,ctx)` `:180-209` | `server/agent/tools.py` |
| Agent tool **catalog** (define + register on import) | `register_catalog()` `:720-862`; example `server.cpu.inspect` `:158-191,:727-731`; `CATALOG_IDS` `:865` | `server/agent/catalog.py` |
| Agent **permission** gate (risk → auto/confirm) | `VALID_RISKS` `:32-40`; `decide()` `:140-259` (`safe_read`/`safe_write`→auto) | `server/agent/permission.py` |
| Agent **dispatch** (plan → tool call) | `_launch_step()` `:429-473`; `_process_step()` `:497-532`; `tools.call_handler()` | `server/agent/core.py` |
| Dashboard ↔ agent bridge (already exists) | `GET /agent/tools` (catalog), `POST /agent/chat` → `CORE.execute(cmd, auto_only=True)` | `dashboard.py:1610-1632` |
| Status-file precedent for a client-polled mirror | `server/data/watchdog_status.json` (untracked, polled) | working tree |

**Headline:** the **router seams and the agent-tool mechanism already exist and are clean** — voice/text/agent
control is a matter of *registering new intents/tools*, not new infrastructure. The genuinely net-new build
is the **client-side Accessibility Core engine** (scanning, dwell, gaze, captions-from-video, read-screen,
predictive keyboard, calm mode) + a **tiny server `a11y_state.json` mirror** that makes every toggle
drivable by voice, `/chat` text, and an agent tool — and lets state **sync across all three surfaces**.

### A.3 Critical constraints found in the tree

- **No shared intent file** — voice/live/server each own their regex. New intents must be added in **all
  relevant surfaces** (the Core engine centralizes the *handlers*; the routers just call into it).
- **`dashboard.py` is stdlib `http.server` (synchronous, no Flask)** — no SSE/WebSocket push; the client
  **polls** (`/metrics`, `/tasks`). ⇒ the a11y server mirror must be **poll-reconciled**, not pushed.
- **Lane safety:** other swarms edit `dashboard.py`/services concurrently → corruption risk. ⇒ ship the
  engine **client-side first** (`server/a11y.js` + per-page `<script src>` + small CSS), and keep the
  server delta to **one additive endpoint** + one JSON file (no edits to hot functions).
- **pm2 lifeline + "never a JS error":** the engine must **feature-detect everything** (Web Speech,
  WebGPU, MediaPipe, camera) and degrade to honest "not available on this device" — never throw, never
  block the existing UI.

---

## B. 2026 TECH FINDINGS — what to adopt, per pillar (best-in-class, on-device, private)

**1 · Voice-only control.** Keep Web Speech `SpeechRecognition` for the always-listening command grammar
(zero-install, instant), but adopt the **Apple-Intelligence Voice-Control pattern**: (a) a **complete,
declarative command registry** covering *every* actionable control, (b) a **"Show Labels / Show Numbers"
overlay** so even unlabeled/dynamic controls are reachable by saying a number ("tap 7"), and (c)
**natural-language targeting** ("the call-family button") resolved against the registry — so she never has to
memorize exact labels. For higher-accuracy or noisy-room dictation, **on-device Whisper/Moonshine via WebGPU**
is the upgrade path (same model reused for captions, pillar 5).

**2 · Read-everything-aloud.** Build a **Select-to-Speak / Screen-Reader-lite**: a **DOM linearizer**
(visible, in-reading-order text → one string) feeding a **TTS queue manager** (priority, barge-in/stop,
rate/pitch from settings) on top of the existing `/tts`→`speechSynthesis` chain, with a moving **reading
cursor** highlight (Android *Select to Speak* model). Wire real sources: task list (`/tasks`), captions, and
— where a real feed exists — IG feed + S25 notifications (honest "not connected" otherwise). ARIA `aria-live`
stays for incidental updates; the queue handles intentional "read this / read screen".

**3 · Switch / dwell / XL / one-tap.** Implement the **AAC scanning** standard: **auto-scan** (highlight
steps through groups on a timer; one switch = select) + **row-column scan** for dense grids, configurable
speed/dwell, **single-switch** mapped to Space/Enter/any-key/external Bluetooth switch/blink/facial-gesture.
**Dwell-click**: hover-to-click with a **radial countdown ring** (Apple *Dwell Control* / Eye-Tracking
model). **XL-target mode**: global CSS bumping every interactive target to **≥44px (WCAG 2.5.8 AA), default
64px** for this user. **One-tap**: collapse confirm-dialogs/multi-step flows into single dwellable actions.

**4 · Contrast / text / motion.** Extend `body.hc`/`body.bigtext`; add **`body.reduce-motion`** that *also*
honors `@media (prefers-reduced-motion: reduce)`; honor **`@media (prefers-contrast)`** + **`forced-colors`**
(Windows/high-contrast themes); replace one-step bigtext with a **text-scale slider** (`--a11y-scale`, e.g.
100–220%) using `rem`/`clamp()`. WebAIM Million 2025: contrast is the #1 failure — get it provably right.
Apply to **all three pages + dashboard-served pages** via the shared CSS.

**5 · Always-on captions.** Unify JARVIS-speech captions into a **persistent caption bar** (toggle, large,
high-contrast, bottom-anchored, `aria-live=polite`). For the **two-way video**, run **on-device ASR on the
WebRTC remote audio track** to caption the *other* speaker — **Moonshine** (26 MB, lowest latency, built for
live streaming) or **Whisper-WebGPU / Cohere-Transcribe-WebGPU** (Apache-2.0, browser, audio never leaves
device). **Add captions to `guardian.html`** (current gap: carer hears JARVIS but sees nothing).

**6 · Calm / simplified.** 2026 "calm interface" + **trauma-informed** design: `body.calm` → reduce density,
motion off, **soften the palette** (no flashing, no alarm-reds except a *true* emergency), larger spacing,
**plain language**, **one-thing-at-a-time / progressive disclosure**, predictable nav, gentle TTS pacing.
Psychosis-safe: nothing sudden, nothing that implies surveillance without consent, **never patronising** copy.

**7 · Eye-gaze / head-tracking.** Primary: **MediaPipe Face Landmarker** (real-time 3D face landmarks + iris
+ blendshapes, WebGPU, on-device) → head-pose/iris **pointer**, with **ACAT-Vision-style facial-gesture
triggers** (eyebrow raise / cheek twitch / blink = the "switch", exactly how Hawking's toolkit worked).
Fallback/calibration path: **WebGazer.js** (regression on webcam, runs fully client-side). Pointer drives the
**dwell-click** from pillar 3. **All inference on-device; no frames leave the box.** Calibration + sensitivity UI.

**8 · Predictive text.** AAC three-method model — **word-completion + next-word + multi-word/phrase**. Tier 1
(instant, tiny): dictionary/n-gram (`asterics/predictionary`) that **learns her vocabulary on-device, privately**.
Tier 2 (optional, richer): a small **transformers.js** LM for next-phrase, WebGPU when present. Pair with an
**on-screen scanning keyboard** (ACAT layout) so switch/gaze users can type with prediction shrinking keystrokes.

---

## C. BIG-TECH ARCHITECTURE PATTERNS — how Apple / Google / Intel / Meta / Palantir / NVIDIA would build it

- **Apple (the polish + interaction bar).** *Switch Control* + *Dwell Control* + *Eye Tracking* are **one
  composable stack**: Eye Tracking feeds a pointer, Dwell performs the action, Switch is an alternate
  selector — **the same selection primitive, many input front-ends.** *AssistiveTouch* radial menu = one
  reachable hub for everything. Apple-Intelligence *Voice Control* = **natural-language targeting** (describe
  a control, don't memorize it). **Adopt:** model our engine as *one selection core* with pluggable inputs
  (voice / switch / dwell / gaze) and a single dwell primitive — not four separate features.
- **Google (the on-device-AI + "read/look" apps).** *Select to Speak* (point → hear it read), *Look to
  Speak* (eye-gaze phrase selection, **data never leaves the phone**), *Project Activate* (facial gesture →
  action), *Android Accessibility Suite* as a **layer over any app**. **Adopt:** privacy-by-default
  on-device inference; gesture→action mapping; "read aloud" as a first-class verb.
- **Intel / ACAT (the Hawking ground truth).** *Assistive Context-Aware Toolkit* = **switch-scanning UI +
  predictive language model + speech synthesis + webcam facial-gesture triggers (cheek twitch / eyebrow
  raise)**, fully configurable, open-source. This is **literally the proven reference design** for this exact
  user. **Adopt:** its pillars 3+7+8 architecture (scan grammar + gesture switch + word prediction) directly.
- **Meta (UX velocity + captions).** Always-on **live captions** as a platform default; reduce-motion and
  contrast as global toggles. **Adopt:** captions everywhere, on by default for this user.
- **Palantir (ontology/data depth).** Treat the a11y system as an **ontology of Capabilities → Inputs →
  Targets → Actions** with one **state object** as the single source of truth, mirrored server-side and
  **driveable by the agent layer as typed tools** (auditable, permissioned). **Adopt:** `a11y_state.json`
  as the typed source of truth; agent tools as the typed action surface; everything observable/loggable.
- **NVIDIA (graphics quality).** Dwell rings, scan highlights, gaze cursor and caption bar must be
  **GPU-cheap, 60fps, Hollywood-clean** — and **must not fight the Three.js/RTX scenes** (composited as a
  top layer, `will-change`, `transform`-only animations, fully disabled under reduce-motion/calm).

---

## D. RECOMMENDED BEST-IN-CLASS ARCHITECTURE TO ADOPT

### D.1 Shape: one engine, one state, many front-ends

```
                       ┌──────────────────────────────────────────────┐
   INPUTS (pluggable)  │            ACCESSIBILITY CORE                 │  OUTPUTS
   ──────────────────  │              window.A11Y                     │  ─────────────────
   • Web Speech voice ─┤  • CommandRegistry  (every control, declared) ├─ • TTS queue (read aloud)
   • Switch (key/BT/   │  • SelectionCore    (one dwell/select prim.)  │  • Caption bar (speech+video)
     blink/gesture) ───┤  • ScanEngine       (auto / row-column)       ├─ • Scan highlight / dwell ring
   • Dwell (hover) ────┤  • GazePointer      (MediaPipe→pointer)       │  • Gaze cursor
   • Gaze (webcam) ────┤  • PredictiveKbd     (on-screen + prediction) ├─ • Visual modes (hc/scale/
   • One-tap touch ────┤  • Settings (jv_access++)  ←→  a11y_state.json│     reduce-motion/calm)
                       └──────────────────────────────────────────────┘
                          ▲ persisted localStorage  ▲ polled server mirror
        DRIVEN BY:  user UI toggles · JARVIS VOICE intent · /chat TEXT intent · AGENT TOOL
```

- **Single source of truth:** extend the existing `ACCESS`/`jv_access` object into a full **`A11Y.state`**
  (`{voiceCmd, readAloud, scan, scanSpeed, dwell, dwellMs, xlTargets, scale, hc, contrastAuto, reduceMotion,
  captions, captionVideo, calm, gaze, gazeSensitivity, predict, kbd}`). One `A11Y.set(key, value)` →
  persists locally **and** `POST`s to the server mirror; one `A11Y.apply()` reconciles DOM/CSS.
- **`server/a11y.js`** is loaded by all three pages (`<script src="a11y.js">`) + a shared **`a11y.css`** of
  CSS custom properties and `body.*` mode classes. `jarvis_live.html`/`guardian.html` gain the same toggles
  the voice page already has — **unification, not duplication.**
- **Selection primitive once:** ScanEngine, GazePointer, Dwell and Voice all resolve to the *same*
  `SelectionCore.activate(target)` — exactly the Apple model.

### D.2 Server mirror (the one additive backend delta — lane-safe)

- New file **`server/data/a11y_state.json`** (like `watchdog_status.json`): `{state:{…}, ts, source}`.
- New **`GET/POST /a11y`** in `dashboard.py do_GET/do_POST` (additive, no edits to `_chat`/`_vitals`):
  `GET` returns the JSON; `POST` (control-token-gated, like `/task`) merges a partial state + stamps `ts`.
- Client polls `/a11y` on the existing cadence; if `ts` is newer than local, **reconcile** → so a setting
  changed on the voice page, by JARVIS voice, or by an agent tool **propagates to every surface**.
- Honest fallback: if the endpoint is unavailable, the engine runs **fully local** (localStorage only).

### D.3 Autonomy wiring — voice + text + agent tool for EVERY capability (the hard requirement)

For each capability, register **all four** entry points (handlers all call the same `A11Y.set/do`):

1. **Voice** — add intents to `handle(t)` (`jarvis_voice.html:717-729`), e.g.
   `/\b(read (the )?(screen|page)|read (it|this) (to me|out)|read everything)\b/ → A11Y.readScreen()`;
   `/\b(eye (control|tracking)|track my eyes|control with my eyes)\b/ → A11Y.set('gaze',true)`;
   `/\b(calm|simple) mode\b/`, `/\b(bigger|larger) text\b/`, `/\b(high|more) contrast\b/`,
   `/\b(captions?|subtitles?) (on|off)\b/`, `/\b(switch|scanning) (on|off)\b/`, `/\bdwell\b/`,
   `/\bwhat can i say\b/ → A11Y.showCommands()`, plus **"show labels / tap N"** for any control.
2. **Text** — mirror the same intents in `askJarvis()` (`jarvis_live.html:487-501`).
3. **Server `/chat`** — add an `_a11y_handle(qtext) → dict|None` *before* climate (copy the
   `_climate_handle` shape, `dashboard.py:1272-1320`); on match, write the server mirror + return a spoken
   confirmation so it works even from external chat clients.
4. **Agent/swarm tool** — register in `server/agent/catalog.py register_catalog()` (pattern from
   `server.cpu.inspect`), risk `safe_write` (auto-runs), each handler writing `a11y_state.json`:
   - `accessibility.set_mode` (`{mode, on}` — calm/hc/reduce_motion/captions/scan/dwell/gaze/predict/xl)
   - `accessibility.text_scale` (`{scale}`)
   - `accessibility.read_screen` (`{region?}`) · `accessibility.read_aloud` (`{text}`)
   - `accessibility.gaze.enable` / `.disable` · `accessibility.scan.start` / `.stop`
   - `accessibility.captions.toggle` · `accessibility.status` (`safe_read`, returns current state)

   These appear automatically in `GET /agent/tools` and are callable via `POST /agent/chat` →
   `CORE.execute(...)` (`dashboard.py:1610-1632`) — so the swarm can set her accessibility hands-free.

### D.4 Build order (each step shippable, lane-safe, no lifeline risk)

1. **Foundations:** `a11y.css` + `a11y.js` skeleton (`A11Y.state/set/apply`, feature-detect), load on all 3
   pages; migrate `ACCESS` → `A11Y.state`; **unify hc/bigtext/reduce-motion + add text-scale slider** across
   all pages. *(Pillars 4 + groundwork.)*
2. **Read-everything-aloud:** TTS queue + DOM linearizer + reading cursor; wire `/tasks`, captions; IG/S25
   honest-or-real. *(Pillar 2.)*
3. **Captions:** persistent caption bar for JARVIS speech on all pages incl. guardian; on-device ASR
   (Moonshine/Whisper-WebGPU) for the WebRTC remote track. *(Pillar 5.)*
4. **Switch + dwell + XL + one-tap:** ScanEngine + Dwell ring + XL-target mode. *(Pillar 3.)*
5. **Calm mode.** *(Pillar 6.)*
6. **Predictive keyboard** (on-screen + prediction, learns privately). *(Pillar 8.)*
7. **Eye-gaze / head-tracking** (MediaPipe primary, WebGazer fallback, gesture switch, calibration). *(Pillar 7.)*
8. **Server mirror `/a11y` + agent tools + voice/text/`/chat` intents** woven in as each capability lands
   (do #8's wiring incrementally so every shipped capability is immediately voice/text/agent-drivable).
9. **Unified Accessibility panel** (extend the Care & Health modal) + **JARVIS-spoken setup walkthrough**.

---

## E. RISKS / NON-NEGOTIABLES

- **Never throw / never break the lifeline:** feature-detect Web Speech, WebGPU, MediaPipe, camera, `/tts`,
  `/a11y`; every path degrades to honest "not available on this device" — pm2 services untouched.
- **Privacy:** gaze/ASR/prediction inference is **100% on-device**; no camera frames or keystrokes leave the
  box; prediction model is per-user and local. Psychosis-safe: no covert surveillance affordances.
- **Performance:** all overlays composited above Three.js/RTX, `transform`-only, 60fps, and **fully off**
  under reduce-motion/calm so they never fight the cinematic scenes.
- **Lane safety:** client-first; the only backend delta is **one additive `/a11y` route + one JSON file** —
  no edits to `_chat`/`_vitals`/`task_daemon` hot paths (avoids the concurrent-swarm corruption risk).
- **Honesty:** IG feed / S25 notifications read-aloud only if a **real** source exists this stage; otherwise
  spoken "I'm not connected to that yet" — never fabricated content.

## F. DEFAULTS CHOSEN (no questions asked)

Gaze engine = **MediaPipe Face Landmarker** (WebGazer fallback) · ASR for captions = **Moonshine**, Whisper-
WebGPU fallback · target size = **64px** (exceeds WCAG 2.5.8) · scan = **auto-scan default, row-column for
grids** · single-switch keys = **Space/Enter + any-key + facial-gesture** · prediction = **predictionary
on-device** (transformers.js optional tier) · captions = **ON by default for this user** · calm mode palette
= soften, alarm-reds reserved for true emergencies · state sync = **poll-reconciled `a11y_state.json`**.

---

## G. SOURCES

Eye-gaze / head-tracking: [WebGazer.js](https://webgazer.cs.brown.edu/) · [WebGazer GitHub](https://github.com/brownhci/WebGazer) ·
[MediaPipe Face Landmarker in browser](https://dev.to/kenzic/real-time-face-tracking-in-the-browser-with-mediapipe-22c9) ·
[WebEyeTrack (2025 on-device gaze)](https://arxiv.org/html/2508.19544v1).
Switch / scanning / dwell: [Apple Switch Control (tecla)](https://gettecla.com/blogs/news/15538916-what-is-switch-control-mode-in-apples-ios) ·
[Android Switch Access](https://play.google.com/store/apps/details?id=com.google.android.accessibility.switchaccess) ·
[AssistiveWare scanning modes](https://www.assistiveware.com/support/proloquo2go/alternative-access/scanning-mode).
Predictive text / AAC: [predictionary (JS)](https://github.com/asterics/predictionary) ·
[AssistiveWare PolyPredix](https://assistiveware.com/blog/polypredix) ·
[Transformers.js](https://huggingface.co/docs/transformers.js/index) ·
[Predictive text 2026](https://www.clevertype.co/post/ai-predict-keyboard-understanding-predictive-text-technology-in).
On-device captions / ASR: [Moonshine](https://github.com/moonshine-ai/moonshine) ·
[Real-time Whisper WebGPU (Xenova)](https://huggingface.co/spaces/Xenova/realtime-whisper-webgpu) ·
[Cohere Transcribe in-browser WebGPU](https://themenonlab.blog/blog/cohere-transcribe-webgpu-browser-speech-recognition).
Read-aloud / ARIA live: [MDN aria-live](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live) ·
[MDN live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions) ·
[Android Select to Speak](https://support.google.com/accessibility/android/answer/7349565).
Calm / cognitive / trauma-informed: [UX/UI 2026 calm interfaces](https://elements.envato.com/learn/ux-ui-design-trends) ·
[Trauma-informed UX](https://uxcontent.com/a-guide-to-trauma-informed-content-design/) ·
[W3C Making Content Usable (cognitive)](https://www.w3.org/TR/WCAG22/).
Standards: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) ·
[Target Size 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) ·
[prefers-contrast (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-contrast).
Big-tech: [Apple accessibility 2026 newsroom](https://www.apple.com/newsroom/2026/05/apple-unveils-new-accessibility-features-and-updates-with-apple-intelligence/) ·
[Apple Eye Tracking](https://www.apple.com/newsroom/2024/05/apple-announces-new-accessibility-features-including-eye-tracking/) ·
[Google Look to Speak](https://blog.google/outreach-initiatives/accessibility/look-to-speak/) ·
[Google Project Activate](https://support.google.com/accessibility/android/answer/11348365) ·
[Intel ACAT (Hawking) GitHub](https://github.com/intel/acat) · [ACAT overview](https://openassistive.org/item/acat/).
