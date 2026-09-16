/**
 * TaskGraphPriorityRanker — F227.
 *
 * Parallel-fetches /entities/Task and /v1/graph/centrality.
 *
 * Keyword-correlates each task (title / description / status / tags)
 * against graph centrality entity names to assign a network-importance
 * score, then tiers tasks as:
 *   HIGH-PRIORITY — task references ≥1 high-centrality node (score ≥ 1)
 *   ROUTINE       — no centrality overlap found
 *
 * Stat tiles: tasks / centrality nodes / high-priority / routine
 * Filter tabs: ALL | HIGH-PRIORITY | ROUTINE + text search
 * Expand task → matched centrality nodes with degree + score bar.
 * ▶ ASSESS per task → /v1/jarvis/agent/chat 2-sentence priority brief
 *   + TTS via jarvis:speak-dossier.
 * 90-s auto-refresh.
 *
 * Intent: "task graph" / "task priority graph" / "graph task rank" /
 *         "tgpr" / "tasks by network importance" /
 *         "high centrality tasks" / "network task priority" /
 *         "which tasks matter most" / "network priority"
 *   → jarvis:tgpr-toggle + TTS brief via buildTgprScript()
 *
 * Toggle: ◆ TGPR at left:73600, bottom:8, zIndex:111.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4466";

const BTN_LEFT   = 73600;
const REFRESH_MS = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const TGPR_RE =
  /\b(task.?graph|graph.?task|task.?priority.?graph|graph.?task.?rank|tgpr|tasks?.?by.?network|high.?centrality.?tasks?|network.?task.?priority|which.?tasks?.?matter.?most|network.?priority|graph.?ranked.?tasks?)\b/i;

export function isTgprQuery(t) { return TGPR_RE.test(t || ""); }

export async function buildTgprScript() {
  try {
    const [taskRaw, centRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.ok ? r.json() : []),
      fetch(`${apiBase()}/v1/graph/centrality`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.ok ? r.json() : []),
    ]);
    const tasks = normaliseTasks(taskRaw);
    const nodes = normaliseNodes(centRaw);
    const correlated = correlate(tasks, nodes);
    const highPrio = correlated.filter((t) => t.matched.length > 0).length;
    const top = correlated
      .filter((t) => t.matched.length > 0)
      .sort((a, b) => b._maxCentrality - a._maxCentrality)
      .slice(0, 2)
      .map((t) => `"${t.title}" (linked to ${t.matched[0]?.name})`)
      .join("; ");
    window.dispatchEvent(new CustomEvent("jarvis:tgpr-toggle"));
    return (
      `Task graph priority ranker: ${tasks.length} tasks, ${nodes.length} centrality nodes — ` +
      `${highPrio} task${highPrio !== 1 ? "s" : ""} linked to high-centrality network entities. ` +
      (top ? `Top: ${top}. ` : "") +
      "Opening panel now, sir."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:tgpr-toggle"));
    return "Task graph priority ranker is online. Opening now, sir.";
  }
}

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id:     t.id || t._id || String(Math.random()),
    title:  t.title || t.name || t.label || "Untitled Task",
    desc:   t.description || t.summary || t.body || "",
    status: t.status || t.state || "unknown",
    tags:   Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
    priority: t.priority || t.urgency || "",
  }));
}

function normaliseNodes(raw) {
  const arr = normaliseArray(raw);
  return arr.map((n) => ({
    id:         n.id || n._id || String(Math.random()),
    name:       n.name || n.label || n.node || n.entity || n.entity_name || "Unknown",
    centrality: typeof n.centrality === "number" ? n.centrality
      : typeof n.score === "number" ? n.score
      : typeof n.pagerank === "number" ? n.pagerank
      : typeof n.betweenness === "number" ? n.betweenness
      : 0,
    degree: typeof n.degree === "number" ? n.degree
      : typeof n.connections === "number" ? n.connections
      : 0,
  })).filter((n) => n.name && n.name !== "Unknown");
}

// ─── correlation ──────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function nodeScore(task, node) {
  const haystack = `${task.title} ${task.desc} ${task.tags}`.toLowerCase();
  const nodeTokens = tokens(node.name);
  return nodeTokens.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
}

function correlate(tasks, nodes) {
  return tasks.map((task) => {
    const matched = nodes
      .map((n) => ({ ...n, _score: nodeScore(task, n) }))
      .filter((n) => n._score > 0)
      .sort((a, b) => b.centrality - a.centrality || b._score - a._score)
      .slice(0, 5);
    const maxCentrality = matched.length ? matched[0].centrality : 0;
    return { ...task, matched, _maxCentrality: maxCentrality };
  });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusColor(s) {
  const sl = String(s).toLowerCase();
  if (sl === "done" || sl === "complete" || sl === "completed") return GREEN;
  if (sl === "in_progress" || sl === "active" || sl === "running") return CY;
  if (sl === "blocked" || sl === "failed") return RED;
  return AMBER;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TaskGraphPriorityRanker() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [rows,      setRows]      = useState([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRaw, centRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.ok ? r.json() : []),
        fetch(`${apiBase()}/v1/graph/centrality`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.ok ? r.json() : []),
      ]);
      const tasks = normaliseTasks(taskRaw);
      const nodes = normaliseNodes(centRaw);
      setNodeCount(nodes.length);
      setRows(correlate(tasks, nodes));
    } catch {
      // leave previous data on network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tgpr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tgpr-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(task) {
    setAssessing(task.id);
    const ctx = task.matched.length
      ? `Task: "${task.title}" (status: ${task.status}). Linked centrality nodes: ${task.matched.map((n) => `${n.name} (centrality ${n.centrality.toFixed(3)}, degree ${n.degree})`).join(", ")}.`
      : `Task: "${task.title}" (status: ${task.status}). No centrality overlap found with graph entities.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Given the network importance of this task, assess its strategic priority and recommended next action. ${ctx} Reply in 2 sentences.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim() || "This task connects to high-centrality entities — it should be treated as a strategic priority, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "I could not reach the reasoning core. Review the matched centrality nodes manually, sir." },
      }));
    } finally {
      setAssessing(null);
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────────

  const highPrio = rows.filter((t) => t.matched.length > 0).length;
  const routine  = rows.length - highPrio;

  const filtered = rows.filter((t) => {
    if (tab === "HIGH-PRIORITY" && t.matched.length === 0) return false;
    if (tab === "ROUTINE"       && t.matched.length > 0)   return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(s) ||
        t.desc.toLowerCase().includes(s) ||
        t.matched.some((n) => n.name.toLowerCase().includes(s))
      );
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Graph Centrality Priority Ranker"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 111,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, letterSpacing: 1, padding: "4px 10px",
          borderRadius: 6, cursor: "pointer", backdropFilter: "blur(6px)",
        }}
      >
        {highPrio > 0 && (
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: AMBER, marginRight: 5, verticalAlign: "middle",
          }} />
        )}
        ◆ TGPR
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, width: "min(560px,96vw)",
      maxHeight: "82vh", zIndex: 9500,
      background: "rgba(4,8,16,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.9)`,
      fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${CY}2A`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 16 }}>◆</span>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, flex: 1 }}>
          TASK × GRAPH PRIORITY RANKER
        </span>
        {loading && <span style={{ color: `${CY}88`, fontSize: 10 }}>refreshing…</span>}
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 16 }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}1A`, flexShrink: 0,
      }}>
        {[
          { label: "TASKS",       value: rows.length,  color: CY },
          { label: "CENT NODES",  value: nodeCount,    color: CY },
          { label: "HIGH-PRIO",   value: highPrio,     color: AMBER },
          { label: "ROUTINE",     value: routine,      color: "#4E6070" },
        ].map((t) => (
          <div key={t.label} style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 8,
            padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ color: t.color, fontSize: 20, fontWeight: 700 }}>{t.value}</div>
            <div style={{ color: "#3A5060", fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{
        display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}1A`,
        flexShrink: 0, flexWrap: "wrap", alignItems: "center",
      }}>
        {["ALL", "HIGH-PRIORITY", "ROUTINE"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}18` : "transparent",
              border: `1px solid ${tab === t ? CY : `${CY}33`}`,
              color: tab === t ? CY : "#4E6070",
              borderRadius: 5, padding: "3px 10px",
              fontSize: 10, letterSpacing: 1, cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks or nodes…"
          style={{
            flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CY}33`, borderRadius: 5,
            padding: "3px 10px", color: "#DCEBF5", fontSize: 11,
            fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#2E4050", fontSize: 12 }}>
            {loading ? "Loading tasks and graph centrality…" : "No tasks match the current filter."}
          </div>
        )}
        {filtered.map((task) => {
          const isExp = expanded === task.id;
          return (
            <div key={task.id}>
              <div
                onClick={() => setExpanded(isExp ? null : task.id)}
                style={{
                  padding: "9px 14px", cursor: "pointer",
                  borderLeft: `2px solid ${task.matched.length > 0 ? AMBER : `${CY}22`}`,
                  borderBottom: `1px solid ${CY}12`,
                  display: "flex", alignItems: "center", gap: 10,
                  background: isExp ? `${CY}08` : "transparent",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: statusColor(task.status), flexShrink: 0,
                }} />
                <span style={{ color: "#AECCD8", fontSize: 12, flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.title}
                </span>
                {task.status && (
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 4,
                    background: `${CY}15`, color: CY, letterSpacing: 1, flexShrink: 0,
                  }}>
                    {String(task.status).toUpperCase()}
                  </span>
                )}
                <span style={{
                  fontSize: 10, padding: "1px 8px", borderRadius: 4, flexShrink: 0,
                  background: task.matched.length > 0 ? `${AMBER}18` : "transparent",
                  color: task.matched.length > 0 ? AMBER : "#2E4050",
                  border: `1px solid ${task.matched.length > 0 ? AMBER : "#2E4050"}`,
                }}>
                  {task.matched.length > 0 ? `${task.matched.length} node${task.matched.length !== 1 ? "s" : ""}` : "routine"}
                </span>
              </div>

              {/* Expanded: matched centrality nodes */}
              {isExp && (
                <div style={{
                  background: "rgba(0,0,0,0.3)", borderBottom: `1px solid ${CY}18`,
                  padding: "10px 16px",
                }}>
                  {task.desc && (
                    <div style={{ color: "#5A7080", fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
                      {task.desc.slice(0, 200)}{task.desc.length > 200 ? "…" : ""}
                    </div>
                  )}
                  {task.matched.length === 0 ? (
                    <div style={{ color: "#2E4050", fontSize: 11, marginBottom: 8 }}>
                      No centrality nodes overlap with this task's keywords.
                    </div>
                  ) : (
                    task.matched.map((n) => (
                      <div key={n.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 0", borderBottom: `1px solid ${CY}0A`,
                      }}>
                        <span style={{ color: "#AECCD8", fontSize: 12, flex: 1 }}>{n.name}</span>
                        <span style={{ color: `${CY}88`, fontSize: 10, flexShrink: 0 }}>
                          deg {n.degree}
                        </span>
                        <div style={{
                          width: 60, height: 4, borderRadius: 2,
                          background: `${CY}22`, overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: AMBER,
                            width: `${Math.min(100, n.centrality * 100)}%`,
                          }} />
                        </div>
                        <span style={{ color: AMBER, fontSize: 10, width: 36, textAlign: "right", flexShrink: 0 }}>
                          {n.centrality.toFixed(3)}
                        </span>
                      </div>
                    ))
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); assess(task); }}
                    disabled={assessing === task.id}
                    style={{
                      marginTop: 10, padding: "5px 14px",
                      background: assessing === task.id ? `${CY}22` : `${AMBER}22`,
                      border: `1px solid ${assessing === task.id ? CY : AMBER}`,
                      color: assessing === task.id ? CY : AMBER,
                      borderRadius: 5, fontSize: 10, letterSpacing: 1,
                      cursor: assessing === task.id ? "wait" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {assessing === task.id ? "ASSESSING…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}1A`,
        display: "flex", gap: 14, color: "#2E4050", fontSize: 9, letterSpacing: 1, flexShrink: 0,
      }}>
        <span>{rows.length} tasks</span>
        <span>{nodeCount} centrality nodes</span>
        <span style={{ marginLeft: "auto" }}>auto-refresh 90 s</span>
      </div>
    </div>
  );
}
