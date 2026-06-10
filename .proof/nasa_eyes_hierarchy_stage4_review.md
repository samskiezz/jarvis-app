# Stage 4 — ADVERSARIAL REVIEW of the engineering plan
## NASA-Eyes recursive hierarchy (`jarvis_live.html` + `dashboard.py` `/children`)

> Reviews `.proof/nasa_eyes_hierarchy_stage3_engineering.md` against the **real code and real
> `brain.db`** (re-verified 2026-06-10, every claim probed, not trusted). Output = the concrete
> required changes Stage 5 (execution) MUST apply. Nothing in the running app was modified.

---

## 0. Verdict

**The plan is ~85% sound and safe to build on — but it has 4 P0 issues that, unfixed, make the
feature either hollow (most descents dead-end), data-fragile (one bad row blanks a planet),
slowly leak the lifeline process, or break the descend gesture itself.** All are fixable with
small, measured changes. The architecture (per-object indexed descent, local-recentre frames,
instanced swarms, single anchored panel, additive-only, render-loop-guarded) is correct and
should proceed.

### Verified SOUND (do not re-litigate — these claims held under probing)
- **Line anchors are accurate.** Spot-checked ~25: `vogel:1382`, `phyllo:1372`, `buildDomainPlanets:1395`,
  `addBody:1299`, `addManifestBody:1325`, `enqueueGLB:1260`, `onCanvasClick:1714`, `_bodyAt:1682`,
  `tween:1640`, `flyToBody:1644`, `flyHome:1647`, `flyToQuery:1665`, `showCard:840`, `selectBody:1728`,
  `buildConstellation:1616`, `closeCard:837`, listeners `:1058-1063`, render loop `:1760`, search `:288`,
  `#card css :33`, `_glbCache:1255`, `_MOBILE:1286`, `_pinGrab:1681/.armed:1694`, `selectNode` clears
  `_selected :1651`. Server: `_cached(key,ttl,fn):79`, `_count(db,q,*a):89`, `_detail:804`, `/detail`
  branch `:1741`, `_send:1722`, `GRAPH_COLORS:354`, `BRAIN_DB:36`. Insert point after `_detail` end `:846`
  is correct (before `def metrics():849`).
- **DB schema + indexes match exactly.** `ont_object(id,type,props,state,created_ts,updated_ts)` +
  `idx_ont_object_type`; `ont_link(id,type,from_id,to_id,ts)` + `idx_ont_link_from` + `idx_ont_link_to`.
- **The core seam is REAL and 1:1.** `WORLD_MANIFEST.domains` keys == `ont_object.type` values exactly
  (Measurement/DataSource/Document/DomainSubject/Topic/SpeciesOccurrence/ScientificPublication/
  Vulnerability/AcquisitionPoint/Place/Asset/Concept/EarthquakeEvent/Event/Sensor/AppPage). So
  `childrenKind:'type:'+dom → WHERE type=?` returns real moons. **This was the #1 make-or-break risk and it passes.**
- **Render loop genuinely never throws** — `tickFrame() :1760` body fully inside `try{…}catch(e){}:1827`;
  the §8 hook sites (`:1779` bodies loop, `:1801` god-ray `.project`) exist as claimed.
- **Lifeline can't be wedged by a slow query** — server is `ThreadingHTTPServer` (daemon_threads,
  request_queue_size=64) `:2122-2124`; `/children` runs on its own thread. `PRAGMA query_only` + outer
  try/except returning `{}` is correct.
- **Hub cap is real and needed** — `city:delhi:in` exists (Place); `SAME_AS`=229k, `MEASURED_AT`=106k
  globally. Server `LIMIT min(40,…)` + `truncated` is the right call.

---

## P0 — MUST fix (feature is hollow / regression / lifeline risk without these)

### P0-1 · Recency selects the LEAST-connected moons → most descents dead-end
**Evidence (measured):** the plan's `type:` branch copies `_detail`'s `ORDER BY rowid DESC LIMIT N`
(most-recent). But recent objects are the *least* linked:
- `Measurement`: **8/30** recent objects have ANY neighbor.
- `Vulnerability`: **0/30** — the entire 1,260-CVE planet has zero descendable moons.
- (Document/Topic/DataSource/Place/Concept: 30/30 — fine.)

So flying into Measurement gives ~22/30 instant dead-ends; flying into Vulnerability gives a system
where **nothing** can be entered. This fails Stage-2 acceptance #5 ("recursion ≥3 levels deep") for
whole domains and guts the task's whole point ("fly INTO its nested system").

