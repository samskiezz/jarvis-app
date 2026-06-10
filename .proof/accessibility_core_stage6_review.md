# STAGE 6 — ACCESSIBILITY CORE · Code Review vs. Plan
## Adversarial Review: Implementation vs. Stage 3 Plan

> **Review Date:** 2026-06-10  
> **Compared Against:** Stage 2 spec + Stage 3 engineering plan + Stage 4 review notes  
> **Current State:** M0 (engine skeleton) shipped; M1–M8 all stubbed (TTS, read-screen, captions, scan/dwell, calm, gaze, predict, panel)  
> **Verdict:** **8 CRITICAL DEFECTS + 4 MAJOR GAPS** found by adversarial code comparison. None are breaking yet; M0 gate is clean. But M1+ phases cannot ship without these fixes.

---

## DEFECT SUMMARY

| # | Severity | Category | Defect | Impact | Fix |
|---|---|---|---|---|---|
| D1 | 🔴 CRITICAL | Completeness | No `accessibility.*` agent tools registered in `catalog.py` | User cannot invoke a11y via agent/swarm; breaks §9.1 pillar×surface matrix | Register 6 handlers + 6 `Tool()` defs in catalog.py (§7.1–7.2 of plan) |
| D2 | 🔴 CRITICAL | Feature | Mirror sync not implemented (startMirror/postMirror/reconcile all stubs) | Cross-surface state changes don't sync; toggle on voice page doesn't appear on live; violates §4.3 | Implement M1 mirror polling (4s cycle) + reconcile with echo-suppression (lines 261–271 of a11y.js) |
| D3 | 🔴 CRITICAL | Feature | `caption()` function is empty stub | Caption sinks exist (voice:634, live:420, guardian:104) but captions never render; user never sees JARVIS speech text | Implement `caption(text, who)` to append to `#a11y-captions` with aria-live polite; manage history + auto-hide timeout |
| D4 | 🔴 CRITICAL | Feature | `_cmd` execution logic missing on client | Server can queue read-screen / speak commands via `_a11y_write(..., cmd={})`, but client won't execute; agent tools can't trigger read-screen | Add `execCmd(cmd)` reconcile hook (a11y.js §4.4) with nonce dedup + one-shot semantics |
| D5 | 🟠 MAJOR | Feature | TTS queue system is empty | All `TTS.speak()`, `A11Y.readScreen()`, `A11Y.readTasks()` are stubs; read-aloud pillar cannot ship | Implement TTS module with priority queue, barge-in, rate/pitch control per plan §3.2 / Stage-2 §4 |
| D6 | 🟠 MAJOR | Feature | SelectionCore.activate() is a stub | The plan specifies this is "the ONE primitive voice/scan/dwell/gaze all resolve into"; 3 pillars depend on it | Implement to set focus + fire click on target element (a11y.js line 235) |
| D7 | 🟠 MAJOR | Feature | a11y.css calm mode is too simplistic | Plan specifies density-down, motion off, larger spacing, plain-language reveal; current rule is just saturate/brightness filter | Expand `body.calm` rule to control spacing, text-decoration, visibility of non-essential elements (plan §3.1 / §6) |
| D8 | 🟠 MAJOR | Consistency | `unavailable()` doesn't actually speak or toast | Function logs to console but never invokes TTS or UI feedback; unavailable capability silently disappears | Wire `unavailable()` to call `TTS.speak()` + render a toast (once TTS is implemented) |
| D9 | 🟡 MINOR | Wiring | postMirror() doesn't POST to /a11y | The plan says `set()` calls `postMirror(patch)` to POST to `/a11y?token=CT`; postMirror is a stub (line 265) | Implement to POST {state, source} to /a11y with CONTROL_TOKEN; fire-and-forget (M1) |
| D10 | 🟡 MINOR | Correctness | `set()` calls postMirror but doesn't await/check result | If POST fails, user sees success (UI applied) but server state is out of sync | Log POST failures once; treat POST as fire-and-forget per §4.2 (minor — spec says "failure is logged once, UI already applied") |
| D11 | 🟡 MINOR | Safety | `apply()` doesn't skip dragging-field reconcile | The plan specifies `activeDragField` skip in reconcile (§4.3); `apply()` has no drag detection | Add optional `skipFields=[]` param to `apply()` to skip certain keys during reconcile (M1) |
| D12 | 🟡 MINOR | Robustness | No heartbeat/retry backoff for mirror polling | Plan §4.3-F specifies `pollFails` counter → speak "sync lost" at 3 fails, stop polling at 10 | Add poll health tracking to startMirror (M1) |

