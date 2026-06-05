import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS as C } from "@/domain/colors";
import { OBJECTS, LINKS } from "@/domain/ontology";
import { kimiClient } from "@/api/kimiClient";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.purple; // cognition domain accent

// ── palette (cyan/blue + amber/orange neon, near-black bg) ──────────────────
const CYAN = new THREE.Color(0x33e0ff);
const BLUE = new THREE.Color(0x0096d4);
const AMBER = new THREE.Color(0xe8a800);
const ORANGE = new THREE.Color(0xf07820);

// Deterministic seeded PRNG so the procedural cloud is stable across renders.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller normal sample — used to pack neurons into a brain-like gaussian
// ellipsoid volume rather than a uniform box.
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── MLP / cube / live-graph node-edge builders (kept from prior version) ────
function buildMLP(layerSizes, seed) {
  const rng = mulberry32(seed);
  const span = 9;
  const layers = [];
  const nodes = [];
  const L = layerSizes.length;
  layerSizes.forEach((n, li) => {
    const x = (li / (L - 1) - 0.5) * span;
    const layer = [];
    const cols = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const ring = (i % cols) / Math.max(1, cols - 1) - 0.5;
      const row = Math.floor(i / cols) / Math.max(1, Math.ceil(n / cols) - 1) - 0.5;
      const jitter = () => (rng() - 0.5) * 0.55;
      const y = (row + jitter() * 0.4) * 5.2;
      const z = (ring + jitter() * 0.4) * 5.2;
      const t = li / (L - 1);
      const col = new THREE.Color().copy(CYAN).lerp(AMBER, t).lerp(
        li === 0 ? BLUE : li === L - 1 ? ORANGE : CYAN, 0.25
      );
      const node = { pos: new THREE.Vector3(x, y, z), color: col, layer: li };
      layer.push(node);
      nodes.push(node);
    }
    layers.push(layer);
  });
  const MAX_EDGES = 4200;
  const edges = [];
  const nodeIndex = new Map();
  nodes.forEach((nd, i) => nodeIndex.set(nd, i));
  let pairTotal = 0;
  for (let li = 0; li < L - 1; li++) pairTotal += layers[li].length * layers[li + 1].length;
  const keepProb = Math.min(1, MAX_EDGES / pairTotal);
  for (let li = 0; li < L - 1; li++) {
    const a = layers[li], b = layers[li + 1];
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        if (rng() > keepProb) continue;
        edges.push({ a: nodeIndex.get(a[i]), b: nodeIndex.get(b[j]), layer: li });
        if (edges.length >= MAX_EDGES) break;
      }
      if (edges.length >= MAX_EDGES) break;
    }
    if (edges.length >= MAX_EDGES) break;
  }
  return { nodes, edges, layerCount: L };
}

// ── REAL graph: distinct cluster hues so cluster colouring reads clearly ────
const CLUSTER_HUES = [
  0x33e0ff, 0xf07820, 0x7ee787, 0xc792ff, 0xe8a800,
  0xff6b8b, 0x4fd1c5, 0xa0e060, 0x6aa0ff, 0xffd24a,
];

// Build the REAL per-kind cluster model from the catalog's `counts` map. Each
// kind becomes one colour cluster whose `frac` is its true share of the store,
// so the cloud's colour clusters mirror the actual knowledge breakdown. Returns
// [{ kind, count, frac, hue }] sorted largest-first, or [] for an empty store.
function kindClustersFromCounts(counts) {
  const entries = Object.entries(counts || {}).filter(([, n]) => Number(n) > 0);
  const total = entries.reduce((s, [, n]) => s + Number(n), 0);
  if (!total) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n], i) => ({
      kind,
      count: Number(n),
      frac: Number(n) / total,
      hue: new THREE.Color(CLUSTER_HUES[i % CLUSTER_HUES.length]),
    }));
}

// Build the REAL knowledge-graph: OBJECTS → nodes, LINKS → edges. Positions are
// seeded then relaxed with a cheap force-directed pass (repulsion + link spring)
// so connected entities physically cluster. No deps — these graphs are tiny.
function buildLiveGraph() {
  const index = new Map();
  OBJECTS.forEach((o, i) => index.set(o.id, i));
  const N = OBJECTS.length;

  // real edges from LINKS (carry strength for thickness/brightness)
  const edges = [];
  const degree = new Float32Array(N);
  LINKS.forEach((l) => {
    const a = index.get(l.a), b = index.get(l.b);
    if (a == null || b == null) return;
    const s = l.strength || 1;
    edges.push({ a, b, layer: 0, strength: s, label: l.label });
    degree[a] += s; degree[b] += s;
  });

  // ── seed positions on a ring, then a few force-directed iterations ────────
  const rng = mulberry32(0x51e6);
  const P = new Array(N);
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const rad = 4.0 + (i % 3) * 0.8;
    P[i] = new THREE.Vector3(
      Math.cos(ang) * rad + (rng() - 0.5) * 0.5,
      Math.sin(ang) * rad + (rng() - 0.5) * 0.5,
      (rng() - 0.5) * 3.5,
    );
  }
  const ITER = 90, K_REP = 22.0, K_SPRING = 0.045, REST = 3.0;
  const disp = Array.from({ length: N }, () => new THREE.Vector3());
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < N; i++) disp[i].set(0, 0, 0);
    // repulsion (all pairs — N is tiny)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.01) d2 = 0.01;
        const f = K_REP / d2;
        const inv = 1 / Math.sqrt(d2);
        const fx = dx * inv * f, fy = dy * inv * f, fz = dz * inv * f;
        disp[i].x += fx; disp[i].y += fy; disp[i].z += fz;
        disp[j].x -= fx; disp[j].y -= fy; disp[j].z -= fz;
      }
    }
    // link attraction (spring toward rest length, scaled by strength)
    for (const e of edges) {
      const a = P[e.a], b = P[e.b];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      const f = K_SPRING * (d - REST) * (e.strength || 1);
      const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
      disp[e.a].x += fx; disp[e.a].y += fy; disp[e.a].z += fz;
      disp[e.b].x -= fx; disp[e.b].y -= fy; disp[e.b].z -= fz;
    }
    const cool = 1 - it / ITER;
    for (let i = 0; i < N; i++) {
      const dl = Math.min(0.6, disp[i].length()) * cool;
      if (dl > 1e-5) { disp[i].setLength(dl); P[i].add(disp[i]); }
    }
  }
  // centre + spread on X so it reads as a volume, not a flat disc
  const c = new THREE.Vector3();
  P.forEach((p) => c.add(p));
  c.multiplyScalar(1 / N);
  P.forEach((p) => p.sub(c));

  const types = [...new Set(OBJECTS.map((o) => o.type))];
  const nodes = OBJECTS.map((o, i) => ({
    pos: P[i],
    color: new THREE.Color(C.type[o.type] || C.neon), // fallback colour = by type
    layer: types.indexOf(o.type),
    label: o.label,
    id: o.id,
    type: o.type,
    degree: degree[i],
  }));

  return { nodes, edges, layerCount: types.length, degree, index };
}

// ── Local fallbacks (used when the science bridge is down/unexpected) ───────
// Degree-based centrality (already have weighted degree) + connected-component
// style clustering: greedy label propagation over the real edges.
function localClusters(nodes, edges) {
  const N = nodes.length;
  const label = new Int32Array(N);
  for (let i = 0; i < N; i++) label[i] = i;
  const adj = Array.from({ length: N }, () => []);
  for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  // propagate minimum reachable label → connected components
  let changed = true, guard = 0;
  while (changed && guard++ < N + 4) {
    changed = false;
    for (let i = 0; i < N; i++) {
      for (const j of adj[i]) {
        if (label[j] < label[i]) { label[i] = label[j]; changed = true; }
        else if (label[i] < label[j]) { label[j] = label[i]; changed = true; }
      }
    }
  }
  // compact labels to 0..k-1
  const remap = new Map();
  const compact = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!remap.has(label[i])) remap.set(label[i], remap.size);
    compact[i] = remap.get(label[i]);
  }
  return { labels: compact, k: remap.size };
}

