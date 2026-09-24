/**
 * F437 — JARVIS Situational Readiness Score (JSRS)
 *
 * Parallel-polls 6 real endpoints every 60 s and computes a composite
 * 0–100 readiness score that reflects JARVIS's operational posture:
 *
 *   /v1/cinematic/brain              — nodes & synapses (brain health)
 *   /entities/RiskSignal             — critical / high active risks
 *   /entities/Task                   — pending vs completed tasks
 *   /entities/SwarmJob               — running swarm jobs
 *   /v1/jarvis/system/status         — degraded services
 *   /v1/jarvis/analytics/anomalies   — active metric anomalies
 *
 * Score formula:
 *   Base = 100
 *   − 8 per CRITICAL risk signal   (floor at 0)
 *   − 4 per HIGH risk signal
 *   − 3 per HIGH anomaly
 *   − 1 per MEDIUM anomaly
 *   − 5 per degraded service
 *   + 2 per running SwarmJob        (cap +10)
 *   + (brain_nodes / 200)           (cap +5, bonus for large brain)
 *   Clamped to [0, 100].
 *
 * States:   READY (80-100) | NOMINAL (60-79) | DEGRADED (40-59) | CRITICAL (<40)
 *
 * Toggle:   ◈ JSRS  at left:6240, bottom:18, zIndex:68
 * Event:    jarvis:jsrs-toggle
 * Voice:    "readiness / readiness score / jsrs / operational readiness /
 *            jarvis readiness / system readiness / jarvis score / posture"
 * Refresh:  60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 6240;
const POLL_MS  = 60_000;
const CY       = "#29E7FF";
const GRN      = "#22c55e";
const AMB      = "#f59e0b";
const RED      = "#ef4444";
const PU       = "#a855f7";

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

const JSRS_RE =
  /\b(readiness\s+score|jsrs|operational\s+readiness|jarvis\s+readiness|system\s+readiness|jarvis\s+score|readiness\s+gauge|posture\s+score|jarvis\s+posture|situational\s+readiness)\b/i;

export function isJsrsQuery(q) { return JSRS_RE.test(q || ""); }

export async function buildJsrsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [brainRes, riskRes, taskRes, swarmRes, sysRes, anomRes] = await Promise.all([
      fetch(`${base}/v1/cinematic/brain`,              { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,             { headers: hdr }),
      fetch(`${base}/entities/Task`,                   { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,               { headers: hdr }),
      fetch(`${base}/v1/jarvis/system/status`,         { headers: hdr }),
      fetch(`${base}/v1/jarvis/analytics/anomalies`,   { headers: hdr }),
    ]);
    const brain = brainRes.ok ? await brainRes.json() : {};
    const riskRaw = riskRes.ok ? await riskRes.json() : [];
    const taskRaw = taskRes.ok ? await taskRes.json() : [];
    const swarmRaw = swarmRes.ok ? await swarmRes.json() : [];
    const sysRaw  = sysRes.ok  ? await sysRes.json()  : {};
    const anomRaw = anomRes.ok ? await anomRes.json() : [];

    const { score, state } = computeScore({ brain, riskRaw, taskRaw, swarmRaw, sysRaw, anomRaw });

    const risks = Array.isArray(riskRaw) ? riskRaw : (riskRaw.items || riskRaw.results || []);
    const crits = risks.filter(r => (r.severity || r.level || "").toUpperCase() === "CRITICAL").length;
    const highs = risks.filter(r => (r.severity || r.level || "").toUpperCase() === "HIGH").length;

    return (
      `JARVIS Situational Readiness: ${score}/100 — ${state}. ` +
      `${crits} critical and ${highs} high risk signals are active. ` +
      `${state === "READY" || state === "NOMINAL"
        ? "Operational posture is satisfactory."
        : "Posture requires immediate attention — review risk signals and anomalies."
      }`
    );
  } catch (e) {
    return `JSRS readiness check failed: ${e.message}`;
  }
}

// ── scoring logic ─────────────────────────────────────────────────────────────

function normalise(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

function computeScore({ brain, riskRaw, taskRaw, swarmRaw, sysRaw, anomRaw }) {
  const risks   = normalise(riskRaw);
  const tasks   = normalise(taskRaw);
  const swarms  = normalise(swarmRaw);
  const anoms   = normalise(anomRaw);

  const critRisks   = risks.filter(r => (r.severity || r.level || "").toUpperCase() === "CRITICAL").length;
  const highRisks   = risks.filter(r => (r.severity || r.level || "").toUpperCase() === "HIGH").length;
  const highAnoms   = anoms.filter(a => (a.severity || "").toUpperCase() === "HIGH").length;
  const medAnoms    = anoms.filter(a => (a.severity || "").toUpperCase() === "MEDIUM").length;

  // Degraded services from system status
  const services = sysRaw.services || sysRaw.checks || [];
  const degraded = Array.isArray(services)
    ? services.filter(s => s.status && !["ok","healthy","running"].includes((s.status || "").toLowerCase())).length
    : 0;

  const runningSwarms = swarms.filter(s => (s.status || "").toLowerCase() === "running").length;
  const nodes = brain.node_count || brain.nodes || brain.total_nodes || 0;

  let score = 100;
  score -= critRisks * 8;
  score -= highRisks * 4;
  score -= highAnoms * 3;
  score -= medAnoms  * 1;
  score -= degraded  * 5;
  score += Math.min(runningSwarms * 2, 10);
  score += Math.min(nodes / 200, 5);
  score = Math.round(Math.max(0, Math.min(100, score)));

  const state =
    score >= 80 ? "READY" :
    score >= 60 ? "NOMINAL" :
    score >= 40 ? "DEGRADED" :
    "CRITICAL";

  return {
    score,
    state,
    factors: {
      critRisks, highRisks, highAnoms, medAnoms, degraded, runningSwarms, nodes,
      totalRisks: risks.length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => !["done","completed","closed"].includes((t.status||"").toLowerCase())).length,
      totalAnoms: anoms.length,
    },
  };
}

// ── colours & labels ──────────────────────────────────────────────────────────

function stateColor(state) {
  switch (state) {
    case "READY":    return GRN;
    case "NOMINAL":  return CY;
    case "DEGRADED": return AMB;
    case "CRITICAL": return RED;
    default:         return CY;
  }
}

// ── main component ────────────────────────────────────────────────────────────

export default function JarvisReadinessScore() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [result,   setResult]   = useState(null);    // { score, state, factors }
  const [assessing, setAssessing] = useState(false);
  const [brief,    setBrief]    = useState("");
  const timerRef  = useRef(null);
  const pollRef   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [brainRes, riskRes, taskRes, swarmRes, sysRes, anomRes] = await Promise.all([
        fetch(`${base}/v1/cinematic/brain`,              { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,             { headers: hdr }),
        fetch(`${base}/entities/Task`,                   { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,               { headers: hdr }),
        fetch(`${base}/v1/jarvis/system/status`,         { headers: hdr }),
        fetch(`${base}/v1/jarvis/analytics/anomalies`,   { headers: hdr }),
      ]);
      const brain   = brainRes.ok ? await brainRes.json() : {};
      const riskRaw = riskRes.ok  ? await riskRes.json()  : [];
      const taskRaw = taskRes.ok  ? await taskRes.json()  : [];
      const swarmRaw= swarmRes.ok ? await swarmRes.json() : [];
      const sysRaw  = sysRes.ok   ? await sysRes.json()   : {};
      const anomRaw = anomRes.ok  ? await anomRes.json()  : [];
      setResult(computeScore({ brain, riskRaw, taskRaw, swarmRaw, sysRaw, anomRaw }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll on open
  useEffect(() => {
    if (!open) { clearInterval(pollRef.current); return; }
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  // External toggle event
  useEffect(() => {
    const h = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:jsrs-toggle", h);
    return () => window.removeEventListener("jarvis:jsrs-toggle", h);
  }, []);

  // Keyboard shortcut Ctrl+Shift+J
  useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "J") { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const assess = useCallback(async () => {
    if (!result) return;
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const { score, state, factors: f } = result;
      const prompt =
        `JARVIS readiness score is ${score}/100 (${state}). ` +
        `Active critical risks: ${f.critRisks}, high risks: ${f.highRisks}. ` +
        `Pending tasks: ${f.pendingTasks}/${f.totalTasks}. ` +
        `HIGH anomalies: ${f.highAnoms}, degraded services: ${f.degraded}, ` +
        `running swarm jobs: ${f.runningSwarms}, brain nodes: ${f.nodes}. ` +
        `Provide a 2-sentence operational readiness assessment.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d  = await r.json();
      const tx = d.response || d.message || d.content || JSON.stringify(d);
      setBrief(tx);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: tx } }));
    } catch (e) {
      setBrief(`Assessment failed: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [result]);

  // ── derived display ─────────────────────────────────────────────────────────
  const sc = result?.score ?? null;
  const state = result?.state ?? "";
  const f = result?.factors ?? {};
  const col = stateColor(state);
  const isCrit = state === "CRITICAL";

  const FACTORS = sc !== null ? [
    { label: "CRITICAL risks",   value: f.critRisks,    impact: `-${f.critRisks * 8} pts`,  neg: f.critRisks > 0 },
    { label: "HIGH risks",       value: f.highRisks,    impact: `-${f.highRisks * 4} pts`,  neg: f.highRisks > 0 },
    { label: "HIGH anomalies",   value: f.highAnoms,    impact: `-${f.highAnoms * 3} pts`,  neg: f.highAnoms > 0 },
    { label: "MEDIUM anomalies", value: f.medAnoms,     impact: `-${f.medAnoms} pts`,        neg: f.medAnoms > 0 },
    { label: "Degraded services",value: f.degraded,     impact: `-${f.degraded * 5} pts`,   neg: f.degraded > 0 },
    { label: "Running swarm jobs",value: f.runningSwarms,impact: `+${Math.min(f.runningSwarms*2,10)} pts`, neg: false },
    { label: "Brain nodes",      value: f.nodes,        impact: `+${Math.min(Math.round(f.nodes/200*10)/10,5)} pts`, neg: false },
    { label: "Total risk signals",value: f.totalRisks,  impact: "info", neg: false },
    { label: "Pending tasks",    value: f.pendingTasks, impact: "info", neg: false },
  ] : [];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 18,
          zIndex: 68,
          background: "rgba(0,0,0,0.75)",
          border: `1px solid ${isCrit ? RED : CY}`,
          color: isCrit ? RED : CY,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          gap: 6,
          animation: isCrit ? "jsrs-pulse 1s infinite" : "none",
        }}
      >
        {isCrit && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: RED,
            display: "inline-block",
            animation: "jsrs-pulse 1s infinite",
          }} />
        )}
        ◈ JSRS
        {sc !== null && (
          <span style={{
            background: col,
            color: "#000",
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 10,
            fontWeight: 700,
          }}>
            {sc}/100
          </span>
        )}
        <style>{`@keyframes jsrs-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      left: 12,
      bottom: 58,
      width: 440,
      maxHeight: "85vh",
      overflowY: "auto",
      zIndex: 69,
      background: "rgba(0,0,0,0.93)",
      border: `1px solid ${col}`,
      borderRadius: 10,
      fontFamily: "monospace",
      fontSize: 12,
      color: "#ccc",
      boxShadow: `0 0 24px ${col}33`,
    }}>
      <style>{`@keyframes jsrs-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${col}33`,
      }}>
        <span style={{ color: col, fontWeight: 700, fontSize: 13 }}>
          ◈ JARVIS SITUATIONAL READINESS SCORE
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 16 }}
        >✕</button>
      </div>

      {/* Score gauge */}
      {sc !== null && (
        <div style={{ padding: "14px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
            <div style={{
              fontSize: 48,
              fontWeight: 900,
              color: col,
              lineHeight: 1,
              textShadow: `0 0 20px ${col}`,
            }}>
              {sc}
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666" }}>/ 100</div>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: col,
                animation: isCrit ? "jsrs-pulse 1s infinite" : "none",
              }}>
                {state}
              </div>
            </div>
          </div>
          {/* Gauge bar */}
          <div style={{
            height: 8,
            background: "#1a1a1a",
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 4,
            border: `1px solid ${col}44`,
          }}>
            <div style={{
              height: "100%",
              width: `${sc}%`,
              background: `linear-gradient(90deg, ${col}88, ${col})`,
              borderRadius: 4,
              transition: "width 0.5s ease",
            }} />
          </div>
          {/* Threshold markers */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444", marginBottom: 12 }}>
            <span style={{ color: RED }}>CRITICAL &lt;40</span>
            <span style={{ color: AMB }}>DEGRADED 40</span>
            <span style={{ color: CY }}>NOMINAL 60</span>
            <span style={{ color: GRN }}>READY 80</span>
          </div>
        </div>
      )}

      {loading && !result && (
        <div style={{ padding: "20px", textAlign: "center", color: CY, fontSize: 11 }}>
          COMPUTING READINESS…
        </div>
      )}
      {error && (
        <div style={{ padding: "10px 14px", color: RED, fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* Factor breakdown */}
      {FACTORS.length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            Factor Breakdown
          </div>
          {FACTORS.map((f) => (
            <div key={f.label} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "3px 0",
              borderBottom: "1px solid #111",
            }}>
              <span style={{ color: "#999", flex: 1 }}>{f.label}</span>
              <span style={{
                color: f.neg ? RED : f.impact === "info" ? "#555" : GRN,
                marginLeft: 8,
                fontWeight: f.neg ? 700 : 400,
                minWidth: 60,
                textAlign: "right",
              }}>
                {f.value}
              </span>
              <span style={{
                color: f.neg ? RED : f.impact === "info" ? "#444" : GRN,
                marginLeft: 8,
                fontSize: 10,
                minWidth: 55,
                textAlign: "right",
              }}>
                {f.impact}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ASSESS button */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={assess}
          disabled={assessing || !result}
          style={{
            background: assessing ? "#111" : col,
            color: assessing ? col : "#000",
            border: `1px solid ${col}`,
            borderRadius: 4,
            padding: "4px 10px",
            cursor: assessing ? "default" : "pointer",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "monospace",
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: "none",
            color: "#666",
            border: "1px solid #333",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: loading ? "default" : "pointer",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {loading ? "…" : "↺"}
        </button>
        <span style={{ fontSize: 10, color: "#444", marginLeft: 4 }}>60 s auto-refresh</span>
      </div>

      {brief && (
        <div style={{
          margin: "0 14px 14px",
          padding: 10,
          background: "#0a0a0a",
          border: `1px solid ${col}44`,
          borderRadius: 6,
          color: "#ccc",
          fontSize: 11,
          lineHeight: 1.5,
        }}>
          {brief}
        </div>
      )}
    </div>
  );
}
