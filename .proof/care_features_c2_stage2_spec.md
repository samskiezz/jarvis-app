# Stage 2 — DESIGN / SPEC DRAFT
## Care / Guardian feature pack (C2) — `server/jarvis_voice.html` + `server/guardian.html` + `server/dashboard.py` (+ `server/services/care_signal.py`)

> Reference doc for the Stage 9 final comparison. First-draft spec of **exactly what to build
> and where**, grounded in the Stage-0/1 research ([[care-features-c2]]) + re-verified against the
> live files here (line anchors are from the files at the time of writing — **re-grep before
> editing**, the patient/guardian HTML shifts a few lines per edit). All data REAL (never
> fabricate — show "not connected"); never break the pm2 lifeline (`jarvis-dashboard` /
> `jarvis-voiceclone` / `jarvis-tasks`); preserve every existing feature; never leave a JS error.

---

## 0. One-line goal

Take the working mum↔son care link from a **P2P walkie-talkie with one boolean consent** up to a
**billion-dollar-grade remote-care console**: 2K/H265 (+AV1/VP9-SVC fallback) guardian video with
zoom and an AI clarity push; **granular, revocable, audited** carer consent with a live "what's
shared now" indicator on mum's screen; **server-scheduled** medication/appointment reminders that
survive a sleeping phone, with **missed-dose escalation to the carer**; a **real** health-data link
(Google Health / Health Connect / HealthKit-bridge / SMART-on-FHIR) feeding **vital-threshold
alerts** to the carer; and **remote co-control** so the carer can actually drive mum's JARVIS UI —
all over an ontology that links patient↔carer↔contacts↔meds↔vitals↔events↔consents with a full
audit trail.

---

## 1. The bars we build to (from Stage-0/1 research)

| Domain | Reference bar | What it forces on us |
|---|---|---|
| Accessibility | **Apple Assistive Access** + **WCAG 2.2 AA** (87 criteria) | icon-grid large-launcher, ≥24px targets, focus-not-obscured, dragging-alternatives, **reduced-motion**, trusted-supporter setup role |
| Consent / privacy | **GDPR special-category** processing | explicit, **granular per-capability**, **revocable** consent + **audit log** + re-consent expiry + persistent on-screen "you are being watched" indicator |
| Reminders delivery | Google/Apple background-delivery | `setInterval` dies when backgrounded → **server-scheduled Web Push (VAPID)** + service worker + **PWA install** (iOS Push only for A2HS PWAs, no Background Sync) + SMS/email fallback |
| Health integration | Post-Google-Fit (EoL late-2026) | **Google Health API** (cloud OAuth2, Fitbit successor) + **Health Connect** (Android on-device) + **HealthKit** (native-only → Shortcuts/companion bridge) + **SMART-on-FHIR** (clinical) |
| Video clarity | **NVIDIA Maxine** VFX SDK | server-side Video-Super-Resolution + artifact/noise removal on the [[vast-gpu-box]] for the "is she hurt?" push; HMAC-timed TURN, not openrelay |
| Ontology / observability | **Palantir Gotham/Foundry** | patient↔carer↔contacts↔meds↔vitals↔events↔consents as **objects** with full action audit; persist signalling beyond in-memory; identity + E2EE beyond DTLS |

---

## 2. Existing substrate we REUSE (do not rebuild) — verified anchors

