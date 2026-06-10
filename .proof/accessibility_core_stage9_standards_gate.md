# STAGE 9 STANDARDS GATE — ACCESSIBILITY CORE

**Date:** 2026-06-10 14:30 UTC  
**Auditor:** Claude Agent SDK (Opus 4.8)  
**Standard:** Billion-Dollar-Tech Bar (Apple/Google/Meta/Palantir/NVIDIA production quality)  
**Task:** Verify Stage 8 FINAL REVIEW claims against world-class standards

---

## EXECUTIVE FINDING

**Stage 8 claim:** "✅ SHIP-READY — All 8 pillars verified; no blockers; 5/5 confidence"

**Stage 9 verdict:** ⚠️ **ELEVATED FINDINGS — Ship M0-M1 with 5 critical-path fixes + 5 polish uplift commits**

The foundation is **solid and lane-safe**, but 10 gaps prevent claiming billion-dollar-tech quality:
- 5 are **critical-path** (ship-blocking if user encounters them; easy fixes)
- 5 are **polish/durability** (shipping without them is honest but regrettable)

---

## CRITICAL-PATH FINDINGS (FIX BEFORE M1 GATE)

### F1: Mirror Polling NOT Adaptive (⚠️ **NETWORK STORM RISK**)

**Location:** `a11y.js:472–498`  
**Issue:** 
```javascript
setInterval(async () => { /* fetch /a11y */ }, 4000); // FIXED 4s, no backoff
// Comment: "D12: no backoff yet, add adaptive backoff in M1b"
```

**Problem:**
- On bad networks (WiFi dropout, mobile switch), client hammers `/a11y` every 4s indefinitely
- 50 simultaneous users = 750 requests/min to mirror endpoint
- No exponential backoff means network thrashing on outage
- User hears "sync lost" but then recovers without feedback

**Impact:** Medium — won't break lifeline, but could spike server CPU on bad days

**Fix (5 min):**
```javascript
// Adaptive backoff: 4s → 30s → 120s → stop at 10 fails
function startMirror() {
  let pollFails = 0;
  let pollInterval = 4000;
  
  _pollInterval = setInterval(async () => {
    try {
      const remote = await fetch('/a11y');
      if (remote.ok) {
        pollFails = 0;
        pollInterval = 4000; // reset on success
        reconcile(await remote.json());
      } else {
        pollFails++;
      }
    } catch (e) {
      pollFails++;
    }
    
    if (pollFails === 3) TTS.speak('Sync lost.');
    if (pollFails > 10) {
      clearInterval(_pollInterval);
      TTS.speak('Stopped syncing.');
      return;
    }
    
    // Exponential backoff: 4s → 10s → 30s
    if (pollFails > 3) pollInterval = Math.min(120000, pollInterval * 1.5);
    clearInterval(_pollInterval);
    _pollInterval = setInterval(/* repeat */, pollInterval);
  }, pollInterval);
}
```

**Severity:** 🔴 **CRITICAL** — Ship-blocking only if user is on bad network for extended period

---

### F2: Drag-Field Protection TODO (🔴 **UX BUG**)

**Location:** `a11y.js:460`  
```javascript
const activeDragField = null; // TODO: detect if user is actively dragging a slider
```

**Problem:**
- User drags volume slider on voice page
- Meanwhile, live page's mirror write updates state
- Reconcile yanks the slider mid-drag, breaking UX
- Disabled user with fine motor control issues gets jerked around

**Impact:** High — directly breaks gesture interaction for motor-impaired user

**Fix (10 min):**
```javascript
// In reconcile(), skip fields user is actively dragging
function reconcile(remote) {
  const activeDragFields = [];
  document.querySelectorAll('input[type="range"]:active, [draggable="true"]:active')
    .forEach(el => {
      if (el.name) activeDragFields.push(el.name);
      if (el.id) activeDragFields.push(el.id);
    });
  
  for (const k of Object.keys(remote.state || {})) {
    if (activeDragFields.some(f => k.includes(f))) continue; // skip
    if (k.startsWith('_')) continue;
    state[k] = remote.state[k];
  }
  // ... apply()
}
```

**Severity:** 🔴 **CRITICAL** — Direct UX break for target user

---

### F3: readFeed() & readNotifications() Are NOOPs (🟡 **HONEST BUT INCOMPLETE**)

**Location:** `a11y.js:353–359`
```javascript
function readFeed() {
  unavailable('read feed', 'not implemented');
}
function readNotifications() {
  unavailable('read notifications', 'not implemented');
}
```

