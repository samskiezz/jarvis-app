# STAGE 3 — ACCESSIBILITY CORE · Concrete engineering plan (build-ready)

> **What this stage is.** Stage 1 = research + chosen architecture. Stage 2 = first-draft "what/where".
> **Stage 3 (this doc) = the implementation contract**: every file, every function signature, the exact
> insertion anchors (re-verified against the live, dirty working tree this stage), the data-flow / mirror
> protocol with reconcile algorithm, the edge-case + failure matrix, the WCAG mapping, and a touchpoint-level
> proof that the pm2 lifeline is never on a hot path. An engineer (or a later build stage) can execute this
> without re-deriving anything.
>
> **It also corrects five concrete defects in the Stage-2 draft** that would have caused a JS error or a
> broken sync on first run (see §2). Those corrections are the headline engineering value of this stage.
>
> HEAD `c36e85df`; the 3 HTML files + `dashboard.py` are dirty. **Symbols are the contract, not the digits** —
> re-grep before editing. Anchors below were re-`grep`'d this stage and are current as of writing.

---

## 1. Re-verified anchor table (live tree, this stage)

### 1.1 `server/jarvis_voice.html`  (head ends `:234`, libs `:385`, main script opens `:612`)
| Symbol | Line | Note |
|---|---|---|
| `body.hc{…}` / `body.bigtext{…}` CSS | `:225–228` / `:230–233` | existing visual modes — engine **extends**, never replaces |
| `const CT="__CTOKEN__"` | `:618` | patient page **has** the control token → may POST `/a11y` |
| `function cap(t)` → sets `#caption` | `:630` | JARVIS-speech caption sink (existing) |
| `function jarvis(t,then)` (Promise; `/tts`→`speechSynthesis`) | `:645` | TTS path to wrap with caption + queue |
| `async function talk(text)` | `:690` | free-text → LLM (`/chat`) |
| `function toggleMic()` | `:702` | mic on/off |
| `function startListening()` (`SR`, `en-GB`, continuous) | `:707` | already no-ops if no `SpeechRecognition` |
| `function handle(t)` voice router | `:718` | **a11y intents insert here, line 1 of body** |
| `function needHelp()` emergency | `:762` | TTS-queue **pre-empt** priority owner |
| `getUserMedia(...)` / `new RTCPeerConnection` | `:797` / `:806` | camera path reused by gaze; remote track for video captions |
| IIFE state block opens | `:858` | the a11y settings live inside this IIFE |
| `window.ACCESS=load('jv_access',{bigtext,hc,voicecmd})` | `:862` | **migrate → `A11Y.state`; keep `jv_access` in sync** |
| `window.openCare` (panel open) | `:872` | extend into the Accessibility hub (M8) |
| `function applyAccess()` | `:876` | **rewire to delegate to `A11Y.apply()`** |
| `window.setAccess=function(k,v)` | `:883` | keep; route through `A11Y.set()` |
| ARIA `#status`/`#caption`/`#srlog` | `:248`/`:249`/`:293` | reuse `#caption` as one caption sink |

### 1.2 `server/jarvis_live.html`  (head ends `:256`, libs `:362`, main script opens `:387`)
| Symbol | Line | Note |
|---|---|---|
| `const $=id=>…, CT="__CTOKEN__"` | `:388` | patient page **has** the token |
| `function unlockAudio()` | `:406` | audio-unlock gesture (TTS needs it) |
| `window.jarvisSpeak=function(t)` | `:411` | **caption sink wires here** |
| `function bubble(who,txt)` | `:477` | chat transcript |
| `async function askJarvis()` text router | `:487` | **a11y intents insert at line 1 of body** |
| `#say` input | `:312` | predictive-text + on-screen-kbd target |

### 1.3 `server/guardian.html`  (head ends `:51`, script opens `:88`) — **carer device; NO token, NO `CT`**
| Symbol | Line | Note |
|---|---|---|
| `<video id=remote>` / `<video id=self>` | `:57` / `:62` | remote track → on-device ASR captions |
| `#say` input + `function sayIt()` | `:76` / `:157` | predictive-text target |
| `function pickVoice()` / `function jarvis(t)` (`speechSynthesis` only — **no `/tts`**) | `:99` / `:100` | caption sink; note: no server TTS here |
| `pc=new RTCPeerConnection` / `pc.ontrack` | `:162` / `:164` | attach ASR to `e.streams[0]` |
| `function ctl(what)` / `function talk(on)` | `:153` / `:160` | room-based signalling (`sig('ctrl',…)`) |
| **No captions, no a11y toggles today** | — | the page-5 gap; engine runs **local-only** here (see §2.3) |

### 1.4 `server/dashboard.py`
| Symbol | Line | Note |
|---|---|---|
| `ROOT` / `GLB_DIR` | `:33` / `:41` | `ROOT/server/` is where new assets live |
| `CONTROL_TOKEN` / `CLIMATE_BRIDGE_KEY` | `:63` / `:67` | token gate for POST |
| `_climate_handle(qtext,address)->dict|None` | `:1272–1320` | **shape to copy for `_a11y_handle`** |
| `_agent_tools()` (`_A.tools.all()`+`status`) | `:1605` | a11y tools appear here automatically |
| `_agent_run(cmd)` → `_A.CORE.execute(cmd, auto_only=True)` | `:1615` | agent dispatch (auto-only) |
| `self._send(body,ctype)` | `:1722` | the one response helper |
| `self._tmpl(name)` (injects `__CTOKEN__` only) | `:1730` | **does NOT serve .js/.css** ← see §2.1 |
| `do_GET` opens | `:1738` | `/agent/tools` `:1808`, `/file` `:1814`, `/asset/` `:1851`, `/media/` `:1871`, `/climate/state` `:1901`, `/vitals` `:1906` |
| `/talk`,`/companion`→voice / `/guardian`→guardian / catch-all→live | `:1840` / `:1844` / `:1925–1932` | page serving |
| `do_POST` opens; `/rtc` token-free `:1940`; **`/chat` token-free** `:1985` (climate-first `:1998`) | `:1934` | `_a11y_handle` inserts at `:1998` |
| token guard (everything after is token-gated) | `:2025` | `/a11y` POST sits **above** this if it must be token-free, or uses this guard |
| `/climate/cmd` token-gated pattern | `:1964–1968` | POST-gating reference |

