# Dock Carousel + Global Animation/Interaction Layer — STAGE 1 RESEARCH

**Task (queued):** Turn the dock into a slide/BLEND carousel of mini-apps (each app a card that
slides/blends in with full cinematic animation); give EVERY interaction (hover, tap, open, close,
drag, toggle, fly) a polished animation; build a REUSABLE animation + interaction layer and apply it
to ALL apps, pages and panels where missing; wire every app into JARVIS voice + text control.

**Status:** Stage-1 research complete (repo read + 2026 web research). No code written yet.
**Date:** 2026-06-10. **Author:** JARVIS build engineer (autonomous).

---

## 0. TL;DR — Recommended best-in-class approach

Build **one shared, no-build, framework-free front-end runtime** — `fx.css` (motion tokens +
keyframes + interaction primitives) + `fx.js` (a tiny WAAPI/spring engine + interaction behaviors +
a single **App Registry ontology**) — served as static files by `dashboard.py`, and `<link>`/`<script>`
included into **all six HTML pages**. The dock becomes a **scroll-snap + ::scroll-marker carousel**
(native CSS where supported, JS-paged fallback) whose cards **blend in with depth** via the Web
Animations API and the **View Transitions API**. The **same App Registry** drives the dock render,
the voice router, the chat intent table, the server `/chat` router, AND a set of new agent tools
(`ui.app.open`, `ui.carousel.goto`, …) — so every mini-app is voice-, text- and agent-invokable from
a single source of truth. All motion is compositor-only (transform/opacity), GPU-friendly, and
**hard-gated behind `prefers-reduced-motion` + JARVIS "calm mode"** (non-negotiable: the primary user
is disabled / accessibility-first).

This is the **most advanced** option on the table (native CSS carousel primitives + WAAPI spring +
View Transitions + motion-token design system + ontology-driven control), not the easy one (a CSS
`transition` sprinkle). It mirrors how Apple (spring physics + Liquid Glass + Dock magnification),
Google (Material 3 **Expressive** physics tokens), and Palantir (ontology-as-single-source-of-truth)
actually ship this.

---

## 1. Repo findings — what exists today (concrete)

### 1.1 The dock (`server/jarvis_live.html`)
- **HTML:** `<div id=dock>` at `:329`; a glass bar `right:18px;bottom:130px;z-index:26;display:flex`
  (`:98–130`). Items rendered by JS, not markup.
- **App model:** `const DOCK=[…]` at `:556–567` — 10 apps, each `{k,ic,t,fn}` (key, emoji glyph,
  title, click handler). Apps: talk, library, create, image, 3d, guardian, climate, agent, vitals,
  upgrades.
- **Render:** `renderDock()` `:568–578` builds `.di` tiles (glyph `.gly` + name `.nm`); click →
  `it.fn()`. `wireDockMagnify()` `:579–583` does a **mac-Dock genie magnify** on mousemove
  (`scale(1..1.55)` by cursor distance) but with **NO transition** (instant transform → abrupt).
- **Drag:** `wireDockDrag()` + grip `#dockGrip` reposition the whole dock; bodies can be **dragged
  from the 3D canvas and pinned** onto the dock (`pinBodyToDock`, `:584–651, 1677–1713`). Pins +
  order + position persisted to `localStorage`.
- **It is a flex BAR today, not a carousel.** No paging, no scroll-snap, no card slide/blend.

### 1.2 Panels / mini-apps
- 4 glass panels `pInfra/pPipe/pKnow/pFab` (`:201–278`), 3-state width toggle `setPanelState()`
  (`:657–677`), eased `width/transform .42s cubic-bezier(.22,1,.36,1)`.
- Single contextual **card** `#card` (`:33–50, 834–873`) — `transition:transform .32s
  cubic-bezier(.22,1,.36,1),opacity .28s`; `.open` → `translateY(20px) scale(.96)` → `none`.
- Self-Dev bar `#sdev`, Crystal caption `#crystal`, fullscreen overlays `#ovGuardian`/`#ovLib`
  (`setMode()` `:817–832`).
- Z-layers: card 24 · talkbar 25 · dock/sdev 26 · overlays 30 · boot 90.

### 1.3 Existing animation inventory
- **CSS keyframes:** `bl` (blink), `micp` (mic ring), `spin` (boot), `irid` (conic-gradient border via
  `@property --ang`). Care pages add `drift/pulse/scan/sospulse/daisPulse/flick/rip/pulseRing/hp/pl`.
