/**
 * GraphKnowledgeOpsTaskContactPulse — F203
 * ◈ GKOATC  (left:161480, bottom:8, zIndex:299)
 *
 * Fetches 5 real sources in parallel:
 *   /v1/graph/centrality   → graph nodes (the primary dimension)
 *   /knowledge/            → knowledge articles
 *   /v1/ops/alerts         → ops alerts
 *   /entities/Task         → tasks
 *   /entities/Contact      → contacts
 *
 * Keyword-cross-references each graph node against all 4 other sources
 * to classify:
 *   ACTIVE  – matched items from 3-4 sources  (red pulse on DEAD count)
 *   ANCHORED – matched items from 2 sources
 *   PARTIAL  – matched item from 1 source
 *   DEAD     – zero matches in any source (blind-spot nodes — full intelligence dead zones)
 *
 * Expandable rows: matched knowledge articles (category badge) +
 *   ops alerts (severity badge) + tasks (status badge) + contacts (role/org).
 * ▶ ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "graph intelligence pulse"/"gkoatc"/"intelligence pulse"/
 *   "dead nodes"/"graph contact task"/"node pulse"/"gkoatc toggle"
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

const GKOATC_RE =
  /\b(graph\.intelligence\.pulse|gkoatc|intelligence\.pulse|dead\.nodes|graph\.contact\.task|node\.pulse|gkoatc\.toggle)\b/i;

export function isGkoatcQuery(t) { return GKOATC_RE.test(t || ""); }

export function buildGkoatcScript(deadCount, totalCount) {
  if (deadCount === 0) {
    return `You are JARVIS. The Graph Intelligence Pulse shows ${totalCount} nodes — all nodes have at least one knowledge, alert, task, or contact match. Provide a one-sentence operational status confirmation. Be direct and brief.`;
  }
  const pct = totalCount > 0 ? Math.round((deadCount / totalCount) * 100) : 0;
  return `You are JARVIS. The Graph Intelligence Pulse shows ${deadCount} of ${totalCount} graph nodes (${pct}%) are DEAD — zero knowledge articles, ops alerts, tasks, or contact owners. Provide a 2-sentence advisory: identify what this dead-node concentration means operationally, and recommend the single most impactful action to reduce intelligence blind spots. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchGraph() {
  const d = await safeFetch(`${apiBase()}/v1/graph/centrality`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
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

async function fetchOpsAlerts() {
  const d = await safeFetch(`${apiBase()}/v1/ops/alerts`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchTasks() {
  const d = await safeFetch(`${apiBase()}/entities/Task`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.tasks) ? d.tasks :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchContacts() {
  const d = await safeFetch(`${apiBase()}/entities/Contact`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

function nodeLabel(node) {
  return (node.label || node.name || node.id || node.entity || "").toLowerCase();
}

function keywords(obj) {
  const text = [
    obj.label, obj.name, obj.id, obj.entity, obj.title, obj.type,
    obj.category, obj.description, obj.subject, obj.topic
  ].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 2);
}

function matches(nodeKws, items, labelFn) {
  return items.filter(item => {
    const itemKws = keywords(item);
    return nodeKws.some(k => itemKws.includes(k)) ||
      itemKws.some(k => nodeKws.includes(k));
  }).slice(0, 4);
}

function classify(matchedSources) {
  const count = matchedSources;
  if (count >= 3) return "ACTIVE";
  if (count === 2) return "ANCHORED";
  if (count === 1) return "PARTIAL";
  return "DEAD";
}

function statusColor(cls) {
  if (cls === "ACTIVE")   return GRN;
  if (cls === "ANCHORED") return CY;
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

export default function GraphKnowledgeOpsTaskContactPulse() {
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
      const [graph, knowledge, opsAlerts, tasks, contacts] = await Promise.all([
        fetchGraph(), fetchKnowledge(), fetchOpsAlerts(), fetchTasks(), fetchContacts(),
      ]);

      const built = graph.map(node => {
        const nkws = keywords(node);
        const mKnow = matches(nkws, knowledge, n => n);
        const mOps  = matches(nkws, opsAlerts, n => n);
        const mTask = matches(nkws, tasks, n => n);
        const mCont = matches(nkws, contacts, n => n);
        const sourceCount = [mKnow, mOps, mTask, mCont].filter(m => m.length > 0).length;
        return {
          node,
          label: node.label || node.name || node.id || "node",
          score: node.centrality_score ?? node.score ?? node.centrality ?? 0,
          cls: classify(sourceCount),
          mKnow, mOps, mTask, mCont,
        };
      });

      built.sort((a, b) => {
        const order = { DEAD: 0, PARTIAL: 1, ANCHORED: 2, ACTIVE: 3 };
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
    window.addEventListener("jarvis:gkoatc-toggle", handler);
    return () => window.removeEventListener("jarvis:gkoatc-toggle", handler);
  }, []);

  const deadCount   = rows.filter(r => r.cls === "DEAD").length;
  const activeCount = rows.filter(r => r.cls === "ACTIVE").length;

  async function assess() {
    setAssessing(true);
    setAdvisory("");
    try {
      const script = buildGkoatcScript(deadCount, rows.length);
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
    position: "fixed", bottom: 8, left: 161480,
    zIndex: 299,
    padding: "3px 7px", fontSize: 10, fontFamily: "monospace",
    background: open ? CY : "#0a1628",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 3, cursor: "pointer", userSelect: "none",
    boxShadow: deadCount > 0 ? `0 0 6px ${RED}` : "none",
    transition: "box-shadow 0.4s",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)} title="Graph Intelligence Pulse">
        ◈ GKOATC {deadCount > 0 && (
          <span style={{ color: RED, fontWeight: 700 }}> [{deadCount}]</span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 32, left: 161200,
    width: 540, maxHeight: 480,
    background: "rgba(6,10,22,0.97)", border: `1px solid ${CY}`,
    borderRadius: 6, zIndex: 299, overflowY: "auto",
    fontFamily: "monospace", fontSize: 11, color: "#cbd5e0",
    boxShadow: `0 0 20px rgba(41,231,255,0.15)`,
  };

  const hdrStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderBottom: `1px solid ${DIM}`,
    position: "sticky", top: 0, background: "rgba(6,10,22,0.98)", zIndex: 1,
  };

  const clsCounts = { ACTIVE: 0, ANCHORED: 0, PARTIAL: 0, DEAD: 0 };
  rows.forEach(r => { clsCounts[r.cls] = (clsCounts[r.cls] || 0) + 1; });

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)} title="Close">◈ GKOATC ✕</button>
      <div style={panelStyle}>
        <div style={hdrStyle}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>GRAPH INTELLIGENCE PULSE</span>
          {loading && <span style={{ color: AMB, fontSize: 10 }}>loading…</span>}
          <span style={{ marginLeft: "auto", color: RED, fontWeight: 700 }}>
            DEAD: {deadCount}
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${DIM}` }}>
          {[
            { label: "ACTIVE",   color: GRN, count: clsCounts.ACTIVE },
            { label: "ANCHORED", color: CY,  count: clsCounts.ANCHORED },
            { label: "PARTIAL",  color: AMB, count: clsCounts.PARTIAL },
            { label: "DEAD",     color: RED, count: clsCounts.DEAD },
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
              <span style={{ color: statusColor(r.cls), fontWeight: 700, fontSize: 10, minWidth: 58 }}>
                {r.cls}
              </span>
              <span style={{ flex: 1, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
              <span style={{ color: "#718096", fontSize: 9 }}>
                c:{typeof r.score === "number" ? r.score.toFixed(3) : "—"}
              </span>
              <span style={{ color: CY, fontSize: 9 }}>
                {expanded[i] ? "▲" : "▼"}
              </span>
            </div>

            {expanded[i] && (
              <div style={{ padding: "4px 10px 8px 20px", color: "#a0aec0", fontSize: 10 }}>
                {/* Knowledge */}
                {r.mKnow.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>KNOWLEDGE:</span>{" "}
                    {r.mKnow.map((k, j) => (
                      <span key={j} style={{
                        display: "inline-block", margin: "1px 2px",
                        padding: "1px 5px", borderRadius: 2,
                        background: "#1a2a4a", border: `1px solid ${CY}44`,
                        color: "#90cdf4", fontSize: 9,
                      }}>
                        {k.title || k.name || k.id}{k.category ? ` · ${k.category}` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>KNOWLEDGE: —</div>
                )}

                {/* Ops Alerts */}
                {r.mOps.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>OPS ALERTS:</span>{" "}
                    {r.mOps.map((a, j) => {
                      const sev = (a.severity || a.level || a.priority || "").toUpperCase();
                      const sevColor = sev === "CRITICAL" || sev === "HIGH" ? RED : sev === "MEDIUM" ? AMB : CY;
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#2a1a1a", border: `1px solid ${sevColor}44`,
                          color: sevColor, fontSize: 9,
                        }}>
                          {a.title || a.name || a.id}{sev ? ` · ${sev}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>OPS ALERTS: —</div>
                )}

                {/* Tasks */}
                {r.mTask.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>TASKS:</span>{" "}
                    {r.mTask.map((t, j) => {
                      const st = (t.status || t.state || "").toUpperCase();
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a1a2a", border: `1px solid ${AMB}44`,
                          color: "#fbb040", fontSize: 9,
                        }}>
                          {t.title || t.name || t.id}{st ? ` · ${st}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>TASKS: —</div>
                )}

                {/* Contacts */}
                {r.mCont.length > 0 ? (
                  <div>
                    <span style={{ color: GRN }}>CONTACTS:</span>{" "}
                    {r.mCont.map((c, j) => (
                      <span key={j} style={{
                        display: "inline-block", margin: "1px 2px",
                        padding: "1px 5px", borderRadius: 2,
                        background: "#0a2a1a", border: `1px solid ${GRN}44`,
                        color: "#68d391", fontSize: 9,
                      }}>
                        {c.name || c.full_name || c.id}
                        {c.role ? ` · ${c.role}` : ""}
                        {c.org || c.organisation || c.organization ? ` / ${c.org || c.organisation || c.organization}` : ""}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568" }}>CONTACTS: —</div>
                )}
              </div>
            )}
          </div>
        ))}

        {rows.length === 0 && !loading && (
          <div style={{ padding: "16px 10px", color: "#4a5568", textAlign: "center" }}>
            No graph centrality data returned.
          </div>
        )}

        {/* Assess */}
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${DIM}`, position: "sticky", bottom: 0, background: "rgba(6,10,22,0.98)" }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              width: "100%", padding: "5px 0", fontSize: 11,
              background: assessing ? "#1a2a4a" : `${CY}1a`,
              color: CY, border: `1px solid ${CY}`,
              borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: "monospace",
            }}
          >
            {assessing ? "▶ ASSESSING…" : `▶ ASSESS (${deadCount} DEAD of ${rows.length} nodes)`}
          </button>
          {advisory && (
            <div style={{
              marginTop: 6, padding: "6px 8px",
              background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}33`,
              borderRadius: 3, color: "#e2e8f0", lineHeight: 1.5,
              fontSize: 10, whiteSpace: "pre-wrap",
            }}>
              {advisory}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
