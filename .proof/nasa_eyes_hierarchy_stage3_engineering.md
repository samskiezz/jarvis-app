# Stage 3 — ENGINEERING PLAN (buildable)
## NASA-Eyes recursive hierarchy in `server/jarvis_live.html` (+ one REAL endpoint in `server/dashboard.py`)

> Turns the Stage-2 spec (`.proof/nasa_eyes_hierarchy_stage2_spec.md`) into a concrete, file-by-file,
> function-by-function build with exact line anchors, real SQL, data flow, edge cases, a11y, a
> verification harness, and a rollback. **Every anchor below was re-verified in the live files on
> 2026-06-10 and every data seam was probed against `brain.db`** (results embedded). Re-grep before
> editing — these are additive insert points, not rewrites.

---

## 0. Scope contract (what changes, what must NOT)

**Two files only.** `server/jarvis_live.html` (all UX/3D) + `server/dashboard.py` (one new read-only
GET route). **No pm2 service is touched, restarted, or reconfigured** — the lifeline (`jarvis-dashboard`
/ `jarvis-voiceclone` / `jarvis-tasks`) keeps serving the same process; `dashboard.py` is hot-served, a
new pure-read route is strictly additive. **Every existing feature is preserved**: dock, drag-to-pin,
4 glass panels, search, constellation, chat, voice, overlays. **The render loop stays the one that
"NEVER throws"** (`:1760`); every addition lands inside its existing `try{…}catch(e){}`.

---

## 1. The REAL data seam (probed, not assumed)

`brain.db` schema (verified via PRAGMA):
- `ont_object(id TEXT, type TEXT, props TEXT-json, state, created_ts, updated_ts)` — index `idx_ont_object_type` → `WHERE type=?` is fast.
- `ont_link(id, type TEXT, from_id TEXT, to_id TEXT, ts)` — indexes `idx_ont_link_from` **and** `idx_ont_link_to` → bidirectional neighbor lookup is index-backed.

**Measured timings (cold, single connection):**
| Query | Time |
|---|---|
| out-neighbors of one object (`from_id=? JOIN ont_object`) | **1.1 ms** |
| in-neighbors of one object (`to_id=? JOIN ont_object`) | **2.8 ms** |
| in-neighbors of a hub (`city:delhi`, degree 625) capped@12 | **4.5 ms** |
| top-30 objects of a type (`type=? ORDER BY rowid DESC`) | already used by `_detail` `:819`, fast |

**Two findings that shape the design:**
1. **IDs are namespaced (`meas:`/`aq:`/`city:`/`source:`/`subject:`/`topic:`/`radiation:`) but the prefix
   is NOT 1:1 with `type`.** A neighbor's `type` must be resolved by joining back to `ont_object` — you
   cannot infer it from the id. (So the moon/satellite cards always carry the real `type`+label.)
2. **Hub fan-out is real and large** — `city:delhi:in` has **625 inbound** `MEASURED_AT` links;
   `SAME_AS` has 229 k rows globally. **Per-object descent MUST cap fan-out** (`LIMIT N`, N≈14) and
   surface "+K more" — never render 625 satellites. This is the #1 perf/edge case.

**Conclusion → the performant, grounded hierarchy is per-object, not domain-wide-rollup:**
A domain-wide "neighbor-type rollup" needs an unindexed aggregate join over 111 k rows (slow). The
indexed, fast path is:

```
Planet (domain)            children = top-N representative ont_objects of that type   (idx_ont_object_type)
  └ Moon (an ont_object)   children = that object's capped ont_link neighbors         (idx_ont_link_from/to)
      └ Satellite (object) children = ITS neighbors … (recursive, same indexed query) → true recursive φ
```

Every level is one index-backed query. Recursion is uniform: "fly into a satellite" runs the exact same
neighbor query as "fly into a planet's moon".

---

## 2. NEW server route — `server/dashboard.py`

### 2.1 `_children(node_id, node_kind, exclude_id, limit)` — new function (insert after `_detail` ends, `:846`)

A single pure-read resolver that returns a node's children as render-ready rows. Branches on `node_kind`:

