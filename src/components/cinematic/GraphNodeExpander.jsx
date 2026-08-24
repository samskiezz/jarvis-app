/**
 * GraphNodeExpander — F34 (Backlog 2026-08-20)
 *
 * Real endpoints:
 *   GET /v1/graph/centrality          — top nodes to pick from
 *   GET /v1/graph/expand/{node_id}    — 1-hop neighbourhood of chosen node
 *   POST /v1/jarvis/agent/chat        — AI neighbourhood assessment
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 *
 * UX:
 *   Left column — top-20 nodes from centrality, sorted by score.
 *   Click a node → calls /v1/graph/expand/{id} → right panel shows neighbours.
 *   ASSESS → agent 2-sentence summary of what this node is connected to.
 *
 * Toggle:   ◈ GEXP  at left:880640 bottom:8 zIndex:581
 * Event:    jarvis:gexp-toggle
 * Voice:    "expand node" | "node neighbors" | "graph expand" | "gexp" |
 *           "node neighborhood" | "who is connected to"
 * Refresh:  centrality 120 s; expand on-demand.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const PRP = "#A855F7";
const GLD = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const HDR = { Authorization: `Bearer ${API_KEY}` };

const GEXP_RE =
  /\b(expand.node|node.expand|graph.expand|node.neighbor|node.neighbourhood|gexp|who.is.connected|connected.to|expand.graph)\b/i;

// ── helpers ─────────────────────────────────────────────────────────────────

function scoreOf(n) {
  return n?.score ?? n?.centrality_score ?? n?.value ?? n?.degree ?? 0;
}

function nameOf(n) {
  return n?.name || n?.label || n?.entity || n?.id || "?";
}

function typeColor(t = "") {
  if (/person|contact|human|user/i.test(t)) return CY;
  if (/org|company|corp|firm/i.test(t))     return GLD;
  if (/risk|threat|alert/i.test(t))         return RED;
  if (/asset|invest|fund/i.test(t))         return GRN;
  return PRP;
}

async function fetchCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, { headers: HDR });
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.ranking) ? d.ranking
    : Array.isArray(d?.nodes)   ? d.nodes
    : [];
  return arr.sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 20);
}

async function fetchExpand(nodeId) {
  const r = await fetch(
    `${apiBase()}/v1/graph/expand/${encodeURIComponent(nodeId)}`,
    { headers: HDR }
  );
  const d = await r.json();
  return {
    center: d.center ?? nodeId,
    nodes:  Array.isArray(d.nodes) ? d.nodes : [],
    edges:  Array.isArray(d.edges) ? d.edges : [],
  };
}

// ── exported intent helpers ──────────────────────────────────────────────────

export function isGexpQuery(text) {
  return GEXP_RE.test(text || "");
}

export async function buildGexpScript() {
  let nodes = [];
  let expand = null;
  try {
    nodes = await fetchCentrality();
    if (nodes.length > 0) {
      expand = await fetchExpand(nodes[0].id ?? nodes[0].entity ?? nameOf(nodes[0]));
    }
  } catch (_) {}

  if (!nodes.length) return "Graph node expansion unavailable — centrality data not loaded.";

  const top = nodes[0];
  const topName = nameOf(top);
  const nNeighbors = expand ? expand.nodes.length : 0;
  const nEdges     = expand ? expand.edges.length : 0;

  return (
    `Graph node expansion ready, sir. The most influential node is ${topName} ` +
    `with centrality score ${Number(scoreOf(top)).toFixed(4)}. ` +
    (nNeighbors > 0
      ? `Expanding it reveals ${nNeighbors} neighbour${nNeighbors !== 1 ? "s" : ""} ` +
        `across ${nEdges} edge${nEdges !== 1 ? "s" : ""}. Opening the expander panel now.`
      : "No neighbours found — the node may be isolated. Opening the expander panel now.")
  );
}

// ── component ────────────────────────────────────────────────────────────────

export default function GraphNodeExpander() {
  const [open,       setOpen]       = useState(false);
  const [nodes,      setNodes]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState(null); // { id, name, score, type }
  const [expanded,   setExpanded]   = useState(null); // { center, nodes, edges }
  const [expanding,  setExpanding]  = useState(false);
  const [assess,     setAssess]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const pollRef = useRef(null);

  const loadCentrality = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchCentrality();
      setNodes(arr);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(async (node) => {
    const id = node.id ?? node.entity ?? nameOf(node);
    setSelected(node);
    setExpanded(null);
    setAssess("");
    setExpanding(true);
    try {
      const result = await fetchExpand(id);
      setExpanded(result);
    } catch (_) {
    } finally {
      setExpanding(false);
    }
  }, []);

  const runAssess = useCallback(async () => {
    if (!expanded) return;
    setAssessing(true);
    setAssess("");
    try {
      const center = nameOf(selected);
      const neighbors = expanded.nodes.slice(0, 8).map(nameOf).join(", ");
      const prompt =
        `The graph node "${center}" is connected to: ${neighbors}. ` +
        `In two sentences, describe what this connectivity reveals about ${center}'s role and influence in the network.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...HDR, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        setAssess(text);
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch (_) {
    } finally {
      setAssessing(false);
    }
  }, [expanded, selected]);

  useEffect(() => {
    loadCentrality();
    pollRef.current = setInterval(loadCentrality, 120_000);
    return () => clearInterval(pollRef.current);
  }, [loadCentrality]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:gexp-toggle", handler);
    return () => window.removeEventListener("jarvis:gexp-toggle", handler);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (GEXP_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const maxScore = scoreOf(nodes[0] ?? {}) || 1;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Node Expander — /v1/graph/expand"
        style={{
          position: "fixed", left: 880640, bottom: 8, zIndex: 581,
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
        GEXP
        {expanded && (
          <span style={{
            background: PRP + "44", color: PRP,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {expanded.nodes.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", right: 18, top: 56, zIndex: 581,
          width: "min(860px,98vw)", height: "min(700px,90vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${PRP}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${PRP}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${PRP}22`,
            display: "flex", alignItems: "center", gap: 10,
            flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: PRP,
              boxShadow: `0 0 10px ${PRP}`,
              animation: loading ? "gxpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH NODE EXPANDER
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING CENTRALITY…" : `${nodes.length} NODES · /v1/graph/expand`}
            </span>
            <button onClick={loadCentrality} style={{
              background: "transparent", border: `1px solid ${PRP}33`,
              borderRadius: 6, color: "#566878", padding: "4px 7px",
              fontSize: 9, cursor: "pointer",
              fontFamily: "'JetBrains Mono',monospace",
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Body: two columns */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Left: node list */}
            <div style={{
              width: 240, borderRight: `1px solid ${PRP}18`,
              overflowY: "auto", flexShrink: 0,
            }}>
              <div style={{
                padding: "6px 12px", fontSize: 9, color: "#566878",
                letterSpacing: 1, borderBottom: `1px solid ${PRP}11`,
              }}>
                TOP NODES — CLICK TO EXPAND
              </div>

              {nodes.length === 0 && (
                <div style={{ padding: "18px 12px", color: "#4A6070", fontSize: 10 }}>
                  {loading ? "LOADING…" : "NO CENTRALITY DATA"}
                </div>
              )}

              {nodes.map((node, i) => {
                const id    = node.id ?? node.entity ?? nameOf(node);
                const name  = nameOf(node);
                const sc    = scoreOf(node);
                const t     = node.type || node.entity_type || node.kind || "";
                const col   = typeColor(t);
                const isActive = selected && (selected.id ?? selected.entity ?? nameOf(selected)) === id;
                const barW  = Math.round((sc / maxScore) * 100);

                return (
                  <div
                    key={id + i}
                    onClick={() => expandNode(node)}
                    style={{
                      padding: "7px 12px", cursor: "pointer",
                      borderBottom: `1px solid ${PRP}0F`,
                      borderLeft: `3px solid ${isActive ? col : "transparent"}`,
                      background: isActive ? `${col}0F` : "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 9, color: i < 3 ? PRP : "#4A6070",
                        fontWeight: i < 3 ? 900 : 400, minWidth: 18,
                      }}>
                        #{i + 1}
                      </span>
                      <span style={{
                        color: "#DCF0FF", fontSize: 11, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {name}
                      </span>
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6, marginTop: 3,
                    }}>
                      <div style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: `${col}18`, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", width: `${barW}%`,
                          background: col, borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ fontSize: 8, color: col + "cc", minWidth: 40, textAlign: "right" }}>
                        {Number(sc).toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: expansion result */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

              {!selected && (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#4A6070", fontSize: 11, letterSpacing: 1,
                }}>
                  ← SELECT A NODE TO EXPAND ITS 1-HOP NEIGHBOURHOOD
                </div>
              )}

              {selected && (
                <>
                  {/* Selected node header */}
                  <div style={{
                    padding: "12px 16px", borderBottom: `1px solid ${PRP}18`,
                    flexShrink: 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: `${typeColor(selected.type)}22`,
                        border: `2px solid ${typeColor(selected.type)}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: typeColor(selected.type), fontWeight: 900,
                        flexShrink: 0,
                      }}>
                        {nameOf(selected)[0]?.toUpperCase() || "?"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#DCF0FF", fontSize: 14, fontWeight: 700 }}>
                          {nameOf(selected)}
                        </div>
                        <div style={{ color: PRP, fontSize: 9, letterSpacing: 2, marginTop: 2 }}>
                          CENTRALITY {Number(scoreOf(selected)).toFixed(4)} ·{" "}
                          {(selected.type || selected.entity_type || "ENTITY").toUpperCase()}
                        </div>
                      </div>
                      {expanding && (
                        <span style={{ color: GLD, fontSize: 10, letterSpacing: 1 }}>EXPANDING…</span>
                      )}
                      {expanded && !expanding && (
                        <span style={{ color: GRN, fontSize: 10, letterSpacing: 1 }}>
                          {expanded.nodes.length} NEIGHBOURS · {expanded.edges.length} EDGES
                        </span>
                      )}
                    </div>

                    {/* ASSESS button */}
                    {expanded && !expanding && (
                      <button
                        onClick={runAssess}
                        disabled={assessing}
                        style={{
                          marginTop: 8,
                          background: assessing ? `${GLD}22` : `${GLD}11`,
                          border: `1px solid ${GLD}44`,
                          borderRadius: 6, color: GLD,
                          padding: "5px 12px", fontSize: 9,
                          cursor: assessing ? "default" : "pointer",
                          letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {assessing ? "ASSESSING…" : "▶ ASSESS — AI NEIGHBOURHOOD BRIEF"}
                      </button>
                    )}
                  </div>

                  {/* AI assessment */}
                  {assess && (
                    <div style={{
                      margin: "10px 16px 0",
                      background: `${GLD}0C`,
                      border: `1px solid ${GLD}33`,
                      borderRadius: 8, padding: "10px 14px",
                      fontSize: 11, color: "#DCF0FF", lineHeight: 1.6,
                    }}>
                      <div style={{ color: GLD, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                        JARVIS ASSESSMENT
                      </div>
                      {assess}
                    </div>
                  )}

                  {/* Neighbour cards */}
                  {expanded && !expanding && expanded.nodes.length === 0 && (
                    <div style={{
                      padding: "20px 16px", color: "#4A6070",
                      fontSize: 11, letterSpacing: 1,
                    }}>
                      NO NEIGHBOURS — THIS NODE MAY BE ISOLATED IN THE GRAPH
                    </div>
                  )}

                  {expanded && !expanding && expanded.nodes.length > 0 && (
                    <div style={{ padding: "10px 16px", flex: 1 }}>
                      <div style={{
                        fontSize: 9, color: "#566878",
                        letterSpacing: 1, marginBottom: 8,
                      }}>
                        1-HOP NEIGHBOURHOOD — {expanded.nodes.length} CONNECTED NODE{expanded.nodes.length !== 1 ? "S" : ""}
                      </div>

                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))",
                        gap: 8,
                      }}>
                        {expanded.nodes.map((n, i) => {
                          const nName = nameOf(n);
                          const nType = n.type || n.entity_type || n.kind || "entity";
                          const nCol  = typeColor(nType);
                          const edge  = expanded.edges.find(
                            e => e.source === n.id || e.target === n.id ||
                                 e.from === n.id   || e.to === n.id
                          );
                          const rel   = edge?.type || edge?.relation || edge?.label || "connected";

                          return (
                            <div key={n.id ?? i} style={{
                              background: `${nCol}0A`,
                              border: `1px solid ${nCol}33`,
                              borderRadius: 8, padding: "9px 12px",
                            }}>
                              <div style={{
                                display: "flex", alignItems: "center", gap: 6,
                              }}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: "50%",
                                  background: `${nCol}22`,
                                  border: `1px solid ${nCol}`,
                                  display: "flex", alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11, color: nCol, fontWeight: 700,
                                  flexShrink: 0,
                                }}>
                                  {nName[0]?.toUpperCase() || "?"}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    color: "#DCF0FF", fontSize: 11,
                                    overflow: "hidden", textOverflow: "ellipsis",
                                    whiteSpace: "nowrap", fontWeight: 600,
                                  }}>
                                    {nName}
                                  </div>
                                  <div style={{
                                    color: nCol, fontSize: 8, letterSpacing: 1, marginTop: 1,
                                  }}>
                                    {nType.toUpperCase()}
                                  </div>
                                </div>
                              </div>
                              <div style={{
                                marginTop: 5, fontSize: 8,
                                color: "#4A6070", letterSpacing: 1,
                              }}>
                                REL: <span style={{ color: nCol + "cc" }}>{rel.toUpperCase()}</span>
                              </div>
                              {n.score != null && (
                                <div style={{ marginTop: 2, fontSize: 8, color: "#4A6070" }}>
                                  SCORE: <span style={{ color: "#7A9AB0" }}>
                                    {Number(n.score).toFixed(4)}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 16px", borderTop: `1px solid ${PRP}18`,
            fontSize: 9, color: "#4A6070", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span>◈ /v1/graph/centrality · /v1/graph/expand/&#123;id&#125;</span>
            {selected && (
              <span style={{ marginLeft: "auto", color: PRP + "88" }}>
                CENTRE: {nameOf(selected)}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes gxpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
