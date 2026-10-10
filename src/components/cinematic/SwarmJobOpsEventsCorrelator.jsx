/**
 * F105 — SwarmJob × Ops Events Correlator (SJOE)
 *
 * Parallel-fetches /entities/SwarmJob and /v1/ops/events every 60 s.
 * Keyword-correlates each swarm job (name, description, target, objective,
 * tags) against live ops events (type, resource, description, service) to
 * classify:
 *
 *  TRIGGERED — swarm job keywords match at least one live ops event
 *  QUIET     — no ops event overlap found
 *
 * Stat tiles: jobs / ops events / triggered / quiet
 * Amber badge on triggered count.
 * Filter tabs: ALL / TRIGGERED / QUIET + text search.
 * Expand job row → matched ops events with severity badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SJOE  at left:3480 bottom:18, zIndex:68.
 * Event:   jarvis:sjoe-toggle
 * Voice:   "swarm ops / ops swarm / sjoe / swarm operational / swarm events /
 *           swarm ops events / triggered swarm / which swarm jobs have ops events"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3480;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

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

function normaliseEvents(raw) {
  return normaliseArray(raw).map((e, i) => ({
    id:       String(e.id ?? e.event_id ?? i),
    type:     e.type ?? e.event_type ?? "unknown",
    resource: e.resource ?? e.resource_name ?? e.entity ?? "",
    desc:     e.description ?? e.message ?? e.details ?? "",
    service:  e.service ?? e.source ?? e.origin ?? "",
    severity: (e.severity ?? e.level ?? e.priority ?? "INFO").toUpperCase(),
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(job, events) {
  const jobTokens = new Set([
    ...tokenise(job.name),
    ...tokenise(job.description),
    ...tokenise(job.target),
    ...tokenise(job.objective),
    ...job.tags.flatMap(t => tokenise(t)),
  ]);
  const matches = [];
  for (const ev of events) {
    const evTokens = tokenise(`${ev.type} ${ev.resource} ${ev.desc} ${ev.service}`);
    const hits = evTokens.filter(t => jobTokens.has(t)).length;
    if (hits > 0) matches.push({ ...ev, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [jRes, eRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    fetch(`${base}/v1/ops/events`,     { headers: hdr }),
  ]);
  const jobs   = normaliseJobs(await jRes.json());
  const events = normaliseEvents(await eRes.json());
  const enriched = jobs.map(j => {
    const matches = correlate(j, events);
    return { ...j, matches, status2: matches.length > 0 ? "TRIGGERED" : "QUIET" };
  });
  return { jobs: enriched, events };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isSjoeQuery(q) {
  return /swarm.?ops|ops.?swarm|sjoe|swarm.?operational|swarm.?events|swarm.?ops.?events|triggered.?swarm|which.?swarm.?jobs.?have.?ops/i.test(q);
}

export async function buildSjoeScript() {
  try {
    const { jobs, events } = await fetchAll();
    const triggered = jobs.filter(j => j.status2 === "TRIGGERED");
    const topJob = triggered[0];
    const prompt = `JARVIS swarm-ops correlation report: ${jobs.length} swarm jobs checked against ${events.length} live ops events. ${triggered.length} jobs classified TRIGGERED — their objectives intersect with active operational activity.${topJob ? ` Highest-correlation job: ${topJob.name} with ${topJob.matches.length} matched event(s).` : ""} Summarise the operational overlap in exactly 2 sentences and recommend priority action.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${triggered.length}/${jobs.length} swarm jobs TRIGGERED against ${events.length} live ops events.`;
  } catch {
    return "Swarm-ops correlation data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "sjoe-pulse 1.4s ease-in-out infinite",
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
      border: `1px solid ${job.status2 === "TRIGGERED" ? AMBER : MUTED}22`,
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
          color: job.status2 === "TRIGGERED" ? AMBER : GREEN,
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
            {job.matches.length} event{job.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {job.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No correlated ops events found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED OPS EVENTS
              </div>
              {job.matches.slice(0, 6).map(m => {
                const barPct = Math.round((m.score / maxScore) * 100);
                return (
                  <div key={m.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border: `1px solid ${SEV_COLORS[m.severity] ?? MUTED}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700,
                        color: SEV_COLORS[m.severity] ?? MUTED,
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
                        {m.type}{m.resource ? ` · ${m.resource}` : ""}
                      </span>
                      <span style={{ fontSize: 7, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    {m.desc && (
                      <div style={{
                        fontSize: 7, color: MUTED, marginBottom: 3,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.desc.slice(0, 60)}
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
                  +{job.matches.length - 6} more event{job.matches.length - 6 !== 1 ? "s" : ""}
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

export default function SwarmJobOpsEventsCorrelator() {
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
    window.addEventListener("jarvis:sjoe-toggle", h);
    return () => window.removeEventListener("jarvis:sjoe-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildSjoeScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const jobs      = data?.jobs   ?? [];
  const events    = data?.events ?? [];
  const triggered = jobs.filter(j => j.status2 === "TRIGGERED");

  const visible = jobs
    .filter(j => tab === "ALL" || j.status2 === tab)
    .filter(j => {
      if (!search) return true;
      const q = search.toLowerCase();
      return j.name.toLowerCase().includes(q)
        || j.target.toLowerCase().includes(q)
        || j.objective.toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <>
        <style>{`@keyframes sjoe-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="SwarmJob × Ops Events Correlator (SJOE)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◈ SJOE
          {triggered.length > 0 && (
            <span style={{
              marginLeft: 5, background: AMBER, color: "#000",
              borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
              animation: "sjoe-pulse 1.4s ease-in-out infinite",
            }}>
              {triggered.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes sjoe-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      <button
        onClick={() => setOpen(false)}
        title="Close SJOE"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ SJOE ▲
      </button>

      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 460, maxHeight: "74vh",
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
              ◈ SWARM × OPS EVENTS
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="SWARM JOBS"  value={jobs.length}        accent={CY} />
          <StatTile label="OPS EVENTS"  value={events.length}      accent={PURP} />
          <StatTile label="TRIGGERED"   value={triggered.length}   accent={AMBER}
            pulse={triggered.length > 0} />
          <StatTile label="QUIET"       value={jobs.length - triggered.length} accent={GREEN} />
        </div>

        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
        )}

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${tab === t ? CY : MUTED}44`,
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
            placeholder="search jobs…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`, borderRadius: 2,
              color: CY, fontFamily: MONO, fontSize: 8,
              padding: "2px 6px", outline: "none",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {visible.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
              {jobs.length === 0 ? "No swarm jobs loaded." : "No jobs match filter."}
            </div>
          ) : (
            visible.map(j => <JobRow key={j.id} job={j} />)
          )}
        </div>
      </div>
    </>
  );
}