---

## DETAILED DEFECT BREAKDOWN

### D1 🔴 CRITICAL — Missing Agent Tools in catalog.py

**Location:** `server/agent/catalog.py` — no `accessibility.*` tools registered

**What the plan says (Stage 3 §7.1–7.2):**
- 6 handlers: `_h_a11y_status`, `_h_a11y_set_mode`, `_h_a11y_text_scale`, `_h_a11y_read_screen`, `_h_a11y_read_aloud`, `_h_a11y_captions`
- Registered inside `register_catalog()` with `risk="safe_read"|"safe_write"` (auto-run, no user confirm)
- Appear in `GET /agent/tools` → callable via `POST /agent/run`

**Current state:**
- Zero accessibility tools in catalog.py
- Stage 2 spec §9.1 (acceptance matrix) requires agent-tool invocation as one of four entry points:

| Pillar | agent tool required |
|---|---|
| 1 voice control | ☐ `set_mode voice` |
| 2 read aloud | ☐ `read_screen/read_aloud` |
| 3 switch/dwell/XL | ☐ `set_mode scan/dwell/xl` |
| 4 contrast/scale/motion | ☐ `set_mode/text_scale` |
| 5 captions | ☐ `captions.toggle` |
| 6 calm | ☐ `set_mode calm` |
| 7 gaze | ☐ `set_mode gaze` |
| 8 predictive text | ☐ (n/a) |

**Impact:**
- A swarm calling JARVIS to "turn on captions" cannot invoke it via agent tool
- Accessibility is not autonomy-wired (violates the hard user requirement)
- Any user relying on voice + agent automation to control a11y will fail

**Required Fix:**
Add 6 handler functions + 6 `register(Tool(...))` calls in catalog.py (§7.1–7.2 of Stage 3 plan):
```python
def _h_a11y_status(args, ctx):
    from server import dashboard as D
    cur = D._a11y_read()
    # Return state + capabilities summary

def _h_a11y_set_mode(args, ctx):
    # Set mode (calm/hc/reduce_motion/etc.) via _a11y_write

def _h_a11y_text_scale(args, ctx):
    # Set scale 100–220

def _h_a11y_read_screen(args, ctx):
    # Write read-screen _cmd channel

def _h_a11y_read_aloud(args, ctx):
    # Write speak _cmd channel

def _h_a11y_captions(args, ctx):
    # Toggle captions (both bar + video)
```
Then register each via `register(Tool(id="accessibility.*", ...))`.

**Blocker for M8 ship gate:** Yes. Until this is done, agent invocation pillar is incomplete.

---

### D2 🔴 CRITICAL — Mirror Sync Not Implemented

**Location:** `server/a11y.js` lines 261–271 (all stubs)

**What the plan says (Stage 3 §4.3 + Stage 4 refinements):**
- Client polls `GET /a11y` every 4 seconds
- On receipt: if `remote._ts > local._ts`, apply remote state to local (skip `activeDragField`)
- Echo-suppression: client sets local `_ts` before POST; server stamps equal-or-greater; on next GET, `remote._ts <= local._ts` → ignore (echo)
- `_cmd` one-shot execution: nonce dedup + `_lastCmdNonce` in memory
- Retry backoff: after 3 poll fails, speak "sync lost"; stop polling at 10 fails

**Current state:**
```js
function startMirror() {
  // Polling + reconcile will be implemented in M1
}

function postMirror(patch) {
  // POST to /a11y will be implemented in M1
}

function reconcile(remote) {
  // Reconcile logic will be implemented in M1
}
```

