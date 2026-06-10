# Dock Carousel + Global Animation/Interaction Layer — STAGE 2 SPEC

**Status:** First-draft design spec (no code written yet).  
**Date:** 2026-06-10  
**Author:** JARVIS build engineer (autonomous).  
**Basis:** Stage 1 research (`.proof/dock_carousel_animation_stage1.md`).  
**Stage 9 reference:** This spec is the golden source for final acceptance testing.

---

## EXECUTIVE SUMMARY

Build a production-grade, reusable motion + interaction layer (`fx.css` / `fx.js` / `apps.js`) that transforms JARVIS from static UI to fully animated, voice-driven, ontology-coherent control. The dock becomes a paged carousel with depth/parallax; every interaction (tap, open, close, drag, toggle, fly) gets polished spring physics + View Transitions API blending; all motion respects `prefers-reduced-motion` and JARVIS "calm mode"; every mini-app is invokable by voice, text, and agent with zero per-feature drift.

**Architecture:** No build step, no new runtime dependency. Ship `fx.css` (motion tokens + keyframes + interaction classes), `fx.js` (WAAPI spring engine + behaviors + MutationObserver auto-wire), and `apps.js` (App Registry ontology — the single source of truth for all UI control). Include all three in all 6 HTML pages. Mirror the existing `server/services/.vendor136` pattern for offline resilience.

**Most-advanced approach:** Native CSS `scroll-snap` carousel (progressive enhancement), Web Animations API (compositor-only), View Transitions API (blend-in morphs), Material 3 Expressive spring tokens + Apple snappy/bouncy, Palantir ontology discipline. Matches how Apple, Google, Palantir, Meta, NVIDIA ship this.

---

## 1. FILE MANIFEST — WHAT TO CREATE / MODIFY

### New files (in `server/static/`)
All served by `dashboard.py` with a new `/static/*` route; mirrored into `server/services/.vendor-static/` for offline mode.

```
server/static/
├── fx.css                # Motion tokens (:root custom props) + keyframes + .fx-* classes
├── fx.js                 # MotionFX engine (animate/spring/flip/viewTransition/reveal) 
│                         # + interaction primitives (press/ripple/magnetic/tilt/reveal)
│                         # + reduced-motion gate + MutationObserver auto-wire
├── apps.js               # App Registry (APPS array + intent routers + registry generators)
└── index.html            # (optional) demo page for the animation layer itself
```

### Modified files
- **`server/dashboard.py`:** add `/static/*` route (mime-type text/css or application/javascript).
- **`server/jarvis_live.html`:** include `fx.css`+`fx.js`+`apps.js`; replace hand-coded `DOCK` with App Registry; convert dock to scroll-snap + FX integration.
- **`server/jarvis_voice.html`:** include `fx.css`+`fx.js`; adopt unified tokens; replace duplicated spacing/color/radius with shared vars.
- **`server/guardian.html`:** include `fx.css`+`fx.js`; adopt tokens; apply `.fx-press`/`.fx-ripple` to buttons; gate motion via `FX.reduced()`.
- **`server/care.html`:** include `fx.css`+`fx.js`; adopt tokens; apply FX interactions + reduced-motion gate.
- **`server/dashboard_v2.html`:** include `fx.css`+`fx.js`; adopt tokens; apply to cards/toggles.
- **`server/dashboard_graph.html`:** include `fx.css`+`fx.js`; adopt tokens.
- **`server/agent/tools.py`:** add 6 new auto-registered tools (`ui.app.open`, `ui.app.close`, `ui.carousel.next`, `ui.carousel.prev`, `ui.carousel.goto`, `ui.panel.setstate`, `ui.dock.pin`); source list from App Registry (generated or embedded).
- **`server/agent/app_registry.py`** (new): Python mirror of `APPS` array for server-side intent routing + agent tool registration.

### Not modified (preserve existing)
- pm2 service definitions / `server/jarvis_voice.py` / WebGL Three.js layer / `server/services/task_daemon.py`.

---

## 2. DESIGN TOKENS & MOTION VOCABULARY

### 2.1 `fx.css` — `:root` custom properties

**Duration scale** (Material Design 3 Expressive, milliseconds):
```css
--dur-fast: 80ms;           /* micro interactions (ripple, press) */
--dur-normal: 150ms;        /* standard transitions (button hover, card open) */
--dur-emphasis: 240ms;      /* hero interactions (dock item tap, panel state) */
--dur-express: 320ms;       /* expressed motion (carousel page, panel width) */
--dur-slow: 480ms;          /* contemplative (view transition, overlay fade) */
```

**Easing / timing functions** (Material 3 + custom):
```css
--ease-standard: cubic-bezier(0.2, 0, 0, 1);           /* default in, out */
--ease-emphasized: cubic-bezier(0.2, 0, 0, 1);         /* hero */
--ease-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);    /* enter (decel) */
--ease-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);    /* exit (accel) */
--ease-spring: cubic-bezier(0.22, 1, 0.36, 1);         /* existing app snappy — KEEP */
```

**Spring physics** (for JS, not CSS):
```css
--spring-spatial-stiff: 380;     /* position/size/rotate, overshoot+settle */
--spring-spatial-damp: 30;
--spring-effects-stiff: 300;     /* color/opacity, no overshoot */
--spring-effects-damp: 40;
--spring-snappy: 0.4;            /* response (Apple snappy) */
--spring-snappy-damp: 0.85;
--spring-bouncy: 0.5;            /* response (Apple bouncy) */
--spring-bouncy-damp: 0.7;
```

**Z-layer unification** (resolve existing conflicts):
```css
--z-bg: 0;
--z-canvas: 1;
--z-panel: 10;
--z-card: 24;
--z-dock: 26;
--z-talkbar: 25;
--z-sdev: 26;
--z-overlay: 30;
--z-boot: 90;
```

**Color tokens** (unify the 3 cyans):
```css
--cyan-primary: #22d3ee;          /* canonical cyan */
--cyan-hover: #06b6d4;            /* darker on hover */
--cyan-accent: #7af3ff;           /* light accent (glow) */
--gray-50: #f9fafb;
--gray-900: #111827;
... (lift the full palette from existing code)
```