### 1.5 `server/agent/` (registry / catalog / permission)
| Symbol | Line | Note |
|---|---|---|
| `Tool` dataclass (`id,name,input_schema,risk,timeout,handler,tags`) | `tools.py:74` | |
| `register(tool)` / `call(id,args,ctx)` / `_coerce_to_schema` | `tools.py:102/180/148` | |
| `tools.all()` (palette for `_agent_tools`) | `tools.py` | a11y tools surface in `GET /agent/tools` |
| handler shape `_h_x(args,ctx)->dict` w/ `ctx.progress(pct,msg)` + `summary` | `catalog.py:158` (`_h_server_cpu_inspect`) | **copy this shape** |
| `_h_file_write` (plain open/write — **not atomic**) | `catalog.py:623` | a11y mirror must be **atomic** (see §2.4) |
| `register_catalog()` body | `catalog.py:720` | add 6 `register(Tool(...))` here |
| ids return list + `CATALOG_IDS=register_catalog()` | `catalog.py:855–865` | **append the 6 new ids** |
| `safe_read→auto`; `safe_write→auto` (no path, or path in repo) | `permission.py:173/181` | a11y tools carry **no path arg → auto-run** ✓ |

---

## 2. Stage-3 corrections to the Stage-2 draft (defects found by verification)

These are real, would-break-on-first-run issues the draft hand-waved. Each has a locked resolution.

### 2.1 ❗ There is **no static-asset route** — `<script src="/a11y.js">` would serve HTML
`_tmpl()` (`:1730`) only string-replaces `__CTOKEN__` in HTML templates. `do_GET` serves binaries only from
`/asset/` (→`jarvis_assets/`) and `/media/` (→`server/data/media/`). A request for `/a11y.js` falls through
to the **catch-all `else` at `:1925`** and is answered with `jarvis_live.html` under `text/html` → the browser
fails to parse it as a script → **JS error / engine never loads** → violates "never a JS error."
**Resolution (locked):** add ONE additive `do_GET` branch serving a small **allowlist** of a11y assets from
`server/` under the **`/a11y/` prefix** (distinct from the bare-`/a11y` mirror route). Correct MIME + 1-day
cache. See §5.1 for the exact branch. Each page loads `<link href="/a11y/a11y.css">` + `<script defer
src="/a11y/a11y.js">`. **External file (not inlined):** one cacheable source of truth, no 3× page bloat.

### 2.2 ❗ Route collision: `startswith("/a11y")` swallows `/a11y/a11y.js`
The mirror is `GET/POST /a11y`; the assets are `/a11y/*`. A naive `self.path.startswith("/a11y")` matches both.
**Resolution (locked):** match **assets first** with `self.path.startswith("/a11y/")`, then match the mirror
with an **exact** test on the path sans query: `self.path.split("?",1)[0] == "/a11y"`. Documented in §5.1/§5.2.

### 2.3 ❗ `guardian.html` has **no control token** — it cannot POST the patient's mirror
guardian is the **carer's** device (`/guardian`, room-based `sig()`), with no `CT`/`__CTOKEN__`. Writing the
patient's `a11y_state.json` from it is both impossible (no token) and **wrong** (different person, privacy).
**Resolution (locked):** guardian runs the engine **local-only** — its own `localStorage` namespace
(`jv_a11y_guardian`), **no mirror GET/POST**. The patient's two surfaces (voice + live) own the mirror. The
caption bar + visual modes + predictive text still work on guardian; only cross-surface *sync* is excluded.
This is documented as a first-class engine mode `A11Y.init({mirror:false, ns:'jv_a11y_guardian'})`.

### 2.4 ❗ Mirror write must be **atomic + locked** (the draft cited the non-atomic `_h_file_write`)
Writers: `POST /a11y` (voice/live), `_a11y_handle` (`/chat`), and 6 agent tools — plus a 3–5 s poller reads it.
A plain `open(...,'w')` (as in `_h_file_write:623`) can expose a half-written file to a concurrent reader.
**Resolution (locked):** one module-level helper `_a11y_write(patch, source)` using a `threading.Lock` +
**temp-file + `os.replace`** atomic swap (the `os.replace` is atomic on POSIX). Single writer function; every
server-side mutator calls it. See §5.3.

### 2.5 ❗ Router edits must be **try/wrapped** so an engine fault never breaks `handle`/`askJarvis`
If `a11y.js` throws during `A11Y.intent`, an unguarded call would break the voice/text router → the patient
loses **all** commands, not just a11y. **Resolution (locked):** every router integration is exactly:
```js
try{ if(window.A11Y){ const r=A11Y.intent(t,'voice'); if(r&&r.handled) return; } }catch(_){}
```
so a missing/broken engine is invisible and the page keeps its existing behaviour. Mandatory on all surfaces.

> Also tightened: the `_a11y_handle` regexes must be **anchored to a11y vocabulary** so they never steal a
> climate ("warmer") or build ("make me a…") phrase; precedence + a regex-collision test list in §5.4/§8.

---

## 3. File-by-file engineering spec

### 3.1 NEW `server/a11y.css`  (~600 lines) — the visual + overlay contract
Pure CSS custom-props + `body.*` mode classes. Pages opt in by `<link>`; the engine toggles classes/props.

