# JARVIS UI — Remediation Guide
## Critical Fixes & Enhancements (A-to-Z Deviations)

**Last Updated**: June 12, 2026  
**Status**: READY TO IMPLEMENT  
**Priority Level**: Critical (1), High (2), Medium (3), Low (4)

---

## Issue #1: Panel Resize Toggle Too Small (44×44px Required)

**Priority**: 🔴 **CRITICAL** — iOS HIG violation, accessibility failure

**Current Implementation** (WRONG):
```css
.gp-tog {
  width: 22px;
  height: 16px;
  flex: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
```

**Problem**: 22×16px is 73% below the 44px minimum touch target.

**Fix Option A** (Recommended): Make entire header tappable
```css
.gpanel .gp-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 13px;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid rgba(41,231,255,.14);
  background: linear-gradient(90deg,rgba(41,231,255,.08),transparent);
  
  /* NEW: Ensure full header is 44px minimum height */
  min-height: 44px;
  transition: all var(--duration-quick);
  
  /* Make entire header clickable for toggle */
  position: relative;
}

/* NEW: Hide visual toggle button, use header click instead */
.gp-tog {
  width: 22px;
  height: 16px;
  /* ... existing ... */
  pointer-events: none; /* Let parent header handle click */
}
```

**Fix Option B** (Alternative): Increase toggle to 44×44px
```css
.gp-tog {
  width: 44px;
  height: 44px;
  flex: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 12px; /* Added padding */
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  border-radius: var(--radius-sm);
  transition: all var(--duration-quick);
  
  /* Touch feedback */
}

.gp-tog:hover {
  background: var(--glass-secondary);
}

.gp-tog:active {
  transform: scale(0.95);
}
```

**Recommended Fix**: **Option A** (header is already grabbable; making it toggle zone is more efficient)

**Location in File**: Line ~470 (`.gp-tog` CSS)

---

## Issue #2: Dock Icon Radius 14px Should Be 16px (Spec Compliance)

**Priority**: 🟢 **LOW** — Visual consistency, not functional

**Current** (MINOR DEVIATION):
```css
#dock .di .gly {
  width: 46px;
  height: 46px;
  border-radius: 14px;  /* ← Should be 16px per iOS HIG */
  /* ... */
}
```

**iOS 18 Standard**: 16px radius for primary components  
**Current JARVIS**: 14px (inconsistent with design system)

**Fix**:
```css
#dock .di .gly {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-lg);  /* ← Use design token (16px) */
  /* ... */
}
```

**Justification**: `var(--radius-lg)` is already defined as 16px and used everywhere else.

**Location in File**: Line ~388 (`#dock .di .gly`)

---

## Issue #3: Mini Buttons 40px Height Should Be 44px Minimum (Touch HIG)

**Priority**: 🟡 **MEDIUM** — Touch accessibility, mobile

**Current** (BELOW MINIMUM):
```css
.mini {
  font-size: 10px;
  font-weight: 700;
  padding: 8px 13px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-line);
  background: var(--glass-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--duration-quick);
  display: flex;
  align-items: center;
  justify-content: center;
  
  min-height: 40px;  /* ← Should be 44px */
}
```

**iOS 18 HIG**: Minimum 44×44px touch targets

**Fix**:
```css
.mini {
  /* ... existing ... */
  min-height: 44px;      /* ← Changed from 40px */
  min-width: 44px;       /* ← Add for square safety */
  padding: 10px 14px;    /* ← Increased padding slightly */
}
```

**Mobile Override** (keep at 40px if absolutely necessary):
```css
@media(max-width:560px){
  .mini {
    min-height: 44px;  /* Still 44px on mobile */
    min-width: 44px;
  }
}
```

**Location in File**: Line ~220-225 (`.mini` CSS)

---

## Issue #4: Panel Blur 18px Should Be 14px Or Documented (Consistency)

**Priority**: 🟢 **LOW** — Code consistency, not functional

**Current** (INTENTIONAL DEVIATION):
```css
.gpanel {
  position: fixed;
  z-index: 18;
  width: 248px;
  max-height: calc(50vh - 70px);
  overflow: hidden;
  border-radius: 18px;
  padding: 0;
  color: var(--tx);
  background: var(--glass);
  border: 1px solid var(--ln);
  backdrop-filter: blur(18px) saturate(1.22);  /* ← 18px hardcoded */
  box-shadow: var(--shadow-z3), 0 0 34px rgba(41,231,255,.10);
  /* ... */
}
```