### `server/jarvis_voice.html` (PATIENT — mum)
| Capability | Symbol / id | Anchor |
|---|---|---|
| Care & Health sheet (open builder) | `window.openCare()` → renders all sub-panels | `:872` |
| Persist helpers (REAL localStorage) | `load(k,d)` / `save(k,v)` | `:860` |
| Carer state + consent gate | `CARER=load('jv_carer',…)`, `toggleCarer()` `:896`, `consentYes()` `:901`, `consentNo()` `:906` | `:863` |
| Consent dialog (plain-language) | `#consent` modal + `.plain` list | DOM `:296`, CSS `:212` |
| Accessibility model | `ACCESS={bigtext,hc,voicecmd}`, `applyAccess()` `:876`, `setAccess()` `:883` | `:862` |
| Emergency contacts | `#contactList`, `renderContacts()` `:910`, `addContact()` `:922` | DOM `:338` |
| Reminders | `#remList`, `renderReminders()` `:942`, `checkReminders()` `:959`, **`setInterval(checkReminders,20000)`** | `:976` |
| Notifications | `enableNotifs()` `:986`, SW `reg.showNotification` fallback `new Notification` | `:995` |
| Health link (REAL OAuth) | `renderHealth()` `:1003`, `connectHealth()` `:1018`, Google Health scope `health.read` `:1031`, `dataPoints?dataType=heart_rate` fetch `:1044` | `:1003` |
| OAuth sign-in | GSI `#gsiBtn`, Apple `#appleBtn`, `GSI_CLIENT`/`APPLE_CLIENT` config | `:867` |
| 2K capture | `getUserMedia({video:{width:{ideal:2560},height:{ideal:1440},frameRate:{ideal:30}}})` | `:798` |
| Codec preference (send H265) | `preferCodec(p)` via `RTCRtpSender.getCapabilities` | `:799` |
| PTZ from carer ctrl | `applyConstraints({advanced:[{zoom:p.zoom}]})` on `ctrl{zoom}` | `:820` |
| Add tracks after remote desc | `pc.addTrack` ordering note | `:812` |
| Room + config | `ROOM=Q.get('room')||'mum'`, `CFG{family,emergency,…}` | `:619` |

### `server/guardian.html` (CARER — son)
| Capability | Symbol / id | Anchor |
|---|---|---|
| ICE / TURN servers | `ICE=[…]` — **openrelay.metered.ca** (NOT production) | `:93–95` |
| Codec preference (M124+) | `preferCodec(p)` via `RTCRtpReceiver.getCapabilities('video')` | `:113` |
| Signalling POST | `sig(kind,payload)` → `fetch('rtc',…)` | `:102` |
| Zoom/pan engine | `applyZoom()` `:127`, `zoomAt(cx,cy,factor)` `:133`, `initZoom()` wheel/pinch/dbl `:137`, `clampPan()` `:124`, `zoomReset()` `:131` | `:124–152` |
| Remote-control channel | `ctl(what)` cam/mic/flip `:153`, `ring()` `:156`, `sayIt()` (speak-as-Jarvis) `:157` | `:153–157` |
| Self cam/mic | `toggleMyCam()`/`toggleMyMic()`/`talk()` | `:158–160` |
| Peer + media | `newPeer()` `:161`, `getMedia()` `:103`, `pc.ontrack` → `#remote` `:164`, `makeOffer()` `:169` | `:161` |
| SOS receive + siren | `showSos()` `:179`, `ackSos()` `:180`, `siren()` (WebAudio) `:181` | `:179` |
| Signalling poll loop | `poll()` `:182`, `startPolling()` `:188` | `:182` |
| Dead-man's-switch offline | `dismissOff()`, `#offOv` (>40s) | `:189` |
| Jarvis TTS | `jarvis(t)` (en-GB voice pick) | `:100` |

### `server/services/care_signal.py` (SIGNALLING — 94 lines, in-memory)
| Capability | Symbol | Anchor |
|---|---|---|
| Per-room thread-safe msg log | `_ROOMS`, `_LOCK`, `post()` `:49`, `poll()` `:65`, `rooms()` `:84` | whole file |
| TTLs | `_MSG_TTL=90`, `_PEER_TTL=14`, `_ROOM_TTL=1800` | `:21–23` |
| Presence heartbeat | `presence[role]=now` on every post/poll | `:58,74` |

### `server/dashboard.py` (ROUTER — stdlib ThreadingHTTPServer on :8095)
| Route | Handler | Anchor |
|---|---|---|
| `POST /rtc` (token-free relay) | `CS.post(...)` | `:1940` |
| `GET /rtc/poll` | `CS.poll(...)` | `:1831` |
| `GET /carerooms` | `CS.rooms()` | `:1837` |
| `GET /talk` `/companion` → patient page | `_tmpl("jarvis_voice.html")` | `:1840` |
| `GET /care` → `care.html` | `_tmpl("care.html")` | `:1842` |
| `GET /guardian` → carer page | `_tmpl("guardian.html")` | `:1844` |
| `GET /healthreport` (system vitals score+alerts) | `_SNAP["health"]` | `:1912` |
| Template + token inject | `_tmpl(name)` replaces `__CTOKEN__` with `CONTROL_TOKEN` | `:1730` |
| Control token (persistent) | `_control_token()` `:43`, `CONTROL_TOKEN` `:63` | `:43` |
| Bridge key (non-browser auth) | `CLIMATE_BRIDGE_KEY` | `:67` |