// Paint nodes from a {labels, centrality} model: colour by cluster, size by
// centrality. Mutates node.color + node.renderSize in place.
function applyLiveModel(nodes, model) {
  const cmax = Math.max(1e-6, ...model.centrality);
  nodes.forEach((nd, i) => {
    const cl = model.labels[i] | 0;
    nd.color = new THREE.Color(CLUSTER_HUES[cl % CLUSTER_HUES.length]);
    nd.cluster = cl;
    const c = model.centrality[i] / cmax; // 0..1
    nd.centrality = model.centrality[i];
    nd.renderSize = 3.2 + c * 7.0;        // central nodes render markedly larger
  });
}

// Lloyd k-means over the 3D layout positions → k spatial clusters that follow
// the force-directed grouping. Cheap (k tiny, N tiny), deterministic seeding.
function kmeansLabels(nodes, k) {
  const N = nodes.length;
  k = Math.max(1, Math.min(k, N));
  const pts = nodes.map((n) => n.pos);
  // deterministic spread-out seeds (k-means++ lite)
  const centers = [pts[0].clone()];
  while (centers.length < k) {
    let bi = 0, bd = -1;
    for (let i = 0; i < N; i++) {
      let dmin = Infinity;
      for (const c of centers) dmin = Math.min(dmin, pts[i].distanceToSquared(c));
      if (dmin > bd) { bd = dmin; bi = i; }
    }
    centers.push(pts[bi].clone());
  }
  const labels = new Int32Array(N);
  for (let it = 0; it < 24; it++) {
    let moved = false;
    for (let i = 0; i < N; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = pts[i].distanceToSquared(centers[c]);
        if (d < bd) { bd = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; moved = true; }
    }
    for (let c = 0; c < k; c++) {
      const acc = new THREE.Vector3(); let n = 0;
      for (let i = 0; i < N; i++) if (labels[i] === c) { acc.add(pts[i]); n++; }
      if (n) centers[c] = acc.multiplyScalar(1 / n);
    }
    if (!moved) break;
  }
  return labels;
}

// Refine the live model via the science bridge. Returns null on any failure so
// the caller keeps the local fallback. Uses:
//  • pagerank(edges=real LINKS) → REAL per-node centrality + top node.
//  • kmeans_clustering(n_clusters) → benchmarked k; nodes are then assigned to
//    k spatial clusters locally (the bridge's k-means runs on its own blobs, so
//    we borrow its k and cluster OUR real layout with the same algorithm).
async function liveBridgeRefine(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idIndex = new Map(ids.map((id, i) => [id, i]));
  const edgeList = edges.map((e) => [ids[e.a], ids[e.b]]);

  const post = (field, params) =>
    kimiClient.request("/functions/science/run", {
      method: "POST",
      body: JSON.stringify({ field, params }),
    });

  // unwrap {status:"ok", data:{...}} or {status:"ok", ...} shapes
  const dataOf = (r) => {
    if (!r || r.status !== "ok") return null;
    return r.data && typeof r.data === "object" ? r.data : r;
  };

  const [prRes, kmRes] = await Promise.all([
    post("pagerank", { edges: edgeList }).catch(() => null),
    post("kmeans_clustering", { n_clusters: Math.min(4, nodes.length) }).catch(() => null),
  ]);

  const pr = dataOf(prRes);
  const km = dataOf(kmRes);

  // centrality from real pagerank ranks (fall back to weighted degree)
  let centrality, topNode, usedPR = false;
  if (pr && pr.ranks && typeof pr.ranks === "object") {
    centrality = nodes.map((n) => Number(pr.ranks[n.id]) || 0);
    if (centrality.some((v) => v > 0)) {
      usedPR = true;
      topNode = pr.top_node && idIndex.has(pr.top_node)
        ? nodes[idIndex.get(pr.top_node)].label
        : nodes[centrality.indexOf(Math.max(...centrality))].label;
    }
  }
  if (!usedPR) {
    const maxDeg = Math.max(1, ...nodes.map((n) => n.degree || 0));
    centrality = nodes.map((n) => (n.degree || 0) / maxDeg);
    topNode = nodes[centrality.indexOf(Math.max(...centrality))].label;
  }

  // cluster count from the benchmarked k-means engine (fall back to a heuristic)
  let k = km && Number.isFinite(km.n_clusters) ? (km.n_clusters | 0) : 0;
  if (!k || k < 1) k = Math.max(2, Math.min(4, Math.round(Math.sqrt(nodes.length))));
  k = Math.min(k, nodes.length);
  const labels = Array.from(kmeansLabels(nodes, k));

  // if neither call yielded anything usable, signal failure → keep local model
  if (!usedPR && !km) return null;

  const engines = [];
  if (usedPR) engines.push("pagerank");
  if (km) engines.push("k-means");
  return {
    source: `bridge: ${engines.join(" + ") || "fallback"}`,
    k,
    labels,
    centrality,
    topNode,
    purity: km && Number.isFinite(km.purity) ? km.purity : null,
  };
}

const PRESETS = {
  mlp: [8, 24, 40, 56, 56, 40, 24, 6],
  cube: [64, 64, 64, 64, 64, 64],
};

// ── LOD model ───────────────────────────────────────────────────────────────
// renderBudget = the MAX number of points the GPU ever draws (bounded, 60fps).
// totalNodes  = the REAL knowledge-store size (catalog.total + ontology objects),
//               fetched from the backend and growing live as knowledge is
//               captured. The drawn cloud is always a density-faithful SAMPLE of
//               min(totalNodes, renderBudget) points.
// This is honest LOD: deck.gl / Palantir / Gephi style — you never draw a literal
// record-per-primitive when the store is large; you draw a representative slice.
// When the store is SMALL, we draw min(total, budget) so the cloud size tracks
// the real count exactly (10 notes → ~10 visible percepticons, not a fake cloud).
const SCALES = [
  { id: "250k", label: "250K", neurons: 250_000 },
  { id: "1m", label: "1M", neurons: 1_000_000 },
  { id: "1.5m", label: "1.5M", neurons: 1_500_000 },
  { id: "2m", label: "2M", neurons: 2_000_000 },
  { id: "3m", label: "3M", neurons: 3_000_000 },
];
const DEFAULT_SCALE = "1m";         // GPU render budget cap (max points drawn)
const HAZE_RATIO = 1 / 3;           // synapse haze points per neuron
const MAX_LINES = 48_000;           // hard-capped near-focus line definition

const AVG_DEGREE = 8;               // est. links per record (wikilinks + mirror)
const MIN_CLOUD = 1200;             // floor so a tiny-but-nonempty store still
                                    // reads as a glowing volume (clearly labelled
                                    // a representative render, not faked records)

// ── shared glow shaders (reused by neuron cloud + synapse haze) ─────────────
const CLOUD_VERT = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aDepth;   // 0..1 normalized x/depth for wave + color drift
  attribute float aPhase;   // per-point pulse phase so the field shimmers
  varying vec3 vColor;
  varying float vGlow;
  uniform float uTime;
  uniform float uWave;      // travelling activation band centre (0..1)
  uniform float uSizeBoost;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // base shimmer pulse
    float pulse = 0.55 + 0.45 * sin(uTime * 1.6 + aPhase * 6.2831);
    // travelling gaussian activation band over depth
    float d = aDepth - uWave;
    float wave = exp(-d * d * 42.0);
    vGlow = pulse + wave * 1.6;
    vColor = aColor;
    float atten = 320.0 / max(0.001, -mv.z);
    gl_PointSize = aSize * uSizeBoost * atten * (0.7 + 0.5 * pulse + wave);
    gl_Position = projectionMatrix * mv;
  }