**Design System Standard**: `var(--blur-medium)` = 14px

**Option A** (Standardize):
```css
.gpanel {
  /* ... */
  backdrop-filter: var(--blur-medium) saturate(1.22);  /* ← Use variable */
  /* ... */
}
```

**Option B** (Keep intentional, document it):
```css
.gpanel {
  /* ... */
  /* NOTE: Panel blur is intentionally 18px (vs 14px standard)
     for stronger visual hierarchy in secondary surfaces.
     This is brand enhancement, not spec deviation. */
  backdrop-filter: blur(18px) saturate(1.22);
  /* ... */
}
```

**Recommendation**: **Option A** for consistency; add comment if Option B is chosen.

**Location in File**: Line ~449-460 (`.gpanel` CSS)

---

## Issue #5: Button `:active` Should Use Spring Physics (Animation Consistency)

**Priority**: 🟢 **LOW** — Polish, not critical

**Current** (PARTIAL IMPLEMENTATION):
```css
.tbtn:active {
  transform: scale(0.98);  /* ← No spring easing */
}

.send:active {
  transform: scale(0.95) translateZ(0);  /* ← No spring easing */
}

.mini:active {
  transform: scale(0.95);  /* ← No spring easing */
}
```

**iOS 18 Standard**: All interactions use spring physics

**Fix** (Optional enhancement):
```css
.tbtn:active {
  transform: scale(0.98);
  transition: transform 120ms var(--spring-standard);
}

.send:active {
  transform: scale(0.95) translateZ(0);
  transition: transform 120ms var(--spring-standard);
}

.mini:active {
  transform: scale(0.95);
  transition: transform 120ms var(--spring-standard);
}

#mic:active {
  transform: scale(0.95);
  transition: transform 120ms var(--spring-standard);
}
```

**Reasoning**: Tiny spring animation on release feels more polished than instant.

**Location in File**: Lines ~139-142, ~221, ~235, ~278 (`:active` states)

---

## Issue #6: Tablet Layout Should Collapse Panels into Drawer (UX Gap)

**Priority**: 🟡 **MEDIUM** — User experience, tablet optimization

**Current** (PARTIAL):
```css
@media(max-width:1024px) and (min-width:821px){
  #top{gap:10px;padding:12px 16px;}
  #search{width:min(240px,35vw);}
  .tbtn{padding:9px 14px;font-size:10px;min-height:40px;}
  .gpanel{width:40vw;max-height:32vh;}  /* ← Panels compress, don't collapse */
  .gpanel.mid{width:42vw;}
  .gpanel.full{width:45vw;}
  /* ... */
}
```

**Problem**: Panels stay visible but cramped; user can't maximize world view.

**Enhancement** (Add):
```css
@media(max-width:1024px) and (min-width:821px){
  /* ... existing ... */
  
  /* NEW: Add toggle to collapse panels */
  #pInfra, #pPipe, #pKnow, #pFab {
    transition: opacity var(--duration-std) var(--spring-standard),
                visibility var(--duration-std),
                transform var(--duration-std) var(--spring-standard);
  }
  
  /* Collapsed state (JavaScript sets this class) */
  #pInfra.collapsed,
  #pPipe.collapsed,
  #pKnow.collapsed,
  #pFab.collapsed {
    opacity: 0;
    visibility: hidden;
    transform: translateX(-20px);
    pointer-events: none;
  }
  
  /* Tab drawer visible state */
  .panel-tabs {
    position: fixed;
    left: 12px;
    top: 68px;
    z-index: 18;
    display: flex;
    gap: 6px;
    flex-direction: column;
  }
  
  .panel-tab {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: var(--glass-secondary);
    border: 1px solid var(--border-line);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    transition: all var(--duration-quick);
  }
  
  .panel-tab:hover {
    background: var(--glass-primary);
    box-shadow: 0 0 12px rgba(41,231,255,.3);
  }
}
```

**Location in File**: Line ~523-552 (tablet media query) — Add above closing `}`

---

## Issue #7: Hamburger Menu CSS Ready, JavaScript Pending

**Priority**: 🟡 **MEDIUM** — JavaScript implementation

