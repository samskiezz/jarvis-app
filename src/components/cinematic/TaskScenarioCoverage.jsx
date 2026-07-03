/**
 * F118 — Task × Scenario Coverage Mapper
 *
 * Parallel-fetches /entities/Task + /v1/scenario/list, then
 * keyword-correlates each task (title/description/priority/tags)
 * against every scenario (name/objective/type/description) to
 * surface SCENARIO-BACKED tasks (at least one scenario) vs
 * ORPHANED tasks (no scenario connection — operational gap).
 *
 * Stat tiles: tasks / scenarios / backed / orphaned.
 * Filter tabs: ALL | BACKED | ORPHANED.
 * Expand task → matched scenarios with status badge + relevance score.
 * Amber badge on orphaned-task count.
 * ▶ ASSESS: 2-sentence operational alignment brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TASKSCEN  at bottom:8 left:34600, zIndex 73.
 * Voice:   "task scenario / scenario task / taskscen /
 *           which tasks have scenarios / orphaned tasks"
 * Event:   jarvis:taskscen-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 34600;
const POLL_MS  = 120_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const TASKSCEN_RE =
  /\b(task\s+scenario|scenario\s+task|taskscen|which\s+tasks?\s+(have|match|touch)\s+scenarios?|orphaned\s+tasks?|tasks?\s+(backed|coverage|without\s+scenarios?))\b/i;

export function isTaskScenQuery(q) { return TASKSCEN_RE.test(q); }

export async function buildTaskScenScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [tRes, sRes] = await Promise.all([
      fetch(`${base}/entities/Task`,       { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
    ]);
    const tasks     = normaliseTasks(await tRes.json());
    const scenarios = normaliseScenarios(await sRes.json());

    const backedCount  = tasks.filter((t) =>
      scenarios.some((sc) => relevance(t, sc) > 0)
    ).length;
    const orphanCount  = tasks.length - backedCount;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS task-scenario alignment briefing: ${tasks.length} active tasks reviewed ` +
          `against ${scenarios.length} operational scenarios. ${backedCount} tasks have scenario ` +
          `backing (purpose documented), ${orphanCount} tasks are orphaned (no scenario ` +
          `connection — potential operational drift). Give a 2-sentence alignment assessment — ` +
          `formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Task-scenario alignment analysis complete, sir.").trim();
  } catch {
    return "Task-scenario alignment analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.tasks)           ? raw.tasks
    : [];
  return arr.map((t, i) => ({
    id:          t.id          || String(i),
    title:       t.title       || t.name        || `Task ${i + 1}`,
    description: (t.description || t.notes      || t.body || "").toString().slice(0, 300),
    priority:    t.priority    || t.urgency      || "normal",
    status:      t.status      || t.state        || "unknown",
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.scenarios)          ? raw.scenarios
    : [];
  return arr.map((s, i) => ({
    id:        s.id        || String(i),
    name:      s.name      || s.title       || `Scenario ${i + 1}`,
    objective: (s.objective || s.description || s.goal || "").toString().slice(0, 300),
    type:      s.type      || s.category    || "",
    status:    s.status    || s.state       || "unknown",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(task, scenario) {
  const tw = keywords(`${task.title} ${task.description} ${task.tags}`);
  const sw = keywords(`${scenario.name} ${scenario.objective} ${scenario.type}`);
  return tw.filter((w) => sw.some((sv) => sv.includes(w) || w.includes(sv))).length;
}

function buildMatrix(tasks, scenarios) {
  return tasks.map((t) => {
    const matched = scenarios
      .map((sc) => ({ ...sc, score: relevance(t, sc) }))
      .filter((sc) => sc.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...t, scenarios: matched, backed: matched.length > 0 };
  });
}

function priorityColor(p) {
  const u = (p || "").toUpperCase();
  if (u === "CRITICAL" || u === "HIGH")   return C.red;
  if (u === "MEDIUM")                     return C.gold;
  if (u === "LOW")                        return C.neon;
  return S.textMuted;
}

function statusColor(st) {
  const u = (st || "").toUpperCase();
  if (u === "RUNNING" || u === "ACTIVE" || u === "IN_PROGRESS") return "#4ADE80";
  if (u === "COMPLETED" || u === "DONE")                        return C.blue;
  if (u === "FAILED")                                           return "#FF3030";
  if (u === "PENDING" || u === "QUEUED")                        return "#FFD700";
  return S.textMuted;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "ORPHANED"];

export default function TaskScenarioCoverage() {
  const [open,       setOpen]       = useState(false);
  const [tasks,      setTasks]      = useState([]);
  const [scenarios,  setScenarios]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [query,      setQuery]      = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [tRes, sRes] = await Promise.all([
        fetch(`${base}/entities/Task`,      { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,   { headers: hdr }),
      ]);
      setTasks(normaliseTasks(await tRes.json()));
      setScenarios(normaliseScenarios(await sRes.json()));
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
    window.addEventListener("jarvis:taskscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:taskscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isTaskScenQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const matrix      = buildMatrix(tasks, scenarios);
  const backedCount = matrix.filter((t) => t.backed).length;
  const orphanCount = matrix.length - backedCount;

  const visible = matrix.filter((t) => {
    if (filter === "BACKED"   && !t.backed)  return false;
    if (filter === "ORPHANED" &&  t.backed)  return false;
    if (query) {
      const q = query.toLowerCase();
      return t.title.toLowerCase().includes(q) ||
             t.description.toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const answer = await buildTaskScenScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } finally {
      setAssessing(false);
    }
  }

  const STAT = {
    color: C.textB, fontSize: 10, letterSpacing: 1, textAlign: "center",
    fontFamily: "'JetBrains Mono',monospace",
  };
  const BADGE = (bg, count) => (
    <span style={{
      background: bg + "22", border: `1px solid ${bg}55`,
      color: bg, borderRadius: 3, padding: "1px 6px",
      fontSize: 9, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
    }}>{count}</span>
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="F118: Task × Scenario Coverage Mapper"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 73,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${orphanCount > 0 ? C.gold : C.border}`,
          color: orphanCount > 0 ? C.gold : C.textB,
          borderRadius: 4, padding: "4px 10px",
          fontSize: 9, letterSpacing: 2, cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          backdropFilter: "blur(6px)",
          boxShadow: orphanCount > 0 ? `0 0 10px ${C.gold}44` : "none",
        }}
      >
        ◈ TASKSCEN{orphanCount > 0 && ` [${orphanCount}]`}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 36, left: Math.max(8, BTN_LEFT - 280),
      zIndex: 73, width: "min(560px, 94vw)", maxHeight: "72vh",
      background: "rgba(6,10,18,0.94)", border: `1px solid ${C.border}`,
      borderRadius: 8, display: "flex", flexDirection: "column",
      backdropFilter: "blur(12px)", boxShadow: `0 0 40px rgba(0,200,120,0.12)`,
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: `1px solid ${C.borderB}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: C.neon, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
          TASK × SCENARIO COVERAGE
        </span>
        {loading && (
          <span style={{ color: S.textMuted, fontSize: 9, letterSpacing: 1 }}>POLLING…</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: "none", border: `1px solid ${C.neon}55`, color: C.neon,
            borderRadius: 3, padding: "3px 8px", fontSize: 9, letterSpacing: 1,
            cursor: assessing ? "default" : "pointer", fontFamily: "inherit",
            opacity: assessing ? 0.5 : 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: S.textMuted,
            cursor: "pointer", fontSize: 13, padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 14px",
        borderBottom: `1px solid ${C.borderB}`,
      }}>
        {[
          { label: "TASKS",     val: tasks.length,     col: C.textB },
          { label: "SCENARIOS", val: scenarios.length, col: C.blue  },
          { label: "BACKED",    val: backedCount,       col: C.neon  },
          { label: "ORPHANED",  val: orphanCount,       col: orphanCount > 0 ? C.gold : S.textMuted },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: "5px 4px",
            textAlign: "center", border: `1px solid ${C.borderB}`,
          }}>
            <div style={{ ...STAT, color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ ...STAT, fontSize: 8, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 14px", borderBottom: `1px solid ${C.borderB}`,
        flexWrap: "wrap",
      }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? C.neon + "22" : "none",
              border: `1px solid ${filter === t ? C.neon : C.borderB}`,
              color: filter === t ? C.neon : S.textMuted,
              borderRadius: 3, padding: "3px 8px", fontSize: 9,
              letterSpacing: 1, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search tasks…"
          style={{
            flex: 1, minWidth: 80, background: "rgba(0,0,0,0.4)",
            border: `1px solid ${C.borderB}`, color: C.textB,
            borderRadius: 3, padding: "3px 8px", fontSize: 9,
            fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* Task list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}>
        {visible.length === 0 && (
          <div style={{ color: S.textMuted, fontSize: 10, padding: "12px 6px", textAlign: "center" }}>
            {loading ? "Loading…" : "No tasks match current filter."}
          </div>
        )}
        {visible.map((t) => (
          <div key={t.id} style={{ marginBottom: 4 }}>
            {/* Task row */}
            <div
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 8px", borderRadius: 4, cursor: "pointer",
                background: expanded === t.id
                  ? "rgba(0,200,120,0.06)"
                  : "rgba(0,0,0,0.25)",
                border: `1px solid ${t.backed ? C.borderB : C.gold + "44"}`,
                transition: "background 0.15s",
              }}
            >
              <span style={{
                fontSize: 8, color: t.backed ? C.neon : C.gold,
                width: 52, flexShrink: 0, letterSpacing: 1,
              }}>
                {t.backed ? "BACKED" : "ORPHANED"}
              </span>
              <span style={{
                flex: 1, color: C.textB, fontSize: 10, letterSpacing: 0.5,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {t.title}
              </span>
              {BADGE(priorityColor(t.priority), t.priority || "—")}
              {BADGE(statusColor(t.status), t.status || "—")}
              {t.backed && (
                <span style={{ color: S.textMuted, fontSize: 9 }}>
                  {t.scenarios.length} sc
                </span>
              )}
              <span style={{ color: S.textMuted, fontSize: 10 }}>
                {expanded === t.id ? "▲" : "▼"}
              </span>
            </div>

            {/* Expanded: matched scenarios */}
            {expanded === t.id && (
              <div style={{
                padding: "6px 10px 6px 16px",
                background: "rgba(0,0,0,0.15)",
                borderLeft: `2px solid ${C.borderB}`,
                marginTop: 2, borderRadius: "0 0 4px 4px",
              }}>
                {t.description && (
                  <div style={{
                    color: S.textMuted, fontSize: 9, letterSpacing: 0.5,
                    marginBottom: 6, lineHeight: 1.5,
                  }}>
                    {t.description.slice(0, 180)}
                  </div>
                )}
                {t.scenarios.length === 0 ? (
                  <div style={{ color: C.gold, fontSize: 9, letterSpacing: 1 }}>
                    No matching scenarios — operational context undocumented.
                  </div>
                ) : (
                  t.scenarios.map((sc, idx) => (
                    <div key={idx} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 0", borderBottom: idx < t.scenarios.length - 1
                        ? `1px solid ${C.borderB}` : "none",
                    }}>
                      <span style={{ color: C.blue, fontSize: 9, letterSpacing: 0.5, flex: 1 }}>
                        {sc.name}
                      </span>
                      {BADGE(statusColor(sc.status), sc.status || "—")}
                      <span style={{ color: S.textMuted, fontSize: 8, letterSpacing: 1 }}>
                        score:{sc.score}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 14px",
        borderTop: `1px solid ${C.borderB}`,
        color: S.textMuted, fontSize: 8, letterSpacing: 1,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span>AUTO-POLL 120s</span>
        <span>·</span>
        <span>/entities/Task × /v1/scenario/list</span>
        <div style={{ flex: 1 }} />
        <span>{visible.length} of {matrix.length}</span>
      </div>
    </div>
  );
}
