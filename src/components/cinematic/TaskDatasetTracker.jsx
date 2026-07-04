/**
 * TaskDatasetTracker — F123.
 *
 * Parallel-fetches /entities/Task + /v1/datasets and
 * keyword-correlates each task (title / description / priority / tags)
 * against the dataset catalog to surface tasks that are DATA-DRIVEN
 * (at least one matching dataset exists) vs ASSUMPTION-BASED (no
 * dataset backing — operating without empirical data).
 *
 * Stat tiles: tasks / datasets / data-driven / assumption-based.
 * Filter tabs: ALL / DATA-DRIVEN / ASSUMPTION-BASED + text search.
 * Expand task → matched datasets with row-count badge + type badge + score.
 * Amber badge on assumption-based count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence-gap brief + TTS.
 *
 * Toggle: ◈ TASKDS at left:36840, bottom:8, zIndex:77.
 * Event:  jarvis:taskds-toggle
 * Voice:  "task dataset" / "data-driven tasks" / "which tasks have data"
 *         / "task evidence" / "taskds"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const VIOLET = "#A78BFA";
const BTN_LEFT = 36840;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisation ────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["items","results","data","tasks","datasets","records","list"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id:          t.id || t._id || t.task_id || String(Math.random()),
    title:       t.title || t.name || t.task_name || "Unnamed Task",
    description: t.description || t.details || t.summary || "",
    priority:    (t.priority || "").toUpperCase(),
    status:      (t.status || "").toUpperCase(),
    tags:        [...(t.tags || []), ...(t.keywords || [])].map(String),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id:          d.id || d.dataset_id || String(Math.random()),
    name:        d.name || d.dataset_name || d.title || "Unnamed Dataset",
    description: d.description || d.summary || d.details || "",
    type:        d.type || d.category || d.dataset_type || "",
    rows:        d.row_count ?? d.rows ?? d.record_count ?? null,
    tags:        [...(d.tags || []), ...(d.keywords || [])].map(String),
  }));
}

// ─── keyword correlation ───────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/\.]+/)
    .filter((t) => t.length > 2);
}

function relevance(task, dataset) {
  const taskTokens = new Set([
    ...tokenize(task.title),
    ...tokenize(task.description),
    ...task.tags.flatMap(tokenize),
  ]);
  const dsTokens = [
    ...tokenize(dataset.name),
    ...tokenize(dataset.description),
    ...dataset.tags.flatMap(tokenize),
  ];
  if (!taskTokens.size || !dsTokens.length) return 0;
  const hits = dsTokens.filter((t) => taskTokens.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(taskTokens.size, dsTokens.length)) * 100 * 4));
}

function buildCoverage(tasks, datasets) {
  const dataDriven = new Set();
  const pairs = [];
  for (const task of tasks) {
    for (const ds of datasets) {
      const score = relevance(task, ds);
      if (score >= 10) {
        dataDriven.add(task.id);
        pairs.push({ taskId: task.id, dataset: ds, score });
      }
    }
  }
  return { dataDriven, pairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isTaskDsQuery(q) {
  return /task.{0,20}dataset|dataset.{0,20}task|data.driven\s+task|assumption.based|task\s+evidence|which\s+tasks\s+have\s+data|taskds\b/i.test(
    q || ""
  );
}

export async function buildTaskDsScript() {
  try {
    const [tr, dr] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const tasks    = normaliseTasks(tr.ok ? await tr.json() : []);
    const datasets = normaliseDatasets(dr.ok ? await dr.json() : []);
    const { dataDriven } = buildCoverage(tasks, datasets);
    const assumptionBased = tasks.length - dataDriven.size;
    window.dispatchEvent(new CustomEvent("jarvis:taskds-toggle"));
    if (!tasks.length)
      return "No tasks on record, sir. The task catalog is empty.";
    return (
      `Task-dataset evidence tracker active, sir. ` +
      `${tasks.length} task${tasks.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}. ` +
      `${dataDriven.size} task${dataDriven.size !== 1 ? "s are" : " is"} data-driven ` +
      `with empirical dataset backing. ` +
      `${assumptionBased} task${assumptionBased !== 1 ? "s are" : " is"} assumption-based — ` +
      `no dataset coverage found.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:taskds-toggle"));
    return "Task-dataset evidence tracker is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TaskDatasetTracker() {
  const [visible,     setVisible]     = useState(false);
  const [tasks,       setTasks]       = useState([]);
  const [datasets,    setDatasets]    = useState([]);
  const [coverage,    setCoverage]    = useState({ dataDriven: new Set(), pairs: [] });
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [selected,    setSelected]    = useState(null);
  const [aiMap,       setAiMap]       = useState({});
  const [aiLoading,   setAiLoading]   = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [tr, dr] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawTasks    = normaliseTasks(tr.ok ? await tr.json() : []);
      const rawDatasets = normaliseDatasets(dr.ok ? await dr.json() : []);
      setTasks(rawTasks);
      setDatasets(rawDatasets);
      setCoverage(buildCoverage(rawTasks, rawDatasets));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:taskds-toggle", onToggle);
    return () => window.removeEventListener("jarvis:taskds-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(task, matchedDatasets) {
    const tid = task.id;
    if (aiMap[tid] || aiLoading === tid) return;
    setAiLoading(tid);
    const title   = task.title || tid;
    const dsNames = matchedDatasets.map((d) => d.name).join(", ");
    const hasCover = matchedDatasets.length > 0;
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence data-evidence assessment for task "${title}". ` +
        `This task is backed by ${matchedDatasets.length} dataset${matchedDatasets.length !== 1 ? "s" : ""}: ${dsNames}. ` +
        `Evaluate whether the available data is sufficient and highlight any evidence gaps.`
      : `As JARVIS, provide a 2-sentence data-evidence assessment for task "${title}"${task.description ? ` (${String(task.description).slice(0, 80)})` : ""}. ` +
        `This task has NO dataset backing — it is operating on assumptions without empirical data. ` +
        `Recommend what data should be gathered or which existing dataset might be applicable.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [tid]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [tid]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const assumptionCount = tasks.length - coverage.dataDriven.size;

  const filtered = tasks.filter((task) => {
    if (filter === "data-driven"     && !coverage.dataDriven.has(task.id)) return false;
    if (filter === "assumption-based" &&  coverage.dataDriven.has(task.id)) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = [task.title, task.description, task.priority, task.status, ...task.tags]
        .filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.taskId === selected.id)
        .sort((a, b) => b.score - a.score)
        .map((p) => p.dataset)
    : [];

  const priorityColor = (p) =>
    p === "CRITICAL" || p === "HIGH" ? "#FF3D5A"
    : p === "MEDIUM" ? AMBER
    : p === "LOW"    ? GREEN
    : "#6E8AA0";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Task × Dataset Evidence Tracker"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 77,
          height: 26,
          padding: "0 8px",
          background: visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? AMBER : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {assumptionCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {assumptionCount > 9 ? "9+" : assumptionCount}
          </span>
        )}
        ◈ TASKDS
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 77,
            width: 640,
            maxHeight: "76vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${AMBER}44`,
            borderTop: `2px solid ${AMBER}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              TASK × DATASET EVIDENCE
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "TASKS",            val: tasks.length,             col: CY     },
              { label: "DATASETS",         val: datasets.length,          col: VIOLET },
              { label: "DATA-DRIVEN",      val: coverage.dataDriven.size, col: GREEN  },
              { label: "ASSUMPTION-BASED", val: assumptionCount,          col: AMBER  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: "1px solid #1A2A3A",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {["all", "data-driven", "assumption-based"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? AMBER : "#2A3A4A"}`,
                  background: filter === f ? `${AMBER}22` : "transparent",
                  color: filter === f ? AMBER : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #2A3A4A",
                borderRadius: 4,
                padding: "3px 8px",
                color: "#A0B8C8",
                fontSize: 10,
                fontFamily: "inherit",
                outline: "none",
                width: 140,
              }}
            />
          </div>

          {/* Task list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ padding: "20px 14px", color: "#4E6A7A", fontSize: 11, textAlign: "center" }}>
                No tasks match the current filter.
              </div>
            )}
            {filtered.map((task) => {
              const isDataDriven = coverage.dataDriven.has(task.id);
              const isExpanded   = selected?.id === task.id;
              const matches      = coverage.pairs
                .filter((p) => p.taskId === task.id)
                .sort((a, b) => b.score - a.score);

              return (
                <div
                  key={task.id}
                  style={{
                    borderBottom: "1px solid #0E1E2E",
                    background: isExpanded ? "rgba(245,166,35,0.04)" : "transparent",
                  }}
                >
                  {/* Task row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 14px",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelected(isExpanded ? null : task)}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: isDataDriven ? GREEN : AMBER,
                        boxShadow: isDataDriven ? `0 0 6px ${GREEN}` : `0 0 6px ${AMBER}`,
                      }}
                    />
                    <span style={{ flex: 1, color: isDataDriven ? "#C8E8D0" : "#D8C090", fontSize: 11, wordBreak: "break-word" }}>
                      {task.title}
                    </span>
                    {task.priority && (
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: 1,
                          color: priorityColor(task.priority),
                          border: `1px solid ${priorityColor(task.priority)}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          flexShrink: 0,
                        }}
                      >
                        {task.priority}
                      </span>
                    )}
                    {task.status && (
                      <span style={{ fontSize: 9, color: "#5E7A8A", letterSpacing: 1, flexShrink: 0 }}>
                        {task.status}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: isDataDriven ? GREEN : AMBER, flexShrink: 0, marginLeft: 4 }}>
                      {isDataDriven ? `${matches.length} DS` : "DARK"}
                    </span>
                    <span style={{ color: "#3E5A6A", fontSize: 12, flexShrink: 0 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "0 14px 10px 28px",
                        borderTop: "1px solid #1A2A3A",
                        background: "rgba(0,0,0,0.2)",
                      }}
                    >
                      {/* Matched datasets */}
                      {selectedMatches.length === 0 ? (
                        <div style={{ padding: "8px 0", color: "#6E8AA0", fontSize: 10 }}>
                          No matching datasets found. This task is operating without empirical data.
                        </div>
                      ) : (
                        selectedMatches.map((ds) => {
                          const pairScore = coverage.pairs.find(
                            (p) => p.taskId === task.id && p.dataset.id === ds.id
                          )?.score ?? 0;
                          return (
                            <div
                              key={ds.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "5px 0",
                                borderBottom: "1px solid #0E1E2E",
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#A0C8A0", flex: 1, wordBreak: "break-word" }}>
                                {ds.name}
                              </span>
                              {ds.type && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: VIOLET,
                                    border: `1px solid ${VIOLET}44`,
                                    borderRadius: 3,
                                    padding: "1px 5px",
                                    flexShrink: 0,
                                  }}
                                >
                                  {ds.type}
                                </span>
                              )}
                              {ds.rows !== null && ds.rows !== undefined && (
                                <span style={{ fontSize: 9, color: "#5E8A7A", flexShrink: 0 }}>
                                  {Number(ds.rows).toLocaleString()} rows
                                </span>
                              )}
                              <div
                                style={{
                                  width: 48,
                                  height: 4,
                                  background: "#1A2A3A",
                                  borderRadius: 2,
                                  overflow: "hidden",
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pairScore}%`,
                                    height: "100%",
                                    background: GREEN,
                                    borderRadius: 2,
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 9, color: "#5E7A8A", width: 28, textAlign: "right", flexShrink: 0 }}>
                                {pairScore}%
                              </span>
                            </div>
                          );
                        })
                      )}

                      {/* ASSESS button */}
                      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); getAiAssessment(task, selectedMatches); }}
                          disabled={aiLoading === task.id}
                          style={{
                            padding: "3px 10px",
                            background: `${AMBER}22`,
                            border: `1px solid ${AMBER}66`,
                            borderRadius: 4,
                            color: AMBER,
                            fontSize: 10,
                            fontFamily: "inherit",
                            cursor: aiLoading === task.id ? "wait" : "pointer",
                            flexShrink: 0,
                          }}
                        >
                          {aiLoading === task.id ? "…" : "▶ ASSESS"}
                        </button>
                        {aiMap[task.id] && (
                          <span style={{ fontSize: 10, color: "#8AA8B8", lineHeight: 1.5 }}>
                            {aiMap[task.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: "1px solid #1A2A3A",
              flexShrink: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 9, color: "#3E5A6A", letterSpacing: 1 }}>
              90s AUTO-REFRESH · /entities/Task · /v1/datasets
            </span>
            <span style={{ fontSize: 9, color: "#3E5A6A" }}>
              {filtered.length} / {tasks.length} tasks
            </span>
          </div>
        </div>
      )}
    </>
  );
}
