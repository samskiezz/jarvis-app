# STAGE 4 — LIVE TASK LIST · Adversarial Review of the Engineering Plan

**Reviewing `.proof/live_task_list_stage3_eng.md`** (swarm #32, lane `universe` → `server/jarvis_live.html`).
Method: re-read every cited contract against the **current working tree** and probed the **running server**
(`127.0.0.1:8095`). Verdict: **plan is sound and lane-safe in its core thesis** (client-side join over existing
endpoints, zero backend edits, swarm→`cur_task` join + median-rate model). **It must NOT proceed to Stage 5 build
as-written** — there are **4 blockers** (two of which would throw a JS error or stall the lifeline daemon), 3
high-accuracy gaps the task explicitly demands, plus a11y/mobile + robustness fixes. Concrete required changes below.

> Anchors below are re-pinned to TODAY's lines and were each opened and read; the server probes are real
> (`27` swarms currently `running`, label signature confirmed).

---

## VERIFIED CORRECT (no change needed — build on these)
- Endpoint shapes `/tasks :221`, `/swarms :436`, `/swarm :455`, `/taskresult :172` — exact.
- The accuracy crux holds **exactly**: Claude `est=90` (`:136`), heartbeat `pct=min(99,…)` (`:679`), `eta=max(0,est-elapsed)` (`:231`), swarm `pct=int(step/steps*100)` (`:449`), `step` advances only after a step finishes (`:628`), `cur_task→None` between steps (`:629`) / set on launch (`:651`).
- Token model: query-string `token` gate on POST (`:2025`), reads are token-free GETs. Route precedence `/swarms`(`:1772`)→`/swarm`(`:1775`) and POST `/swarm`(`:2038`)→`/task`(`:2050`). `/taskresult` does **not** collide with `/tasks` startswith (`'/taskresult'[5]=='r' ≠ 's'`). All correct.
- `_swarm_lane` JS port (§4.2) is char-for-char (`:571`). `CT="__CTOKEN__"` injected via `_tmpl` (`:1734`) at `:388` — reuse as-is.
- REFINEMENT #1 (derive row status from `cur_task`, not swarm) and #3 (`swarm.updated` ≈ step start) are **valid**: a `paused` `cur_task` keeps the swarm `running` & lane-busy (`:621-623`) and never advances; `swarm.updated_ts` is bumped only on step transitions (`:422/629/651`), not by the per-task heartbeat — so it is a stable step-start anchor.
- Pause is **safe** for the lifeline: SIGSTOP'd PID still passes `_alive` (`os.kill(pid,0)`), so the heartbeat will **not** mis-mark it crashed/relaunch it; `_pump_swarms` parks the swarm while `cur_task` is `paused`. Resume = SIGCONT. Cancel = SIGTERM+mark. All pre-existing, token-gated, real.

---

## BLOCKERS (must fix before Stage 5 — JS-error / lifeline-stall class)

### B1 — `/swarm?id=N` returns `{ok:false}` as **HTTP 200**, not a fetch throw → unguarded `D.plan.length` crashes the page
`swarm_get` returns `{"ok":false,"error":"no such swarm"}` for a bad/aged id (`task_daemon.py:461`). The plan's §7 only
models `/swarm?id=N` **network throws** ("keep last good, syncing…"); it never guards the `ok:false`-but-200 path. §4.3
then does `steps = D.plan.length` and `D.cur_task` directly. When a swarm is cancelled/cleared between the `/swarms` read
and the `/swarm?id=N` read (routine under churn), `D.plan` is `undefined` → **`Cannot read properties of undefined
(reading 'length')`** → violates the hard rule "never leave a page with a JS error."
**Required:** in `joinModel`, before any detail-dependent math: `if(!D || D.ok===false){ render this swarm from the
`/swarms` coarse row (step/steps/pct), stage='syncing…', toggle disabled, no live timer; continue; }`. Treat throw and
`ok:false` identically.

### B2 — Overlay-markup insertion anchor is wrong (lands inside `<script>`)
§0.4/§1/§5.1 all say "insert `#ovWork` after the `#ovLib` block, **~:387**". The real `#ovLib` closing `</div>` is at
**`:355`**; **`:387` is `<script>`** and `:388` is `const $=…`. A coder inserting HTML markup at 387 corrupts the script
block → broken page. **Required:** insert the `#ovWork` markup **immediately after line 355** (between `#ovLib`'s close
and the `<!-- boot -->` comment), in the HTML body — NOT at ~387. (Semantics in the plan were right, the line number is
~32 off and points into JS.)

### B3 — `setMode` reset loop is **not null-guarded**; adding `'ovWork'` makes a missing node crash every mode switch
`setMode` (`:818`) does `['ovGuardian','ovLib'].forEach(id=>$(id).classList.remove('open'))` — **no `&&` guard**. The
plan adds `'ovWork'` to this list. The dock calls `it.fn()` inside `try/catch` (`:575`), but the overlay **close buttons
call `onclick="setMode('live')"` with NO try/catch** (`:352/353`). If `#ovWork` is ever absent for a tick (DOM timing,
partial render, a future edit), `$('ovWork')` is `null` → `null.classList` throws inside `setMode`, breaking **guardian
and library too** and leaving a dead overlay + console error. **Required:** change the reset to the guarded form already
used elsewhere in the file (`:826`): `['ovGuardian','ovLib','ovWork'].forEach(id=>$(id)&&$(id).classList.remove('open'))`.

### B4 — Per-running-swarm fan-out is **unbounded** and contends with the lifeline daemon's sqlite writes
Measured on the live box **right now: `/swarms` → 30 rows, 27 `status:"running"`** (only ~4 actually in-flight; the rest
are `step:0` swarms parked waiting for a busy lane — `swarm_enqueue` sets `status="running"` immediately `:410`, and
`SWARM_GLOBAL_MAX=4` caps only *in-flight* steps, **not** the count of `running` rows). The plan fans out a `/swarm?id=N`
for **every** running swarm every 3s → up to **~27 extra GETs/tick**. Backend reality: `ThreadingHTTPServer`
(`dashboard.py:2124`) over **non-WAL sqlite** (`task_daemon.py:48`, `timeout=15`, default DELETE rollback journal) that
the **lifeline daemon writes every 2s** (`run_forever` heartbeat + `_pump_swarms` advance/relaunch/done-mark). A burst of
~27 concurrent reader connections raises lock contention with those critical writes; `timeout=15` prevents errors but can
**stall the daemon's lifeline writes**. This is a real lane/lifeline load risk, not hypothetical.
**Required:**
1. Sort `running` swarms by `updated` DESC; fan out `/swarm?id=N` for **only the top K (K=6 ≥ global cap 4** → covers all
   possibly-in-flight). Concurrency ≤4, total ≤K per tick.
2. Render the remaining running swarms from `/swarms` coarse fields (`step/steps/pct`) as **"queued · waiting for lane"**
   — dimmed, no live timer, toggle disabled (they have no `cur_task`).
3. Cache `plan[]` per swarm (immutable) so a swarm is detail-fetched **at most once** for labels, never re-fetched just
   for `cur_task` after it's parked. (§2 `WL_PLANCACHE` already exists — make the fetch use it as the gate.)
4. Comment the cap in code (no silent truncation).

---

## HIGH — accuracy the task explicitly demands ("WHO is doing it", all values accurate)

### H1 — Finished/racing **swarm-step** tasks pollute the standalone list mislabeled "Claude agent"
Every swarm step is an `ask_claude` task (`name='claude'`) whose label is `🤖 Claude·<model>: ` + `prompt[:38]` =
the fixed `_SWARM_BASE` prefix **`"You are JARVIS's autonomous build engi"`** (verified). When a step finishes it leaves
`cur_task` (→`None`, `:629`) and drops into the last-40 `/tasks` window as a `done` `claude` row — so §4.6 RECENT renders
it as an independent **"Claude agent"**, which is the wrong WHO. There is also a 1-tick **active** race: the task row is
INSERTed (`:134`) *before* `_swarm_update(cur_task=…)` (`:651`), so for one poll an in-flight step can appear standalone
(not yet in `curSet`). **Required:** detect the `_SWARM_BASE` label signature → classify these as **swarm-background
steps** (label "Swarm step · <model>", group/suppress in RECENT), **never "Claude agent"**. Same signature should be
excluded from (or down-weighted in) the `computeMedian` pool noise. (We cannot map a *finished* step back to its specific
swarm id from the endpoints — `cur_task` is only the current one — so generic "Swarm step" attribution is the honest v1
ceiling; exact attribution is a v2/backend item.)

### H2 — Branch on the **fresher** status and clamp swarm pct
§4.3 branches off the `/swarms` row status but then trusts detail `D`. If `D.status∈{done,failed,cancelled}` (finished
between the two reads) route the row to **RECENT** instead of rendering a fake "advancing…". And clamp
`pct = clamp((D.step + curFrac)/steps*100, 0, 100)` — `D.step` can momentarily equal `steps` at the last-step boundary,
pushing pct >100.

### H3 — Clock-skew corrupts the `now - swarm.updated` fallback (REFINEMENT #3)
`tk.elapsed` is **server-computed** (clock-safe). The fallback `curElapsed = now - swarm.updated` mixes the **client**
clock with a **server** unix ts. The server binds `0.0.0.0:8095` (`dashboard.py:2124`) → remote viewing is possible →
skew makes the fallback negative or absurdly large, producing a bogus timer/ETA. **Required:**
`curElapsed = clamp(now - swarm.updated, 0, 6*WL_MEDIAN)`; if it pins to a rail, mark the row **indeterminate** (live
"running…") rather than show a fabricated elapsed/eta. (Prefer `tk.elapsed` whenever the `cur_task` row is present, as the
plan already does — the clamp only hardens the fallback.)

---

## MEDIUM — disabled + mobile user (the actual end-user)

### M1 — Hit targets ≥44px, and isolate the destructive Cancel from the pause toggle
§9 says "Hit targets ≥ 28 px". The end-user is a **motor-impaired user on mobile** (switch/dwell/gaze — see
[[accessibility-core]]). 28px is below Apple HIG / WCAG 2.5.5 (44px). **Required:** per-row **toggle** and **Cancel**, and
header buttons, ≥**44px**; and **separate Cancel from the toggle** (spacing/placement) so a dwell/switch mis-hit can't fire
an irreversible cancel next to a reversible pause. The §8 confirm modal on cancel stays mandatory.

### M2 — Scope the new keydown handler (don't hijack the chat box / universe)
The plan adds `↑/↓/Space/Enter/Esc`. **Required:** the handler must (a) act only while `WL_OPEN`; (b) **ignore events whose
target is an `input`/`textarea`/`contenteditable`** (the page has the `#say` chat box); (c) `preventDefault` only for keys
it actually consumes; (d) be **removed in `worklistStop`** (no listener leak, no interference with the universe's controls
when the overlay is closed).

### M3 — `WL_MEDIAN` must never become `NaN`
`computeMedian` filters may yield `[]`; ensure `median([])→null` (not `NaN`) and that the EMA only updates when `m!=null`,
so a poisoned `WL_MEDIAN` can't propagate into every row's pct/eta. (§4.1 is correct in intent — make the `median()`
helper's empty-guard explicit so a Stage-5 coder can't regress it.)

---

## LOW — honesty / polish (note, don't block)
- **L1** §4.2 says title is `request[:40]`; both `swarm_build`/`swarm_pipeline` actually store `request[:48]` (the `[:40]`
  is only `swarm_enqueue`'s empty-title default, `:410`). Lane stays best-effort either way; cosmetic doc fix.
- **L2** A single global `WL_MEDIAN` across heterogeneous step labels (design vs code vs finalize, 72–990s spread) makes
  per-step ETA coarse. Acceptable for v1 — keep the `"~"` approximation prefix; per-label medians are a v2 refinement.
- **L3** Master **Cancel-all** confirm should **enumerate** count + agent names (SIGTERM is irreversible; only checkpointed
  swarms resume, standalone `/ask` work is lost). **Pause-all** can't freeze a swarm caught mid-transition
  (`cur_task=null`, `canToggle=false`) — document it as best-effort.

---

## REQUIRED CHANGES — checklist the Stage-5 build must satisfy
- [ ] **B1** `joinModel` guards `!D || D.ok===false` before `D.plan`/`D.cur_task` (treat as syncing row).
- [ ] **B2** `#ovWork` markup inserted after **`:355`** (HTML body), not ~387.
- [ ] **B3** `setMode` reset uses `$(id)&&$(id).classList.remove('open')` incl. `'ovWork'`; verify `setMode('worklist')`
      starts + `setMode(!='worklist')`/close-button stops (`worklistStop`) the poll+RAF; add `'worklist'` to `overlayOpen`.
- [ ] **B4** Fan-out bounded: top-K(=6)-by-`updated`, conc ≤4; remaining running swarms shown as "queued"; `plan[]` cached
      so each swarm is detail-fetched ≤once; cap commented.
- [ ] **H1** Detect `_SWARM_BASE` label signature → "Swarm step", never "Claude agent"; keep out of median noise.
- [ ] **H2** Route `D.status∈{done,failed,cancelled}` to RECENT; `clamp(pct,0,100)`.
- [ ] **H3** `curElapsed = clamp(now - swarm.updated, 0, 6*WL_MEDIAN)`; rail → indeterminate.
- [ ] **M1** Interactive targets ≥44px; Cancel spatially separated from toggle.
- [ ] **M2** keydown scoped (WL_OPEN, skip form fields, targeted preventDefault, removed on stop).
- [ ] **M3** `median([])→null`; `WL_MEDIAN` never `NaN`.
- [ ] **L1–L3** doc/UX notes folded in.

**Unchanged from the plan and approved:** the client-side-only/zero-backend-edit thesis, the swarm→`cur_task` join, the
median-rate accuracy model, keyed reconciliation, optimistic controls with `WL_PEND` rollback, the smart-poll/RAF split,
and the §10 lifeline-safety argument (which remains valid **once B4 bounds the fan-out**).
</content>
</invoke>