```python
# colors already exist: GRAPH_COLORS :354 ; title resolver: _ont_title() :419 ; BRAIN_DB :36 ; _cached :79
def _children(node_id: str, node_kind: str, exclude_id: str = "", limit: int = 14) -> dict:
    """REAL children for the recursive NASA-Eyes hierarchy. Pure read; index-backed; capped.
       node_kind:
         'type:<Domain>'  -> moons  = top-N recent ont_objects of that domain type
         'obj:<id>'       -> satellites = capped bidirectional ont_link neighbors of <id>
       Returns {parent, kind, children:[{id,type,label,color,rel,dir}], total, truncated}."""
    def build():
        try:
            c = sqlite3.connect(BRAIN_DB, timeout=5); c.execute("PRAGMA query_only=1")
            out, seen = [], set()
            if node_kind.startswith("type:"):
                typ = node_kind.split(":", 1)[1]
                total = _count(BRAIN_DB, "SELECT COUNT(*) FROM ont_object WHERE type=?", typ) or 0
                for oid, props in c.execute(
                        "SELECT id,props FROM ont_object WHERE type=? ORDER BY rowid DESC LIMIT ?",
                        (typ, limit)):
                    if oid in seen: continue
                    seen.add(oid)
                    out.append({"id": oid, "type": typ, "label": _label(props) or oid,
                                "color": GRAPH_COLORS.get(typ, "#9bd4e6"), "rel": "instance", "dir": "down"})
            else:  # 'obj:<id>'  — bidirectional indexed neighbor walk
                oid = node_kind.split(":", 1)[1] if ":" in node_kind else node_id
                total = (_count(BRAIN_DB, "SELECT COUNT(*) FROM ont_link WHERE from_id=?", oid) or 0) \
                      + (_count(BRAIN_DB, "SELECT COUNT(*) FROM ont_link WHERE to_id=?", oid) or 0)
                rows = c.execute(
                    "SELECT o.id,o.type,o.props,l.type rel,'out' dir FROM ont_link l "
                    "JOIN ont_object o ON o.id=l.to_id WHERE l.from_id=? LIMIT ? ", (oid, limit)).fetchall()
                rows += c.execute(
                    "SELECT o.id,o.type,o.props,l.type rel,'in' dir FROM ont_link l "
                    "JOIN ont_object o ON o.id=l.from_id WHERE l.to_id=? LIMIT ? ", (oid, limit)).fetchall()
                for cid, ctyp, props, rel, dr in rows:
                    if cid == oid or cid == exclude_id or cid in seen: continue   # no self / back-to-parent
                    seen.add(cid)
                    out.append({"id": cid, "type": ctyp, "label": _label(props) or cid,
                                "color": GRAPH_COLORS.get(ctyp, "#9bd4e6"), "rel": rel, "dir": dr})
                    if len(out) >= limit: break
            c.close()
            return {"parent": node_id, "kind": node_kind, "children": out,
                    "total": total, "truncated": total > len(out)}
        except Exception as e:  # noqa: BLE001  — never 500 the lifeline; return empty so the page self-heals
            return {"parent": node_id, "kind": node_kind, "children": [], "total": 0,
                    "truncated": False, "error": str(e)[:120]}
    return _cached(f"children::{node_kind}::{exclude_id}::{limit}", 30.0, build)
```

`_label(props)` = tiny helper reusing the same priority keys as `_ont_title()` (`:419`) / `_detail`
(`:828`). Add it next to `_ont_title` or inline a 4-line version. **No new dependency, no write path,
`PRAGMA query_only` belt-and-braces.** Cached 30 s like `_graph_data` (`:397`) so repeated descents are
free and DB pressure is bounded.

### 2.2 Route dispatch (insert in `do_GET`, right after the `/detail` branch `:1741-1745`)

```python
elif self.path.startswith("/children"):
    from urllib.parse import urlparse, parse_qs
    q = parse_qs(urlparse(self.path).query)
    def _i(k, d):
        try: return int(q.get(k, [str(d)])[0] or d)
        except Exception: return d
    self._send(json.dumps(_children(
        q.get("id", [""])[0], q.get("kind", [""])[0],
        q.get("exclude", [""])[0], min(40, _i("limit", 14)))).encode(), "application/json")
```

