/**
 * SwarmReportCoverage — F138.
 *
 * Parallel-fetches /entities/SwarmJob + /v1/reports then keyword-correlates
 * each swarm job against the report catalog to surface DOCUMENTED jobs
 * (at least one report found — governance trail exists) vs UNDOCUMENTED
 * (no report coverage — operational governance gap).
 *
 * Stat tiles: jobs / reports / documented / undocumented
 * Filter tabs: ALL / DOCUMENTED / UNDOCUMENTED
 * Expand job → matched reports with relevance score + type badge.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI swarm-documentation brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "swarm report" / "job report" / "swarm documentation" /
 *         "which swarm jobs have reports" / "swrpt"
 *   → jarvis:swrpt-toggle + TTS brief via buildSwrptScript()
 *
 * Toggle: ◈ SWRPT at left:44120, bottom:8, zIndex 90.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 44120;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j) => ({
    id:        j.id || j.job_id || String(Math.random()),
    name:      j.name || j.title || j.job_name || "Unnamed Job",
    objective: j.objective || j.description || j.goal || j.task || "",
    type:      j.type || j.job_type || j.category || "",
    status:    j.status || j.state || "",
    progress:  typeof j.progress === "number" ? j.progress : null,
    tags:      [...(j.tags || []), ...(j.labels || [])].map(String),
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id:      r.id || r.report_id || String(Math.random()),
    title:   r.title || r.name || "Unnamed Report",
    content: r.content || r.summary || r.description || r.body || r.excerpt || "",
    type:    r.type || r.category || r.report_type || "",
    year:    r.year || (r.date ? String(r.date).slice(0, 4) : "") ||
             (r.created_at ? String(r.created_at).slice(0, 4) : "") || "",
    tags:    [...(r.tags || []), ...(r.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(job, report) {
  const reportText = `${report.title} ${report.content} ${report.tags.join(" ")}`.toLowerCase();
  const words = [
    ...tokens(job.name),
    ...tokens(job.objective),
    ...tokens(job.type),
    ...job.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (reportText.includes(w) ? 1 : 0), 0);
}

function correlate(jobs, reports) {
  return jobs.map((j) => {
    const matched = reports
      .map((r) => ({ ...r, _score: matchScore(j, r) }))
      .filter((r) => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...j, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const SWRPT_RE =
  /swarm[\s-]?report|job[\s-]?report|swarm[\s-]?doc(?:ument(?:ation)?)?|which[\s-]?swarm[\s-]?jobs?[\s-]?have[\s-]?reports?|swrpt\b/i;

export function isSwrptQuery(q) {
  return SWRPT_RE.test(q || "");
}

export async function buildSwrptScript() {
  try {
    const [jobRaw, rpRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/reports?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const jobs    = normaliseJobs(jobRaw);
    const reports = normaliseReports(rpRaw);
    const corr    = correlate(jobs, reports);
    const doc     = corr.filter((j) => j.matched.length > 0);
    const undoc   = corr.filter((j) => j.matched.length === 0);
    return `Swarm report coverage active, sir. ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""} cross-referenced against ${reports.length} report${reports.length !== 1 ? "s" : ""}. ${doc.length} job${doc.length !== 1 ? "s have" : " has"} documentation in the report catalog. ${undoc.length} job${undoc.length !== 1 ? "s have" : " has"} no report coverage — potential governance gaps. Select any job to review matched reports and request an AI documentation assessment.`;
  } catch (_) {
    return "Swarm report coverage correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmReportCoverage() {
  const [visible, setVisible]     = useState(false);
  const [jobs, setJobs]           = useState([]);
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [jobRaw, rpRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/reports?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setJobs(normaliseJobs(jobRaw));
      setReports(normaliseReports(rpRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:swrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swrpt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessJob(j) {
    setAssessing(j.id);
    const rptTitles = j.matched.map((r) => `"${r.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence swarm-documentation assessment for the swarm job "${j.name}" (type: ${j.type || "unknown"}, objective: ${j.objective || "unspecified"}). Reports found: ${rptTitles || "none"}. Assess the governance coverage of this swarm job and whether the documentation level is adequate for operational oversight.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient documentation to assess this swarm job, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated   = correlate(jobs, reports);
  const documented   = correlated.filter((j) => j.matched.length > 0);
  const undocumented = correlated.filter((j) => j.matched.length === 0);

  const base =
    tab === "DOCUMENTED"   ? documented   :
    tab === "UNDOCUMENTED" ? undocumented : correlated;

  const displayed = search
    ? base.filter((j) =>
        `${j.name} ${j.type} ${j.objective}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  const statusColour = (s) => {
    const sl = (s || "").toLowerCase();
    if (sl === "running")   return "#29E7FF";
    if (sl === "failed")    return "#FF4444";
    if (sl === "completed") return "#00c878";
    if (sl === "queued")    return "#F5A623";
    return "#445566";
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm Job × Report Coverage (F138)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 90,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ SWRPT
        {undocumented.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{undocumented.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 90,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ SWARM JOB × REPORT COVERAGE</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["JOBS",         jobs.length,          CY],
              ["REPORTS",      reports.length,        PURPLE],
              ["DOCUMENTED",   documented.length,     GREEN],
              ["UNDOCUMENTED", undocumented.length,   undocumented.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="search swarm jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Job rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating swarm jobs against report catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNDOCUMENTED"
                ? "All swarm jobs appear in at least one report."
                : "No swarm jobs in this filter."}
            </div>
          ) : (
            displayed.map((j) => {
              const isOpen   = expanded === j.id;
              const hasReports = j.matched.length > 0;
              const sc       = statusColour(j.status);
              return (
                <div key={j.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasReports ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : j.id)}>
                  {/* Job header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>{j.name}</span>
                        {j.status && (
                          <span style={{
                            fontSize: 7, color: sc,
                            border: `1px solid ${sc}44`,
                            borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                            textTransform: "uppercase",
                          }}>{j.status}</span>
                        )}
                      </div>
                      {(j.type || j.objective) && (
                        <div style={{ color: "#556677", fontSize: 8 }}>
                          {[j.type, j.objective].filter(Boolean).join(" · ").slice(0, 80)}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasReports ? GREEN : AMBER,
                      border: `1px solid ${hasReports ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {hasReports
                        ? `${j.matched.length} report${j.matched.length !== 1 ? "s" : ""}`
                        : "UNDOCUMENTED"}
                    </span>
                  </div>

                  {/* Progress bar (if available) */}
                  {typeof j.progress === "number" && (
                    <div style={{ height: 2, background: "#1a2530", borderRadius: 1, marginBottom: 6 }}>
                      <div style={{
                        width: `${Math.min(100, j.progress)}%`, height: "100%",
                        background: sc, borderRadius: 1,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessJob(j); }}
                      disabled={assessing === j.id}
                      style={{
                        background: assessing === j.id ? "#1a2530" : `${CY}18`,
                        color: assessing === j.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === j.id ? "default" : "pointer",
                      }}
                    >{assessing === j.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded report list */}
                  {isOpen && hasReports && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {j.matched.map((r) => (
                        <div key={r.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {r.type && (
                            <span style={{
                              fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
                            }}>{r.type}</span>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{r.title}</div>
                            {r.year && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>{r.year}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {r._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasReports && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No reports document this swarm job. Consider creating a governance or post-run report.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/SwarmJob + /v1/reports · 90 s auto-refresh · ▶ ASSESS for AI governance brief
          </div>
        </div>
      )}
    </>
  );
}