**Impact:**
- Toggle HC on voice page → POST succeeds → but live page never sees it (no GET poll loop)
- Every surface runs isolated (localStorage-only)
- Agent tool writes state → live page doesn't sync unless manually refreshed
- Cross-surface sync is **completely broken**

**Evidence:**
- `set()` calls `postMirror()` (line 108–110) but postMirror is a no-op
- `init()` never starts the polling loop (line 26 calls `startMirror()` which is empty)
- No `reconcile()` logic to merge server state back

**Required Fix (M1):**
```js
function startMirror() {
  if (!opts.mirror) return;
  let pollFails = 0;
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch('/a11y');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = await response.json();
      if (remote && remote.ts) {
        pollFails = 0;
        reconcile(remote);
      } else {
        pollFails++;
        if (pollFails === 3) speak('Sync lost.');
        if (pollFails > 10) { clearInterval(pollInterval); speak('Stopped syncing.'); }
      }
    } catch (e) {
      pollFails++;
      if (pollFails === 2) speak('Connection problem.');
      if (pollFails > 10) clearInterval(pollInterval);
    }
  }, pollFails < 3 ? 4000 : 30000);
}

function postMirror(patch) {
  if (!opts.mirror || !window.fetch || !window.CT) return;
  const payload = JSON.stringify({ state: patch, source: state._source });
  fetch(`/a11y?token=${window.CT}`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' }
  }).catch(e => {
    console.error('[A11Y] mirror POST failed:', e);
  });
}

function reconcile(remote) {
  if (!remote || !remote.ts) return;
  if (remote.ts <= state._ts) return;  // echo suppression
  for (const k of Object.keys(remote.state || {})) {
    if (k === activeDragField) continue;  // don't yank slider
    state[k] = remote.state[k];
  }
  state._ts = remote.ts;
  persist();
  apply();
  execCmd(remote._cmd);
}
```

**Blocker for M1 ship gate:** Yes. M1 gate requires cross-surface sync.

---

### D3 🔴 CRITICAL — caption() Function is Empty

**Location:** `server/a11y.js` line 240

**What the plan says (Stage 3 §3.2):**
```js
function caption(text, who) {}  // push a line to the caption bar (who: 'jarvis'|'remote'|'you')
```
And Stage 2 §5 specifies:
> `#a11y-captions`: Persistent bottom-anchored caption bar, large, HC, `aria-live=polite`.

**Current state:**
```js
function caption(text, who) { }  // empty stub
```

But voice page calls it (`:634`):
```js
function cap(t){
  document.getElementById('caption').textContent=t;
  try{window.A11Y&&A11Y.caption(t,'jarvis');}catch(_){}
}
```

And live page (`:420`):
```js
window.jarvisSpeak=function(t){
  try{srlog(t);}catch(e){}
  try{window.A11Y&&A11Y.caption(t,'jarvis');}catch(_){}
}
```

**Impact:**
- User can enable captions toggle (works → sets state), but captions never appear on-screen
- Caption bar `#a11y-captions` exists (created in buildLayer, line 296–303) but is never updated
- Pillar 5 (always-on captions) is non-functional

**Evidence:**
- a11y.js lines 296–303 create the `#a11y-layer` + implicitly the caption bar (CSS specifies it exists)
- But `caption()` doesn't append to `#a11y-captions` or manage the history
- a11y.css `:113–131` specifies the bar styling but no JS fills it

**Required Fix (M2–M3):**
```js
const captionHistory = [];
const MAX_CAPTIONS = 3;

function caption(text, who) {
  if (!text || !state.captions) return;
  try {
    captionHistory.push({ text, who, ts: Date.now() });
    if (captionHistory.length > MAX_CAPTIONS) captionHistory.shift();
    
    const bar = document.getElementById('a11y-captions');
    if (!bar) return;
    
    bar.textContent = captionHistory.map(c => c.text).join(' | ');
    bar.classList.remove('hidden');
    
    // Auto-hide after 6s or on new TTS start
    clearTimeout(captionHistory._hideTimer);
    captionHistory._hideTimer = setTimeout(() => {
      bar.classList.add('hidden');
    }, 6000);
  } catch (e) {
    console.error('[A11Y] caption failed:', e);
  }
}
```

