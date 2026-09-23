/**
 * F82 — SwarmJob × Investigation Coverage (SJINV)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/investigations every 90 s.
 * Keyword-correlates each running swarm job against open investigations:
 *   ASSIGNED   — ≥1 investigation keyword-matches this job (case-grounded)
 *   AUTONOMOUS — no investigation covers this job (orphan, operational blind-spot)
 *
 * Stat tiles:  jobs / cases / assigned / autonomous
 * Filter tabs: ALL | ASSIGNED | AUTONOMOUS
 * Text search: across job name / type / status.
 * Expand row → matched investigation cards with status badge + relevance score bar.
 * Amber badge on AUTONOMOUS count.
 * ▶ ASSESS: 2-sentence swarm grounding brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SJINV  at left:24120 bottom:8, zIndex:84.
 * Event:   jarvis:sjinv-toggle
 * Voice:   "swarm investigation" / "sjinv" / "job case" / "swarm case"
 *          / "investigation job" / "which jobs have cases"
 *          / "jobs backing investigations" / "orphan jobs"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 24120;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j, i) => ({
    id:     String(j.id ?? j.job_id ?? i),
    name:   j.name ?? j.title ?? j.job_name ?? `Job ${i + 1}`,
    type:   j.type ?? j.job_type ?? j.category ?? null,
    status: j.status ?? j.state ?? null,
    body:   [j.name, j.title, j.description, j.type, j.job_type,
             j.tags, j.target, j.objective]
              .filter(Boolean).join(" "),
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:     String(inv.id ?? inv.investigation_id ?? i),
    title:  inv.title ?? inv.name ?? inv.case_name ?? `Case ${i + 1}`,
    status: inv.status ?? inv.state ?? null,
    body:   [inv.title, inv.name, inv.description, inv.summary,
             inv.type, inv.category, inv.tags, inv.subject]
              .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [jobRes, invRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`,    { headers: hdr }),
    fetch(`${base}/v1/investigations`,    { headers: hdr }),
  ]);
  return {
    jobs:           normaliseJobs(jobRes.ok           ? await jobRes.json() : []),
    investigations: normaliseInvestigations(invRes.ok ? await invRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(jobs, investigations) {
  return jobs.map(job => {
    const kws = buildKeywords([job.name, job.type ?? "", job.body]);
    const matched = investigations
      .map(inv => ({ inv, score: scoreMatch(kws, `${inv.title} ${inv.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      ...job,
      matched,
      classification: matched.length >= 1 ? "ASSIGNED" : "AUTONOMOUS",
    };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const SJINV_RE =
  /\b(sjinv|swarm[\s_-]?investigation[s]?|job[\s_-]?case[s]?|swarm[\s_-]?case[s]?|investigation[\s_-]?job[s]?|which[\s_-]?jobs[\s_-]?have[\s_-]?case[s]?|jobs[\s_-]?backing[\s_-]?investigation[s]?|orphan[\s_-]?job[s]?|ungrounded[\s_-]?job[s]?|autonomous[\s_-]?job[s]?|job[\s_-]?grounding)\b/i;

export function isSjinvQuery(q) { return SJINV_RE.test(q); }

export async function buildSjinvScript() {
  try {
    const { jobs, investigations } = await fetchAll();
    const rows       = correlate(jobs, investigations);
    const assigned   = rows.filter(r => r.classification === "ASSIGNED").length;
    const autonomous = rows.filter(r => r.classification === "AUTONOMOUS").length;
    const prompt =
      `Swarm job investigation coverage: ${jobs.length} running swarm jobs cross-referenced ` +
      `against ${investigations.length} open investigations. ` +
      `${assigned} jobs are grounded in at least one open case (ASSIGNED), ` +
      `while ${autonomous} jobs are running autonomously with no investigation backing — these are ` +
      `operational blind-spots that may be wasting compute or missing case context. ` +
      `In 2 sentences, assess the overall swarm job–investigation alignment and flag the highest-risk ` +
      `orphan jobs requiring immediate case assignment.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:sjinv-toggle"));
    return (
      data.response ?? data.reply ?? data.message ??
      `${assigned} assigned, ${autonomous} autonomous across ${investigations.length} cases.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:sjinv-toggle"));
    return "Swarm job investigation coverage panel is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "ASSIGNED", "AUTONOMOUS"];

const FILTER_COLOR = {
  ASSIGNED:   GREEN,
  AUTONOMOUS: AMBER,
};

export default function SwarmJobInvestigationCoverage() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [invCount,   setInvCount]   = useState(0);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [assessing,  setAssessing]  = useState(null);
  const [assessText, setAssessText] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { jobs, investigations } = await fetchAll();
      setRows(correlate(jobs, investigations));
      setInvCount(investigations.length);
    } catch (e) {
      setError(String(e?.message ?? e));
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
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:sjinv-toggle", handler);
    return () => window.removeEventListener("jarvis:sjinv-toggle", handler);
  }, []);

  const handleAssess = useCallback(async (job) => {
    const key = job.id;
    if (assessing === key) return;
    setAssessing(key);
    try {
      const matchedTitles = job.matched.map(m => m.inv.title).join(", ") || "none";
      const prompt =
        `Swarm job "${job.name}"` +
        (job.type ? ` (type: ${job.type})` : "") +
        (job.status ? `, status: ${job.status}` : "") +
        `. Investigation grounding: ${job.classification}. ` +
        `Linked cases: ${matchedTitles}. ` +
        `In 2 sentences, assess whether this swarm job is operating effectively within its ` +
        `investigation context, and recommend the next action to improve case grounding or ` +
        `close operational blind-spots.`;
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response ?? data.reply ?? data.message ?? "No assessment available.";
      setAssessText(prev => ({ ...prev, [key]: text }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText(prev => ({ ...prev, [key]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, [assessing]);

  const assigned   = rows.filter(r => r.classification === "ASSIGNED").length;
  const autonomous = rows.filter(r => r.classification === "AUTONOMOUS").length;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !r.body.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Investigation Coverage (SJINV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 84,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${CY}44`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ SJINV
        {autonomous > 0 && (
          <span style={{
            background: AMBER, color: "#0B1420", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 700, lineHeight: "14px",
          }}>
            {autonomous}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 200, zIndex: 84,
      width: 430, maxHeight: "70vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 8, display: "flex", flexDirection: "column",
      fontFamily: MONO, overflow: "hidden",
      boxShadow: `0 0 24px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ SWARMJOB × INVESTIGATION COVERAGE
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: MUTED,
            cursor: "pointer", fontSize: 12, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
      }}>
        {[
          { label: "JOBS",       val: rows.length, color: CY },
          { label: "CASES",      val: invCount,    color: CY },
          { label: "ASSIGNED",   val: assigned,    color: GREEN },
          { label: "AUTONOMOUS", val: autonomous,  color: autonomous > 0 ? AMBER : MUTED },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: "rgba(10,20,35,0.7)", borderRadius: 5,
            padding: "5px 0", textAlign: "center",
            border: `1px solid ${color}22`,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 7, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 14px",
        borderBottom: `1px solid ${CY}18`,
      }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "3px 8px", borderRadius: 3, cursor: "pointer",
              background: filter === f ? (FILTER_COLOR[f] ?? CY) + "22" : "transparent",
              border: `1px solid ${filter === f ? (FILTER_COLOR[f] ?? CY) : CY + "33"}`,
              color: filter === f ? (FILTER_COLOR[f] ?? CY) : MUTED,
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(10,20,35,0.7)",
            border: `1px solid ${CY}33`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9, padding: "2px 7px",
            outline: "none", width: 100,
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading && (
          <div style={{ color: MUTED, fontSize: 10, padding: 12, textAlign: "center" }}>
            loading…
          </div>
        )}
        {error && (
          <div style={{ color: "#FF3B6B", fontSize: 10, padding: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 10, padding: 12, textAlign: "center" }}>
            no jobs match
          </div>
        )}
        {filtered.map(job => {
          const isExp  = expanded === job.id;
          const clrDot = FILTER_COLOR[job.classification] ?? MUTED;
          return (
            <div
              key={job.id}
              style={{ borderBottom: `1px solid ${CY}11`, padding: "7px 14px" }}
            >
              {/* row header */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : job.id)}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: clrDot, flexShrink: 0,
                  boxShadow: job.classification === "AUTONOMOUS"
                    ? `0 0 5px ${AMBER}` : "none",
                }} />
                <span style={{
                  flex: 1, color: "#DCEBF5", fontSize: 11,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {job.name}
                  {job.type && (
                    <span style={{ color: CY, fontSize: 9, marginLeft: 5 }}>
                      [{job.type}]
                    </span>
                  )}
                </span>
                {job.status && (
                  <span style={{ fontSize: 8, letterSpacing: 1, color: MUTED }}>
                    {job.status}
                  </span>
                )}
                <span style={{ fontSize: 8, letterSpacing: 1, color: clrDot }}>
                  {job.classification}
                </span>
                <span style={{ color: MUTED, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {/* expanded */}
              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {/* matched investigations */}
                  {job.matched.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9, marginBottom: 6 }}>
                      no open investigations match this job — orphan swarm job
                    </div>
                  ) : (
                    job.matched.slice(0, 5).map(({ inv, score }) => {
                      const maxScore = job.matched[0]?.score || 1;
                      const pct = Math.round((score / maxScore) * 100);
                      return (
                        <div key={inv.id} style={{
                          background: "rgba(10,20,35,0.6)", borderRadius: 4,
                          padding: "5px 8px", marginBottom: 4,
                          border: `1px solid ${CY}22`,
                        }}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", marginBottom: 3,
                          }}>
                            <span style={{
                              color: "#DCEBF5", fontSize: 10,
                              flex: 1, whiteSpace: "nowrap",
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {inv.title}
                            </span>
                            {inv.status && (
                              <span style={{
                                marginLeft: 6, fontSize: 7, letterSpacing: 1,
                                color: CY, border: `1px solid ${CY}44`,
                                borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                              }}>
                                {inv.status}
                              </span>
                            )}
                          </div>
                          {/* relevance bar */}
                          <div style={{ height: 2, background: `${CY}22`, borderRadius: 1 }}>
                            <div style={{
                              height: "100%", width: `${pct}%`,
                              background: CY, borderRadius: 1,
                              transition: "width 0.4s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* assess button */}
                  <button
                    onClick={() => handleAssess(job)}
                    disabled={assessing === job.id}
                    style={{
                      marginTop: 4, fontFamily: MONO, fontSize: 8,
                      letterSpacing: 1, padding: "3px 10px",
                      background: assessing === job.id ? `${CY}11` : `${CY}22`,
                      border: `1px solid ${CY}55`, color: CY,
                      borderRadius: 3, cursor: "pointer",
                    }}
                  >
                    {assessing === job.id ? "assessing…" : "▶ ASSESS"}
                  </button>

                  {assessText[job.id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${CY}09`, borderRadius: 4,
                      border: `1px solid ${CY}22`,
                      color: "#DCEBF5", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[job.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 14px", borderTop: `1px solid ${CY}18`,
        color: MUTED, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>AUTO-REFRESH 90 S</span>
        <span>{loading ? "REFRESHING…" : `${filtered.length} / ${rows.length} SHOWN`}</span>
      </div>
    </div>
  );
}
