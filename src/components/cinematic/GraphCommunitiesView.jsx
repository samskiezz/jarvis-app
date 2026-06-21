/**
 * GraphCommunitiesView — F33 Graph Communities View.
 * Sources from /v1/graph/communities (label-propagation clustering).
 * Displays community clusters as colour-coded cards with member counts + previews.
 * "JARVIS, communities" / "show clusters" opens the panel + speaks a TTS brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const GLD = "#FFD700";
const ORG = "#FF8800";
const PRP = "#A855F7";
const RED = "#FF4D6D";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CLUSTER_COLORS = [CY, GRN, GLD, ORG, PRP, RED, "#00BFFF", "#FF69B4", "#7FFF00", "#DA70D6"];
const clusterColor = (id) => CLUSTER_COLORS[Number(id) % CLUSTER_COLORS.length] ?? CY;

const COMMUNITIES_RE =
  /\bcommunity|communities|cluster|partition|group.entit|grouped.by|entit.*cluster|network.group|graph.*communit|who.belongs\b/i;

async function fetchCommunities() {
  const r = await fetch(`${apiBase()}/v1/graph/communities`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return {
    raw: typeof d?.communities === "object" ? d.communities : {},
    nClusters: d?.n_clusters ?? 0,
    count: d?.count ?? 0,
  };
}

function groupByCluster(raw) {
  const map = {};
  for (const [entityId, clusterId] of Object.entries(raw)) {
    const key = String(clusterId);
    if (!map[key]) map[key] = [];
    map[key].push(entityId);
  }
  return Object.entries(map)
    .map(([id, members]) => ({ id: Number(id), members, size: members.length }))
    .sort((a, b) => b.size - a.size);
}

export function isCommunitiesQuery(text) {
  return COMMUNITIES_RE.test(text || "");
}

export async function buildCommunitiesScript() {
  let data = { raw: {}, nClusters: 0, count: 0 };
  try { data = await fetchCommunities(); } catch (_) {}

  if (!data.count) return "No community data available at this time, sir.";

  const clusters = groupByCluster(data.raw);
  const largestSize = clusters[0]?.size ?? 0;

  return (
    `Graph community analysis partitioned ${data.count} entities into ` +
    `${data.nClusters} distinct cluster${data.nClusters !== 1 ? "s" : ""}. ` +
    `The largest community contains ${largestSize} member${largestSize !== 1 ? "s" : ""}. ` +
    `Top clusters by size: ${clusters.slice(0, 3).map((c, i) => `cluster ${i + 1} with ${c.size} entities`).join(", ")}.`
  );
}

export default function GraphCommunitiesView() {
  const [open,    setOpen]    = useState(false);
  const [raw,     setRaw]     = useState({});
  const [nClusters, setNClusters] = useState(0);
  const [count,   setCount]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchCommunities();
      setRaw(d.raw);
      setNClusters(d.nClusters);
      setCount(d.count);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:communities-toggle", onToggle);
    return () => window.removeEventListener("jarvis:communities-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (COMMUNITIES_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const clusters = groupByCluster(raw);
  const maxSize  = clusters[0]?.size || 1;

  const visibleClusters = clusters.filter(c => {
    if (!search) return true;
    const lq = search.toLowerCase();
    return (
      String(c.id).includes(lq) ||
      c.members.some(m => m.toLowerCase().includes(lq))
    );
  });

  return (
    <>
      {/* Toggle button — bottom strip at left:2052 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Communities View — cluster map"
        style={{
          position: "fixed", left: 2052, bottom: 8, zIndex: 60,
          background: open ? GRN + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? GRN : GRN + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : GRN,
          cursor: "pointer",
          padding: "5px 10px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 18px ${GRN}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 12 }}>◍</span>
        CLUSTERS
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

      {/* Communities panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(700px,84vh)",
          background: "rgba(4,7,14,0.96)",
          border: `1px solid ${GRN}22`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${GRN}14`,
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
              background: GRN, boxShadow: `0 0 10px ${GRN}`,
              display: "inline-block",
              animation: loading ? "gcmpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: GRN, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH COMMUNITIES
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading
                ? "PARTITIONING…"
                : `${nClusters} CLUSTER${nClusters !== 1 ? "S" : ""} · ${count} ENTITIES · 90s`}
            </span>
            <button onClick={load} title="Refresh" style={{
              background: "none", border: `1px solid ${GRN}33`, borderRadius: 5,
              color: "#566878", cursor: "pointer", fontSize: 10, padding: "2px 6px",
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Summary bar */}
          {nClusters > 0 && (
            <div style={{
              display: "flex", gap: 4, padding: "6px 14px",
              borderBottom: `1px solid ${GRN}14`, flexWrap: "wrap",
            }}>
              {clusters.slice(0, Math.min(nClusters, 10)).map(c => (
                <div key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 3,
                  fontSize: 9, color: clusterColor(c.id),
                  background: clusterColor(c.id) + "18",
                  border: `1px solid ${clusterColor(c.id)}44`,
                  borderRadius: 5, padding: "2px 7px", letterSpacing: 1,
                  cursor: "pointer",
                }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: clusterColor(c.id), display: "inline-block",
                  }} />
                  C{c.id}
                  <span style={{ color: clusterColor(c.id) + "99" }}>{c.size}</span>
                </div>
              ))}
              {nClusters > 10 && (
                <span style={{ fontSize: 9, color: "#4A6070", padding: "2px 4px" }}>
                  +{nClusters - 10} more
                </span>
              )}
            </div>
          )}

          {/* Search */}
          <div style={{
            padding: "7px 14px", borderBottom: `1px solid ${GRN}14`,
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH ENTITY OR CLUSTER ID…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${GRN}33`, borderRadius: 6,
                color: "#DCEBF5", padding: "5px 10px",
                fontSize: 10, letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
          </div>

          {/* Cluster cards */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visibleClusters.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "PARTITIONING GRAPH…" : "NO CLUSTERS MATCH"}
              </div>
            )}

            {visibleClusters.map((c, i) => {
              const color   = clusterColor(c.id);
              const barPct  = Math.min(100, (c.size / maxSize) * 100);
              const isExp   = expanded === c.id;
              const preview = c.members.slice(0, isExp ? 50 : 5);

              return (
                <div
                  key={c.id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${GRN}0D`,
                    borderLeft: `3px solid ${color}`,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : c.id)}
                >
                  {/* Cluster header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: color + "22", border: `2px solid ${color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color, fontWeight: 900, flexShrink: 0,
                    }}>
                      {c.id}
                    </span>
                    <span style={{ color: "#DCF0FF", fontSize: 12, fontWeight: i === 0 ? 700 : 400 }}>
                      Cluster {c.id}
                    </span>
                    <span style={{
                      marginLeft: "auto", fontSize: 10, color, fontWeight: 700,
                    }}>
                      {c.size} member{c.size !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: 9, color: "#4A6070" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Size bar */}
                  <div style={{ height: 4, borderRadius: 2, background: color + "18", overflow: "hidden", marginBottom: 6 }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${barPct}%`,
                      background: color,
                      transition: "width 0.6s ease",
                      boxShadow: barPct > 70 ? `0 0 6px ${color}` : "none",
                    }} />
                  </div>

                  {/* Member preview */}
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 4,
                  }}>
                    {preview.map(m => (
                      <span key={m} style={{
                        fontSize: 9, color: color + "cc",
                        background: color + "11",
                        border: `1px solid ${color}22`,
                        borderRadius: 4, padding: "1px 6px",
                        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {m}
                      </span>
                    ))}
                    {!isExp && c.size > 5 && (
                      <span style={{
                        fontSize: 9, color: "#4A6070",
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 4, padding: "1px 6px",
                        border: "1px solid #4A607033",
                      }}>
                        +{c.size - 5} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${GRN}14`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>{visibleClusters.length} OF {nClusters} CLUSTERS SHOWN</span>
            <span style={{ marginLeft: "auto", color: GRN + "77" }}>
              {count} TOTAL ENTITIES
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gcmpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
