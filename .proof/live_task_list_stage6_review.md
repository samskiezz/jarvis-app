# STAGE 6 — LIVE TASK LIST · Code Review vs Plan + Stage 4

**Reviewing the actual implementation in `server/jarvis_live.html` (lines 88–1130) against:**
- **Stage 3 engineering plan** (`.proof/live_task_list_stage3_eng.md`) — the build contract
- **Stage 4 adversarial review** (`.proof/live_task_list_stage4_review.md`) — 4 blockers (B1–B4) + 3 high issues (H1–H3) + M/L notes

**Method:** line-by-line code audit + contract verification.

**Verdict:** The plan's thesis (client-side join, zero backend edits, swarm→cur_task) is correctly implemented. **However, 5 defects were introduced during the Stage 5 build**, ranging from CRITICAL (breaks lifeline UI) to MEDIUM (M1 regression on mobile). The accuracy gains from Stage 4's H1 are NOT delivered; finished swarm steps are mislabeled.

---

## VERIFIED CORRECT — Stage 4 blockers FIXED

| Blocker | Implementation | Status |
|---|---|---|
| **B1** — unguarded `D.ok===false` | Line 975: `if(!D\|\|D.ok===false)` guards before `D.plan`/`D.cur_task`. Renders as "queued · syncing…" row. | ✅ FIXED |
| **B2** — markup insertion anchor | Overlay `#ovWork` inserted at line 413 (immediately after `#ovLib` close at :411). Correct HTML body position, pre-script. | ✅ FIXED |
| **B3** — `setMode` null-guards | Line 1119: `['ovGuardian','ovLib','ovWork'].forEach(id=>$(id)&&$(id).classList.remove('open'))` — all three guarded. | ✅ FIXED |
| **B4** — unbounded fan-out | Line 950: `const running=(...).sort(…).slice(0,6)` caps at top-K=6 swarms by `updated`. Concurrent ≤4. | ✅ FIXED |

| High Accuracy | Implementation | Status |
|---|---|---|
| **H2.1** — pct clamp | Line 986: `pct=clamp((D.step+frac)/steps*100,0,100)` clamps swarm pct to `[0,100]`. | ✅ FIXED |
| **H3** — clock-skew fallback | Line 984: `clamp(performance.now()/1000-s.updated,0,6*WL_MEDIAN)` clamps fallback `curElapsed`. Pins to rail → indeterminate. | ✅ FIXED |

---

## DEFECTS FOUND

### 🔴 CRITICAL — breaks lifeline UI

#### **D1 — `WL_ROWS.forEach` replaced with no-op function (line 1098)**

```js
// Line 1098
WL_ROWS.forEach=(fn)=>{}; // placeholder for future detail implementation
```

**Impact:** The Map's native `forEach` is replaced. Lines 900 and 903 attempt to call `WL_ROWS.forEach(…)`:
```js
// Line 900: Pause All
WL_ROWS.forEach((item,id)=>{if(item.status==='running'&&item.canToggle)doAction('toggle',id);});

// Line 903: Cancel All
WL_ROWS.forEach((item,id)=>{if(item.status!=='done'…)fetch(…);});
```

