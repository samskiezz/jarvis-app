# UNIVERSE_SPEC STAGE 1 — DETAILED ACCEPTANCE CRITERIA & TEST MATRIX

**Plan Reference:** universe_spec_stage1_engineering_plan.md § 10  
**Test Date:** 2026-06-XX (post-build)  
**Tester:** JARVIS Build QA  

---

## SECTION A: P0 — SHIP-BLOCKING CRITERIA (ALL MUST PASS)

### A.1 Database & Backend

**Criterion:** `ont_feature` table exists + is seeded

```
Test: SELECT COUNT(*) FROM ont_feature;
Expected: >= 100 rows
Failure Mode: Table doesn't exist → cannot render universe
Mitigation: Seeding script must complete without errors
```

**Criterion:** `/registry` endpoint responds in < 500ms

```
Test: curl -w "%{time_total}\n" "http://localhost:8095/registry?limit=1000"
Expected: Total time < 0.5s, HTTP 200, valid JSON response
Query: [
  {"id": "sun", "plainLabel": "AI Core", "glbUrl": "...", ...},
  ...
]
Failure Mode: Timeout → universe doesn't load, user sees blank screen
Mitigation: Index on ont_feature.sync_status, cache 30s
```

**Criterion:** `/children` endpoint returns objects ranked by connectivity

```
Test (Manual):
1. Call curl "http://localhost:8095/children?id=Domain:Measurement&limit=14"
2. Parse response → check children are sorted by degree DESC
3. Verify no duplicate IDs in response
4. Check total count matches (for "+K more" label)

Expected Response:
{
  "children": [
    {"id": "meas:123", "label": "...", "degree": 45, ...},
    {"id": "meas:456", "label": "...", "degree": 38, ...},
    ...
  ],
  "total": 200,
  "truncated": true
}

Failure Mode: Returns low-degree nodes first → recursion dead-ends
Mitigation: Use index-backed query with EXISTS(ont_link) semi-join
```

**Criterion:** No unguarded JSON parsing in Python (crashes on malformed props)

```
Test: Manually insert ont_object row with props='INVALID_JSON'
Run: /children?id=<that_object>
Expected: Endpoint returns gracefully, error message in response
Failure Mode: 500 error → lifeline interruptible
Mitigation: Every props access wrapped in try-except, returns {} on error
```

### A.2 Three.js Rendering

**Criterion:** jarvis_live.html loads without JavaScript errors

```
Test:
1. Open Chrome DevTools Console
2. Load http://localhost:8095/jarvis_live.html
3. Wait for 5s (all assets loaded)
Expected: 0 errors, 0 warnings (except third-party)
Actual Log Should Show:
  "Built universe: 100 objects, 20 loaded"
  "Scene rendered at 60 FPS"
Failure Mode: Any uncaught exception → page unusable, voice can't control
Mitigation: Wrap all event handlers in try-catch, guard property access
```

**Criterion:** 20+ objects render visibly at L0 (initial load)

```
Test:
1. Load page, wait for boot animation to complete
2. Screenshot the 3D viewport
3. Count distinct 3D objects (planets, satellites, glowing orbs)
Expected: >= 20 visual objects, colors distinct, labels readable
Performance: >= 30 FPS on test machine (2020 MacBook Air GPU)
Failure Mode: Only 5-10 objects visible → universe looks empty
Mitigation: Preload top-K importance objects (LIMIT 20 ORDER BY importance_score DESC)
```

**Criterion:** Click on object → detail card appears in < 200ms

```
Test Script:
1. Load page, wait for render
2. Record time T0
3. Click on a planet (somewhere in 3D viewport)
4. Measure time T1 when #card element becomes visible
5. Assert (T1 - T0) < 200ms
6. Verify card shows object name, type, actions
Expected: Panel slides up, content appears
Failure Mode: Lag or panel missing → user thinks nothing happened
Mitigation: Precompute card HTML, use requestAnimationFrame for visibility timing
```

**Criterion:** Double-click → fly INTO (recursive descent) works

```
Test Script:
1. Load page, identify a planet with children (via console: systemMap.get('id').isExpandable)
2. Record camera position before double-click
3. Double-click on the planet
4. Wait 1 second (tween animation)
5. Verify:
   - Camera has moved (position changed significantly)
   - Breadcrumb shows new level (1 item added)
   - New objects are visible (children of that planet)
   - No JavaScript errors
Expected: Smooth zoom animation, new objects populate
Failure Mode: Camera doesn't move, or old objects still visible (LOD issue)
Mitigation: Clear visibility of parent on descent (setLevelOpacity), load children before tween
```

**Criterion:** Breadcrumb navigation + "← Back" button work

```
Test Script:
1. Start at L0 (home)
2. Double-click → fly INTO level L1
3. Verify breadcrumb shows: "🏠 > Measurement"
4. Double-click → fly INTO level L2
5. Verify breadcrumb shows: "🏠 > Measurement > Dataset X"
6. Click "← Back" button (or press Esc)
7. Verify:
   - Camera returns to L1 position
   - Breadcrumb reverts: "🏠 > Measurement"
   - L2 objects disappear, L1 objects re-appear
Expected: Smooth back navigation, state consistency
Failure Mode: Breadcrumb doesn't update, flying out takes you to wrong level
Mitigation: Use navStack array, validate length on each pop
```