**Blocker for M3 ship gate:** Yes. M3 requires captions on all pages.

---

### D4 🔴 CRITICAL — `_cmd` Execution Logic Missing

**Location:** `server/a11y.js` — no `execCmd()` function anywhere

**What the plan says (Stage 3 §4.4):**
> The server can't touch the DOM/TTS, so `accessibility.read_screen` / `accessibility.read_aloud` write `_cmd={action, text, ts, nonce}`. Client `execCmd(cmd)`:
```js
if !cmd or !cmd.nonce or cmd.nonce === _lastCmdNonce: return   // execute-once
_lastCmdNonce = cmd.nonce
if cmd.action==='read_screen': A11Y.readScreen(cmd.region)
else if cmd.action==='speak':  A11Y.speak(cmd.text,{interrupt:true})
```

**Current state:**
- `reconcile()` is a stub (line 269), so even when server sends `_cmd`, client doesn't process it
- No `execCmd()` function exists
- Agent tools `_h_a11y_read_screen` / `_h_a11y_read_aloud` (missing per D1) would set `_cmd` via `_a11y_write(..., cmd={})` but client is blind to it
- Server-side `_a11y_handle` in `/chat` sets `_cmd` (line 1421–1422) but client ignores it

**Impact:**
- `/chat {q:"read the screen"}` works server-side (writes `_cmd`), but client never executes the read
- Agent tool to read screen will silently fail
- Autonomy for pillar 2 (read-aloud) is broken

**Evidence:**
- dashboard.py line 1421–1422: `_a11y_write({}, "chat", cmd={"action": "read_screen", ...})`
- reconcile stub line 269 never calls execCmd
- No reference to `_lastCmdNonce` anywhere in codebase

**Required Fix (M1 reconcile):**
```js
let _lastCmdNonce = null;

function execCmd(cmd) {
  if (!cmd || !cmd.nonce || cmd.nonce === _lastCmdNonce) return;
  _lastCmdNonce = cmd.nonce;
  try {
    if (cmd.action === 'read_screen') {
      A11Y.readScreen(cmd.region);
    } else if (cmd.action === 'speak') {
      A11Y.speak(cmd.text, { interrupt: true });
    }
  } catch (e) {
    console.error('[A11Y] execCmd failed:', e);
  }
}

// In reconcile():
function reconcile(remote) {
  // ... existing merge logic ...
  execCmd(remote._cmd);
}
```

**Blocker for Mx-b ship gate:** Yes. Cannot ship agent read-screen tool without this.

---

### D5 🟠 MAJOR — TTS Queue System is Empty

**Location:** `server/a11y.js` lines 224–233

**Current state:**
```js
const TTS = {
  speak(text, opts = {}) { },
  stop() { },
  _drain() { }
};
function readScreen(region) { }
function readTasks() { }
function readCaptions() { }
function readFeed() { }
function readNotifications() { }
```

**What the plan says (Stage 3 §3.2, §4.1):**
- TTS module with priority queue (emergency/barge-in/normal/background)
- Wraps existing `jarvis()` (voice), `jarvisSpeak()` (live), `speechSynthesis` fallback
- Queue manager handles rate/pitch from state
- `readScreen()` does DOM linearize + reading cursor
- `readTasks/readFeed/readNotifications` call real endpoints or speak honest "not connected"

**Impact:**
- Pillar 2 (read-aloud) cannot ship
- User cannot hear screen content, task list, or notifications
- TTS priority isn't wired (emergency like `needHelp()` at voice:762 has no way to pre-empt the queue)

**Required Fix (M2):**
Implement full TTS module per Stage 3 spec (200+ lines), including:
- Priority queue data structure
- Barge-in interrupt logic
- Voice selection (jarvis() / jarvisSpeak() / speechSynthesis)
- Rate/pitch control
- DOM linearizer + reading cursor
- Real endpoint wiring for tasks/feed/notifs

**Blocker for M2 ship gate:** Yes.