**Required change (in `_children`, `type:` branch):** bias selection to connected objects via an
indexed semi-join, falling back to recency only to backfill:
```sql
SELECT o.id,o.props FROM ont_object o
WHERE o.type=?
  AND (EXISTS(SELECT 1 FROM ont_link l WHERE l.from_id=o.id)
       OR EXISTS(SELECT 1 FROM ont_link l WHERE l.to_id=o.id))
ORDER BY o.rowid DESC LIMIT ?;
```
**Measured cost (worst cases):** Vulnerability (scan all 1,260, find 0) = **5 ms**; Measurement = **3 ms**.
The plan's stated fear ("unindexed aggregate over 111k rows") does NOT apply — the EXISTS uses the link
indexes and short-circuits at `limit`. If this returns `< limit` rows, backfill with the plain recent
query so the planet is never emptier than today. **Genuinely isolated domains (Vulnerability) must then be
honestly marked as leaf moons (see P0-2 hint) — never lure a flight into a guaranteed dead-end.**

### P0-2 · One malformed `props` row blanks an entire populous planet
The plan's `type:` loop calls `_label(props)` inline with only the **outer** try/except. `props` is a JSON
string; a single unparseable row throws → outer catch → `children:[]` → a planet with 111k real objects
renders as **empty / "not connected."** The existing `_detail :828` correctly guards **per row**.
**Required change:** wrap each row's parse/label in its own try/except (skip the bad row, keep the rest),
exactly like `_detail`. Same applies to the `obj:` branch loop. Add the missing `_label(props)` helper as a
guarded ~4-liner reusing `_ont_title`'s priority keys (`label`→`topic_name`→`name`→first value), returning
`""` on parse failure (caller falls back to `oid`).

### P0-3 · `_cache` is unbounded — `/children` makes its keys high-cardinality → slow lifeline leak
`_cached :79` never evicts (`_cache[key]=…`, no `del`, no cap, TTL only gates reads). Today's keys are
low-cardinality (metrics/graphdata/a few counts). The plan's key `children::obj:<id>::…` is **per descended
object** — a deep-exploration session creates thousands of permanent entries (each a children-list dict) in
the long-lived lifeline process. This is a real, if slow, memory growth the plan introduces and does not
address.
**Required change:** pick one — (a) **don't cache the `obj:` branch** (it's 1–5 ms indexed; caching buys
almost nothing); cache only the `type:` branch (16 fixed keys); **or** (b) bound `_cache` (evict-expired-on-
write, or small LRU cap). (a) is simplest and removes the cardinality entirely. Also note `_cache` is now
written from multiple request threads without a lock — pre-existing pattern, GIL-atomic in CPython, leave as
is but don't widen it.

### P0-4 · Double-click descend is swallowed by the single-click select tween
The page binds `click → onCanvasClick :1063`. A real double-click also fires **two `click` events first**,
so `onCanvasDbl`'s descend is preceded by `selectBody → flyToBody` (a select-fly), which sets
**`flying=true`** `:1640`. The plan's own re-entrancy guard (§8: "ignore descend/ascend while a tween is in
flight") then **eats the descend triggered by the same gesture** — plus you get two competing camera tweens.
The plan never reconciles "click starts a fly" with "dblclick must descend."
**Required change:** debounce select vs descend — on `click`, defer the `selectBody`/`flyToBody` by ~220 ms;
if a `dblclick` arrives in that window, **cancel the pending select** and run `flyInto` from a clean
(non-flying) state. (Or: make `flyInto` interrupt-and-replace the in-flight select tween rather than be
gated by it.) Verify on touch too (P2-1).

---

## P1 — required for the REAL-data + cinematic bar

### P1-1 · `total` / "+K more" over-reports (counts links, renders objects)
`total = COUNT(from_id) + COUNT(to_id)` is **raw link degree**, but `children` are JOIN-filtered (dangling
ids dropped), deduped, and `exclude`-filtered. Measured proof: top in-degree ids `class:Neuron` (10,000
links) and `class:Action` (5,000) **do not exist in `ont_object`** → the JOIN drops them entirely. So a node
can show **"+9,986 more"** while a descend reveals ~nothing new. The affordance lies.
**Required change:** either compute `total` JOIN-aware (count only neighbors that exist in `ont_object`), or
detect truncation by over-fetching `limit+1` and showing "+ more" (no fabricated number), or label it "of N
links" not "N objects." Pick the honest one.

### P1-2 · `SAME_AS` (229k, the #1 relation) makes satellites literal duplicates, not "sub-info"
The task wants satellites = "orbiting info for subtopics/sub-sub." But the `obj:` branch takes out- then
in-neighbors capped at 14 with **no relation ranking**, and `SAME_AS` dominates exactly the high-count
domains (measured from-side: Measurement 103k, DataSource 91k, Document 30k). So a Measurement's satellites
are mostly "the same measurement under another id" — noise, not subtopics.
**Required change:** rank informative relations first (`DESCRIBES`/`RELATES_TO`/`IN_TOPIC`/`MENTIONS`/
`MEASURED_AT`/`powers`/`SERVES`…) ahead of `SAME_AS`; optionally collapse/exclude `SAME_AS` or fold it into a
single "≡ N aliases" chip. Always surface `rel` on the satellite card so the edge is legible.