**Criterion:** AI Core (sun) renders at center without interference

```
Test:
1. Load page
2. Identify the AI Core in 3D (should be glowing orb at center)
3. Verify:
   - Position is (0, 0, 0) or very close
   - Not occluded by other objects
   - Size is dominant (importance 1.0)
   - Visually distinct (different color + glow)
4. Click on it → card shows "AI Core", type "AI Core"
Expected: Clear visual hierarchy, AI Core is "boss" of scene
Failure Mode: Lost among other planets, hard to see
Mitigation: Scale by importance (1.0 = 1.5x size), use emission glow, set far back in render order
```

**Criterion:** pm2 services remain "online" during build + test

```
Test:
1. Before build: pm2 status shows all services online
2. During build: Monitor pm2 logs for errors (pm2 logs jarvis-dashboard)
3. After build: pm2 status shows no NEW restarts
4. Verify: jarvis-tasks + jarvis-dashboard are still responding to requests
Expected: 0 unexpected restarts, dashboard port 8095 still open
Failure Mode: Dashboard crashes (e.g., unguarded exception in /registry) → lifeline down
Mitigation: Every endpoint wrapped in try-catch, timeout guards, query_only PRAGMA
```

---

## SECTION B: P1 — SHIP-READY ACCESSIBILITY CRITERIA

### B.1 2D Fallback Mode

**Criterion:** 2D feature list renders all registry objects

```
Test:
1. Load jarvis_universe_2d.html or toggle mode in main page
2. Verify:
   - Page loads without errors
   - All 100+ objects appear as indented tree
   - Top-level (no parent) objects at indent 0
   - Children indented under parents
3. Count objects in 2D view vs /registry endpoint
Expected: Same count, same hierarchy
Failure Mode: Missing objects, wrong indent, duplicates
Mitigation: Render from same /registry query, recursively walk parent_id
```

**Criterion:** 2D mode supports keyboard navigation (Tab, Enter, Esc)

```
Test:
1. Load 2D view
2. Tab through items → focus ring moves through list
3. On focused item, press Enter → expands children or shows detail
4. Press Esc → collapses current level
Expected: Keyboard-only navigation possible, no mouse required
Failure Mode: Tab doesn't work, Enter doesn't activate
Mitigation: Set role="treeitem", tabindex="0", handle keydown events
```

**Criterion:** Screen reader announces object names + relationships

```
Test (with NVDA or JAWS):
1. Load 2D view
2. Navigate with screen reader
3. Verify announces:
   - Object label ("Measurement Dataset X")
   - Object type ("Asteroid")
   - Parent ("belongs to Measurement Planet")
   - Number of children ("3 children")
Expected: Screen reader provides full context
Failure Mode: Silent objects, no relationship information
Mitigation: ARIA labels, aria-label on every item, aria-expanded for trees
```

### B.2 Reduced-Motion Support

**Criterion:** `prefers-reduced-motion: reduce` disables animations

```
Test:
1. Set OS accessibility: prefer-reduces-motion = ON
2. Load jarvis_live.html
3. Observe:
   - No orbital animations (planets stay static)
   - No particle system rotation
   - No camera tweens (instant jump to target)
   - No morphing face animations
Expected: Static layout, instant transitions, no visual motion
Failure Mode: Animations still play → can trigger vestibular discomfort
Mitigation: Check prefersReducedMotion at top of animation loop, skip updates if true
```

**Criterion:** Without prefers-reduced-motion, animations work normally

```
Test:
1. Turn OFF prefers-reduced-motion in OS
2. Load jarvis_live.html
3. Observe:
   - Orbital animations smooth (objects moving)
   - Camera tweens are animated (not instant)
   - Particle system rotating
Expected: Full visual experience
Mitigation: Preserve existing animation code, only gate on media query
```

### B.3 ARIA & Screen Reader Labels

**Criterion:** All interactive 3D objects have aria-label equivalents

```
Test (Automated):
1. Run axe DevTools on jarvis_live.html
2. Check for unlabeled buttons, links, interactive elements
Expected: 0 violations for ARIA labels, all buttons have accessible names
Failure Mode: Axe reports missing labels
Mitigation: Add aria-label to every clickable group/button
```

---

## SECTION C: P2 — VOICE + AGENT INTEGRATION

### C.1 Agent Tools Available

**Criterion:** Agent can call `universe_search` tool

```
Test:
1. Open agent tools list (server/agent/tools.py)
2. Verify these tools exist:
   - universe_search(query, type_filter)
   - universe_focus(object_id)
   - universe_action(object_id, action)
Expected: Tools callable by Claude agent
Failure Mode: Tools missing → voice commands don't work
```

**Criterion:** Voice command "show me measurements" highlights measurement objects

