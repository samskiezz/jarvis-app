/**
 * SystemBrainKnowledgeHealthMonitor — F191
 * Fetches /v1/jarvis/system/status + /v1/cinematic/brain + /knowledge/ and
 * cross-references each system service against brain nodes and knowledge articles.
 * Classifies: HEALTHY (healthy + knowledge docs) / DEGRADED (degraded + docs) /
 * UNDOCUMENTED (degraded/offline, zero knowledge docs — recovery blind spot) /
 * OFFLINE (offline + some docs).
 * Red pulse on UNDOCUMENTED count.
 * ASSESS → /v1/jarvis/agent/chat generates a recovery advisory for undocumented
 * degraded services + TTS.
 * Voice triggers: "system health"/"health monitor"/"skhcm"/"undocumented service"/
 *   "degraded services"/"recovery gap"/"service knowledge"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF4D6D";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const PRP  = "#B485FF";
const POLL = 90_000; // 90s
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SKHCM_RE =
  /\b(system.health|health.monitor|skhcm|undocumented.service|degraded.service|recovery.gap|service.knowledge|recovery.blind|service.docs|health.continuity)\b/i;

export function isSkhcmQuery(t) { return SKHCM_RE.test(t || ""); }

const hdrs = { Authorization: `Bearer ${API_KEY}` };

/* ── fetchers ───────────────────────────────────────────────────────────────── */
async function fetchSystemStatus() {
  const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const services =
    Array.isArray(d?.services) ? d.services :
    Array.isArray(d?.components) ? d.components :
    typeof d === "object" && d !== null
      ? Object.entries(d).map(([k, v]) => ({
          name: k,
          status: typeof v === "string" ? v : (v?.status || v?.health || "unknown"),
        }))
      : [];
  return services.map(s => ({
    id: s.id || s.name || String(Math.random()),
    name: s.name || s.service || s.component || "Unknown Service",
    status: (s.status || s.health || s.state || "unknown").toString().toLowerCase(),
  }));
}

async function fetchBrainNodes() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const nodes =
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d) ? d : [];
  return nodes.map(n => ({
    id: n.id || String(Math.random()),
    label: (n.label || n.name || n.title || "").toString(),
    type: n.type || n.category || "",
    score: typeof n.centrality === "number" ? n.centrality
           : typeof n.score === "number" ? n.score : 0,
  }));
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.articles) ? d.articles : [];
  return items.map(a => ({
    id: a.id || a._id || String(Math.random()),
    title: (a.title || a.name || a.heading || "").toString(),
    category: a.category || a.type || a.tag || "",
    excerpt: (a.excerpt || a.summary || a.content || "").toString().slice(0, 120),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.filter(t => setB.has(t)).length;
}

function classifyStatus(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("ok") || s.includes("healthy") || s.includes("running") || s.includes("up") || s === "active") return "healthy";
  if (s.includes("offline") || s.includes("down") || s.includes("stopped") || s.includes("dead")) return "offline";
  if (s.includes("degraded") || s.includes("warn") || s.includes("slow") || s.includes("error")) return "degraded";
  return "healthy"; // default assume ok if ambiguous
}

function buildRows(services, brainNodes, knowledgeItems) {
  return services.map(svc => {
    const svcTokens = tokenize(svc.name);
    const matchedNodes = brainNodes
      .map(n => ({ ...n, hits: overlap(svcTokens, tokenize(n.label)) }))
      .filter(n => n.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);
    const matchedDocs = knowledgeItems
      .map(a => ({ ...a, hits: overlap(svcTokens, tokenize(a.title + " " + a.excerpt)) }))
      .filter(a => a.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3);

    const health = classifyStatus(svc.status);
    let cls;
    if (health === "healthy") {
      cls = matchedDocs.length > 0 ? "HEALTHY" : "HEALTHY";
    } else if (health === "degraded") {
      cls = matchedDocs.length > 0 ? "DEGRADED" : "UNDOCUMENTED";
    } else {
      cls = matchedDocs.length > 0 ? "OFFLINE" : "UNDOCUMENTED";
    }

    return { ...svc, health, classification: cls, matchedNodes, matchedDocs };
  });
}

async function fetchAssessment(undocumentedServices) {
  try {
    const names = undocumentedServices.map(s => s.name).join(", ");
    const msg = `You are JARVIS. In 2 concise sentences, advise how to prioritise recovery for these degraded/offline services that have no documented recovery procedures: ${names}. Be direct and actionable.`;
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: msg }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.answer || d.response || d.text || "").trim() || null;
  } catch (_) { return null; }
}

