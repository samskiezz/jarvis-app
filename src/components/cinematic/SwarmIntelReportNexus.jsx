/**
 * SwarmIntelReportNexus — F241.
 *
 * Parallel-fetches /entities/SwarmJob × /entities/IntelProfile × /v1/reports
 * and keyword-correlates each swarm job against intel actor profiles AND
 * intelligence reports to classify:
 *
 *   FULLY_COVERED   — job has ≥1 matching intel profile AND ≥1 matching report
 *   PROFILED_ONLY   — intel profile exists but no covering report
 *   REPORTED_ONLY   — report exists but no matching intel profile
 *   DARK            — neither profile nor report coverage (production gap)
 *
 * Stat tiles: SWARM JOBS / INTEL PROFILES / REPORTS / DARK
 * Amber badge: DARK count on toggle button.
 * Filter tabs: ALL | FULLY_COVERED | PROFILED_ONLY | REPORTED_ONLY | DARK + text search.
 * Expand job → matched intel profile cards (teal) + report cards (purple) with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence production coverage brief + TTS.
 *
 * Toggle:  ◈ IPASSESS at left:1091680, bottom:8, zIndex:665.
 * Event:   jarvis:ipassess-toggle
 * Voice:   "ipassess" / "intelligence production" / "swarm intel" /
 *          "swarm report coverage" / "pending production" / "swarm intel report"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const TE  = "#00BCD4";
const PU  = "#9C27B0";
const AM  = "#FFB300";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1091680;
const Z_IDX      = 665;

const IPASSESS_RE =
  /\b(ipassess|intelligence[._\-\s]production|swarm[._\-\s]intel(?:[._\-\s]report)?|swarm[._\-\s]report[._\-\s]coverage|pending[._\-\s]production|swarm[._\-\s]intel[._\-\s]report)\b/i;

export function isIpassessQuery(t) {
  return IPASSESS_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normSwarmJobs(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.jobs || raw.swarm_jobs || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.job || j.label || `Swarm Job ${i + 1}`,
    desc:   j.description || j.summary || j.detail || "",
    type:   j.type || j.kind || j.category || "",
    status: j.status || j.state || "",
  }));
}

function normIntelProfiles(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.profiles || raw.intel_profiles || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((p, i) => ({
    id:      p.id || String(i),
    name:    p.name || p.title || p.alias || `Intel Profile ${i + 1}`,
    org:     p.org || p.organisation || p.organization || "",
    role:    p.role || p.position || p.type || "",
    aliases: Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
    tags:    Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
  }));
}

function normReports(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.reports || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((r, i) => ({
    id:   r.id || String(i),
    name: r.name || r.title || `Report ${i + 1}`,
    desc: r.description || r.summary || r.abstract || "",
    type: r.type || r.category || r.kind || "",
    tags: Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(job, other) {
  const jWords = new Set(tokens(`${job.name} ${job.desc} ${job.type}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""} ${other.org || ""} ${other.role || ""} ${other.aliases || ""} ${other.tags || ""}`);
  const hits = oWords.filter(w => jWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(jobs, profiles, reports) {
  return jobs.map(job => {
    const matchedProfiles = profiles
      .map(p => ({ ...p, score: relevanceScore(job, p) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedReports = reports
      .map(r => ({ ...r, score: relevanceScore(job, r) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    let coverage;
    if (matchedProfiles.length > 0 && matchedReports.length > 0) {
      coverage = "FULLY_COVERED";
    } else if (matchedProfiles.length > 0) {
      coverage = "PROFILED_ONLY";
    } else if (matchedReports.length > 0) {
      coverage = "REPORTED_ONLY";
    } else {
      coverage = "DARK";
    }

    return { ...job, coverage, matchedProfiles, matchedReports };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildIpassessScript() {
  const base = apiBase();
  const [jRaw, pRaw, rRaw] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`,     { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const jobs     = normSwarmJobs(jRaw);
  const profiles = normIntelProfiles(pRaw);
  const reports  = normReports(rRaw);
  const rows     = classify(jobs, profiles, reports);
  const dark     = rows.filter(r => r.coverage === "DARK").length;
  const covered  = rows.filter(r => r.coverage === "FULLY_COVERED").length;
  return `Intelligence Production Assessment active, sir. Of ${jobs.length} swarm jobs cross-referenced against ${profiles.length} intel profiles and ${reports.length} intelligence reports, ${covered} are fully covered — however ${dark} swarm jobs have neither a matching intel profile nor a covering report, representing active intelligence production gaps requiring immediate tasking.`;
}

// ── status colour ─────────────────────────────────────────────────────────────

function statusColour(s) {
  if (s === "FULLY_COVERED")  return "#4CAF50";
  if (s === "PROFILED_ONLY")  return TE;
  if (s === "REPORTED_ONLY")  return PU;
  return AM;
}

// ── component ────────────────────────────────────────────────────────────────

export default function SwarmIntelReportNexus() {
  const [open,          setOpen]          = useState(false);
  const [rows,          setRows]          = useState([]);
  const [jobCount,      setJobCount]      = useState(0);
  const [profileCount,  setProfileCount]  = useState(0);
  const [reportCount,   setReportCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [err,           setErr]           = useState(null);
  const [filter,        setFilter]        = useState("ALL");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [assessing,     setAssessing]     = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [jRaw, pRaw, rRaw] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,     { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const jobs     = normSwarmJobs(jRaw);
      const profiles = normIntelProfiles(pRaw);
      const reports  = normReports(rRaw);
      setJobCount(jobs.length);
      setProfileCount(profiles.length);
      setReportCount(reports.length);
      setRows(classify(jobs, profiles, reports));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ipassess-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipassess-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const dark = rows.filter(r => r.coverage === "DARK").length;

  const FILTERS = ["ALL", "FULLY_COVERED", "PROFILED_ONLY", "REPORTED_ONLY", "DARK"];

  const visible = rows
    .filter(r => filter === "ALL" || r.coverage === filter)
    .filter(r => !search || `${r.name} ${r.desc}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildIpassessScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      }).then(async r => {
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          new Audio(url).play();
        }
      });
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: dark > 0 ? "rgba(255,179,0,0.12)" : "rgba(0,188,212,0.07)",
    border: `1px solid ${dark > 0 ? AM : TE}44`,
    color: dark > 0 ? AM : TE,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 580, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${AM}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>
        ◈ IPASSESS
        {dark > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 9, padding: "1px 5px", fontSize: 8,
            animation: "ipassess-pulse 1.4s infinite",
          }}>{dark}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, letterSpacing: 2, fontSize: 10 }}>
              ◈ SWARM × INTEL × REPORT PRODUCTION ASSESSMENT
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14 }}>
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              ["SWARM JOBS",    jobCount,     TE],
              ["INTEL PROFILES", profileCount, "#00BFA5"],
              ["REPORTS",       reportCount,  PU],
              ["DARK",          dark,         AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${col}22`, borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${statusColour(f === "ALL" ? "FULLY_COVERED" : f)}22` : "transparent",
                  border: `1px solid ${filter === f ? statusColour(f === "ALL" ? "FULLY_COVERED" : f) : "rgba(255,255,255,0.12)"}`,
                  color: filter === f ? statusColour(f === "ALL" ? "FULLY_COVERED" : f) : "rgba(255,255,255,0.5)",
                  fontFamily: MN, fontSize: 8, padding: "3px 7px", borderRadius: 3, cursor: "pointer",
                  letterSpacing: 1,
                }}>
                {f.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{
                marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)", fontFamily: MN, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 120,
              }}
            />
          </div>

          {/* rows */}
          {loading && <div style={{ color: TE, fontSize: 9, letterSpacing: 1, padding: "8px 0" }}>◌ LOADING…</div>}
          {err && <div style={{ color: RD, fontSize: 9, padding: "8px 0" }}>⚠ {err}</div>}
          {!loading && visible.map(row => {
            const hasDetail = row.matchedProfiles.length > 0 || row.matchedReports.length > 0;
            const col = statusColour(row.coverage);
            return (
              <div key={row.id} style={{
                background: DIM, borderRadius: 4,
                border: `1px solid ${col}33`,
                marginBottom: 4, padding: "7px 10px",
                cursor: hasDetail ? "pointer" : "default",
              }} onClick={() => hasDetail && setExpanded(expanded === row.id ? null : row.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    color: col, fontSize: 7, letterSpacing: 1,
                    border: `1px solid ${col}44`, padding: "1px 4px", borderRadius: 2,
                    minWidth: 88, textAlign: "center",
                  }}>{row.coverage.replace(/_/g, " ")}</span>
                  <span style={{ color: "rgba(255,255,255,0.85)", flex: 1, fontSize: 10 }}>{row.name}</span>
                  {row.type && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>{row.type}</span>}
                  {hasDetail && (
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                      {expanded === row.id ? "▲" : "▼"}
                    </span>
                  )}
                </div>

                {/* expanded matches */}
                {expanded === row.id && (
                  <div style={{ marginTop: 6, marginLeft: 96 }}>
                    {/* intel profile matches */}
                    {row.matchedProfiles.map(p => (
                      <div key={p.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(0,188,212,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${TE}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: TE, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${TE}44`, padding: "1px 4px", borderRadius: 2,
                          }}>INTEL</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{p.name}</span>
                          {p.org && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 7 }}>{p.org}</span>}
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(p.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${TE}88 ${Math.round(p.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                    {/* report matches */}
                    {row.matchedReports.map(r => (
                      <div key={r.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(156,39,176,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${PU}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: PU, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${PU}44`, padding: "1px 4px", borderRadius: 2,
                          }}>REPORT</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{r.name}</span>
                          {r.type && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 7 }}>{r.type}</span>}
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(r.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${PU}88 ${Math.round(r.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: `${AM}18`,
              border: `1px solid ${AM}44`, color: AM, fontFamily: MN, fontSize: 9,
              letterSpacing: 1.5, padding: "6px 0", borderRadius: 3, cursor: "pointer",
            }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS INTELLIGENCE PRODUCTION"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes ipassess-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