`min(40, …)` hard-caps the fan-out server-side regardless of client. **`/children` is the only server
change.** `/detail` (`:1741`) and `/graphdata` (`:1746`) are untouched and still feed the existing card
drills + constellation. If `dashboard.py` editing were ever forbidden, the client degrades to
`/detail?kind=type:` for moons + `/graphdata` edges for satellites (Stage-2 fallback) — `/children` is
the *better* seam, not a hard dependency.

---

## 3. Client data model — `server/jarvis_live.html`

Insert the model + nav scaffold as **one new block after `vogel()` (`:1388`)**, before
`buildDomainPlanets` (`:1395`). All names are new (no collisions — grepped).

```js
/* ===== NASA-Eyes recursive hierarchy: Node model + nav stack (additive) ===== */
const PHI_CONJ = 0.381966011;                         // 1/φ² — recursive self-similar scale per level
function makeNode(o){ return Object.assign({
  id:o.id, label:o.label, kind:o.kind||'planet', depth:o.depth||0, parent:o.parent||null,
  color:o.color||COLORS.kpi, glbUrl:o.glbUrl||null, count:o.count??null,
  importance:o.importance??0.5, childrenKind:o.childrenKind||null,  // '/children?kind=' arg, or null=leaf
  card:o.card||null, mesh:null, _hydrated:false, _children:null }, o); }
```

- **Level-0 nodes** (`makeRootNodes()`): wrap each `WORLD_MANIFEST.domains` entry (`:395`) — the *same*
  data `buildDomainPlanets()` (`:1395`) already consumes — in a `makeNode({kind:'planet', depth:0,
  childrenKind:'type:'+dom, …})`. Topics belt → `childrenKind:null` for v1 (leaf belt; they have no
  `type:` table) unless a topic maps to a domain. **Zero new data fetched at load** — root nodes are
  synthesized from the embedded manifest exactly as today.
- **Hydration**: `await hydrate(node)` → `fetch('children?id='+id+'&kind='+childrenKind+'&exclude='+
  parentId)` → maps each row to a child `makeNode({kind: depth>=1?'satellite':'moon',
  depth:node.depth+1, parent:node, childrenKind:'obj:'+row.id, …})`. Cached on `node._children`,
  `node._hydrated=true`. **Leaves** (`childrenKind===null`, or hydrate returns `[]` that self-heal can't
  fill) → descend is a no-op; panel shows "deepest level".

```
DATA FLOW (one descent):
 dblclick/Enter on body  → nodeForMesh(mesh)  → flyInto(node)
   → hydrate(node)  ──fetch──▶  /children?id&kind&exclude  ──▶ _children() ──▶ brain.db (indexed, 30s cache)
   → makeNode[] children  → buildSystem(node, newFrame)  → vogel(i, imp, R0·s, k·s)  (s = PHI_CONJ^depth)
   → moons via addBody into frame.group ; satellites via InstancedMesh swarm  → navStack.push(frame)
   → setLevelOpacity crossfade ±1 ; breadcrumb render ; firePulseSpike(0.6)
```

---

## 4. Navigation: frames + `navStack` + breadcrumb

```js
let navStack = [];                                  // navStack[0] = root universe frame
function currentFrame(){ return navStack[navStack.length-1]; }
// Frame = one entered local coordinate world:
// { node, group:THREE.Group(at 0,0,0), bodies:[mesh], swarms:[{inst,nodes,pos}], home:{pos,tgt}, opacity:1 }
```

**Local recentre per level** (the precision-safe choice from Stage-2 §4): each descend builds children
around a fresh `THREE.Group` at local origin and resets the camera to that frame's computed `home`
(from its bounding radius). This avoids float collapse past ~6 levels that world-space ×0.382 nesting
would hit, and *is* "focused body becomes the center". The root frame wraps the existing universe
(its `group` = a passthrough; root bodies stay in `scene` exactly as today — **no reparently of the
existing universe**, so level-0 is byte-for-byte unchanged on load).

**Breadcrumb DOM** — insert after the search input (`:288`), inside `#top`:
```html
<nav id=crumbs aria-label="Universe location" aria-live=polite></nav>
```
CSS near the `#card` block (`:32`): a thin glass pill row, `pointer-events:auto`, hidden when
`navStack.length<=1`. Each crumb = `<button class=crumb data-depth=k>` → `flyOut(k)`; chevrons between.
`renderCrumbs()` rebuilds from `navStack.map(f=>f.node.label)`.

---

## 5. Recursive build — `buildSystem(node, frame)`

