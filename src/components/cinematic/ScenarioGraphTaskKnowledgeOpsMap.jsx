/**
 * ScenarioGraphTaskKnowledgeOpsMap — F206
 * ◈ SGTMAP  (left:163160, bottom:8, zIndex:302)
 *
 * Fetches 5 real sources in parallel:
 *   /v1/scenario/list      → scenarios (the primary dimension)
 *   /v1/graph/centrality   → graph nodes
 *   /entities/Task         → tasks
 *   /knowledge/            → knowledge articles
 *   /v1/ops/alerts         → ops alerts
 *
 * Keyword-cross-references each scenario against all 4 other sources
 * to classify:
 *   ARMED    – matched items from 3–4 sources  (fully executable strategic scenario)
 *   GROUNDED – matched items from 2 sources
 *   PARTIAL  – matched item from 1 source
 *   UNARMED  – zero matches in any source (scenarios with no graph trace, no task, no knowledge, no alert — fully unexecutable)
 *
 * Red pulse on UNARMED count.
 * Expandable rows: matched graph nodes (centrality score badge) + matched tasks (status badge) +
 *   matched knowledge articles (category badge) + matched ops alerts (severity badge).
 * ▶ ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "scenario map"/"sgtmap"/"strategic execution"/"unarmed scenarios"/
 *   "scenario graph"/"scenario intelligence map"/"strategic map"
 * Additive only — mounted via App.jsx; query intent exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#4A5568";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SGTMAP_RE =
  /\b(scenario\.map|sgtmap|strategic\.execution|unarmed\.scenarios|scenario\.graph|scenario\.intelligence\.map|strategic\.map)\b/i;

export function isSgtmapQuery(t) { return SGTMAP_RE.test(t || ""); }

export function buildSgtmapScript(unarmedCount, totalCount) {
  if (unarmedCount === 0) {
    return `You are JARVIS. The Scenario Strategic Execution Map shows ${totalCount} scenarios — all scenarios have at least one graph trace, task, knowledge article, or ops alert match. Provide a one-sentence strategic execution status confirmation. Be direct and brief.`;
  }
  const pct = totalCount > 0 ? Math.round((unarmedCount / totalCount) * 100) : 0;
  return `You are JARVIS. The Scenario Strategic Execution Map shows ${unarmedCount} of ${totalCount} scenarios (${pct}%) are UNARMED — no graph trace, no assigned task, no knowledge article, and no ops alert. Provide a 2-sentence advisory: identify the strategic risk of these fully unexecutable scenarios, and recommend the single most impactful action to arm the most critical ones. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchScenarios() {
  const d = await safeFetch(`${apiBase()}/v1/scenario/list`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.scenarios) ? d.scenarios :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchGraph() {
  const d = await safeFetch(`${apiBase()}/v1/graph/centrality`);
  if (!d) return [];
  const arr = Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return arr.slice(0, 200);
}

async function fetchTasks() {
  const d = await safeFetch(`${apiBase()}/entities/Task`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.tasks) ? d.tasks :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchKnowledge() {
  const d = await safeFetch(`${apiBase()}/knowledge/`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.articles) ? d.articles :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchAlerts() {
  const d = await safeFetch(`${apiBase()}/v1/ops/alerts`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

function keywords(obj) {
  const text = [
    obj.label, obj.name, obj.id, obj.title, obj.type,
    obj.category, obj.description, obj.subject, obj.topic,
    obj.service, obj.source, obj.message, obj.scenario_type,
    obj.status, obj.entity_type,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 2);
}

function matches(scenKws, items) {
  return items.filter(item => {
    const itemKws = keywords(item);
    return scenKws.some(k => itemKws.includes(k)) ||
      itemKws.some(k => scenKws.includes(k));
  }).slice(0, 4);
}

function classify(sourceCount) {
  if (sourceCount >= 3) return "ARMED";
  if (sourceCount === 2) return "GROUNDED";
  if (sourceCount === 1) return "PARTIAL";
  return "UNARMED";
}

function statusColor(cls) {
  if (cls === "ARMED")    return GRN;
  if (cls === "GROUNDED") return CY;
  if (cls === "PARTIAL")  return AMB;
  return RED;
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { ...hdrs, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "onyx" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  } catch { /* silent */ }
}

