/**
 * F130 — IntelProfile × SwarmJob Coverage (IPSC)
 *
 * Parallel-fetches /entities/IntelProfile and /entities/SwarmJob every 90 s.
 * Keyword-correlates each intel profile (name, description, aliases, tags,
 * role, organization) against active swarm jobs (name, description, target,
 * objective, tags) to classify:
 *
 *  ASSIGNED   — profile keywords match at least one swarm job
 *  UNASSIGNED — no swarm-job coverage found for this profile
 *
 * Stat tiles: profiles / jobs / assigned / unassigned
 * Amber badge on unassigned count.
 * Filter tabs: ALL / ASSIGNED / UNASSIGNED + text search.
 * Expand profile row → matched swarm jobs with status badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPSC  at left:4500 bottom:18, zIndex:68.
 * Event:   jarvis:ipsc-toggle
 * Voice:   "intel profile swarm / swarm intel / ipsc / assigned intel /
 *           unassigned intel / intel without swarm / intel swarm coverage /
 *           profile swarm / which intel profiles have swarm"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4500;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseProfiles(raw) {
  return normaliseArray(raw).map((p, i) => ({
    id:           String(p.id ?? p.profile_id ?? i),
    name:         p.name ?? p.subject ?? p.title ?? `Profile ${i + 1}`,
    description:  p.description ?? p.summary ?? p.bio ?? p.notes ?? "",
    aliases:      Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases ?? ""),
    role:         p.role ?? p.occupation ?? p.position ?? "",
    organization: p.organization ?? p.org ?? p.company ?? "",
    tags:         Array.isArray(p.tags) ? p.tags : [],
  }));
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

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(profile, jobs) {
  const profileTokens = new Set([
    ...tokenise(profile.name),
    ...tokenise(profile.description),
    ...tokenise(profile.aliases),
    ...tokenise(profile.role),
    ...tokenise(profile.organization),
    ...profile.tags.flatMap(t => tokenise(t)),
  ]);
  const matches = [];
  for (const job of jobs) {
    const jobTokens = tokenise(
      `${job.name} ${job.description} ${job.target} ${job.objective} ${job.tags.join(" ")}`
    );
    const hits = jobTokens.filter(t => profileTokens.has(t)).length;
    if (hits > 0) matches.push({ ...job, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [pRes, jRes] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    fetch(`${base}/entities/SwarmJob`,     { headers: hdr }),
  ]);
  const profiles = normaliseProfiles(await pRes.json());
  const jobs     = normaliseJobs(await jRes.json());
  const enriched = profiles.map(p => {
    const matches = correlate(p, jobs);
    return { ...p, matches, coverage: matches.length > 0 ? "ASSIGNED" : "UNASSIGNED" };
  });
  return { profiles: enriched, jobs };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isIpscQuery(q) {
  return /intel.?profile.?swarm|swarm.?intel|ipsc|assigned.?intel|unassigned.?intel|intel.?without.?swarm|intel.?swarm.?coverage|profile.?swarm|which.?intel.?profiles.?have.?swarm/i.test(q);
}

export async function buildIpscScript() {
  try {
    const { profiles, jobs } = await fetchAll();
    const unassigned = profiles.filter(p => p.coverage === "UNASSIGNED");
    const topAssigned = profiles.find(p => p.coverage === "ASSIGNED");
    const prompt =
      `JARVIS intel-profile swarm-job coverage report: ${profiles.length} intel profiles checked against ` +
      `${jobs.length} swarm jobs. ${unassigned.length} profiles classified UNASSIGNED — ` +
      `no active swarm job covers their intelligence domain.` +
      (topAssigned
        ? ` Best-covered profile: ${topAssigned.name} with ${topAssigned.matches.length} matching swarm job(s).`
        : "") +
      ` Summarise the coverage gap in exactly 2 sentences and recommend the next action.`;
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
      `${unassigned.length}/${profiles.length} intel profiles UNASSIGNED against ${jobs.length} swarm jobs.`
    );
  } catch {
    return "Intel-profile swarm coverage data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : accent === GREEN ? "0,200,120" : "41,231,255"},0.04)`,
      border:     `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "ipsc-pulse 1.4s ease-in-out infinite",
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

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = String(status ?? "").toLowerCase();
  const color = s === "running" ? GREEN : s === "completed" ? CY : s === "queued" ? AMBER : MUTED;
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, letterSpacing: 1,
      color, border: `1px solid ${color}44`,
      borderRadius: 2, padding: "1px 4px", textTransform: "uppercase",
    }}>
      {status || "unknown"}
    </span>
  );
}

// ─── Profile row ──────────────────────────────────────────────────────────────

function ProfileRow({ profile }) {
  const [expanded, setExpanded] = useState(false);
  const assigned   = profile.coverage === "ASSIGNED";
  const accent     = assigned ? GREEN : AMBER;
  const maxScore   = profile.matches.length > 0 ? profile.matches[0].score : 1;

  return (
    <div style={{
      borderBottom: `1px solid ${CY}11`,
      cursor: "pointer",
    }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 0", fontSize: 9, fontFamily: MONO,
      }}>
        <span style={{ color: accent, fontSize: 8, fontWeight: 700, minWidth: 72, letterSpacing: 1 }}>
          {profile.coverage}
        </span>
        <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {profile.name}
        </span>
        {profile.role && (
          <span style={{ color: MUTED, fontSize: 7, letterSpacing: 0.5 }}>{profile.role}</span>
        )}
        <span style={{
          fontSize: 7, fontWeight: 700, color: accent,
          border: `1px solid ${accent}44`, borderRadius: 2, padding: "1px 4px",
          marginLeft: 4, minWidth: 18, textAlign: "center",
        }}>
          {profile.matches.length}
        </span>
        <span style={{ color: MUTED, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "4px 0 8px 0" }}>
          {profile.organization && (
            <div style={{ fontSize: 8, color: MUTED, marginBottom: 6, fontFamily: MONO }}>
              org: {profile.organization}
            </div>
          )}
          {profile.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "4px 0", fontStyle: "italic" }}>
              No swarm job matches found.
            </div>
          ) : (
            profile.matches.slice(0, 6).map((job, idx) => (
              <div key={idx} style={{
                background: "rgba(41,231,255,0.03)",
                border: `1px solid ${CY}15`,
                borderRadius: 3,
                padding: "5px 8px",
                marginBottom: 4,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <StatusBadge status={job.status} />
                  <span style={{ color: CY, fontSize: 8, fontFamily: MONO, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.name}
                  </span>
                  <span style={{ color: AMBER, fontSize: 7, fontFamily: MONO }}>
                    score: {job.score}
                  </span>
                </div>
                <div style={{ height: 3, background: `${AMBER}22`, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, (job.score / maxScore) * 100)}%`,
                    background: AMBER,
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "ASSIGNED", "UNASSIGNED"];

export default function IntelProfileSwarmJobCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setError(e.message ?? "fetch failed");
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
    const handler = e => {
      if (e.detail?.query) {
        setOpen(true);
      } else {
        setOpen(o => !o);
      }
    };
    window.addEventListener("jarvis:ipsc-toggle", handler);
    return () => window.removeEventListener("jarvis:ipsc-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (!data) return;
    setAssessing(true);
    try {
      const script = await buildIpscScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [data]);

  const { profiles = [], jobs = [] } = data ?? {};
  const assigned   = profiles.filter(p => p.coverage === "ASSIGNED");
  const unassigned = profiles.filter(p => p.coverage === "UNASSIGNED");

  const visible = profiles
    .filter(p => {
      if (tab === "ASSIGNED")   return p.coverage === "ASSIGNED";
      if (tab === "UNASSIGNED") return p.coverage === "UNASSIGNED";
      return true;
    })
    .filter(p => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s) ||
        p.role.toLowerCase().includes(s) ||
        p.organization.toLowerCase().includes(s)
      );
    });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:   "fixed",
          left:       BTN_LEFT,
          bottom:     18,
          zIndex:     68,
          background: open ? AMBER : "rgba(4,6,10,0.85)",
          border:     `1px solid ${AMBER}`,
          color:      open ? "#04060A" : AMBER,
          padding:    "3px 8px",
          borderRadius: 3,
          cursor:     "pointer",
          fontSize:   8,
          fontWeight: 700,
          letterSpacing: 1,
          fontFamily: MONO,
          whiteSpace: "nowrap",
        }}
        title="IntelProfile × SwarmJob Coverage"
      >
        ◈ IPSC
        {data && unassigned.length > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMBER,
            color: "#04060A",
            borderRadius: 2,
            padding: "0 3px",
            fontSize: 7,
            fontWeight: 700,
          }}>
            {unassigned.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:   "fixed",
          left:       BTN_LEFT - 360,
          bottom:     44,
          width:      380,
          maxHeight:  520,
          zIndex:     69,
          background: "rgba(4,6,10,0.97)",
          border:     `1px solid ${AMBER}44`,
          borderRadius: 6,
          display:    "flex",
          flexDirection: "column",
          fontFamily: MONO,
          boxShadow:  `0 0 24px ${AMBER}22`,
        }}>
          {/* Header */}
          <div style={{
            display:     "flex",
            alignItems:  "center",
            gap:         8,
            padding:     "8px 12px",
            borderBottom: `1px solid ${AMBER}22`,
            flexShrink:  0,
          }}>
            <span style={{ color: AMBER, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
              ◈ INTEL PROFILE × SWARM COVERAGE
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
              <StatTile label="PROFILES"   value={profiles.length}   accent={CY}    />
              <StatTile label="JOBS"       value={jobs.length}       accent={MUTED} />
              <StatTile label="ASSIGNED"   value={assigned.length}   accent={GREEN} />
              <StatTile label="UNASSIGNED" value={unassigned.length} accent={AMBER} pulse={unassigned.length > 0} />
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
                No profiles match the current filter.
              </div>
            )}
            {data && visible.map(p => (
              <ProfileRow key={p.id} profile={p} />
            ))}
          </div>

          {/* Footer */}
          {data && (
            <div style={{
              borderTop: `1px solid ${AMBER}22`,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              fontSize: 7,
              color: MUTED,
              flexShrink: 0,
            }}>
              <span>{profiles.length} profiles · {jobs.length} swarm jobs · 90 s refresh</span>
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
        @keyframes ipsc-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
