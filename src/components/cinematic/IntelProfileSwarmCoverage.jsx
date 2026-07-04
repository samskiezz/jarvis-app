/**
 * IntelProfileSwarmCoverage — F141.
 *
 * Parallel-fetches /entities/IntelProfile + /entities/SwarmJob then
 * keyword-correlates each threat actor (name/description/org/type/aliases)
 * against active swarm jobs to surface:
 *   HUNTED  — at least one swarm job is targeting / aligned to this profile.
 *   UNTRACKED — no swarm coverage, intelligence gap.
 *
 * Stat tiles: profiles / jobs / hunted / untracked
 * Filter tabs: ALL / HUNTED / UNTRACKED + text search
 * Expand profile → matched swarm jobs with status badge + progress bar + score.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-automation brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "intel swarm" / "threat swarm" / "hunt coverage" /
 *         "which threats are hunted" / "ipswm"
 *   → jarvis:ipswm-toggle + TTS brief via buildIpswmScript()
 *
 * Toggle: ◈ IPSWM at left:45800, bottom:8, zIndex 93.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF4444";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 45800;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseProfiles(raw) {
  return normaliseArray(raw).map((p) => ({
    id:           p.id || p.profile_id || String(Math.random()),
    name:         p.name || p.title || p.subject || "Unknown Actor",
    description:  p.description || p.summary || p.bio || "",
    org:          p.org || p.organization || p.affiliation || p.group || "",
    type:         p.type || p.profile_type || p.category || "",
    threat_level: p.threat_level || p.threat || p.severity || "",
    aliases:      [
      ...(p.aliases || []),
      ...(p.known_aliases || []),
      ...(p.aka || []),
    ].map(String),
    tags: [...(p.tags || []), ...(p.labels || [])].map(String),
  }));
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j) => ({
    id:        j.id || j.job_id || String(Math.random()),
    name:      j.name || j.title || j.job_name || "Unnamed Job",
    objective: j.objective || j.description || j.goal || j.task || "",
    type:      j.type || j.job_type || j.category || "",
    status:    j.status || j.state || "",
    progress:  j.progress ?? j.completion ?? j.percent ?? null,
    tags:      [...(j.tags || []), ...(j.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(profile, job) {
  const jobText = `${job.name} ${job.objective} ${job.type} ${job.tags.join(" ")}`.toLowerCase();
  const words = [
    ...tokens(profile.name),
    ...tokens(profile.description),
    ...tokens(profile.org),
    ...tokens(profile.type),
    ...profile.aliases.flatMap(tokens),
    ...profile.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (jobText.includes(w) ? 1 : 0), 0);
}

function correlate(profiles, jobs) {
  return profiles.map((p) => {
    const matched = jobs
      .map((j) => ({ ...j, _score: matchScore(p, j) }))
      .filter((j) => j._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...p, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const IPSWM_RE =
  /intel[\s-]?swarm|threat[\s-]?swarm|hunt[\s-]?coverage|which[\s-]?threats?[\s-]?are[\s-]?hunted?|ipswm\b/i;

export function isIpswmQuery(q) {
  return IPSWM_RE.test(q || "");
}

export async function buildIpswmScript() {
  try {
    const [profRaw, jobRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/SwarmJob?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const profiles  = normaliseProfiles(profRaw);
    const jobs      = normaliseJobs(jobRaw);
    const corr      = correlate(profiles, jobs);
    const hunted    = corr.filter((p) => p.matched.length > 0);
    const untracked = corr.filter((p) => p.matched.length === 0);
    return `Intel profile swarm coverage active, sir. ${profiles.length} threat actor${profiles.length !== 1 ? "s" : ""} cross-referenced against ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""}. ${hunted.length} profile${hunted.length !== 1 ? "s are" : " is"} actively targeted by swarm automation. ${untracked.length} profile${untracked.length !== 1 ? "s have" : " has"} no swarm coverage — intelligence gap. Select any profile to review matched swarm jobs and request an AI threat-automation assessment.`;
  } catch (_) {
    return "Intel profile swarm coverage correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const THREAT_COLOUR = (level) => {
  const l = (level || "").toLowerCase();
  if (l === "critical") return RED;
  if (l === "high")     return AMBER;
  if (l === "medium")   return "#F0C040";
  if (l === "low")      return GREEN;
  return "#445566";
};

const STATUS_COLOUR = (s) => {
  const sl = (s || "").toLowerCase();
  if (sl === "running")   return CY;
  if (sl === "failed")    return RED;
  if (sl === "completed") return GREEN;
  if (sl === "queued")    return AMBER;
  return "#445566";
};

export default function IntelProfileSwarmCoverage() {
  const [visible, setVisible]     = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [profRaw, jobRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/SwarmJob?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setProfiles(normaliseProfiles(profRaw));
      setJobs(normaliseJobs(jobRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ipswm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipswm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessProfile(p) {
    setAssessing(p.id);
    const jobTitles = p.matched.map((j) => `"${j.name}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence threat-automation assessment for the intel profile "${p.name}" (type: ${p.type || "unknown"}, org: ${p.org || "unknown"}, threat level: ${p.threat_level || "unknown"}). Swarm jobs targeting this profile: ${jobTitles || "none"}. Assess the swarm automation coverage for this threat actor and whether the current intelligence operation posture is adequate.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient intelligence to assess this threat profile's swarm coverage, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Threat assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated  = correlate(profiles, jobs);
  const hunted      = correlated.filter((p) => p.matched.length > 0);
  const untracked   = correlated.filter((p) => p.matched.length === 0);

  const base =
    tab === "HUNTED"    ? hunted    :
    tab === "UNTRACKED" ? untracked : correlated;

  const displayed = search
    ? base.filter((p) =>
        `${p.name} ${p.type} ${p.org} ${p.description}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Intel Profile × Swarm Job Coverage Monitor (F141)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 93,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ IPSWM
        {untracked.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{untracked.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 93,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ INTEL PROFILE × SWARM COVERAGE</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["PROFILES",   profiles.length,   CY],
              ["JOBS",       jobs.length,        PURPLE],
              ["HUNTED",     hunted.length,      GREEN],
              ["UNTRACKED",  untracked.length,   untracked.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "HUNTED", "UNTRACKED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="search threat profiles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Profile rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating threat profiles against swarm job catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNTRACKED"
                ? "All threat profiles appear to have swarm coverage."
                : "No profiles in this filter."}
            </div>
          ) : (
            displayed.map((p) => {
              const isOpen   = expanded === p.id;
              const isHunted = p.matched.length > 0;
              const tc       = THREAT_COLOUR(p.threat_level);
              return (
                <div key={p.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${isHunted ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : p.id)}>
                  {/* Profile header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>{p.name}</span>
                        {p.threat_level && (
                          <span style={{
                            fontSize: 7, color: tc,
                            border: `1px solid ${tc}44`,
                            borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                            textTransform: "uppercase",
                          }}>{p.threat_level}</span>
                        )}
                        {p.type && (
                          <span style={{
                            fontSize: 7, color: PURPLE,
                            border: "1px solid #A78BFA44",
                            borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                            textTransform: "uppercase",
                          }}>{p.type}</span>
                        )}
                      </div>
                      {(p.org || p.description) && (
                        <div style={{ color: "#556677", fontSize: 8 }}>
                          {[p.org, p.description].filter(Boolean).join(" · ").slice(0, 80)}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isHunted ? GREEN : AMBER,
                      border: `1px solid ${isHunted ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {isHunted
                        ? `${p.matched.length} job${p.matched.length !== 1 ? "s" : ""}`
                        : "UNTRACKED"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessProfile(p); }}
                      disabled={assessing === p.id}
                      style={{
                        background: assessing === p.id ? "#1a2530" : `${CY}18`,
                        color: assessing === p.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === p.id ? "default" : "pointer",
                      }}
                    >{assessing === p.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded swarm job list */}
                  {isOpen && isHunted && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {p.matched.map((j) => {
                        const sc = STATUS_COLOUR(j.status);
                        return (
                          <div key={j.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              {j.status && (
                                <span style={{
                                  fontSize: 7, color: sc,
                                  border: `1px solid ${sc}44`,
                                  borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                                  textTransform: "uppercase", flexShrink: 0,
                                }}>{j.status}</span>
                              )}
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{j.name}</div>
                              <div style={{ marginLeft: "auto", fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                                score {j._score}
                              </div>
                            </div>
                            {j.objective && (
                              <div style={{ color: "#334455", fontSize: 8, marginBottom: 4 }}>
                                {j.objective.slice(0, 80)}
                              </div>
                            )}
                            {j.progress != null && (
                              <div style={{ marginTop: 4 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                  <span style={{ color: "#445566", fontSize: 7 }}>progress</span>
                                  <span style={{ color: sc, fontSize: 7 }}>{j.progress}%</span>
                                </div>
                                <div style={{ background: "#0e1a24", borderRadius: 3, height: 3, overflow: "hidden" }}>
                                  <div style={{
                                    width: `${Math.min(100, j.progress)}%`,
                                    height: "100%",
                                    background: sc,
                                    borderRadius: 3,
                                    transition: "width 0.4s ease",
                                  }} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen && !isHunted && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No swarm jobs are targeting this threat profile. This actor may be operating outside automated detection coverage.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/IntelProfile + /entities/SwarmJob · 90 s auto-refresh · ▶ ASSESS for AI threat-automation brief
          </div>
        </div>
      )}
    </>
  );
}
