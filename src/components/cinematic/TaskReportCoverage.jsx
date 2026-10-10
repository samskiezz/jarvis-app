/**
 * TaskReportCoverage — F62
 * /entities/Task × /v1/reports → keyword-correlates open tasks against the
 * reports catalogue to classify DOCUMENTED vs UNDOCUMENTED (documentation gap).
 * Voice trigger: "task report"/"task docs"/"trep"/"undocumented tasks"/
 *   "task documentation"/"which tasks have reports"/"task report coverage".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TREP_RE =
  /\btask\s*report\b|\btask\s*docs?\b|\btrep\b|\bundocumented\s*tasks?\b|\btask\s*documentation\b|\bwhich\s*tasks?\s*(?:have\s*)?reports?\b|\btask\s*report\s*coverage\b|\breport\s*task\s*gap\b|\btask\s*evidence\b/i;

export function isTaskRepQuery(text) {
  return TREP_RE.test(text || "");
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)              ? d
    : Array.isArray(d?.items)          ? d.items
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : Array.isArray(d?.tasks)          ? d.tasks
    : [];
}

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)              ? d
    : Array.isArray(d?.items)          ? d.items
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : Array.isArray(d?.reports)        ? d.reports
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.label, obj?.description,
    obj?.type, obj?.category, obj?.status, obj?.priority,
    obj?.tags?.join?.(" "), obj?.notes, obj?.summary,
    obj?.subject, obj?.topic,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(tasks, reports) {
  return tasks.map((task) => {
    const taskKw = keywords(task);
    const matched = reports.filter((rep) => {
      const repKw = keywords(rep);
      const taskTokens = taskKw.split(/\W+/).filter((t) => t.length > 3);
      const repTokens  = repKw.split(/\W+/).filter((t) => t.length > 3);
      return taskTokens.some((t) => repKw.includes(t)) || repTokens.some((t) => taskKw.includes(t));
    });
    return { task, matched, status: matched.length > 0 ? "DOCUMENTED" : "UNDOCUMENTED" };
  });
}

export async function buildTaskRepScript() {
  const [tasks, reports] = await Promise.all([fetchTasks(), fetchReports()]);
  const rows         = correlate(tasks, reports);
  const documented   = rows.filter((r) => r.status === "DOCUMENTED");
  const undocumented = rows.filter((r) => r.status === "UNDOCUMENTED");
  if (!rows.length) return "No task data available, sir.";
  const topUndocumented = undocumented
    .slice(0, 3)
    .map((r) => r.task?.name || r.task?.title || "Unknown")
    .join(", ");
  return (
    `Task Report Documentation Coverage: ${rows.length} tasks assessed against ${reports.length} reports. ` +
    `${documented.length} DOCUMENTED, ${undocumented.length} UNDOCUMENTED. ` +
    (undocumented.length
      ? `Top undocumented tasks: ${topUndocumented}.`
      : "All open tasks have backing reports, sir.")
  );
}

export default function TaskReportCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [tasks, reports] = await Promise.all([fetchTasks(), fetchReports()]);
      setRows(correlate(tasks, reports));
    } catch {
      // stale data stays
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:trep-toggle", toggle);
    return () => window.removeEventListener("jarvis:trep-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const documented   = rows.filter((r) => r.status === "DOCUMENTED");
  const undocumented = rows.filter((r) => r.status === "UNDOCUMENTED");

  const visible = rows.filter((r) => {
    if (filter === "DOCUMENTED"   && r.status !== "DOCUMENTED")   return false;
    if (filter === "UNDOCUMENTED" && r.status !== "UNDOCUMENTED") return false;
    if (search) {
      const kw = (r.task?.name || r.task?.title || "").toLowerCase();
      if (!kw.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    setAssessing(row.task?.id || row.task?.name);
    const taskName     = row.task?.name || row.task?.title || "Unknown task";
    const matchedNames = row.matched.map((rp) => rp.name || rp.title || "Unknown").join(", ") || "none";
    const prompt =
      `Task "${taskName}" is ${row.status}. ` +
      (row.matched.length
        ? `Backing reports: ${matchedNames}.`
        : "No reports currently document this task.") +
      " Provide a 2-sentence documentation gap brief and recommended action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const undocCount = undocumented.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Task × Report Documentation Coverage (F62)"
        style={{
          position: "fixed", left: 15720, bottom: 8, zIndex: 70,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${undocCount > 0 ? AMB : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: undocCount > 0 ? AMB : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ TREP{undocCount > 0 && <sup style={{ color: AMB, marginLeft: 2 }}>{undocCount}</sup>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ TASK × REPORT DOCUMENTATION COVERAGE
          </span>
          {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>}
          <button onClick={() => setOpen(false)}
            style={{ marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "TASKS",        val: rows.length,        col: CY  },
            { label: "REPORTS",      val: rows.length > 0 ? rows.reduce((a, r) => a + r.matched.length, 0) : 0, col: CY },
            { label: "DOCUMENTED",   val: documented.length,  col: GRN },
            { label: "UNDOCUMENTED", val: undocumented.length, col: AMB },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 120px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search tasks…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No tasks match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const name  = row.task?.name || row.task?.title || `Task ${i}`;
          const isExp = expanded === i;
          const col   = row.status === "DOCUMENTED" ? GRN : AMB;
          const busy  = assessing === (row.task?.id || row.task?.name);
          return (
            <div key={i} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 100 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{name}</span>
                {row.task?.status && (
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{row.task.status}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} report{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {row.matched.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 11, marginBottom: 8 }}>
                      No matching reports — this task is UNDOCUMENTED.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((rep, j) => (
                        <div key={j} style={{
                          background: "rgba(74,222,128,0.07)", border: `1px solid ${GRN}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: GRN }}>{rep.name || rep.title || "Report"}</div>
                          {rep.type && (
                            <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 1 }}>{rep.type}</div>
                          )}
                          {rep.description && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 240 }}>
                              {rep.description.slice(0, 80)}{rep.description.length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
