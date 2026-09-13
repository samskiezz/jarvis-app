import { useState, useEffect, useRef, useCallback } from "react";

const CY = "#00D4FF";
const API_BASE = (typeof window !== "undefined" && window.JARVIS_API_BASE) || "";
const API_KEY = (typeof window !== "undefined" && window.JARVIS_API_KEY) || "dev-key";

const STATUS_COLOR = { SYNCED: "#00D4FF", GROWING: "#22C55E", LAGGING: "#F59E0B", CRITICAL: "#EF4444" };
const STATUS_LABEL = {
  SYNCED: "SYNCED",
  GROWING: "BRAIN AHEAD",
  LAGGING: "TASKS LAGGING",
  CRITICAL: "CRITICAL",
};

function classify(nodes, tasks) {
  const total = tasks.length;
  const done = tasks.filter(t => {
    const s = (t.status || "").toLowerCase();
    return s === "done" || s === "completed" || s === "closed" || s === "resolved";
  }).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  if (nodes === 0 && total === 0) return { status: "SYNCED", pct, done, total };
  if (nodes > 500 && pct >= 60) return { status: "SYNCED", pct, done, total };
  if (nodes > 200 && pct >= 80) return { status: "SYNCED", pct, done, total };
  if (nodes > total * 5 && pct < 40) return { status: "GROWING", pct, done, total };
  if (nodes < 100 && total > 20 && pct < 50) return { status: "CRITICAL", pct, done, total };
  if (pct < 40) return { status: "LAGGING", pct, done, total };
  if (pct >= 60) return { status: "SYNCED", pct, done, total };
  return { status: "GROWING", pct, done, total };
}

async function fetchBrain() {
  const r = await fetch(`${API_BASE}/v1/cinematic/brain`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`brain ${r.status}`);
  return r.json();
}

async function fetchTasks() {
  const r = await fetch(`${API_BASE}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`tasks ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.items || d.data || d.tasks || []);
}

export function isBstpQuery(q) {
  return /\b(brain task|task brain|bstp|brain progress|task progress|brain sync|task coherence|brain task sync|task completion brain)\b/i.test(q);
}

