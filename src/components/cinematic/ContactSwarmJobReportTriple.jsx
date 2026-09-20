/**
 * F120 — Contact × SwarmJob × Report Triple (CSJRT)
 *
 * Parallel-fetches /entities/Contact, /entities/SwarmJob, /v1/reports every 90 s.
 * Keyword-correlates each contact against swarm jobs AND the report catalog
 * to classify:
 *
 *  FULLY_TRACKED — contact matched by at least one swarm job AND one report
 *  JOB_ASSIGNED  — contact matched by swarm job only (no report coverage)
 *  REPORTED      — contact matched by report only (no automated job)
 *  DARK          — no match in either source (intelligence gap)
 *
 * Stat tiles: contacts / swarm jobs / reports / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / FULLY_TRACKED / JOB_ASSIGNED / REPORTED / DARK + text search.
 * Expand contact → matched swarm jobs list + matched reports list
 *   with status/type badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CSJRT  at left:4020 bottom:18, zIndex:68
 * Event:   jarvis:csjrt-toggle
 * Voice:   "contact swarm report / csjrt / team coverage / contact job report /
 *           contact tracking / who is tracked / tracked contacts"
 * Refresh: 90 s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4020;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const CLASS_COLOR = {
  FULLY_TRACKED: GREEN,
  JOB_ASSIGNED:  CY,
  REPORTED:      PURP,
  DARK:          AMBER,
};

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:          String(c.id ?? c.contact_id ?? i),
    name:        c.name ?? c.full_name ?? `Contact ${i + 1}`,
    email:       c.email ?? c.contact_email ?? "",
    company:     c.company ?? c.organization ?? c.org ?? "",
    title:       c.title ?? c.role ?? c.position ?? "",
    description: c.description ?? c.notes ?? c.bio ?? "",
    tags:        Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j, i) => ({
    id:          String(j.id ?? j.job_id ?? i),
    name:        j.name ?? j.title ?? `Job ${i + 1}`,
    description: j.description ?? j.objective ?? j.notes ?? "",
    target:      j.target ?? j.target_entity ?? "",
    type:        j.type ?? j.job_type ?? j.category ?? "",
    status:      j.status ?? j.state ?? "",
    tags:        Array.isArray(j.tags) ? j.tags : [],
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:      String(r.id ?? r.report_id ?? i),
    title:   r.title ?? r.name ?? `Report ${i + 1}`,
    content: r.content ?? r.body ?? r.summary ?? r.description ?? "",
    type:    r.type ?? r.report_type ?? r.category ?? "",
    tags:    Array.isArray(r.tags) ? r.tags : [],
  }));
}

// ─── correlation helpers ──────────────────────────────────────────────────────

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function contactTokens(contact) {
  return new Set([
    ...tokenise(contact.name),
    ...tokenise(contact.email),
    ...tokenise(contact.company),
    ...tokenise(contact.title),
    ...tokenise(contact.description),
    ...contact.tags.flatMap(tokenise),
  ]);
}

function correlate(ctTokens, items, fieldFn) {
  const matches = [];
  for (const item of items) {
    const itemToks = tokenise(fieldFn(item));
    const hits = itemToks.filter(t => ctTokens.has(t)).length;
    if (hits > 0) matches.push({ ...item, score: hits });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function jobFields(j) {
  return `${j.name} ${j.description} ${j.target} ${j.type} ${j.tags.join(" ")}`;
}

function reportFields(r) {
  return `${r.title} ${r.content} ${r.type} ${r.tags.join(" ")}`;
}

function classify(jobMatches, rptMatches) {
  const hasJob = jobMatches.length > 0;
  const hasRpt = rptMatches.length > 0;
  if (hasJob && hasRpt) return "FULLY_TRACKED";
  if (hasJob)           return "JOB_ASSIGNED";
  if (hasRpt)           return "REPORTED";
  return "DARK";
}

// ─── exported helpers for JarvisBrain wiring ─────────────────────────────────

export function isCsjrtQuery(q) {
  return /\b(csjrt|contact\s*swarm\s*report|team\s*coverage|contact\s*job\s*report|contact\s*tracking|who\s*is\s*tracked|tracked\s*contacts)\b/i.test(q);
}

export async function buildCsjrtScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [ctRaw, jobRaw, rptRaw] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/reports`,        { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const contacts = normaliseContacts(ctRaw);
    const jobs     = normaliseJobs(jobRaw);
    const reports  = normaliseReports(rptRaw);

    let fully = 0, jobOnly = 0, reported = 0, dark = 0;
    for (const ct of contacts) {
      const toks = contactTokens(ct);
      const c    = classify(
        correlate(toks, jobs,    jobFields),
        correlate(toks, reports, reportFields),
      );
      if (c === "FULLY_TRACKED") fully++;
      else if (c === "JOB_ASSIGNED") jobOnly++;
      else if (c === "REPORTED")     reported++;
      else dark++;
    }
    const pct = contacts.length > 0 ? Math.round((fully / contacts.length) * 100) : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `CSJRT summary: ${contacts.length} contacts correlated against ${jobs.length} swarm jobs and ${reports.length} reports. Fully tracked: ${fully}, job-only: ${jobOnly}, reported-only: ${reported}, dark: ${dark}. Full tracking coverage: ${pct}%. Provide a 2-sentence operational brief on contact tracking gaps.`,
      }),
    });
    const d = await r.json();
    return d.response ?? d.message ?? d.result ?? "CSJRT brief unavailable.";
  } catch {
    return "CSJRT assessment unavailable.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, background: `${accent}11`, border: `1px solid ${accent}33`,
      borderRadius: 4, padding: "6px 4px", textAlign: "center",
    }}>
      {pulse && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: accent,
          margin: "0 auto 2px",
          animation: "csjrt-pulse 1.2s ease-in-out infinite",
        }} />
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontSize: 6, color: MUTED, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score, max, color }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 2 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
    </div>
  );
}

function ContactRow({ contact }) {
  const [open, setOpen] = useState(false);
  const cls    = contact._class;
  const col    = CLASS_COLOR[cls] ?? MUTED;
  const maxJob = contact._jobMatches.length > 0 ? contact._jobMatches[0].score : 1;
  const maxRpt = contact._rptMatches.length > 0 ? contact._rptMatches[0].score : 1;

  return (
    <div style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: col }}>{cls.replace("_", " ")}</span>
          {contact.company && (
            <span style={{
              marginLeft: 5, fontSize: 6, color: "#000", background: PURP,
              borderRadius: 2, padding: "1px 4px",
            }}>{contact.company}</span>
          )}
          <div style={{ fontSize: 8, color: CY, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {contact.name}
          </div>
          <div style={{ fontSize: 7, color: MUTED }}>
            {contact._jobMatches.length} swarm jobs · {contact._rptMatches.length} reports
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUTED, marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 6, paddingLeft: 8 }}>
          {contact._jobMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 3 }}>SWARM JOBS</div>
              {contact._jobMatches.slice(0, 5).map(job => (
                <div key={job.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {job.status && (
                      <span style={{
                        fontSize: 6, color: "#000", background: CY,
                        borderRadius: 2, padding: "1px 3px",
                      }}>{job.status}</span>
                    )}
                    <span style={{ fontSize: 7, color: CY }}>{job.name}</span>
                  </div>
                  <ScoreBar score={job.score} max={maxJob} color={CY} />
                </div>
              ))}
            </>
          )}
          {contact._rptMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginTop: 4, marginBottom: 3 }}>REPORTS</div>
              {contact._rptMatches.slice(0, 5).map(rpt => (
                <div key={rpt.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {rpt.type && (
                      <span style={{
                        fontSize: 6, color: "#000", background: GREEN,
                        borderRadius: 2, padding: "1px 3px",
                      }}>{rpt.type}</span>
                    )}
                    <span style={{ fontSize: 7, color: GREEN }}>{rpt.title}</span>
                  </div>
                  <ScoreBar score={rpt.score} max={maxRpt} color={GREEN} />
                </div>
              ))}
            </>
          )}
          {contact._jobMatches.length === 0 && contact._rptMatches.length === 0 && (
            <div style={{ fontSize: 7, color: MUTED }}>No matches — DARK contact.</div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "FULLY_TRACKED", "JOB_ASSIGNED", "REPORTED", "DARK"];

// ─── main component ───────────────────────────────────────────────────────────

export default function ContactSwarmJobReportTriple() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [jobCount,  setJobCount]  = useState(0);
  const [rptCount,  setRptCount]  = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [ctRaw, jobRaw, rptRaw] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`,        { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const cts  = normaliseContacts(ctRaw);
      const jobs = normaliseJobs(jobRaw);
      const rpts = normaliseReports(rptRaw);
      setJobCount(jobs.length);
      setRptCount(rpts.length);
      const enriched = cts.map(ct => {
        const toks = contactTokens(ct);
        const jm   = correlate(toks, jobs, jobFields);
        const rm   = correlate(toks, rpts, reportFields);
        return { ...ct, _jobMatches: jm, _rptMatches: rm, _class: classify(jm, rm) };
      });
      setContacts(enriched);
    } catch (e) {
      setError(e.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:csjrt-toggle", handler);
    return () => window.removeEventListener("jarvis:csjrt-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildCsjrtScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const dark      = contacts.filter(c => c._class === "DARK");
  const fully     = contacts.filter(c => c._class === "FULLY_TRACKED");
  const jobOnly   = contacts.filter(c => c._class === "JOB_ASSIGNED");
  const reported  = contacts.filter(c => c._class === "REPORTED");

  const filtered = contacts
    .filter(c => tab === "ALL" || c._class === tab)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <style>{`@keyframes csjrt-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(41,231,255,0.13)",
          border: `1px solid ${open ? CY : `${CY}44`}`,
          color: open ? "#000" : CY,
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        {dark.length > 0 && (
          <span style={{
            display: "inline-block", marginRight: 4,
            background: AMBER, color: "#000",
            borderRadius: "50%", fontSize: 7, fontWeight: 700,
            width: 14, height: 14, lineHeight: "14px", textAlign: "center",
          }}>{dark.length}</span>
        )}
        ◈ CSJRT {open ? "▲" : "▼"}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 10, bottom: 55, zIndex: 68,
          width: 480, maxHeight: "74vh",
          background: BG, border: `1px solid ${CY}44`,
          borderRadius: 6, fontFamily: MONO,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 30px ${CY}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
                ◈ CONTACT × SWARMJOB × REPORT TRIPLE
              </span>
              {loading && (
                <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
              )}
            </div>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}1A` : `${CY}26`,
                border: `1px solid ${CY}66`, color: CY,
                fontFamily: MONO, fontSize: 8, padding: "3px 8px",
                borderRadius: 3, cursor: assessing ? "wait" : "pointer",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* primary stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
            <StatTile label="CONTACTS"     value={contacts.length}  accent={CY} />
            <StatTile label="FULLY TRACKED" value={fully.length}    accent={GREEN} />
            <StatTile label="JOB ONLY"     value={jobOnly.length}   accent={CY} />
            <StatTile label="DARK"         value={dark.length}      accent={AMBER} pulse={dark.length > 0} />
          </div>

          {/* secondary stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
            <StatTile label="SWARM JOBS" value={jobCount}        accent={PURP} />
            <StatTile label="REPORTS"    value={rptCount}        accent={GREEN} />
            <StatTile label="REPORTED"   value={reported.length} accent={PURP} />
          </div>

          {error && (
            <div style={{ padding: "4px 12px", fontSize: 8, color: AMBER }}>{error}</div>
          )}

          {/* filter tabs + search */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "transparent",
                  border: `1px solid ${tab === t ? CY : `${MUTED}44`}`,
                  color: tab === t ? "#000" : MUTED,
                  fontFamily: MONO, fontSize: 7, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                flex: 1, minWidth: 80,
                background: `${CY}0D`, border: `1px solid ${CY}33`,
                borderRadius: 2, color: CY, fontFamily: MONO, fontSize: 8,
                padding: "2px 6px", outline: "none",
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {filtered.length === 0 && !loading ? (
              <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
                {contacts.length === 0 ? "No contacts loaded." : "No contacts match filter."}
              </div>
            ) : (
              filtered.map(ct => <ContactRow key={ct.id} contact={ct} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