- **JS:** `tween()` `:1638–1647` (rAF camera fly, easeInOutQuad); the `PULSE` system `:440–474`
  (single breathing/speaking source feeding every 3D object); liquid-metal vertex morph; bloom/godray
  swell. **All hand-rolled rAF + shader uniforms.**
- **Polished already:** card open, panel width, fly-to focus pull, face assembly. **Abrupt/missing:**
  dock magnify, dock item tap, app open/close (apps just appear), toggles, drag pickup/drop,
  overlay show is a bare `.3s` opacity, sdev collapse, care-page buttons.

### 1.4 Libraries
- **Three.js r149** (live) / r136 (voice) via unpkg + postprocessing; `@google/model-viewer 3.5`.
- **NO GSAP, NO Framer Motion, NO animation lib.** Pure CSS + rAF + DOM.
- **No build step.** Every page is a **standalone inlined `<style>`/`<script>`** served verbatim by
  `dashboard.py` `_tmpl()` (`:1681`). **No shared CSS/JS file exists** — tokens are duplicated and
  *inconsistent* (3 different cyans: `#29E7FF` vs `#22d3ee` vs `#7af3ff`; spacing scale only in
  `jarvis_voice.html`). This is the single biggest structural gap.

### 1.5 Control wiring (how to make an app voice/text/agent-invokable)
End-to-end pattern confirmed across 4 files:
| Channel | File | Hook | Shape |
|---|---|---|---|
| Voice | `jarvis_voice.html` | `handle(t)` `:717–729` | add regex → call handler before `talk(t)` |
| Text (client) | `jarvis_live.html` | `askJarvis()` `:487–501` | add regex → local fn or POST `/chat` |
| Text (server) | `dashboard.py` | `/chat` `:1985–2024` | regex on `_l` → handler → `{ok,reply}` |
| Agent/swarm | `server/agent/tools.py` | `register(Tool(...))` `:74–106, 908` | typed tool `{id,name,description,input_schema,risk,timeout,handler,tags}`; called via `tools.call(id,args,ctx)`, surfaced at `GET /agent/tools`, run via `POST /agent/run` |

Today these four are **hand-edited per feature** → drift. The new layer should make the **App
Registry the single source** that *generates* all four.

### 1.6 Pages that must adopt the reusable layer
`jarvis_live.html` (main), `care.html` (patient), `guardian.html` (caregiver), `jarvis_voice.html`
(voice+3D), `dashboard_v2.html` (metrics), `dashboard_graph.html` (graph). Care pages are the most
animation-starved (guardian = 2 keyframes, both static/abrupt) and are a **disabled user's lifeline**
→ they get the layer too, but every motion must respect calm/reduced-motion.

---

## 2. 2026 web research — latest proven tech

### 2.1 Native CSS Carousel (CSS Overflow L5) — primary dock mechanism
Two new pseudo-elements generate accessible carousel UI with **zero JS**:
- `scroll-marker-group: after` on the scroll container + `li::scroll-marker{content:attr(data-acc)}`
  → a **dot indicator per card**; browser handles click-to-scroll, **arrow-key nav, Tab, ARIA
  `tablist/tab`** automatically. Active dot = `:target-current`.
- `ul::scroll-button(left/right){content:"◄"/"Previous"}` → **stateful prev/next buttons**, auto
  `:disabled` at the ends, scroll ~85% of viewport per press.
- Built on `overflow-x:scroll; scroll-snap-type:x mandatory; li{scroll-snap-align:center}`.
- **Support:** Chrome 135+ (Mar 2025), Safari 18.2 (Dec 2025) → ~75% global mid-2026. **Strategy:**
  progressive enhancement — scroll-snap + JS pager works everywhere; `::scroll-button`/`::scroll-marker`
  upgrade where present (feature-detect `CSS.supports('::scroll-marker-group','after')`).
- **Why it fits:** accessible-by-default (matters enormously here), keyboard + screen-reader native,
  and the snap container is the natural home for "each app is a card that slides in."

### 2.2 View Transitions API — the "blend in" for opens/closes/page hops
- `document.startViewTransition(cb)` snapshots before/after and **crossfades + morphs** matched
  elements (`view-transition-name`) automatically. Same-document (open a panel/card, switch dock
  page) **and cross-document** (care.html ↔ guardian.html ↔ jarvis_live.html).
- **Support:** Chrome 126+, Safari 18.2 cross-document → production-ready in 2026.
- **Best practice (from research):** animate **transform/opacity only** (compositor thread, no
  layout/paint); keep **<300ms** (longer inflates INP / blocks interaction); add
  `contain:layout` to named elements; for cross-doc pair with **speculation-rules prerender**;
  mind the **4s browser timeout**. Always wrap: `if(!document.startViewTransition){cb();return;}`.