**Spacing scale** (lift from `jarvis_voice.html`, unify):
```css
--s0: 0;
--s1: 0.25rem;
--s2: 0.5rem;
--s3: 0.75rem;
--s4: 1rem;
--s5: 1.25rem;
--s6: 1.5rem;
--s8: 2rem;
--s12: 3rem;
... (up to --s64)
```

**Radius scale**:
```css
--r0: 0;
--r1: 0.25rem;
--r2: 0.5rem;
--r3: 0.75rem;
--r4: 1rem;
--r6: 1.5rem;
... (for glass/panels)
```

### 2.2 Shared keyframes (`fx.css`)

Keep existing ones, unify names:
```css
@keyframes fx-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes fx-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes fx-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes fx-shimmer { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
@keyframes fx-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes fx-slide-in-from-bottom { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes fx-slide-in-from-right { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fx-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fx-scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
```

Care pages (migrate from guardian.html / care.html keyframes):
```css
@keyframes fx-drift { ... }
@keyframes fx-scan { ... }
@keyframes fx-rip { ... }
... (copy care-page keyframes, rename to --fx-*)
```

### 2.3 Interaction primitive classes (`fx.css`)

Auto-applied by `FX.js` to DOM elements with `data-fx` or `.fx-*` class:

```css
.fx-press {
  /* Tap/click feedback: scale down, brighten, ripple burst on release */
  cursor: pointer;
}

.fx-magnetic {
  /* Hover scale + soft shadow; eased spring, interrupts on leave */
}

.fx-ripple {
  /* Material 3 ripple on tap; radial expand + fade from tap point */
}

.fx-reveal {
  /* Slide-in + fade on mount; staggered children */
}

.fx-tilt {
  /* 3D tilt on mouse move (subtle); reset on leave */
}

.fx-drag {
  /* Drag pickup → shadow lift + opacity fade; drop → settle + shadow fade */
}

.fx-toggle {
  /* Knob spring flick + optical feedback */
}
```

---

## 3. `fx.js` — MotionFX ENGINE

### 3.1 Public API (global `FX` object)

```javascript
// Core animation
FX.animate(el, keyframes, opts)
  // WAAPI wrapper; respects reduced-motion
  // keyframes: [{transform: '...', opacity: ...}, ...]
  // opts: {duration, easing, delay, fill, endDelay}
  // returns: Animation object (supports .cancel(), .reverse(), etc.)

FX.spring(el, props, opts)
  // Physics spring for transform/opacity
  // props: {x, y, scale, opacity} (values or 'from'/'to')
  // opts: {spatial: true|false, duration (computed from stiffness+damping)}
  // returns: Animation

FX.flip(els, mutate)
  // FLIP for layout changes (dock reorder, carousel paging)
  // mutate: fn that changes DOM; FX measures before/after, animates delta

FX.viewTransition(mutate, names)
  // startViewTransition wrapper + fallback
  // mutate: fn that changes DOM
  // names: optional array of elements to mark with view-transition-name
  // auto-guards: if !document.startViewTransition, calls mutate() directly

FX.reveal(el, opts)
  // Blend/slide-in on mount; staggered children
  // opts: {direction: 'up'|'down'|'left'|'right'|'fade', stagger: ms, duration}

FX.ripple(el, event)
  // Material 3 ripple at tap point; expands + fades

FX.press(el)
  // Tap feedback: scale + ripple + optional audio

FX.magnetic(el, opts)
  // Hover scale spring + soft shadow
  // opts: {scale: 1.1, maxDistance: 50}

FX.tilt(el, opts)
  // 3D tilt on mouse move
  // opts: {maxRotation: 5, resetOnLeave: true}

FX.reduced()
  // Returns true if prefers-reduced-motion OR JARVIS calm mode is set
  // All FX.* methods respect this: return instant/no-motion when true

FX.getAnimations(el)
  // Get all active Animations on an element (WAAPI)

FX.cancelAll(el)
  // Cancel all animations on an element + children

FX.setClampMode(mode)
  // 'clips' | 'extends' - how spring overshoots vs undershoot bounds
```

### 3.2 Internal: Reduced-motion gate

```javascript
const REDUCED = () => 
  matchMedia('(prefers-reduced-motion: reduce)').matches ||
  window.JARVIS?.A11Y?.calmMode === true

// Every animation checks REDUCED():
// if (REDUCED()) {
//   el.style.transition = 'opacity 0.1s';  // instant or minimal fade
//   apply final state instantly
//   return null-animation
// }
```

### 3.3 Internal: Spring solver (Runge-Kutta or Motion.dev-inspired)

```javascript
// Sample a spring trajectory given {stiffness, damping, mass} over time
// Output keyframes that match the physics curve
spring(target, {stiffness, damping, mass, duration}) 
  // → array of keyframes sampled at 60fps intervals
```

### 3.4 Internal: MutationObserver auto-wire

```javascript
// On page load and whenever DOM changes:
// Query all [data-fx] and .fx-* elements
// Attach appropriate listeners (mousemove for tilt, click for press, etc.)
// Re-attach if DOM is recreated (dock re-renders)
```

### 3.5 Initialization in `fx.js` (runs on load)

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Apply motion tokens to document via getComputedStyle
  // Attach MutationObserver
  // Bind global FX object
  // Register the 'calm-mode' observer (watch JARVIS.A11Y.calmMode)
  // Load voice/text intent routers from App Registry if present
})
```

---

## 4. APP REGISTRY — THE SINGLE SOURCE OF TRUTH

### 4.1 `apps.js` — APPS array schema

```javascript
export const APPS = [
  {
    id: 'talk',                          // unique machine ID
    name: 'Talk',                        // human name
    glyph: '💬',                         // emoji or icon
    group: 'comms',                      // logical grouping (comms, create, observe, care, meta)
    voice: [
      /^(talk|chat|ask jarvis)/i,        // regex patterns to match voice intent
      /^open (talk|chat|message)/i,
    ],
    text: [
      /^talk\b/i,                        // regex patterns to match text intent
      /^chat\b/i,
    ],
    open: () => {
      // Handler: open the app
      // May trigger View Transition
      // Must be voice/text/agent-safe (no page reload)
    },
    close: () => {
      // Handler: close the app
      // May trigger View Transition
    },
    agentTool: {
      // For auto-registration in server/agent/tools.py
      id: 'ui.app.open',
      name: 'Open Talk app',
      description: 'Open the Talk (chat) interface',
      input_schema: {},  // no args for this simple tool
      risk: 'low',
      timeout: 2000,
      tags: ['ui', 'app'],
    },
  },
  {
    id: 'library',
    name: 'Library',
    glyph: '📚',
    group: 'observe',
    voice: [/^(library|knowledge|search|find)/i],
    text: [/^library\b/i, /^search\b/i],
    open: () => { /* open library panel */ },
    close: () => { /* close library panel */ },
    agentTool: { /* ... */ },
  },
  // ... 8 more apps (create, image, 3d, guardian, climate, agent, vitals, upgrades)
]

