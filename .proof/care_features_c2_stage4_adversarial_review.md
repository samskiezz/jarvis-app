# Stage 4 — ADVERSARIAL REVIEW
## Care / Guardian feature pack (C2) — Critical flaws, lifeline risks, missing cases

---

## FLAWS IDENTIFIED

### FLAW 1: Import-time safety is incomplete
**Severity: CRITICAL (lifeline)**

The plan says new services are guarded at `dashboard.py` import:
```python
try:    from server.services import care_store, care_push, care_turn, care_relay
except Exception: care_store = care_push = care_turn = care_relay = None
```

**The problem:** If ANY new service file (`care_store.py`, `care_push.py`, etc.) has a syntax error, typo, or import-time side effect (e.g., `TURN_SECRET = os.environ['TURN_SECRET']` on a machine without that env var), the entire catch clause swallows it and all four modules are set to `None`. The plan then checks `if care_store:` to degrade — this works for missing deps, but **fails if the file exists but is broken**.

**Required fix:**
- Each new service MUST be syntax-checked before commit (use `python -m py_compile server/services/care_store.py`).
- Each service MUST have **zero import-time side effects** — all config (TURN_SECRET, VAPID keys) must be loaded on first call, not at import.
- Example: `care_turn.py` should NOT do `TURN_SECRET = os.environ['TURN_SECRET']` at module level; instead, `def creds(room): secret = os.environ.get('TURN_SECRET'); ...`

---

### FLAW 2: Route auth is asymmetric and unguarded for 7 steps
**Severity: CRITICAL (security)**

The plan says new relay routes (`/reminders`, `/push/subscribe`, `/consentlog`, `/healthpush`) are **"none (relay-tier)"** or **"room-secret gating deferred to Step 8"**.

**The problem:** A malicious actor on the same LAN can:
- POST `/reminders {room:'mum', role:'carer', op:'add', reminder:{...}}` → spam fake reminders onto any patient.
- POST `/consentlog {room:'mum', actor:'carer', type:'grant', cap:'see'}` → forge fake audit entries (break the hash-chain).
- POST `/healthpush {room:'mum', vitals:[...]}` → inject fake vital alerts.

Until Step 8 (room-secret pairing), these routes are open to the LAN. **This is unacceptable for a disabled user's lifeline.**

**Required fix:**
- **Option A**: Gate all care routes with a minimal room-secret starting in Step 1. The patient URL already has `?room=mum`; derive a room-secret hash from `CONTROL_TOKEN + room` and require it as a `POST` param or bearer token.
- **Option B**: Defer `/reminders`, `/consentlog`, `/healthpush` routes to Step 8 when room-secret lands.
- **Option C**: Require `CONTROL_TOKEN` on all care routes starting in Step 1 (the patient page has `__CTOKEN__` injected; the guardian can carry it). This is the **lightest fix and recommended**.

**Recommendation: Implement Option C** (add `token=__CTOKEN__` as a param to all care POSTs starting in Step 1).

---

### FLAW 3: Codec ladder doesn't preserve RTX/RED/FEC
**Severity: HIGH (video reliability)**

The plan says:
> Reorder the FULL capability list to h265→av1→vp9→h264→vp8 **without dropping RTX/RED/FEC**.

**The problem:** The current `preferCodec` code (`:799` patient, `:113` guardian) likely truncates the capabilities list during reordering. RTX (RTP retransmission) is a separate codec entry (`video/rtx`) that must remain in the full list for packet-loss recovery to work. If RTX is silently dropped, the video becomes blocky under lossy networks.

**Required fix:**
The exact `preferCodec` implementation must show:
```js
function preferCodec(p) {
  const send = RTCRtpSender.getCapabilities('video').codecs;
  const order = ['h265', 'av1', 'vp9', 'h264', 'vp8'];
  
  // REORDER but KEEP RTX/RED/FEC in their relative positions
  let reordered = [];
  for (const codec of order) {
    const m = send.filter(c => c.mimeType.includes(codec));
    reordered.push(...m);
  }
  // PRESERVE RTX/RED/FEC at the end
  const rtx = send.filter(c => c.mimeType.includes('rtx') || c.mimeType.includes('red') || c.mimeType.includes('fec'));
  reordered = reordered.filter(c => !c.mimeType.includes('rtx') && !c.mimeType.includes('red') && !c.mimeType.includes('fec'));
  reordered.push(...rtx);
  
  p.setCodecPreferences(reordered);
}
```
**This must be tested** against the capabilities list from the live browser to ensure RTX stays.

