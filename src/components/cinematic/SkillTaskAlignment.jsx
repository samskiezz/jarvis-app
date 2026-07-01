/**
 * F66 — Skill-Task Alignment Dashboard
 *
 * Parallel-fetches /v1/aip/skill + /entities/Task, then keyword-correlates
 * each task (title / description / priority) against every skill (name /
 * description) to surface:
 *   COVERED  — tasks that have at least one matching skill backing them
 *   ORPHANED — tasks with zero skill coverage (operational blind spots)
 *   UNUSED   — skills that match no current task (dormant capability)
 *
 * Stat tiles: skills / tasks / covered / orphaned.
 * Filter tabs: TASKS | ORPHANED | UNUSED.
 * Text search over name / priority / status.
 * Expand any task → matched skills with relevance score + description.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence skill-task alignment brief + TTS.
 *
 * Toggle:  ◈ SKTAL  at bottom:8 left:14940, zIndex 69.
 * Voice:   "skill task alignment / task coverage / which tasks have skills /
 *           skill gap tasks / orphaned tasks / sktal"
 * Event:   jarvis:sktal-toggle
 * Refresh: 5 min auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 14940;
const POLL_MS  = 300_000; // 5 min

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const SKTAL_RE =
  /\b(skill[\s-]*task\s+align(?:ment)?|task\s+coverage|which\s+tasks?\s+(have|lack)\s+skills?|skill[\s-]*gap\s+tasks?|orphaned\s+tasks?|sktal)\b/i;

export function isSktalQuery(q) { return SKTAL_RE.test(q); }

export async function buildSktalScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skRes, tRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`, { headers: hdr }),
      fetch(`${base}/entities/Task`, { headers: hdr }),
    ]);
    const skRaw = await skRes.json();
    const tRaw  = await tRes.json();
    const skills = normaliseSkills(skRaw);
    const tasks  = normaliseTasks(tRaw);

    const covered  = tasks.filter((t) => skills.some((s) => relevance(t, s) > 0)).length;
    const orphaned = tasks.length - covered;
    const unused   = skills.filter((s) => !tasks.some((t) => relevance(t, s) > 0)).length;
    const pct      = tasks.length ? Math.round((covered / tasks.length) * 100) : 0;

    const topOrphan = tasks.find((t) =>
      (t.priority === "critical" || t.priority === "high") &&
      !skills.some((s) => relevance(t, s) > 0)
    );

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill-task alignment analysis: ${skills.length} operational skills mapped against ` +
          `${tasks.length} active tasks — ${covered} tasks have skill coverage (${pct}%), ` +
          `${orphaned} tasks are orphaned (no matching skill), ${unused} skills are dormant. ` +
          `${topOrphan ? `Most critical uncovered task: "${topOrphan.title}" (${topOrphan.priority} priority). ` : ""}` +
          `Give a 2-sentence operational readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill-task alignment analysis complete, sir.").trim();
  } catch {
    return "Skill-task alignment dashboard unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.skills)           ? raw.skills
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title       || s.skill_name || `Skill ${i + 1}`,
    description: (s.description || s.summary    || s.detail    || "").toString().slice(0, 300),
    category:    s.category    || s.type        || "",
    level:       s.level       || s.proficiency || s.score      || null,
  }));
}

const TASK_PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const TASK_STATUS_ORDER   = { in_progress: 0, pending: 1, blocked: 2, completed: 3, cancelled: 4 };

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.tasks)            ? raw.tasks
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr
    .map((t, i) => ({
      id:          t.id          || String(i),
      title:       t.title       || t.name        || t.task_name || `Task ${i + 1}`,
      description: (t.description || t.summary    || t.details   || "").toString().slice(0, 200),
      status:      (t.status      || "unknown").toLowerCase().replace(/\s+/g, "_"),
      priority:    (t.priority    || "unknown").toLowerCase(),
    }))
    .sort((a, b) =>
      (TASK_PRIORITY_ORDER[a.priority] ?? 9) - (TASK_PRIORITY_ORDER[b.priority] ?? 9) ||
      (TASK_STATUS_ORDER[a.status]     ?? 9) - (TASK_STATUS_ORDER[b.status]     ?? 9)
    );
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(task, skill) {
  const tw = keywords(`${task.title} ${task.description}`);
  const sw = keywords(`${skill.name} ${skill.description} ${skill.category}`);
  return tw.filter((w) => sw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelatedTasks(tasks, skills) {
  return tasks.map((t) => {
    const matched = skills
      .map((s) => ({ ...s, score: relevance(t, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...t, skills: matched, covered: matched.length > 0 };
  });
}

function buildUnusedSkills(tasks, skills) {
  return skills.filter((s) => !tasks.some((t) => relevance(t, s) > 0));
}

function priorityColor(p) {
  if (p === "critical") return "#FF3333";
  if (p === "high")     return "#FF8800";
  if (p === "medium")   return "#FFD700";
  if (p === "low")      return "#4ADE80";
  return "#6B7280";
}

function statusColor(s) {
  if (s === "in_progress") return "#4ADE80";
  if (s === "pending")     return "#FFD700";
  if (s === "blocked")     return "#FF8800";
  if (s === "completed")   return "#6B7280";
  return "#6B7280";
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["TASKS", "ORPHANED", "UNUSED"];

export default function SkillTaskAlignment() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("TASKS");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skRes, tRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`, { headers: hdr }),
        fetch(`${base}/entities/Task`, { headers: hdr }),
      ]);
      const skRaw = await skRes.json();
      const tRaw  = await tRes.json();
      setSkills(normaliseSkills(skRaw));
      setTasks(normaliseTasks(tRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:sktal-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sktal-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSktalQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelatedTasks(tasks, skills);
  const covered     = correlated.filter((t) => t.covered).length;
  const orphaned    = tasks.length - covered;
  const unusedSkills = buildUnusedSkills(tasks, skills);

  const q = search.toLowerCase();

  const visible = filter === "UNUSED"
    ? unusedSkills.filter((s) =>
        !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
      )
    : correlated.filter((t) => {
        if (filter === "ORPHANED") return !t.covered;
        return true;
      }).filter((t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.priority.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      );

  async function assess() {
    setAssessing(true);
    const text = await buildSktalScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Skill-Task Alignment Dashboard (◈ SKTAL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SKTAL{orphaned > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{orphaned}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 370,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              SKILL↔TASK ALIGNMENT
            </span>
            <button
              onClick={assess}
              disabled={assessing || tasks.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || tasks.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "SKILLS",   val: skills.length, color: C.blue   },
              { label: "TASKS",    val: tasks.length,  color: C.neon   },
              { label: "COVERED",  val: covered,       color: "#4ADE80" },
              { label: "ORPHANED", val: orphaned,      color: orphaned > 0 ? "#FF8800" : "#6B7280" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}{t === "ORPHANED" && orphaned > 0
                ? ` (${orphaned})`
                : t === "UNUSED" && unusedSkills.length > 0
                  ? ` (${unusedSkills.length})`
                  : ""
              }</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={filter === "UNUSED" ? "search skill name / category…" : "search title / priority / status…"}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: "9px", padding: "3px 7px",
                outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && tasks.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>
                {filter === "UNUSED" ? "No unused skills." : "No tasks match."}
              </div>
            ) : filter === "UNUSED" ? (
              /* Unused skill cards */
              visible.map((s) => (
                <div key={s.id} style={{
                  marginBottom: 4, padding: "5px 8px", borderRadius: 6,
                  background: "rgba(0,0,0,0.25)",
                  borderLeft: `3px solid #6B7280`,
                  display: "flex", flexDirection: "column", gap: 2,
                }}>
                  <div style={{ color: S.textHi, fontSize: "9px", fontWeight: 700 }}>{s.name}</div>
                  {s.category && (
                    <div style={{ color: S.text, fontSize: "8px" }}>
                      category: <span style={{ color: C.blue }}>{s.category}</span>
                    </div>
                  )}
                  {s.description && (
                    <div style={{
                      color: S.text, fontSize: "8px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{s.description}</div>
                  )}
                </div>
              ))
            ) : (
              /* Task cards */
              visible.map((t) => (
                <div key={t.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${t.covered ? "#4ADE80" : "#FF8800"}`,
                    }}
                  >
                    <span style={{ color: t.covered ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                      {t.covered ? "●" : "○"}
                    </span>
                    <span style={{
                      flex: 1, color: S.textHi,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {t.title}
                    </span>
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${priorityColor(t.priority)}22`, color: priorityColor(t.priority),
                      border: `1px solid ${priorityColor(t.priority)}55`,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>
                      {t.priority || "?"}
                    </span>
                    <span style={{
                      color: t.covered ? "#4ADE80" : "#FF8800",
                      fontSize: "9px", minWidth: 36, textAlign: "right",
                    }}>
                      {t.covered ? `${t.skills.length}S` : "—"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>
                      {expanded === t.id ? "▴" : "▾"}
                    </span>
                  </div>

                  {expanded === t.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                        status: <span style={{ color: statusColor(t.status) }}>{t.status}</span>
                      </div>
                      {t.covered ? t.skills.map((s) => (
                        <div key={s.id} style={{
                          display: "flex", alignItems: "flex-start", gap: 6,
                          padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{ color: C.neon, fontSize: 9, marginTop: 1 }}>◦</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              color: S.textHi, fontSize: "9px",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {s.name}
                            </div>
                            {s.category && (
                              <div style={{ color: S.text, fontSize: "8px" }}>{s.category}</div>
                            )}
                          </div>
                          <span style={{ color: C.blue, fontSize: "9px", whiteSpace: "nowrap" }}>
                            rel:{s.score}
                          </span>
                        </div>
                      )) : (
                        <div style={{ color: "#FF8800", fontSize: "9px", padding: "2px 0" }}>
                          No skills aligned to this task — operational gap detected.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/aip/skill · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