New function block after `buildDomainPlanets` (`:1429`). Reuses **`vogel`** (`:1382`), **`addBody`**
(`:1299`), **`enqueueGLB`** (`:1260`), **`makeLabel`**, **`firePulseSpike`** (`:1634`) — no new 3D
primitives.

```
buildSystem(node, frame):
  1. children = await hydrate(node)            // cached; self-heal shimmer while pending
  2. s = PHI_CONJ ** node.depth                // recursive φ scale (self-similar)
  3. moons = children.filter(c => c.childrenKind)         // descendable
     satellites = children.filter(c => !c.childrenKind)   // leaves → instanced swarm
  4. moons.forEach((m,i)=>{ P = vogel(i, m.importance, 300*s+40, 30*s);
        mesh = addBodyLocal(m, frame.group, P);           // addBody variant that adds to group, not scene
        m.mesh = mesh; frame.bodies.push(mesh); enqueueGLB(m.glbUrl,…) })  // proxy orb instant, GLB lazy
  5. if satellites.length: frame.swarms.push(buildSatSwarm(satellites, frame.group, s))  // 1 draw call
  6. frame.home = framingFor(frame)            // bounding-sphere → camera home for this level
  7. firePulseSpike(0.6)                        // entry bloom pulse (reuses existing FX)
```

- **`addBodyLocal`** = a 12-line variant of `addManifestBody` (`:1325`) that takes a `parent group`
  + precomputed local `{radius,angle,y}` and pushes to `frame.bodies` instead of the global `bodies[]`.
  Rationale: the global `bodies[]` + idle-orbit pulse loop (`:1777`) must keep operating on level-0 only;
  per-frame bodies get their pulse from a small per-frame loop hook (see §8). Keeps level-0 behavior
  identical.
- **`importance`** per child = `log10(1+count)/maxLog` when the child has a count (domain moons), else a
  rank-decay `1-(i/n)` from result order (neighbors arrive ranked by recency/degree). Drives vogel radius
  + body size, same law as `:1402-1405`.
- **Semantic-zoom LOD**: `setLevelOpacity(frame, k)` lerps a frame's bodies/labels/swarm opacity. On
  descend: parent frame → 0.12 "context ring", labels off; grandparent → hidden (group.visible=false).
  On ascend: reverse. Driven each frame in the render loop (§8). Only **active level ±1** ever renders
  labels → satisfies the ≤24-visible-label declutter rule.

---

## 6. Satellite swarm — `buildSatSwarm(nodes, group, s)`

Mirror of `buildConstellation` (`:1616`) but **local + per-moon + selectable**:

```
geo = SphereGeometry(1.6*s,10,10) ; inst = InstancedMesh(geo, MeshBasicMaterial, nodes.length)
nodes.forEach((n,i)=>{ phyllo-ring placement around local origin (reuse phyllo() :1372 or fib-sphere
  like :1624), setMatrixAt, setColorAt(n.color) })
group.add(inst) ; return { inst, nodes, pos }
```

Raycast: extend `onCanvasClick` (`:1714`) so `targets` also includes `currentFrame().swarms.map(s=>s.inst)`
(like it already pushes `_constellation.inst` at `:1720`). On `hit.object===swarm.inst &&
hit.instanceId!=null` → `openSatellitePanel(swarm.nodes[instanceId])` (anchored panel, §7) and, if that
sat node has children, allow descend on dblclick/Enter. **1 draw call per moon**; a 625-degree hub is
already capped to ≤14 satellites at the source (§2), so swarm sizes stay tiny.

---

## 7. Animated anchored Object-View panel (the per-object pop-up)

**Reuse the single `#card`** (Stage-2 §7) — upgrade, don't fork:

- **Spring open**: extend the existing `.open` transition (`:36-37`). Current is a cubic-bezier
  `transform+opacity`; add a 2-keyframe spring (`@keyframes cardSpring` scale .92→1.02→1) gated behind
  `:root:not(.reduce-motion)`. `prefers-reduced-motion` → add `reduce-motion` class on `<html>` at boot
  → instant, no bounce (also already used to gate tweens, §9).
