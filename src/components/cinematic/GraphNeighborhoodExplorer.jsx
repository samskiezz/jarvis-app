/**
 * GraphNeighborhoodExplorer — F485
 * "JARVIS, graph neighborhood / show node neighbors / expand node / node subgraph / gneigh"
 * Fetches top-ranked nodes from /v1/graph/centrality, then expands a selected node's
 * 1-hop neighborhood via /v1/graph/subgraph. Additive only — mounted via App.jsx.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const ORG = "#FF8C42";
const PRP = "#A855F7";
const YLW = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const GNEIGH_RE =
  /\bgraph.neighborhood\b|\bnode.neighbor\b|\bexpand.node\b|\bnode.subgraph\b|\bgneigh\b|\bneighborhood.explorer\b|\bshow.neighbors\b|\bnode.expand\b|\bgraph.expand\b|\bneighbors.of\b/i;

export function isGraphNeighborhoodQuery(text) {
  return GNEIGH_RE.test(text || "");
}

export async function buildGraphNeighborhoodScript() {
  let centrality = null;
  try {
    const r = await fetch(`${apiBase()}/v1/graph/centrality`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) centrality = await r.json();
  } catch (_) {}

  if (!centrality) return "Unable to retrieve graph neighborhood data at this time, sir.";

  const ranking = centrality.ranking || [];
  if (!ranking.length) return "Graph is empty — no nodes to explore, sir.";

  const topNode = ranking[0];
  let subgraph = null;
  try {
    const r2 = await fetch(
      `${apiBase()}/v1/graph/subgraph?seeds=${encodeURIComponent(topNode.id)}&depth=1`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    if (r2.ok) subgraph = await r2.json();
  } catch (_) {}

  const nNeighbors = subgraph ? Math.max(0, (subgraph.n_nodes || 1) - 1) : 0;

  return [
    `Graph neighborhood explorer: ${centrality.count || ranking.length} nodes in the graph.`,
    `Top node: ${topNode.id} with centrality score ${(topNode.score || 0).toFixed(3)}.`,
    nNeighbors > 0
      ? `Expanding its neighborhood: ${nNeighbors} direct connection${nNeighbors !== 1 ? "s" : ""} found.`
      : "Neighborhood panel is open, sir.",
  ].join(" ");
}

export default function GraphNeighborhoodExplorer() {
  const [open,        setOpen]        = useState(false);
  const [ranking,     setRanking]     = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [subgraph,    setSubgraph]    = useState(null);
  const [loadingC,    setLoadingC]    = useState(false);
  const [loadingSub,  setLoadingSub]  = useState(false);
  const [lastTs,      setLastTs]      = useState(null);
  const [depth,       setDepth]       = useState(1);

  const loadCentrality = useCallback(async () => {
    setLoadingC(true);
    try {
      const r = await fetch(`${apiBase()}/v1/graph/centrality`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (r.ok) {
        const data = await r.json();
        const ranked = data.ranking || [];
        setRanking(ranked);
        setLastTs(Date.now());
        if (!selectedId && ranked.length > 0) setSelectedId(ranked[0].id);
      }
    } catch (_) {}
    finally { setLoadingC(false); }
  }, [selectedId]);

  const loadSubgraph = useCallback(async (nodeId, d) => {
    if (!nodeId) return;
    setLoadingSub(true);
    try {
      const r = await fetch(
        `${apiBase()}/v1/graph/subgraph?seeds=${encodeURIComponent(nodeId)}&depth=${d}`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      if (r.ok) {
        const data = await r.json();
        setSubgraph(data);
      }
    } catch (_) {}
    finally { setLoadingSub(false); }
  }, []);

  useEffect(() => {
    loadCentrality();
  }, [loadCentrality]);

  useEffect(() => {
    if (selectedId) loadSubgraph(selectedId, depth);
  }, [selectedId, depth, loadSubgraph]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (GNEIGH_RE.test(q)) { setOpen(true); loadCentrality(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [loadCentrality]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:gneigh-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gneigh-toggle", onToggle);
  }, []);

  const neighbors = subgraph
    ? (subgraph.nodes || []).filter(n => n.id !== selectedId)
    : [];
  const edges = subgraph?.edges || [];
  const nNodes = ranking.length;
  const ts = lastTs
    ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false })
    : null;

  const topFive = ranking.slice(0, 5);
  const isLoading = loadingC || loadingSub;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Neighborhood Explorer — F485"
        style={{
          position: "fixed", left: 14360, bottom: 8, zIndex: 75,
          background: open ? PRP + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? PRP : PRP + "44"}`,
          borderRadius: 8,
          color: open ? "#fff" : PRP,
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
        GNEIGH
        {nNodes > 0 && (
          <span style={{
            background: PRP + "33", color: PRP,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {nNodes}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 75,
          width: "min(620px,96vw)", maxHeight: "min(680px,84vh)",
          background: "rgba(4,6,14,0.97)",
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
              background: PRP, boxShadow: `0 0 10px ${PRP}`,
              display: "inline-block",
              animation: isLoading ? "gneighpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH NEIGHBORHOOD EXPLORER
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {isLoading ? "LOADING" : ts ? `UPDATED ${ts}` : "—"} · /v1/graph/subgraph
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats row */}
          {ranking.length > 0 && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px",
              borderBottom: `1px solid ${PRP}18`,
            }}>
              <StatTile label="GRAPH NODES"  value={nNodes}                      color={CY}  />
              <StatTile label="NEIGHBORS"    value={neighbors.length}             color={GRN} />
              <StatTile label="EDGES"        value={edges.length}                 color={ORG} />
              <StatTile label="DEPTH"        value={`${depth}HOP`}               color={PRP} />
            </div>
          )}

          {/* Node selector + depth control */}
          <div style={{
            padding: "8px 14px", borderBottom: `1px solid ${PRP}18`,
            display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{ color: "#566878", fontSize: 9, letterSpacing: 1 }}>SEED NODE:</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
              {topFive.map(n => (
                <button key={n.id} onClick={() => setSelectedId(n.id)} style={{
                  background: selectedId === n.id ? PRP + "33" : "transparent",
                  border: `1px solid ${selectedId === n.id ? PRP + "88" : PRP + "22"}`,
                  borderRadius: 5, color: selectedId === n.id ? PRP : "#566878",
                  padding: "3px 8px", fontSize: 9, cursor: "pointer",
                  letterSpacing: 0.5, fontFamily: "'JetBrains Mono',monospace",
                  fontWeight: selectedId === n.id ? 700 : 400,
                  maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  title: n.id,
                }}>
                  {n.id}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ color: "#566878", fontSize: 9 }}>DEPTH:</span>
              {[1, 2].map(d => (
                <button key={d} onClick={() => setDepth(d)} style={{
                  background: depth === d ? YLW + "22" : "transparent",
                  border: `1px solid ${depth === d ? YLW + "66" : YLW + "22"}`,
                  borderRadius: 4, color: depth === d ? YLW : "#566878",
                  padding: "3px 8px", fontSize: 9, cursor: "pointer",
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                }}>
                  {d}
                </button>
              ))}
              <button onClick={() => { loadCentrality(); if (selectedId) loadSubgraph(selectedId, depth); }} style={{
                background: "transparent", border: `1px solid ${PRP}33`,
                borderRadius: 4, color: "#566878", padding: "3px 8px",
                fontSize: 9, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
              }}>↺</button>
            </div>
          </div>

          {/* Content — two panes: left = neighbors list, right = edges */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {ranking.length === 0 && (
              <div style={{
                padding: "32px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loadingC ? "LOADING GRAPH DATA…" : "NO GRAPH DATA — CHECK CONNECTION"}
              </div>
            )}

            {ranking.length > 0 && (
              <div style={{ display: "flex", height: "100%" }}>
                {/* Neighbors */}
                <div style={{
                  flex: 1.4, borderRight: `1px solid ${PRP}18`,
                  padding: "8px 14px",
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5, marginBottom: 2 }}>
                    NEIGHBORS OF <span style={{ color: PRP }}>{selectedId || "—"}</span>
                    {loadingSub && <span style={{ color: YLW, marginLeft: 8 }}>EXPANDING…</span>}
                  </div>

                  {neighbors.length === 0 && !loadingSub && (
                    <div style={{ color: "#4A6070", fontSize: 10, padding: "8px 0" }}>
                      {selectedId ? "No neighbors found for this node." : "Select a node above."}
                    </div>
                  )}

                  {neighbors.map((n, i) => {
                    const score = typeof n.score === "number" ? n.score : null;
                    const col = i === 0 ? CY : i < 3 ? GRN : PRP;
                    const edgeCount = edges.filter(
                      e => e.source === n.id || e.target === n.id
                    ).length;
                    return (
                      <div
                        key={n.id}
                        onClick={() => setSelectedId(n.id)}
                        style={{
                          padding: "6px 8px",
                          borderLeft: `3px solid ${col}`,
                          background: col + "0A",
                          borderRadius: "0 5px 5px 0",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: "#DCF0FF", fontSize: 10, flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {n.id}
                          </span>
                          {edgeCount > 0 && (
                            <span style={{
                              fontSize: 8, color: col,
                              background: col + "22", borderRadius: 4,
                              padding: "1px 5px", flexShrink: 0,
                            }}>
                              {edgeCount}e
                            </span>
                          )}
                          {score !== null && (
                            <span style={{
                              fontSize: 8, color: "#566878", flexShrink: 0,
                            }}>
                              {score.toFixed(3)}
                            </span>
                          )}
                        </div>
                        {n.label && n.label !== n.id && (
                          <div style={{ fontSize: 8, color: "#4A6070", marginTop: 1 }}>
                            {n.label}
                          </div>
                        )}
                        {n.type && (
                          <div style={{ fontSize: 8, color: "#4A6070" }}>TYPE: {n.type}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Edges */}
                <div style={{
                  flex: 1, padding: "8px 14px",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5, marginBottom: 2 }}>
                    EDGES ({edges.length})
                  </div>
                  {edges.length === 0 && !loadingSub && (
                    <div style={{ color: "#4A6070", fontSize: 10 }}>No edges.</div>
                  )}
                  {edges.map((e, i) => {
                    const rel = e.relation || e.type || e.label || "—";
                    const w   = typeof e.weight === "number" ? e.weight.toFixed(2) : null;
                    return (
                      <div key={i} style={{
                        padding: "5px 6px",
                        borderBottom: `1px solid ${PRP}0F`,
                        fontSize: 9,
                      }}>
                        <div style={{
                          display: "flex", gap: 4, alignItems: "center",
                          color: "#9ABCCC",
                        }}>
                          <span style={{
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            maxWidth: 80, color: CY,
                          }}>
                            {e.source}
                          </span>
                          <span style={{ color: ORG, flexShrink: 0 }}>→</span>
                          <span style={{
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            maxWidth: 80,
                          }}>
                            {e.target}
                          </span>
                          {w && (
                            <span style={{ marginLeft: "auto", color: YLW, flexShrink: 0 }}>
                              {w}
                            </span>
                          )}
                        </div>
                        <div style={{ color: "#4A6070", fontSize: 8, marginTop: 1 }}>
                          {rel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${PRP}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>SOURCE: /v1/graph/centrality + /v1/graph/subgraph</span>
            <span style={{ marginLeft: "auto", color: PRP + "88" }}>
              {nNodes} NODES · {neighbors.length} NEIGHBORS · {edges.length} EDGES
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gneighpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: color + "11",
      border: `1px solid ${color}33`,
      borderRadius: 8, padding: "6px 10px",
      display: "flex", flexDirection: "column", gap: 2, minWidth: 60,
    }}>
      <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontSize: 15, color, fontWeight: 700, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}
