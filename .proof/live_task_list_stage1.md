# STAGE 1 — LIVE TASK LIST (front-page dock) · Research + chosen architecture

**Task (swarm #32, lane `universe` → `server/jarvis_live.html`):** a dock app that opens a live, accurate
running list of ALL Claude + swarm tasks by polling `/tasks` and `/swarms`. For EACH task: WHO is doing it
(swarm #N + lane, or a standalone Claude agent), a live **%**, **time taken** (elapsed), **time left** (eta),
the current **stage/label**, and an **ON/OFF toggle** per task (pause/resume + cancel) wired to the existing
`/task` and `/swarm` action endpoints. Poll every few seconds, all values accurate, billion-dollar polish.
**NO PRs — this is the user's control surface; they review + control everything here.**

---

## A. REPO FINDINGS (what already exists — build the join on top of this, change no backend)

### Endpoints already live (read)
| GET | returns | per item |
|---|---|---|
| `/tasks` | `task_daemon.list_tasks()` | `id, name, label, status, pct, elapsed, eta` (last 40, id desc) |
| `/swarms` | `task_daemon.swarm_list()` | `id, title, step, steps, status, pct, updated` (last 30) |
| `/swarm?id=N` | `task_daemon.swarm_get(N)` | `id, title, step, status, plan[]{label,prompt}, results[]{step,label,status,result}, cur_task` |
| `/taskresult?id=N` | `task_daemon.result(N)` | `status, label, text` (full Claude output tail) |

### Action endpoints already live (POST, token-gated with `&token=CT`, `CT="__CTOKEN__"` injected by `_tmpl`)
- `/task?action=pause&id=N` → `SIGSTOP` (real freeze, state preserved)
- `/task?action=resume&id=N` → `SIGCONT`
- `/task?action=cancel&id=N` → `SIGTERM` + mark cancelled
- `/task?action=clear` → delete finished rows
- `/swarm?action=cancel&id=N` → cancels `cur_task` + marks swarm cancelled
- `/swarm?q=...` (no action) → start a new durable swarm

### The data model (server/services/task_daemon.py)
- A **swarm** = ordered plan of steps; each step runs as a **detached Claude task**. The currently-executing
  step's task id is `swarm.cur_task`. After a step finishes, `results[]` grows and `step` advances. Lanes
  (`universe`/`backend`/`care`) serialize edits: **≤1 swarm per lane at once** (anti-corruption).
- A **standalone Claude task** comes from `/ask` or a chat "build" intent — `name=='claude'`, NOT any
  swarm's `cur_task`.
- **Utility tasks** = `snapshot/correlate/gen_image/gen_glb/...` (the `SAFE` map + `gen_media`).

### THE ACCURACY GAPS (the crux of "all values accurate") — verified against the live server
1. **Per-task `pct` is a naive time-estimate, not real progress.** For a Claude task `pct =
   min(99, elapsed/est*100)` with `est=90s`, so any build >90s **pins at 99% and `eta=0`** immediately.
   Live proof: tasks running 107s / 145s / 637s all report `pct:99, eta:0`. Showing that raw = fake/locked.
2. **`/swarms` reports `step:0, pct:0` while step-0 is in flight** (step only advances *after* a step
   completes). Live proof: every running swarm shows `step:0, steps:13, pct:0` despite active work.
3. **`/swarms` and `/swarm` expose neither `lane` nor `created_ts`.** `cur_task` is only on `/swarm?id=N`.
   So total-since-creation elapsed + lane are not directly available from the API.

**→ The honest, accurate signal is the swarm→task JOIN + a data-driven step-duration model, computed
client-side. Do NOT surface the raw per-task 99%/eta:0 for swarm steps.**

### Integration surface (server/jarvis_live.html) — all client-side, universe lane only
- Dock registry `DOCK[]` (line ~556): add one entry `{k:'worklist', ic:'🛰', t:'Live Tasks', fn:openWorklist}`.
- Overlay pattern: full-screen `.ov` panes (`#ovGuardian`, `#ovLib`) toggled by `setMode()`; the card
  modal is `#card` via `showCard()`. **A dense live list needs its own dedicated overlay** (`#ovWork`) — the
  small `#card` is wrong for a multi-row, per-row-control surface. Reuse the `.ov` + glass tokens.
- Design tokens (`:root`): `--cy:#29E7FF --cy2:#7af3ff --ok:#34d399 --am:#f5b942 --rd:#ff5d6c --pu:#a78bfa
  --bg:#02040a --glass:rgba(8,22,34,.62) --ln:rgba(41,231,255,.22) --dim:#5f8298`.
- Token for actions is already in-page as `CT`. Existing helper precedent: `pollClaude(id)` (3s poll loop).

### HARD lane-safety constraint (do not break)
A **backend-lane swarm runs concurrently** (e.g. #31 brain.db backup edits `dashboard.py`/services).
Two agents editing `dashboard.py`/`task_daemon.py` at once = corruption. **Therefore v1 ships 100%
client-side against the EXISTING endpoints — zero backend edits.** (Backend enrichment = deferred v2, §E.)

---

## B. 2026 TECH FINDINGS (engineering) — what to adopt

**Transport — smart polling, NOT SSE/WebSocket.** The Python stdlib `http.server` is synchronous: every
held-open SSE stream burns a worker thread, and HTTP/1.1 caps the browser at 6 SSE conns/domain. So a
self-scheduling `setTimeout` poll (every ~3s) of the existing endpoints is the correct best-in-class choice
here. Make it smart: pause on `document.hidden` (visibilitychange) + immediate refetch on resume;
`AbortController` to cancel the prior in-flight request each tick; in-flight dedupe; exponential backoff
(×1.5 → cap 30s) **+ ±50ms jitter** on errors, reset on success. (Ably, RxDB, smart-poll-loop.)

**ETA — data-driven median + EMA, clamped monotonic-ish.** True % is unknown, so estimate *rate*, never
instantaneous. Two layers:
- **Median past-duration** (the CI-systems pattern, GitHub Actions/CircleCI): `medianStepSec = median(elapsed
  of recently DONE heavy Claude tasks)`. **Live measured value right now = 386s** (n=18, range 72–990s).
  This is REAL observed build time, recomputed each poll → self-calibrating.
- **EMA smoothing** (α≈0.2) of that rate so it doesn't ping-pong (alive-progress uses exactly this).
- **UX clamp:** ETA may fall freely but rise no faster than wall-clock between ticks (kills the
  "2 min → 12 min → 4 min" jitter). Near completion switch to an indeterminate "finishing up…" state — never
  divide by ~0. Display in human buckets ("~6 min", "<1 min").

**Optimistic toggles — snapshot → apply → confirm/rollback.** Flip the pill to "Pausing…" instantly;
`isPending` disable-gate (essential for a toggle that inverts state — blocks double-fire); rollback to the
snapshot + toast on failure; **per-id "pending wins over poll" guard** so the 3s poll can't stomp an
in-flight optimistic state; drop stale responses (request-identity). (React `useOptimistic`, Linear, TanStack.)

**60fps-smooth on a 3s poll — lerp toward target in one global RAF.** Decouple the *rendered* bar/number
from the *polled* value: a single `requestAnimationFrame` loop eases `displayed → target` with
**frame-rate-independent damping** `displayed += (target-displayed)*(1-exp(-k*dt))`. So bars glide and
counters roll between ticks. Gate all motion behind `prefers-reduced-motion` (snap instantly when reduced).

**Rendering — keyed reconciliation by id, NEVER innerHTML-per-tick.** Keep `Map<rowId, element>`; per tick
add/update/remove/reorder by **stable id** (never array index). innerHTML rebuild loses focus + scroll,
**restarts every CSS transition (bars reset to 0 each poll)**, and kills listeners. Keyed diff is a hard
prerequisite for the smooth bars, not an optional optimization. Batch writes in one RAF; virtualize only
past ~150 rows (we cap at 40 tasks + 30 swarms → not needed).

**Accessibility.** Each progress bar `role="progressbar"` + `aria-valuenow`/`aria-valuetext` ("Step 3 of 13
· ~6 min left"); omit `aria-valuenow` for indeterminate; announce discrete status transitions
(running→paused→done) via a **separate `aria-live="polite"`** region (not the rapidly-changing bar).

---

## C. BILLION-DOLLAR DESIGN FINDINGS (how Palantir/Apple/Temporal/Linear/Datadog do it)

**Palantir ontology framing.** Treat each agent as an **object** with live **properties** (status, step,
%, elapsed, eta) and a *fixed Action set* (pause / resume / cancel) — you invoke an Action, you don't
"edit." Dark + dense + legible is on-brand ("darker = clearer"); tabular numerals, tight rows, hairline
dividers, one accent (cyan) reserved for active/selected. (Blueprint, Foundry Ontology.)

**OTel GenAI span-tree (2026 industry standard; Sentry/LangSmith/Datadog/New Relic).** A swarm run renders
as a nested waterfall: `invoke_agent → execute_tool/request` children; sub-agent transfers shown inline.
Hierarchy = **overview table → click row → step timeline → click step → glass inspector** (inputs/outputs/
result text via `/taskresult`). Columns everyone surfaces: who, status, current step, progress, duration,
model calls/tokens/cost.

**Apple Live-Activities = our dock.** Each running agent → a **compact dock pill** (icon + cyan radial +
"running 4m"); tap → **expanded glass card** keeping element positions stable between states; 14pt/concentric
margins; accurate-or-indeterminate progress (never fake to "look busy"); count-up number transitions;
single-row move+fade on reorder; remove ended activities after a short delay.

**Temporal "Liveness" + controls.** Motion *is* the live signal — animated cyan shimmer on the running pill
(like Temporal's animated dashed "pending" lines). Per-row controls: **Cancel = graceful, Terminate = hard +
requires a reason**. Statuses: Running (only open state) + Completed/Failed/Canceled/Paused. Relative timers
("running 4m 12s") tick client-side; absolute time on hover.

**Carbon status ladder + ≥3-channel encoding (color+icon+label, never color alone).**
`running = cyan #29E7FF (shimmer)` · `success = #34d399` · `paused = #f5b942` · `failed = #ff5d6c` ·
`queued/transition = #5f8298 gray`. Highest-attention color wins when aggregating.

**Linear/Vercel/Datadog list craft.** Optimistic instant toggles reconciled against the real daemon
(first-class latency); per-row inline actions revealed on hover/focus + keyboard (↑/↓ nav, space=toggle
pause, Esc=close); Vercel-style streaming detail (our `/taskresult` tail) with severity coloring; Datadog
fast fixed tick. Elapsed compound short form "4m 12s".

**Reversibility-graded controls.** Pause/Resume = reversible → **no modal**, instant optimistic toggle +
visible Resume. Cancel = wastes done work → **confirm modal** naming the agent + "k steps discarded",
specific red verb "Cancel run" / safe "Keep running". A **master switch** (Pause-all / Cancel-all) at the top.

---

## D. RECOMMENDED ARCHITECTURE TO ADOPT (decisive — this is what Stage 2/3/5 build)

**One dock app `🛰 Live Tasks` → full-screen glass overlay `#ovWork` ("MISSION CONTROL"), 100% client-side
join over the existing endpoints. No backend edits (lane-safe).**

### Data pipeline (every ~3s, smart-poll)
1. `GET /tasks` + `GET /swarms` (one tick, AbortController, 304-aware if added later).
2. For each **running** swarm only: `GET /swarm?id=N` (throttled) → `cur_task`, `plan[]`, `step`.
3. Build `Map cur_task → {swarmId, lane, stepLabel=plan[step].label, step, steps}`. `lane` = JS re-impl of
   `_swarm_lane(title)` (universe/backend/care) so no backend change is needed.
4. `medianStepSec` = median elapsed of done heavy (`>60s`) Claude tasks, EMA-smoothed (α≈0.2).

### Unified row model (WHO / WHAT / % / elapsed / eta / toggle)
- **Swarm row** — WHO=`Swarm #N · <lane>`; STAGE=`step k/13 · <label>` (design→…→finalize); whichever
  `cur_task` is live drives the ticking timer.
  - `% = (step + curFrac)/steps · 100`, `curFrac = min(.99, curTaskElapsed/medianStepSec)`.
  - `elapsed` = current-step live timer (`curTask.elapsed`, ticked client-side); aggregate badge "step k/13".
  - `eta = max(0, medianStepSec - curTaskElapsed) + (steps-step-1)*medianStepSec`, clamped monotonic-ish.
  - ON/OFF toggle → pause/resume **cur_task** (`/task?action=pause|resume&id=curTask`). Cancel → confirm →
    `/swarm?action=cancel&id=N`. Between steps (no cur_task) → toggle shows "starting…" disabled.
- **Standalone Claude row** — WHO=`Claude agent`; STAGE = label tail; `%`= time-based but shown honestly
  (if elapsed>est → indeterminate shimmer + "running 7m", not a locked 99%); toggle → pause/resume/cancel
  the task directly.
- **Utility row** (snapshot/image/3D) — WHO = task name; its `est` is real → genuine determinate %.
- Finished rows collapse into a "Recent" section with a Clear control (`/task?action=clear`).

### Render + interaction
- Dedicated overlay `#ovWork`: header (master Pause-all/Cancel-all + live counts "6 running · 2 paused") →
  **Active** section (swarms then standalone, status-sorted) → **Recent** section. Keyed-by-id reconciliation;
  one global RAF lerping every bar/counter; cyan shimmer on running pills; reduced-motion safe.
- Optimistic toggles with isPending gate + rollback toast + per-id pending-wins guard.
- Click a row → expand inline timeline of `plan[]`/`results[]` (done=green check, current=cyan shimmer,
  pending=gray) + a `/taskresult` text tail (Vercel-style) for the live step. Apple compact↔expanded coherence.
- Full a11y: progressbar roles, `aria-valuetext`, `aria-live=polite` status region, keyboard nav.

### Why this is best-in-class AND safe
- Accurate: replaces the fake locked 99%/eta:0 with a **real swarm-progress fraction + empirically-measured
  386s/step ETA**, recomputed live. Honest indeterminate state where % is genuinely unknown.
- Zero backend risk: existing endpoints only → cannot collide with the concurrent backend-lane swarm, cannot
  break the lifeline.
- Real controls: every toggle hits an endpoint that already does the real thing (SIGSTOP/SIGCONT/SIGTERM).

---

## E. DEFERRED v2 (only when NO backend-lane swarm is active — do not do concurrently)
A 3-field additive enrichment of `swarm_list()` → add `lane`, `cur_task`, `created` to each dict (and a
`/worklist` endpoint that server-side joins tasks+swarms + computes the median ETA once). This removes the
per-swarm `/swarm?id=N` fan-out and gives exact total-since-creation elapsed + authoritative lane. Pure
additive, low risk — but it edits `task_daemon.py`/`dashboard.py` (backend lane), so it must wait for an
idle backend lane to stay corruption-safe. v1 above needs none of it.

## F. OPEN RISKS / NOTES
- Per-swarm `/swarm?id=N` fan-out: throttle to running swarms only; cap concurrency; skip when tab hidden.
- `medianStepSec` cold-start (no done tasks yet) → fall back to plan-implied default (~390s) until real data.
- Total swarm elapsed since creation is bounded by the API (no `created_ts`); v1 shows accurate current-step
  timer + "step k/13" rather than a guessed total — honest over fake. v2 fixes this exactly.
- Token: actions must include `&token=CT`; GETs are token-free. Keep all writes idempotent (state-setting).