---

### FLAW 4: SVC scalability mode is codec-specific but not handled
**Severity: HIGH (video resilience)**

The plan says:
> `sender.setParameters({encodings:[{scalabilityMode:'L1T3'}]})` when av1/vp9 is selected.

**The problem:** `L1T3` (one spatial, three temporal layers) is AV1/VP9 only. H264 and VP8 use different modes or don't support SVC. Setting `L1T3` on an H265 connection will throw or be ignored. The fallback behavior is undefined.

**Required fix:**
```js
async function enableSVC(pc, codecMimeType) {
  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
  if (!sender) return;
  
  let mode = null;
  if (codecMimeType.includes('vp9') || codecMimeType.includes('av1')) {
    mode = 'L1T3';  // one spatial, 3 temporal for VP9/AV1
  } else if (codecMimeType.includes('h264')) {
    mode = 'L1T3';  // limited SVC on H264 (check browser support)
  } else {
    return;  // no SVC for H265, VP8
  }
  
  try {
    await sender.setParameters({
      encodings: [{ scalabilityMode: mode }]
    });
  } catch (e) {
    console.warn('SVC not supported:', e);
  }
}
```
Call this after negotiation, codec-aware.

---

### FLAW 5: Missed-dose double-fire — no dedup guard
**Severity: MEDIUM (UX)**

The plan says the scheduler checks `unacked_overdue(now, grace_s=900)` every 20s and posts a missed-dose alert.

**The problem:** If the scheduler runs at t=0, t=20s, t=40s, and the reminder was due at t=-10s and un-acked, ALL THREE scheduler cycles will post the same missed-dose alert to the guardian. The guardian sees 3 identical alerts in 40 seconds.

**Required fix:**
The `record_ack` call for a missed dose must happen AFTER the POST (not before). Better: add an `escalated_ts` column to `reminder_event` and check:
```sql
SELECT * FROM reminder_event 
WHERE reminder_id=? AND action='missed' AND (NOW() - escalated_ts) < 60
```
Only post if no escalation was recorded in the last 60 seconds.

---

### FLAW 6: Watched-light label is ambiguous
**Severity: MEDIUM (UX)**

The plan shows: `🔴 Camera on · Carer watching`

**The problem:** "Carer watching" conflates "carer has permission" with "carer is actively monitoring." A confused patient might think the son is ALWAYS watching, staring at her, when he's just granted permission.

**Required fix:**
Change to: `🔴 Camera on · Carer can see` (permission-based, honest).
Or: add a `peer_online` check from the poll so it says `🔴 Camera on · Carer connected` only if the carer's page is actively polling. This is more accurate.

---

### FLAW 7: No server-side consent expiry enforcement
**Severity: HIGH (security)**

The plan says `sweepExpiry()` runs client-side, checking `Date.now()` against stored `expiresAt`.

**The problem:** A patient (or malicious JS) can spoof `CONSENT` in localStorage to keep a capability "live" after it expires. The server has no check. A health share with `expiresAt: now-1000` can still POST `/carevitals` and the server will accept it.

**Required fix:**
Every route that gates on a capability MUST server-side verify:
```python
# pseudocode for /carevitals route
consent = care_store.get_consent(room, 'health')
if not consent or not consent.get('on') or (consent.get('expiresAt') and consent['expiresAt'] < time.time()):
    return {"ok": False, "error": "health consent expired"}
```
Client-side checks prevent honest users from typos; server-side checks enforce policy.

---

### FLAW 8: No graceful degradation if `care_store.init()` fails
**Severity: MEDIUM (lifeline)**

