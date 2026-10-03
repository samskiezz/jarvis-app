/**
 * AipSkillSwarmScenarioMatrix — F97 (SSXCAP).
 *
 * Cross-references /v1/aip/skill against /v1/scenario/list and
 * /entities/SwarmJob via keyword overlap.  Each skill is classified:
 *   FULLY_DEPLOYED  — matches ≥1 scenario AND ≥1 swarm job
 *   SCENARIO_ONLY   — matches scenarios but no swarm job
 *   SWARM_ONLY      — matches swarm jobs but no scenario
 *   IDLE            — matches neither (capability not utilised)
 *
 * Red pulse on IDLE count.
 * 5 stat tiles: SKILLS | SCENARIOS | JOBS | FULLY DEPLOYED | IDLE
 * Filter tabs: ALL / FULLY_DEPLOYED / SCENARIO_ONLY / SWARM_ONLY / IDLE
 * Text search on skill name.
 * Expand skill → matched scenarios (amber bars) + matched swarm jobs (cyan bars).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence gap brief + TTS.
 * 90-s auto-refresh.
 *
 * Toggle:  ◈ SSXCAP at left:975960, bottom:8, zIndex:121
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isSsxcapQuery / buildSsxcapScript
 *
 * Voice: "ssxcap" / "idle skills" / "skill deployment" / "skill execution" /
 *        "scenario skill" / "swarm skill" / "underused skills" /
 *        "skill utilization" / "capability deployment"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#FFB347";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 975960;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const CLASS_COLOR = {
  FULLY_DEPLOYED: GREEN,
  SCENARIO_ONLY:  AMBER,
  SWARM_ONLY:     CY,
  IDLE:           RED,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().split(/\W+/).filter(t => t.length >= 3);
}

function overlap(a, b) {
  const ta = new Set(tokens(a));
  let score = 0;
  for (const t of tokens(b)) if (ta.has(t)) score++;
  return score;
}

function skillName(s)    { return s.name || s.skill_name || s.title || s.id || "Skill"; }
function scenarioName(s) { return s.name || s.title || s.id || "Scenario"; }
function jobName(j)      { return j.name || j.job_name || j.title || j.id || "Job"; }

function classify(skill, scenarios, jobs) {
  const sName = skillName(skill);
  const desc  = `${sName} ${skill.description || skill.category || ""}`;
  const matchedScenarios = scenarios
    .map(sc => ({ sc, score: overlap(desc, `${scenarioName(sc)} ${sc.description || ""}`) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedJobs = jobs
    .map(j => ({ j, score: overlap(desc, `${jobName(j)} ${j.type || j.job_type || ""}`) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasScenario = matchedScenarios.length > 0;
  const hasJob      = matchedJobs.length > 0;
  const cls =
    hasScenario && hasJob ? "FULLY_DEPLOYED" :
    hasScenario           ? "SCENARIO_ONLY"  :
    hasJob                ? "SWARM_ONLY"      :
                            "IDLE";
  return { skill, cls, matchedScenarios, matchedJobs };
}

// ─── relevance bar ────────────────────────────────────────────────────────────

function RelevanceBar({ score, max, color }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        flex: 1, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3,
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 8, color, minWidth: 20 }}>{pct}%</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AipSkillSwarmScenarioMatrix() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [err,       setErr]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = authHdr();
      const [srSkills, srScenarios, srJobs] = await Promise.allSettled([
        fetch(`${base}/v1/aip/skill`,       { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/scenario/list`,   { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/entities/SwarmJob`,  { headers: h }).then(r => r.ok ? r.json() : null),
      ]);
      const skills    = normaliseArray(srSkills.status    === "fulfilled" ? srSkills.value    : []);
      const scenarios = normaliseArray(srScenarios.status === "fulfilled" ? srScenarios.value : []);
      const jobs      = normaliseArray(srJobs.status      === "fulfilled" ? srJobs.value      : []);
      const classified = skills.map(s => classify(s, scenarios, jobs));
      setRows({ classified, scenarios, jobs });
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ssxcap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ssxcap-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (!rows) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const { classified } = rows;
      const idle = classified.filter(r => r.cls === "IDLE").length;
      const total = classified.length;
      const prompt =
        `JARVIS skill-to-swarm-and-scenario deployment matrix. ` +
        `${total} AIP skills analysed. ${idle} idle (not deployed to any scenario or swarm job). ` +
        `Provide a 2-sentence capability-utilisation assessment and the single most important action.`;
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      if (!resp.ok) throw new Error(resp.status);
      const j = await resp.json();
      const txt = j.response || j.message || j.content || JSON.stringify(j);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt.slice(0, 500) }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [rows]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 121,
          background: "rgba(41,231,255,0.08)", border: "1px solid rgba(41,231,255,0.3)",
          color: CY, fontSize: 10, padding: "3px 7px", cursor: "pointer",
          borderRadius: 4, fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ SSXCAP
      </button>
    );
  }

  const classified = rows?.classified ?? [];
  const filtered = classified.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search && !skillName(r.skill).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    total:           classified.length,
    scenarios:       rows?.scenarios?.length ?? 0,
    jobs:            rows?.jobs?.length      ?? 0,
    FULLY_DEPLOYED:  classified.filter(r => r.cls === "FULLY_DEPLOYED").length,
    IDLE:            classified.filter(r => r.cls === "IDLE").length,
  };
  const maxScScore = Math.max(1, ...filtered.flatMap(r => r.matchedScenarios.map(x => x.score)));
  const maxJbScore = Math.max(1, ...filtered.flatMap(r => r.matchedJobs.map(x => x.score)));

  const tiles = [
    { label: "SKILLS",          val: counts.total,          color: CY    },
    { label: "SCENARIOS",       val: counts.scenarios,      color: AMBER },
    { label: "JOBS",            val: counts.jobs,           color: CY    },
    { label: "FULLY DEPLOYED",  val: counts.FULLY_DEPLOYED, color: GREEN },
    { label: "IDLE",            val: counts.IDLE,           color: RED,   pulse: counts.IDLE > 0 },
  ];

  const TABS = ["ALL", "FULLY_DEPLOYED", "SCENARIO_ONLY", "SWARM_ONLY", "IDLE"];

  return (
    <div style={{
      position: "fixed", bottom: 36, right: 12, zIndex: 121,
      width: 400, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: "rgba(8,18,28,0.96)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 8,
      fontFamily: "monospace", color: CY, fontSize: 11,
      boxShadow: "0 0 24px rgba(41,231,255,0.12)",
    }}>
      {/* header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 10px", borderBottom: "1px solid rgba(41,231,255,0.15)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, letterSpacing: 2 }}>◈ SKILL EXECUTION CAPABILITY</span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {err && <div style={{ padding: 8, color: RED, fontSize: 10 }}>⚠ {err}</div>}

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 4, padding: "8px 8px 4px", flexShrink: 0 }}>
        {tiles.map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            flex: 1, background: DIM, borderRadius: 4, padding: "4px 0",
            textAlign: "center",
            boxShadow: pulse ? `0 0 8px ${RED}` : "none",
            animation: pulse ? "ssxpulse 1s infinite alternate" : "none",
          }}>
            <div style={{ fontSize: 13, fontWeight: "bold", color }}>{val}</div>
            <div style={{ fontSize: 8, color: "rgba(41,231,255,0.6)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assess + search */}
      <div style={{
        display: "flex", gap: 6, padding: "4px 8px 6px",
        borderBottom: "1px solid rgba(41,231,255,0.1)", flexShrink: 0,
      }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{
            flex: 1, background: "rgba(41,231,255,0.05)",
            border: "1px solid rgba(41,231,255,0.2)", borderRadius: 3,
            color: CY, fontSize: 9, padding: "2px 6px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing || !rows} style={{
          background: "rgba(0,200,120,0.12)", border: "1px solid rgba(0,200,120,0.4)",
          color: GREEN, fontSize: 9, padding: "2px 8px", cursor: "pointer", borderRadius: 3,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "4px 8px",
        borderBottom: "1px solid rgba(41,231,255,0.1)", flexShrink: 0, flexWrap: "wrap",
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? "rgba(41,231,255,0.15)" : "transparent",
            border: `1px solid ${filter === t ? CY : "rgba(41,231,255,0.2)"}`,
            color: filter === t ? CY : "rgba(41,231,255,0.5)",
            fontSize: 8, padding: "2px 6px", cursor: "pointer", borderRadius: 3,
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px 8px" }}>
        {!rows && (
          <div style={{ color: "rgba(41,231,255,0.4)", textAlign: "center", padding: 20 }}>Loading…</div>
        )}
        {rows && filtered.length === 0 && (
          <div style={{ color: "rgba(41,231,255,0.4)", textAlign: "center", padding: 20 }}>No results.</div>
        )}
        {filtered.map(({ skill, cls, matchedScenarios, matchedJobs }, i) => {
          const sn = skillName(skill);
          const isExp = expanded === i;
          return (
            <div key={i} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: "pointer", padding: "4px 6px",
                  background: "rgba(41,231,255,0.04)", borderRadius: 4,
                  border: `1px solid rgba(41,231,255,0.12)`,
                }}
              >
                <span style={{ fontSize: 10, color: CY }}>{sn}</span>
                <span style={{
                  fontSize: 8, color: CLASS_COLOR[cls] || CY,
                  padding: "1px 5px", borderRadius: 3,
                  background: `${CLASS_COLOR[cls]}22`,
                }}>
                  {cls}
                </span>
              </div>

              {isExp && (
                <div style={{
                  padding: "6px 10px", background: "rgba(0,0,0,0.3)",
                  borderRadius: "0 0 4px 4px", marginTop: -1,
                  border: "1px solid rgba(41,231,255,0.08)", borderTop: "none",
                }}>
                  {matchedScenarios.length > 0 && (
                    <>
                      <div style={{ fontSize: 8, color: AMBER, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS</div>
                      {matchedScenarios.map(({ sc, score }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 9, color: "rgba(255,179,71,0.8)", marginBottom: 2 }}>
                            {scenarioName(sc)}
                          </div>
                          <RelevanceBar score={score} max={maxScScore} color={AMBER} />
                        </div>
                      ))}
                    </>
                  )}
                  {matchedJobs.length > 0 && (
                    <>
                      <div style={{ fontSize: 8, color: CY, letterSpacing: 1, margin: "6px 0 4px" }}>SWARM JOBS</div>
                      {matchedJobs.map(({ j, score }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 9, color: "rgba(41,231,255,0.8)", marginBottom: 2 }}>
                            {jobName(j)}
                          </div>
                          <RelevanceBar score={score} max={maxJbScore} color={CY} />
                        </div>
                      ))}
                    </>
                  )}
                  {matchedScenarios.length === 0 && matchedJobs.length === 0 && (
                    <div style={{ fontSize: 9, color: RED, opacity: 0.7 }}>
                      No scenario or swarm job matches — skill is idle.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes ssxpulse{from{opacity:1}to{opacity:0.4}}`}</style>

      <div style={{
        textAlign: "center", fontSize: 8,
        color: "rgba(41,231,255,0.3)", padding: "4px 0 6px", flexShrink: 0,
      }}>
        auto-refresh 90 s
      </div>
    </div>
  );
}

// ─── JarvisBrain intent helpers ───────────────────────────────────────────────

export function isSsxcapQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("ssxcap") ||
    s.includes("idle skills") ||
    s.includes("skill deployment") ||
    s.includes("skill execution") ||
    s.includes("scenario skill") ||
    s.includes("swarm skill") ||
    s.includes("underused skills") ||
    s.includes("skill utilization") ||
    s.includes("capability deployment") ||
    s.includes("undeployed skills") ||
    s.includes("skill capability matrix")
  );
}

export async function buildSsxcapScript() {
  try {
    const base  = apiBase();
    const h     = authHdr();
    const [srSkills, srScenarios, srJobs] = await Promise.allSettled([
      fetch(`${base}/v1/aip/skill`,      { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/scenario/list`,  { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/entities/SwarmJob`, { headers: h }).then(r => r.ok ? r.json() : null),
    ]);
    const skills    = normaliseArray(srSkills.status    === "fulfilled" ? srSkills.value    : []);
    const scenarios = normaliseArray(srScenarios.status === "fulfilled" ? srScenarios.value : []);
    const jobs      = normaliseArray(srJobs.status      === "fulfilled" ? srJobs.value      : []);
    const classified = skills.map(s => classify(s, scenarios, jobs));
    const idle            = classified.filter(r => r.cls === "IDLE").length;
    const fullyDeployed   = classified.filter(r => r.cls === "FULLY_DEPLOYED").length;
    const scenarioOnly    = classified.filter(r => r.cls === "SCENARIO_ONLY").length;
    const swarmOnly       = classified.filter(r => r.cls === "SWARM_ONLY").length;
    const idleNames       = classified.filter(r => r.cls === "IDLE").slice(0, 3).map(r => skillName(r.skill)).join(", ");
    return (
      `JARVIS skill execution capability matrix. ${skills.length} AIP skills analysed against ` +
      `${scenarios.length} scenarios and ${jobs.length} swarm jobs. ` +
      `${fullyDeployed} fully deployed, ${scenarioOnly} scenario-only, ${swarmOnly} swarm-only, ` +
      `${idle} idle. ` +
      (idle > 0
        ? `Idle skills include: ${idleNames || "multiple"}. Recommend linking idle skills to scenarios or creating swarm jobs.`
        : `All skills are actively deployed to at least one scenario or swarm job.`)
    );
  } catch {
    return "JARVIS skill execution capability matrix is loading data.";
  }
}