async function speakText(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text, voice: "ash" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (_) {}
}

export async function buildSkhcmScript() {
  try {
    const [services, brainNodes, knowledge] = await Promise.all([
      fetchSystemStatus(), fetchBrainNodes(), fetchKnowledge(),
    ]);
    if (!services.length) return "System status data is unavailable at this time, sir.";
    const rows = buildRows(services, brainNodes, knowledge);
    const undoc = rows.filter(r => r.classification === "UNDOCUMENTED");
    const degraded = rows.filter(r => r.health === "degraded" || r.health === "offline");
    return undoc.length > 0
      ? `Health continuity assessment complete, sir. ${degraded.length} service${degraded.length !== 1 ? "s" : ""} are degraded or offline. ${undoc.length} have no recovery documentation — immediate risk. Undocumented: ${undoc.slice(0, 3).map(s => s.name).join(", ")}. Recovery advisory is available in the SKHCM panel.`
      : `All ${services.length} system services have recovery documentation on file, sir. Health continuity is maintained.`;
  } catch (_) { return "Unable to retrieve system health data at this time, sir."; }
}

/* ── style helpers ────────────────────────────────────────────────────────── */
const CLS_COLOR = {
  HEALTHY:       GRN,
  DEGRADED:      AMB,
  UNDOCUMENTED:  RED,
  OFFLINE:       "#FF8C42",
};