> **Note:** `/care` serves a separate `care.html` (a simpler launcher) — **out of primary scope**
> but listed so the build stage does not confuse it with `/talk` (the real patient app
> `jarvis_voice.html`). The carer console is `guardian.html`; the patient app is `jarvis_voice.html`.

---

## 3. The five pillars to BUILD (gap → design → where)

### A. Video — 2K/H265 + SVC fallback + AI clarity + production TURN + stats HUD

**Gap:** H265 send works but with **no fallback ladder** for non-H265 peers; TURN is the public
**openrelay** demo server (rate-limited, not production); no resilience layer (SVC/simulcast); no
clarity push for "is she hurt?"; no bitrate/stat visibility; clip-capture for evidence missing.

**Build:**
1. **Codec ladder, not single preference.** Extend `preferCodec` on **both** sides to reorder the
   FULL capability list to **H265 → AV1 → VP9 → H264 → VP8** without truncating (guardian `:113`,
   patient `:799`). Negotiate **scalability mode** on the patient sender:
   `sender.setParameters` with `scalabilityMode:'L1T3'` (temporal SVC) when AV1/VP9 is selected, so
   a weak link degrades frame-rate gracefully instead of freezing. Add **simulcast** (`sendEncodings`
   low/med/high) on the patient offer so the carer's BWE picks a layer.
2. **Production TURN.** Replace the openrelay block (`guardian.html:93`) with **HMAC time-limited
   coturn creds** fetched from a new `GET /turncreds` route (§6) — `username = expiry:roomid`,
   `credential = base64(HMAC-SHA1(secret, username))`. Patient fetches the same. Keep a public STUN
   as last resort. Show "relay: direct / TURN / none" in the stats HUD.
3. **AI clarity push (NVIDIA Maxine).** Optional server-side **Video-Super-Resolution + artifact
   removal** path: when the carer taps **"Enhance"**, route that one stream through a Maxine VFX
   worker on the [[vast-gpu-box]] (SFU-style relay), return the upscaled track. Realistic sub-500ms
   only with GPU — so it's **opt-in, gated on box reachability**, and shows "enhance unavailable"
   when the GPU/relay is down (never a fake sharpen). Until the relay exists, ship a **client-side
   CSS/canvas sharpen + contrast** as the honest interim and label it "local sharpen".
4. **Stats HUD** on guardian: a small toggle (`#stats`) reading `pc.getStats()` each 1s →
   resolution, fps, codec (`mimeType`), bitrate (kbps), packet loss, RTT, relay type. Drives the
   adaptive UI and gives the carer real signal quality.
5. **Encrypted clip capture.** Guardian "📎 Save clip" → `MediaRecorder` on `#remote` (last ~15s
   ring buffer), download locally as an `.webm`/`.mp4` for evidence. **Consent-gated** (mum's
   "allow recording" capability, §B) and announced on her screen ("a clip is being saved").
6. **Zoom stays** (`guardian.html applyZoom`/`zoomAt` `:124–152`) and continues to drive **real
   optical PTZ** on the patient (`applyConstraints zoom` `:820`) when the camera supports it; CSS
   zoom is the fallback. Add a "1:1 / fit / fill" object-fit control.

**Where:** `guardian.html` `preferCodec:113`, `ICE:93`, `newPeer:161`, `makeOffer:169`, new
`#stats`/`#enhance`/`#clip` buttons in the control bar near `:60`; `jarvis_voice.html`
`preferCodec:799`, `getMedia:798`, ctrl handler `:820`; new `/turncreds` + Maxine relay in
`dashboard.py`/a new `server/services/care_relay.py`.

