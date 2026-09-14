/**
 * SwarmSkillCoverage — F166.
 *
 * Parallel-fetches /v1/aip/skill + /entities/SwarmJob.
 * Keyword-correlates each skill (name/description/category) against active swarm
 * jobs (name/type/tags) to surface which skills have automation backing (AUTOMATED)
 * vs which require manual execution only (MANUAL).
 *
 * Stat tiles: skills / jobs / automated / manual
 * Filter tabs: ALL / AUTOMATED / MANUAL
 * List: skills sorted by automation score descending; each shows matched jobs.
 * Click ▶ ASSESS on any skill → /v1/jarvis/agent/chat AI 2-sentence
 *   automation-coverage brief + TTS via jarvis:speak-dossier.
 * 90s auto-refresh.
 *
 * Intent: "skill swarm" / "automated skills" / "swarm skill coverage" /
 *         "sklswm" / "which skills are automated" / "skill automation"
 *   → jarvis:sklswm-toggle + TTS brief via buildSklswmScript()
 *
 * Toggle: ◈ SKLSWM at left:55080, bottom:8, zIndex:108.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 55080;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.skill_id || String(Math.random()),
    name: s.name || s.skill_name || s.title || "Unnamed Skill",
    description: s.description || s.summary || s.details || "",
    category: s.category || s.type || s.domain || "",
    score: typeof s.score === "number" ? s.score : null,
    level: s.level || s.proficiency || "",
  }));
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j) => ({
    id: j.id || j.job_id || String(Math.random()),
    name: j.name || j.job_name || j.title || "Unnamed Job",
    status: (j.status || "unknown").toLowerCase(),
    type: j.type || j.job_type || j.kind || "",
    progress: typeof j.progress === "number" ? j.progress : null,
    tags: [...(j.tags || []), ...(j.keywords || [])].map(String),
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(skill, job) {
  const skillText = `${skill.name} ${skill.description} ${skill.category}`.toLowerCase();
  const jobWords = [
    ...keywords(job.name),
    ...keywords(job.type),
    ...job.tags.flatMap(keywords),
  ];
  return jobWords.reduce((acc, w) => acc + (skillText.includes(w) ? 1 : 0), 0);
}

function correlate(skills, jobs) {
  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "queued" || j.status === "pending"
  );
  return skills.map((skill) => {
    const matched = activeJobs
      .map((j) => ({ ...j, _score: matchScore(skill, j) }))
      .filter((j) => j._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);
    return { ...skill, matched, automated: matched.length > 0 };
  });
}

function jobStatusColor(status) {
  if (status === "running") return GREEN;
  if (status === "queued" || status === "pending") return AMBER;
  if (status === "failed") return RED;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const SKLSWM_RE =
  /skill.{0,10}swarm|swarm.{0,10}skill|automat.{0,10}skill|skill.{0,10}automat|sklswm\b|which\s+skill.{0,10}automat|skill\s+coverage\s+swarm/i;

export function isSklswmQuery(q) {
  return SKLSWM_RE.test(q || "");
}

export async function buildSklswmScript() {
  try {
    const [skillRaw, jobRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/aip/skill`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const skills = normaliseSkills(skillRaw);
    const jobs   = normaliseJobs(jobRaw);
    const corr   = correlate(skills, jobs);
    const auto   = corr.filter((s) => s.automated);
    const manual = corr.filter((s) => !s.automated);
    return `Skill-swarm automation analysis complete, sir. ${skills.length} skill${skills.length !== 1 ? "s" : ""} assessed against ${jobs.length} active swarm job${jobs.length !== 1 ? "s" : ""}. ${auto.length} skill${auto.length !== 1 ? "s" : ""} ${auto.length !== 1 ? "have" : "has"} swarm automation coverage. ${manual.length} skill${manual.length !== 1 ? "s" : ""} require${manual.length === 1 ? "s" : ""} manual execution. Select a skill for a detailed automation assessment.`;
  } catch (_) {
    return "Skill swarm coverage analysis is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmSkillCoverage() {
  const [visible,  setVisible]  = useState(false);
  const [skills,   setSkills]   = useState([]);
  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [query,    setQuery]    = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [skillRaw, jobRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/aip/skill`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setSkills(normaliseSkills(skillRaw));
      setJobs(normaliseJobs(jobRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:sklswm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sklswm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessSkill(skill) {
    setAssessing(skill.id);
    const jobNames = skill.matched
      .map((j) => `${j.name}${j.type ? ` (${j.type})` : ""}`)
      .join(", ");
    const prompt = `As JARVIS, provide a 2-sentence automation-coverage assessment for the skill "${skill.name}"${skill.category ? ` (${skill.category})` : ""}. Matched swarm jobs: ${jobNames || "none"}. Advise on whether this skill is adequately automated or represents a manual execution gap.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to determine automation coverage at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Skill automation assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(skills, jobs);
  const automated  = correlated.filter((s) => s.automated);
  const manual     = correlated.filter((s) => !s.automated);

  const base =
    tab === "ALL"       ? correlated :
    tab === "AUTOMATED" ? automated  : manual;

  const displayed = query.trim()
    ? base.filter((s) =>
        `${s.name} ${s.category} ${s.description}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Skill × Swarm Automation Coverage (F166)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 108,
          background: visible ? `${PURPLE}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? PURPLE : PURPLE}44`,
          color: visible ? PURPLE : `${PURPLE}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ SKLSWM
        {manual.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{manual.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 44, left: BTN_LEFT - 400, zIndex: 108,
          width: 580, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${PURPLE}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${PURPLE}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: PURPLE, fontSize: 11, letterSpacing: 2 }}>
              ◈ SKILL × SWARM AUTOMATION COVERAGE
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${PURPLE}33`, borderRadius: 3,
                color: `${PURPLE}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["SKILLS",    correlated.length, CY],
              ["JOBS",      jobs.length,        PURPLE],
              ["AUTOMATED", automated.length,   GREEN],
              ["MANUAL",    manual.length,       AMBER],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "AUTOMATED", "MANUAL"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${PURPLE}22` : "transparent",
                  border: `1px solid ${tab === t ? PURPLE : "#1e3040"}`,
                  color: tab === t ? PURPLE : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search skills…"
              style={{
                marginLeft: "auto", background: "rgba(41,231,255,0.05)",
                border: "1px solid #1e3040", borderRadius: 4,
                color: CY, padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 140,
              }}
            />
          </div>

          {/* Skills list */}
          {loading ? (
            <div style={{ color: "#445566", fontSize: 9, textAlign: "center", padding: 20 }}>
              loading…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 9, textAlign: "center", padding: 20 }}>
              {query ? "no matches" : `no ${tab.toLowerCase()} skills`}
            </div>
          ) : (
            displayed.map((skill) => (
              <div
                key={skill.id}
                style={{
                  marginBottom: 6, borderRadius: 6,
                  background: expanded === skill.id ? "rgba(41,231,255,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${skill.automated ? GREEN : AMBER}22`,
                  padding: "8px 10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === skill.id ? null : skill.id)}
                >
                  <span style={{
                    fontSize: 7, padding: "1px 5px", borderRadius: 3, letterSpacing: 1,
                    background: skill.automated ? `${GREEN}22` : `${AMBER}22`,
                    color: skill.automated ? GREEN : AMBER,
                    border: `1px solid ${skill.automated ? GREEN : AMBER}44`,
                  }}>
                    {skill.automated ? "AUTOMATED" : "MANUAL"}
                  </span>
                  <span style={{ fontSize: 9, color: "#DCEBF5", fontWeight: "bold", flex: 1 }}>
                    {skill.name}
                  </span>
                  {skill.category && (
                    <span style={{ fontSize: 7, color: `${PURPLE}99`, letterSpacing: 1 }}>
                      {skill.category}
                    </span>
                  )}
                  <span style={{ color: "#334455", fontSize: 9 }}>
                    {expanded === skill.id ? "▲" : "▼"}
                  </span>
                </div>

                {expanded === skill.id && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #0d1e2d" }}>
                    {skill.description && (
                      <div style={{ color: "#7a9bb5", fontSize: 8, marginBottom: 6, lineHeight: 1.5 }}>
                        {skill.description.slice(0, 200)}{skill.description.length > 200 ? "…" : ""}
                      </div>
                    )}
                    {skill.automated ? (
                      <>
                        <div style={{ color: "#445566", fontSize: 8, marginBottom: 4 }}>
                          MATCHED SWARM JOBS ({skill.matched.length})
                        </div>
                        {skill.matched.map((job) => (
                          <div
                            key={job.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              marginBottom: 4, padding: "4px 6px",
                              background: "rgba(0,200,120,0.04)", borderRadius: 4,
                              border: `1px solid ${GREEN}18`,
                            }}
                          >
                            <span style={{
                              fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              background: `${jobStatusColor(job.status)}22`,
                              color: jobStatusColor(job.status),
                              border: `1px solid ${jobStatusColor(job.status)}44`,
                              letterSpacing: 1, whiteSpace: "nowrap",
                            }}>{job.status.toUpperCase()}</span>
                            <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>{job.name}</span>
                            {job.type && (
                              <span style={{ fontSize: 7, color: `${PURPLE}88` }}>{job.type}</span>
                            )}
                            <span style={{
                              fontSize: 7, color: `${GREEN}88`, marginLeft: "auto",
                            }}>
                              score {job._score}
                            </span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{
                        padding: "6px 8px", borderRadius: 4,
                        background: `${AMBER}08`, border: `1px solid ${AMBER}22`,
                        color: AMBER, fontSize: 8,
                      }}>
                        No active swarm jobs found for this skill — manual execution required.
                      </div>
                    )}

                    <button
                      disabled={assessing === skill.id}
                      onClick={() => assessSkill(skill)}
                      style={{
                        marginTop: 8,
                        background: assessing === skill.id ? "transparent" : `${PURPLE}18`,
                        border: `1px solid ${PURPLE}44`,
                        color: assessing === skill.id ? "#445566" : PURPLE,
                        borderRadius: 4, padding: "4px 12px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                        letterSpacing: 1, cursor: assessing === skill.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === skill.id ? "▶ ASSESSING…" : "▶ ASSESS"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Automation rate footer */}
          {correlated.length > 0 && !loading && (
            <div style={{
              marginTop: 10, paddingTop: 8, borderTop: "1px solid #0d1e2d",
              fontSize: 8, color: "#445566", textAlign: "center",
            }}>
              automation coverage:{" "}
              <span style={{ color: GREEN, fontWeight: "bold" }}>
                {Math.round((automated.length / correlated.length) * 100)}%
              </span>
              {" "}of skills ({automated.length}/{correlated.length}) · 90 s refresh
            </div>
          )}
        </div>
      )}
    </>
  );
}