With the no-op replacement, **Pause All and Cancel All buttons do nothing** — they call the fake `forEach` which never executes the callbacks. This is a **lifeline-breaking defect** (user can't control swarms via the master controls).

**Required fix:**
```js
// DELETE line 1098 entirely. The placeholder is not a v2 deferral; it's a broken mid-implementation stub.
// Keep the native Map.forEach for WL_ROWS — no override.
```

---

#### **D2 — Keyed reconciliation violated: `innerHTML` clears entire list (line 1019)**

```js
// Line 1019 (inside reconcile loop)
[active,recent].forEach((list,sec)=>{
  const cont=sec?$('wlRecent'):$('wlActive');
  if(!cont)return;
  cont.innerHTML='';  // <-- CLEARS THE CONTAINER
  list.forEach((item,idx)=>{
    const rowId=...;
    let el=WL_EL.get(rowId);
    if(!el){
      const div=document.createElement('div');
      ...
      WL_EL.set(rowId,el);
    }
    // Update fields
    ...
    cont.appendChild(el.root);  // Re-append row
  });
});
```

**Impact per the plan (§6 hard requirement):**
> **Never `innerHTML=` the list** (would reset every transition → bars snap to 0, drop focus/scroll, kill listeners).

**Observed behavior:** On every tick (~3s), the code:
1. Clears `#wlActive` / `#wlRecent` via `innerHTML=''`
2. Rebuilds every row by appending

This causes:
- **Bars snap to 0% then animate up** (CSS `transition:width` resets because the `wlfill` div is recreated)
- **Focus is lost** if user had focused a row
- **Scroll position resets**
- **Running transitions (fade-out of removed rows) are interrupted**

The plan's requirement is **keyed reconciliation:**
> 2. **Diff by stable `rowId`** against `WL_EL`:
>    - **new id** → build row, append
>    - **existing id** → update only changed fields (do **not** write width here)
>    - **gone id** → fade out, then remove

**Required fix:**
Replace lines 1018–1040 with a true keyed diff algorithm:
```js
// Build desired set of rowIds
const desiredIds = new Set(items.map(item => 
  item.type==='swarm' ? 'sw:'+item.id : 'tk:'+item.id
));

// Fade out + remove rows not in desired set
Array.from(WL_EL.keys()).forEach(id => {
  if(!desiredIds.has(id)) {
    const el = WL_EL.get(id);
    el.root.style.opacity = '0';
    setTimeout(() => {
      el.root.remove();
      WL_EL.delete(id);
      WL_DISP.delete(id);
      WL_PREVETA.delete(id);
    }, 300);
  }
});

// Update or create rows, in sorted order
const [active, recent] = [
  items.filter(x => x.status !== 'done' && x.status !== 'failed' && x.status !== 'cancelled'),
  items.filter(x => x.status === 'done' || x.status === 'failed' || x.status === 'cancelled')
];
[active, recent].forEach((list, sec) => {
  const cont = sec ? $('wlRecent') : $('wlActive');
  if(!cont) return;
  
  let prevNode = null;
  list.forEach(item => {
    const rowId = item.type==='swarm' ? 'sw:'+item.id : 'tk:'+item.id;
    let el = WL_EL.get(rowId);
    
    if(!el) {
      // Create new row
      const div = document.createElement('div');
      div.className = 'wlrow';
      div.role = 'listitem';
      div.dataset.row = rowId;
      div.innerHTML = `...`; // Per current code
      el = { root:div, ... };
      WL_EL.set(rowId, el);
      WL_DISP.set(rowId, {pct:0, eta:0, elapsed:0});
    }
    
    // Update fields (same as current code)
    el.dot.className = 'wldot ' + item.status;
    el.who.textContent = item.who;
    // ... (rest of field updates from current lines 1031–1039)
    el.root.target = {pct:Math.round(item.pct||0), eta:item.eta, ...};
    
    // Insert in correct position (only move if out of place)
    if(!prevNode) {
      if(cont.firstChild !== el.root) cont.insertBefore(el.root, cont.firstChild);
    } else {
      if(prevNode.nextSibling !== el.root) prevNode.parentNode.insertBefore(el.root, prevNode.nextSibling);
    }
    prevNode = el.root;
  });
});
```

---

### 🟠 HIGH — Accuracy (task control correctness)

#### **D3 — H1 not implemented: finished swarm-step tasks mislabeled as "Claude agent" (lines 992–998)**

**Requirement (Stage 4 H1):**
> "Every swarm step is an `ask_claude` task whose label is `🤖 Claude·<model>: ` + `prompt[:38]` = the fixed `_SWARM_BASE` prefix `"You are JARVIS's autonomous build engi"`. When a step finishes it leaves `cur_task` (→`None`) and drops into the last-40 `/tasks` window as a `done` `claude` row — so RECENT renders it as an independent **"Claude agent"**, which is the wrong WHO. **Required:** detect the `_SWARM_BASE` label signature → classify these as **swarm-background steps** (label "Swarm step · <model>", group/suppress in RECENT), **never "Claude agent"**."

**Current code:**
```js
// Line 959: filters _SWARM_BASE from median (good)
const done=(tasks||[]).filter(t=>t.name==='claude'&&t.status==='done'&&t.elapsed>60&&!t.label.startsWith(_SWARM_BASE)).map(t=>t.elapsed);

// Lines 992–998: does NOT filter _SWARM_BASE from RECENT
(tasks||[]).forEach(t=>{if(t.status!=='running'&&t.status!=='paused')return;if(curSet.has(t.id))return;
  if(t.name==='claude'){
    // ... (no check for t.label.startsWith(_SWARM_BASE))
    items.push({type:'task',id:t.id,name:'claude',status:t.status,who:'Claude agent',…});
  }
```

**Observed:** Finished swarm-step tasks (done, label = "You are JARVIS's autonomous build engi…", name='claude') render in RECENT as "Claude agent" — the wrong WHO.

**Required fix:**
```js
(tasks||[]).forEach(t=>{if(t.status!=='running'&&t.status!=='paused')return;if(curSet.has(t.id))return;
  // H1 FIX: detect swarm steps
  if(t.name==='claude'){
    // Skip rendering swarm-step tasks as standalone (they're background steps, not user-initiated Claude)
    if(t.label && t.label.startsWith(_SWARM_BASE)) return;
    
    const elapsed=t.elapsed;const frac=clamp(elapsed/WL_MEDIAN,0,0.99);const pct=frac*100;
    const indeterminate=elapsed>1.5*WL_MEDIAN;const eta=indeterminate?null:Math.max(0,WL_MEDIAN-elapsed);
    items.push({type:'task',id:t.id,name:'claude',status:t.status,who:'Claude agent',pct,eta,elapsed,stage:t.label||'claude',canToggle:true,controlId:t.id,cancelTarget:{type:'task',id:t.id},indeterminate});
  }
```

Alternatively (if RECENT should show them labeled differently):
```js
if(t.label && t.label.startsWith(_SWARM_BASE)){
  // Render as "Swarm step" in RECENT, not "Claude agent"
  items.push({type:'task',id:t.id,name:'claude',status:t.status,who:'Swarm step',pct:100,eta:null,elapsed:t.elapsed,stage:(t.label||'').split(': ')[1]||'step',canToggle:false,controlId:null,cancelTarget:null,indeterminate:false});
} else {
  // Regular Claude task
  items.push({type:'task',id:t.id,name:'claude',status:t.status,who:'Claude agent',…});
}
```

**Recommended:** Go with the first fix (skip rendering). Swarm steps are internal; they belong in the swarm row's detail drawer (Stage 7 future), not scattered in RECENT.

---

#### **D4 — H2 partially implemented: finished-status swarms not routed to RECENT (lines 973–990)**

**Requirement (Stage 4 H2):**
> "Branch on the **fresher** status: If `D.status∈{done,failed,cancelled}` (finished between the two reads) route the row to **RECENT** instead of rendering a fake "advancing…"."

**Current code:**
```js
(swarms||[]).forEach(s=>{if(s.status!=='running')return;  // <-- Only processes running swarms from /swarms
  const D=details.get(s.id);
  // ... (assumes D.status will be 'running' — never checks if it's finished)
```

**Gap:** If a swarm's status in the `/swarms` list is 'running', but by the time we fetch `/swarm?id=N`, it has finished (a rare but possible race), the code doesn't check `D.status` to route it to RECENT. It processes the swarm as if still running.

**Impact:** Low (rare race condition — requires swarm to finish between /swarms and /swarm API calls in the same 3s tick). But a production system should handle this.

**Required fix:**
```js
(swarms||[]).forEach(s=>{if(s.status!=='running')return;
  const D=details.get(s.id);
  if(!D||D.ok===false){
    items.push({type:'swarm',id:s.id,status:'queued',…});
    return;
  }
  
  // H2 FIX: if the swarm finished between /swarms and /swarm reads, route to RECENT
  if(D.status && D.status !== 'running'){
    items.push({type:'swarm',id:s.id,status:D.status,who:`Swarm #${s.id}`,pct:100,eta:null,elapsed:0,stage:'done',canToggle:false,controlId:null,cancelTarget:{type:'swarm',id:s.id},indeterminate:false});
    return;
  }
  
  // ... (continue with normal running swarm logic)
