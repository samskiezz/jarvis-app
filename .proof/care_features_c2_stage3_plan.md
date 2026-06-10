# Stage 3 — CONCRETE ENGINEERING PLAN
## Care / Guardian feature pack (C2)

> Turns the Stage-2 design (`.proof/care_features_c2_stage2_spec.md`, [[care-features-c2]]) into a
> **build-ready** plan: exact files, exact function signatures, data-flow shapes, the precise wiring
> points, edge cases, accessibility, and a per-change **lifeline-safety** proof. Every line anchor
> below was **re-verified against the live files on 2026-06-10** (the Stage-2 anchors had all
> shifted). The patient/guardian HTML still moves a few lines per edit — **re-grep the symbol, not
> the number, before each edit**; the symbols here are stable, the numbers are a snapshot.
>
> HARD INVARIANTS (every step honours all of these or it does not ship):
> 1. Never break `jarvis-dashboard` / `jarvis-voiceclone` / `jarvis-tasks` (a disabled user's lifeline).
> 2. Every datum REAL — show "not connected"/"unavailable", never fabricate.
> 3. Preserve every existing feature (walkie-talkie, zoom/PTZ, SOS+siren, dead-man's-switch,
>    contacts, reminders, health-OAuth, a11y toggles).
> 4. Never leave either page with a JS error.
> 5. **Import-time safety:** nothing new may make `dashboard.py` fail to import or boot — all new deps
>    are lazy + try/except-guarded; a missing dep disables a feature, never 500s the dashboard.

---

## 0. Verified substrate (current anchors — the ground truth this plan builds on)

### `server/jarvis_voice.html` (PATIENT / mum)
| Symbol | Anchor | Shape |
|---|---|---|
| `ROOM` / `CFG{family,emergency,rocky,captions,tv}` | `:619` / `:620–626` | `(Q.get('room')||'mum').toLowerCase()` |
| `getMedia(face)` 2K | `:797–798` | `getUserMedia({audio:true,video:{facingMode,width:{ideal:2560},height:{ideal:1440},frameRate:{ideal:30}}})` |
| `preferCodec(p)` sender | `:799–802` | order `['video/h265','video/vp9','video/h264','video/vp8']` → `setCodecPreferences` |
| `sig(kind,payload)` | `:803–804` | `POST /rtc {room,from:'patient',to:'guardian',kind,payload}` |
| `pc.ontrack`/`onconnectionstatechange` | `:808/:809` | sets `connected`, `famOn(true)` |
| `addTrack` after remote desc | `:812` | `local.getTracks().forEach(t=>pc.addTrack(t,local))` |
| `onMsg` handler (offer/answer/ice/hello/ctrl) | offer `:811`, answer `:814`, ice `:815`, hello `:816`, **ctrl `:817–821`** | ctrl handles `cam,mic,zoom(applyConstraints advanced),speak,ring` |
| `famOn(on)` | `:822` | updates `#fam` |
| `poll()` | `:824–825` | `/rtc/poll?room=&role=patient&since=` @800ms |
| `load(k,d)`/`save(k,v)` | `:860/:861` | localStorage JSON |
| `ACCESS=load('jv_access',{bigtext,hc,voicecmd})` | `:862` | |
| `CARER=load('jv_carer',false)` | `:863` | **boolean — to be superseded** |
| `CONTACTS=load('jv_contacts',[])` | `:864` | `[{name,num}]` |
| `REMINDERS=load('jv_reminders',[])` | `:865` | `[{id,text,time:"HH:MM",repeat:'daily'|'once',lastFired:"YYYY-MM-DD"}]` |
| `GSI_CLIENT`/`APPLE_CLIENT`/`APPLE_REDIRECT` | `:867/:868/:869` | OAuth config |
| `openCare()` → `applyAccess();renderContacts();renderReminders();renderCarer();renderNotifChip();renderHealth();renderSignin()` | `:872` | open Care sheet |
| `closeCare()` | `:873` | |
| `applyAccess()`/`setAccess(k,v)` | `:876–882/:883–886` | toggles `body.bigtext/.hc`, voice |
| `toggleCarer()`/`consentYes()`/`consentNo()` | `:896–900/:901–905/:906–907` | **boolean consent — to be superseded** |
| `renderContacts()`/`addContact()` | `:910–921/:922–927` | |
| `renderReminders()`/`addReminder()`/`checkReminders()`/`fireReminder()` | `:942–950/~:954/:959–971` | |
| **`setInterval(checkReminders,20000)` + `setTimeout(checkReminders,3000)`** | `:976` | **dies when page sleeps** |
| `enableNotifs()`/`showHealthNotif(t,b)` (`navigator.serviceWorker.ready`→`reg.showNotification` else `new Notification`) | `:986–992/:993–999` | **registers no SW file** |
| `renderHealth()`/`connectHealth()` scope `health.read` `:1031`, heart_rate fetch `:1044–1053` | `:1003–1017/:1018–1027` | honest "not connected" `:1014` |
| OAuth render: GSI `:1074`, Apple `:1088–1093` | | |
| DOM: `#consent` modal (`.cwrap :216`,`.plain :218`,`.actions :221`) | `:296–310` | |
| DOM: `#topbar`(`#gear`,`#fam` aria-live) | `:238–241` | watched-light mount point |
| DOM: Care sheet — Carer `:320–324`, Accessibility `:326–335` (`#tgBig/#tgHc/#tgVoice` `role=switch` `:329–334`), Contacts `:337–346`, Reminders `:348–364`, Health `:366–371` (`#healthVals :369`), Sign-In `:373–379` | | |
| CSS keyframes (NO reduced-motion guard): `daisPulse :58`,`flick :64`,`rip :89`,`pulseRing :96`,`hp :112`,`pl :135`,`fl :158` | | |

### `server/guardian.html` (CARER / son)
| Symbol | Anchor | Shape |
|---|---|---|
| `ICE=[…]` (Google+Twilio STUN, **openrelay** TURN ×3) | `:92–95` | used `new RTCPeerConnection({iceServers:ICE})` `:162` |
| `pickVoice()`/`jarvis(t)` | `:99/:100` | en-GB |
| `sig(kind,payload)` | `:102` | `POST /rtc {room,from:ROLE,to:'patient',kind,payload}` |
| `getMedia()` | `:103–104` | front cam 2K |
| `preferCodec(p)` receiver caps | `:113–120` | order `['video/h265','video/vp9','video/h264','video/vp8']` |
| zoom: `clampPan :124`,`applyZoom :127`,`zoomReset :131`,`zoomAt :133`,`initZoom :137–152` | | CSS transform on `#remote`/`#stage` |
| `ctl(what)`/`ring()`/`sayIt()`/`toggleMyCam()`/`toggleMyMic()`/`talk(on)` | `:153–160` | `sig('ctrl',{cam/mic/flip/ring/speak})` |
| `newPeer()` (**no DataChannel**)/`makeOffer()` | `:161–166/:169–171` | `preferCodec(pc)` right after addTrack `:162` |
| `onMsg`: answer/ice/hello/ctrl | `:172–178` | |
| `showSos()`/`ackSos()`/`siren()` | `:179/:180/:181` | WebAudio siren |
| `poll()`/`startPolling()`; offline check @5s (>40s→`#offOv`)/`dismissOff()` | `:182/:188/:191–197/:189` | |
| Control bar DOM (`#hcam,#myc,#talk,#mymic,#say`) | `:64–78` (`.row` grid `:27`) | new buttons mount here |
| `#stage`/`#remote`/`#sosOv :37`/`#offOv :41` | | **no `__CTOKEN__` use; no reduced-motion** |

### `server/dashboard.py` (ROUTER — stdlib ThreadingHTTPServer :8095)
| Symbol | Anchor | Notes |
|---|---|---|
| imports (incl. `sqlite3,secrets,mimetypes,threading,json,os`) | `:19–30` | |
| `PORT :32`; `ROOT :36`; `BRAIN_DB…FB_DB` | `:36–41` | `ROOT=/opt/jarvis-app-1` |
| `_control_token() :43` → `CONTROL_TOKEN :63`; `CLIMATE_BRIDGE_KEY :67` | | token persisted `server/data/.control_token` |
| `_count(db,q,*a)` | `:89–96` | open-per-call sqlite, try/except → None |
| `_health(m)` → `_SNAP["health"]{score,level,summary,alerts,gauges}` | `:589–689` | |
| `_SNAP` global `:869`; `_refresher()` 2s loop `:872–894`; thread start `:2121` | | **scheduler thread template** |
| `_vitals()` `:1906–1911`; `GET /healthreport` `:1912–1916` | | token-free |
| class `_H` `:1721–2098`; `_send(body,ctype)` `:1722–1728` (200+CORS+CT+CL, **no extra-header hook**); `_tmpl(name)` `:1730–1736` (replaces `__CTOKEN__`) | | |
| `do_GET` `:1738–1932`: `/rtc/poll :1831`, `/carerooms :1837`, pages `/talk//companion//care//guardian :1840–1845`, `/asset/ :1851–1863` (mimetypes, cache 86400), `/assetlist :1864`, `/media/ :1871–1890` | | if/elif on `self.path.startswith()` |
| `do_POST` `:1934–2095`: query parse `:1935–1936`; `/rtc :1940–1950` (**token-free**, `CS.post`); `/climate/report :1951` (**key**); `/climate/cmd :1964` (**token**); `/chat :1985`; `/task…/agent/run :2025–2095` (**token**) | | body read pattern `:1943–1946` |
| `main()` `:2101–2126` bind `0.0.0.0:PORT`; `ThreadingHTTPServer.daemon_threads=True` | | |

### `server/services/care_signal.py` (SIGNALLING — in-memory, no auth, no persistence)
`_LOCK :19`, `_ROOMS :20`, `_MSG_TTL=90 :21`, `_PEER_TTL=14 :22`, `_ROOM_TTL=1800 :23`; room dict `{seq,msgs,presence}` `:33`; `post(room,frm,to,kind,payload)->{ok,seq}` `:49–62` (msg `{seq,to,from,kind,payload,ts}`, stamps `presence[frm]`); `poll(room,role,since)->{ok,seq,msgs,peer_online,peers,room,role}` `:65–81` (filter `to==role and seq>since`, stamps `presence[role]`, `peer_online=any(other within 14s)`); `rooms()` `:84–94`.

**Net-new (confirmed absent):** `care_store.py`, `care_relay.py`, `sw.js`, `manifest.webmanifest`, any VAPID/webpush.

---

## 1. File inventory — what gets created vs touched

### NEW files
| Path | Lines (est) | Responsibility | Optional-dep risk |
|---|---|---|---|
| `server/services/care_store.py` | ~280 | SQLite ontology at `server/data/care.db`: consent-audit (hash-chained), reminders + fire/ack events + adherence, push subscriptions, vitals, alerts. All fns fail-safe (return `None`/`[]`). | stdlib `sqlite3` only — **zero new deps** |
| `server/services/care_push.py` | ~90 | VAPID key mgmt + Web-Push send wrapper. Lazy-imports `pywebpush`/`py_vapid`; if absent → `available()==False`, send is a no-op. | `pywebpush` (guarded) |
| `server/services/care_turn.py` | ~40 | HMAC time-limited coturn cred minting (`hmac`/`hashlib` stdlib). Returns STUN-only honest fallback when `TURN_SECRET` unset. | stdlib only |
| `server/services/care_relay.py` | ~120 | Maxine VSR "Enhance" relay shim to [[vast-gpu-box]]; reachability probe; honest "unavailable". | network-gated, opt-in |
| `server/care_sw.js` | ~90 | Service worker: `push`→`showNotification` (Confirm/Snooze actions), `notificationclick`→ack POST, minimal offline shell. Served at **root scope**. | n/a |
| `server/care_manifest.webmanifest` | ~25 | PWA manifest (name, icons, `start_url:/talk`, `display:standalone`). | n/a |

> SW + manifest live in `server/` (not `jarvis_assets/`) and are served by **dedicated root-scope
> routes** (§3) — a SW served from `/asset/care_sw.js` would be scope-locked to `/asset/` and could
> not control `/talk`. Root scope requires the `Service-Worker-Allowed: /` header → see §3.0.

### MODIFIED files (all changes ADDITIVE — see §8 lifeline proof)
- `server/jarvis_voice.html` — consent model + watched-light + a11y + SW reg + push subscribe + reminder server-sync + DataChannel receiver + carer-cursor overlay + multi-source health. Existing fns get **wrapping hooks**, not rewrites.
- `server/guardian.html` — codec ladder + TURN fetch + stats HUD + clip + DataChannel + cursor capture + add-reminder form + health/missed-dose banners.
- `server/dashboard.py` — new GET/POST elif branches (§3) + `_send_h` helper + scheduler thread. **No existing branch edited.**
- `server/services/care_signal.py` — optional room-secret gate (additive param, default off) + bridge durable events into `care_store`.

---

## 2. Data layer

### 2.1 `care_store.py` — SQLite schema (`server/data/care.db`)
Open-per-call (mirrors `_count` `:89`), `PRAGMA journal_mode=WAL`, a module `_WLOCK` for writes. `init()` runs `CREATE TABLE IF NOT EXISTS` idempotently; **failure disables the store, never raises** to callers.

```sql
CREATE TABLE IF NOT EXISTS consent_audit(     -- hash-chained, tamper-evident
  id INTEGER PRIMARY KEY, room TEXT, ts REAL, actor TEXT,   -- actor: 'patient'|'carer'|'system'
  type TEXT, cap TEXT, detail TEXT, prev_hash TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS reminder(
  id TEXT PRIMARY KEY, room TEXT, text TEXT, time TEXT,     -- time "HH:MM"
  repeat TEXT, kind TEXT, created_by TEXT, created_ts REAL, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS reminder_event(
  id INTEGER PRIMARY KEY, reminder_id TEXT, room TEXT, due_ts REAL,
  fired_ts REAL, acked_ts REAL, action TEXT, source TEXT);  -- action: 'taken'|'snooze'|'missed'
CREATE TABLE IF NOT EXISTS push_sub(
  id INTEGER PRIMARY KEY, room TEXT, role TEXT, endpoint TEXT UNIQUE,
  p256dh TEXT, auth TEXT, created REAL);
CREATE TABLE IF NOT EXISTS vital(
  id INTEGER PRIMARY KEY, room TEXT, type TEXT, value REAL, unit TEXT, ts REAL, source TEXT);
CREATE TABLE IF NOT EXISTS alert(
  id INTEGER PRIMARY KEY, room TEXT, ts REAL, type TEXT, detail TEXT, level TEXT, acked INTEGER DEFAULT 0);
```

**Public API (every fn try/except → safe default; never raises into the router):**
```python
init() -> bool                                   # idempotent DDL; False if unavailable
append_audit(room, actor, type, cap, detail) -> dict|None   # computes hash=sha256(prev_hash+payload)
list_audit(room, limit=100) -> list
add_reminder(room, rem:dict, created_by) -> bool # rem={id,text,time,repeat,kind}
list_reminders(room, active=True) -> list
set_reminder_active(room, rid, active) -> bool
due_reminders(now_ts) -> list                    # across all rooms; computes next due vs reminder_event ledger
record_fire(reminder_id, room, due_ts, source) -> int|None     # returns event id, idempotent per (rid,due-day)
record_ack(reminder_id, room, action, ts) -> bool
adherence(room, reminder_id=None, days=30) -> dict   # {scheduled,taken,pct}
save_sub(room, role, sub:dict) -> bool           # sub={endpoint,keys:{p256dh,auth}}
subs_for(room, role='patient') -> list
add_vital(room, type, value, unit, source) -> bool
latest_vitals(room) -> dict                      # {type:{value,unit,ts,source}}
add_alert(room, type, detail, level) -> dict|None
list_alerts(room, since_ts=0) -> list
```

### 2.2 localStorage models (patient)
| Key | Replaces | Shape |
|---|---|---|
| `jv_consent` | `jv_carer` boolean | `{v:2, see:{on,grantedAt,expiresAt}, hear:{…}, remind:{…}, drive:{…}, record:{…}, health:{…}}` — all `on:false` default |
| `jv_consent_audit` | new | ring buffer (cap 200) `[{ts,type,cap,detail}]` mirror of server audit |
| `jv_access` (extend) | — | add `reduce:false`, `simple:false` (Assistive-Access launcher) |
| `jv_health_src` | — | `'google'|'healthconnect'|'healthkit'|'fhir'` |
| `jv_health_thresholds` | new | `{restingHR:{lo,hi}, spo2:{lo}, steps:{byHour,min}}` (set by trusted supporter) |
| `jv_push_sub` | new | cached PushSubscription JSON (for state UI only; source of truth is server) |

**Migration (`loadConsent()` runs once at boot):** if `jv_consent` absent and `jv_carer===true` →
seed `see/hear/remind` `on:true, grantedAt:now, expiresAt:now+90d` (preserves today's behaviour), write
audit `{type:'migrate'}`. `CARER` stays defined as a **derived getter** `anyConsent()` so every existing
reader of `CARER` keeps working unchanged.

### 2.3 `care_signal.py` additions (additive)
- `post`/`poll` gain optional `secret=None`; when a room has a registered secret (future pairing) and
  the arg mismatches → return `{ok:False,error:'room_secret'}`. Default `None` ⇒ **today's behaviour
  unchanged** (walkie-talkie keeps working before pairing ships).
- New `bridge(room, kind, payload)` helper that mirrors durable events (`consent`,`reminder_ack`,
  `alert`) into `care_store` — wrapped so a store failure never breaks the realtime relay.

---

## 3. Server routes & wiring (`dashboard.py`)

**Pattern (verified):** add an `elif self.path.startswith("/x")` branch — GET before the `/asset/`
fallthrough (`:1851`), POST before the token-checked block (`:2025`). Reuse the body-read idiom
(`:1943`) and `self._send(json.dumps(d).encode(),"application/json")`. **Touch no existing branch.**

### 3.0 New header-capable sender (so existing `_send` stays untouched)
```python
def _send_h(self, body: bytes, ctype: str, headers: dict | None = None):
    self.send_response(200); self.send_header("Content-Type", ctype)
    self.send_header("Access-Control-Allow-Origin", "*")
    for k, v in (headers or {}).items(): self.send_header(k, v)
    self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
```
Add beside `_send` `:1728`. Used only by the two SW/manifest routes.

### 3.1 Route table
| Method · Path | Auth | Request | Response | Insert near | Backed by |
|---|---|---|---|---|---|
| `GET /care_sw.js` | none | — | JS, `Service-Worker-Allowed:/`, `Content-Type:text/javascript`, **no cache** | before `/asset/` `:1851` | reads `server/care_sw.js` via `_send_h` |
| `GET /care_manifest.webmanifest` | none | — | `application/manifest+json` | same | reads `server/care_manifest.webmanifest` |
| `GET /vapidkey` | none | — | `{publicKey}` or `{publicKey:null}` if push unavailable | `:1837` group | `care_push.public_key()` |
| `GET /turncreds?room=` | none | query | `{iceServers:[…]}` (HMAC TURN if `TURN_SECRET` else STUN-only honest) | `:1837` group | `care_turn.creds(room)` |
| `POST /push/subscribe` | none (relay-tier) | `{room,role,sub}` | `{ok}` | `:1940` group | `care_store.save_sub` |
| `POST /reminders` | none (relay-tier) | `{room,role,op,reminder?}` (`op:list|add|remove|ack`) | `{ok,reminders?}` | `:1940` group | `care_store.*` + `care_signal.bridge` |
| `POST /consentlog` | none (relay-tier) | `{room,actor,type,cap,detail}` | `{ok,hash}` | `:1940` group | `care_store.append_audit` |
| `GET /consentlog?room=` | none | query | `{audit:[…]}` | `:1837` group | `care_store.list_audit` |
| `POST /healthpush` | `key=` (bridge) | `{room,vitals:[{type,value,unit}]}` | `{ok}` | `:1951` (mirror `/climate/report`) | `care_store.add_vital` + threshold check → `care_signal.post(ctrl healthAlert)` |
| `GET /carevitals?room=` | none | query | `{vitals:{…}, alerts:[…]}` | `:1837` group | `care_store.latest_vitals/list_alerts` |
| `GET /carestatus?room=` | none | query | `{relay,push,enhance,store}` capability probe (all honest booleans) | `:1837` group | probes |
| `POST /enhance` | `token` | `{room,on}` | `{ok,available}` | `:2025` block | `care_relay.toggle` |

> **Auth rationale:** realtime/relay routes stay token-free exactly like `/rtc` (the patient page has
> no token; only `guardian.html` could carry `__CTOKEN__` and today doesn't). Cross-trust ingress
> (`/healthpush` from a Shortcut, `/enhance` GPU spend) is gated — `/healthpush` by `CLIMATE_BRIDGE_KEY`
> (mirrors `/climate/report` `:1951`), `/enhance` by `CONTROL_TOKEN` (mirrors `/task` block `:2025`).
> Room-secret pairing (§2.3) later upgrades the relay tier without breaking today's flow.

### 3.2 Scheduler thread (reminders)
Mirror `_refresher` `:872` + start beside `:2121`:
```python
def _care_scheduler():
    while True:
        try:
            if care_store.init():
                now = time.time()
                for ev in care_store.due_reminders(now):           # never-fired-this-slot reminders
                    eid = care_store.record_fire(ev["id"], ev["room"], ev["due_ts"], "scheduler")
                    if eid and care_push.available():
                        for s in care_store.subs_for(ev["room"], "patient"):
                            care_push.send(s, {"t":"reminder","id":ev["id"],"text":ev["text"]})
                # missed-dose escalation: fired >N min ago, still un-acked
                for ev in care_store.unacked_overdue(now, grace_s=900):
                    care_signal.post(ev["room"],"system","guardian","ctrl",
                                     {"missedDose":{"id":ev["id"],"text":ev["text"],"due":ev["due_ts"]}})
                    care_store.record_ack(ev["id"], ev["room"], "missed", now)
        except Exception:
            pass
        time.sleep(20)
threading.Thread(target=_care_scheduler, daemon=True).start()
```
Wrapped whole-loop in try/except + 20 s sleep ⇒ a bug here can never wedge the dashboard; if
`care_store`/`care_push` import fails the loop idles harmlessly.

### 3.3 Boot-time imports (lazy + guarded)
At top of `dashboard.py`, **inside try/except** (mirrors the piper pattern `:1408`):
```python
try:    from server.services import care_store, care_push, care_turn, care_relay
except Exception: care_store = care_push = care_turn = care_relay = None
```
Every call site does `if care_store:` first. A totally missing services layer ⇒ care routes return
`{"ok":False,"error":"care store unavailable"}` and the page degrades to localStorage-only — **the
lifeline pages still serve.**

---

## 4. Per-pillar engineering detail

### Pillar B — Consent + accessibility (FOUNDATION, build first; everything gates on it)

**New patient JS (additive, near `:863` + `:896`):**
```js
let CONSENT = loadConsent();                       // migrates jv_carer; sweeps expiry
function capActive(cap){const c=CONSENT[cap]; return !!(c&&c.on&&(!c.expiresAt||Date.now()<c.expiresAt));}
function anyLive(){return ['see','hear','drive','record'].some(capActive);}
function grantCap(cap,days){CONSENT[cap]={on:true,grantedAt:Date.now(),expiresAt:Date.now()+ (days||90)*864e5};
  save('jv_consent',CONSENT); auditEvent('grant',cap); renderWatchedLight(); sig('ctrl',{consent:capSummary()});}
function revokeCap(cap){CONSENT[cap]={on:false,grantedAt:null,expiresAt:null};
  save('jv_consent',CONSENT); auditEvent('revoke',cap); renderWatchedLight(); sig('ctrl',{consent:capSummary()});
  if(cap==='see'||cap==='hear'){const t=local&&local.getTracks();/* disable corresponding track */}}
function sweepExpiry(){let ch=false; for(const k in CONSENT){const c=CONSENT[k];
  if(c&&c.on&&c.expiresAt&&Date.now()>=c.expiresAt){c.on=false; auditEvent('expire',k); ch=true;}}
  if(ch){save('jv_consent',CONSENT); renderWatchedLight();}}
function auditEvent(type,cap,detail){const ring=load('jv_consent_audit',[]);
  ring.push({ts:Date.now(),type,cap,detail:detail||''}); save('jv_consent_audit',ring.slice(-200));
  fetch('consentlog',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({room:ROOM,actor:'patient',type,cap,detail:detail||''})}).catch(()=>{});}
function stopAllSharing(){['see','hear','drive','record'].forEach(c=>{if(capActive(c))revokeCap(c);});
  try{if(pc)pc.close();}catch(e){} renderWatchedLight();}
```
- **`toggleCarer`/`consentYes` (`:896/:901`) become thin shims** that open the checklist modal and
  write per-cap grants — the old boolean is migrated, not deleted.
- **Consent modal (`#consent :296`)** re-templated by `renderConsentChecklist()` into 6 independently
  toggled rows (see/hear/remind/drive/record/health), each `role=switch`, plain-language line, default
  OFF, ≥44 px target.

**Watched-light** — new DOM appended inside `#topbar` (`:241`), `aria-live=assertive`:
```html
<div id=watch class=watchchip hidden role=status aria-live=assertive>
  <span id=watchTxt></span><button id=watchStop onclick="stopAllSharing()">Stop sharing</button></div>
```
`renderWatchedLight()` shows it whenever `anyLive()`; text composed from active caps + live
`peer_online` (the `hello`/`famOn` signal `:816/:822`): `🔴 Camera + Mic shared · Carer watching` /
`🕹 Carer controlling`. Cannot be hidden while any cap is live (the camera-on light).

**Gating matrix (exact code points):**
| Capability | Gate point | Edit |
|---|---|---|
| `see` | before `getMedia` `:797` is offered as video to peer | only `addTrack` video `:812` when `capActive('see')`; else send recvonly |
| `hear` | audio track in `addTrack` `:812` | same pattern for audio |
| `drive` | ctrl handler `:817` + DataChannel tap dispatch (§E) | wrap remote-driven UI actions in `if(capActive('drive'))` |
| `record` | guardian clip start | patient honours `ctrl{record:'start'}` only if `capActive('record')`, else replies `ctrl{record:'denied'}` |
| `remind` | local + server reminder firing | reminders only schedule/notify if `capActive('remind')` |
| `health` | `connectHealth`/threshold share | vitals shared to carer only if `capActive('health')` |

**Accessibility:**
- `prefers-reduced-motion` + `body.reduce` guard wrapping the 7 keyframes (`:58,:64,:89,:96,:112,:135,:158`):
  `@media (prefers-reduced-motion:reduce){…animation:none}` and an `ACCESS.reduce` body class for an
  explicit in-app toggle. `siren()`/SOS flashes remain (safety-critical) but respect reduce by using a
  steady high-contrast state instead of strobe.
- **Assistive-Access launcher** — `ACCESS.simple` toggles a new full-screen `#aaLauncher`: 2×N grid of
  giant labelled buttons (🗣 Talk to JARVIS · 📞 Call Family · 🆘 HELP · ⚙ Care), emoji+text, ≥88 px
  targets, no small chrome. Toggled from `applyAccess` `:876`; default off (no regression).
- WCAG 2.2 AA: enforce ≥24 px (use 44 px) on every new control, visible focus rings, `focus-not-obscured`,
  keyboard activation (`Enter`/`Space`) on all new `role=switch`/`role=button`, `aria-live` on watched-light,
  reminder acks, and alerts.

**Edge cases:** clock skew vs `expiresAt` (use server time from a poll response header as offset, fall
back to local); consent revoked mid-call (immediately disable tracks + close where required, fire audit);
audit POST offline (queued in `jv_consent_audit`, retried on next online poll); migration idempotent.

**Lifeline:** all additive; if `CONSENT` fails to parse, `loadConsent()` returns a default + the old
`CARER` getter keeps the walkie-talkie alive.

---

### Pillar C — Reliable reminders (build 2nd)

**PWA + SW:** patient registers `navigator.serviceWorker.register('/care_sw.js',{scope:'/'})` inside the
existing `enableNotifs` gesture (`:986`) — gesture-gated, so no surprise prompts. `<link rel=manifest
href="/care_manifest.webmanifest">` added to `<head>`. iOS: detect non-standalone Safari → show "Add to
Home Screen to get reminders while asleep" hint (honest about the platform limit).

**Subscribe:** after SW ready + permission granted →
`reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlB64(vapidPublic from /vapidkey)})`
→ `POST /push/subscribe {room:ROOM, role:'patient', sub}`. Store cached in `jv_push_sub` for UI state.

**Data flow (medication, the critical path):**
```
patient addReminder → save local + POST /reminders{op:add} → care_store.add_reminder
  ↓ (page may now sleep)
_care_scheduler (20s) → care_store.due_reminders(now) → record_fire → care_push.send(subs)
  ↓ Web Push wakes SW even when page asleep
care_sw.js 'push' → showNotification("💊 Take blue tablet",{actions:[Confirm,Snooze 10m],tag:'rem-<id>'})
  ↓ patient taps
'notificationclick' → POST /reminders{op:ack, action:'taken'|'snooze'} → care_store.record_ack
  ↓ if no ack within 15 min
_care_scheduler → care_signal.post(ctrl{missedDose}) → guardian banner "💊 Mum hasn't confirmed her 2pm tablet"
```
**Adherence:** `care_store.adherence(room,rid)` → `{scheduled,taken,pct}`, shown to both (REAL from
`reminder_event`).

**Carer-set reminders:** guardian add-reminder form (new `.row` after `:78`) → `POST /reminders{op:add,
role:'carer'}` → `care_signal.bridge` notifies patient via poll; patient renders it (consent `remind`
required — if absent, guardian sees "waiting for mum to allow reminders").

**Double-fire guard:** `record_fire` is idempotent per `(reminder_id, due-day-slot)`; the in-page
`setInterval(checkReminders,20000)` (`:976`) is **kept only as a fallback** — at boot, if
`pushManager.getSubscription()` resolves non-null, the in-page checker switches to UI-refresh-only (no
notification) so push is the single notifier; if push is unavailable it remains the full notifier.
SW `tag:'rem-<id>'` dedups any visual overlap.

**ICS/Calendar:** type `appointment` reminders export `.ics`; if Google OAuth connected (Pillar D) optional
read-only Calendar sync surfaces appts.

**Edge cases:** permission denied → fallback path, honest "reminders only while app open" note; iOS not
installed → same; VAPID/pywebpush missing on server (`/vapidkey`→`{publicKey:null}`) → client skips
subscribe, fallback checker stays; subscription expired (410 from push service) → `care_store` prunes that
endpoint on send failure; timezone — store `time` as wall-clock "HH:MM" in the patient's locale, scheduler
compares against patient-supplied tz offset sent at subscribe.

**Lifeline:** the existing 20 s checker is never removed; push is strictly an upgrade. Scheduler thread is
isolated (§3.2).

---

### Pillar E — Remote co-control Layer 1 (build 3rd; the headline ask)

**DataChannel bring-up:**
- Guardian (offerer) in `newPeer` `:161`: `dc = pc.createDataChannel('care',{ordered:true})` before
  `makeOffer`. Patient: `pc.ondatachannel = e => bindCareChannel(e.channel)`.
- Protocol (JSON per message): `{t:'cursor',x,y}` (normalized 0..1), `{t:'tap',id}`, `{t:'scroll',dy}`,
  `{t:'release'}`, `{t:'reminder',…}` (carer-set, also mirrors POST /reminders).

**Patient side:**
```js
function bindCareChannel(ch){ch.onmessage=ev=>{let m; try{m=JSON.parse(ev.data)}catch(e){return;}
  if(!capActive('drive')) return;                      // hard gate
  if(m.t==='cursor') moveCarerCursor(m.x,m.y);
  else if(m.t==='tap') dispatchCarerTap(m.id);
  else if(m.t==='release') hideCarerCursor();};}
const TAP_ALLOW={care:openCare, help:doHelp, talk:startTalk, family:dialFamily, c0:()=>dial(0), c1:()=>dial(1)};
function dispatchCarerTap(id){const fn=TAP_ALLOW[id]; if(fn){auditEvent('drive','tap',id); fn();}}  // allowlist only
```
- `#carerCursor` overlay (absolute, pointer-events:none, a glowing "hand"), shown only while `drive` live.
- **"Take back control"** button in the watched-light → `revokeCap('drive')` + `ch.close()`.

**Guardian side:** pointer capture over `#stage`/`#remote` (reuse zoom `initZoom :137`) emits throttled
(`≤20/s`) `{t:'cursor'}`; clicks on a mirrored control map → `{t:'tap',id}`. A "tap-here" annotation tool
(Layer 2) places a pulsing ring shown over mum's view for guidance where injection is impossible.

**Edge cases:** DataChannel fails to open (symmetric NAT, no TURN) → fall back to low-freq taps over the
poll `ctrl` channel, cursor disabled, honest "live control unavailable, using guided mode"; `drive`
revoked mid-session → channel ignored instantly (gate is per-message); allowlist prevents arbitrary
element activation (no `eval`, no generic selector); rapid taps debounced.

**Layer 3 (native Android AccessibilityService + MediaProjection over the same channel; iOS share-only)
documented as the companion-app roadmap — not in the web build.**

**Lifeline:** media `pc` unaffected if the channel is absent (today's calls keep working); all driving is
gate-checked and allowlisted.

---

### Pillar A — Video resilience (build 4th)

1. **Codec ladder** — extend `preferCodec` **both sides** (`guardian :113`, `patient :799`) to reorder
   the *full* capability list to `h265→av1→vp9→h264→vp8` **without dropping RTX/RED/FEC** (current
   guardian filters them — keep them so retransmission works). Pure reorder; safe.
2. **SVC** — patient video sender: after negotiation, `sender.setParameters({encodings:[{scalabilityMode:'L1T3'}]})`
   when av1/vp9 selected (graceful frame-rate degrade vs freeze). *Simulcast* (`sendEncodings` low/med/high)
   needs the patient to use `addTransceiver` instead of post-answer `addTrack` `:812` — flagged as a
   **follow-up restructure**, not in the first cut (avoids destabilising the working answer path).
3. **HMAC TURN** — replace `ICE :92` openrelay with `GET /turncreds` (both pages fetch before `newPeer`).
   `care_turn.creds(room)`: `username=f"{int(time)+86400}:{room}"`, `credential=base64(HMAC_SHA1(TURN_SECRET,
   username))`. No `TURN_SECRET`/coturn ⇒ returns STUN-only + openrelay-as-last-resort, surfaced honestly
   in the HUD as `relay: public-demo`.
4. **Stats HUD** — guardian `#stats` toggle, `pc.getStats()` @1 s → inbound-rtp video (res/fps/codec
   `mimeType`/bitrate kbps/packetsLost/jitter) + candidate-pair (RTT, `relayType` direct/TURN). Drives
   adaptive UI; throttled.
5. **Clip capture** — guardian `MediaRecorder(#remote.srcObject)` 15 s ring → local `.webm`. **Consent
   `record`-gated** end-to-end (guardian sends `ctrl{record:'start'}`; patient allows only if
   `capActive('record')` and shows "a clip is being saved").
6. **Enhance (Maxine)** — `POST /enhance{on}` → `care_relay`: probe vast box; if reachable, route the one
   stream through VSR (SFU relay) and return upscaled track; else `{available:false}` → button shows
   "Enhance unavailable". Interim honest fallback: client canvas sharpen labelled **"local sharpen"**.
7. **Zoom unchanged** (`:124–152`) — still drives real PTZ via `ctrl{zoom}`→`applyConstraints` `:818`;
   add 1:1/fit/fill `object-fit` control.

**Edge cases:** non-H265 peer auto-falls to next codec (no black screen); TURN creds expiry (24 h) —
re-fetch on `iceconnectionstate==='failed'` and renegotiate; getStats shape differs across browsers —
defensive key access; MediaRecorder unsupported → hide clip button (no fake).

**Lifeline:** codec reorder + TURN fetch are drop-in; if `/turncreds` fails the page keeps STUN+openrelay
(today's behaviour). Enhance/clip are opt-in.

---

### Pillar D — Health multi-source + thresholds (build 5th)

- **Source picker** — `#healthSource` in the Care health block (`:366`): `google` (Google Health API —
  Fitbit successor, Fit dies late-2026), `healthconnect` (Android on-device → honest "open in the Android
  app"), `healthkit` (web can't read → "connect via Shortcut" → posts to `/healthpush`), `fhir`
  (SMART-on-FHIR OAuth, clinical). Generalise `connectHealth` `:1018` into a per-source dispatcher; each
  shows REAL values or "not connected".
- **More vitals** — `renderHealth :1003`/`#healthVals :369` show heart-rate, resting-HR, steps, SpO₂,
  sleep, BP where exposed; missing = "—", each with timestamp + source badge. Never invent.
- **Thresholds → alerts** — `jv_health_thresholds` (trusted-supporter set); breach (restingHR hi/lo,
  SpO₂<92, no steps by 11:00) or missed-dose → `care_store.add_alert` + `care_signal.post(ctrl{healthAlert})`
  → guardian banner (+ optional siren) + gentle patient nudge. **Consent `health`-gated**, GDPR
  special-category (explicit, revocable, audited).
- **OAuth** — keep GSI `:1074` + Apple `:1088` for identity; add health scopes to the Google token where
  possible; tokens client-side only (`jv_health_*`), honest disconnect `:1021`.

**Edge cases:** OAuth implicit-flow token expiry → silent re-auth or honest "reconnect"; HealthKit Shortcut
posts stale data → show `ts`/age, alert only on fresh; threshold flapping → debounce + per-alert cooldown;
`/healthpush` spoofing → `CLIMATE_BRIDGE_KEY` + room match.

**Lifeline:** today's single Google heart-rate path is preserved as `source==='google'`; everything else is
additive and honest when absent.

---

## 5. Cross-cutting: end-to-end data-flow summary

```
PATIENT (jarvis_voice.html)        SIGNALLING (care_signal + care_store)        CARER (guardian.html)
  consent grant ───────────────► POST /consentlog → audit (hash-chain) ◄─────── GET /consentlog (compliance view)
  getUserMedia (see/hear gated) ─ /rtc offer/answer/ice ─────────────────────── newPeer + DataChannel('care')
  watched-light (live caps)        peer_online (poll)                            stats HUD (getStats)
  ondatachannel ◄──────────────── DataChannel: cursor/tap (drive gated) ◄─────── pointer over #stage
  reminders (remind gated) ──────► POST /reminders → care_store → scheduler ────► missedDose banner
       ▲ Web Push (asleep)         _care_scheduler (20s) → care_push                add-reminder form
  health (health gated) ─────────► /healthpush + thresholds → alert ────────────► health banner + siren
```

---

## 6. Build order (dependency DAG) + per-step gate

| # | Step | Depends on | Ships independently? | Acceptance gate | Rollback |
|---|---|---|---|---|---|
| 1 | **Consent model + watched-light + a11y/reduced-motion + Assistive launcher** (Pillar B) | — | ✅ | per-cap grant/revoke/expiry works; watched-light live; old `CARER` migrated; reduced-motion honored; no regression | revert HTML; `jv_carer` still read |
| 2 | **care_store.py + /consentlog (+GET) + audit** | 1 | ✅ | audit hash-chains, persists across dashboard restart; store-down degrades to localStorage | drop new routes; store optional |
| 3 | **PWA/SW + /vapidkey + /push/subscribe + /reminders + scheduler + ack/snooze + missed-dose** (Pillar C) | 1,2 | ✅ | push fires on a backgrounded PWA; ack/snooze; missed-dose escalates; adherence REAL; **20 s fallback intact** | unregister SW; fallback checker resumes |
| 4 | **DataChannel + carer cursor + tap-dispatch** (Pillar E L1) | 1 | ✅ | drive-consented cursor+taps drive mum's UI; take-back works; allowlist enforced | channel absent ⇒ calls unaffected |
| 5 | **Codec ladder + SVC + /turncreds + stats HUD + clip** (Pillar A) | 1 (record gate) | ✅ | H265 negotiated w/ AV1/VP9-SVC fallback; HMAC TURN or honest demo; HUD REAL; clip record-gated | keep STUN+openrelay; hide clip |
| 6 | **care_relay Maxine enhance** (Pillar A) | 5 | ✅ | real upscale when box up, "unavailable" when down | local-sharpen interim |
| 7 | **Multi-source health + thresholds + /healthpush + alerts** (Pillar D) | 1,2 | ✅ | ≥2 sources selectable; REAL or "not connected"; threshold→carer alert; consent-gated | keep google heart-rate path |
| 8 | **Room-secret pairing + E2EE + Foundry carer console polish + full WCAG/Assistive pass** | all | ✅ | console = live tile+vitals+adherence+consent+audit+alerts; AA pass | additive |

Each step is committed on a branch, smoke-tested against the live `:8095`, and is independently
revertible. **Step 1 is the only hard prerequisite for the others.**

---

## 7. Test / verification matrix (Stage-9 checks against §10 of the spec)

| Check | How |
|---|---|
| Lifeline intact | `pm2 status` shows the 3 services online after each step; `curl 127.0.0.1:8095/healthreport` 200; `/talk` & `/guardian` render |
| No JS error | open `/talk` + `/guardian`, console clean through a full call + every new control |
| Import-time safe | temporarily hide `pywebpush` → `python -c "import server.dashboard"` still imports; `/talk` still serves |
| Consent granular/revocable/audited | toggle each cap; confirm track on/off, watched-light, `/consentlog` hash-chain persists across `pm2 restart jarvis-dashboard` |
| Reminders survive sleep | install PWA, background it, scheduler push arrives; ack/snooze; force a miss → guardian banner; adherence math |
| Video | force non-H265 peer → falls to next codec; `/turncreds` with/without `TURN_SECRET`; HUD numbers match `chrome://webrtc-internals` |
| Co-control | grant `drive`, move cursor/tap from guardian, mum's UI reacts; revoke → instantly dead; allowlist rejects unknown id |
| Health | connect google + one more; missing metric shows "—"; threshold breach → alert; revoke `health` stops sharing |
| Honesty | every down source/relay/enhance says so; no fabricated number anywhere |
| Persistence | `care.db` survives restart; missing dep degrades, never 500s |

---

## 8. Lifeline-safety proof (why none of this breaks the disabled user's link)

1. **Additive-only HTML:** existing functions are wrapped/extended, never rewritten. `CARER` survives as a
   derived getter; the 20 s reminder checker is never deleted; zoom/PTZ/SOS/dead-man's-switch/contacts/
   OAuth paths are untouched.
2. **No existing route edited:** all server changes are new `elif` branches + one new helper (`_send_h`) +
   one new daemon thread. The `/rtc`, `/rtc/poll`, page routes, and token block are byte-for-byte unchanged.
3. **Import-time invulnerable:** new services imported under one top-level try/except; `pywebpush`/`py_vapid`/
   Maxine lazy + guarded. A missing dep ⇒ `care_push.available()==False` / route returns honest error ⇒ page
   degrades to localStorage + in-page checker. Dashboard always imports and boots.
4. **Thread isolation:** `_care_scheduler` is `daemon=True`, whole-loop try/except, 20 s sleep — it cannot
   wedge or crash the server; worst case it idles.
5. **Store optional:** `care_store.init()` failure (locked/corrupt/readonly disk) disables persistence only;
   realtime relay (in-memory `care_signal`) and the walkie-talkie keep working.
6. **Realtime relay stays token-free + in-memory** (like today) for SDP/ICE; only durable side-effects touch
   SQLite, and those are best-effort.
7. **Every feature is independently revertible** (§6) — a regression in any pillar rolls back without
   touching the others or the lifeline.

---

## 9. Open decisions (sensible defaults chosen — no blockers)
- **VAPID keys:** generate once at boot into `server/data/.vapid` (0600) if `cryptography` present; else
  push disabled honestly. *Default: auto-generate, guarded.*
- **TURN:** assume coturn with `use-auth-secret` + `TURN_SECRET` env on the box; absent ⇒ honest demo
  relay. *Default: STUN-only honest fallback ships now, coturn is ops follow-up.*
- **DB write model:** open-per-call + module write-lock (matches `_count`), WAL. *Default chosen.*
- **SW scope:** root via dedicated route + `Service-Worker-Allowed:/`. *Default chosen.*
- **Enhance:** opt-in, GPU-gated, never auto-on (cost + honesty). *Default chosen.*

---

**Stage 3 status:** engineering plan complete and keyed to verified current anchors. No live code touched
(plan-only stage) ⇒ pm2 lifeline + every existing feature untouched. Hand-off to Stage 4 build is the §6
DAG starting at Step 1 (consent foundation).
