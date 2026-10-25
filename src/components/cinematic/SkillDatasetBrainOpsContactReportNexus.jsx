/**
 * SkillDatasetBrainOpsContactReportNexus — F192
 * Fetches /v1/aip/skill + /v1/datasets + /v1/cinematic/brain +
 * /v1/ops/alerts + /entities/Contact + /v1/reports and
 * cross-references each skill against all 5 other sources.
 * Classifies:
 *   COMMANDED  — skill has 5 cross-source matches
 *   ACTIVE     — skill has 3–4 matches
 *   PARTIAL    — skill has 1–2 matches
 *   DARK       — skill has 0 matches across all 5 sources
 * Red pulse on DARK count (capability blind spots).
 * ASSESS → /v1/jarvis/agent/chat generates an advisory for dark skills + TTS.
 * Voice triggers: "skill command"/"sdbarc"/"skill data ops"/"skill nexus"/
 *   "capability nexus"/"dark skills"/"skill blind"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF4D6D";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const PRP  = "#B485FF";
const ORG  = "#FF8C42";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SDBARC_RE =
  /\b(skill.command|sdbarc|skill.data.ops|skill.nexus|capability.nexus|dark.skills?|skill.blind|skill.ops.command|skill.coverage.nexus|sdbarc.toggle)\b/i;

export function isSdbarcQuery(t) { return SDBARC_RE.test(t || ""); }

const hdrs = { Authorization: `Bearer ${API_KEY}` };

/* ── fetchers ───────────────────────────────────────────────────────────────── */
async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.name || s.title || s.skill || "").toString(),
    score: typeof s.score === "number" ? s.score :
           typeof s.rating === "number" ? s.rating :
           typeof s.level === "number" ? s.level : 0,
    category: s.category || s.type || "",
  }));
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(ds => ({
    id: ds.id || ds._id || String(Math.random()),
    name: (ds.name || ds.title || ds.dataset || "").toString(),
    rows: typeof ds.rows === "number" ? ds.rows :
          typeof ds.row_count === "number" ? ds.row_count :
          typeof ds.count === "number" ? ds.count : null,
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

async function fetchOpsAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(a => ({
    id: a.id || a._id || String(Math.random()),
    title: (a.title || a.name || a.message || a.alert || "").toString(),
    severity: a.severity || a.level || a.priority || "medium",
  }));
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.entities) ? d.entities : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || c.displayName || "").toString(),
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
  }));
}

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.reports) ? d.reports :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(rp => ({
    id: rp.id || rp._id || String(Math.random()),
    title: (rp.title || rp.name || rp.subject || "").toString(),
    date: rp.date || rp.created_at || rp.timestamp || "",
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlap(tokA, tokB) {
  const sb = new Set(tokB);
  return tokA.filter(t => sb.has(t)).length;
}

function classify(matchCount) {
  if (matchCount >= 5) return "COMMANDED";
  if (matchCount >= 3) return "ACTIVE";
  if (matchCount >= 1) return "PARTIAL";
  return "DARK";
}

function buildRows(skills, datasets, brainNodes, opsAlerts, contacts, reports) {
  return skills.map(sk => {
    const tok = tokenize(sk.name + " " + sk.category);

    const mDatasets = datasets
      .map(ds => ({ ...ds, hits: overlap(tok, tokenize(ds.name)) }))
      .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);

    const mBrain = brainNodes
      .map(n => ({ ...n, hits: overlap(tok, tokenize(n.label)) }))
      .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);

    const mAlerts = opsAlerts
      .map(a => ({ ...a, hits: overlap(tok, tokenize(a.title)) }))
      .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);

    const mContacts = contacts
      .map(c => ({ ...c, hits: overlap(tok, tokenize(c.name + " " + c.role + " " + c.org)) }))
      .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);

    const mReports = reports
      .map(rp => ({ ...rp, hits: overlap(tok, tokenize(rp.title)) }))
      .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);

    const matchCount =
      (mDatasets.length > 0 ? 1 : 0) +
      (mBrain.length > 0 ? 1 : 0) +
      (mAlerts.length > 0 ? 1 : 0) +
      (mContacts.length > 0 ? 1 : 0) +
      (mReports.length > 0 ? 1 : 0);

    return {
      ...sk,
      classification: classify(matchCount),
      matchCount,
      mDatasets,
      mBrain,
      mAlerts,
      mContacts,
      mReports,
    };
  });
}