// Registry generators (client-side)
export function generateIntentRouter(channel) {
  // channel: 'voice' | 'text'
  // Returns: fn(input) that matches against APPS[*][channel] regexes
  //         and returns { app, match } or null
}

export function getAppById(id) { /* lookup helper */ }
export function getAppsByGroup(group) { /* lookup helper */ }
```

### 4.2 Server mirror: `server/agent/app_registry.py` (new)

```python
# Python mirror of APPS array for server-side routing

APPS = [
    {
        'id': 'talk',
        'name': 'Talk',
        'glyph': '💬',
        'group': 'comms',
        'voice': [r'^(talk|chat|ask jarvis)', r'^open (talk|chat|message)'],
        'text': [r'^talk\b', r'^chat\b'],
        # NB: open/close/agent functions live client-side or are called via HTTP
    },
    # ... rest
]

def intent_router(channel, text):
    """Match text against voice/text patterns; return {app_id, match} or None"""
    for app in APPS:
        for pattern in app.get(channel, []):
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                return {'app_id': app['id'], 'match': m.group(0)}
    return None

def get_app_by_id(app_id):
    """Lookup helper"""
    for app in APPS:
        if app['id'] == app_id:
            return app
    return None
```

### 4.3 Integration points

**Client (voice + text intent routing):**
- `jarvis_voice.html` `handle(t)` `:717–729` → check `generateIntentRouter('voice')(t)` → call matched `app.open()`
- `jarvis_live.html` `askJarvis(q)` `:487–501` → check `generateIntentRouter('text')(q)` → call matched `app.open()` or POST `/chat`

**Server (/chat endpoint):**
- `dashboard.py /chat` `:1985–2024` → call `app_registry.intent_router('text', _l)` → route to handler or fallback

**Agent (tool registration):**
- `server/agent/tools.py` `:74–106` → iterate APPS; for each, register `ui.app.open` with input schema `{app_id}`, handler calls `POST /ui/app/open?app_id=...`
- Register carousel tools: `ui.carousel.next`, `ui.carousel.prev`, `ui.carousel.goto` (with page index)
- Register panel tools: `ui.panel.setstate` (panel name, state='full'|'peek'|'hide')
- Register dock tools: `ui.dock.pin` (app_id)

---

## 5. DOCK → BLEND CAROUSEL

### 5.1 Structure (HTML in `jarvis_live.html`)

Replace the current hand-coded flex bar with:

```html
<div id="dock-carousel" class="fx-reveal">
  <ul id="dock" role="tablist" aria-label="Apps">
    <!-- Each app renders as a card (generated by renderDock()) -->
    <li class="dock-card fx-press fx-magnetic" role="tab" data-app-id="talk">
      <span class="glyph">💬</span>
      <span class="name">Talk</span>
    </li>
    <li class="dock-card fx-press fx-magnetic" role="tab" data-app-id="library">
      <span class="glyph">📚</span>
      <span class="name">Library</span>
    </li>
    <!-- ... 8 more cards -->
  </ul>
  <!-- Carousel controls (auto-generated by browser with ::scroll-marker-group / ::scroll-button) -->
  <!-- Fallback JS pager for unsupported browsers (buttons generated by JS) -->
</div>
```

### 5.2 CSS (in `fx.css`)

```css
#dock-carousel {
  position: fixed;
  right: var(--s4);
  bottom: var(--s12);
  z-index: var(--z-dock);
}

#dock {
  display: flex;
  gap: var(--s3);
  overflow-x: scroll;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;  /* hide scrollbar */
  /* scroll-snap + markers/buttons auto-rendered by browser */
}

.dock-card {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  border-radius: var(--r4);
  background: rgba(34, 211, 238, 0.1);  /* --cyan-primary with alpha */
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s1);
  scroll-snap-align: center;
  scroll-snap-stop: always;
  /* fx-press / fx-magnetic will add tap/hover styles */
  transform-origin: center;
  cursor: pointer;
  border: 1px solid rgba(34, 211, 238, 0.2);
  transition: border-color var(--dur-fast) var(--ease-standard);  /* only non-motion properties */
}

.dock-card:hover {
  border-color: rgba(34, 211, 238, 0.5);
}

.dock-card .glyph {
  font-size: 32px;
  line-height: 1;
}

.dock-card .name {
  font-size: 10px;
  color: var(--cyan-primary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

/* Carousel marker dots (native browser ::scroll-marker-group) */
#dock::scroll-marker-group {
  justify-content: center;
  gap: var(--s2);
}

#dock li::scroll-marker {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(34, 211, 238, 0.3);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard);
}

#dock li:target-current::scroll-marker {
  background: var(--cyan-primary);
  box-shadow: 0 0 8px var(--cyan-accent);
}

/* Carousel buttons (native ::scroll-button) */
#dock::scroll-button {
  all: unset;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: var(--r2);
  color: var(--cyan-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard);
}

#dock::scroll-button:hover {
  background: rgba(34, 211, 238, 0.2);
  border-color: rgba(34, 211, 238, 0.5);
}

#dock::scroll-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

### 5.3 JS (in `jarvis_live.html`, integrated with App Registry)

