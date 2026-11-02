/**
 * InvestigationGraphViewer — F292 (overnight backlog)
 *
 * CANVAS-GRAPH: select investigation from /v1/investigations, then render
 * its seeds + resolved subgraph as a D3-style SVG force-directed graph
 * (pure Verlet simulation, no D3 needed).
 *
 * Features:
 *   - Dropdown: GET /v1/investigations → pick investigation
 *   - Subgraph load: GET /v1/investigations/{id} → seeds + edges
 *   - SVG force-directed graph (Verlet sim), node shape = object type
 *   - Edge labels show relation
 *   - Click node → GET /v1/ontology/objects/{id} → inspector drawer
 *   - Click edge → annotation form → POST /v1/investigations/{id}/annotations
 *   - Share button → POST /v1/investigations/{id}/share (principal input)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ INVGRPH  left:211320  zIndex:388
 * Event:  jarvis:inv-graph-toggle
 * Voice:  "investigation graph / inv graph / case graph / invgrph /
 *          investigation subgraph / investigation network"
 *
 * Exported for JarvisBrain: isInvGraphQuery
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
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const PANEL_W = 560;
const PANEL_H = 680;
const SVG_W   = PANEL_W - 2;
const SVG_H   = 380;

const TYPE_PALETTE = [
  CY, PU, AM, GN, "#FB923C", "#34D399", "#F472B6",
  "#60A5FA", "#FBBF24", "#A3E635", "#E879F9", "#38BDF8",
];

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const INV_GRAPH_RE =
  /\b(investigation\s+graph|inv[\s_-]?graph|case\s+graph|invgrph\b|investigation\s+subgraph|investigation\s+network|case\s+network|case\s+subgraph)\b/i;

export function isInvGraphQuery(q) {
  return INV_GRAPH_RE.test(q || "");
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

function hdrs() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs() });
  if (!r.ok) throw new Error(`investigations ${r.status}`);
  return r.json();
}

async function fetchInvestigationDetail(id) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(id)}`, { headers: hdrs() });
  if (!r.ok) throw new Error(`investigation detail ${r.status}`);
  return r.json();
}

async function fetchOntologyObject(id) {
  const r = await fetch(`${apiBase()}/v1/ontology/objects/${encodeURIComponent(id)}`, { headers: hdrs() });
  if (!r.ok) throw new Error(`object ${r.status}`);
  return r.json();
}

async function postAnnotation(invId, note) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(invId)}/annotations`, {
    method: "POST",
    headers: { ...hdrs(), "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!r.ok) throw new Error(`annotation ${r.status}`);
  return r.json();
}

async function postShare(invId, principal) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(invId)}/share`, {
    method: "POST",
    headers: { ...hdrs(), "Content-Type": "application/json" },
    body: JSON.stringify({ principal }),
  });
  if (!r.ok) throw new Error(`share ${r.status}`);
  return r.json();
}

async function postAssess(message) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...hdrs(), "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error(`assess ${r.status}`);
  const d = await r.json();
  return d.response || d.message || d.text || d.content || JSON.stringify(d).slice(0, 400);
}

// ─── normalise investigation list ─────────────────────────────────────────────

function normaliseInvestigationList(raw) {
  const arr = Array.isArray(raw?.investigations) ? raw.investigations
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw) ? raw
    : [];
  return arr.map((inv) => ({
    id:     String(inv.id    || inv.investigation_id || inv.case_id || "?"),
    title:  inv.title || inv.name || inv.case_name || inv.id || "—",
    status: inv.status || inv.state || "OPEN",
  }));
}

// ─── normalise subgraph from investigation detail ─────────────────────────────

function normaliseSubgraph(raw, invId) {
  // Accept seeds array or subgraph object
  let nodes = [];
  let edges = [];

  const seedArr = Array.isArray(raw?.seeds) ? raw.seeds
    : Array.isArray(raw?.objects) ? raw.objects
    : Array.isArray(raw?.nodes) ? raw.nodes
    : [];

  const edgeArr = Array.isArray(raw?.edges) ? raw.edges
    : Array.isArray(raw?.links) ? raw.links
    : Array.isArray(raw?.subgraph?.edges) ? raw.subgraph.edges
    : [];

  // Seed nodes
  seedArr.forEach((s) => {
    nodes.push({
      id:    String(s.id || s.object_id || s.seed_id || "?"),
      label: s.label || s.name || s.id || "—",
      type:  s.type  || s.object_type || "seed",
      isSeed: true,
    });
  });

  // Merge any nodes from subgraph
  (Array.isArray(raw?.subgraph?.nodes) ? raw.subgraph.nodes : []).forEach((n) => {
    if (!nodes.find((x) => x.id === String(n.id || n.object_id || ""))) {
      nodes.push({
        id:    String(n.id || n.object_id || "?"),
        label: n.label || n.name || n.id || "—",
        type:  n.type  || n.object_type || "object",
        isSeed: false,
      });
    }
  });

  // If no nodes at all, add a placeholder investigation node
  if (nodes.length === 0) {
    nodes.push({ id: invId, label: `INV:${invId}`, type: "Investigation", isSeed: true });
  }

  // Edges
  edgeArr.forEach((e, i) => {
    edges.push({
      id:     e.id || `e${i}`,
      source: String(e.source || e.from || e.from_id || ""),
      target: String(e.target || e.to   || e.to_id   || ""),
      label:  e.label || e.relation || e.relation_type || e.type || "",
    });
  });

  return { nodes, edges };
}

// ─── type→color cache ─────────────────────────────────────────────────────────

const typeColorCache = {};
let typeColorIdx = 0;
function colorForType(type) {
  if (!typeColorCache[type]) {
    typeColorCache[type] = TYPE_PALETTE[typeColorIdx++ % TYPE_PALETTE.length];
  }
  return typeColorCache[type];
}

// ─── node shape by type ───────────────────────────────────────────────────────

function nodeShape(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("risk"))      return "diamond";
  if (t.includes("task"))      return "square";
  if (t.includes("contact"))   return "hexagon";
  if (t.includes("invest"))    return "triangle";
  return "circle";
}

// ─── force simulation helpers ─────────────────────────────────────────────────

function buildSimNodes(graphNodes, svgW, svgH) {
  const cx = svgW / 2;
  const cy = svgH / 2;
  return graphNodes.map((n, i) => ({
    ...n,
    x:  n.isSeed ? cx : cx + (Math.random() - 0.5) * 240,
    y:  n.isSeed ? cy : cy + (Math.random() - 0.5) * 240,
    vx: 0,
    vy: 0,
    r:  n.isSeed ? 20 : 11,
  }));
}

function tickSim(simNodes, edges, alpha, svgW, svgH) {
  const REPEL  = 4000;
  const SPRING = 0.05;
  const LEN    = 110;
  const DAMP   = 0.82;
  const GRAV   = 0.025;
  const cx     = svgW / 2;
  const cy     = svgH / 2;
  const N      = simNodes.length;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = simNodes[j].x - simNodes[i].x;
      const dy = simNodes[j].y - simNodes[i].y;
      const d2 = dx * dx + dy * dy + 1;
      const f  = (REPEL * alpha) / d2;
      simNodes[i].vx -= f * dx;
      simNodes[i].vy -= f * dy;
      simNodes[j].vx += f * dx;
      simNodes[j].vy += f * dy;
    }
  }

  const nodeById = {};
  simNodes.forEach((n) => (nodeById[n.id] = n));
  edges.forEach((e) => {
    const a = nodeById[e.source];
    const b = nodeById[e.target];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const f  = (d - LEN) * SPRING * alpha;
    a.vx += (f * dx) / d;
    a.vy += (f * dy) / d;
    b.vx -= (f * dx) / d;
    b.vy -= (f * dy) / d;
  });

  for (let i = 0; i < N; i++) {
    const n = simNodes[i];
    n.vx += (cx - n.x) * GRAV * alpha;
    n.vy += (cy - n.y) * GRAV * alpha;
    n.vx *= DAMP;
    n.vy *= DAMP;
    n.x  += n.vx;
    n.y  += n.vy;
    // Clamp to viewport
    n.x = Math.max(n.r + 2, Math.min(svgW - n.r - 2, n.x));
    n.y = Math.max(n.r + 2, Math.min(svgH - n.r - 2, n.y));
  }
}

// ─── SVG node shapes ──────────────────────────────────────────────────────────

function NodeShape({ node, color, onClick, onHover, onLeave }) {
  const { x, y, r, type, id } = node;
  const shape = nodeShape(type);
  const sharedProps = {
    fill:    `${color}22`,
    stroke:  color,
    strokeWidth: node.isSeed ? 2.5 : 1.5,
    style:   { cursor: "pointer" },
    onClick: () => onClick(id),
    onMouseEnter: (e) => onHover(e, node),
    onMouseLeave: onLeave,
    "data-node": "1",
  };

  if (shape === "diamond") {
    const pts = `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
    return <polygon points={pts} {...sharedProps} />;
  }
  if (shape === "square") {
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2} {...sharedProps} />;
  }
  if (shape === "triangle") {
    const pts = `${x},${y - r} ${x + r * 0.87},${y + r * 0.5} ${x - r * 0.87},${y + r * 0.5}`;
    return <polygon points={pts} {...sharedProps} />;
  }
  if (shape === "hexagon") {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
      const ang = (Math.PI / 3) * i - Math.PI / 6;
      return `${x + r * Math.cos(ang)},${y + r * Math.sin(ang)}`;
    }).join(" ");
    return <polygon points={pts} {...sharedProps} />;
  }
  return <circle cx={x} cy={y} r={r} {...sharedProps} />;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function InvestigationGraphViewer() {
  const [open,       setOpen]      = useState(false);
  const [invList,    setInvList]   = useState([]);
  const [listErr,    setListErr]   = useState(null);
  const [listLoad,   setListLoad]  = useState(false);
  const [selInvId,   setSelInvId]  = useState("");
  const [selInvTitle,setSelTitle]  = useState("");
  const [loading,    setLoading]   = useState(false);
  const [graphErr,   setGraphErr]  = useState(null);

  // Graph data (rendered state)
  const [simNodes,   setSimNodes]  = useState([]);
  const [edges,      setEdges]     = useState([]);

  // Pan / zoom
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging  = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Tooltip
  const [tooltip, setTooltip] = useState(null);

  // Inspector drawer
  const [inspector,    setInspector]   = useState(null);
  const [inspLoading,  setInspLoading] = useState(false);
  const [inspErr,      setInspErr]     = useState(null);

  // Edge annotation
  const [annEdge,    setAnnEdge]   = useState(null);
  const [annNote,    setAnnNote]   = useState("");
  const [annPosting, setAnnPost]   = useState(false);
  const [annResult,  setAnnResult] = useState(null);

  // Share
  const [showShare,   setShowShare]  = useState(false);
  const [sharePrin,   setSharePrin]  = useState("");
  const [sharing,     setSharing]    = useState(false);
  const [shareResult, setShareResult]= useState(null);

  // ASSESS
  const [assess,    setAssess]    = useState("");
  const [assessing, setAss]       = useState(false);

  // Sim refs
  const rafRef    = useRef(null);
  const simRef    = useRef([]);
  const edgesRef  = useRef([]);
  const alphaRef  = useRef(1);

  // ── toggle ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onT = () => setOpen((v) => !v);
    window.addEventListener("jarvis:inv-graph-toggle", onT);
    return () => window.removeEventListener("jarvis:inv-graph-toggle", onT);
  }, []);

  // ── load investigation list ───────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setListLoad(true);
    setListErr(null);
    fetchInvestigations()
      .then((raw) => setInvList(normaliseInvestigationList(raw)))
      .catch((e)  => setListErr(e.message))
      .finally(() => setListLoad(false));
  }, [open]);

  // ── animation loop ────────────────────────────────────────────────────────

  const stopAnim = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startAnim = useCallback(() => {
    stopAnim();
    alphaRef.current = 1;
    const tick = () => {
      if (alphaRef.current < 0.004) { stopAnim(); return; }
      for (let i = 0; i < 4; i++) {
        tickSim(simRef.current, edgesRef.current, alphaRef.current, SVG_W, SVG_H);
      }
      alphaRef.current *= 0.994;
      setSimNodes([...simRef.current]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopAnim]);

  useEffect(() => () => stopAnim(), [stopAnim]);

  // ── load investigation subgraph ───────────────────────────────────────────

  const loadGraph = useCallback(async (invId, invTitle) => {
    if (!invId) return;
    stopAnim();
    setLoading(true);
    setGraphErr(null);
    setSimNodes([]);
    setEdges([]);
    setInspector(null);
    setAnnEdge(null);
    setAnnResult(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setAssess("");

    try {
      const raw = await fetchInvestigationDetail(invId);
      const { nodes, edges: rawEdges } = normaliseSubgraph(raw, invId);

      const built = buildSimNodes(nodes, SVG_W, SVG_H);
      simRef.current   = built;
      edgesRef.current = rawEdges;
      setEdges(rawEdges);
      startAnim();
    } catch (e) {
      setGraphErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [stopAnim, startAnim]);

  const onInvChange = useCallback((e) => {
    const id = e.target.value;
    const inv = invList.find((i) => i.id === id);
    setSelInvId(id);
    setSelTitle(inv?.title || id);
    setShareResult(null);
    if (id) loadGraph(id, inv?.title || id);
  }, [invList, loadGraph]);

  // ── node click → inspector ────────────────────────────────────────────────

  const onNodeClick = useCallback(async (nodeId) => {
    setInspector(null);
    setInspErr(null);
    setInspLoading(true);
    try {
      const raw = await fetchOntologyObject(nodeId);
      setInspector({ nodeId, data: raw });
    } catch (e) {
      setInspErr(e.message);
      setInspector({ nodeId, data: null });
    } finally {
      setInspLoading(false);
    }
  }, []);

  // ── edge click → annotation form ─────────────────────────────────────────

  const onEdgeClick = useCallback((edge) => {
    setAnnEdge(edge);
    setAnnNote(`Edge ${edge.source} → ${edge.target}: `);
    setAnnResult(null);
  }, []);

  const submitAnnotation = useCallback(async () => {
    if (!selInvId || !annNote.trim()) return;
    setAnnPost(true);
    setAnnResult(null);
    try {
      await postAnnotation(selInvId, annNote.trim());
      setAnnResult("Annotation saved.");
      setAnnEdge(null);
      setAnnNote("");
    } catch (e) {
      setAnnResult(`Error: ${e.message}`);
    } finally {
      setAnnPost(false);
    }
  }, [selInvId, annNote]);

  // ── share ─────────────────────────────────────────────────────────────────

  const submitShare = useCallback(async () => {
    if (!selInvId || !sharePrin.trim()) return;
    setSharing(true);
    setShareResult(null);
    try {
      await postShare(selInvId, sharePrin.trim());
      setShareResult(`Shared with ${sharePrin.trim()}.`);
      setSharePrin("");
    } catch (e) {
      setShareResult(`Error: ${e.message}`);
    } finally {
      setSharing(false);
    }
  }, [selInvId, sharePrin]);

  // ── ASSESS ────────────────────────────────────────────────────────────────

  const handleAssess = useCallback(async () => {
    if (!selInvId) return;
    setAss(true);
    setAssess("");
    const nodeCount = simNodes.length;
    const edgeCount = edges.length;
    try {
      const text = await postAssess(
        `Analyse investigation "${selInvTitle}" (id:${selInvId}). ` +
        `Subgraph has ${nodeCount} objects and ${edgeCount} relations. ` +
        `Summarise the investigation structure and flag key risks or gaps in 2 sentences.`
      );
      setAssess(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setAssess(`Error: ${e.message}`);
    } finally {
      setAss(false);
    }
  }, [selInvId, selInvTitle, simNodes.length, edges.length]);

  // ── pan / zoom ────────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e) => {
    if (e.target.closest("[data-node]")) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  // ── tooltip ───────────────────────────────────────────────────────────────

  const onNodeHover = useCallback((e, node) => {
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      label: node.label,
      type:  node.type,
      isSeed: node.isSeed,
    });
  }, []);

  const onNodeLeave = useCallback(() => setTooltip(null), []);

  if (!open) return null;

  // ── edge midpoints for click targets ─────────────────────────────────────

  const nodeById = {};
  simNodes.forEach((n) => (nodeById[n.id] = n));

  return (
    <>
    <div style={{
      position: "fixed",
      left: 40,
      top: 60,
      width: PANEL_W,
      maxHeight: `${PANEL_H}px`,
      background: SURF,
      border: `1px solid ${BORD}`,
      borderRadius: 12,
      display: "flex",
      flexDirection: "column",
      fontFamily: "monospace",
      fontSize: 12,
      color: "#C0D0E0",
      boxShadow: `0 0 40px ${CY}18`,
      zIndex: 388,
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORD}`,
        flexShrink: 0,
      }}>
        <span style={{ color: CY, letterSpacing: 2, fontSize: 11, fontWeight: 700 }}>
          ◈ INVESTIGATION GRAPH VIEWER
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {selInvId && (
            <button
              onClick={() => setShowShare((v) => !v)}
              style={{
                fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
                background: `${PU}18`, border: `1px solid ${PU}44`,
                color: PU, borderRadius: 4, padding: "2px 7px", cursor: "pointer",
              }}
            >↗ SHARE</button>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 16 }}
          >×</button>
        </div>
      </div>

      {/* selector row */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${BORD}`,
        display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
      }}>
        <select
          value={selInvId}
          onChange={onInvChange}
          disabled={listLoad}
          style={{
            flex: 1, background: "#0D1826", border: `1px solid ${CY}33`,
            color: "#C0D0E0", fontFamily: "monospace", fontSize: 11,
            borderRadius: 4, padding: "4px 6px", outline: "none",
          }}
        >
          <option value="">
            {listLoad ? "Loading investigations…" : "— select investigation —"}
          </option>
          {invList.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.title} [{inv.status}]
            </option>
          ))}
        </select>
        {selInvId && (
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
              background: `${CY}18`, border: `1px solid ${CY}44`,
              color: CY, borderRadius: 4, padding: "4px 8px",
              cursor: assessing ? "wait" : "pointer", flexShrink: 0,
            }}
          >{assessing ? "ASSESSING…" : "▶ ASSESS"}</button>
        )}
      </div>

      {listErr && (
        <div style={{ color: RD, fontSize: 10, padding: "6px 14px", flexShrink: 0 }}>
          Error loading investigations: {listErr}
        </div>
      )}

      {/* share panel */}
      {showShare && selInvId && (
        <div style={{
          padding: "8px 14px", borderBottom: `1px solid ${BORD}`,
          background: `${PU}08`, flexShrink: 0,
        }}>
          <div style={{ color: PU, fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
            SHARE INVESTIGATION
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={sharePrin}
              onChange={(e) => setSharePrin(e.target.value)}
              placeholder="principal (user/group)"
              style={{
                flex: 1, background: "#0D1826", border: `1px solid ${PU}33`,
                color: "#C0D0E0", fontFamily: "monospace", fontSize: 10,
                borderRadius: 4, padding: "3px 6px", outline: "none",
              }}
            />
            <button
              onClick={submitShare}
              disabled={sharing || !sharePrin.trim()}
              style={{
                fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
                background: `${PU}22`, border: `1px solid ${PU}55`,
                color: PU, borderRadius: 4, padding: "3px 8px",
                cursor: sharing ? "wait" : "pointer",
              }}
            >{sharing ? "SHARING…" : "SHARE"}</button>
          </div>
          {shareResult && (
            <div style={{ color: shareResult.startsWith("Error") ? RD : GN, fontSize: 10, marginTop: 4 }}>
              {shareResult}
            </div>
          )}
        </div>
      )}

      {/* graph canvas */}
      <div
        style={{ flex: 1, overflow: "hidden", cursor: dragging.current ? "grabbing" : "grab", position: "relative" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {loading && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: CY, fontSize: 11, letterSpacing: 1,
          }}>LOADING SUBGRAPH…</div>
        )}
        {graphErr && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: RD, fontSize: 10, padding: 16, textAlign: "center",
          }}>Error: {graphErr}</div>
        )}
        {!loading && !graphErr && simNodes.length === 0 && selInvId && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: GRAY, fontSize: 10,
          }}>No subgraph data for this investigation.</div>
        )}
        {!loading && !graphErr && simNodes.length === 0 && !selInvId && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: GRAY, fontSize: 10,
          }}>Select an investigation above to view its subgraph.</div>
        )}

        <svg
          width={SVG_W}
          height={SVG_H}
          style={{ display: "block", userSelect: "none" }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* edges */}
            {edges.map((edge, i) => {
              const a = nodeById[edge.source];
              const b = nodeById[edge.target];
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={edge.id || i}>
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={`${CY}44`} strokeWidth={1}
                  />
                  {/* invisible wider hit target for edge clicks */}
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="transparent" strokeWidth={12}
                    style={{ cursor: "pointer" }}
                    onClick={() => onEdgeClick(edge)}
                  />
                  {edge.label && (
                    <text
                      x={mx} y={my}
                      textAnchor="middle"
                      fill={`${CY}99`}
                      fontSize={8}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >{edge.label}</text>
                  )}
                </g>
              );
            })}

            {/* nodes */}
            {simNodes.map((node) => {
              const color = colorForType(node.type);
              return (
                <g key={node.id}>
                  <NodeShape
                    node={node}
                    color={color}
                    onClick={onNodeClick}
                    onHover={onNodeHover}
                    onLeave={onNodeLeave}
                  />
                  <text
                    x={node.x}
                    y={node.y + node.r + 11}
                    textAnchor="middle"
                    fill={`${color}BB`}
                    fontSize={8}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >{node.label.length > 18 ? node.label.slice(0, 16) + "…" : node.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* stats bar */}
      {simNodes.length > 0 && (
        <div style={{
          padding: "4px 14px", borderTop: `1px solid ${BORD}`,
          display: "flex", gap: 16, fontSize: 9, color: GRAY, flexShrink: 0,
        }}>
          <span>{simNodes.length} NODES</span>
          <span>{edges.length} EDGES</span>
          <span style={{ marginLeft: "auto" }}>scroll=zoom · drag=pan · click node=inspect · click edge=annotate</span>
        </div>
      )}

      {/* edge annotation form */}
      {annEdge && (
        <div style={{
          padding: "8px 14px", borderTop: `1px solid ${BORD}`,
          background: `${AM}08`, flexShrink: 0,
        }}>
          <div style={{ color: AM, fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
            ANNOTATE EDGE: {annEdge.source} → {annEdge.target}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={annNote}
              onChange={(e) => setAnnNote(e.target.value)}
              placeholder="annotation note…"
              style={{
                flex: 1, background: "#0D1826", border: `1px solid ${AM}33`,
                color: "#C0D0E0", fontFamily: "monospace", fontSize: 10,
                borderRadius: 4, padding: "3px 6px", outline: "none",
              }}
            />
            <button
              onClick={submitAnnotation}
              disabled={annPosting || !annNote.trim()}
              style={{
                fontFamily: "monospace", fontSize: 9, background: `${AM}22`,
                border: `1px solid ${AM}55`, color: AM, borderRadius: 4,
                padding: "3px 8px", cursor: annPosting ? "wait" : "pointer",
              }}
            >{annPosting ? "SAVING…" : "SAVE"}</button>
            <button
              onClick={() => setAnnEdge(null)}
              style={{
                fontFamily: "monospace", fontSize: 9, background: "none",
                border: `1px solid ${GRAY}44`, color: GRAY, borderRadius: 4,
                padding: "3px 7px", cursor: "pointer",
              }}
            >✕</button>
          </div>
          {annResult && (
            <div style={{ color: annResult.startsWith("Error") ? RD : GN, fontSize: 10, marginTop: 4 }}>
              {annResult}
            </div>
          )}
        </div>
      )}

      {/* inspector drawer */}
      {(inspector || inspLoading || inspErr) && (
        <div style={{
          padding: "8px 14px", borderTop: `1px solid ${BORD}`,
          background: `${PU}08`, maxHeight: 140, overflowY: "auto", flexShrink: 0,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 4,
          }}>
            <span style={{ color: PU, fontSize: 10, letterSpacing: 1 }}>
              OBJECT INSPECTOR {inspector ? `— ${inspector.nodeId}` : ""}
            </span>
            <button
              onClick={() => { setInspector(null); setInspErr(null); }}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 13 }}
            >×</button>
          </div>
          {inspLoading && <div style={{ color: CY, fontSize: 10 }}>Loading…</div>}
          {inspErr && <div style={{ color: RD, fontSize: 10 }}>Error: {inspErr}</div>}
          {inspector?.data && (
            <pre style={{
              margin: 0, fontSize: 9, color: "#A0B8C8",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {JSON.stringify(inspector.data, null, 2).slice(0, 800)}
            </pre>
          )}
          {inspector && !inspector.data && !inspLoading && !inspErr && (
            <div style={{ color: GRAY, fontSize: 10 }}>No data returned.</div>
          )}
        </div>
      )}

      {/* ASSESS output */}
      {assess && (
        <div style={{
          padding: "8px 14px", borderTop: `1px solid ${BORD}`,
          background: `${CY}08`, flexShrink: 0,
        }}>
          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>ASSESSMENT</div>
          <div style={{ color: "#A0C8D8", fontSize: 11, lineHeight: 1.5 }}>{assess}</div>
        </div>
      )}
    </div>

      {/* node tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 28,
          background: "rgba(10,18,28,0.95)",
          border: `1px solid ${CY}44`,
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 10,
          color: "#C0D0E0",
          pointerEvents: "none",
          zIndex: 9999,
        }}>
          <strong style={{ color: CY }}>{tooltip.label}</strong>
          <span style={{ color: GRAY, marginLeft: 6 }}>{tooltip.type}</span>
          {tooltip.isSeed && <span style={{ color: AM, marginLeft: 6 }}>SEED</span>}
        </div>
      )}
    </>
  );
}
