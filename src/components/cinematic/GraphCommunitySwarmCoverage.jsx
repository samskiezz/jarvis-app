/**
 * GraphCommunitySwarmCoverage — F147
 *
 * Parallel-fetches /v1/graph/communities + /entities/SwarmJob.
 * Keyword-correlates each network cluster (label + metadata) against active
 * swarm jobs (name / objective / type) to surface:
 *
 *   COVERED  — at least one swarm job targets this cluster
 *   BLIND    — no swarm automation coverage (intelligence gap)
 *
 * Stat tiles: clusters / jobs / covered / blind
 * Filter tabs: ALL / COVERED / BLIND + text search
 * Expand cluster → matched swarm jobs with status badge + relevance score
 * Amber badge on blind count
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence cluster-automation brief
 *            + TTS via jarvis:speak-dossier
 *
 * Toggle:     ◈ GCSWM at left:48600 bottom:8 zIndex:98
 * Jarvis:     "graph community swarm"/"cluster swarm"/"swarm community"/
 *             "automated clusters"/"blind clusters"/"gcswm"
 * Event:      jarvis:gcswm-toggle
 * Refresh:    90 s
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const PURPLE = "#B87FFF";

const BTN_LEFT   = 48600;
const REFRESH_MS = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── parsing helpers ──────────────────────────────────────────────────────────

function parseCommunities(raw) {
  if (Array.isArray(raw))                          return raw;
  if (Array.isArray(raw?.communities))             return raw.communities;
  if (Array.isArray(raw?.clusters))                return raw.clusters;
  if (Array.isArray(raw?.data))                    return raw.data;
  return [];
}

function parseJobs(raw) {
  if (Array.isArray(raw))                          return raw;
  if (Array.isArray(raw?.jobs))                    return raw.jobs;
  if (Array.isArray(raw?.swarm_jobs))              return raw.swarm_jobs;
  if (Array.isArray(raw?.data))                    return raw.data;
  return [];
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function relevanceScore(communityTokens, jobText) {
  const jobTokens = tokenise(jobText);
  if (!communityTokens.length || !jobTokens.length) return 0;
  const matches = communityTokens.filter(ct => jobTokens.includes(ct));
  return Math.round((matches.length / Math.max(communityTokens.length, jobTokens.length)) * 100);
}

function matchJobs(community, jobs) {
  const label   = community.label ?? community.name ?? community.id ?? "";
  const members = Array.isArray(community.members) ? community.members.join(" ") : "";
  const haystack = `${label} ${members}`;
  const cTokens  = tokenise(haystack);

  const scored = jobs
    .map(job => {
      const jobText = [job.name, job.objective, job.type].filter(Boolean).join(" ");
      const score   = relevanceScore(cTokens, jobText);
      return score > 0 ? { ...job, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return scored;
}

// ─── status colour ────────────────────────────────────────────────────────────

function jobStatusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "RUNNING")   return GREEN;
  if (s === "FAILED")    return RED;
  if (s === "QUEUED")    return AMBER;
  if (s === "COMPLETED") return PURPLE;
  return CY;
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const GCSWM_RE = /graph.community.swarm|cluster.swarm|swarm.community|automated.cluster|blind.cluster|gcswm/i;

export function isGcswmQuery(q) {
  return GCSWM_RE.test(q || "");
}

export async function buildGcswmScript() {
  try {
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [commRaw, jobRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/graph/communities`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/entities/SwarmJob`,    { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const communities = parseCommunities(commRaw);
    const jobs        = parseJobs(jobRaw);
    const covered = communities.filter(c => matchJobs(c, jobs).length > 0);
    const blind   = communities.filter(c => matchJobs(c, jobs).length === 0);

    if (!communities.length) {
      return "Graph Community Swarm Coverage: no community data available at this time, sir.";
    }
    const covPct = Math.round((covered.length / communities.length) * 100);
    const blindNames = blind.slice(0, 3).map(c => c.label ?? c.name ?? c.id ?? "Unknown").join(", ");
    return (
      `Graph Community Swarm Coverage online, sir. ${covered.length} of ${communities.length} network clusters ` +
      `(${covPct}%) have active swarm automation coverage. ` +
      `${blind.length} cluster${blind.length !== 1 ? "s" : ""} remain BLIND with no swarm targeting` +
      (blind.length ? ` — including ${blindNames}${blind.length > 3 ? " and others" : ""}` : "") +
      ". Review blind clusters for automation gaps."
    );
  } catch (_) {
    return "Graph Community Swarm Coverage online. Unable to retrieve full data at this time, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function GraphCommunitySwarmCoverage() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [communities, setCommunities] = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]           = useState("ALL");   // ALL | COVERED | BLIND
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [commRaw, jobRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/communities`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${apiBase()}/entities/SwarmJob`,    { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      setCommunities(parseCommunities(commRaw));
      setJobs(parseJobs(jobRaw));
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:gcswm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcswm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const covered = communities.filter(c => matchJobs(c, jobs).length > 0);
      const blind   = communities.filter(c => matchJobs(c, jobs).length === 0);
      const covPct  = communities.length ? Math.round((covered.length / communities.length) * 100) : 0;
      const blindNames = blind.slice(0, 3).map(c => c.label ?? c.name ?? c.id ?? "Unknown").join(", ");
      const prompt =
        `We have ${communities.length} network clusters and ${jobs.length} active swarm jobs. ` +
        `${covered.length} clusters (${covPct}%) have swarm automation coverage. ` +
        `${blind.length} clusters are BLIND — no swarm targeting found` +
        (blind.length ? `, including: ${blindNames}` : "") + `. ` +
        `Give a 2-sentence assessment of the automation coverage gap and priority actions.`;
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs, body: JSON.stringify({ message: prompt }),
      });
      const data = await resp.json().catch(() => ({}));
      const text = data?.response ?? data?.reply ?? data?.message ?? "No assessment available.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {}
    finally { setAssessing(false); }
  }, [communities, jobs]);

  // ── computed ─────────────────────────────────────────────────────────────────
  const enriched = communities.map(c => {
    const matched = matchJobs(c, jobs);
    return { ...c, matched, covered: matched.length > 0 };
  });

  const q = query.trim().toLowerCase();
  const filtered = enriched.filter(c => {
    const label = [c.label, c.name, c.id].filter(Boolean).join(" ").toLowerCase();
    const matchesQ = !q || label.includes(q);
    if (tab === "COVERED") return c.covered && matchesQ;
    if (tab === "BLIND")   return !c.covered && matchesQ;
    return matchesQ;
  });

  const coveredCount = enriched.filter(c => c.covered).length;
  const blindCount   = enriched.filter(c => !c.covered).length;
  const badgeColor   = blindCount > 0 ? AMBER : GREEN;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × SwarmJob Coverage — cluster automation gaps"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 98,
          background: "rgba(5,10,18,0.85)",
          border: `1px solid ${blindCount > 0 ? AMBER : CY}44`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          color: blindCount > 0 ? AMBER : CY,
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ GCSWM
        {blindCount > 0 && (
          <span style={{
            background: badgeColor, color: "#000",
            borderRadius: 4, padding: "1px 5px", fontSize: 8, fontWeight: 700,
          }}>
            {blindCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 97, background: "rgba(0,4,10,0.55)" }}
      />
      <div style={{
        position: "fixed", bottom: 50, left: BTN_LEFT - 400, zIndex: 98,
        width: 540, maxHeight: "72vh", display: "flex", flexDirection: "column",
        background: "rgba(5,10,20,0.97)", border: `1px solid ${CY}33`,
        borderRadius: 12, overflow: "hidden",
        boxShadow: `0 0 60px ${CY}10, 0 24px 48px rgba(0,0,0,0.8)`,
        fontFamily: "'JetBrains Mono',monospace",
      }}>
        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: CY, fontSize: 13 }}>◈</span>
          <span style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            GRAPH COMMUNITY SWARM COVERAGE
          </span>
          {loading && (
            <span style={{ color: CY, fontSize: 9, marginLeft: "auto", letterSpacing: 1 }}>
              LOADING…
            </span>
          )}
          {err && <span style={{ color: RED, fontSize: 9, marginLeft: "auto" }}>ERR</span>}
          <button onClick={() => setOpen(false)} style={{
            marginLeft: loading || err ? 0 : "auto",
            background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14,
          }}>×</button>
        </div>

        {/* stat tiles */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
          display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "CLUSTERS", value: communities.length,  color: CY    },
            { label: "JOBS",     value: jobs.length,          color: CY    },
            { label: "COVERED",  value: coveredCount,         color: GREEN },
            { label: "BLIND",    value: blindCount,           color: blindCount > 0 ? AMBER : CY },
          ].map(t => (
            <div key={t.label} style={{
              textAlign: "center", background: "rgba(255,255,255,0.03)",
              borderRadius: 6, padding: "6px 4px",
            }}>
              <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
              <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* controls */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
          display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {["ALL", "COVERED", "BLIND"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              borderRadius: 4, padding: "2px 8px", cursor: "pointer",
              color: tab === t ? CY : "#4E6070", fontSize: 9, letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="filter clusters…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CY}22`, borderRadius: 4, padding: "2px 8px",
              color: "#DCEBF5", fontSize: 9, outline: "none",
              fontFamily: "inherit", width: 140,
            }}
          />
        </div>

        {/* cluster list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#4E6070", fontSize: 11 }}>
              No clusters match this filter.
            </div>
          )}
          {filtered.map((c, i) => {
            const id     = c.id ?? c.name ?? i;
            const label  = c.label ?? c.name ?? c.id ?? "Cluster";
            const size   = c.size ?? (Array.isArray(c.members) ? c.members.length : null);
            const isOpen = expanded === id;
            const col    = c.covered ? GREEN : AMBER;
            const badge  = c.covered ? "COVERED" : "BLIND";

            return (
              <div key={id} style={{
                borderBottom: `1px solid ${CY}0F`,
                borderLeft: `2px solid ${c.covered ? GREEN : AMBER}`,
              }}>
                {/* row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : id)}
                  style={{
                    padding: "8px 16px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    color: col, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    background: `${col}18`, borderRadius: 4, padding: "1px 6px",
                    flexShrink: 0,
                  }}>
                    {badge}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                  {size !== null && (
                    <span style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1,
                      border: `1px solid ${CY}22`, borderRadius: 4, padding: "1px 5px",
                      flexShrink: 0 }}>
                      {size} nodes
                    </span>
                  )}
                  {c.covered && (
                    <span style={{ color: "#4E6070", fontSize: 8, flexShrink: 0 }}>
                      {c.matched.length} job{c.matched.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{ color: "#4E6070", fontSize: 10, flexShrink: 0 }}>
                    {isOpen ? "▲" : "▼"}
                  </span>
                </div>

                {/* expanded: matched jobs */}
                {isOpen && (
                  <div style={{ padding: "0 16px 10px 32px" }}>
                    {c.covered ? (
                      c.matched.map((job, ji) => (
                        <div key={job.id ?? job.name ?? ji} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "4px 0", borderTop: `1px solid ${CY}0A`,
                        }}>
                          <span style={{
                            color: jobStatusColor(job.status), fontSize: 8,
                            border: `1px solid ${jobStatusColor(job.status)}55`,
                            borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                          }}>
                            {String(job.status || "?").toUpperCase()}
                          </span>
                          <span style={{ color: "#9DBBD0", fontSize: 10, flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {job.name ?? job.id ?? "Unnamed job"}
                          </span>
                          {job.type && (
                            <span style={{ color: "#4E6070", fontSize: 8, letterSpacing: 0.5,
                              border: `1px solid ${CY}22`, borderRadius: 4, padding: "1px 4px",
                              flexShrink: 0 }}>
                              {String(job.type).toUpperCase()}
                            </span>
                          )}
                          {/* relevance bar */}
                          <div style={{ width: 48, height: 4, background: "rgba(255,255,255,0.08)",
                            borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{
                              width: `${job.score}%`, height: "100%",
                              background: CY, borderRadius: 2,
                            }} />
                          </div>
                          <span style={{ color: "#4E6070", fontSize: 8, flexShrink: 0 }}>
                            {job.score}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: "6px 0", color: AMBER, fontSize: 9, letterSpacing: 0.5 }}>
                        ⚠ No swarm jobs found targeting this cluster — automation gap
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}18`,
          display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "transparent" : `${CY}18`,
              border: `1px solid ${CY}44`, borderRadius: 6,
              padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer",
              color: assessing ? "#4E6070" : CY, fontSize: 9, letterSpacing: 1,
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button onClick={fetchData} style={{
            background: "transparent", border: `1px solid ${CY}22`,
            borderRadius: 6, padding: "4px 10px", cursor: "pointer",
            color: "#4E6070", fontSize: 9, letterSpacing: 1,
          }}>↻</button>
          <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 8, letterSpacing: 1 }}>
            /v1/graph/communities · /entities/SwarmJob · 90 s
          </span>
        </div>
      </div>
    </>
  );
}
