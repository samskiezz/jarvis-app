# Frontend Power Audit — jarvis_live.html

Read-only audit. No files were modified.

## A. jarvis_live.html stats

| Metric | Value |
|---|---|
| File size | 639,771 bytes (~625 KB) |
| Lines | 7,876 |
| Served by | `server/dashboard.py` `_tmpl("jarvis_live.html")` (line ~3614) |
| **HTML Content-Encoding** | **NONE** — sent uncompressed (`_send_status` has no gzip path; only `/nexus.json` precompresses) |
| HTML Cache-Control | `no-cache, no-store, must-revalidate` (correct for the shell) |
| `pageshow` reload-on-bfcache | Yes (line 47) |
| `visibilitychange` / `document.hidden` handlers | **None found** — every RAF and setInterval keeps running when the tab is hidden |

### Three.js scene weight

| Pattern | Count |
|---|---:|
| `new THREE.Mesh(` | 15 |
| `new THREE.InstancedMesh(` | 3 |
| `new THREE.Points(` | 2 |
| `new THREE.BatchedMesh(` | 0 |
| `MeshStandardMaterial` | 5 (expensive PBR) |
| `MeshBasicMaterial` | 9 |
| `scene.add(` | 16 |
| `Raycaster` | 1 |
| `console.log` | 1 (good) |

Inline mesh count is tiny — the real load is the **per-node GLB enqueue** (`loadGLB(...)`, `enqueueGLB(node.glbUrl...)` at lines 4386, 4421, 5620). With the WORLD_MANIFEST iterating 16 ontology domains + 31 topics + 17 AppPage frames, every node loads its own GLB, instantiates a full PBR sub-tree (MeshStandardMaterial), and is `scene.add`'d individually. No `InstancedMesh` / `BatchedMesh` reuse for repeated category icons — this is where the 513 meshes / 327 draw calls budget gets blown.

Materials: GLBs ship with `MeshStandardMaterial` from authoring; nothing converts category icons to `MeshBasicMaterial` for far-LOD billboards.

### requestAnimationFrame loops (9 sites)
Lines 3588, 3603, 4103, 5556 (fly-to), 5873, 6399 (alert anim), 6400 (ctx-menu anim), 7182, 7184.
- `rafFrame` (3588/3603), `tickFrame` (4103/5873), `_nx.raf` (7182/7184) are **the four idle-scene animators**. None gate on `document.hidden`.
- 6399/6400/5556 are one-shot, fine.

### setInterval inventory

| Line | Interval | Function | Notes |
|---|---|---|---|
| 2061 | default (≈1000ms?) | assist/status link probe | running forever |
| 2549 | (inline, polling) | pollClaude task result | per-task ok |
| 2657 | **7000ms** | gpuRefresh | OK |
| 3299 | **5000ms** | ccRefreshList | mid |
| 3309 | **7000ms** | mcRefresh | OK |
| 6259 | **280ms** | progress-bar "crawl" | high churn — fine if scoped to boot |
| 6270 | **2500ms / 1000ms / 8000ms / 15000ms** | tick / ageTick / budgetTick / loadLib | **ageTick @ 1s** runs forever |
| 6279 | 120000ms | self-dev bar | OK |
| 6280 | 60000ms | loadGodrays | OK |
| 6426 | **5000ms** | codePulsePoll | mid |
| 6515 | **5000ms** | refreshScaleMonitor | toggle-gated, OK |
| 6641 | **5000ms** | higgsfieldStatus poll | task-scoped |
| 6644 | **10000ms** | underworldRefresh | tab-scoped |
| 6689 | **6000ms** | tripo3dStatus poll | task-scoped |
| 6815 | **30000ms** | renderAppSheet refresh | OK |
| 7659/7660 | **3000ms** | pollOptimizer | task-scoped |

Always-on hot pollers: `ageTick` (1s), `tick` (2.5s), `assist/status` (~1s default), `codePulsePoll` (5s), `ccRefreshList` (5s), `mcRefresh` (7s), `gpuRefresh` (7s), plus 4 RAF loops — **all running when tab is hidden**.

## B. Top 10 GLB optimization candidates

Real served path is `/opt/jarvis-app-1/jarvis_assets/` (775 MB total; `/asset/<name>` route at dashboard.py:3421). Iron-Man helmet served = **2.6 MB**, not 16 MB (the 16 MB copies in `/public/`, `/dist/`, `/dist_prev/` are not on the live route but still exist as 5 redundant copies each — 80 MB recoverable from dedup alone). Outsized GLBs in the live path:

| # | File | Size | Proposed (Draco -d / Meshopt) | Saved |
|---|---|---:|---:|---:|
| 1 | jarvis_docvault_hero_document_book.glb | 4.6 MB | ~0.7 MB | ~3.9 MB |
| 2 | jarvis_command_atrium_orb_wireframe_lattice.glb | 4.6 MB | ~0.7 MB | ~3.9 MB |
| 3 | jarvis_data_fusion_reactor_core.glb | 4.1 MB | ~0.6 MB | ~3.5 MB |
| 4 | jarvis_world_control_earth_graticule.glb | 4.0 MB | ~0.6 MB | ~3.4 MB |
| 5 | jarvis_intel_graph_constellation_core.glb | 3.9 MB | ~0.6 MB | ~3.3 MB |
| 6 | jarvis_document_vault_book.glb | 3.8 MB | ~0.6 MB | ~3.2 MB |
| 7 | jarvis_holo_panel_frame.glb | 3.7 MB | ~0.6 MB | ~3.1 MB |
| 8 | jarvis_arc_reactor.glb | 3.6 MB | ~0.5 MB | ~3.1 MB |
| 9 | jarvis_war_room_mission_table.glb | 3.5 MB | ~0.5 MB | ~3.0 MB |
| 10 | jarvis_kit_reactor_core_tower.glb | 3.4 MB | ~0.5 MB | ~2.9 MB |