- **Use for:** dock card open→app (shared-element morph: the tile expands into the panel), app close,
  page transitions between the care suite, panel state changes.

### 2.3 Animation engine: Web Animations API + a tiny spring helper (NOT a heavy lib)
- Research verdict: **Motion** (motion.dev, absorbed Motion One) is the fastest-growing lib, built on
  **WAAPI** (~compositor-accelerated), **2.5–6× faster than GSAP** at animating
  unknown/typed values, modular/tree-shakeable, ~tiny vanilla core. GSAP wins for huge timelines /
  SVG morph / scroll sequences; React Spring/Framer for React (we're not React).
- **Decision:** stay **dependency-light + no-build** → hand-roll a ~3KB `spring()`/`animate()` helper
  over **WAAPI** (`element.animate(keyframes,{duration,easing})`), mirroring Motion One's approach,
  with the option to **vendor Motion's mini build** (`motion-dom`, offline copy under
  `server/services/.vendorfx/` like the existing `.vendor136`) if we want its `spring()` generator and
  interruptible velocity handoff. WAAPI gives us: off-main-thread transform/opacity, `.cancel()`/
  `.reverse()` for interruption, `getAnimations()` for orchestration. **No CDN runtime dependency**
  (CDN already used only for Three.js; we keep the FX layer local for resilience).

### 2.4 Motion design tokens — the shared "language of motion"
Modern design systems encode motion as **tokens** (duration / easing / spring stiffness+damping /
delay) exported to **CSS custom properties**, so every page animates consistently and reduced-motion
is a single switch. We adopt this: a `:root` motion block in `fx.css` + JS mirror in `fx.js`.

### 2.5 Performance + accessibility (hard requirements)
- **Compositor-only:** animate `transform`/`opacity` exclusively; the Composite stage is cheap vs
  Layout/Paint. Manage `will-change` (add on interaction start, remove on end — never leave it on).
  Use `contain` + GPU layers. Budget 60fps; the DOM FX layer must **not fight the Three.js rAF loop**
  → WAAPI/CSS run on the compositor, keeping the main thread free for WebGL.
- **FLIP** (First-Last-Invert-Play) for layout/reorder moves (dock reorder, pin, carousel paging):
  measure rects, apply inverse transform, `element.animate()` to identity. The only correct way to
  animate layout changes at 60fps.
- **`prefers-reduced-motion` + calm mode:** WCAG 2.3.3 (Animation from Interactions). The FX engine
  reads `matchMedia('(prefers-reduced-motion: reduce)')` AND a JARVIS `A11Y`/calm flag; when set,
  **all non-essential motion collapses to instant or a 1-frame opacity fade**, magnify disabled,
  blend → cut. This ties into the queued **Accessibility Core** ([[accessibility-core]]).

---

## 3. How a top-tier company would architect this

- **Apple (HIG / visionOS):** motion **reinforces the relationship between action and result**;
  **spring physics** with subtle interruptible rebound (SwiftUI `.snappy` ≈ response .4/damping .85,
  `.bouncy` ≈ .5/.7); **Liquid Glass** material; **Dock magnification** = distance-weighted scale
  curve (we already have the curve — make it *spring-eased + interruptible*). Principles: Clarity,
  Deference, Depth, Consistency → cards gain depth/parallax, motion never distracts from content.
- **Google (Material 3 Expressive, I/O 2025, backed by 46 studies/18k people):** **physics spring
  tokens** replacing fixed duration/easing — **spatial** springs (position/size/rotation, *overshoot
  & settle*) vs **effects** springs (color/opacity, *no overshoot*); 2 schemes (expressive/standard)
  × 3 speeds (fast/default/slow). Carousel is a first-class M3 component. We encode both spring
  families as tokens.
- **Palantir (Gotham/Foundry + Blueprint):** **ontology as the single source of truth** + dense,
  deterministic, keyboard-first, accessible interfaces. → the **App Registry is a small ontology**:
  each mini-app is a typed object `{id,name,glyph,group,capabilities,voice[],open(),agentTool}` that
  *projects* into the dock, the intent routers, and the agent tool layer. One edit, all surfaces
  update. Blueprint-grade token discipline (no duplicated cyans).
- **Meta (velocity + gesture polish):** shared interaction primitives (press, drag, fling) with
  consistent spring feel across every surface; ship fast by reusing one motion kernel everywhere.
