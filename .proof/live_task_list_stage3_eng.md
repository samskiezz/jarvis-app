# STAGE 3 — LIVE TASK LIST (front-page dock) · Concrete Engineering Plan

**Task (swarm #32, lane `universe` → `server/jarvis_live.html`).** Implementation-ready plan for the
`🛰 Live Tasks` dock app: a full-screen "Mission Control" overlay that polls `/tasks` + `/swarms` (+ per-running-swarm
`/swarm?id=N`), joins them into one accurate live row model, and exposes per-row ON/OFF (pause/resume) + Cancel +
master controls. **NO PRs — user's control surface.** Builds on Stage 1 (`.proof/live_task_list_stage1.md`) and
Stage 2 (`.proof/live_task_list_stage2_spec.md`). This doc is the **build contract** for Stage 5 — a coder writes
the feature straight from §3–§12 with no further repo spelunking.

> **Scope of THIS stage:** the plan only. No code is written until the build stage. v1 is **100% client-side over
> existing endpoints — zero backend edits** (a backend-lane swarm may be editing `dashboard.py`/`task_daemon.py`
> concurrently; two writers on one file = corruption + lifeline risk). All changes land in ONE file:
> `server/jarvis_live.html`.

---

## 0. RE-VERIFICATION AGAINST THE LIVE (MODIFIED) TREE — anchors corrected, 3 refinements found

Every endpoint contract and integration anchor below was re-read from the **current working tree** (the files are
`M`-dirty per git status, so Stage 2's line numbers were re-checked). Result: **every Stage 2 contract claim still
holds**; anchors are re-pinned to today's lines; three accuracy refinements are added.

### 0.1 Backend contracts — re-verified (read-only; do NOT edit these files)

| Endpoint | Source (file:line) | Exact return shape (verified) |
|---|---|---|
| `GET /tasks` | `task_daemon.list_tasks()` `:221` → dispatch `dashboard.py:1769` | last 40, id DESC: `{id, name, label, status, pct, elapsed, eta}` |
| `GET /swarms` | `swarm_list()` `:436` → `dashboard.py:1772` | last 30, id DESC: `{id, title, step, steps, status, pct, updated}` |
| `GET /swarm?id=N` | `swarm_get(N)` `:455` → `dashboard.py:1775` | `{ok, id, title, step, status, plan[]{label,prompt}, results[]{step,label,status,result}, cur_task}` |
| `GET /taskresult?id=N` | `result(N)` `:172` → `dashboard.py:1846` | `{ok, status, label, text}` (Claude output tail, last 6 KB) |
| `POST /task?action=pause\|resume\|cancel\|clear&id=N&token=CT` | `pause/resume/cancel/clear_finished` `:291/298/237/312` → `dashboard.py:2050` | SIGSTOP / SIGCONT / SIGTERM+mark / delete finished. Returns `{ok}` |
| `POST /swarm?action=cancel&id=N&token=CT` | `swarm_cancel(N)` `:469` → `dashboard.py:2038` | cancels `cur_task` + marks swarm `cancelled`. Returns `{ok}` |

- **Token model (verified `dashboard.py:2025`):** the token is read from the **query string** of the POST
  (`q.get("token")`), NOT the body. So every write is `POST <path>?action=…&id=…&token=<CT>` with an empty body.
  Reads (`/tasks`,`/swarms`,`/swarm`,`/taskresult`) are in `do_GET` **before** any auth gate → token-free.
- **Bad/empty token →** `{"ok":false,"error":"unauthorized"}` (`:2026`). **Bad action →** `{"ok":false,"error":"bad action"}` (`:2060`).
- **Route precedence (matters):** `/swarms` is tested before `/swarm` in `do_GET` (`:1772` before `:1775`); on POST `/swarm` (`:2038`) is tested before `/task` (`:2050`). Our URLs (`/swarm?action=cancel`, `/task?action=…`) dispatch correctly.
- **`CT` is live, not literal:** `jarvis_live.html` is served via `self._tmpl("jarvis_live.html")` (`dashboard.py:1927`) which does `.replace("__CTOKEN__", CONTROL_TOKEN)` (`:1734`). The page already has `const …, CT="__CTOKEN__";` (`jarvis_live.html:388`) → at serve time `CT` becomes the real control token. **Reuse `CT`; do not re-declare it.**

### 0.2 The accuracy crux — re-confirmed exactly against today's code

- **Claude tasks are inserted with `est=90`** (`task_daemon.py:136`, `ask_claude`).
- The supervisor heartbeat writes `pct = min(99, int(elapsed/max(est,1)*100))` every ~2 s (`:679`), with an optional
  `/tmp/jarvis_task_pct_{tid}` override **also capped at 99** (`:683`). Claude builds never write that file → pure
  time estimate. **⇒ any Claude job past 90 s reads `pct:99`.**
- `list_tasks` sets `eta = max(0, est-elapsed) if running else 0` (`:231`) ⇒ **Claude `eta` hits 0 at 90 s.**
- `swarm_list.pct = int(step/steps*100)` (`:449`) and `step` only advances **after** a step finishes (`:628`) ⇒ a
  running swarm reads `step:0,pct:0` for its whole first step.
- **`cur_task` is reset to `None` between steps** (`:629`) and is only set when a step launches (`:651`). It may also
  point to a **`paused`** task while the swarm row still says `running` (`:621–623`, paused counts as lane-busy).

> **⇒ Surfacing raw per-task `pct`/`eta` for long jobs = a fake, frozen bar.** Accuracy must come from the
> swarm→task JOIN + a measured rate model (§4). Confirmed unchanged from Stage 1/2.

### 0.3 THREE refinements discovered this stage (fold into the build)

1. **Row status must derive from the `cur_task`'s status, not the swarm's, when a swarm is mid-step.** A swarm whose
   `cur_task` is `paused` still reports `swarm.status:"running"`. The WHO row must show **PAUSED (amber)** and the toggle
   must sit in the *resume* position. (Stage 2 implied this; making it an explicit derivation rule.) → §4.3.
2. **Standalone Claude rows should use the median-rate model too — not "indeterminate past est=90".** Stage 2 said a
   standalone Claude row goes indeterminate once `elapsed > est`; but `est=90` and `medianStepSec≈386`, so ~every build
   would be indeterminate. Better/honest: drive standalone Claude `pct = min(99, elapsed/medianStepSec*100)` (rate-based,
   determinate) and switch to indeterminate **only on genuine overrun** (`elapsed > 1.5·medianStepSec`). → §4.4.
3. **`swarm.updated` (from `/swarms`) is a free server-side anchor for current-step start.** `_swarm_update` bumps
   `updated_ts` exactly when a step launches / `cur_task` changes (`:422,651,629`), so `now - swarm.updated` ≈
   current-step elapsed. Use it as the **fan-out-failure fallback** for `curElapsed` when `/swarm?id=N` errors or the
   `cur_task` row has aged out of the last-40 `/tasks` window. → §4.3 + §7.

### 0.4 Integration anchors in `server/jarvis_live.html` — re-pinned to today's lines

| What | Anchor (today) | Edit |
|---|---|---|
| Design tokens `:root` | `:9` | reuse `--cy/--cy2/--ok/--am/--rd/--pu/--bg/--tx/--dim/--glass/--ln` (all present) |
| `.ov` / `.ov .close` / `.ovtitle` CSS | `:76,79,83` | reuse `.ov`+`.open`+`.close`+`.ovtitle`; add a scoped `#ovWork{…}` block |
| Overlay markup (`#ovGuardian`,`#ovLib`) | `:352–~387` | insert `<div class=ov id=ovWork>…</div>` immediately **after** the `#ovLib` block's closing `</div>` |
| `CT` token const | `:388` | reuse as-is |
| `pollClaude` (3 s `setInterval` precedent) | `:502` | model the smart self-scheduling `setTimeout` loop on this; do not reuse it |
| `DOCK[]` registry (10 entries) | `:556–567` | add `{k:'worklist', ic:'🛰', t:'Live Tasks', fn:()=>setMode('worklist')}` after the `vitals`/`upgrades` ops cluster (`:566`) |
| `renderDock()` | `:568` | **no change** — iterates `DOCK[].fn` automatically (tile + magnify + drag-pin all free) |
| `openVitals()` (dock-app fn neighborhood) | `:777` | place the new JS block just after this (around `:797`) |
| `setMode(mode,arg)` | `:817` | reset list `['ovGuardian','ovLib']` `:818` → add `'ovWork'`; add `else if(mode==='worklist')` branch; `overlayOpen` `:823` → include `worklist`; call `worklistStop()` when leaving to non-worklist |
| Global RAF precedent `tickFrame` | `:1760` | add an **independent** worklist RAF that runs **only while `#ovWork` is open** — never touch the universe loop |

All new JS lives in one labelled block `/* ===== 🛰 LIVE TASKS — Mission Control ===== */`. One new `<style>` block.
No other files touched. **`server/dashboard.py` and `server/services/task_daemon.py` are READ-ONLY in v1.**

---

## 1. FILE-CHANGE MANIFEST (v1)

| File | Edits | Net new |
|---|---|---|
| `server/jarvis_live.html` | (a) +1 `DOCK[]` entry `:566`; (b) +`#ovWork` overlay markup after `:387`; (c) +1 `<style>` block `#ovWork …` near `:83`; (d) `setMode` extension `:817`; (e) +1 JS module block near `:797` (the 12 functions of §3) | ~1 dock line · ~25-line overlay shell · ~1 CSS block · ~4 `setMode` lines · ~1 JS block |
| *(none else)* | backend untouched | — |

**Zero** changes to `dashboard.py` / `task_daemon.py` / routes / pm2 / DB.

---

## 2. MODULE STATE (all `let`/`const` inside the one JS block; no globals leak beyond what's needed)

```js
// ---- lifecycle ----
let WL_OPEN   = false;          // overlay is mounted + lifecycle running
let WL_TIMER  = null;           // setTimeout handle for the smart poll
let WL_RAF    = null;           // requestAnimationFrame handle for the lerp loop
let WL_ABORT  = null;           // AbortController for the in-flight tick
let WL_BACKOFF= 3000;           // current poll interval ms (3 s base, ×1.5→cap 30 s on error)
let WL_INFLIGHT = false;        // in-flight dedupe (skip a tick if one is still running)
let WL_LASTTICK = 0;            // performance.now() of last successful tick (for client-side elapsed ticking)

// ---- model ----
let WL_MEDIAN = 390;            // medianStepSec, EMA-smoothed, clamp [120,1200]; 390 cold-start seed
const WL_PLANCACHE = new Map(); // swarmId -> plan[] (immutable; fetched once)
const WL_ROWS  = new Map();     // rowId -> WorkItem (last computed target model)
const WL_EL    = new Map();     // rowId -> { root, …childRefs } (keyed DOM, never innerHTML the list)
const WL_DISP  = new Map();     // rowId -> { pct, eta, elapsed } (RAF-eased *displayed* values)
const WL_PEND  = new Map();     // controlId(taskId) -> { want:'paused'|'running', ts } optimistic guard
const WL_PREVETA = new Map();   // rowId -> last shown eta seconds (monotonic-rise clamp)
const WL_EXPANDED = new Set();  // rowIds whose detail drawer is open (lazy /taskresult)
let   WL_LIVE_REGION = null;    // the aria-live=polite node
```

---

## 3. FUNCTIONS (12) — signatures, responsibility, data flow

```
openWorklist()                         // dock fn → setMode('worklist')   [optional thin wrapper; we inline as fn:()=>setMode('worklist')]
worklistStart()                        // mount shell once · first paint from cache · kick poll · start RAF · bind keys+visibility
worklistStop()                         // clearTimeout · WL_ABORT.abort() · cancelAnimationFrame · unbind · WL_OPEN=false  (NO network after this)
pollTick()                async        // the smart-poll heartbeat (self-reschedules); orchestrates fetch→join→reconcile; backoff/jitter
fetchAll(signal)          async → {tasks, swarms, swarmDetails:Map}  // /tasks + /swarms, then /swarm?id=N for RUNNING swarms (pool ≤4, plan cache)
computeMedian(tasks)      → number     // EMA(median(done heavy claude elapsed)), seed 390, clamp [120,1200]
joinModel(tasks,swarms,details) → WorkItem[]  // THE JOIN → normalized rows (§4); also returns dedupe set of cur_task ids
reconcile(items)                       // keyed-by-id DOM diff into #ovWork lists (create/update/remove/reorder); sets aria + targets
rafFrame()                             // single RAF: lerp displayed→target for every bar+counter; tick client-side elapsed/eta; reschedules
laneOf(title)             → 'universe'|'backend'|'care'   // JS port of _swarm_lane (§4.2)
doAction(kind,row)        async        // optimistic pause/resume/cancel + master ops; writes POST …?action&token=CT; pending guard; rollback+toast
toggleDetail(rowId)                    // expand/collapse the per-row plan/results timeline + live /taskresult tail (lazy)
```

Plus small pure helpers (no state): `fmtDur(s)` ("4m 12s"), `fmtEta(s)` ("~6 min" / "<1 min" / "few sec" / "—"),
`median(nums)`, `clamp(x,a,b)`, `lerp(a,b,k)`, `esc(s)` (already in page), `wlToast(msg,kind)`.

### 3.1 Control / data flow (one tick)

```
pollTick()                                    ── runs only while WL_OPEN && !document.hidden && !WL_INFLIGHT
 ├─ WL_INFLIGHT=true; WL_ABORT=new AbortController()
 ├─ {tasks,swarms,details} = await fetchAll(WL_ABORT.signal)        // AbortError on overlay close = swallowed
 ├─ WL_MEDIAN = computeMedian(tasks)
 ├─ items = joinModel(tasks, swarms, details)                       // WorkItem[] (active sorted, then recent)
 ├─ reconcile(items)                                                // keyed DOM diff → sets per-row .target {pct,eta,elapsed}
 ├─ WL_LASTTICK = performance.now(); WL_BACKOFF=3000 (reset on success); update "reconnecting" chip off
 └─ finally: WL_INFLIGHT=false; WL_TIMER=setTimeout(pollTick, WL_BACKOFF + jitter(±50ms))
                                                                    // on throw (not AbortError): WL_BACKOFF=min(30000,×1.5); chip on; keep last rows
rafFrame()  (independent, ~60fps while open)
 ├─ dt = (now - lastFrame)/1000
 ├─ for each rowId in WL_EL: ease WL_DISP[pct] → row.target.pct  (k≈6, frame-rate-independent), write bar width + %
 │     client-tick elapsed += dt (for running rows), recompute displayed eta = max(0, target.eta - sinceTick)
 ├─ honor prefers-reduced-motion → snap (no ease, no shimmer)
 └─ WL_RAF = requestAnimationFrame(rafFrame)
```

---

## 4. THE ACCURACY MODEL (final formulas — the build math)

### 4.1 `medianStepSec` (self-calibrating, smoothed)
```js
function computeMedian(tasks){
  const done = tasks.filter(t => t.name==='claude' && t.status==='done' && t.elapsed>60).map(t=>t.elapsed);
  const m = median(done);                              // null if none done yet
  if(m!=null) WL_MEDIAN = clamp(0.2*m + 0.8*WL_MEDIAN, 120, 1200);   // EMA α=0.2, clamp sane band
  return WL_MEDIAN;                                    // cold-start stays at seed 390 until real data
}
```
Live baseline measured in Stage 1 = **386 s** (n=18, 72–990 s). Recomputed every tick.

### 4.2 Lane inference — exact JS port of `_swarm_lane` (`task_daemon.py:571`, verified char-for-char)
```js
function laneOf(title){
  const t=(title||'').toLowerCase();
  if(t.includes('jarvis_voice')||t.includes('guardian.html')||t.trimStart().startsWith('care')) return 'care';
  if(t.includes('dashboard.py')||t.includes('endpoint')||t.includes('/vitals')||t.includes('/vpn')||
     t.includes('/solar')||t.includes('producer')||t.includes('backend')||t.includes('services')||
     t.includes('live-data')) return 'backend';
  return 'universe';
}
```
**Honest caveat (carried):** `swarm.title` is `request[:40]` truncated (`task_daemon.py:410`) while the server computes
the lane from the *full* request → client lane is best-effort on long titles. Lane is a **secondary label, never a
control input**, so a mislabel can't affect action correctness. v2 (§13) exposes the authoritative `lane`.

### 4.3 Swarm row (WHO = `Swarm #N · <lane>`; the live `cur_task` drives the timer)
For each `/swarms` row with `status==='running'`, joined with its `/swarm?id=N` detail `D`:
```
steps      = D.plan.length
stepLabel  = (D.step < D.plan.length ? D.plan[D.step].label : 'finalizing')
tk         = D.cur_task ? tasksById.get(D.cur_task) : null
if D.cur_task:                                  // a step is in flight (or paused)
   curStatus = tk?.status ?? 'running'
   curElapsed= (tk ? tk.elapsed : max(0, now - swarm.updated))      // fan-out/aged-out fallback = swarm.updated
   curFrac   = clamp(curElapsed / WL_MEDIAN, 0, 0.99)
   pct       = (D.step + curFrac) / steps * 100
   eta       = max(0, WL_MEDIAN - curElapsed) + (steps - D.step - 1) * WL_MEDIAN
   status    = (curStatus==='paused') ? 'paused' : 'running'        // REFINEMENT #1: derive from the task
   canToggle = true ; controlId = D.cur_task ; toggleVerb = status==='paused' ? 'resume' : 'pause'
else:                                            // running, between steps (cur_task==null)
   pct = D.step / steps * 100 ; indeterminate = true ; status='running'
   stage = 'advancing…' ; canToggle = false ; controlId = null
cancelTarget = {type:'swarm', id:swarm.id}
who   = 'Swarm #'+swarm.id+' · '+laneOf(D.title||swarm.title)
stage = 'step '+(D.step+1)+'/'+steps+' · '+stepLabel        // 1-indexed for humans
rowId = 'sw:'+swarm.id
```
**Monotonicity holds across step boundaries:** when `step` increments and `cur_task` momentarily nulls, `pct` becomes
`(step+1)/steps ≥ (step+0.99)/steps`; next step sets a small `curFrac` → still ≥. No backward jumps.

### 4.4 Standalone Claude row (REFINEMENT #2 — rate-based, not "indeterminate past est")
For `/tasks` rows with `name==='claude'`, `status∈{running,paused}`, and **id ∉ cur_task set** (dedupe):
```
elapsed = tk.elapsed (+ client tick)
curFrac = clamp(elapsed / WL_MEDIAN, 0, 0.99)
pct     = curFrac * 100
indeterminate = elapsed > 1.5 * WL_MEDIAN                 // genuine overrun only → shimmer + "running Xm"
eta     = indeterminate ? null : max(0, WL_MEDIAN - elapsed)
who='Claude agent' ; stage = tk.label tail ; controlId=tk.id ; cancelTarget={type:'task',id:tk.id} ; status=tk.status
rowId='tk:'+tk.id
```

### 4.5 Utility row (real `est` → genuine determinate %)
For `/tasks` rows with `name∉{'claude'}` and `status∈{running,paused}` (e.g. `gen_image` est 60, `gen_glb` est 360,
`snapshot/correlate/live_docs/…` from the `SAFE` map):
```
pct = tk.pct (real) ; eta = tk.eta (real) ; indeterminate=false
who = friendly(tk.name|tk.label) ; controlId=tk.id ; cancelTarget={type:'task',id:tk.id} ; rowId='tk:'+tk.id
```

### 4.6 Recent (finished) rows
`status∈{done,failed,cancelled}` → RECENT section: `pct=100` (or last), no toggle, dimmed, status pill; a section-level
**Clear finished** button (`/task?action=clear`).

### 4.7 ETA UX clamp (kills jitter — applied in `reconcile` per row)
```
newEta from §4.3/4.4 ; prev = WL_PREVETA.get(rowId)
dtWall = (now - WL_LASTTICK)/1000
if prev!=null && newEta > prev + dtWall: newEta = prev + dtWall      // may FALL freely, RISE ≤ wall-clock
if pct >= 97 || (newEta!=null && newEta < 0.5*WL_MEDIAN && pct>90): label='finishing up…' (indeterminate eta)
WL_PREVETA.set(rowId, newEta)
display via fmtEta() in human buckets: ≥90s→"~Nmin" · 10–90s→"<1 min"/"~Ns" · <10s→"few sec" · null→"finishing up…"
```

### 4.8 Sort + dedupe
- **dedupe:** build `curSet = Set(details[*].cur_task)`; a task in `curSet` renders **only** in its swarm row.
- **active sort:** swarms first (by id), then standalone Claude, then utility; within each, status order
  `running → paused`, then most-recent first. Recent section: newest finished first.

---

## 5. DOM / CSS — `#ovWork` "MISSION CONTROL"

### 5.1 Overlay markup (insert after the `#ovLib` overlay, ~`:387`)
```html
<div class=ov id=ovWork>
  <button class=close onclick="setMode('live')">✕ Close</button>
  <div class=ovtitle>🛰 LIVE TASKS <span style="color:var(--dim)">· mission control</span></div>
  <div id=wlHead>
    <span id=wlCounts aria-live=off>—</span>
    <span id=wlChip class=wlchip hidden>reconnecting…</span>
    <span class=wlspacer></span>
    <button id=wlPauseAll class=wlbtn>⏸ Pause all</button>
    <button id=wlCancelAll class=wlbtn danger>⨯ Cancel all</button>
    <button id=wlClear class=wlbtn>🧹 Clear finished</button>
  </div>
  <div id=wlLive class=sr-only aria-live=polite aria-atomic=true></div>   <!-- status announcements only -->
  <div id=wlBody role=list aria-label="Live tasks">
    <div id=wlActive></div>
    <div id=wlRecentWrap hidden><div class=wlsec>RECENT</div><div id=wlRecent></div></div>
    <div id=wlEmpty class=wlempty hidden>No active tasks — JARVIS is idle.</div>
  </div>
</div>
```

### 5.2 Per-row anatomy (built once per rowId in `reconcile`, then only fields updated)
```
.wlrow[data-row=<rowId>] role=listitem
 ├─ .wldot          ← status channel #1 (color) + #2 (shape/pulse): cyan-shimmer run · amber paused · green done · red fail · gray queued
 ├─ .wlwho          ← "Swarm #31 · backend"  (primary, tabular)        + .wlstage "step 4/13 · implement" (dim)
 ├─ .wlbar role=progressbar aria-valuemin=0 aria-valuemax=100 aria-valuenow aria-valuetext
 │     └─ .wlfill (width = displayed pct; .indet → marching cyan shimmer, no numeric)
 ├─ .wlpct "63%"    (omitted/"—" when indeterminate)
 ├─ .wltime  ⏱<elapsed>  ·  ⏳<eta>     (tabular numerals; ticked client-side)
 └─ .wlctl
      ├─ button.wltoggle[aria-pressed]  ← ON/OFF (pause/resume); disabled when !canToggle (between steps)
      └─ button.wlcancel danger          ← ⨯ (confirm modal)
 (expanded) .wldetail  ← plan/results timeline (✓ green done · cyan shimmer current · gray pending) + /taskresult tail
```
Status text label is ALWAYS present next to the dot (channel #3) → **never color-only** (Carbon ≥3-channel rule).

### 5.3 CSS block (scoped `#ovWork …`) — reuse `:root` tokens
- Layout: `#ovWork{display:none}` reuses `.ov.open` to show; `#wlHead` flex sticky top; `#wlBody` scroll, max-width 1100px centered; tight 44–52px rows, hairline `1px solid var(--ln)` dividers; tabular numerals (`font-variant-numeric:tabular-nums`).
- One accent: cyan `--cy` reserved for active/selected/fill. Statuses: run `--cy` (+shimmer), done `--ok`, paused `--am`, fail `--rd`, queued `--dim`.
- Motion = liveness (Temporal): `@keyframes wlShimmer` travelling highlight on `.wldot.run` + `.wlfill.indet`; single-row move+fade on reorder (`transition:transform .25s, opacity .25s`); ended rows fade into RECENT after ~1.2 s.
- `.sr-only` visually-hidden util for `#wlLive`. `.wlchip` thin amber pill. `.wlbtn.danger` red verb.
- **`@media (prefers-reduced-motion: reduce)`** → kill all `animation`/`transition`; bars + counters **snap** to target.

---

## 6. RENDER — keyed reconciliation (hard requirement, not an optimization)

`reconcile(items)`:
1. Partition `items` into `active` / `recent`; toggle `#wlEmpty` (no active and no recent), toggle `#wlRecentWrap`.
2. **Diff by stable `rowId`** against `WL_EL`:
   - **new id** → build the row node (§5.2), wire its toggle/cancel/expand listeners **once**, append in sorted slot, init `WL_DISP[rowId]` to the target (so the bar animates in from a sane value, not 0→x flicker).
   - **existing id** → update only changed fields: `.wlwho/.wlstage` text, `.wldot` status class, `.wltoggle[aria-pressed]`+label+`disabled`, `aria-valuenow/valuetext`, and set `row.target={pct,eta,elapsed,indeterminate}` for the RAF (do **not** write width here).
   - **gone id** → fade out, then remove node + delete from `WL_EL/WL_DISP/WL_PREVETA`.
3. **Reorder** by sorted order using `insertBefore` only when an element is out of place (minimal DOM moves; preserves focus + scroll + running CSS transitions).
4. Update `#wlCounts` ("6 running · 2 paused · 3 done"). **Announce only discrete status transitions** (a row that changed running→paused→done→failed since last tick) into `#wlLive` — never the fast-changing numbers.
5. **Never `innerHTML=` the list** (would reset every transition → bars snap to 0, drop focus/scroll, kill listeners). Cap 40 tasks + 30 swarms → no virtualization.

---

## 7. EDGE CASES & FAILURE HANDLING (verified against code paths)

| Case | Source-of-truth | Handling |
|---|---|---|
| Swarm between steps (`cur_task==null`, running) | `task_daemon.py:629` | bar indeterminate "advancing…"; toggle **disabled** (`canToggle=false`); no fake % |
| Swarm `cur_task` is **paused** but swarm "running" | `:621–623` | row status = **paused** (amber); toggle in *resume* position (REFINEMENT #1) |
| `cur_task` aged out of last-40 `/tasks` | `list_tasks` limit 40 | `curElapsed` falls back to `now - swarm.updated` (REFINEMENT #3) |
| `/swarm?id=N` fails for one swarm | network | keep that row from last good state, stage="syncing…", don't drop it |
| Cold start, no done Claude tasks | `computeMedian` null | `WL_MEDIAN=390` seed; bars still advance via `curFrac` |
| Task is a swarm's `cur_task` | join `curSet` | rendered only in the swarm row (no duplicate standalone) |
| Optimistic vs poll race | `WL_PEND` | per-`controlId` pending flag **wins** over poll until the confirming poll matches `want`, or 8 s timeout → rollback + toast |
| Token stale → `{ok:false,error:'unauthorized'}` | `dashboard.py:2026` | toast "control token stale — reload"; revert optimistic UI |
| Bad action → `{ok:false,error:'bad action'}` | `:2060` | treat as failure; rollback + toast |
| Empty state | — | "No active tasks — JARVIS is idle." (honest, not a spinner) |
| Tab hidden | `visibilitychange` | poll + RAF **paused**; instant refetch + RAF resume on return |
| Overlay closed mid-flight | `worklistStop` | `WL_ABORT.abort()` → fetch rejects `AbortError` → swallowed; no setState after close |
| Any fetch/JSON throw | try/catch per tick + per row | degrades that row / shows reconnect chip; **never throws to the page** (preserves "no JS error" rule) |

---

## 8. CONTROLS — optimistic, reversibility-graded (exact wiring)

All writes: `await fetch(path+'?action='+a+'&id='+id+'&token='+CT, {method:'POST'})` then `r.json()` → `{ok}`.

- **Pause/Resume (reversible → no modal).** `doAction('toggle', row)`:
  1. snapshot current status; compute `want = status==='paused'?'running':'paused'`.
  2. **optimistically** flip pill + `aria-pressed`, set label "Pausing…/Resuming…", `disabled=true` (`isPending` gate blocks double-fire on a state-inverting toggle), set `WL_PEND.set(row.controlId,{want,ts:performance.now()})`.
  3. POST `/task?action=pause|resume&id=row.controlId&token=CT`. On `{ok:false}` or throw → **rollback** to snapshot + `wlToast`. On ok → leave `WL_PEND`; cleared when a poll observes `status===want` (or 8 s timeout → rollback).
- **Cancel (destructive → confirm modal).** Reuse the page's `showCard`/modal idiom for a confirm with the agent named
  + "k steps discarded" (k = `steps - step` for swarms): red verb **"Cancel run"** / safe **"Keep running"**.
  - swarm → `POST /swarm?action=cancel&id=row.cancelTarget.id&token=CT` (cancels `cur_task` + marks swarm cancelled, `:469`).
  - standalone/utility → `POST /task?action=cancel&id=…&token=CT`.
- **Master switch (`#wlHead`).** **Pause all running** → sequential optimistic toggles over rows with `status==='running' && canToggle`. **Cancel all** → ONE confirm, then fan-out cancels (pool ≤4). **Clear finished** → `POST /task?action=clear&token=CT` then drop recent rows.
- **Stale-response drop:** tag each action with the snapshot; ignore a late response whose row status already moved on (request-identity).

---

## 9. ACCESSIBILITY (WCAG-grade; the page must never regress a11y)

- Each bar `role="progressbar"` `aria-valuemin=0` `aria-valuemax=100` `aria-valuenow=<pct>` `aria-valuetext="Step 3 of 13 · ~6 min left"`; **omit `aria-valuenow`** when indeterminate (add `aria-busy=true`).
- Discrete status transitions announced via the **separate `#wlLive` `aria-live="polite"` `aria-atomic`** region (e.g. "Swarm 31 paused", "Image generation complete") — never the fast-ticking numbers.
- **Keyboard model:** overlay is a focus context; `↑/↓` move row focus (roving tabindex), `Space` = toggle pause on the focused row, `Enter` = expand/collapse detail, `Esc` = collapse open detail else `setMode('live')`. `Tab` reaches header controls. Visible focus rings (`:focus-visible`).
- **≥3-channel status** everywhere (color + dot shape/pulse + text label); pills carry text, never color-alone.
- Respect `prefers-reduced-motion` (snap, no shimmer). Hit targets ≥ 28 px. Contrast: cyan/amber/red on `--bg` pass AA for the text sizes used.

---

## 10. LIFELINE-SAFETY PROOF (why this CANNOT break the pm2 services)

1. **Zero backend writes.** Only files touched: `server/jarvis_live.html`. No edit to `dashboard.py` /
   `task_daemon.py` / routes / DB / pm2 config → cannot collide with the concurrent backend-lane swarm, cannot corrupt
   the daemon. (Lane-safe by construction.)
2. **Reads are token-free GETs that already serve the dashboard;** the added poll is ≤ (2 + #running-swarms, pooled ≤4)
   small JSON GETs every 3 s, paused when the tab is hidden and when the overlay is closed → negligible load on the
   stdlib server; no held-open connections (no SSE thread starvation).
3. **Writes only hit endpoints that already exist and already do the real, safe thing** (SIGSTOP/SIGCONT/SIGTERM, swarm
   cancel) — the same actions the current UI already exposes. No new capability, no new attack surface; all token-gated.
4. **Fully additive + self-contained:** new JS only runs while `#ovWork` is open; `worklistStop()` tears down every
   timer/RAF/fetch on close. A failure is caught per-tick/per-row and degrades to a "reconnecting…" chip — it never
   throws to the page (honors "never leave a page with a JS error") and never mutates existing features.
5. **No existing feature changed:** `setMode` edit is purely additive branches + adding `'ovWork'` to the
   reset/overlay-open lists; `DOCK[]` gains one entry that `renderDock()` already iterates generically.

---

## 11. TEST / ACCEPTANCE PLAN (how Stage 9 verifies against the running server)

**Pre-flight probes (read-only, safe to run anytime):**
```bash
curl -s 127.0.0.1:8095/tasks  | python3 -m json.tool | head
curl -s 127.0.0.1:8095/swarms | python3 -m json.tool | head
# pick a running swarm id N from /swarms, then:
curl -s "127.0.0.1:8095/swarm?id=N" | python3 -m json.tool | head -40
```
Confirms field shapes + that long Claude tasks read `pct:99/eta:0` (the thing we replace).

**Functional acceptance (every item must be TRUE — this is the Stage-9 gate):**
- [ ] `🛰 Live Tasks` appears in the dock; opens full-screen `#ovWork`; `✕`/`Esc` closes and **stops** all polling + RAF (verify: no `/tasks` requests in the network panel after close).
- [ ] Lists ALL active Claude + swarm tasks; a swarm's `cur_task` shows only inside its swarm row (no dup); finished collapse into RECENT; empty state honest.
- [ ] Each row shows **WHO** (Swarm #N · lane | Claude agent | utility), **%**, **elapsed**, **eta**, **stage/label**, **ON/OFF toggle + Cancel**.
- [ ] **Accuracy:** no long row sits at a locked 99 %/eta:0 — swarm % uses `(step+curFrac)/steps`; standalone Claude uses the median-rate %; genuine overruns go indeterminate with live "running Xm". `medianStepSec` recomputes each tick (~386 s baseline). ETA monotonic-clamped, human buckets.
- [ ] Lane label matches `_swarm_lane` for non-truncated titles.
- [ ] **Controls real:** toggle pause → task freezes (SIGSTOP); resume → resumes (SIGCONT) — both optimistic w/ rollback. Cancel confirms + names agent, then actually cancels. Master Pause-all / Cancel-all / Clear-finished work; all writes carry `&token=CT`.
- [ ] **Engineering/a11y:** smart poll ~3 s (AbortController, hidden-pause, backoff+jitter); keyed reconciliation (bars don't reset each tick); single RAF lerp; `prefers-reduced-motion` honored; `role=progressbar`+`aria-valuetext`; `aria-live=polite` region; full keyboard nav.
- [ ] **Safety:** no JS error in any state; existing features intact; `GET /` 200; pm2 `jarvis-dashboard/voiceclone/tasks` untouched (`pm2 status` unchanged); `dashboard.py`/`task_daemon.py` byte-identical to pre-change.

**Live behavior probe:** start a quick standalone build (`/ask`) and a swarm; watch the row advance smoothly past 90 s
without pinning to 99 %; pause it (confirm `pm2`/`ps` shows the claude PID in state `T`), resume (back to `R`), then cancel.

---

## 12. IMPLEMENTATION ORDER (for the Stage-5 builder — smallest safe increments)

- **M1 — shell:** add `DOCK[]` entry + `#ovWork` markup + CSS block + `setMode` branch + `openWorklist/worklistStart/worklistStop`. Opens/closes cleanly, empty state. *(verify: dock entry, overlay toggles, no console error.)*
- **M2 — read pipeline:** `fetchAll` + `computeMedian` + `joinModel` + a **dumb full-render** (temporary innerHTML) to eyeball the model. *(verify: rows + accurate %/eta vs curl probes.)*
- **M3 — keyed reconcile:** replace the dumb render with `reconcile` (Map-keyed); add `aria` + counts + status announce.
- **M4 — RAF lerp:** add `rafFrame`, client-side elapsed/eta ticking, reduced-motion snap. *(verify: bars glide, no per-tick reset.)*
- **M5 — smart poll:** AbortController, in-flight dedupe, visibility pause, backoff+jitter, reconnect chip.
- **M6 — controls:** optimistic pause/resume + `WL_PEND` guard + rollback toast; cancel confirm modal; master switch.
- **M7 — detail drawer:** `toggleDetail` plan/results timeline + lazy `/taskresult` tail.
- **M8 — a11y + polish:** keyboard model, focus rings, shimmer, reorder fade, final contrast/spacing pass against §11.

Each milestone is independently shippable to the user's surface and leaves the page error-free.

---

## 13. DEFERRED v2 (ONLY when the backend lane is idle — do NOT run concurrently)
Pure-additive backend enrichment to remove the `/swarm?id=N` fan-out and make lane / total-elapsed exact:
- `swarm_list()` → add `lane`, `cur_task`, `created` (columns already exist) so the client needs one poll, no fan-out.
- New `/worklist` GET: server-side join of tasks+swarms + one server-computed `medianStepSec`.
Edits `task_daemon.py`/`dashboard.py` (backend lane) → must wait for an idle backend lane to stay corruption-safe.
**v1 above needs none of it.**