**Problem:**
- Stage 8 claims "✅ READ-EVERYTHING-ALOUD — all 5 read functions implemented"
- Actually: 3/5 are real (readScreen, readTasks, readCaptions); 2/5 are stubs
- User asks to "read my notifications" → gets "not implemented" instead of actual notifications
- Violates the "never fake, always honest" rule but at the wrong level

**Impact:** Medium — messaging says we can do it, user finds out we can't

**Fix (15 min per function):**
```javascript
function readNotifications() {
  try {
    TTS.speak('Reading notifications...', { priority: 'barge-in' });
    fetch('/notifications?limit=5')
      .then(r => r.json())
      .then(data => {
        if (data?.length) {
          const list = data.map((n, i) => `${i + 1}. ${n.title}`).join('. ');
          TTS.speak(list);
        } else {
          TTS.speak('No new notifications.');
        }
      })
      .catch(() => unavailable('read notifications', 'server unavailable'));
  } catch (e) {
    unavailable('read notifications', e.message);
  }
}

function readFeed() {
  try {
    TTS.speak('Reading your feed...', { priority: 'barge-in' });
    fetch('/feed?limit=3')
      .then(r => r.json())
      .then(data => {
        if (data?.items?.length) {
          const list = data.items.map((item, i) => 
            `${i + 1}. ${item.author}: ${item.caption}`
          ).join('. ');
          TTS.speak(list);
        } else {
          TTS.speak('No feed items yet.');
        }
      })
      .catch(() => unavailable('read feed', 'server unavailable'));
  } catch (e) {
    unavailable('read feed', e.message);
  }
}
```

**Severity:** 🟡 **MAJOR** — Feature advertised but not functional; breaks user expectation

---

### F4: TTS Queue Has No Timeout (🟡 **HANG RISK**)

**Location:** `a11y.js:275–306`
```javascript
_drain() {
  if (this._speaking || !this._queue.length) return;
  this._speaking = true;
  const item = this._queue.shift();
  const doSpeak = () => {
    try {
      if (typeof jarvis === 'function') {
        jarvis(item.text, { rate, pitch });
        // ISSUE: no timeout if jarvis() never completes
      } else if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.onend = () => { this._speaking = false; this._drain(); };
        // ...
      }
    } catch (e) { /* silent fail */ }
  };
  doSpeak();
}
```

**Problem:**
- If `jarvis()` promise never resolves (audio API hangs), TTS queue stalls
- `this._speaking` stays true forever → queue never drains
- User doesn't hear new messages because speech synthesis is frozen

**Impact:** High — user goes silent; thinks JARVIS is broken

**Fix (10 min):**
```javascript
_drain() {
  if (this._speaking || !this._queue.length) return;
  this._speaking = true;
  const item = this._queue.shift();
  
  // Set a timeout: if speech doesn't finish in 30s, force-drain
  const timeout = setTimeout(() => {
    if (this._speaking) {
      console.warn('[A11Y] TTS timeout; forcing drain');
      this._speaking = false;
      this._drain();
    }
  }, 30000);
  
  const clearTimeout_ = () => clearTimeout(timeout);
  
  const doSpeak = () => {
    try {
      if (typeof jarvis === 'function') {
        jarvis(item.text, { rate, pitch }).then(clearTimeout_).catch(clearTimeout_);
        return;
      } else if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.onend = () => { clearTimeout_(); this._speaking = false; this._drain(); };
        utterance.onerror = () => { clearTimeout_(); this._speaking = false; this._drain(); };
        window.speechSynthesis.speak(utterance);
        return;
      }
    } catch (e) {
      console.error('[A11Y] TTS error:', e);
    }
    clearTimeout_();
    this._speaking = false;
    this._drain();
  };
  doSpeak();
}
```

**Severity:** 🟡 **MAJOR** — Speech synthesis freeze = user thinks app is broken

---

### F5: Caption Bar ARIA Inline Style, Not Attribute (🟡 **WCAG FAIL**)

**Location:** `a11y.css:140–158` and `a11y.js:382–402`
```css
#a11y-captions {
  ...
  aria-live: polite;  /* ❌ aria-live in CSS, not DOM attribute */
  aria-atomic: true;
}
```

**Problem:**
- ARIA attributes **must be DOM attributes**, not CSS properties
- Screen reader won't see `aria-live: polite` in the stylesheet
- Caption bar won't announce to screen readers → fails WCAG 4.1.2

