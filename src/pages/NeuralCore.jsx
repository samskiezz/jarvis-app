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

// Deterministic seeded PRNG so the procedural lattice is stable across renders.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A radial-gradient sprite gives every node a soft additive bloom halo — the
// "glow" of the reel without a postprocessing pass (none is installed).
function makeGlowTexture() {
  const s = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.5, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── MLP lattice geometry ────────────────────────────────────────────────────
// A feed-forward multi-layer perceptron: layers of nodes spread on the X axis,
// each fully(ish)-connected to the next. Returns node positions/colors and a
// flat edge list (capped) plus per-edge layer index for the activation wave.
function buildMLP(layerSizes, seed) {
  const rng = mulberry32(seed);
  const span = 9; // total width on X
  const layers = [];
  const nodes = []; // {pos:Vec3, color:Color, layer}
  const L = layerSizes.length;

  layerSizes.forEach((n, li) => {
    const x = (li / (L - 1) - 0.5) * span;
    const layer = [];
    const cols = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const r = i / Math.max(1, n - 1);
      const ring = (i % cols) / Math.max(1, cols - 1) - 0.5;
      const row = Math.floor(i / cols) / Math.max(1, Math.ceil(n / cols) - 1) - 0.5;
      const jitter = () => (rng() - 0.5) * 0.55;
      const y = (row + jitter() * 0.4) * 5.2;
      const z = (ring + jitter() * 0.4) * 5.2;
      const t = li / (L - 1);
      // gradient cyan→amber across depth, mirroring the reel's two-tone look
      const col = new THREE.Color().copy(CYAN).lerp(AMBER, t).lerp(
        li === 0 ? BLUE : li === L - 1 ? ORANGE : CYAN, 0.25
      );
      const node = { pos: new THREE.Vector3(x, y, z), color: col, layer: li, r };
      layer.push(node);
      nodes.push(node);
    }
    layers.push(layer);
  });

  // Edges between consecutive layers, capped for 60fps.
  const MAX_EDGES = 4200;
  const edges = []; // {a:idx, b:idx, layer}
  const nodeIndex = new Map();
  nodes.forEach((nd, i) => nodeIndex.set(nd, i));
  // budget edges proportionally so the cube/wide layers don't blow the cap
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

  return { nodes, edges, layers, layerCount: L };
}

// ── "Live graph" lattice from the real ontology (OBJECTS/LINKS) ─────────────
// Real entities placed in a ring by type; real typed links become edges. This
// is the same data KGIKBrain renders, overlaid on the neural lattice.
function buildLiveGraph() {
  const nodes = [];
  const index = new Map();
  const types = [...new Set(OBJECTS.map((o) => o.type))];
  OBJECTS.forEach((o, i) => {
    const ti = types.indexOf(o.type);
    const ang = (i / OBJECTS.length) * Math.PI * 2;
    const tier = (ti / Math.max(1, types.length - 1) - 0.5) * 7; // type → X tier
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
    edges.push({ a, b, layer: 0, strength: l.strength });
  });
  return { nodes, edges, layers: [], layerCount: types.length, labels: nodes.filter((n) => n.label) };
}

const PRESETS = {
  mlp: [8, 24, 40, 56, 56, 40, 24, 6],   // input → hidden → output
  cube: [64, 64, 64, 64, 64, 64],         // dense "perceptron cube"
};

