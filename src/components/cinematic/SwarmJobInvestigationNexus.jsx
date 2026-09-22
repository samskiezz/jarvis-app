/**
 * SwarmJobInvestigationNexus — F495
 * "JARVIS, swarm investigation / investigation swarm / swrinv /
 *  automated case / swarm case coverage / which investigations have swarm /
 *  case automation / swarm coverage for cases / investigation automation"
 * Cross-references /entities/SwarmJob + /v1/investigations.
 * Keyword-matches investigation titles/subjects against active swarm job names/descriptions.
 * COVERED vs UNASSIGNED rows; click-to-expand matched jobs; ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const ORG = "#FF8C42";
const GRN = "#00E5A0";
const DIM = "#8899AA";
const AMB = "#FFD700";
const RED = "#FF4466";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const SWRINV_RE =
  /\bswarm.?invest\w*\b|\binvest\w*.?swarm\b|\bswrinv\b|\bautomated.?case\b|\bswarm.?case.?coverage\b|\bwhich.invest\w*.?have.?swarm\b|\bcase.?automation\b|\bswarm.?coverage.?for.?case\b|\binvest\w*.?automation\b|\bswarm.job.?invest\w*\b/i;

export function isSwrinvQuery(text) {
  return SWRINV_RE.test(text || "");
}

function normaliseJobs(data) {
  if (!data) return [];
  const raw = data.jobs || data.swarm_jobs || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:          j.id || `sj-${i}`,
    name:        (j.name || j.job_name || j.title || `Job ${i + 1}`).trim(),
    status:      (j.status || j.state || "UNKNOWN").toUpperCase(),
    description: j.description || j.summary || j.detail || null,
    tags: [
      ...(j.tags || []),
      ...(j.labels || []),
      j.target, j.entity, j.related_entity, j.category,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw = data.investigations || data.cases || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    name:    (inv.title || inv.name || inv.subject || `Case ${i + 1}`).trim(),
    status:  (inv.status || inv.state || "OPEN").toUpperCase(),
    lead:    inv.lead || inv.assigned_to || inv.owner || null,
    summary: inv.summary || inv.description || null,
    tags: [
      ...(inv.tags || []),
      ...(inv.labels || []),
      inv.subject, inv.category, inv.lead,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function buildNexus(investigations, jobs) {
  return investigations.map(inv => {
    const iName = inv.name.toLowerCase();
    const matched = jobs.filter(j => {
      const jName = (j.name || "").toLowerCase();
      const jDesc = (j.description || "").toLowerCase();
      const nameHit = jName.includes(iName) || iName.includes(jName) || jDesc.includes(iName);
      const tagHit  = inv.tags.some(it =>
        j.tags.some(jt => jt && it && (jt.includes(it) || it.includes(jt)))
      );
      return nameHit || tagHit;
    });
    return { inv, jobs: matched, covered: matched.length > 0 };
  });
}

export async function buildSwrinvScript() {
  let jobData = null, invData = null;
  try {
    const [jr, ir] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/investigations`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (jr.ok) jobData = await jr.json();
    if (ir.ok) invData = await ir.json();
  } catch (_) {}

  if (!jobData && !invData)
    return "Unable to retrieve swarm-investigation nexus data at this time, sir.";

  const jobs           = normaliseJobs(jobData);
  const investigations = normaliseInvestigations(invData);
  const nexus          = buildNexus(investigations, jobs);
  const covered        = nexus.filter(r => r.covered);
  const unassigned     = nexus.filter(r => !r.covered);

  if (!nexus.length)
    return `Swarm-Investigation Nexus: ${jobs.length} swarm jobs and ${investigations.length} investigations scanned. No cross-reference data available, sir.`;

  const pct = nexus.length ? Math.round((covered.length / nexus.length) * 100) : 0;

  const top = covered.slice(0, 2).map(r =>
    `${r.inv.name} (${r.jobs.length} job${r.jobs.length !== 1 ? "s" : ""})`
  ).join("; ");

  return [
    `Swarm-Investigation Nexus: ${covered.length} of ${nexus.length} investigations have automated swarm coverage (${pct}%).`,
    unassigned.length
      ? `${unassigned.length} case${unassigned.length !== 1 ? "s" : ""} currently unautomated.`
      : "All active investigations have swarm coverage.",
    top ? `Top covered: ${top}.` : null,
  ].filter(Boolean).join(" ");
}

const STATUS_COLOR = {
  RUNNING:  GRN, ACTIVE: GRN, COMPLETE: CY, COMPLETED: CY,
  FAILED: RED, ERROR: RED, PENDING: AMB, QUEUED: AMB, PAUSED: DIM,
};
function jobStatusColor(status) {
  return STATUS_COLOR[status] || DIM;
}

const INV_STATUS_COLOR = {
  OPEN: GRN, ACTIVE: CY, ESCALATED: RED, CLOSED: DIM, RESOLVED: DIM,
};
function invStatusColor(status) {
  return INV_STATUS_COLOR[status] || DIM;
}

export default function SwarmJobInvestigationNexus() {
  const [open,      setOpen]      = useState(false);
  const [nexus,     setNexus]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/investigations`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const jobData  = jr.ok ? await jr.json() : null;
      const invData  = ir.ok ? await ir.json() : null;
      const jobs     = normaliseJobs(jobData);
      const invs     = normaliseInvestigations(invData);
      setNexus(buildNexus(invs, jobs));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => { if (!o) load(); return !o; });
    };
    window.addEventListener("jarvis:swrinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:swrinv-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async (row) => {
    setAssessing(row.inv.id);
    try {
      const jobNames = row.jobs.map(j => `${j.name}${j.status ? " [" + j.status + "]" : ""}`).join("; ");
      const prompt = `Briefly assess the automated swarm coverage for investigation "${row.inv.name}" (status: ${row.inv.status}). Matched swarm jobs: ${jobNames || "none"}. Two sentences max.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (txt) {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text: txt, voice: "onyx" }),
          });
        }
      }
    } catch (_) {}
    finally { setAssessing(null); }
  }, []);

  const covered    = nexus.filter(r => r.covered);
  const unassigned = nexus.filter(r => !r.covered);
  const pct        = nexus.length ? Math.round((covered.length / nexus.length) * 100) : 0;

  const visible = nexus.filter(row => {
    if (filter === "COVERED"    && !row.covered) return false;
    if (filter === "UNASSIGNED" && row.covered)  return false;
    if (search && !row.inv.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 22100, bottom: 8, zIndex: 84,
          background: open ? CY : "rgba(0,20,40,0.92)",
          color: open ? "#000" : CY,
          border: `1px solid ${unassigned.length > 0 ? RED : CY}`,
          borderRadius: 4, padding: "3px 8px",
          fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        title="Swarm × Investigation Nexus (SWRINV)"
      >
        ◈ SWRINV{unassigned.length > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unassigned.length}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 84,
          width: 500, maxHeight: "72vh",
          background: "rgba(0,12,28,0.97)",
          border: `1px solid ${CY}`,
          borderRadius: 8, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 24px ${CY}44`,
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            background: "rgba(41,231,255,0.06)",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ SWARM × INVESTIGATION NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: DIM, fontSize: 9 }}>SCANNING…</span>}
              {lastTs && !loading && (
                <span style={{ color: DIM, fontSize: 9 }}>
                  {new Date(lastTs).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
                         borderRadius: 3, padding: "1px 6px", fontSize: 9, cursor: "pointer" }}
              >↺</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM,
                         fontSize: 13, cursor: "pointer", lineHeight: 1 }}
              >✕</button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 16, padding: "6px 12px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              ["CASES",      nexus.length,       CY],
              ["COVERED",    covered.length,     GRN],
              ["UNASSIGNED", unassigned.length,  unassigned.length > 0 ? RED : DIM],
              ["COVERAGE",   `${pct}%`,          pct >= 80 ? GRN : pct >= 50 ? AMB : RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter tabs */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search investigations…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
                borderRadius: 4, padding: "4px 8px", color: "#d0e8ff", fontSize: 10,
                fontFamily: "monospace", outline: "none", marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {["ALL", "COVERED", "UNASSIGNED"].map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background: filter === t ? (t === "UNASSIGNED" ? RED : CY) : "rgba(41,231,255,0.08)",
                    color: filter === t ? "#000" : (t === "UNASSIGNED" ? RED : CY),
                    border: `1px solid ${t === "UNASSIGNED" ? RED + "88" : CY + "55"}`,
                    borderRadius: 3, padding: "1px 6px", fontSize: 8, cursor: "pointer", letterSpacing: 1,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, padding: 16, textAlign: "center" }}>
                No investigations match this filter.
              </div>
            )}
            {visible.map(row => {
              const isExp  = expanded === row.inv.id;
              const iCol   = invStatusColor(row.inv.status);
              return (
                <div
                  key={row.inv.id}
                  style={{ borderBottom: `1px solid ${CY}18`, padding: "8px 12px", cursor: "pointer" }}
                  onClick={() => setExpanded(isExp ? null : row.inv.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        background: iCol + "22", color: iCol,
                        border: `1px solid ${iCol}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
                      }}>{row.inv.status}</span>
                      <span style={{
                        background: row.covered ? GRN + "22" : RED + "22",
                        color: row.covered ? GRN : RED,
                        border: `1px solid ${row.covered ? GRN : RED}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
                      }}>{row.covered ? `${row.jobs.length} JOB${row.jobs.length !== 1 ? "S" : ""}` : "UNASSIGNED"}</span>
                      <span style={{ color: "#e0f0ff", fontSize: 11 }}>{row.inv.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {row.covered && (
                        <button
                          onClick={e => { e.stopPropagation(); assess(row); }}
                          disabled={assessing === row.inv.id}
                          style={{
                            background: "none", border: `1px solid ${CY}55`, color: CY,
                            borderRadius: 3, padding: "1px 5px", fontSize: 8, cursor: "pointer",
                            opacity: assessing === row.inv.id ? 0.5 : 1,
                          }}
                        >
                          {assessing === row.inv.id ? "…" : "▶ ASSESS"}
                        </button>
                      )}
                      <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {row.inv.summary && !isExp && (
                    <div style={{ color: DIM, fontSize: 9, marginTop: 3, paddingLeft: 0, lineHeight: 1.4 }}>
                      {row.inv.summary.slice(0, 120)}{row.inv.summary.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.inv.lead && (
                        <div style={{ color: DIM, fontSize: 9 }}>Lead: <span style={{ color: AMB }}>{row.inv.lead}</span></div>
                      )}
                      {row.inv.summary && (
                        <div style={{ color: "#9ab8d0", fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>
                          {row.inv.summary}
                        </div>
                      )}
                      {row.jobs.length === 0 && (
                        <div style={{ color: RED, fontSize: 9 }}>No swarm jobs mapped to this investigation.</div>
                      )}
                      {row.jobs.map(j => {
                        const jCol = jobStatusColor(j.status);
                        return (
                          <div key={j.id} style={{
                            background: "rgba(41,231,255,0.04)",
                            border: `1px solid ${jCol}33`,
                            borderRadius: 4, padding: "5px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                background: jCol + "22", color: jCol,
                                border: `1px solid ${jCol}55`,
                                borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                              }}>{j.status}</span>
                              <span style={{ color: "#c0d8f0", fontSize: 10 }}>{j.name}</span>
                            </div>
                            {j.description && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
                                {j.description.slice(0, 140)}{j.description.length > 140 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid ${CY}22`,
            color: DIM, fontSize: 8, letterSpacing: 1,
          }}>
            AUTO-REFRESH {POLL_MS / 1000}s · /entities/SwarmJob + /v1/investigations
          </div>
        </div>
      )}
    </>
  );
}
