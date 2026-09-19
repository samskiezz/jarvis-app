/**
 * F754 — SwarmJob × Report × Contact Triple Nexus (SJRPCNT)
 * Endpoints: /entities/SwarmJob  ×  /v1/reports  ×  /entities/Contact
 * Classification: FULLY_BACKED | REPORT_ONLY | CONTACT_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 919_500;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SJRPCNT_RE =
  /\b(sjrpcnt|swarm\s+report\s+contact|swarm\s+backed\s+contacts|swarm\s+job\s+report|contact\s+report\s+swarm|swarm\s+documentation|swarm\s+contact\s+coverage|report\s+contact\s+swarm|swarm\s+job\s+contact\s+report|backed\s+swarm\s+jobs)\b/i;

export function isSwarmReportContactQuery(t) {
  return SJRPCNT_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseSwarmJobs(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.jobs))  return raw.jobs;
  if (raw && Array.isArray(raw.data))  return raw.data;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function normaliseReports(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.reports)) return raw.reports;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.items))   return raw.items;
  return [];
}

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.contacts)) return raw.contacts;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.topic, obj.domain, obj.content,
    obj.source, obj.target, obj.entity_type, obj.job_type,
    obj.role, obj.organization,
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

function buildNexus(jobs, reports, contacts) {
  return jobs.map(job => {
    const jKw = keywords(job);

    const bestReport = reports.reduce(
      (best, rep) => {
        const s = scoreMatch(jKw, keywords(rep));
        return s > best.score ? { score: s, rep } : best;
      },
      { score: 0, rep: null },
    );

    const bestContact = contacts.reduce(
      (best, cnt) => {
        const s = scoreMatch(jKw, keywords(cnt));
        return s > best.score ? { score: s, cnt } : best;
      },
      { score: 0, cnt: null },
    );

    const hasReport  = bestReport.score  > 0;
    const hasContact = bestContact.score > 0;

    const classification =
      hasReport && hasContact ? "FULLY_BACKED"
      : hasReport             ? "REPORT_ONLY"
      : hasContact            ? "CONTACT_ONLY"
      :                         "DARK";

    return {
      job,
      classification,
      bestReport:   bestReport.rep,
      reportScore:  bestReport.score,
      bestContact:  bestContact.cnt,
      contactScore: bestContact.score,
    };
  });
}

export async function buildSwarmReportContactScript() {
  const base = apiBase();
  try {
    const [jobR, repR, cntR] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/reports`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const jobs     = normaliseSwarmJobs(await jobR.json());
    const reports  = normaliseReports(await repR.json());
    const contacts = normaliseContacts(await cntR.json());
    const nexus    = buildNexus(jobs, reports, contacts);
    const backed   = nexus.filter(r => r.classification === "FULLY_BACKED").length;
    const dark     = nexus.filter(r => r.classification === "DARK").length;
    const pct      = jobs.length ? Math.round((backed / jobs.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `SwarmJob × Report × Contact coverage: ${jobs.length} swarm jobs analysed, ${backed} fully backed (report+contact match), ${dark} dark (no report or contact backing). Coverage ${pct}%. Summarise swarm automation coverage in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${jobs.length} swarm jobs analysed. ${backed} fully backed (report + contact), ${dark} dark — no documentation or contact backing detected.`;
  } catch (e) {
    return `SJRPCNT fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_BACKED", "REPORT_ONLY", "CONTACT_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_BACKED:  GN,
  REPORT_ONLY:   CY,
  CONTACT_ONLY:  AM,
  DARK:          RD,
};

export default function SwarmReportContactTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [badgeDark, setBadgeDark] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [jobR, repR, cntR] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/reports`,         { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const jobs     = normaliseSwarmJobs(await jobR.json());
      const reports  = normaliseReports(await repR.json());
      const contacts = normaliseContacts(await cntR.json());
      const nexus    = buildNexus(jobs, reports, contacts);
      setRows(nexus);
      setBadgeDark(nexus.filter(r => r.classification === "DARK").length);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:sjrpcnt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sjrpcnt-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.job).includes(search.toLowerCase()) ||
      (r.bestReport  && keywords(r.bestReport).includes(search.toLowerCase())) ||
      (r.bestContact && keywords(r.bestContact).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:        rows.length,
    FULLY_BACKED: rows.filter(r => r.classification === "FULLY_BACKED").length,
    REPORT_ONLY:  rows.filter(r => r.classification === "REPORT_ONLY").length,
    CONTACT_ONLY: rows.filter(r => r.classification === "CONTACT_ONLY").length,
    DARK:         rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_BACKED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 613,
      width: "min(680px,92vw)", maxHeight: "70vh",
      background: "rgba(6,11,19,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 14, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ SJRPCNT — SWARM × REPORT × CONTACT
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} jobs · ${pct}% backed`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["JOBS",         counts.total,        CY],
          ["FULLY BACKED", counts.FULLY_BACKED,  GN],
          ["REPORT ONLY",  counts.REPORT_ONLY,   CY],
          ["CONTACT ONLY", counts.CONTACT_ONLY,  AM],
          ["DARK",         counts.DARK,          RD],
          ["COVERAGE",     `${pct}%`,            pct >= 60 ? GN : pct >= 30 ? AM : RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${col}44`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : DIM + "55"}`,
              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              color: tab === t ? CY : DIM, fontSize: 10, letterSpacing: 1,
            }}>{t}</button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search swarm jobs / reports / contacts…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp = expanded === i;
          const col   = BADGE_COLOR[r.classification];
          const name  = r.job.title || r.job.name || r.job.job_type || `SwarmJob ${i + 1}`;
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${col}33`,
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                transition: "background 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{name}</span>
                {r.job.status && (
                  <span style={{
                    fontSize: 9, background: `${AM}22`, border: `1px solid ${AM}44`,
                    borderRadius: 4, padding: "1px 6px", color: AM,
                  }}>{r.job.status}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestReport ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Report:</b>{" "}
                      {r.bestReport.title || r.bestReport.name || "report"}{" "}
                      <span style={{ color: DIM }}>
                        (type: {r.bestReport.type || r.bestReport.kind || "—"}, hits: {r.reportScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching report found.</div>
                  )}
                  {r.bestContact ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Contact:</b>{" "}
                      {r.bestContact.name || r.bestContact.title || "contact"}{" "}
                      <span style={{ color: DIM }}>
                        (role: {r.bestContact.role || "—"}, hits: {r.contactScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching contact found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No swarm jobs match current filter.
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {panel}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        title="SwarmJob × Report × Contact Triple Nexus (SJRPCNT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 613,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8, cursor: "pointer",
          color: open ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "4px 8px",
          boxShadow: open ? `0 0 18px ${CY}44` : "none",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}>
        ◈ SJRPCNT
        {badgeDark > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#04060A",
            borderRadius: 4, fontSize: 8, padding: "1px 4px", fontWeight: 700,
          }}>{badgeDark}</span>
        )}
      </button>
    </>
  );
}