The plan says init failure disables persistence only, but the scheduler thread still calls `care_store.due_reminders()`.

**The problem:** If init failed (locked DB, corrupt file, no disk), what does `due_reminders()` return? If it returns `[]`, reminders never fire. If it crashes, the try/except catches it but then the next 20s cycle runs again — infinite retry loop with no backoff.

**Required fix:**
- `care_store` MUST expose `available()` that returns True iff the DB is healthy.
- Scheduler must check: `if not care_store.available(): time.sleep(20); continue`
- On first init failure, log a warning and skip that cycle. On 3 consecutive failures (60s), log an error + alert via a syslog or `/healthreport` flag so ops can notice.

---

### FLAW 9: `care_relay.py` (Maxine enhance) is under-specified
**Severity: MEDIUM (buildability)**

The plan says `care_relay.py` ~120 lines with Maxine VSR relay. But there's NO explanation of:
- Is it a local gRPC call to a service on the same box?
- A network request to `vast-gpu-box:PORT`?
- Does it relay the entire video stream through an SFU?
- How does the patient's track get replaced with the upscaled version?
- What's the latency — is 500ms realistic?

**Required fix:**
**Defer `care_relay.py` to Step 6 with a separate sub-design.** For Steps 1–5, ship the **honest client-side interim**: a canvas-based local sharpen (CSS filter blur-remove + contrast boost) labelled **"Local sharpen"**. This is real, honest, and ships now.

At Step 6, add the architecture doc for Maxine (gRPC endpoint, latency SLA, fallback on timeout).

---

### FLAW 10: Health threshold validation is missing
**Severity: MEDIUM (UX)**

The plan says thresholds are configurable by the trusted supporter in the Care UI but doesn't validate them.

**The problem:** A mistyped threshold (restingHR hi: 9999, lo: 100, hi: 80) will either fire spurious alerts or never match. No feedback.

**Required fix:**
Validate on both client and server:
```js
// client
function validateThresholds(t) {
  if (t.restingHR && (t.restingHR.lo >= t.restingHR.hi)) {
    showError("Resting HR: low must be < high");
    return false;
  }
  if (t.spo2 && (t.spo2.lo < 0 || t.spo2.lo > 100)) {
    showError("SpO₂ must be 0–100");
    return false;
  }
  // ...suggest defaults
  return true;
}

// server /healthpush
if threshold['restingHR']['lo'] >= threshold['restingHR']['hi']:
  return {"ok": False, "error": "invalid thresholds"}
```

---

### FLAW 11: No "Service-Worker-Allowed" header on SW route
**Severity: CRITICAL (PWA)**

The plan mentions the header but doesn't show it in the code.

**The problem:** Without `Service-Worker-Allowed: /` on the `GET /care_sw.js` response, the SW will be scope-locked to `/care_*` paths and can't control `/talk` or `/guardian`.

**Required fix:**
```python
# In _send_h or explicit /care_sw.js route handler:
self.send_header("Service-Worker-Allowed", "/")
```

---

---

## LIFELINE RISKS

### RISK 1: Scheduler thread blocks on slow DB
**Severity: HIGH**

The scheduler does `care_store.due_reminders(now)` every 20s in a blocking while-loop.

**The problem:** If the DB is slow (lots of audit entries), a `SELECT * FROM reminder` scan could take 5+ seconds. During that time, the main HTTP server threads are blocked waiting for the lock.

**Required fix:**
- Use `care_store._WLOCK` with a **timeout**: `lock.acquire(timeout=5)`. If timeout, skip that cycle.
- Move reminder scans to an indexed query: `SELECT ... FROM reminder WHERE active=1 AND remind_time BETWEEN ? AND ?` (bounded time window).
- Consider async threading: use `concurrent.futures.ThreadPoolExecutor` for the scheduler so DB waits don't block HTTP.

---

### RISK 2: SQLite write concurrency under reminder storm
**Severity: MEDIUM**

The patient page might POST `/reminders{op:ack}` at the same time the scheduler is calling `record_fire`.

