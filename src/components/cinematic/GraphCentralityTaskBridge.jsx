/**
 * GraphCentralityTaskBridge — F249 (GCTIB)
 *
 * Parallel-fetches /v1/graph/centrality + /entities/Task every 90 s.
 * Keyword-correlates each top-centrality graph node (id/label/type)
 * against the task backlog (name/description/status/priority/tags).
 * Classification: TASKED (≥1 task match) vs UNMONITORED (0 matches).
 * Amber badge on unmonitored count.
 *
 * Voice intents: "graph task / task graph / gctib /
 *                tasked nodes / unmonitored nodes /
 *                which nodes have tasks / graph task bridge /
 *                central node tasks / node task coverage"
 * Strip button: ◈ GCTIB  left:5340 bottom:18 zIndex:68
 * Custom event: jarvis:gctib-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const GCTIB_RE =
  /\b(graph.task|task.graph|gctib|tasked.node|unmonitored.node|which.node.have.task|graph.task.bridge|central.node.task|node.task.coverage)\b/i;

export function isGctibQuery(t) { return GCTIB_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(node, task) {
  const a = tokenize([node.id, node.label, node.type].join(" "));
  const b = tokenize([
    task.name, task.description,
    task.status || "", task.priority || "",
    (task.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [nr, tr] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`, { headers: hdrs }),
    fetch(`${base}/entities/Task`,        { headers: hdrs }),
  ]);
  const nd = nr.ok ? await nr.json() : {};
  const td = tr.ok ? await tr.json() : {};

  const nodes = (Array.isArray(nd) ? nd : nd?.data || nd?.nodes || nd?.items || nd?.results || []).map(n => ({
    id:         String(n.id || n.node_id || n._id || Math.random()),
    label:      n.label || n.name || n.id || "Unknown Node",
    type:       n.type || n.entity_type || "",
    centrality: Number(n.centrality || n.score || n.pagerank || 0),
  }));

  const tasks = (Array.isArray(td) ? td : td?.data || td?.items || td?.results || td?.tasks || []).map(t => ({
    id:          String(t.id || t._id || Math.random()),
    name:        t.name || t.title || "Unnamed Task",
    description: t.description || t.notes || "",
    status:      t.status || t.state || "",
    priority:    t.priority || "",
    tags:        t.tags || [],
  }));

  return { nodes, tasks };
}

export async function buildGctibScript() {
  try {
    const base = apiBase();
    const { nodes, tasks } = await fetchAll();
    const threshold = 0.04;
    const tasked      = nodes.filter(n => tasks.some(t => relevance(n, t) >= threshold));
    const unmonitored = nodes.filter(n => !tasks.some(t => relevance(n, t) >= threshold));
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message: `Graph Centrality × Task Bridge (GCTIB): ${nodes.length} top-centrality nodes, ` +
          `${tasks.length} tasks, ${tasked.length} nodes TASKED, ` +
          `${unmonitored.length} UNMONITORED (no task coverage). Unmonitored nodes: ` +
          `${unmonitored.slice(0, 3).map(n => n.label).join("; ") || "none"}. ` +
          "Assess task coverage gaps for the knowledge graph in exactly 2 sentences.",
      }),
    });
    const d = r.ok ? await r.json() : null;
    return d?.response || d?.reply || d?.content || d?.text ||
      `GCTIB: ${tasked.length}/${nodes.length} nodes tasked, ${unmonitored.length} unmonitored.`;
  } catch {
    return "GCTIB: unable to fetch assessment.";
  }
}

/* ── Styles ─────────────────────────────────────────────────────── */
const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 5340,
  width: 440,
  height: 520,
  background: "rgba(7,18,28,0.97)",
  border: "1px solid #29E7FF44",
  borderRadius: 10,
  boxShadow: "0 0 28px #29E7FF22",
  display: "flex",
  flexDirection: "column",
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  color: "#DCEBF5",
  backdropFilter: "blur(14px)",
};

