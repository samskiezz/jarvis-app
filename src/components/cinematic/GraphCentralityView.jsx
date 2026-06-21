/**
 * GraphCentralityView — F26 Graph centrality view.
 * Sources from /v1/graph/centrality — top entities ranked by influence.
 * "JARVIS, centrality" / "who has most influence" opens the panel + TTS brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const PRP = "#A855F7";
const GLD = "#FFD700";
const GRN = "#00E5A0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CENTRALITY_RE = /\bcentralit|influence|most.connect|hub.entit|top.node|graph.rank|who.has.influence|who.is.central|key.player|most.influential\b/i;

async function fetchCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                  ? d
    : Array.isArray(d?.data)              ? d.data
    : Array.isArray(d?.nodes)             ? d.nodes
    : Array.isArray(d?.entities)          ? d.entities
    : Array.isArray(d?.results)           ? d.results
    : Array.isArray(d?.centrality)        ? d.centrality
    : [];
}

export function isCentralityQuery(text) {
  return CENTRALITY_RE.test(text || "");
}

export async function buildCentralityScript() {
  let nodes = [];
  try { nodes = await fetchCentrality(); } catch (_) {}

  if (!nodes.length) return "No centrality data available at this time, sir.";

  const sorted = [...nodes].sort((a, b) => {
    const sa = a.score ?? a.centrality_score ?? a.value ?? 0;
    const sb = b.score ?? b.centrality_score ?? b.value ?? 0;
    return sb - sa;
  });

  const top3 = sorted.slice(0, 3);
  const topNames = top3
    .map(n => n.name || n.label || n.entity || n.id || "Unknown")
    .join(", ");

  return (
    `Graph centrality analysis shows ${nodes.length} entity node${nodes.length !== 1 ? "s" : ""} ranked. ` +
    `Top ${Math.min(3, top3.length)} by influence: ${topNames}. ` +
    `The most connected node commands ${Math.round((sorted[0]?.score ?? sorted[0]?.centrality_score ?? sorted[0]?.value ?? 0) * 100) / 100} centrality units.`
  );
}

function scoreOf(node) {
  return node.score ?? node.centrality_score ?? node.value ?? node.degree ?? 0;
}

function typeColor(type = "") {
  if (/person|contact|human|user/i.test(type))   return CY;
  if (/org|company|corp|firm/i.test(type))        return GLD;
  if (/event|incident|case/i.test(type))          return "#FF4D6D";
  if (/asset|investment|fund/i.test(type))        return GRN;
  return PRP;
}

const METRIC_LABELS = {
  betweenness:  "BETWEEN",
  closeness:    "CLOSE",
  eigenvector:  "EIGEN",
  pagerank:     "PAGERANK",
  degree:       "DEGREE",
};

export default function GraphCentralityView() {
  const [open,    setOpen]    = useState(false);
  const [nodes,   setNodes]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchCentrality();
      setNodes(arr);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (CENTRALITY_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const sorted = [...nodes].sort((a, b) => scoreOf(b) - scoreOf(a));
  const maxScore = scoreOf(sorted[0] ?? {}) || 1;

  const uniqueTypes = [...new Set(nodes.map(n => (n.type || n.entity_type || n.kind || "other").toLowerCase()))];

  const visible = sorted.filter(n => {
    const name = (n.name || n.label || n.entity || n.id || "").toLowerCase();
    const type = (n.type || n.entity_type || n.kind || "other").toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchFilter = filter === "all" || type === filter;
    return matchSearch && matchFilter;
  });

  const topNode = sorted[0];

  return (
    <>
      {/* Toggle button — bottom-left strip at left:1428 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Centrality View"
        style={{
          position: "fixed", left: 1428, bottom: 18, zIndex: 68,
          background: open ? PRP + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? PRP : PRP + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : PRP,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${PRP}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        GRAPH
        {nodes.length > 0 && (
          <span style={{
            background: PRP + "44", color: PRP,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {nodes.length}
          </span>
        )}
      </button>

      {/* Centrality panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(540px,96vw)", maxHeight: "min(660px,82vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${PRP}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${PRP}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${PRP}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: PRP,
              boxShadow: `0 0 10px ${PRP}`,
              display: "inline-block",
              animation: loading ? "gcpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH CENTRALITY
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : `${nodes.length} NODES · REFRESH 60s`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Top node highlight */}
          {topNode && (
            <div style={{
              margin: "10px 14px 0",
              background: `${PRP}11`,
              border: `1px solid ${PRP}44`,
              borderRadius: 10, padding: "10px 14px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: `${typeColor(topNode.type)}22`,
                border: `2px solid ${typeColor(topNode.type)}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, color: typeColor(topNode.type), fontWeight: 900,
                flexShrink: 0,
              }}>
                {(topNode.name || topNode.label || "#1")[0]?.toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#DCF0FF", fontSize: 13, fontWeight: 700,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {topNode.name || topNode.label || topNode.entity || topNode.id}
                </div>
                <div style={{ color: PRP, fontSize: 9, letterSpacing: 2, marginTop: 2 }}>
                  MOST INFLUENTIAL · SCORE {Number(scoreOf(topNode)).toFixed(4)}
                </div>
              </div>
              <div style={{
                fontSize: 9, color: typeColor(topNode.type),
                background: typeColor(topNode.type) + "22",
                borderRadius: 5, padding: "2px 8px", letterSpacing: 1,
                flexShrink: 0,
              }}>
                {(topNode.type || topNode.entity_type || topNode.kind || "ENTITY").toUpperCase()}
              </div>
            </div>
          )}

          {/* Search + filter */}
          <div style={{
            padding: "8px 14px", display: "flex", gap: 8, alignItems: "center",
            borderBottom: `1px solid ${PRP}18`,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH NODES…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${PRP}33`, borderRadius: 6,
                color: "#DCEBF5", padding: "5px 10px",
                fontSize: 10, letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
            <button onClick={load} style={{
              background: "transparent", border: `1px solid ${PRP}33`,
              borderRadius: 6, color: "#566878", padding: "5px 8px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}>↺</button>
          </div>

          {/* Type filter tabs */}
          {uniqueTypes.length > 1 && (
            <div style={{
              display: "flex", gap: 4, padding: "6px 14px",
              borderBottom: `1px solid ${PRP}18`, flexWrap: "wrap",
            }}>
              {["all", ...uniqueTypes.slice(0, 6)].map(t => (
                <button key={t} onClick={() => setFilter(t)} style={{
                  background: filter === t ? `${PRP}22` : "transparent",
                  border: `1px solid ${filter === t ? PRP + "88" : PRP + "22"}`,
                  borderRadius: 6, color: filter === t ? PRP : "#4A6070",
                  padding: "3px 8px", fontSize: 9, cursor: "pointer",
                  letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
                }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Node list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING CENTRALITY DATA…" : "NO NODES MATCH FILTER"}
              </div>
            )}

            {visible.slice(0, 100).map((node, i) => {
              const score    = scoreOf(node);
              const barPct   = Math.min(100, (score / maxScore) * 100);
              const name     = node.name || node.label || node.entity || node.id || `Node #${i + 1}`;
              const type     = (node.type || node.entity_type || node.kind || "entity").toUpperCase();
              const color    = typeColor(node.type || "");
              const degree   = node.degree   ?? node.in_degree  ?? node.connections;
              const rank     = sorted.indexOf(node) + 1;

              const metrics = Object.entries(METRIC_LABELS)
                .filter(([k]) => node[k] != null)
                .map(([k, lbl]) => ({ lbl, val: Number(node[k]).toFixed(3) }));

              return (
                <div key={node.id || i} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${PRP}0F`,
                  borderLeft: `3px solid ${color}`,
                  display: "flex", flexDirection: "column", gap: 5,
                }}>
                  {/* Top row: rank + name + type badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 9, color: "#4A6070", minWidth: 24,
                      fontWeight: rank <= 3 ? 900 : 400,
                      ...(rank <= 3 ? { color: PRP } : {}),
                    }}>
                      #{rank}
                    </span>
                    <span style={{
                      color: "#DCF0FF", fontSize: 12, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontWeight: rank === 1 ? 700 : 400,
                    }}>
                      {name}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1, fontWeight: 700,
                      color, background: color + "22",
                      borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                    }}>
                      {type}
                    </span>
                  </div>

                  {/* Influence bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: `${color}18`, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        width: `${barPct}%`,
                        background: color,
                        transition: "width 0.6s ease",
                        boxShadow: barPct > 80 ? `0 0 8px ${color}` : "none",
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: color + "cc", minWidth: 54, textAlign: "right" }}>
                      {Number(score).toFixed(4)}
                    </span>
                  </div>

                  {/* Metadata row */}
                  <div style={{
                    display: "flex", gap: 12, flexWrap: "wrap",
                    fontSize: 9, color: "#4A6070",
                  }}>
                    {degree != null && (
                      <span>DEGREE: <span style={{ color: CY }}>{degree}</span></span>
                    )}
                    {metrics.map(m => (
                      <span key={m.lbl}>
                        {m.lbl}: <span style={{ color: "#7A9AB0" }}>{m.val}</span>
                      </span>
                    ))}
                    {node.community != null && (
                      <span>COMMUNITY: <span style={{ color: GLD }}>{node.community}</span></span>
                    )}
                    {node.description && (
                      <span style={{
                        color: "#566878", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", maxWidth: "100%",
                      }}>
                        {node.description}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${PRP}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>{visible.length} OF {nodes.length} NODES</span>
            {uniqueTypes.length > 0 && (
              <span style={{ marginLeft: "auto", color: PRP + "88" }}>
                {uniqueTypes.length} ENTITY TYPE{uniqueTypes.length !== 1 ? "S" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes gcpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
