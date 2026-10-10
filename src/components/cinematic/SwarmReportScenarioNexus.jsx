/**
 * F235 — SwarmJob × Report × Scenario Mission Coverage Nexus (SMRNEX)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/reports + /v1/scenario/list
 * and keyword-correlates each swarm job against intelligence reports AND scenarios
 * to classify:
 *
 *   FULLY_COVERED   — matched reports + scenarios (job has intel coverage + playbook)
 *   REPORTED_ONLY   — report match only (intel coverage, no playbook)
 *   SCENARIO_ONLY   — scenario match only (playbook, no intel report)
 *   DARK            — neither match (mission coverage gap)
 *
 * Stat tiles: SWARM JOBS / REPORTS / SCENARIOS + four class counts + COVERAGE%.
 * Amber badge on DARK count.
 * Filter tabs ALL / FULLY_COVERED / REPORTED_ONLY / SCENARIO_ONLY / DARK + text search.
 * Expand job → matched report cards (purple) + scenario cards (cyan) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:smrnex-toggle event.
 *
 * Voice triggers:
 *   "smrnex / swarm mission / swarm report / swarm scenario /
 *    mission coverage nexus / dark swarm / swarm coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_072_840;
const Z_INDEX  = 294;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SMRNEX_RE = /\b(smrnex|swarm[\s-]mission|swarm[\s-]report|swarm[\s-]scenario|mission[\s-]coverage[\s-]nexus|dark[\s-]swarm|swarm[\s-]coverage)\b/i;

export function isSmrnexQuery(q = "") { return SMRNEX_RE.test(q); }

export async function buildSmrnexScript() {
  const base = apiBase();
  const [jobRes, repRes, scnRes] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);
  const jobs      = jobRes.status === "fulfilled" ? (jobRes.value?.items || jobRes.value || []) : [];
  const reports   = repRes.status === "fulfilled" ? (repRes.value?.items || repRes.value?.reports || repRes.value || []) : [];
  const scenarios = scnRes.status === "fulfilled" ? (scnRes.value?.items || scnRes.value?.scenarios || scnRes.value || []) : [];

  let dark = 0, fullyCovered = 0;
  for (const j of jobs) {
    const kws    = keywords(jobText(j));
    const hasRep = reports.some(r   => scoreText(reportText(r),   kws) > 0);
    const hasScn = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
    if (hasRep && hasScn) fullyCovered++;
    else if (!hasRep && !hasScn) dark++;
  }
  const total       = jobs.length;
  const coveragePct = total ? Math.round((fullyCovered / total) * 100) : 0;
  return `SMRNEX Mission Coverage Nexus online, sir. I have cross-referenced ${total} swarm jobs against ${reports.length} intelligence reports and ${scenarios.length} mission scenarios. ${fullyCovered} jobs achieve full coverage with both intelligence reporting and scenario playbooks — representing ${coveragePct}% mission coverage. ${dark} swarm jobs remain completely dark with no report or scenario linkage, creating critical mission coverage gaps. Recommend immediate report and scenario assignment for dark swarm jobs, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const PU   = "#A855F7";
const GN   = "#22C55E";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED:  GN,
  REPORTED_ONLY:  PU,
  SCENARIO_ONLY:  CY,
  DARK:           RD,
};

const TABS = ["ALL", "FULLY_COVERED", "REPORTED_ONLY", "SCENARIO_ONLY", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function jobText(j) {
  return [j.name, j.title, j.description, j.tags, j.type, j.objective, j.status, j.target].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.name, r.title, r.description, r.tags, r.type, r.category, r.author, r.summary].filter(Boolean).join(" ");
}
function scenarioText(s) {
  return [s.name, s.title, s.description, s.tags, s.type, s.category, s.objective].filter(Boolean).join(" ");
}

function classify(job, reports, scenarios) {
  const kws         = keywords(jobText(job));
  const matchedReps = reports
    .map(r => ({ ...r, _score: scoreText(reportText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedScns = scenarios
    .map(s => ({ ...s, _score: scoreText(scenarioText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasRep = matchedReps.length > 0;
  const hasScn = matchedScns.length > 0;
  let cls;
  if (hasRep && hasScn)  cls = "FULLY_COVERED";
  else if (hasRep)        cls = "REPORTED_ONLY";
  else if (hasScn)        cls = "SCENARIO_ONLY";
  else                    cls = "DARK";
  return { ...job, _cls: cls, _reports: matchedReps, _scenarios: matchedScns };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

export default function SwarmReportScenarioNexus() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [jobs, setJobs]             = useState([]);
  const [reports, setReports]       = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [jobRes, repRes, scnRes] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${base}/v1/reports`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      ]);
      const j = jobRes.status === "fulfilled" ? (jobRes.value?.items || jobRes.value || []) : [];
      const r = repRes.status === "fulfilled" ? (repRes.value?.items || repRes.value?.reports || repRes.value || []) : [];
      const s = scnRes.status === "fulfilled" ? (scnRes.value?.items || scnRes.value?.scenarios || scnRes.value || []) : [];
      setJobs(j);
      setReports(r);
      setScenarios(s);
      setClassified(j.map(job => classify(job, r, s)));
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
    window.addEventListener("jarvis:smrnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:smrnex-toggle", onToggle);
  }, []);

  const fullyCovered  = classified.filter(c => c._cls === "FULLY_COVERED").length;
  const reportedOnly  = classified.filter(c => c._cls === "REPORTED_ONLY").length;
  const scenarioOnly  = classified.filter(c => c._cls === "SCENARIO_ONLY").length;
  const dark          = classified.filter(c => c._cls === "DARK").length;
  const total         = classified.length;
  const coveragePct   = total ? Math.round((fullyCovered / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || jobText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `SMRNEX: ${total} swarm jobs — FULLY_COVERED: ${fullyCovered}, REPORTED_ONLY: ${reportedOnly}, SCENARIO_ONLY: ${scenarioOnly}, DARK: ${dark} (${coveragePct}% coverage). Reports: ${reports.length}. Scenarios: ${scenarios.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SMRNEX swarm mission coverage nexus assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which dark swarm jobs represent the highest operational risk due to missing intelligence and scenario coverage. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Mission coverage nexus assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url  = URL.createObjectURL(blob);
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
        title="SwarmJob × Report × Scenario Mission Coverage Nexus (SMRNEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {dark > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {dark}
          </span>
        )}
        ◈ SMRNEX
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ SMRNEX</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          SwarmJob × Report × Scenario Mission Coverage Nexus
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
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
          ["SWARM JOBS",      total,           CY],
          ["REPORTS",         reports.length,  PU],
          ["SCENARIOS",       scenarios.length, CY],
          ["FULLY COVERED",   fullyCovered,    GN],
          ["REPORTED ONLY",   reportedOnly,    PU],
          ["SCENARIO ONLY",   scenarioOnly,    CY],
          ["DARK",            dark,            RD],
          ["COVERAGE%",       coveragePct + "%", AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
          MISSION COVERAGE — {coveragePct}%
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${coveragePct}%`, height: "100%",
            background: coveragePct >= 70 ? GN : coveragePct >= 40 ? AM : RD,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: FONT, fontSize: 9, letterSpacing: 1,
              background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "transparent",
              border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA044"}`,
              color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
              padding: "3px 8px", borderRadius: 3, cursor: "pointer",
            }}
          >
            {t}
            {t !== "ALL" && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                {classified.filter(c => c._cls === t).length}
              </span>
            )}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{
            fontFamily: FONT, fontSize: 10, background: "rgba(0,207,255,0.06)",
            border: "1px solid rgba(0,207,255,0.2)", color: CY,
            padding: "3px 8px", borderRadius: 3, outline: "none", marginLeft: "auto", width: 180,
          }}
        />
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={assess}
          disabled={assessing || total === 0}
          style={{
            fontFamily: FONT, fontSize: 10, letterSpacing: 1,
            background: assessing ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${RD}66`, color: RD,
            padding: "5px 14px", borderRadius: 4, cursor: assessing ? "wait" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && (
          <div style={{
            marginTop: 8, padding: "8px 12px", background: "rgba(239,68,68,0.07)",
            border: `1px solid ${RD}33`, borderRadius: 5, color: "#CBD5E1", fontSize: 11, lineHeight: 1.6,
          }}>
            {brief}
          </div>
        )}
      </div>

      {/* Swarm job list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 11, padding: "12px 0" }}>No swarm jobs match current filter.</div>
        )}
        {visible.map((job, idx) => {
          const isExp = expanded === idx;
          const cls   = job._cls;
          const col   = CLASS_COLOR[cls];
          return (
            <div key={job.id || job.name || idx} style={{
              border: `1px solid ${col}33`,
              borderRadius: 5, overflow: "hidden",
            }}>
              <button
                onClick={() => setExpanded(isExp ? null : idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", background: `${col}0A`,
                  padding: "7px 12px", cursor: "pointer",
                  fontFamily: FONT, border: "none", textAlign: "left",
                }}
              >
                <span style={{
                  background: `${col}22`, color: col, border: `1px solid ${col}44`,
                  borderRadius: 3, fontSize: 8, padding: "1px 5px", letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}>
                  {cls}
                </span>
                <span style={{ color: "#CBD5E1", fontSize: 11, flex: 1 }}>
                  {job.name || job.title || "(unnamed job)"}
                </span>
                {job._reports.length > 0 && (
                  <span style={{ color: PU, fontSize: 9 }}>{job._reports.length}rep</span>
                )}
                {job._scenarios.length > 0 && (
                  <span style={{ color: CY, fontSize: 9 }}>{job._scenarios.length}scn</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </button>

              {isExp && (
                <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {job.description && (
                    <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 10, lineHeight: 1.5 }}>
                      {job.description}
                    </div>
                  )}
                  {/* Matched Reports */}
                  {job._reports.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED REPORTS ({job._reports.length})
                      </div>
                      {job._reports.map((rep, i) => {
                        const maxScore = job._reports[0]._score || 1;
                        const pct = Math.round((rep._score / maxScore) * 100);
                        return (
                          <div key={rep.id || rep.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${PU}22`, color: PU,
                              border: `1px solid ${PU}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {rep.type || rep.category || "RPT"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {rep.name || rep.title || "(report)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: PU, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: PU, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Matched Scenarios */}
                  {job._scenarios.length > 0 && (
                    <div>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED SCENARIOS ({job._scenarios.length})
                      </div>
                      {job._scenarios.map((scn, i) => {
                        const maxScore = job._scenarios[0]._score || 1;
                        const pct = Math.round((scn._score / maxScore) * 100);
                        return (
                          <div key={scn.id || scn.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${CY}22`, color: CY,
                              border: `1px solid ${CY}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {scn.type || scn.category || "SCN"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {scn.name || scn.title || "(scenario)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: CY, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {job._reports.length === 0 && job._scenarios.length === 0 && (
                    <div style={{ color: "#6E8AA0", fontSize: 10 }}>No matched reports or scenarios for this swarm job.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