**Current CSS** (READY):
```css
.tbtn { display: flex; /* ... */ }
.tbtn.hamburger { display: flex; } /* Visible on mobile */
.tbtn:not(.hamburger) { display: none; } /* Hidden on mobile */

@media(max-width:560px){
  .tbtn { display: none; }  /* Hide Run/Pause/Stop/Sleep */
  .tbtn.hamburger { display: flex; }  /* Show hamburger */
}
```

**Missing** (JavaScript):
1. Hamburger button HTML element
2. Menu dropdown/modal
3. Click handler to show Run/Pause/Stop/Sleep
4. Close handler

**Fix Template** (JavaScript needed):
```javascript
// Add to jarvis_live.html <script> section
const hamburger = document.querySelector('.tbtn.hamburger');
const menu = document.querySelector('.hamburger-menu');

hamburger.addEventListener('click', function(e){
  e.stopPropagation();
  menu.classList.toggle('open');
});

document.addEventListener('click', function(){
  menu.classList.remove('open');
});
```

**Location in File**: CSS ready at line ~534 (mobile media query); needs JavaScript

---

## Issue #8: Quick Action Priority Menu (P0/P1) CSS Ready, JavaScript Pending

**Priority**: 🟡 **MEDIUM** — JavaScript implementation

**Current CSS** (READY):
```css
.mini.p0 { display: inline-flex; }  /* Always visible */
.mini.p1 { display: none; }         /* Hidden, show in menu */
```

**Missing** (JavaScript):
1. Define P0 (priority 0): Image, Status, Access, ARCHON
2. Define P1 (priority 1): 3D, Control, Guardian, Studio
3. "More" button to show P1
4. Menu overlay

**Quick Fix** (Mark buttons manually):
```html
<!-- In HTML talk bar -->
<button class="mini p0">🎨 Image</button>
<button class="mini p0">🔊 Status</button>
<button class="mini p0">🔓 Access</button>
<button class="mini p0 archon">⚡ ARCHON</button>

<button class="mini p1" style="display:none;">🧊 3D GLB</button>
<button class="mini p1" style="display:none;">📲 Control</button>
<button class="mini p1" style="display:none;">🛡 Guardian</button>
<button class="mini p1" style="display:none;">🖼 Studio</button>

<button class="mini-more">⋯ More</button>
```

**JavaScript**:
```javascript
const moreBtn = document.querySelector('.mini-more');
const p1Actions = document.querySelectorAll('.mini.p1');

moreBtn.addEventListener('click', function(){
  p1Actions.forEach(btn => {
    btn.style.display = btn.style.display === 'none' ? 'inline-flex' : 'none';
  });
});
```

**Location in File**: HTML at line ~762 (talk bar); CSS ready

---

## Issue #9: Data Sync Verification 30s Ticker (Backend Integration)

**Priority**: 🟡 **MEDIUM** — Backend implementation

**Current Status**: ✅ Spec documented, 🔴 Backend not implemented

**What's Done**:
- Spec written in `UI_MODERNIZATION_MASTER_SPEC.md`
- CSS for "last updated" display ready
- Frontend ready to accept data

**What's Needed** (Backend):
```javascript
// Server endpoint: GET /metrics
// Returns: { infrastructure, pipelines, knowledge, inference, timestamp }
// Frequency: Every 30 seconds
// Accuracy: Live data, no stale cache

setInterval(() => {
  const metrics = getSystemMetrics();  // Real metrics, not fake
  io.emit('metrics:update', {
    data: metrics,
    timestamp: Date.now(),
    freshness: 'live'
  });
}, 30000);
```

**Frontend Validation** (add to HTML):
```javascript
let lastMetricsUpdate = Date.now();

function updateMetrics(data) {
  lastMetricsUpdate = Date.now();
  
  // Update all panels
  document.querySelector('#pInfra .gp-body').innerHTML = renderMetrics(data.infrastructure);
  document.querySelector('#pPipe .gp-body').innerHTML = renderMetrics(data.pipelines);
  document.querySelector('#pKnow .gp-body').innerHTML = renderMetrics(data.knowledge);
  document.querySelector('#pFab .gp-body').innerHTML = renderMetrics(data.inference);
  
  // Show freshness indicator
  showFreshnessIndicator('live');
}

// Warn if data >35s old
setInterval(() => {
  const age = Date.now() - lastMetricsUpdate;
  if (age > 35000) {
    showFreshnessIndicator('stale');
  }
}, 5000);
```

**Location in File**: Backend only (server/jarvis_live.html is frontend)

