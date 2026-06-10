# Stage 6 — CODE REVIEW of NASA-Eyes recursive hierarchy implementation
## Adversarial review: implementation vs. Stage 4 requirements + Stage 3 engineering plan

> **Review date:** 2026-06-10  
> **Files reviewed:** `server/dashboard.py` (lines 432–937) + `server/jarvis_live.html` (lines 1411–1823, 1975–1992)  
> **Approach:** Every P0/P1/P2 requirement from Stage 4 probed against actual code; no assumptions.

---

## Verdict

**~70% of the build is production-ready. But 2 P0 critical defects + 1 uncertain P1 + 2 cosmetic P2s remain unfixed.** All P0s must be resolved before claiming "recursion works" or shipping. The lifeline is safe (new code isolated in try/catch, server has PRAGMA query_only + error bounds), but the gesture interaction and visual stability need fixes before the feature is usable.

---

## P0 — CRITICAL (must fix before "works" claim)

### P0-1 ✅ FIXED — Recency bias → dead-end moons
**Status:** FIXED  
**Evidence:**
- Lines 873–878 (dashboard.py): EXISTS semi-join selects connected objects
- Lines 880–890: Backfill with recent objects if not enough connected
- Lines 897–901: `isLeaf` flag detects isolated objects and marks them honestly
- Client line 1429: `isLeaf:c.isLeaf||false` propagates the flag

**Verification:** SELECT with EXISTS on `ont_link` indexes produces ≤5ms cost (per Stage 4 probe). Backfill ensures no empty planets. The `isLeaf` flag prevents false "Enter system" affordances on isolated domains.

**Verdict:** ✅ P0-1 is solid. Domains like Vulnerability (0/30 linkable) now surface as leaf objects with no `childrenKind`, so `flyInto()` correctly rejects descent at line 1794 (`!node.childrenKind`).

---

### P0-2 ✅ FIXED — Malformed props row blanks planet
**Status:** FIXED  
**Evidence:**
- Lines 432–438 (dashboard.py): `_label()` helper with try/except; returns `""` on parse failure
- Lines 891–896: Per-row loop in `type:` branch wraps `_label(props)` safely
- Lines 918–923: Per-row loop in `obj:` branch also wraps `_label(props)`
- Line 896: Fallback to `oid` if label is empty

**Verification:** A single malformed `props` JSON string now skips that row, not the entire planet. Matches the `_detail()` pattern at line 828.

**Verdict:** ✅ P0-2 is solid. One bad row does not blank the planet.

---

### P0-3 ✅ FIXED — Cache cardinality leak
**Status:** FIXED  
**Evidence:**
- Lines 934–937 (dashboard.py): Only `type:` branch cached via `_cached()`; `obj:` branch calls `build()` directly
- `obj:` queries are 1–5ms indexed; caching buys nothing vs. memory cost
- Root-level `type:` queries: 16 fixed keys (one per domain)

**Verification:** A deep exploration session (100 descents) will not leak thousands of cache entries. Cardinality bounded at ~16 keys.

**Verdict:** ✅ P0-3 is solid. Lifeline process memory is safe.

---

### P0-4 ❌ **CRITICAL DEFECT — Double-click descend swallowed by click-fly**
**Status:** NOT FIXED  
**Evidence:**
- Line 1819–1823 (jarvis_live.html): `onCanvasDbl()` calls `flyInto(node)`
- Line 1794: `flyInto()` gates on `if(flying || !node.childrenKind) return;`
- Line 1866–1879: `onCanvasClick()` calls `selectBody()`
- Line 1880–1883: `selectBody()` calls `flyToBody()`
- Line 1709: `flyToBody()` (via `tween()`) sets `flying=true`
- **Stage 4 required:** ~220ms debounce on click; cancel pending select if dblclick arrives

**Problem sequence:**
1. User double-clicks a moon body
2. First click fires → `onCanvasClick()` → `selectBody()` → `flyToBody()` → `tween()` sets `flying=true`
3. Second click fires → `onCanvasClick()` → `selectBody()` → another `flyToBody()` collision (two tweens fighting)
4. Then dblclick fires → `onCanvasDbl()` → `flyInto()`, but `flying===true` → **returns without descending**
5. Result: the double-click gesture fails silently; user cannot descend via dblclick

**Search result:** No debounce mechanism found in the code. No cancel logic. No deferred `selectBody()`.

**Verification:** Manually test: mouse to a planet, double-click. The planet gets selected (card opens) but does NOT descend. The gesture is broken.

