/**
 * DailyObjectivesPlanner — F76.
 *
 * Parallel-fetches /entities/Task + /v1/aip/skill + /entities/RiskSignal.
 * Scores every active task by urgency (status/priority), risk alignment
 * (keyword-match against open risk signals), and skill coverage (tasks
 * whose keywords match strong skills get a readiness boost).
 * Surfaces the top-5 prioritised daily objectives.
 *
 * Stat tiles: tasks / risks / skills / objectives
 * Filter tabs: ALL / URGENT / RISK-ALIGNED / SKILL-MATCHED
 * List: scored objective cards sorted by composite score.
 * Click ▶ PLAN on any objective → /v1/jarvis/agent/chat AI concrete
 *   action plan + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "daily objectives" / "what should i do today" / "daily plan" /
 *         "today's priorities" / "daily planner" / "objectives" / "doplan"
 *   → jarvis:daily-objectives-toggle + TTS brief via buildDailyObjectivesScript()
 *
 * Toggle: ◎ DAILY at left:6628, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT = 6628;
const REFRESH_MS = 5 * 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id: t.id || t.task_id || String(Math.random()),
    title: t.title || t.name || t.task_name || "Unnamed Task",
    description: t.description || t.summary || t.details || "",
    status: (t.status || "todo").toLowerCase(),
    priority: (t.priority || t.severity || "").toLowerCase(),
    type: t.type || t.category || t.kind || "",
    assignee: t.assignee || t.assigned_to || t.owner || "",
    due: t.due_date || t.due || t.deadline || "",
  }));
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s) => ({
    name: s.name || s.skill_name || s.title || "Unknown",
    score: typeof s.score === "number" ? s.score : typeof s.level === "number" ? s.level : 50,
    category: s.category || s.domain || "",
  }));
}

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.signal_id || String(Math.random()),
    name: r.name || r.title || r.signal || "Unknown Risk",
    description: r.description || r.summary || r.details || "",
    severity: typeof r.severity === "number" ? r.severity :
      r.severity === "critical" ? 95 : r.severity === "high" ? 75 :
      r.severity === "medium" ? 50 : 25,
    status: (r.status || "open").toLowerCase(),
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(a, b) {
  const bSet = new Set(b);
  return a.filter((w) => bSet.has(w)).length;
}

// ─── scoring ──────────────────────────────────────────────────────────────────

const PRIORITY_SCORE = { critical: 40, high: 30, medium: 20, low: 10 };
const STATUS_SCORE = { in_progress: 15, "in-progress": 15, todo: 10, pending: 10, blocked: 5 };

function scoreTask(task, risks, skills) {
  const urgency = (PRIORITY_SCORE[task.priority] || 10) + (STATUS_SCORE[task.status] || 5);
  const taskWords = keywords(`${task.title} ${task.description} ${task.type}`);
  const openRisks = risks.filter((r) => r.status !== "closed" && r.status !== "resolved");
  const riskScore = openRisks.reduce((acc, r) => {
    const rWords = keywords(`${r.name} ${r.description}`);
    const hits = overlap(taskWords, rWords);
    if (hits > 0) acc += Math.min(30, hits * 5 + r.severity * 0.2);
    return acc;
  }, 0);
  const matchedRisks = openRisks.filter((r) => {
    const rWords = keywords(`${r.name} ${r.description}`);
    return overlap(taskWords, rWords) > 0;
  });
  const skillScore = skills.reduce((acc, s) => {
    const sWords = keywords(`${s.name} ${s.category}`);
    if (overlap(taskWords, sWords) > 0) acc += s.score * 0.15;
    return acc;
  }, 0);
  const matchedSkills = skills.filter((s) => {
    const sWords = keywords(`${s.name} ${s.category}`);
    return overlap(taskWords, sWords) > 0;
  });
  const composite = urgency + Math.min(40, riskScore) + Math.min(20, skillScore);
  return {
    ...task,
    score: Math.round(composite),
    urgency,
    riskScore: Math.round(Math.min(40, riskScore)),
    skillScore: Math.round(Math.min(20, skillScore)),
    matchedRisks: matchedRisks.slice(0, 3),
    matchedSkills: matchedSkills.slice(0, 3),
    riskAligned: matchedRisks.length > 0,
    skillMatched: matchedSkills.length > 0,
  };
}

function scoreAll(tasks, risks, skills) {
  return tasks
    .filter((t) => t.status !== "done" && t.status !== "completed" && t.status !== "closed")
    .map((t) => scoreTask(t, risks, skills))
    .sort((a, b) => b.score - a.score);
}

function priorityColor(priority) {
  if (priority === "critical") return RED;
  if (priority === "high") return AMBER;
  if (priority === "medium") return CY;
  return "#445566";
}

function scoreColor(score) {
  if (score >= 70) return RED;
  if (score >= 45) return AMBER;
  if (score >= 25) return CY;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const DAILY_RE =
  /daily.{0,15}(plan|objective|priorit|planner|action)|what.{0,20}(today|do.{0,5}today)|today.{0,15}(priorit|plan|objective)|objective.{0,10}plan|doplan\b|today.{0,10}tasks|daily\s+brief/i;

export function isDailyObjectivesQuery(q) {
  return DAILY_RE.test(q || "");
}

export async function buildDailyObjectivesScript() {
  try {
    const [taskRaw, skillRaw, riskRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/aip/skill`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
    ]);
    const tasks = normaliseTasks(taskRaw);
    const skills = normaliseSkills(skillRaw);
    const risks = normaliseRisks(riskRaw);
    const scored = scoreAll(tasks, risks, skills);
    const top = scored.slice(0, 5);
    const riskAligned = scored.filter((t) => t.riskAligned).length;
    return `Daily objectives analysis complete, sir. ${scored.length} active task${scored.length !== 1 ? "s" : ""} scored across urgency, risk alignment, and skill coverage. ${top.length} top-priority objective${top.length !== 1 ? "s" : ""} identified. ${riskAligned} task${riskAligned !== 1 ? "s" : ""} directly linked to open risk signals. Opening the daily planner now.`;
  } catch (_) {
    return "Daily objectives planner is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function DailyObjectivesPlanner() {
  const [visible, setVisible] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [skills, setSkills] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [planning, setPlanning] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [taskRaw, skillRaw, riskRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/aip/skill`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
      ]);
      setTasks(normaliseTasks(taskRaw));
      setSkills(normaliseSkills(skillRaw));
      setRisks(normaliseRisks(riskRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:daily-objectives-toggle", onToggle);
    return () => window.removeEventListener("jarvis:daily-objectives-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function planObjective(item) {
    setPlanning(item.id);
    const riskContext = item.matchedRisks.map((r) => r.name).join(", ");
    const skillContext = item.matchedSkills.map((s) => `${s.name} (score ${s.score})`).join(", ");
    const prompt = `As JARVIS, provide a concrete 2-sentence action plan for today's objective: "${item.title}". Priority: ${item.priority || "standard"}. ${riskContext ? `Related risk signals: ${riskContext}.` : ""} ${skillContext ? `Available skills: ${skillContext}.` : ""} Focus on immediate next steps the operator should take today.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Proceed with immediate action on this objective, sir. I recommend allocating focused time today.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Action planning unavailable at this time, sir." },
        })
      );
    }
    setPlanning(null);
  }

  const scored = scoreAll(tasks, risks, skills);
  const urgent = scored.filter((t) => t.urgency >= 35);
  const riskAligned = scored.filter((t) => t.riskAligned);
  const skillMatched = scored.filter((t) => t.skillMatched);
  const top5 = scored.slice(0, 5);

  const displayed =
    tab === "URGENT" ? urgent :
    tab === "RISK-ALIGNED" ? riskAligned :
    tab === "SKILL-MATCHED" ? skillMatched :
    top5;

  const urgentCount = urgent.length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Daily Objectives Planner (F76)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◎ DAILY
        {urgentCount > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{urgentCount}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
          width: 560, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.94)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◎ DAILY OBJECTIVES PLANNER</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["TASKS", scored.length, CY],
              ["RISKS", risks.filter((r) => r.status !== "closed").length, RED],
              ["SKILLS", skills.length, GREEN],
              ["TOP OBJ.", top5.length, AMBER],
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
            {[
              ["ALL", top5.length],
              ["URGENT", urgentCount],
              ["RISK-ALIGNED", riskAligned.length],
              ["SKILL-MATCHED", skillMatched.length],
            ].map(([t, count]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4, padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                  letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{t} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}</button>
            ))}
          </div>

          {/* Objective cards */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              scoring objectives across tasks, risks, and skills…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              No objectives in this filter.
            </div>
          ) : (
            displayed.map((item, idx) => {
              const pc = priorityColor(item.priority);
              const sc = scoreColor(item.score);
              const isOpen = expanded === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Objective header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      background: `${sc}22`, border: `1px solid ${sc}55`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: sc, fontSize: 9, fontWeight: "bold",
                    }}>{idx + 1}</span>
                    {item.priority && (
                      <span style={{
                        fontSize: 7, color: pc, border: `1px solid ${pc}44`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                        whiteSpace: "nowrap", textTransform: "uppercase",
                      }}>{item.priority}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, lineHeight: 1.3 }}>{item.title}</span>
                    <span style={{
                      fontSize: 9, color: sc, fontWeight: "bold", whiteSpace: "nowrap",
                    }}>{item.score}pts</span>
                  </div>

                  {/* Score breakdown */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <div style={{
                      fontSize: 7, color: AMBER,
                      border: `1px solid ${AMBER}33`, borderRadius: 3, padding: "1px 5px",
                    }}>urgency {item.urgency}</div>
                    {item.riskScore > 0 && (
                      <div style={{
                        fontSize: 7, color: RED,
                        border: `1px solid ${RED}33`, borderRadius: 3, padding: "1px 5px",
                      }}>risk +{item.riskScore}</div>
                    )}
                    {item.skillScore > 0 && (
                      <div style={{
                        fontSize: 7, color: GREEN,
                        border: `1px solid ${GREEN}33`, borderRadius: 3, padding: "1px 5px",
                      }}>skill +{item.skillScore}</div>
                    )}
                    <div style={{ flex: 1 }} />
                    {item.due && (
                      <div style={{ fontSize: 7, color: "#445566" }}>due {item.due}</div>
                    )}
                  </div>

                  {/* Composite score bar */}
                  <div style={{ height: 2, borderRadius: 1, background: "#1e2d3a", overflow: "hidden", marginBottom: 6 }}>
                    <div style={{
                      height: "100%", borderRadius: 1,
                      width: `${Math.min(100, item.score)}%`,
                      background: sc,
                      transition: "width 0.3s",
                    }} />
                  </div>

                  {/* Description snippet */}
                  {item.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 6 }}>
                      {item.description.slice(0, 100)}{item.description.length > 100 ? "…" : ""}
                    </div>
                  )}

                  {/* Action row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                      {item.assignee ? `Owner: ${item.assignee}` : item.type || ""}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); planObjective(item); }}
                      disabled={planning === item.id}
                      style={{
                        background: planning === item.id ? "#1a2530" : `${CY}18`,
                        color: planning === item.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: planning === item.id ? "default" : "pointer",
                      }}
                    >{planning === item.id ? "…planning" : "▶ PLAN"}</button>
                  </div>

                  {/* Expanded context */}
                  {isOpen && (item.matchedRisks.length > 0 || item.matchedSkills.length > 0) && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {item.matchedRisks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: RED, fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS</div>
                          {item.matchedRisks.map((r) => (
                            <div key={r.id} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "3px 6px", background: `${RED}08`,
                              border: `1px solid ${RED}22`, borderRadius: 3, marginBottom: 3,
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: RED, flexShrink: 0 }} />
                              <span style={{ color: "#c08080", fontSize: 8 }}>{r.name}</span>
                              <span style={{ marginLeft: "auto", fontSize: 7, color: `${RED}88` }}>sev {r.severity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.matchedSkills.length > 0 && (
                        <div>
                          <div style={{ color: GREEN, fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>AVAILABLE SKILLS</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {item.matchedSkills.map((s) => (
                              <span key={s.name} style={{
                                fontSize: 7, padding: "2px 6px",
                                background: `${GREEN}15`, border: `1px solid ${GREEN}44`,
                                borderRadius: 3, color: GREEN,
                              }}>{s.name} ({s.score})</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {isOpen && item.matchedRisks.length === 0 && item.matchedSkills.length === 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: "#334455", fontSize: 8 }}>
                      No direct risk or skill correlations — scored on urgency alone.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Task + /v1/aip/skill + /entities/RiskSignal · 5-min auto-refresh · ▶ PLAN for AI action plan
          </div>
        </div>
      )}
    </>
  );
}