**The problem:** SQLite's default isolation is SERIALIZABLE. High concurrency (patient acks, scheduler fires, carer-set reminders all at once) can cause `SQLITE_BUSY` errors. The plan wraps routes in try/except, but this returns a 500-like error to the client instead of a graceful retry.

**Required fix:**
- Set `PRAGMA busy_timeout=3000` (3s retry on lock).
- Return `{ok:false, error:'db_busy', retry_after:1}` from `/reminders` if a lock times out, not a 500.
- Scheduler loops with backoff if it hits a lock.

---

### RISK 3: New daemon thread has no health check
**Severity: MEDIUM**

The scheduler thread runs `while True` with `time.sleep(20)`. If it crashes (exception in loop), the main dashboard keeps serving but reminders never fire again.

**The problem:** No way to know the scheduler is dead. The patient never gets reminders, and it's silent failure.

**Required fix:**
- Scheduler must write a heartbeat timestamp to `_SNAP["care_scheduler_last_run"]` every iteration.
- `/healthreport` must check this timestamp. If it's >60s old, flag: `"care_scheduler": {"status": "down", "last_run": "2026-06-10T14:22:13Z"}`
- This becomes visible in the carer's dashboard.

---

### RISK 4: Auth gap: guardian can set any reminder without consent
**Severity: HIGH**

The plan says guardian POSTs `/reminders{op:add, role:'carer'}` but doesn't check if the patient has granted `remind` consent.

**The problem:** A malicious carer (or a carer making a mistake) can add reminders without the patient's knowledge or permission, violating GDPR consent model.

**Required fix:**
```python
# /reminders POST handler
if body['role'] == 'carer':
    consent = care_store.get_consent(room, 'remind')
    if not consent or not consent.get('on'):
        return {"ok": False, "error": "remind consent required"}
```

---

### RISK 5: Audit log hash-chain can be broken at migration
**Severity: MEDIUM**

The plan says `append_audit` computes `hash=sha256(prev_hash+payload)` for a tamper-evident chain.

**The problem:** If `jv_carer` boolean is migrated to `jv_consent` at boot, there's a window where the old audit entries (in localStorage, in the DB) have no prior hash. The chain is incomplete.

**Required fix:**
```python
# care_store.init() must:
# If this is the first audit entry in a room, compute hash of (payload) only, not (prev_hash+payload)
# Add a migration entry: audit{type:'migrate', cap:'—', detail:'upgraded from jv_carer boolean'}
```

---

---

## MISSING CASES

### MISS 1: Offline consent audit sync
**Severity: MEDIUM**

When the patient grants consent and POSTs to `/consentlog`, if there's a network error, the client catches it and continues. The event is queued in `jv_consent_audit` for retry.

**Missing:** There's no retry logic shown. If the network is down for 24 hours, the audit queue fills up and old entries are dropped (ring buffer). The server audit is now stale.

**Required fix:**
Add to the patient's poll loop (`:825`):
```js
// after poll, retry unsent audits
const local_audit = load('jv_consent_audit', []);
for (const ev of local_audit) {
  if (!ev.synced) {
    fetch('consentlog', {method:'POST', body:JSON.stringify(ev)})
      .then(() => { ev.synced = true; save('jv_consent_audit', local_audit); })
      .catch(() => {});  // retry next poll
  }
}
```

---

### MISS 2: Consent expiry pre-warning
**Severity: MEDIUM**

The plan sets `expiresAt` to now+90d, and on day 90 consent silently revokes.

**Missing:** No warning at day 80. The patient won't know their carer's access is about to end.

**Required fix:**
In `openCare()` or as a banner in the Care sheet:
```js
function checkConsentExpiry() {
  for (const cap in CONSENT) {
    const c = CONSENT[cap];
    if (c.on && c.expiresAt) {
      const days_left = (c.expiresAt - Date.now()) / 864e5;
      if (days_left > 0 && days_left < 7) {
        showBanner(`Your ${cap} consent expires in ${Math.ceil(days_left)} days. Let me know if I should keep watching.`);
      }
    }
  }
}
```

---

### MISS 3: Push subscription expiry / 410 handling
**Severity: MEDIUM**