```javascript
function renderDock() {
  const dock = document.querySelector('#dock')
  dock.innerHTML = ''
  APPS.forEach(app => {
    const li = document.createElement('li')
    li.className = 'dock-card fx-press fx-magnetic'
    li.setAttribute('role', 'tab')
    li.setAttribute('data-app-id', app.id)
    li.innerHTML = `<span class="glyph">${app.glyph}</span><span class="name">${app.name}</span>`
    li.addEventListener('click', () => app.open())
    dock.appendChild(li)
  })
  // MutationObserver in fx.js will auto-apply fx-press / fx-magnetic handlers
}

// Carousel paging (JS fallback for browsers without ::scroll-marker-group / ::scroll-button)
function setupCarouselPager() {
  if (!CSS.supports('::scroll-marker-group', 'after')) {
    // Create fallback pager buttons
    const carousel = document.querySelector('#dock-carousel')
    const prevBtn = document.createElement('button')
    prevBtn.textContent = '❮'
    prevBtn.className = 'fx-press'
    prevBtn.addEventListener('click', () => {
      const dock = document.querySelector('#dock')
      dock.scrollBy({left: -dock.clientWidth * 0.85, behavior: 'smooth'})
      // FLIP animation for smooth scroll
      FX.flip([...dock.children], () => {
        // scroll already happened
      })
    })
    const nextBtn = document.createElement('button')
    nextBtn.textContent = '❯'
    nextBtn.className = 'fx-press'
    nextBtn.addEventListener('click', () => {
      const dock = document.querySelector('#dock')
      dock.scrollBy({left: dock.clientWidth * 0.85, behavior: 'smooth'})
    })
    carousel.appendChild(prevBtn)
    carousel.appendChild(nextBtn)
  }
}

// Magnification (preserve existing, upgrade to spring-eased)
function wireDockMagnify() {
  const dock = document.querySelector('#dock')
  const cards = [...dock.querySelectorAll('.dock-card')]
  
  dock.addEventListener('mousemove', (e) => {
    if (FX.reduced()) return  // skip if reduced-motion
    const dockRect = dock.getBoundingClientRect()
    const mouseX = e.clientX - dockRect.left
    
    cards.forEach(card => {
      const cardRect = card.getBoundingClientRect()
      const cardCenterX = cardRect.left - dockRect.left + cardRect.width / 2
      const distance = Math.abs(mouseX - cardCenterX)
      const maxDistance = 120
      const scale = Math.max(1, 1 + (1 - Math.min(distance, maxDistance) / maxDistance) * 0.55)
      
      FX.spring(card, {scale}, {spatial: true, duration: 200})
    })
  })
  
  dock.addEventListener('mouseleave', () => {
    cards.forEach(card => {
      FX.spring(card, {scale: 1}, {spatial: true, duration: 200})
    })
  })
}

// Drag-to-pin (preserve existing)
// ... (wireDockDrag, pinBodyToDock remain unchanged)

// Initialization
function initDock() {
  renderDock()
  setupCarouselPager()
  wireDockMagnify()
  wireDockDrag()  // preserve
  // Load and persist pins from localStorage
}
```

### 5.4 Card open → app → panel transition (View Transition)

