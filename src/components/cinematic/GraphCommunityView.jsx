/**
 * GraphCommunityView — F42 Graph community clusters.
 * Sources from /v1/graph/communities (cluster partition) + /v1/graph/centrality (member names/scores).
 * "JARVIS, graph communities" / "community clusters" / "gcom" opens the panel + TTS brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const GLD = "#FFD700";
const AMB = "#FFA040";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CLUSTER_COLORS = [CY, GRN, GLD, AMB, PRP, "#FF4D6D", "#00C2FF", "#7DFF6B", "#FFB347", "#C084FC"];

const GCOM_RE =
  /\bgraph.communit|communit.cluster|entity.cluster|cluster.detect|gcom\b|graph.partition|community.detect|which.cluster|cluster.member\b/i;

async function fetchCommunities() {
  const r = await fetch(`${apiBase()}/v1/graph/communities`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return d?.communities ?? d?.data ?? d ?? {};
}

async function fetchCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.nodes)     ? d.nodes
    : Array.isArray(d?.entities)  ? d.entities
    : Array.isArray(d?.centrality)? d.centrality
    : [];
}

function buildClusters(communities, nodes) {
  const nodeMap = {};
  for (const n of nodes) {
    const id = String(n.id ?? n.node_id ?? n.entity_id ?? "");
    if (id) nodeMap[id] = n;
  }
  const groups = {};
  for (const [nodeId, clusterId] of Object.entries(communities)) {
    const key = String(clusterId);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ nodeId, ...(nodeMap[nodeId] || {}) });
  }
  return Object.entries(groups)
    .map(([id, members]) => ({
      id,
      members,
      count: members.length,
      top: [...members].sort((a, b) => {
        const sa = a.score ?? a.centrality_score ?? a.value ?? 0;
        const sb = b.score ?? b.centrality_score ?? b.value ?? 0;
        return sb - sa;
      })[0] ?? null,
    }))
    .sort((a, b) => b.count - a.count);
}

export function isGcomQuery(text) {
  return GCOM_RE.test(text || "");
}

export async function buildGcomScript() {
  let communities = {}, nodes = [];
  try {
    [communities, nodes] = await Promise.all([fetchCommunities(), fetchCentrality()]);
  } catch (_) {}

  const clusters = buildClusters(communities, nodes);
  if (!clusters.length) return "No community cluster data available at this time, sir.";

  const nClusters = clusters.length;
  const largest = clusters[0];
  const largest_name = largest?.top
    ? (largest.top.name || largest.top.label || largest.top.entity || largest.top.nodeId || "Unknown")
    : "Unknown";
  const isolated = clusters.filter(c => c.count === 1).length;

  return (
    `Graph community analysis detected ${nClusters} distinct cluster${nClusters !== 1 ? "s" : ""} ` +
    `across ${Object.keys(communities).length} entity node${Object.keys(communities).length !== 1 ? "s" : ""}. ` +
    `Largest cluster contains ${largest.count} member${largest.count !== 1 ? "s" : ""}, ` +
    `led by ${largest_name}. ` +
    `${isolated} isolated singleton node${isolated !== 1 ? "s" : ""} detected.`
  );
}

export default function GraphCommunityView() {
  const [open,      setOpen]      = useState(false);
  const [clusters,  setClusters]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [com, nodes] = await Promise.all([fetchCommunities(), fetchCentrality()]);
      const cls = buildClusters(com, nodes);
      setClusters(cls);
      setTotal(Object.keys(com).length);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:gcom-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcom-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (GCOM_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const filtered = clusters.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.id.includes(s) ||
      c.members.some(m =>
        (m.name || m.label || m.entity || m.nodeId || "").toLowerCase().includes(s)
      )
    );
  });

  const nClusters = clusters.length;
  const largest = clusters[0]?.count ?? 0;
  const isolated = clusters.filter(c => c.count === 1).length;

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildGcomScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Community Clusters"
        style={{
          position: "fixed", left: 930680, bottom: 8, zIndex: 626,
          background: open ? GRN + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? GRN : GRN + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : GRN,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${GRN}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        GCOM
        {nClusters > 0 && (
          <span style={{
            background: GRN + "44", color: GRN,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {nClusters}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 626,
          width: "min(560px,96vw)", maxHeight: "min(680px,84vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${GRN}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${GRN}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${GRN}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: GRN,
              boxShadow: `0 0 10px ${GRN}`,
              display: "inline-block",
              animation: loading ? "gcpulse2 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: GRN, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH COMMUNITY CLUSTERS
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : `${total} NODES · REFRESH 120s`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "8px 14px",
            borderBottom: `1px solid ${GRN}18`, flexWrap: "wrap",
          }}>
            {[
              { label: "NODES",    value: total,     color: CY  },
              { label: "CLUSTERS", value: nClusters, color: GRN },
              { label: "LARGEST",  value: largest,   color: GLD },
              { label: "ISOLATED", value: isolated,  color: isolated > 0 ? AMB : "#4A6070" },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, minWidth: 80,
                background: `${t.color}0D`,
                border: `1px solid ${t.color}33`,
                borderRadius: 8, padding: "7px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: t.color,
                  textShadow: `0 0 10px ${t.color}66` }}>
                  {t.value}
                </div>
                <div style={{ fontSize: 8, letterSpacing: 2, color: "#4A6070", marginTop: 2 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Search + actions */}
          <div style={{
            padding: "8px 14px", display: "flex", gap: 8, alignItems: "center",
            borderBottom: `1px solid ${GRN}18`,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="FILTER CLUSTERS OR MEMBERS…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${GRN}33`, borderRadius: 6,
                color: "#DCEBF5", padding: "5px 10px",
                fontSize: 10, letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? `${GRN}22` : "transparent",
              border: `1px solid ${GRN}44`,
              borderRadius: 6, color: GRN, padding: "5px 10px",
              fontSize: 9, cursor: assessing ? "not-allowed" : "pointer",
              letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button onClick={load} style={{
              background: "transparent", border: `1px solid ${GRN}33`,
              borderRadius: 6, color: "#566878", padding: "5px 8px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}>↺</button>
          </div>

          {/* Cluster list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING COMMUNITY DATA…" : "NO CLUSTERS MATCH FILTER"}
              </div>
            )}

            {filtered.map((cluster, i) => {
              const clusterColor = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
              const topName = cluster.top
                ? (cluster.top.name || cluster.top.label || cluster.top.entity || cluster.top.nodeId || "Unknown")
                : "Unknown";
              const topScore = cluster.top
                ? (cluster.top.score ?? cluster.top.centrality_score ?? cluster.top.value ?? null)
                : null;
              const isExp = expanded === cluster.id;
              const barPct = largest > 0 ? Math.min(100, (cluster.count / largest) * 100) : 0;

              return (
                <div key={cluster.id} style={{
                  borderBottom: `1px solid ${GRN}0F`,
                  borderLeft: `3px solid ${clusterColor}`,
                }}>
                  {/* Cluster row */}
                  <div
                    onClick={() => setExpanded(isExp ? null : cluster.id)}
                    style={{
                      padding: "9px 14px", cursor: "pointer",
                      display: "flex", flexDirection: "column", gap: 5,
                      background: isExp ? `${clusterColor}08` : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 9, color: clusterColor + "88", minWidth: 28,
                        fontWeight: 700, letterSpacing: 1,
                      }}>
                        C{cluster.id}
                      </span>
                      <span style={{
                        flex: 1, color: "#DCF0FF", fontSize: 12, fontWeight: i < 3 ? 700 : 400,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {topName}
                      </span>
                      <span style={{
                        background: `${clusterColor}22`, color: clusterColor,
                        borderRadius: 5, padding: "2px 8px",
                        fontSize: 9, fontWeight: 900, letterSpacing: 1, flexShrink: 0,
                      }}>
                        {cluster.count} MEMBER{cluster.count !== 1 ? "S" : ""}
                      </span>
                      <span style={{
                        color: isExp ? clusterColor : "#4A6070", fontSize: 11, flexShrink: 0,
                      }}>
                        {isExp ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* Size bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        flex: 1, height: 4, borderRadius: 3,
                        background: `${clusterColor}18`, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${barPct}%`,
                          background: clusterColor,
                          transition: "width 0.6s ease",
                          boxShadow: barPct === 100 ? `0 0 8px ${clusterColor}` : "none",
                        }} />
                      </div>
                      {topScore != null && (
                        <span style={{ fontSize: 9, color: clusterColor + "aa", minWidth: 54, textAlign: "right" }}>
                          TOP: {Number(topScore).toFixed(4)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded members */}
                  {isExp && (
                    <div style={{
                      padding: "4px 14px 10px 24px",
                      borderTop: `1px solid ${clusterColor}18`,
                      display: "flex", flexDirection: "column", gap: 3,
                    }}>
                      <div style={{
                        fontSize: 8, color: clusterColor + "88", letterSpacing: 2,
                        marginBottom: 4, fontWeight: 700,
                      }}>
                        MEMBERS ({cluster.count})
                      </div>
                      {cluster.members.slice(0, 20).map((m, mi) => {
                        const name = m.name || m.label || m.entity || m.nodeId || `Node ${mi + 1}`;
                        const type = (m.type || m.entity_type || m.kind || "").toUpperCase();
                        const score = m.score ?? m.centrality_score ?? m.value;
                        return (
                          <div key={m.nodeId || mi} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "3px 6px",
                            background: mi === 0 ? `${clusterColor}0F` : "transparent",
                            borderRadius: 5,
                          }}>
                            {mi === 0 && (
                              <span style={{ fontSize: 8, color: clusterColor, fontWeight: 900 }}>★</span>
                            )}
                            <span style={{
                              flex: 1, fontSize: 10, color: mi === 0 ? "#DCF0FF" : "#7A9AB0",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {name}
                            </span>
                            {type && (
                              <span style={{
                                fontSize: 8, color: "#4A6070", letterSpacing: 1,
                                flexShrink: 0,
                              }}>
                                {type}
                              </span>
                            )}
                            {score != null && (
                              <span style={{
                                fontSize: 8, color: clusterColor + "88",
                                minWidth: 40, textAlign: "right", flexShrink: 0,
                              }}>
                                {Number(score).toFixed(3)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {cluster.count > 20 && (
                        <div style={{ fontSize: 9, color: "#4A6070", paddingLeft: 6, marginTop: 2 }}>
                          + {cluster.count - 20} more members
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${GRN}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>{filtered.length} OF {nClusters} CLUSTERS</span>
            <span style={{ marginLeft: "auto", color: GRN + "88" }}>
              {total} TOTAL NODES
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gcpulse2 {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
