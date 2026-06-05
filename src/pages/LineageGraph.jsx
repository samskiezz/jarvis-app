/**
 * LineageGraph — a Foundry-style DATA LINEAGE GRAPH.
 *
 * An interactive left→right directed-acyclic flow showing how datasets move
 * through pipeline transforms into other datasets. The analyst drives it like
 * Foundry's lineage view:
 *   • PAN     — drag the background.
 *   • ZOOM    — mouse wheel (anchored on the cursor) + a FIT button.
 *   • SELECT  — click a node → the signature "trace lineage" highlight: its
 *               full upstream + downstream subtree lights up, everything else
 *               dims. A dataset selection also opens the DETAIL DRAWER.
 *   • TOOLBAR — global vs. dataset-focused lineage, upstream/downstream depth
 *               clamp, and a refresh.
 *
 * Two REAL backend lineage planes, each with a different shape, are unified
 * into one internal {nodes,edges} model laid out by dependency depth:
 *
 *   GLOBAL  GET /v1/datasets/lineage
 *     -> { nodes:[{id, type:"dataset"|"transform"|"source", label}],
 *          edges:[{src, dst, kind, ts}] }           // edge flows src -> dst
 *
 *   FOCUS   GET /v1/datasets/{name}/lineage
 *     -> { dataset, nodes:[name, ...],              // bare-string node ids
 *          edges:[{output, input, op, params, created_ts}] } // input -> output
 *
 * The DETAIL DRAWER pulls the depth-layer dataset record + health + lets you
 * append a schema version (all from server/routes/datasets.py):
 *   GET  /v1/datasets/{id}          -> { id,name,owner,kind,schema,series_id,
 *                                        freshness_ts,row_count,created_ts,
 *                                        versions:[{version,schema,ts,note}],
 *                                        current_version }
 *   GET  /v1/datasets/{id}/health   -> { status, backed_by_series,
 *                                        checks:[{name,status,value,threshold}], ... }
 *   POST /v1/datasets/{id}/version  {schema,note} -> { ok, id, version }
 *
 * Every call degrades gracefully via useAsync; the canvas keeps whatever it
 * already holds.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

// ── node-type visuals ─────────────────────────────────────────────────────────
const TYPE_COLOR = {
  dataset: C.blue,
  transform: C.purple,
  source: C.gold,
};
const colorForType = (t) => TYPE_COLOR[t] || C.text;
const statusColor = (s) =>
  ({ ok: C.neon, warn: C.gold, fail: C.red, unknown: C.text }[s] || C.text);

// Box geometry per node type (datasets = wide rectangles, transforms = pills,
// sources = small rects). Half-extents in world units.
const BOX = {
  dataset: { w: 168, h: 50 },
  transform: { w: 132, h: 38 },
  source: { w: 120, h: 36 },
};
const boxOf = (t) => BOX[t] || BOX.source;

const LAYER_GAP = 240; // x distance between dependency layers
const ROW_GAP = 78;    // y distance between siblings in a layer

const fmtTs = (ts) => {
  if (ts == null) return "—";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "—";
  try { return new Date(n).toISOString().replace("T", " ").slice(0, 19); }
  catch { return String(ts); }
};
const fmtAge = (ms) => {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  const s = Number(ms) / 1000;
  if (s < 90) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 90) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
};

// ── shape normalisers: fold the two backend lineage shapes into one model ──────
// GLOBAL shape (datasets.py): {nodes:[{id,type,label}], edges:[{src,dst,kind}]}
function normalizeGlobal(body) {
  const rawNodes = asList(body, "nodes");
  const rawEdges = asList(body, "edges");
  const nodes = rawNodes.map((n) => ({
    id: String(n.id),
    type: n.type || "dataset",
    label: n.label || String(n.id),
    kind: n.type,
  }));
  const seen = new Set(nodes.map((n) => n.id));
  const edges = [];
  for (const e of rawEdges) {
    const src = e.src ?? e.source ?? e.from;
    const dst = e.dst ?? e.target ?? e.to;
    if (src == null || dst == null) continue;
    // include endpoints that slipped past the node list (defensive)
    for (const end of [src, dst]) {
      if (!seen.has(String(end))) {
        seen.add(String(end));
        const inferred = String(end).startsWith("transform:") ? "transform" : "dataset";
        nodes.push({ id: String(end), type: inferred, label: String(end), kind: inferred });
      }
    }
    edges.push({ src: String(src), dst: String(dst), kind: e.kind || "dataset->dataset", op: e.kind });
  }
  return { nodes, edges };
}

// FOCUS shape (pipelines.py): {dataset, nodes:[name...], edges:[{output,input,op}]}
// nodes are bare dataset names; edges flow input -> output.
function normalizeFocus(body) {
  const names = asList(body, "nodes").map(String);
  const rawEdges = asList(body, "edges");
  const seen = new Set();
  const nodes = [];
  const add = (id, type) => {
    const sid = String(id);
    if (seen.has(sid)) return;
    seen.add(sid);
    nodes.push({ id: sid, type, label: sid, kind: type });
  };
  names.forEach((n) => add(n, "dataset"));
  const edges = [];
  for (const e of rawEdges) {
    const input = e.input ?? e.src ?? e.from;
    const output = e.output ?? e.dst ?? e.to;
    if (input == null || output == null) continue;
    add(input, "dataset");
    add(output, "dataset");
    // lineage flows input -> output (output derived FROM input)
    edges.push({ src: String(input), dst: String(output), kind: "dataset->dataset", op: e.op });
  }
  return { nodes, edges };
}

// ── layered (longest-path) layout: producers left, consumers right ────────────
// Computes a layer index per node = longest dependency chain from any root, then
// assigns x by layer and y by within-layer order. Cycle-safe (visited guard).
function layoutGraph(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(); // node -> [src...]
  const outgoing = new Map(); // node -> [dst...]
  for (const n of nodes) { incoming.set(n.id, []); outgoing.set(n.id, []); }
  for (const e of edges) {
    if (!byId.has(e.src) || !byId.has(e.dst)) continue;
    outgoing.get(e.src).push(e.dst);
    incoming.get(e.dst).push(e.src);
  }

  // Longest-path layering via memoised DFS on incoming edges (depth from roots).
  const depth = new Map();
  const computing = new Set();
  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (computing.has(id)) return 0; // cycle guard
    computing.add(id);
    let d = 0;
    for (const src of incoming.get(id) || []) d = Math.max(d, depthOf(src) + 1);
    computing.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);

  // Group by layer, order stably within a layer (by label) for determinism.
  const layers = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id) || 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(n);
  }
  const maxLayer = Math.max(0, ...[...layers.keys()]);
  const positions = new Map();
  for (const [d, group] of layers) {
    group.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const total = group.length;
    group.forEach((n, i) => {
      const x = d * LAYER_GAP;
      const y = (i - (total - 1) / 2) * ROW_GAP;
      positions.set(n.id, { x, y });
    });
  }
  return { positions, depth, incoming, outgoing, maxLayer };
}

// BFS the directed subtree (upstream via incoming, downstream via outgoing) from
// a seed node up to a depth clamp; returns the set of node ids reachable.
function reachable(seed, adj, maxDepth) {
  const out = new Set([seed]);
  let frontier = [seed];
  let d = 0;
  while (frontier.length && d < maxDepth) {
    const next = [];
    for (const cur of frontier) {
      for (const nb of adj.get(cur) || []) {
        if (!out.has(nb)) { out.add(nb); next.push(nb); }
      }
    }
    frontier = next;
    d += 1;
  }
  return out;
}

export default function LineageGraph() {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);

  // ── toolbar / mode state ────────────────────────────────────────────────────
  const [mode, setMode] = useState("global");     // "global" | "focus"
  const [focusName, setFocusName] = useState("");   // dataset for focus mode
  const [upDepth, setUpDepth] = useState(99);       // upstream trace clamp
  const [downDepth, setDownDepth] = useState(99);   // downstream trace clamp

  // ── graph model (React state — the DAG is small, so no rAF needed) ──────────
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selected, setSelected] = useState(null);

  // ── view transform (pan/zoom) held in a ref + mirrored to state for render ──
  const view = useRef({ tx: 60, ty: 0, scale: 1 });
  const [, setViewTick] = useState(0);
  const bumpView = useCallback(() => setViewTick((v) => v + 1), []);
  const drag = useRef(null);

  // ── async runners ───────────────────────────────────────────────────────────
  const catalogAsync = useAsync();   // GET /v1/datasets (picker + id lookup)
  const lineageAsync = useAsync();   // GET lineage (global | focus)
  const detailAsync = useAsync();    // GET /v1/datasets/{id}
  const healthAsync = useAsync();    // GET /v1/datasets/{id}/health
  const versionAsync = useAsync();   // POST /v1/datasets/{id}/version

  const [catalog, setCatalog] = useState([]);
  const [detail, setDetail] = useState(null);
  const [health, setHealth] = useState(null);
  const [versionDraft, setVersionDraft] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [versionMsg, setVersionMsg] = useState(null);

  // catalog name -> id resolution so a string-named focus node can open detail.
  const idByName = useMemo(() => {
    const m = new Map();
    for (const d of catalog) { if (d.name) m.set(d.name, d.id); }
    return m;
  }, [catalog]);

  // ── load the dataset catalog (picker source + id resolution) ────────────────
  const loadCatalog = useCallback(async () => {
    const body = await catalogAsync.run(() => apiGet("/v1/datasets"));
    setCatalog(asList(body, "items"));
  }, [catalogAsync]);

  // ── load lineage (global or focus) ──────────────────────────────────────────
  const loadLineage = useCallback(async () => {
    setSelected(null);
    if (mode === "focus" && focusName) {
      const body = await lineageAsync.run(() =>
        apiGet(`/v1/datasets/${encodeURIComponent(focusName)}/lineage`)
      );
      setGraph(body ? normalizeFocus(body) : { nodes: [], edges: [] });
    } else {
      const body = await lineageAsync.run(() => apiGet("/v1/datasets/lineage"));
      setGraph(body ? normalizeGlobal(body) : { nodes: [], edges: [] });
    }
  }, [mode, focusName, lineageAsync]);

  useEffect(() => { loadCatalog(); }, []); // initial catalog
  useEffect(() => { loadLineage(); }, [mode, focusName]); // (re)load on mode/focus // eslint-disable-line react-hooks/exhaustive-deps

  // ── layout (recomputed whenever the graph changes) ──────────────────────────
  const layout = useMemo(
    () => layoutGraph(graph.nodes, graph.edges),
    [graph]
  );

  // adjacency maps for the trace-lineage highlight.
  const { upAdj, downAdj } = useMemo(() => {
    const up = new Map();   // node -> upstream (incoming src) neighbours
    const down = new Map(); // node -> downstream (outgoing dst) neighbours
    for (const n of graph.nodes) { up.set(n.id, []); down.set(n.id, []); }
    for (const e of graph.edges) {
      if (down.has(e.src)) down.get(e.src).push(e.dst);
      if (up.has(e.dst)) up.get(e.dst).push(e.src);
    }
    return { upAdj: up, downAdj: down };
  }, [graph]);

  // The highlighted subtree for the current selection (upstream ∪ downstream).
  const traced = useMemo(() => {
    if (!selected) return null;
    const ups = reachable(selected, upAdj, upDepth);
    const downs = reachable(selected, downAdj, downDepth);
    const nodes = new Set([...ups, ...downs]);
    return { nodes, ups, downs };
  }, [selected, upAdj, downAdj, upDepth, downDepth]);

  // ── fit-to-view ─────────────────────────────────────────────────────────────
  const fitToView = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !graph.nodes.length) { view.current = { tx: 60, ty: 0, scale: 1 }; bumpView(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of graph.nodes) {
      const p = layout.positions.get(n.id);
      if (!p) continue;
      const b = boxOf(n.type);
      minX = Math.min(minX, p.x - b.w / 2); maxX = Math.max(maxX, p.x + b.w / 2);
      minY = Math.min(minY, p.y - b.h / 2); maxY = Math.max(maxY, p.y + b.h / 2);
    }
    if (!Number.isFinite(minX)) { view.current = { tx: 60, ty: 0, scale: 1 }; bumpView(); return; }
    const pad = 50;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
    const scale = Math.max(0.25, Math.min(1.6, Math.min((w - pad * 2) / gw, (h - pad * 2) / gh)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    view.current = { scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale };
    bumpView();
  }, [graph, layout, bumpView]);

  // Auto-fit once a fresh graph lands.
  useEffect(() => {
    if (!graph.nodes.length) return;
    const t = setTimeout(fitToView, 80);
    return () => clearTimeout(t);
  }, [graph, fitToView]);

  // ── selection → detail drawer (only datasets carry a detail record) ─────────
  const openDetail = useCallback(async (node) => {
    setSelected(node.id);
    setVersionMsg(null);
    if (node.type !== "dataset") { setDetail(null); setHealth(null); return; }
    // Resolve a usable id: global nodes already carry the dataset id; focus nodes
    // are bare names, which the /{id} endpoint also accepts (it matches id OR name),
    // but prefer the catalog id when known.
    const lookup = idByName.get(node.id) || node.id;
    const [d, hRes] = await Promise.all([
      detailAsync.run(() => apiGet(`/v1/datasets/${encodeURIComponent(lookup)}`)),
      healthAsync.run(() => apiGet(`/v1/datasets/${encodeURIComponent(lookup)}/health`)),
    ]);
    setDetail(d || null);
    setHealth(hRes || null);
    // pre-fill the version editor with the current schema for a sensible bump.
    if (d && d.schema) {
      try { setVersionDraft(JSON.stringify(d.schema, null, 2)); }
      catch { setVersionDraft("{}"); }
    } else setVersionDraft("{}");
    setVersionNote("");
  }, [detailAsync, healthAsync, idByName]);

  // ── append a new schema version ─────────────────────────────────────────────
  const submitVersion = useCallback(async () => {
    if (!detail) return;
    setVersionMsg(null);
    let schemaObj;
    try { schemaObj = JSON.parse(versionDraft || "{}"); }
    catch (e) { setVersionMsg({ ok: false, text: `invalid JSON: ${e.message}` }); return; }
    const res = await versionAsync.run(() =>
      apiPost(`/v1/datasets/${encodeURIComponent(detail.id)}/version`, {
        schema: schemaObj,
        note: versionNote || null,
      })
    );
    if (res && res.ok) {
      setVersionMsg({ ok: true, text: `version ${res.version} created` });
      // refresh the detail record so the new version shows in history.
      const d = await detailAsync.run(() => apiGet(`/v1/datasets/${encodeURIComponent(detail.id)}`));
      if (d) setDetail(d);
    } else if (res === null) {
      setVersionMsg({ ok: false, text: versionAsync.error ? String(versionAsync.error.message || versionAsync.error) : "version failed" });
    } else {
      setVersionMsg({ ok: false, text: res?.error || "version failed" });
    }
  }, [detail, versionDraft, versionNote, versionAsync, detailAsync]);

  // ── coordinate + pointer helpers ────────────────────────────────────────────
  const toWorld = useCallback((sx, sy) => {
    const v = view.current;
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  }, []);

  const localXY = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  };

  const pickNode = useCallback((sx, sy) => {
    const { x, y } = toWorld(sx, sy);
    for (const n of graph.nodes) {
      const p = layout.positions.get(n.id);
      if (!p) continue;
      const b = boxOf(n.type);
      if (Math.abs(x - p.x) <= b.w / 2 && Math.abs(y - p.y) <= b.h / 2) return n;
    }
    return null;
  }, [graph, layout, toWorld]);

  const onPointerDown = (e) => {
    const { sx, sy } = localXY(e);
    const hit = pickNode(sx, sy);
    if (hit) {
      drag.current = { mode: "click", id: hit.id, node: hit, sx, sy, moved: false };
    } else {
      const v = view.current;
      drag.current = { mode: "pan", sx, sy, tx: v.tx, ty: v.ty, moved: false };
    }
    svgRef.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) {
      const { sx, sy } = localXY(e);
      svgRef.current.style.cursor = pickNode(sx, sy) ? "pointer" : "grab";
      return;
    }
    const { sx, sy } = localXY(e);
    if (Math.abs(sx - d.sx) > 3 || Math.abs(sy - d.sy) > 3) d.moved = true;
    if (d.mode === "pan") {
      view.current = { ...view.current, tx: d.tx + (sx - d.sx), ty: d.ty + (sy - d.sy) };
      svgRef.current.style.cursor = "grabbing";
      bumpView();
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    if (d && d.mode === "click" && !d.moved) openDetail(d.node);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const { sx, sy } = localXY(e);
    const v = view.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const ns = Math.max(0.2, Math.min(2.6, v.scale * factor));
    const wx = (sx - v.tx) / v.scale, wy = (sy - v.ty) / v.scale;
    view.current = { scale: ns, tx: sx - wx * ns, ty: sy - wy * ns };
    bumpView();
  };

  // ── derived stats ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const counts = { dataset: 0, transform: 0, source: 0 };
    for (const n of graph.nodes) counts[n.type] = (counts[n.type] || 0) + 1;
    return counts;
  }, [graph]);

  const selectedNode = selected ? graph.nodes.find((n) => n.id === selected) : null;
  const upstreamCount = selected ? (traced?.ups.size ?? 1) - 1 : 0;
  const downstreamCount = selected ? (traced?.downs.size ?? 1) - 1 : 0;

  // ── edge path builder (smooth left→right cubic Bézier) ──────────────────────
  const edgePath = (a, b, ta, tb) => {
    const ba = boxOf(ta), bb = boxOf(tb);
    const x1 = a.x + ba.w / 2, y1 = a.y;       // exit right edge of src
    const x2 = b.x - bb.w / 2, y2 = b.y;       // enter left edge of dst
    const dx = Math.max(40, (x2 - x1) * 0.5);
    return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };

  const v = view.current;
  const transform = `translate(${v.tx},${v.ty}) scale(${v.scale})`;

  const datasetNames = useMemo(
    () => catalog.map((d) => d.name).filter(Boolean).sort(),
    [catalog]
  );

  const isEmpty = !lineageAsync.loading && !lineageAsync.error && graph.nodes.length === 0;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <PageShell
      title="DATA LINEAGE GRAPH"
      subtitle="FOUNDRY LINEAGE — DEPENDENCY-LAYERED DAG · TRACE UPSTREAM/DOWNSTREAM · SCHEMA · HEALTH · VERSIONS"
      accent={ACCENT}
      actions={
        <Btn accent={ACCENT} onClick={() => { loadCatalog(); loadLineage(); }} disabled={lineageAsync.loading}>
          {lineageAsync.loading ? "…" : "↻ REFRESH"}
        </Btn>
      }
    >
      <Grid min={150} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Datasets" value={stats.dataset || 0} accent={C.blue} />
        <StatTile label="Transforms" value={stats.transform || 0} accent={C.purple} />
        <StatTile label="Sources" value={stats.source || 0} accent={C.gold} />
        <StatTile label="Edges" value={graph.edges.length} accent={ACCENT} />
        <StatTile
          label="Selected"
          value={selectedNode ? String(selectedNode.label).slice(0, 14) : "—"}
          accent={C.gold}
          sub={selectedNode ? `↑${upstreamCount} · ↓${downstreamCount}` : "click a node"}
        />
      </Grid>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "global", label: "GLOBAL LINEAGE" },
            { id: "focus", label: "FOCUS DATASET" },
          ].map((m) => {
            const on = mode === m.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)}
                style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                  padding: "7px 13px", borderRadius: 5,
                  border: `1px solid ${on ? ACCENT + "88" : C.border}`,
                  background: on ? ACCENT + "1a" : "rgba(0,0,0,0.25)",
                  color: on ? ACCENT : C.text }}>{m.label}</button>
            );
          })}
        </div>

        {mode === "focus" && (
          <select value={focusName} onChange={(e) => setFocusName(e.target.value)}
            style={{ ...inputStyle, width: "auto", maxWidth: 320, cursor: "pointer" }}>
            <option value="">— pick a dataset —</option>
            {datasetNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <span style={{ width: 1, height: 22, background: C.border }} />

        {/* depth clamps for the trace-lineage highlight */}
        <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>TRACE DEPTH</span>
        <label style={{ fontSize: 8, color: C.text, display: "inline-flex", alignItems: "center", gap: 5 }}>
          ↑UP
          <select value={upDepth} onChange={(e) => setUpDepth(Number(e.target.value))}
            style={{ ...inputStyle, width: "auto", cursor: "pointer", padding: "5px 7px" }}>
            {[1, 2, 3, 5, 99].map((d) => <option key={d} value={d}>{d === 99 ? "ALL" : d}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 8, color: C.text, display: "inline-flex", alignItems: "center", gap: 5 }}>
          ↓DOWN
          <select value={downDepth} onChange={(e) => setDownDepth(Number(e.target.value))}
            style={{ ...inputStyle, width: "auto", cursor: "pointer", padding: "5px 7px" }}>
            {[1, 2, 3, 5, 99].map((d) => <option key={d} value={d}>{d === 99 ? "ALL" : d}</option>)}
          </select>
        </label>

        <span style={{ width: 1, height: 22, background: C.border }} />
        <Btn accent={C.blue} onClick={fitToView}>⤢ FIT</Btn>
        {selected && <Btn accent={C.gold} onClick={() => { setSelected(null); setDetail(null); setHealth(null); }}>✕ CLEAR TRACE</Btn>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(300px,1fr)", gap: 14, alignItems: "start" }}>
        {/* LINEAGE CANVAS */}
        <PanelCard title="LINEAGE CANVAS" accent={ACCENT}
          right={<span style={{ fontSize: 8, color: C.text }}>drag = pan · wheel = zoom · click node = trace</span>}>
          <DataState loading={lineageAsync.loading} error={lineageAsync.error}
            empty={isEmpty}
            emptyLabel={mode === "focus" && !focusName ? "Pick a dataset to focus its lineage" : "No lineage edges yet — seed the catalog / record a transform"}>
            <div ref={wrapRef} style={{ position: "relative", height: 580, borderRadius: 6, overflow: "hidden",
              border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.4)" }}>
              <svg
                ref={svgRef}
                width="100%" height="100%"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
                style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "grab" }}
              >
                <defs>
                  <marker id="lg-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="3.2"
                    orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L7,3.2 L0,6.4 Z" fill={C.text} />
                  </marker>
                  <marker id="lg-arrow-hot" markerWidth="9" markerHeight="9" refX="7.5" refY="3.2"
                    orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L7,3.2 L0,6.4 Z" fill={ACCENT} />
                  </marker>
                </defs>

                <g transform={transform}>
                  {/* EDGES */}
                  {graph.edges.map((e, i) => {
                    const a = layout.positions.get(e.src), b = layout.positions.get(e.dst);
                    const na = graph.nodes.find((n) => n.id === e.src);
                    const nb = graph.nodes.find((n) => n.id === e.dst);
                    if (!a || !b || !na || !nb) return null;
                    const onTrace = traced && traced.nodes.has(e.src) && traced.nodes.has(e.dst);
                    const dimmed = traced && !onTrace;
                    return (
                      <path key={`e${i}`} d={edgePath(a, b, na.type, nb.type)}
                        fill="none"
                        stroke={onTrace ? ACCENT : C.text}
                        strokeOpacity={dimmed ? 0.06 : onTrace ? 0.85 : 0.3}
                        strokeWidth={onTrace ? 2.2 : 1.2}
                        markerEnd={dimmed ? undefined : (onTrace ? "url(#lg-arrow-hot)" : "url(#lg-arrow)")} />
                    );
                  })}

                  {/* NODES */}
                  {graph.nodes.map((n) => {
                    const p = layout.positions.get(n.id);
                    if (!p) return null;
                    const b = boxOf(n.type);
                    const col = colorForType(n.type);
                    const isSel = n.id === selected;
                    const inTrace = traced ? traced.nodes.has(n.id) : true;
                    const dimmed = traced && !inTrace;
                    const isUp = traced && traced.ups.has(n.id) && n.id !== selected;
                    const isDown = traced && traced.downs.has(n.id) && n.id !== selected;
                    const opacity = dimmed ? 0.18 : 1;
                    const isTransform = n.type === "transform";
                    const label = String(n.label).replace(/^transform:/, "Τ ").replace(/^source:/, "");
                    const stroke = isSel ? "#fff" : col;

                    return (
                      <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ opacity }}>
                        {isTransform ? (
                          // diamond/pill transform node
                          <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h}
                            rx={b.h / 2} ry={b.h / 2}
                            fill={col + "1f"} stroke={stroke} strokeWidth={isSel ? 2.4 : 1.4}
                            style={{ filter: isSel ? `drop-shadow(0 0 8px ${col})` : "none" }} />
                        ) : (
                          <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h}
                            rx={6} ry={6}
                            fill={col + "1a"} stroke={stroke} strokeWidth={isSel ? 2.4 : 1.4}
                            style={{ filter: isSel ? `drop-shadow(0 0 8px ${col})` : "none" }} />
                        )}
                        {/* left accent bar for datasets */}
                        {!isTransform && (
                          <rect x={-b.w / 2} y={-b.h / 2} width={4} height={b.h} rx={2} fill={col} />
                        )}
                        {/* trace direction tag */}
                        {(isUp || isDown) && (
                          <circle cx={b.w / 2 - 8} cy={-b.h / 2 + 8} r={4}
                            fill={isUp ? C.gold : C.blue} />
                        )}
                        <text x={isTransform ? 0 : -b.w / 2 + 12} y={-2}
                          textAnchor={isTransform ? "middle" : "start"}
                          fontSize={11} fontWeight={700} fill={C.textB}
                          fontFamily="'JetBrains Mono', monospace">
                          {label.length > (isTransform ? 16 : 20)
                            ? label.slice(0, isTransform ? 16 : 20) + "…"
                            : label}
                        </text>
                        {!isTransform && (
                          <text x={-b.w / 2 + 12} y={13} fontSize={8} fill={col}
                            fontFamily="'JetBrains Mono', monospace" letterSpacing={0.8}>
                            {n.type.toUpperCase()}
                          </text>
                        )}
                        {isTransform && (
                          <text x={0} y={b.h / 2 + 11} textAnchor="middle" fontSize={7} fill={C.text}
                            fontFamily="'JetBrains Mono', monospace" letterSpacing={1}>
                            {(n.op || "TRANSFORM").toString().toUpperCase().slice(0, 18)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* zoom readout */}
              <div style={{ position: "absolute", bottom: 8, right: 10, fontSize: 8, color: C.text,
                background: "rgba(0,0,0,0.55)", border: `1px solid ${C.border}`, borderRadius: 4, padding: "3px 8px" }}>
                {Math.round(v.scale * 100)}% · {graph.nodes.length} nodes
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 9, fontSize: 8, color: C.text, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 9, borderRadius: 2, background: C.blue + "1a", border: `1px solid ${C.blue}` }} /> dataset
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 9, borderRadius: 5, background: C.purple + "1f", border: `1px solid ${C.purple}` }} /> transform
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 14, height: 9, borderRadius: 2, background: C.gold + "1a", border: `1px solid ${C.gold}` }} /> source
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold }} /> upstream
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue }} /> downstream
              </span>
              <span>→ flows producer to consumer</span>
            </div>
          </DataState>
        </PanelCard>

        {/* DETAIL DRAWER */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="DATASET DETAIL" accent={C.blue}>
            {!selectedNode ? (
              <div style={{ padding: 8, fontSize: 10, color: C.text, letterSpacing: 0.5, lineHeight: 1.7 }}>
                Click a node to trace its full upstream + downstream lineage. Select a
                <span style={{ color: C.blue }}> dataset</span> to load its schema, health and version history.
              </div>
            ) : selectedNode.type !== "dataset" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colorForType(selectedNode.type) }}>
                  {String(selectedNode.label).replace(/^transform:/, "")}
                </div>
                <Badge color={colorForType(selectedNode.type)}>{selectedNode.type.toUpperCase()}</Badge>
                <div style={{ fontSize: 9, color: C.text, lineHeight: 1.6 }}>
                  {selectedNode.type === "transform"
                    ? "A pipeline transform node. Its inputs feed the dataset(s) to its right; trace highlights the flow."
                    : "An upstream source node (origin connector). It produces the datasets to its right."}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 9, color: C.textB }}>
                  <span>↑ upstream <b style={{ color: C.gold }}>{upstreamCount}</b></span>
                  <span>↓ downstream <b style={{ color: C.blue }}>{downstreamCount}</b></span>
                </div>
              </div>
            ) : (
              <DataState loading={detailAsync.loading} error={detailAsync.error}
                empty={!detailAsync.loading && !detail} emptyLabel="No detail record for this dataset">
                {detail && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, wordBreak: "break-word" }}>{detail.name}</div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                        {String(detail.id).slice(0, 12)} · v{detail.current_version ?? "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {detail.kind && <Badge color={C.blue}>{detail.kind}</Badge>}
                      {detail.owner && <Badge color={C.purple}>{detail.owner}</Badge>}
                      {detail.series_id && <Badge color={ACCENT}>series-bound</Badge>}
                    </div>
                    <Grid min={120} gap={8}>
                      <StatTile label="Rows" value={detail.row_count ?? 0} accent={ACCENT} />
                      <StatTile label="Upstream" value={upstreamCount} accent={C.gold} />
                      <StatTile label="Downstream" value={downstreamCount} accent={C.blue} />
                      <StatTile label="Freshness" value={fmtAge(detail.freshness_ts ? Date.now() - Number(detail.freshness_ts) : null)} accent={C.purple}
                        sub={fmtTs(detail.freshness_ts)} />
                    </Grid>

                    {/* SCHEMA / COLUMNS */}
                    <div>
                      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>SCHEMA</div>
                      <SchemaView schema={detail.schema} />
                    </div>
                  </div>
                )}
              </DataState>
            )}
          </PanelCard>

          {/* HEALTH */}
          {selectedNode?.type === "dataset" && (
            <PanelCard title="DATA HEALTH" accent={ACCENT}
              right={health?.status && <Badge color={statusColor(health.status)}>{String(health.status).toUpperCase()}</Badge>}>
              <DataState loading={healthAsync.loading} error={healthAsync.error}
                empty={!healthAsync.loading && !health} emptyLabel="No health data">
                {health && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 8, color: C.text }}>
                      {health.backed_by_series
                        ? "Backed by a History-Lake series — full checks."
                        : "No backing series — freshness / row-count only."}
                    </div>
                    {asList(health, "checks").map((ck, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 9px", borderRadius: 5, border: `1px solid ${C.border}`,
                        background: "rgba(0,0,0,0.25)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(ck.status),
                            boxShadow: `0 0 6px ${statusColor(ck.status)}` }} />
                          <span style={{ fontSize: 10, color: C.textB }}>{ck.name}</span>
                        </span>
                        <span style={{ fontSize: 9, color: C.text }}>
                          <b style={{ color: statusColor(ck.status) }}>{String(ck.value ?? "—")}</b>
                          <span style={{ opacity: 0.6 }}> / {ck.threshold}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </DataState>
            </PanelCard>
          )}

          {/* VERSION HISTORY + NEW VERSION */}
          {selectedNode?.type === "dataset" && detail && (
            <PanelCard title="SCHEMA VERSIONS" accent={C.purple}
              right={<span style={{ fontSize: 8, color: C.text }}>{asList(detail, "versions").length} versions</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                  {asList(detail, "versions").map((ver) => (
                    <div key={ver.version} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "5px 9px", borderRadius: 5, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Badge color={ver.version === detail.current_version ? ACCENT : C.text}>v{ver.version}</Badge>
                        <span style={{ fontSize: 8, color: C.text }}>{ver.note || "—"}</span>
                      </span>
                      <span style={{ fontSize: 8, color: C.text }}>{fmtTs(ver.ts)}</span>
                    </div>
                  ))}
                  {asList(detail, "versions").length === 0 && (
                    <div style={{ fontSize: 9, color: C.text }}>No version history.</div>
                  )}
                </div>

                {/* NEW VERSION editor */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>NEW VERSION — SCHEMA JSON</div>
                  <textarea value={versionDraft} onChange={(e) => setVersionDraft(e.target.value)}
                    spellCheck={false} rows={5}
                    style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, resize: "vertical", lineHeight: 1.5 }} />
                  <input value={versionNote} onChange={(e) => setVersionNote(e.target.value)}
                    placeholder="changelog note (optional)" style={{ ...inputStyle, marginTop: 6 }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <Btn accent={C.purple} onClick={submitVersion} disabled={versionAsync.loading}>
                      {versionAsync.loading ? "…" : "＋ APPEND VERSION"}
                    </Btn>
                    {versionMsg && (
                      <span style={{ fontSize: 8, color: versionMsg.ok ? ACCENT : C.red }}>
                        {versionMsg.ok ? "✓ " : "⚠ "}{versionMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </PanelCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// Render a dataset schema as column rows when it looks tabular, else raw JSON.
function SchemaView({ schema }) {
  const cols = useMemo(() => {
    if (!schema || typeof schema !== "object") return null;
    // Common shapes: {columns:[{name,type}...]} or {columns:{name:type}} or a flat
    // descriptive dict (source/entity/metric/unit/freq from the History-Lake seed).
    const c = schema.columns ?? schema.fields ?? schema.schema;
    if (Array.isArray(c)) {
      return c.map((f, i) => (typeof f === "string"
        ? { name: f, type: "" }
        : { name: f.name ?? f.column ?? f.id ?? `col${i}`, type: f.type ?? f.dtype ?? "" }));
    }
    if (c && typeof c === "object") {
      return Object.entries(c).map(([name, type]) => ({ name, type: String(type) }));
    }
    return null;
  }, [schema]);

  if (!schema || (typeof schema === "object" && Object.keys(schema).length === 0)) {
    return <div style={{ fontSize: 9, color: C.text }}>No schema registered.</div>;
  }
  if (cols && cols.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {cols.map((col, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px",
            borderRadius: 4, background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, color: C.textB }}>{col.name}</span>
            {col.type && <span style={{ fontSize: 8, color: C.blue }}>{col.type}</span>}
          </div>
        ))}
      </div>
    );
  }
  // Descriptive (non-tabular) schema — show the raw JSON so nothing is invented.
  return <JsonView data={schema} max={180} />;
}