The plan says `care_push.send` detects 410 (Gone) and prunes that endpoint.

**Missing:** No auto-refresh logic. A 3-month-old subscription is likely to be 410 by then. How does the patient get reminders again?

**Required fix:**
```python
# care_store: add refresh_sub(room, role)
# Patient page: every 30 days, call
navigator.serviceWorker.ready.then(reg => {
  reg.pushManager.getSubscription().then(old_sub => {
    if (old_sub && (Date.now() - load('jv_push_sub_ts')) > 30*864e5) {
      reg.pushManager.subscribe({...}).then(new_sub => {
        fetch('push/subscribe', {method:'POST', body:JSON.stringify({
          room:ROOM, role:'patient', sub:new_sub})})
          .then(() => save('jv_push_sub_ts', Date.now()));
      });
    }
  });
});
```

---

### MISS 4: GDPR "right to be forgotten"
**Severity: CRITICAL (compliance)**

The plan says consent audit is persisted in `care.db` and follows the "hard-protect, never delete" rule.

**Missing:** There's no way for a patient to request deletion of their own records (GDPR right to erasure). No `DELETE /caredata?room=` route.

**Required fix:**
Add a route:
```python
# DELETE /caredata?room=
# Patient-only (verify via CONTROL_TOKEN), purges consent/reminder/vital/alert for that room
if body.get('room'):
    care_store.purge_room(body['room'])
    return {"ok": True}
```

---

### MISS 5: DataChannel creation race
**Severity: MEDIUM**

Guardian creates the DataChannel in `newPeer:161` before `makeOffer`. Patient's `ondatachannel` handler must be installed immediately.

**Missing:** No explicit timing guarantee shown. If the patient's event listener is installed async (after the offer arrives), the channel creation event is missed.

**Required fix:**
```js
// Patient, in init or before setting up peer:
let careChannel = null;
pc.ondatachannel = e => {
  if (e.channel.label === 'care') {
    careChannel = e.channel;
    bindCareChannel(careChannel);
  }
};

// Guardian, in newPeer:
dc = pc.createDataChannel('care', {ordered: true});
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'connected') {
    // NOW safe to send — both sides have set up listeners
  }
};
```

---

### MISS 6: Carer-set reminders without consent feedback
**Severity: MEDIUM**

Guardian adds a reminder via POST `/reminders{op:add, role:'carer'}`. If `remind` consent is not granted, what happens on the carer's screen?

**Missing:** No feedback shown. Guardian just sees the form silently fail or succeed.

**Required fix:**
Guardian's add-reminder form should show:
```html
<div id=remForm>
  <input name=text placeholder="What should I remind you to do?">
  <input name=time type=time>
  <button onclick="addReminder()">Add reminder</button>
  <div id=remStatus style=color:red></div>
</div>

<script>
function addReminder() {
  fetch('reminders', {method:'POST', body:JSON.stringify({
    room:ROOM, role:'carer', op:'add', reminder:{...}
  })})
    .then(r => r.json())
    .then(d => {
      if (!d.ok && d.error === 'remind_consent_required') {
        document.getElementById('remStatus').textContent = 
          "Mum hasn't allowed reminders yet. You can ask her to enable this in her Care settings.";
      }
    });
}
</script>
```

---

### MISS 7: Health source fallback on permission denial
**Severity: MEDIUM**

Patient clicks "Connect Google Health" and denies permission. The UI shows "not connected".

**Missing:** No retry button or fallback to the next source shown.

**Required fix:**
```js
// renderHealth section:
for (const src of ['google', 'healthconnect', 'healthkit', 'fhir']) {
  const status = load(`jv_health_${src}_status`);
  let label = src;
  if (status === 'denied') {
    label += ` (denied - <button onclick="retryHealth('${src}')">retry</button>)`;
  } else if (status === 'connected') {
    label += ` ✓`;
  } else {
    label += ` (<button onclick="connectHealth('${src}')">connect</button>)`;
  }
  // render label
}
```

---

### MISS 8: Stats HUD privacy leak
**Severity: MEDIUM (privacy)**