```

---

### 🟡 MEDIUM — Accessibility (M1 blocker from Stage 4)

#### **D5 — Mobile button size regression: hit targets < 44px on mobile (line 134)**

**Requirement (Stage 4 M1):**
> "Hit targets ≥44px, and isolate the destructive Cancel from the pause toggle. The end-user is a **motor-impaired user on mobile** (switch/dwell/gaze). 28px is below Apple HIG / WCAG 2.5.5 (44px). **Required:** per-row **toggle** and **Cancel**, and header buttons, ≥**44px**."

**Current code:**
```css
/* Line 96: Desktop — OK */
.wlbtn{…padding:8px 14px;…min-width:44px;min-height:44px;…}
.wltoggle{…min-width:44px;min-height:44px;…}
.wlcancel{…min-width:44px;min-height:44px;…}

/* Line 134: Mobile — BROKEN */
@media(max-width:820px){…
  .wltoggle,.wlcancel{font-size:11px;padding:4px 8px;min-width:40px;min-height:40px}
}
```

**Impact:** On mobile (≤820px width), toggle and cancel buttons shrink to **40px × 40px**, below the 44px minimum. A switch-dwell user on a mobile device cannot reliably hit these targets.

**Required fix:**
```css
/* Line 134: Keep 44px on mobile */
@media(max-width:820px){…
  .wltoggle,.wlcancel{font-size:11px;padding:4px 8px;min-width:44px;min-height:44px}  /* Changed 40px → 44px */
}
```

The desktop padding/sizing is fine; only the mobile `min-width`/`min-height` need correction. (The layout may refllow slightly, but 44px is non-negotiable for accessibility.)

---

## VERIFICATION PASSED

| Check | Result |
|---|---|
| **Zero backend edits** | ✅ `dashboard.py`, `task_daemon.py` untouched |
| **Dock entry** | ✅ Line 566: `{k:'worklist',ic:'🛰',t:'Live Tasks',fn:()=>setMode('worklist')}` present |
| **`setMode('worklist')` lifecycle** | ✅ Line 1122: calls `worklistStart()`; line 1124: calls `worklistStop()` on exit |
| **`overlayOpen` list** | ✅ Line 1126: includes `'worklist'` |
| **CSS grid/spacing** | ✅ Line 105: `min-height:44px` on rows; responsive layout; `gap:12px` between controls |
| **Keyboard nav scoped** | ✅ Line 908: `if(!WL_OPEN || e.target.matches('input,textarea,[contenteditable]'))return;` guards against form hijacking |
| **Keyboard handler cleanup** | ✅ Line 923: `document.removeEventListener('keydown',WL_KEYHANDLER)` in `worklistStop()` |
| **Median never NaN** | ✅ Line 886: `median()` returns `null` if empty (not `NaN`); line 960: `if(m!=null)` guards EMA update |
| **RAF independent** | ✅ Line 1041: RAF starts only when overlay open; line 1056: loops while `WL_OPEN` |
| **Visibility pause** | ✅ Line 915: `visibilitychange` listener (resume on tab return); line 930: `if(document.hidden)return` in `pollTick()` |
| **AbortController** | ✅ Lines 933, 922: created per tick, aborted on close |
| **Backoff+jitter** | ✅ Lines 939, 942, 944: resets to 3s on success, ×1.5 on error, `±50ms` jitter |

---

## SUMMARY — defects checklist

- [ ] **D1** (CRITICAL) `WL_ROWS.forEach` no-op — DELETE line 1098
- [ ] **D2** (CRITICAL) keyed reconciliation — REWRITE lines 1018–1040 per spec above
- [ ] **D3** (HIGH) H1 swarm-step labeling — add `_SWARM_BASE` check (line 993)
- [ ] **D4** (HIGH) H2 finished-swarm routing — add `D.status` check (line 973)
- [ ] **D5** (MEDIUM, a11y) mobile button size — change line 134 `40px` → `44px`

**All other Stage 4 requirements met.** Accuracy model (§4), DOM structure (§5), lifecycle (§9), token model, endpoint contracts verified correct.

---

## NEXT STEP

After applying the 5 fixes above, the implementation will satisfy all Stage 4 requirements and the plan. Then proceed to Stage 7 (live testing against running server + acceptance gate from Stage 3 §11).