- **Leader line**: one `<svg id=lead>` full-screen overlay (`pointer-events:none`, under `#card`'s
  z-index). Each frame (render loop `:1797` block, where `.project(camera)` is already used for god-rays)
  compute `_selected`/active-sat `world→screen` and draw a glowing polyline from the card edge to it;
  hide when behind camera (`ndc.z>1`) or off-screen. ~10 lines, fully inside the guarded loop.
- **Content** = the existing `showCard` schema (`:840`) — REAL props (`Objects`, `Importance %`, `type`,
  `rel`, `GLB`), a **satellite/subtopic list** (each row → `flyTo` that satellite), existing actions
  (`◈ Focus in graph` `:866`, `📄`/drill via `openDetail` `:854`), **plus** a new
  **`Enter system ⏎`** action shown only when `node.childrenKind && !isLeaf`.
- **Self-heal state**: while `hydrate` is in flight the list area renders an animated **shimmer
  "acquiring…"** (CSS gradient sweep), never a static "pending" (hard rule). On `children:[] &&
  error` → row reads **"not connected"** (hard rule). On `children:[]` no-error → "deepest level".
- Close: existing `.x` (`:38`) + Esc; preserve `_cardDrilled` pause-refresh semantics (`:835`). The
  anchored panel reuses `showCardWithFns`/`showCardKeepActions` (`:1744/:1751`) so live refresh still
  works for level-0 bodies.

---

## 8. Interaction wiring (exact event-listener edits)

Current canvas wiring lives at **`:1057-1063`**:
```
$('uni').addEventListener('pointerdown', …_pinDragStart)   :1058
$('uni').addEventListener('pointermove', …_pinDragMove)    :1059
addEventListener('pointerup',  …_pinDragEnd)               :1062
$('uni').addEventListener('click', onCanvasClick)          :1063
```
**Additive edits (no existing handler removed):**

| Gesture | Wire | Maps to |
|---|---|---|
| **single click** | unchanged `onCanvasClick` `:1714` → `selectBody`/`selectNode`/sat-select | fly-to + anchored panel |
| **dblclick** | new `$('uni').addEventListener('dblclick', onCanvasDbl)` after `:1063` | `descendAt(e)` → `flyInto(node)` |
| **Enter** (panel focused / body focused) | new `keydown` on `document` | descend active node |
| **Esc / Backspace** | new `keydown` | `flyOut(depth-1)`; at root → `closeCard()` (preserve current) |
| **Tab / Shift-Tab** | new `keydown` when a frame is active | cycle `frame.bodies` focus ring |
| **crumb click** | `renderCrumbs` buttons | `flyOut(k)` |
| **search match in child system** | extend `flyToQuery` `:1665` | descend stack to the match |

`onCanvasDbl(e)` reuses `_bodyAt(e)` (`:1682`, already does the raycast→find-named-parent walk) +
swarm-instance hit-test, then `flyInto`. **Guard against pin-drag**: `_pinGrab.armed` (`:1694`) already
distinguishes a drag from a click, so dblclick can't fire mid-pin. **`flying` flag** (`:1640`) gates
re-entrancy: ignore descend/ascend while a camera tween is in flight (prevents stack corruption from
double-fire).

**`flyInto(node)`** = `tween` (`:1640`) camera to the node, then on `then()`: build frame, push stack,
crossfade. **`flyOut(toDepth)`** = pop frames down to `toDepth`, dispose popped frames'
geometries/materials/instanced swarms (bounded memory; `_glbCache` persists for re-entry), `tween` back
to that frame's `home`, reverse the LOD crossfade. **Home button** (existing `flyHome` `:1647`) extends
to also `navStack.length=1` + restore level-0 opacity.

**Render-loop hooks** (all inside the guarded `try` `:1763-1827`, each its own `try/catch` so one can
never blank the page):
1. per-frame body pulse for `currentFrame().bodies` (mirror the `:1777` loop, frame-scoped).
2. `setLevelOpacity` lerp toward each frame's target opacity.
3. leader-line `.project(camera)` update (§7), next to the existing god-ray projection at `:1797`.

---

## 9. Accessibility

- **`prefers-reduced-motion`**: at boot set `document.documentElement.classList.toggle('reduce-motion',
  matchMedia('(prefers-reduced-motion:reduce)').matches)`. Gate: spring → instant; `tween` ms → 0 (jump
  cut); entry bloom pulse muted; idle-orbit (`:1822`) already paused on interaction. One class, read
  everywhere.
