/**
 * F74 — Report × Task Coverage Mapper
 *
 * Parallel-fetches /v1/reports and /entities/Task, then keyword-correlates
 * each task against the report catalog to surface which tasks have research
 * or evidence backing (BACKED) vs which are running on assumptions alone (DARK).
 *
 * Stat tiles: tasks / reports / backed / dark.
 * Filter tabs: ALL | BACKED | DARK.
 * Expand any task → matched reports with relevance score + year.
 * ▶ ASSESS: 2-sentence AI operational-evidence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RPTASK  at bottom:8 left:9540, zIndex 69.
 * Voice:   "report task / task report / evidence task / rptask / tasks backed by research"
 * Event:   jarvis:rptask-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9540;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const RPTASK_RE =
  /\b(report\s+task|task\s+report|evidence\s+task|rptask|tasks\s+backed\s+(by\s+)?research|which\s+tasks\s+have\s+report|task\s+evidence\s+coverage)\b/i;

export function isRptaskQuery(q) { return RPTASK_RE.test(q); }

export async function buildRptaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [reportRes, taskRes] = await Promise.all([
      fetch(`${base}/v1/reports`,       { headers: hdr }),
      fetch(`${base}/entities/Task`,    { headers: hdr }),
    ]);
    const reports = normaliseReports(await reportRes.json());
    const tasks   = normaliseTasks(await taskRes.json());

    const backed = tasks.filter((t) => reports.some((r) => relevance(t, r) > 0)).length;
    const dark   = tasks.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS report-task coverage: ${tasks.length} active tasks catalogued, ` +
          `${reports.length} reports in the research library, ${backed} tasks have ` +
          `at least one matching report providing evidence backing, ${dark} tasks are ` +
          `operating without documented research support — potential evidence gaps. ` +
          `Give a 2-sentence operational-evidence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Report-task coverage analysis complete, sir.").trim();
  } catch {
    return "Report-task coverage analysis is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.reports)            ? raw.reports
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:    r.id    || String(i),
    title: r.title || r.name  || r.report_name || `Report ${i + 1}`,
    year:  r.year  || r.date  || r.created_at  || "",
    desc:  (r.description || r.summary || r.tags || r.content || "").toString(),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.tasks)              ? raw.tasks
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:     t.id      || String(i),
    title:  t.title   || t.name   || t.task_name || `Task ${i + 1}`,
    status: (t.status || t.state  || "").toLowerCase(),
    desc:   (t.description || t.summary || t.tags || "").toString(),
  }));
}

function taskKeywords(t) {
  return String(`${t.title} ${t.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function reportKeywords(r) {
  return String(`${r.title} ${r.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(task, report) {
  const tw = taskKeywords(task);
  const rw = reportKeywords(report);
  return tw.filter((w) => rw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildLinked(tasks, reports) {
  return tasks.map((t) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(t, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...t, reports: matched, backed: matched.length > 0 };
  }).sort((a, b) => (b.backed ? 1 : 0) - (a.backed ? 1 : 0) || b.reports.length - a.reports.length);
}

// ── colours ───────────────────────────────────────────────────────────────────

function statusColor(s) {
  if (s === "completed" || s === "done")           return "#4ADE80";
  if (s === "in_progress" || s === "active")       return C.neon;
  if (s === "pending"   || s === "review")         return "#F59E0B";
  if (s === "blocked"   || s === "failed")         return "#EF4444";
  return S.text;
}

function scoreColor(v) {
  if (v >= 4) return "#4ADE80";
  if (v >= 2) return C.neon;
  if (v >= 1) return "#F97316";
  return "#EF4444";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "DARK"];

export default function ReportTaskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [tasks,     setTasks]     = useState([]);
  const [reports,   setReports]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [reportRes, taskRes] = await Promise.all([
        fetch(`${base}/v1/reports`,    { headers: hdr }),
        fetch(`${base}/entities/Task`, { headers: hdr }),
      ]);
      setReports(normaliseReports(await reportRes.json()));
      setTasks(normaliseTasks(await taskRes.json()));
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
    window.addEventListener("jarvis:rptask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rptask-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isRptaskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked    = buildLinked(tasks, reports);
  const backedCnt = linked.filter((t) => t.backed).length;
  const darkCnt   = linked.filter((t) => !t.backed).length;

  const visible = linked.filter((t) => {
    if (filter === "BACKED") return t.backed;
    if (filter === "DARK")   return !t.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildRptaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report × Task Coverage (◈ RPTASK)"
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
        ◈ RPTASK{darkCnt > 0 && (
          <span style={{
            marginLeft: 4, background: "#EF4444", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{darkCnt}</span>
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
              REPORTS × TASKS
            </span>
            <button
              onClick={assess}
              disabled={assessing || tasks.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || tasks.length === 0) ? 0.4 : 1,
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
              { label: "TASKS",   val: tasks.length,   color: C.blue    },
              { label: "REPORTS", val: reports.length, color: C.gold    },
              { label: "BACKED",  val: backedCnt,      color: "#4ADE80" },
              { label: "DARK",    val: darkCnt,        color: "#EF4444" },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
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

          {/* Task list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && tasks.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No tasks match.</div>
            ) : visible.map((t) => (
              <div key={t.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${t.backed ? "#4ADE80" : "#EF4444"}`,
                  }}
                >
                  <span style={{ color: t.backed ? "#4ADE80" : "#EF4444", fontSize: 10, width: 10 }}>
                    {t.backed ? "●" : "○"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "9px",
                  }}>
                    {t.title}
                  </span>
                  {t.status && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${statusColor(t.status)}22`, color: statusColor(t.status),
                      border: `1px solid ${statusColor(t.status)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {t.status}
                    </span>
                  )}
                  <span style={{
                    color: t.backed ? "#4ADE80" : "#EF4444",
                    fontSize: "9px", minWidth: 42, textAlign: "right",
                  }}>
                    {t.backed ? `${t.reports.length} RPT${t.reports.length !== 1 ? "S" : ""}` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === t.id ? "▴" : "▾"}</span>
                </div>

                {expanded === t.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {t.backed ? t.reports.map((r) => (
                      <div key={r.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{
                          color: S.textHi, fontSize: "9px", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {r.title}
                        </span>
                        <span style={{
                          fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap",
                          color: scoreColor(r.score),
                        }}>
                          {r.year ? `${r.year} ` : ""}rel:{r.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No reports match this task — operating without documented research backing.
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
            /v1/reports · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