function NeuralCanvas({ mode, seed, onStats }) {
  const mountRef = useRef(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = Math.max(320, mount.clientWidth || 0);
    const H = Math.max(360, mount.clientHeight || 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010305, 0.045);
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
    camera.position.set(0, 0.5, 13);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // graceful degradation: no WebGL → leave the HUD-only fallback in the DOM
      mount.dataset.webgl = "0";
      return;
    }
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Build the lattice for the active mode.
    const data =
      mode === "live" ? buildLiveGraph() : buildMLP(PRESETS[mode] || PRESETS.mlp, seed);
    const { nodes, edges, layerCount } = data;

    const group = new THREE.Group();
    scene.add(group);

    // ── Nodes: additive glow sprites (core + halo) ────────────────────────────
    const glowTex = makeGlowTexture();
    const nodeGeo = new THREE.BufferGeometry();
    const npos = new Float32Array(nodes.length * 3);
    const ncol = new Float32Array(nodes.length * 3);
    const nsize = new Float32Array(nodes.length);
    nodes.forEach((nd, i) => {
      npos[i * 3] = nd.pos.x; npos[i * 3 + 1] = nd.pos.y; npos[i * 3 + 2] = nd.pos.z;
      ncol[i * 3] = nd.color.r; ncol[i * 3 + 1] = nd.color.g; ncol[i * 3 + 2] = nd.color.b;
      nsize[i] = mode === "live" ? 0.7 : 0.42;
    });
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(npos, 3));
    nodeGeo.setAttribute("aColor", new THREE.BufferAttribute(ncol, 3));
    nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(nsize, 1));

    // Custom shader so each point is a colored additive halo whose brightness
    // pulses with the activation wave (uWave = current active layer, fractional).
    const nodeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: glowTex },
        uTime: { value: 0 },
        uWave: { value: 0 },
        uLayers: { value: Math.max(1, layerCount - 1) },
      },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize;
        varying vec3 vColor; varying float vGlow;
        uniform float uTime; uniform float uWave; uniform float uLayers;
        void main() {
          vColor = aColor;
          // layer is encoded in x normalized; approximate via position for pulse
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float pulse = 0.6 + 0.4 * sin(uTime * 2.0 + position.y * 0.6 + position.z * 0.6);
          vGlow = pulse;
          gl_PointSize = aSize * (300.0 / -mv.z) * (0.85 + 0.3 * pulse);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vColor; varying float vGlow;
        void main() {
          float a = texture2D(uTex, gl_PointCoord).a;
          vec3 col = vColor * (0.7 + 0.9 * vGlow);
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Points(nodeGeo, nodeMat));

    // ── Edges: additive thin lines, brightness driven by a travelling wave ────
    const epos = new Float32Array(edges.length * 6);
    const ecol = new Float32Array(edges.length * 6);
    const eLayer = new Float32Array(edges.length * 2); // per-vertex layer for wave
    edges.forEach((e, i) => {
      const a = nodes[e.a].pos, b = nodes[e.b].pos;
      epos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      // tint edges toward the source node color, biased to cyan/amber
      const ca = nodes[e.a].color, cb = nodes[e.b].color;
      ecol.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], i * 6);
      eLayer[i * 2] = e.layer; eLayer[i * 2 + 1] = e.layer + 1;
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(epos, 3));
    edgeGeo.setAttribute("aColor", new THREE.BufferAttribute(ecol, 3));
    edgeGeo.setAttribute("aLayer", new THREE.BufferAttribute(eLayer, 1));

    const edgeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uWave: { value: 0 }, uLive: { value: mode === "live" ? 1 : 0 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aLayer;
        varying vec3 vColor; varying float vBright;
        uniform float uTime; uniform float uWave; uniform float uLive;
        void main() {
          vColor = aColor;
          // a band of brightness sweeps from input layer to output layer
          float d = abs(aLayer - uWave);
          float wave = exp(-d * d * 1.4);
          float base = mix(0.10, 0.18, uLive);
          vBright = base + wave * 0.9;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vBright;
        void main() { gl_FragColor = vec4(vColor * vBright, vBright); }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.LineSegments(edgeGeo, edgeMat));

    onStatsRef.current?.({ nodes: nodes.length, edges: edges.length, layers: layerCount });

    // ── Interaction: drag to rotate, gentle auto-spin otherwise ───────────────
    let dragging = false, px = 0, py = 0, rotY = mode === "live" ? 0.4 : 0, rotX = 0.1;
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
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (!dragging) rotY += 0.0016;
      group.rotation.y = rotY;
      group.rotation.x = rotX;
      // travelling activation wave: 0 → (layers-1) on a loop
      const span = Math.max(1, layerCount - 1);
      const wave = ((t * 0.9) % (span + 1.2));
      nodeMat.uniforms.uTime.value = t;
      edgeMat.uniforms.uTime.value = t;
      nodeMat.uniforms.uWave.value = wave;
      edgeMat.uniforms.uWave.value = wave;
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
      glowTex.dispose();
      nodeGeo.dispose(); nodeMat.dispose();
      edgeGeo.dispose(); edgeMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [mode, seed]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, cursor: "grab" }} />;
}

