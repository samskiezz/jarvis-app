/**
 * F748 — SwarmJob × Investigation × Report Triple Nexus (SJIRTRI)
 * Endpoints: /entities/SwarmJob  ×  /v1/investigations  ×  /v1/reports
 * Classification: FULLY_DOCUMENTED | INVEST_ONLY | REPORT_ONLY | DARK
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 915_100;
const POLL_MS  = 90_000;

const SJIRTRI_RE =
  /\b(sjirtri|swarm\s+investigation\s+report|swarm\s+job\s+investigation|swarm\s+report\s+investigation|job\s+investigation\s+report|swarm\s+case\s+report|swarm\s+documented|job\s+coverage\s+report|swarm\s+case\s+coverage|swarm\s+job\s+nexus|documented\s+swarm)\b/i;

export function isSjirtriQuery(t) {
  return SJIRTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseJobs(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.jobs))  return raw.jobs;
  if (raw && Array.isArray(raw.data))  return raw.data;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function normaliseInvestigations(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.investigations)) return raw.investigations;
  if (raw && Array.isArray(raw.data))           return raw.data;
  if (raw && Array.isArray(raw.items))          return raw.items;
  return [];
}

function normaliseReports(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.reports)) return raw.reports;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.items))   return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.role, obj.subject, obj.topic,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(jobs, investigations, reports) {
  return jobs.map(job => {
    const jKw = keywords(job);

    const bestInv = investigations.reduce(
      (best, inv) => {
        const s = scoreMatch(jKw, keywords(inv));
        return s > best.score ? { score: s, inv } : best;
      },
      { score: 0, inv: null },
    );

    const bestRpt = reports.reduce(
      (best, rpt) => {
        const s = scoreMatch(jKw, keywords(rpt));
        return s > best.score ? { score: s, rpt } : best;
      },
      { score: 0, rpt: null },
    );

    const hasInv = bestInv.score > 0;
    const hasRpt = bestRpt.score > 0;

    const status =
      hasInv && hasRpt ? "FULLY_DOCUMENTED" :
      hasInv            ? "INVEST_ONLY"       :
      hasRpt            ? "REPORT_ONLY"        :
                          "DARK";

    return {
      job,
      matchedInv : hasInv ? bestInv.inv : null,
      matchedRpt : hasRpt ? bestRpt.rpt : null,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const [jobsRes, invRes, rptRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/investigations`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/reports`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    jobs           : normaliseJobs(jobsRes),
    investigations : normaliseInvestigations(invRes),
    reports        : normaliseReports(rptRes),
  };
}

export async function buildSjirtriScript() {
  try {
    const { jobs, investigations, reports } = await fetchAll();
    const nexus = buildNexus(jobs, investigations, reports);
    const counts = {
      FULLY_DOCUMENTED : nexus.filter(r => r.status === "FULLY_DOCUMENTED").length,
      INVEST_ONLY      : nexus.filter(r => r.status === "INVEST_ONLY").length,
      REPORT_ONLY      : nexus.filter(r => r.status === "REPORT_ONLY").length,
      DARK             : nexus.filter(r => r.status === "DARK").length,
    };
    const darkNames = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.job.name || r.job.label || r.job.id || "Unknown")
      .join("; ");
    const cov = jobs.length
      ? Math.round((counts.FULLY_DOCUMENTED / jobs.length) * 100)
      : 0;
    return (
      `SwarmJob Investigation Report Triple Nexus: ${jobs.length} swarm jobs cross-referenced ` +
      `against ${investigations.length} investigations and ${reports.length} reports. ` +
      `${counts.FULLY_DOCUMENTED} fully documented (investigation + report match). ` +
      `${counts.INVEST_ONLY} investigation only. ${counts.REPORT_ONLY} report only. ` +
      `${counts.DARK} dark — no case or report coverage${darkNames ? `: ${darkNames}` : ""}. ` +
      `Overall documentation coverage: ${cov}%. Review dark jobs for untracked swarm operations.`
    );
  } catch {
    return "SwarmJob Investigation Report Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_DOCUMENTED : { label: "FULLY DOCUMENTED", col: GN  },
  INVEST_ONLY      : { label: "INVEST ONLY",       col: CY  },
  REPORT_ONLY      : { label: "REPORT ONLY",        col: AM  },
  DARK             : { label: "DARK",               col: RD  },
};

export default function SwarmJobInvestigationReportTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({
    FULLY_DOCUMENTED:0, INVEST_ONLY:0, REPORT_ONLY:0, DARK:0,
  });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { jobs, investigations, reports } = await fetchAll();
      const nexus = buildNexus(jobs, investigations, reports);
      setRows(nexus);
      setCounts({
        FULLY_DOCUMENTED : nexus.filter(r => r.status === "FULLY_DOCUMENTED").length,
        INVEST_ONLY      : nexus.filter(r => r.status === "INVEST_ONLY").length,
        REPORT_ONLY      : nexus.filter(r => r.status === "REPORT_ONLY").length,
        DARK             : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sjirtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:sjirtri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = filter === "ALL" ? rows : rows.filter(r => r.status === filter);
  const cov = rows.length
    ? Math.round((counts.FULLY_DOCUMENTED / rows.length) * 100)
    : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 607,
          background  : open ? "rgba(41,231,255,0.14)" : "rgba(20,24,32,0.82)",
          border      : `1px solid ${open ? CY : DIM}`,
          color       : open ? CY : DIM,
          borderRadius: 6,
          padding     : "3px 10px",
          fontSize    : 11,
          cursor      : "pointer",
          fontFamily  : "monospace",
          letterSpacing: "0.05em",
          whiteSpace  : "nowrap",
        }}
        title="SwarmJob × Investigation × Report Triple Nexus (F748)"
      >
        SJIRTRI
        {counts.DARK > 0 && (
          <span style={{
            marginLeft  : 5,
            background  : RD,
            color       : "#000",
            borderRadius: 3,
            padding     : "0 4px",
            fontSize    : 9,
            fontWeight  : 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position     : "fixed",
            bottom       : 36,
            left         : BTN_LEFT,
            width        : 820,
            maxHeight    : 540,
            zIndex       : 607,
            background   : "rgba(10,13,20,0.97)",
            border       : `1px solid ${CY}`,
            borderRadius : 10,
            boxShadow    : `0 0 32px ${CY}44`,
            display      : "flex",
            flexDirection: "column",
            overflow     : "hidden",
            fontFamily   : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding     : "8px 14px 6px",
            borderBottom: `1px solid ${CY}44`,
            display     : "flex",
            alignItems  : "center",
            gap         : 10,
            flexShrink  : 0,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              SWARM JOB × INVESTIGATION × REPORT — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F748</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background:"none", border:"none", color: DIM, cursor:"pointer", fontSize:14 }}
            >✕</button>
          </div>

          {/* Stat bar */}
          <div style={{
            display     : "flex",
            gap         : 8,
            padding     : "5px 14px",
            borderBottom: `1px solid ${CY}22`,
            flexShrink  : 0,
            flexWrap    : "wrap",
          }}>
            {[
              { label: "JOBS",      val: rows.length,   col: CY },
              { label: "COVERAGE",  val: `${cov}%`,     col: GN },
              { label: "DARK",      val: counts.DARK,   col: RD },
            ].map(tile => (
              <span key={tile.label} style={{
                background  : `${tile.col}11`,
                border      : `1px solid ${tile.col}44`,
                color       : tile.col,
                borderRadius: 4,
                padding     : "2px 10px",
                fontSize    : 10,
              }}>
                {tile.label}: <strong>{tile.val}</strong>
              </span>
            ))}

            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${CY}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? CY : DIM + "66"}`,
                color       : filter === "ALL" ? CY : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
            <button
              onClick={load}
              style={{
                marginLeft  : "auto",
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {err && (
            <div style={{ padding:"6px 14px", color: RD, fontSize:11 }}>
              ERROR: {err}
            </div>
          )}

          <div style={{ overflowY:"auto", flex:1, padding:"4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize:11, padding:"12px 14px" }}>
                No jobs{filter !== "ALL" ? ` matching filter: ${filter}` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const j    = row.job;
              const meta = STATUS_META[row.status];
              const name = j.name  || j.label || j.id || `Job #${i + 1}`;
              const kind = j.type  || j.category || j.kind || "";
              const invLabel = row.matchedInv
                ? (row.matchedInv.title || row.matchedInv.name || "Investigation")
                : null;
              const rptLabel = row.matchedRpt
                ? (row.matchedRpt.title || row.matchedRpt.name || "Report")
                : null;
              const invStatus = row.matchedInv?.status || "";
              const rptType   = row.matchedRpt?.type || row.matchedRpt?.kind || "";
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${CY}11`,
                    display     : "flex",
                    gap         : 10,
                    alignItems  : "flex-start",
                  }}
                >
                  <span style={{
                    minWidth     : 148,
                    fontSize     : 9,
                    color        : meta.col,
                    fontWeight   : 700,
                    letterSpacing: "0.06em",
                    paddingTop   : 1,
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex:1 }}>
                    <div style={{ color:"#E8EEF6", fontSize:11, fontWeight:600 }}>
                      {name}
                      {kind && (
                        <span style={{ color: DIM, fontWeight:400, marginLeft:6, fontSize:10 }}>
                          [{kind}]
                        </span>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" }}>
                      {invLabel && (
                        <span style={{ color: CY, fontSize:9, background:`${CY}12`, borderRadius:3, padding:"1px 5px" }}>
                          INV: {invLabel}{invStatus ? ` (${invStatus})` : ""}
                        </span>
                      )}
                      {rptLabel && (
                        <span style={{ color: AM, fontSize:9, background:`${AM}12`, borderRadius:3, padding:"1px 5px" }}>
                          RPT: {rptLabel}{rptType ? ` [${rptType}]` : ""}
                        </span>
                      )}
                      {!invLabel && !rptLabel && (
                        <span style={{ color: RD, fontSize:9, background:`${RD}12`, borderRadius:3, padding:"1px 5px" }}>
                          NO CASE OR REPORT COVERAGE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            padding   : "4px 14px",
            borderTop : `1px solid ${CY}22`,
            color     : DIM,
            fontSize  : 9,
            flexShrink: 0,
          }}>
            /entities/SwarmJob × /v1/investigations × /v1/reports | poll {POLL_MS / 1000}s | F748
          </div>
        </div>
      )}
    </>
  );
}
