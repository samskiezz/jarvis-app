# Stage 2 — DESIGN / SPEC DRAFT
## NASA-Eyes recursive hierarchy in `server/jarvis_live.html`

> Reference doc for the Stage 9 final comparison. First-draft spec of **exactly what to
> build and where**, grounded in the real substrate read in Stage 1 + verified again here
> (line anchors from the live file at the time of writing — re-grep before editing).

---

## 0. One-line goal

Turn the flat planet field in `jarvis_live.html` into a **recursive, NASA-Eyes-style
solar-system hierarchy**: planets = features/functions, moons = sub-features, satellites =
orbiting subtopic/sub-sub info. Every object opens an **animated, anchored close-panel** on
click; **double-click / Enter flies you INTO that object's own nested solar system**
(recursive φ), with a breadcrumb + back/Esc to ascend. All data REAL (ontology DB), self-heal
on gaps, never "pending", never a JS error, never risk the pm2 lifeline.

---

## 1. NASA-Eyes (`eyes.nasa.gov/apps/asteroids`) UX patterns we adopt

Distilled from Stage-1 research + the asteroids app's interaction model. We adopt these,
mapped onto our feature-ontology domain:

| NASA Eyes pattern | Our mapping |
|---|---|
| One persistent info panel (not N floating windows) | Keep the single `#card`, but **anchor it to the selected object with a leader line** + spring animation so it reads as per-object. |
| "Focus / Visit" button → eased camera flight, object becomes the center | `flyToBody` (select) + new `flyInto` (descend, object→local origin). |
| Smooth cubic-eased camera tweens, never a cut | Reuse `tween()` easing; add crossfade on level change. |
| Hover reveals label; labels declutter at distance | Distance-based label opacity + max-N visible labels. |
| Search-to-fly | Already present (`flyToQuery`). Extend to descend matches. |
| "Back to solar system" affordance / orbit context ring | Breadcrumb bar + Back/Esc + faint parent "context ring" at level−1. |
| Close-approach **list** inside the panel | Satellite/subtopic **list** inside the Object-View panel (click row → fly to that satellite). |
| Timeline scrubber (their app is time-based) | **Out of scope** — our axis is feature-space, not time. Logged as a future "live-data time" opt-in, not built. |

---

## 2. Existing substrate we REUSE (do not rebuild) — verified line anchors

| Capability | Symbol | Anchor |
|---|---|---|
| Golden-angle phyllotaxis (per-object) | `phyllo(i,importance,type)` | `:1372` |
| Vogel/sunflower placement (major planets, self-similar per level) | `vogel(i,importance,R0,k)` | `:1382` |
| Golden constant | `GOLDEN = π(3−√5)` (137.50776°) | `:1370` |
| Level-0 planets from real manifest | `WORLD_MANIFEST` (16 domains+31 topics, real counts) | `:395` |
| Domain planet builder | `buildDomainPlanets()` | `:1395` |
| Proxy-orb→GLB-swap factories | `addBody(o)` `:1299`, `addManifestBody(o)` `:1325` |
| Flat registry | `bodies[]`, `bodyMap`, `_selected`, `flying`, `clock` | `:903` |
| Camera home | `home={pos:(0,60,320),tgt:(0,0,0)}` | `:904` |
| Camera tween (no lib) | `tween(toPos,toTgt,ms,then)` | `:1640` |
| Select fly | `flyToBody(b)` (offset 46 along view dir) | `:1644` |
| Return | `flyHome()` | `:1647` |
| Raycast click | `onCanvasClick(e)` (bodies + constellation inst) | `:1714` |
| Select + card | `selectBody(b)` → `showCardWithFns` | `:1728` |
| Single info card (NASA-Eyes style) | `showCard(o)` `:840`, `closeCard()` `:837` |
| Async drill (REAL) | `openDetail(kind,name)` → `/detail` | `:854` |
| Card action router | `doAction(a)` kinds drill/file/media/url/graph/task/open/_fn | `:861` |
| Instanced swarm reference impl | `buildConstellation()` InstancedMesh + raycast instanceId | `:1616` |
| Concurrency-capped GLB queue | `enqueueGLB`, `_glbCache`, `MAX_GLB=6` | `:1255` |
| Birth pulse FX | `window.firePulseSpike(x)` | `:1634` |

