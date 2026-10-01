/**
 * F220 — Scenario × Report × Task Mission Execution Coverage Map (SRTMEC)
 *
 * Parallel-fetches /v1/scenario/list + /v1/reports + /entities/Task
 * and keyword-correlates each scenario against intelligence reports AND active tasks to classify:
 *
 *   FULLY_EXECUTED  — matched reports + tasks (full mission execution coverage)
 *   REPORTED_ONLY   — matched reports, no tasks (documented but not actioned)
 *   TASKED_ONLY     — matched tasks, no reports (actioned but not documented)
 *   UNEXECUTED      — no matches in either source (mission execution gap)
 *
 * Stat tiles: SCENARIOS / REPORTS / TASKS + four class counts + EXECUTION%.
 * Amber badge on UNEXECUTED count.
 * Filter tabs ALL / FULLY_EXECUTED / REPORTED_ONLY / TASKED_ONLY / UNEXECUTED + text search.
 * Expand scenario → matched report cards (purple) + task cards (cyan) with relevance bars.
 * ▶ ASSESS EXECUTION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:srtmec-toggle event.
 *
 * Voice triggers:
 *   "srtmec / scenario execution / mission execution / unexecuted scenario /
 *    scenario task report / mission coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_065_560;
const Z_INDEX  = 281;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SRTMEC_RE = /\b(srtmec|scenario[\s-]execution|mission[\s-]execution|unexecuted[\s-]scenario|scenario[\s-]task[\s-]report|mission[\s-]coverage)\b/i;

export function isSrtmecQuery(q = "") { return SRTMEC_RE.test(q); }

export async function buildSrtmecScript() {
  const base = apiBase();
  const [scnRes, rptRes, tskRes] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
    fetch(`${base}/entities/Task`).then(r => r.json()),
  ]);
  const scenarios = scnRes.status === "fulfilled" ? (scnRes.value?.items || scnRes.value || []) : [];
  const reports   = rptRes.status === "fulfilled" ? (rptRes.value?.items || rptRes.value || []) : [];
  const tasks     = tskRes.status === "fulfilled" ? (tskRes.value?.items || tskRes.value || []) : [];

  let fullyExecuted = 0, unexecuted = 0;
  for (const scn of scenarios) {
    const kws    = keywords(scenarioText(scn));
    const hasRpt = reports.some(r => scoreText(reportText(r), kws) > 0);
    const hasTsk = tasks.some(t => scoreText(taskText(t), kws) > 0);
    if (hasRpt && hasTsk) fullyExecuted++;
    else if (!hasRpt && !hasTsk) unexecuted++;
  }
  const total        = scenarios.length;
  const executionPct = total ? Math.round((fullyExecuted / total) * 100) : 0;
  return `SRTMEC Mission Execution Coverage Map online, sir. I have cross-referenced ${total} scenarios against ${reports.length} intelligence reports and ${tasks.length} active tasks. ${fullyExecuted} scenarios have full execution coverage with both reports and tasks, representing ${executionPct}% mission execution completeness. ${unexecuted} scenarios have no linked reports or tasks — these are unexecuted missions with no documented intelligence or active operational tasking, requiring immediate prioritisation, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A855F7";
const TE   = "#14B8A6";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EXECUTED: GR,
  REPORTED_ONLY:  PU,
  TASKED_ONLY:    CY,
  UNEXECUTED:     AM,
};

const TABS = ["ALL", "FULLY_EXECUTED", "REPORTED_ONLY", "TASKED_ONLY", "UNEXECUTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.category, s.objective, s.phase].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.name, r.title, r.description, r.type, r.tags, r.category, r.author, r.summary].filter(Boolean).join(" ");
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.tags, t.priority, t.status, t.category].filter(Boolean).join(" ");
}

function classify(scenario, reports, tasks) {
  const kws = keywords(scenarioText(scenario));
  const matchedRpt = reports
    .map(r => ({ ...r, _score: scoreText(reportText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedTsk = tasks
    .map(t => ({ ...t, _score: scoreText(taskText(t), kws) }))
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasRpt = matchedRpt.length > 0;
  const hasTsk = matchedTsk.length > 0;

  let cls;
  if (hasRpt && hasTsk) cls = "FULLY_EXECUTED";
  else if (hasRpt)      cls = "REPORTED_ONLY";
  else if (hasTsk)      cls = "TASKED_ONLY";
  else                  cls = "UNEXECUTED";

  return { ...scenario, _cls: cls, _reports: matchedRpt, _tasks: matchedTsk };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2A3A", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, width: pct + "%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function ScenarioReportTaskMissionMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [scenarios, setScenarios]   = useState([]);
  const [reports, setReports]       = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [scnRes, rptRes, tskRes] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
        fetch(`${base}/v1/reports`).then(r => r.json()),
        fetch(`${base}/entities/Task`).then(r => r.json()),
      ]);
      const scn = scnRes.status === "fulfilled" ? (scnRes.value?.items || scnRes.value || []) : [];
      const rpt = rptRes.status === "fulfilled" ? (rptRes.value?.items || rptRes.value || []) : [];
      const tsk = tskRes.status === "fulfilled" ? (tskRes.value?.items || tskRes.value || []) : [];
      setScenarios(scn);
      setReports(rpt);
      setTasks(tsk);
      setClassified(scn.map(s => classify(s, rpt, tsk)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:srtmec-toggle", onToggle);
    return () => window.removeEventListener("jarvis:srtmec-toggle", onToggle);
  }, []);

  const fullyExecuted = classified.filter(c => c._cls === "FULLY_EXECUTED").length;
  const reportedOnly  = classified.filter(c => c._cls === "REPORTED_ONLY").length;
  const taskedOnly    = classified.filter(c => c._cls === "TASKED_ONLY").length;
  const unexecuted    = classified.filter(c => c._cls === "UNEXECUTED").length;
  const total         = classified.length;
  const executionPct  = total ? Math.round((fullyExecuted / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || scenarioText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `SRTMEC: ${total} scenarios — FULLY_EXECUTED: ${fullyExecuted}, REPORTED_ONLY: ${reportedOnly}, TASKED_ONLY: ${taskedOnly}, UNEXECUTED: ${unexecuted} (${executionPct}% full execution). Reports: ${reports.length}. Tasks: ${tasks.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SRTMEC mission execution coverage assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which unexecuted scenarios pose the highest operational risk and what immediate tasking or intelligence reporting actions should be prioritised. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Execution assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Report × Task Mission Execution Coverage Map (SRTMEC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${TE}55`,
          color: TE, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unexecuted > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unexecuted}
          </span>
        )}
        ◈ SRTMEC
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: TE, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ SRTMEC</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Scenario × Report × Task Mission Execution Coverage Map
        </span>
        {loading && <span style={{ color: TE, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["SCENARIOS",       total,          TE],
          ["REPORTS",         reports.length, PU],
          ["TASKS",           tasks.length,   CY],
          ["FULLY EXECUTED",  fullyExecuted,  GR],
          ["REPORTED ONLY",   reportedOnly,   PU],
          ["TASKED ONLY",     taskedOnly,     CY],
          ["UNEXECUTED",      unexecuted,     AM],
          ["EXECUTION%",      executionPct + "%", executionPct >= 70 ? GR : executionPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(20,184,166,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Execution coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          MISSION EXECUTION COVERAGE — {executionPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: executionPct + "%",
            background: executionPct >= 70 ? GR : executionPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(TE), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS EXECUTION"}
        </button>
        {brief && (
          <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? TE : "#4A6A80"),
            background: tab === t ? TE + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            background: "rgba(20,184,166,0.05)", border: `1px solid ${TE}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 170,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} scenarios
        </span>
      </div>

      {/* Scenario list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading scenarios…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((scn, i) => {
            const col    = CLASS_COLOR[scn._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxRpt = scn._reports[0]?._score || 1;
            const maxTsk = scn._tasks[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(20,184,166,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {scn._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {scn.name || scn.title || `Scenario ${i + 1}`}
                  </span>
                  {scn.type && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{scn.type}</span>
                  )}
                  {scn.phase && (
                    <span style={{ fontSize: 9, color: "#4A6A80", marginLeft: 4 }}>{scn.phase}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {scn.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {scn.description}
                      </div>
                    )}

                    {/* Matched reports */}
                    {scn._reports.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED REPORTS ({scn._reports.length})
                        </div>
                        {scn._reports.map((r, ri) => (
                          <div key={ri} style={{
                            background: PU + "11", border: `1px solid ${PU}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: PU, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name || r.title || `Report ${ri + 1}`}
                              </span>
                              {r.type && (
                                <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {r.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={r._score} max={maxRpt} col={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched tasks */}
                    {scn._tasks.length > 0 && (
                      <div>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED TASKS ({scn._tasks.length})
                        </div>
                        {scn._tasks.map((t, ti) => (
                          <div key={ti} style={{
                            background: CY + "11", border: `1px solid ${CY}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.name || t.title || `Task ${ti + 1}`}
                              </span>
                              {t.priority && (
                                <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {t.priority}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={t._score} max={maxTsk} col={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {scn._cls === "UNEXECUTED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching reports or tasks found. Scenario has no documented intelligence coverage or active operational tasking.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No scenarios match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