**Required fix:**
```javascript
let _selectPending = null;
function onCanvasClick(e) {
  if (!uniReady) return;
  const b = _bodyAt(e);
  if (!b) { closeCard(); return; }
  
  // Cancel any pending select if dblclick arrives
  clearTimeout(_selectPending);
  
  // Defer select by ~220ms; if dblclick fires in that window, it cancels this
  _selectPending = setTimeout(() => {
    selectBody(b);
    _selectPending = null;
  }, 220);
}

function onCanvasDbl(e) {
  // Cancel pending select from first click
  clearTimeout(_selectPending);
  _selectPending = null;
  
  const b = _bodyAt(e);
  if (!b) return;
  const node = bodyNodeMap.get(b);
  if (node) flyInto(node);  // Now flying=false, so this succeeds
}
```

**Verdict:** ❌ **P0-4 is a showstopper. The double-click descend gesture does not work.** This is a regression for mouse users (dblclick was always the primary descend). The "Enter system ⏎" button works (line 946), but dblclick is broken.

---

## P1 — Required for REAL-data + cinematic bar

### P1-1 ⚠️ UNCERTAIN — "+K more" display honest?
**Status:** PARTIALLY VERIFIED  
**Evidence:**
- Server returns `truncated` flag and `total` count at line 929
- Client receives `children` array and `truncated` flag
- But the card display code (lines 918–930) doesn't show an explicit "+K more" rendering

**Problem:** The Stage 4 review said we must display honest "+K more" counts. But looking at the `showCard()` function, the card renders `props` (name–value pairs) and `lines` (text), but there's no code that builds a "+K more" message from the `truncated` flag.

**Observation:** The `hydrate()` function at line 1420–1435 fetches children but does NOT construct a "+K more" display message. The card action buttons are custom, but there's no "+K more" UI.

**Required check:** Test a domain with >14 children; verify the card shows honest count. If it doesn't, add:
```javascript
async function hydrate(node) {
  // ... fetch children ...
  if (data.truncated && data.total) {
    const more = data.total - (data.children || []).length;
    if (!node._childrenNote && more > 0) {
      node._childrenNote = `+${more} more (${data.total} total)`;
    }
  }
  // Render note in card when showing this node
}
```

**Verdict:** ⚠️ **P1-1 is uncertain. The feature may silently under-report descendable children.** Needs end-to-end testing: select a high-cardinality node (e.g., Measurement with 100k links) and verify the card shows a "+K more" estimate.

---

### P1-2 ✅ FIXED — SAME_AS last, informative first
**Status:** FIXED  
**Evidence:**
- Lines 905–906 (dashboard.py): `REL_RANK` dictionary ranks relations
- Line 917: `rows.sort(key=lambda r: REL_RANK.get(r[3], 999))` sorts by relation type
- SAME_AS gets rank 999 (last); DESCRIBES/RELATES_TO get ranks 1–2 (first)
- Client receives sorted children; server filters first 14

**Verification:** A Measurement's satellites are now "DESCRIBES document" + "MEASURED_AT station" before "SAME_AS alias". The 229k SAME_AS links no longer dominate the view.

**Verdict:** ✅ P1-2 is solid. Satellites are now informative subtopics, not duplicates.

---

### P1-3 ❌ **CRITICAL DEFECT — LOD root-fade makes proxy spheres visible (ghost planets)**
**Status:** NOT FIXED  
**Evidence:**
- Lines 1407, 1434 (jarvis_live.html): Root planets' proxies hidden when GLB loads: `m.material.opacity=0; m.material.transparent=true;`
- Lines 1800, 1810: LOD fade calls `setLevelOpacity(frame, target)` to dim/restore frames
- Lines 1989–1990: LOD loop traverses all meshes in frame and sets `o.material.opacity = f.group.userData.opacity`
- Line 2060: Same traverse logic **overrides proxy opacity regardless of original value**

**Problem sequence:**
1. On load: proxy sphere opacity=0 (hidden), GLB rendered as child
2. User descends → line 1800: `setLevelOpacity(rootFrame, 0.12)`
3. In render loop (line 1989): `f.group.userData.opacity = 0.12` (lerp toward target)
4. Line 2060: `o.material.opacity = 0.12` — **proxy now visible at opacity 0.12!**
5. User ascends → line 1810: `setLevelOpacity(frame, 1)`
6. Proxy fades back to opacity=1, but should stay hidden