- **NVIDIA (GPU-grade):** everything on the GPU/compositor; 60fps floor; bloom/RTX look already
  present in the 3D layer — the 2D FX layer matches that fidelity without stealing GPU from WebGL.

---

## 4. Recommended architecture (what Stage 2 builds)

### 4.1 File manifest (new, all no-build, served by `dashboard.py` as static)
```
server/static/fx.css   # motion tokens (:root) + keyframes + interaction primitive classes
server/static/fx.js    # MotionFX engine + interaction behaviors + App Registry + intent bridge
server/static/apps.js  # the App Registry data (single source of truth for all mini-apps)
```
Add a static route in `dashboard.py` (e.g. `/static/*` → `server/static/*`, `text/css`/`application/javascript`).
Include into all 6 pages: `<link rel=stylesheet href=/static/fx.css>` + `<script src=/static/fx.js defer>`.
(Mirror the offline-vendor pattern already used at `server/services/.vendor136/` for resilience.)

### 4.2 Motion tokens (`fx.css :root`) — adopt M3 Expressive + Apple springs
```
--dur-1:80ms; --dur-2:150ms; --dur-3:240ms; --dur-4:320ms; --dur-5:480ms;   /* M3-style scale */
--ease-standard:cubic-bezier(.2,0,0,1);
--ease-emph:cubic-bezier(.2,0,0,1);            /* emphasized (hero) */
--ease-emph-decel:cubic-bezier(.05,.7,.1,1);   /* enter */
--ease-emph-accel:cubic-bezier(.3,0,.8,.15);   /* exit */
--ease-spring:cubic-bezier(.22,1,.36,1);       /* the app's existing snappy spring — keep */
--spring-spatial: stiffness 380, damping 30;   /* overshoot+settle (JS spring) */
--spring-effects: stiffness 300, damping 40;   /* no overshoot (JS spring) */
--z-card / --z-dock / --z-overlay …            /* unify the z-layer scale */
```
Plus a **canonical color/space/radius token set** (resolve the 3-cyan inconsistency; lift the
`--s1..--s6`/`--r1..` scales out of `jarvis_voice.html` into the shared file). Source from the
existing `design-tokens.json` so brand stays consistent.

### 4.3 `fx.js` — MotionFX engine (public API)
```
FX.animate(el, keyframes, opts)      // WAAPI wrapper, respects reduced-motion
FX.spring(el, props, {spatial|effects})  // physics spring via WAAPI sampling
FX.flip(els, mutate)                 // FLIP for layout/reorder (dock pin, carousel page)
FX.viewTransition(mutate, names?)    // startViewTransition wrapper + fallback
FX.reveal(el)                        // blend/slide-in on mount (cards, panels)
FX.ripple(el,event) / FX.press(el) / FX.magnetic(el) / FX.tilt(el)  // interaction primitives
FX.reduced()                         // true if prefers-reduced-motion OR calm mode
```
- **Interaction primitives auto-applied** by data-attribute or class so existing markup opts in with
  one class: `.fx-press`, `.fx-magnet`, `.fx-reveal`, `.fx-ripple`. A `MutationObserver` wires new
  nodes automatically (dock re-renders, dynamic cards).
- **Every interaction** named in the task maps to a primitive: hover→`magnetic`/scale-spring,
  tap→`press`+`ripple`, open→`viewTransition`+`reveal`, close→reverse, drag→FLIP+lift shadow,
  toggle→spring knob, fly→existing `tween()` upgraded to spring + view-transition handoff.

### 4.4 Dock → blend carousel
- Convert `#dock` to a **scroll-snap carousel** of **app cards** grouped into pages (e.g. 5 apps/page),
  `scroll-snap-type:x mandatory`, `::scroll-marker-group` dots + `::scroll-button` arrows where
  supported; JS pager fallback (`FX.flip` for the page slide). Each card **blends in** with a
  depth/parallax stagger (`FX.reveal`, spatial spring, slight Z-translate + blur-to-sharp).
- **Preserve** existing magnify (re-eased as spring), drag-to-pin, reposition, localStorage. Magnify
  becomes carousel-aware (only the focused page magnifies).
- Opening an app = shared-element **View Transition**: the card morphs into the panel/overlay.

### 4.5 App Registry = single source of truth (Palantir ontology pattern)
`apps.js` exports `APPS = [{ id, name, glyph, group, voice:[regex…], text:[regex…], open(), close(), agent:{tool,desc,schema} }]`.
- `renderDock()` consumes `APPS` (replaces hand-coded `DOCK`).
- A generated **intent table** feeds `handle(t)` (voice), `askJarvis()` (client text).
- A small server mirror (`server/agent/app_registry.py` or JSON emitted at build-of-page time) feeds
  `dashboard.py /chat` and **auto-registers agent tools**: `ui.app.open`, `ui.app.close`,
  `ui.carousel.next/prev/goto`, `ui.panel.setstate`, `ui.dock.pin` in `server/agent/tools.py` so the
  swarm can drive the UI. → **every app is voice + text + agent invokable, zero per-feature drift.**