**REAL data endpoints for hydration (verified in `dashboard.py`):**
- `/detail?kind=type:<Domain>` → `_detail()` `dashboard.py:819` returns up to 30 recent
  `ont_object` rows of that type (real labels) → **moons / satellite rows**.
- `/graphdata` → `_graph_data()` `dashboard.py:360` returns typed `{nodes,edges,colors}` from
  `ont_link` (RELATES_TO/DESCRIBES/IN_TOPIC/…) → **linked-object moons + neighbor satellites**.
- `/detail?kind=runner|module` → live pm2 logs / lessons for system-object moons.
- Self-heal seam: existing `scene_acquire`→`brain_research` path for empty children (never "pending").

---

## 3. Data model (new)

A lightweight **Node** object layered over the existing meshes — meshes stay the render
primitive; `Node` carries hierarchy + lazy hydration.

```js
// Node = one object at any level of the hierarchy.
Node = {
  id,            // stable key, namespaced: 'dom:Measurement' / 'moon:<domain>/<type>' / 'sat:<id>'
  label,         // visible title
  kind,          // 'planet' | 'moon' | 'satellite'
  depth,         // 0=planet, 1=moon, 2=satellite (3+ allowed via recursion)
  parent,        // Node | null
  color, glbUrl, // visual
  count,         // real ont_object count (sizes the body; null if leaf)
  importance,    // 0..1 (drives vogel radius + size; from log(count)/maxLog or pagerank)
  childrenSpec,  // async ()=>Node[]  — lazy; resolves from /detail|/graphdata; null = leaf
  card,          // ()=>cardObject  — Object-View panel content (title/subtitle/props/lines/bar/actions)
  mesh,          // THREE.Object3D bound after build (or instance ref for satellites)
  _hydrated,     // bool — childrenSpec resolved once, cached
  _children,     // Node[] cache
};
```

- **Level-0 nodes** are synthesized from `WORLD_MANIFEST` (the 16 domains + topic belt) — the
  exact same data `buildDomainPlanets()` already uses; we wrap each in a `Node` with a
  `childrenSpec` that calls `/detail?kind=type:<domain>` (+ `/graphdata` typed neighbors).
- **Moons** = a domain's real sub-types / top linked-object types (deduped, ranked by count).
- **Satellites** = individual `ont_object` records / neighbor nodes for a moon → rendered as an
  **InstancedMesh swarm** (1 draw call/moon), each instance selectable.
- **Deeper recursion**: any node whose `childrenSpec` yields children is descendable — the same
  `buildSystem` runs at depth N with φ-conjugate scaling, so "fly into a satellite" works the
  same way as "fly into a planet" (true recursive φ). Optional new REAL endpoint
  `/children?id=<ont_id>` (small `ont_link` neighbor query in `dashboard.py`) if `/graphdata`
  edges prove too coarse for per-object descent; flagged optional, not required for v1.

---

## 4. Navigation model: `navStack` + frames + breadcrumb

```js
// A frame = one entered system (one local coordinate world centered on its focus node).
Frame = { node, group:THREE.Group, bodyNames:[], home:{pos,tgt}, satSwarms:[] };
let navStack = [ rootFrame ];           // rootFrame.node = the Universe (Sun)
function currentFrame(){ return navStack[navStack.length-1]; }
```

- **Local recentre per level** (precision-safe, NASA-Eyes-faithful): entering a node builds its
  children around a **local origin (0,0,0)** inside a fresh `THREE.Group`; the camera resets to
  that system's `home`. This avoids float-precision collapse on deep zoom (≥6 levels) that
  world-space ×0.382 nesting would hit, and matches "focused body becomes the center".
- **Breadcrumb DOM bar** (new `#crumbs`, under the search field `:288`): `Universe › Measurement
  › Sensor › …`. Each crumb clickable → `flyOut` to that depth. `aria-live="polite"`.
- **Back / Esc / Backspace** = pop one frame. **Home button** extends `flyHome()` to also unwind
  the stack to root.

---

## 5. Interaction model (the core of the request)

