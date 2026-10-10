/**
 * F150 — SwarmJob × Investigation × RiskSignal × Contact
 *         Mission Command Coverage (MCOCOV)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/investigations +
 *   /entities/RiskSignal + /entities/Contact
 * Keyword-correlates each swarm job against investigations AND risk
 *   signals AND contacts to classify:
 *   FULLY_COMMANDED — matched all three sources (investigation + risk + contact)
 *   DUAL_COMMANDED  — matched any two sources
 *   SINGLE_LINKED   — matched exactly one source
 *   AUTONOMOUS      — no command coverage (no backing at all)
 *
 * Stat tiles: SWARM JOBS / INVESTIGATIONS / RISK SIGS / CONTACTS +
 *             all four class counts + COMMAND%.
 * Red pulse badge on AUTONOMOUS count.
 * Filter tabs ALL / FULLY_COMMANDED / DUAL_COMMANDED / SINGLE_LINKED / AUTONOMOUS
 *   + text search.
 * Expand job → matched investigation cards (blue) + risk signal cards (red,
 *   severity badge) + contact cards (orange, role badge) with relevance bars.
 * ▶ ASSESS COMMAND COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:mcocov-toggle event.
 *
 * Voice triggers: "mcocov / mission command / swarm command coverage /
 *                  autonomous swarm / command coverage / swarm without command".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_026_920;
const Z_INDEX  = 212;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const MCOCOV_RE = /\b(mcocov|mission[\s-]command|swarm[\s-]command[\s-]coverage|autonomous[\s-]swarm|command[\s-]coverage|swarm[\s-]without[\s-]command|uncontrolled[\s-]swarm|swarm[\s-]oversight)\b/i;

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const BL     = "#3B82F6";
const OR     = "#F97316";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COMMANDED: GR,
  DUAL_COMMANDED:  CY,
  SINGLE_LINKED:   AM,
  AUTONOMOUS:      RE,
};
const TABS = ["ALL","FULLY_COMMANDED","DUAL_COMMANDED","SINGLE_LINKED","AUTONOMOUS"];

const SEV_COLOR = { critical: RE, high: OR, medium: AM, low: GR };

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}

function jobText(j) {
  return [j.name, j.title, j.description, j.type, j.job_type, j.status,
          (Array.isArray(j.tags) ? j.tags.join(" ") : "")].filter(Boolean).join(" ");
}
function invText(i) {
  return [i.title, i.name, i.description, i.status, i.priority,
          (Array.isArray(i.tags) ? i.tags.join(" ") : "")].filter(Boolean).join(" ");
}
function riskText(r) {
  return [r.title, r.name, r.description, r.signal_type,
          (Array.isArray(r.tags) ? r.tags.join(" ") : "")].filter(Boolean).join(" ");
}
function contactText(c) {
  return [c.name, c.role, c.org, c.email, c.title,
          (Array.isArray(c.tags) ? c.tags.join(" ") : "")].filter(Boolean).join(" ");
}

function classify(job, investigations, riskSignals, contacts) {
  const kws = keywords(jobText(job));
  if (kws.length === 0) return { cls: "AUTONOMOUS", matchedInvs: [], matchedRisks: [], matchedContacts: [] };

  const matchedInvs     = investigations.filter(i => score(invText(i), kws) > 0);
  const matchedRisks    = riskSignals.filter(r => score(riskText(r), kws) > 0);
  const matchedContacts = contacts.filter(c => score(contactText(c), kws) > 0);

  const hits = (matchedInvs.length > 0 ? 1 : 0) +
               (matchedRisks.length > 0 ? 1 : 0) +
               (matchedContacts.length > 0 ? 1 : 0);

  const cls = hits >= 3 ? "FULLY_COMMANDED"
            : hits === 2 ? "DUAL_COMMANDED"
            : hits === 1 ? "SINGLE_LINKED"
            : "AUTONOMOUS";

  return { cls, matchedInvs, matchedRisks, matchedContacts };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export async function buildMcocovScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [sjR, invR, rsR, ctR] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`,       { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/investigations`,       { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`,     { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Contact`,        { headers }).then(r => r.json()).catch(() => []),
  ]);
  const jobs         = Array.isArray(sjR)  ? sjR  : (sjR?.items  ?? sjR?.data  ?? []);
  const investigations = Array.isArray(invR) ? invR : (invR?.items ?? invR?.data ?? []);
  const riskSignals  = Array.isArray(rsR)  ? rsR  : (rsR?.items  ?? rsR?.data  ?? []);
  const contacts     = Array.isArray(ctR)  ? ctR  : (ctR?.items  ?? ctR?.data  ?? []);

  const classified   = jobs.map(j => ({ ...j, ...classify(j, investigations, riskSignals, contacts) }));
  const fullyCmd     = classified.filter(j => j.cls === "FULLY_COMMANDED").length;
  const dualCmd      = classified.filter(j => j.cls === "DUAL_COMMANDED").length;
  const single       = classified.filter(j => j.cls === "SINGLE_LINKED").length;
  const autonomous   = classified.filter(j => j.cls === "AUTONOMOUS").length;
  const cmdPct       = jobs.length > 0 ? Math.round(((fullyCmd + dualCmd) / jobs.length) * 100) : 0;

  const ctx = `MCOCOV snapshot: ${jobs.length} swarm jobs cross-referenced against ${investigations.length} investigations, ${riskSignals.length} risk signals, and ${contacts.length} contacts. ` +
              `Classification: FULLY_COMMANDED=${fullyCmd}, DUAL_COMMANDED=${dualCmd}, SINGLE_LINKED=${single}, AUTONOMOUS=${autonomous}. Command coverage ${cmdPct}%.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `${ctx} In 2 sentences: identify which autonomous swarm jobs pose the greatest operational risk and recommend immediate command assignment priorities.` }),
  });
  const j = await r.json();
  return j?.response || j?.message || "MCOCOV Mission Command Coverage online, sir. Cross-referencing swarm jobs against investigations, risk signals, and contacts to surface uncontrolled autonomous operations requiring command assignment now.";
}

export function isMcocovQuery(q) {
  return MCOCOV_RE.test(q);
}

export default function SwarmMissionCommandCoverage() {
  const [open,          setOpen]          = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [jobs,          setJobs]          = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [riskSignals,   setRiskSignals]   = useState([]);
  const [contacts,      setContacts]      = useState([]);
  const [classified,    setClassified]    = useState([]);
  const [tab,           setTab]           = useState("ALL");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [brief,         setBrief]         = useState("");
  const [assessing,     setAssessing]     = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [sjR, invR, rsR, ctR] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,   { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/investigations`,   { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`,    { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const j  = Array.isArray(sjR)  ? sjR  : (sjR?.items  ?? sjR?.data  ?? []);
      const iv = Array.isArray(invR) ? invR : (invR?.items ?? invR?.data ?? []);
      const rs = Array.isArray(rsR)  ? rsR  : (rsR?.items  ?? rsR?.data  ?? []);
      const ct = Array.isArray(ctR)  ? ctR  : (ctR?.items  ?? ctR?.data  ?? []);
      setJobs(j); setInvestigations(iv); setRiskSignals(rs); setContacts(ct);
      setClassified(j.map(x => ({ ...x, ...classify(x, iv, rs, ct) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:mcocov-toggle", toggle);
    return () => window.removeEventListener("jarvis:mcocov-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    try { setBrief(await buildMcocovScript()); } catch { setBrief("Unable to fetch MCOCOV brief."); }
    setAssessing(false);
  };

  const counts = {
    FULLY_COMMANDED: classified.filter(j => j.cls === "FULLY_COMMANDED").length,
    DUAL_COMMANDED:  classified.filter(j => j.cls === "DUAL_COMMANDED").length,
    SINGLE_LINKED:   classified.filter(j => j.cls === "SINGLE_LINKED").length,
    AUTONOMOUS:      classified.filter(j => j.cls === "AUTONOMOUS").length,
  };
  const cmdPct = classified.length > 0
    ? Math.round(((counts.FULLY_COMMANDED + counts.DUAL_COMMANDED) / classified.length) * 100)
    : 0;

  const visible = classified.filter(j => {
    if (tab !== "ALL" && j.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return jobText(j).toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: counts.AUTONOMOUS > 0 ? "rgba(239,68,68,0.12)" : "rgba(6,11,22,0.85)",
          border: `1px solid ${counts.AUTONOMOUS > 0 ? RE : "rgba(0,207,255,0.3)"}`,
          color: counts.AUTONOMOUS > 0 ? RE : CY, fontFamily: FONT,
          fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ MCOCOV{counts.AUTONOMOUS > 0 && (
          <span style={{
            marginLeft: 4, background: RE, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 8,
            animation: "pulse 1.5s infinite",
          }}>{counts.AUTONOMOUS}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 400), zIndex: Z_INDEX + 1,
          width: 540, maxHeight: "75vh", overflowY: "auto",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 6, padding: 16, fontFamily: FONT,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: CY, letterSpacing: 2, fontWeight: 700 }}>
                ◈ MCOCOV
              </div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>
                Mission Command Coverage
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#64748B",
              cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              ["SWARM JOBS",   jobs.length,             CY],
              ["INVESTIGATIONS", investigations.length, BL],
              ["RISK SIGS",    riskSignals.length,      RE],
              ["CONTACTS",     contacts.length,         OR],
              ["FULLY CMD",    counts.FULLY_COMMANDED,  GR],
              ["DUAL CMD",     counts.DUAL_COMMANDED,   CY],
              ["SINGLE LNK",   counts.SINGLE_LINKED,    AM],
              ["AUTONOMOUS",   counts.AUTONOMOUS,       RE],
              ["COMMAND%",     `${cmdPct}%`,            cmdPct >= 70 ? GR : cmdPct >= 40 ? AM : RE],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`,
                borderRadius: 4, padding: "5px 10px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ fontSize: 8, color: "#64748B", letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
              </div>
            ))}
            {counts.AUTONOMOUS > 0 && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: `1px solid ${RE}`,
                borderRadius: 4, padding: "5px 10px", textAlign: "center",
                animation: "pulse 1.5s infinite",
              }}>
                <div style={{ fontSize: 8, color: RE, letterSpacing: 1 }}>AUTONOMOUS</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: RE }}>{counts.AUTONOMOUS}</div>
              </div>
            )}
          </div>

          {/* Command coverage bar */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748B", marginBottom: 3 }}>
              <span>COMMAND COVERAGE INDEX</span>
              <span style={{ color: cmdPct >= 70 ? GR : cmdPct >= 40 ? AM : RE }}>{cmdPct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", width: `${cmdPct}%`,
                background: cmdPct >= 70 ? GR : cmdPct >= 40 ? AM : RE,
                borderRadius: 2, transition: "width 0.4s",
              }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? "rgba(0,207,255,0.12)" : "transparent",
                border: `1px solid ${tab === t ? CY : BORDER}`,
                color: tab === t ? CY : "#64748B", fontFamily: FONT,
                fontSize: 9, padding: "3px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                color: "#E2E8F0", fontFamily: FONT, fontSize: 10, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 160,
              }}
            />
          </div>

          {/* Assess button */}
          <button onClick={assess} disabled={assessing} style={{
            background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 14px",
            borderRadius: 3, cursor: "pointer", marginBottom: 14,
          }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS COMMAND COVERAGE"}
          </button>
          {brief && (
            <div style={{
              background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`,
              borderRadius: 4, padding: "8px 12px", fontSize: 11, color: "#CBD5E1",
              lineHeight: 1.6, marginBottom: 14,
            }}>{brief}</div>
          )}

          {loading && <div style={{ color: "#64748B", fontSize: 11, marginBottom: 10 }}>◌ loading…</div>}
          {error && <div style={{ color: RE, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map((job, i) => {
              const isExp = expanded === i;
              const col   = CLASS_COLOR[job.cls];
              const kws   = keywords(jobText(job));
              const maxInvScore     = Math.max(1, ...job.matchedInvs.map(iv => score(invText(iv), kws)));
              const maxRiskScore    = Math.max(1, ...job.matchedRisks.map(r => score(riskText(r), kws)));
              const maxContactScore = Math.max(1, ...job.matchedContacts.map(c => score(contactText(c), kws)));
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${col}22`,
                  borderRadius: 4, padding: "8px 10px",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  >
                    <div style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 2,
                      background: `${col}22`, color: col, fontWeight: 700,
                      minWidth: 120, textAlign: "center",
                    }}>{job.cls}</div>
                    <div style={{ flex: 1, fontSize: 11, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.name || job.title || job.job_type || job.type || job.id || "—"}
                    </div>
                    {(job.status || job.state) && (
                      <div style={{ fontSize: 9, color: "#64748B", padding: "1px 6px", border: `1px solid ${BORDER}`, borderRadius: 2 }}>
                        {job.status || job.state}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "#64748B" }}>{isExp ? "▲" : "▼"}</div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Matched Investigations */}
                      {job.matchedInvs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: BL, letterSpacing: 1, marginBottom: 4 }}>
                            INVESTIGATIONS ({job.matchedInvs.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {job.matchedInvs.slice(0, 5).map((iv, ii) => {
                              const sc = score(invText(iv), kws);
                              return (
                                <div key={ii} style={{ background: "rgba(59,130,246,0.05)", border: `1px solid ${BL}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{iv.title || iv.name || "—"}</div>
                                    {iv.priority && <div style={{ fontSize: 8, color: BL, padding: "1px 4px", border: `1px solid ${BL}44`, borderRadius: 2 }}>{iv.priority}</div>}
                                  </div>
                                  <RelevanceBar score={sc} max={maxInvScore} color={BL} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched Risk Signals */}
                      {job.matchedRisks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: RE, letterSpacing: 1, marginBottom: 4 }}>
                            RISK SIGNALS ({job.matchedRisks.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {job.matchedRisks.slice(0, 5).map((r, ri) => {
                              const sc  = score(riskText(r), kws);
                              const sev = (r.severity || r.level || "medium").toLowerCase();
                              return (
                                <div key={ri} style={{ background: "rgba(239,68,68,0.05)", border: `1px solid ${RE}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{r.title || r.name || "—"}</div>
                                    <div style={{ fontSize: 8, color: SEV_COLOR[sev] || AM, padding: "1px 4px", border: `1px solid ${SEV_COLOR[sev] || AM}44`, borderRadius: 2 }}>
                                      {sev.toUpperCase()}
                                    </div>
                                  </div>
                                  <RelevanceBar score={sc} max={maxRiskScore} color={RE} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched Contacts */}
                      {job.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>
                            CONTACTS ({job.matchedContacts.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {job.matchedContacts.slice(0, 5).map((c, ci) => {
                              const sc = score(contactText(c), kws);
                              return (
                                <div key={ci} style={{ background: "rgba(249,115,22,0.05)", border: `1px solid ${OR}22`, borderRadius: 3, padding: "4px 8px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{c.name || "—"}</div>
                                    {c.role && <div style={{ fontSize: 8, color: OR, padding: "1px 4px", border: `1px solid ${OR}44`, borderRadius: 2 }}>{c.role}</div>}
                                  </div>
                                  <RelevanceBar score={sc} max={maxContactScore} color={OR} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {job.matchedInvs.length === 0 && job.matchedRisks.length === 0 && job.matchedContacts.length === 0 && (
                        <div style={{ fontSize: 10, color: "#4B5563" }}>
                          No command coverage found across investigations, risk signals, or contacts.
                          This swarm job is operating autonomously without oversight.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", padding: "20px 0" }}>
                No swarm jobs match the current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