The plan shows stats HUD displays `candidate-pair.relayType` which reveals whether the connection is direct or relayed.

**Missing:** Direct connection also exposes the patient's IP address to the carer's console (visible in WebRTC internals, possibly in the HUD).

**Required fix:**
Either:
- A) Show only "relay: direct/TURN/unknown" without IPs.
- B) Gate stats display on `capActive('see')` (allow only if video consent is active).
- Option B is better: it's already consent-gated, so show full stats only to the authorized viewer.

---

### MISS 9: Reminder time timezone handling
**Severity: MEDIUM**

The plan says reminders are stored as `time:"HH:MM"` and the scheduler compares against patient-supplied TZ offset at subscribe time.

**Missing:** If the patient moves from NYC (UTC-5) to LA (UTC-8), their next reminder is 3 hours off. No refresh of TZ at subscribe time.

**Required fix:**
Store timezone explicitly:
```python
# care_store.reminder table:
tz_offset_min INTEGER DEFAULT 0  # e.g., -300 for EST

# At /push/subscribe, patient sends:
tz_offset_min = -new Date().getTimezoneOffset()
```

---

### MISS 10: No timestamp on health vitals / alert staleness
**Severity: MEDIUM**

The plan says health vitals show timestamp + source, but not how old they are.

**Missing:** A vital received from HealthKit Shortcut 2 hours ago shows the same as one from 30 seconds ago.

**Required fix:**
```js
function renderHealth() {
  for (const type in VITALS) {
    const v = VITALS[type];
    const age_min = (Date.now() - v.ts) / 60000;
    let age_label = '';
    if (age_min > 5) age_label = ` (${Math.floor(age_min)}m ago, may be stale)`;
    // render: "❤ 68 bpm · Apple Health · 2 min ago"
  }
}
```

---

---

## REQUIRED CHANGES — SUMMARY TABLE

| # | Issue | Severity | Category | Required Fix | Impacts |
|---|---|---|---|---|---|
| 1 | Import-time safety incomplete | CRITICAL | Lifeline | Validate syntax of new files; zero import-side effects | Step 1 |
| 2 | Route auth unguarded until Step 8 | CRITICAL | Security | Add CONTROL_TOKEN gating to care routes in Step 1 OR defer routes to Step 8 | All new routes |
| 3 | Codec ladder loses RTX/RED/FEC | HIGH | Video | Show exact `preferCodec` code; test against live browser | Step 5 |
| 4 | SVC mode not codec-dependent | HIGH | Video | Branch on codec; use L1T3 only for VP9/AV1 | Step 5 |
| 5 | Server-side consent expiry missing | HIGH | Security | Routes must check expiry server-side, not trust client | All gated routes |
| 6 | Missed-dose fires 3× in 40s | MEDIUM | UX | Dedupe on `(reminder_id, due-day-slot)` with escalated_ts | Step 2 |
| 7 | Watched-light says "watching" not "can see" | MEDIUM | UX | Relabel to "Carer can see" OR add peer_online check | Step 1 |
| 8 | care_store init failure has no fallback | MEDIUM | Lifeline | Expose `available()` check; scheduler skips if unavailable | Step 1 |
| 9 | care_relay Maxine is under-specified | MEDIUM | Buildability | Defer to Step 6; ship client-side local sharpen for now | Step 5→6 |
| 10 | Health thresholds not validated | MEDIUM | UX | Validate lo<hi, sensible ranges; suggest defaults | Step 5 |
| 11 | Service-Worker-Allowed header missing from code | CRITICAL | PWA | Add `self.send_header("Service-Worker-Allowed", "/")` to `/care_sw.js` handler | Step 3 |
| 12 | Scheduler blocks on slow DB | HIGH | Lifeline | Use lock timeout (5s); index reminder queries | Step 2 |
| 13 | SQLite write concurrency under storm | MEDIUM | Lifeline | Set `busy_timeout=3000`; return `{ok:false, retry_after}` on lock timeout | Step 2 |
| 14 | Scheduler has no health check | MEDIUM | Observability | Write heartbeat to `_SNAP`; flag in `/healthreport` if stale | Step 2 |
| 15 | Carer can set reminders without consent | HIGH | Security | Server-side check for `remind` capability in `/reminders` | Step 2 |
| 16 | Audit log hash-chain incomplete at migration | MEDIUM | Compliance | Handle first audit entry specially; add migration marker | Step 1 |
| 17 | No offline consent audit retry | MEDIUM | Reliability | Queue unsent audits in `jv_consent_audit`; retry on next poll | Step 1 |
| 18 | No consent expiry pre-warning | MEDIUM | UX | Show "expires in 7 days" banner at day 80 | Step 1 |
| 19 | No push subscription auto-refresh | MEDIUM | Reliability | Refresh every 30 days to avoid 410 errors | Step 3 |
| 20 | No GDPR delete endpoint | CRITICAL | Compliance | Add `DELETE /caredata?room=` route | Step 8 |
| 21 | DataChannel listener timing race | MEDIUM | Reliability | Document installation timing; safe to send after `connectionState==='connected'` | Step 4 |
| 22 | No feedback if carer-set reminder denied | MEDIUM | UX | Guardian form shows "Mum hasn't allowed reminders" message | Step 2 |
| 23 | No health source retry UI | MEDIUM | UX | Add "retry" button next to denied sources | Step 5 |
| 24 | Stats HUD exposes IP address | MEDIUM | Privacy | Show only "relay: direct/TURN" OR gate on `capActive('see')` | Step 5 |
| 25 | Reminder timezone not refreshed on move | MEDIUM | Reliability | Store TZ explicitly; refresh at subscribe | Step 3 |
| 26 | Vital staleness not shown | MEDIUM | UX | Display age (e.g., "68 bpm · 2 min ago") | Step 5 |

