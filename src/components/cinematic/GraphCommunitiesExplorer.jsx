/**
 * GraphCommunitiesExplorer — F46 Graph community partition explorer.
 *
 * Polls /v1/graph/communities every 90 s and renders each cluster as an
 * expandable card sorted by member count. Node membership lists are shown
 * inline; the ASSESS action asks /v1/jarvis/agent/chat for a 2-sentence
 * cluster brief and speaks it via jarvis:speak-dossier.
 *
 * Button: ⬢ COMMX (left:720 bottom:18, bottom strip)
 * Endpoint: /v1/graph/communities (+ /v1/jarvis/agent/chat for ASSESS)
 * Voice trigger: "communities" | "graph communities" | "clusters" |
 *                "graph clusters" | "commx" | "community explorer"
 * Event: jarvis:commx-toggle
 * Refresh: 90 s auto-poll.
 *
 * Additive only — mounted via App.jsx; wired via JarvisBrain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const AMB   = "#F59E0B";
const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const RED   = "#FF3B6B";
const PRP   = "#A855F7";
const DIM   = "#4A6070";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 720;
const POLL_MS    = 90_000;
const MAX_MEMBERS_INLINE = 40;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── data ────────────────────────────────────────────────────────────────────

async function fetchCommunities() {
  const r = await fetch(`${apiBase()}/v1/graph/communities`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`communities ${r.status}`);
  const d = await r.json();
  // Endpoint returns { communities: {node_id: cluster_id}, n_clusters, count }
  const raw = d?.communities || {};
  return {
    map: raw,
    nClusters: Number(d?.n_clusters ?? 0),
    nNodes:    Number(d?.count ?? Object.keys(raw).length),
  };
}

function groupByCluster(map) {
  const groups = new Map();
  for (const [nodeId, cluster] of Object.entries(map || {})) {
    const key = String(cluster);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(nodeId);
  }
  return [...groups.entries()]
    .map(([id, members]) => ({ id, members, size: members.length }))
    .sort((a, b) => b.size - a.size);
}

function clusterColor(idx) {
  const palette = [CY, AMB, GRN, PRP, RED, "#38BDF8", "#FDE047", "#F472B6"];
  return palette[idx % palette.length];
}

// ── voice intent (exported for JarvisBrain) ─────────────────────────────────

const VOICE_RE =
  /\b(commx|community\s*explorer|graph\s*communit(?:y|ies)|graph\s*clusters?|communit(?:y|ies)|clusters?)\b/i;

export function isCommxQuery(text) { return VOICE_RE.test(text || ""); }

export async function buildCommxScript() {
  let data;
  try { data = await fetchCommunities(); }
  catch { return "Graph community data is unavailable at this time, sir."; }
  if (!data.nNodes) return "No graph community partition has been computed yet.";
  const groups = groupByCluster(data.map);
  const largest = groups[0];
  const top3    = groups.slice(0, 3)
    .map((g, i) => `cluster ${g.id} (${g.size})`)
    .join(", ");
  return (
    `Graph partition shows ${data.nClusters} communit${data.nClusters === 1 ? "y" : "ies"} ` +
    `spanning ${data.nNodes} nodes. The largest is cluster ${largest.id} with ${largest.size} members. ` +
    `Top clusters by size: ${top3}.`
  );
}

// ── panel ───────────────────────────────────────────────────────────────────

export default function GraphCommunitiesExplorer() {
  const [open,     setOpen]     = useState(false);
  const [map,      setMap]      = useState(null);
  const [meta,     setMeta]     = useState({ nClusters: 0, nNodes: 0 });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [search,   setSearch]   = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchCommunities();
      setMap(d.map);
      setMeta({ nClusters: d.nClusters, nNodes: d.nNodes });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // External open trigger from JarvisBrain / voice.
  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:commx-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:commx-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const groups = useMemo(() => (map ? groupByCluster(map) : []), [map]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({
        ...g,
        members: g.members.filter(id => id.toLowerCase().includes(q)),
      }))
      .filter(g => g.members.length > 0 || g.id.toLowerCase().includes(q));
  }, [groups, search]);

  const toggleGroup = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runAssess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildCommxScript();
      // Ask the agent for a compact 2-sentence brief. If it fails, fall back to script.
      let brief = script;
      try {
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            message:
              "In 2 short sentences, assess this graph community partition and any concentration or fragmentation risk it implies. " +
              `Data: ${script}`,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const t = d?.reply || d?.message || d?.text || d?.output || "";
          if (t && String(t).trim()) brief = String(t).trim();
        }
      } catch { /* keep fallback */ }
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: brief, source: "commx" },
      }));
    } finally {
      setAssessing(false);
    }
  };

  const largest    = groups[0];
  const singletons = groups.filter(g => g.size === 1).length;
  const median     = groups.length
    ? groups[Math.floor(groups.length / 2)].size
    : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Communities Explorer"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: open ? AMB + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? AMB : AMB + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : AMB,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: MONO, fontWeight: 700,
          boxShadow: `0 0 20px ${AMB}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬢</span>
        COMMX
        {meta.nClusters > 0 && (
          <span style={{
            background: AMB + "44", color: AMB,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {meta.nClusters}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(680px,82vh)",
          background: BG,
          border: `1px solid ${AMB}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMB}18`,
          fontFamily: MONO,
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${AMB}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: AMB, boxShadow: `0 0 10px ${AMB}`,
              display: "inline-block",
              animation: loading ? "commxPulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: AMB, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH COMMUNITIES
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontSize: 9 }}>
              {loading ? "SYNCING" : `${meta.nClusters} CLUSTERS · ${meta.nNodes} NODES · 90s`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: MUTED,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6, padding: "10px 14px 4px",
          }}>
            {[
              { label: "CLUSTERS",  value: meta.nClusters, color: AMB },
              { label: "NODES",     value: meta.nNodes,    color: CY },
              { label: "LARGEST",   value: largest?.size ?? 0, color: GRN },
              { label: "SINGLETON", value: singletons,     color: RED },
            ].map(t => (
              <div key={t.label} style={{
                background: `${t.color}0f`,
                border: `1px solid ${t.color}33`,
                borderRadius: 8, padding: "6px 8px",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                <span style={{ color: t.color, fontSize: 9, letterSpacing: 1 }}>{t.label}</span>
                <span style={{ color: "#DCF0FF", fontSize: 15, fontWeight: 700 }}>
                  {t.value}
                </span>
              </div>
            ))}
          </div>

          {/* Search + assess */}
          <div style={{
            padding: "8px 14px 6px", display: "flex", gap: 8, alignItems: "center",
            borderBottom: `1px solid ${AMB}18`,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="FILTER CLUSTER OR NODE ID…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${AMB}33`, borderRadius: 6,
                color: "#DCEBF5", padding: "5px 10px",
                fontSize: 10, letterSpacing: 1,
                fontFamily: MONO, outline: "none",
              }}
            />
            <button onClick={load} style={{
              background: "transparent", border: `1px solid ${AMB}33`,
              borderRadius: 6, color: MUTED, padding: "5px 8px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1, fontFamily: MONO,
            }} title="Refresh">↺</button>
            <button
              onClick={runAssess}
              disabled={assessing || !meta.nNodes}
              style={{
                background: assessing ? `${AMB}33` : "transparent",
                border: `1px solid ${AMB}66`,
                borderRadius: 6, color: AMB, padding: "5px 10px",
                fontSize: 9, cursor: assessing || !meta.nNodes ? "not-allowed" : "pointer",
                letterSpacing: 1, fontFamily: MONO,
                opacity: !meta.nNodes ? 0.4 : 1,
              }}
              title="Ask JARVIS to assess this partition"
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Cluster list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{
                padding: "20px 18px", color: RED, fontSize: 10,
                letterSpacing: 1, textAlign: "center",
              }}>
                {error.toUpperCase()}
              </div>
            )}

            {!error && filtered.length === 0 && (
              <div style={{
                padding: "28px 18px", color: DIM,
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING PARTITION…" : "NO CLUSTERS MATCH FILTER"}
              </div>
            )}

            {filtered.map((g, i) => {
              const color = clusterColor(i);
              const isOpen = expanded.has(g.id);
              const showMembers = g.members.slice(0, MAX_MEMBERS_INLINE);
              const overflow = Math.max(0, g.members.length - showMembers.length);
              const share = meta.nNodes ? Math.round((g.size / meta.nNodes) * 100) : 0;
              return (
                <div key={g.id} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${AMB}0F`,
                  borderLeft: `3px solid ${color}`,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  <div
                    onClick={() => toggleGroup(g.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: "pointer", userSelect: "none",
                    }}
                  >
                    <span style={{
                      fontSize: 9, color: color, minWidth: 18,
                      fontWeight: 900,
                    }}>
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <span style={{
                      color: "#DCF0FF", fontSize: 12, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontWeight: i === 0 ? 700 : 500,
                    }}>
                      CLUSTER {g.id}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1, fontWeight: 700,
                      color, background: color + "22",
                      borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                    }}>
                      {g.size} NODE{g.size === 1 ? "" : "S"}
                    </span>
                  </div>

                  {/* Size bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: `${color}18`, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        width: `${Math.max(2, share)}%`,
                        background: color,
                        boxShadow: share > 40 ? `0 0 8px ${color}` : "none",
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: color + "cc", minWidth: 34, textAlign: "right" }}>
                      {share}%
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{
                      background: "rgba(0,0,0,0.35)",
                      border: `1px solid ${color}22`,
                      borderRadius: 6, padding: "6px 8px",
                      display: "flex", flexWrap: "wrap", gap: 4,
                    }}>
                      {showMembers.map(id => (
                        <span key={id} style={{
                          background: `${color}18`,
                          border: `1px solid ${color}33`,
                          color: "#DCEBF5",
                          fontSize: 9, letterSpacing: 0.5,
                          borderRadius: 4, padding: "2px 6px",
                          whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis",
                          maxWidth: 220,
                        }}>
                          {id}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span style={{
                          color: MUTED, fontSize: 9, letterSpacing: 1,
                          alignSelf: "center", padding: "0 4px",
                        }}>
                          +{overflow} MORE
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${AMB}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: DIM,
          }}>
            <span>MEDIAN SIZE: <span style={{ color: CY }}>{median}</span></span>
            <span style={{ marginLeft: "auto", color: AMB + "88" }}>
              /v1/graph/communities
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes commxPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