const BTN = {
  position: "fixed",
  left: 5340,
  bottom: 18,
  zIndex: 68,
  background: "rgba(7,18,28,0.88)",
  border: "1px solid #29E7FF55",
  borderRadius: 6,
  color: CY,
  fontFamily: "'Share Tech Mono',monospace",
  fontSize: 11,
  padding: "3px 8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

/* ── Component ─────────────────────────────────────────────────── */
export default function GraphCentralityTaskBridge() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assess,    setAssess]    = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { nodes, tasks } = await fetchAll();
      const threshold = 0.04;
      const enriched = nodes.map(n => {
        const matches = tasks
          .map(t => ({ ...t, score: relevance(n, t) }))
          .filter(t => t.score >= threshold)
          .sort((x, y) => y.score - x.score);
        return { ...n, status: matches.length > 0 ? "TASKED" : "UNMONITORED", matches };
      });
      enriched.sort((a, b) => b.centrality - a.centrality);
      setData({ nodes: enriched, tasks });
    } catch (e) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:gctib-toggle", toggle);
    return () => window.removeEventListener("jarvis:gctib-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const runAssess = async () => {
    setAssessing(true); setAssess("");
    const txt = await buildGctibScript();
    setAssess(txt); setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  if (!open) {
    const unmonCount = data ? data.nodes.filter(n => n.status === "UNMONITORED").length : 0;
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Graph Centrality × Task Bridge">
        ◈ GCTIB
        {unmonCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, fontSize: 9, padding: "1px 4px", fontWeight: 700 }}>
            {unmonCount}
          </span>
        )}
      </button>
    );
  }

  const nodes      = data?.nodes || [];
  const tasks      = data?.tasks || [];
  const tasked     = nodes.filter(n => n.status === "TASKED");
  const unmonitored = nodes.filter(n => n.status === "UNMONITORED");

  const visible = nodes.filter(n => {
    if (filter === "TASKED"      && n.status !== "TASKED")      return false;
    if (filter === "UNMONITORED" && n.status !== "UNMONITORED") return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (n.label + n.type + n.id).toLowerCase().includes(q);
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #29E7FF22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>◈ GRAPH CENTRALITY × TASK BRIDGE</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #29E7FF11" }}>
        {[
          { label: "NODES",       val: nodes.length,       color: CY  },
          { label: "TASKS",       val: tasks.length,       color: CY  },
          { label: "TASKED",      val: tasked.length,      color: GRN },
          { label: "UNMONITORED", val: unmonitored.length, color: AMB },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, background: "rgba(41,231,255,0.04)", borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
            <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px 4px", flexWrap: "wrap" }}>
        {["ALL", "TASKED", "UNMONITORED"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : "rgba(41,231,255,0.08)", color: filter === f ? "#000" : DIM, border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search nodes…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: "1px solid #29E7FF22", borderRadius: 4, color: "#DCEBF5", fontFamily: "inherit", fontSize: 10, padding: "2px 8px", width: 120 }} />
      </div>

      {/* Node list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {loading && !data && <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>loading…</div>}
        {err && <div style={{ color: "#FF4D6D", fontSize: 11, textAlign: "center", marginTop: 10 }}>{err}</div>}
        {visible.map(n => (
          <div key={n.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", borderRadius: 6, border: "1px solid #29E7FF18" }}>
            <div onClick={() => toggleRow(n.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: n.status === "TASKED" ? GRN : AMB, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.label}
              </span>
              {n.type && <span style={{ fontSize: 9, color: DIM }}>{n.type}</span>}
              <span style={{ fontSize: 9, color: CY }}>{n.centrality.toFixed ? n.centrality.toFixed(3) : n.centrality}</span>
              <span style={{ fontSize: 9, color: n.status === "TASKED" ? GRN : AMB, marginLeft: 4 }}>
                {n.status}
              </span>
              <span style={{ color: DIM, fontSize: 10 }}>{expanded[n.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[n.id] && (
              <div style={{ padding: "4px 12px 8px", borderTop: "1px solid #29E7FF11" }}>
                {n.matches.length === 0 ? (
                  <div style={{ fontSize: 10, color: DIM, fontStyle: "italic" }}>No tasks matched this node.</div>
                ) : (
                  n.matches.slice(0, 6).map((t, i) => (
                    <div key={t.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        {t.priority && (
                          <span style={{ fontSize: 8, color: AMB, background: "rgba(255,215,0,0.12)", borderRadius: 3, padding: "1px 4px" }}>
                            {t.priority.toUpperCase()}
                          </span>
                        )}
                        {t.status && (
                          <span style={{ fontSize: 8, color: CY, background: "rgba(41,231,255,0.10)", borderRadius: 3, padding: "1px 4px" }}>
                            {t.status.toUpperCase()}
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: GRN }}>{(t.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, t.score * 400)}%`, background: GRN, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && data && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>No nodes match.</div>
        )}
      </div>

      {/* Assess footer */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid #29E7FF22" }}>
        {assess && <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 5, lineHeight: 1.4 }}>{assess}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={runAssess} disabled={assessing}
            style={{ flex: 1, background: "rgba(41,231,255,0.10)", border: "1px solid #29E7FF44", borderRadius: 5, color: CY, fontFamily: "inherit", fontSize: 10, padding: "4px 0", cursor: assessing ? "default" : "pointer" }}>
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
          <button onClick={load}
            style={{ background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 5, color: DIM, fontFamily: "inherit", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}
