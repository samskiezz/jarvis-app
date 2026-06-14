/**
 * TaskBoard — F10 Task Board.
 * Floating mission-card panel sourced from /entities/Task.
 * Status-sorted cards (in_progress → pending → blocked → completed).
 * "JARVIS, tasks" or "JARVIS, missions" opens the board.
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E676";
const GLD = "#FFD700";
const RED = "#FF3B6B";
const GRY = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TASK_RE = /\btask|mission|todo|to-do|objective|assignment|action item/i;

// Status normalisation and ordering
const STATUS_ORDER = { in_progress: 4, active: 4, pending: 3, todo: 3, blocked: 2, failed: 2, completed: 1, done: 1 };
const STATUS_COLOR = {
  in_progress: CY, active: CY,
  pending: GLD, todo: GLD,
  blocked: RED, failed: RED,
  completed: GRN, done: GRN,
};
const STATUS_LABEL = {
  in_progress: "IN PROGRESS", active: "ACTIVE",
  pending: "PENDING", todo: "TODO",
  blocked: "BLOCKED", failed: "FAILED",
  completed: "DONE", done: "DONE",
};

function getStatus(t) {
  return (t.status || t.state || t.task_status || "pending").toLowerCase().replace(/ /g, "_");
}

function getPriority(t) {
  return (t.priority || t.urgency || t.importance || "").toLowerCase();
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)        ? d
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.items)    ? d.items
    : Array.isArray(d?.results)  ? d.results
    : Array.isArray(d?.tasks)    ? d.tasks
    : [];
}

export function isTaskQuery(text) {
  return TASK_RE.test(text || "");
}

export async function buildTaskScript() {
  let tasks = [];
  try { tasks = await fetchTasks(); } catch (_) {}

  if (!tasks.length) return "Mission board is clear, sir. No active tasks on record.";

  const active    = tasks.filter(t => ["in_progress", "active"].includes(getStatus(t)));
  const pending   = tasks.filter(t => ["pending", "todo"].includes(getStatus(t)));
  const blocked   = tasks.filter(t => ["blocked", "failed"].includes(getStatus(t)));
  const completed = tasks.filter(t => ["completed", "done"].includes(getStatus(t)));

  let script = `Mission board: ${tasks.length} task${tasks.length !== 1 ? "s" : ""} on record. `;
  if (active.length)    script += `${active.length} in progress. `;
  if (blocked.length)   script += `${blocked.length} blocked — attention required. `;
  if (pending.length)   script += `${pending.length} pending. `;
  if (completed.length) script += `${completed.length} completed. `;

  if (active.length > 0) {
    const top = active[0];
    const name = top.title || top.name || top.task_name || "unnamed task";
    script += `Priority active: ${name}.`;
  }

  return script.trim();
}

function fmtAge(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 16);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fmtDue(t) {
  if (!t) return null;
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 10);
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  if (diff < 0)  return `overdue ${Math.abs(diff)}d`;
  if (diff === 0) return "due today";
  return `due in ${diff}d`;
}

export default function TaskBoard() {
  const [open,      setOpen]      = useState(false);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchTasks();
      arr.sort((a, b) => (STATUS_ORDER[getStatus(b)] ?? 0) - (STATUS_ORDER[getStatus(a)] ?? 0));
      setTasks(arr);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e?.detail?.text || e?.detail?.query || "");
      if (TASK_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const activeCount  = tasks.filter(t => ["in_progress","active"].includes(getStatus(t))).length;
  const blockedCount = tasks.filter(t => ["blocked","failed"].includes(getStatus(t))).length;

  const STATUS_GROUPS = ["all", "in_progress", "pending", "blocked", "completed"];
  const filtered = filter === "all"
    ? tasks
    : tasks.filter(t => {
        const s = getStatus(t);
        if (filter === "in_progress") return ["in_progress","active"].includes(s);
        if (filter === "pending")     return ["pending","todo"].includes(s);
        if (filter === "blocked")     return ["blocked","failed"].includes(s);
        if (filter === "completed")   return ["completed","done"].includes(s);
        return s === filter;
      });

  const accentColor = blockedCount > 0 ? RED : activeCount > 0 ? CY : GRY;

  return (
    <>
      {/* Toggle button — bottom-left, after RISKS button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Task Board"
        style={{
          position: "fixed", left: 286, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${accentColor}88`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${accentColor}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 13 }}>◈</span>
        TASKS
        {tasks.length > 0 && (
          <span style={{
            background: blockedCount > 0 ? RED : activeCount > 0 ? CY : "#334455",
            color: blockedCount > 0 || activeCount > 0 ? (open ? "#04060A" : "#04060A") : "#aaa",
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {blockedCount > 0 ? `${blockedCount}!` : activeCount || tasks.length}
          </span>
        )}
      </button>

      {/* Task board panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(400px,91vw)", maxHeight: "min(560px,74vh)",
          background: "rgba(4,8,16,0.93)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: CY,
              boxShadow: `0 0 10px ${CY}`, display: "inline-block",
              animation: loading ? "tbpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              MISSION BOARD
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Status filter tabs */}
          <div style={{
            padding: "6px 12px", borderBottom: `1px solid ${CY}14`,
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          }}>
            {STATUS_GROUPS.map(grp => {
              let cnt;
              if (grp === "all")         cnt = tasks.length;
              else if (grp === "in_progress") cnt = tasks.filter(t => ["in_progress","active"].includes(getStatus(t))).length;
              else if (grp === "pending")     cnt = tasks.filter(t => ["pending","todo"].includes(getStatus(t))).length;
              else if (grp === "blocked")     cnt = tasks.filter(t => ["blocked","failed"].includes(getStatus(t))).length;
              else if (grp === "completed")   cnt = tasks.filter(t => ["completed","done"].includes(getStatus(t))).length;
              else cnt = 0;
              const col = grp === "all" ? "#8ba3b8" : (STATUS_COLOR[grp] || CY);
              const lbl = grp === "all" ? "ALL" : STATUS_LABEL[grp] || grp.toUpperCase();
              return (
                <button key={grp} onClick={() => setFilter(grp)} style={{
                  background: filter === grp ? `${col}22` : "transparent",
                  border: `1px solid ${filter === grp ? col : col + "55"}`,
                  borderRadius: 5, color: col, cursor: "pointer",
                  padding: "2px 8px", fontSize: 9, letterSpacing: 1, fontWeight: 700,
                  fontFamily: "'JetBrains Mono',monospace", transition: "all 0.15s",
                }}>
                  {lbl} {cnt}
                </button>
              );
            })}
          </div>

          {/* Task cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {tasks.length === 0 ? "No missions on record." : `No ${filter.replace("_"," ")} tasks.`}
              </div>
            )}
            {filtered.map((t, i) => {
              const status   = getStatus(t);
              const col      = STATUS_COLOR[status] || CY;
              const label    = STATUS_LABEL[status] || status.toUpperCase();
              const isActive = ["in_progress","active"].includes(status);
              const title    = t.title || t.name || t.task_name || t.subject || "Unnamed task";
              const desc     = t.description || t.details || t.summary || t.notes || t.objective || "";
              const owner    = t.assigned_to || t.owner || t.assignee || t.user || "";
              const priority = getPriority(t);
              const created  = t.created_date || t.created_at || t.timestamp;
              const due      = t.due_date || t.deadline || t.target_date;
              const category = t.category || t.type || t.task_type || t.domain || "";
              const dueStr   = fmtDue(due);
              const isOverdue = dueStr?.startsWith("overdue");

              return (
                <div key={t.id || i} style={{
                  margin: "6px 10px",
                  background: `${col}${isActive ? "10" : "07"}`,
                  border: `1px solid ${col}${isActive ? "44" : "28"}`,
                  borderRadius: 8, padding: "9px 12px",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: desc ? 5 : 3 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1,
                      color: col, background: `${col}22`,
                      padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: isActive ? `0 0 8px ${col}` : "none",
                    }}>
                      {label}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 10, color: "#DCEBF5",
                      fontWeight: 700, letterSpacing: 0.4,
                    }}>
                      {title}
                    </span>
                    {isActive && (
                      <span style={{
                        fontSize: 11, color: CY,
                        animation: "tbpulse 1.8s ease-in-out infinite",
                      }}>●</span>
                    )}
                  </div>

                  {/* Description */}
                  {desc && (
                    <p style={{
                      margin: "0 0 5px", fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {desc.length > 130 ? desc.slice(0, 130) + "…" : desc}
                    </p>
                  )}

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {priority && (
                      <span style={{
                        fontSize: 8,
                        color: priority === "high" || priority === "critical" ? RED
                          : priority === "medium" ? GLD : GRY,
                        letterSpacing: 0.8, fontWeight: 700,
                      }}>
                        ▲ {priority.toUpperCase()}
                      </span>
                    )}
                    {category && (
                      <span style={{ fontSize: 8, color: `${col}99`, letterSpacing: 0.8 }}>
                        {category}
                      </span>
                    )}
                    {owner && (
                      <span style={{ fontSize: 8, color: "#566878", letterSpacing: 0.5 }}>
                        @{owner}
                      </span>
                    )}
                    {dueStr && (
                      <span style={{
                        fontSize: 8, color: isOverdue ? RED : "#566878",
                        fontWeight: isOverdue ? 700 : 400, letterSpacing: 0.5,
                      }}>
                        ⏱ {dueStr}
                      </span>
                    )}
                    {created && !due && (
                      <span style={{ fontSize: 8, color: "#566878", marginLeft: "auto" }}>
                        {fmtAge(created)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes tbpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