---

### D6 🟠 MAJOR — SelectionCore.activate() is a Stub

**Location:** `server/a11y.js` line 235

**Current state:**
```js
const SelectionCore = { activate(el) { } };
```

**What the plan says (Stage 3 §3.2, §4.1):**
> SelectionCore.activate(el) — the ONE primitive voice/scan/dwell/gaze all resolve into.

**Spec (§9):**
> Focus discipline: `SelectionCore.activate(el)` sets focus *then* fires the native click so screen readers and the scan ring agree.

**Impact:**
- Pillar 3 (switch/dwell) cannot work (no way to trigger activation)
- Pillar 7 (gaze) cannot work (no way to click via pointer)
- Pillar 1 (voice) can't reach unlabeled controls via "tap N" (no activation path)

**Required Fix (M3–M4):**
```js
const SelectionCore = {
  activate(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      el.click();
      // Or: el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    } catch (e) {
      console.error('[A11Y] SelectionCore.activate failed:', e);
    }
  }
};
```

**Blocker for M4 ship gate:** Yes.

---

### D7 🟠 MAJOR — Calm Mode is Too Simplistic

**Location:** `server/a11y.css` lines 91–95

**Current implementation:**
```css
body.calm {
  --saturate: 0.7;
  --brightness: 1.1;
  filter: saturate(var(--saturate)) brightness(var(--brightness));
}

body.calm * {
  animation: none !important;
  transition: none !important;
}
```

**What the plan says (Stage 2 §6, Stage 3 §3.1):**
> `body.calm`: density-down, palette soften, motion off, larger spacing, plain-language reveal. Trauma-informed, never patronising, no covert-surveillance affordance.

**Spec details (Stage 2 §5):**
> Density-down, motion off, hide non-emergency urgency, larger spacing, plain language, one-thing-at-a-time progressive disclosure, gentle TTS pacing.

**Impact:**
- User with psychosis gets **no density reduction** — same crowded layout, same urgency badges everywhere
- No spacing increase
- Plain-language re-wording not possible in CSS alone (needs JS to swap copy)
- Visual "soften" is achieved by filter, not by reducing clutter

**Required Fix (M5):**
Expand `body.calm` to:
```css
body.calm {
  /* Saturate + brighten */
  --saturate: 0.7;
  --brightness: 1.1;
  filter: saturate(var(--saturate)) brightness(var(--brightness));
}

body.calm * {
  animation: none !important;
  transition: none !important;
}

/* Spacing & density */
body.calm .card, body.calm .eb, body.calm [role="button"] {
  margin: 16px !important;
  padding: 16px !important;
}

/* Hide non-emergency urgency */
body.calm .urgency-badge:not(.a11y-emergency) {
  opacity: 0.3;
}

/* Large text fallback if scale not set */
body.calm {
  --a11y-scale: 1.2;  /* bump up calm mode text by default */
}
```
Plus JS wiring in `calm.enter()` to simplify the panel layout.

**Blocker for M5 ship gate:** Yes. Calm mode is unusable without density reduction.

---

### D8 🟠 MAJOR — unavailable() Doesn't Actually Speak or Toast

**Location:** `server/a11y.js` lines 171–177

**Current state:**
```js
function unavailable(pillar, reason) {
  const msg = `${pillar} not available: ${reason}`;
  if (window.A11Y && window.A11Y.speak) {
    try { window.A11Y.speak(msg); } catch (e) { }
  }
  console.warn('[A11Y]', msg);
}
```

**What the plan says (Stage 2 §2.1, N2):**
> Feature-detect Web Speech, WebGPU, MediaPipe, camera, `/tts`; missing capability → `A11Y.unavailable(pillar)` spoken + visible, never a throw.

**Impact:**
- User enables gaze but WebGPU isn't present → function logs to console only
- No spoken feedback ("gaze not available on this device")
- No visible toast/notification
- User left confused (toggle enabled, nothing happens, no feedback)
- Violates N2: "never a JS error" (correct), but also violates "honest fallback" (not honest if silent)