```css
:root{ --a11y-scale:1; --a11y-target:64px; --a11y-dwell-ms:900ms;
       --a11y-cap-fs:22px; --a11y-z:2147483000; }           /* overlays sit above the RTX canvas */

/* p4 visual */
body.hc{ /* extend the voice-page rule to ALL pages (same selectors so existing rules survive) */ }
@media (prefers-contrast:more){ body.a11y-contrast-auto{ /* mirror body.hc */ } }
@media (forced-colors:active){ body.a11y-contrast-auto{ /* respect system colours */ } }
body.a11y-scale{ font-size:calc(100% * var(--a11y-scale)); }   /* 1.0–2.2; replaces 1-step bigtext */
@media (prefers-reduced-motion:reduce){ body{ /* auto reduce-motion */ } }
body.reduce-motion *{ animation:none!important; transition:none!important; scroll-behavior:auto!important; }

/* p3 targets */
body.xl-targets a,body.xl-targets button,body.xl-targets [role=button],
body.xl-targets input,body.xl-targets .card,body.xl-targets .eb{
  min-width:var(--a11y-target); min-height:var(--a11y-target); }

/* p6 calm — density-down, palette soften, motion off, one-thing-at-a-time reveal */
body.calm{ /* larger spacing, muted palette, hide non-emergency urgency; .a11y-emergency stays vivid */ }

/* overlays — ALL children of the single #a11y-layer; transform-only; GPU-cheap; off under reduce-motion/calm */
#a11y-layer{ position:fixed; inset:0; z-index:var(--a11y-z); pointer-events:none; }
#a11y-captions{ /* bottom, large, HC, aria-live=polite; pointer-events:auto on its controls */ }
.a11y-scan-hl{ outline:4px solid #73f4ff; } #a11y-dwell-ring{ /* radial countdown */ }
#a11y-gaze-cursor{} #a11y-kbd{} .a11y-numbadge{}
body.reduce-motion #a11y-dwell-ring,body.calm #a11y-dwell-ring{ animation:none!important; }
```
**Rule:** every overlay is a child of `#a11y-layer` (one compositing layer), `pointer-events:none` except where
interactive, `transform`-only animation, fully suppressed under `reduce-motion`/`calm` so it never repaints the
Three.js scene.

### 3.2 NEW `server/a11y.js`  (~1600 lines) — `window.A11Y`. Module layout + every public signature
Pure vanilla, no build step, `defer`. **Every public method is total** (try/catch → result object, never throws).

```
A11Y = (function(){
  const NS_DEFAULT='jv_a11y';
  let state, caps, opts={mirror:true, ns:NS_DEFAULT};

  /* ── lifecycle / state ───────────────────────────── */
  function init(o){}            // merge opts; detectCaps(); loadState()+migrate(); buildLayer(); apply();
                                //   bindInputs(); attachPredict(all inputs); if(opts.mirror) startMirror();
  function detectCaps(){}       // -> {speech,webgpu,mediapipe,camera,tts,mirror} (all feature-detected)
  function loadState(){}        // localStorage[ns] ∪ migrate(jv_access) ∪ per-user defaults
  function migrate(){}          // {bigtext,hc,voicecmd} -> {scale:bigtext?140:100, hc, voiceCmd}
  function set(key,val,source){}// mutate → persist(ns) → bridgeLegacy() → if(mirror)postMirror() → apply()
  function get(key){}
  function apply(){}            // idempotent: toggle body.* classes + set --a11y-* props from state
  function reset(){}            // per-user defaults
  function status(){}           // -> {state, capabilities}
  function unavailable(pillar,reason){}  // speak + toast honest "not available on this device"

  /* ── the ONE dispatch the 4 entry points call ─────── */
  function intent(text,source){}   // match §7.1 grammar → engine call → {handled,reply,spoke}|{handled:false}

  /* ── p1 voice targeting ───────────────────────────── */
  const CommandRegistry={ scan(){}, byNumber(n){}, byName(phrase){} };  // every actionable control declared
  function showCommands(){} function showLabels(on){} function activateByNumber(n){} function resolveByName(p){}

  /* ── p2 read-aloud (TTS queue) ─────────────────────── */
  const TTS={ speak(text,{priority,interrupt}){}, stop(){}, _drain(){} };   // wraps page jarvis()/jarvisSpeak()
  function readScreen(region){}     // DOM linearizer → queue + moving reading-cursor
  function readTasks(){} function readCaptions(){} function readFeed(){} function readNotifications(){}

  /* ── p3 selection / switch / dwell / targets ──────── */
  const SelectionCore={ activate(el){} };   // the ONE primitive voice/scan/dwell/gaze resolve into
  const scan={ start(){}, stop(){}, _step(){} };     const dwell={ enable(){}, disable(){} };
  const targets={ refresh(){} };

  /* ── p5 captions ──────────────────────────────────── */
  function caption(text,who){}      const captions={ attachVideo(stream){}, on(){}, off(){} };

  /* ── p6 calm ──────────────────────────────────────── */
  const calm={ enter(){}, exit(){} };

  /* ── p7 gaze ──────────────────────────────────────── */
  const gaze={ enable(){}, disable(){}, calibrate(){}, _onLandmarks(){} };  // MediaPipe → WebGazer fallback

  /* ── p8 predictive typing ─────────────────────────── */
  const predict={ attach(inputEl){}, _suggest(prefix){} };   const kbd={ show(){}, hide(){} };

  /* ── mirror sync ──────────────────────────────────── */
  function startMirror(){}    // poll GET /a11y on a 4s timer; reconcile()
  function postMirror(patch){}// POST /a11y?token=CT  (voice/live only; guardian opts.mirror=false)
  function reconcile(remote){}// if remote._ts>local._ts and field≠activeDrag → apply remote; exec _cmd once

  return { init,set,get,apply,reset,status,unavailable,intent, showCommands,showLabels,activateByNumber,
           resolveByName, speak:(t,o)=>TTS.speak(t,o||{}),stopSpeaking:TTS.stop, readScreen,readTasks,
           readCaptions,readFeed,readNotifications, SelectionCore,scan,dwell,targets, caption,captions,
           calm,gaze,predict,kbd, get state(){return state}, };
})();
document.addEventListener('DOMContentLoaded',()=>{ try{ A11Y.init(window.__A11Y_OPTS__||{}); }catch(_){} });
```
**Init order is load-safe:** `init()` only *binds* to page functions that may not exist yet via late lookups
(`window.jarvis`, `window.jarvisSpeak`, `window.handle`) — never captured at module top. `TTS.speak` resolves
the page's speaker at call-time: `voice` → `window.jarvis`; `live` → `window.jarvisSpeak`; `guardian` →
`window.jarvis`; if none, falls back to `speechSynthesis` directly, else `unavailable('read-aloud')`.

### 3.3 NEW `server/a11y_keyboard.json` — ACAT scanning-keyboard layout as data (not code)
```json
{ "version":1, "mode":"rowcol",
  "rows":[ ["a","b","c","d","e","f"], ["g","h","i","j","k","l"], ["m","n","o","p","q","r"],
           ["s","t","u","v","w","x"], ["y","z"," ","⌫","↵","?"] ],
  "predictRow":true }
```
Served at `/a11y/keyboard.json`; loaded lazily when `kbd.show()` is first called.