---

## Issue #10: Low-Power Mode Blur Conditional (Backend Integration)

**Priority**: 🟢 **LOW** — Optional battery optimization

**Current Status**: ✅ CSS media query ready, 🔴 Backend detection not implemented

**CSS Ready** (in file):
```css
@media(prefers-reduced-data:reduce){
  #dock .dockRail { backdrop-filter: none; }
  #crystal::before { animation: none; }
  #mic.live { animation: none; }
}
```

**What's Needed** (JavaScript):
```javascript
// Detect low-power mode
const isLowPowerMode = navigator.getBattery && 
  navigator.getBattery().then(battery => battery.level < 0.2);

// Or use new Battery API
navigator.getBattery().then(battery => {
  if (battery.level < 0.2) {
    document.documentElement.style.setProperty('--blur-medium', 'none');
  }
  
  battery.onlevelchange = function() {
    if (this.level < 0.2) {
      document.documentElement.style.setProperty('--blur-medium', 'none');
    } else {
      document.documentElement.style.setProperty('--blur-medium', 'blur(14px)');
    }
  };
});
```

**Location in File**: Frontend JavaScript (add to `<script>` section)

---

## Issue #11: Screen Reader & ARIA Labels (Accessibility Enhancement)

**Priority**: 🟢 **LOW** — Accessibility, not blocking

**Current Status**: ✅ Focus states working, 🔴 ARIA labels missing

**Missing ARIA** (add to HTML):
```html
<!-- Top bar buttons -->
<button class="tbtn g" onclick="cmdAll('run')" aria-label="Run all systems">▶ Run</button>
<button class="tbtn a" onclick="cmdAll('pause')" aria-label="Pause all systems">⏸ Pause</button>
<button class="tbtn r" onclick="cmdAll('stop')" aria-label="Stop all systems">⏹ Stop</button>

<!-- Panels -->
<div class="gpanel" id="pInfra" role="region" aria-label="Infrastructure metrics">
  <!-- ... -->
</div>

<!-- Dock -->
<div id="dock" role="toolbar" aria-label="Application dock">
  <!-- ... -->
</div>

<!-- Talk bar -->
<div id="cmd" role="region" aria-label="Voice input and quick actions">
  <!-- ... -->
</div>
```

**Location in File**: HTML elements (not in CSS)

---

## Complete Remediation Checklist

```
CRITICAL (Must fix before launch)
- [ ] Issue #1: Panel toggle 22×16px → 44×44px or full header tappable

HIGH (Fix before v1.0 release)
- [ ] Issue #3: Mini buttons 40px → 44px minimum
- [ ] Issue #6: Add tablet panel collapse toggle
- [ ] Issue #7: Implement hamburger menu JavaScript
- [ ] Issue #8: Implement P0/P1 quick actions menu

MEDIUM (v1.0 or v1.1)
- [ ] Issue #2: Dock radius 14px → 16px (var(--radius-lg))
- [ ] Issue #4: Panel blur document or standardize
- [ ] Issue #9: Implement 30s data sync backend
- [ ] Issue #10: Implement low-power mode blur conditional

LOW (Polish, v1.1+)
- [ ] Issue #5: Add spring physics to button :active
- [ ] Issue #11: Add ARIA labels for screen readers

OPTIONAL (Future enhancements)
- [ ] Add haptic feedback simulation
- [ ] Add gesture recognition (swipe, pinch)
- [ ] Add light mode variant
- [ ] Add custom color themes
```

---

## Validation After Each Fix

After applying each fix, run:
```bash
python3 scripts/check_ui_theme_lock.py
```

Expected output:
```
UI THEME LOCK: PASS
Checked /opt/jarvis-app-1/server/jarvis_live.html
```

---

## Summary

**Total Issues Found**: 11  
**Critical**: 1 (panel toggle size)  
**High**: 4 (quick actions, hamburger, panel collapse, mini buttons)  
**Medium**: 4 (data sync, blur consistency, P0/P1 menu, low-power mode)  
**Low**: 2 (spring physics, ARIA labels)  

**Estimated Fix Time**:
- Critical: 30 minutes
- High: 2 hours
- Medium: 4 hours
- Low: 2 hours

**Total**: ~8.5 hours to production-ready

---

**Document Version**: 1.0  
**Last Updated**: June 12, 2026  
**Status**: READY TO IMPLEMENT ✅