---

### B. Consent + accessibility — granular, revocable, audited (Apple/GDPR bar)

**Gap:** consent is a single boolean `jv_carer` (`:863`) granting see+hear+remind+control all at
once, no audit, no expiry, no live "what's on now" indicator; a11y is three toggles, no
Assistive-Access launcher, no reduced-motion, no formal target-size pass.

**Build:**
1. **Per-capability consent object** replacing the boolean. New persisted model:
   ```js
   CONSENT = {                         // localStorage 'jv_consent'
     see:  {on:false, grantedAt:null, expiresAt:null},   // camera to carer
     hear: {on:false, …},                                // mic to carer
     remind:{on:false, …},                               // reminders on this device
     drive:{on:false, …},                                // remote co-control of UI
     record:{on:false, …},                               // carer may save clips
     health:{on:false, …},                               // share vitals with carer
   }
   ```
   The consent dialog (`#consent` `:296`) becomes a **checklist of independently-toggleable rows**
   ("see me / hear me / remind me / drive my screen / save clips / share my health"), each with a
   plain-language line and a big switch — **default OFF**, mum opts in per item. `toggleCarer`
   `:896`/`consentYes` `:901` write per-capability grants, not a single flag.
2. **Re-consent expiry.** Each grant carries `expiresAt` (default 90 days, configurable by the
   trusted supporter). On expiry the capability silently reverts to OFF and mum is re-prompted —
   GDPR-aligned, no indefinite silent monitoring.
3. **Audit log.** Every grant/revoke/connect/control/clip/health-read event → append to a local
   `jv_consent_audit` ring **and** POST to `/consentlog` (§6) for a tamper-evident server record
   (hash-chained). Surfaced to mum as a readable "what happened" list in the Care sheet and to the
   carer as a compliance trail.
4. **Live "what's shared now" indicator (the watched light).** A persistent, always-visible chip on
   the patient screen whenever any sharing capability is live: e.g. `🔴 Camera on · Carer watching`
   / `🎙 Mic on` / `🕹 Carer controlling`. Mirrors exactly the active grants + live peer presence
   (from the existing poll `peer_online`). One tap → instant **"Stop sharing"** (revokes all live
   capabilities, closes the `pc`). This is the camera-on light; it can never be hidden.
5. **Assistive-Access launcher.** An optional **icon-grid, huge-target, reduced-chrome** home mode
   (toggle in Care → Accessibility) modelled on Apple Assistive Access: 2×N grid of giant labelled
   buttons (Talk to JARVIS · Call Family · HELP · Care), no small affordances, emoji+text.
6. **WCAG 2.2 AA pass.** Add `prefers-reduced-motion` honoring across the patient page (holo/flick
   animations `:243`, ripple `:678`, ampLoop `:660` → reduce/disable); enforce **≥24px targets** and
   visible focus rings (Assistive-Access toggles `:329`); `focus-not-obscured`; keep existing ARIA
   (`aria-live` `:240,248`, `role=switch` toggles `:329`) and extend to new controls.

**Where:** `jarvis_voice.html` — consent model + `consentYes`/`toggleCarer` `:896–906`; `#consent`
DOM `:296`; new watched-light DOM near `#topbar` `:238`; a11y/reduced-motion CSS near `:166` C2
block; Assistive-Access launcher as a new screen toggled from `applyAccess` `:876`.

---

### C. Reminders + emergency contacts — reliable background delivery (Google/Apple bar)

**Gap:** `checkReminders` runs on a 20s `setInterval` (`:976`) that **dies when the page sleeps** —
unacceptable for medication; no missed-dose escalation, no acknowledgement, no adherence tracking,
no calendar sync; the page is not an installable PWA.

**Build:**
1. **Server-scheduled Web Push (VAPID).** Move scheduling server-side: reminders POST to
   `/reminders` (§6); a tiny scheduler thread in `dashboard.py` fires **Web Push** (VAPID) to the
   patient's subscribed service worker at the due minute — works when the page is backgrounded/asleep.
   Patient subscribes via `pushManager.subscribe` (gesture-gated, after `enableNotifs` `:986`).
