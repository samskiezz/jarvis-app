/**
 * F121 — Operational Readiness Score Dashboard (ORSCORE)
 *
 * Parallel-fetches:
 *   /v1/jarvis/system/status  → system health sub-score
 *   /v1/cinematic/brain       → intelligence density sub-score
 *   /entities/SwarmJob        → automation coverage sub-score
 *   /entities/Task            → task velocity sub-score
 *   /entities/RiskSignal      → threat exposure sub-score (inverse)
 *
 * Computes a composite JARVIS Operational Readiness Score (0–100) from five
 * equally-weighted sub-scores.  Displayed as a central score ring, five stat
 * tiles, an SVG radar pentagon, and a ▶ ASSESS → /v1/jarvis/agent/chat brief.
 *
 * 60-s auto-refresh.  jarvis:orscore-toggle event.
 * Voice: "orscore / operational readiness / readiness score / ops score / jarvis readiness".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_010_680;
const Z_INDEX  = 183;
const POLL_MS  = 60_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ORSCORE_RE =
  /\b(orscore|operational[\s-]readiness|readiness[\s-]score|ops[\s-]score|jarvis[\s-]readiness)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A855F7";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isOrscoreQuery(text) {
  return ORSCORE_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────
function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

/** Convert a 0–100 score to a colour (red → amber → green). */
function scoreColor(s) {
  if (s >= 75) return GR;
  if (s >= 45) return AM;
  return RD;
}

/** Build a regular pentagon path for the radar chart.
 *  cx/cy = centre, r = outer radius, scores = [0..1] × 5 axes (top, right, br, bl, left). */
function radarPath(cx, cy, r, scores) {
  const pts = scores.map((s, i) => {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const len = r * clamp(s, 0, 1);
    return [cx + len * Math.cos(angle), cy + len * Math.sin(angle)];
  });
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";
}

/** Pentagon grid outline at fraction t of max radius. */
function pentPath(cx, cy, r, t = 1) {
  return radarPath(cx, cy, r * t, [1, 1, 1, 1, 1]);
}

