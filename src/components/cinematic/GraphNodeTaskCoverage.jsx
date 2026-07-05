/**
 * GraphNodeTaskCoverage — F165
 *
 * Parallel-fetches /v1/graph/centrality + /entities/Task then keyword-
 * correlates each top-influence graph node against the task catalog to
 * surface TASKED (at least one active task addresses this node) vs
 * UNMANAGED (high-influence node with no operational task — priority gap).
 *
 * Stat tiles: nodes / tasks / tasked / unmanaged
 * Filter tabs: ALL / TASKED / UNMANAGED
 * Expand node → matched tasks with priority badge + status badge + score.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence influence-coverage brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "graph node task" / "node task coverage" /
 *         "high influence task" / "gntask"
 *   → jarvis:gntask-toggle + TTS brief via buildGntaskScript()
 *
 * Toggle: ◈ GNTASK at left:54520, bottom:8, zIndex 107.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const RED    = "#FF4444";
const DIM    = "#4A6070";
const BG     = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 54520;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const GNTASK_RE =
  /\b(graph.node.task|node.task.coverage|high.influence.task|gntask|influence.coverage|tasked.nodes|unmanaged.nodes)\b/i;

export function isGntaskQuery(t) { return GNTASK_RE.test(t || ""); }

export async function buildGntaskScript() {
  const [cRaw, tRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/graph/centrality`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const nodes = normaliseNodes(cRaw.status === "fulfilled" ? cRaw.value : []);
  const tasks = normaliseTasks(tRaw.status === "fulfilled" ? tRaw.value : []);
  const pairs = correlate(nodes, tasks);
  const tasked   = pairs.filter((p) => p.matches.length > 0).length;
  const unmanaged = pairs.filter((p) => p.matches.length === 0).length;
  return (
    `Assess JARVIS graph-node task coverage in 2 sentences. ` +
    `Top ${nodes.length} high-influence nodes: ${tasked} TASKED (active tasks cover them), ` +
    `${unmanaged} UNMANAGED (no operational task — priority gap). ` +
    `Top unmanaged nodes: ${pairs
      .filter((p) => p.matches.length === 0)
      .slice(0, 3)
      .map((p) => p.node.name)
      .join(", ") || "none"}.`
  );
}

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.nodes))   return raw.nodes;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseNodes(raw) {
  return normaliseArray(raw)
    .slice(0, 50)
    .map((n) => ({
      id:         n.id || n.node_id || String(Math.random()),
      name:       n.name || n.label || n.title || n.entity || "Unknown Node",
      type:       n.type || n.node_type || n.entity_type || "",
      centrality: typeof n.centrality === "number" ? n.centrality
                : typeof n.score      === "number" ? n.score
                : typeof n.value      === "number" ? n.value
                : 0,
    }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id:          t.id || t.task_id || String(Math.random()),
    title:       t.title || t.name || t.task || "Untitled Task",
    description: t.description || t.notes || t.summary || "",
    priority:    t.priority || t.urgency || t.severity || "NORMAL",
    status:      t.status || t.state || "UNKNOWN",
    tags:        [...(t.tags || []), ...(t.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(node, task) {
  const nodeWords = tokens(`${node.name} ${node.type}`);
  const taskText  = `${task.title} ${task.description} ${task.tags.join(" ")}`.toLowerCase();
  const hits = nodeWords.filter((w) => taskText.includes(w));
  return hits.length / Math.max(nodeWords.length, 1);
}

function correlate(nodes, tasks) {
  return nodes.map((node) => {
    const scored = tasks
      .map((task) => ({ task, score: matchScore(node, task) }))
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { node, matches: scored };
  });
}

// ─── priority colour ──────────────────────────────────────────────────────────

function priorityColor(p) {
  const s = String(p).toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMBER;
  if (s === "LOW")      return DIM;
  return GREEN;
}

function statusColor(s) {
  const v = String(s).toUpperCase().replace(/_/g, "-");
  if (v === "DONE" || v === "COMPLETE" || v === "COMPLETED") return GREEN;
  if (v === "FAILED" || v === "BLOCKED" || v === "CANCELLED") return RED;
  if (v === "IN-PROGRESS" || v === "RUNNING" || v === "ACTIVE") return CY;
  return DIM;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 70, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GraphNodeTaskCoverage() {
  const [open, setOpen]       = useState(false);
  const [pairs, setPairs]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cRes, tRes] = await Promise.allSettled([
        fetch(`${apiBase()}/v1/graph/centrality`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const nodes = normaliseNodes(cRes.status === "fulfilled" ? cRes.value : []);
      const tasks = normaliseTasks(tRes.status === "fulfilled" ? tRes.value : []);
      setPairs(correlate(nodes, tasks));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:gntask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gntask-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const tasked    = pairs.filter((p) => p.matches.length > 0);
  const unmanaged = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "TASKED")    return p.matches.length > 0;
      if (tab === "UNMANAGED") return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.node.name.toLowerCase().includes(q) ||
        p.node.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.task.title.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildGntaskScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || d.response || "No assessment available.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Unable to generate assessment at this time." },
      }));
    } finally {
      setAssessing(false);
    }
  }

  const badgeCount = unmanaged.length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Node × Task Coverage"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 107,
          background: "rgba(5,8,14,0.82)", border: `1px solid ${PURPLE}66`,
          color: PURPLE, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ GNTASK
        {badgeCount > 0 && (
          <span style={{
            marginLeft: 4, background: PURPLE, color: "#0A0D14",
            borderRadius: 8, fontSize: 9, padding: "1px 4px", fontWeight: 700,
          }}>{badgeCount}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 400, zIndex: 107,
      width: 520, maxHeight: "76vh",
      background: BG, border: `1px solid ${PURPLE}55`, borderRadius: 10,
      display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${PURPLE}22`, fontFamily: MONO, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderBottom: `1px solid ${PURPLE}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: PURPLE, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ GRAPH NODE × TASK COVERAGE
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
          {loading ? "refreshing…" : `${pairs.length} nodes`}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="NODES"     value={pairs.length}    color={PURPLE} />
        <Tile label="TASKS"     value={pairs.flatMap((p) => p.matches).length > 0
          ? new Set(pairs.flatMap((p) => p.matches.map((m) => m.task.id))).size
          : "—"}                                         color={CY} />
        <Tile label="TASKED"    value={tasked.length}   color={GREEN} />
        <Tile label="UNMANAGED" value={unmanaged.length} color={AMBER} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px 6px" }}>
        {["ALL", "TASKED", "UNMANAGED"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? PURPLE : "rgba(0,0,0,0.3)",
            color: tab === t ? "#0A0D14" : PURPLE,
            border: `1px solid ${PURPLE}55`, borderRadius: 4,
            fontSize: 9, letterSpacing: 1, padding: "3px 8px", cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search nodes / tasks…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${DIM}44`,
            borderRadius: 4, color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
            fontFamily: MONO, width: 160, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 10px" }}>
        {error && (
          <div style={{ color: RED, fontSize: 11, padding: "8px 0" }}>Error: {error}</div>
        )}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, padding: "8px 0" }}>No results.</div>
        )}
        {visible.map((pair) => {
          const isOpen = expanded[pair.node.id];
          const isManaged = pair.matches.length > 0;
          return (
            <div key={pair.node.id} style={{
              borderBottom: `1px solid rgba(255,255,255,0.05)`, marginBottom: 2,
            }}>
              {/* row */}
              <div
                onClick={() => setExpanded((prev) => ({ ...prev, [pair.node.id]: !prev[pair.node.id] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 4px", cursor: "pointer",
                  borderRadius: 4,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(167,139,250,0.07)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                {/* centrality bar */}
                <div style={{ width: 32 }}>
                  <div style={{
                    height: 3, background: PURPLE,
                    width: `${Math.min(100, Math.round(pair.node.centrality * 100))}%`,
                    minWidth: 6, borderRadius: 2,
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pair.node.name}
                  </div>
                  {pair.node.type && (
                    <div style={{ fontSize: 9, color: DIM, marginTop: 1 }}>{pair.node.type}</div>
                  )}
                </div>
                <span style={{
                  fontSize: 9, letterSpacing: 1, padding: "2px 6px", borderRadius: 3,
                  background: isManaged ? `${GREEN}22` : `${AMBER}22`,
                  color: isManaged ? GREEN : AMBER,
                  border: `1px solid ${isManaged ? GREEN : AMBER}55`,
                  flexShrink: 0,
                }}>
                  {isManaged ? "TASKED" : "UNMANAGED"}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* expanded matches */}
              {isOpen && (
                <div style={{ paddingLeft: 44, paddingBottom: 6 }}>
                  {pair.matches.length === 0 ? (
                    <div style={{ fontSize: 10, color: DIM, padding: "4px 0" }}>
                      No task coverage — operational gap for this high-influence node.
                    </div>
                  ) : (
                    pair.matches.map(({ task, score }) => (
                      <div key={task.id} style={{
                        padding: "4px 0",
                        borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{task.title}</span>
                          <span style={{
                            fontSize: 8, padding: "1px 4px", borderRadius: 3,
                            background: `${priorityColor(task.priority)}22`,
                            color: priorityColor(task.priority),
                            border: `1px solid ${priorityColor(task.priority)}55`,
                          }}>{task.priority}</span>
                          <span style={{
                            fontSize: 8, padding: "1px 4px", borderRadius: 3,
                            background: `${statusColor(task.status)}22`,
                            color: statusColor(task.status),
                          }}>{task.status}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <ScoreBar score={score} color={PURPLE} />
                          <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
                            {Math.round(score * 100)}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${PURPLE}33`,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 8,
      }}>
        <button
          onClick={assess}
          disabled={assessing || pairs.length === 0}
          style={{
            background: assessing ? "rgba(0,0,0,0.4)" : `${PURPLE}22`,
            border: `1px solid ${PURPLE}66`, color: PURPLE,
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 4, cursor: assessing ? "default" : "pointer",
          }}
        >
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
          auto-refresh 90 s
        </span>
        <button
          onClick={load}
          style={{
            background: "none", border: `1px solid ${DIM}44`, color: DIM,
            fontFamily: MONO, fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
          }}
        >↺</button>
      </div>
    </div>
  );
}
