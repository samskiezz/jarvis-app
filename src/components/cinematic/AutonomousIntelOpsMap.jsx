/**
 * F214 — SwarmJob × AIP Skill × IntelProfile Autonomous Intelligence Operations Map (AIOMAP)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/aip/skill + /entities/IntelProfile
 * and keyword-correlates each swarm job against AIP skills AND intel actor
 * profiles to classify:
 *
 *   FULLY_MAPPED   — matched AIP skill + intel profile (guided, actor-aware automation)
 *   SKILL_GUIDED   — AIP skill match only (automated, no actor context)
 *   PROFILE_LINKED — intel profile match only (actor-aware, no skill automation)
 *   DARK           — neither match (autonomous intelligence gap)
 *
 * Stat tiles: SWARM JOBS / AIP SKILLS / INTEL PROFILES + four class counts + COVERAGE%.
 * Amber badge on DARK count.
 * Filter tabs ALL / FULLY_MAPPED / SKILL_GUIDED / PROFILE_LINKED / DARK + text search.
 * Expand job → matched AIP skill cards (cyan) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS OPERATIONS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:aiomap-toggle event.
 *
 * Voice triggers:
 *   "aiomap / swarm skill / autonomous operations / swarm intel / skill profile /
 *    intel ops map / autonomous intelligence map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_062_200;
const Z_INDEX  = 275;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const AIOMAP_RE = /\b(aiomap|swarm[\s-]skill|autonomous[\s-]operations?|swarm[\s-]intel|skill[\s-]profile|intel[\s-]ops[\s-]map|autonomous[\s-]intelligence[\s-]map)\b/i;

export function isAiomapQuery(q = "") { return AIOMAP_RE.test(q); }

export async function buildAiomapScript() {
  const base = apiBase();
  const [swarmRes, skillRes, profileRes] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
  ]);
  const jobs     = swarmRes.status   === "fulfilled" ? (swarmRes.value?.items   || swarmRes.value   || []) : [];
  const skills   = skillRes.status   === "fulfilled" ? (skillRes.value?.items   || skillRes.value   || []) : [];
  const profiles = profileRes.status === "fulfilled" ? (profileRes.value?.items || profileRes.value || []) : [];

  let fullyMapped = 0, dark = 0;
  for (const job of jobs) {
    const kws = keywords(jobText(job));
    const hasSkill   = skills.some(s   => scoreText(skillText(s),   kws) > 0);
    const hasProfile = profiles.some(p => scoreText(profileText(p), kws) > 0);
    if (hasSkill && hasProfile) fullyMapped++;
    else if (!hasSkill && !hasProfile) dark++;
  }
  const total      = jobs.length;
  const covPct     = total ? Math.round((fullyMapped / total) * 100) : 0;
  return `AIOMAP Autonomous Intelligence Operations Map online, sir. I have cross-referenced ${total} swarm jobs against ${skills.length} AIP skills and ${profiles.length} threat actor intel profiles. ${fullyMapped} jobs carry both skill automation and actor-aware intelligence — ${covPct}% fully mapped coverage. ${dark} jobs remain dark with no skill or actor context — representing an autonomous intelligence gap requiring immediate review, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const OR   = "#F97316";
const PU   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MAPPED:   GR,
  SKILL_GUIDED:   CY,
  PROFILE_LINKED: OR,
  DARK:           "#6E8AA0",
};

const TABS = ["ALL", "FULLY_MAPPED", "SKILL_GUIDED", "PROFILE_LINKED", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function jobText(j) {
  return [j.name, j.title, j.description, j.type, j.status, j.tags, j.category, j.objective].filter(Boolean).join(" ");
}
function skillText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.category, s.domain, s.capability].filter(Boolean).join(" ");
}
function profileText(p) {
  return [p.name, p.aliases, p.org, p.organisation, p.role, p.description, p.tags, p.country, p.label].filter(Boolean).join(" ");
}

function classify(job, skills, profiles) {
  const kws = keywords(jobText(job));
  const matchedSkills = skills
    .map(s => ({ ...s, _score: scoreText(skillText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedProfiles = profiles
    .map(p => ({ ...p, _score: scoreText(profileText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasSkill   = matchedSkills.length > 0;
  const hasProfile = matchedProfiles.length > 0;
  let cls;
  if (hasSkill && hasProfile)    cls = "FULLY_MAPPED";
  else if (hasSkill)             cls = "SKILL_GUIDED";
  else if (hasProfile)           cls = "PROFILE_LINKED";
  else                           cls = "DARK";
  return { ...job, _cls: cls, _skills: matchedSkills, _profiles: matchedProfiles };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

export default function AutonomousIntelOpsMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [jobs, setJobs]             = useState([]);
  const [skills, setSkills]         = useState([]);
  const [profiles, setProfiles]     = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [swarmRes, skillRes, profileRes] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
      ]);
      const j  = swarmRes.status   === "fulfilled" ? (swarmRes.value?.items   || swarmRes.value   || []) : [];
      const s  = skillRes.status   === "fulfilled" ? (skillRes.value?.items   || skillRes.value   || []) : [];
      const pr = profileRes.status === "fulfilled" ? (profileRes.value?.items || profileRes.value || []) : [];
      setJobs(j);
      setSkills(s);
      setProfiles(pr);
      setClassified(j.map(job => classify(job, s, pr)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:aiomap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:aiomap-toggle", onToggle);
  }, []);

  const fullyMapped   = classified.filter(c => c._cls === "FULLY_MAPPED").length;
  const skillGuided   = classified.filter(c => c._cls === "SKILL_GUIDED").length;
  const profileLinked = classified.filter(c => c._cls === "PROFILE_LINKED").length;
  const dark          = classified.filter(c => c._cls === "DARK").length;
  const total         = classified.length;
  const covPct        = total ? Math.round((fullyMapped / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || jobText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `AIOMAP: ${total} swarm jobs — FULLY_MAPPED: ${fullyMapped}, SKILL_GUIDED: ${skillGuided}, PROFILE_LINKED: ${profileLinked}, DARK: ${dark} (${covPct}% fully mapped). AIP Skills: ${skills.length}. Intel Profiles: ${profiles.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `AIOMAP autonomous intelligence operations assessment. Context: ${ctx}. Provide a 2-sentence brief on which dark swarm jobs pose the greatest autonomous intelligence gap and recommend immediate action. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Autonomous operations assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Autonomous Intelligence Operations Map (AIOMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {dark > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {dark}
          </span>
        )}
        ◈ AIOMAP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ AIOMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          SwarmJob × AIP Skill × IntelProfile Autonomous Intelligence Operations Map
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["SWARM JOBS",    total,        CY],
          ["AIP SKILLS",    skills.length, PU],
          ["INTEL PROFILES", profiles.length, OR],
          ["FULLY MAPPED",  fullyMapped,  GR],
          ["SKILL GUIDED",  skillGuided,  CY],
          ["PROFILE LINKED", profileLinked, OR],
          ["DARK",          dark,         "#6E8AA0"],
          ["COVERAGE%",     covPct + "%", AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
          FULLY MAPPED COVERAGE — {covPct}%
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${covPct}%`, height: "100%",
            background: covPct >= 70 ? GR : covPct >= 40 ? AM : RD,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: FONT, fontSize: 9, letterSpacing: 1,
              background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "transparent",
              border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA044"}`,
              color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
              padding: "3px 8px", borderRadius: 3, cursor: "pointer",
            }}
          >
            {t}
            {t !== "ALL" && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                {classified.filter(c => c._cls === t).length}
              </span>
            )}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{
            fontFamily: FONT, fontSize: 10, background: "rgba(0,207,255,0.06)",
            border: "1px solid rgba(0,207,255,0.2)", color: CY,
            padding: "3px 8px", borderRadius: 3, outline: "none", marginLeft: "auto", width: 180,
          }}
        />
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={assess}
          disabled={assessing || total === 0}
          style={{
            fontFamily: FONT, fontSize: 10, letterSpacing: 1,
            background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
            border: `1px solid ${CY}66`, color: CY,
            padding: "5px 14px", borderRadius: 4, cursor: assessing ? "wait" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS OPERATIONS"}
        </button>
        {brief && (
          <div style={{
            marginTop: 8, padding: "8px 12px", background: "rgba(0,207,255,0.07)",
            border: `1px solid ${CY}33`, borderRadius: 5, color: "#CBD5E1", fontSize: 11, lineHeight: 1.6,
          }}>
            {brief}
          </div>
        )}
      </div>

      {/* Job list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 11, padding: "12px 0" }}>No swarm jobs match current filter.</div>
        )}
        {visible.map((job, idx) => {
          const isExp = expanded === idx;
          const cls   = job._cls;
          const col   = CLASS_COLOR[cls];
          return (
            <div key={job.id || job.name || idx} style={{
              border: `1px solid ${col}33`,
              borderRadius: 5, overflow: "hidden",
            }}>
              <button
                onClick={() => setExpanded(isExp ? null : idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", background: `${col}0A`,
                  padding: "7px 12px", cursor: "pointer",
                  fontFamily: FONT, border: "none", textAlign: "left",
                }}
              >
                <span style={{
                  background: `${col}22`, color: col, border: `1px solid ${col}44`,
                  borderRadius: 3, fontSize: 8, padding: "1px 5px", letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}>
                  {cls}
                </span>
                <span style={{ color: "#CBD5E1", fontSize: 11, flex: 1 }}>
                  {job.name || job.title || "(untitled job)"}
                </span>
                {job._skills.length > 0 && (
                  <span style={{ color: CY, fontSize: 9 }}>{job._skills.length}sk</span>
                )}
                {job._profiles.length > 0 && (
                  <span style={{ color: OR, fontSize: 9 }}>{job._profiles.length}pr</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </button>

              {isExp && (
                <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {job.description && (
                    <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 10, lineHeight: 1.5 }}>
                      {job.description}
                    </div>
                  )}
                  {/* AIP Skills */}
                  {job._skills.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED AIP SKILLS ({job._skills.length})
                      </div>
                      {job._skills.map((sk, i) => {
                        const maxScore = job._skills[0]._score || 1;
                        const pct = Math.round((sk._score / maxScore) * 100);
                        return (
                          <div key={sk.id || sk.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${CY}22`, color: CY,
                              border: `1px solid ${CY}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {sk.type || sk.domain || "SKILL"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {sk.name || sk.title || "(skill)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: CY, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Intel Profiles */}
                  {job._profiles.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED INTEL PROFILES ({job._profiles.length})
                      </div>
                      {job._profiles.map((pr, i) => {
                        const maxScore = job._profiles[0]._score || 1;
                        const pct = Math.round((pr._score / maxScore) * 100);
                        return (
                          <div key={pr.id || pr.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${OR}22`, color: OR,
                              border: `1px solid ${OR}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {pr.role || pr.type || "ACTOR"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {pr.name || pr.title || "(actor)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: OR, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: OR, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {job._skills.length === 0 && job._profiles.length === 0 && (
                    <div style={{ color: "#6E8AA0", fontSize: 10 }}>No matched AIP skills or intel profiles for this swarm job.</div>
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
