/**
 * GraphNetworkExplorer — F44
 * Browses the full knowledge-graph topology: fetches /v1/graph/subgraph for all
 * nodes/edges and /v1/graph/centrality for influence scores, then merges into a
 * searchable, type-filtered table. Clicking a node requests an AI description
 * from /v1/jarvis/agent/chat and speaks it via the jarvis:speak-dossier event.
 * Stats tiles: total nodes, edges, unique types.
 * "JARVIS, graph network" | "network map" | "node map" → opens panel + TTS brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const PURP = "#b18cff";
const GRN  = "#00E5A0";
const YLW  = "#FFD700";
const POLL = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const NETWORK_RE =
  /\b(graph.network|network.map|node.map|entity.graph|knowledge.graph|graph.browser|graph.explorer|all.nodes|graph.overview|graph.topology)\b/i;

export function isNetworkExplorerQuery(t) {
  return NETWORK_RE.test(t || "");
}

/* ── fetchers ──────────────────────────────────────────────────────────────── */
async function fetchSubgraph() {
  const r = await fetch(`${apiBase()}/v1/graph/subgraph`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`subgraph ${r.status}`);
  return r.json();
}

async function fetchCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return [];
  const d = await r.json();
  const items = Array.isArray(d) ? d
    : Array.isArray(d?.nodes)   ? d.nodes
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.results) ? d.results
    : [];
  return items;
}

/* ── TTS script ────────────────────────────────────────────────────────────── */
export async function buildNetworkExplorerScript() {
  try {
    const [sg, cent] = await Promise.all([fetchSubgraph(), fetchCentrality()]);
    const nodes = [
      ...(Array.isArray(sg?.nodes)    ? sg.nodes    : []),
      ...(Array.isArray(sg?.vertices) ? sg.vertices : []),
    ];
    const edges = [
      ...(Array.isArray(sg?.edges) ? sg.edges : []),
      ...(Array.isArray(sg?.links) ? sg.links : []),
    ];
    const types = [...new Set(nodes.map(n => n.type || n.entity_type || "unknown"))];
    const topNode = cent[0];
    const topLabel = topNode
      ? (topNode.label || topNode.name || topNode.id || "unknown")
      : (nodes[0]?.label || nodes[0]?.name || "unknown");
    return (
      `Knowledge graph network online, sir. ${nodes.length} nodes and ${edges.length} edges across ` +
      `${types.length} entity type${types.length !== 1 ? "s" : ""}. ` +
      `Most influential node: ${topLabel}. Standing by for drill-down.`
    );
  } catch (_) {
    return "Knowledge graph network online. Topology loaded and ready for exploration, sir.";
  }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
const TYPE_COLORS = {
  person:    "#FF8FA3",
  org:       "#FFD700",
  asset:     "#29E7FF",
  location:  "#00E5A0",
  group:     "#b18cff",
  risk:      "#FF4D6D",
  event:     "#FFA94D",
};

function typeColor(type = "") {
  const t = type.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_COLORS)) if (t.includes(k)) return v;
  return "#6E8AA0";
}

