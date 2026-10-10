/**
 * F120 — Task × Report × Scenario Operational Coverage Nexus (TRSCON)
 *
 * Parallel-fetches /entities/Task + /v1/reports + /v1/scenario/list.
 * Keyword-correlates each task against intelligence reports AND scenario playbooks:
 *   FULLY_DOCUMENTED — matched both a report AND a scenario
 *   REPORT_BACKED    — matched report only
 *   SCENARIO_PLANNED — matched scenario only
 *   UNCOORDINATED    — no matches (coordination gap)
 *
 * Stat tiles: TASKS / REPORTS / SCENARIOS + all four class counts + COVERAGE%.
 * Amber badge on uncoordinated count.
 * Filter tabs ALL / FULLY_DOCUMENTED / REPORT_BACKED / SCENARIO_PLANNED / UNCOORDINATED + text search.
 * Expand task → matched report cards (cyan, type badge) +
 *               scenario cards (purple) with relevance bars.
 * ▶ ASSESS COORDINATION → /v1/jarvis/agent/chat 2-sentence coordination gap brief + TTS.
 * 90-s auto-refresh. jarvis:trscon-toggle event.
 *
 * Voice triggers: "trscon / task report scenario / task coordination / uncoordinated tasks /
 *                  task coverage nexus / task scenario report".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_010_120;
const Z_INDEX  = 182;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const TRSCON_RE = /\b(trscon|task[\s-]report[\s-]scenario|task[\s-]coordination|uncoordinated[\s-]tasks?|task[\s-]coverage[\s-]nexus|task[\s-]scenario[\s-]report)\b/i;

// ── colour palette ────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const RD     = "#EF4444";
const OR     = "#F97316";
const AM     = "#F59E0B";
const PU     = "#A855F7";
const GR     = "#22C55E";
const TE     = "#14B8A6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_DOCUMENTED: GR,
  REPORT_BACKED:    CY,
  SCENARIO_PLANNED: PU,
  UNCOORDINATED:    AM,
};
const TABS = ["ALL", "FULLY_DOCUMENTED", "REPORT_BACKED", "SCENARIO_PLANNED", "UNCOORDINATED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isTrsconQuery(text) {
  return TRSCON_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function words(str) {
  return (str || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function relevance(task, target) {
  const tw = words(
    `${task.name || task.title || ""} ${task.description || ""} ${task.type || ""} ${task.status || ""} ${(task.tags || []).join ? (task.tags || []).join(" ") : ""}`
  );
  const ow = words(
    `${target.name || target.title || ""} ${target.description || ""} ${target.type || ""} ${(target.tags || []).join ? (target.tags || []).join(" ") : ""}`
  );
  if (!tw.length || !ow.length) return 0;
  const hits = tw.filter(w => ow.includes(w)).length;
  return Math.min(100, Math.round((hits / Math.min(tw.length, ow.length)) * 100));
}

function classify(task, reports, scenarios) {
  const rMatches = reports
    .map(r => ({ item: r, score: relevance(task, r) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const sMatches = scenarios
    .map(s => ({ item: s, score: relevance(task, s) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const hasR = rMatches.length > 0;
  const hasS = sMatches.length > 0;
  let cls = "UNCOORDINATED";
  if (hasR && hasS) cls = "FULLY_DOCUMENTED";
  else if (hasR)    cls = "REPORT_BACKED";
  else if (hasS)    cls = "SCENARIO_PLANNED";
  return { cls, rMatches, sMatches };
}

// ── buildTrsconScript (called by JarvisBrain for spoken brief) ────────────────

export async function buildTrsconScript() {
  const base = apiBase();
  const [tasksRaw, reportsRaw, scenariosRaw] = await Promise.all([
    fetch(`${base}/entities/Task`,          { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/reports`,             { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const tasks     = norm(tasksRaw,     ["tasks",     "items", "data", "results"]);
  const reports   = norm(reportsRaw,   ["reports",   "items", "data", "results"]);
  const scenarios = norm(scenariosRaw, ["scenarios", "items", "data", "results"]);

  let fully = 0, repOnly = 0, scOnly = 0, unco = 0;
  tasks.forEach(t => {
    const { cls } = classify(t, reports, scenarios);
    if (cls === "FULLY_DOCUMENTED")  fully++;
    else if (cls === "REPORT_BACKED")    repOnly++;
    else if (cls === "SCENARIO_PLANNED") scOnly++;
    else unco++;
  });
  const pct = tasks.length ? Math.round((fully / tasks.length) * 100) : 0;
  return `Operational Coverage Nexus TRSCON active, sir. Of ${tasks.length} active tasks cross-referenced against ${reports.length} intelligence reports and ${scenarios.length} scenario playbooks, ${fully} are fully documented with both report and scenario backing — that's ${pct}% full coordination coverage. ${unco} tasks remain completely uncoordinated with no report or playbook alignment, requiring immediate attention.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export function TaskReportScenarioCoverage() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [reports, setReports]   = useState([]);
  const [scenarios, setScen]    = useState([]);
  const [classified, setClass]  = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [tRaw, rRaw, sRaw] = await Promise.all([
        fetch(`${base}/entities/Task`,    { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/reports`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const t = norm(tRaw, ["tasks",     "items", "data", "results"]);
      const r = norm(rRaw, ["reports",   "items", "data", "results"]);
      const s = norm(sRaw, ["scenarios", "items", "data", "results"]);
      setTasks(t); setReports(r); setScen(s);
      setClass(t.map(task => ({ task, ...classify(task, r, s) })));
    } catch (e) {
      console.error("TRSCON load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:trscon-toggle", onToggle);
    return () => window.removeEventListener("jarvis:trscon-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    FULLY_DOCUMENTED:  classified.filter(x => x.cls === "FULLY_DOCUMENTED").length,
    REPORT_BACKED:     classified.filter(x => x.cls === "REPORT_BACKED").length,
    SCENARIO_PLANNED:  classified.filter(x => x.cls === "SCENARIO_PLANNED").length,
    UNCOORDINATED:     classified.filter(x => x.cls === "UNCOORDINATED").length,
  };
  const coveragePct = classified.length
    ? Math.round((counts.FULLY_DOCUMENTED / classified.length) * 100) : 0;

  const visible = classified.filter(x => {
    if (tab !== "ALL" && x.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (x.task.name || x.task.title || "").toLowerCase().includes(s) ||
             (x.task.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssess(true); setBrief("");
    try {
      const script = await buildTrsconScript();
      setBrief(script);
      // TTS
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script }),
      });
    } catch { setBrief("Unable to generate coordination assessment at this time, sir."); }
    finally { setAssess(false); }
  }

  if (!open) {
    const uncoBadge = counts.UNCOORDINATED || 0;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Task × Report × Scenario Operational Coverage Nexus (TRSCON)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.92)", border: `1px solid ${CY}44`,
          color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          padding: "4px 9px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ TRSCON
        {uncoBadge > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000", borderRadius: 10,
            padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{uncoBadge}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 24, left: 24, right: 24, bottom: 24, zIndex: Z_INDEX + 100,
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 14,
      fontFamily: FONT, color: "#DCEBF5", display: "flex", flexDirection: "column",
      overflow: "hidden", boxShadow: `0 0 60px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
        borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ TRSCON — TASK × REPORT × SCENARIO COVERAGE NEXUS
        </span>
        {loading && <span style={{ fontSize: 10, color: CY, opacity: .6 }}>updating…</span>}
        <button onClick={load} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}44`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
          ↻ REFRESH
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: `1px solid ${RD}44`,
          color: RD, fontFamily: FONT, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
          ✕ CLOSE
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "12px 18px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["TASKS",        classified.length, CY],
          ["REPORTS",      reports.length,     "#818CF8"],
          ["SCENARIOS",    scenarios.length,   PU],
          ["FULLY DOC.",   counts.FULLY_DOCUMENTED,  GR],
          ["REPORT ONLY",  counts.REPORT_BACKED,     CY],
          ["SCEN. ONLY",   counts.SCENARIO_PLANNED,  PU],
          ["UNCOORD.",     counts.UNCOORDINATED,      AM],
          ["COVERAGE",     `${coveragePct}%`,          coveragePct > 70 ? GR : coveragePct > 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(0,207,255,0.05)", border: `1px solid ${col}33`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: "0 18px 10px", flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginBottom: 4 }}>
          FULL COORDINATION COVERAGE
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${coveragePct}%`, height: "100%",
            background: `linear-gradient(90deg, ${GR}, ${CY})`, borderRadius: 3,
            transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 18px 10px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "#334"}`,
            color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
            fontFamily: FONT, fontSize: 9, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
            letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: "auto", background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "3px 10px", borderRadius: 4,
            outline: "none", width: 180 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 18px" }}>
        {visible.map((x, i) => {
          const taskId = x.task.id || x.task._id || i;
          const isExp = expanded === taskId;
          return (
            <div key={taskId} style={{ marginBottom: 6, border: `1px solid ${CLASS_COLOR[x.cls] || CY}33`,
              borderRadius: 8, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : taskId)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  cursor: "pointer", background: "rgba(0,207,255,0.03)" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: CLASS_COLOR[x.cls] || CY,
                  letterSpacing: 1, minWidth: 120 }}>
                  {x.cls.replace(/_/g, " ")}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x.task.name || x.task.title || x.task.id || "Unnamed Task"}
                </span>
                {x.task.status && (
                  <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>
                    {x.task.status}
                  </span>
                )}
                <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${BORDER}` }}>
                  {x.task.description && (
                    <div style={{ fontSize: 10, color: "#9DB4C6", marginBottom: 8 }}>
                      {x.task.description}
                    </div>
                  )}

                  {/* matched reports */}
                  {x.rMatches.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED REPORTS ({x.rMatches.length})
                      </div>
                      {x.rMatches.map((m, j) => (
                        <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                          background: `${CY}09`, borderRadius: 5, border: `1px solid ${CY}22` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: CY }}>
                              {m.item.title || m.item.name || "Report"}
                            </span>
                            {m.item.type && (
                              <span style={{ fontSize: 8, color: "#818CF8", letterSpacing: 1 }}>{m.item.type}</span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                              <div style={{ width: `${m.score}%`, height: "100%",
                                background: `linear-gradient(90deg, ${CY}, ${GR})`, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 8, color: "#6E8AA0" }}>{m.score}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* matched scenarios */}
                  {x.sMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, letterSpacing: 1, marginBottom: 4 }}>
                        MATCHED SCENARIOS ({x.sMatches.length})
                      </div>
                      {x.sMatches.map((m, j) => (
                        <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                          background: `${PU}09`, borderRadius: 5, border: `1px solid ${PU}22` }}>
                          <div style={{ fontSize: 10, color: PU, marginBottom: 3 }}>
                            {m.item.name || m.item.title || "Scenario"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                              <div style={{ width: `${m.score}%`, height: "100%",
                                background: `linear-gradient(90deg, ${PU}, ${AM})`, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 8, color: "#6E8AA0" }}>{m.score}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {x.rMatches.length === 0 && x.sMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: AM }}>
                      No matching reports or scenarios found — coordination gap detected.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, paddingTop: 40 }}>
            No tasks match the current filter.
          </div>
        )}
      </div>

      {/* assess button + brief */}
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
          border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 10,
          padding: "6px 14px", borderRadius: 5, cursor: assessing ? "wait" : "pointer",
          letterSpacing: 1,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS COORDINATION"}
        </button>
        {brief && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.6,
            borderLeft: `2px solid ${CY}44`, paddingLeft: 10 }}>
            {brief}
          </div>
        )}
      </div>

      <style>{`
        @keyframes trscon-pulse {
          0%,100%{ box-shadow: 0 0 0 0 ${AM}44; }
          50%{ box-shadow: 0 0 0 6px ${AM}00; }
        }
      `}</style>
    </div>
  );
}

export default TaskReportScenarioCoverage;
