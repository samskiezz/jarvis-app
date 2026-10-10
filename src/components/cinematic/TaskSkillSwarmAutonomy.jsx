/**
 * F182 — Task × AIP Skill × SwarmJob — Mission Automation Index (MAIX)
 *
 * Parallel-fetches /entities/Task + /v1/aip/skill + /entities/SwarmJob every 90 s.
 * Keyword-correlates each task against matched AIP skills AND active swarm jobs:
 *
 *   FULLY_AUTOMATED — matched ≥1 skill AND ≥1 swarm job
 *   SKILL_BACKED    — skill matched, no swarm job handling it
 *   SWARM_BACKED    — swarm job handling it, no skill matched
 *   MANUAL          — neither — a task with no skill or swarm coverage (needs human)
 *
 * Stat tiles: tasks / skills / swarm jobs / automated / manual
 * Filter tabs: ALL | FULLY_AUTOMATED | SKILL_BACKED | SWARM_BACKED | MANUAL
 * Text search on task title / status / priority.
 * Expand row → matched skills (green bars) + matched swarm jobs (cyan bars).
 * Red badge + pulse on MANUAL count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence mission automation brief + TTS.
 *
 * Toggle:  ◈ MAIX  at bottom:8 left:975960, zIndex:683.
 * Event:   jarvis:maix-toggle
 * Voice:   "maix / mission automation / task automation / automated task /
 *           manual task / task skill coverage / swarm task coverage /
 *           mission autonomy / task autonomy index"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 975_960;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const MAIX_RE =
  /\b(maix|mission\s+automation|task\s+automation|automated\s+task|manual\s+task|task\s+skill\s+coverage|swarm\s+task\s+coverage|mission\s+autonomy|task\s+autonomy\s+index)\b/i;

export function isMaixQuery(q) { return MAIX_RE.test(q || ""); }

function normArr(data, keys) {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

function keywords(obj) {
  return [
    obj?.title, obj?.name, obj?.description, obj?.subject,
    obj?.status, obj?.priority, obj?.category, obj?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(taskKw, items, itemKwFn) {
  return items
    .map((item) => {
      const itemKw = itemKwFn(item);
      const taskWords = taskKw.split(/\s+/).filter((w) => w.length > 3);
      const score = taskWords.filter((w) => itemKw.includes(w)).length;
      return score > 0 ? { item, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function classifyTasks(tasks, skills, swarmJobs) {
  return tasks.map((task, idx) => {
    const taskKw = keywords(task);
    const matchedSkills = scoreMatch(taskKw, skills, (s) =>
      keywords(s) + " " + (s.skill_name || s.name || "")
    ).map((m) => ({ ...m.item, score: m.score }));
    const matchedSwarm = scoreMatch(taskKw, swarmJobs, (j) =>
      keywords(j) + " " + (j.job_type || j.type || "")
    ).map((m) => ({ ...m.item, score: m.score }));

    let cls;
    if (matchedSkills.length > 0 && matchedSwarm.length > 0) cls = "FULLY_AUTOMATED";
    else if (matchedSkills.length > 0) cls = "SKILL_BACKED";
    else if (matchedSwarm.length > 0) cls = "SWARM_BACKED";
    else cls = "MANUAL";

    return {
      id: task.id || task.task_id || String(idx),
      label: task.title || task.name || task.subject || `Task ${idx + 1}`,
      status: task.status || "",
      priority: task.priority || "",
      cls,
      matchedSkills,
      matchedSwarm,
    };
  });
}

export async function buildMaixScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [tRes, sRes, jRes] = await Promise.all([
      fetch(`${base}/entities/Task`,      { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
    ]);
    const tasks     = normArr(await tRes.json(), ["tasks", "data", "items", "results"]);
    const skills    = normArr(await sRes.json(), ["skills", "data", "items", "results"]);
    const swarmJobs = normArr(await jRes.json(), ["jobs", "swarm_jobs", "data", "items", "results"]);

    const rows   = classifyTasks(tasks, skills, swarmJobs);
    const manual = rows.filter((r) => r.cls === "MANUAL").length;
    const auto   = rows.filter((r) => r.cls === "FULLY_AUTOMATED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS mission automation index (MAIX): ${tasks.length} tasks ` +
          `cross-referenced against ${skills.length} AIP skills and ${swarmJobs.length} swarm jobs — ` +
          `${auto} fully automated (skill + swarm), ${manual} manual (no coverage). ` +
          `Give a 2-sentence mission automation readiness brief — formal British butler tone, first person.`,
      }),
    });
    const j = await r.json();
    return (
      j?.response ||
      j?.message ||
      j?.content ||
      j?.choices?.[0]?.message?.content ||
      `${auto} tasks fully automated, ${manual} require manual attention.`
    );
  } catch (e) {
    return `MAIX unavailable: ${e.message}`;
  }
}

// ── Colours ───────────────────────────────────────────────────────────────────
const CY = "#29E7FF";
const RD = "#FF4757";
const GN = "#00c878";
const AM = "#f59e0b";
const MONO = "'JetBrains Mono','Courier New',monospace";

const CLS_COLOR = {
  FULLY_AUTOMATED: GN,
  SKILL_BACKED:    CY,
  SWARM_BACKED:    AM,
  MANUAL:          RD,
};
const CLS_LABEL = {
  FULLY_AUTOMATED: "AUTOMATED",
  SKILL_BACKED:    "SKILL",
  SWARM_BACKED:    "SWARM",
  MANUAL:          "MANUAL",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function TaskSkillSwarmAutonomy() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const [taskCount, setTaskCount]   = useState(0);
  const [skillCount, setSkillCount] = useState(0);
  const [swarmCount, setSwarmCount] = useState(0);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [tRes, sRes, jRes] = await Promise.all([
        fetch(`${base}/entities/Task`,     { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      ]);
      const tasks     = normArr(await tRes.json(), ["tasks", "data", "items", "results"]);
      const skills    = normArr(await sRes.json(), ["skills", "data", "items", "results"]);
      const swarmJobs = normArr(await jRes.json(), ["jobs", "swarm_jobs", "data", "items", "results"]);
      setTaskCount(tasks.length);
      setSkillCount(skills.length);
      setSwarmCount(swarmJobs.length);
      setRows(classifyTasks(tasks, skills, swarmJobs));
    } catch {
      // network error — keep stale rows
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function toggle() { setOpen((o) => !o); }
    window.addEventListener("jarvis:maix-toggle", toggle);
    return () => window.removeEventListener("jarvis:maix-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  async function assess() {
    setAssessing(true);
    setAssessment("");
    const text = await buildMaixScript();
    setAssessment(text);
    setAssessing(false);
    try {
      const base = apiBase();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
    } catch { /* TTS optional */ }
  }

  const manual = rows.filter((r) => r.cls === "MANUAL").length;
  const auto   = rows.filter((r) => r.cls === "FULLY_AUTOMATED").length;

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const t = search.toLowerCase();
      return r.label.toLowerCase().includes(t) ||
             r.status.toLowerCase().includes(t) ||
             r.priority.toLowerCase().includes(t);
    }
    return true;
  });

  const TABS = ["ALL", "FULLY_AUTOMATED", "SKILL_BACKED", "SWARM_BACKED", "MANUAL"];
  const TAB_LABEL = {
    ALL: "ALL",
    FULLY_AUTOMATED: "AUTOMATED",
    SKILL_BACKED:    "SKILL",
    SWARM_BACKED:    "SWARM",
    MANUAL:          "MANUAL",
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:maix-toggle"))}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 683,
          background: manual > 0 ? `${RD}22` : "rgba(0,4,10,0.82)",
          border: `1px solid ${manual > 0 ? RD : CY}55`,
          borderRadius: 5, padding: "3px 9px",
          color: manual > 0 ? RD : CY,
          fontSize: 9, fontFamily: MONO, letterSpacing: 1,
          cursor: "pointer",
          animation: manual > 0 ? "maix-pulse 1.6s ease-in-out infinite" : "none",
        }}
      >
        {open ? "◈" : "◇"} MAIX{manual > 0 ? ` ${manual}` : ""}
      </button>

      <style>{`
        @keyframes maix-pulse {
          0%,100% { box-shadow: 0 0 0 0 ${RD}44; }
          50%      { box-shadow: 0 0 8px 3px ${RD}33; }
        }
      `}</style>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 340, zIndex: 683,
          width: 480, maxHeight: "72vh",
          background: "rgba(3,8,15,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 10, overflow: "hidden",
          boxShadow: `0 0 40px ${CY}14, 0 16px 32px rgba(0,0,0,0.8)`,
          fontFamily: MONO, display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, flex: 1 }}>
              ◈ MAIX — MISSION AUTOMATION INDEX
            </span>
            {loading && (
              <span style={{ color: "#4E6070", fontSize: 9 }}>syncing…</span>
            )}
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#4E6070", fontSize: 12, padding: 0,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 6, padding: "8px 12px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "TASKS",     val: taskCount,  color: CY },
              { label: "SKILLS",    val: skillCount, color: GN },
              { label: "SWARM",     val: swarmCount, color: AM },
              { label: "AUTOMATED", val: auto,       color: GN },
              { label: "MANUAL",    val: manual,     color: RD },
            ].map((t) => (
              <div key={t.label} style={{
                flex: 1, textAlign: "center",
                background: `${t.color}0A`,
                border: `1px solid ${t.color}22`,
                borderRadius: 5, padding: "4px 2px",
              }}>
                <div style={{ color: t.color, fontSize: 13, fontWeight: 600 }}>{t.val}</div>
                <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 12px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {TABS.map((tab) => (
              <button key={tab} onClick={() => setFilter(tab)} style={{
                background: filter === tab ? `${CY}18` : "transparent",
                border: `1px solid ${filter === tab ? CY : CY + "22"}`,
                borderRadius: 4, padding: "2px 7px",
                color: filter === tab ? CY : "#4E6070",
                fontSize: 8, fontFamily: MONO, letterSpacing: 1, cursor: "pointer",
              }}>
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "5px 12px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter tasks…"
              style={{
                width: "100%", background: "transparent",
                border: `1px solid ${CY}22`, borderRadius: 4,
                padding: "3px 8px", color: "#DCEBF5",
                fontSize: 10, fontFamily: MONO, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {visible.map((row) => (
              <div key={row.id} style={{ borderBottom: `1px solid ${CY}08` }}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 12px", cursor: "pointer",
                    background: expanded === row.id ? `${CY}08` : "transparent",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: CLS_COLOR[row.cls], flexShrink: 0,
                  }} />
                  <span style={{
                    flex: 1, fontSize: 10, color: "#DCEBF5",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {row.label}
                  </span>
                  {row.status && (
                    <span style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1 }}>
                      {row.status.toUpperCase()}
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], letterSpacing: 1 }}>
                    {CLS_LABEL[row.cls]}
                  </span>
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                    {expanded === row.id ? "▲" : "▼"}
                  </span>
                </div>

                {expanded === row.id && (
                  <div style={{
                    margin: "2px 0 2px 16px", padding: "8px 10px",
                    background: "rgba(41,231,255,0.02)", border: `1px solid ${CY}18`,
                    borderRadius: 6, display: "flex", gap: 12, flexWrap: "wrap",
                  }}>
                    {/* Skills */}
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ color: GN, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                        SKILLS ({row.matchedSkills.length})
                      </div>
                      {row.matchedSkills.length === 0
                        ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                        : row.matchedSkills.map((s, i) => (
                          <div key={i} style={{ marginBottom: 3 }}>
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              fontSize: 9, color: "#DCEBF5",
                            }}>
                              <span style={{
                                overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap", maxWidth: "80%",
                              }}>
                                {s.name || s.skill_name || s.title || s.id || `Skill ${i + 1}`}
                              </span>
                              <span style={{ color: GN }}>{s.score}</span>
                            </div>
                            <div style={{
                              height: 3, background: `${GN}22`,
                              borderRadius: 2, marginTop: 1,
                            }}>
                              <div style={{
                                height: "100%",
                                width: `${Math.min(100, s.score * 20)}%`,
                                background: GN, borderRadius: 2,
                              }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                    {/* Swarm Jobs */}
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                        SWARM JOBS ({row.matchedSwarm.length})
                      </div>
                      {row.matchedSwarm.length === 0
                        ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                        : row.matchedSwarm.map((j, i) => (
                          <div key={i} style={{ marginBottom: 3 }}>
                            <div style={{
                              display: "flex", justifyContent: "space-between",
                              fontSize: 9, color: "#DCEBF5",
                            }}>
                              <span style={{
                                overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap", maxWidth: "80%",
                              }}>
                                {j.name || j.job_name || j.title || j.job_id || `Job ${i + 1}`}
                              </span>
                              <span style={{ color: CY }}>{j.score}</span>
                            </div>
                            <div style={{
                              height: 3, background: `${CY}22`,
                              borderRadius: 2, marginTop: 1,
                            }}>
                              <div style={{
                                height: "100%",
                                width: `${Math.min(100, j.score * 20)}%`,
                                background: CY, borderRadius: 2,
                              }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", textAlign: "center", padding: "12px 0" }}>
                No tasks match current filter.
              </div>
            )}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}11` }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(41,231,255,0.06)" : `${CY}12`,
              border: `1px solid ${CY}44`, borderRadius: 5, padding: "4px 12px",
              cursor: assessing ? "default" : "pointer",
              color: CY, fontSize: 10, fontFamily: MONO, letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, padding: "7px 10px",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>

          <div style={{ padding: "4px 12px 6px", color: "#334F62", fontSize: 9 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} tasks · {skillCount} skills · {swarmCount} swarm jobs
          </div>
        </div>
      )}
    </>
  );
}