```javascript
// In app.open():
async function openApp(appId) {
  const app = APPS.find(a => a.id === appId)
  if (!app) return
  
  const card = document.querySelector(`[data-app-id="${appId}"]`)
  if (card) {
    card.style.viewTransitionName = 'dock-card-morph'
  }
  
  const targetPanel = document.querySelector(`#p${appId}`)
  if (targetPanel) {
    targetPanel.style.viewTransitionName = 'dock-card-morph'
  }
  
  FX.viewTransition(async () => {
    card?.style.display = 'none'
    targetPanel?.style.display = 'block'
    await FX.reveal(targetPanel, {direction: 'fade', duration: 300})
  }, ['dock-card-morph'])
}
```

---

## 6. INTERACTION PRIMITIVES — APPLIED EVERYWHERE

### 6.1 Press (tap feedback)

```javascript
FX.press = (el) => {
  el.addEventListener('pointerdown', (e) => {
    if (FX.reduced()) {
      el.style.opacity = '0.8'
      return
    }
    FX.ripple(el, e)
    FX.spring(el, {scale: 0.95}, {spatial: true, duration: 150})
    el.style.filter = 'brightness(1.1)'
  })
  
  el.addEventListener('pointerup', (e) => {
    if (FX.reduced()) {
      el.style.opacity = '1'
      return
    }
    FX.spring(el, {scale: 1}, {spatial: true, duration: 200})
    FX.animate(el, [{filter: 'brightness(1.1)'}, {filter: 'brightness(1)'}], {duration: 100})
  })
}
```

### 6.2 Magnetic (hover scale + shadow)

```javascript
FX.magnetic = (el, opts = {}) => {
  const {scale = 1.08, maxDistance = 50} = opts
  
  document.addEventListener('mousemove', (e) => {
    if (FX.reduced()) return
    
    const rect = el.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY)
    
    if (distance < maxDistance) {
      const s = scale * (1 - distance / maxDistance)
      FX.spring(el, {scale: s}, {spatial: true, duration: 200})
      el.style.filter = `drop-shadow(0 8px 16px rgba(34, 211, 238, 0.3))`
    } else {
      FX.spring(el, {scale: 1}, {spatial: true, duration: 200})
      el.style.filter = 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
    }
  })
}
```

### 6.3 Ripple (Material 3 tap feedback)

```javascript
FX.ripple = (el, event) => {
  if (FX.reduced()) return
  
  const rect = el.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const size = Math.max(rect.width, rect.height)
  
  const ripple = document.createElement('div')
  ripple.style.position = 'absolute'
  ripple.style.left = x + 'px'
  ripple.style.top = y + 'px'
  ripple.style.width = '0'
  ripple.style.height = '0'
  ripple.style.borderRadius = '50%'
  ripple.style.background = 'rgba(34, 211, 238, 0.3)'
  ripple.style.pointerEvents = 'none'
  ripple.style.transformOrigin = 'center'
  ripple.style.transform = 'translate(-50%, -50%)'
  
  el.appendChild(ripple)
  
  FX.animate(ripple, [
    {width: '0', height: '0', opacity: 0.5},
    {width: size + 'px', height: size + 'px', opacity: 0},
  ], {duration: 600, easing: 'ease-out'})
  
  setTimeout(() => ripple.remove(), 600)
}
```

### 6.4 Reveal (blend/slide-in on mount)

```javascript
FX.reveal = (el, opts = {}) => {
  const {direction = 'fade', stagger = 50, duration = 300} = opts
  
  if (FX.reduced()) {
    FX.animate(el, [{opacity: 0}, {opacity: 1}], {duration: 100})
    return
  }
  
  const children = el.querySelectorAll('[data-reveal]')
  
  FX.animate(el, [
    {opacity: 0, ...(direction === 'up' && {transform: 'translateY(20px)'})},
    {opacity: 1, transform: 'translateY(0)'},
  ], {duration, easing: 'ease-out'})
  
  children.forEach((child, i) => {
    FX.animate(child, [
      {opacity: 0, ...(direction === 'up' && {transform: 'translateY(10px)'})},
      {opacity: 1, transform: 'translateY(0)'},
    ], {duration: 300, delay: i * stagger, easing: 'ease-out'})
  })
}
```

### 6.5 Tilt (3D on mouse move)

```javascript
FX.tilt = (el, opts = {}) => {
  const {maxRotation = 5, resetOnLeave = true} = opts
  
  el.addEventListener('mousemove', (e) => {
    if (FX.reduced()) return
    
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    
    const rotX = y * maxRotation
    const rotY = -x * maxRotation
    
    el.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`
  })
  
  if (resetOnLeave) {
    el.addEventListener('mouseleave', () => {
      FX.spring(el, {rotX: 0, rotY: 0}, {spatial: true, duration: 300})
    })
  }
}
```

### 6.6 Toggle (knob flick + optical feedback)

```javascript
FX.toggle = (el) => {
  const knob = el.querySelector('[role="switch"]') || el
  
  el.addEventListener('click', () => {
    const isOn = knob.getAttribute('aria-checked') === 'true'
    const newState = !isOn
    knob.setAttribute('aria-checked', newState)
    
    if (FX.reduced()) {
      knob.style.opacity = newState ? '1' : '0.5'
      return
    }
    
    // Spring flick
    FX.spring(knob, {
      x: newState ? 20 : 0,  // translate knob
    }, {spatial: true, duration: 250})
    
    // Optical feedback
    FX.animate(knob, [
      {filter: 'brightness(1)'},
      {filter: 'brightness(1.2)'},
      {filter: 'brightness(1)'},
    ], {duration: 200})
  })
}
```

---

## 7. VOICE / TEXT / AGENT WIRING (UNIFIED CONTROL)

### 7.1 Voice intent routing (`jarvis_voice.html` `handle(t)`)

**Before (hand-coded regexes):**
```javascript
function handle(t) {
  if (/^(talk|chat|ask jarvis)/i.test(t)) return talk(t)
  if (/^(library|search|find)/i.test(t)) return openLibrary()
  if (/^(create|make)/i.test(t)) return openCreate()
  // ... 7 more hand-coded checks
  return askJarvis(t)  // fallback
}
```

**After (App Registry-driven):**
```javascript
function handle(t) {
  // Import App Registry (loaded from apps.js)
  const router = generateIntentRouter('voice')
  const match = router(t)
  
  if (match) {
    const app = getAppById(match.app)
    if (app?.open) return app.open()
  }
  
  // Fallback: post to /chat
  return askJarvis(t)
}
```

### 7.2 Text intent routing (client, `jarvis_live.html` `askJarvis()`)

**Before:**
```javascript
async function askJarvis(q) {
  if (/^(talk|chat)/i.test(q)) return openTalk()
  if (/^library/i.test(q)) return openLibrary()
  // ... hand-coded
  return await fetch('/chat', {method: 'POST', body: JSON.stringify({q})})
}
```

**After:**
```javascript
async function askJarvis(q) {
  const router = generateIntentRouter('text')
  const match = router(q)
  
  if (match) {
    const app = getAppById(match.app)
    if (app?.open) return app.open()
  }
  
  // Fallback: POST /chat
  const res = await fetch('/chat', {method: 'POST', body: JSON.stringify({q})})
  return res.json()
}
```

### 7.3 Server intent routing (`dashboard.py /chat`)

**Before:**
```python
@app.route('/chat', methods=['POST'])
def chat():
    _l = request.json.get('input', '').lower()
    if re.search(r'^(talk|chat)', _l):
        return {'ok': True, 'reply': 'Opening Talk...', 'action': 'openTalk'}
    if re.search(r'^library', _l):
        return {'ok': True, 'reply': 'Opening Library...', 'action': 'openLibrary'}
    # ... hand-coded
```

**After:**
```python
from server.agent.app_registry import intent_router, get_app_by_id

@app.route('/chat', methods=['POST'])
def chat():
    _l = request.json.get('input', '').lower()
    match = intent_router('text', _l)
    
    if match:
        app = get_app_by_id(match['app_id'])
        if app:
            return {
                'ok': True,
                'reply': f"Opening {app['name']}...",
                'action': f"open{app['id'].title()}",
            }
    
    # Fallback: generic response or external API call
    return {'ok': False, 'reply': 'I did not understand that.'}
```

### 7.4 Agent tool registration (`server/agent/tools.py`)

**New tools auto-registered from App Registry:**

```python
from server.agent.app_registry import APPS

# Register ui.app.open for every app
for app in APPS:
    tools.register(Tool(
        id=f'ui.app.open.{app["id"]}',
        name=f'Open {app["name"]}',
        description=f'Open the {app["name"]} interface',
        input_schema={},
        risk='low',
        timeout=2000,
        handler=lambda app=app: handle_app_open(app),
        tags=['ui', 'app', app['group']],
    ))

# Register generic carousel tools
tools.register(Tool(
    id='ui.carousel.next',
    name='Next app',
    description='Scroll to the next page of apps in the dock carousel',
    input_schema={},
    risk='low',
    timeout=500,
    handler=lambda ctx: handle_carousel_next(ctx),
    tags=['ui', 'carousel'],
))

tools.register(Tool(
    id='ui.carousel.prev',
    name='Previous app',
    description='Scroll to the previous page of apps in the dock carousel',
    input_schema={},
    risk='low',
    timeout=500,
    handler=lambda ctx: handle_carousel_prev(ctx),
    tags=['ui', 'carousel'],
))

tools.register(Tool(
    id='ui.carousel.goto',
    name='Go to app',
    description='Jump to a specific app by name or ID',
    input_schema={
        'type': 'object',
        'properties': {
            'app_id': {'type': 'string', 'description': 'App ID (e.g. "talk", "library")'},
        },
        'required': ['app_id'],
    },
    risk='low',
    timeout=1000,
    handler=lambda ctx: handle_carousel_goto(ctx),
    tags=['ui', 'carousel'],
))
```

**Handlers (in `server/services/task_daemon.py` or new `server/ui_handlers.py`):**

```python
def handle_app_open(app, ctx=None):
    """Opens an app by sending a command to the client."""
    # POST to /ui/app/open?app_id=<id> → client JavaScript receives it
    # or: emit a message via WebSocket / SSE to trigger the client-side handler
    return {
        'ok': True,
        'message': f'Opening {app["name"]}...',
        'ui_action': {
            'type': 'app_open',
            'app_id': app['id'],
        }
    }

def handle_carousel_next(ctx):
    return {
        'ok': True,
        'ui_action': {'type': 'carousel_scroll', 'direction': 'next'},
    }

def handle_carousel_goto(ctx):
    app_id = ctx.get('app_id')
    return {
        'ok': True,
        'ui_action': {'type': 'carousel_goto', 'app_id': app_id},
    }
```

**Client-side handler for agent tool results:**

```javascript
// In jarvis_live.html, when agent tool completes:
async function handleUIAction(action) {
  if (action.type === 'app_open') {
    const app = getAppById(action.app_id)
    if (app?.open) app.open()
  } else if (action.type === 'carousel_scroll') {
    const dock = document.querySelector('#dock')
    const direction = action.direction === 'next' ? 1 : -1
    dock.scrollBy({left: direction * dock.clientWidth * 0.85, behavior: 'smooth'})
  } else if (action.type === 'carousel_goto') {
    const target = document.querySelector(`[data-app-id="${action.app_id}"]`)
    target?.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'})
  }
}
```

---

## 8. CARE PAGES — APPLY THE LAYER (ACCESSIBILITY-FIRST)

### 8.1 `guardian.html` / `care.html` updates

Include `fx.css` + `fx.js` + `apps.js`:
```html
<link rel="stylesheet" href="/static/fx.css">
<script src="/static/fx.js" defer></script>
<script src="/static/apps.js" defer></script>
```

Replace duplicate motion tokens with shared vars; adopt shared keyframes (rename to `fx-*`):
```css
/* OLD */
@keyframes pulse { ... }
/* NEW */
@keyframes fx-pulse { ... }
/* And in styles: */
animation: fx-pulse var(--dur-normal) var(--ease-standard) infinite;
```

Apply `.fx-press` / `.fx-ripple` to all buttons:
```html
<button class="btn fx-press fx-ripple">Action</button>
```

Gate motion via `FX.reduced()`:
```javascript
if (!FX.reduced()) {
  // Only animate if motion is not reduced
  FX.spring(el, {scale: 1.1}, {spatial: true})
} else {
  // Instant state change
  el.style.transform = 'scale(1.1)'
}
```

### 8.2 Accessibility audit checklist

- [ ] All motion collapses under `prefers-reduced-motion: reduce`.
- [ ] All motion collapses when JARVIS `A11Y.calmMode === true`.
- [ ] No motion exceeds 500ms (WCAG 2.1 Animation from Interactions).
- [ ] All buttons / interactive elements have `.fx-press` or `.fx-ripple`.
- [ ] No `position: fixed` elements shift without FLIP (carousel paging uses FLIP).
- [ ] `will-change` cleared after animation completes.
- [ ] No layout shifts during animation (compositor-only transform/opacity).

---

## 9. FILE STRUCTURE SUMMARY

```
server/
├── static/                               # NEW: served by /static/* route
│   ├── fx.css                           # Motion tokens + keyframes + primitives
│   ├── fx.js                            # MotionFX engine + behaviors + auto-wire
│   └── apps.js                          # App Registry + intent routers + helpers
├── services/
│   └── .vendor-static/                  # (optional) offline mirror of fx.css/js/apps.js
│       ├── fx.css
│       ├── fx.js
│       └── apps.js
├── agent/
│   ├── tools.py                         # MODIFIED: add ui.* tools + app registry loop
│   └── app_registry.py                  # NEW: Python mirror of App Registry
├── dashboard.py                         # MODIFIED: add /static/* route
├── jarvis_live.html                     # MODIFIED: include fx files, use App Registry
├── jarvis_voice.html                    # MODIFIED: include fx files, adopt tokens
├── guardian.html                        # MODIFIED: include fx files, apply FX, gate motion
├── care.html                            # MODIFIED: include fx files, apply FX, gate motion
├── dashboard_v2.html                    # MODIFIED: include fx files, adopt tokens
└── dashboard_graph.html                 # MODIFIED: include fx files, adopt tokens
```

---

## 10. BUILD ORDER (8 milestones, M0–M8)

| Milestone | Task | Dependencies | Est. Duration | Acceptance |
|---|---|---|---|---|
| **M0** | Add `/static` route to `dashboard.py`; write `fx.css` motion tokens + keyframes. | None | 2h | Route serves `text/css`; no page regressions; tokens visible in DevTools. |
| **M1** | Write `fx.js` core engine (animate/spring/flip/viewTransition/reveal) + reduced-motion gate + MutationObserver. | M0 | 3h | FX object available globally; `FX.reduced()` reflects system + calm mode; no JS errors. |
| **M2** | Write `apps.js` App Registry schema + intent routers. | M1 | 1.5h | APPS array defined; `generateIntentRouter()` matches voice/text patterns; getAppById works. |
| **M3** | Integrate `fx.js` interaction primitives (press/ripple/magnetic/tilt/reveal) + apply to dock items + cards. | M1, M2 | 2h | All 10 dock cards have `.fx-press` + `.fx-magnetic`; tap/hover feedback works; magnify preserved. |
| **M4** | Convert dock to scroll-snap carousel; add ::scroll-marker-group + ::scroll-button (native); add JS pager fallback. | M3 | 2h | Dock scrolls smoothly; carousel markers/buttons work or fallback works; FLIP paging flawless; magnify still works. |
| **M5** | Replace hand-coded `DOCK` with App Registry; regenerate `renderDock()` from `APPS`. | M2, M4 | 1.5h | Dock renders from registry; no visual change; can edit apps in one place. |
| **M6** | Implement View Transitions (card→panel open, page transitions between care suite). | M1, M5 | 2h | Card-to-panel morphs with smooth blend; care.html ↔ guardian.html transitions work; graceful fallback on unsupported browsers. |
| **M7** | Wire voice/text/agent routers from App Registry; register ui.* tools in `server/agent/tools.py`. | M2, M5, M6 | 2h | `handle(t)` voice routing works; `askJarvis()` text routing works; `/chat` endpoint routes via registry; agent tools listed in `/agent/tools`. |
| **M8** | Apply `fx.css` + `fx.js` to care.html, guardian.html, jarvis_voice.html, dashboard_v2.html, dashboard_graph.html; gate motion; accessibility audit. | M0–M7 | 3h | All 6 pages include FX files; motion collapses under reduced-motion/calm; 60fps held; no errors; pm2 services untouched. |
| **Final** | Integration test: dock carousel, voice/text control, agent tools, care pages, reduced-motion. | All | 2h | All features REAL; no JS errors; voice/text/agent work end-to-end; pm2 lifelines still running; all existing features preserved. |

**Total estimated build effort: ~20 hours** (can be parallelized: M1 + M2 can run parallel; M3 + M2 can start once M0 ships; M7 can run parallel to M6, etc.)

---

## 11. ACCEPTANCE CRITERIA (STAGE 9 GATE)

### Functional
- [ ] Dock is a paged carousel; cards slide/blend with depth/parallax stagger.
- [ ] Carousel markers (`::scroll-marker-group`) and buttons (`::scroll-button`) work, or JS pager fallback works seamlessly.
- [ ] Dock magnification (hover scale) preserved, spring-eased, interrupts on mouse leave.
- [ ] Drag-to-pin, reposition, localStorage persistence all work.
- [ ] Opening an app triggers a View Transition (card → panel morphs).
- [ ] Closing an app reverses the transition.
- [ ] **Every mini-app is invocable by:**
  - Voice intent (via `handle(t)`)
  - Text intent (via `askJarvis()`)
  - Agent tool (via `ui.app.open.*` + `ui.carousel.*`)
  - From a single App Registry source.

### Motion & Interaction
- [ ] All interactions (tap, hover, open, close, drag, toggle, fly) have polished spring animation or easing.
- [ ] Dock item tap: `.fx-press` scale + ripple + brightness.
- [ ] Dock hover: `.fx-magnetic` scale spring + soft shadow.
- [ ] Card reveal: `.fx-reveal` slide/fade with staggered children.
- [ ] Panel state change: smooth spring width + shadow.
- [ ] No abrupt transitions; all motion is 80–480ms, GPU-friendly (transform/opacity only).

### Accessibility & Performance
- [ ] All motion collapses when `prefers-reduced-motion: reduce` is set (user OS setting).
- [ ] All motion collapses when JARVIS `A11Y.calmMode === true` (app setting).
- [ ] No motion exceeds 500ms (WCAG 2.1 Animation from Interactions).
- [ ] 60fps maintained; WebGL (Three.js) render loop unaffected (motion on compositor thread).
- [ ] `will-change` added only during animation, cleared after.
- [ ] No layout shifts during animation (FLIP used for reorder).
- [ ] No JS errors in console (any page).

### Architecture
- [ ] `fx.css`, `fx.js`, `apps.js` exist in `server/static/`.
- [ ] Included in all 6 HTML pages (`<link>` / `<script>` tags).
- [ ] Motion tokens unified: one cyan (`--cyan-primary: #22d3ee`), one z-layer scale, one spacing/radius scale.
- [ ] App Registry is the single source of truth (edits in one place propagate to dock, voice, text, agent).
- [ ] No duplicated intent routing logic across the 4 hooks (voice, text, server, agent).
- [ ] `server/agent/app_registry.py` is a Python mirror, auto-populated from `apps.js` or vice versa.

### Preservation
- [ ] pm2 lifelines (jarvis-dashboard, jarvis-voiceclone, jarvis-tasks) untouched and still running.
- [ ] All existing features still REAL (no fake data, no "pending" states).
- [ ] No regressions in 3D canvas, voice recognition, task daemon, or any other subsystem.
- [ ] localStorage dock pins still persisted.

---

## 12. RISKS, ASSUMPTIONS, DECISIONS LOCKED

### Risk: Progressive enhancement (carousel pseudo-elements ~75% support)
- **Mitigation:** Mandatory JS fallback pager for unsupported browsers (Chrome <135, Safari <18.2, Firefox).
- **Test on:** Chrome 135+, Safari 18.2, Firefox latest, and at least one older browser.

### Risk: View Transitions API (~80% support, degrades gracefully)
- **Mitigation:** Always wrap with `if (document.startViewTransition) { ... } else { cb() }`.
- **Test on:** Chrome, Safari, Firefox, plus at least one legacy browser.

### Risk: Motion layer not respecting reduced-motion gate
- **Mitigation:** Every `FX.*()` call checks `FX.reduced()` first. Audit care.html / guardian.html carefully.
- **Test:** Enable `prefers-reduced-motion: reduce` in OS; enable JARVIS calm mode; verify no animations.

### Risk: Spring solver performance (WAAPI sampling at 60fps)
- **Assumption:** WAAPI is 2.5–6× faster than GSAP; sampling a spring curve is negligible CPU cost.
- **Mitigation:** Profile with DevTools Performance tab; if Spring drops frames, fall back to precomputed keyframes or use Motion.dev vendor.
- **Fallback:** Optionally vendor Motion's `motion-dom` mini build (offline copy under `.vendor-static/`).

### Risk: App Registry drift (client vs. server)
- **Decision:** Generate `server/agent/app_registry.py` from `apps.js` at page-load-time, OR embed APPS as JSON in both files.
- **Mitigation:** Add a build-time check (or CI lint) to ensure they stay in sync.

### Risk: No build step (increases manual burden)
- **Decision:** No-build is non-negotiable (resilience, simplicity). Manual discipline required.
- **Mitigation:** Comment schema clearly; document App Registry shape; code-review all changes to APPS array.

### Assumption: MutationObserver is sufficient for dynamic DOM
- **Risk:** If dock re-renders frequently, MutationObserver overhead could accumulate.
- **Mitigation:** Debounce MutationObserver callback; consider explicit `FX.rewire(el)` call if dock re-renders mid-interaction.

---

## 13. EXAMPLE: ADDING A NEW APP (Single App Registry edit)

To add a new mini-app (e.g., "Music"):

**1. Edit `server/static/apps.js`:**
```javascript
{
  id: 'music',
  name: 'Music',
  glyph: '🎵',
  group: 'entertain',
  voice: [
    /^(music|play|shuffle|playlist)/i,
    /^play (music|song|playlist)/i,
  ],
  text: [
    /^music\b/i,
    /^play\b/i,
  ],
  open: () => {
    const musicPanel = document.querySelector('#pmusic')
    FX.viewTransition(async () => {
      musicPanel.style.display = 'block'
      await FX.reveal(musicPanel, {direction: 'fade'})
    })
  },
  close: () => {
    const musicPanel = document.querySelector('#pmusic')
    musicPanel.style.display = 'none'
  },
  agentTool: {
    id: 'ui.app.open.music',
    name: 'Open Music',
    description: 'Open the Music player interface',
    input_schema: {},
    risk: 'low',
    timeout: 2000,
    tags: ['ui', 'app', 'entertain'],
  },
}
```

**2. Edit `server/agent/app_registry.py` (mirror):**
```python
{
    'id': 'music',
    'name': 'Music',
    'glyph': '🎵',
    'group': 'entertain',
    'voice': [r'^(music|play|shuffle|playlist)', r'^play (music|song|playlist)'],
    'text': [r'^music\b', r'^play\b'],
}
```

**3. Done.** The new app now:
- Renders as a card in the dock carousel.
- Opens by voice: "play music", "shuffle", "open music".
- Opens by text: user types "music" or "play" → `askJarvis()` detects it.
- Registered as an agent tool: swarm can call `ui.app.open.music`.
- Appears in the drawer → user can navigate via carousel.

---

## 14. EXAMPLE: POLISHING A PAGE WITH INTERACTION PRIMITIVES

To add motion to `guardian.html`:

**1. Include FX files (in `<head>`):**
```html
<link rel="stylesheet" href="/static/fx.css">
<script src="/static/fx.js" defer></script>
```

**2. Adopt motion tokens:**
```css
/* OLD */
.button {
  transition: transform 0.3s cubic-bezier(.22,1,.36,1);
}

/* NEW */
.button {
  transition: transform var(--dur-normal) var(--ease-spring);
}
```

**3. Apply interaction primitives:**
```html
<!-- OLD -->
<button class="btn">Reassess</button>

<!-- NEW -->
<button class="btn fx-press fx-ripple">Reassess</button>
```

**4. Gate motion:**
```javascript
// OLD
document.querySelector('.message').style.animation = 'pulse 2s infinite'

// NEW
if (!FX.reduced()) {
  document.querySelector('.message').style.animation = 'fx-pulse var(--dur-normal) infinite'
} else {
  document.querySelector('.message').style.opacity = '0.8'  // minimal feedback
}
```

**5. Done.** guardian.html now has:
- Unified motion tokens (shared across all pages).
- Polished tap feedback (scale + ripple).
- Reduced-motion gating (lifeline-safe for disabled users).
- No new dependencies, no build step.

---

## 15. DIFF SUMMARY — WHAT STAGE 3 BUILD WILL CHANGE

When Stage 3 build completes, the following will have changed:

- **Added:** `server/static/fx.css`, `fx.js`, `apps.js` (~15KB total, no deps).
- **Added:** `server/agent/app_registry.py` (~150 lines).
- **Modified:** `server/dashboard.py` (+~10 lines for `/static` route).
- **Modified:** `server/jarvis_live.html` (dock converted to scroll-snap carousel; `renderDock()` uses App Registry; `handle()` and `askJarvis()` use intent routers; +3 `<link>`/`<script>` tags).
- **Modified:** 5 other HTML pages (include FX files; adopt tokens; apply `.fx-*` classes; ~50 lines each).
- **Modified:** `server/agent/tools.py` (+~60 lines to register ui.* tools).
- **Unchanged:** pm2 services, WebGL, voice recognition, task daemon.

**Lines of code added: ~1500** (mostly `fx.js` + `apps.js`; rest is light integration).  
**Lines of code removed: ~200** (duplicate tokens, redundant keyframes, hand-coded intent checks).  
**Net new complexity:** ~1300 lines, but all localized to one shared, reusable layer (multiplied across 6 pages = savings elsewhere).

---

## 16. SUCCESS METRICS (STAGE 9 VERIFICATION)

1. **Dock carousel is fully animated:** Every visual state transition (scroll, card appear/disappear, magnify) is smooth, spring-eased, respectful of reduced-motion.
2. **One App Registry source:** A developer can edit the dock's apps in one place (apps.js); voice, text, agent, and dock rendering all reflect that edit with zero per-feature glue code.
3. **100% of interactions have motion:** Dock items (tap/hover), cards (open/close), panels (state), toggles (flick), all have polished spring feedback.
4. **Care pages are lifeline-safe:** All motion collapses under reduced-motion or calm mode; no seizure risk, no cognitive overload.
5. **Zero regressions:** All existing features still REAL; pm2 services untouched; WebGL unaffected; localStorage persists.
6. **60fps golden:** DevTools Perf shows motion layer on compositor thread; main thread remains free for WebGL.
7. **Fully invokable:** Every app is voice-, text-, and agent-driven; swarm can open/close/navigate without manual touches.

---

**END OF STAGE 2 SPEC**

---

## Next Steps (Stage 3 onward)

- **Stage 3 (Build):** Implement M0–M8 per the build order; commit code with clear per-milestone breakpoints.
- **Stage 4 (Integration testing):** Run the full app; exercise all 6 pages, voice/text/agent control, reduced-motion gating.
- **Stage 5 (Care suite verification):** Have the user (disabled, non-technical) voice-control the app; measure comfort + accessibility.
- **Stage 6 (Performance profiling):** Verify 60fps across all devices; audit DevTools Perf for layout shifts or main-thread blocking.
- **Stage 7 (Reduced-motion audit):** Disable motion; verify graceful fallbacks; test calm mode.
- **Stage 8 (Acceptance criteria checklist):** Run through all 30+ criteria in section 11 (Acceptance Criteria).
- **Stage 9 (Final comparison):** Compare the built result against this spec; document any deviations; ship or iterate.