`;

const CLOUD_FRAG = `
  precision mediump float;
  varying vec3 vColor;
  varying float vGlow;
  uniform float uOpacity;
  void main() {
    // round soft point via radial falloff from gl_PointCoord centre
    vec2 uv = gl_PointCoord - vec2(0.5);
    float r = dot(uv, uv) * 4.0;          // 0 centre → 1 edge
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 1.6);       // soft glow falloff
    vec3 col = vColor * (0.35 + 1.15 * vGlow);
    gl_FragColor = vec4(col, soft * uOpacity);
  }
`;

// Build the dense brain-cloud buffers. Returns typed arrays + the conceptual
// synapse count so the HUD can report an honest large number.
//
// `kindClusters` (optional) is the REAL per-kind breakdown from the catalog:
// [{ hue, frac, kind }] where frac sums to ~1. When present, each neuron is
// assigned to a kind cluster in proportion to its real share and coloured by that
// kind's hue — so the cloud's colour clusters mirror the actual knowledge store.
function buildCloudBuffers(neuronCount, seed, kindClusters) {
  const rng = mulberry32(seed);

  // Precompute cumulative kind boundaries so we can map rng()→kind by real share.
  const clusters = (kindClusters && kindClusters.length) ? kindClusters : null;
  let cum = null;
  if (clusters) {
    cum = [];
    let acc = 0;
    for (const k of clusters) { acc += Math.max(0, k.frac || 0); cum.push(acc); }
    const tot = cum[cum.length - 1] || 1;
    for (let i = 0; i < cum.length; i++) cum[i] /= tot;
  }
  const pickCluster = (r) => {
    if (!cum) return -1;
    for (let i = 0; i < cum.length; i++) if (r <= cum[i]) return i;
    return cum.length - 1;
  };

  const npos = new Float32Array(neuronCount * 3);
  const ncol = new Float32Array(neuronCount * 3);
  const nsize = new Float32Array(neuronCount);
  const ndepth = new Float32Array(neuronCount);
  const nphase = new Float32Array(neuronCount);

  // Ellipsoid radii — a wide, slightly flattened "brain" volume on X.
  const RX = 7.2, RY = 4.6, RZ = 4.6;
  const tmp = new THREE.Color();
  const cA = new THREE.Color(), cB = new THREE.Color();

  for (let i = 0; i < neuronCount; i++) {
    // gaussian shell: bias toward an outer cortex shell + a denser core
    let gx = gauss(rng), gy = gauss(rng), gz = gauss(rng);
    // radial remap: push some mass outward to form a thick glowing shell
    const shell = rng() < 0.55 ? 0.62 + rng() * 0.42 : rng() * 0.7;
    const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx = (gx / len) * shell + gx * 0.18;
    gy = (gy / len) * shell + gy * 0.18;
    gz = (gz / len) * shell + gz * 0.18;
    // organic jitter so it never reads as a grid/sphere
    const jx = (rng() - 0.5) * 0.5;
    const jy = (rng() - 0.5) * 0.5;
    const jz = (rng() - 0.5) * 0.5;
    const x = gx * RX + jx;
    const y = gy * RY + jy;
    const z = gz * RZ + jz;
    npos[i * 3] = x; npos[i * 3 + 1] = y; npos[i * 3 + 2] = z;

    // depth 0..1 across X for the activation wave + colour drift
    const depth = THREE.MathUtils.clamp(x / (RX * 1.3) * 0.5 + 0.5, 0, 1);
    ndepth[i] = depth;

    // colour: when real per-kind clusters are supplied, tint each neuron by its
    // assigned kind hue (so clusters mirror the actual store), modulated slightly
    // by depth for shading. Otherwise fall back to the cyan→amber depth ramp.
    if (clusters) {
      const cl = pickCluster(rng());
      const base = clusters[cl] ? clusters[cl].hue : CYAN;
      tmp.copy(base).lerp(CYAN, 0.12 + depth * 0.18);
    } else {
      cA.copy(CYAN).lerp(BLUE, 0.3);
      cB.copy(AMBER).lerp(ORANGE, 0.3);
      tmp.copy(cA).lerp(cB, depth);
    }
    // brighten a fraction of points to read as "firing" hotspots
    const hot = rng() < 0.08 ? 1.6 : 1.0;
    ncol[i * 3] = tmp.r * hot;
    ncol[i * 3 + 1] = tmp.g * hot;
    ncol[i * 3 + 2] = tmp.b * hot;

    nsize[i] = 0.9 + rng() * 1.4;
    nphase[i] = rng();
  }

  // ── Synapse haze: faint points sampled ALONG interpolations between random
  // neuron pairs — implies dense connectivity without line primitives. ──────
  const hazeCount = Math.round(neuronCount * HAZE_RATIO);
  const hpos = new Float32Array(hazeCount * 3);
  const hcol = new Float32Array(hazeCount * 3);
  const hsize = new Float32Array(hazeCount);
  const hdepth = new Float32Array(hazeCount);
  const hphase = new Float32Array(hazeCount);
  for (let i = 0; i < hazeCount; i++) {
    const a = (Math.floor(rng() * neuronCount)) * 3;
    const b = (Math.floor(rng() * neuronCount)) * 3;
    const t = rng();
    const x = npos[a] + (npos[b] - npos[a]) * t;
    const y = npos[a + 1] + (npos[b + 1] - npos[a + 1]) * t;
    const z = npos[a + 2] + (npos[b + 2] - npos[a + 2]) * t;
    hpos[i * 3] = x; hpos[i * 3 + 1] = y; hpos[i * 3 + 2] = z;
    hdepth[i] = THREE.MathUtils.clamp(x / (RX * 1.3) * 0.5 + 0.5, 0, 1);
    // tint haze between the two endpoint colours, dimmer
    const ia = a, ib = b;
    hcol[i * 3] = (ncol[ia] + ncol[ib]) * 0.28;
    hcol[i * 3 + 1] = (ncol[ia + 1] + ncol[ib + 1]) * 0.28;
    hcol[i * 3 + 2] = (ncol[ia + 2] + ncol[ib + 2]) * 0.28;
    hsize[i] = 0.5 + rng() * 0.7;
    hphase[i] = rng();
  }

  // ── Capped near-focus LineSegments for crisp synapse definition ──────────
  const lineCount = Math.min(MAX_LINES, Math.floor(neuronCount * 0.04));
  const lpos = new Float32Array(lineCount * 6);
  const lcol = new Float32Array(lineCount * 6);
  for (let i = 0; i < lineCount; i++) {
    const a = (Math.floor(rng() * neuronCount)) * 3;
    // connect to a *nearby-ish* second point for short, brain-like fibres
    let b = (Math.floor(rng() * neuronCount)) * 3;
    // a light rejection toward shorter links keeps the field legible
    for (let k = 0; k < 2; k++) {
      const c = (Math.floor(rng() * neuronCount)) * 3;
      const d1 = (npos[a] - npos[b]) ** 2 + (npos[a + 1] - npos[b + 1]) ** 2 + (npos[a + 2] - npos[b + 2]) ** 2;
      const d2 = (npos[a] - npos[c]) ** 2 + (npos[a + 1] - npos[c + 1]) ** 2 + (npos[a + 2] - npos[c + 2]) ** 2;
      if (d2 < d1) b = c;
    }
    lpos[i * 6] = npos[a]; lpos[i * 6 + 1] = npos[a + 1]; lpos[i * 6 + 2] = npos[a + 2];
    lpos[i * 6 + 3] = npos[b]; lpos[i * 6 + 4] = npos[b + 1]; lpos[i * 6 + 5] = npos[b + 2];
    lcol[i * 6] = ncol[a] * 0.5; lcol[i * 6 + 1] = ncol[a + 1] * 0.5; lcol[i * 6 + 2] = ncol[a + 2] * 0.5;
    lcol[i * 6 + 3] = ncol[b] * 0.5; lcol[i * 6 + 4] = ncol[b + 1] * 0.5; lcol[i * 6 + 5] = ncol[b + 2] * 0.5;
  }

  // Conceptual synapse count = haze interpolations + capped lines. Honest big #.
  const synapseCount = hazeCount + lineCount;

  return {
    neuron: { npos, ncol, nsize, ndepth, nphase, count: neuronCount },
    haze: { hpos, hcol, hsize, hdepth, hphase, count: hazeCount },
    lines: { lpos, lcol, count: lineCount },
    synapseCount,
  };
}

function makeCloudPoints(count, pos, col, size, depth, phase, { opacity, sizeBoost }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWave: { value: 0 },
      uOpacity: { value: opacity },
      uSizeBoost: { value: sizeBoost },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return { points: new THREE.Points(geo, mat), geo, mat, count };
}

function NeuralCanvas({ mode, scaleId, totalNodes, kindClusters, seed, onStats, onStepDown }) {
  const mountRef = useRef(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onStepDownRef = useRef(onStepDown);
  onStepDownRef.current = onStepDown;
  const totalNodesRef = useRef(totalNodes);
  totalNodesRef.current = totalNodes;
  // serialize the kind clusters so the effect re-runs only when the real
  // breakdown actually changes (stable across re-renders otherwise).
  const kindKey = useMemo(
    () => (kindClusters || []).map((k) => `${k.kind}:${k.frac.toFixed(4)}`).join("|"),
    [kindClusters]
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = Math.max(320, mount.clientWidth || 0);
    const H = Math.max(360, mount.clientHeight || 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010305, mode === "cloud" ? 0.028 : 0.045);
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
    camera.position.set(0, 0.5, mode === "cloud" ? 17 : 13);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: mode !== "cloud", alpha: true, powerPreference: "high-performance" });
    } catch {
      // graceful degradation: no WebGL → HUD-only fallback stays in the DOM
      mount.dataset.webgl = "0";
      onStatsRef.current?.({ neurons: 0, synapses: 0, layers: 0, fps: 0, webgl: false });
      return;
    }
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // ≤2 guard
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // disposables collected so cleanup + scale changes never leak GPU memory
    const disposables = [];
    let fpsCB = null;        // per-frame fps reporter (cloud mode)
    let waveSpan = 1;        // wave loop span for current mode
    let cloudMode = mode === "cloud";
    let cloudZoom = null;    // zoom-to-detail resample state (cloud mode only)

    if (cloudMode) {
      // ── MASSIVE DENSE NEURON CLOUD (LOD SAMPLE) ─────────────────────────
      // renderBudget = max points the GPU may draw. The drawn cloud holds
      // min(totalNodes, renderBudget) points — a density-faithful SAMPLE of the
      // logical total. For totalNodes ≥ renderBudget we draw exactly the budget
      // (the distribution is identical, so 2M vs 1B look the same — correct LOD).
      const renderBudget = (SCALES.find((s) => s.id === scaleId) || SCALES[1]).neurons;
      // REAL store size drives the cloud. When small we draw exactly the real
      // count (with a small visual floor so a non-empty store still glows); when
      // large we cap at the GPU budget and draw a representative LOD sample.
      const realTotal = Math.max(0, totalNodes || 0);
      const logicalTotal = realTotal;
      const drawTarget = realTotal > 0
        ? Math.min(renderBudget, Math.max(MIN_CLOUD, realTotal))
        : renderBudget; // empty store → draw the budget as a clearly-labelled demo
      // try the requested count; on allocation failure step down automatically.
      const ladder = [drawTarget, ...SCALES.map((s) => s.neurons).filter((n) => n < drawTarget)]
        .sort((a, b) => b - a);
      let built = null, usedNeurons = 0;
      for (const n of ladder) {
        try {
          built = buildCloudBuffers(n, seed, kindClusters);
          usedNeurons = n;
          break;
        } catch {
          built = null; // RangeError on huge Float32Array → try smaller
        }
      }
      if (!built) {
        onStatsRef.current?.({ neurons: 0, synapses: 0, layers: 0, fps: 0, webgl: true, oom: true });
        renderer.dispose();
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        return;
      }

      const { neuron, haze, lines, synapseCount } = built;

      // synapse haze (faint, drawn first / behind)
      const hazeP = makeCloudPoints(haze.count, haze.hpos, haze.hcol, haze.hsize, haze.hdepth, haze.hphase, { opacity: 0.5, sizeBoost: 0.7 });
      group.add(hazeP.points);
      disposables.push(hazeP);

      // capped near-focus line definition
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(lines.lpos, 3));
      lineGeo.setAttribute("aColor", new THREE.BufferAttribute(lines.lcol, 3));
      const lineMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          attribute vec3 aColor; varying vec3 vColor;
          void main() { vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          precision mediump float; varying vec3 vColor;
          void main() { gl_FragColor = vec4(vColor * 0.7, 0.22); }
        `,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.LineSegments(lineGeo, lineMat));
      disposables.push({ geo: lineGeo, mat: lineMat });

      // neurons last (brightest, on top)
      const neuronP = makeCloudPoints(neuron.count, neuron.npos, neuron.ncol, neuron.nsize, neuron.ndepth, neuron.nphase, { opacity: 0.95, sizeBoost: 1.0 });
      group.add(neuronP.points);
      disposables.push(neuronP);

      // ── Zoom-to-detail (cheap streaming illusion) ───────────────────────
      // When the camera dollies in close, bias a fraction of points toward the
      // view target so local structure densifies — implying streamed LOD without
      // any reload. Keep a pristine copy so we can restore on dolly-out.
      cloudZoom = {
        posAttr: neuronP.geo.getAttribute("position"),
        base: neuron.npos.slice(0),   // pristine positions
        count: neuron.count,
        applied: 0,                   // current pull amount 0..1
      };

      waveSpan = 1; // depth normalized 0..1

      // Conceptual synapse count scales with the LOGICAL total, not the sample:
      // totalNodes * avgDegree. The drawn synapseCount is the rendered sample.
      const logicalSynapses = Math.round(logicalTotal * AVG_DEGREE);
      onStatsRef.current?.({
        neurons: usedNeurons,            // points actually drawn (the LOD sample)
        synapses: synapseCount,          // synapse primitives actually drawn
        total: logicalTotal,             // logical/conceptual node count
        totalSynapses: logicalSynapses,  // logical/conceptual synapse count
        rendered: usedNeurons,           // explicit "rendering N" for the HUD
        layers: 64,
        fps: 0,
        webgl: true,
        steppedDown: usedNeurons < drawTarget,
      });

      // per-frame uniform drive + fps probe
      const waveMats = [hazeP.mat, neuronP.mat];
      fpsCB = (t) => {
        const wave = (t * 0.18) % 1.0; // travelling activation band across depth
        for (const m of waveMats) { m.uniforms.uTime.value = t; m.uniforms.uWave.value = wave; }
        lineMat.uniforms.uTime.value = t;
      };
      // expose synapse count for the auto-downstep slow-frame reporter
      mount.dataset.synapses = String(synapseCount);
      mount.dataset.neurons = String(usedNeurons);
    } else {
      // ── legacy MLP / cube / live graph (node-edge) modes ────────────────
      const isLive = mode === "live";
      const data = isLive ? buildLiveGraph() : buildMLP(PRESETS[mode] || PRESETS.mlp, seed);
      const { nodes, edges, layerCount } = data;

      // ── LIVE: compute REAL clustering + centrality (local first, then the
      // science bridge refines it asynchronously). Colour = cluster, size =
      // centrality. Synthetic modes keep their layer colouring untouched. ─────
      let liveModel = null;
      if (isLive) {
        // local fallback centrality = weighted degree (normalised)
        const maxDeg = Math.max(1, ...nodes.map((n) => n.degree || 0));
        const centrality = nodes.map((n) => (n.degree || 0) / maxDeg);
        // local fallback clustering = connected components / label propagation
        const { labels, k } = localClusters(nodes, edges);
        liveModel = {
          source: "local (degree + components)",
          k,
          labels: Array.from(labels),
          centrality,
          topNode: nodes.reduce((best, n, i) =>
            centrality[i] > centrality[best.i] ? { i, label: n.label } : best,
            { i: 0, label: nodes[0]?.label }).label,
        };
        applyLiveModel(nodes, liveModel);
      }

      const nodeGeo = new THREE.BufferGeometry();
      const npos = new Float32Array(nodes.length * 3);
      const ncol = new Float32Array(nodes.length * 3);
      const nsize = new Float32Array(nodes.length);
      const ndepth = new Float32Array(nodes.length);
      const nphase = new Float32Array(nodes.length);
      nodes.forEach((nd, i) => {
        npos[i * 3] = nd.pos.x; npos[i * 3 + 1] = nd.pos.y; npos[i * 3 + 2] = nd.pos.z;
        ncol[i * 3] = nd.color.r; ncol[i * 3 + 1] = nd.color.g; ncol[i * 3 + 2] = nd.color.b;
        nsize[i] = isLive ? (nd.renderSize || 4.0) : 2.6;
        ndepth[i] = layerCount > 1 ? nd.layer / (layerCount - 1) : 0;
        nphase[i] = (i * 0.123) % 1;
      });
      nodeGeo.setAttribute("position", new THREE.BufferAttribute(npos, 3));
      nodeGeo.setAttribute("aColor", new THREE.BufferAttribute(ncol, 3));
      nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(nsize, 1));
      nodeGeo.setAttribute("aDepth", new THREE.BufferAttribute(ndepth, 1));
      nodeGeo.setAttribute("aPhase", new THREE.BufferAttribute(nphase, 1));
      const nodeMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uWave: { value: 0 }, uOpacity: { value: 0.95 }, uSizeBoost: { value: 1.0 } },
        vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Points(nodeGeo, nodeMat));
      disposables.push({ geo: nodeGeo, mat: nodeMat });

      // Edges: real LINKS as additive line segments. In LIVE mode brightness +
      // a travelling pulse are driven by link STRENGTH (aStr). A second per-edge
      // attribute aPos01 (0 at endpoint a, 1 at endpoint b) lets a pulse run
      // along each edge. Synthetic modes keep the layer-wave behaviour.
      const maxStr = isLive ? Math.max(1, ...edges.map((e) => e.strength || 1)) : 1;
      const epos = new Float32Array(edges.length * 6);
      const ecol = new Float32Array(edges.length * 6);
      const eLayer = new Float32Array(edges.length * 2);
      const eStr = new Float32Array(edges.length * 2);
      const ePos01 = new Float32Array(edges.length * 2);
      edges.forEach((e, i) => {
        const a = nodes[e.a].pos, b = nodes[e.b].pos;
        epos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        const ca = nodes[e.a].color, cb = nodes[e.b].color;
        ecol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], i * 6);
        eLayer[i * 2] = e.layer; eLayer[i * 2 + 1] = e.layer + 1;
        const sn = (e.strength || 1) / maxStr;
        eStr[i * 2] = sn; eStr[i * 2 + 1] = sn;
        ePos01[i * 2] = 0; ePos01[i * 2 + 1] = 1;
      });
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(epos, 3));
      edgeGeo.setAttribute("aColor", new THREE.BufferAttribute(ecol, 3));
      edgeGeo.setAttribute("aLayer", new THREE.BufferAttribute(eLayer, 1));
      edgeGeo.setAttribute("aStr", new THREE.BufferAttribute(eStr, 1));
      edgeGeo.setAttribute("aPos01", new THREE.BufferAttribute(ePos01, 1));
      const edgeMat = new THREE.ShaderMaterial({
        uniforms: { uWave: { value: 0 }, uLive: { value: isLive ? 1 : 0 }, uTime: { value: 0 } },
        vertexShader: `
          attribute vec3 aColor; attribute float aLayer; attribute float aStr; attribute float aPos01;
          varying vec3 vColor; varying float vBright;
          uniform float uWave; uniform float uLive; uniform float uTime;
          void main() {
            vColor = aColor;
            float d = abs(aLayer - uWave);
            float wave = exp(-d * d * 1.4);
            // LIVE: brightness scales with link strength; a pulse travels a→b.
            float pulse = exp(-pow(fract(uTime * 0.5) - aPos01, 2.0) * 12.0);
            float liveBright = (0.16 + 0.55 * aStr) + 0.5 * pulse * aStr;
            float synthBright = 0.10 + wave * 0.9;
            vBright = mix(synthBright, liveBright, uLive);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float; varying vec3 vColor; varying float vBright;
          void main() { gl_FragColor = vec4(vColor * vBright, vBright); }
        `,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.LineSegments(edgeGeo, edgeMat));
      disposables.push({ geo: edgeGeo, mat: edgeMat });

      waveSpan = Math.max(1, layerCount - 1);
      // LIVE GRAPH: the logical total reflects the real DB size (entities + links).
      // synthetic modes (mlp/cube) just mirror their drawn counts.
      const liveTotal = isLive ? OBJECTS.length + LINKS.length : nodes.length;
      const reportStats = (extra = {}) => onStatsRef.current?.({
        neurons: nodes.length,
        synapses: edges.length,
        total: isLive ? OBJECTS.length : nodes.length,
        totalSynapses: isLive ? LINKS.length : edges.length,
        rendered: nodes.length,
        liveTotal,
        layers: layerCount,
        fps: 0,
        webgl: true,
        ...(isLive && liveModel ? {
          clusters: liveModel.k,
          topNode: liveModel.topNode,
          modelSource: liveModel.source,
        } : {}),
        ...extra,
      });
      reportStats();

      // ── Recolour/resize node buffers in place from a refined model ──────────
      const ncolAttr = nodeGeo.getAttribute("aColor");
      const nsizeAttr = nodeGeo.getAttribute("aSize");
      const repaintNodes = () => {
        nodes.forEach((nd, i) => {
          ncolAttr.array[i * 3] = nd.color.r;
          ncolAttr.array[i * 3 + 1] = nd.color.g;
          ncolAttr.array[i * 3 + 2] = nd.color.b;
          nsizeAttr.array[i] = nd.renderSize || 4.0;
          // edge endpoint colours follow node cluster colours
        });
        ncolAttr.needsUpdate = true; nsizeAttr.needsUpdate = true;
        const ecolArr = edgeGeo.getAttribute("aColor").array;
        edges.forEach((e, i) => {
          const ca = nodes[e.a].color, cb = nodes[e.b].color;
          ecolArr[i * 6] = ca.r; ecolArr[i * 6 + 1] = ca.g; ecolArr[i * 6 + 2] = ca.b;
          ecolArr[i * 6 + 3] = cb.r; ecolArr[i * 6 + 4] = cb.g; ecolArr[i * 6 + 5] = cb.b;
        });
        edgeGeo.getAttribute("aColor").needsUpdate = true;
      };

      // ── REAL clustering + centrality via the science bridge (async) ─────────
      // pagerank: real per-node centrality from the actual LINKS graph.
      // kmeans_clustering: real cluster COUNT (k) → drives local assignment so
      // every node gets a cluster colour keyed to a benchmarked engine.
      if (isLive) {
        let cancelled = false;
        liveBridgeRefine(nodes, edges).then((refined) => {
          if (cancelled || !refined) return;
          liveModel = refined;
          applyLiveModel(nodes, refined);
          repaintNodes();
          reportStats();
        }).catch(() => { /* keep local fallback — never break the page */ });
        disposables.push({ cancel: () => { cancelled = true; } });
      }

      fpsCB = (t) => {
        const wave = (t * 0.9) % (waveSpan + 1.2);
        nodeMat.uniforms.uTime.value = t;
        nodeMat.uniforms.uWave.value = layerCount > 1 ? (wave / waveSpan) : 0;
        edgeMat.uniforms.uWave.value = wave;
        edgeMat.uniforms.uTime.value = t;
        return { wave };
      };
    }

    // ── Interaction: drag to rotate, gentle auto-spin otherwise ───────────────
    let dragging = false, px = 0, py = 0;
    let rotY = mode === "live" ? 0.4 : 0, rotX = 0.08;
    const onDown = (e) => { dragging = true; px = e.clientX; py = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e) => {
      if (!dragging) return;
      rotY += (e.clientX - px) * 0.005;
      rotX += (e.clientY - py) * 0.003;
      rotX = Math.max(-1.2, Math.min(1.2, rotX));
      px = e.clientX; py = e.clientY;
    };
    mount.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);

    // wheel = dolly the camera (zoom). Tracked for zoom-to-detail resampling.
    const baseZ = camera.position.z;
    const minZ = baseZ * 0.42, maxZ = baseZ * 1.6;
    const onWheel = (e) => {
      e.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z + e.deltaY * 0.01, minZ, maxZ
      );
    };
    mount.addEventListener("wheel", onWheel, { passive: false });

    const clock = new THREE.Clock();
    let raf;
    // fps tracking + 60fps guard (auto step-down if the first frames are slow)
    let frames = 0, fpsAccum = 0, lastFpsT = 0, fps = 0, slowFrames = 0;
    let reportT = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!dragging) rotY += cloudMode ? 0.0011 : 0.0016;
      group.rotation.y = rotY;
      group.rotation.x = rotX;

      // fps measure
      frames++;
      const now = performance.now();
      if (lastFpsT === 0) lastFpsT = now;
      fpsAccum = now - lastFpsT;
      if (fpsAccum >= 500) {
        fps = Math.round((frames * 1000) / fpsAccum);
        frames = 0; lastFpsT = now;
        // 60fps guard: if cloud is persistently slow, step down the point count
        if (cloudMode && fps > 0 && fps < 24) {
          slowFrames++;
          if (slowFrames >= 3) {
            const cur = Number(mount.dataset.neurons || 0);
            const lower = SCALES.filter((s) => s.neurons < cur).sort((a, b) => b.neurons - a.neurons)[0];
            if (lower && onStepDownRef.current) {
              onStepDownRef.current(lower.id);
              return;
            }
          }
        } else {
          slowFrames = 0;
        }
        // report fps periodically
        if (now - reportT > 480) {
          reportT = now;
          onStatsRef.current?.({ fpsOnly: true, fps });
        }
      }

      // ── Zoom-to-detail: ease a fraction of points toward the view centre as
      // the camera dollies in. Cheap: touches only a strided 1/8 subset/frame
      // and lerps from a pristine copy, so it never compounds or drifts. ──────
      if (cloudZoom) {
        const z = camera.position.z;
        // 0 at far zoom, →1 fully dollied in
        const closeness = THREE.MathUtils.clamp((maxZ - z) / (maxZ - minZ), 0, 1);
        const target = closeness * closeness * 0.5; // bias up to 50% pull-in
        // ease applied amount toward target so it streams in smoothly
        cloudZoom.applied += (target - cloudZoom.applied) * 0.08;
        const a = cloudZoom.applied;
        if (a > 0.001 || Math.abs(target - cloudZoom.applied) > 0.001) {
          const arr = cloudZoom.posAttr.array;
          const base = cloudZoom.base;
          const n = cloudZoom.count;
          // refresh a rotating 1/8 stride each frame (cheap, ~constant cost)
          const stride = 8;
          const off = frames % stride;
          for (let i = off; i < n; i += stride) {
            const i3 = i * 3;
            // pull factor varies per-point so structure densifies, not collapses
            const pull = a * (0.35 + 0.65 * ((i * 2654435761) % 1000) / 1000);
            arr[i3] = base[i3] * (1 - pull * 0.55);
            arr[i3 + 1] = base[i3 + 1] * (1 - pull * 0.55);
            arr[i3 + 2] = base[i3 + 2] * (1 - pull * 0.55);
          }
          cloudZoom.posAttr.needsUpdate = true;
        }
      }

      fpsCB && fpsCB(t);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = Math.max(320, mount.clientWidth || 0);
      const nh = Math.max(360, mount.clientHeight || 0);
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      mount.removeEventListener("mousedown", onDown);
      mount.removeEventListener("wheel", onWheel);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      for (const d of disposables) { d.cancel?.(); d.geo?.dispose(); d.mat?.dispose(); }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      delete mount.dataset.neurons;
      delete mount.dataset.synapses;
    };
  }, [mode, scaleId, totalNodes, kindKey, seed]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, cursor: "grab" }} />;
}