### 3.4 NEW `server/data/a11y_state.json` — the mirror (created on first POST; absent ⇒ engine runs local-only)
```json
{ "state": { /* the A11Y.state superset, §3.5 */ },
  "ts": 1733800000000,
  "source": "local|voice|chat|agent",
  "_cmd": { "action":"read_screen|speak|null", "text":"", "ts":0, "nonce":"" } }
```
`_cmd` is the **one-shot client-action channel** (§4.4): server-side tools that need the DOM/TTS write a
`{action,text,ts,nonce}`; the polling client executes **once per nonce** and never re-runs it on reconnect.

### 3.5 `A11Y.state` schema (superset of `{bigtext,hc,voicecmd}`; per-user defaults tuned ON)
```js
{ hc:false, contrastAuto:true, scale:100, reduceMotion:false,           // p4
  voiceCmd:false, showLabels:false,                                      // p1
  readAloud:true, rate:0.98, pitch:0.9,                                  // p2  (ON)
  scan:false, scanMode:'auto', scanMs:1200, switchKeys:['Space','Enter'],// p3
  dwell:false, dwellMs:900, xlTargets:true, targetPx:64,                 // p3  (xl ON)
  captions:true, captionVideo:true,                                      // p5  (ON)
  calm:false,                                                            // p6
  gaze:false, gazeEngine:'mediapipe', gazeSensitivity:1.0, gazeSwitch:'blink', // p7
  predict:true, kbd:false,                                               // p8  (predict ON)
  _ts:0, _source:'local' }
```
**Legacy bridge (`bridgeLegacy()`):** on every `set()`, mirror back to `localStorage['jv_access']` =
`{bigtext: scale>=140, hc, voicecmd: voiceCmd}` so the voice page's existing chips/`setAccess` never regress.

---

## 4. Data flow & the mirror protocol

### 4.1 The four entry points all converge on the same engine
```
 on-screen toggle ─┐
 JARVIS voice  ────┤            A11Y.intent(text,source)  ──or──  A11Y.set(key,val,source)
 text / chat   ────┤  ───────────────────────────────────────────────────────────────────►  A11Y.apply()
 agent tool     ───┘   (server writes a11y_state.json; client reconciles on next poll)        (DOM/CSS)
```
- **voice** (`handle:718`) and **text** (`askJarvis:487`) call `A11Y.intent(t, …)` *first* (defensive wrapper §2.5).
- **`/chat`** (`:1998`) calls `_a11y_handle` server-side → `_a11y_write` → returns spoken confirmation.
- **agent tool** handler → `_a11y_write` (state) or `_cmd` (client action).

### 4.2 Local toggle / voice / text write path (same surface)
`set(k,v,'local'|'voice'|'text')` → write `localStorage[ns]` → `bridgeLegacy()` → `apply()` (instant, optimistic)
→ if `opts.mirror`: `POST /a11y?token=CT {state:{k:v}, source}` (fire-and-forget; failure is logged once, UI
already applied). `_ts` is set **client-side** to `Date.now()` at write so reconcile can compare.

### 4.3 Cross-surface reconcile (poller, every 4 s)
```
remote = GET /a11y           // {state, ts, source, _cmd}
if !remote or remote.ts <= state._ts:  do nothing      // our own echo or stale → ignore
else:
   for k in remote.state:
       if k === activeDragField: continue               // don't yank a slider the user is dragging
       state[k] = remote.state[k]
   state._ts = remote.ts; persist(ns); apply()
execCmd(remote._cmd)                                     // §4.4
```
**Echo suppression:** the surface that POSTed set `state._ts` locally; the server stamps an equal-or-greater
`ts`; on the next GET, `remote.ts <= state._ts` (within clock tolerance) ⇒ no reapply. Only a *newer* write
from *another* surface (strictly greater `ts`) reconciles in. Server clock is the authority for `ts` it stamps;
client uses server `ts` after any successful POST round-trip to stay monotonic.

### 4.4 `_cmd` one-shot channel (server-driven client action — read-screen / speak)
The server can't touch the DOM/TTS, so `accessibility.read_screen` / `accessibility.read_aloud` write
`_cmd={action, text, ts, nonce}` via `_a11y_write`. Client `execCmd(cmd)`:
```
if !cmd or !cmd.nonce or cmd.nonce === _lastCmdNonce: return   // execute-once; survives reconnect
_lastCmdNonce = cmd.nonce
if cmd.action==='read_screen': A11Y.readScreen(cmd.region)
else if cmd.action==='speak':  A11Y.speak(cmd.text,{interrupt:true})
```
`nonce` = `f"{ts}-{secrets.token_hex(4)}"` server-side. `_lastCmdNonce` lives in client memory only → no
re-execution after a reload races (a stale `_cmd` older than page-load is ignored because its `ts` < load time).

---

## 5. `server/dashboard.py` edits (additive only; lifeline never on a hot path)

### 5.1 Static asset route — NEW `do_GET` branch (place high, right after `/metrics` or near `/asset/`)
```python
elif self.path.startswith("/a11y/"):
    # Accessibility Core static bundle (engine + css + keyboard layout + vendored models).
    # Allowlisted; served from server/. Distinct from the bare /a11y JSON mirror (checked separately).
    rel = self.path.split("/a11y/", 1)[1].split("?", 1)[0].lstrip("/")
    base = os.path.join(os.path.dirname(__file__))          # = ROOT/server
    allow = {"a11y.js", "a11y.css", "keyboard.json"}
    full = os.path.realpath(os.path.join(base, "a11y_assets", rel)) if rel.startswith("vendor/") \
           else os.path.realpath(os.path.join(base, {"keyboard.json": "a11y_keyboard.json"}.get(rel, rel)))
    ok = (rel in allow or rel.startswith("vendor/")) and full.startswith(os.path.realpath(base)) \
         and os.path.isfile(full)
    if ok:
        ct = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f: data = f.read()
        self.send_response(200); self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(data)
    else:
        self.send_response(404); self.end_headers()
```
> `a11y.js`/`a11y.css` live in `server/`; the keyboard maps `keyboard.json`→`a11y_keyboard.json`; vendored
> models live in `server/a11y_assets/vendor/…`. `..`/traversal blocked by the `realpath.startswith(base)` gate.

