/**
 * F104 — Graph Community × SwarmJob Coverage (GCSWJ)
 *
 * Parallel-fetches /v1/graph/communities + /entities/SwarmJob,
 * then keyword-correlates each network cluster against active swarm jobs
 * to surface:
 *
 *   AUTOMATED   — at least one swarm job covers this community's domain
 *   UNAUTOMATED — no swarm job addresses this cluster (automation gap)
 *
 * Stat tiles: communities / swarm jobs / automated / unautomated
 * Filter tabs: ALL | AUTOMATED | UNAUTOMATED + text search
 * Expand any cluster → matched swarm jobs with type + status badge + relevance score.
 * Lime badge on AUTOMATED count.
 * ▶ ASSESS: 2-sentence community-automation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCSWJ  at bottom:8 left:698080, zIndex:275.
 * Event:   jarvis:gcswj-toggle
 * Voice:   "community swarm / swarm community / gcswj /
 *           automated community / community automation /
 *           community swarm coverage /
 *           which communities have swarm jobs /
 *           unautomated communities"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 698080;
const POLL_MS  = 90_000;
const LIME     = "#84CC16";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const GREEN    = "#34D399";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCSWJ_RE =
  /\b(communit\w*\s+swarm|swarm\s+communit\w*|gcswj|automated\s+communit\w*|unautomated\s+communit\w*|communit\w*\s+automation|communit\w*\s+swarm\s+(job[s]?|coverage)|which\s+communities\s+have\s+swarm(\s+job[s]?)?|communit\w*\s+without\s+swarm|swarm\s+job[s]?\s+communit\w*|network\s+swarm\s+(job[s]?|coverage)?)\b/i;

export function isGcswjQuery(q) { return GCSWJ_RE.test(q); }

export async function buildGcswjScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, swRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,    { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const jobs        = normaliseJobs(await swRes.json());

    const automated   = communities.filter(
      (c) => jobs.some((j) => relevance(c, j) > 0)
    ).length;
    const unautomated = communities.length - automated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community swarm automation brief: ${communities.length} graph communities ` +
          `correlated against ${jobs.length} active swarm jobs. ` +
          `${automated} communities have at least one swarm job providing automation coverage (AUTOMATED); ` +
          `${unautomated} communities have no swarm job assigned (UNAUTOMATED — automation gap). ` +
          `Provide a 2-sentence community-automation coverage assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community swarm automation coverage analysis complete, sir.").trim();
  } catch {
    return "Community swarm automation coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.communities)           ? raw.communities
    : Array.isArray(raw?.clusters)              ? raw.clusters
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || c.community_id  || String(i),
    label:   c.label     || c.name          || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary  || c.description   || c.notes     || "").toString().slice(0, 300),
    size:    c.size      || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.swarm_jobs)         ? raw.swarm_jobs
    : [];
  return arr.map((j, i) => ({
    id:     j.id     || String(i),
    label:  j.name   || j.title       || j.job_name  || `Job ${i + 1}`,
    type:   (j.type  || j.kind        || j.category  || "SWARM").toString().toUpperCase(),
    status: (j.status || j.state      || "ACTIVE").toString().toUpperCase(),
    tokens: tok(`${j.name || ""} ${j.title || ""} ${j.description || ""} ${j.domain || ""} ${j.category || ""} ${j.type || ""} ${(j.tags || []).join(" ")}`),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(community, job) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const jv = new Set(job.tokens);
  return cw.filter((w) => jv.has(w)).length;
}

function statusColor(st) {
  if (st === "RUNNING" || st === "ACTIVE")   return "#34D399";
  if (st === "PENDING" || st === "QUEUED")   return "#F59E0B";
  if (st === "FAILED"  || st === "ERROR")    return "#F43F5E";
  if (st === "DONE"    || st === "COMPLETE") return "#60A5FA";
  return "#6E8AA0";
}

function buildLinked(communities, jobs) {
  return communities.map((c) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(c, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, jobs: matched, automated: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "AUTOMATED", "UNAUTOMATED"];

export default function GraphCommunitySwarmJobCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [jobs,        setJobs]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, swRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,    { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setJobs(normaliseJobs(await swRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gcswj-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcswj-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcswjScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked      = buildLinked(communities, jobs);
  const automated   = linked.filter((c) => c.automated).length;
  const unautomated = linked.length - automated;

  const displayed = linked.filter((c) => {
    if (filter === "AUTOMATED"   && !c.automated) return false;
    if (filter === "UNAUTOMATED" && c.automated)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × SwarmJob Coverage (GCSWJ)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 275,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${LIME}55`,
          color: LIME, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {automated > 0
          ? <><span style={{ background: LIME, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{automated}</span>◈ GCSWJ</>
          : "◈ GCSWJ"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 275,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${LIME}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${LIME}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${LIME}33` }}>
        <span style={{ color: LIME, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCSWJ</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × SWARM JOB COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: LIME, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${LIME}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,   col: BLUE  },
          { label: "SWARM JOBS",  value: jobs.length,     col: AMBER },
          { label: "AUTOMATED",   value: automated,        col: LIME  },
          { label: "UNAUTOMATED", value: unautomated,      col: unautomated > 0 ? AMBER : GREEN },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${LIME}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${LIME}22` : "none",
            border: `1px solid ${filter === t ? LIME : SLATE}`,
            color: filter === t ? LIME : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${LIME}`,
          color: LIME, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((c) => {
          const isExp = expanded === c.id;
          const col   = c.automated ? LIME : AMBER;
          const badge = c.automated ? "AUTOMATED" : "UNAUTOMATED";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${LIME}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.automated ? `${LIME}44` : `${AMBER}33`}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.automated && (
                  <span style={{ fontSize: 8, color: LIME }}>{c.jobs.length} job{c.jobs.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${LIME}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.jobs.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>⚠ No swarm job currently covers this community's domain — automation gap.</div>
                  ) : (
                    c.jobs.map((j, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: "rgba(132,204,22,0.15)", color: LIME,
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {j.type.slice(0, 5)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.label}</span>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${statusColor(j.status)}22`, color: statusColor(j.status),
                          flexShrink: 0,
                        }}>
                          {j.status.slice(0, 4)}
                        </span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: LIME, width: `${Math.min(100, j.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: LIME, flexShrink: 0 }}>{j.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "6px 14px", borderTop: `1px solid ${LIME}22`, color: SLATE, fontSize: 8, display: "flex", justifyContent: "space-between" }}>
        <span>{displayed.length} of {linked.length} communities · {jobs.length} swarm jobs indexed</span>
        <span>auto-refresh 90s</span>
      </div>
    </div>
  );
}