const MODES = [
  { id: "mlp", label: "MLP LATTICE", accent: CYAN.getStyle() },
  { id: "cube", label: "PERCEPTRON CUBE", accent: AMBER.getStyle() },
  { id: "live", label: "LIVE GRAPH", accent: C.neon },
];

export default function NeuralCore() {
  const [mode, setMode] = useState("mlp");
  const [seed] = useState(() => 0xa53f);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, layers: 0 });

  const live = mode === "live";
  const params = useMemo(() => {
    if (live) return { nodes: OBJECTS.length, layers: new Set(OBJECTS.map((o) => o.type)).size };
    const ls = PRESETS[mode] || PRESETS.mlp;
    return { nodes: ls.reduce((a, b) => a + b, 0), layers: ls.length };
  }, [mode, live]);

  return (
    <PageShell
      title="NEURAL CORE"
      subtitle="PERCEPTRON LATTICE · FEED-FORWARD MULTI-LAYER NETWORK"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
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
        <StatTile label="Nodes" value={stats.nodes || params.nodes} accent={CYAN.getStyle()} sub={live ? "live entities" : "perceptrons"} />
        <StatTile label="Synapses" value={stats.edges.toLocaleString()} accent={C.blue} sub="additive edges" />
        <StatTile label="Layers" value={stats.layers || params.layers} accent={AMBER.getStyle()} sub={live ? "entity tiers" : "depth"} />
        <StatTile
          label="Status"
          value={live ? "LIVE" : "SIM"}
          accent={live ? C.neon : ACCENT}
          sub={live ? "ontology bound" : `seed 0x${seed.toString(16)}`}
        />
      </Grid>

      <PanelCard title="LATTICE · LIVE RENDER" accent={ACCENT} right={
        <Badge color={live ? C.neon : CYAN.getStyle()}>{live ? "● LIVE" : "◌ PROCEDURAL"}</Badge>
      }>
        <div style={{
          position: "relative", width: "100%", height: 520, borderRadius: 6, overflow: "hidden",
          background: "radial-gradient(ellipse at 50% 40%, #04111c 0%, #010305 70%)",
          border: `1px solid ${C.border}`,
        }}>
          <NeuralCanvas mode={mode} seed={seed} onStats={setStats} />

          {/* HUD overlay */}
          <div style={{
            position: "absolute", top: 10, left: 12, fontSize: 8, letterSpacing: 1.5,
            color: C.textB, fontFamily: "inherit", lineHeight: 1.7, pointerEvents: "none",
          }}>
            <div style={{ color: live ? C.neon : CYAN.getStyle(), fontWeight: 700 }}>
              {live ? "● LIVE GRAPH" : "◌ " + (MODES.find((m) => m.id === mode)?.label)}
            </div>
            <div>NODES&nbsp;&nbsp;{stats.nodes}</div>
            <div>EDGES&nbsp;&nbsp;{stats.edges.toLocaleString()}</div>
            <div>LAYERS&nbsp;{stats.layers}</div>
            <div style={{ color: AMBER.getStyle() }}>ACTIVATION WAVE ▸ FEED-FORWARD</div>
          </div>

          <div style={{
            position: "absolute", bottom: 10, right: 12, fontSize: 7, letterSpacing: 1.5,
            color: "rgba(168,188,200,0.45)", fontFamily: "inherit", pointerEvents: "none",
          }}>
            DRAG TO ROTATE · ADDITIVE BLOOM · 60FPS CAP
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