const MODES = [
  { id: "cloud", label: "NEURAL CLOUD", accent: CYAN.getStyle() },
  { id: "mlp", label: "MLP LATTICE", accent: CYAN.getStyle() },
  { id: "cube", label: "PERCEPTRON CUBE", accent: AMBER.getStyle() },
  { id: "live", label: "LIVE GRAPH", accent: C.neon },
];

const fmt = (n) => (n || 0).toLocaleString();

// Compact big-number formatter: 1.5M / 100M / 1B / 1T. Used for huge logical
// totals where comma form would be unreadably long.
const fmtBig = (n) => {
  n = n || 0;
  if (n >= 1e12) return (n / 1e12).toFixed(n % 1e12 === 0 ? 0 : 1).replace(/\.0$/, "") + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
};

export default function NeuralCore() {
  const [mode, setMode] = useState("cloud");           // DEFAULT = massive cloud
  const [scaleId, setScaleId] = useState(DEFAULT_SCALE);  // GPU render budget
  const [seed] = useState(() => 0xa53f);
  const [stats, setStats] = useState({ neurons: 0, synapses: 0, layers: 0, fps: 0 });

  const cloud = mode === "cloud";
  const live = mode === "live";

  // ── REAL Second-Brain data feeds (catalog + timeline + ontology) ──────────
  // The whole point of this page: the headline TOTAL and the foreground nodes
  // are REAL records from the store, not fabricated billions. Every call
  // degrades gracefully (apiGet/useAsync swallow failures) so the renderer
  // never crashes — an empty store simply reads as empty and SAYS so.
  const [catalog, setCatalog] = useState(null);     // { total, counts, recent, orphans }
  const [timeline, setTimeline] = useState([]);     // recent log/daily activity
  const [notes, setNotes] = useState([]);           // foreground node candidates
  const [ontoCount, setOntoCount] = useState(0);    // mirrored graph-object count
  const [throughput, setThroughput] = useState(null); // optional real metric
  const [selNote, setSelNote] = useState(null);     // click-to-open detail
  const [captureText, setCaptureText] = useState("");
  const [toast, setToast] = useState(null);         // last-captured note title
  const [flashId, setFlashId] = useState(null);     // id of the freshly-grown node
  const captureAsync = useAsync();
  const detailAsync = useAsync();

  // Pull the real store: total per-kind counts, recent notes (foreground nodes),
  // the activity timeline, and the mirrored ontology-object count. Folded into
  // the headline total so the big number == real knowledge in the store.
  const refresh = useCallback(async () => {
    const [cat, tl, ns, onto, metrics] = await Promise.all([
      apiGet("/v1/brain/catalog").catch(() => null),
      apiGet(`/v1/brain/timeline${qs({ limit: 50 })}`).catch(() => null),
      apiGet(`/v1/brain/notes${qs({ limit: 120 })}`).catch(() => null),
      apiGet(`/v1/ontology/objects${qs({ limit: 200 })}`).catch(() => null),
      apiGet("/v1/metrics").catch(() => null),
    ]);
    if (cat && typeof cat.total === "number") setCatalog(cat);
    setTimeline(asList(tl, "items"));
    setNotes(asList(ns, "items", "notes"));
    setOntoCount(asList(onto, "objects").length);
    // optional honest throughput: total captured/upserted ops from counters
    const counters = metrics?.metrics?.counters;
    if (Array.isArray(counters)) {
      const cap = counters.find((c) =>
        /brain|capture|note|upsert/i.test(c?.name || c?.key || ""));
      if (cap && Number.isFinite(Number(cap.value ?? cap.count)))
        setThroughput(Number(cap.value ?? cap.count));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // REAL headline total = brain notes + mirrored ontology objects. Grows live as
  // knowledge is captured. 0 when the store is genuinely empty (honestly so).
  const realTotal = (catalog?.total || 0) + ontoCount;

  // REAL per-kind colour clusters from the catalog counts (one cluster per kind).
  const kindClusters = useMemo(
    () => kindClustersFromCounts(catalog?.counts),
    [catalog]
  );

  // Foreground "percepticons" = REAL records: recent notes (catalog + /notes)
  // plus a sample of mirrored ontology objects. Clickable to open their content.
  const foreground = useMemo(() => {
    const seen = new Set();
    const out = [];
    const push = (n) => {
      if (!n) return;
      const id = n.id || n.title;
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(n);
    };
    (catalog?.recent || []).forEach(push);
    notes.forEach(push);
    return out;
  }, [catalog, notes]);

  // Logical total fed to the canvas. In LIVE GRAPH it tracks the local demo
  // graph; in the CLOUD it is the REAL store size (notes + ontology objects).
  const totalNodes = useMemo(() => {
    if (live) return OBJECTS.length;
    if (cloud) return realTotal;
    return 0;
  }, [cloud, live, realTotal]);

  // onStats supports both full stat objects and fps-only ticks (for the live FPS)
  const handleStats = (s) => {
    if (s.fpsOnly) { setStats((p) => ({ ...p, fps: s.fps })); return; }
    setStats(s);
  };

  // ── CAPTURE: the growth path. POST free text → store creates a note →
  // re-fetch catalog so the REAL total increments and a new percepticon appears.
  const doCapture = useCallback(async () => {
    const text = captureText.trim();
    if (!text) return;
    const note = await captureAsync.run(() => apiPost("/v1/brain/capture", { text }));
    setCaptureText("");
    if (note) {
      setToast(note.title || "(captured)");
      setFlashId(note.id || note.title);
      setSelNote(note);
      setTimeout(() => setFlashId(null), 2600);
      setTimeout(() => setToast(null), 4000);
    }
    // re-fetch so the headline total goes UP and the new node joins the cloud
    await refresh();
  }, [captureText, captureAsync, refresh]);

  // Open a real note's content in the side panel (click-to-open detail).
  const openNote = useCallback(async (n) => {
    setSelNote(n);
    const full = await detailAsync.run(() =>
      apiGet(`/v1/brain/notes/${encodeURIComponent(n.id || n.title)}`));
    if (full) setSelNote(full);
  }, [detailAsync]);

  // step-down hook: lets the canvas auto-drop the scale when frames are slow
  const stepDownRef = useRef(null);
  stepDownRef.current = (id) => setScaleId(id);

  const scaleLabel = useMemo(
    () => (SCALES.find((s) => s.id === scaleId) || SCALES[2]).label,
    [scaleId]
  );

  // Honest LOD display numbers.
  // displayTotal     = REAL store size (catalog.total + ontology objects).
  // displayRendered  = points the GPU actually draws this frame (the LOD sample).
  // displaySynapses  = conceptual synapse count (total * avgDegree, or live links).
  const displayTotal = stats.total || stats.neurons || 0;
  const displayRendered = stats.rendered || stats.neurons || 0;
  const displaySynapses = stats.totalSynapses || stats.synapses || 0;
  const isSampling = displayTotal > displayRendered;
  const storeEmpty = cloud && realTotal === 0;

  return (
    <PageShell
      title="NEURAL CORE"
      subtitle="GPU POINT-CLOUD · MILLIONS OF PERCEPTRONS · DENSE SYNAPSE FIELD"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  cursor: "pointer", fontFamily: "inherit", fontSize: 9, letterSpacing: 1.5,
                  padding: "6px 11px", borderRadius: 4,
                  color: active ? m.accent : C.text,
                  background: active ? m.accent + "1a" : "rgba(0,0,0,0.35)",
                  border: `1px solid ${active ? m.accent + "88" : C.border}`,
                  fontWeight: 700,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile
          label={cloud ? "Knowledge" : "Nodes"}
          value={cloud ? fmt(realTotal) : fmtBig(displayTotal)}
          accent={CYAN.getStyle()}
          sub={cloud
            ? (storeEmpty ? "store empty — capture to grow" : `real records (${fmt(catalog?.total || 0)} notes + ${fmt(ontoCount)} graph)`)
            : (isSampling ? `rendering ${fmt(displayRendered)} (LOD sample)` : (live ? "live entities" : "GPU point-cloud"))}
        />
        <StatTile
          label={cloud ? "Rendering" : "Synapses"}
          value={cloud ? fmt(displayRendered) : "~" + fmtBig(displaySynapses)}
          accent={C.blue}
          sub={cloud
            ? (isSampling ? "representative LOD sample" : "real records drawn 1:1")
            : (isSampling ? `drawing ${fmt(stats.synapses)} (sample)` : "additive edges")}
        />
        <StatTile
          label={live ? "Clusters" : cloud ? "Kinds" : "Scale"}
          value={live ? (stats.clusters || "—") : (cloud ? (kindClusters.length || "—") : "SIM")}
          accent={AMBER.getStyle()}
          sub={cloud
            ? (throughput != null ? `${fmt(throughput)} captures logged` : `budget ${scaleLabel} · colour=kind`)
            : live ? (stats.modelSource || "computing…") : `seed 0x${seed.toString(16)}`}
        />
        <StatTile
          label="FPS"
          value={stats.fps ? stats.fps : "—"}
          accent={stats.fps >= 50 ? C.neon : stats.fps >= 30 ? C.gold : stats.fps ? C.red : ACCENT}
          sub="live counter · ≤2x DPR"
        />
      </Grid>

      {cloud && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap",
          background: "rgba(0,0,0,0.32)", border: `1px solid ${CYAN.getStyle()}33`,
          borderRadius: 6, padding: "10px 12px",
        }}>
          <span style={{ fontSize: 8, letterSpacing: 1.5, color: CYAN.getStyle(), fontWeight: 700 }}>
            CAPTURE
          </span>
          <input
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doCapture(); }}
            placeholder="Type a thought to store in the Second Brain — it grows the cloud…"
            style={{
              flex: 1, minWidth: 220, fontFamily: "inherit", fontSize: 11,
              padding: "8px 10px", borderRadius: 4, color: C.textB,
              background: "rgba(0,0,0,0.45)", border: `1px solid ${C.border}`,
              outline: "none",
            }}
          />
          <button
            onClick={doCapture}
            disabled={captureAsync.loading || !captureText.trim()}
            style={{
              cursor: captureAsync.loading || !captureText.trim() ? "default" : "pointer",
              fontFamily: "inherit", fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
              padding: "8px 16px", borderRadius: 4,
              color: captureAsync.loading ? C.text : CYAN.getStyle(),
              background: CYAN.getStyle() + "1a",
              border: `1px solid ${CYAN.getStyle()}88`,
              opacity: !captureText.trim() ? 0.5 : 1,
            }}
          >
            {captureAsync.loading ? "STORING…" : "+ STORE"}
          </button>
          {toast && (
            <span style={{ fontSize: 9, letterSpacing: 1, color: C.neon }}>
              ▸ captured “{toast}” · total {fmt(realTotal)}
            </span>
          )}
          {captureAsync.error && (
            <span style={{ fontSize: 9, letterSpacing: 1, color: C.red }}>
              capture failed — store may be read-only (bearer required)
            </span>
          )}
        </div>
      )}

      {cloud && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 8, letterSpacing: 1.5, color: C.text, marginRight: 2 }}>RENDER</span>
          {SCALES.map((s) => {
            const active = s.id === scaleId;
            return (
              <button
                key={s.id}
                onClick={() => setScaleId(s.id)}
                style={{
                  cursor: "pointer", fontFamily: "inherit", fontSize: 9, letterSpacing: 1.5,
                  padding: "5px 12px", borderRadius: 4,
                  color: active ? CYAN.getStyle() : C.text,
                  background: active ? CYAN.getStyle() + "1a" : "rgba(0,0,0,0.35)",
                  border: `1px solid ${active ? CYAN.getStyle() + "88" : C.border}`,
                  fontWeight: 700,
                }}
              >
                {s.label}
              </button>
            );
          })}
          <span style={{ fontSize: 7, letterSpacing: 1, color: "rgba(168,188,200,0.5)", marginLeft: 4 }}>
            GPU budget · max points drawn
          </span>
        </div>
      )}

      <PanelCard title="NEURAL VOLUME · LIVE RENDER" accent={ACCENT} right={
        <Badge color={live ? C.neon : cloud ? CYAN.getStyle() : AMBER.getStyle()}>
          {live ? "● LIVE" : cloud ? "◌ POINT-CLOUD" : "◌ PROCEDURAL"}
        </Badge>
      }>
        <div style={{
          position: "relative", width: "100%", height: 560, borderRadius: 6, overflow: "hidden",
          background: "radial-gradient(ellipse at 50% 42%, #04111c 0%, #010305 72%)",
          border: `1px solid ${C.border}`,
        }}>
          <NeuralCanvas mode={mode} scaleId={scaleId} totalNodes={totalNodes} kindClusters={cloud ? kindClusters : null} seed={seed} onStats={handleStats} onStepDown={(id) => stepDownRef.current?.(id)} />

          {/* HUD overlay */}
          <div style={{
            position: "absolute", top: 10, left: 12, fontSize: 8, letterSpacing: 1.5,
            color: C.textB, fontFamily: "inherit", lineHeight: 1.7, pointerEvents: "none",
          }}>
            <div style={{ color: live ? C.neon : cloud ? CYAN.getStyle() : AMBER.getStyle(), fontWeight: 700 }}>
              {live ? "● LIVE GRAPH" : "◌ " + (MODES.find((m) => m.id === mode)?.label)}
            </div>
            <div>{cloud ? "KNOWLEDGE" : "NODES"}&nbsp;&nbsp;{fmt(displayTotal)}{cloud ? " real" : ""}</div>
            {storeEmpty && (
              <div style={{ color: C.gold }}>store empty — capture to grow</div>
            )}
            {isSampling && (
              <div style={{ color: "rgba(168,188,200,0.75)" }}>
                rendering {fmt(displayRendered)} (representative LOD sample)
              </div>
            )}
            <div>{live ? "EDGES" : "SYNAPSES"}&nbsp;{live ? fmt(LINKS.length) : "~" + fmtBig(displaySynapses)}</div>
            {cloud && <div>BUDGET&nbsp;&nbsp;&nbsp;{scaleLabel} drawn</div>}
            {live && <div>CLUSTERS&nbsp;{stats.clusters || "—"}</div>}
            {live && (
              <div style={{ color: C.neon }}>
                TOP&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{stats.topNode || "—"}
              </div>
            )}
            <div>FPS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{stats.fps || "—"}</div>
            {live ? (
              <div style={{ color: AMBER.getStyle() }}>
                {(stats.modelSource || "computing…").toUpperCase()} ▸ COLOUR=CLUSTER · SIZE=CENTRALITY
              </div>
            ) : (
              <div style={{ color: AMBER.getStyle() }}>ACTIVATION WAVE ▸ TRAVELLING BAND</div>
            )}
          </div>

          <div style={{
            position: "absolute", bottom: 10, right: 12, fontSize: 7, letterSpacing: 1.2,
            color: "rgba(168,188,200,0.5)", fontFamily: "inherit", pointerEvents: "none", textAlign: "right",
            maxWidth: 380,
          }}>
            DRAG TO ROTATE · SCROLL TO ZOOM · ADDITIVE BLOOM · ≤2x DPR<br />
            {cloud
              ? `Real store of ${fmt(realTotal)} records (notes + ontology). Colour clusters = real kinds. Level-of-Detail: when the store grows large we draw a bounded representative sample at 60fps rather than one primitive per record — but the TOTAL above is the genuine database count, growing as you capture.`
              : "Level-of-Detail — the frame draws a bounded representative sample at constant 60fps."}
          </div>
        </div>
      </PanelCard>

      {cloud && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 14, marginTop: 14 }}>
          {/* Foreground percepticons = REAL records, click to open */}
          <PanelCard title="PERCEPTICONS · REAL RECORDS" accent={CYAN.getStyle()}
            right={<Badge color={CYAN.getStyle()}>{foreground.length}</Badge>}>
            {foreground.length === 0 ? (
              <div style={{ fontSize: 10, color: C.text, padding: "12px 4px" }}>
                The Second Brain store is empty. Use the CAPTURE box above to store your
                first thought — it becomes a real record and a new percepticon in the cloud.
              </div>
            ) : (
              <Grid min={170}>
                {foreground.slice(0, 60).map((n) => {
                  const id = n.id || n.title;
                  const flashing = flashId && id === flashId;
                  return (
                    <button
                      key={id}
                      onClick={() => openNote(n)}
                      style={{
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                        background: flashing ? CYAN.getStyle() + "22" : "rgba(0,0,0,0.3)",
                        border: `1px solid ${flashing ? CYAN.getStyle() : C.border}`,
                        borderRadius: 5, padding: "8px 10px",
                        display: "flex", alignItems: "center", gap: 8,
                        transition: "background 0.4s, border-color 0.4s",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: CYAN.getStyle() }} />
                      <span style={{ fontSize: 10, color: C.textB, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.title || n.id}
                      </span>
                      <Badge color={AMBER.getStyle()}>{n.kind || "note"}</Badge>
                    </button>
                  );
                })}
              </Grid>
            )}
          </PanelCard>

          {/* Recent activity timeline + selected note detail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PanelCard title={selNote ? "NOTE DETAIL" : "RECENT CAPTURES"} accent={C.neon}
              right={<Badge color={C.neon}>{selNote ? (selNote.kind || "note") : timeline.length}</Badge>}>
              {selNote ? (
                <div style={{ fontSize: 11, color: C.textB, lineHeight: 1.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <strong style={{ color: CYAN.getStyle() }}>{selNote.title || selNote.id}</strong>
                    <button
                      onClick={() => setSelNote(null)}
                      style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 8, letterSpacing: 1.2,
                        color: C.text, background: "transparent", border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: "3px 8px" }}
                    >CLOSE</button>
                  </div>
                  {detailAsync.loading && <div style={{ color: C.text }}>loading…</div>}
                  <div style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflowY: "auto", fontSize: 10, color: C.text }}>
                    {selNote.body_md || selNote.body || selNote.markdown || "(no body)"}
                  </div>
                  {selNote.confidence != null && (
                    <div style={{ fontSize: 8, letterSpacing: 1, color: C.gold, marginTop: 6 }}>
                      confidence {Math.round((selNote.confidence || 0) * 100)}%
                    </div>
                  )}
                </div>
              ) : timeline.length === 0 ? (
                <div style={{ fontSize: 10, color: C.text, padding: "8px 2px" }}>
                  No activity yet — captures and daily notes appear here.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                  {timeline.map((n) => (
                    <button
                      key={n.id || n.title}
                      onClick={() => openNote(n)}
                      style={{
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                        background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: "6px 9px", fontSize: 10, color: C.textB,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ color: AMBER.getStyle(), marginRight: 6 }}>{n.kind || "note"}</span>
                      {n.title || n.id}
                    </button>
                  ))}
                </div>
              )}
            </PanelCard>
          </div>
        </div>
      )}

      {live && (
        <PanelCard title="BOUND ENTITIES" accent={C.neon} style={{ marginTop: 14 }}
          right={<Badge color={C.neon}>{OBJECTS.length}</Badge>}>
          <Grid min={150}>
            {OBJECTS.map((o) => (
              <div key={o.id} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${(C.type[o.type] || C.neon)}44`,
                borderRadius: 5, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.type[o.type] || C.neon }} />
                <span style={{ fontSize: 10, color: C.textB, fontWeight: 700, flex: 1 }}>{o.label}</span>
                <Badge color={C.type[o.type] || C.neon}>{o.type}</Badge>
              </div>
            ))}
          </Grid>
        </PanelCard>
      )}
    </PageShell>
  );
}