2. **PWA install.** Add `manifest.webmanifest` + register a real **service worker** (the page
   already calls `navigator.serviceWorker.ready` `:995` but ships no SW file). SW handles `push` →
   `showNotification` with **Confirm / Snooze 10m** actions and `notificationclick` → POST ack. iOS
   caveat: Push only after **Add-to-Home-Screen** → show an "Install this app" hint on iOS Safari.
3. **Acknowledge + snooze + adherence.** Each fire requires a tap (Confirm taken / Snooze). Missed
   (no ack within N min) → **escalate to the carer** via the signalling channel (`ctrl{missedDose}`)
   → guardian shows a "💊 Mum hasn't confirmed her 2pm tablet" alert. Track a per-med **adherence
   %** (taken/scheduled) shown to both, REAL from the ack log.
4. **Appointment sync.** Reminders of type "appointment" export/import **ICS** and (if Google
   OAuth is connected, §D) optional **Google Calendar** read so appts surface automatically.
5. **Carer-set reminders remotely.** Guardian gains a "💊 Add reminder for mum" form → `ctrl`
   message → patient adds it to `remList` (consent `remind` required). Closes the loop without mum
   typing.
6. **Fallback.** When Push is unavailable (no SW / iOS not installed / permission denied), keep the
   existing in-page `setInterval` checker as a **degraded fallback** and add optional **SMS/email**
   fan-out (carer-configured) for the highest-priority meds.

**Where:** `jarvis_voice.html` `checkReminders:959`/`setInterval:976`/`enableNotifs:986`/
`renderReminders:942`; new `server/sw.js` + `manifest.webmanifest` served by `dashboard.py`; new
`/reminders` + `/push/subscribe` + VAPID scheduler thread in `dashboard.py`; guardian add-reminder
form near `:153` control bar.

---

### D. Health-data link + alerts + OAuth (the hard integration)

**Gap:** Google Health OAuth path exists and is honest (`connectHealth:1018`, scope
`health.read:1031`, single `heart_rate` fetch `:1044`) but: only Google, only one metric, no
**Health Connect** (Android), no **HealthKit** bridge (iOS), no **SMART-on-FHIR** (clinical), and
**no thresholds → alerts to the carer**.

**Build:**
1. **Multi-source health.** Generalise `connectHealth` into a **source picker**: `google` (Google
   Health API — Fitbit successor, cloud OAuth2; Google Fit dies late-2026 so target the new API),
   `healthconnect` (Android on-device — only reachable from a native/TWA wrapper, so honest "open in
   the Android app"), `healthkit` (iOS native-only — web cannot read it → **Shortcuts/companion
   bridge** that POSTs vitals to `/healthpush`; show "connect via Shortcut" instructions), `fhir`
   (**SMART-on-FHIR** OAuth for clinical records). Each shows REAL values or "not connected".
2. **More vitals.** Beyond heart-rate, pull steps, resting HR, SpO₂, sleep, blood-pressure (where
   the source exposes them) into `#healthVals` (`renderHealth:1003`), each with timestamp + source
   badge. Never invent — missing metric shows "—".
3. **Thresholds → health alerts.** Per-vital thresholds (configurable by the trusted supporter):
   resting HR > X / < Y, SpO₂ < 92, no steps by 11am ("not moving"), missed-dose (from §C). Breach
   → **alert to the carer** (signalling `ctrl{healthAlert}` → guardian banner + siren option) and a
   patient-side gentle nudge. Health sharing is **consent `health`-gated** (§B) and treated as GDPR
   special-category (explicit consent, revocation, audit).
4. **OAuth unification.** Keep GSI (`#gsiBtn`) + Sign-in-with-Apple (`#appleBtn`) for identity; add
   the health scopes to the same Google token where possible; persist tokens only client-side
   (localStorage `jv_health_*`), never server-stored, honest disconnect (`:1021`).

**Where:** `jarvis_voice.html` `connectHealth:1018`/`renderHealth:1003`/scope `:1031`/fetch `:1044`;
new `#healthSource` picker + threshold UI in the Care sheet health block `:367`; guardian health
banner near SOS `:179`; optional `/healthpush` (HealthKit-bridge inbound) + `/fhir/*` in
`dashboard.py`.

