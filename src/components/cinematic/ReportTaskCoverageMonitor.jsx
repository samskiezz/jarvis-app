/**
 * ReportTaskCoverageMonitor — F504
 * "JARVIS, report task / task report / rtcov / undocumented tasks / task coverage / tasks backed by reports"
 * Cross-references /v1/reports + /entities/Task.
 * Finds BACKED tasks (≥1 report keyword-matches the task title/description)
 * vs UNMATCHED tasks (no report coverage found).
 * Coverage % tile; ALL/BACKED/UNMATCHED filter tabs + search; click-to-expand matched report detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const RTCOV_RE =
  /\brtcov\b|\breport.?tasks?\b|\btask.?reports?\b|\bundocumented.?tasks?\b|\btask.?coverage\b|\btasks?.?backed\b|\bwhich.?tasks?.?(have|with).?reports?\b|\breport.?coverage.?tasks?\b|\btask.?doc\w*\b/i;

export function isRtcovQuery(text) {
  return RTCOV_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rpt-${i}`,
    title:   r.title || r.name || `Report ${i + 1}`,
    type:    (r.type || r.kind || r.report_type || "OTHER").toUpperCase(),
    author:  r.author || r.created_by || null,
    summary: r.summary || r.description || r.abstract || null,
    status:  (r.status || "PUBLISHED").toUpperCase(),
    tags:    Array.isArray(r.tags) ? r.tags : [],
  }));
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw =
    data.tasks || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:          t.id || `task-${i}`,
    title:       t.title || t.name || t.task_name || `Task ${i + 1}`,
    status:      (t.status || "PENDING").toUpperCase(),
    description: t.description || t.summary || null,
    priority:    (t.priority || "MEDIUM").toUpperCase(),
  }));
}

function crossRef(tasks, reports) {
  return tasks.map((task) => {
    const haystack = `${task.title} ${task.description || ""}`;
    const matches = reports
      .map((rpt) => ({
        rpt,
        hits: overlap(
          haystack,
          `${rpt.title} ${rpt.summary || ""} ${rpt.tags.join(" ")}`,
        ),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...task,
      backed: matches.length > 0,
      matches: matches.map(({ rpt, hits }) => ({ ...rpt, hits })),
    };
  });
}

export async function buildRtcovScript() {
  try {
    const base = apiBase();
    const [rRes, tRes] = await Promise.all([
      fetch(`${base}/v1/reports`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Task`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [rData, tData] = await Promise.all([rRes.json(), tRes.json()]);
    const reports = normaliseReports(rData);
    const tasks   = normaliseTasks(tData);
    const rows    = crossRef(tasks, reports);
    const backed    = rows.filter((r) => r.backed).length;
    const unmatched = rows.length - backed;
    const pct = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No tasks found in the system, sir.";
    return (
      `${backed} of ${tasks.length} tasks are backed by formal reports ` +
      `(${pct}% documentation coverage, ${reports.length} reports in corpus). ` +
      (unmatched > 0
        ? `${unmatched} task${unmatched !== 1 ? "s" : ""} have no matching report — consider drafting documentation for uncovered work.`
        : "All tasks have at least one report backing them — excellent documentation coverage.")
    );
  } catch {
    return "Unable to reach reports or task endpoints, sir.";
  }
}

export default function ReportTaskCoverageMonitor() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [rRes, tRes] = await Promise.all([
        fetch(`${base}/v1/reports`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [rData, tData] = await Promise.all([rRes.json(), tRes.json()]);
      setRows(crossRef(normaliseTasks(tData), normaliseReports(rData)));
    } catch {
      /* network errors are non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rtcov-toggle", toggle);
    return () => window.removeEventListener("jarvis:rtcov-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const backed    = rows.filter((r) => r.backed);
      const unmatched = rows.filter((r) => !r.backed);
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess task documentation coverage: ${rows.length} tasks total, ` +
            `${backed.length} backed by formal reports, ` +
            `${unmatched.length} with no report coverage. ` +
            `Top unmatched tasks: ${unmatched.slice(0, 3).map((t) => t.title).join(", ") || "none"}. ` +
            "Give a 2-sentence documentation brief and recommended action.",
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const backed    = rows.filter((r) => r.backed).length;
  const unmatched = rows.length - backed;
  const pct       = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "BACKED")    return r.backed;
      if (tab === "UNMATCHED") return !r.backed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.priority || "").toLowerCase().includes(q)
      );
    });

  const PRIO_COLOR = { CRITICAL: "#FF4444", HIGH: AMB, MEDIUM: CY, LOW: GRN, NORMAL: CY };
  const STATUS_COLOR = { DONE: GRN, COMPLETE: GRN, COMPLETED: GRN, IN_PROGRESS: CY, PENDING: DIM, BLOCKED: "#FF4444" };

  const TYPE_COLOR = {
    THREAT: "#FF4444", INTEL: AMB, OPS: CY, KNOWLEDGE: GRN,
    REPORT: CY, ANALYSIS: CY, OTHER: DIM,
  };

  const BTN_LEFT = 28_120;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 91,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${unmatched > 0 ? AMB : GRN}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 320,
    bottom: 38,
    zIndex: 91,
    width: 390,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Report × Task Coverage Monitor">
        ◈ RTCOV
        {unmatched > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unmatched}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REPORT × TASK COVERAGE</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "TASKS",     value: rows.length, color: CY },
              { label: "BACKED",    value: backed,      color: backed > 0 ? GRN : DIM },
              { label: "UNMATCHED", value: unmatched,   color: unmatched > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>DOCUMENTATION COVERAGE</span>
              <span style={{ color: pct >= 75 ? GRN : pct >= 40 ? AMB : "#FF4444", fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 75 ? GRN : pct >= 40 ? AMB : "#FF4444", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "BACKED", "UNMATCHED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              marginBottom: 8,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 4,
              color: "#DCEBF5",
              padding: "5px 8px",
              fontFamily: "inherit",
              fontSize: 10,
              boxSizing: "border-box",
            }}
          />

          {/* rows */}
          {loading && !rows.length ? (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 12 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 12 }}>No tasks match filter.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {visible.map((row) => (
                <div
                  key={row.id}
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    border: `1px solid ${row.backed ? GRN : AMB}33`,
                    borderRadius: 6,
                    padding: "7px 9px",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: (row.backed ? GRN : AMB) + "22",
                      color: row.backed ? GRN : AMB,
                      letterSpacing: 1,
                    }}>
                      {row.backed ? "BACKED" : "UNMATCHED"}
                    </span>
                    <span style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: (PRIO_COLOR[row.priority] || DIM) + "22",
                      color: PRIO_COLOR[row.priority] || DIM,
                    }}>
                      {row.priority}
                    </span>
                    <span style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: (STATUS_COLOR[row.status] || DIM) + "22",
                      color: STATUS_COLOR[row.status] || DIM,
                    }}>
                      {row.status}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.title}
                    </span>
                    {row.backed && (
                      <span style={{ color: GRN, fontSize: 9 }}>{row.matches.length} rpt{row.matches.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>

                  {/* expanded: matched reports */}
                  {expanded === row.id && row.backed && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.description && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>{row.description}</div>
                      )}
                      <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>MATCHED REPORTS:</div>
                      {row.matches.slice(0, 4).map((rpt) => (
                        <div key={rpt.id} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${CY}22`, borderRadius: 4, padding: "5px 7px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                            <span style={{
                              fontSize: 8,
                              padding: "1px 4px",
                              borderRadius: 2,
                              background: (TYPE_COLOR[rpt.type] || DIM) + "22",
                              color: TYPE_COLOR[rpt.type] || DIM,
                            }}>
                              {rpt.type}
                            </span>
                            <span style={{ color: "#DCEBF5", fontSize: 9, flex: 1 }}>{rpt.title}</span>
                            <span style={{ color: GRN, fontSize: 8 }}>{rpt.hits} hit{rpt.hits !== 1 ? "s" : ""}</span>
                          </div>
                          {rpt.author && (
                            <div style={{ color: DIM, fontSize: 8 }}>By: {rpt.author}</div>
                          )}
                          {rpt.summary && (
                            <div style={{ color: DIM, fontSize: 8, marginTop: 2, lineHeight: 1.4 }}>
                              {rpt.summary.slice(0, 120)}{rpt.summary.length > 120 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* expanded: unmatched task description */}
                  {expanded === row.id && !row.backed && row.description && (
                    <div style={{ marginTop: 6, color: DIM, fontSize: 9 }}>{row.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "6px",
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}55`,
              borderRadius: 5,
              color: CY,
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: 1,
              cursor: assessing ? "not-allowed" : "pointer",
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
          </button>

          {brief && (
            <div style={{ marginTop: 8, background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, padding: "7px 9px", color: "#DCEBF5", fontSize: 9, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}

          <div style={{ marginTop: 8, color: DIM, fontSize: 8, textAlign: "right" }}>
            auto-refresh 90s · /v1/reports + /entities/Task
          </div>
        </div>
      )}
    </>
  );
}
