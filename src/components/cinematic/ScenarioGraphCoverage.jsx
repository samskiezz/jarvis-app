/**
 * ScenarioGraphCoverage — F80 (SGCV)
 *
 * Parallel-fetches /v1/scenario/list + /v1/graph/centrality every 90 s.
 * Keyword-correlates each scenario against top-centrality graph nodes.
 * Classification: ENTITY_BACKED (≥1 node match) vs DARK (0 node matches).
 * Amber badge on dark count.
 *
 * Voice intents: "scenario graph / graph scenario / sgcv / dark scenarios /
 *                entity backed scenarios / which scenarios have graph nodes /
 *                scenario entity coverage / graph scenario coverage"
 * Strip button: ◈ SGCV  left:2280 bottom:18 zIndex:68
 * Custom event: jarvis:sgcv-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const PRP  = "#B485FF";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const SGCV_RE =
  /\b(scenario.graph|graph.scenario|sgcv|dark.scenario|entity.backed.scenario|which.scenario.*graph|scenario.entity.cover|graph.scenario.cover|entity.scenario|scenario.node|node.scenario)\b/i;

export function isSgcvQuery(t) { return SGCV_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(scenario, node) {
  const a = tokenize([
    scenario.name, scenario.description, scenario.objective,
    scenario.type, (scenario.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    node.id, node.label, node.type, node.description || "",
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [sr, cr] = await Promise.all([
    fetch(`${base}/v1/scenario/list`,     { headers: hdrs }),
    fetch(`${base}/v1/graph/centrality`,  { headers: hdrs }),
  ]);
  const sd = sr.ok ? await sr.json() : {};
  const cd = cr.ok ? await cr.json() : {};

  const scenarios = (Array.isArray(sd) ? sd : sd?.data || sd?.items || sd?.results || sd?.scenarios || []).map(s => ({
    id:          s.id || s._id || String(Math.random()),
    name:        s.name || s.title || "Unnamed Scenario",
    description: s.description || s.summary || "",
    objective:   s.objective || s.goal || "",
    type:        s.type || s.scenario_type || "",
    status:      s.status || s.state || "",
    tags:        s.tags || [],
  }));

  const rawNodes = Array.isArray(cd) ? cd : cd?.data || cd?.nodes || cd?.results || cd?.centrality || [];
  const nodes = rawNodes.map(n => ({
    id:          n.id || n._id || n.node_id || String(Math.random()),
    label:       n.label || n.name || n.id || "Unknown Node",
    type:        n.type || n.node_type || "",
    description: n.description || "",
    score:       typeof n.score === "number" ? n.score
               : typeof n.centrality_score === "number" ? n.centrality_score
               : typeof n.pagerank === "number" ? n.pagerank : 0,
  })).sort((a, b) => b.score - a.score).slice(0, 200);

  return { scenarios, nodes };
}

export async function buildSgcvScript() {
  try {
    const base = apiBase();
    const { scenarios, nodes } = await fetchAll();
    const threshold = 0.04;
    const backed = scenarios.filter(s => nodes.some(n => relevance(s, n) >= threshold));
    const dark   = scenarios.filter(s => !nodes.some(n => relevance(s, n) >= threshold));
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message: `Scenario × Graph Centrality Coverage (SGCV): ${scenarios.length} scenarios, ` +
          `${nodes.length} top graph nodes, ${backed.length} entity-backed, ` +
          `${dark.length} dark (no graph entity match). Dark scenarios: ` +
          `${dark.slice(0, 3).map(s => s.name).join("; ") || "none"}. ` +
          "Assess entity coverage gaps in exactly 2 sentences.",
      }),
    });
    const d = r.ok ? await r.json() : null;
    return d?.response || d?.reply || d?.content || d?.text ||
      `SGCV: ${backed.length}/${scenarios.length} scenarios entity-backed, ${dark.length} dark.`;
  } catch {
    return "SGCV: unable to fetch assessment.";
  }
}

const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 2280,
  width: 440,
  height: 520,
  background: "rgba(7,18,28,0.97)",
  border: "1px solid #29E7FF44",
  borderRadius: 10,
  boxShadow: "0 0 28px #29E7FF22",
  display: "flex",
  flexDirection: "column",
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  color: "#DCEBF5",
  backdropFilter: "blur(14px)",
};

const BTN = {
  position: "fixed",
  left: 2280,
  bottom: 18,
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  fontSize: 8,
  letterSpacing: 1,
  padding: "3px 7px",
  borderRadius: 4,
  border: "1px solid #29E7FF66",
  background: "rgba(7,18,28,0.88)",
  color: "#29E7FF",
  cursor: "pointer",
};

export default function ScenarioGraphCoverage() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScen]    = useState([]);
  const [nodes, setNodes]       = useState([]);
  const [correlated, setCorr]   = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessed, setAssessed] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const threshold = 0.04;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { scenarios: s, nodes: n } = await fetchAll();
      setScen(s);
      setNodes(n);
      const corr = s.map(sc => {
        const matches = n
          .map(node => ({ ...node, matchScore: relevance(sc, node) }))
          .filter(node => node.matchScore >= threshold)
          .sort((a, b) => b.matchScore - a.matchScore);
        return {
          ...sc,
          matched: matches,
          coverage: matches.length > 0 ? "ENTITY_BACKED" : "DARK",
        };
      });
      setCorr(corr);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); timer.current = setInterval(load, POLL); }
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:sgcv-toggle", h);
    return () => window.removeEventListener("jarvis:sgcv-toggle", h);
  }, []);

  useEffect(() => {
    const h = e => { if (isSgcvQuery(e.detail?.text)) { setOpen(true); load(); } };
    window.addEventListener("jarvis:ask", h);
    return () => window.removeEventListener("jarvis:ask", h);
  }, [load]);

  const backed = correlated.filter(s => s.coverage === "ENTITY_BACKED").length;
  const dark   = correlated.filter(s => s.coverage === "DARK").length;

  const visible = correlated.filter(s => {
    const mf = filter === "ALL" || s.coverage === filter;
    const ms = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  const assess = async () => {
    setAssessing(true);
    const script = await buildSgcvScript();
    setAssessed(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  return (
    <>
      <button
        style={{ ...BTN, ...(dark > 0 ? { borderColor: AMB, color: AMB } : {}) }}
        onClick={() => setOpen(v => !v)}
        title="Scenario × Graph Centrality Coverage (SGCV)"
      >
        ◈ SGCV
        {dark > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#111",
            borderRadius: 8, fontSize: 7, padding: "0 4px",
            animation: "sgcvPulse 1.5s infinite",
          }}>{dark}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: CY, letterSpacing: 2, fontWeight: 700 }}>
              SCENARIO × GRAPH CENTRALITY
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              fontSize: 12, cursor: "pointer",
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "SCENARIOS", val: correlated.length, col: CY },
              { label: "NODES",     val: nodes.length,      col: PRP },
              { label: "BACKED",    val: backed,            col: GRN },
              { label: "DARK",      val: dark,              col: AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}0D`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 7, color: "#566878", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            flexWrap: "wrap",
          }}>
            {["ALL", "ENTITY_BACKED", "DARK"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 3, letterSpacing: 1,
                border: `1px solid ${filter === f ? CY : "#2A3D4F"}`,
                background: filter === f ? `${CY}22` : "transparent",
                color: filter === f ? CY : "#566878", cursor: "pointer", fontFamily: "inherit",
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", fontSize: 8, background: "#0B1D2A",
                border: `1px solid ${CY}33`, borderRadius: 3, color: CY,
                padding: "2px 7px", fontFamily: "inherit", outline: "none", width: 100,
              }}
            />
          </div>

          {/* Scenario rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && !correlated.length && (
              <div style={{ color: AMB, fontSize: 9, textAlign: "center", padding: 20 }}>
                ◌ loading…
              </div>
            )}
            {visible.map(sc => {
              const isExp = expanded === sc.id;
              const col = sc.coverage === "ENTITY_BACKED" ? GRN : AMB;
              return (
                <div key={sc.id} style={{ borderBottom: `1px solid ${CY}11`, padding: "7px 0" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : sc.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  >
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                      animation: sc.coverage === "DARK" ? "sgcvPulse 2s infinite" : "none",
                    }}>{sc.coverage === "ENTITY_BACKED" ? "BACKED" : "DARK"}</span>
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{sc.name}</span>
                    {sc.type && (
                      <span style={{
                        fontSize: 7, color: PRP, border: "1px solid #B485FF44",
                        borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                      }}>{sc.type.toUpperCase()}</span>
                    )}
                    {sc.status && (
                      <span style={{
                        fontSize: 7, color: CY, border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                      }}>{sc.status.toUpperCase()}</span>
                    )}
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {sc.description && (
                        <div style={{ color: "#8BAABB", fontSize: 8, marginBottom: 6, lineHeight: 1.5 }}>
                          {sc.description.slice(0, 160)}{sc.description.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {sc.matched.length === 0 ? (
                        <div style={{ color: AMB, fontSize: 8 }}>No matching graph entities — scenario is dark.</div>
                      ) : (
                        sc.matched.slice(0, 5).map(n => (
                          <div key={n.id} style={{
                            background: `${GRN}08`, border: `1px solid ${GRN}22`,
                            borderRadius: 5, padding: "5px 8px", marginBottom: 5,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              {n.type && (
                                <span style={{
                                  fontSize: 7, color: PRP,
                                  border: "1px solid #B485FF44",
                                  borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                                }}>{n.type.toUpperCase()}</span>
                              )}
                              <span style={{
                                flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{n.label}</span>
                              <span style={{ color: CY, fontSize: 8, flexShrink: 0 }}>
                                c:{n.score.toFixed ? n.score.toFixed(3) : n.score}
                              </span>
                              <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                                {(n.matchScore * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                              <div style={{
                                height: 3, borderRadius: 2,
                                width: `${Math.min(100, n.matchScore * 100)}%`,
                                background: GRN, boxShadow: `0 0 6px ${GRN}`,
                              }} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /v1/scenario/list + /v1/graph/centrality
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${correlated.length} scenarios · ${nodes.length} nodes`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes sgcvPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