```
Test:
1. Say "show me measurements" into microphone
2. Agent should:
   - Call universe_search("measurement")
   - Receive list of Measurement objects
   - Call universe_focus() on top result
   - Narrate response
3. Verify:
   - 3D universe highlights measurement planets
   - Camera flies to them
   - Speech response is heard
Expected: Visible + audible feedback
Failure Mode: Command doesn't route to agent, no visual feedback
Mitigation: Wire /chat endpoint to universe intent router
```

**Criterion:** "Expand this" double-clicks in 3D from voice

```
Test:
1. Click a planet to select it
2. Say "expand this"
3. Agent should call flyInto(selectedObject.id)
4. Verify: camera zooms, children appear
Expected: Voice + 3D sync
Failure Mode: No action, or wrong object expanded
```

---

## SECTION D: P3 — MOBILE & TOUCH

### D.1 Touch Gestures

**Criterion:** Pinch-zoom works on touchscreen

```
Test (on iPad/Android):
1. Load jarvis_live.html
2. Pinch outward → zoom in
3. Pinch inward → zoom out
4. Verify smooth response, no lag
Expected: Gesture controls work
Failure Mode: No zoom response, jumpy motion
```

**Criterion:** Tap = click, long-press = right-click

```
Test:
1. Single tap on object → select + card (like click)
2. Long-press (>500ms) on object → context menu
Expected: Familiar mobile interactions
Failure Mode: No feedback or wrong action
```

### D.2 Portrait Layout

**Criterion:** Portrait layout doesn't overlap talk bar

```
Test (on mobile portrait):
1. Load page
2. Open card panel
3. Verify:
   - Card visible and readable
   - Card doesn't overlap #cmd (bottom talk bar)
   - Card doesn't cover action buttons
4. Height check: card + bar ≤ viewport height
Expected: Content visible without scrolling
Failure Mode: Card hidden behind talk bar
Mitigation: Media query sets card width to 95vw, bottom to safe-area value
```

---

## SECTION E: PERFORMANCE METRICS

### E.1 Load Time

**Criterion:** Page load < 3 seconds (before first object visible)

```
Test:
1. Network throttle: "Fast 3G" (Chrome DevTools)
2. Hard reload page (Shift+Cmd+R)
3. Measure: Time from page start to first rendered object visible
Expected: T < 3.0 seconds
Benchmark:
  - HTML parse: 100ms
  - Three.js load: 400ms
  - /registry fetch: 500ms
  - Initial mesh loads: 1500ms
  - Total: ~2.5s
Failure Mode: > 5s → user perceives slowness
```

### E.2 Interaction Latency

**Criterion:** Click → panel appearance < 200ms

Already covered in A.2 above. Retest here.

**Criterion:** Recursive descent (double-click) → new level visible < 500ms

```
Test:
1. Double-click a planet (L0)
2. Measure time until children objects appear in viewport
Expected: T < 500ms
Benchmark:
  - /children fetch: 50ms
  - System instantiation: 100ms
  - Camera tween start: 350ms
  - Total: ~500ms
Failure Mode: > 1s → UI feels sluggish
```

### E.3 Frame Rate

**Criterion:** 60 FPS on desktop, 30 FPS on mobile

```
Test:
1. Open Chrome DevTools → Performance tab
2. Record 10s of interaction (clicks, navigation)
3. Analyze:
   - Desktop (modern GPU): 55-60 FPS (some drops < 50ms acceptable)
   - Mobile (iPad Air): 28-30 FPS (20+ acceptable)
   - No frame drops > 200ms
Expected: Smooth visual experience
Failure Mode: Average < 30 FPS → jank
Mitigation: GPU instancing, LOD for distant objects, scene.children < 100 active
```

### E.4 CPU Usage

**Criterion:** < 10% CPU on idle (no runaway loops)

```
Test:
1. Load page, let it sit for 30s
2. Monitor Activity Monitor (Mac) or Task Manager (Windows)
3. Measure Chrome process CPU usage
Expected: < 10% (mostly sleep)
Failure Mode: > 30% idle → battery drain
Mitigation: Use requestAnimationFrame, no setTimeout loops in animation code
```

---

## SECTION F: REGRESSION TEST CHECKLIST

**Goal:** Verify existing JARVIS features still work (no breakage).

- [ ] Voice recognition still works (say something → transcript appears)
- [ ] Task dock still populates with live tasks (dock appears on right)
- [ ] Chat intent routing still works (/chat endpoint responsive)
- [ ] Dashboard metrics page still shows worker status
- [ ] Task detail panel (existing card) doesn't visually conflict
- [ ] Darkmode/theme toggle still works (color scheme consistent)
- [ ] Battery indicator + system stats still update
- [ ] No new console errors (vs baseline before build)

---

## SIGN-OFF

**Build Acceptance Date:** ___________

**Tester Name:** ___________

**P0 Criteria Met:** ☐ YES ☐ NO (if NO, defer to Stage 2)

**P1 Criteria Met:** ☐ YES ☐ NO

**P2 Criteria Met:** ☐ YES ☐ NO

**P3 Criteria Met:** ☐ YES ☐ NO

**Overall Assessment:** ☐ PASS (ship) ☐ CONDITIONAL PASS (defer P2/P3) ☐ FAIL (fix issues)

**Signature (QA Lead):** ___________