**Impact:** Medium — fails WCAG accessibility audit

**Fix (2 min):**
- Remove `aria-live: polite;` from CSS
- Ensure DOM element has attribute: `<div id="a11y-captions" aria-live="polite" aria-atomic="true">`
- Update JS to set it:
```javascript
function buildLayer() {
  const existing = document.getElementById('a11y-layer');
  if (!existing) {
    const layer = document.createElement('div');
    layer.id = 'a11y-layer';
    document.body.appendChild(layer);
  }
  
  const captions = document.getElementById('a11y-captions');
  if (!captions) {
    const bar = document.createElement('div');
    bar.id = 'a11y-captions';
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-atomic', 'true');
    document.body.appendChild(bar);
  }
}
```

**Severity:** 🟡 **MAJOR** — WCAG compliance failure

---

## POLISH & DURABILITY FINDINGS (FIX FOR M1→M2)

### F6: scan, dwell, gaze, kbd, predict Are Empty Stubs (⚠️ **DEFERRED OK**)

**Location:** `a11y.js:374–420`
```javascript
const scan = { start: () => {}, stop: () => {}, _step: () => {} };
const dwell = { enable: () => {}, disable: () => {} };
// ... all empty
```

**Issue:** Stage 8 claims "infrastructure ready" but it's not; these are NOOPs

**Assessment:** ✅ **Acceptable for M0-M1** — these are M3+ features; stubs prevent errors if called

**Action:** No fix needed now; document as M3+ work

---

### F7: Caption Bar Z-Index Way Too High (🟡 **LAYER BUG**)

**Location:** `a11y.css:12`
```css
--a11y-z: 2147483000; /* Max int32 essentially */
```

**Problem:**
- `2147483000` is close to `Number.MAX_SAFE_INTEGER`
- Could collide with emergency modals or browser UI
- Better practice: use reasonable z-index like `9999` with documented layer order

**Fix (1 min):**
```css
:root {
  --a11y-z: 999999; /* Caption bar above modals (1000–10000) but below browser chrome */
}
```

---

### F8: XL Touch Target Padding Math Wrong (🔴 **ACCESSIBILITY MATH BUG**)

**Location:** `a11y.css:84–87`
```css
body.xl-targets * {
  min-width: var(--a11y-target);      /* 64px from state */
  min-height: var(--a11y-target);     /* 64px */
  padding: 8px !important;            /* Hardcoded 8px; should be based on target size */
}
```

**Problem:**
- WCAG AAA recommends 66×66px touch targets for motor-impaired users
- With 8px padding, button text gets cramped
- Padding should scale with target size: `padding: calc(var(--a11y-target) * 0.1);`

**Fix (2 min):**
```css
body.xl-targets button,
body.xl-targets input,
body.xl-targets [role="button"],
body.xl-targets a {
  min-width: var(--a11y-target);
  min-height: var(--a11y-target);
  padding: calc(var(--a11y-target) * 0.12) !important;  /* 7.68px for 64px target */
  line-height: 1.5;
  font-size: 1.1em;
}
```

---

### F9: No Focus Management for Dialogs (🟡 **WCAG 2.4.3 FAIL**)

**Problem:**
- When captions bar or settings popup appears, focus doesn't move to it
- Screen reader user has no way to know new content appeared
- Disabled user using switch access could miss important alerts

**Assessment:** Acceptable for M0-M1 (no modals yet); must fix in M2 when modals ship

---

### F10: postMirror POST Silently Fails (🟡 **DEBUG-UNFRIENDLY**)

**Location:** `a11y.js:442–455`
```javascript
function postMirror(patch) {
  if (!opts.mirror || !window.fetch || !window.CT) return;
  const payload = JSON.stringify({ state: patch, source: state._source });
  fetch(`/a11y?token=${window.CT}`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' }
  }).catch(e => {
    if (!_postMirror_logged) {
      console.error('[A11Y] mirror POST failed:', e);
      _postMirror_logged = true;  // Only log once
    }
  });
  // No callback; fire-and-forget with no confirmation
}
```

**Problem:**
- User toggles "high contrast" on voice page
- POST to `/a11y` fails (server down)
- State updates locally but never syncs
- User goes to live page: HC isn't there
- No feedback that sync failed (only one console error, not spoken)

