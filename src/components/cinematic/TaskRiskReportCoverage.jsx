/**
 * F94 — Task × RiskSignal × Report Operational Threat Coverage (TORTCOV)
 * Parallel-fetches /entities/Task + /entities/RiskSignal + /v1/reports.
 * Keyword-correlates each task against active risk signals AND intelligence reports to classify:
 *   FULLY_COVERED (both match) | RISK_FLAGGED (risk signal only)
 *   REPORT_BACKED (report only) | UNMONITORED (neither)
 * Stat tiles + coverage bar. Red pulse badge on unmonitored count.
 * Filter tabs ALL/FULLY_COVERED/RISK_FLAGGED/REPORT_BACKED/UNMONITORED + text search.
 * Expand task → matched risk signal cards (red) + report cards (purple) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "tortcov/task risk report/operational threat coverage/unmonitored task/task threat coverage".
 * Event: jarvis:tortcov-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 995_560;
const Z_INDEX  = 156;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const TORTCOV_RE = /\b(tortcov|task\s+risk\s+report|operational\s+threat\s+coverage|unmonitored\s+task|task\s+threat\s+coverage|task\s+report\s+risk|threat\s+task\s+coverage|task\s+coverage\s+report)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const GR = "#22C55E";
const RD = "#EF4444";
const PU = "#A855F7";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED:  GR,
  RISK_FLAGGED:   RD,
  REPORT_BACKED:  PU,
  UNMONITORED:    AM,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isTortcovQuery(text) {
  return TORTCOV_RE.test(text || "");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const setA = new Set(kwTokens(aStr));
  return kwTokens(bStr).some(w => setA.has(w));
}

function matchScore(taskStr, targetStr) {
  const ra = kwTokens(taskStr);
  const ta = new Set(kwTokens(targetStr));
  const hits = ra.filter(w => ta.has(w)).length;
  return Math.min(100, Math.round((hits / Math.max(1, ra.length)) * 200));
}

function classify(task, signals, reports) {
  const tStr = [task.name, task.title, task.description, task.type, task.status, task.priority]
    .filter(Boolean).join(" ");
  const matchedSignals = signals.filter(s =>
    overlap(tStr, [s.title, s.description, s.type, s.severity, s.category].filter(Boolean).join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlap(tStr, [r.title, r.description, (r.tags || []).join(" "), r.type, r.author].filter(Boolean).join(" "))
  );
  const hasS = matchedSignals.length > 0;
  const hasR = matchedReports.length > 0;
  const cls = hasS && hasR ? "FULLY_COVERED" : hasS ? "RISK_FLAGGED" : hasR ? "REPORT_BACKED" : "UNMONITORED";
  return { ...task, _cls: cls, _signals: matchedSignals, _reports: matchedReports, _tStr: tStr };
}

export async function buildTortcovScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [tr, sr, rr] = await Promise.all([
      fetch(`${base}/entities/Task`,        { headers: h }).then(r => r.json()),
      fetch(`${base}/entities/RiskSignal`,  { headers: h }).then(r => r.json()),
      fetch(`${base}/v1/reports`,           { headers: h }).then(r => r.json()),
    ]);
    const tasks   = norm(tr, ["tasks","items","data","results"]);
    const signals = norm(sr, ["signals","items","data","results"]);
    const reports = norm(rr, ["reports","items","data","results"]);
    const rows    = tasks.map(t => classify(t, signals, reports));
    const fc      = rows.filter(r => r._cls === "FULLY_COVERED").length;
    const rf      = rows.filter(r => r._cls === "RISK_FLAGGED").length;
    const rb      = rows.filter(r => r._cls === "REPORT_BACKED").length;
    const um      = rows.filter(r => r._cls === "UNMONITORED").length;
    const covPct  = rows.length ? Math.round(((fc + rf + rb) / rows.length) * 100) : 0;
    const prompt  = `JARVIS operational threat coverage analysis: ${rows.length} active tasks cross-referenced against ${signals.length} risk signals and ${reports.length} intelligence reports. Coverage breakdown: ${fc} fully covered (both risk + report), ${rf} risk-flagged only, ${rb} report-backed only, ${um} unmonitored (${covPct}% overall coverage). Provide a 2-sentence operational threat coverage brief identifying the most critical unmonitored tasks and recommended immediate actions, in JARVIS voice.`;
    const ar = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({ message: prompt }),
    }).then(r => r.json());
    return (ar.answer || `Operational threat coverage at ${covPct}%, sir. ${um} tasks currently unmonitored — recommend immediate risk signal correlation and intelligence report assignment for priority mission continuity.`).replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return "Operational threat coverage matrix online, sir. Correlating all active tasks against risk signals and intelligence reports to identify unmonitored exposure now.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_COVERED", "RISK_FLAGGED", "REPORT_BACKED", "UNMONITORED"];

export default function TaskRiskReportCoverage() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState("");
  const pollRef               = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [tr, sr, rr] = await Promise.all([
        fetch(`${base}/entities/Task`,        { headers: h }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`,  { headers: h }).then(r => r.json()),
        fetch(`${base}/v1/reports`,           { headers: h }).then(r => r.json()),
      ]);
      const tasks   = norm(tr, ["tasks","items","data","results"]);
      const signals = norm(sr, ["signals","items","data","results"]);
      const reports = norm(rr, ["reports","items","data","results"]);
      setRows(tasks.map(t => classify(t, signals, reports)));
    } catch { /* keep stale */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:tortcov-toggle", handler);
    return () => window.removeEventListener("jarvis:tortcov-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const counts = {
    ALL:           rows.length,
    FULLY_COVERED: rows.filter(r => r._cls === "FULLY_COVERED").length,
    RISK_FLAGGED:  rows.filter(r => r._cls === "RISK_FLAGGED").length,
    REPORT_BACKED: rows.filter(r => r._cls === "REPORT_BACKED").length,
    UNMONITORED:   rows.filter(r => r._cls === "UNMONITORED").length,
  };

  const covPct = rows.length
    ? Math.round(((counts.FULLY_COVERED + counts.RISK_FLAGGED + counts.REPORT_BACKED) / rows.length) * 100)
    : 0;

  const visible = rows.filter(r =>
    (tab === "ALL" || r._cls === tab) &&
    (!search || (r.name || r.title || "").toLowerCase().includes(search.toLowerCase()))
  );

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildTortcovScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text: script } }));
    } catch { setBrief("Coverage assessment failed — check backend connectivity."); }
    setAssessing(false);
  }

  const sevColor = s => ({ CRITICAL: RD, HIGH: "#F97316", MEDIUM: AM, LOW: GR }[String(s || "").toUpperCase()] || "#6E8AA0");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${counts.UNMONITORED > 0 ? AM : CY}55`,
          color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 2, padding: "5px 10px",
          borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
        }}
        title="Task × RiskSignal × Report Operational Threat Coverage"
      >
        ◈ TORTCOV
        {counts.UNMONITORED > 0 && (
          <span style={{
            marginLeft: 6, background: AM, color: "#000", borderRadius: 8,
            padding: "1px 6px", fontSize: 9, fontWeight: 700,
          }}>{counts.UNMONITORED}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      zIndex: Z_INDEX + 1000, background: "rgba(0,0,0,0.72)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: BG, border: `1px solid ${BORDER}`, borderRadius: 14,
        width: "min(900px,94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        fontFamily: FONT, color: "#DCEBF5", boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px",
          borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ TORTCOV</span>
          <span style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1 }}>
            TASK × RISK SIGNAL × REPORT OPERATIONAL THREAT COVERAGE
          </span>
          <button onClick={() => setOpen(false)} style={{
            marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0",
            cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "12px 18px", flexWrap: "wrap" }}>
          {[
            { label: "TASKS",         val: rows.length,            col: CY },
            { label: "FULLY COVERED", val: counts.FULLY_COVERED,   col: GR },
            { label: "RISK FLAGGED",  val: counts.RISK_FLAGGED,    col: RD },
            { label: "REPORT BACKED", val: counts.REPORT_BACKED,   col: PU },
            { label: "UNMONITORED",   val: counts.UNMONITORED,     col: AM },
            { label: "COVERAGE %",    val: `${covPct}%`,           col: covPct >= 70 ? GR : covPct >= 40 ? AM : RD },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 100px", background: `${col}11`, border: `1px solid ${col}33`,
              borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${covPct}%`, borderRadius: 4,
              background: covPct >= 70 ? GR : covPct >= 40 ? AM : RD,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 6, padding: "0 18px 10px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "3px 10px", borderRadius: 12, fontSize: 9, letterSpacing: 1.2,
              cursor: "pointer", border: `1px solid ${tab === t ? CY : BORDER}`,
              background: tab === t ? `${CY}22` : "transparent", color: tab === t ? CY : "#6E8AA0",
            }}>
              {t} {counts[t] ?? ""}
            </button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search tasks…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`,
              color: "#DCEBF5", borderRadius: 6, padding: "3px 10px", fontSize: 10, outline: "none",
              fontFamily: FONT,
            }}
          />
        </div>

        {/* list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 18px 14px" }}>
          {loading && !rows.length && (
            <div style={{ color: "#6E8AA0", fontSize: 11, textAlign: "center", padding: 20 }}>
              correlating tasks…
            </div>
          )}
          {visible.map((row, i) => {
            const name = row.name || row.title || `Task ${i + 1}`;
            const clsCol = CLASS_COLOR[row._cls] || "#6E8AA0";
            const isExp = expanded[i];
            return (
              <div key={i} style={{
                border: `1px solid ${clsCol}33`, borderRadius: 8, marginBottom: 6,
                background: `${clsCol}08`,
                animation: row._cls === "UNMONITORED" ? "tortpulse 2.5s ease-in-out infinite" : "none",
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1.2, padding: "2px 8px", borderRadius: 10,
                    border: `1px solid ${clsCol}`, color: clsCol, background: `${clsCol}18`,
                    whiteSpace: "nowrap",
                  }}>{row._cls.replace("_", " ")}</span>
                  <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                  {row.status && (
                    <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{row.status}</span>
                  )}
                  <span style={{ color: CY, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 12px 10px", borderTop: `1px solid ${clsCol}22` }}>
                    {/* matched risk signals */}
                    {row._signals.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ color: RD, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }}>
                          ◆ RISK SIGNALS ({row._signals.length})
                        </div>
                        {row._signals.slice(0, 4).map((s, si) => {
                          const sc = matchScore(row._tStr, [s.title, s.description, s.type].filter(Boolean).join(" "));
                          return (
                            <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                background: `${sevColor(s.severity)}22`, color: sevColor(s.severity),
                                border: `1px solid ${sevColor(s.severity)}44`, whiteSpace: "nowrap",
                              }}>{(s.severity || "UNKNOWN").toUpperCase()}</span>
                              <span style={{ fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.title || s.name || "Unnamed signal"}
                              </span>
                              <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${sc}%`, background: RD, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: "#6E8AA0", width: 28, textAlign: "right" }}>{sc}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* matched reports */}
                    {row._reports.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }}>
                          ◆ INTELLIGENCE REPORTS ({row._reports.length})
                        </div>
                        {row._reports.slice(0, 4).map((r, ri) => {
                          const sc = matchScore(row._tStr, [r.title, r.description, (r.tags || []).join(" ")].filter(Boolean).join(" "));
                          return (
                            <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{
                                fontSize: 9, padding: "1px 6px", borderRadius: 8,
                                background: `${PU}22`, color: PU,
                                border: `1px solid ${PU}44`, whiteSpace: "nowrap",
                              }}>{(r.type || "REPORT").toUpperCase()}</span>
                              <span style={{ fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.title || "Unnamed report"}
                              </span>
                              <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${sc}%`, background: PU, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: "#6E8AA0", width: 28, textAlign: "right" }}>{sc}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {row._signals.length === 0 && row._reports.length === 0 && (
                      <div style={{ color: AM, fontSize: 10, padding: "6px 0" }}>
                        No matching risk signals or intelligence reports found for this task.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && rows.length > 0 && (
            <div style={{ color: "#6E8AA0", fontSize: 11, textAlign: "center", padding: 20 }}>
              No tasks match current filter.
            </div>
          )}
        </div>

        {/* assess footer */}
        <div style={{ padding: "10px 18px 14px", borderTop: `1px solid ${BORDER}` }}>
          <button onClick={assess} disabled={assessing || !rows.length} style={{
            padding: "6px 18px", borderRadius: 8, fontSize: 10, letterSpacing: 1.5,
            cursor: assessing ? "default" : "pointer", opacity: assessing ? 0.6 : 1,
            border: `1px solid ${CY}55`, background: `${CY}18`, color: CY, fontFamily: FONT,
          }}>
            {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
          </button>
          {brief && (
            <div style={{
              marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: "rgba(0,207,255,0.06)", borderRadius: 6, padding: "8px 12px",
              border: `1px solid ${CY}22`,
            }}>
              {brief}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes tortpulse {
          0%,100% { box-shadow: 0 0 0 0 ${AM}00; }
          50%      { box-shadow: 0 0 0 4px ${AM}44; }
        }
      `}</style>
    </div>
  );
}