### 5.2 Mirror — NEW `GET /a11y` (read, token-free) + NEW `POST /a11y` (token-gated)
**GET** — add to `do_GET` **after** the `/a11y/` branch (exact-path test avoids the §2.2 collision):
```python
elif self.path.split("?", 1)[0] == "/a11y":
    self._send(json.dumps(_a11y_read()).encode(), "application/json")   # {state,ts,source,_cmd} or {state:{},ts:0}
```
**POST** — add to `do_POST` **above** the `:2025` token guard, gated with its own token check (pattern from
`/climate/cmd :1964`) so it's explicit and the rest of POST stays untouched:
```python
if self.path.split("?", 1)[0] == "/a11y":
    if q.get("token", [""])[0] != CONTROL_TOKEN:
        self._send(b'{"ok":false,"error":"unauthorized"}', "application/json"); return
    try:
        ln = int(self.headers.get("Content-Length", 0) or 0)
        body = json.loads(self.rfile.read(ln).decode() or "{}") if ln else {}
    except Exception:  # noqa: BLE001
        body = {}
    merged = _a11y_write(body.get("state") or {}, body.get("source") or "local")
    self._send(json.dumps({"ok": True, **merged}).encode(), "application/json"); return
```

### 5.3 Module helpers — NEW, near `_climate_handle` (`:1272`), no edits to existing fns
```python
import threading, tempfile
_A11Y_PATH = os.path.join(ROOT, "server", "data", "a11y_state.json")
_A11Y_LOCK = threading.Lock()

def _a11y_read() -> dict:
    try:
        with open(_A11Y_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {"state": {}, "ts": 0, "source": "local", "_cmd": None}

def _a11y_write(patch: dict, source: str = "local", cmd: dict | None = None) -> dict:
    """Merge a partial state (and/or a one-shot _cmd) into the mirror, atomically. Never raises."""
    with _A11Y_LOCK:
        cur = _a11y_read()
        st = dict(cur.get("state") or {}); st.update(patch or {})
        out = {"state": st, "ts": int(time.time() * 1000), "source": source,
               "_cmd": cmd if cmd is not None else cur.get("_cmd")}
        try:
            os.makedirs(os.path.dirname(_A11Y_PATH), exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(_A11Y_PATH), suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(out, f)
            os.replace(tmp, _A11Y_PATH)               # atomic swap (POSIX)
        except Exception:  # noqa: BLE001
            pass
        return out
```

### 5.4 `_a11y_handle` — NEW, copies `_climate_handle` shape; wired into `/chat` BEFORE climate
```python
def _a11y_handle(qtext: str, address: str = "ma'am") -> dict | None:
    """Accessibility chat intents → mutate mirror → spoken confirmation. None for non-a11y → falls through.
    Regexes are ANCHORED to a11y vocabulary so they never steal a climate/build phrase. Never raises."""
    import re
    l = (qtext or "").lower(); addr = "sir" if str(address).lower() in ("sir","male","man","m") else "love"
    def done(patch, say, **extra):
        _a11y_write(patch, "chat"); return {"a11y": True, "reply": say, "state": patch, **extra}
    if re.search(r"\b(captions?|subtitles?)\b.*\b(on|off)\b", l):
        on = "off" not in l; return done({"captions": on}, f"Captions {'on' if on else 'off'}, {addr}.")
    if re.search(r"\b(high|more)\s+contrast\b", l):        return done({"hc": True}, f"High contrast on, {addr}.")
    if re.search(r"\b(bigger|larger)\s+text\b", l):        return done({"scale": 140}, f"Larger text, {addr}.")
    if re.search(r"\bsmaller\s+text\b", l):                return done({"scale": 100}, f"Smaller text, {addr}.")
    if re.search(r"\b(reduce|less|stop)\s+motion\b", l):   return done({"reduceMotion": True}, f"Motion reduced, {addr}.")
    if re.search(r"\b(calm|simple|gentle)\s+mode\b", l):   return done({"calm": True}, f"Calm mode on, {addr}.")
    if re.search(r"\b(read (the )?(screen|page)|read (it|this)( to me| out)?|read everything)\b", l):
        _a11y_write({}, "chat", cmd={"action": "read_screen", "text": "", "ts": int(time.time()*1000),
                                     "nonce": f"{int(time.time()*1000)}-{secrets.token_hex(4)}"})
        return {"a11y": True, "reply": f"Reading the screen for you, {addr}."}
    return None
```
Wire-in at `:1998` — **immediately before** the existing `_climate_handle` call:
```python
try: _a = _a11y_handle(qtext, body.get("address", "ma'am"))
except Exception: _a = None
if _a is not None:
    self._send(json.dumps({"ok": True, **_a}).encode(), "application/json"); return
```
> Precedence rationale: a11y vocab ("captions", "contrast", "larger text", "read the screen") has **zero
> overlap** with climate ("warm/cool/temperature/zone") or the build trigger; the anchored regexes + the
> §8 collision test prove no phrase is stolen. `_a11y_handle` returns `None` for everything else.

### 5.5 The complete `dashboard.py` touch list (proof of additivity)
- **3 NEW `do_GET` branches** (`/a11y/` assets, `/a11y` mirror GET) + **1 NEW `do_POST` branch** (`/a11y` POST).
- **3 NEW module fns** (`_a11y_read`, `_a11y_write`, `_a11y_handle`) + 3 module constants.
- **1 four-line INSERT** in `/chat` (`:1998`) — *before* `_climate_handle`, never inside it.
- **Zero** edits to `_chat` body logic, `_vitals`, `_jarvis_chat`, `_climate_handle`, `_agent_run`,
  `task_daemon`, or any pm2-managed code path. (Lifeline proof, §10.)

---

## 6. The three HTML page edits (surgical)

### 6.1 All three pages — load the engine (in `<head>`, after the existing styles)
```html
<link rel="stylesheet" href="/a11y/a11y.css">
<script>window.__A11Y_OPTS__={ surface:'voice'|'live'|'guardian',
        mirror:true|false, ns:'jv_a11y'|'jv_a11y_guardian' };</script>
<script defer src="/a11y/a11y.js"></script>
```
- voice: `surface:'voice', mirror:true, ns:'jv_a11y'` · live: `surface:'live', mirror:true, ns:'jv_a11y'`
- **guardian: `surface:'guardian', mirror:false, ns:'jv_a11y_guardian'`** (§2.3).

