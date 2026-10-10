/**
 * F64 — JARVIS Cognitive Load Index (JCLI)
 *
 * Synthesises four confirmed-real endpoints into a single "cognitive load"
 * gauge that answers: "Is JARVIS intelligence keeping pace with operational
 * demand right now?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/cinematic/brain          → { nodes, synapses }
 *   GET /entities/RiskSignal         → active threat signals (severity)
 *   GET /entities/Task               → pending/in-progress tasks
 *   GET /entities/SwarmJob           → running swarm jobs
 *
 * Cognitive Load Score =
 *   (critical_risks × 10 + high_risks × 5 + pending_tasks × 2 + running_jobs × 3)
 *   ÷ max(brain_nodes, 1)
 *
 * States:
 *   OVERLOADED  — score > 3.0   (red,  pulsing)
 *   STRAINED    — score 1.5–3.0 (amber)
 *   BALANCED    — score 0.5–1.5 (cyan)
 *   SURPLUS     — score < 0.5   (green)
 *
 * Stat tiles:  brain nodes / risk signals / tasks / swarm jobs / score
 * Gauge bar:   proportional fill coloured by state.
 * ▶ ASSESS:    2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ JCLI  at left:1440 bottom:18, zIndex:68.
 * Event:   jarvis:jcli-toggle
 * Voice:   "cognitive load / jcli / jarvis load / brain load / operational load /
 *           load index / system load / intelligence load / load gauge"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1440;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normBrain(raw) {
  if (!raw || typeof raw !== "object") return { nodes: 0, synapses: 0 };
  return {
    nodes:    raw.nodes    ?? raw.node_count    ?? raw.total_nodes    ?? 0,
    synapses: raw.synapses ?? raw.synapse_count ?? raw.total_synapses ?? 0,
  };
}

function normSignals(raw) {
  return normArr(raw).map((r, i) => ({
    id:       String(r.id ?? r.signal_id ?? i),
    severity: (r.severity ?? r.level ?? r.priority ?? "INFO").toUpperCase(),
  }));
}

function normTasks(raw) {
  return normArr(raw).map((r, i) => ({
    id:     String(r.id ?? i),
    status: (r.status ?? r.state ?? "pending").toLowerCase(),
  }));
}

function normJobs(raw) {
  return normArr(raw).map((r, i) => ({
    id:     String(r.id ?? i),
    status: (r.status ?? r.state ?? "queued").toLowerCase(),
  }));
}

function computeScore({ nodes, signals, tasks, jobs }) {
  const critical = signals.filter(s => s.severity === "CRITICAL").length;
  const high     = signals.filter(s => s.severity === "HIGH").length;
  const pending  = tasks.filter(t => ["pending","in_progress","in progress","open"].includes(t.status)).length;
  const running  = jobs.filter(j => ["running","active","in_progress","started"].includes(j.status)).length;
  const load     = critical * 10 + high * 5 + pending * 2 + running * 3;
  return load / Math.max(nodes, 1);
}

function classifyScore(score) {
  if (score > 3.0)  return { label: "OVERLOADED", color: RED,   pulse: true  };
  if (score > 1.5)  return { label: "STRAINED",   color: AMBER, pulse: false };
  if (score > 0.5)  return { label: "BALANCED",   color: CY,    pulse: false };
  return              { label: "SURPLUS",    color: GREEN, pulse: false };
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [bRes, rRes, tRes, jRes] = await Promise.all([
    fetch(`${base}/v1/cinematic/brain`,  { headers: hdr }),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    fetch(`${base}/entities/Task`,       { headers: hdr }),
    fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
  ]);
  return {
    brain:   normBrain(await bRes.json()),
    signals: normSignals(await rRes.json()),
    tasks:   normTasks(await tRes.json()),
    jobs:    normJobs(await jRes.json()),
  };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isJcliQuery(q) {
  return /cognitive.?load|jcli|jarvis.?load|brain.?load|operational.?load|load.?index|system.?load|intelligence.?load|load.?gauge/i.test(q);
}

export async function buildJcliScript() {
  try {
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [bRes, rRes, tRes, jRes] = await Promise.all([
      fetch(`${base}/v1/cinematic/brain`,  { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      fetch(`${base}/entities/Task`,       { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
    ]);
    const brain   = normBrain(await bRes.json());
    const signals = normSignals(await rRes.json());
    const tasks   = normTasks(await tRes.json());
    const jobs    = normJobs(await jRes.json());
    const score   = computeScore({ nodes: brain.nodes, signals, tasks, jobs });
    const cls     = classifyScore(score);

    const critical = signals.filter(s => s.severity === "CRITICAL").length;
    const high     = signals.filter(s => s.severity === "HIGH").length;
    const pending  = tasks.filter(t => ["pending","in_progress","in progress","open"].includes(t.status)).length;
    const running  = jobs.filter(j => ["running","active","in_progress","started"].includes(j.status)).length;

    const msg = `JARVIS, assess the current cognitive load. Brain has ${brain.nodes} nodes and ${brain.synapses} synapses. There are ${critical} critical and ${high} high risk signals, ${pending} pending tasks, and ${running} running swarm jobs. Cognitive load score is ${score.toFixed(2)} — state is ${cls.label}. Give a 2-sentence operational assessment.`;
    const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const j2 = await res.json();
    return j2.response ?? j2.message ?? j2.text ?? j2.content ?? `Cognitive load is ${cls.label} at score ${score.toFixed(2)}.`;
  } catch {
    return "Unable to assess cognitive load — backend unavailable.";
  }
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 64 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? CY, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function CognitiveLoadIndex() {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchAll();
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:jcli-toggle", handler);
    return () => window.removeEventListener("jarvis:jcli-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildJcliScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  // Derived metrics
  const brain   = data?.brain   ?? { nodes: 0, synapses: 0 };
  const signals = data?.signals ?? [];
  const tasks   = data?.tasks   ?? [];
  const jobs    = data?.jobs    ?? [];
  const score   = data ? computeScore({ nodes: brain.nodes, signals, tasks, jobs }) : 0;
  const cls     = classifyScore(score);

  const critical = signals.filter(s => s.severity === "CRITICAL").length;
  const high     = signals.filter(s => s.severity === "HIGH").length;
  const pending  = tasks.filter(t => ["pending","in_progress","in progress","open"].includes(t.status)).length;
  const running  = jobs.filter(j => ["running","active","in_progress","started"].includes(j.status)).length;

  const gaugeWidth = Math.min(100, (score / 4) * 100);

  const btnStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
    background: "rgba(8,14,22,0.85)", border: `1px solid ${cls.color}55`,
    borderRadius: 8, padding: "5px 10px", cursor: "pointer",
    fontFamily: MONO, fontSize: 11, color: cls.color,
    display: "flex", alignItems: "center", gap: 6,
    animation: (cls.pulse && data) ? "jcli-pulse 1.4s ease-in-out infinite" : "none",
  };

  const panelStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: 68,
    width: 340, background: BG,
    border: `1px solid ${cls.color}44`, borderRadius: 12,
    padding: 16, fontFamily: MONO, color: "#DCEBF5",
    backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${cls.color}18`,
  };

  return (
    <>
      <style>{`
        @keyframes jcli-pulse {
          0%,100% { box-shadow: 0 0 6px ${RED}44; }
          50%      { box-shadow: 0 0 18px ${RED}aa; }
        }
      `}</style>

      {/* Toggle button */}
      <button style={btnStyle} onClick={() => setOpen(v => !v)} title="Cognitive Load Index">
        <span>◈</span>
        <span>JCLI</span>
        {data && (
          <span style={{
            background: `${cls.color}22`, border: `1px solid ${cls.color}`,
            borderRadius: 4, padding: "1px 5px", fontSize: 10, color: cls.color,
          }}>
            {cls.label}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: cls.color, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              COGNITIVE LOAD INDEX
            </span>
            {loading && <span style={{ fontSize: 9, color: MUTED }}>POLLING…</span>}
            <button
              onClick={assess}
              disabled={assessing || !data}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}55`, borderRadius: 4,
                padding: "2px 8px", color: CY, cursor: "pointer",
                fontSize: 10, fontFamily: MONO, opacity: assessing ? 0.5 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {err && (
            <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>⚠ {err}</div>
          )}

          {/* Gauge */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: MUTED }}>LOAD SCORE</span>
              <span style={{ fontSize: 12, color: cls.color, fontWeight: 700 }}>
                {score.toFixed(2)}
              </span>
            </div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${gaugeWidth}%`,
                background: cls.color, borderRadius: 4,
                transition: "width 0.6s ease, background 0.4s ease",
                boxShadow: `0 0 8px ${cls.color}88`,
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <span style={{ fontSize: 9, color: GREEN }}>SURPLUS &lt;0.5</span>
              <span style={{ fontSize: 9, color: CY }}>BALANCED</span>
              <span style={{ fontSize: 9, color: AMBER }}>STRAINED</span>
              <span style={{ fontSize: 9, color: RED }}>OVERLOADED &gt;3</span>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Tile label="NODES"   value={brain.nodes}    color={CY}    />
            <Tile label="SIGNALS" value={signals.length}  color={AMBER} />
            <Tile label="TASKS"   value={tasks.length}    color={MUTED} />
            <Tile label="JOBS"    value={jobs.length}     color={MUTED} />
            <Tile label="STATE"   value={cls.label}       color={cls.color} />
          </div>

          {/* Breakdown */}
          <div style={{ borderTop: `1px solid ${cls.color}22`, paddingTop: 10 }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: 1.5, marginBottom: 6 }}>
              LOAD BREAKDOWN
            </div>

            {[
              { label: "CRITICAL signals",  value: critical, weight: 10, color: RED   },
              { label: "HIGH signals",      value: high,     weight: 5,  color: AMBER },
              { label: "Pending tasks",     value: pending,  weight: 2,  color: CY    },
              { label: "Running swarm jobs",value: running,  weight: 3,  color: "#A78BFA" },
            ].map(({ label, value, weight, color }) => {
              const contrib = (value * weight) / Math.max(brain.nodes, 1);
              const pct     = Math.min(100, (contrib / 4) * 100);
              return (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
                    <span style={{ fontSize: 10, color }}>
                      {value} × {weight} = {(value * weight).toFixed(0)} pts
                    </span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}

            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 6,
              background: `${cls.color}12`, border: `1px solid ${cls.color}33`,
              fontSize: 10, color: cls.color, textAlign: "center", letterSpacing: 1,
            }}>
              {cls.label} — score {score.toFixed(2)} per brain node
            </div>
          </div>
        </div>
      )}
    </>
  );
}