| Gesture | Action | Reuses |
|---|---|---|
| **Single click** on object | SELECT → fly-to + open animated anchored Object-View panel | `selectBody` `:1728`, `flyToBody` `:1644`, `showCard` `:840` |
| **Double-click / Enter / panel "Enter system ⏎"** | DESCEND → `flyInto(node)` if node has children | new `flyInto`, `buildSystem` |
| **Esc / Back / Backspace / crumb click** | ASCEND → `flyOut(toDepth)` | new `flyOut`, `flyHome` `:1647` |
| **Tab / Shift-Tab** | cycle siblings in current system (focus ring) | new |
| **Click empty space** | close panel + return (unchanged) | `closeCard` `:837` |
| **Search match** | fly-to; if match is in a child system, descend the stack to it | `flyToQuery` `:1665` |

Leaves (satellites with no children) → click opens panel; descend is a no-op (panel shows
"deepest level"). Descendability is reflected on the panel ("Enter system ⏎" only when children
exist) and by a subtle ring glyph on the body.

---

## 6. Recursive build: `buildSystem(node, frame)`

```
buildSystem(node, frame):
  1. ensure node._hydrated (await node.childrenSpec(); cache; self-heal if empty)
  2. moons = children where kind!='satellite'  (descendable sub-features)
     - place each by vogel(i, child.importance, R0=BASE*scale, k=K*scale)
       scale = φ_conj^node.depth   (φ_conj = 0.381966)   ← recursive phi, self-similar
     - build via addBody/addManifestBody into frame.group (local coords), push name→frame.bodyNames
     - lazy GLB through enqueueGLB (proxy orb shows instantly — never a flat dot/"pending")
  3. satellites = children where kind=='satellite'  (subtopic/sub-sub info)
     - one InstancedMesh swarm per parent moon (fibonacci/phyllo ring), like buildConstellation
     - store {inst, nodes, pos} on frame.satSwarms; raycast instanceId → openSatellitePanel
  4. entry FX: window.firePulseSpike(0.6) + bloom pulse at the new origin
  5. set frame.home from the bounding radius of the built system (frame the whole level)
```

- **Semantic-zoom LOD (ZUI)**: render **active level ±1**. On descend, parent frame's bodies
  fade to a faint "context ring" (opacity ~0.12, labels off); grandparent hidden/disposed.
  On ascend, reverse. Implemented as a per-frame `setLevelOpacity(frame, k)` lerp driven in the
  render loop (`:1759`).
- **Crossfade**: descend = parent dims out (300ms) while child group fades in (spring) — no hard
  cut. Reuse `tween` for the camera; a small opacity tween for the groups.
- **Disposal**: on ascend past a frame, dispose its group geometries/materials + instanced
  swarms to bound memory (deep zoom must not leak). GLB cache (`_glbCache`) persists for re-entry.

---

## 7. Animated Object-View close-panel (per-object pop-up)

Upgrade the single `#card` into an **anchored, spring-animated** panel (stays one panel — clean,
NASA-Eyes-faithful — but feels per-object via anchoring + leader line):

- **Spring open/close**: transform `scale(0.92)+translateY(8px)+opacity 0 → rest`, spring
  ≈ stiffness 200 / damping 20 / bounce .06. Implemented with a tiny rAF spring (or matched
  cubic-bezier) on the existing `.open` class at `:37`. **`prefers-reduced-motion` → instant, no
  bounce.**
- **Leader line**: thin glowing SVG/line element from the panel edge to the object's projected
  screen position (`object.position.project(camera)`), updated each frame in the render loop
  (`:1759`). Hidden when the object is off-screen/occluded.
- **Content** = existing `showCard` schema (title/subtitle/props/lines/bar/actions) — REAL props
  from the node (count, importance %, GLB, type) + a **satellite/subtopic list** (click row →
  fly to that satellite) + actions: `◈ Focus in graph` (existing), `📄`/`drill` (existing
  `openDetail`), and new **`Enter system ⏎`** when descendable.
- **Self-heal state**: while `childrenSpec` resolves, the list area shows an animated shimmer
  "acquiring…", never a static "pending"; on a dead source show "not connected" (hard rule).
- Close: existing `.x` `:38` + Esc. Keep `_cardDrilled` pause-refresh semantics (`:835`).

---

## 8. Accessibility, performance, safety

- **a11y**: `prefers-reduced-motion` honored everywhere (tweens→instant, no bounce, muted
  pulse); full keyboard model (Tab siblings / Enter descend / Esc ascend / crumbs focusable);
  `aria-live` on breadcrumb + panel; visible focus ring on the focused body's label.
