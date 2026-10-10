/**
 * F189 — SwarmJob × Intel Profile Operation Coverage (SJINTEL)
 *
 * Parallel-fetches /entities/SwarmJob and /entities/IntelProfile, then
 * keyword-correlates each intel profile against active swarm jobs to surface:
 *
 *   HUNTING   — at least one swarm job keyword-matches this intel profile
 *               (active operational hunt in progress for this threat actor)
 *   UNHUNTED  — no swarm job aligns with this intel profile
 *               (threat actor not being actively tracked — operational gap)
 *
 * Stat tiles: profiles / jobs / hunting / unhunted
 * Filter tabs: ALL | HUNTING | UNHUNTED + text search
 * Expand profile → matched swarm jobs with status badge + relevance score.
 * Purple badge on HUNTING count.
 * ▶ ASSESS: 2-sentence operational coverage brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SJINTEL  at bottom:8 left:67400, zIndex:130.
 * Event:   jarvis:sjintel-toggle
 * Voice:   "swarm intel / intel hunt / sjintel / swarm hunter /
 *           active threat hunt / which threats are being hunted /
 *           hunting status / threat hunting coverage"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 67400;
const POLL_MS  = 60_000;
const PURPLE   = "#A78BFA";
const SLATE    = "#6E8AA0";
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const CYAN     = "#29E7FF";
const RED      = "#F87171";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const SJINTEL_RE =
  /\b(swarm\s+intel(\s+profile[s]?)?|intel\s+(hunt|profile[s]?)\s+swarm|sjintel|swarm\s+hunter[s]?|active\s+threat\s+hunt\w*|which\s+threat[s]?\s+are\s+(being\s+)?hunt\w*|hunting\s+status|threat\s+hunting\s+coverage|swarm\s+threat\s+coverage|intel\s+hunt[s]?|hunt\w*\s+coverage)\b/i;

export function isSjintelQuery(q) { return SJINTEL_RE.test(q); }

export async function buildSjintelScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jobRes, profRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,     { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const jobs     = normaliseJobs(await jobRes.json());
    const profiles = normaliseProfiles(await profRes.json());

    const hunting  = profiles.filter(
      (p) => jobs.some((j) => relevance(p, j) > 0)
    ).length;
    const unhunted = profiles.length - hunting;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm–intel profile operational coverage: ${profiles.length} intel profiles ` +
          `cross-referenced against ${jobs.length} active swarm jobs. ` +
          `${hunting} profiles have at least one swarm job aligned (active hunts in progress); ` +
          `${unhunted} profiles have no swarm job coverage (unhunted threat actors — operational gap). ` +
          `Provide a 2-sentence threat hunting coverage brief — formal British butler tone, ` +
          `first person, highlight the operational gap if significant.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat hunting coverage analysis complete, sir.").trim();
  } catch {
    return "Swarm intel profile coverage assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.jobs)                ? raw.jobs
    : Array.isArray(raw?.swarm_jobs)          ? raw.swarm_jobs
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((j, i) => ({
    id:          j.id           || j.job_id          || String(i),
    title:       j.title        || j.name            || j.label    || `Job ${i + 1}`,
    objective:   (j.objective   || j.description     || j.goal     || j.summary || "").toString().slice(0, 300),
    status:      j.status       || j.state           || "",
    target:      (j.target      || j.target_entity   || j.focus    || "").toString(),
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : (j.tags || ""),
    type:        j.type         || j.job_type        || "",
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.profiles)            ? raw.profiles
    : Array.isArray(raw?.intel_profiles)      ? raw.intel_profiles
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:          p.id           || p.profile_id      || String(i),
    name:        p.name         || p.actor           || p.title    || `Profile ${i + 1}`,
    category:    p.category     || p.type            || p.group    || "",
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
    description: (p.description || p.summary         || p.bio      || "").toString().slice(0, 300),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%]+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, job) {
  const pw = keywords(
    `${profile.name} ${profile.category} ${profile.tags} ${profile.description} ${profile.aliases}`
  );
  const jw = keywords(
    `${job.title} ${job.objective} ${job.target} ${job.tags} ${job.type}`
  );
  return pw.filter((w) => jw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(profiles, jobs) {
  return profiles.map((prof) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(prof, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...prof, jobs: matched, hunting: matched.length > 0 };
  });
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("run") || s.includes("activ")) return GREEN;
  if (s.includes("pend") || s.includes("queue")) return AMBER;
  if (s.includes("fail") || s.includes("error")) return RED;
  return CYAN;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "HUNTING", "UNHUNTED"];

export default function SwarmIntelProfileCoverage() {
  const [open,       setOpen]       = useState(false);
  const [jobs,       setJobs]       = useState([]);
  const [profiles,   setProfiles]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jobRes, profRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,     { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await jobRes.json()));
      setProfiles(normaliseProfiles(await profRes.json()));
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
    window.addEventListener("jarvis:sjintel-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sjintel-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildSjintelScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(profiles, jobs);
  const hunting   = linked.filter((p) => p.hunting).length;
  const unhunted  = linked.length - hunting;

  const displayed = linked.filter((p) => {
    if (filter === "HUNTING"  && !p.hunting) return false;
    if (filter === "UNHUNTED" &&  p.hunting) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q)        ||
      p.category.toLowerCase().includes(q)    ||
      p.tags.toLowerCase().includes(q)        ||
      p.description.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="SwarmJob × Intel Profile Coverage (SJINTEL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 130,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${PURPLE}55`,
          color: PURPLE, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {hunting > 0
          ? <><span style={{ background: PURPLE, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{hunting}</span>◈ SJINTEL</>
          : "◈ SJINTEL"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 130,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${PURPLE}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${PURPLE}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${PURPLE}33` }}>
        <span style={{ color: PURPLE, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ SJINTEL</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>SWARM JOB × INTEL PROFILE COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: PURPLE, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${PURPLE}22` }}>
        {[
          { label: "PROFILES",  value: linked.length, col: SLATE  },
          { label: "JOBS",      value: jobs.length,   col: CYAN   },
          { label: "HUNTING",   value: hunting,        col: PURPLE },
          { label: "UNHUNTED",  value: unhunted,       col: AMBER  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${PURPLE}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${PURPLE}22` : "none",
            border: `1px solid ${filter === t ? PURPLE : SLATE}`,
            color: filter === t ? PURPLE : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${PURPLE}`,
          color: PURPLE, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* profile list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No profiles match the current filter.
          </div>
        )}
        {displayed.map((prof) => {
          const isExp = expanded === prof.id;
          const col   = prof.hunting ? PURPLE : AMBER;
          const badge = prof.hunting ? "HUNTING" : "UNHUNTED";
          return (
            <div key={prof.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : prof.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${PURPLE}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${prof.hunting ? `${PURPLE}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{prof.name}</span>
                {prof.category && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${CYAN}22`, color: CYAN, letterSpacing: 1,
                  }}>
                    {prof.category.slice(0, 12).toUpperCase()}
                  </span>
                )}
                {prof.hunting && (
                  <span style={{ fontSize: 8, color: PURPLE }}>
                    {prof.jobs.length} job{prof.jobs.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${PURPLE}22` }}>
                  {prof.jobs.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>
                      No swarm jobs keyword-correlate with this intel profile — threat actor not being actively hunted.
                    </div>
                  ) : (
                    prof.jobs.map((j) => (
                      <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{j.title}</span>
                        {j.status && (
                          <span style={{
                            fontSize: 8, padding: "1px 5px", borderRadius: 4,
                            background: `${statusColor(j.status)}22`, color: statusColor(j.status),
                            letterSpacing: 1,
                          }}>
                            {j.status.slice(0, 10).toUpperCase()}
                          </span>
                        )}
                        <span style={{ fontSize: 8, color: GREEN }}>rel:{j.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
