import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORS as C } from "@/domain/colors";
import { OBJECTS, LINKS } from "@/domain/ontology";
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

function buildLiveGraph() {
  const nodes = [];
  const index = new Map();
  const types = [...new Set(OBJECTS.map((o) => o.type))];
  OBJECTS.forEach((o, i) => {
    const ti = types.indexOf(o.type);
    const ang = (i / OBJECTS.length) * Math.PI * 2;
    const tier = (ti / Math.max(1, types.length - 1) - 0.5) * 7;
    const rad = 3.4 + (i % 3) * 0.7;
    const col = new THREE.Color(C.type[o.type] || C.neon);
    const pos = new THREE.Vector3(tier, Math.sin(ang) * rad, Math.cos(ang) * rad);
    const node = { pos, color: col, layer: ti, label: o.label, id: o.id };
    index.set(o.id, nodes.length);
    nodes.push(node);
  });
  const edges = [];
  LINKS.forEach((l) => {
    const a = index.get(l.a), b = index.get(l.b);
    if (a == null || b == null) return;
    edges.push({ a, b, layer: 0 });
  });
  return { nodes, edges, layerCount: types.length };
}

const PRESETS = {
  mlp: [8, 24, 40, 56, 56, 40, 24, 6],
  cube: [64, 64, 64, 64, 64, 64],
};