### 6.2 `jarvis_voice.html`
1. **Voice router** — insert at `handle(t)` body line 1 (`:718`, before the emergency branch is fine since
   `intent` only matches a11y vocab; emergency stays first if you prefer — put the wrapper right **after** the
   emergency/`needHelp` line `:719` so a true emergency always wins):
   `try{ if(window.A11Y){const r=A11Y.intent(t,'voice'); if(r&&r.handled)return;} }catch(_){}`
2. **`applyAccess()` delegation** (`:876`) — keep the three chip toggles, append `try{window.A11Y&&A11Y.apply();}catch(_){}`
   and seed `A11Y.state` from `ACCESS` on first run (migration §3.5). `setAccess(k,v)` (`:883`) routes through
   `A11Y.set` for the three legacy keys (`bigtext→scale`, `hc→hc`, `voicecmd→voiceCmd`).
3. **Caption sink** — in `cap(t)` (`:630`) / `jarvis(t)` (`:645`) append `try{window.A11Y&&A11Y.caption(t,'jarvis');}catch(_){}`.
4. **Video captions** — after `pc.ontrack`/remote `<video>` is set (`:806`+) call `A11Y.captions.attachVideo(stream)` (gated on `captionVideo`+WebGPU).
5. **Predictive text** — `A11Y.predict.attach` auto-binds all `input[type=text]`/`textarea` in `init()`; no per-input edit needed.
6. **Accessibility hub** (M8) — extend `openCare` (`:872`) panel with the full toggle set bound to `A11Y.set`.

### 6.3 `jarvis_live.html`
1. **Text router** — insert at `askJarvis()` body line 1 (`:487`, after `const l=…`):
   `try{ if(window.A11Y){const r=A11Y.intent(t,'text'); if(r&&r.handled){$('say').value='';return;}} }catch(_){}`
2. **Caption sink** — in `jarvisSpeak` (`:411`) append `try{window.A11Y&&A11Y.caption(t,'jarvis');}catch(_){}`.
3. Same predictive-text auto-bind (`#say :312`) + same `<head>` loader.

### 6.4 `guardian.html`  (**the page-5 gap closes here**)
1. `<head>` loader with `mirror:false`.
2. **Caption sink** — in `jarvis(t)` (`:100`) append the `A11Y.caption(t,'jarvis')` call; the carer now SEES JARVIS speech.
3. **Remote-video captions** — in `pc.ontrack` (`:164`) after `r.srcObject=e.streams[0]` call
   `A11Y.captions.attachVideo(e.streams[0])` → on-device ASR captions the loved-one's speech for the carer.
4. **a11y toggles** — a small floating control opens the same `A11Y` panel (visual modes + captions + predict);
   no mirror, local-only.
5. Predictive text on `#say` (`:76`).

> Every HTML edit is an **append inside an existing function** or a **head `<link>/<script>`** — no existing
> line is rewritten, so a merge with a concurrent swarm edit is a clean additive hunk.

---

## 7. `server/agent/catalog.py` — the `accessibility.*` tool family

### 7.1 Six handlers (place near `_h_knowledge_stats`; copy the `_h_server_cpu_inspect` shape `:158`)
All call **`dashboard._a11y_write`** via a lazy import so there is one writer (no second JSON code path):
```python
def _a11y_state_write(patch, source="agent", cmd=None):
    from server import dashboard as D           # lazy → no import cycle at module load
    return D._a11y_write(patch, source, cmd)

def _h_a11y_status(args, ctx):
    from server import dashboard as D; ctx.progress(100, "read")
    cur = D._a11y_read(); st = cur.get("state") or {}
    return {"state": st, "summary": "a11y: " + ", ".join(f"{k}={st[k]}" for k in
            ("calm","hc","scale","captions","scan","dwell","gaze","predict") if k in st)}

_MODE_MAP = {"calm":"calm","hc":"hc","reduce_motion":"reduceMotion","captions":"captions",
             "caption_video":"captionVideo","scan":"scan","dwell":"dwell","gaze":"gaze",
             "predict":"predict","xl":"xlTargets","voice":"voiceCmd","read_aloud":"readAloud"}
def _h_a11y_set_mode(args, ctx):
    field = _MODE_MAP.get((args.get("mode") or "").lower()); on = bool(args.get("on", True))
    if not field: return {"ok": False, "summary": f"unknown mode {args.get('mode')!r}"}
    _a11y_state_write({field: on}); ctx.progress(100, "set")
    return {"ok": True, "mode": args.get("mode"), "on": on, "summary": f"{args.get('mode')} → {on}"}

def _h_a11y_text_scale(args, ctx):
    s = max(100, min(220, int(args.get("scale", 140)))); _a11y_state_write({"scale": s})
    return {"ok": True, "scale": s, "summary": f"text scale {s}%"}

def _h_a11y_read_screen(args, ctx):
    _a11y_state_write({}, cmd={"action": "read_screen", "text": "", "ts": int(time.time()*1000),
                               "nonce": f"{int(time.time()*1000)}-{os.urandom(4).hex()}"})
    return {"ok": True, "summary": "queued read-screen on the active surface"}

def _h_a11y_read_aloud(args, ctx):
    txt = (args.get("text") or "").strip()
    if not txt: return {"ok": False, "summary": "no text"}
    _a11y_state_write({}, cmd={"action": "speak", "text": txt[:600], "ts": int(time.time()*1000),
                               "nonce": f"{int(time.time()*1000)}-{os.urandom(4).hex()}"})
    return {"ok": True, "summary": f"spoke {len(txt)} chars on the active surface"}

def _h_a11y_captions(args, ctx):
    on = bool(args.get("on", True)); _a11y_state_write({"captions": on, "captionVideo": bool(args.get("video", False)) or on if on else False})
    return {"ok": True, "summary": f"captions {'on' if on else 'off'}"}
```

