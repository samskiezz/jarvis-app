/**
 * TaskRiskMatrix — F61.
 *
 * Parallel-fetches /entities/Task + /entities/RiskSignal.
 * Keyword-correlates each task (title/description/type/status/tags) against
 * risk signals to surface which tasks carry hidden risk exposure and which
 * are clean.
 *
 * Stat tiles: tasks / risks / exposed tasks / clean tasks
 * Filter tabs: ALL / EXPOSED / CLEAN
 * Rows: each task sorted by highest-matched risk severity; expand to see
 *   matched risk signals with severity badges.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI 2-sentence risk-exposure
 *   assessment + TTS via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Intent: "task risk" / "risky tasks" / "task exposure" / "tasks with risks" /
 *         "task risk matrix" / "triskmat"
 *   → jarvis:task-risk-matrix-toggle + TTS brief via buildTaskRiskMatrixScript()
 *
 * Toggle: ◈ TRISK at left:8084, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 8084;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id:          t.id || t.task_id || String(Math.random()),
    title:       t.title || t.name || t.task_name || "Unnamed Task",
    description: t.description || t.details || t.summary || "",
    status:      (t.status || "pending").toLowerCase(),
    type:        t.type || t.category || t.task_type || "",
    priority:    (t.priority || "medium").toLowerCase(),
    tags:        [...(t.tags || []), ...(t.keywords || [])].map(String),
    due:         t.due_date || t.due || t.deadline || "",
  }));
}

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r.signal_id || String(Math.random()),
    title:       r.title || r.name || r.signal_name || "Unnamed Risk",
    description: r.description || r.details || r.summary || "",
    severity:    (r.severity || r.level || "medium").toLowerCase(),
    type:        r.type || r.category || r.risk_type || "",
    tags:        [...(r.tags || []), ...(r.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(task, risk) {
  const taskText = `${task.title} ${task.description} ${task.type} ${task.tags.join(" ")}`.toLowerCase();
  const riskWords = [
    ...tokens(risk.title),
    ...tokens(risk.description),
    ...tokens(risk.type),
    ...risk.tags.flatMap(tokens),
  ];
  return riskWords.reduce((acc, w) => acc + (taskText.includes(w) ? 1 : 0), 0);
}

const SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

function correlate(tasks, risks) {
  return tasks.map((task) => {
    const matched = risks
      .map((r) => ({ ...r, _score: matchScore(task, r) }))
      .filter((r) => r._score > 0)
      .sort((a, b) =>
        (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0) ||
        b._score - a._score
      )
      .slice(0, 5);
    const topSev = matched.length > 0 ? matched[0].severity : null;
    return { ...task, matched, topSev };
  }).sort((a, b) =>
    (SEV_ORDER[b.topSev] || 0) - (SEV_ORDER[a.topSev] || 0) ||
    b.matched.length - a.matched.length
  );
}

function sevColor(s) {
  if (s === "critical") return RED;
  if (s === "high")     return AMBER;
  if (s === "medium")   return CY;
  return GREEN;
}

function statusColor(s) {
  if (s === "blocked")                               return RED;
  if (s === "in_progress" || s === "in-progress")   return AMBER;
  if (s === "pending")                               return PURPLE;
  if (s === "completed" || s === "done")             return GREEN;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const TRISK_RE =
  /task.{0,15}risk|risk.{0,15}task|risky.{0,10}task|task.{0,10}exposure|task.{0,10}danger|tasks?.{0,10}with.{0,10}risk|triskmat\b/i;

export function isTaskRiskMatrixQuery(q) {
  return TRISK_RE.test(q || "");
}

export async function buildTaskRiskMatrixScript() {
  try {
    const [taskRaw, riskRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const tasks    = normaliseTasks(taskRaw);
    const risks    = normaliseRisks(riskRaw);
    const corr     = correlate(tasks, risks);
    const exposed  = corr.filter((t) => t.matched.length > 0);
    const clean    = corr.filter((t) => t.matched.length === 0);
    const critical = exposed.filter((t) => t.topSev === "critical");
    return `Task-risk matrix active, sir. ${tasks.length} task${tasks.length !== 1 ? "s" : ""} cross-referenced against ${risks.length} risk signal${risks.length !== 1 ? "s" : ""}. ${exposed.length} task${exposed.length !== 1 ? "s carry" : " carries"} risk exposure — ${critical.length} at critical severity. ${clean.length} task${clean.length !== 1 ? "s are" : " is"} risk-clean. Select a task to assess its exposure.`;
  } catch (_) {
    return "Task-risk matrix is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TaskRiskMatrix() {
  const [visible, setVisible]   = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [risks, setRisks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("EXPOSED");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [taskRaw, riskRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setTasks(normaliseTasks(taskRaw));
      setRisks(normaliseRisks(riskRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:task-risk-matrix-toggle", onToggle);
    return () => window.removeEventListener("jarvis:task-risk-matrix-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessTask(task) {
    setAssessing(task.id);
    const riskTitles = task.matched.map((r) => `"${r.title}" (${r.severity})`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence risk-exposure assessment for the task "${task.title}" (status: ${task.status}). Associated risk signals: ${riskTitles || "none"}. Identify the most critical risk and recommend a mitigation priority.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess risk exposure for this task, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(tasks, risks);
  const exposed    = correlated.filter((t) => t.matched.length > 0);
  const clean      = correlated.filter((t) => t.matched.length === 0);
  const critExp    = exposed.filter((t) => t.topSev === "critical");

  const displayed =
    tab === "ALL"     ? correlated :
    tab === "EXPOSED" ? exposed    : clean;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Task-Risk Matrix (F61)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ TRISK
        {critExp.length > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{critExp.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ TASK-RISK MATRIX</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["TASKS",   tasks.length,   CY],
              ["RISKS",   risks.length,   PURPLE],
              ["EXPOSED", exposed.length, exposed.length > 0 ? AMBER : "#445566"],
              ["CLEAN",   clean.length,   GREEN],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["ALL", "EXPOSED", "CLEAN"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Task rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating tasks against risk signals…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "EXPOSED" ? "No tasks carry risk exposure." : "No tasks in this filter."}
            </div>
          ) : (
            displayed.map((task) => {
              const sc     = task.topSev ? sevColor(task.topSev) : GREEN;
              const stc    = statusColor(task.status);
              const isOpen = expanded === task.id;
              return (
                <div key={task.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${sc}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : task.id)}>
                  {/* Task header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: stc, border: `1px solid ${stc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{task.status}</span>
                    {task.type && (
                      <span style={{
                        fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(task.type).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{task.title}</span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: task.matched.length > 0 ? sc : GREEN,
                    }}>
                      {task.matched.length > 0
                        ? `${task.matched.length} risk${task.matched.length !== 1 ? "s" : ""}`
                        : "✓ CLEAN"}
                    </span>
                  </div>

                  {task.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {task.description.slice(0, 120)}{task.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  {task.matched.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                        {task.due ? `due: ${String(task.due).slice(0, 10)}` : ""}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); assessTask(task); }}
                        disabled={assessing === task.id}
                        style={{
                          background: assessing === task.id ? "#1a2530" : `${CY}18`,
                          color: assessing === task.id ? "#445566" : CY,
                          border: `1px solid ${CY}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: assessing === task.id ? "default" : "pointer",
                        }}
                      >{assessing === task.id ? "…assessing" : "▶ ASSESS"}</button>
                    </div>
                  )}

                  {/* Expanded risk list */}
                  {isOpen && task.matched.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {task.matched.map((risk) => {
                        const rsc = sevColor(risk.severity);
                        return (
                          <div key={risk.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderLeft: `3px solid ${rsc}`,
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "flex-start", gap: 8,
                          }}>
                            <span style={{
                              fontSize: 7, color: rsc, border: `1px solid ${rsc}55`,
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
                            }}>{risk.severity}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{risk.title}</div>
                              {risk.description && (
                                <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                  {risk.description.slice(0, 80)}{risk.description.length > 80 ? "…" : ""}
                                </div>
                              )}
                              {risk.type && (
                                <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                  type: {risk.type}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                              score {risk._score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen && task.matched.length === 0 && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: GREEN, fontSize: 8,
                    }}>
                      ✓ No risk signals correlated to this task.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Task + /entities/RiskSignal · 90 s auto-refresh · ▶ ASSESS for AI risk-exposure assessment
          </div>
        </div>
      )}
    </>
  );
}
