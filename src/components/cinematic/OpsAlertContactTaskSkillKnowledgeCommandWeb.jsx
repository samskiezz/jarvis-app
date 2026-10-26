/**
 * OpsAlertContactTaskSkillKnowledgeCommandWeb — F205
 * ◈ OATKWEB  (left:162600, bottom:8, zIndex:301)
 *
 * Fetches 5 real sources in parallel:
 *   /v1/ops/alerts        → ops alerts (the primary dimension)
 *   /entities/Contact     → contacts
 *   /entities/Task        → tasks
 *   /v1/aip/skill         → skills
 *   /knowledge/           → knowledge articles
 *
 * Keyword-cross-references each alert against all 4 other sources
 * to classify:
 *   COMMANDED  – matched items from 3-4 sources  (fully staffed + capable + documented)
 *   MANAGED    – matched items from 2 sources
 *   PARTIAL    – matched item from 1 source
 *   BLIND      – zero matches in any source (alerts with no contact owner, no task, no skill, no knowledge — full blind spots)
 *
 * Red pulse on BLIND count.
 * Expandable rows: matched contacts (role/org) + matched tasks (status badge) +
 *   matched skills (score badge) + matched knowledge articles (category badge).
 * ▶ ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "incident command"/"oatkweb"/"alert command web"/
 *   "alert intelligence"/"blind alerts"/"commanded alerts"/"incident response web"
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

const OATKWEB_RE =
  /\b(incident\.command|oatkweb|alert\.command\.web|alert\.intelligence|blind\.alerts|commanded\.alerts|incident\.response\.web)\b/i;

export function isOatkwebQuery(t) { return OATKWEB_RE.test(t || ""); }

export function buildOatkwebScript(blindCount, totalCount) {
  if (blindCount === 0) {
    return `You are JARVIS. The Ops Alert Incident Command Intelligence Web shows ${totalCount} alerts — all alerts have at least one contact owner, task, skill, or knowledge article match. Provide a one-sentence operational incident command status confirmation. Be direct and brief.`;
  }
  const pct = totalCount > 0 ? Math.round((blindCount / totalCount) * 100) : 0;
  return `You are JARVIS. The Ops Alert Incident Command Intelligence Web shows ${blindCount} of ${totalCount} alerts (${pct}%) are BLIND — no assigned contact, no linked task, no matching skill, and no knowledge article. Provide a 2-sentence advisory: identify the operational risk of these undefended incidents, and recommend the single most impactful action to close these blind spots. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchAlerts() {
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

async function fetchTasks() {
  const d = await safeFetch(`${apiBase()}/entities/Task`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.tasks) ? d.tasks :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchSkills() {
  const d = await safeFetch(`${apiBase()}/v1/aip/skill`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
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

function keywords(obj) {
  const text = [
    obj.label, obj.name, obj.id, obj.title, obj.type,
    obj.category, obj.description, obj.subject, obj.topic,
    obj.service, obj.source, obj.message, obj.alert_type,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 2);
}

function matches(alertKws, items) {
  return items.filter(item => {
    const itemKws = keywords(item);
    return alertKws.some(k => itemKws.includes(k)) ||
      itemKws.some(k => alertKws.includes(k));
  }).slice(0, 4);
}

function classify(sourceCount) {
  if (sourceCount >= 3) return "COMMANDED";
  if (sourceCount === 2) return "MANAGED";
  if (sourceCount === 1) return "PARTIAL";
  return "BLIND";
}

function statusColor(cls) {
  if (cls === "COMMANDED") return GRN;
  if (cls === "MANAGED")   return CY;
  if (cls === "PARTIAL")   return AMB;
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

export default function OpsAlertContactTaskSkillKnowledgeCommandWeb() {
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
      const [alerts, contacts, tasks, skills, knowledge] = await Promise.all([
        fetchAlerts(), fetchContacts(), fetchTasks(), fetchSkills(), fetchKnowledge(),
      ]);

      const built = alerts.map(al => {
        const akws    = keywords(al);
        const mContact = matches(akws, contacts);
        const mTask    = matches(akws, tasks);
        const mSkill   = matches(akws, skills);
        const mKnow    = matches(akws, knowledge);
        const sourceCount = [mContact, mTask, mSkill, mKnow].filter(m => m.length > 0).length;
        return {
          al,
          label: al.title || al.name || al.message || al.id || "alert",
          severity: al.severity || al.level || al.priority || null,
          cls: classify(sourceCount),
          mContact, mTask, mSkill, mKnow,
        };
      });

      built.sort((a, b) => {
        const order = { BLIND: 0, PARTIAL: 1, MANAGED: 2, COMMANDED: 3 };
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
    window.addEventListener("jarvis:oatkweb-toggle", handler);
    return () => window.removeEventListener("jarvis:oatkweb-toggle", handler);
  }, []);

  const blindCount = rows.filter(r => r.cls === "BLIND").length;

  async function assess() {
    setAssessing(true);
    setAdvisory("");
    try {
      const script = buildOatkwebScript(blindCount, rows.length);
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
    position: "fixed", bottom: 8, left: 162600,
    zIndex: 301,
    padding: "3px 7px", fontSize: 10, fontFamily: "monospace",
    background: open ? CY : "#0a1628",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 3, cursor: "pointer", userSelect: "none",
    boxShadow: blindCount > 0 ? `0 0 6px ${RED}` : "none",
    transition: "box-shadow 0.4s",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)} title="Ops Alert Incident Command Intelligence Web">
        ◈ OATKWEB {blindCount > 0 && (
          <span style={{ color: RED, fontWeight: 700 }}> [{blindCount}]</span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 32, left: 162320,
    width: 540, maxHeight: 480,
    background: "rgba(6,10,22,0.97)", border: `1px solid ${CY}`,
    borderRadius: 6, zIndex: 301, overflowY: "auto",
    fontFamily: "monospace", fontSize: 11, color: "#cbd5e0",
    boxShadow: `0 0 20px rgba(41,231,255,0.15)`,
  };

  const hdrStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderBottom: `1px solid ${DIM}`,
    position: "sticky", top: 0, background: "rgba(6,10,22,0.98)", zIndex: 1,
  };

  const clsCounts = { COMMANDED: 0, MANAGED: 0, PARTIAL: 0, BLIND: 0 };
  rows.forEach(r => { clsCounts[r.cls] = (clsCounts[r.cls] || 0) + 1; });

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)} title="Close">◈ OATKWEB ✕</button>
      <div style={panelStyle}>
        <div style={hdrStyle}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>INCIDENT COMMAND INTELLIGENCE WEB</span>
          {loading && <span style={{ color: AMB, fontSize: 10 }}>loading…</span>}
          <span style={{ marginLeft: "auto", color: RED, fontWeight: 700 }}>
            BLIND: {blindCount}
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${DIM}` }}>
          {[
            { label: "COMMANDED", color: GRN, count: clsCounts.COMMANDED },
            { label: "MANAGED",   color: CY,  count: clsCounts.MANAGED },
            { label: "PARTIAL",   color: AMB, count: clsCounts.PARTIAL },
            { label: "BLIND",     color: RED, count: clsCounts.BLIND },
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
              {r.severity && (
                <span style={{ color: "#718096", fontSize: 9 }}>
                  {String(r.severity).toUpperCase()}
                </span>
              )}
              <span style={{ color: CY, fontSize: 9 }}>
                {expanded[i] ? "▲" : "▼"}
              </span>
            </div>

            {expanded[i] && (
              <div style={{ padding: "4px 10px 8px 20px", color: "#a0aec0", fontSize: 10 }}>
                {/* Contacts */}
                {r.mContact.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>CONTACTS:</span>{" "}
                    {r.mContact.map((c, j) => {
                      const role = c.role || c.position || "";
                      const org  = c.org || c.organization || c.company || "";
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#0a2a1a", border: `1px solid ${GRN}44`,
                          color: "#68d391", fontSize: 9,
                        }}>
                          {c.name || c.title || c.id}
                          {role || org ? ` · ${[role, org].filter(Boolean).join(" / ")}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>CONTACTS: —</div>
                )}

                {/* Tasks */}
                {r.mTask.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>TASKS:</span>{" "}
                    {r.mTask.map((t, ti) => {
                      const st = (t.status || t.state || "").toUpperCase();
                      return (
                        <span key={ti} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a2a4a", border: `1px solid ${CY}44`,
                          color: "#90cdf4", fontSize: 9,
                        }}>
                          {t.name || t.title || t.id}{st ? ` · ${st}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>TASKS: —</div>
                )}

                {/* Skills */}
                {r.mSkill.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>SKILLS:</span>{" "}
                    {r.mSkill.map((s, si) => {
                      const score = s.score ?? s.value ?? s.level ?? null;
                      return (
                        <span key={si} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a1a2a", border: `1px solid ${AMB}44`,
                          color: "#fbb040", fontSize: 9,
                        }}>
                          {s.name || s.title || s.id}
                          {score !== null ? ` · ${typeof score === "number" ? score.toFixed(0) : score}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>SKILLS: —</div>
                )}

                {/* Knowledge */}
                {r.mKnow.length > 0 ? (
                  <div>
                    <span style={{ color: "#c084fc" }}>KNOWLEDGE:</span>{" "}
                    {r.mKnow.map((kn, ki) => {
                      const cat = kn.category || kn.type || kn.topic || "";
                      return (
                        <span key={ki} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a0a2a", border: "1px solid #c084fc44",
                          color: "#c084fc", fontSize: 9,
                        }}>
                          {kn.title || kn.name || kn.id}{cat ? ` · ${cat}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568" }}>KNOWLEDGE: —</div>
                )}
              </div>
            )}
          </div>
        ))}

        {rows.length === 0 && !loading && (
          <div style={{ padding: "16px 10px", color: "#4a5568", textAlign: "center" }}>
            No ops alert data returned.
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
            {assessing ? "▶ ASSESSING…" : `▶ ASSESS (${blindCount} BLIND of ${rows.length} alerts)`}
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