### 7.2 Register inside `register_catalog()` (`:720`); risk=`safe_write` (no path → **auto-runs** per `permission.py:181`)
```python
register(Tool(id="accessibility.status", name="Accessibility status", risk="safe_read", timeout=10,
    description="Current accessibility state (modes, scale, captions, gaze, etc.).",
    input_schema={"type":"object","properties":{}}, tags=["a11y","status"], handler=_h_a11y_status))
register(Tool(id="accessibility.set_mode", name="Set accessibility mode", risk="safe_write", timeout=10,
    description="Turn a mode on/off: calm|hc|reduce_motion|captions|caption_video|scan|dwell|gaze|predict|xl|voice|read_aloud.",
    input_schema={"type":"object","properties":{"mode":{"type":"string"},"on":{"type":"boolean","default":True}},"required":["mode"]},
    tags=["a11y"], handler=_h_a11y_set_mode))
register(Tool(id="accessibility.text_scale", name="Set text scale", risk="safe_write", timeout=10,
    description="Set the text-scale percent (100–220).",
    input_schema={"type":"object","properties":{"scale":{"type":"integer","default":140}},"required":["scale"]},
    tags=["a11y"], handler=_h_a11y_text_scale))
register(Tool(id="accessibility.read_screen", name="Read screen aloud", risk="safe_write", timeout=10,
    description="Ask the active surface to read the visible screen aloud.",
    input_schema={"type":"object","properties":{"region":{"type":"string"}}}, tags=["a11y","tts"], handler=_h_a11y_read_screen))
register(Tool(id="accessibility.read_aloud", name="Speak text", risk="safe_write", timeout=10,
    description="Speak a specific string on the active surface (TTS queue).",
    input_schema={"type":"object","properties":{"text":{"type":"string"}},"required":["text"]},
    tags=["a11y","tts"], handler=_h_a11y_read_aloud))
register(Tool(id="accessibility.captions.toggle", name="Toggle captions", risk="safe_write", timeout=10,
    description="Turn the caption bar (and optional video captions) on/off.",
    input_schema={"type":"object","properties":{"on":{"type":"boolean","default":True},"video":{"type":"boolean","default":False}}},
    tags=["a11y","captions"], handler=_h_a11y_captions))
```
Append the 6 ids to the **return list** (`:855`) and they flow into `CATALOG_IDS` (`:865`) → appear in
`GET /agent/tools` (`:1808`) → callable via `POST /agent/run` → `CORE.execute(cmd, auto_only=True)` (`:1626`).

---

## 8. Edge cases & failure matrix

| Condition | Detection | Behaviour (never throws, never fakes) |
|---|---|---|
| `a11y.js` 404 / parse error | page-side `if(window.A11Y)` guards | every router/caption call is skipped; page behaves exactly as today |
| `/a11y` mirror 404 / 5xx | GET/POST try/catch, log once | engine runs **local-only** (localStorage); cross-surface sync silently off |
| `/a11y/a11y.js` collides with `/a11y` mirror | path-match order (§2.2) | assets matched by `/a11y/` prefix first; mirror by exact `==/a11y` |
| no `SpeechRecognition` (non-Chromium) | `detectCaps().speech` | voice control degrades to switch/dwell/gaze/keyboard; `startListening` already no-ops |
| no WebGPU/MediaPipe | `detectCaps().webgpu/mediapipe` | gaze + video-captions speak honest "needs this device's GPU"; UI unaffected |
| camera denied | `getUserMedia` reject | gaze declines via existing WebRTC permission flow; no second prompt storm |
| no `/tts` + no `speechSynthesis` | TTS.speak fallback chain | `unavailable('read-aloud')` toast; captions still render text |
| TTS queue vs true emergency | `needHelp()` (`:762`) sets priority | emergency line pre-empts/flushes the queue; nothing talks over the SOS |
| concurrent swarm edits `dashboard.py` | additive hunks + atomic JSON | no hot-path edit; `os.replace` swap → reader never sees a half file |
| stale `_cmd` after reload | `nonce` + in-memory `_lastCmdNonce` + `ts<loadTime` | one-shot; never re-executes a read-screen on reconnect |
| user dragging a slider while remote write arrives | `activeDragField` skip in `reconcile` | the dragged field isn't yanked; other fields reconcile |
| a11y phrase resembles climate/build | anchored regexes + collision test below | a11y matched only on its own vocab; else `None` → climate/build/chat |
| guardian POSTing patient mirror | `opts.mirror=false`, no `CT` | guardian never writes the patient state; runs local-only |
| overlay over RTX scene | single `#a11y-layer`, transform-only | 60fps; fully disabled under `reduce-motion`/`calm` |

**Regex-collision test list (must all hold):** `"I'm cold"`→climate (a11y None) · `"set lounge to 23"`→climate ·
`"make me a 3d dragon"`→build · `"captions on"`→a11y · `"high contrast"`→a11y · `"read the screen"`→a11y(`_cmd`) ·
`"larger text"`→a11y · `"warmer"`→climate · `"what can I say"`→a11y(showCommands).

---

## 9. Accessibility correctness (the WCAG / AAC contract)

- **WCAG 2.2:** 1.4.3/1.4.6 contrast (`body.hc` + `prefers-contrast`); 1.4.4 resize text (`scale` 100–220, no
  loss to 200%); 2.3.3 animation from interactions (`reduce-motion`); 2.5.5/2.5.8 target size (`xlTargets`
  ≥64px > the 44px AA floor); 2.1.1 keyboard (scan/switch = full keyboard-equiv operation); 4.1.2 name/role/value.
- **ARIA:** caption bar `#a11y-captions` is `aria-live="polite"`; emergency uses `aria-live="assertive"`
  (reuse `#srlog`). Reading-cursor uses `aria-hidden` highlight only — never moves real focus mid-utterance.
- **Focus discipline:** `SelectionCore.activate(el)` sets focus *then* fires the native click so screen readers
  and the scan ring agree. Scanning never traps focus — `Esc`/dwell-off/`stop` always exits; calm mode keeps the
  Help button reachable at all times.
- **AAC fidelity (ACAT reference):** scan grammar (auto + row-column), single-switch (`Space/Enter`/any-key/
  facial-gesture), prediction shrinking keystrokes, on-screen keyboard — the proven Hawking-toolkit pillars.
- **Psychosis-safe copy:** calm-mode + first-run walkthrough strings are reviewed for non-patronising,
  no-surveillance-implication language; no flashing; alarm-reds reserved for a *true* emergency only.
- **Privacy:** gaze (MediaPipe/WebGazer), video ASR (Moonshine/Whisper-WebGPU) and prediction (predictionary)
  all run **on-device**; verified in §12 with the network panel showing zero camera/audio/keystroke egress.

---

## 10. Lifeline-safety proof (every touchpoint enumerated)