---

### E. Remote co-control — carer drives her device (the headline ask)

**Gap:** "control" today is only camera/mic/flip/speak/ring/SOS/zoom (`ctl:153`, ctrl handler
patient-side). The carer cannot actually **drive** mum's device.

**Build (layered, honest about platform limits):**
1. **Layer 1 — co-control of the JARVIS web app itself (in our control, ship first).** Open a
   **WebRTC DataChannel** alongside the media `pc` (both sides). The carer's pointer over a mirrored
   layout streams as normalized `{x,y}` → patient renders a **"carer's hand" cursor overlay**; a
   carer tap sends `{tap:'<elementId>'}` → patient **programmatically activates that JARVIS control**
   (open Care, start a reminder, dial a contact, switch camera). This is real remote driving of OUR
   UI, no MDM, no OS hooks — **consent `drive`-gated**, with the live "🕹 Carer controlling"
   indicator (§B) and an instant mum-side "take back control" button.
2. **Layer 2 — guided assist (cross-app, within web limits).** Carer screen-annotation: a
   "tap here" pulsing ring the carer places, shown over mum's screen-share, for "press the green
   button" guidance where direct injection is impossible.
3. **Layer 3 — full device control (native, documented not built in web).** True OS-level driving =
   **Android AccessibilityService + MediaProjection companion app** injecting input over the same
   DataChannel; **iOS forbids** third-party full control (screen-share + pointer overlay only).
   Spec'd as the companion-app roadmap; the web build delivers Layers 1–2.
4. **Transport upgrade.** Co-control needs **low-latency ordered** delivery → move ctrl + cursor
   onto the **DataChannel** (the 90s-TTL short-poll `care_signal` stays for SDP/ICE bootstrap only).

**Where:** `guardian.html` — DataChannel on `newPeer:161`, pointer capture on `#remote`/`#stage`
near zoom init `:137`, "tap here" tool; `jarvis_voice.html` — DataChannel + cursor overlay +
`tap` dispatcher near the ctrl handler `:820`; consent `drive` gate (§B).

---

## 4. Ontology / observability (Palantir bar)

Model the domain as **objects + audited actions**, not loose localStorage:

```
Patient ──cares──< Carer
Patient ──has──< Contact, Reminder, Vital, Consent, Event
Reminder ──acked_by──> Event       Vital ──breaches──> Alert ──notifies──> Carer
Consent ──grants/revokes──> Event (hash-chained audit)
Session(pc) ──used capabilities──> Event
```

- **Persist signalling + events beyond in-memory.** `care_signal.py` is in-RAM (`_ROOMS` `:20`) and
  loses everything on restart. Add an optional **SQLite-backed** store
  (`server/data/care.db`) for the **event/audit/consent/reminder/adherence** records (NOT the
  realtime SDP relay — that stays ephemeral). Follows the [[data-stores-map]] "hard-protect, never
  delete" rule.
- **Identity + E2EE.** Today rooms are guessable (`room=mum`); add a **room secret** + optional
  **insertable-streams E2EE** over the existing DTLS, and authenticate carer↔patient pairing.
- **Carer console = a Foundry-grade object view:** mum's live tile + vitals sparklines + adherence +
  consent state + audit timeline + alert feed, all REAL, all linked.

---

## 5. New server routes & services (`server/dashboard.py` + `server/services/`)

| Route / service | Purpose | Auth | Anchor to add near |
|---|---|---|---|
| `GET /turncreds?room=` | HMAC time-limited coturn creds (§A) | room-secret | new GET branch by `/carerooms` `:1837` |
| `GET /vapidkey` | public VAPID key for push subscribe (§C) | token-free | GET branch |
| `POST /push/subscribe` | store patient SW push subscription (§C) | room | new POST branch by `/rtc` `:1940` |
| `POST /reminders` `GET /reminders` | server-side reminder CRUD + schedule (§C) | room | POST/GET branches |
| scheduler thread | fires due reminders via Web Push (§C) | — | alongside existing `_SNAP` background thread |
| `POST /consentlog` `GET /consentlog` | hash-chained consent/audit trail (§B,§4) | room | POST/GET branches |
| `POST /healthpush` | inbound vitals from HealthKit Shortcut bridge (§D) | room+secret | POST branch |
| `GET /fhir/*` | SMART-on-FHIR proxy (optional, §D) | OAuth | GET branch |
| `GET /sw.js` `GET /manifest.webmanifest` | PWA assets (§C) | token-free static | `_tmpl`/static near `:1730` |
| `server/services/care_store.py` | SQLite events/consent/reminders/adherence (§4) | — | new file |
| `server/services/care_relay.py` | Maxine VSR relay shim on [[vast-gpu-box]] (§A) | bridge-key | new file |