/* ── component ───────────────────────────────────────────────────────────── */
export default function SystemBrainKnowledgeHealthMonitor() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [error, setError]       = useState(null);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter]     = useState("ALL");
  const timerRef                = useRef(null);

  const undocCount = rows.filter(r => r.classification === "UNDOCUMENTED").length;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [services, brainNodes, knowledge] = await Promise.all([
        fetchSystemStatus(), fetchBrainNodes(), fetchKnowledge(),
      ]);
      setRows(buildRows(services, brainNodes, knowledge));
    } catch (_) { setError("Failed to fetch health data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // toggle via event
  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:skhcm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skhcm-toggle", onToggle);
  }, []);

  // voice intent
  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SKHCM_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const handleAssess = async () => {
    const undoc = rows.filter(r => r.classification === "UNDOCUMENTED");
    if (!undoc.length) return;
    setAssessing(true); setAssessment(null);
    const text = await fetchAssessment(undoc);
    setAssessment(text);
    setAssessing(false);
    if (text) speakText(text);
  };

  const display = rows.filter(r => filter === "ALL" || r.classification === filter);

  const counts = {
    HEALTHY:       rows.filter(r => r.classification === "HEALTHY").length,
    DEGRADED:      rows.filter(r => r.classification === "DEGRADED").length,
    UNDOCUMENTED:  rows.filter(r => r.classification === "UNDOCUMENTED").length,
    OFFLINE:       rows.filter(r => r.classification === "OFFLINE").length,
  };

  return (
    <>
      {/* bottom-strip toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        title="System × Brain × Knowledge Health Monitor (F191)"
        style={{
          position: "fixed", bottom: 8, left: 154760, zIndex: 287,
          background: open ? CY : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : CY, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${CY}` : "none", whiteSpace: "nowrap",
        }}>
        ◈ SKHCM{undocCount > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
            animation: "skhcm-pulse 1.2s infinite",
          }}>{undocCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: 154640, zIndex: 288,
          width: 520, maxHeight: "74vh", overflow: "hidden",
          background: "rgba(8,12,22,0.94)", border: `1px solid ${CY}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${CY}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12,
                textShadow: `0 0 12px ${CY}` }}>◈ SKHCM</span>
              <span style={{ marginLeft: 8, color: "#6E8AA0", fontSize: 10 }}>
                SYSTEM × BRAIN × KNOWLEDGE
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && (
                <span style={{ color: AMB, fontSize: 10, animation: "skhcm-pulse 1s infinite" }}>
                  loading…
                </span>
              )}
              <button onClick={load} style={{
                background: "none", border: `1px solid ${CY}55`, borderRadius: 4,
                color: CY, fontSize: 10, cursor: "pointer", padding: "2px 6px",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "8px 14px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {Object.entries(counts).map(([cls, n]) => (
              <div key={cls} style={{
                flex: 1, textAlign: "center", padding: "5px 6px",
                background: `${CLS_COLOR[cls]}0F`, border: `1px solid ${CLS_COLOR[cls]}44`,
                borderRadius: 8, cursor: "pointer",
                outline: filter === cls ? `1px solid ${CLS_COLOR[cls]}` : "none",
              }} onClick={() => setFilter(f => f === cls ? "ALL" : cls)}>
                <div style={{ color: CLS_COLOR[cls], fontSize: 14, fontWeight: 700 }}>{n}</div>
                <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 0.5, marginTop: 1 }}>{cls}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {["ALL", "HEALTHY", "DEGRADED", "UNDOCUMENTED", "OFFLINE"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#2A3F54"}`,
                borderRadius: 4, color: filter === f ? CY : "#6E8AA0",
                fontSize: 9, cursor: "pointer", padding: "2px 7px", letterSpacing: 0.5,
              }}>{f}</button>
            ))}
          </div>

          {/* body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px 12px" }}>
            {error && <div style={{ color: RED, fontSize: 11, padding: 8 }}>{error}</div>}
            {!loading && !error && rows.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>
                No system data available.
              </div>
            )}

            {display.map(row => {
              const col = CLS_COLOR[row.classification] || CY;
              const exp = !!expanded[row.id];
              return (
                <div key={row.id} style={{
                  marginBottom: 8, background: `${col}09`,
                  border: `1px solid ${col}33`, borderRadius: 10,
                  overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
                    style={{
                      padding: "8px 12px", display: "flex", alignItems: "center",
                      gap: 8, cursor: "pointer",
                    }}>
                    <span style={{
                      fontSize: 9, color: col, border: `1px solid ${col}55`,
                      borderRadius: 4, padding: "1px 5px", letterSpacing: 0.5, flexShrink: 0,
                    }}>{row.classification}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, fontWeight: 600, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.name}
                    </span>
                    <span style={{
                      fontSize: 9, color: "#6E8AA0", border: "1px solid #2A3F54",
                      borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                    }}>{row.status}</span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{exp ? "▲" : "▼"}</span>
                  </div>

                  {exp && (
                    <div style={{
                      padding: "0 12px 10px", borderTop: `1px solid ${col}22`,
                    }}>
                      {/* brain nodes */}
                      {row.matchedNodes.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            BRAIN NODES ({row.matchedNodes.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {row.matchedNodes.map(n => (
                              <span key={n.id} style={{
                                fontSize: 9, padding: "2px 7px", borderRadius: 5,
                                border: `1px solid ${PRP}44`, color: PRP,
                                background: `${PRP}0A`,
                              }}>
                                {n.label} <b style={{ color: "#A0B4C8" }}>{n.score.toFixed ? n.score.toFixed(2) : n.score}</b>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* knowledge docs */}
                      {row.matchedDocs.length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            KNOWLEDGE ARTICLES ({row.matchedDocs.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {row.matchedDocs.map(a => (
                              <div key={a.id} style={{
                                fontSize: 9, padding: "4px 8px", borderRadius: 5,
                                border: `1px solid ${GRN}33`, color: "#A0C8B8",
                                background: `${GRN}09`,
                              }}>
                                <span style={{ color: GRN, fontWeight: 600 }}>{a.title}</span>
                                {a.category && (
                                  <span style={{
                                    marginLeft: 6, border: `1px solid ${GRN}44`,
                                    borderRadius: 3, padding: "0 4px", color: GRN,
                                  }}>{a.category}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          marginTop: 8, fontSize: 9, color: RED,
                          padding: "4px 8px", background: `${RED}0A`,
                          border: `1px solid ${RED}33`, borderRadius: 5,
                        }}>
                          ⚠ No recovery documentation found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess panel */}
          <div style={{
            padding: "10px 14px", borderTop: `1px solid ${CY}22`,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            {assessment && (
              <div style={{
                fontSize: 10, color: "#A8C8DC", lineHeight: 1.55,
                padding: "8px 10px", background: `${CY}09`,
                border: `1px solid ${CY}22`, borderRadius: 8,
              }}>{assessment}</div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleAssess}
                disabled={assessing || undocCount === 0}
                style={{
                  flex: 1, background: undocCount > 0 ? `${CY}15` : "#0C1420",
                  border: `1px solid ${undocCount > 0 ? CY : "#2A3F54"}55`,
                  borderRadius: 6, color: undocCount > 0 ? CY : "#2A3F54",
                  fontSize: 10, cursor: undocCount > 0 ? "pointer" : "default",
                  padding: "5px 0", letterSpacing: 1,
                }}>
                {assessing ? "ASSESSING…" : `▶ ASSESS RECOVERY (${undocCount} undocumented)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes skhcm-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      `}</style>
    </>
  );
}