- **Label declutter**: distance-based opacity threshold + hard cap (~24) on simultaneously
  visible labels; only current level ±1 labelled.
- **Perf**: satellites are InstancedMesh (1 draw call/moon); GLB loads stay in the `MAX_GLB=6`
  capped queue; dispose ascended frames; never instantiate >~150 meshes on screen (LOD hides
  other levels). Keep r136 WebGL renderer — **do not** bump Three / swap to WebGPU (lifeline).
- **Safety (hard rules)**: every render-loop addition wrapped in try/catch (loop "NEVER throws"
  `:1759`); no pm2 service touched; preserve all existing features (dock, glass panels, drag-to-
  pin, constellation, search, chat); REAL data only, self-heal gaps; never leave a JS error.

---

## 9. Where the code goes (edit map in `server/jarvis_live.html`)

| New piece | Location |
|---|---|
| `#crumbs` breadcrumb DOM + CSS | header near search `:288`; CSS near `#card` block `:32` |
| Spring/anchor/leader CSS | extend `#card` rules `:32–49` |
| `Node` model + `makeRootNodes()` from `WORLD_MANIFEST` | after `buildDomainPlanets` `:1430`-ish |
| `navStack`, frames, `buildSystem`, `setLevelOpacity` | new block after `vogel`/`phyllo` `:1389` |
| `flyInto`, `flyOut`, breadcrumb render | near `flyToBody`/`flyHome` `:1644–1647` |
| Satellite InstancedMesh swarm + raycast | mirror `buildConstellation` `:1616`; hook into `onCanvasClick` `:1714` |
| dblclick + keyboard (Enter/Esc/Tab) listeners | near canvas/init wiring |
| Anchored panel + leader-line per-frame update | extend `showCard` `:840` + render loop `:1759` |
| `selectBody` split: click=select, dbl/Enter=descend | `selectBody` `:1728`, `onCanvasClick` `:1714` |
| (optional) REAL `/children?id=` neighbor endpoint | `dashboard.py` near `_detail` `:804` / `_graph_data` `:360` |

All additions are **additive** — existing `selectBody`/`showCard`/`flyToBody` keep working for
the level-0 universe even before any descend.

---

## 10. Build order (Stage-3+ execution)

1. `Node` model + `makeRootNodes()` + `navStack`/frame scaffold + breadcrumb DOM.
2. `buildSystem` reusing `vogel` (φ-conjugate scale) + lazy `childrenSpec` hydrate + self-heal.
3. Interaction split: click→select vs dblclick/Enter→`flyInto`; `flyOut`/Esc/crumbs; LOD crossfade.
4. Satellite InstancedMesh swarm (subtopic info) + instanceId raycast → panel rows.
5. Spring-animated anchored Object-View panel + leader line.
6. a11y + label declutter + entry bloom pulse + frame disposal; polish to Hollywood-cinematic.

---

## 11. Acceptance criteria (Stage 9 will check against THIS)

1. Level-0 universe unchanged on load; no regression to dock/panels/search/constellation/chat.
2. Click any planet → animated anchored panel with REAL props + satellite/subtopic list.
3. Double-click / Enter / "Enter system ⏎" → camera flies INTO that planet's **own nested
   solar system** built by φ (golden-angle, self-similar, scaled ×0.382/level); breadcrumb grows.
4. Moons are real sub-features (from `/detail`/`/graphdata`); satellites orbit as instanced
   subtopic swarm; each is independently clickable with its own animated panel.
5. Recursion works ≥3 levels deep (planet→moon→satellite→…) without float-precision collapse,
   JS error, or frame-rate cliff.
6. Esc / Back / crumb ascends with crossfade; Home unwinds to root.
7. Empty-data nodes self-heal ("acquiring…" shimmer → real data), never static "pending";
   dead source shows "not connected".
8. `prefers-reduced-motion` → instant, no bounce; full keyboard nav works.
9. r136 renderer + pm2 lifeline untouched; render loop still never throws.
10. Visual finish = Hollywood-cinematic (bloom entry pulse, eased flights, glowing leader line,
    glassmorphic panel) consistent with the existing cinematic post-stack.
