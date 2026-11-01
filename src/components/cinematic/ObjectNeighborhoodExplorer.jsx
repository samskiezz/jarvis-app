/**
 * ObjectNeighborhoodExplorer — F268.
 *
 * CANVAS-GRAPH: pick a seed object from /v1/ontology/objects, then explore
 * its neighborhood via /v1/ontology/objects/{id}/neighbors.
 *
 * Features:
 *   - Dropdown to pick seed object (lazy-fetched from /v1/ontology/objects)
 *   - Depth selector: 1 or 2 hops (2-hop = merge neighbors-of-neighbors)
 *   - SVG force-directed graph (pure JS Verlet simulation — no D3 needed)
 *   - Node radius ∝ neighbor count; node color = object type
 *   - Edge labels show relation type
 *   - Click any node → re-center graph on that node + fetch its neighbors
 *   - Pan (drag canvas) + zoom (scroll wheel) via SVG transform
 *   - Hover tooltip: label, type, neighbor count
 *   - ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ NBXPL  left:197880  bottom:8  zIndex:364
 * Event:  jarvis:nbxpl-toggle
 * Voice:  "object neighborhood / neighborhood explorer / nbxpl /
 *          neighbor graph / explore neighbors / object graph / object connections"
 *
 * Exported for JarvisBrain: isNbxplQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const GRAY = "#4E6070";
const SURF = "rgba(12,22,30,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 197880;
const PANEL_W  = 520;
const PANEL_H  = 600;
const SVG_W    = PANEL_W - 2;
const SVG_H    = 400;

const TYPE_PALETTE = [
  CY, PU, AM, GN, "#FB923C", "#34D399", "#F472B6",
  "#60A5FA", "#FBBF24", "#A3E635", "#E879F9", "#38BDF8",
];

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const NBXPL_RE =
  /\b(object\s+neighborhood|neighborhood\s+explorer|nbxpl\b|neighbor\s+graph|explore\s+neighbors?|object\s+graph|object\s+connections?\b|ontology\s+neighbors?)\b/i;

export function isNbxplQuery(q) {
  return NBXPL_RE.test(q || "");
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

function hdrs() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchObjectList() {
  const r = await fetch(`${apiBase()}/v1/ontology/objects?limit=200`, { headers: hdrs() });
  if (!r.ok) throw new Error(`objects ${r.status}`);
  return r.json();
}

async function fetchNeighbors(id) {
  const r = await fetch(`${apiBase()}/v1/ontology/objects/${encodeURIComponent(id)}/neighbors`, { headers: hdrs() });
  if (!r.ok) throw new Error(`neighbors ${r.status}`);
  return r.json();
}

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseObjects(raw) {
  const arr = Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.objects)         ? raw.objects
    : Array.isArray(raw)                  ? raw
    : [];
  return arr.map((o) => ({
    id:    String(o.id    || o.object_id || "?"),
    label: o.label || o.name || o.id || "—",
    type:  o.type  || o.object_type || "unknown",
  }));
}

function normaliseNeighborResponse(raw, seedId) {
  // Accept several shapes the backend might return.
  let nodes = [];
  let edges = [];

  if (Array.isArray(raw?.nodes)) {
    nodes = raw.nodes;
    edges = Array.isArray(raw.edges) ? raw.edges
          : Array.isArray(raw.links) ? raw.links
          : [];
  } else if (Array.isArray(raw?.neighbors)) {
    // {neighbors:[{id,label,type,relation},...]}
    nodes = raw.neighbors.map((n) => ({
      id:    String(n.id    || n.neighbor_id || "?"),
      label: n.label || n.name || n.id || "—",
      type:  n.type  || "unknown",
    }));
    edges = raw.neighbors.map((n, i) => ({
      id:     `e${i}`,
      source: seedId,
      target: String(n.id || n.neighbor_id || "?"),
      label:  n.relation || n.relation_type || n.edge_type || "",
    }));
  } else if (Array.isArray(raw)) {
    nodes = raw.map((n) => ({
      id:    String(n.id || n.neighbor_id || "?"),
      label: n.label || n.name || n.id || "—",
      type:  n.type  || "unknown",
    }));
    edges = raw.map((n, i) => ({
      id:     `e${i}`,
      source: seedId,
      target: String(n.id || n.neighbor_id || "?"),
      label:  n.relation || "",
    }));
  }

  // Normalise edge source/target to strings
  edges = edges.map((e, i) => ({
    id:     e.id || `e${i}`,
    source: String(e.source || e.from || ""),
    target: String(e.target || e.to   || ""),
    label:  e.label || e.relation || e.type || "",
  }));

  return { nodes, edges };
}

// ─── type→color index ─────────────────────────────────────────────────────────

const typeColorCache = {};
let typeColorIdx = 0;
function colorForType(type) {
  if (!typeColorCache[type]) {
    typeColorCache[type] = TYPE_PALETTE[typeColorIdx++ % TYPE_PALETTE.length];
  }
  return typeColorCache[type];
}

// ─── force simulation ─────────────────────────────────────────────────────────

function buildSimNodes(graphNodes, seedId, centerX, centerY) {
  return graphNodes.map((n) => {
    const isSeed = n.id === seedId;
    return {
      ...n,
      x:   isSeed ? centerX : centerX + (Math.random() - 0.5) * 200,
      y:   isSeed ? centerY : centerY + (Math.random() - 0.5) * 200,
      vx:  0,
      vy:  0,
      r:   isSeed ? 18 : 10,
      neighborCount: 0,
    };
  });
}

function tickSim(simNodes, edges, alpha) {
  const REPEL  = 3500;
  const SPRING = 0.04;
  const LEN    = 100;
  const DAMP   = 0.85;
  const GRAV   = 0.02;
  const CX     = SVG_W / 2;
  const CY_    = SVG_H / 2;

  const N = simNodes.length;

  // Repulsion (O(n²) — fine for small graphs)
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx  = simNodes[j].x - simNodes[i].x;
      const dy  = simNodes[j].y - simNodes[i].y;
      const d2  = dx * dx + dy * dy + 1;
      const f   = (REPEL * alpha) / d2;
      simNodes[i].vx -= f * dx;
      simNodes[i].vy -= f * dy;
      simNodes[j].vx += f * dx;
      simNodes[j].vy += f * dy;
    }
  }

  // Spring forces along edges
  const nodeById = {};
  simNodes.forEach((n) => (nodeById[n.id] = n));
  edges.forEach((e) => {
    const a = nodeById[e.source];
    const b = nodeById[e.target];
    if (!a || !b) return;
    const dx  = b.x - a.x;
    const dy  = b.y - a.y;
    const d   = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const f   = (d - LEN) * SPRING * alpha;
    a.vx += (f * dx) / d;
    a.vy += (f * dy) / d;
    b.vx -= (f * dx) / d;
    b.vy -= (f * dy) / d;
  });

  // Gravity to center + damping + integrate
  for (let i = 0; i < N; i++) {
    const n = simNodes[i];
    n.vx += (CX - n.x) * GRAV * alpha;
    n.vy += (CY_ - n.y) * GRAV * alpha;
    n.vx *= DAMP;
    n.vy *= DAMP;
    n.x  += n.vx;
    n.y  += n.vy;
  }
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ObjectNeighborhoodExplorer() {
  const [open,       setOpen]       = useState(false);
  const [objList,    setObjList]    = useState([]);
  const [listErr,    setListErr]    = useState(null);
  const [listLoading,setListLoad]   = useState(false);
  const [seedId,     setSeedId]     = useState("");
  const [depth,      setDepth]      = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [graphErr,   setGraphErr]   = useState(null);

  // Graph data
  const [simNodes,   setSimNodes]   = useState([]);
  const [edges,      setEdges]      = useState([]);

  // SVG pan/zoom state
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging  = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Tooltip
  const [tooltip, setTooltip] = useState(null);

  // Animation
  const rafRef    = useRef(null);
  const simRef    = useRef([]);
  const edgesRef  = useRef([]);
  const alphaRef  = useRef(1);
  const ticksRef  = useRef(0);

  // ASSESS
  const [assess,    setAssess]    = useState("");
  const [assessing, setAss]       = useState(false);

  // ── load object list ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setListLoad(true);
    setListErr(null);
    fetchObjectList()
      .then((raw) => setObjList(normaliseObjects(raw)))
      .catch((e)  => setListErr(e.message))
      .finally(() => setListLoad(false));
  }, [open]);

  // ── toggle event ─────────────────────────────────────────────────────────

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:nbxpl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:nbxpl-toggle", onToggle);
  }, []);

  // ── animation loop ────────────────────────────────────────────────────────

  const stopAnim = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startAnim = useCallback(() => {
    stopAnim();
    alphaRef.current = 1;
    ticksRef.current = 0;
    const tick = () => {
      if (alphaRef.current < 0.005) { stopAnim(); return; }
      const TICKS_PER_FRAME = 4;
      for (let i = 0; i < TICKS_PER_FRAME; i++) {
        tickSim(simRef.current, edgesRef.current, alphaRef.current);
      }
      alphaRef.current *= 0.995;
      ticksRef.current++;
      setSimNodes([...simRef.current]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopAnim]);

  useEffect(() => () => stopAnim(), [stopAnim]);

  // ── fetch neighborhood ────────────────────────────────────────────────────

  const loadGraph = useCallback(async (rootId, hopDepth) => {
    if (!rootId) return;
    stopAnim();
    setLoading(true);
    setGraphErr(null);
    setSimNodes([]);
    setEdges([]);
    setPan({ x: 0, y: 0 });
    setZoom(1);

    try {
      const raw1 = await fetchNeighbors(rootId);
      const { nodes: n1, edges: e1 } = normaliseNeighborResponse(raw1, rootId);

      // Include seed node
      const seedMeta = objList.find((o) => o.id === rootId) || { id: rootId, label: rootId, type: "seed" };
      const nodeMap  = { [rootId]: { ...seedMeta, neighborCount: n1.length } };
      n1.forEach((n) => { nodeMap[n.id] = { ...n, neighborCount: 0 }; });

      let allEdges = [...e1];

      if (hopDepth === 2 && n1.length > 0) {
        // Fetch neighbors of neighbors (max first 6 to avoid explosion)
        const hop2Targets = n1.slice(0, 6);
        const hop2Results = await Promise.allSettled(
          hop2Targets.map((n) => fetchNeighbors(n.id))
        );
        hop2Results.forEach((res, i) => {
          if (res.status !== "fulfilled") return;
          const parentId = hop2Targets[i].id;
          const { nodes: n2, edges: e2 } = normaliseNeighborResponse(res.value, parentId);
          n2.forEach((n) => {
            if (!nodeMap[n.id]) nodeMap[n.id] = { ...n, neighborCount: 0 };
          });
          e2.forEach((e) => {
            if (!allEdges.some((ex) => ex.source === e.source && ex.target === e.target)) {
              allEdges.push(e);
            }
          });
        });
      }

      // Count neighbors per node from edges
      allEdges.forEach((e) => {
        if (nodeMap[e.source]) nodeMap[e.source].neighborCount = (nodeMap[e.source].neighborCount || 0) + 1;
        if (nodeMap[e.target]) nodeMap[e.target].neighborCount = (nodeMap[e.target].neighborCount || 0) + 1;
      });

      const allNodes = Object.values(nodeMap);

      // Assign radii based on neighbor count
      const maxNC = Math.max(1, ...allNodes.map((n) => n.neighborCount));
      allNodes.forEach((n) => {
        n.r = n.id === rootId ? 20 : 8 + Math.round((n.neighborCount / maxNC) * 12);
      });

      // Build sim nodes
      const built = buildSimNodes(allNodes, rootId, SVG_W / 2, SVG_H / 2);
      simRef.current  = built;
      edgesRef.current = allEdges;
      setEdges(allEdges);
      startAnim();
    } catch (e) {
      setGraphErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [objList, stopAnim, startAnim]);

  // ── handle seed change ────────────────────────────────────────────────────

  const onSeedChange = useCallback((e) => {
    const id = e.target.value;
    setSeedId(id);
    if (id) loadGraph(id, depth);
  }, [depth, loadGraph]);

  const onDepthChange = useCallback((e) => {
    const d = Number(e.target.value);
    setDepth(d);
    if (seedId) loadGraph(seedId, d);
  }, [seedId, loadGraph]);

  // ── click node → re-center ────────────────────────────────────────────────

  const onNodeClick = useCallback((nodeId) => {
    setSeedId(nodeId);
    loadGraph(nodeId, depth);
  }, [depth, loadGraph]);

  // ── pan / zoom ────────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e) => {
    if (e.target.closest("[data-node]")) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  // ── ASSESS ────────────────────────────────────────────────────────────────

  const runAssess = useCallback(async () => {
    setAss(true);
    setAssess("");
    try {
      const nodeCount = simRef.current.length;
      const edgeCount = edgesRef.current.length;
      const seedLabel = objList.find((o) => o.id === seedId)?.label || seedId || "unknown";
      const topNodes  = [...simRef.current]
        .sort((a, b) => b.neighborCount - a.neighborCount)
        .slice(0, 3)
        .map((n) => `${n.label}(${n.neighborCount} links)`)
        .join(", ");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Object neighborhood for "${seedLabel}" (${depth}-hop): ` +
            `${nodeCount} nodes, ${edgeCount} edges. ` +
            `Most-connected: ${topNodes || "none"}. ` +
            `Deliver a 2-sentence graph connectivity and intelligence-value assessment — formal butler tone.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "Neighborhood graph analysed, sir.").trim();
      setAssess(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssess("Neighborhood assessment unavailable, sir.");
    } finally {
      setAss(false);
    }
  }, [seedId, depth, objList]);

  // ── render ────────────────────────────────────────────────────────────────

  if (!open) {
    const nodeCount = simNodes.length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 364,
          background: "rgba(12,22,30,0.90)", border: `1px solid ${BORD}`,
          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
          color: CY, fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}
      >
        ◈ NBXPL
        {nodeCount > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>
            {nodeCount}
          </span>
        )}
      </button>
    );
  }

  const panX = pan.x;
  const panY = pan.y;

  return (
    <div
      style={{
        position: "fixed", bottom: 50, left: Math.min(BTN_LEFT, window.innerWidth - PANEL_W - 10),
        width: PANEL_W, maxHeight: PANEL_H, zIndex: 364,
        background: SURF, border: `1px solid ${BORD}`, borderRadius: 10,
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)", fontFamily: "monospace",
        overflow: "hidden", userSelect: "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${BORD}`, gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1 }}>◈ OBJECT NEIGHBORHOOD EXPLORER</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", flexShrink: 0, alignItems: "center" }}>
        <select
          value={seedId}
          onChange={onSeedChange}
          style={{
            flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD}`,
            borderRadius: 5, padding: "5px 8px", color: CY, fontSize: 10,
            fontFamily: "monospace", outline: "none",
          }}
        >
          <option value="">— select seed object —</option>
          {listLoading && <option disabled>Loading…</option>}
          {listErr    && <option disabled>Error: {listErr}</option>}
          {objList.map((o) => (
            <option key={o.id} value={o.id}>{o.label} [{o.type}]</option>
          ))}
        </select>

        <select
          value={depth}
          onChange={onDepthChange}
          style={{
            background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD}`,
            borderRadius: 5, padding: "5px 8px", color: AM, fontSize: 10,
            fontFamily: "monospace", outline: "none",
          }}
        >
          <option value={1}>1 hop</option>
          <option value={2}>2 hops</option>
        </select>
      </div>

      {/* Stats bar */}
      {simNodes.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "0 12px 8px", flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: GRAY }}>Nodes: <span style={{ color: CY }}>{simNodes.length}</span></span>
          <span style={{ fontSize: 9, color: GRAY }}>Edges: <span style={{ color: AM }}>{edges.length}</span></span>
          <span style={{ fontSize: 9, color: GRAY }}>Scroll to zoom · Drag canvas to pan · Click node to explore</span>
        </div>
      )}

      {/* SVG canvas */}
      <div
        style={{ position: "relative", flex: 1, overflow: "hidden", background: "rgba(6,12,18,0.95)", cursor: dragging.current ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontSize: 11 }}>
            Fetching neighborhood…
          </div>
        )}
        {graphErr && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: RD, fontSize: 11 }}>
            {graphErr}
          </div>
        )}
        {!loading && !graphErr && simNodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontSize: 11 }}>
            Select a seed object to explore its neighborhood.
          </div>
        )}

        <svg
          width={SVG_W}
          height={SVG_H}
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          <defs>
            <marker id="nbxpl-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={GRAY} />
            </marker>
          </defs>

          <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((e) => {
              const src = simNodes.find((n) => n.id === e.source);
              const tgt = simNodes.find((n) => n.id === e.target);
              if (!src || !tgt) return null;
              const mx = (src.x + tgt.x) / 2;
              const my = (src.y + tgt.y) / 2;
              return (
                <g key={e.id}>
                  <line
                    x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke="rgba(78,96,112,0.5)" strokeWidth={1}
                    markerEnd="url(#nbxpl-arrow)"
                  />
                  {e.label && (
                    <text
                      x={mx} y={my - 3}
                      textAnchor="middle"
                      fontSize={7}
                      fill={GRAY}
                      style={{ pointerEvents: "none" }}
                    >
                      {e.label.length > 14 ? e.label.slice(0, 14) + "…" : e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {simNodes.map((n) => {
              const color = colorForType(n.type);
              const isSeed = n.id === seedId;
              return (
                <g
                  key={n.id}
                  data-node="1"
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onNodeClick(n.id)}
                  onMouseEnter={() => setTooltip({ label: n.label, type: n.type, neighborCount: n.neighborCount })}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <circle
                    r={n.r}
                    fill={isSeed ? color : `${color}33`}
                    stroke={color}
                    strokeWidth={isSeed ? 2.5 : 1.5}
                  />
                  {isSeed && (
                    <circle r={n.r + 4} fill="none" stroke={color} strokeWidth={1} opacity={0.4} />
                  )}
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={n.r < 12 ? 7 : 8}
                    fill={isSeed ? "#000" : "#cdd6f4"}
                    style={{ pointerEvents: "none" }}
                  >
                    {(n.label || "").slice(0, Math.max(4, Math.floor(n.r * 1.2)))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: "absolute", bottom: 8, left: 8,
            background: "rgba(12,22,30,0.95)", border: `1px solid ${BORD}`,
            borderRadius: 5, padding: "5px 10px", fontSize: 10,
            pointerEvents: "none", maxWidth: 240,
          }}>
            <div style={{ color: CY, fontWeight: 700, marginBottom: 2 }}>{tooltip.label}</div>
            <div style={{ color: GRAY }}>Type: <span style={{ color: colorForType(tooltip.type) }}>{tooltip.type}</span></div>
            <div style={{ color: GRAY }}>Neighbors: <span style={{ color: AM }}>{tooltip.neighborCount}</span></div>
          </div>
        )}
      </div>

      {/* ASSESS */}
      <div style={{ borderTop: `1px solid ${BORD}`, padding: "8px 12px", flexShrink: 0 }}>
        {assess && (
          <div style={{ fontSize: 10, color: "#cdd6f4", marginBottom: 6, lineHeight: 1.5 }}>{assess}</div>
        )}
        <button
          onClick={runAssess}
          disabled={assessing || simNodes.length === 0}
          style={{
            background: (assessing || simNodes.length === 0) ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.12)",
            border: `1px solid ${(assessing || simNodes.length === 0) ? GRAY : CY}`,
            color: (assessing || simNodes.length === 0) ? GRAY : CY,
            borderRadius: 5, padding: "4px 14px",
            cursor: (assessing || simNodes.length === 0) ? "not-allowed" : "pointer", fontSize: 10,
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
