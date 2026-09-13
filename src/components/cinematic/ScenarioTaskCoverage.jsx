/**
 * F179 — Scenario × Task Coverage (SCNTASK)
 *
 * Parallel-fetches /v1/scenario/list + /entities/Task, then
 * keyword-correlates each scenario against the task backlog to surface:
 *   TASKED   — at least one task provides execution coverage for this scenario
 *   UNTASKED — no supporting tasks exist (scenario has no execution plan)
 *
 * Stat tiles: scenarios / tasks / tasked / untasked
 * Filter tabs: ALL | TASKED | UNTASKED
 * Text search across scenario names / categories.
 * Expand any scenario → matched tasks with status chip + relevance score.
 * Red badge on untasked count.
 * ▶ ASSESS: 2-sentence scenario-execution brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCNTASK  at bottom:8 left:61800, zIndex:120.
 * Event:   jarvis:scntask-toggle
 * Voice:   "scenario task / scntask / scenario execution /
 *           which scenarios have tasks / task coverage /
 *           unplanned scenarios / scenarios without tasks"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 61800;
const POLL_MS  = 90_000;
const INDIGO   = "#6366F1";

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

// ── exported intent helpers ───────────────────────────────────────────────────

const SCNTASK_RE =
  /\b(scenario\s+task[s]?|task\s+scenario[s]?|scntask|scenario\s+execution|scenario\s+coverage|which\s+scenario[s]?\s+(have|has|lack[s]?|need[s]?)\s+task[s]?|unplanned\s+scenario[s]?|scenario[s]?\s+without\s+task[s]?|task\s+coverage|untasked\s+scenario[s]?)\b/i;

export function isScntaskQuery(q) { return SCNTASK_RE.test(q); }

export async function buildScntaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [scnRes, tskRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      fetch(`${base}/entities/Task`,    { headers: hdr }),
    ]);
    const scenarios = normaliseScenarios(await scnRes.json());
    const tasks     = normaliseTasks(await tskRes.json());

    const tasked   = scenarios.filter((s) => tasks.some((t) => relevance(s, t) > 0)).length;
    const untasked = scenarios.length - tasked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS scenario–task coverage: ${scenarios.length} scenarios, ` +
          `${tasks.length} tasks in the backlog. ${tasked} scenarios have at least one ` +
          `supporting task; ${untasked} scenarios have no execution plan on record. ` +
          `Provide a 2-sentence scenario-execution coverage brief — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Scenario execution analysis complete, sir.").trim();
  } catch {
    return "Scenario task coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.scenarios)        ? raw.scenarios
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.items)            ? raw.items
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || s.scenario_id  || String(i),
    name:     s.name     || s.title        || s.label      || `Scenario ${i + 1}`,
    category: s.category || s.type         || s.kind       || "",
    tags:     Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    summary:  (s.summary || s.description || s.objective || "").toString().slice(0, 300),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)       ? raw
    : Array.isArray(raw?.tasks)        ? raw.tasks
    : Array.isArray(raw?.data)         ? raw.data
    : Array.isArray(raw?.results)      ? raw.results
    : Array.isArray(raw?.items)        ? raw.items
    : [];
  return arr.map((t, i) => ({
    id:     t.id     || t.task_id     || String(i),
    title:  t.title  || t.name        || t.label     || `Task ${i + 1}`,
    status: t.status || t.state       || "pending",
    tags:   Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
    notes:  (t.notes || t.description || t.details || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, task) {
  const sw = keywords(`${scenario.name} ${scenario.category} ${scenario.summary} ${scenario.tags}`);
  const tw = keywords(`${task.title} ${task.notes} ${task.tags}`);
  return sw.filter((w) => tw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(scenarios, tasks) {
  return scenarios.map((s) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(s, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...s, tasks: matched, tasked: matched.length > 0 };
  });
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc.includes("done") || lc.includes("complet")) return "#34D399";
  if (lc.includes("progress") || lc.includes("active")) return "#60A5FA";
  if (lc.includes("block") || lc.includes("fail"))      return "#F87171";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TASKED", "UNTASKED"];

export default function ScenarioTaskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
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
      const [scnRes, tskRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
        fetch(`${base}/entities/Task`,    { headers: hdr }),
      ]);
      setScenarios(normaliseScenarios(await scnRes.json()));
      setTasks(normaliseTasks(await tskRes.json()));
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
    window.addEventListener("jarvis:scntask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scntask-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildScntaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked   = buildLinked(scenarios, tasks);
  const tasked   = linked.filter((s) => s.tasked).length;
  const untasked = linked.length - tasked;

  const displayed = linked.filter((s) => {
    if (filter === "TASKED"   && !s.tasked) return false;
    if (filter === "UNTASKED" && s.tasked)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q)     ||
      s.category.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scenario × Task Coverage (SCNTASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 120,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${INDIGO}55`,
          color: INDIGO, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {untasked > 0
          ? <><span style={{ background: "#F87171", color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{untasked}</span>◈ SCNTASK</>
          : "◈ SCNTASK"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 120,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${INDIGO}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${INDIGO}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${INDIGO}33` }}>
        <span style={{ color: INDIGO, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ SCNTASK</span>
        <span style={{ color: "#6E8AA0", fontSize: 9, flex: 1 }}>SCENARIO × TASK COVERAGE</span>
        {lastFetch && <span style={{ color: "#6E8AA0", fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: INDIGO, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${INDIGO}22` }}>
        {[
          { label: "SCENARIOS", value: linked.length, col: "#60A5FA" },
          { label: "TASKS",     value: tasks.length,  col: "#A78BFA" },
          { label: "TASKED",    value: tasked,         col: "#34D399" },
          { label: "UNTASKED",  value: untasked,       col: "#F87171" },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${INDIGO}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${INDIGO}22` : "none",
            border: `1px solid ${filter === t ? INDIGO : "#6E8AA0"}`,
            color: filter === t ? INDIGO : "#6E8AA0",
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${INDIGO}`,
          color: INDIGO, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* scenario list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
            No scenarios match the current filter.
          </div>
        )}
        {displayed.map((s) => {
          const isExp  = expanded === s.id;
          const status = s.tasked ? "TASKED" : "UNTASKED";
          const col    = s.tasked ? "#34D399" : "#F87171";
          return (
            <div key={s.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${INDIGO}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${s.tasked ? "#34D39944" : "#F8717144"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {status}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{s.name}</span>
                {s.category && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{s.category}</span>}
                {s.tasked && (
                  <span style={{ fontSize: 8, color: "#34D399" }}>{s.tasks.length} task{s.tasks.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${INDIGO}22` }}>
                  {s.summary && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 6 }}>
                      {s.summary.slice(0, 120)}
                    </div>
                  )}
                  {s.tasks.length === 0 ? (
                    <div style={{ fontSize: 9, color: "#F87171" }}>No supporting tasks found in the backlog for this scenario.</div>
                  ) : (
                    s.tasks.map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${statusColor(t.status)}22`, color: statusColor(t.status),
                          letterSpacing: 1,
                        }}>
                          {String(t.status || "PENDING").toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{t.title}</span>
                        <span style={{ fontSize: 8, color: INDIGO }}>rel:{t.score}</span>
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