// ── async script builder (called by JarvisBrain for TTS) ─────────────────────
export async function buildOrscoreScript() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [sysR, brainR, swarmR, taskR, riskR] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/cinematic/brain`,       { headers }).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`,         { headers }).then(r => r.json()),
    fetch(`${base}/entities/Task`,             { headers }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`,       { headers }).then(r => r.json()),
  ]);

  const sys   = sysR.status   === "fulfilled" ? sysR.value   : null;
  const brain = brainR.status === "fulfilled" ? brainR.value : null;
  const swarm = swarmR.status === "fulfilled" ? swarmR.value : null;
  const tasks = taskR.status  === "fulfilled" ? taskR.value  : null;
  const risks = riskR.status  === "fulfilled" ? riskR.value  : null;

  const sysScore   = computeSysScore(sys);
  const brainScore = computeBrainScore(brain);
  const swarmScore = computeSwarmScore(swarm);
  const taskScore  = computeTaskScore(tasks);
  const riskScore  = computeRiskScore(risks);
  const overall    = Math.round((sysScore + brainScore + swarmScore + taskScore + riskScore) / 5);

  return `JARVIS Operational Readiness stands at ${overall} percent, sir. ` +
    `System health at ${sysScore}, intelligence density at ${brainScore}, ` +
    `automation coverage at ${swarmScore}, task velocity at ${taskScore}, ` +
    `threat exposure score at ${riskScore}.`;
}

// ── sub-score calculators ─────────────────────────────────────────────────────
function computeSysScore(sys) {
  if (!sys) return 50;
  // Count how many services show a healthy/running state
  const services = Object.values(sys.services || sys.components || {});
  if (!services.length) return 60;
  const healthy = services.filter(s => {
    const v = typeof s === "string" ? s : s?.status || s?.state || "";
    return /running|online|up|healthy|ok/i.test(String(v));
  }).length;
  return clamp(Math.round((healthy / services.length) * 100));
}

function computeBrainScore(brain) {
  if (!brain) return 50;
  const nodes    = brain.nodes     || brain.node_count     || brain.total_nodes    || 0;
  const synapses = brain.synapses  || brain.synapse_count  || brain.total_synapses || 0;
  // Density: ratio synapses/nodes normalised; clamp to 100
  if (!nodes) return 50;
  const density = Math.min(1, synapses / Math.max(nodes, 1) / 4); // 4 synapses/node → 100
  return clamp(Math.round(density * 100));
}

function computeSwarmScore(raw) {
  const jobs = norm(raw, ["data", "jobs", "items", "results"]);
  if (!jobs.length) return 50;
  const running = jobs.filter(j => /running|active|executing|in.?progress/i.test(String(j.status || ""))).length;
  return clamp(Math.round((running / jobs.length) * 100));
}

function computeTaskScore(raw) {
  const tasks = norm(raw, ["data", "tasks", "items", "results"]);
  if (!tasks.length) return 50;
  const complete = tasks.filter(t => /done|complete|finished|closed/i.test(String(t.status || ""))).length;
  return clamp(Math.round((complete / tasks.length) * 100));
}

function computeRiskScore(raw) {
  // Inverse of threat exposure: no critical risks → 100, many criticals → 0
  const signals = norm(raw, ["data", "signals", "items", "results"]);
  if (!signals.length) return 90;
  const crits  = signals.filter(s => /critical/i.test(String(s.severity || s.level || ""))).length;
  const highs  = signals.filter(s => /high/i.test(String(s.severity || s.level || ""))).length;
  const weight = (crits * 3 + highs) / signals.length;
  return clamp(Math.round((1 - Math.min(1, weight / 3)) * 100));
}

// ── component ─────────────────────────────────────────────────────────────────
function OperationalReadinessScore() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [scores, setScores]     = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    const base = apiBase();
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const [sysR, brainR, swarmR, taskR, riskR] = await Promise.allSettled([
      fetch(`${base}/v1/jarvis/system/status`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/cinematic/brain`,       { headers }).then(r => r.json()),
      fetch(`${base}/entities/SwarmJob`,         { headers }).then(r => r.json()),
      fetch(`${base}/entities/Task`,             { headers }).then(r => r.json()),
      fetch(`${base}/entities/RiskSignal`,       { headers }).then(r => r.json()),
    ]);
    const sys   = sysR.status   === "fulfilled" ? sysR.value   : null;
    const brain = brainR.status === "fulfilled" ? brainR.value : null;
    const swarm = swarmR.status === "fulfilled" ? swarmR.value : null;
    const tasks = taskR.status  === "fulfilled" ? taskR.value  : null;
    const risks = riskR.status  === "fulfilled" ? riskR.value  : null;

    const sys_s   = computeSysScore(sys);
    const brain_s = computeBrainScore(brain);
    const swarm_s = computeSwarmScore(swarm);
    const task_s  = computeTaskScore(tasks);
    const risk_s  = computeRiskScore(risks);
    const overall = Math.round((sys_s + brain_s + swarm_s + task_s + risk_s) / 5);

    setScores({ sys_s, brain_s, swarm_s, task_s, risk_s, overall });
    setLoading(false);
  }, [open]);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, POLL_MS);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:orscore-toggle", handler);
    return () => window.removeEventListener("jarvis:orscore-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const headers = { "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const ctx = scores
        ? `System: ${scores.sys_s}%, Brain: ${scores.brain_s}%, Swarm: ${scores.swarm_s}%, Tasks: ${scores.task_s}%, Risk: ${scores.risk_s}%. Overall readiness: ${scores.overall}%.`
        : "No data yet.";
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message:
          `You are JARVIS. Assess this operational readiness snapshot in exactly 2 sentences. Focus on the weakest dimension and the recommended priority action. ${ctx}` }),
      });
      const data = await res.json();
      setBrief(data.response || data.message || data.reply || data.content || "Assessment complete.");
    } catch { setBrief("Readiness assessment unavailable — check agent endpoint."); }
    setAssessing(false);
  }, [assessing, scores]);

  if (!open) {
    const badge = scores && scores.overall < 60 ? scores.overall : null;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Operational Readiness Score (ORSCORE)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: FONT, fontSize: 9, padding: "4px 10px",
          borderRadius: 4, cursor: "pointer", letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        ◈ ORSCORE
        {badge !== null && (
          <span style={{
            background: scoreColor(badge), color: "#000", fontWeight: 700,
            fontSize: 8, borderRadius: 3, padding: "1px 5px",
          }}>{badge}</span>
        )}
      </button>
    );
  }

  const DIMS = [
    { key: "sys_s",   label: "SYS HEALTH",  color: GR },
    { key: "brain_s", label: "INTEL DEPTH",  color: CY },
    { key: "swarm_s", label: "AUTOMATION",   color: PU },
    { key: "task_s",  label: "TASKS DONE",   color: AM },
    { key: "risk_s",  label: "THREAT CLEAR", color: RD },
  ];

  const s = scores;
  const overall = s ? s.overall : null;
  const ringColor = s ? scoreColor(s.overall) : CY;

  const CX = 80, CY_R = 80, R = 65;
  const radarScores = DIMS.map(d => s ? (s[d.key] || 0) / 100 : 0);

  return (
    <div style={{
      position: "fixed", bottom: 54, right: 18, zIndex: Z_INDEX + 1,
      width: 540, maxHeight: "82vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
      fontFamily: FONT, color: "#DCEBF5", boxShadow: `0 0 32px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: CY, letterSpacing: 2 }}>
          ◈ OPERATIONAL READINESS SCORE
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={fetchData} disabled={loading} style={{
            background: "none", border: `1px solid ${CY}55`, color: CY,
            fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3,
            cursor: loading ? "wait" : "pointer",
          }}>{loading ? "…" : "↺"}</button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#6E8AA0",
            fontFamily: FONT, fontSize: 14, cursor: "pointer",
          }}>✕</button>
        </div>
      </div>

      {/* body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "16px 18px" }}>
        {loading && !s ? (
          <div style={{ textAlign: "center", color: "#6E8AA0", padding: 40 }}>
            Calculating readiness…
          </div>
        ) : s ? (
          <>
            {/* score + radar row */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
              {/* central ring */}
              <div style={{ flexShrink: 0, position: "relative", width: 90, height: 90 }}>
                <svg width={90} height={90}>
                  {/* bg ring */}
                  <circle cx={45} cy={45} r={38}
                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
                  {/* progress arc */}
                  <circle cx={45} cy={45} r={38}
                    fill="none" stroke={ringColor} strokeWidth={10}
                    strokeDasharray={`${2 * Math.PI * 38 * (overall / 100)} ${2 * Math.PI * 38}`}
                    strokeLinecap="round"
                    transform="rotate(-90 45 45)"
                    style={{ transition: "stroke-dasharray 0.6s ease" }}
                  />
                  <text x={45} y={50} textAnchor="middle"
                    style={{ fill: ringColor, fontSize: 18, fontFamily: FONT, fontWeight: 700 }}>
                    {overall}
                  </text>
                </svg>
                <div style={{ textAlign: "center", fontSize: 8, color: "#6E8AA0", marginTop: 2 }}>
                  READINESS %
                </div>
              </div>

              {/* radar pentagon */}
              <div style={{ flexShrink: 0 }}>
                <svg width={160} height={160}>
                  {/* grid */}
                  {[0.25, 0.5, 0.75, 1].map(t => (
                    <path key={t} d={pentPath(80, 80, R, t)}
                      fill="none" stroke="rgba(0,207,255,0.12)" strokeWidth={0.5} />
                  ))}
                  {/* axis lines */}
                  {[0,1,2,3,4].map(i => {
                    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
                    return <line key={i}
                      x1={80} y1={80}
                      x2={80 + R * Math.cos(angle)}
                      y2={80 + R * Math.sin(angle)}
                      stroke="rgba(0,207,255,0.15)" strokeWidth={0.5}
                    />;
                  })}
                  {/* data polygon */}
                  <path d={radarPath(80, 80, R, radarScores)}
                    fill={`${CY}22`} stroke={CY} strokeWidth={1.5} />
                  {/* axis labels */}
                  {DIMS.map((d, i) => {
                    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
                    const lx = 80 + (R + 12) * Math.cos(angle);
                    const ly = 80 + (R + 12) * Math.sin(angle);
                    return (
                      <text key={i} x={lx} y={ly}
                        textAnchor="middle" dominantBaseline="middle"
                        style={{ fill: d.color, fontSize: 7, fontFamily: FONT, fontWeight: 600 }}>
                        {d.label.split(" ")[0]}
                      </text>
                    );
                  })}
                </svg>
              </div>

              {/* dimension tiles */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {DIMS.map(d => (
                  <div key={d.key} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${d.color}22`,
                    borderRadius: 5, padding: "5px 10px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ fontSize: 9, color: "#9CB0C0", letterSpacing: 1 }}>
                      {d.label}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: d.color, minWidth: 36, textAlign: "right",
                    }}>
                      {s[d.key]}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* score bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between",
                fontSize: 9, color: "#6E8AA0", marginBottom: 4 }}>
                <span>COMPOSITE READINESS</span>
                <span style={{ color: ringColor, fontWeight: 700 }}>{overall}%</span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                <div style={{
                  width: `${overall}%`, height: "100%", borderRadius: 3,
                  background: `linear-gradient(90deg, ${scoreColor(0)}, ${ringColor})`,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>

            {/* assess */}
            <div>
              <button onClick={assess} disabled={assessing} style={{
                background: assessing ? "rgba(0,207,255,0.08)" : `${CY}22`,
                border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 10,
                padding: "6px 14px", borderRadius: 5, cursor: assessing ? "wait" : "pointer",
                letterSpacing: 1,
              }}>
                {assessing ? "ASSESSING…" : "▶ ASSESS READINESS"}
              </button>
              {brief && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.6,
                  borderLeft: `2px solid ${CY}44`, paddingLeft: 10 }}>
                  {brief}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", color: RD, fontSize: 11, padding: 32 }}>
            Unable to compute readiness — check backend connectivity.
          </div>
        )}
      </div>

      <style>{`
        @keyframes orscore-pulse {
          0%,100%{ box-shadow: 0 0 0 0 rgba(0,207,255,0.4); }
          50%{ box-shadow: 0 0 0 8px rgba(0,207,255,0); }
        }
      `}</style>
    </div>
  );
}

export default OperationalReadinessScore;
