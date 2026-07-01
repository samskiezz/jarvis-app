/**
 * F65 — Swarm-to-Task Convergence Tracker
 *
 * Parallel-fetches /entities/SwarmJob + /entities/Task, then
 * keyword-correlates each swarm job (name / objective / type / status)
 * against every task (title / description / priority / status) to surface
 * ALIGNED pairs (jobs advancing known tasks) vs UNMATCHED items.
 *
 * Stat tiles: jobs / tasks / aligned / convergence %.
 * Filter tabs: ALL | ALIGNED | UNMATCHED.
 * Text search over name / type.
 * Expand any job → matched tasks with relevance score + status badge.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence convergence brief + TTS.
 *
 * Toggle:  ◈ SWTASK  at bottom:8 left:14380, zIndex 69.
 * Voice:   "swarm task convergence / swarm alignment / which jobs match tasks /
 *           swarm convergence / swtask"
 * Event:   jarvis:swconv-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 14380;
const POLL_MS  = 60_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const SWTASK_RE =
  /\b(swarm[\s-]*task\s+converg|swarm\s+align(?:ment)?|which\s+jobs?\s+(match|advance)\s+tasks?|swarm\s+converg(?:ence)?|swtask)\b/i;

export function isSwarmConvergenceQuery(q) { return SWTASK_RE.test(q); }

export async function buildSwarmConvergenceScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sRes, tRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/entities/Task`,     { headers: hdr }),
    ]);
    const sRaw = await sRes.json();
    const tRaw = await tRes.json();
    const jobs  = normaliseJobs(sRaw);
    const tasks = normaliseTasks(tRaw);

    const aligned   = jobs.filter((j) => tasks.some((t) => relevance(j, t) > 0)).length;
    const pct       = jobs.length ? Math.round((aligned / jobs.length) * 100) : 0;
    const running   = jobs.filter((j) => j.status === "running").length;
    const topTask   = tasks.find((t) => (t.priority || "").toLowerCase() === "critical") ||
                      tasks.find((t) => (t.priority || "").toLowerCase() === "high") ||
                      tasks[0];

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm-task convergence analysis: ${jobs.length} swarm jobs (${running} running), ` +
          `${tasks.length} active tasks, ${aligned} swarm jobs are advancing known tasks (${pct}% convergence). ` +
          `${topTask ? `Highest-priority task: "${topTask.title}" (${topTask.priority || "unknown priority"}). ` : ""}` +
          `Give a 2-sentence convergence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm-task convergence analysis complete, sir.").trim();
  } catch {
    return "Swarm-task convergence tracker unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.jobs)             ? raw.jobs
    : Array.isArray(raw?.swarm_jobs)       ? raw.swarm_jobs
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((j, i) => ({
    id:        j.id         || String(i),
    name:      j.name       || j.title     || j.job_name  || `SwarmJob ${i + 1}`,
    objective: (j.objective || j.description || j.goal    || "").toString().slice(0, 200),
    type:      j.type       || j.job_type  || j.category  || "",
    status:    (j.status    || "unknown").toLowerCase(),
    progress:  typeof j.progress === "number" ? j.progress : null,
  }));
}

const TASK_STATUS_ORDER = { in_progress: 0, pending: 1, blocked: 2, completed: 3, cancelled: 4 };
const TASK_PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.tasks)            ? raw.tasks
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr
    .map((t, i) => ({
      id:          t.id          || String(i),
      title:       t.title       || t.name        || t.task_name || `Task ${i + 1}`,
      description: (t.description || t.summary    || t.details   || "").toString().slice(0, 200),
      status:      (t.status      || "unknown").toLowerCase().replace(/\s+/g, "_"),
      priority:    (t.priority    || "unknown").toLowerCase(),
    }))
    .sort((a, b) =>
      (TASK_STATUS_ORDER[a.status] ?? 9) - (TASK_STATUS_ORDER[b.status] ?? 9) ||
      (TASK_PRIORITY_ORDER[a.priority] ?? 9) - (TASK_PRIORITY_ORDER[b.priority] ?? 9)
    );
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(job, task) {
  const jw = keywords(`${job.name} ${job.objective} ${job.type}`);
  const tw = keywords(`${task.title} ${task.description}`);
  return jw.filter((w) => tw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelated(jobs, tasks) {
  return jobs.map((j) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(j, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) =>
        (TASK_STATUS_ORDER[a.status] ?? 9) - (TASK_STATUS_ORDER[b.status] ?? 9) ||
        b.score - a.score
      );
    return { ...j, tasks: matched, aligned: matched.length > 0 };
  });
}

function statusColor(s) {
  if (s === "running")     return "#4ADE80";
  if (s === "queued")      return "#FFD700";
  if (s === "failed")      return "#FF3333";
  if (s === "completed")   return "#6B7280";
  if (s === "in_progress") return "#4ADE80";
  if (s === "pending")     return "#FFD700";
  if (s === "blocked")     return "#FF8800";
  return "#6B7280";
}

function priorityColor(p) {
  if (p === "critical") return "#FF3333";
  if (p === "high")     return "#FF8800";
  if (p === "medium")   return "#FFD700";
  if (p === "low")      return "#4ADE80";
  return "#6B7280";
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ALIGNED", "UNMATCHED"];

export default function SwarmTaskConvergence() {
  const [open,      setOpen]      = useState(false);
  const [jobs,      setJobs]      = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, tRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/entities/Task`,     { headers: hdr }),
      ]);
      const sRaw = await sRes.json();
      const tRaw = await tRes.json();
      setJobs(normaliseJobs(sRaw));
      setTasks(normaliseTasks(tRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:swconv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swconv-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSwarmConvergenceQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(jobs, tasks);
  const aligned    = correlated.filter((j) => j.aligned).length;
  const pct        = jobs.length ? Math.round((aligned / jobs.length) * 100) : 0;

  const q = search.toLowerCase();
  const visible = correlated.filter((j) => {
    if (filter === "ALIGNED")   return j.aligned;
    if (filter === "UNMATCHED") return !j.aligned;
    return true;
  }).filter((j) =>
    !q ||
    j.name.toLowerCase().includes(q) ||
    j.type.toLowerCase().includes(q) ||
    j.status.toLowerCase().includes(q)
  );

  async function assess() {
    setAssessing(true);
    const text = await buildSwarmConvergenceScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm-to-Task Convergence Tracker (◈ SWTASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SWTASK{aligned > 0 && (
          <span style={{
            marginLeft: 4, background: C.neon, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{pct}%</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              SWARM↔TASK CONVERGENCE
            </span>
            <button
              onClick={assess}
              disabled={assessing || jobs.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || jobs.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "JOBS",     val: jobs.length,  color: C.neon    },
              { label: "TASKS",    val: tasks.length, color: C.blue    },
              { label: "ALIGNED",  val: aligned,      color: "#4ADE80" },
              { label: "CONVERG.", val: `${pct}%`,    color: pct >= 60 ? "#4ADE80" : pct >= 30 ? "#FFD700" : "#FF8800" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search name / type / status…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: "9px", padding: "3px 7px",
                outline: "none",
              }}
            />
          </div>

          {/* Job list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && jobs.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No swarm jobs match.</div>
            ) : visible.map((j) => (
              <div key={j.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${j.aligned ? "#4ADE80" : "#6B7280"}`,
                  }}
                >
                  <span style={{ color: statusColor(j.status), fontSize: 10, width: 10 }}>
                    {j.aligned ? "●" : "○"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {j.name}
                  </span>
                  <span style={{
                    fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                    background: `${statusColor(j.status)}22`, color: statusColor(j.status),
                    border: `1px solid ${statusColor(j.status)}55`,
                    whiteSpace: "nowrap", textTransform: "uppercase",
                  }}>
                    {j.status}
                  </span>
                  <span style={{
                    color: j.aligned ? "#4ADE80" : "#6B7280",
                    fontSize: "9px", minWidth: 40, textAlign: "right",
                  }}>
                    {j.aligned ? `${j.tasks.length}T` : "—"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>
                    {expanded === j.id ? "▴" : "▾"}
                  </span>
                </div>

                {expanded === j.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {j.type && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                        type: <span style={{ color: S.textHi }}>{j.type}</span>
                      </div>
                    )}
                    {j.aligned ? j.tasks.map((t) => (
                      <div key={t.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                          background: `${priorityColor(t.priority)}22`, color: priorityColor(t.priority),
                          border: `1px solid ${priorityColor(t.priority)}55`,
                          whiteSpace: "nowrap", textTransform: "uppercase",
                        }}>
                          {t.priority || "?"}
                        </span>
                        <span style={{
                          color: S.textHi, fontSize: "9px", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {t.title}
                        </span>
                        <span style={{
                          fontSize: "8px", color: statusColor(t.status),
                          whiteSpace: "nowrap",
                        }}>
                          {t.status}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 2, whiteSpace: "nowrap" }}>
                          rel:{t.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching tasks found for this swarm job.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/SwarmJob · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