All new routes follow the **existing token model** (`CONTROL_TOKEN` `:63` for control,
`CLIMATE_BRIDGE_KEY` `:67` for non-browser); realtime relay stays token-free like `/rtc` (`:1937`
comment). New deps (`pywebpush`) gated behind a try/except so a missing lib degrades to the in-page
fallback, never crashes the lifeline.

---

## 6. Signalling upgrade (`server/services/care_signal.py`)

- Keep the in-memory short-poll for **SDP/ICE/ctrl bootstrap** (it works, it's lifeline-safe).
- Add a **DataChannel** for high-frequency ctrl/cursor (§E) so co-control isn't bottlenecked by the
  90s-TTL poll.
- Add **room-secret gating** on `post`/`poll` (`:49`,`:65`) so a stranger can't join `room=mum`.
- Bridge durable events (consent/reminders/adherence) into `care_store.py` (§4) while leaving
  ephemeral SDP in RAM.

---

## 7. Accessibility, performance, safety (hard rules)

- **a11y:** `prefers-reduced-motion` honored across both pages (patient holo/ripple/amp anims,
  guardian zoom transitions); WCAG 2.2 AA target-sizes ≥24px; focus-not-obscured; full keyboard
  activation on every new control; `aria-live` on the watched-light, alerts, and reminder acks;
  Assistive-Access large-launcher mode.
- **Perf:** SVC/simulcast adapt to bandwidth instead of freezing; `getStats` HUD throttled to 1s;
  MediaRecorder is a bounded ring buffer; SQLite writes are async/batched; Maxine enhance is opt-in
  and GPU-gated. No new heavy frameworks on the patient page (keep it phone-light for mum).
- **Safety:** never fabricate — every health/vital/relay/enhance shows "not connected"/"unavailable"
  when down (verified pattern, `connectHealth` already does this `:1021`); never break the three pm2
  services; new server code wrapped in try/except so a missing dep degrades, never 500s the
  dashboard; preserve **every** existing care feature (walkie-talkie, zoom, SOS, dead-man's-switch,
  contacts, reminders, health OAuth, accessibility toggles); no page ever left with a JS error.

---

## 8. Where the code goes — edit map

| New piece | File · anchor |
|---|---|
| Codec ladder + SVC + simulcast | `guardian.html preferCodec:113`, `makeOffer:169`; `jarvis_voice.html preferCodec:799`, `getMedia:798` |
| HMAC TURN (replace openrelay) | `guardian.html ICE:93` + patient ICE; `dashboard.py /turncreds` near `:1837` |
| Stats HUD + enhance + clip | `guardian.html` control bar near `:60`, `newPeer:161` (`getStats`, `MediaRecorder`) |
| Maxine VSR relay | new `server/services/care_relay.py` + `dashboard.py` route |
| Granular consent model + checklist | `jarvis_voice.html` `#consent:296`, `consentYes:901`, `toggleCarer:896`; CSS C2 block `:166` |
| Watched-light indicator | `jarvis_voice.html` near `#topbar:238` |
| Audit log + expiry | `jarvis_voice.html` consent fns; `dashboard.py /consentlog`; `care_store.py` |
| Assistive-Access launcher + reduced-motion | `jarvis_voice.html applyAccess:876`, a11y CSS `:166`, anims `:243/:660/:678` |
| Server-push reminders + PWA | `jarvis_voice.html checkReminders:959`/`enableNotifs:986`; new `server/sw.js` + `manifest.webmanifest`; `dashboard.py /reminders` + `/push/subscribe` + scheduler + `/vapidkey` |
| Missed-dose escalation + carer-set reminders | patient `checkReminders:959`; guardian add-reminder form near `:153` |
| Multi-source health + thresholds + alerts | `jarvis_voice.html connectHealth:1018`/`renderHealth:1003`, health block `:367`; guardian banner near `:179`; `dashboard.py /healthpush` `/fhir/*` |
| Remote co-control DataChannel + cursor overlay | `guardian.html newPeer:161`, `#stage` zoom init `:137`; `jarvis_voice.html` ctrl handler `:820` |
| Persistent care store + room-secret | new `server/services/care_store.py`; `care_signal.py post/poll:49,65` |

All additions are **additive** — the existing walkie-talkie, zoom, SOS, reminders, health-OAuth and
accessibility toggles keep working unchanged even before any new pillar lands.

---

## 9. Build order (Stage-3+ execution)

1. **Consent + a11y foundation** (§B) — granular model, watched-light, reduced-motion, audit
   scaffold. (Everything else is gated on consent, so this is first.)
2. **Reliable reminders** (§C) — SW + PWA + `/vapidkey` + `/push/subscribe` + `/reminders` +
   scheduler + ack/snooze; missed-dose escalation.
3. **Remote co-control Layer 1** (§E) — DataChannel + carer cursor + tap-dispatch on the JARVIS UI.
4. **Video resilience** (§A) — codec ladder + SVC/simulcast + HMAC TURN + stats HUD + clip; then the
   GPU-gated Maxine enhance.
5. **Health multi-source + thresholds → alerts** (§D).
6. **Ontology persistence + room-secret + E2EE** (§4) — `care_store.py`, hash-chained audit, pairing.
7. **Polish to Hollywood-cinematic + Foundry-grade carer console**; full WCAG 2.2 AA + Assistive
   Access pass.

---

## 10. Acceptance criteria (Stage 9 will check against THIS)

1. **No regression:** walkie-talkie, guardian zoom/PTZ, SOS+siren, dead-man's-switch, contacts,
   reminders, health-OAuth, accessibility toggles all still work; pm2 lifeline untouched; no JS
   error on either page.
2. **Consent is granular + revocable + audited:** mum opts in per capability (see/hear/remind/drive/
   record/health), each independently toggleable, default OFF, with expiry; a hash-chained audit
   trail exists; a persistent **"what's shared now"** indicator shows live sharing and "Stop
   sharing" works instantly.
3. **Reminders survive a sleeping phone:** a server-scheduled Web Push fires when the patient page is
   backgrounded (PWA installed); ack/snooze works; a missed dose **escalates to the carer**;
   adherence % is REAL.
4. **Video:** H265 negotiated when both support it, with a working **AV1/VP9-SVC + simulcast**
   fallback on weak links; **HMAC TURN** (not openrelay); a stats HUD shows real codec/res/fps/
   bitrate/relay; zoom still drives real PTZ; clip-capture is consent-gated; "Enhance" shows real
   GPU upscale when the relay is up, "unavailable" when down (never fake).
5. **Health:** at least Google Health + one more source selectable; REAL vitals or "not connected";
   per-vital thresholds raise an **alert to the carer**; health is consent-gated + audited.
6. **Remote co-control:** with `drive` consent, the carer's cursor + taps drive mum's JARVIS UI in
   real time over a DataChannel; mum can take back control instantly; the "controlling" indicator is
   live.
7. **Accessibility:** `prefers-reduced-motion` honored; targets ≥24px; full keyboard nav; Assistive-
   Access launcher available; `aria-live` on new alerts/acks.
8. **Honesty + safety:** nothing fabricated anywhere; every unavailable source/relay/enhance says so;
   durable events persist in `care.db` across a dashboard restart; new deps degrade gracefully if
   missing.
9. **Finish:** carer console reads as a Foundry-grade object view (live tile + vitals + adherence +
   consent + audit + alerts), patient UI polished to a calm, Apple-Assistive-Access-grade,
   Hollywood-cinematic finish consistent with the existing JARVIS aesthetic.
