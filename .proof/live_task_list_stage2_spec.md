# STAGE 2 — LIVE TASK LIST (front-page dock) · Design / Build Spec (first draft)

**Task (swarm #32, lane `universe` → `server/jarvis_live.html`).** A dock app `🛰 Live Tasks` that opens a
live, accurate running list of **all** Claude + swarm tasks. Per task: **WHO** (swarm #N + lane, or a
standalone Claude agent), a live **%**, **time taken** (elapsed), **time left** (eta), the current
**stage/label**, and an **ON/OFF toggle** (pause/resume) **+ cancel**, wired to the existing `/task` and
`/swarm` action endpoints. Polls every few seconds; every value accurate; billion-dollar polish.

> **This is the user's control surface — NO PRs. They review + control everything here.**
> Stage-1 research + chosen architecture: `.proof/live_task_list_stage1.md` (read first). This Stage-2 doc
> is the **authoritative build reference**; §10 is the Stage-9 acceptance checklist.

---

## 0. NON-NEGOTIABLES (carried from the build rules + Stage 1)

1. **Zero backend edits in v1.** A backend-lane swarm edits `dashboard.py`/`task_daemon.py` concurrently —
   two agents on the same file = corruption + lifeline risk. v1 is **100 % client-side** over the existing
   endpoints. Backend enrichment is deferred v2 (§11), only when the backend lane is idle.
2. **Never break the running pm2 services** (`jarvis-dashboard`/`jarvis-voiceclone`/`jarvis-tasks`).
3. **Real or nothing.** No fabricated numbers. Where a value is genuinely unknown, render an **honest
   indeterminate state** ("finishing up…", "running 7m"), never a fake/locked bar.
4. **Preserve every existing feature; never leave the page with a JS error.** All new code is additive and
   self-contained; the worklist RAF/poll only run while the overlay is open.

---

## 1. INTEGRATION POINTS (verified against the live tree — file:line anchors)

### `server/jarvis_live.html`
| What | Anchor | Change |
|---|---|---|
| Dock registry `DOCK[]` | `:556` | add `{k:'worklist', ic:'🛰', t:'Live Tasks', fn:openWorklist}` (place after `library`, before `guardian`) |
| `renderDock()` | `:568` | no change — iterates `DOCK[].fn` automatically |
| Overlay markup (`.ov`) | after `:353` (`#ovLib`) | add `<div class=ov id=ovWork>…</div>` (header + scroll body) |
| `.ov` / `.close` CSS | `:76–79` | reuse as-is; add a scoped `#ovWork{…}` block + row/bar/pill classes |
| `setMode(mode,arg)` | `:817` | extend: add `'ovWork'` to the reset list `:818`; add `else if(mode==='worklist')` branch that opens `#ovWork` + starts the worklist lifecycle; treat as `overlayOpen` (`:822`) so the dock/sdev/glass panels hide consistently; on return to `'live'` **stop** the worklist lifecycle |
| Action token | `CT="__CTOKEN__"` `:388` | reuse — `_tmpl` injects `CONTROL_TOKEN` server-side |
| Poll precedent | `pollClaude` `:502` (3 s `setInterval`) | replace pattern with a smart self-scheduling `setTimeout` loop scoped to the overlay |
| Global RAF precedent | `tickFrame` `:1067/1761` | add an **independent** worklist RAF (runs only while `#ovWork` open) — do **not** burden the universe render loop |

All new JS lives in one labelled block (`/* ===== 🛰 LIVE TASKS — Mission Control ===== */`) near the other
dock-app functions (around `:777` `openVitals`). One new CSS block in `<style>`. No other files touched.

### Endpoints consumed (read = token-free; write = `&token=CT`) — all already live
| Verb | Path | Source | Returns (verified fields) |
|---|---|---|---|
| GET | `/tasks` | `task_daemon.list_tasks()` | last 40, id DESC: `{id, name, label, status, pct, elapsed, eta}` |
| GET | `/swarms` | `swarm_list()` | last 30, id DESC: `{id, title, step, steps, status, pct, updated}` |
| GET | `/swarm?id=N` | `swarm_get(N)` | `{ok, id, title, step, status, plan[]{label,prompt}, results[]{step,label,status,result}, cur_task}` |
| GET | `/taskresult?id=N` | `result(N)` | `{status, label, text}` (Claude output tail) |
| POST | `/task?action=pause\|resume\|cancel\|clear&id=N&token=CT` | `pause/resume/cancel/clear_finished` | SIGSTOP / SIGCONT / SIGTERM+mark / delete finished |
| POST | `/swarm?action=cancel&id=N&token=CT` | `swarm_cancel(N)` | cancels `cur_task` + marks swarm `cancelled` |

---

## 2. THE ACCURACY MODEL (the crux — restated as build rules)

Verified live: **`/tasks.pct` pins at 99 and `eta` hits 0 once a Claude task passes its `est` (90 s)** —
`list_tasks()` returns `eta = max(0, est-elapsed)` with `est=90` for every Claude row (`task_daemon.py:194`,
`claude_run` insert `est=90`). **`/swarms.pct = int(step/steps*100)`**, and `step` only advances *after* a
step finishes, so a running swarm reads `step:0, pct:0` mid-step-0. **Neither `swarm_list` nor `swarm_get`
exposes `lane` or `created_ts`** (the `lane` column exists in the table but isn't serialized). → **Do not
surface raw per-task 99 %/eta:0 for long jobs.** Derive accuracy from the join + a measured rate model:

### 2.1 `medianStepSec` (data-driven, self-calibrating)
```
done = tasks where name=='claude' && status=='done' && elapsed>60      // heavy builds only
medianStepSec = EMA( median(done.elapsed), α=0.2 )                      // smoothed across ticks
cold-start (no done rows yet): medianStepSec = 390                       // plan-implied default
```
Live-measured baseline at Stage 1 = **386 s** (n=18, 72–990 s). Recomputed every tick.

### 2.2 Per-row derivations
- **Swarm row** (WHO = `Swarm #N · <lane>`, the live `cur_task` drives the timer):
  ```
  curElapsed = (cur_task ? task.elapsed : 0)                            // ticked client-side between polls
  curFrac    = min(0.99, curElapsed / medianStepSec)
  pct        = (step + curFrac) / steps * 100                           // replaces the locked 0/99
  elapsed    = curElapsed         (badge: "step k/STEPS · <label>")
  eta        = max(0, medianStepSec - curElapsed) + (steps - step - 1) * medianStepSec
  ```
  Between steps (`cur_task == null` while running): toggle = "starting…" (disabled), bar = indeterminate.
- **Standalone Claude row** (WHO = `Claude agent`): if `elapsed > est` → **indeterminate** shimmer +
  "running Xm" (never a locked 99 %); else honest determinate `pct`. Stage = `label` tail.
- **Utility row** (`snapshot/gen_image(60s)/gen_glb(360s)/live_docs(90s)/…`): `est` is realistic → genuine
  determinate `pct`/`eta` straight from `/tasks`. WHO = friendly task name.
- **ETA UX clamp** (kills jitter): eta may **fall freely** but **rise no faster than wall-clock** between
  ticks; within ~`0.5·medianStepSec` of done → switch to indeterminate "finishing up…"; never ÷≈0.
  Display in human buckets ("~6 min", "<1 min", "few sec").

### 2.3 Lane inference (JS re-impl of `_swarm_lane`, `task_daemon.py:537`)
```js
function laneOf(title){const t=(title||'').toLowerCase();
  if(t.includes('jarvis_voice')||t.includes('guardian.html')||t.trimStart().startsWith('care'))return'care';
  if(/dashboard\.py|endpoint|\/vitals|\/vpn|\/solar|producer|backend|services|live-data/.test(t))return'backend';
  return'universe';}
```
**Known limitation:** `swarm.title` is `request[:48]` (truncated) while the server computes the lane from the
*full* request, so client inference is best-effort on long titles. v2 (§11) exposes the authoritative `lane`.
Mitigation: lane is a secondary label, not a control input — a mis-label never affects correctness of actions.

---

## 3. CLIENT ARCHITECTURE (modules, all client-side)

```
openWorklist()                 → setMode('worklist'); starts lifecycle
 ├─ worklistStart()            → first paint + kick poll loop + start RAF; bind keys; visibilitychange
 ├─ worklistStop()            ← on close: clear timers, abort in-flight, cancel RAF, unbind
 ├─ pollTick()  (smart poll)   → fetch /tasks + /swarms (AbortController), then /swarm?id=N for RUNNING swarms only
 │     → joinModel()           → Map<rowId, WorkItem>  (the ontology, §4)
 │     → recompute medianStepSec
 │     → reconcile(rows)       → keyed-by-id DOM diff (add/update/remove/reorder by stable id)
 ├─ rafFrame()                 → lerp every bar/counter displayed→target (frame-rate-independent damping)
 └─ controls                   → optimistic pause/resume toggle, cancel-with-confirm, master Pause-all/Cancel-all
```

### 3.1 Smart poll (transport — polling, **not** SSE; stdlib `http.server` is synchronous)
- Self-scheduling `setTimeout`, base interval **3 s**. One `AbortController` per tick; abort the prior
  in-flight request on the next tick; in-flight dedupe (skip if a tick is still running).
- Pause on `document.hidden` (visibilitychange) → immediate refetch on resume.
- Errors: exponential backoff ×1.5 → cap 30 s, **±50 ms jitter**, reset to 3 s on first success. A failed
  tick shows a thin "reconnecting…" header chip; the last-known rows stay (no fldata wipe).
- Per-swarm `/swarm?id=N` fan-out: **running swarms only**, concurrency-capped (Promise pool ≤4), skipped
  when hidden. Cache `plan[]` per swarm id (plans are immutable) → refetch only `step/cur_task` cheaply.

### 3.2 Render — keyed reconciliation (hard requirement, not an optimization)
- Keep `Map<rowId, HTMLElement>`. Per tick: create new, update existing in place, remove gone, reorder by
  stable `rowId`. **Never `innerHTML=` the list** — that resets every CSS transition (bars snap to 0), drops
  focus/scroll, and kills listeners. Cap is 40 tasks + 30 swarms → no virtualization needed.
- `rowId`: `sw:<id>` for swarms, `tk:<id>` for standalone/utility tasks. A swarm's `cur_task` is rendered
  **only** inside its swarm row (dedupe: tasks that are some swarm's `cur_task` are not also drawn standalone).

### 3.3 60 fps on a 3 s poll — single RAF lerp
- One worklist RAF eases `displayed → target` for each bar width + each numeric counter with
  **frame-rate-independent damping**: `displayed += (target-displayed)*(1-exp(-k*dt))`, k≈6.
- Client-side per-frame tick of `curElapsed`/`eta` so timers count smoothly between polls.
- All motion gated behind `prefers-reduced-motion: reduce` → snap to target, no shimmer.

### 3.4 Controls — optimistic, reversibility-graded
- **Pause/Resume = reversible → no modal.** Optimistic: flip pill to "Pausing…/Resuming…" instantly,
  `isPending` disable-gate (blocks double-fire on a state-inverting toggle), POST
  `/task?action=pause|resume&id=<curTaskOrTaskId>&token=CT`, then confirm against next poll; on failure
  rollback to snapshot + toast. **Per-id "pending wins over poll"** guard so the 3 s poll can't stomp an
  in-flight optimistic state; drop stale responses by request-identity.
- **Cancel = destructive → confirm modal** naming the agent + "k steps discarded"; red verb "Cancel run" /
  safe "Keep running". Swarm cancel → `/swarm?action=cancel&id=N`; standalone → `/task?action=cancel&id=N`.
- **Master switch** (header): **Pause-all running** (sequential optimistic toggles) + **Cancel-all** (one
  confirm, then fan-out). **Clear finished** → `/task?action=clear`.

### 3.5 Accessibility
- Each bar `role="progressbar"` + `aria-valuenow`/`aria-valuetext` ("Step 3 of 13 · ~6 min left"); omit
  `aria-valuenow` when indeterminate. Discrete status transitions (running→paused→done→failed) announced via
  a **separate `aria-live="polite"`** region — never the rapidly-changing bar. Full keyboard model:
  `↑/↓` row nav, `Space` = toggle pause, `Enter` = expand, `Esc` = collapse / close overlay. Focus-visible
  rings; pills carry text labels (color is never the only channel).

---

## 4. THE `WorkItem` ONTOLOGY (Palantir object framing — one normalized row model)

```ts
WorkItem {
  rowId      : string            // 'sw:31' | 'tk:884'
  kind       : 'swarm'|'claude'|'utility'
  who        : string            // 'Swarm #31 · backend' | 'Claude agent' | '📰 Ingest fresh documents'
  lane?      : 'universe'|'backend'|'care'
  stage      : string            // 'step 4/13 · implement' | label tail
  status     : 'running'|'paused'|'done'|'failed'|'cancelled'|'queued'
  pct        : number            // 0..100 (target; RAF lerps the rendered value)
  indeterminate: boolean         // true → shimmer bar, no numeric %
  elapsed    : number            // seconds (current-step for swarms; ticked client-side)
  eta        : number|null       // seconds, clamped; null/indeterminate near done
  controlId  : number            // task id the toggle acts on (swarm→cur_task, else self)
  cancelTarget: {type:'swarm'|'task', id:number}
  canToggle  : boolean           // false between swarm steps (no cur_task)
  detail?    : { plan[], results[], curResultTail }   // lazy, on expand
}
```
Fixed **Action set** per object: `pause` · `resume` · `cancel` (you invoke an Action; you don't "edit").

---

## 5. DOM / CSS — `#ovWork` "MISSION CONTROL" (layout & row anatomy)

```
#ovWork  (.ov, full-screen glass; backdrop blur)
 ├─ header  ── "🛰 LIVE TASKS"  ·  live counts "6 running · 2 paused · 3 done"  ·  reconnecting? chip
 │            ·  [⏸ Pause all] [⨯ Cancel all] [🧹 Clear finished]  ·  [✕ Close]
 ├─ section ACTIVE   (swarms first, then standalone Claude, then utility; status-sorted: running→paused)
 │    └─ row  (keyed by rowId)
 │         ┌ status dot (cyan shimmer running / amber paused / green done / red failed / gray queued)
 │         ├ WHO  (Swarm #N · lane  ·or·  Claude agent)        ← primary, tabular
 │         ├ STAGE (step k/13 · <label>)                        ← secondary dim
 │         ├ PROGRESS bar (role=progressbar, lerped) + "%"      ← cyan fill; shimmer if indeterminate
 │         ├ ⏱ elapsed "4m 12s"   ·   ⏳ eta "~6 min"           ← tabular numerals, tick client-side
 │         └ controls (hover/focus reveal + always-on for running): [ ON/OFF toggle ] [ ⨯ Cancel ]
 │       (click row → expand inline)
 │         timeline of plan[]/results[]  (done=green ✓, current=cyan shimmer, pending=gray)
 │         + /taskresult text tail of the live step (Vercel-style, severity-tinted), refreshed each tick
 └─ section RECENT   (done/failed/cancelled, collapsed, dimmed; [Clear finished])
```
**Tokens (reuse `:root`):** `--cy:#29E7FF` running · `--ok:#34d399` success · `--am:#f5b942` paused ·
`--rd:#ff5d6c` failed · `--dim:#5f8298` queued/gray · `--glass:rgba(8,22,34,.62)` · `--ln:rgba(41,231,255,.22)`.
Dark + dense + legible (Palantir): tabular numerals, tight rows, hairline dividers, one accent (cyan)
reserved for active/selected. ≥3-channel status encoding (color + icon/dot + text label), never color alone.
**Motion = the live signal** (Temporal): cyan shimmer travels along running pills/bars; single-row
move+fade on reorder; ended rows fade to RECENT after a short delay.

---

## 6. LIFECYCLE WIRING (exact edits)

1. **Dock entry** (`:556`): `{k:'worklist', ic:'🛰', t:'Live Tasks', fn:openWorklist}`.
2. **`openWorklist()`**: `setMode('worklist')`. (Mirrors `setMode('guardian')` pattern.)
3. **`setMode` extension** (`:817`):
   - `:818` reset list → `['ovGuardian','ovLib','ovWork']`.
   - add `else if(mode==='worklist'){ $('ovWork').classList.add('open'); worklistStart(); }`.
   - `overlayOpen` (`:822`) → include `mode==='worklist'` (hides dock/sdev/glass panels consistently).
   - when leaving to `'live'` (overlays removed) → call `worklistStop()` if it was open.
4. **`worklistStart()`**: build the overlay shell once (idempotent), first synchronous paint from cached
   state, kick `pollTick()`, start `rafFrame()`, bind keys + visibilitychange.
5. **`worklistStop()`**: clear poll `setTimeout`, `abort()` in-flight, `cancelAnimationFrame`, unbind keys.
   (Guarantees no background work when the surface is closed — perf + correctness.)

---

## 7. EDGE CASES & FAILURE HANDLING

- **Swarm between steps** (running, `cur_task==null`): bar indeterminate "advancing…"; toggle disabled;
  no fake %.
- **`/swarm?id=N` fails for one swarm:** keep that row from last good state, mark stage "syncing…"; don't
  drop the row.
- **Cold start, no done Claude tasks:** `medianStepSec=390` default; bars still move via `curFrac`.
- **Task is a swarm's `cur_task`:** rendered only in the swarm row (no duplicate standalone row).
- **Optimistic vs poll race:** per-id pending flag wins until the action's confirming poll arrives or a 8 s
  timeout rolls back with a toast.
- **Token rejected (401-ish body `{ok:false}`):** toast "control token stale — reload"; revert optimistic UI.
- **Empty state:** "No active tasks — JARVIS is idle." (honest, not a spinner).
- **Tab hidden:** poll + RAF paused; instant refetch on return.
- **Never throws to the page:** every fetch/JSON in try/catch; a parse error degrades that row, not the app.

---

## 8. WHY THIS IS BEST-IN-CLASS **AND** SAFE
- **Accurate:** replaces the verified fake (locked 99 %/eta:0, `step:0` mid-run) with a real swarm-progress
  fraction + empirically-measured ~386 s/step ETA, recomputed live; honest indeterminate where % is unknown.
- **Zero backend risk:** existing endpoints only → cannot collide with the concurrent backend-lane swarm,
  cannot touch the lifeline.
- **Real controls:** every toggle hits an endpoint that already does the real thing
  (SIGSTOP/SIGCONT/SIGTERM, swarm cancel).
- **Billion-dollar craft:** Apple Live-Activity dock→expanded coherence, Palantir object/Action ontology,
  Temporal motion-as-liveness, Carbon status ladder, Linear optimistic toggles, OTel span-tree drill-down.

---

## 9. FILE-CHANGE MANIFEST (v1 — single file)
| File | Edit | Net new |
|---|---|---|
| `server/jarvis_live.html` | +1 `DOCK[]` entry · +`#ovWork` markup · +`#ovWork` CSS block · +`setMode` branch · +`openWorklist/worklistStart/worklistStop/pollTick/joinModel/reconcile/rafFrame/laneOf/control handlers` JS block | ~1 dock line, ~1 overlay div, ~1 style block, ~1 JS block |
| **(none else)** | backend untouched | — |

No `dashboard.py` / `task_daemon.py` / pm2 / route changes in v1.

---

## 10. ACCEPTANCE CHECKLIST — the Stage-9 comparison reference
A pass requires **every** item true against the running server:

**Function**
- [ ] `🛰 Live Tasks` appears in the dock; opens a full-screen `#ovWork` glass overlay; `✕`/`Esc` closes and
      **stops** all polling + RAF.
- [ ] Lists **all** active Claude + swarm tasks; finished collapse into RECENT; empty state is honest.
- [ ] Each row shows **WHO** (Swarm #N · lane | Claude agent | utility name), **% **, **elapsed**, **eta**,
      **stage/label**, and an **ON/OFF toggle + Cancel**.
- [ ] A swarm's `cur_task` is shown only inside its swarm row (no duplicate).

**Accuracy (the crux)**
- [ ] No long-running row sits at a locked 99 %/eta:0 — swarm % uses `(step+curFrac)/steps`; long Claude
      jobs go **indeterminate** with a live "running Xm", not a frozen bar.
- [ ] `medianStepSec` is computed from real done tasks (≈386 s baseline) and recomputed each tick; ETA in
      human buckets, monotonic-clamped (never jitters up faster than wall-clock).
- [ ] Lane label matches `_swarm_lane` for non-truncated titles.

**Controls (real)**
- [ ] Toggle pause → SIGSTOP (task freezes); resume → SIGCONT (resumes); both optimistic with rollback.
- [ ] Cancel asks for confirm, names the agent, then actually cancels (`/swarm` or `/task` cancel).
- [ ] Master Pause-all / Cancel-all / Clear-finished work; all writes carry `&token=CT`.

**Polish / engineering / a11y**
- [ ] Smart poll ~3 s (AbortController, hidden-pause, backoff+jitter); keyed-by-id reconciliation (bars
      don't reset each tick); single RAF lerp; `prefers-reduced-motion` honored.
- [ ] `role="progressbar"` + `aria-valuetext`; `aria-live=polite` status region; full keyboard nav.
- [ ] No JS error on the page in any state; existing features intact; pm2 services untouched; `GET /` 200.

---

## 11. DEFERRED v2 (ONLY when the backend lane is idle — do not run concurrently)
Pure-additive backend enrichment to remove the `/swarm?id=N` fan-out and make lane/total-elapsed exact:
- `swarm_list()` → add `lane`, `cur_task`, `created` to each dict (columns already exist).
- New `/worklist` endpoint: server-side join of tasks+swarms + one computed `medianStepSec` → one cheap poll.
Edits `task_daemon.py`/`dashboard.py` (backend lane) → must wait for an idle backend lane to stay
corruption-safe. **v1 needs none of it.**

## 12. OPEN RISKS / NOTES
- `/swarm?id=N` fan-out cost → throttle to running swarms, pool ≤4, skip when hidden, cache immutable `plan[]`.
- `medianStepSec` cold-start → 390 s default until real done-data exists.
- Total since-creation elapsed is unavailable in v1 API (no `created_ts` exposed) → show the accurate
  current-step timer + "step k/13" (honest) rather than a guessed total; v2 fixes exactly this.
- All writes idempotent/state-setting; GETs token-free; writes require `&token=CT`.
