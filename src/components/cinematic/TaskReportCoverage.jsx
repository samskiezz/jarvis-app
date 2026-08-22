/**
 * TaskReportCoverage — F84 (TRCV)
 *
 * Parallel-fetches /entities/Task + /v1/reports every 90 s.
 * Keyword-correlates each task against the report catalog.
 * Classification: SUPPORTED (≥1 matching report) vs UNDOCUMENTED (0 reports cover it).
 * Amber badge on undocumented count.
 *
 * Voice intents: "task report / report task / trcv / task documentation /
 *                undocumented tasks / task report coverage / which tasks have reports /
 *                task evidence / task coverage / task analysis gap"
 * Strip button: ◈ TRCV  left:2520 bottom:18 zIndex:68
 * Custom event: jarvis:trcv-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const TRCV_RE =
  /\b(task.report|report.task|trcv|task.doc|undocumented.task|task.report.cover|which.task.*report|task.evidence|task.cover|task.analys|task.report.gap|report.coverage.task|task.support|task.analysis.gap)\b/i;

export function isTrcvQuery(t) { return TRCV_RE.test(t || ""); }
export const isTkrpQuery = isTrcvQuery;

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(task, report) {
  const a = tokenize([
    task.title, task.description, task.priority, task.status,
    (task.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    report.title, report.body, report.type, report.topic,
    (report.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [tr, rr] = await Promise.all([
    fetch(`${base}/entities/Task`,  { headers: hdrs }),
    fetch(`${base}/v1/reports`,     { headers: hdrs }),
  ]);
  const td = tr.ok ? await tr.json() : {};
  const rd = rr.ok ? await rr.json() : {};

  const tasks = (Array.isArray(td) ? td : td?.data || td?.items || td?.results || td?.tasks || []).map(t => ({
    id:          t.id || t._id || String(Math.random()),
    title:       t.title || t.name || "Unnamed Task",
    description: t.description || t.summary || "",
    priority:    t.priority || "",
    status:      t.status || "",
    tags:        t.tags || [],
  }));

  const reports = (Array.isArray(rd) ? rd : rd?.data || rd?.items || rd?.results || rd?.reports || []).map(r => ({
    id:    r.id || r._id || String(Math.random()),
    title: r.title || r.name || "Untitled Report",
    body:  r.body || r.content || r.summary || "",
    type:  r.type || r.report_type || "",
    topic: r.topic || r.category || "",
    tags:  r.tags || [],
  }));

  return { tasks, reports };
}

export const buildTkrpScript = async () => buildTrcvScript();

export async function buildTrcvScript() {
  try {
    const { tasks, reports } = await fetchAll();
    if (!tasks.length) return "No tasks found for report coverage analysis, sir.";
    const undocumented = tasks.filter(t =>
      !reports.some(r => relevance(t, r) > 0.03)
    );
    const supported = tasks.length - undocumented.length;
    return (
      `Task × Report Coverage: ${tasks.length} tasks checked against ${reports.length} reports. ` +
      `${supported} SUPPORTED (covered by at least one report), ${undocumented.length} UNDOCUMENTED (no report coverage). ` +
      (undocumented.length
        ? `Undocumented tasks include: ${undocumented.slice(0, 3).map(t => `"${t.title}"`).join(", ")}. ` +
          `Summarise the task documentation gap in exactly 2 sentences and recommend priority reporting actions.`
        : "All tasks have matching report coverage. Excellent analytical coverage, sir.")
    );
  } catch {
    return "Unable to retrieve task report coverage data at this time, sir.";
  }
}

export default function TaskReportCoverage() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [reports, setReports]   = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessed, setAssessed] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tasks: ts, reports: rs } = await fetchAll();
      setTasks(ts);
      setReports(rs);
      const cor = ts.map(t => {
        const matched = rs
          .map(r => ({ ...r, score: relevance(t, r) }))
          .filter(r => r.score > 0.03)
          .sort((a, b) => b.score - a.score);
        return { ...t, matched, status: matched.length ? "SUPPORTED" : "UNDOCUMENTED" };
      });
      setCorrelated(cor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => { if (!o) load(); return !o; });
    };
    window.addEventListener("jarvis:trcv-toggle", toggle);
    window.addEventListener("jarvis:tkrp-toggle", toggle);
    return () => {
      window.removeEventListener("jarvis:trcv-toggle", toggle);
      window.removeEventListener("jarvis:tkrp-toggle", toggle);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildTrcvScript();
      setAssessed(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = correlated.filter(t => {
    if (filter === "SUPPORTED"     && t.status !== "SUPPORTED")     return false;
    if (filter === "UNDOCUMENTED"  && t.status !== "UNDOCUMENTED")  return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const supported    = correlated.filter(t => t.status === "SUPPORTED").length;
  const undocumented = correlated.filter(t => t.status === "UNDOCUMENTED").length;

  const PANEL = {
    position: "fixed", bottom: 58, left: 2520, zIndex: 69,
    width: 440, maxHeight: "70vh", display: "flex", flexDirection: "column",
    background: "linear-gradient(160deg,#06111B 80%,#0B1D2A)",
    border: `1px solid ${CY}44`, borderRadius: 10,
    boxShadow: `0 0 32px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
    overflow: "hidden",
  };

  return (
    <>
      {/* Strip button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 2520, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "transparent",
          border: `1px solid ${CY}55`, borderRadius: 5,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1.5, padding: "3px 9px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ TRCV
        {undocumented > 0 && (
          <span style={{
            background: AMB, color: "#000", borderRadius: 3,
            fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{undocumented}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: CY, letterSpacing: 2, fontWeight: 700 }}>
              TASK × REPORT COVERAGE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              fontSize: 12, cursor: "pointer",
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "TASKS",        val: correlated.length, col: CY },
              { label: "REPORTS",      val: reports.length,    col: "#B485FF" },
              { label: "SUPPORTED",    val: supported,          col: GRN },
              { label: "UNDOCUMENTED", val: undocumented,       col: AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}0D`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 7, color: "#566878", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            flexWrap: "wrap",
          }}>
            {["ALL", "SUPPORTED", "UNDOCUMENTED"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 3, letterSpacing: 1,
                border: `1px solid ${filter === f ? CY : "#2A3D4F"}`,
                background: filter === f ? `${CY}22` : "transparent",
                color: filter === f ? CY : "#566878", cursor: "pointer", fontFamily: "inherit",
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", fontSize: 8, background: "#0B1D2A",
                border: `1px solid ${CY}33`, borderRadius: 3, color: CY,
                padding: "2px 7px", fontFamily: "inherit", outline: "none", width: 100,
              }}
            />
          </div>

          {/* Task rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && !correlated.length && (
              <div style={{ color: AMB, fontSize: 9, textAlign: "center", padding: 20 }}>
                ◌ loading…
              </div>
            )}
            {visible.map(t => {
              const isExp = expanded === t.id;
              const col = t.status === "SUPPORTED" ? GRN : AMB;
              return (
                <div key={t.id} style={{
                  borderBottom: `1px solid ${CY}11`, padding: "7px 0",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : t.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  >
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                      animation: t.status === "UNDOCUMENTED" ? "trcvpulse 2s infinite" : "none",
                    }}>{t.status}</span>
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{t.title}</span>
                    {t.priority && (
                      <span style={{
                        fontSize: 7, color: t.priority.toLowerCase() === "high" ? RED : "#B485FF",
                        border: `1px solid ${t.priority.toLowerCase() === "high" ? RED : "#B485FF"}44`,
                        borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                      }}>{t.priority.toUpperCase()}</span>
                    )}
                    {t.status && (
                      <span style={{ color: "#566878", fontSize: 8, flexShrink: 0 }}>
                        {t.status}
                      </span>
                    )}
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {t.description && (
                        <div style={{ color: "#8BAABB", fontSize: 8, marginBottom: 6, lineHeight: 1.5 }}>
                          {t.description.slice(0, 160)}{t.description.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {t.matched.length === 0 ? (
                        <div style={{ color: AMB, fontSize: 8 }}>No matching reports found.</div>
                      ) : (
                        t.matched.slice(0, 5).map(r => (
                          <div key={r.id} style={{
                            background: `${GRN}08`, border: `1px solid ${GRN}22`,
                            borderRadius: 5, padding: "5px 8px", marginBottom: 5,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              {r.type && (
                                <span style={{
                                  fontSize: 7, color: "#B485FF",
                                  border: "1px solid #B485FF44",
                                  borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                                }}>{r.type.toUpperCase()}</span>
                              )}
                              <span style={{
                                flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{r.title}</span>
                              <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                                {(r.score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                              <div style={{
                                height: 3, borderRadius: 2,
                                width: `${Math.min(100, r.score * 100)}%`,
                                background: GRN, boxShadow: `0 0 6px ${GRN}`,
                              }} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /entities/Task + /v1/reports
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${correlated.length} tasks · ${reports.length} reports`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes trcvpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
