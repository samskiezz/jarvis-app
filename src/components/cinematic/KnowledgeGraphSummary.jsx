/**
 * KnowledgeGraphSummary — F315
 * "JARVIS, kgsum / knowledge graph summary / knowledge graph / kg summary"
 * GET /knowledge/ → article list; GET /v1/graph/centrality → top nodes.
 * Cross-references by keyword; renders a pure-Verlet SVG force graph:
 *   - square nodes = knowledge articles (size ~ word count)
 *   - circle nodes = graph centrality nodes (size ~ centrality score)
 *   - edges drawn where article title/category tokens overlap node labels
 * Hover: article excerpt or node label tooltip.
 * Click article node → content drawer.
 * ▶ ASSESS → /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 * ◈ KGSUM (left:224200, zIndex:411).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const AMB  = "#FFA500";
const PU   = "#A78BFA";
const GRAY = "#6E8AA0";
const SURF = "rgba(4,7,14,0.97)";
const BORD = "#1A2940";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BTN_LEFT = 224_200;
const Z_INDEX  = 411;
const SVG_W    = 640;
const SVG_H    = 420;
const REPEL    = 5500;
const SPRING   = 0.05;
const LEN      = 120;
const DAMP     = 0.82;
const GRAV     = 0.022;

const KG_RE =
  /\bkgsum\b|\bknowledge.?graph.?sum\w*\b|\bkg.?sum\w*\b|\bknowledge.?graph\b/i;

export function isKgsumQuery(text) {
  return KG_RE.test(text || "");
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hdrs() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function tokenise(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(tokenise(a));
  return tokenise(b).filter((w) => sa.has(w)).length;
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.articles)
    ? raw.articles
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.data)
    ? raw.data
    : typeof raw === "object" && raw !== null
    ? Object.values(raw).filter((v) => v && typeof v === "object")
    : [];
  return arr.map((a, i) => ({
    id:       `art-${a.id || a.name || i}`,
    title:    a.title || a.name || a.subject || `Article ${i + 1}`,
    category: a.category || a.type || "",
    size:     Number(a.size || a.word_count || a.length || 800),
    excerpt:  a.excerpt || a.summary || a.content?.slice?.(0, 160) || "",
    isArticle: true,
  }));
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.nodes)
    ? raw.nodes
    : Array.isArray(raw?.items)
    ? raw.items
    : [];
  return arr.map((n, i) => ({
    id:         `node-${n.id || i}`,
    label:      n.label || n.name || n.id || `Node ${i + 1}`,
    type:       n.type || n.node_type || "entity",
    centrality: Number(n.centrality || n.score || n.degree || n.pagerank || 0.1),
    isArticle:  false,
  }));
}

// ─── Verlet simulation ────────────────────────────────────────────────────────

function buildSimNodes(nodes, w, h) {
  const cx = w / 2, cy = h / 2;
  return nodes.map((n) => {
    const r = n.isArticle
      ? Math.max(8, Math.min(22, Math.sqrt(n.size || 800) * 0.3))
      : Math.max(7, Math.min(18, (n.centrality || 0.1) * 60 + 6));
    return {
      ...n,
      x: cx + (Math.random() - 0.5) * 280,
      y: cy + (Math.random() - 0.5) * 220,
      vx: 0,
      vy: 0,
      r,
    };
  });
}

function tickSim(nodes, edges, alpha, w, h) {
  const cx = w / 2, cy = h / 2;
  const N = nodes.length;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const d2 = dx * dx + dy * dy + 1;
      const f  = (REPEL * alpha) / d2;
      nodes[i].vx -= f * dx; nodes[i].vy -= f * dy;
      nodes[j].vx += f * dx; nodes[j].vy += f * dy;
    }
  }
  const byId = {};
  nodes.forEach((n) => (byId[n.id] = n));
  edges.forEach((e) => {
    const a = byId[e.source], b = byId[e.target];
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const f = (d - LEN) * SPRING * alpha;
    a.vx += (f * dx) / d; a.vy += (f * dy) / d;
    b.vx -= (f * dx) / d; b.vy -= (f * dy) / d;
  });
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.vx += (cx - n.x) * GRAV * alpha;
    n.vy += (cy - n.y) * GRAV * alpha;
    n.vx *= DAMP; n.vy *= DAMP;
    n.x  += n.vx; n.y  += n.vy;
    n.x = Math.max(n.r + 4, Math.min(w - n.r - 4, n.x));
    n.y = Math.max(n.r + 4, Math.min(h - n.r - 4, n.y));
  }
}

// ─── SVG node shapes ──────────────────────────────────────────────────────────

function GraphNode({ node, onClick, onEnter, onLeave }) {
  const { x, y, r, isArticle, id } = node;
  const color  = isArticle ? CY : GRN;
  const shared = {
    fill: `${color}20`, stroke: color, strokeWidth: 1.5,
    style: { cursor: "pointer" },
    onClick: () => onClick(id),
    onMouseEnter: (e) => onEnter(e, node),
    onMouseLeave: onLeave,
    "data-node": "1",
  };
  if (isArticle) {
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2} {...shared} />;
  }
  return <circle cx={x} cy={y} r={r} {...shared} />;
}

// ─── async fetches ────────────────────────────────────────────────────────────

async function fetchArticles() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: hdrs() });
  if (!r.ok) throw new Error(`/knowledge/ ${r.status}`);
  return normaliseArticles(await r.json());
}

async function fetchCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, { headers: hdrs() });
  if (!r.ok) throw new Error(`/v1/graph/centrality ${r.status}`);
  return normaliseNodes(await r.json());
}

async function fetchArticleContent(title) {
  const name = encodeURIComponent(title);
  const r = await fetch(`${apiBase()}/knowledge/${name}`, { headers: hdrs() });
  if (!r.ok) throw new Error(`/knowledge/${name} ${r.status}`);
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

// ─── build graph edges ────────────────────────────────────────────────────────

function buildEdges(articles, graphNodes) {
  const edges = [];
  for (const art of articles) {
    const artText = `${art.title} ${art.category}`;
    for (const node of graphNodes) {
      const score = overlap(artText, node.label);
      if (score > 0) {
        edges.push({ source: art.id, target: node.id, weight: score });
      }
    }
  }
  return edges;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function KnowledgeGraphSummary() {
  const [open,     setOpen]    = useState(false);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState(null);

  // graph data
  const [articles,    setArticles]    = useState([]);
  const [graphNodes,  setGraphNodes]  = useState([]);
  const [edges,       setEdges]       = useState([]);
  const [simNodes,    setSimNodes]    = useState([]);

  // tooltip
  const [tooltip, setTooltip] = useState(null);

  // content drawer
  const [drawer,       setDrawer]       = useState(null);
  const [drawerLoad,   setDrawerLoad]   = useState(false);
  const [drawerErr,    setDrawerErr]    = useState(null);
  const [drawerContent,setDrawerContent]= useState(null);

  // ASSESS
  const [assess,    setAssess]    = useState("");
  const [assessing, setAssessing] = useState(false);

  // pan / zoom
  const [pan,  setPan]  = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging  = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // sim refs
  const rafRef    = useRef(null);
  const simRef    = useRef([]);
  const edgesRef  = useRef([]);
  const alphaRef  = useRef(1);

  // ── toggle ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onT = () => setOpen((v) => !v);
    window.addEventListener("jarvis:kgsum-toggle", onT);
    return () => window.removeEventListener("jarvis:kgsum-toggle", onT);
  }, []);

  // ── load data ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [arts, nodes] = await Promise.all([fetchArticles(), fetchCentrality()]);
      const edgeList = buildEdges(arts, nodes);
      const allNodes = [...arts, ...nodes.slice(0, 40)];
      const simN = buildSimNodes(allNodes, SVG_W, SVG_H);
      setArticles(arts);
      setGraphNodes(nodes);
      setEdges(edgeList);
      simRef.current   = simN;
      edgesRef.current = edgeList;
      alphaRef.current = 1;
      setSimNodes([...simN]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && simNodes.length === 0) loadData();
  }, [open, simNodes.length, loadData]);

  // ── simulation loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open || simRef.current.length === 0) return;
    let running = true;

    function frame() {
      if (!running) return;
      if (alphaRef.current > 0.005) {
        tickSim(simRef.current, edgesRef.current, alphaRef.current, SVG_W, SVG_H);
        alphaRef.current *= 0.97;
        setSimNodes([...simRef.current]);
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, simNodes.length]);

  // ── node click ────────────────────────────────────────────────────────────

  const onNodeClick = useCallback(async (nodeId) => {
    const node = simRef.current.find((n) => n.id === nodeId);
    if (!node || !node.isArticle) return;
    setDrawer(node);
    setDrawerContent(null);
    setDrawerErr(null);
    setDrawerLoad(true);
    try {
      const data = await fetchArticleContent(node.title);
      setDrawerContent(data);
    } catch (e) {
      setDrawerErr(e.message);
    } finally {
      setDrawerLoad(false);
    }
  }, []);

  // ── tooltip ───────────────────────────────────────────────────────────────

  const onNodeEnter = useCallback((e, node) => {
    const label = node.isArticle
      ? `[ARTICLE] ${node.title}${node.excerpt ? `\n${node.excerpt.slice(0, 120)}…` : ""}`
      : `[NODE] ${node.label} (${node.type}) centrality: ${node.centrality.toFixed(3)}`;
    setTooltip({ x: e.clientX, y: e.clientY, text: label });
  }, []);

  const onNodeLeave = useCallback(() => setTooltip(null), []);

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
    setZoom((z) => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  // ── ASSESS ────────────────────────────────────────────────────────────────

  const handleAssess = useCallback(async () => {
    if (!articles.length) return;
    setAssessing(true);
    setAssess("");
    const linked = new Set(edges.map((e) => e.source)).size;
    const prompt =
      `Knowledge graph summary: ${articles.length} articles, ${graphNodes.length} centrality nodes, ` +
      `${edges.length} cross-domain edges, ${linked} articles linked to graph nodes. ` +
      `Identify the most covered entities, the top knowledge gaps (articles with no graph anchor), ` +
      `and recommend which entities need more documentation. 2 sentences.`;
    try {
      const text = await postAssess(prompt);
      setAssess(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setAssess(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [articles.length, graphNodes.length, edges.length]);

  // ── stats ─────────────────────────────────────────────────────────────────

  const linkedArticles = new Set(edges.map((e) => e.source)).size;
  const floatingArticles = articles.length - linkedArticles;

  // ── render ────────────────────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: Z_INDEX,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "rgba(4,7,14,0.9)", border: `1px solid ${CY}44`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ KGSUM
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: "fixed", bottom: 60, left: Math.min(BTN_LEFT, window.innerWidth - 700),
        zIndex: Z_INDEX,
        width: 690, maxHeight: 680,
        background: SURF, border: `1px solid ${BORD}`,
        borderRadius: 12, display: "flex", flexDirection: "column",
        fontFamily: MONO, fontSize: 12, color: "#C0D0E0",
        boxShadow: `0 0 40px ${CY}18`, overflow: "hidden",
      }}>
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderBottom: `1px solid ${BORD}`, flexShrink: 0,
        }}>
          <span style={{ color: CY, letterSpacing: 2, fontSize: 11, fontWeight: 700 }}>
            ◈ KNOWLEDGE GRAPH SUMMARY
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={loadData}
              disabled={loading}
              style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                background: `${CY}18`, border: `1px solid ${CY}44`,
                color: CY, borderRadius: 4, padding: "2px 8px", cursor: "pointer",
              }}
            >↻ REFRESH</button>
            <button
              onClick={handleAssess}
              disabled={assessing || !articles.length}
              style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                background: `${PU}18`, border: `1px solid ${PU}44`,
                color: PU, borderRadius: 4, padding: "2px 8px", cursor: "pointer",
              }}
            >{assessing ? "…" : "▶ ASSESS"}</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 16 }}
            >×</button>
          </div>
        </div>

        {/* stat bar */}
        <div style={{
          display: "flex", gap: 16, padding: "6px 14px",
          borderBottom: `1px solid ${BORD}`, flexShrink: 0,
          fontSize: 10, letterSpacing: 1,
        }}>
          <span style={{ color: CY }}>{articles.length} ARTICLES</span>
          <span style={{ color: GRN }}>{graphNodes.length} NODES</span>
          <span style={{ color: AMB }}>{edges.length} EDGES</span>
          <span style={{ color: GRN }}>{linkedArticles} LINKED</span>
          <span style={{ color: GRAY }}>{floatingArticles} FLOATING</span>
          <span style={{ color: GRAY, marginLeft: "auto", fontSize: 9 }}>
            □ = article &nbsp;○ = graph node
          </span>
        </div>

        {/* graph canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", color: CY, fontSize: 11, letterSpacing: 2,
            }}>LOADING…</div>
          )}
          {error && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", color: "#FF4444", fontSize: 11, padding: 20, textAlign: "center",
            }}>{error}</div>
          )}
          {!loading && !error && simNodes.length > 0 && (
            <svg
              width={SVG_W}
              height={SVG_H}
              style={{ display: "block", cursor: dragging.current ? "grabbing" : "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            >
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* edges */}
                {edges.map((e, i) => {
                  const src = simNodes.find((n) => n.id === e.source);
                  const tgt = simNodes.find((n) => n.id === e.target);
                  if (!src || !tgt) return null;
                  return (
                    <line
                      key={i}
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={CY} strokeOpacity={0.12 + Math.min(0.2, e.weight * 0.05)}
                      strokeWidth={0.8}
                    />
                  );
                })}
                {/* nodes */}
                {simNodes.map((node) => (
                  <GraphNode
                    key={node.id}
                    node={node}
                    onClick={onNodeClick}
                    onEnter={onNodeEnter}
                    onLeave={onNodeLeave}
                  />
                ))}
                {/* labels for articles */}
                {simNodes.filter((n) => n.isArticle).map((node) => (
                  <text
                    key={`lbl-${node.id}`}
                    x={node.x}
                    y={node.y + node.r + 9}
                    textAnchor="middle"
                    fontSize={7}
                    fill={CY}
                    fillOpacity={0.55}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.title.slice(0, 18)}{node.title.length > 18 ? "…" : ""}
                  </text>
                ))}
              </g>
            </svg>
          )}
        </div>

        {/* ASSESS output */}
        {assess && (
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${BORD}`,
            fontSize: 10, color: PU, lineHeight: 1.6, flexShrink: 0,
          }}>
            {assess}
          </div>
        )}
      </div>

      {/* tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12, top: tooltip.y - 8,
          zIndex: Z_INDEX + 10,
          background: "rgba(4,7,20,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 6, padding: "6px 10px",
          fontSize: 10, color: "#C0D0E0", fontFamily: MONO,
          maxWidth: 300, whiteSpace: "pre-wrap", lineHeight: 1.5,
          pointerEvents: "none",
        }}>
          {tooltip.text}
        </div>
      )}

      {/* article content drawer */}
      {drawer && (
        <div style={{
          position: "fixed", right: 16, top: 60,
          zIndex: Z_INDEX + 5,
          width: 320, maxHeight: "80vh",
          background: SURF, border: `1px solid ${BORD}`,
          borderRadius: 10, display: "flex", flexDirection: "column",
          fontFamily: MONO, fontSize: 11, color: "#C0D0E0",
          boxShadow: `0 0 24px ${CY}18`, overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${BORD}`,
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 1 }}>
              □ ARTICLE
            </span>
            <button
              onClick={() => setDrawer(null)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 14 }}
            >×</button>
          </div>
          <div style={{ overflow: "auto", padding: "10px 12px", flex: 1 }}>
            <div style={{ color: CY, fontWeight: 700, marginBottom: 6 }}>{drawer.title}</div>
            {drawer.category && (
              <div style={{ color: AMB, fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
                {drawer.category.toUpperCase()}
              </div>
            )}
            {drawerLoad && <div style={{ color: GRAY }}>Loading…</div>}
            {drawerErr  && <div style={{ color: "#FF4444" }}>{drawerErr}</div>}
            {drawerContent && (
              <pre style={{
                margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                fontSize: 10, color: "#A0B8CC", lineHeight: 1.6,
              }}>
                {typeof drawerContent === "string"
                  ? drawerContent.slice(0, 2000)
                  : JSON.stringify(drawerContent, null, 2).slice(0, 2000)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* toggle button (when open) */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: Z_INDEX,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: `${CY}22`, border: `1px solid ${CY}66`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ KGSUM
      </button>
    </>
  );
}