### 4.6 Apply-everywhere
Adopt `fx.css`/`fx.js` in care.html, guardian.html, jarvis_voice.html, dashboard_v2.html (+graph):
replace duplicated tokens, swap bespoke keyframes for shared ones, add `.fx-*` classes to buttons/
cards/toggles. Care pages get the SAME interaction polish, all reduced-motion-gated.

---

## 5. Build order for Stage 2 (proposed)
1. **M0 Tokens+route:** add `/static` route to `dashboard.py`; write `fx.css` tokens+keyframes; verify
   served, no page regressions.
2. **M1 Engine:** `fx.js` MotionFX core (animate/spring/flip/viewTransition/reveal) + reduced-motion
   gate + MutationObserver auto-wire.
3. **M2 Interaction primitives:** press/ripple/magnetic/tilt/reveal; apply to dock items + cards in
   `jarvis_live.html` (no structural change yet).
4. **M3 Dock carousel:** scroll-snap + markers/buttons + JS fallback; blend-in stagger; preserve
   magnify/pin/drag.
5. **M4 App Registry:** extract `APPS`; regenerate dock + intent tables from it.
6. **M5 View Transitions:** card→panel shared-element opens; page transitions across care suite.
7. **M6 Agent tools + routers:** register `ui.*` tools; wire voice/client/server intents from registry.
8. **M7 Apply-everywhere:** care.html, guardian.html, jarvis_voice.html, dashboard_v2.html.
9. **M8 Accessibility+perf pass:** reduced-motion/calm audit, 60fps profiling, `will-change` hygiene,
   INP check; ties to [[accessibility-core]].

## 6. Acceptance criteria (Stage-9 gate)
- Dock is a paged blend carousel; cards slide/blend with depth; markers + arrows + keyboard work;
  magnify/pin/drag/localStorage preserved; **no JS errors** on any page.
- A reusable `fx.css`/`fx.js` exists and is included by **all 6 pages**; ≥1 shared primitive applied
  per page; tokens unified (one cyan).
- Every mini-app opens by **voice, text, and agent tool** from the single App Registry.
- All motion **collapses under reduced-motion/calm**; 60fps held; WebGL loop unaffected.
- pm2 lifelines (jarvis-dashboard/voiceclone/tasks) untouched; all features still REAL.

## 7. Risks / decisions locked
- **No-build constraint is firm** → no React/Framer; WAAPI + tiny spring helper (optionally vendor
  Motion mini, offline). **No new CDN runtime dependency** for FX (resilience).
- Native carousel pseudo-elements are ~75% support → **progressive enhancement mandatory** (JS pager
  fallback). View Transitions degrade to instant via guard.
- Care pages are a lifeline → adopt the layer but **reduced-motion/calm gating is not optional**.
- Single App Registry must stay in sync client↔server → generate the server view, don't hand-copy.

---

## Sources
- [MDN — Creating CSS carousels](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Overflow/Carousels)
- [CSS-Tricks — CSS Carousels](https://css-tricks.com/css-carousels/) · [Chrome — CSS Wrapped 2025](https://chrome.dev/css-wrapped-2025/)
- [MDN — Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using) · [Chrome — View transitions](https://developer.chrome.com/docs/web-platform/view-transitions)
- [CSS-Tricks — Cross-document view transitions gotchas](https://css-tricks.com/cross-document-view-transitions-part-1/)
- [Motion — GSAP vs Motion](https://motion.dev/docs/gsap-vs-motion) · [LogRocket — Best React animation libraries 2026](https://blog.logrocket.com/best-react-animation-libraries/)
- [Material Design 3 — Motion overview](https://m3.material.io/styles/motion/overview/how-it-works) · [M3 — Easing & duration tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs) · [M3 — Building with Expressive](https://m3.material.io/blog/building-with-m3-expressive)
- [Apple — Motion (HIG)](https://developer.apple.com/design/human-interface-guidelines/motion) · [Apple — Designing for visionOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos)
- [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) · [W3C WCAG 2.3.3 — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [Medium — Animation/Motion Design Tokens for complex design systems](https://medium.com/@ogonzal87/animation-motion-design-tokens-8cf67ffa36e9)