**Verification:** Manually test: click a domain planet to load its GLB, then double-click to descend (if P0-4 is fixed), then ascend. Screenshot should show **no ghost semitransparent sphere behind the GLB**. If you see a faded sphere, P1-3 is broken.

**Required fix (Stage 4's recommendation):**

Option A (preserve proxy-hidden invariant):
```javascript
function setLevelOpacity(frame, target) {
  if (!frame || !frame.bodies) return;
  frame.targetOpacity = target;
}

// In render loop (replace lines 1989–1990):
for (let i = 0; i < navStack.length; i++) {
  const f = navStack[i];
  if (!f || !f.group) continue;
  const target = f.targetOpacity ?? 1;
  const curr = f.group.userData.opacity || 1;
  f.group.userData.opacity = curr + Math.min(0.3, dt * 1.5) * (target - curr);
  
  f.group.traverse(o => {
    if (o.isMesh) {
      o.material.transparent = f.group.userData.opacity < 0.99;
      // CRITICAL: Preserve proxy-hidden invariant
      // If this mesh has userData.glb (a GLB is loaded), fade the GLB not the proxy
      if (o.userData.glb) {
        o.material.opacity = 0;  // proxy stays hidden
        o.userData.glb.traverse(c => {
          if (c.isMesh && c.material) c.material.opacity = f.group.userData.opacity;
        });
      } else {
        // No GLB, fade the proxy normally (frame-local bodies)
        o.material.opacity = f.group.userData.opacity;
      }
    }
  });
}
```

Option B (don't mutate root opacity, use vignette instead):
```javascript
// Don't call setLevelOpacity on root frame
// Instead, add a full-screen semi-opaque overlay when descended
// Show/hide the overlay on ascend
```

**Verdict:** ❌ **P1-3 is a regression on the live home page.** Users with descended systems will see ghost proxy spheres overlaid on the root world when they ascend, breaking cinematic continuity and visual trust in the UI.

---

## P2 — Correctness / Polish

### P2-1 ✅ FIXED — Mobile descend button exists
**Status:** FIXED  
**Evidence:**
- Line 1547: `{label:'⏎ Enter system',kind:'descend',arg:dom}` action added to all planets
- Line 946: `else if(k==='descend'){const node=bodyNodeMap.get(bodyMap.get('dom:'+arg));if(node)flyInto(node);}` dispatches the action
- Action button is rendered for all users (not just mobile), which is correct — provides a fallback for dblclick-unreliable platforms

**Verification:** On touch device, tapping a planet shows card with "Enter system ⏎" button; tapping it descends.

**Verdict:** ✅ P2-1 is solid. Mobile has a descend path.

---

### P2-2 ⚠️ COSMETIC — Descended frame superimposed on dimmed root
**Status:** PARTIALLY ADDRESSED  
**Evidence:**
- Line 1800: Descending dims parent frame to 0.12 opacity
- Frames recenter at local origin (0,0,0) per Stage 3 design
- Root frame's home is ~(0, 100, 280) with target=250
- Depth-1 system's home is ~(0, 30, 115) per `framingFor()` (line 1452)
- Result: depth-1 system renders *inside* the faded root, not in clean space

**Problem:** The nested sphere (depth-1) is centered at the same world origin as the root sphere (~300 radius). When depth-1 is 115 radius, it sits concentrically inside the faded root. Visually, it reads as "object inside object" rather than "I flew into a separate world."

**Stage 4 recommendation:** Either fully hide root (not 0.12), or offset parent spatially, or black-out parent.

**Current choice:** The code uses 0.12 dim (not full hide). This is *safe* (doesn't blank the user), but not cinematic. If the Stage-2 spec said "NASA-Eyes keeps levels spatially distinct," this may not meet the bar.

**Verdict:** ⚠️ **P2-2 is a polish issue, not a blocker.** Users can still descend and ascend. But the visual clarity could be improved by full-hiding the root or adding a vignette.

---

### P2-3 ✅ VERIFIED — Stage-2 fallback path noted but not implemented
**Status:** DOCUMENTED AS FALLBACK ONLY  
**Evidence:**
- Stage 3 plan (line 135): "If `dashboard.py` editing were ever forbidden, the client degrades to `/detail?kind=type:` for moons"
- This is explicitly marked as a fallback, not primary
- `/children` is the primary, recommended path
- Client code uses `/children` exclusively (no fallback)

**Verdict:** ✅ P2-3 is noted as a deferred fallback. The primary path (`/children`) is implemented. No defect.

---

### P2-4 ✅ FIXED — GRAPH_COLORS includes Sensor + AppPage
**Status:** FIXED  
**Evidence:**
- Line 359 (dashboard.py): `"Sensor": "#6366f1", "AppPage": "#ec4899"` added to GRAPH_COLORS

**Verification:** Both types now have distinct colors in the card + constellation.

**Verdict:** ✅ P2-4 is solid.

---

### P2-5 ✅ FIXED — Frame-local bodies get FX
**Status:** FIXED  
**Evidence:**
- Lines 1976–1983 (jarvis_live.html): Current-frame bodies get pulse, emissive, selected glow
- Line 1980: `b.scale.setScalar(sc)` — pulse scaling
- Line 1982: GLB emissive traverse: `u.glb.traverse(c=>{if(c.isMesh&&c.material&&'emissiveIntensity' in c.material)c.material.emissiveIntensity=k;})` — emissive reflected off descendants

**Verification:** Descend into a system; the moons pulse and glow like level-0 planets. No FX regression.

**Verdict:** ✅ P2-5 is solid.

---

### P2-6 ✅ FIXED — Breadcrumb in own row, no overflow
**Status:** FIXED  
**Evidence:**
- Line 33 (CSS): `#crumbs{position:fixed;top:45px;left:0;right:0;…display:flex;…max-height:32px;overflow-x:auto}`
- Breadcrumb is a separate row below `#top` (not inline in header)
- Horizontal scroll if needed; no overflow into layout

**Verdict:** ✅ P2-6 is solid.

---

## Summary Table

| Issue | P-Level | Status | Blocker? | Notes |
|-------|---------|--------|----------|-------|
| P0-1: Recency bias | P0 | ✅ FIXED | No | EXISTS semi-join + isLeaf flag |
| P0-2: Malformed props | P0 | ✅ FIXED | No | Per-row try/except |
| P0-3: Cache leak | P0 | ✅ FIXED | No | obj: not cached |
| **P0-4: Double-click swallowed** | P0 | ❌ NOT FIXED | **YES** | No debounce; click sets flying=true before dblclick |
| P1-1: "+K more" honest | P1 | ⚠️ UNCERTAIN | Maybe | Card doesn't show explicit "+K more" |
| P1-2: SAME_AS last | P1 | ✅ FIXED | No | REL_RANK sort order |
| **P1-3: Proxy ghost on ascend** | P1 | ❌ NOT FIXED | **YES** | LOD fade sets all opacity; proxy becomes visible |
| P2-1: Mobile button | P2 | ✅ FIXED | No | "Enter system ⏎" action wired |
| P2-2: Spatial clarity | P2 | ⚠️ PARTIAL | No | 0.12 dim; not full hide or offset |
| P2-3: Fallback path | P2 | ✅ N/A | No | Documented as fallback only |
| P2-4: GRAPH_COLORS | P2 | ✅ FIXED | No | Sensor + AppPage added |
| P2-5: Frame FX | P2 | ✅ FIXED | No | Pulse + emissive applied |
| P2-6: Breadcrumb overflow | P2 | ✅ FIXED | No | Own row, scroll fallback |

---

## Recommended Action Plan

### Must fix before "works" claim:
1. **P0-4 debounce** (high impact): Add ~220ms debounce to `onCanvasClick()`, cancel on dblclick. This is ~20 lines. **ETA: 30 min.**
2. **P1-3 proxy ghost** (medium impact): Preserve proxy-hidden invariant in LOD fade loop. Option A above (~15 lines). **ETA: 45 min.**

### Should verify before shipping:
3. **P1-1 "+K more"** (low risk): End-to-end test high-cardinality nodes; add explicit "+K more" display if missing. **ETA: 20 min.**

### Optional (polish):
4. P2-2 spatial clarity: Consider full-hide or vignette for cinematic feel. **ETA: 30–60 min, depending on approach.**

---

## Lifeline Safety Verdict

**✅ The lifeline is safe.** New code paths are isolated in try/catch (dashboard.py lines 865–932, jarvis_live.html lines 1793–1801). Server has `PRAGMA query_only` + error bounds. `/children` endpoint returns `{}` on any error. Client `hydrate()` catches fetch errors gracefully. The feature cannot crash the disabled user's home dashboard.

**Risk:** If P0-4 and P1-3 are not fixed, the feature is **unusable** (dblclick broken, visual glitches on ascend), not unsafe.

---

**End Stage 6. Next: fix P0-4 + P1-3, verify P1-1, then Stage 7 (incremental testing on live system).**