Draco geometry compression typically returns 7-10× on un-quantized meshes; texture KTX2/BasisU is additive. Across the **17 manifest URLs actively fetched on cold load**, an 85% reduction takes the first-paint GLB payload from ~55 MB → ~8 MB. **Cold-load savings: ~47 MB.**

`underworld_hero.glb` and `iron_man_helmet.glb` in `/public/` and `/dist/` (16 MB each, 5+ duplicates) are **not** on the live `/asset/` route — they're build artifacts; safe to dedup but doesn't affect runtime perf.

## C. Polling that should be raised or pause-on-hidden

1. **All 4 idle RAF loops** (3588, 4103, 5873, 7182) — gate with `if(document.hidden) return;` re-entry on `visibilitychange`. Background tab GPU/CPU savings: ~100% of scene cost (~30-60% of laptop CPU).
2. `ageTick` 1s @ 6270 — bump to 5s when hidden; **~80% wakeup reduction**.
3. `assist/status` @ 2061 — pause when hidden; resume on focus.
4. `gpuRefresh` 7s, `mcRefresh` 7s, `ccRefreshList` 5s, `codePulsePoll` 5s — all should pause when hidden.

Pattern (single shared helper at the top once):
```js
const _vis = () => document.visibilityState === 'visible';
document.addEventListener('visibilitychange', () => { /* resume timers */ });
```

## D. Missing HTTP compression / cache headers

| Asset | Current | Wanted | Saved per request |
|---|---|---|---|
| `jarvis_live.html` (625 KB) | **uncompressed** | gzip → ~95 KB / br → ~75 KB | **~530 KB** every cold load |
| `/asset/*.glb` | `Cache-Control: public, max-age=86400` (1 day) | `max-age=31536000, immutable` (assets are content-addressed by filename) | repeat-visit re-downloads avoided |
| `/media/*.glb` (line 3457) | **No Cache-Control header at all** | `max-age=31536000, immutable` | every reload re-downloads every domain GLB |
| `*.json` (NEXUS slim) | precompressed gz file served | already optimal | — |
| `/jarvis/` (dynamic JSON status) | `no-cache` correct | — | — |

The `_send_status` helper at dashboard.py:2947 has no gzip path. Adding `Accept-Encoding`-aware gzip for HTML/JSON (`mtype.startswith('text/') or mtype == 'application/json'`) would shrink the 625 KB shell once per cold load. `_send_jarvis_live` could precompress at startup and serve `.html.gz` like the NEXUS path already does (line 3067).

## E. Top 5 frontend wins ranked by impact

1. **Gzip jarvis_live.html on the wire** → **~530 KB/cold-load** saved (625 KB → ~95 KB). 30-line patch to `_send_status` or precompress-at-startup (mirror the `_save_slim_gz` pattern that already exists at line 3068). Measured time-to-first-byte improvement on a 10 Mbps link: ~420 ms.
2. **Draco-compress the 10 served `/asset/*.glb` and 16 domain `/media/*.glb`** → **~47 MB** off cold load (~55 MB → ~8 MB). Run `gltf-pipeline -i x.glb -o x.glb -d` per file; same URL keeps `check_ui_theme_lock.py` happy. Expect 600-900 ms LCP improvement on cable; 3-4 s on mobile.
3. **Add `visibilitychange` gate on the 4 RAF loops and the `ageTick`/`assist/status`/`gpuRefresh`/`mcRefresh`/`ccRefreshList`/`codePulsePoll` intervals** → idle background tab drops from ~40% CPU to ~0%. Battery-saving on iPad/phone. ~15 lines.
4. **Convert repeated category icons (16 domains, 31 topics, 17 AppPage frames = 64+ GLB instances) to `InstancedMesh` keyed by glbUrl** → 64+ draw calls → ~5. Memory drops because geometry is shared. Aligns with the explicit goal in MEMORY: "513 meshes/~327 draw calls now → instance/points/batched-lines, <200-300 desktop". Estimated **~150 draw calls** removed.
5. **Set `Cache-Control: public, max-age=31536000, immutable` on `/asset/*` and `/media/*`** (currently `/media/*` has **no** Cache-Control, `/asset/*` is only 1 day) → every warm reload skips re-downloading **~8-55 MB** of GLB. 4 lines in dashboard.py:3429 and 3457. Repeat-visit LCP drops by ~1-2 s.

### Cheap dedup follow-up (not on hot path but disk-cost)

`iron_man_helmet.glb` 16 MB × 3 copies in `/public/`, `/dist/`, `/dist_prev/`; `fx_energy_core.glb`, `fx_hologram.glb`, `agi_core.glb`, `aip_neural_mesh.glb` similarly tripled. ~120 MB recoverable via symlink consolidation if owner approves.
