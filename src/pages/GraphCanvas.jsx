/**
 * GraphCanvas — a Gotham-grade interactive node-link investigation canvas.
 *
 * A real, live force-directed graph (NOT a static SVG): we run our own tiny
 * velocity / repulsion / spring simulation on a <canvas> via requestAnimationFrame,
 * targeting ~60fps for a few hundred nodes. The analyst drives it like Gotham's
 * Graph application:
 *   • PAN     — drag the background.
 *   • ZOOM    — mouse wheel (anchored on the cursor).
 *   • DRAG    — drag a node to reposition it (which pins it).
 *   • SELECT  — click a node → detail sidebar + edge highlight.
 *   • EXPAND  — double-click a node (or the sidebar button) →
 *               GET /v1/graph/expand/{id} merges the neighbourhood in.
 *   • COLLAPSE— removes the leaf neighbours a given node introduced.
 *   • HISTOGRAM — selection-driven breakdown (by type / mark) of the visible
 *               nodes; clicking a bar highlights that cohort.
 *   • TOOLBAR — reload base subgraph, fit-to-view, toggle labels, type filter,
 *               and a search box that centres a matching node.
 *
 * Data contract:
 *   GET /v1/graph/subgraph      -> { nodes:[{id,label,type,mark,props}], edges:[{a,b,strength,relation}] }
 *   GET /v1/graph/expand/{id}   -> same shape (the node's neighbourhood)
 *
 * Every backend call degrades gracefully via useAsync; the canvas keeps working
 * with whatever it already holds.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";
import { Btn, KV, inputStyle } from "@/components/Wave1Kit";
import { apiGet, asList, labelOf, useAsync } from "@/lib/wave1";
import { idToColor, colorToId } from "@/engine/gpuPicking";
import { slerp } from "@/engine/quaternionCamera";
import { BinaryDeltaSocket } from "@/engine/binaryTransport";
import { appParams } from "@/lib/app-params";

const ACCENT = C.neon;

// Op codes — must match server/services/graph_stream.py exactly.
const OP_NODE = 1, OP_EDGE = 2, OP_REMOVE = 3, OP_HEARTBEAT = 4, OP_SNAPSHOT_END = 5;

// Decode one binary delta frame (big-endian, strings = uint16 len + UTF-8).
function decodeFrame(buf) {
  const dv = new DataView(buf);
  let i = 0;
  const op = dv.getUint8(i); i += 1;
  const dec = new TextDecoder();
  const rstr = () => {
    const len = dv.getUint16(i); i += 2;
    const s = dec.decode(new Uint8Array(buf, i, len)); i += len;
    return s;
  };
  if (op === OP_NODE) {
    const id = rstr(), label = rstr(), type = rstr(), mark = rstr();
    const conf = dv.getFloat32(i); i += 4;
    const redacted = !!dv.getUint8(i); i += 1;
    return { op: "node", id, label, type, mark, conf, redacted };
  }
  if (op === OP_EDGE) {
    const a = rstr(), b = rstr(), relation = rstr();
    const strength = dv.getFloat32(i); i += 4;
    return { op: "edge", a, b, relation, strength };
  }
  if (op === OP_REMOVE) return { op: "remove", id: rstr() };
  if (op === OP_HEARTBEAT) return { op: "heartbeat", ts: dv.getFloat64(1) };
  if (op === OP_SNAPSHOT_END) return { op: "snapshot_end" };
  return { op: "unknown" };
}

// Encode a screen-plane rotation angle (radians) as a unit quaternion about Z,
// so camera rotations can be interpolated with proper spherical-linear blending.
const zQuat = (theta) => [0, 0, Math.sin(theta / 2), Math.cos(theta / 2)];
const zAngleOf = (q) => 2 * Math.atan2(q[2], q[3]);

const nid = (n) => (n && (n.id ?? n.node ?? n.key ?? n.name)) ?? null;
const edgeEnds = (e) => [
  e.a ?? e.source ?? e.from ?? e.src ?? (e && e[0]) ?? null,
  e.b ?? e.target ?? e.to ?? e.dst ?? (e && e[1]) ?? null,
];
const edgeStrength = (e) => Number(e.strength ?? e.weight ?? e.value ?? 1) || 1;
const edgeRel = (e) => e.relation || e.rel || e.relationship || e.label || "";

const colorForType = (type) => C.type[type] || C.blue;
const colorForMark = (mark) => C.mark[mark] || C.text;

// Deterministic PRNG so first-frame seed positions are stable across reloads.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function GraphCanvas() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // ── Graph model ───────────────────────────────────────────────────────────
  // sim holds the live mutable simulation state (nodes with x/y/vx/vy, edges,
  // adjacency, degree). We keep it in a ref so the rAF loop reads/writes without
  // forcing React re-renders every frame.
  const sim = useRef({ nodes: new Map(), edges: [], adj: new Map(), degree: new Map() });
  const rng = useRef(mulberry32(0xa11ce));
  const [graphVersion, setGraphVersion] = useState(0); // bump to recompute React-side derivations

  // Provenance: which node introduced which neighbours (for collapse).
  const introducedBy = useRef(new Map()); // expandedNodeId -> Set(childIds it added)

  // ── View transform (pan/zoom/rotate) ──────────────────────────────────────
  // `rot` is a screen-plane rotation (radians); camera transitions are animated,
  // with rotation interpolated via quaternion slerp (engine/quaternionCamera).
  const view = useRef({ tx: 0, ty: 0, scale: 1, rot: 0 });
  const camAnim = useRef(null); // active animation frame id
  // Offscreen colour-id buffer for GPU-style picking (engine/gpuPicking).
  const pickRef = useRef(null);

  // ── Interaction state ─────────────────────────────────────────────────────
  const drag = useRef(null);   // { mode:'pan'|'node', id, sx,sy, ntx,nty }
  const hover = useRef(null);   // hovered node id (ref → no per-frame re-render)

  // ── React-facing UI state ─────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");      // "" = all
  const [histMode, setHistMode] = useState("type");       // "type" | "mark"
  const [histPick, setHistPick] = useState("");            // highlighted cohort key
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });

  const subAsync = useAsync();
  const expandAsync = useAsync();

  // Rebuild adjacency + degree from current node/edge sets.
  const reindex = useCallback(() => {
    const s = sim.current;
    const adj = new Map();
    const degree = new Map();
    for (const id of s.nodes.keys()) { adj.set(id, new Set()); degree.set(id, 0); }
    for (const e of s.edges) {
      const [a, b] = [e._a, e._b];
      if (!s.nodes.has(a) || !s.nodes.has(b)) continue;
      adj.get(a).add(b); adj.get(b).add(a);
      degree.set(a, (degree.get(a) || 0) + 1);
      degree.set(b, (degree.get(b) || 0) + 1);
    }
    s.adj = adj; s.degree = degree;
  }, []);

  // Merge incoming nodes/edges into the live sim (dedupe by id), seeding new
  // nodes near `originId` (or centre) so expansions grow organically.
  const mergeGraph = useCallback((rawNodes, rawEdges, originId) => {
    const s = sim.current;
    const origin = originId != null ? s.nodes.get(originId) : null;
    const cx = origin ? origin.x : (wrapRef.current?.clientWidth || 800) / 2;
    const cy = origin ? origin.y : (wrapRef.current?.clientHeight || 560) / 2;
    const added = [];

    for (const raw of asList({ nodes: rawNodes }, "nodes")) {
      const id = nid(raw);
      if (id == null || s.nodes.has(id)) {
        // refresh metadata on an existing node without moving it
        if (id != null && s.nodes.has(id)) Object.assign(s.nodes.get(id).data, raw);
        continue;
      }
      const ang = rng.current() * Math.PI * 2;
      const rad = 36 + rng.current() * 60;
      s.nodes.set(id, {
        id,
        x: cx + Math.cos(ang) * rad,
        y: cy + Math.sin(ang) * rad,
        vx: 0, vy: 0,
        pinned: false,
        data: raw,
      });
      added.push(id);
    }

    const seenEdge = new Set(s.edges.map((e) => e._key));
    for (const raw of asList({ edges: rawEdges }, "edges")) {
      const [a, b] = edgeEnds(raw);
      if (a == null || b == null || a === b) continue;
      const key = a < b ? `${a}__${b}` : `${b}__${a}`;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      s.edges.push({ _a: a, _b: b, _key: key, _s: edgeStrength(raw), _rel: edgeRel(raw), data: raw });
    }

    if (originId != null && added.length) {
      const set = introducedBy.current.get(originId) || new Set();
      added.forEach((id) => set.add(id));
      introducedBy.current.set(originId, set);
    }

    reindex();
    setCounts({ nodes: s.nodes.size, edges: s.edges.length });
    setGraphVersion((v) => v + 1);
  }, [reindex]);

  // Replace the whole graph (base reload).
  const setGraph = useCallback((rawNodes, rawEdges) => {
    sim.current = { nodes: new Map(), edges: [], adj: new Map(), degree: new Map() };
    introducedBy.current = new Map();
    rng.current = mulberry32(0xa11ce);
    setSelected(null); setHistPick("");
    mergeGraph(rawNodes, rawEdges, null);
  }, [mergeGraph]);

  // ── Backend: reload base subgraph ─────────────────────────────────────────
  const loadSubgraph = useCallback(async () => {
    const body = await subAsync.run(() => apiGet("/v1/graph/subgraph"));
    if (!body) { setGraph([], []); return; }
    setGraph(asList(body, "nodes", "vertices"), asList(body, "edges", "links"));
  }, [subAsync, setGraph]);

  useEffect(() => { loadSubgraph(); }, []); // initial load

  // Remove a set of node ids (and their incident edges) from the live sim.
  const removeNodes = useCallback((ids) => {
    const s = sim.current;
    let changed = false;
    for (const id of ids) { if (s.nodes.delete(id)) changed = true; }
    if (!changed) return;
    s.edges = s.edges.filter((e) => s.nodes.has(e._a) && s.nodes.has(e._b));
    reindex();
    setCounts({ nodes: s.nodes.size, edges: s.edges.length });
    setGraphVersion((v) => v + 1);
  }, [reindex]);

  // ── LIVE binary delta stream (engine/binaryTransport → /v1/graph/stream) ──
  // Real WebSocket carrying binary ArrayBuffer frames (NOT JSON). We decode each
  // frame and apply it to the live sim, batching a burst until SNAPSHOT_END /
  // HEARTBEAT so React only re-derives once per batch.
  const [live, setLive] = useState({ connected: false, frames: 0, lastBeat: null });
  useEffect(() => {
    const base = (appParams.apiBaseUrl || "http://localhost:8000").replace(/^http/, "ws");
    const buf = { nodes: [], edges: [], removes: [] };
    let frames = 0;
    const flush = () => {
      if (buf.removes.length) { removeNodes(buf.removes); buf.removes = []; }
      if (buf.nodes.length || buf.edges.length) {
        mergeGraph(buf.nodes, buf.edges, null);
        buf.nodes = []; buf.edges = [];
      }
    };
    let sock;
    try {
      sock = new BinaryDeltaSocket(`${base}/v1/graph/stream`, (frame) => {
        let d;
        try { d = decodeFrame(frame); } catch { return; }
        frames += 1;
        if (d.op === "node") buf.nodes.push({ id: d.id, label: d.label, type: d.type, mark: d.mark, redacted: d.redacted });
        else if (d.op === "edge") buf.edges.push({ a: d.a, b: d.b, relation: d.relation, strength: d.strength });
        else if (d.op === "remove") buf.removes.push(d.id);
        else if (d.op === "snapshot_end") { flush(); setLive((l) => ({ ...l, connected: true, frames })); }
        else if (d.op === "heartbeat") { flush(); setLive((l) => ({ ...l, connected: true, frames, lastBeat: Date.now() })); }
      });
      sock.connect();
      // BinaryDeltaSocket opens lazily; reflect "connecting" immediately.
      setLive((l) => ({ ...l, connected: false, frames: 0 }));
    } catch { /* transport unavailable — REST data still works */ }
    return () => { try { sock?.close(); } catch { /* noop */ } };
  }, [mergeGraph, removeNodes]);

  // ── Backend: expand a node's neighbourhood ────────────────────────────────
  const expand = useCallback(async (id) => {
    if (id == null) return;
    const body = await expandAsync.run(() => apiGet(`/v1/graph/expand/${encodeURIComponent(id)}`));
    if (!body) return;
    mergeGraph(asList(body, "nodes", "vertices"), asList(body, "edges", "links"), id);
  }, [expandAsync, mergeGraph]);

  // Collapse: drop the leaf neighbours this node introduced (only those that
  // aren't anchored by another edge or further expansions).
  const collapse = useCallback((id) => {
    const s = sim.current;
    const set = introducedBy.current.get(id);
    if (!set || !set.size) return;
    const remove = new Set();
    for (const child of set) {
      if (!s.nodes.has(child)) continue;
      if (introducedBy.current.get(child)?.size) continue; // it expanded further → keep
      // only remove if its sole link in/out is back toward the originator's region
      const nbrs = s.adj.get(child) || new Set();
      const external = [...nbrs].filter((n) => n !== id && !set.has(n));
      if (external.length === 0) remove.add(child);
    }
    if (!remove.size) return;
    s.nodes = new Map([...s.nodes].filter(([k]) => !remove.has(k)));
    s.edges = s.edges.filter((e) => !remove.has(e._a) && !remove.has(e._b));
    introducedBy.current.delete(id);
    reindex();
    if (remove.has(selected)) setSelected(null);
    setCounts({ nodes: s.nodes.size, edges: s.edges.length });
    setGraphVersion((v) => v + 1);
  }, [reindex, selected]);

  // ── Derived: visible node list + type/mark domains (React side) ───────────
  const nodeList = useMemo(() => {
    void graphVersion; // dependency: recompute when graph mutates
    return [...sim.current.nodes.values()];
  }, [graphVersion]);

  const passesFilter = useCallback((node) => {
    if (!typeFilter) return true;
    return (node.data.type || "—") === typeFilter;
  }, [typeFilter]);

  const types = useMemo(() => {
    const set = new Set();
    nodeList.forEach((n) => set.add(n.data.type || "—"));
    return [...set].sort();
  }, [nodeList]);

  // Selection histogram: breakdown of currently-visible nodes by type|mark.
  const histogram = useMemo(() => {
    const tally = new Map();
    for (const n of nodeList) {
      if (!passesFilter(n)) continue;
      const key = (histMode === "mark" ? n.data.mark : n.data.type) || "—";
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
    return { rows, max };
  }, [nodeList, histMode, passesFilter]);

  const selectedNode = selected != null ? sim.current.nodes.get(selected) : null;
  const selectedProps = useMemo(() => {
    const p = selectedNode && (selectedNode.data.props || selectedNode.data.properties);
    return p && typeof p === "object" ? Object.entries(p) : [];
  }, [selectedNode, graphVersion]);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  // Screen → world, inverting translate → scale → rotate (the draw order).
  const toWorld = useCallback((sx, sy) => {
    const v = view.current;
    const dx = (sx - v.tx) / v.scale, dy = (sy - v.ty) / v.scale;
    const c = Math.cos(-v.rot || 0), s = Math.sin(-v.rot || 0);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }, []);

  const radiusOf = useCallback((id) => {
    const deg = sim.current.degree.get(id) || 0;
    return 5 + Math.min(14, Math.sqrt(deg) * 3.2);
  }, []);

  // GPU-style colour-buffer picking: render every node into an offscreen canvas
  // filled with a unique RGB id (engine/gpuPicking.idToColor), then read the one
  // pixel under the cursor and decode it back to a node (colorToId). O(1) readback,
  // pixel-accurate, and rotation/zoom-agnostic because it works in screen space.
  const pickNode = useCallback((sx, sy) => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!pickRef.current) pickRef.current = document.createElement("canvas");
    const pc = pickRef.current;
    if (pc.width !== w || pc.height !== h) { pc.width = w; pc.height = h; }
    const pctx = pc.getContext("2d", { willReadFrequently: true });
    if (!pctx) return null;
    const v = view.current;
    pctx.clearRect(0, 0, w, h);
    pctx.save();
    pctx.translate(v.tx, v.ty);
    pctx.scale(v.scale, v.scale);
    pctx.rotate(v.rot || 0);
    const nodes = [...sim.current.nodes.values()];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const [r, g, b] = idToColor(i + 1); // +1 so 0 = background
      pctx.fillStyle = `rgb(${r},${g},${b})`;
      pctx.beginPath();
      pctx.arc(n.x, n.y, radiusOf(n.id) + 4, 0, Math.PI * 2);
      pctx.fill();
    }
    pctx.restore();
    let px;
    try { px = pctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data; }
    catch { return null; }
    if (px[3] === 0) return null;
    const idx = colorToId(px[0], px[1], px[2]) - 1;
    return idx >= 0 && idx < nodes.length ? nodes[idx] : null;
  }, [radiusOf]);

  // Smoothly animate the camera to a target view. Rotation is interpolated with
  // quaternion slerp (engine/quaternionCamera); pan/zoom ease linearly.
  const animateCamera = useCallback((target, ms = 420) => {
    if (camAnim.current) cancelAnimationFrame(camAnim.current);
    const from = { ...view.current };
    const qa = zQuat(from.rot || 0), qb = zQuat(target.rot ?? from.rot ?? 0);
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
      view.current = {
        tx: from.tx + ((target.tx ?? from.tx) - from.tx) * e,
        ty: from.ty + ((target.ty ?? from.ty) - from.ty) * e,
        scale: from.scale + ((target.scale ?? from.scale) - from.scale) * e,
        rot: zAngleOf(slerp(qa, qb, e)),
      };
      if (k < 1) camAnim.current = requestAnimationFrame(tick);
      else camAnim.current = null;
    };
    camAnim.current = requestAnimationFrame(tick);
  }, []);

  // Rotate the view by a delta, animated via slerp.
  const rotateView = useCallback((delta) => {
    animateCamera({ rot: (view.current.rot || 0) + delta });
  }, [animateCamera]);

  // Stop any in-flight camera animation when the canvas unmounts.
  useEffect(() => () => { if (camAnim.current) cancelAnimationFrame(camAnim.current); }, []);

  // ── Fit-to-view ───────────────────────────────────────────────────────────
  const fitToView = useCallback(() => {
    const cv = canvasRef.current;
    const nodes = [...sim.current.nodes.values()];
    if (!cv || !nodes.length) { view.current = { tx: 0, ty: 0, scale: 1 }; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
    }
    const pad = 60;
    const w = cv.clientWidth, h = cv.clientHeight;
    const gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
    const scale = Math.max(0.2, Math.min(2.2, Math.min((w - pad * 2) / gw, (h - pad * 2) / gh)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    // FIT squares the view up (rot → 0) and frames the graph, animated.
    animateCamera({ scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale, rot: 0 });
  }, [animateCamera]);

  // Auto-fit after the base load settles.
  useEffect(() => {
    if (!nodeList.length) return;
    const t = setTimeout(fitToView, 600);
    return () => clearTimeout(t);
  }, [counts.nodes === 0 ? 0 : "loaded"]); // run once nodes first appear // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search: centre a matching node ────────────────────────────────────────
  const focusSearch = useCallback(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    let match = null;
    for (const n of sim.current.nodes.values()) {
      const lbl = String(labelOf(n.data)).toLowerCase();
      if (lbl.includes(q) || String(n.id).toLowerCase().includes(q)) { match = n; break; }
    }
    if (!match) return;
    const cv = canvasRef.current;
    const v = view.current;
    const w = cv.clientWidth, h = cv.clientHeight;
    // Centre the match under the current rotation (screen = T + S·R·world).
    const c = Math.cos(v.rot || 0), s = Math.sin(v.rot || 0);
    const rx = match.x * c - match.y * s, ry = match.x * s + match.y * c;
    animateCamera({ tx: w / 2 - rx * v.scale, ty: h / 2 - ry * v.scale });
    setSelected(match.id);
  }, [search, animateCamera]);

  // ── The simulation + render loop (requestAnimationFrame) ──────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf = 0;
    let alive = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrapRef.current?.clientWidth || 800;
      const h = wrapRef.current?.clientHeight || 560;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + "px"; cv.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Physics constants tuned for legibility + stability.
    const K_REP = 5200, K_SPRING = 0.035, REST = 78, GRAVITY = 0.012, DAMP = 0.86, MAX_V = 28;

    const step = () => {
      const s = sim.current;
      const nodes = [...s.nodes.values()];
      const n = nodes.length;
      const cx = (wrapRef.current?.clientWidth || 800) / 2;
      const cy = (wrapRef.current?.clientHeight || 560) / 2;

      // Repulsion (O(n^2) — fine to ~300 nodes). Skip while dragging that node.
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 0.01; }
          const inv = 1 / Math.sqrt(d2);
          const f = K_REP / d2;
          const fx = dx * inv * f, fy = dy * inv * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      // Springs along edges (stronger edges pull tighter).
      for (const e of s.edges) {
        const a = s.nodes.get(e._a), b = s.nodes.get(e._b);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const k = K_SPRING * Math.min(2.5, e._s);
        const f = k * (d - REST);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Light gravity toward centre + integrate.
      const dragId = drag.current?.mode === "node" ? drag.current.id : null;
      for (const node of nodes) {
        if (node.id === dragId) { node.vx = 0; node.vy = 0; continue; }
        if (node.pinned) { node.vx *= 0.5; node.vy *= 0.5; }
        node.vx += (cx - node.x) * GRAVITY;
        node.vy += (cy - node.y) * GRAVITY;
        node.vx *= DAMP; node.vy *= DAMP;
        const sp = Math.hypot(node.vx, node.vy);
        if (sp > MAX_V) { node.vx = (node.vx / sp) * MAX_V; node.vy = (node.vy / sp) * MAX_V; }
        if (!node.pinned) { node.x += node.vx; node.y += node.vy; }
      }
    };

    const draw = () => {
      const s = sim.current;
      const v = view.current;
      const w = cv.clientWidth, h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(v.tx, v.ty);
      ctx.scale(v.scale, v.scale);
      ctx.rotate(v.rot || 0);

      const selId = selectedRef.current;
      const selAdj = selId != null ? s.adj.get(selId) : null;
      const filterType = filterRef.current;
      const histKey = histPickRef.current;
      const histM = histModeRef.current;

      const dim = (node) => {
        if (filterType && (node.data.type || "—") !== filterType) return true;
        if (histKey) {
          const k = (histM === "mark" ? node.data.mark : node.data.type) || "—";
          if (k !== histKey) return true;
        }
        return false;
      };

      // Edges first.
      for (const e of s.edges) {
        const a = s.nodes.get(e._a), b = s.nodes.get(e._b);
        if (!a || !b) continue;
        const incident = selId != null && (e._a === selId || e._b === selId);
        const faded = dim(a) || dim(b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = (incident ? 2.4 : 1) * Math.min(2.2, 0.6 + e._s * 0.5);
        ctx.strokeStyle = incident
          ? "rgba(0,200,120,0.65)"
          : faded ? "rgba(120,150,170,0.05)" : "rgba(130,160,185,0.16)";
        ctx.stroke();
      }

      // Nodes.
      const labelOn = labelsRef.current;
      const hoverId = hover.current;
      for (const node of s.nodes.values()) {
        const r = radiusOf(node.id);
        const faded = dim(node);
        const isSel = node.id === selId;
        const isNbr = selAdj?.has(node.id);
        const col = colorForType(node.data.type);
        ctx.globalAlpha = faded ? 0.18 : 1;

        if (isSel || isNbr) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + (isSel ? 6 : 3), 0, Math.PI * 2);
          ctx.fillStyle = isSel ? "rgba(0,200,120,0.18)" : "rgba(0,200,120,0.1)";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = isSel ? 2.5 : node.pinned ? 2 : 1;
        ctx.strokeStyle = isSel ? "#ffffff" : node.pinned ? C.gold : "rgba(0,0,0,0.55)";
        ctx.stroke();

        // mark ring (PII/financial/etc.) as a thin outer accent.
        if (node.data.mark) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2.5, 0, Math.PI * 2);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = colorForMark(node.data.mark) + "cc";
          ctx.stroke();
        }

        const showLabel = !faded && (isSel || node.id === hoverId || (labelOn && (v.scale > 0.85 || r > 9)));
        if (showLabel) {
          const text = String(labelOf(node.data)).slice(0, 24);
          ctx.font = "10px 'JetBrains Mono', monospace";
          ctx.globalAlpha = faded ? 0.18 : 0.95;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          const tw = ctx.measureText(text).width;
          ctx.fillRect(node.x + r + 2, node.y - 7, tw + 6, 13);
          ctx.fillStyle = C.textB;
          ctx.fillText(text, node.x + r + 5, node.y + 3);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const loop = () => {
      if (!alive) return;
      step();
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [radiusOf, histPick]); // histPick included so draw closure reads latest via refs anyway

  // Refs mirroring UI state so the rAF draw closure always reads fresh values
  // without re-creating the loop each render.
  const selectedRef = useRef(selected);
  const labelsRef = useRef(showLabels);
  const filterRef = useRef(typeFilter);
  const histPickRef = useRef(histPick);
  const histModeRef = useRef(histMode);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { labelsRef.current = showLabels; }, [showLabels]);
  useEffect(() => { filterRef.current = typeFilter; }, [typeFilter]);
  useEffect(() => { histPickRef.current = histPick; }, [histPick]);
  useEffect(() => { histModeRef.current = histMode; }, [histMode]);

  // ── Pointer handlers (pan / node-drag / select / wheel-zoom) ──────────────
  const localXY = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    const { sx, sy } = localXY(e);
    const hit = pickNode(sx, sy);
    if (hit) {
      drag.current = { mode: "node", id: hit.id, moved: false };
      hit.pinned = true;
    } else {
      const v = view.current;
      drag.current = { mode: "pan", sx, sy, tx: v.tx, ty: v.ty, moved: false };
    }
    canvasRef.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const { sx, sy } = localXY(e);
    const d = drag.current;
    if (!d) {
      const hit = pickNode(sx, sy);
      hover.current = hit ? hit.id : null;
      canvasRef.current.style.cursor = hit ? "pointer" : "grab";
      return;
    }
    d.moved = true;
    if (d.mode === "pan") {
      view.current = { ...view.current, tx: d.tx + (sx - d.sx), ty: d.ty + (sy - d.sy) };
      canvasRef.current.style.cursor = "grabbing";
    } else if (d.mode === "node") {
      const node = sim.current.nodes.get(d.id);
      if (node) { const wp = toWorld(sx, sy); node.x = wp.x; node.y = wp.y; node.vx = 0; node.vy = 0; }
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    canvasRef.current.releasePointerCapture?.(e.pointerId);
    if (d && d.mode === "node" && !d.moved) {
      setSelected((cur) => (cur === d.id ? cur : d.id));
    }
  };

  const onDoubleClick = (e) => {
    const { sx, sy } = localXY(e);
    const hit = pickNode(sx, sy);
    if (hit) { setSelected(hit.id); expand(hit.id); }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const { sx, sy } = localXY(e);
    const v = view.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const ns = Math.max(0.15, Math.min(4, v.scale * factor));
    // Zoom anchored at cursor (in rotated-screen space, so rotation is preserved).
    const wx = (sx - v.tx) / v.scale, wy = (sy - v.ty) / v.scale;
    view.current = { ...v, scale: ns, tx: sx - wx * ns, ty: sy - wy * ns };
  };

  const selDegree = selected != null ? (sim.current.degree.get(selected) || 0) : 0;
  const canCollapse = selected != null && (introducedBy.current.get(selected)?.size > 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <PageShell
      title="GRAPH CANVAS"
      subtitle="GOTHAM GRAPH — FORCE LAYOUT · GPU COLOUR-PICK · SLERP CAMERA · EXPAND/COLLAPSE"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge color={live.connected ? C.neon : C.text}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%",
                background: live.connected ? C.neon : C.text,
                boxShadow: live.connected ? `0 0 6px ${C.neon}` : "none" }} />
              {live.connected ? `LIVE · ${live.frames} frames` : "STREAM…"}
            </span>
          </Badge>
          <Btn accent={ACCENT} onClick={loadSubgraph} disabled={subAsync.loading}>{subAsync.loading ? "…" : "↻ RELOAD"}</Btn>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Nodes" value={counts.nodes} accent={ACCENT} />
        <StatTile label="Edges" value={counts.edges} accent={C.blue} />
        <StatTile label="Types" value={types.length} accent={C.purple} />
        <StatTile label="Selected" value={selectedNode ? labelOf(selectedNode.data).slice(0, 14) : "—"} accent={C.gold} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Btn accent={ACCENT} onClick={loadSubgraph} disabled={subAsync.loading}>{subAsync.loading ? "…" : "↻ RELOAD"}</Btn>
        <Btn accent={C.blue} onClick={fitToView}>⤢ FIT</Btn>
        <Btn accent={C.purple} onClick={() => rotateView(-Math.PI / 6)} title="rotate camera (slerp)">⟲</Btn>
        <Btn accent={C.purple} onClick={() => rotateView(Math.PI / 6)} title="rotate camera (slerp)">⟳</Btn>
        <Btn accent={showLabels ? C.gold : C.text} onClick={() => setShowLabels((s) => !s)}>
          {showLabels ? "LABELS ON" : "LABELS OFF"}
        </Btn>
        <span style={{ width: 1, height: 22, background: C.border }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          style={{ ...inputStyle, width: "auto", cursor: "pointer" }}>
          <option value="">ALL TYPES</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ width: 1, height: 22, background: C.border }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") focusSearch(); }}
          placeholder="search node → focus" style={{ ...inputStyle, width: 200 }} />
        <Btn accent={ACCENT} onClick={focusSearch}>⌖ FOCUS</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(280px,1fr)", gap: 14, alignItems: "start" }}>
        {/* CANVAS */}
        <PanelCard title="INVESTIGATION CANVAS" accent={ACCENT}
          right={<span style={{ fontSize: 8, color: C.text }}>drag bg = pan · wheel = zoom · drag node = pin · dbl-click = expand</span>}>
          <DataState loading={subAsync.loading} error={subAsync.error}
            empty={!subAsync.loading && counts.nodes === 0} emptyLabel="No graph — reload the base subgraph">
            <div ref={wrapRef} style={{ position: "relative", height: 560, borderRadius: 6, overflow: "hidden",
              border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.4)" }}>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onDoubleClick={onDoubleClick}
                onWheel={onWheel}
                style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
              />
              {expandAsync.loading && (
                <div style={{ position: "absolute", top: 8, left: 8, fontSize: 9, color: C.neon,
                  background: "rgba(0,0,0,0.6)", border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 8px" }}>
                  expanding…
                </div>
              )}
              {expandAsync.error && (
                <div style={{ position: "absolute", top: 8, left: 8, fontSize: 9, color: C.red,
                  background: "rgba(0,0,0,0.6)", border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 8px" }}>
                  expand failed
                </div>
              )}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 8, color: C.text, alignItems: "center" }}>
              <span>● color = type</span>
              <span>◯ size = degree</span>
              <span style={{ color: C.gold }}>◌ ring = pinned</span>
              <span>━ thickness = strength</span>
              <span style={{ color: C.purple }}>⛭ GPU colour-pick · slerp camera</span>
              {types.slice(0, 8).map((t) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorForType(t) }} /> {t}
                </span>
              ))}
            </div>
          </DataState>
        </PanelCard>

        {/* SIDE PANELS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Node detail */}
          <PanelCard title="NODE DETAIL" accent={C.blue}>
            {!selectedNode ? (
              <div style={{ padding: 8, fontSize: 10, color: C.text, letterSpacing: 1 }}>
                Click a node to inspect it. Double-click (or EXPAND) to pull its neighbours.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{labelOf(selectedNode.data)}</div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                    {(selectedNode.data.type || "—")} · {String(selectedNode.id)} · degree {selDegree}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {selectedNode.data.type && <Badge color={colorForType(selectedNode.data.type)}>{selectedNode.data.type}</Badge>}
                  {selectedNode.data.mark && <Badge color={colorForMark(selectedNode.data.mark)}>{selectedNode.data.mark}</Badge>}
                  {selectedNode.pinned && <Badge color={C.gold}>PINNED</Badge>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn accent={C.neon} onClick={() => expand(selected)} disabled={expandAsync.loading}
                    style={{ fontSize: 8, padding: "5px 9px" }}>＋ EXPAND</Btn>
                  {canCollapse && (
                    <Btn accent={C.red} onClick={() => collapse(selected)}
                      style={{ fontSize: 8, padding: "5px 9px" }}>− COLLAPSE</Btn>
                  )}
                  <Btn accent={C.gold}
                    onClick={() => { const n = sim.current.nodes.get(selected); if (n) { n.pinned = !n.pinned; setGraphVersion((v) => v + 1); } }}
                    style={{ fontSize: 8, padding: "5px 9px" }}>{selectedNode.pinned ? "UNPIN" : "PIN"}</Btn>
                </div>
                {selectedProps.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>PROPERTIES</div>
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {selectedProps.map(([k, v]) => <KV key={k} k={k} v={v} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </PanelCard>

          {/* Selection histogram */}
          <PanelCard title="SELECTION HISTOGRAM" accent={C.purple}
            right={
              <div style={{ display: "flex", gap: 4 }}>
                {["type", "mark"].map((m) => (
                  <button key={m} onClick={() => { setHistMode(m); setHistPick(""); }}
                    style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 8, letterSpacing: 1, fontWeight: 700,
                      padding: "3px 8px", borderRadius: 3, border: `1px solid ${histMode === m ? C.purple + "88" : C.border}`,
                      background: histMode === m ? C.purple + "1a" : "rgba(0,0,0,0.25)",
                      color: histMode === m ? C.purple : C.text, textTransform: "uppercase" }}>{m}</button>
                ))}
              </div>
            }>
            {histogram.rows.length === 0 ? (
              <div style={{ fontSize: 9, color: C.text }}>No visible nodes.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 8, color: C.text }}>
                  {histPick ? <>highlighting <span style={{ color: C.purple }}>{histPick}</span> · click again to clear</> : "click a bar to highlight that cohort"}
                </div>
                {histogram.rows.map(([key, val]) => {
                  const accent = histMode === "mark" ? colorForMark(key) : colorForType(key);
                  const on = histPick === key;
                  return (
                    <button key={key} onClick={() => setHistPick(on ? "" : key)}
                      style={{ cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0, border: "none",
                        background: "transparent", opacity: histPick && !on ? 0.5 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9,
                        color: on ? accent : C.textB, marginBottom: 2 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} />{key}
                        </span>
                        <span style={{ color: C.text }}>{val}</span>
                      </div>
                      <div style={{ height: 9, borderRadius: 3, background: "rgba(0,0,0,0.35)",
                        border: `1px solid ${C.border}`, overflow: "hidden" }}>
                        <div style={{ width: `${(val / histogram.max) * 100}%`, height: "100%",
                          background: accent, boxShadow: on ? `0 0 8px ${accent}` : "none" }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