| Touchpoint | Why it cannot harm the pm2 lifeline |
|---|---|
| `server/a11y.js`, `a11y.css`, `a11y_keyboard.json`, `a11y_assets/` | **new files**; not imported by any service |
| `server/data/a11y_state.json` | **new file**; written only via the locked atomic `_a11y_write` |
| `do_GET` `/a11y/` + `/a11y` branches | **new `elif`**; positioned before the catch-all; touch nothing else |
| `do_POST` `/a11y` branch | **new `if`** above the token guard; returns early; other POST paths unchanged |
| `_a11y_read`/`_a11y_write`/`_a11y_handle` + constants | **new module-level**; no existing fn edited |
| `/chat` insert at `:1998` | **4-line additive INSERT** before `_climate_handle`; `_chat`/`_jarvis_chat`/build/`task_daemon` bodies untouched |
| `catalog.py` 6 handlers + 6 `register()` + 6 ids | **additive**; lazy-imports `dashboard` only at call-time (no cycle at load); `_agent_tools`/`status` are best-effort wrapped (`:1608`) so a broken tool can't take the dashboard down |
| HTML edits | **appends inside existing fns** + `<head>` `<link>/<script>`; no existing line rewritten |
| client engine | every page hook is `try{ if(window.A11Y){…} }catch(_){}` → a broken engine is invisible |

No code on the `_chat`/`_vitals`/voiceclone/task-daemon request path is modified. The only shared mutable
state (`a11y_state.json`) is written through a single locked atomic swap.

---

## 11. Build sequencing (each milestone shippable, lane-safe, no JS error)

| M | Files touched | Deliverable | Done-gate (feeds Stage 9) |
|---|---|---|---|
| **M0** | `dashboard.py` (§5.1), `a11y.js`/`a11y.css` stubs | `/a11y/` serves the bundle (correct MIME); pages `<link>/<script>` load; `window.A11Y` exists | `curl /a11y/a11y.js` → `application/javascript`; console clean on all 3 pages |
| **M1** | `a11y.js` (state/set/apply/init/detectCaps/migrate), `a11y.css`, voice `applyAccess` delegate | Unify **HC + text-scale + reduce-motion + prefers-***; migrate `ACCESS` | all 3 pages honor HC/scale/motion; voice chips still work; OS `prefers-*` auto-applies |
| **Mx-a** | `dashboard.py` §5.2/5.3, both router wrappers | `/a11y` GET/POST mirror + reconcile; voice+text `A11Y.intent` | a toggle on voice appears on live within one poll; honest local-only if mirror down |
| **M2** | `a11y.js` TTS+linearizer | read-aloud queue, `readScreen/readTasks`, honest IG/S25 | "read the screen / read my tasks" works; barge-in stops it |
| **M3** | all 3 pages caption sinks + ASR | persistent caption bar incl. **guardian**; remote-video ASR (WebGPU-gated) | JARVIS captioned everywhere; video captions when GPU present else honest |
| **Mx-b** | `catalog.py` §7, `dashboard.py` §5.4 | `_a11y_handle` in `/chat` + 6 `accessibility.*` agent tools | each shipped capability is voice+text+chat+agent drivable; `_cmd` read-screen executes once |
| **M4** | `a11y.js` scan/dwell/targets, `a11y.css` | ScanEngine + Dwell ring + XL + `SelectionCore` | single key/gesture reaches & activates any control; targets ≥64px |
| **M5** | `a11y.css` `body.calm` + `calm.*` | Calm mode | visibly simplifies; copy reviewed; Help always reachable |
| **M6** | `a11y.js` predict/kbd, `a11y_keyboard.json` | predictive chip-bar + scanning keyboard | predictions insert; on-screen kbd operable by scan/dwell; on-device |
| **M7** | `a11y.js` gaze | MediaPipe→WebGazer pointer + gesture switch + calibration | gaze cursor + gesture activate dwell; honest decline w/o camera/WebGPU |
| **M8** | voice/live/guardian panels | Unified Accessibility hub (extend `openCare`) + spoken first-run walkthrough | one reachable hub per surface; every toggle present; walkthrough speaks |

Autonomy (Mx-a/Mx-b) is woven in **as capabilities land**, never deferred — nothing ships that the user can't
invoke hands-free by voice, text, `/chat`, and (where applicable) an agent tool.

---

## 12. Verification / self-check (what Stage 9 will run)

1. **Asset serving:** `curl -sI localhost:8095/a11y/a11y.js` → `Content-Type: application/javascript`,
   200; `/a11y/a11y.css` → `text/css`; `/a11y/keyboard.json` → JSON. `/a11y/../dashboard.py` → 404.
2. **Mirror round-trip:** `POST /a11y?token=… {state:{hc:true},source:'voice'}` → `GET /a11y` shows `hc:true`
   with a newer `ts`; a second surface's GET reconciles it in within one poll.
3. **`/chat` intents:** `POST /chat {q:"captions on"}` → `{a11y:true,...}`; `{q:"I'm cold"}` → climate (a11y
   None); `{q:"make me a 3d dragon"}` → build. (The §8 collision list.)
4. **Agent tools:** `GET /agent/tools` lists the 6 `accessibility.*`; `POST /agent/run {q:"turn on calm
   mode"}` → mirror `calm:true` (auto-run, no confirm).
5. **No-JS-error sweep:** load each page with (a) all a11y off, (b) all on — console clean both ways.
6. **Lifeline:** `git diff` shows the `dashboard.py` change is only the additive branches + 3 fns + the 4-line
   `/chat` insert; `_chat`/`_vitals`/`_jarvis_chat`/`task_daemon` bodies byte-identical. `pm2 status` healthy.
7. **Privacy:** with gaze + video-captions + predict on, the network panel shows **zero** outbound camera/
   audio/keystroke payloads (models load once from CDN/vendor, inference stays local).
8. **Cross-cut:** §9.1 pillar×surface matrix + §9.2 gates from the Stage-2 spec all green.

---

## 13. Open items deliberately left to implementation (not decisions — mechanics)
- Exact CSS values for HC palette parity across the 3 pages (derive from voice `:225–228`).
- Moonshine vs Whisper-WebGPU model URLs + the vendored `a11y_assets/vendor/` snapshot (lazy, pillar-gated).
- DOM-linearizer per-page selector tuning (skip the Three.js `<canvas>`, the `#a11y-layer`, hidden nodes).
- Reading-cursor highlight style + speed mapping from `rate`.
These do not change any interface in §3–§7; they're fill-in-the-blanks within the locked contract.
