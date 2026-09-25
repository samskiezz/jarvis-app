/**
 * F85 – Swarm Job × Knowledge Base × Report Documentation Nexus (SJKBREP)
 * Cross-correlates /entities/SwarmJob × /knowledge/ × /v1/reports.
 * Classifies each swarm job by documentation coverage:
 *   FULLY_DOCUMENTED – matched by ≥1 KB article AND ≥1 report
 *   KB_ONLY          – knowledge-backed but no report coverage
 *   REPORT_ONLY      – report-covered but no KB article
 *   UNDOCUMENTED     – no KB or report backing
 * UNDOCUMENTED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 990520;
const Z          = 147;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const PU   = "#B975FF";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.source,
    item.summary, item.notes, item.role,
    item.alias, item.symbol, item.org, item.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyJob(job, kbArticles, reports) {
  const jk = kw(job);
  const matchedKb  = kbArticles.filter(a => overlap(jk, kw(a)) >= 2);
  const matchedRpt = reports.filter(r => overlap(jk, kw(r)) >= 2);

  const hasKb  = matchedKb.length > 0;
  const hasRpt = matchedRpt.length > 0;
  let cls;
  if (hasKb && hasRpt) cls = "FULLY_DOCUMENTED";
  else if (hasKb)      cls = "KB_ONLY";
  else if (hasRpt)     cls = "REPORT_ONLY";
  else                 cls = "UNDOCUMENTED";

  return {
    id: job.id || job.name || Math.random().toString(36).slice(2),
    job,
    cls,
    matchedKb:  matchedKb.slice(0, 5).map(a => ({
      name:  a.name || a.title || a.subject || a.description || "?",
      score: overlap(jk, kw(a)),
    })),
    matchedRpt: matchedRpt.slice(0, 5).map(r => ({
      name:  r.name || r.title || r.description || "?",
      type:  r.type || r.kind || "",
      score: overlap(jk, kw(r)),
    })),
  };
}

async function loadAll(base) {
  const [jr, kr, rr] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`, { headers: authHdr() }),
    fetch(`${base}/knowledge/`,        { headers: authHdr() }),
    fetch(`${base}/v1/reports`,        { headers: authHdr() }),
  ]);
  const parse = async (r) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    try {
      const d = await r.value.json();
      return Array.isArray(d) ? d : (d.items || d.results || d.data || d.reports || d.articles || []);
    } catch { return []; }
  };
  const [jobs, kbArticles, reports] = await Promise.all([jr, kr, rr].map(parse));
  return { jobs, kbArticles, reports };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isSjkbrepQuery(q) {
  return /\b(sjkbrep|swarm\s+job\s+knowledge|swarm\s+documentation|undocumented\s+swarm|swarm\s+report\s+coverage|job\s+documentation|swarm\s+knowledge\s+report|swarm\s+kb\s+report)\b/i.test(q);
}

export async function buildSjkbrepScript() {
  const base = apiBase();
  try {
    const { jobs, kbArticles, reports } = await loadAll(base);
    const rows       = jobs.map(j => classifyJob(j, kbArticles, reports));
    const total      = rows.length;
    const fully      = rows.filter(r => r.cls === "FULLY_DOCUMENTED").length;
    const kbOnly     = rows.filter(r => r.cls === "KB_ONLY").length;
    const rptOnly    = rows.filter(r => r.cls === "REPORT_ONLY").length;
    const unDoc      = rows.filter(r => r.cls === "UNDOCUMENTED").length;
    return (
      `Swarm Documentation Nexus: ${total} swarm jobs — ${fully} fully documented, ` +
      `${kbOnly} knowledge-backed only, ${rptOnly} report-only, ` +
      `${unDoc} undocumented with no KB article or report coverage. ` +
      (unDoc > 0
        ? `${unDoc} swarm jobs are completely undocumented — operational blind spots requiring immediate knowledge capture.`
        : "All swarm jobs have documentation coverage.")
    );
  } catch {
    return "Swarm Documentation Nexus: unable to load data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function SwarmKnowledgeReportNexus() {
  const base = apiBase();

  const [rows, setRows]           = useState([]);
  const [kbCount, setKbCount]     = useState(0);
  const [rptCount, setRptCount]   = useState(0);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [open, setOpen]           = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { jobs, kbArticles, reports } = await loadAll(base);
      setKbCount(kbArticles.length);
      setRptCount(reports.length);
      setRows(jobs.map(j => classifyJob(j, kbArticles, reports)));
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sjkbrep-toggle", toggle);
    return () => window.removeEventListener("jarvis:sjkbrep-toggle", toggle);
  }, []);

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildSjkbrepScript();
      const voice  = getActiveVoice?.() ?? "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {}
    setAssessing(false);
  };

  const total    = rows.length;
  const fully    = rows.filter(r => r.cls === "FULLY_DOCUMENTED").length;
  const kbOnly   = rows.filter(r => r.cls === "KB_ONLY").length;
  const rptOnly  = rows.filter(r => r.cls === "REPORT_ONLY").length;
  const unDoc    = rows.filter(r => r.cls === "UNDOCUMENTED").length;

  const TABS = ["ALL", "FULLY_DOCUMENTED", "KB_ONLY", "REPORT_ONLY", "UNDOCUMENTED"];

  const visible = rows.filter(r => {
    const matchTab = filter === "ALL" || r.cls === filter;
    const matchSearch = !search || kw(r.job).includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const coveragePct = total > 0 ? Math.round(((fully + kbOnly + rptOnly) / total) * 100) : 0;

  const clsColor = { FULLY_DOCUMENTED: GR, KB_ONLY: CY, REPORT_ONLY: PU, UNDOCUMENTED: RD };
  const clsLabel = {
    FULLY_DOCUMENTED: "FULLY DOCUMENTED",
    KB_ONLY:          "KB ONLY",
    REPORT_ONLY:      "REPORT ONLY",
    UNDOCUMENTED:     "UNDOCUMENTED",
  };

  const badge = (
    <button
      onClick={() => setOpen(o => !o)}
      title="Swarm Knowledge Report Nexus (SJKBREP)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
        fontFamily: MONO, fontSize: 10, padding: "3px 8px", cursor: "pointer",
        background: "rgba(5,8,13,0.82)", border: `1px solid ${AM}66`,
        borderRadius: 4, color: AM, letterSpacing: 1,
        boxShadow: unDoc > 0 ? `0 0 10px ${AM}55` : "none",
      }}
    >
      ◈ SJKBREP
      {unDoc > 0 && (
        <span style={{
          marginLeft: 5, background: AM, color: "#04060A",
          borderRadius: 9, padding: "0 5px", fontSize: 9, fontWeight: 700,
        }}>{unDoc}</span>
      )}
    </button>
  );

  if (!open) return badge;

  return (
    <>
      {badge}
      <div style={{
        position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
        width: "min(900px,96vw)", maxHeight: "80vh",
        background: "rgba(6,10,16,0.97)", border: `1px solid ${AM}55`,
        borderRadius: 12, padding: "18px 20px", zIndex: Z + 1,
        fontFamily: MONO, color: "#DCEBF5",
        boxShadow: `0 0 60px ${AM}22`, display: "flex", flexDirection: "column", gap: 12,
        overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ SWARM DOCUMENTATION NEXUS</span>
          <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: "auto" }}>
            {kbCount} KB · {rptCount} REPORTS · 90s auto-refresh
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["JOBS",         total,  CY ],
            ["FULLY DOC",    fully,  GR ],
            ["KB ONLY",      kbOnly, CY ],
            ["REPORT ONLY",  rptOnly, PU],
            ["UNDOCUMENTED", unDoc,  RD ],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${col}33`,
              borderRadius: 6, padding: "6px 12px", minWidth: 80, textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{lbl}</div>
            </div>
          ))}
          {/* coverage bar */}
          <div style={{
            flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)",
            border: `1px solid ${GR}33`, borderRadius: 6, padding: "6px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#6E8AA0", letterSpacing: 1, marginBottom: 4 }}>COVERAGE</div>
            <div style={{ background: "#0d1e2e", borderRadius: 3, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${coveragePct}%`, height: "100%", background: GR, borderRadius: 3,
                transition: "width 0.6s ease" }} />
            </div>
            <div style={{ fontSize: 12, color: GR, marginTop: 3 }}>{coveragePct}%</div>
          </div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              fontFamily: MONO, fontSize: 9, padding: "3px 8px", cursor: "pointer",
              background: filter === t ? AM : "rgba(255,255,255,0.04)",
              border: `1px solid ${AM}55`, borderRadius: 4,
              color: filter === t ? "#04060A" : "#6E8AA0", fontWeight: filter === t ? 700 : 400,
            }}>{t.replace("_", " ")}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search jobs…"
            style={{
              fontFamily: MONO, fontSize: 11, padding: "3px 8px", marginLeft: "auto",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}`,
              borderRadius: 4, color: "#DCEBF5", outline: "none", width: 160,
            }}
          />
          <button onClick={load} style={{
            fontFamily: MONO, fontSize: 9, padding: "3px 8px", cursor: "pointer",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}`,
            borderRadius: 4, color: "#6E8AA0",
          }}>↺</button>
          <button onClick={assess} disabled={assessing} style={{
            fontFamily: MONO, fontSize: 10, padding: "4px 12px", cursor: assessing ? "default" : "pointer",
            background: assessing ? DIM : AM, border: "none", borderRadius: 4,
            color: assessing ? "#DCEBF5" : "#04060A", fontWeight: 700,
          }}>{assessing ? "assessing…" : "▶ ASSESS"}</button>
        </div>

        {/* rows */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.length === 0 && (
            <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: "30px 0" }}>
              {rows.length === 0 ? "loading swarm jobs…" : "no matches"}
            </div>
          )}
          {visible.map(row => {
            const isExpanded = expanded === row.id;
            const isUndoc    = row.cls === "UNDOCUMENTED";
            const col        = clsColor[row.cls];
            const jobName    = row.job.name || row.job.title || row.job.description || row.id;
            const jobType    = row.job.type || row.job.kind || "";
            const jobStatus  = row.job.status || "";
            return (
              <div key={row.id} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 7,
                border: `1px solid ${col}33`,
                animation: isUndoc ? "sjkbrepPulse 2s ease-in-out infinite" : "none",
              }}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                  style={{
                    padding: "8px 12px", cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 10,
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 3,
                    background: `${col}22`, color: col, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap",
                  }}>{clsLabel[row.cls]}</span>
                  <span style={{ flex: 1, fontSize: 12, color: "#DCEBF5", fontFamily: SANS }}>{jobName}</span>
                  {jobType   && <span style={{ fontSize: 9, color: "#6E8AA0" }}>{jobType}</span>}
                  {jobStatus && <span style={{ fontSize: 9, color: CY }}>{jobStatus}</span>}
                  <span style={{ fontSize: 10, color: "#6E8AA0" }}>
                    {row.matchedKb.length > 0  ? `${row.matchedKb.length} KB`  : ""}{" "}
                    {row.matchedRpt.length > 0 ? `${row.matchedRpt.length} RPT` : ""}
                    {" "}{isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ padding: "0 12px 12px", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {/* KB matches */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: CY, letterSpacing: 1, marginBottom: 6 }}>
                        ◆ KB ARTICLES ({row.matchedKb.length})
                      </div>
                      {row.matchedKb.length === 0
                        ? <div style={{ fontSize: 11, color: "#6E8AA0" }}>no KB matches</div>
                        : row.matchedKb.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: "#DCEBF5", fontFamily: SANS }}>{m.name}</div>
                            <div style={{ marginTop: 3, background: "#0d1e2e", borderRadius: 2, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, m.score * 12)}%`, height: "100%", background: CY }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                    {/* Report matches */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: PU, letterSpacing: 1, marginBottom: 6 }}>
                        ◆ REPORTS ({row.matchedRpt.length})
                      </div>
                      {row.matchedRpt.length === 0
                        ? <div style={{ fontSize: 11, color: "#6E8AA0" }}>no report matches</div>
                        : row.matchedRpt.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#DCEBF5", fontFamily: SANS, flex: 1 }}>{m.name}</span>
                              {m.type && <span style={{ fontSize: 9, color: PU, padding: "1px 5px", border: `1px solid ${PU}44`, borderRadius: 3 }}>{m.type}</span>}
                            </div>
                            <div style={{ marginTop: 3, background: "#0d1e2e", borderRadius: 2, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, m.score * 12)}%`, height: "100%", background: PU }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes sjkbrepPulse {
          0%, 100% { border-color: ${RD}33; }
          50%       { border-color: ${RD}99; box-shadow: 0 0 12px ${RD}44; }
        }
      `}</style>
    </>
  );
}