**Evidence:**
- Line 173 tries to call `window.A11Y.speak()` but TTS.speak is a stub (line 225)
- No `toast()` function or similar UI feedback mechanism
- Just `console.warn()`

**Required Fix (M1+):**
```js
function unavailable(pillar, reason) {
  const msg = `${pillar} not available: ${reason}`;
  try {
    A11Y.speak(msg);  // Once TTS is implemented
  } catch (e) { }
  
  // Toast notification
  try {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; bottom: 80px; left: 16px; right: 16px;
      background: #ff6b6b; color: #fff; padding: 12px 16px;
      border-radius: 4px; z-index: 999999; font-size: 14px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  } catch (e) { }
  
  console.warn('[A11Y]', msg);
}
```

**Blocker for M7 ship gate:** Yes. Gaze/video-captions must honestly degrade.

---

### D9 🟡 MINOR — postMirror() Doesn't POST

**Location:** `server/a11y.js` line 265–267

**Current state:**
```js
function postMirror(patch) {
  // POST to /a11y will be implemented in M1
}
```

**What it should do (Stage 3 §4.2):**
```python
POST /a11y?token=CT {state: {k:v}, source: 'voice'|'text'|'local'}
```

**Impact:**
- `set()` line 108–110 calls postMirror but it's a no-op
- Server state doesn't get updated (only localStorage updates)
- If user refreshes the page, the setting is lost if it wasn't sent to server
- Cross-surface sync can only work if POST succeeds first

**Required Fix (M1):**
Implement per D2 above.

---

### D10 🟡 MINOR — set() Doesn't Handle POST Failures

**Location:** `server/a11y.js` lines 101–111

**Current code:**
```js
function set(key, val, source = 'local') {
  state[key] = val;
  state._ts = Date.now();
  state._source = source;
  persist();
  bridgeLegacy();
  apply();
  if (opts.mirror && (source === 'local' || source === 'voice' || source === 'text')) {
    postMirror({ [key]: val });  // fire-and-forget; no await/check
  }
}
```

**What the plan says (Stage 3 §4.2):**
> fire-and-forget; failure is logged once, UI already applied.