**Fix (5 min):**
```javascript
function postMirror(patch) {
  if (!opts.mirror || !window.fetch || !window.CT) return;
  const payload = JSON.stringify({ state: patch, source: state._source, _ts: Date.now() });
  
  fetch(`/a11y?token=${window.CT}`, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000)
  })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  })
  .catch(e => {
    // Only warn if it's a different error than last time
    const msg = `[A11Y] sync POST failed: ${e.message}`;
    if (msg !== postMirror._lastError) {
      console.warn(msg);
      postMirror._lastError = msg;
      // Optionally: show toast "Sync problem — changes may not appear on other pages"
    }
  });
}
```

---

## SUMMARY TABLE

| Finding | Type | Severity | Impact | Fix Time | Ship M1? |
|---------|------|----------|--------|----------|----------|
| **F1** Adaptive backoff | Network | 🔴 CRITICAL | Hammers server on bad networks | 5 min | ✅ YES (must fix) |
| **F2** Drag-field protection | UX | 🔴 CRITICAL | Slider yanks mid-drag | 10 min | ✅ YES (must fix) |
| **F3** readFeed/readNotifications stubs | Feature | 🟡 MAJOR | Feature advertised but non-functional | 30 min | ✅ YES (must fix) |
| **F4** TTS queue timeout missing | Reliability | 🟡 MAJOR | Speech synthesis could hang forever | 10 min | ✅ YES (must fix) |
| **F5** Caption bar ARIA inline style | A11y | 🟡 MAJOR | Fails WCAG 4.1.2 (screen reader won't announce) | 2 min | ✅ YES (must fix) |
| **F6** scan/dwell/gaze/kbd stubs | Deferred | ✅ OK | These are M3+ features; acceptable as NOOPs | – | ✅ SHIP |
| **F7** Z-index too high | Layout | 🟡 MINOR | Could collide with browser UI | 1 min | – (M1b) |
| **F8** XL target padding math | A11y | 🟡 MINOR | Padding too small for target size | 2 min | – (M1b) |
| **F9** Focus management | A11y | ⚠️ DEFER | Not needed yet (no modals); M2+ | – | ✅ SHIP (defer) |
| **F10** postMirror silent fail | Debug | 🟡 MINOR | Makes it hard to diagnose sync issues | 5 min | – (M1b) |

---

## RECOMMENDATION: CONDITIONAL SHIP WITH CRITICAL-PATH FIXES

### To Ship M0-M1 at Billion-Dollar-Tech Quality:

**REQUIRED (F1–F5 fixes, ~30 min):**
1. ✅ Add adaptive backoff to mirror polling (F1)
2. ✅ Protect dragging fields from remote yanks (F2)
3. ✅ Implement readFeed() and readNotifications() (F3)
4. ✅ Add timeout to TTS queue drain (F4)
5. ✅ Move caption ARIA from CSS to DOM attribute (F5)

**POLISH (F7–F8 fixes, M1b, ~5 min):**
6. Reduce z-index to `999999`
7. Fix XL target padding geometry
8. Add error feedback for postMirror failures

**DEFERRED (F6, F9, M2+):**
- Keep scan/dwell/gaze/kbd as empty stubs (ready for M3)
- Focus management when modals ship (M2)

---

## VERDICT: ELEVATED TO M1→M1B WORKFLOW

**M1 (current):** Implement critical 5 fixes above  
**M1B (next):** Polish 3 fixes (z-index, padding, POST logging)  
**M2 (next stage):** Ship readFeed/readNotifications server endpoints + focus management

---

## STAGE 9 GATE RESULT

| Criterion | Status |
|-----------|--------|
| M0 foundation solid? | ✅ YES |
| Lifeline protected? | ✅ YES |
| All 8 pillars present (even as stubs)? | ✅ YES |
| Ready for billion-dollar-tech deployment? | ⚠️ **YES, with 5 critical fixes** |
| Confidence level | ⭐⭐⭐⭐ (4/5 → 5/5 after F1–F5 applied) |

---

**NEXT STEP:** Apply F1–F5 fixes to a new commit, re-verify, then proceed to M1→M1B pipeline.

**Estimated Time to Fix:** 45 minutes (all 5 critical finds)
**Estimated Ship Date:** 2026-06-10 15:30 UTC (after fixes applied)

---

**Stage 9 Auditor:** Claude Agent SDK  
**Review Method:** Code audit + production standards checklist + WCAG compliance scan  
**Confidence:** High — no architectural issues; only implementation gaps
