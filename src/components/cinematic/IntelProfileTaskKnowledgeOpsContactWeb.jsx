/**
 * IntelProfileTaskKnowledgeOpsContactWeb — F208
 * ◈ ITKOCW  (left:164280, bottom:8, zIndex:304)
 *
 * Fetches 5 real sources in parallel:
 *   /entities/IntelProfile  → intel profiles (primary dimension)
 *   /entities/Task          → tasks
 *   /knowledge/             → knowledge articles
 *   /v1/ops/alerts          → ops alerts
 *   /entities/Contact       → contacts
 *
 * Keyword-cross-references each intel profile against all 4 other sources
 * to classify:
 *   COMMANDING – matched items from 3-4 sources  (full intelligence command)
 *   ACTIVE     – matched items from 2 sources
 *   PARTIAL    – matched item from 1 source
 *   DARK       – zero matches in any source (dead intel profiles — no task,
 *                no knowledge article, no ops alert, no contact owner)
 *
 * Red pulse on DARK count.
 * Expandable rows: matched tasks (status badge) + matched knowledge articles
 *   (category badge) + matched ops alerts (severity badge) + matched contacts
 *   (role/org).
 * ▶ ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "intel command web"/"itkocw"/"intelligence command"/
 *   "dark intel"/"intel profile command"/"dead intel"/"profile web"
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

const ITKOCW_RE =
  /\b(intel\.command\.web|itkocw|intelligence\.command|dark\.intel|intel\.profile\.command|dead\.intel|profile\.web)\b/i;

export function isItkocwQuery(t) { return ITKOCW_RE.test(t || ""); }

export function buildItkocwScript(darkCount, totalCount) {
  if (darkCount === 0) {
    return `You are JARVIS. The IntelProfile Task Knowledge Ops Alert Contact Command Web shows ${totalCount} intel profiles — all profiles have at least one task, knowledge article, ops alert, or contact match. Provide a one-sentence operational intelligence status confirmation. Be direct and brief.`;
  }
  const pct = totalCount > 0 ? Math.round((darkCount / totalCount) * 100) : 0;
  return `You are JARVIS. The IntelProfile Task Knowledge Ops Alert Contact Command Web shows ${darkCount} of ${totalCount} intel profiles (${pct}%) are DARK — no task assignment, no knowledge article, no ops alert coverage, and no contact owner. Provide a 2-sentence advisory: identify the operational risk of these intelligence dead-ends, and recommend the single most impactful action to activate these dormant intel profiles. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchIntelProfiles() {
  const d = await safeFetch(`${apiBase()}/entities/IntelProfile`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.profiles) ? d.profiles :
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

async function fetchContacts() {
  const d = await safeFetch(`${apiBase()}/entities/Contact`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

function keywords(obj) {
  const text = [
    obj.label, obj.name, obj.id, obj.title, obj.type,
    obj.category, obj.description, obj.subject, obj.topic,
    obj.profile, obj.alias, obj.entity, obj.source,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 2);
}

function matches(profileKws, items) {
  return items.filter(item => {
    const itemKws = keywords(item);
    return profileKws.some(k => itemKws.includes(k)) ||
      itemKws.some(k => profileKws.includes(k));
  }).slice(0, 4);
}

function classify(sourceCount) {
  if (sourceCount >= 3) return "COMMANDING";
  if (sourceCount === 2) return "ACTIVE";
  if (sourceCount === 1) return "PARTIAL";
  return "DARK";
}

function statusColor(cls) {
  if (cls === "COMMANDING") return GRN;
  if (cls === "ACTIVE")     return CY;
  if (cls === "PARTIAL")    return AMB;
  return RED;
}

function sevColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "high") return RED;
  if (s === "medium" || s === "moderate") return AMB;
  return CY;
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

export default function IntelProfileTaskKnowledgeOpsContactWeb() {
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
      const [profiles, tasks, knowledge, opsAlerts, contacts] = await Promise.all([
        fetchIntelProfiles(), fetchTasks(), fetchKnowledge(), fetchOpsAlerts(), fetchContacts(),
      ]);

      const built = profiles.map(prof => {
        const pkws   = keywords(prof);
        const mTask  = matches(pkws, tasks);
        const mKnow  = matches(pkws, knowledge);
        const mAlert = matches(pkws, opsAlerts);
        const mCont  = matches(pkws, contacts);
        const sourceCount = [mTask, mKnow, mAlert, mCont].filter(m => m.length > 0).length;
        return {
          prof,
          label: prof.name || prof.title || prof.id || "profile",
          category: prof.category || prof.type || "",
          cls: classify(sourceCount),
          mTask, mKnow, mAlert, mCont,
        };
      });

      built.sort((a, b) => {
        const order = { DARK: 0, PARTIAL: 1, ACTIVE: 2, COMMANDING: 3 };
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
    window.addEventListener("jarvis:itkocw-toggle", handler);
    return () => window.removeEventListener("jarvis:itkocw-toggle", handler);
  }, []);

  const darkCount = rows.filter(r => r.cls === "DARK").length;

  async function assess() {
    setAssessing(true);
    setAdvisory("");
    try {
      const script = buildItkocwScript(darkCount, rows.length);
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
    position: "fixed", bottom: 8, left: 164280,
    zIndex: 304,
    padding: "3px 7px", fontSize: 10, fontFamily: "monospace",
    background: open ? CY : "#0a1628",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 3, cursor: "pointer", userSelect: "none",
    boxShadow: darkCount > 0 ? `0 0 6px ${RED}` : "none",
    transition: "box-shadow 0.4s",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)} title="IntelProfile Task Knowledge Ops Alert Contact Command Web">
        ◈ ITKOCW {darkCount > 0 && (
          <span style={{ color: RED, fontWeight: 700 }}> [{darkCount}]</span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 32, left: 164000,
    width: 540, maxHeight: 480,
    background: "rgba(6,10,22,0.97)", border: `1px solid ${CY}`,
    borderRadius: 6, zIndex: 304, overflowY: "auto",
    fontFamily: "monospace", fontSize: 11, color: "#cbd5e0",
    boxShadow: `0 0 20px rgba(41,231,255,0.15)`,
  };

  const hdrStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderBottom: `1px solid ${DIM}`,
    position: "sticky", top: 0, background: "rgba(6,10,22,0.98)", zIndex: 1,
  };

  const clsCounts = { COMMANDING: 0, ACTIVE: 0, PARTIAL: 0, DARK: 0 };
  rows.forEach(r => { clsCounts[r.cls] = (clsCounts[r.cls] || 0) + 1; });

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)} title="Close">◈ ITKOCW ✕</button>
      <div style={panelStyle}>
        <div style={hdrStyle}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>INTEL PROFILE COMMAND WEB</span>
          {loading && <span style={{ color: AMB, fontSize: 10 }}>loading…</span>}
          <span style={{ marginLeft: "auto", color: RED, fontWeight: 700 }}>
            DARK: {darkCount}
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${DIM}` }}>
          {[
            { label: "COMMANDING", color: GRN, count: clsCounts.COMMANDING },
            { label: "ACTIVE",     color: CY,  count: clsCounts.ACTIVE },
            { label: "PARTIAL",    color: AMB, count: clsCounts.PARTIAL },
            { label: "DARK",       color: RED, count: clsCounts.DARK },
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
              <span style={{ color: statusColor(r.cls), fontWeight: 700, fontSize: 10, minWidth: 70 }}>
                {r.cls}
              </span>
              <span style={{ flex: 1, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
              {r.category && (
                <span style={{ color: "#718096", fontSize: 9 }}>
                  {r.category}
                </span>
              )}
              <span style={{ color: CY, fontSize: 9 }}>
                {expanded[i] ? "▲" : "▼"}
              </span>
            </div>

            {expanded[i] && (
              <div style={{ padding: "4px 10px 8px 20px", color: "#a0aec0", fontSize: 10 }}>
                {/* Tasks */}
                {r.mTask.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>TASKS:</span>{" "}
                    {r.mTask.map((t, j) => {
                      const st = (t.status || t.state || "").toUpperCase();
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#0a2a1a", border: `1px solid ${GRN}44`,
                          color: "#68d391", fontSize: 9,
                        }}>
                          {t.name || t.title || t.id}{st ? ` · ${st}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>TASKS: —</div>
                )}

                {/* Knowledge */}
                {r.mKnow.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>KNOWLEDGE:</span>{" "}
                    {r.mKnow.map((k, ki) => {
                      const cat = k.category || k.type || "";
                      return (
                        <span key={ki} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a2a4a", border: `1px solid ${CY}44`,
                          color: "#90cdf4", fontSize: 9,
                        }}>
                          {k.title || k.name || k.id}{cat ? ` · ${cat}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>KNOWLEDGE: —</div>
                )}

                {/* Ops Alerts */}
                {r.mAlert.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>OPS ALERTS:</span>{" "}
                    {r.mAlert.map((a, ai) => {
                      const sev = a.severity || a.level || a.priority || "";
                      return (
                        <span key={ai} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a1a0a", border: `1px solid ${AMB}44`,
                          color: sevColor(sev), fontSize: 9,
                        }}>
                          {a.name || a.title || a.message || a.id}
                          {sev ? ` · ${sev.toUpperCase()}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>OPS ALERTS: —</div>
                )}

                {/* Contacts */}
                {r.mCont.length > 0 ? (
                  <div>
                    <span style={{ color: "#c084fc" }}>CONTACTS:</span>{" "}
                    {r.mCont.map((c, ci) => {
                      const role = c.role || c.title || "";
                      const org  = c.org  || c.organization || c.company || "";
                      return (
                        <span key={ci} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a0a2a", border: "1px solid #c084fc44",
                          color: "#c084fc", fontSize: 9,
                        }}>
                          {c.name || c.id}
                          {role ? ` · ${role}` : ""}
                          {org  ? ` @ ${org}`  : ""}
                        </span>
                      );
                    })}
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
            No intel profile data returned.
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
            {assessing ? "▶ ASSESSING…" : `▶ ASSESS (${darkCount} DARK of ${rows.length} profiles)`}
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