export default function ScenarioGraphTaskKnowledgeOpsMap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [advisory, setAdvisory]   = useState("");
  const [expanded, setExpanded]   = useState({});
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scenarios, graph, tasks, knowledge, alerts] = await Promise.all([
        fetchScenarios(), fetchGraph(), fetchTasks(), fetchKnowledge(), fetchAlerts(),
      ]);

      const built = scenarios.map(sc => {
        const skws   = keywords(sc);
        const mGraph = matches(skws, graph);
        const mTask  = matches(skws, tasks);
        const mKnow  = matches(skws, knowledge);
        const mAlert = matches(skws, alerts);
        const sourceCount = [mGraph, mTask, mKnow, mAlert].filter(m => m.length > 0).length;
        return {
          sc,
          label: sc.title || sc.name || sc.id || "scenario",
          status: sc.status || sc.state || null,
          cls: classify(sourceCount),
          mGraph, mTask, mKnow, mAlert,
        };
      });

      built.sort((a, b) => {
        const order = { UNARMED: 0, PARTIAL: 1, GROUNDED: 2, ARMED: 3 };
        return (order[a.cls] ?? 99) - (order[b.cls] ?? 99);
      });

      setRows(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:sgtmap-toggle", handler);
    return () => window.removeEventListener("jarvis:sgtmap-toggle", handler);
  }, []);

  const unarmedCount = rows.filter(r => r.cls === "UNARMED").length;

  async function assess() {
    setAssessing(true);
    setAdvisory("");
    try {
      const script = buildSgtmapScript(unarmedCount, rows.length);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      const text = d.response || d.message || d.reply || d.content ||
        (typeof d === "string" ? d : JSON.stringify(d));
      setAdvisory(text);
      tts(text);
    } catch (e) {
      setAdvisory(`Advisory failed: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }

  function toggleRow(i) {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }));
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: 163160,
    zIndex: 302,
    padding: "3px 7px", fontSize: 10, fontFamily: "monospace",
    background: open ? CY : "#0a1628",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 3, cursor: "pointer", userSelect: "none",
    boxShadow: unarmedCount > 0 ? `0 0 6px ${RED}` : "none",
    transition: "box-shadow 0.4s",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)} title="Scenario Strategic Execution Map">
        ◈ SGTMAP {unarmedCount > 0 && (
          <span style={{ color: RED, fontWeight: 700 }}> [{unarmedCount}]</span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 32, left: 162880,
    width: 540, maxHeight: 480,
    background: "rgba(6,10,22,0.97)", border: `1px solid ${CY}`,
    borderRadius: 6, zIndex: 302, overflowY: "auto",
    fontFamily: "monospace", fontSize: 11, color: "#cbd5e0",
    boxShadow: `0 0 20px rgba(41,231,255,0.15)`,
  };

  const hdrStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderBottom: `1px solid ${DIM}`,
    position: "sticky", top: 0, background: "rgba(6,10,22,0.98)", zIndex: 1,
  };

  const clsCounts = { ARMED: 0, GROUNDED: 0, PARTIAL: 0, UNARMED: 0 };
  rows.forEach(r => { clsCounts[r.cls] = (clsCounts[r.cls] || 0) + 1; });

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)} title="Close">◈ SGTMAP ✕</button>
      <div style={panelStyle}>
        <div style={hdrStyle}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>SCENARIO STRATEGIC EXECUTION MAP</span>
          {loading && <span style={{ color: AMB, fontSize: 10 }}>loading…</span>}
          <span style={{ marginLeft: "auto", color: RED, fontWeight: 700 }}>
            UNARMED: {unarmedCount}
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${DIM}` }}>
          {[
            { label: "ARMED",    color: GRN, count: clsCounts.ARMED },
            { label: "GROUNDED", color: CY,  count: clsCounts.GROUNDED },
            { label: "PARTIAL",  color: AMB, count: clsCounts.PARTIAL },
            { label: "UNARMED",  color: RED, count: clsCounts.UNARMED },
          ].map(t => (
            <div key={t.label} style={{
              flex: 1, textAlign: "center", padding: "4px 2px",
              border: `1px solid ${t.color}33`, borderRadius: 3,
              background: `${t.color}0f`,
            }}>
              <div style={{ color: t.color, fontWeight: 700, fontSize: 14 }}>{t.count}</div>
              <div style={{ color: "#718096", fontSize: 9 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((r, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${DIM}22` }}>
            <div
              onClick={() => toggleRow(i)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                background: expanded[i] ? "rgba(41,231,255,0.04)" : "transparent",
              }}
            >
              <span style={{ color: statusColor(r.cls), fontWeight: 700, fontSize: 10, minWidth: 74 }}>
                {r.cls}
              </span>
              <span style={{ flex: 1, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
              {r.status && (
                <span style={{ color: "#718096", fontSize: 9 }}>
                  {String(r.status).toUpperCase()}
                </span>
              )}
              <span style={{ color: CY, fontSize: 9 }}>
                {expanded[i] ? "▲" : "▼"}
              </span>
            </div>

            {expanded[i] && (
              <div style={{ padding: "4px 10px 8px 20px", color: "#a0aec0", fontSize: 10 }}>
                {/* Graph nodes */}
                {r.mGraph.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>GRAPH:</span>{" "}
                    {r.mGraph.map((g, j) => {
                      const score = g.centrality_score ?? g.score ?? g.centrality ?? null;
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: `${GRN}22`, border: `1px solid ${GRN}44`,
                          color: GRN,
                        }}>
                          {g.label || g.name || g.id || "node"}
                          {score != null && (
                            <span style={{ color: "#718096", marginLeft: 3 }}>
                              {typeof score === "number" ? score.toFixed(2) : score}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: DIM, marginBottom: 3 }}>GRAPH: —</div>
                )}

                {/* Tasks */}
                {r.mTask.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>TASKS:</span>{" "}
                    {r.mTask.map((t, j) => {
                      const st = t.status || t.state || "";
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: `${CY}22`, border: `1px solid ${CY}44`,
                          color: CY,
                        }}>
                          {t.title || t.name || t.id || "task"}
                          {st && (
                            <span style={{ color: "#718096", marginLeft: 3 }}>
                              {st.toUpperCase()}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: DIM, marginBottom: 3 }}>TASKS: —</div>
                )}

                {/* Knowledge */}
                {r.mKnow.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>KNOWLEDGE:</span>{" "}
                    {r.mKnow.map((k, j) => {
                      const cat = k.category || k.type || k.topic || "";
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: `${AMB}22`, border: `1px solid ${AMB}44`,
                          color: AMB,
                        }}>
                          {k.title || k.name || k.subject || k.id || "article"}
                          {cat && (
                            <span style={{ color: "#718096", marginLeft: 3 }}>
                              {cat.toUpperCase()}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: DIM, marginBottom: 3 }}>KNOWLEDGE: —</div>
                )}

                {/* Ops alerts */}
                {r.mAlert.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>ALERTS:</span>{" "}
                    {r.mAlert.map((al, j) => {
                      const sev = al.severity || al.level || al.priority || "";
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: `${RED}22`, border: `1px solid ${RED}44`,
                          color: RED,
                        }}>
                          {al.title || al.name || al.message || al.id || "alert"}
                          {sev && (
                            <span style={{ color: "#718096", marginLeft: 3 }}>
                              {String(sev).toUpperCase()}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: DIM, marginBottom: 3 }}>ALERTS: —</div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* ASSESS footer */}
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${DIM}`, position: "sticky", bottom: 0, background: "rgba(6,10,22,0.98)" }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              padding: "4px 12px", fontSize: 10, fontFamily: "monospace",
              background: assessing ? DIM : `${CY}22`,
              color: assessing ? "#718096" : CY,
              border: `1px solid ${CY}`, borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
            }}
          >
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
          {advisory && (
            <div style={{ marginTop: 6, color: "#cbd5e0", fontSize: 10, lineHeight: 1.5 }}>
              {advisory}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