---

## MUST-FIX BEFORE SHIP (blocks Stage 5 build)

1. **Route auth** — add CONTROL_TOKEN gating to `/reminders`, `/consentlog`, `/healthpush` in Step 1
2. **Codec ladder detail** — show exact `preferCodec` code with RTX/RED/FEC preservation
3. **SVC mode branching** — codec-dependent scalability mode (L1T3 for VP9/AV1 only)
4. **Service-Worker-Allowed header** — explicit in route handler
5. **Server-side consent expiry** — verify expiry server-side on all gated routes
6. **Import-time safety** — syntax validation + zero import-side effects in all new services
7. **care_store heartbeat** — scheduler health visible in `/healthreport`
8. **Carer-set reminder consent gate** — server-side check for `remind` cap

---

## SHIP-BLOCKERS FOR GDPR COMPLIANCE

Before Step 1 ships, must have:
- Granular, revocable, per-capability consent ✓ (in plan)
- Hash-chained audit trail ✓ (in plan)
- Consent expiry + pre-warning (MISS 2 — **must add**)
- Server-side consent enforcement (FLAW 7 — **must add**)
- Right to erasure (`DELETE /caredata`) (MISS 4 — **must add at Step 8**)
- Offline audit sync (MISS 1 — **should add**)

---

## SUMMARY

**The Stage 3 engineering plan is **sound in architecture** but has 3 critical gaps and 23 missing details.** The most important fixes:

1. **Auth gap** (CRITICAL): guard relay routes with `CONTROL_TOKEN` or room-secret starting in Step 1; do not ship unguarded.
2. **Server consent enforcement** (HIGH): routes must verify expiry server-side.
3. **Import safety** (CRITICAL): all new service files must have zero import-time side effects.
4. **Codec ladder** (HIGH): show exact code that preserves RTX; test against real browser capabilities.
5. **GDPR compliance** (CRITICAL): add consent expiry warnings + GDPR delete route before shipping to users.

All other issues are quality/reliability improvements, not blockers.

**Recommendation:** Do a 2–3 day hardening pass on the plan before Step 5 code starts. The fixes are straightforward (add a header, add a server check, refactor a function signature); none require architectural changes.

---

**Stage 4 review complete.** Hand-off to Stage 5 build is **conditional on the MUST-FIX items above being integrated into the plan.**
