/**
 * SwarmTaskAdvisor — F73.
 *
 * Parallel-fetches /entities/Task + /entities/SwarmJob.
 * Keyword-correlates active tasks (title/description/type) against running and
 * queued swarm jobs (name/type/tags) to surface which tasks could be handed to
 * automation vs. need human attention.
 *
 * Stat tiles: tasks / jobs / automatable / manual
 * Filter tabs: ALL / AUTOMATABLE / MANUAL
 * List: tasks sorted by automation score descending; each shows matched jobs.
 * Click ▶ ADVISE on any task → /v1/jarvis/agent/chat AI 2-sentence
 *   assignment recommendation + TTS via jarvis:speak-dossier.
 * 60s auto-refresh.
 *
 * Intent: "swarm task" / "task automation" / "automate tasks" / "task advisor" /
 *         "swtask" / "automation advisor" / "which tasks" / "assign tasks"
 *   → jarvis:swarmtask-toggle + TTS brief via buildSwarmTaskScript()
 *
 * Toggle: ◈ SWTASK at left:6316, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT = 6316;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

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
    type: t.type || t.category || t.kind || "",
    priority: t.priority || t.severity || "",
    assignee: t.assignee || t.assigned_to || t.owner || "",
  }));
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j) => ({
    id: j.id || j.job_id || String(Math.random()),
    name: j.name || j.job_name || j.title || "Unnamed Job",
    status: (j.status || "unknown").toLowerCase(),
    type: j.type || j.job_type || j.kind || "",
    progress: typeof j.progress === "number" ? j.progress : null,
    tags: [...(j.tags || []), ...(j.keywords || [])].map(String),
    agent: j.agent || j.agent_name || j.worker || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function jobMatchScore(task, job) {
  const taskText = `${task.title} ${task.description} ${task.type}`.toLowerCase();
  const jobWords = [
    ...keywords(job.name),
    ...keywords(job.type),
    ...job.tags.flatMap(keywords),
  ];
  return jobWords.reduce((acc, w) => acc + (taskText.includes(w) ? 1 : 0), 0);
}

function correlate(tasks, jobs) {
  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "queued" || j.status === "pending"
  );
  return tasks
    .filter((t) => t.status !== "done" && t.status !== "completed" && t.status !== "closed")
    .map((task) => {
      const matched = activeJobs
        .map((j) => ({ ...j, _score: jobMatchScore(task, j) }))
        .filter((j) => j._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 4);
      return { ...task, matched, automatable: matched.length > 0 };
    });
}

function statusColor(status) {
  if (status === "in-progress" || status === "in_progress") return CY;
  if (status === "todo" || status === "pending") return AMBER;
  if (status === "blocked") return RED;
  return "#445566";
}

function priorityColor(p) {
  const lp = String(p).toLowerCase();
  if (lp === "critical") return RED;
  if (lp === "high") return AMBER;
  if (lp === "medium") return CY;
  return "#445566";
}

function progressColor(progress) {
  if (progress >= 80) return GREEN;
  if (progress >= 40) return CY;
  return AMBER;
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const SWTASK_RE =
  /swarm.{0,10}task|task.{0,10}swarm|automat.{0,10}task|task.{0,10}automat|task\s+advis|swtask\b|assign\s+task|which\s+task|task\s+assignment/i;

export function isSwarmTaskQuery(q) {
  return SWTASK_RE.test(q || "");
}

export async function buildSwarmTaskScript() {
  try {
    const [taskRaw, jobRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const tasks = normaliseTasks(taskRaw);
    const jobs = normaliseJobs(jobRaw);
    const correlated = correlate(tasks, jobs);
    const automatable = correlated.filter((t) => t.automatable);
    const manual = correlated.filter((t) => !t.automatable);
    return `Swarm-task assignment analysis complete, sir. ${tasks.length} active task${tasks.length !== 1 ? "s" : ""} assessed against ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""}. ${automatable.length} task${automatable.length !== 1 ? "s" : ""} ${automatable.length !== 1 ? "have" : "has"} automation candidates identified. ${manual.length} task${manual.length !== 1 ? "s" : ""} require${manual.length === 1 ? "s" : ""} human attention. Select a task to receive a specific assignment recommendation.`;
  } catch (_) {
    return "Swarm-task advisor is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmTaskAdvisor() {
  const [visible, setVisible] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("AUTOMATABLE");
  const [expanded, setExpanded] = useState(null);
  const [advising, setAdvising] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [taskRaw, jobRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setTasks(normaliseTasks(taskRaw));
      setJobs(normaliseJobs(jobRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:swarmtask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swarmtask-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function adviseTask(task) {
    setAdvising(task.id);
    const jobNames = task.matched.map((j) => `${j.name}${j.type ? ` (${j.type})` : ""}`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence assignment recommendation for the task "${task.title}". Matched automation candidates: ${jobNames || "none identified"}. Advise whether to automate via swarm or escalate to human review, and why.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to determine the optimal assignment at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assignment advisory unavailable at this time, sir." },
        })
      );
    }
    setAdvising(null);
  }

  const correlated = correlate(tasks, jobs);
  const automatable = correlated.filter((t) => t.automatable);
  const manual = correlated.filter((t) => !t.automatable);

  const displayed =
    tab === "ALL" ? correlated : tab === "AUTOMATABLE" ? automatable : manual;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm-Task Assignment Advisor (F73)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : AMBER}44`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ SWTASK
        {automatable.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{automatable.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 560, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>◈ SWARM-TASK ASSIGNMENT ADVISOR</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}33`, borderRadius: 3,
                color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
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
              ["TASKS", correlated.length, CY],
              ["JOBS", jobs.length, PURPLE],
              ["AUTOMATABLE", automatable.length, AMBER],
              ["MANUAL", manual.length, "#445566"],
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
            {["ALL", "AUTOMATABLE", "MANUAL"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${tab === t ? AMBER : "#1e3040"}`,
                  color: tab === t ? AMBER : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Task rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating tasks against swarm jobs…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "AUTOMATABLE" ? "No automation candidates found." : "No tasks in this filter."}
            </div>
          ) : (
            displayed.map((task) => {
              const sc = statusColor(task.status);
              const pc = priorityColor(task.priority);
              const isOpen = expanded === task.id;
              return (
                <div key={task.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${AMBER}44` : "#1a2530"}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : task.id)}>
                  {/* Task header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{task.status}</span>
                    {task.priority && (
                      <span style={{
                        fontSize: 7, color: pc, border: `1px solid ${pc}44`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(task.priority).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{task.title}</span>
                    <span style={{
                      fontSize: 7,
                      color: task.automatable ? AMBER : "#334455",
                      border: `1px solid ${task.automatable ? AMBER : "#334455"}44`,
                      borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap",
                    }}>
                      {task.automatable ? `${task.matched.length} job${task.matched.length !== 1 ? "s" : ""}` : "manual"}
                    </span>
                  </div>

                  {/* Description snippet */}
                  {task.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {task.description.slice(0, 120)}{task.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Advise button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                      {task.assignee && `Assignee: ${task.assignee}`}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); adviseTask(task); }}
                      disabled={advising === task.id}
                      style={{
                        background: advising === task.id ? "#1a2530" : `${AMBER}18`,
                        color: advising === task.id ? "#445566" : AMBER,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: advising === task.id ? "default" : "pointer",
                      }}
                    >{advising === task.id ? "…advising" : "▶ ADVISE"}</button>
                  </div>

                  {/* Expanded job list */}
                  {isOpen && task.matched.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18` }}>
                      {task.matched.map((job) => (
                        <div key={job.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 4,
                            background: `${AMBER}22`, border: `1px solid ${AMBER}44`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: AMBER, flexShrink: 0,
                          }}>🤖</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{job.name}</div>
                            <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                              {[job.type, job.status].filter(Boolean).join(" · ")}
                              {job.agent && ` · ${job.agent}`}
                            </div>
                            {job.progress !== null && (
                              <div style={{ marginTop: 4 }}>
                                <div style={{
                                  height: 2, borderRadius: 1, background: "#1e2d3a",
                                  overflow: "hidden", width: "100%",
                                }}>
                                  <div style={{
                                    height: "100%", borderRadius: 1,
                                    width: `${Math.min(100, job.progress)}%`,
                                    background: progressColor(job.progress),
                                    transition: "width 0.3s",
                                  }} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${AMBER}66`, whiteSpace: "nowrap" }}>
                            score {job._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && task.matched.length === 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: "#334455", fontSize: 8 }}>
                      No swarm jobs matched this task — human assignment recommended.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Task + /entities/SwarmJob · 60s auto-refresh · click ▶ ADVISE for AI assignment recommendation
          </div>
        </div>
      )}
    </>
  );
}
