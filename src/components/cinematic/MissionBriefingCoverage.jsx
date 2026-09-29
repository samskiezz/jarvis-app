/**
 * F194 — IntelProfile × Task × Report Mission Briefing Coverage (MTRBCOV)
 *
 * Parallel-fetches /entities/IntelProfile + /entities/Task + /v1/reports
 * and keyword-correlates each task against intel actor profiles AND
 * intelligence reports to classify mission briefing depth:
 *
 *   FULLY_BRIEFED  — matched intel profile + report (mission intelligence complete)
 *   INTEL_ONLY     — actor profile present, no report coverage
 *   REPORT_ONLY    — report coverage present, no actor profile link
 *   UNBRIEFED      — neither (mission intelligence gap)
 *
 * Stat tiles: TASKS / INTEL PROFILES / REPORTS + four class counts + BRIEFED%.
 * Amber badge on UNBRIEFED count.
 * Filter tabs ALL / FULLY_BRIEFED / INTEL_ONLY / REPORT_ONLY / UNBRIEFED + text search.
 * Expand task → matched intel profile cards (orange) + report cards (purple) with relevance bars.
 * ▶ ASSESS BRIEFING → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:mtrbcov-toggle event.
 *
 * Voice triggers:
 *   "mtrbcov / mission briefing / task briefing / task report /
 *    unbriefed task / mission intel briefing / briefing coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_051_000;
const Z_INDEX  = 255;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const MTRBCOV_RE = /\b(mtrbcov|mission[\s-]briefing|task[\s-]briefing|task[\s-]report|unbriefed[\s-]task|mission[\s-]intel[\s-]briefing|briefing[\s-]coverage)\b/i;

export function isMtrbcovQuery(q = "") { return MTRBCOV_RE.test(q); }

export async function buildMtrbcovScript() {
  const base = apiBase();
  const [taskRes, profileRes, reportRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
  ]);
  const tasks    = taskRes.status    === "fulfilled" ? (taskRes.value?.items    || taskRes.value    || []) : [];
  const profiles = profileRes.status === "fulfilled" ? (profileRes.value?.items || profileRes.value || []) : [];
  const reports  = reportRes.status  === "fulfilled" ? (reportRes.value?.items  || reportRes.value  || []) : [];

  let fullyBriefed = 0, unbriefed = 0;
  for (const t of tasks) {
    const kws = keywords(taskText(t));
    const hasProfile = profiles.some(p => scoreText(profileText(p), kws) > 0);
    const hasReport  = reports.some(r  => scoreText(reportText(r),  kws) > 0);
    if (hasProfile && hasReport) fullyBriefed++;
    else if (!hasProfile && !hasReport) unbriefed++;
  }
  const total     = tasks.length;
  const briefedPct = total ? Math.round((fullyBriefed / total) * 100) : 0;
  return `MTRBCOV Mission Briefing Coverage online, sir. I have cross-referenced ${total} active tasks against ${profiles.length} intel actor profiles and ${reports.length} intelligence reports. ${fullyBriefed} missions are fully briefed with both actor intelligence and documentary coverage, representing ${briefedPct}% of total mission load. ${unbriefed} tasks are completely unbriefed — zero intel profile or report support. Recommend immediate intelligence tasking to close the briefing gap, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const OR     = "#F97316";
const PU     = "#A78BFA";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_BRIEFED: GR,
  INTEL_ONLY:    OR,
  REPORT_ONLY:   PU,
  UNBRIEFED:     RD,
};

const TABS = ["ALL", "FULLY_BRIEFED", "INTEL_ONLY", "REPORT_ONLY", "UNBRIEFED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.priority, t.tags, t.assignee, t.category, t.objective].filter(Boolean).join(" ");
}
function profileText(p) {
  return [p.name, p.aliases, p.org, p.organisation, p.role, p.description, p.tags, p.notes, p.label].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.name, r.title, r.description, r.type, r.tags, r.author, r.summary, r.content].filter(Boolean).join(" ");
}

function classify(task, profiles, reports) {
  const kws = keywords(taskText(task));
  const matchedProfiles = profiles
    .map(p => ({ ...p, _score: scoreText(profileText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedReports = reports
    .map(r => ({ ...r, _score: scoreText(reportText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasProfile = matchedProfiles.length > 0;
  const hasReport  = matchedReports.length  > 0;
  let cls;
  if (hasProfile && hasReport)   cls = "FULLY_BRIEFED";
  else if (hasProfile)           cls = "INTEL_ONLY";
  else if (hasReport)            cls = "REPORT_ONLY";
  else                           cls = "UNBRIEFED";
  return { ...task, _cls: cls, _profiles: matchedProfiles, _reports: matchedReports };
}

export default function MissionBriefingCoverage() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tasks, setTasks]           = useState([]);
  const [profiles, setProfiles]     = useState([]);
  const [reports, setReports]       = useState([]);
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
      const [taskRes, profileRes, reportRes] = await Promise.allSettled([
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${base}/v1/reports`).then(r => r.json()),
      ]);
      const tk = taskRes.status    === "fulfilled" ? (taskRes.value?.items    || taskRes.value    || []) : [];
      const pr = profileRes.status === "fulfilled" ? (profileRes.value?.items || profileRes.value || []) : [];
      const rp = reportRes.status  === "fulfilled" ? (reportRes.value?.items  || reportRes.value  || []) : [];
      setTasks(tk);
      setProfiles(pr);
      setReports(rp);
      setClassified(tk.map(t => classify(t, pr, rp)));
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
    window.addEventListener("jarvis:mtrbcov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mtrbcov-toggle", onToggle);
  }, []);

  const fullyBriefed = classified.filter(c => c._cls === "FULLY_BRIEFED").length;
  const intelOnly    = classified.filter(c => c._cls === "INTEL_ONLY").length;
  const reportOnly   = classified.filter(c => c._cls === "REPORT_ONLY").length;
  const unbriefed    = classified.filter(c => c._cls === "UNBRIEFED").length;
  const total        = classified.length;
  const briefedPct   = total ? Math.round((fullyBriefed / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || taskText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `MTRBCOV: ${total} tasks — FULLY_BRIEFED: ${fullyBriefed}, INTEL_ONLY: ${intelOnly}, REPORT_ONLY: ${reportOnly}, UNBRIEFED: ${unbriefed} (${briefedPct}% briefed). Intel Profiles: ${profiles.length}. Reports: ${reports.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `MTRBCOV mission briefing coverage assessment. Context: ${ctx}. Provide a 2-sentence operational brief about which unbriefed missions represent the highest operational risk and which intelligence assets should be prioritised for immediate tasking. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Mission briefing assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Mission Briefing Coverage (MTRBCOV)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unbriefed > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unbriefed}
          </span>
        )}
        ◈ MTRBCOV
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ MTRBCOV</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          IntelProfile × Task × Report Mission Briefing Coverage
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
          ["TASKS",          total,           CY],
          ["INTEL PROFILES", profiles.length, OR],
          ["REPORTS",        reports.length,  PU],
          ["FULLY BRIEFED",  fullyBriefed,    GR],
          ["INTEL ONLY",     intelOnly,       OR],
          ["REPORT ONLY",    reportOnly,      PU],
          ["UNBRIEFED",      unbriefed,       RD],
          ["BRIEFED%",       briefedPct + "%", AM],
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
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>MISSION BRIEFING COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${briefedPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{briefedPct}% of missions fully briefed</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS BRIEFING"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? "#000" : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search tasks…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Task list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No tasks match current filter.</div>
      )}
      {visible.map((t, i) => {
        const col = CLASS_COLOR[t._cls];
        const isExp = expanded === i;
        const name = t.name || t.title || `Task ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{ color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", minWidth: 90, textAlign: "center" }}>
                {t._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
              {t.priority && (
                <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                  {t.priority}
                </span>
              )}
              {t._profiles.length > 0 && (
                <span style={{ color: OR, fontSize: 9 }}>⊕ {t._profiles.length} actor{t._profiles.length !== 1 ? "s" : ""}</span>
              )}
              {t._reports.length > 0 && (
                <span style={{ color: PU, fontSize: 9 }}>⟁ {t._reports.length} report{t._reports.length !== 1 ? "s" : ""}</span>
              )}
              <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                {t.description && (
                  <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                    {String(t.description).slice(0, 200)}
                  </div>
                )}

                {t._profiles.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED INTEL PROFILES</div>
                    {t._profiles.map((p, j) => {
                      const maxScore = Math.max(...t._profiles.map(x => x._score), 1);
                      const bar = Math.round((p._score / maxScore) * 100);
                      return (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {p.name || p.label || "Profile"}
                            </span>
                            {p.role && (
                              <span style={{ color: OR, fontSize: 9, border: `1px solid ${OR}44`, borderRadius: 2, padding: "0 4px" }}>
                                {p.role}
                              </span>
                            )}
                            {p.org && (
                              <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                                {p.org}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: OR, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {t._reports.length > 0 && (
                  <div>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED REPORTS</div>
                    {t._reports.map((r, k) => {
                      const maxScore = Math.max(...t._reports.map(x => x._score), 1);
                      const bar = Math.round((r._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {r.name || r.title || "Report"}
                            </span>
                            {r.type && (
                              <span style={{ color: PU, fontSize: 9, border: `1px solid ${PU}44`, borderRadius: 2, padding: "0 4px" }}>
                                {r.type}
                              </span>
                            )}
                            {r.author && (
                              <span style={{ color: "#6E8AA0", fontSize: 9 }}>{r.author}</span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: PU, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {t._profiles.length === 0 && t._reports.length === 0 && (
                  <div style={{ color: RD, fontSize: 10, marginTop: 6 }}>
                    ◌ No intel profile or report coverage — unbriefed mission
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
