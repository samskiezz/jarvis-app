/**
 * TaskSkillAlignment — F57
 * Parallel-fetches /entities/Task + /v1/aip/skill; keyword-correlates active
 * tasks against available skills to surface coverage gaps and team readiness.
 * AI assessment via /v1/jarvis/agent/chat + TTS on demand.
 *
 * Toggle: ◈ TALIGN at left:4652 bottom strip.
 * Event:  jarvis:taskalign-toggle
 * Voice:  "JARVIS, mission alignment" | "skill coverage" | "team readiness" | "task alignment"
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#39FF14";
const AM  = "#F5A623";
const RD  = "#FF4444";
const PUR = "#b18cff";
const DIM = "#4A6070";
const BG  = "rgba(3,5,9,0.97)";
const POLL = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TALIGN_RE =
  /\b(task[\s-]?skill|skill[\s-]?coverage|mission[\s-]?align|team[\s-]?readiness|task[\s-]?align|skill[\s-]?align|coverage[\s-]?gap|task[\s-]?coverage)\b/i;

export function isTaskAlignQuery(t) {
  return TALIGN_RE.test(t || "");
}

function normArr(d, ...keys) {
  if (Array.isArray(d)) return d;
  for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
  return [];
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("Task fetch failed");
  const d = await r.json();
  return normArr(d, "data", "items", "tasks");
}

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("Skill fetch failed");
  const d = await r.json();
  return normArr(d, "data", "items", "skills");
}

function taskWords(task) {
  const raw = `${task.title || ""} ${task.name || ""} ${task.description || ""}`;
  return raw.toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function skillText(sk) {
  return `${sk.name || ""} ${sk.skill_name || ""} ${sk.category || ""} ${sk.description || ""}`.toLowerCase();
}

function correlate(tasks, skills) {
  const active = tasks.filter(t => {
    const s = (t.status || "").toLowerCase();
    return s !== "done" && s !== "completed" && s !== "closed" && s !== "archived";
  });

  const rows = active.map(t => {
    const words = taskWords(t);
    const matched = skills.filter(sk => {
      const st = skillText(sk);
      return words.some(w => st.includes(w));
    });
    return { task: t, matched };
  });

  const skillUsage = {};
  rows.forEach(({ matched }) => {
    matched.forEach(sk => {
      const key = sk.name || sk.skill_name || "Unknown";
      skillUsage[key] = (skillUsage[key] || 0) + 1;
    });
  });

  const topSkills = Object.entries(skillUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return { active, rows, topSkills };
}

export async function buildTaskAlignScript() {
  let tasks = [], skills = [];
  try {
    [tasks, skills] = await Promise.all([fetchTasks(), fetchSkills()]);
  } catch (_) {}
  const { active, rows } = correlate(tasks, skills);
  const covered   = rows.filter(r => r.matched.length > 0).length;
  const uncovered = rows.filter(r => r.matched.length === 0).length;
  return (
    `Task-skill alignment report: ${tasks.length} total tasks, ${active.length} active. ` +
    `${covered} active tasks have at least one matching skill. ` +
    `${uncovered} tasks have no skill coverage — these represent readiness gaps. ` +
    `${skills.length} skills available in the profile, sir.`
  );
}

export default function TaskSkillAlignment() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [skills, setSkills]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [aiText, setAiText]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab]           = useState("ALL"); // ALL | COVERED | UNCOVERED
  const [search, setSearch]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [t, s] = await Promise.all([fetchTasks(), fetchSkills()]);
      setTasks(t); setSkills(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:taskalign-toggle", handler);
    return () => window.removeEventListener("jarvis:taskalign-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const { active, rows, topSkills } = correlate(tasks, skills);
  const covered   = rows.filter(r => r.matched.length > 0);
  const uncovered = rows.filter(r => r.matched.length === 0);

  const visibleRows = rows.filter(({ task, matched }) => {
    const title = (task.title || task.name || "").toLowerCase();
    const matchSearch = !search || title.includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (tab === "COVERED")   return matched.length > 0;
    if (tab === "UNCOVERED") return matched.length === 0;
    return true;
  });

  const coveragePct = active.length > 0 ? Math.round((covered.length / active.length) * 100) : 0;
  const badgeColor  = coveragePct >= 75 ? GN : coveragePct >= 50 ? AM : RD;

  async function runAiAssessment() {
    if (aiLoading) return;
    setAiLoading(true); setAiText("");
    try {
      const covList  = covered.slice(0, 5).map(r => r.task.title || r.task.name || "Task").join(", ");
      const uncovList = uncovered.slice(0, 5).map(r => r.task.title || r.task.name || "Task").join(", ");
      const topSk    = topSkills.slice(0, 5).map(s => `${s.name}(×${s.count})`).join(", ");
      const prompt =
        `You are JARVIS. Provide a 3-sentence British-butler team readiness assessment.\n` +
        `Tasks: ${active.length} active (${covered.length} covered, ${uncovered.length} uncovered).\n` +
        `Skills: ${skills.length} available. Top utilised: ${topSk || "none"}.\n` +
        `Covered tasks sample: ${covList || "none"}.\n` +
        `Uncovered tasks sample: ${uncovList || "none"}.\n` +
        `Assess readiness and recommend priority focus areas.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiText(text || "Assessment unavailable.");
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAiText("Unable to reach reasoning core.");
    } finally {
      setAiLoading(false);
    }
  }

  const panelStyle = {
    position: "fixed",
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    width: 520,
    maxHeight: "calc(100vh - 100px)",
    background: BG,
    border: `1px solid ${CY}33`,
    borderRadius: 10,
    zIndex: 72,
    display: "flex",
    flexDirection: "column",
    fontFamily: "'JetBrains Mono',monospace",
    boxShadow: `0 0 40px ${CY}22`,
    overflow: "hidden",
  };

  const tabStyle = (active) => ({
    padding: "3px 10px",
    fontSize: 8,
    borderRadius: 4,
    border: `1px solid ${active ? CY : CY + "44"}`,
    background: active ? `${CY}22` : "transparent",
    color: active ? CY : DIM,
    cursor: "pointer",
    letterSpacing: 1,
    fontFamily: "inherit",
  });

  return (
    <>
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: CY, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
                ◈ TASK · SKILL ALIGNMENT
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}
              >✕</button>
            </div>
            <div style={{ color: DIM, fontSize: 7, marginTop: 2, letterSpacing: 0.5 }}>
              /entities/Task · /v1/aip/skill — active task coverage vs skill profile
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 14px" }}>
            {loading && !tasks.length ? (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 20 }}>
                Correlating tasks and skills…
              </div>
            ) : error ? (
              <div style={{ color: RD, fontSize: 9, padding: 8 }}>{error}</div>
            ) : (
              <>
                {/* Stat tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
                  {[
                    { label: "TOTAL TASKS", value: tasks.length, color: CY },
                    { label: "ACTIVE",       value: active.length, color: AM },
                    { label: "COVERED",      value: covered.length, color: GN },
                    { label: "UNCOVERED",    value: uncovered.length, color: uncovered.length > 0 ? RD : DIM },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      background: `${color}10`,
                      border: `1px solid ${color}33`,
                      borderRadius: 6,
                      padding: "6px 8px",
                      textAlign: "center",
                    }}>
                      <div style={{ color, fontSize: 14, fontWeight: 700 }}>{value}</div>
                      <div style={{ color: DIM, fontSize: 6, letterSpacing: 1, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Coverage bar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>COVERAGE RATIO</span>
                    <span style={{ color: badgeColor, fontSize: 8, fontWeight: 700 }}>{coveragePct}%</span>
                  </div>
                  <div style={{ height: 6, background: `${CY}15`, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${coveragePct}%`,
                      background: badgeColor,
                      borderRadius: 3,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <div style={{ color: DIM, fontSize: 6, marginTop: 3, letterSpacing: 0.5 }}>
                    {skills.length} skills in profile · {active.length} active tasks analysed
                  </div>
                </div>

                {/* Top skills */}
                {topSkills.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginBottom: 5 }}>
                      TOP UTILISED SKILLS
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {topSkills.map(({ name, count }) => (
                        <span key={name} style={{
                          background: `${PUR}15`,
                          border: `1px solid ${PUR}44`,
                          color: PUR,
                          fontSize: 7,
                          padding: "2px 7px",
                          borderRadius: 4,
                          letterSpacing: 0.5,
                        }}>
                          {name} ×{count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI assessment */}
                <div style={{
                  background: `${CY}08`,
                  border: `1px solid ${CY}22`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  marginBottom: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ color: CY, fontSize: 7, letterSpacing: 1 }}>AI READINESS ASSESSMENT</span>
                    <button
                      onClick={runAiAssessment}
                      disabled={aiLoading}
                      style={{
                        background: `${CY}15`,
                        border: `1px solid ${CY}44`,
                        color: CY,
                        fontSize: 7,
                        padding: "2px 8px",
                        borderRadius: 4,
                        cursor: aiLoading ? "not-allowed" : "pointer",
                        letterSpacing: 1,
                        fontFamily: "inherit",
                        opacity: aiLoading ? 0.5 : 1,
                      }}
                    >
                      {aiLoading ? "CONSULTING…" : "ASSESS"}
                    </button>
                  </div>
                  {aiText ? (
                    <div style={{ fontSize: 9, color: "#DCEBF5", lineHeight: 1.7 }}>{aiText}</div>
                  ) : (
                    <div style={{ fontSize: 8, color: DIM, fontStyle: "italic" }}>
                      Click ASSESS for an AI team readiness briefing.
                    </div>
                  )}
                </div>

                {/* Task rows */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  {["ALL", "COVERED", "UNCOVERED"].map(t => (
                    <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>{t}</button>
                  ))}
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="filter tasks…"
                    style={{
                      flex: 1,
                      minWidth: 80,
                      background: `${CY}08`,
                      border: `1px solid ${CY}22`,
                      borderRadius: 4,
                      color: CY,
                      fontSize: 8,
                      padding: "3px 8px",
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {visibleRows.length === 0 ? (
                    <div style={{ color: DIM, fontSize: 8, textAlign: "center", padding: 12 }}>
                      No tasks match the current filter.
                    </div>
                  ) : (
                    visibleRows.map(({ task, matched }, i) => {
                      const title  = task.title || task.name || `Task ${i + 1}`;
                      const status = (task.status || "pending").toUpperCase();
                      const hasCov = matched.length > 0;
                      return (
                        <div key={task.id || task._id || i} style={{
                          background: hasCov ? `${GN}08` : `${RD}08`,
                          border: `1px solid ${hasCov ? GN : RD}22`,
                          borderRadius: 5,
                          padding: "6px 9px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ color: hasCov ? GN : AM, fontSize: 8, fontWeight: 700, flex: 1, marginRight: 8 }}>
                              {title}
                            </span>
                            <span style={{
                              fontSize: 6,
                              padding: "1px 5px",
                              borderRadius: 3,
                              border: `1px solid ${CY}33`,
                              color: DIM,
                              letterSpacing: 1,
                              flexShrink: 0,
                            }}>
                              {status}
                            </span>
                          </div>
                          {hasCov ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                              {matched.slice(0, 4).map((sk, j) => (
                                <span key={j} style={{
                                  fontSize: 6,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: `${GN}15`,
                                  border: `1px solid ${GN}33`,
                                  color: GN,
                                  letterSpacing: 0.5,
                                }}>
                                  {sk.name || sk.skill_name || "skill"}
                                </span>
                              ))}
                              {matched.length > 4 && (
                                <span style={{ fontSize: 6, color: DIM }}>+{matched.length - 4} more</span>
                              )}
                            </div>
                          ) : (
                            <div style={{ color: RD, fontSize: 6, marginTop: 3, letterSpacing: 0.5 }}>
                              NO SKILL COVERAGE — readiness gap
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 14px",
            borderTop: `1px solid ${CY}11`,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
              /entities/Task · /v1/aip/skill · /v1/jarvis/agent/chat
            </span>
          </div>
        </div>
      )}

      {/* Toggle — left:4652 bottom strip */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Task-Skill Alignment"
        style={{
          position: "fixed",
          left: 4652,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : uncovered.length > 0 ? AM : CY,
          border: `1px solid ${uncovered.length > 0 ? AM : CY}`,
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 8,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 12px ${CY}` : "none",
        }}
      >
        ◈ TALIGN
        {uncovered.length > 0 && (
          <span style={{
            marginLeft: 4,
            background: AM,
            color: "#030509",
            borderRadius: 8,
            fontSize: 7,
            padding: "0 4px",
            fontWeight: 700,
          }}>
            {uncovered.length}
          </span>
        )}
      </button>

      <style>{`
        @keyframes tsapulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