// Scale selector for the massive cloud. Each option is the neuron point count;
// the synapse haze tracks at ~1/3 of that, lines are capped separately.
const SCALES = [
  { id: "250k", label: "250K", neurons: 250_000 },
  { id: "1m", label: "1M", neurons: 1_000_000 },
  { id: "1.5m", label: "1.5M", neurons: 1_500_000 },
  { id: "2m", label: "2M", neurons: 2_000_000 },
  { id: "3m", label: "3M", neurons: 3_000_000 },
];
const DEFAULT_SCALE = "1.5m";       // ~1,500,000 neurons by default
const HAZE_RATIO = 1 / 3;           // synapse haze points per neuron
const MAX_LINES = 48_000;           // hard-capped near-focus line definition

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
function buildCloudBuffers(neuronCount, seed) {
  const rng = mulberry32(seed);

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

    // colour: cyan→amber across depth, with blue/orange bias at the poles
    cA.copy(CYAN).lerp(BLUE, 0.3);
    cB.copy(AMBER).lerp(ORANGE, 0.3);
    tmp.copy(cA).lerp(cB, depth);
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

function NeuralCanvas({ mode, scaleId, seed, onStats, onStepDown }) {
  const mountRef = useRef(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onStepDownRef = useRef(onStepDown);
  onStepDownRef.current = onStepDown;

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

    if (cloudMode) {
      // ── MASSIVE DENSE NEURON CLOUD ──────────────────────────────────────
      const wanted = (SCALES.find((s) => s.id === scaleId) || SCALES[2]).neurons;
      // try the requested scale; on allocation failure step down automatically
      const ladder = SCALES.map((s) => s.neurons).filter((n) => n <= wanted).sort((a, b) => b - a);
      let built = null, usedNeurons = 0;
      for (const n of ladder) {
        try {
          built = buildCloudBuffers(n, seed);
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

      waveSpan = 1; // depth normalized 0..1

      onStatsRef.current?.({
        neurons: usedNeurons,
        synapses: synapseCount,
        layers: 64,
        fps: 0,
        webgl: true,
        steppedDown: usedNeurons < wanted,
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
      const data = mode === "live" ? buildLiveGraph() : buildMLP(PRESETS[mode] || PRESETS.mlp, seed);
      const { nodes, edges, layerCount } = data;

      const nodeGeo = new THREE.BufferGeometry();
      const npos = new Float32Array(nodes.length * 3);
      const ncol = new Float32Array(nodes.length * 3);
      const nsize = new Float32Array(nodes.length);
      const ndepth = new Float32Array(nodes.length);
      const nphase = new Float32Array(nodes.length);
      nodes.forEach((nd, i) => {
        npos[i * 3] = nd.pos.x; npos[i * 3 + 1] = nd.pos.y; npos[i * 3 + 2] = nd.pos.z;
        ncol[i * 3] = nd.color.r; ncol[i * 3 + 1] = nd.color.g; ncol[i * 3 + 2] = nd.color.b;
        nsize[i] = mode === "live" ? 4.0 : 2.6;
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

      const epos = new Float32Array(edges.length * 6);
      const ecol = new Float32Array(edges.length * 6);
      const eLayer = new Float32Array(edges.length * 2);
      edges.forEach((e, i) => {
        const a = nodes[e.a].pos, b = nodes[e.b].pos;
        epos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        const ca = nodes[e.a].color, cb = nodes[e.b].color;
        ecol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], i * 6);
        eLayer[i * 2] = e.layer; eLayer[i * 2 + 1] = e.layer + 1;
      });
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(epos, 3));
      edgeGeo.setAttribute("aColor", new THREE.BufferAttribute(ecol, 3));
      edgeGeo.setAttribute("aLayer", new THREE.BufferAttribute(eLayer, 1));
      const edgeMat = new THREE.ShaderMaterial({
        uniforms: { uWave: { value: 0 }, uLive: { value: mode === "live" ? 1 : 0 } },
        vertexShader: `
          attribute vec3 aColor; attribute float aLayer;
          varying vec3 vColor; varying float vBright;
          uniform float uWave; uniform float uLive;
          void main() {
            vColor = aColor;
            float d = abs(aLayer - uWave);
            float wave = exp(-d * d * 1.4);
            float base = mix(0.10, 0.18, uLive);
            vBright = base + wave * 0.9;
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
      onStatsRef.current?.({ neurons: nodes.length, synapses: edges.length, layers: layerCount, fps: 0, webgl: true });

      fpsCB = (t) => {
        const wave = (t * 0.9) % (waveSpan + 1.2);
        nodeMat.uniforms.uTime.value = t;
        nodeMat.uniforms.uWave.value = layerCount > 1 ? (wave / waveSpan) : 0;
        edgeMat.uniforms.uWave.value = wave;
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
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      for (const d of disposables) { d.geo?.dispose(); d.mat?.dispose(); }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      delete mount.dataset.neurons;
      delete mount.dataset.synapses;
    };
  }, [mode, scaleId, seed]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, cursor: "grab" }} />;
}

const MODES = [
  { id: "cloud", label: "NEURAL CLOUD", accent: CYAN.getStyle() },
  { id: "mlp", label: "MLP LATTICE", accent: CYAN.getStyle() },
  { id: "cube", label: "PERCEPTRON CUBE", accent: AMBER.getStyle() },
  { id: "live", label: "LIVE GRAPH", accent: C.neon },
];

const fmt = (n) => (n || 0).toLocaleString();

export default function NeuralCore() {
  const [mode, setMode] = useState("cloud");           // DEFAULT = massive cloud
  const [scaleId, setScaleId] = useState(DEFAULT_SCALE);
  const [seed] = useState(() => 0xa53f);
  const [stats, setStats] = useState({ neurons: 0, synapses: 0, layers: 0, fps: 0 });

  const cloud = mode === "cloud";
  const live = mode === "live";

  // onStats supports both full stat objects and fps-only ticks (for the live FPS)
  const handleStats = (s) => {
    if (s.fpsOnly) { setStats((p) => ({ ...p, fps: s.fps })); return; }
    setStats(s);
  };

  // step-down hook: lets the canvas auto-drop the scale when frames are slow
  const stepDownRef = useRef(null);
  stepDownRef.current = (id) => setScaleId(id);

  const scaleLabel = useMemo(
    () => (SCALES.find((s) => s.id === scaleId) || SCALES[2]).label,
    [scaleId]
  );

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
          label="Neurons"
          value={fmt(stats.neurons)}
          accent={CYAN.getStyle()}
          sub={cloud ? "GPU point-cloud" : live ? "live entities" : "perceptrons"}
        />
        <StatTile
          label="Synapses"
          value={"~" + fmt(stats.synapses)}
          accent={C.blue}
          sub={cloud ? "haze + capped lines" : "additive edges"}
        />
        <StatTile
          label="Scale"
          value={cloud ? scaleLabel : (live ? "LIVE" : "SIM")}
          accent={AMBER.getStyle()}
          sub={cloud ? "neuron count" : live ? "ontology bound" : `seed 0x${seed.toString(16)}`}
        />
        <StatTile
          label="FPS"
          value={stats.fps ? stats.fps : "—"}
          accent={stats.fps >= 50 ? C.neon : stats.fps >= 30 ? C.gold : stats.fps ? C.red : ACCENT}
          sub="live counter · ≤2x DPR"
        />
      </Grid>

      {cloud && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 8, letterSpacing: 1.5, color: C.text, marginRight: 2 }}>SCALE</span>
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
          <NeuralCanvas mode={mode} scaleId={scaleId} seed={seed} onStats={handleStats} onStepDown={(id) => stepDownRef.current?.(id)} />

          {/* HUD overlay */}
          <div style={{
            position: "absolute", top: 10, left: 12, fontSize: 8, letterSpacing: 1.5,
            color: C.textB, fontFamily: "inherit", lineHeight: 1.7, pointerEvents: "none",
          }}>
            <div style={{ color: live ? C.neon : cloud ? CYAN.getStyle() : AMBER.getStyle(), fontWeight: 700 }}>
              {live ? "● LIVE GRAPH" : "◌ " + (MODES.find((m) => m.id === mode)?.label)}
            </div>
            <div>NEURONS&nbsp;&nbsp;{fmt(stats.neurons)}</div>
            <div>SYNAPSES&nbsp;~{fmt(stats.synapses)}</div>
            {cloud && <div>SCALE&nbsp;&nbsp;&nbsp;&nbsp;{scaleLabel}</div>}
            <div>FPS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{stats.fps || "—"}</div>
            <div style={{ color: AMBER.getStyle() }}>ACTIVATION WAVE ▸ TRAVELLING BAND</div>
          </div>

          <div style={{
            position: "absolute", bottom: 10, right: 12, fontSize: 7, letterSpacing: 1.2,
            color: "rgba(168,188,200,0.5)", fontFamily: "inherit", pointerEvents: "none", textAlign: "right",
          }}>
            DRAG TO ROTATE · ADDITIVE BLOOM · ≤2x DPR<br />
            GPU point-cloud · {cloud ? scaleLabel : ""} neurons @ 60fps (browsers can't render literal billions)
          </div>
        </div>
      </PanelCard>

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