### P1-3 · LOD root-fade will leave ghost proxy spheres on ascend (level-0 regression)
Level-0 bodies aren't transparent by default; when their GLB loads, the code sets the **proxy** sphere
`opacity=0; transparent=true` to hide it (`:1317`, `:1359`) and renders the GLB child. The plan's
`setLevelOpacity` "lerps a frame's bodies opacity" — but root bodies live in `scene` (not a group), and a
naive opacity restore on ascend would set the hidden proxy back to `opacity=1`, popping a **ghost sphere over
every GLB planet** — a visible regression on the disabled user's home page. Also a non-transparent material
ignores `opacity` unless `transparent=true` is set first.
**Required change:** `setLevelOpacity` must operate on the **visible representation** — traverse the GLB child
(`userData.glb`) if present, else the proxy — and must **preserve the proxy-hidden invariant** (never restore
a GLB-swapped proxy above 0). Safer alternative to de-risk entirely: don't mutate level-0 materials at all —
dim the parent level with a single full-screen vignette/overlay element (or `scene.fog`) during descent, and
remove it on ascend. Specify which; do not ship the hand-waved version.

---

## P2 — correctness / polish (cheap, real, don't skip silently)

- **P2-1 · Mobile descend can't rely on `dblclick`.** Double-tap does not reliably emit `dblclick` on touch,
  and iOS double-tap = page zoom. The plan's "double-tap already native" is wrong. Make the panel
  **"Enter system ⏎" button the primary descend on coarse pointers** (`_MOBILE :1286`); keep dblclick for
  mouse only.
- **P2-2 · Descended frame is superimposed on the dimmed root.** Frames recenter at world origin (0,0,0) and
  so does the root field (radius ~300); a depth-1 system (radius ~115) renders *inside* the faded root, not in
  clean space. Either fully hide the parent (not 0.12) past entry, or offset/black-out the parent so the child
  system reads as its own world (NASA-Eyes keeps levels spatially distinct).
- **P2-3 · Stage-2 documented fallback is broken.** "Degrade to `/detail?kind=type:<Domain>`" won't work —
  real `_detail` expects `kind=type` **and** `name=<Domain>` separately (`:820`), not `kind=type:Domain`. Fix
  the doc or the fallback mapping so the "if dashboard.py editing forbidden" path actually returns moons.
- **P2-4 · `GRAPH_COLORS` lacks `Sensor` and `AppPage`** → those two planets' moons fall to the default
  `#9bd4e6`. Cosmetic; add two entries for parity if polishing.
- **P2-5 · Frame-local bodies get none of the existing FX for free.** The `:1779` pulse/born-pop/selected-
  emissive/GLB-emissive-traverse loop runs only over global `bodies[]`. The plan's `addBodyLocal` pushes to
  `frame.bodies`, so the per-frame mirror loop (§8.1) must faithfully reproduce **all four** behaviors
  (incl. the GLB emissive traverse) or descended moons look flat vs level-0 planets. Underspecified — call it
  out in the build.
- **P2-6 · Breadcrumb in the `#top` flex header** (brand/chips/search/Run/Pause/Stop) will overflow on narrow
  widths. Place `#crumbs` as its own row beneath `#top`, or anchor near `#card`, not inline in the header.

---

## Updated acceptance gate (add to Stage-2 §11 / harness §13)
1. **Descend yield:** flying into Measurement and into Vulnerability — assert ≥1 descendable moon where the
   data allows, and that isolated domains render moons honestly flagged as leaves (no false "Enter system").
2. **Resilience:** inject a malformed `props` row for a type → assert that planet still lists its other
   moons (not blanked).
3. **No leak:** descend 50 distinct objects → assert `_cache` size is bounded (or `obj:` not cached).
4. **Gesture:** mouse double-click descends in one go (no select-fly swallow); touch descends via the panel
   button.
5. **Ascend cleanliness:** descend then ascend to root → screenshot diff vs baseline shows **no ghost proxy
   spheres** and level-0 byte-identical opacity.
6. **Honest counts:** the panel's "+K more" never exceeds renderable neighbors.
Plus the existing hard gate: `pm2 jarvis-dashboard` `online` and zero console errors at every increment.

— End Stage 4. Net: proceed with the plan, but Stage 5 must land P0-1…P0-4 before any "recursion works"
claim, and P1-1…P1-3 before the cinematic/REAL-data bar is met.
</content>
</invoke>
