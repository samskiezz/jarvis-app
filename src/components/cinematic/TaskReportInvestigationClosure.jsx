/**
 * TaskReportInvestigationClosure — F246.
 *
 * Parallel-fetches /entities/Task × /v1/reports × /v1/investigations
 * and keyword-correlates each task against intelligence reports AND
 * open investigations to classify:
 *
 *   CLOSED_OUT      — task has ≥1 matching report AND ≥1 matching investigation
 *   REPORTED_ONLY   — report exists but no investigation
 *   INVESTIGATED_ONLY — investigation exists but no report
 *   OPEN_LOOP       — neither report nor investigation (operational closure gap)
 *
 * Stat tiles: TASKS / REPORTS / INVESTIGATIONS / OPEN_LOOP
 * Amber badge: OPEN_LOOP count on toggle button.
 * Filter tabs: ALL | CLOSED_OUT | REPORTED_ONLY | INVESTIGATED_ONLY | OPEN_LOOP + text search.
 * Expand task → matched report cards (purple) + investigation cards (teal) with relevance bars.
 * ▶ ASSESS CLOSURE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ TROCAS at left:1094480, bottom:8, zIndex:670.
 * Event:   jarvis:trocas-toggle
 * Voice:   "trocas" / "task closure" / "open loop tasks" /
 *          "task report investigation" / "task completion coverage" /
 *          "closure assessment" / "open loop"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM  = "#FFB300";
const CY  = "#00E5FF";
const TE  = "#00BCD4";
const PU  = "#CE93D8";
const RD  = "#FF3D3D";
const GN  = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1094480;
const Z_IDX      = 670;

const TROCAS_RE =
  /\b(trocas|task[._\-\s]closure|open[._\-\s]loop[._\-\s]tasks?|task[._\-\s]report[._\-\s]investigation|task[._\-\s]completion[._\-\s]coverage|closure[._\-\s]assessment|open[._\-\s]loop)\b/i;

export function isTrocasQuery(t) {
  return TROCAS_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normTasks(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.tasks || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:       v.id || String(i),
    name:     v.name || v.title || v.task || `Task ${i + 1}`,
    desc:     v.description || v.detail || v.summary || "",
    status:   v.status || v.state || "",
    priority: v.priority || v.urgency || "",
    type:     v.type || v.category || "",
  }));
}

function normReports(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.reports || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((r, i) => ({
    id:   r.id || String(i),
    name: r.name || r.title || `Report ${i + 1}`,
    desc: r.description || r.summary || r.content || "",
    type: r.type || r.category || "",
    tags: (r.tags || []).join(" "),
  }));
}

function normInvestigations(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.investigations || raw.cases || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || `Investigation ${i + 1}`,
    desc:   inv.description || inv.summary || inv.detail || "",
    status: inv.status || inv.state || "",
    type:   inv.type || inv.category || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(task, other) {
  const tWords = new Set(tokens(`${task.name} ${task.desc} ${task.type} ${task.priority}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""} ${other.tags || ""} ${other.status || ""}`);
  const hits = oWords.filter(w => tWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(tasks, reports, investigations) {
  return tasks.map(task => {
    const matchedReports = reports
      .map(r => ({ ...r, score: relevanceScore(task, r) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedInvestigations = investigations
      .map(inv => ({ ...inv, score: relevanceScore(task, inv) }))
      .filter(inv => inv.score > 0)
      .sort((a, b) => b.score - a.score);

    let closure;
    if (matchedReports.length > 0 && matchedInvestigations.length > 0) {
      closure = "CLOSED_OUT";
    } else if (matchedReports.length > 0) {
      closure = "REPORTED_ONLY";
    } else if (matchedInvestigations.length > 0) {
      closure = "INVESTIGATED_ONLY";
    } else {
      closure = "OPEN_LOOP";
    }

    return { ...task, closure, matchedReports, matchedInvestigations };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildTrocasScript() {
  const base = apiBase();
  const [tRaw, rRaw, iRaw] = await Promise.all([
    fetch(`${base}/entities/Task`,        { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/reports`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/investigations`,    { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const tasks         = normTasks(tRaw);
  const reports       = normReports(rRaw);
  const investigations = normInvestigations(iRaw);
  const rows          = classify(tasks, reports, investigations);
  const openLoop      = rows.filter(r => r.closure === "OPEN_LOOP").length;
  const closedOut     = rows.filter(r => r.closure === "CLOSED_OUT").length;
  return `Operational Closure Assessment online, sir. Of ${tasks.length} active tasks cross-referenced against ${reports.length} intelligence reports and ${investigations.length} open investigations, ${closedOut} tasks have full closure coverage — but ${openLoop} tasks have neither a matching report nor an investigation, representing critical operational closure gaps that require immediate assignment.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function closureColour(c) {
  if (c === "CLOSED_OUT")       return GN;
  if (c === "REPORTED_ONLY")    return PU;
  if (c === "INVESTIGATED_ONLY") return TE;
  return AM;
}

// ── component ────────────────────────────────────────────────────────────────

export default function TaskReportInvestigationClosure() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [taskCount,  setTaskCount]  = useState(0);
  const [repCount,   setRepCount]   = useState(0);
  const [invCount,   setInvCount]   = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [tRaw, rRaw, iRaw] = await Promise.all([
        fetch(`${base}/entities/Task`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/reports`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/investigations`,  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const tasks          = normTasks(tRaw);
      const reports        = normReports(rRaw);
      const investigations = normInvestigations(iRaw);
      setTaskCount(tasks.length);
      setRepCount(reports.length);
      setInvCount(investigations.length);
      setRows(classify(tasks, reports, investigations));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:trocas-toggle", toggle);
    return () => window.removeEventListener("jarvis:trocas-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const openLoop = rows.filter(r => r.closure === "OPEN_LOOP").length;

  const FILTERS = ["ALL", "CLOSED_OUT", "REPORTED_ONLY", "INVESTIGATED_ONLY", "OPEN_LOOP"];

  const visible = rows
    .filter(r => filter === "ALL" || r.closure === filter)
    .filter(r => !search || `${r.name} ${r.desc} ${r.status}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildTrocasScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      const r = await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play();
      }
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: openLoop > 0 ? "rgba(255,179,0,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${openLoop > 0 ? AM : CY}44`,
    color: openLoop > 0 ? AM : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 600, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${AM}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)}>
        ◈ TROCAS{openLoop > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000", borderRadius: 2,
            padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>{openLoop}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>▼ TROCAS</button>
      <div style={panelStyle}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: AM, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◎ OPERATIONAL CLOSURE ASSESSMENT</span>
          <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
            {loading ? "loading…" : `↻ 90s`}
          </span>
          <button onClick={load} disabled={loading}
            style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
              fontFamily: MN, fontSize: 9, padding: "2px 7px", cursor: "pointer", borderRadius: 2 }}>
            ↺
          </button>
        </div>

        {err && <div style={{ color: RD, marginBottom: 8, fontSize: 10 }}>⚠ {err}</div>}

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { label: "TASKS",        val: taskCount, col: CY },
            { label: "REPORTS",      val: repCount,  col: PU },
            { label: "INVEST.",      val: invCount,  col: TE },
            { label: "OPEN LOOP",    val: openLoop,  col: openLoop > 0 ? AM : GN },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: DIM, border: `1px solid ${col}33`, borderRadius: 4,
              padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* closure bar */}
        {rows.length > 0 && (() => {
          const co  = rows.filter(r => r.closure === "CLOSED_OUT").length;
          const pct = Math.round((co / rows.length) * 100);
          return (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9,
                color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
                <span>CLOSURE</span><span>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`,
                  background: pct > 70 ? GN : pct > 40 ? AM : RD, borderRadius: 2,
                  transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })()}

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${closureColour(f === "ALL" ? "CLOSED_OUT" : f)}22` : "none",
                border: `1px solid ${filter === f ? closureColour(f === "ALL" ? "CLOSED_OUT" : f) : "rgba(255,255,255,0.12)"}`,
                color: filter === f ? closureColour(f === "ALL" ? "CLOSED_OUT" : f) : "rgba(255,255,255,0.4)",
                fontFamily: MN, fontSize: 8, padding: "2px 7px", cursor: "pointer", borderRadius: 2,
              }}>
              {f}{f !== "ALL" && ` (${rows.filter(r => r.closure === f).length})`}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            width: "100%", boxSizing: "border-box", background: DIM, border: `1px solid rgba(255,255,255,0.1)`,
            color: "rgba(255,255,255,0.8)", fontFamily: MN, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, marginBottom: 10, outline: "none",
          }}
        />

        {/* rows */}
        {visible.length === 0 && !loading && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center", padding: 16 }}>
            No tasks match current filter.
          </div>
        )}

        {visible.map(task => {
          const col   = closureColour(task.closure);
          const isExp = expanded === task.id;

          return (
            <div key={task.id} style={{
              background: DIM, border: `1px solid ${col}33`, borderRadius: 4,
              marginBottom: 5, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : task.id)}
                style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ color: col, fontSize: 9, fontWeight: 700, minWidth: 110 }}>{task.closure}</span>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 10 }}>{task.name}</span>
                {task.status && (
                  <span style={{
                    background: `${col}22`, border: `1px solid ${col}55`,
                    color: col, fontSize: 8, padding: "1px 5px", borderRadius: 2,
                  }}>{task.status.toUpperCase()}</span>
                )}
                <span style={{ color: PU, fontSize: 9 }}>{task.matchedReports.length}r</span>
                <span style={{ color: TE, fontSize: 9 }}>{task.matchedInvestigations.length}i</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "8px 10px" }}>
                  {task.desc && (
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
                      {task.desc.slice(0, 180)}{task.desc.length > 180 ? "…" : ""}
                    </div>
                  )}

                  {/* reports */}
                  {task.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: PU, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>INTELLIGENCE REPORTS</div>
                      {task.matchedReports.slice(0, 4).map(r => (
                        <div key={r.id} style={{
                          background: `${PU}0A`, border: `1px solid ${PU}33`,
                          borderRadius: 3, padding: "4px 8px", marginBottom: 3,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, flex: 1 }}>{r.name}</span>
                            {r.type && (
                              <span style={{
                                background: `${PU}22`, border: `1px solid ${PU}44`,
                                color: PU, fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              }}>{r.type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round(r.score * 100)}%`,
                              background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* investigations */}
                  {task.matchedInvestigations.length > 0 && (
                    <div>
                      <div style={{ color: TE, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>LINKED INVESTIGATIONS</div>
                      {task.matchedInvestigations.slice(0, 4).map(inv => (
                        <div key={inv.id} style={{
                          background: `${TE}0A`, border: `1px solid ${TE}33`,
                          borderRadius: 3, padding: "4px 8px", marginBottom: 3,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, flex: 1 }}>{inv.name}</span>
                            {inv.status && (
                              <span style={{
                                background: `${TE}22`, border: `1px solid ${TE}44`,
                                color: TE, fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              }}>{inv.status}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round(inv.score * 100)}%`,
                              background: TE, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {task.matchedReports.length === 0 && task.matchedInvestigations.length === 0 && (
                    <div style={{ color: AM, fontSize: 9, fontStyle: "italic" }}>
                      ⚠ No matching reports or investigations found for this task.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* assess */}
        <div style={{ marginTop: 12, borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
          <button onClick={assess} disabled={assessing || loading}
            style={{
              background: assessing ? `${AM}22` : "none",
              border: `1px solid ${AM}66`, color: AM,
              fontFamily: MN, fontSize: 9, letterSpacing: 1, padding: "5px 14px",
              cursor: assessing ? "default" : "pointer", borderRadius: 3,
            }}>
            {assessing ? "◍ assessing…" : "▶ ASSESS OPERATIONAL CLOSURE"}
          </button>
        </div>
      </div>
    </>
  );
}
