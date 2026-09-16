/**
 * F126 — SwarmJob × Alert Exposure Monitor (SJAM)
 *
 * Parallel-fetches /entities/SwarmJob and /v1/alerts every 60 s.
 * Keyword-correlates each swarm job (name, description, target, objective,
 * tags) against active alerts (type, category, message, title, source,
 * severity) to classify:
 *
 *  TRIGGERED — swarm job keywords match at least one active alert
 *  QUIET     — no alert overlap found
 *
 * Stat tiles: jobs / alerts / triggered / quiet
 * Amber badge on triggered count.
 * Filter tabs: ALL / TRIGGERED / QUIET + text search.
 * Expand job row → matched alerts with severity badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SJAM  at left:4260 bottom:18, zIndex:68.
 * Event:   jarvis:sjam-toggle
 * Voice:   "swarm alert / alert swarm / sjam / triggered swarm / swarm exposure /
 *           swarm alerts / which swarm jobs have alerts / swarm alert exposure"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4260;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLORS = {
  CRITICAL: RED,
  HIGH:     AMBER,
  MEDIUM:   "#F59E0B",
  LOW:      CY,
  INFO:     MUTED,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

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
    id:          String(j.id ?? j.job_id ?? i),
    name:        j.name ?? j.job_name ?? j.title ?? `Job ${i + 1}`,
    description: j.description ?? j.details ?? j.body ?? "",
    target:      j.target ?? j.target_host ?? "",
    objective:   j.objective ?? j.goal ?? "",
    status:      j.status ?? j.state ?? "unknown",
    tags:        Array.isArray(j.tags) ? j.tags : [],
  }));
}

function normaliseAlerts(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:       String(a.id ?? a.alert_id ?? i),
    type:     a.type ?? a.alert_type ?? "unknown",
    category: a.category ?? a.group ?? "",
    message:  a.message ?? a.description ?? a.details ?? a.title ?? "",
    source:   a.source ?? a.origin ?? a.service ?? "",
    severity: (a.severity ?? a.level ?? a.priority ?? "INFO").toUpperCase(),
    title:    a.title ?? a.name ?? a.type ?? "",
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(job, alerts) {
  const jobTokens = new Set([
    ...tokenise(job.name),
    ...tokenise(job.description),
    ...tokenise(job.target),
    ...tokenise(job.objective),
    ...job.tags.flatMap(t => tokenise(t)),
  ]);
  const matches = [];
  for (const al of alerts) {
    const alTokens = tokenise(
      `${al.type} ${al.category} ${al.message} ${al.title} ${al.source}`
    );
    const hits = alTokens.filter(t => jobTokens.has(t)).length;
    if (hits > 0) matches.push({ ...al, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [jRes, aRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    fetch(`${base}/v1/alerts`,         { headers: hdr }),
  ]);
  const jobs   = normaliseJobs(await jRes.json());
  const alerts = normaliseAlerts(await aRes.json());
  const enriched = jobs.map(j => {
    const matches = correlate(j, alerts);
    return { ...j, matches, status2: matches.length > 0 ? "TRIGGERED" : "QUIET" };
  });
  return { jobs: enriched, alerts };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isSjamQuery(q) {
  return /swarm.?alert|alert.?swarm|sjam|triggered.?swarm|swarm.?exposure|swarm.?alerts|which.?swarm.?jobs.?have.?alert|swarm.?alert.?exposure/i.test(q);
}

export async function buildSjamScript() {
  try {
    const { jobs, alerts } = await fetchAll();
    const triggered = jobs.filter(j => j.status2 === "TRIGGERED");
    const topJob = triggered[0];
    const prompt =
      `JARVIS swarm-alert exposure report: ${jobs.length} swarm jobs checked against ` +
      `${alerts.length} active alerts. ${triggered.length} jobs classified TRIGGERED — ` +
      `their objectives intersect with active alert signals.` +
      (topJob
        ? ` Highest-correlation job: ${topJob.name} with ${topJob.matches.length} matched alert(s).`
        : "") +
      ` Summarise the alert exposure in exactly 2 sentences and recommend priority action.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body:    JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return (
      aiData.response ?? aiData.reply ?? aiData.message ??
      `${triggered.length}/${jobs.length} swarm jobs TRIGGERED against ${alerts.length} active alerts.`
    );
  } catch {
    return "Swarm-alert exposure data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border:     `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "sjam-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────

function JobRow({ job }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...job.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border:     `1px solid ${job.status2 === "TRIGGERED" ? AMBER : MUTED}22`,
      background: job.status2 === "TRIGGERED"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color:  job.status2 === "TRIGGERED" ? AMBER : GREEN,
          border: `1px solid ${job.status2 === "TRIGGERED" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
          width: 60, textAlign: "center",
        }}>
          {job.status2 === "TRIGGERED" ? "TRIGGERED" : "QUIET"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {job.name}
          </div>
          {(job.status ?? job.target) && (
            <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
              {[job.status, job.target].filter(Boolean).join(" · ").slice(0, 40)}
            </div>
          )}
        </div>

        {job.matches.length > 0 && (
          <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
            {job.matches.length} alert{job.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {job.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No correlated alerts found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED ALERTS
              </div>
              {job.matches.slice(0, 6).map(m => {
                const barPct = Math.round((m.score / maxScore) * 100);
                return (
                  <div key={m.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border:     `1px solid ${SEV_COLORS[m.severity] ?? MUTED}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700,
                        color:  SEV_COLORS[m.severity] ?? MUTED,
                        border: `1px solid ${SEV_COLORS[m.severity] ?? MUTED}66`,
                        padding: "1px 4px", borderRadius: 2,
                        width: 46, textAlign: "center", flexShrink: 0,
                      }}>
                        {m.severity.slice(0, 4)}
                      </span>
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.title || m.type}{m.category ? ` · ${m.category}` : ""}
                      </span>
                      <span style={{ fontSize: 7, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    {m.message && (
                      <div style={{
                        fontSize: 7, color: MUTED, marginBottom: 3,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.message.slice(0, 60)}
                      </div>
                    )}
                    <div style={{ height: 3, background: `${SEV_COLORS[m.severity] ?? MUTED}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: SEV_COLORS[m.severity] ?? MUTED, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                );
              })}
              {job.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{job.matches.length - 6} more alert{job.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "TRIGGERED", "QUIET"];

export default function SwarmJobAlertMonitor() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchAll());
    } catch (e) {
      setError(String(e));
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
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:sjam-toggle", h);
    return () => window.removeEventListener("jarvis:sjam-toggle", h);
  }, []);

  async function assess() {
    setAssessing(true);
    const script = await buildSjamScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const jobs      = data?.jobs ?? [];
  const alerts    = data?.alerts ?? [];
  const triggered = jobs.filter(j => j.status2 === "TRIGGERED");
  const quiet     = jobs.filter(j => j.status2 === "QUIET");

  const visible = jobs.filter(j => {
    if (tab === "TRIGGERED" && j.status2 !== "TRIGGERED") return false;
    if (tab === "QUIET"     && j.status2 !== "QUIET")     return false;
    if (search) {
      const q = search.toLowerCase();
      return j.name.toLowerCase().includes(q) || j.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × Alert Exposure Monitor (SJAM)"
        style={{
          position:        "fixed",
          left:            BTN_LEFT,
          bottom:          18,
          zIndex:          68,
          padding:         "4px 10px",
          background:      open ? AMBER : "rgba(4,7,14,0.85)",
          border:          `1px solid ${AMBER}`,
          color:           open ? "#04060A" : AMBER,
          borderRadius:    4,
          cursor:          "pointer",
          fontFamily:      MONO,
          fontSize:        9,
          fontWeight:      700,
          letterSpacing:   1,
          backdropFilter:  "blur(6px)",
          whiteSpace:      "nowrap",
        }}
      >
        ◈ SJAM
        {triggered.length > 0 && (
          <span style={{
            marginLeft:    5,
            background:    AMBER,
            color:         "#04060A",
            borderRadius:  8,
            padding:       "0 5px",
            fontSize:      8,
            fontWeight:    900,
          }}>
            {triggered.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:       "fixed",
          left:           BTN_LEFT - 320,
          bottom:         48,
          zIndex:         68,
          width:          420,
          maxHeight:      "min(520px,78vh)",
          background:     "rgba(4,7,14,0.97)",
          border:         `1px solid ${AMBER}44`,
          borderRadius:   8,
          display:        "flex",
          flexDirection:  "column",
          overflow:       "hidden",
          boxShadow:      `0 0 40px ${AMBER}18`,
          fontFamily:     MONO,
        }}>
          {/* Header */}
          <div style={{
            display:         "flex",
            alignItems:      "center",
            gap:             8,
            padding:         "8px 12px",
            borderBottom:    `1px solid ${AMBER}22`,
            background:      `rgba(245,166,35,0.04)`,
            flexShrink:      0,
          }}>
            <span style={{ color: AMBER, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
              ◈ SWARMJOB × ALERT EXPOSURE MONITOR
            </span>
            <button
              onClick={assess}
              disabled={assessing || !data}
              style={{
                marginLeft:   "auto",
                padding:      "2px 8px",
                background:   assessing ? AMBER : "transparent",
                border:       `1px solid ${AMBER}`,
                color:        assessing ? "#04060A" : AMBER,
                borderRadius: 3,
                cursor:       assessing ? "default" : "pointer",
                fontSize:     8,
                fontWeight:   700,
                letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: "none",
                color: MUTED, cursor: "pointer", fontSize: 14, padding: 0,
              }}
            >×</button>
          </div>

          {/* Stat tiles */}
          {data && (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexShrink: 0 }}>
              <StatTile label="JOBS"      value={jobs.length}      accent={CY}   />
              <StatTile label="ALERTS"    value={alerts.length}    accent={MUTED} />
              <StatTile label="TRIGGERED" value={triggered.length} accent={AMBER} pulse={triggered.length > 0} />
              <StatTile label="QUIET"     value={quiet.length}     accent={GREEN} />
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 12px 8px", flexShrink: 0,
          }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding:      "2px 8px",
                  background:   tab === t ? AMBER : "transparent",
                  border:       `1px solid ${tab === t ? AMBER : MUTED + "44"}`,
                  color:        tab === t ? "#04060A" : MUTED,
                  borderRadius: 3,
                  cursor:       "pointer",
                  fontSize:     8,
                  fontWeight:   700,
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft:   "auto",
                padding:      "2px 7px",
                background:   "rgba(41,231,255,0.04)",
                border:       `1px solid ${CY}22`,
                borderRadius: 3,
                color:        CY,
                fontSize:     8,
                fontFamily:   MONO,
                outline:      "none",
                width:        90,
              }}
            />
          </div>

          {/* Content */}
          <div style={{ overflowY: "auto", padding: "0 12px 12px", flex: 1 }}>
            {loading && !data && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", padding: "20px 0" }}>
                Loading…
              </div>
            )}
            {error && (
              <div style={{ color: RED, fontSize: 9, padding: "12px 0" }}>
                Error: {error}
              </div>
            )}
            {data && visible.length === 0 && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", padding: "20px 0" }}>
                No jobs match the current filter.
              </div>
            )}
            {data && visible.map(j => <JobRow key={j.id} job={j} />)}
          </div>

          {/* Footer */}
          {data && (
            <div style={{
              borderTop:  `1px solid ${AMBER}22`,
              padding:    "5px 12px",
              fontSize:   7,
              color:      MUTED,
              flexShrink: 0,
              display:    "flex",
              alignItems: "center",
              gap:        8,
            }}>
              <span>
                {triggered.length}/{jobs.length} TRIGGERED · {alerts.length} alerts checked
              </span>
              <button
                onClick={load}
                disabled={loading}
                style={{
                  marginLeft:   "auto",
                  background:   "transparent",
                  border:       `1px solid ${CY}33`,
                  color:        CY,
                  padding:      "1px 6px",
                  borderRadius: 3,
                  cursor:       loading ? "default" : "pointer",
                  fontSize:     7,
                  fontFamily:   MONO,
                }}
              >
                {loading ? "…" : "↻"}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes sjam-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