**Current state:**
- Code already treats it as fire-and-forget (doesn't await)
- postMirror is a stub, so not even attempting POST
- No failure logging

**Impact:**
- Minor. Spec says this is intentional fire-and-forget, but needs logging.

**Required Fix (M1):**
```js
if (opts.mirror && ...) {
  postMirror({ [key]: val }).catch(e => {
    if (!postMirror._logged) {
      console.error('[A11Y] mirror POST failed:', e);
      postMirror._logged = true;  // log once
    }
  });
}
```

---

### D11 🟡 MINOR — apply() Doesn't Respect Drag Field

**Location:** `server/a11y.js` lines 117–129

**What the plan says (Stage 3 §4.3):**
> if k === activeDragField: continue — don't yank a slider the user is dragging

**Current state:**
```js
function apply() {
  document.body.classList.toggle('hc', state.hc || state.contrastAuto);
  // ... no activeDragField check
}
```

**Impact:**
- During reconcile, if a user is dragging the text-scale slider on one surface, the slider can be yanked by a remote write from another surface
- Minor UX glitch (uncommon race condition)

**Required Fix (M1):**
Add optional skip parameter:
```js
function apply(skipFields = []) {
  document.body.classList.toggle('hc', skipFields.includes('hc') ? state.hc : state.hc || state.contrastAuto);
  // ... etc
}

// In reconcile():
// detect active drag (pointer down over range input, etc.)
// call apply(activeDragFields)
```

---

### D12 🟡 MINOR — No Poll Health Tracking

**Location:** `server/a11y.js` line 261 (startMirror stub)

**What the plan says (Stage 4 refinements / §4.3-F):**
```js
let pollFails = 0;
setInterval(async () => {
  try {
    remote = await GET /a11y;
    if(remote) pollFails = 0; reconcile(remote);
    else {
      pollFails++;
      if(pollFails === 3) speak("sync lost");
      if(pollFails > 10) stopPolling();
    }
  } catch(_) { ... }
}, pollFails < 3 ? 2000 : 30000);
```

**Current state:**
- startMirror is empty

**Impact:**
- User doesn't know if cross-surface sync is working
- After 3 failures, no audible feedback
- Backoff timer not implemented

**Required Fix (M1):**
Implement per D2 above (includes poll health tracking).

---

## SUMMARY TABLE BY STAGE GATE

| Gate | Status | Blockers |
|---|---|---|
| **M0 (serve bundle)** | ✅ PASS | None — assets serve, engine loads, HC/scale/motion work locally |
| **M1 (unify + mirror sync)** | ❌ FAIL | D2 (startMirror), D9 (postMirror), D11 (apply skipFields), D12 (poll health) |
| **M2 (TTS + read-aloud)** | ❌ FAIL | D5 (TTS queue), D4 (execCmd for read_screen via chat/agent) |
| **M3 (captions + guardian)** | ❌ FAIL | D3 (caption function), D6 (SelectionCore for remote video captions), D4 (execCmd) |
| **Mx-a (voice+text routing)** | ✅ PASS | None — intent dispatch already wired in HTML pages |
| **M4 (scan/dwell)** | ❌ FAIL | D6 (SelectionCore.activate) |
| **M5 (calm)** | ❌ FAIL | D7 (density/spacing), D8 (unavailable toast) |
| **M6 (predict + keyboard)** | ⚠️ PREP | None — keyboard.json exists, predict stubs are in place |
| **M7 (gaze)** | ❌ FAIL | D8 (unavailable feedback) |
| **Mx-b (agent tools)** | ❌ FAIL | **D1** (missing all 6 tool definitions) |
| **M8 (panel + walkthrough)** | ⏳ DEFERRED | Everything above |

---

## CRITICAL PATH

**To unblock M1 → M8 progression:**

1. **IMMEDIATE (blocker for anything beyond M0):**
   - D2: Implement mirror polling + reconcile + echo suppression
   - D1: Register 6 agent tools in catalog.py

2. **M1–M3 parallel:**
   - D5: TTS queue module (reads/feeds pillars 2, 4, 6, 8)
   - D3: caption() function
   - D6: SelectionCore.activate()

3. **M4–M7:**
   - D4: execCmd() in reconcile
   - D7: calm mode density rules
   - D8: unavailable toast + speak

4. **Polish:**
   - D9: postMirror POST implementation
   - D10: POST failure logging
   - D11: apply(skipFields)
   - D12: poll health tracking

---

## VERIFICATION CHECKLIST (what Stage 9 will run)

- ☐ No JS console errors on any page (M0 baseline met, but M1+ will break without fixes)
- ☐ `/a11y` GET/POST round-trip works (✅ exists, but client polling missing)
- ☐ `/chat {q:"read the screen"}` → client executes read (❌ execCmd missing)
- ☐ Agent tool invocation (❌ tools missing)
- ☐ Cross-surface toggle sync within one poll (❌ polling logic missing)
- ☐ Caption bar renders JARVIS speech (❌ caption() stub)
- ☐ TTS queue manages barge-in (❌ TTS module missing)
- ☐ Calm mode visibly simplifies UI (⚠️ filter only, needs density rules)
- ☐ Gaze + predict degrade honestly (⚠️ unavailable() is silent)

---

## NOTES FOR NEXT PHASES

**Do NOT ship M1–M8 until:**
1. D1–D4 are fixed (these block everything)
2. D5–D8 are fixed per milestone (they're gated)
3. D9–D12 are fixed before final Stage 9 acceptance

**The M0 build is safe** — it doesn't break existing features and the routers/toggles are in place. But it's **incomplete** as-is; it's a foundation, not a finished product. Every user-facing capability will fail if they try to use it beyond basic HC/text-scale/reduce-motion toggles on the voice page.

The architecture is sound (§3–§7 of Stage 3 is well-designed), but the implementation didn't go beyond M0. Recommend picking up from here by tackling the critical path in order: D2 (mirror), then D1 (tools), then D5 (TTS), then proceeding linearly through M1–M8 milestones.