function NodeRow({ node, score, onClick, selected }) {
  const label = node.label || node.name || String(node.id) || "—";
  const type  = node.type  || node.entity_type || "node";
  const col   = typeColor(type);
  return (
    <div
      onClick={() => onClick(node)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px",
        background: selected ? `${CY}14` : `${col}07`,
        border: `1px solid ${selected ? CY : col + "33"}`,
        borderRadius: 5, marginBottom: 3, cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      <span style={{
        fontSize: 8, color: col, fontWeight: "bold",
        minWidth: 54, letterSpacing: 0.5, textTransform: "uppercase",
      }}>
        {type.slice(0, 8)}
      </span>
      <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {score != null && (
        <span style={{ fontSize: 8, color: YLW, minWidth: 36, textAlign: "right" }}>
          {typeof score === "number" ? score.toFixed(3) : score}
        </span>
      )}
    </div>
  );
}

export default function GraphNetworkExplorer() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [nodes, setNodes]         = useState([]);
  const [edges, setEdges]         = useState([]);
  const [centralityMap, setCMap]  = useState({});
  const [query, setQuery]         = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selected, setSelected]   = useState(null);
  const [dossier, setDossier]     = useState("");
  const [dossierLoading, setDossierLoading] = useState(false);
  const [error, setError]         = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [sg, cent] = await Promise.all([fetchSubgraph(), fetchCentrality()]);
      const allNodes = [
        ...(Array.isArray(sg?.nodes)    ? sg.nodes    : []),
        ...(Array.isArray(sg?.vertices) ? sg.vertices : []),
      ];
      const allEdges = [
        ...(Array.isArray(sg?.edges) ? sg.edges : []),
        ...(Array.isArray(sg?.links) ? sg.links : []),
      ];
      setNodes(allNodes);
      setEdges(allEdges);

      const cmap = {};
      cent.forEach(c => {
        const key = c.id || c.node_id || c.label || c.name;
        if (key != null) cmap[String(key)] = c.score ?? c.centrality ?? c.value ?? null;
      });
      setCMap(cmap);
    } catch (e) {
      setError("Graph data unavailable.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && nodes.length === 0) refresh();
  }, [open, nodes.length, refresh]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(refresh, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:network-toggle", onToggle);
    return () => window.removeEventListener("jarvis:network-toggle", onToggle);
  }, []);

  const types = ["ALL", ...new Set(nodes.map(n => (n.type || n.entity_type || "node").toLowerCase()))];

  const filtered = nodes.filter(n => {
    const label = (n.label || n.name || String(n.id) || "").toLowerCase();
    const type  = (n.type  || n.entity_type || "").toLowerCase();
    const matchQ = !query || label.includes(query.toLowerCase()) || type.includes(query.toLowerCase());
    const matchT = typeFilter === "ALL" || type === typeFilter;
    return matchQ && matchT;
  });

  async function drillDown(node) {
    setSelected(node);
    setDossier("");
    setDossierLoading(true);
    const label = node.label || node.name || String(node.id) || "unknown";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Describe this graph entity in one concise sentence: ${label} (type: ${node.type || node.entity_type || "unknown"})` }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setDossier(text);
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Entity description unavailable.");
    }
    setDossierLoading(false);
  }

  const typeCounts = {};
  nodes.forEach(n => {
    const t = (n.type || n.entity_type || "unknown").toLowerCase();
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Network Explorer — F44 (all nodes + centrality + AI drill-down)"
        style={{
          position: "fixed", bottom: 18, left: 3300, zIndex: 60,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ NETW
        {nodes.length > 0 && (
          <span style={{
            marginLeft: 5, fontSize: 8,
            background: `${PURP}33`, color: PURP,
            borderRadius: 3, padding: "1px 4px",
          }}>
            {nodes.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 54, left: 3300,
          width: "min(560px, 96vw)",
          maxHeight: "84vh",
          overflowY: "auto",
          background: "rgba(6,11,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 62,
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◈ GRAPH NETWORK
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: `${CY}88`, marginLeft: 4 }}>loading…</span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 8, color: "#6E8AA0" }}>
              {nodes.length > 0 ? `${nodes.length} nodes · ${edges.length} edges` : ""}
            </span>
            <button onClick={refresh} disabled={loading} style={{
              background: "transparent", border: `1px solid ${CY}33`, color: CY,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
              opacity: loading ? 0.5 : 1,
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: "#6E8AA0",
              fontSize: 12, cursor: "pointer", padding: "0 2px",
            }}>✕</button>
          </div>

          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Stats tiles */}
            {nodes.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { label: "NODES",  value: nodes.length,  color: CY },
                  { label: "EDGES",  value: edges.length,  color: GRN },
                  { label: "TYPES",  value: Object.keys(typeCounts).length, color: PURP },
                  { label: "FILTERED", value: filtered.length, color: YLW },
                ].map(t => (
                  <div key={t.label} style={{
                    flex: "1 1 80px",
                    padding: "7px 10px",
                    background: `${t.color}09`,
                    border: `1px solid ${t.color}33`,
                    borderRadius: 7, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 16, color: t.color, fontWeight: "bold" }}>{t.value}</div>
                    <div style={{ fontSize: 8, color: `${t.color}88`, letterSpacing: 1.5 }}>{t.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search nodes…"
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
                borderRadius: 6, padding: "6px 10px", color: "#DCEBF5",
                fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                outline: "none", width: "100%", boxSizing: "border-box",
              }}
            />

            {/* Type filter tabs */}
            {types.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {types.slice(0, 10).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    style={{
                      background: typeFilter === t ? `${typeColor(t)}22` : "transparent",
                      border: `1px solid ${typeFilter === t ? typeColor(t) : typeColor(t) + "44"}`,
                      color: typeFilter === t ? typeColor(t) : `${typeColor(t)}88`,
                      borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
                      letterSpacing: 1,
                    }}
                  >
                    {t.toUpperCase()}
                    {t !== "ALL" && typeCounts[t] != null && (
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>{typeCounts[t]}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Selected node dossier */}
            {selected && (
              <div style={{
                padding: "10px 12px",
                background: `${PURP}08`,
                border: `1px solid ${PURP}33`,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 9, color: `${PURP}88`, letterSpacing: 2, marginBottom: 5 }}>
                  SELECTED · {(selected.type || selected.entity_type || "NODE").toUpperCase()}
                </div>
                <div style={{ fontSize: 11, color: CY, fontWeight: "bold", marginBottom: 6 }}>
                  {selected.label || selected.name || String(selected.id)}
                </div>
                {dossierLoading ? (
                  <span style={{ fontSize: 9, color: `${PURP}88` }}>Requesting AI description…</span>
                ) : dossier ? (
                  <div style={{ fontSize: 10, color: "#DCEBF5", lineHeight: 1.6 }}>{dossier}</div>
                ) : null}
              </div>
            )}

            {/* Node list */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                NODES
                <span style={{ marginLeft: 8, color: `${CY}55` }}>
                  {filtered.length < nodes.length ? `${filtered.length} / ${nodes.length}` : nodes.length}
                  {centralityMap && Object.keys(centralityMap).length > 0 ? " · score = centrality" : ""}
                </span>
              </div>
              {error ? (
                <div style={{ color: "#FF4D6D", fontSize: 10, padding: "8px 0" }}>{error}</div>
              ) : loading && nodes.length === 0 ? (
                <div style={{ color: `${CY}66`, fontSize: 10, padding: "8px 0" }}>Loading graph…</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: `${CY}44`, fontSize: 10, padding: "8px 0" }}>No nodes match filter.</div>
              ) : (
                <div style={{ maxHeight: 340, overflowY: "auto" }}>
                  {filtered.slice(0, 80).map((n, i) => {
                    const key = String(n.id ?? n.label ?? n.name ?? i);
                    const score = centralityMap[key] ?? centralityMap[n.label] ?? centralityMap[n.name] ?? null;
                    return (
                      <NodeRow
                        key={key + i}
                        node={n}
                        score={score}
                        onClick={drillDown}
                        selected={selected?.id === n.id && selected?.label === n.label}
                      />
                    );
                  })}
                  {filtered.length > 80 && (
                    <div style={{ fontSize: 9, color: `${CY}55`, textAlign: "center", padding: "6px 0" }}>
                      …{filtered.length - 80} more — refine search to narrow
                    </div>
                  )}
                </div>
              )}
            </section>

          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px 10px",
            borderTop: `1px solid ${CY}11`,
            fontSize: 8, color: "#6E8AA0",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>auto-refresh every 60s · click node for AI dossier</span>
            <span style={{ color: GRN }}>◉ /v1/graph/subgraph + /v1/graph/centrality</span>
          </div>
        </div>
      )}
    </>
  );
}
