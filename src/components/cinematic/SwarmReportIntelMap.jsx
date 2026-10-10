/**
 * F179 — Swarm × Report × IntelProfile Active Operations Intelligence Map (SRIMAP)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/reports + /entities/IntelProfile and
 * keyword-correlates each swarm job against reports AND intel profiles to classify:
 *
 *   FULLY_SUPPORTED  — matched both a report AND an intel profile
 *   REPORT_BACKED    — matched a report, no intel profile
 *   PROFILE_LINKED   — matched an intel profile, no report
 *   UNSUPPORTED      — no matches (ops intelligence gap)
 *
 * Stat tiles: SWARM JOBS / REPORTS / INTEL PROFILES + four class counts + SUPPORT%.
 * Amber badge on unsupported count.
 * Filter tabs ALL / FULLY_SUPPORTED / REPORT_BACKED / PROFILE_LINKED / UNSUPPORTED + text search.
 * Expand job → matched report cards (purple, type badge) + intel profile cards (orange, role badge)
 *             with relevance bars.
 * ▶ ASSESS OPS INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:srimap-toggle event.
 *
 * Voice triggers:
 *   "srimap / swarm report intel / supported swarm / unsupported ops /
 *    swarm operations intel / ops intelligence gap"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_042_600;
const Z_INDEX  = 240;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SRIMAP_RE = /\b(srimap|swarm[\s-]report[\s-]intel|supported[\s-]swarm|unsupported[\s-]ops|swarm[\s-]operations[\s-]intel|ops[\s-]intelligence[\s-]gap)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A855F7";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_SUPPORTED: GR,
  REPORT_BACKED:   PU,
  PROFILE_LINKED:  OR,
  UNSUPPORTED:     RD,
};

const TABS = ["ALL", "FULLY_SUPPORTED", "REPORT_BACKED", "PROFILE_LINKED", "UNSUPPORTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function jobText(j) {
  return `${j.name || j.title || ""} ${j.description || j.summary || ""} ${j.type || ""} ${j.status || ""} ${(j.tags || []).join(" ")}`;
}
function reportText(r) {
  return `${r.title || r.name || ""} ${r.description || r.summary || ""} ${r.type || ""} ${(r.tags || []).join(" ")}`;
}
function profileText(p) {
  return `${p.name || ""} ${(p.aliases || []).join(" ")} ${p.org || p.organization || ""} ${p.role || ""} ${(p.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [jobsRes, reportsRes, profilesRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/SwarmJob`,     { headers }),
    fetch(`${apiBase}/v1/reports`,            { headers }),
    fetch(`${apiBase}/entities/IntelProfile`, { headers }),
  ]);
  const jobs = jobsRes.status === "fulfilled" && jobsRes.value.ok
    ? normaliseArray(await jobsRes.value.json(), ["jobs", "swarm_jobs", "items"]) : [];
  const reports = reportsRes.status === "fulfilled" && reportsRes.value.ok
    ? normaliseArray(await reportsRes.value.json(), ["reports", "items"]) : [];
  const profiles = profilesRes.status === "fulfilled" && profilesRes.value.ok
    ? normaliseArray(await profilesRes.value.json(), ["profiles", "intel_profiles", "items"]) : [];
  return { jobs, reports, profiles };
}

function correlate(jobs, reports, profiles) {
  return jobs.map(job => {
    const kws = keywords(jobText(job));
    const matchedReports = reports
      .map(r => ({ ...r, _score: score(reportText(r), kws) }))
      .filter(r => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedProfiles = profiles
      .map(p => ({ ...p, _score: score(profileText(p), kws) }))
      .filter(p => p._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasReport  = matchedReports.length > 0;
    const hasProfile = matchedProfiles.length > 0;
    let cls;
    if (hasReport && hasProfile) cls = "FULLY_SUPPORTED";
    else if (hasReport)          cls = "REPORT_BACKED";
    else if (hasProfile)         cls = "PROFILE_LINKED";
    else                         cls = "UNSUPPORTED";
    return { ...job, _cls: cls, _reports: matchedReports, _profiles: matchedProfiles };
  });
}

export async function buildSrimapScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { jobs, reports, profiles } = await loadAll();
  const corr        = correlate(jobs, reports, profiles);
  const unsupported = corr.filter(j => j._cls === "UNSUPPORTED").length;
  const fully       = corr.filter(j => j._cls === "FULLY_SUPPORTED").length;
  const context = `Swarm jobs: ${jobs.length}, reports: ${reports.length}, intel profiles: ${profiles.length}. Fully supported (report + profile): ${fully}. Unsupported (no report or profile coverage): ${unsupported}.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `Assess JARVIS active swarm operations intelligence coverage. ${context} Give a 2-sentence operational brief focusing on unsupported swarm jobs and operational intelligence gaps.` }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${unsupported} swarm jobs lack both report documentation and intel profile linkage — these represent critical operational intelligence gaps. ${fully} jobs are fully supported with both intelligence reporting and threat actor profile coverage.`;
}

export function isSrimapQuery(q) { return SRIMAP_RE.test(q); }

export default function SwarmReportIntelMap() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [jobs,      setJobs]      = useState([]);
  const [reports,   setReports]   = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [corr,      setCorr]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await loadAll();
      setJobs(data.jobs);
      setReports(data.reports);
      setProfiles(data.profiles);
      setCorr(correlate(data.jobs, data.reports, data.profiles));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:srimap-toggle", toggle);
    return () => window.removeEventListener("jarvis:srimap-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const text = await buildSrimapScript();
      setBrief(text);
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const r = await fetch(`${apiBase}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        new Audio(url).play().catch(() => {});
      }
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const fully       = corr.filter(j => j._cls === "FULLY_SUPPORTED").length;
  const repOnly     = corr.filter(j => j._cls === "REPORT_BACKED").length;
  const profOnly    = corr.filter(j => j._cls === "PROFILE_LINKED").length;
  const unsupported = corr.filter(j => j._cls === "UNSUPPORTED").length;
  const supportPct  = corr.length ? Math.round((fully / corr.length) * 100) : 0;

  const visible = corr.filter(j => {
    const matchTab  = tab === "ALL" || j._cls === tab;
    const matchSrch = !search || jobText(j).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${BORDER}`,
          color: unsupported > 0 ? AM : CY, fontFamily: FONT, fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          boxShadow: unsupported > 0 ? `0 0 8px ${AM}55` : "none",
        }}
        title="Swarm × Report × IntelProfile Active Operations Intelligence Map (F179)"
      >
        ◈ SRIMAP{unsupported > 0 && <span style={{ color: AM, marginLeft: 4 }}>●{unsupported}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 40, right: 16, width: 560, maxHeight: "calc(100vh - 60px)",
      zIndex: Z_INDEX + 100, background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 8, fontFamily: FONT, fontSize: 11, color: CY,
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 24px rgba(0,207,255,0.12)",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          ◈ SRIMAP — Swarm × Report × Intel Operations Map
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: AM, fontSize: 10 }}>⟳ loading…</span>}
          <button onClick={refresh} style={{ background: "none", border: `1px solid ${BORDER}`, color: CY, cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["SWARM JOBS",   corr.length,   CY],
          ["REPORTS",      reports.length, PU],
          ["INTEL PROF",   profiles.length, OR],
          ["FULLY SUPP",   fully,          GR],
          ["RPT BACKED",   repOnly,        PU],
          ["PROF LINKED",  profOnly,       OR],
          ["UNSUPPORTED",  unsupported,    AM],
          [`${supportPct}% FULL`, null,   GR],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 70 }}>
            <div style={{ color, fontWeight: 700, fontSize: 13 }}>{val ?? label}</div>
            {val !== null && <div style={{ color: "#6B7280", fontSize: 9, marginTop: 1 }}>{label}</div>}
          </div>
        ))}
      </div>

      {/* Support coverage bar */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 3 }}>FULL OPERATIONS INTELLIGENCE COVERAGE</div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${supportPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "none",
            border: `1px solid ${tab === t ? CY : BORDER}`,
            color: tab === t ? CY : "#6B7280", cursor: "pointer",
            padding: "2px 7px", borderRadius: 3, fontSize: 9, fontFamily: FONT,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: CY, padding: "2px 6px", borderRadius: 3, fontSize: 10, fontFamily: FONT }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: "#6B7280", padding: 8, textAlign: "center" }}>No items match.</div>
        )}
        {visible.map((job, i) => {
          const id   = job.id || job.job_id || i;
          const isExp = expanded === id;
          const clr  = CLASS_COLOR[job._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 6, marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: clr, fontWeight: 700, fontSize: 10 }}>{job._cls}</span>
                  <span style={{ color: CY }}>{job.name || job.title || `SwarmJob ${id}`}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, color: "#6B7280" }}>
                  {job._reports.length > 0  && <span style={{ color: PU }}>RPT:{job._reports.length}</span>}
                  {job._profiles.length > 0 && <span style={{ color: OR }}>PROF:{job._profiles.length}</span>}
                  <span>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {(job.type || job.status) && (
                <div style={{ color: "#9CA3AF", fontSize: 9, paddingLeft: 4, marginBottom: 2 }}>
                  {job.type && job.type}{job.status ? ` · ${job.status}` : ""}
                </div>
              )}
              {isExp && (
                <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                  {job._reports.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: PU, fontSize: 9, marginBottom: 3 }}>MATCHED REPORTS</div>
                      {job._reports.map((r, ri) => (
                        <div key={ri} style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: PU, fontSize: 10 }}>{r.title || r.name || "Report"}</span>
                            {r.type && <span style={{ background: "rgba(168,85,247,0.15)", color: PU, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{r.type.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (r._score / 5) * 100)}%`, background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {job._profiles.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, marginBottom: 3 }}>MATCHED INTEL PROFILES</div>
                      {job._profiles.map((p, pi) => (
                        <div key={pi} style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: OR, fontSize: 10 }}>{p.name || "Profile"}</span>
                            {p.role && <span style={{ background: "rgba(249,115,22,0.15)", color: OR, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{p.role.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (p._score / 5) * 100)}%`, background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {job._reports.length === 0 && job._profiles.length === 0 && (
                    <div style={{ color: AM, fontSize: 9, padding: "4px 0" }}>No report or intel profile coverage found for this swarm job.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess button */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, cursor: assessing ? "wait" : "pointer", padding: "5px 14px", borderRadius: 4, fontFamily: FONT, fontSize: 10, width: "100%" }}
        >
          {assessing ? "⟳ Assessing…" : "▶ ASSESS OPS INTELLIGENCE"}
        </button>
        {brief && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
