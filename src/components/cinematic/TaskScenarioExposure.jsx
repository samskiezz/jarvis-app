/**
 * TaskScenarioExposure — F514
 * "JARVIS, task scenario / scenario task / taskscn / which tasks have scenarios / task planning / scenario-backed tasks / unplanned tasks"
 * Cross-references /entities/Task + /v1/scenario/list.
 * Finds COVERED tasks (≥1 scenario keyword-matches the task) vs UNPLANNED (no scenario backing).
 * Coverage % tile; ALL/COVERED/UNPLANNED filter tabs + search; click-to-expand matched scenarios.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 33_280;
const Z_INDEX  = 97;

const TASKSCN_RE =
  /\btaskscn\b|\btask.?scenario\b|\bscenario.?task\b|\bwhich.?tasks.?have.?scenario\b|\btask.?planning.?scenario\b|\bscenario.?backed.?task\b|\bunplanned.?task\b|\btask.?simulation\b/i;

export function isTaskScenarioQuery(text) {
  return TASKSCN_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw =
    data.tasks || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:          t.id || `task-${i}`,
    name:        t.name || t.title || t.task_name || `Task ${i + 1}`,
    status:      (t.status || "PENDING").toUpperCase(),
    priority:    (t.priority || "MEDIUM").toUpperCase(),
    description: t.description || t.notes || null,
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : String(t.tags || ""),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `scn-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    kind:        (s.kind || s.type || s.category || "GENERAL").toUpperCase(),
    description: s.description || s.summary || null,
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function crossRef(tasks, scenarios) {
  return tasks.map((task) => {
    const haystack = `${task.name} ${task.description || ""} ${task.tags}`;
    const matches = scenarios
      .map((scn) => ({
        scn,
        hits: overlap(haystack, `${scn.name} ${scn.description || ""} ${scn.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...task,
      covered: matches.length > 0,
      matches: matches.map(({ scn, hits }) => ({ ...scn, hits })),
    };
  });
}

// ─── buildTaskScenarioScript (for JarvisBrain) ───────────────────────────────

export async function buildTaskScenarioScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, scnRes] = await Promise.all([
      fetch(`${base}/entities/Task`,        { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
    ]);
    const taskData = taskRes.ok ? await taskRes.json() : {};
    const scnData  = scnRes.ok  ? await scnRes.json()  : {};

    const tasks     = normaliseTasks(taskData);
    const scenarios = normaliseScenarios(scnData);
    const crossed   = crossRef(tasks, scenarios);

    const total    = crossed.length;
    const covered  = crossed.filter((t) => t.covered).length;
    const unplanned = total - covered;
    const coverage  = total > 0 ? Math.round((covered / total) * 100) : 0;

    const topUnplanned = crossed
      .filter((t) => !t.covered)
      .slice(0, 3)
      .map((t) => t.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} tasks have scenario backing. ` +
      `${covered} COVERED, ${unplanned} UNPLANNED.` +
      (topUnplanned ? ` Key unplanned tasks: ${topUnplanned}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Task × Scenario Exposure: ${brief} Provide a 2-sentence operational planning assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Task × Scenario Exposure unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = {
  THREAT: "#FF4466",
  CRISIS: "#FF6B35",
  OPS: "#FFA500",
  CYBER: "#29E7FF",
  FINANCIAL: "#00E5A0",
  GENERAL: "#8899AA",
};

const PRI_COLOR = {
  CRITICAL: "#FF4466",
  HIGH: "#FFA500",
  MEDIUM: "#29E7FF",
  LOW: "#8899AA",
};

export default function TaskScenarioExposure() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, scnRes] = await Promise.all([
        fetch(`${base}/entities/Task`,    { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const taskData = taskRes.ok ? await taskRes.json() : {};
      const scnData  = scnRes.ok  ? await scnRes.json()  : {};

      const t = normaliseTasks(taskData);
      const s = normaliseScenarios(scnData);
      setTasks(t);
      setScenarios(s);
      setCrossed(crossRef(t, s));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:taskscn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:taskscn-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const covered  = crossed.filter((t) => t.covered).length;
      const unplanned = total - covered;
      const coverage  = total > 0 ? Math.round((covered / total) * 100) : 0;
      const prompt = `Task × Scenario Coverage: ${coverage}% (${covered}/${total} covered, ${unplanned} unplanned). Assess in 2 sentences.`;

      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);

      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((t) => {
    if (tab === "COVERED"   && !t.covered) return false;
    if (tab === "UNPLANNED" &&  t.covered) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !t.name.toLowerCase().includes(q) &&
        !(t.description || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total     = crossed.length;
  const nCovered  = crossed.filter((t) => t.covered).length;
  const nUnplanned = total - nCovered;
  const coverage  = total > 0 ? Math.round((nCovered / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="Task × Scenario Exposure Monitor"
      >
        ◈ TASKSCN
        {nUnplanned > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nUnplanned}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>TASK × SCENARIO EXPOSURE</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",   value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "COVERED",    value: nCovered,        color: GRN },
              { label: "UNPLANNED",  value: nUnplanned,      color: AMB },
              { label: "SCENARIOS",  value: scenarios.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`, borderRadius: 4,
                  padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess button + brief */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3,
                fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "COVERED", "UNPLANNED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px",
                  borderRadius: 3, fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, color: CY,
              padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Task rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No tasks match.</div>
          ) : (
            visible.map((task) => (
              <div key={task.id}>
                <div
                  onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${task.covered ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: PRI_COLOR[task.priority] || DIM, minWidth: 52 }}>
                    {task.priority}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: task.covered ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.name}
                  </span>
                  {task.covered ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {task.matches.length} scn</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNPLANNED</span>
                  )}
                </div>

                {expanded === task.id && task.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {task.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{task.description}</div>
                    )}
                    {task.matches.map((scn) => (
                      <div
                        key={scn.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${KIND_COLOR[scn.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[scn.kind] || DIM, marginRight: 4 }}>[{scn.kind}]</span>
                        <span style={{ color: GRN }}>{scn.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{scn.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === task.id && !task.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No scenarios cover this task.
                    {task.description && <div style={{ marginTop: 2 }}>{task.description}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