async function fetchAssessment(darkSkills) {
  try {
    const names = darkSkills.map(s => s.name).join(", ");
    const msg = `You are JARVIS. In 2 concise sentences, advise how to address these capability blind spots — skills with no dataset source, brain model, ops alert, contact owner, or filed report: ${names}. Be direct and actionable.`;
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

export async function buildSdbarcScript() {
  try {
    const [skills, datasets, brainNodes, opsAlerts, contacts, reports] = await Promise.all([
      fetchSkills(), fetchDatasets(), fetchBrainNodes(),
      fetchOpsAlerts(), fetchContacts(), fetchReports(),
    ]);
    if (!skills.length) return "Skill data is unavailable at this time, sir.";
    const rows = buildRows(skills, datasets, brainNodes, opsAlerts, contacts, reports);
    const dark = rows.filter(r => r.classification === "DARK");
    return dark.length > 0
      ? `Capability nexus audit complete, sir. ${skills.length} skills assessed across 5 intelligence sources. ${dark.length} skill${dark.length !== 1 ? "s" : ""} are completely dark — no dataset source, no brain model, no ops alert, no contact owner, no filed report. Blind capabilities: ${dark.slice(0, 3).map(s => s.name).join(", ")}. Advisory available in the SDBARC panel.`
      : `All ${skills.length} operational skills have at least one intelligence source cross-reference, sir. No capability blind spots detected.`;
  } catch (_) { return "Unable to retrieve capability nexus data at this time, sir."; }
}

/* ── style constants ─────────────────────────────────────────────────────── */
const CLS_COLOR = {
  COMMANDED: GRN,
  ACTIVE:    CY,
  PARTIAL:   AMB,
  DARK:      RED,
};

/* ── component ─────────────────────────────────────────────────────────── */
export default function SkillDatasetBrainOpsContactReportNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [error, setError]         = useState(null);
  const [expanded, setExpanded]   = useState({});
  const [filter, setFilter]       = useState("ALL");
  const timerRef                  = useRef(null);

  const darkCount = rows.filter(r => r.classification === "DARK").length;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [skills, datasets, brainNodes, opsAlerts, contacts, reports] = await Promise.all([
        fetchSkills(), fetchDatasets(), fetchBrainNodes(),
        fetchOpsAlerts(), fetchContacts(), fetchReports(),
      ]);
      setRows(buildRows(skills, datasets, brainNodes, opsAlerts, contacts, reports));
    } catch (_) { setError("Failed to fetch capability nexus data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sdbarc-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sdbarc-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SDBARC_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const handleAssess = async () => {
    const dark = rows.filter(r => r.classification === "DARK");
    if (!dark.length) return;
    setAssessing(true); setAssessment(null);
    const text = await fetchAssessment(dark);
    setAssessment(text);
    setAssessing(false);
    if (text) speakText(text);
  };

  const display = rows.filter(r => filter === "ALL" || r.classification === filter);

  const counts = {
    COMMANDED: rows.filter(r => r.classification === "COMMANDED").length,
    ACTIVE:    rows.filter(r => r.classification === "ACTIVE").length,
    PARTIAL:   rows.filter(r => r.classification === "PARTIAL").length,
    DARK:      rows.filter(r => r.classification === "DARK").length,
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Skill × Dataset × Brain × Ops × Contact × Report Nexus (F192)"
        style={{
          position: "fixed", bottom: 8, left: 155320, zIndex: 288,
          background: open ? CY : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : CY, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${CY}` : "none", whiteSpace: "nowrap",
        }}>
        ◈ SDBARC{darkCount > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
            animation: "sdbarc-pulse 1.2s infinite",
          }}>{darkCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: 155200, zIndex: 289,
          width: 540, maxHeight: "74vh", overflow: "hidden",
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
                textShadow: `0 0 12px ${CY}` }}>◈ SDBARC</span>
              <span style={{ marginLeft: 8, color: "#6E8AA0", fontSize: 10 }}>
                SKILL × DATASET × BRAIN × OPS × CONTACT × REPORT
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && (
                <span style={{ color: AMB, fontSize: 10, animation: "sdbarc-pulse 1s infinite" }}>
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
            {["ALL", "COMMANDED", "ACTIVE", "PARTIAL", "DARK"].map(f => (
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
                No skill data available.
              </div>
            )}

            {display.map(row => {
              const col = CLS_COLOR[row.classification] || CY;
              const exp = !!expanded[row.id];
              return (
                <div key={row.id} style={{
                  marginBottom: 8, background: `${col}09`,
                  border: `1px solid ${col}33`, borderRadius: 10, overflow: "hidden",
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
                    {row.score > 0 && (
                      <span style={{
                        fontSize: 9, color: AMB, border: "1px solid #FFD70055",
                        borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                      }}>{typeof row.score === "number" ? row.score.toFixed(0) : row.score}</span>
                    )}
                    <span style={{
                      fontSize: 9, color: "#6E8AA0", border: "1px solid #2A3F54",
                      borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                    }}>{row.matchCount}/5</span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{exp ? "▲" : "▼"}</span>
                  </div>

                  {exp && (
                    <div style={{ padding: "0 12px 10px", borderTop: `1px solid ${col}22` }}>
                      {/* datasets */}
                      {row.mDatasets.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            DATASETS ({row.mDatasets.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {row.mDatasets.map(ds => (
                              <span key={ds.id} style={{
                                fontSize: 9, padding: "2px 7px", borderRadius: 5,
                                border: `1px solid ${ORG}44`, color: ORG, background: `${ORG}0A`,
                              }}>
                                {ds.name}{ds.rows != null && (
                                  <b style={{ color: "#A0B4C8", marginLeft: 4 }}>{ds.rows}r</b>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* brain nodes */}
                      {row.mBrain.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            BRAIN NODES ({row.mBrain.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {row.mBrain.map(n => (
                              <span key={n.id} style={{
                                fontSize: 9, padding: "2px 7px", borderRadius: 5,
                                border: `1px solid ${PRP}44`, color: PRP, background: `${PRP}0A`,
                              }}>
                                {n.label} <b style={{ color: "#A0B4C8" }}>{n.score.toFixed ? n.score.toFixed(2) : n.score}</b>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ops alerts */}
                      {row.mAlerts.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            OPS ALERTS ({row.mAlerts.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.mAlerts.map(a => (
                              <div key={a.id} style={{
                                fontSize: 9, padding: "3px 8px", borderRadius: 5,
                                border: `1px solid ${RED}33`, color: "#C8A0A0", background: `${RED}09`,
                              }}>
                                <span style={{ color: "#DCEBF5" }}>{a.title}</span>
                                {a.severity && (
                                  <span style={{
                                    marginLeft: 6, border: `1px solid ${RED}55`,
                                    borderRadius: 3, padding: "0 4px", color: RED, fontSize: 8,
                                  }}>{a.severity}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* contacts */}
                      {row.mContacts.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            CONTACTS ({row.mContacts.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {row.mContacts.map(c => (
                              <span key={c.id} style={{
                                fontSize: 9, padding: "2px 7px", borderRadius: 5,
                                border: `1px solid ${CY}44`, color: CY, background: `${CY}0A`,
                              }}>
                                {c.name}{(c.role || c.org) && (
                                  <span style={{ color: "#6E8AA0", marginLeft: 4 }}>
                                    {[c.role, c.org].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* reports */}
                      {row.mReports.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5, marginBottom: 4 }}>
                            REPORTS ({row.mReports.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.mReports.map(rp => (
                              <div key={rp.id} style={{
                                fontSize: 9, padding: "3px 8px", borderRadius: 5,
                                border: `1px solid ${GRN}33`, color: "#A0C8B8", background: `${GRN}09`,
                              }}>
                                <span style={{ color: GRN, fontWeight: 600 }}>{rp.title}</span>
                                {rp.date && (
                                  <span style={{
                                    marginLeft: 6, border: `1px solid ${GRN}44`,
                                    borderRadius: 3, padding: "0 4px", color: "#6E8AA0", fontSize: 8,
                                  }}>{rp.date.toString().slice(0, 10)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {row.matchCount === 0 && (
                        <div style={{
                          marginTop: 8, fontSize: 9, color: RED,
                          padding: "4px 8px", background: `${RED}0A`,
                          border: `1px solid ${RED}33`, borderRadius: 5,
                        }}>
                          ⚠ No intelligence source cross-reference found — capability blind spot
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
                disabled={assessing || darkCount === 0}
                style={{
                  flex: 1, background: darkCount > 0 ? `${CY}15` : "#0C1420",
                  border: `1px solid ${darkCount > 0 ? CY : "#2A3F54"}55`,
                  borderRadius: 6, color: darkCount > 0 ? CY : "#2A3F54",
                  fontSize: 10, cursor: darkCount > 0 ? "pointer" : "default",
                  padding: "5px 0", letterSpacing: 1,
                }}>
                {assessing ? "ASSESSING…" : `▶ ASSESS DARK CAPABILITIES (${darkCount} blind)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sdbarc-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      `}</style>
    </>
  );
}