export async function buildBstpScript() {
  try {
    const [brain, tasks] = await Promise.all([fetchBrain(), fetchTasks()]);
    const nodes = brain.nodes ?? brain.node_count ?? 0;
    const synapses = brain.synapses ?? brain.synapse_count ?? brain.edge_count ?? 0;
    const { status, pct, done, total } = classify(nodes, tasks);
    const r = await fetch(`${API_BASE}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `JARVIS brain has ${nodes} nodes and ${synapses} synapses. Task board: ${total} total tasks, ${done} completed (${pct}% done). Overall status: ${status}. In 2 sentences, assess whether JARVIS intelligence is coherent with mission progress.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Brain-task coherence analysis complete.").trim();
  } catch {
    return "Unable to assess brain-task coherence at this time.";
  }
}

export default function BrainTaskProgressMonitor() {
  const [open, setOpen] = useState(false);
  const [brain, setBrain] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [b, t] = await Promise.all([fetchBrain(), fetchTasks()]);
      setBrain(b);
      setTasks(t);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:bstp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:bstp-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setBrief("");
    const script = await buildBstpScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  if (!open) {
    const nodes = brain?.nodes ?? brain?.node_count ?? 0;
    const taskArr = tasks;
    const done = taskArr.filter(t => {
      const s = (t.status || "").toLowerCase();
      return s === "done" || s === "completed" || s === "closed" || s === "resolved";
    }).length;
    const total = taskArr.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : "—";
    return (
      <button
        onClick={() => setOpen(true)}
        title="Brain × Task Progress (BSTP)"
        style={{
          position: "fixed", left: 1380, bottom: 18, zIndex: 68,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          borderRadius: 6, padding: "4px 8px", cursor: "pointer",
          backdropFilter: "blur(6px)", letterSpacing: 1,
        }}
      >
        ◈ BSTP {nodes > 0 && <span style={{ marginLeft: 4, color: "#22C55E" }}>{nodes}N</span>}
        {total > 0 && <span style={{ marginLeft: 4, color: pct < 40 ? "#EF4444" : "#F59E0B" }}>{pct}%</span>}
      </button>
    );
  }

  const nodes = brain?.nodes ?? brain?.node_count ?? 0;
  const synapses = brain?.synapses ?? brain?.synapse_count ?? brain?.edge_count ?? 0;
  const { status, pct, done, total } = classify(nodes, tasks);
  const statusColor = STATUS_COLOR[status] || CY;

  const statusCounts = { ALL: 0, DONE: 0, PENDING: 0, OTHER: 0 };
  tasks.forEach(t => {
    statusCounts.ALL++;
    const s = (t.status || "").toLowerCase();
    if (s === "done" || s === "completed" || s === "closed" || s === "resolved") statusCounts.DONE++;
    else if (s === "pending" || s === "open" || s === "in_progress" || s === "active") statusCounts.PENDING++;
    else statusCounts.OTHER++;
  });

  const filtered = tasks.filter(t => {
    const s = (t.status || "").toLowerCase();
    const isDone = s === "done" || s === "completed" || s === "closed" || s === "resolved";
    const isPending = s === "pending" || s === "open" || s === "in_progress" || s === "active";
    if (filter === "DONE" && !isDone) return false;
    if (filter === "PENDING" && !isPending) return false;
    if (filter === "OTHER" && (isDone || isPending)) return false;
    const q = search.toLowerCase();
    if (q) {
      const title = (t.title || t.name || t.description || "").toLowerCase();
      if (!title.includes(q)) return false;
    }
    return true;
  });

  const TILE = (label, val, color) => (
    <div style={{
      background: "rgba(0,212,255,0.04)", border: `1px solid ${CY}22`,
      borderRadius: 6, padding: "8px 12px", textAlign: "center", minWidth: 90,
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || CY }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", left: 1380, bottom: 72, zIndex: 68, width: "min(480px,92vw)",
      background: "rgba(5,8,13,0.93)", border: `1px solid ${CY}44`,
      borderRadius: 12, padding: "14px 16px", backdropFilter: "blur(12px)",
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 40px ${CY}18`, maxHeight: "70vh", overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: statusColor, fontSize: 14, textShadow: `0 0 10px ${statusColor}` }}>◈</span>
        <b style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>BRAIN × TASK PROGRESS</b>
        <span style={{
          marginLeft: "auto", fontSize: 9, padding: "2px 8px", borderRadius: 4,
          background: statusColor + "22", border: `1px solid ${statusColor}55`,
          color: statusColor, letterSpacing: 1,
          animation: status === "CRITICAL" ? "bstpPulse 1.5s ease-in-out infinite" : "none",
        }}>{STATUS_LABEL[status]}</span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, marginLeft: 4,
        }}>✕</button>
      </div>

      {loading && <div style={{ color: "#6E8AA0", fontSize: 11 }}>loading brain + task data…</div>}
      {err && <div style={{ color: "#EF4444", fontSize: 11 }}>error: {err}</div>}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {TILE("BRAIN NODES", nodes, CY)}
        {TILE("SYNAPSES", synapses, "#7C3AED")}
        {TILE("TASKS", total, "#F59E0B")}
        {TILE("DONE", `${pct}%`, pct >= 60 ? "#22C55E" : pct >= 40 ? "#F59E0B" : "#EF4444")}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0", marginBottom: 4 }}>
          <span>TASK COMPLETION</span>
          <span>{done}/{total} done</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${total > 0 ? pct : 0}%`, height: "100%",
            background: pct >= 60 ? "#22C55E" : pct >= 40 ? "#F59E0B" : "#EF4444",
            borderRadius: 4, transition: "width 0.4s",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0", marginTop: 4 }}>
          <span>BRAIN NODES</span>
          <span>{nodes} nodes / {synapses} synapses</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6, overflow: "hidden", marginTop: 2 }}>
          <div style={{
            width: `${Math.min(100, (nodes / 1000) * 100)}%`, height: "100%",
            background: CY, borderRadius: 4, transition: "width 0.4s",
          }} />
        </div>
      </div>

      {/* ASSESS button */}
      <button onClick={assess} disabled={assessing} style={{
        background: assessing ? "rgba(0,212,255,0.1)" : "rgba(0,212,255,0.08)",
        border: `1px solid ${CY}55`, color: CY, cursor: assessing ? "wait" : "pointer",
        fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: "5px 12px",
        borderRadius: 5, marginBottom: 10, letterSpacing: 1,
      }}>
        {assessing ? "▶ assessing…" : "▶ ASSESS"}
      </button>

      {brief && (
        <div style={{
          background: "rgba(0,212,255,0.05)", border: `1px solid ${CY}22`,
          borderRadius: 6, padding: "8px 10px", fontSize: 11, lineHeight: 1.5,
          marginBottom: 10, color: "#DCEBF5",
        }}>{brief}</div>
      )}

      {/* Filter + search */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {["ALL", "DONE", "PENDING", "OTHER"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${CY}22` : "rgba(255,255,255,0.04)",
            border: `1px solid ${filter === f ? CY : CY + "33"}`,
            color: filter === f ? CY : "#6E8AA0", borderRadius: 4, padding: "2px 8px",
            fontSize: 9, cursor: "pointer", letterSpacing: 1,
          }}>{f} {statusCounts[f] ?? 0}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", borderRadius: 4, padding: "2px 8px", fontSize: 9,
            fontFamily: "'JetBrains Mono',monospace", outline: "none", flex: 1, minWidth: 80,
          }}
        />
      </div>

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.slice(0, 30).map((t, i) => {
          const title = t.title || t.name || t.description || `Task #${i + 1}`;
          const s = (t.status || "unknown").toLowerCase();
          const isDone = s === "done" || s === "completed" || s === "closed" || s === "resolved";
          const isPending = s === "pending" || s === "open" || s === "in_progress" || s === "active";
          const sColor = isDone ? "#22C55E" : isPending ? "#F59E0B" : "#6E8AA0";
          const priority = t.priority || "";
          return (
            <div key={t.id || i} style={{
              background: "rgba(0,212,255,0.03)", border: `1px solid ${CY}18`,
              borderRadius: 5, padding: "6px 10px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                  {title}
                </span>
                <span style={{ fontSize: 9, color: sColor, letterSpacing: 1, whiteSpace: "nowrap", marginRight: 6 }}>
                  {s.toUpperCase()}
                </span>
                {priority && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 3,
                    background: priority === "high" ? "#EF444422" : "#F59E0B22",
                    color: priority === "high" ? "#EF4444" : "#F59E0B",
                    letterSpacing: 1,
                  }}>{priority.toUpperCase()}</span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 11, textAlign: "center", padding: "10px 0" }}>
            no tasks match filter
          </div>
        )}
        {filtered.length > 30 && (
          <div style={{ color: "#6E8AA0", fontSize: 9, textAlign: "center" }}>
            +{filtered.length - 30} more tasks
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 9, color: "#4A6070", textAlign: "right" }}>
        60 s auto-refresh · /v1/cinematic/brain + /entities/Task
      </div>

      <style>{`
        @keyframes bstpPulse {
          0%,100% { opacity:1; }
          50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}