- **Full keyboard model**: Enter descend / Esc ascend / Tab siblings / crumbs are real `<button>`s →
  native focus + Enter/Space. Visible focus ring on the focused body's HTML label (`makeLabel` sprites
  → add an outline via a focus proxy, or a DOM focus indicator mirroring the projected position).
- **`aria-live`**: `#crumbs` is `aria-live=polite` (announces "Universe › Measurement › …" on
  descend/ascend); the panel announces title/subtitle on open. The existing god-ray chip pattern
  (`role=status` `:1830`) is the template.
- **Declutter**: only active level ±1 shows labels; hard cap 24 simultaneous; distance-based opacity.
  Screen-reader users get the breadcrumb + panel list as the textual equivalent of the visual hierarchy.

---

## 10. Edge cases (each with the concrete handling)

| # | Case | Handling |
|---|---|---|
| 1 | **Hub fan-out** (delhi 625 inbound; SAME_AS 229k) | server `LIMIT N` (§2) + `truncated`/`total` → panel shows "+K more"; never builds 625 meshes. |
| 2 | **Empty children** (real but no links) | `hydrate→[]` no error → "deepest level"; descend no-ops; body loses the `Enter system ⏎` action + ring glyph. |
| 3 | **Dead DB / `/children` error** | `_children` returns `{children:[],error}` (never 500); panel row = **"not connected"** (hard rule); lifeline unaffected. |
| 4 | **Self-loop / back-edge to parent** | `exclude=parentId` param + `cid==oid` skip in SQL (§2) → no infinite "child is its own parent". |
| 5 | **Cycle in graph** (A→B→A on deep descent) | each frame passes its parent id as `exclude`; visited-set on `navStack` ids blocks re-descend into an ancestor (descend that would revisit → treated as leaf). |
| 6 | **Float-precision on deep zoom (≥6 levels)** | local recentre per frame (fresh group at origin + camera reset) — never world-space ×0.382 nesting. |
| 7 | **Mid-flight double gesture** | `flying` flag (`:1640`) gates descend/ascend; ignored until tween completes. |
| 8 | **GLB 404 / 0-byte tripo stub** | existing `addBody`/`enqueueGLB` already keep the textured proxy orb (`:1317/:1345`) + `realGLB` remap (`:1287`) — inherited, nothing to add. |
| 9 | **Mobile** (`_MOBILE` `:1286`) | inherit the heavy-GLB→light-asset swap; cap moons/level lower on coarse pointers; dblclick→ double-tap already native; bigger hit targets. |
| 10 | **Pin-drag vs descend** | `_pinGrab.armed` (`:1694`) disambiguates; dblclick suppressed while armed. |
| 11 | **Search match deep in stack** | `flyToQuery` extension descends frame-by-frame (hydrating each) to the match; if unresolvable, falls back to existing chat hand-off (`:1672`). |
| 12 | **Memory leak on deep explore** | `flyOut` disposes popped frame geo/materials/instanced swarms; `_glbCache` (shared, `:1255`) intentionally persists for instant re-entry. |
| 13 | **Selected level-0 body while descended** | `_selected` cleared on descend (mirrors `selectNode`'s clear at `:1651`) so `closeCard`'s fly-home logic stays correct. |

---

## 11. How it never breaks the lifeline (safety ledger)

1. **No pm2 op.** No restart/reload/kill anywhere in the plan. `dashboard.py` is hot-served; the new
   route is pure-read (`PRAGMA query_only`), wrapped in try/except returning `{}` on any failure — it
   cannot 500 or wedge the server thread (30 s cache bounds DB load).
2. **Additive only.** Every client insert is a new symbol or a new branch; no existing function is
   deleted or rewritten. Level-0 universe is byte-for-byte unchanged on load (root bodies still live in
   `scene`, not reparented). If every new code path is dead, the page renders exactly as today.
3. **Render loop still never throws.** All loop additions sit inside the existing guarded `try`
   (`:1763`) and each carries its own inner `try/catch`. A bug in leader-line/LOD/frame-pulse degrades
   that one effect, never the frame.
4. **No renderer bump.** Stays Three r136 UMD (`:366-386`); no WebGPU/R3F/build pipeline — the lifeline's
   single-HTML constraint is honored (Stage-1 decision, [[jarvis-build-rules]]).
5. **REAL data only.** Children come from `brain.db` via the proven indexed seam; gaps self-heal with a
   shimmer then "not connected" — never fabricated, never a static "pending".
6. **Reversible.** All client work is one contiguous additive block + a handful of insert points; the
   server work is one function + one `elif`. Revert = delete the block + the route (git diff is surgical).

---

## 12. Build order (Stage-4+ execution) — verifiable increments

Each step ends **green** (page loads, no JS error, lifeline up) before the next:

1. **Server**: add `_children` + `/children` route. Verify with `curl` (§13) — *pure backend, zero UX
   risk; ship/observe first.*
2. **Model + nav scaffold**: `makeNode`, `makeRootNodes`, `navStack`, `#crumbs` DOM (hidden at root).
   No behavior change yet — assert level-0 identical.
3. **Descend MVP**: `hydrate` + `buildSystem` (moons only, no swarm) + `flyInto`/`flyOut` + dblclick +
   Esc + crumbs. One level deep working.
4. **Recursion + LOD**: `PHI_CONJ` scale per level, `setLevelOpacity` crossfade, frame disposal, ≥3
   levels deep.
5. **Satellite swarm**: `buildSatSwarm` + instanceId raycast + sat panel rows.
6. **Anchored panel + leader line + spring**; self-heal shimmer; `Enter system ⏎` action.
7. **a11y pass** (`reduce-motion`, keyboard, aria-live, focus ring) + label declutter + entry bloom +
   mobile caps → Hollywood-cinematic polish.

---

## 13. Verification harness (headless, no lifeline risk)

Reuse the `.proof/*.cjs` puppeteer pattern already in this repo. New `.proof/nasa_hierarchy_proof.cjs`:

```
1. curl 127.0.0.1:8095/children?kind=type:Measurement&limit=8   → assert children.length>0, real labels
2. curl …/children?id=city:delhi:in&kind=obj:city:delhi:in&limit=14 → assert truncated==true, total>600
3. curl …/children?kind=type:NoSuchType   → assert children:[] , no 500
4. puppeteer: load page, wait uniReady, assert NO console error  (lifeline-safe gate)
5. puppeteer: dblclick a domain planet → assert navStack grows, #crumbs visible, ≥1 new body in frame
6. puppeteer: Esc → assert navStack back to root, level-0 bodies full opacity
7. puppeteer: screenshot a 2-level-deep descend for the Stage-9 cinematic check
8. assert pm2 jarvis-dashboard still 'online' (read-only `pm2 jlist`) before & after
```

**Acceptance = Stage-2 §11 list**, checked against this harness. Step 8 is the hard gate: the lifeline
is `online` and the page has zero console errors at every increment, or the step is reverted.

---

## 14. Function/anchor index (everything this plan adds or touches)

**`server/dashboard.py`** (NEW): `_children()` after `:846` · `_label()` helper near `:419` ·
`/children` branch after `:1745`. **Touched: none** (`_detail` `:804`, `_graph_data` `:360` read-only,
unchanged).

**`server/jarvis_live.html`** (NEW symbols): `PHI_CONJ`, `makeNode`, `makeRootNodes`, `hydrate`,
`navStack`, `currentFrame`, `buildSystem`, `addBodyLocal`, `buildSatSwarm`, `setLevelOpacity`,
`framingFor`, `flyInto`, `flyOut`, `descendAt`, `onCanvasDbl`, `renderCrumbs`, `openSatellitePanel`,
`isLeaf`. **Insert sites**: model block after `vogel` `:1388`; build block after `buildDomainPlanets`
`:1429`; fly fns near `flyHome` `:1647`; raycast extend `onCanvasClick` `:1720`; listeners after
`:1063`; render hooks in `tickFrame` `:1777`/`:1797`; `#crumbs` after search `:288`; spring/leader/crumb
CSS near `#card` `:32`. **Touched (extended, not replaced)**: `onCanvasClick` `:1714`, `flyToQuery`
`:1665`, `flyHome` `:1647`, `showCard` `:840` (new list section + `Enter system` action), boot `:1857`
(reduce-motion class, dblclick/keydown wiring).

— End Stage 3. The build can start at §12.1 (server) with zero UX risk and verify green before any
pixel moves.
