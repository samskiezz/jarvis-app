/**
 * OpsTempoIndex — F98
 *
 * Composite multi-source operational tempo score (0–100).
 *
 * Polls three real endpoints in parallel every 45 s:
 *   • /v1/ops/events       → live operational event count  (40 % weight)
 *   • /entities/RiskSignal → active risk signal count      (35 % weight)
 *   • /entities/SwarmJob   → running swarm job count       (25 % weight)
 *
 * Normalises each raw count against a rolling historical maximum stored in
 * localStorage (max 20 readings per source), then blends them into a single
 * 0–100 TEMPO score.
 *
 * Classifications:
 *   SURGE    ≥ 75  (red)
 *   ELEVATED 50–74 (amber)
 *   NOMINAL  25–49 (cyan)
 *   QUIET    < 25  (green)
 *
 * Panel shows:
 *   • Big score gauge with colour-coded ring arc
 *   • Three sub-metric contribution bars (ops / risk / swarm)
 *   • SVG sparkline (last 20 readings)
 *   • Stat tiles: score / ops / risks / swarms / refreshed
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + jarvis:speak-dossier TTS
 *
 * Auto-announces SURGE (≥75) at most once per 5 minutes.
 *
 * Toggle: ◈ TEMPO button at left:32920, bottom:8, zIndex:98.
 * Exports isOpsTempoQuery + buildOpsTempoScript for JarvisBrain wiring.
 * Event: jarvis:ops-tempo-toggle.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY     = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const CY          = "#29E7FF";
const AMBER       = "#F5A623";
const GREEN       = "#00c878";
const RED         = "#e8203c";
const MONO        = "'JetBrains Mono',monospace";
const POLL_MS     = 45_000;
const MAX_HISTORY = 20;
const LS_KEY      = "jarvis_ops_tempo_history";

// weights
const W_OPS   = 0.40;
const W_RISK  = 0.35;
const W_SWARM = 0.25;

// ── Intent helpers ────────────────────────────────────────────────────────────
export function isOpsTempoQuery(q) {
  return /\b(ops\s*tempo|tempo\s*index|activity\s*tempo|operational\s*tempo|opstempo)\b/i.test(q);
}

export async function buildOpsTempoScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [opsR, rskR, swmR] = await Promise.all([
      fetch(`${base}/v1/ops/events`, { headers: hdrs }).then((r) => r.json()),
      fetch(`${base}/entities/RiskSignal`, { headers: hdrs }).then((r) => r.json()),
      fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then((r) => r.json()),
    ]);
    const ops   = (Array.isArray(opsR) ? opsR : opsR?.data ?? []).length;
    const risks = (Array.isArray(rskR) ? rskR : rskR?.data ?? []).length;
    const swarm = (Array.isArray(swmR) ? swmR : swmR?.data ?? []).length;
    return `Ops Tempo snapshot, sir: ${ops} active events, ${risks} risk signals, ${swarm} swarm jobs in play. I am tracking the composite tempo index continuously — I will alert you the moment it surges.`;
  } catch (_) {
    return "Ops Tempo Index is online, sir. I am continuously monitoring operational events, risk signals, and swarm activity for a combined tempo reading.";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function tempoClass(score) {
  if (score >= 75) return { label: "SURGE",    color: RED   };
  if (score >= 50) return { label: "ELEVATED", color: AMBER };
  if (score >= 25) return { label: "NOMINAL",  color: CY    };
  return                   { label: "QUIET",   color: GREEN };
}

function safeArray(d) {
  return Array.isArray(d) ? d : (d?.data ?? d?.results ?? d?.items ?? []);
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveHistory(h) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
  } catch (_) {}
}

function computeScore(ops, risk, swarm, history) {
  // Normalise each count against the rolling max in history
  const opsVals   = history.map((h) => h.ops);
  const riskVals  = history.map((h) => h.risk);
  const swarmVals = history.map((h) => h.swarm);
  const maxOps    = Math.max(...opsVals, ops,   1);
  const maxRisk   = Math.max(...riskVals, risk,  1);
  const maxSwarm  = Math.max(...swarmVals, swarm, 1);
  const nOps   = ops   / maxOps;
  const nRisk  = risk  / maxRisk;
  const nSwarm = swarm / maxSwarm;
  return Math.round((nOps * W_OPS + nRisk * W_RISK + nSwarm * W_SWARM) * 100);
}

// Tiny SVG arc helper (cx, cy, r, fraction 0-1 → "M ... A ...")
function arcPath(cx, cy, r, frac) {
  if (frac >= 1) frac = 0.9999;
  const angle = frac * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const large = frac > 0.5 ? 1 : 0;
  const sx = cx;
  const sy = cy - r;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${x} ${y}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function OpsTempoIndex() {
  const [visible,   setVisible]   = useState(false);
  const [history,   setHistory]   = useState(() => loadHistory());
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState(null);
  const surgeAt  = useRef(0);
  const timerRef = useRef(null);

  const latest  = history[history.length - 1] ?? null;
  const score   = latest?.score ?? 0;
  const { label: cls, color: clsColor } = tempoClass(score);

  const poll = useCallback(async () => {
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [opsR, rskR, swmR] = await Promise.all([
        fetch(`${base}/v1/ops/events`,       { headers: hdrs }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: hdrs }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/SwarmJob`,   { headers: hdrs }).then((r) => r.json()).catch(() => []),
      ]);
      const ops   = safeArray(opsR).length;
      const risk  = safeArray(rskR).length;
      const swarm = safeArray(swmR).length;

      setHistory((prev) => {
        const sc   = computeScore(ops, risk, swarm, prev);
        const next = [...prev, { ts: Date.now(), ops, risk, swarm, score: sc }].slice(-MAX_HISTORY);
        saveHistory(next);

        // Surge auto-announce
        if (sc >= 75 && Date.now() - surgeAt.current > 5 * 60_000) {
          surgeAt.current = Date.now();
          window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
            detail: {
              text: `Sir, operational tempo has surged to ${sc} — a composite reading of ${ops} events, ${risk} risk signals, and ${swarm} swarm jobs.`,
            },
          }));
        }
        return next;
      });
      setError(null);
    } catch (e) {
      setError(String(e?.message ?? "Unreachable"));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    poll().finally(() => setLoading(false));
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [poll]);

  useEffect(() => {
    const h = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ops-tempo-toggle", h);
    return () => window.removeEventListener("jarvis:ops-tempo-toggle", h);
  }, []);

  const handleAssess = useCallback(async () => {
    if (assessing || !latest) return;
    setAssessing(true);
    setBrief(null);
    try {
      const base = apiBase();
      const ctx  = `Ops Tempo Index is ${latest.score}/100 (${cls}). Sources: ${latest.ops} ops events (40 % weight), ${latest.risk} risk signals (35 % weight), ${latest.swarm} swarm jobs (25 % weight). Classify the situation and suggest the single most important action.`;
      const r    = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: ctx }),
      });
      const d    = await r.json();
      const text = d?.response ?? d?.message ?? d?.content ?? d?.text ?? "Assessment unavailable.";
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setBrief("Assessment unavailable — agent unreachable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, latest, cls]);

  const minScore  = history.length ? Math.min(...history.map((h) => h.score)) : 0;
  const maxScore  = history.length ? Math.max(...history.map((h) => h.score), 1) : 1;
  const lastTs    = latest
    ? new Date(latest.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  // Arc gauge
  const GAUGE_R  = 38;
  const GAUGE_CX = 50;
  const GAUGE_CY = 50;
  const arcFrac  = score / 100;

  return (
    <>
      {/* ── Toggle button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops Tempo Index — composite multi-source activity score"
        style={{
          position: "fixed", bottom: 8, left: 32920, zIndex: 98,
          background: visible ? clsColor : "rgba(5,8,13,0.72)",
          border:     `1px solid ${clsColor}55`,
          color:      visible ? "#04060A" : clsColor,
          borderRadius: 4, padding: "2px 7px",
          fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, cursor: "pointer",
          boxShadow: score >= 50 ? `0 0 12px ${clsColor}88` : "none",
          animation: score >= 75 ? "oti-pulse 1s ease-in-out infinite" : "none",
        }}
      >
        ◈ TEMPO
        {score >= 25 && (
          <span style={{
            marginLeft: 4, background: clsColor, color: "#04060A",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {score}
          </span>
        )}
      </button>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      {visible && (
        <div style={{
          position: "fixed", bottom: 36, left: 32800, zIndex: 103,
          width: 360, background: "rgba(4,9,16,0.94)",
          border:    `1px solid ${clsColor}44`,
          borderTop: `2px solid ${clsColor}`,
          borderRadius: 10, padding: "12px 14px",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 40px ${clsColor}1a`,
          fontFamily: MONO, color: "#c8dde8",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: clsColor, fontSize: 13 }}>◈</span>
            <span style={{ color: clsColor, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              OPS TEMPO INDEX
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
              color: clsColor, background: `${clsColor}1a`,
              borderRadius: 4, padding: "1px 6px", border: `1px solid ${clsColor}44`,
            }}>
              {cls}
            </span>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "none", border: "none", color: "#4a6070", cursor: "pointer", fontSize: 12 }}
            >
              ✕
            </button>
          </div>

          {loading && !history.length ? (
            <div style={{ color: "#4a6070", fontSize: 10, letterSpacing: 1, padding: "20px 0" }}>
              LOADING…
            </div>
          ) : error ? (
            <div style={{ color: RED, fontSize: 10, letterSpacing: 1 }}>{error}</div>
          ) : (
            <>
              {/* Gauge + stats row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                {/* SVG Arc gauge */}
                <svg width={100} height={100} viewBox="0 0 100 100">
                  {/* Background track */}
                  <circle cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R}
                    fill="none" stroke="rgba(41,231,255,0.08)" strokeWidth={8} />
                  {/* Score arc */}
                  {arcFrac > 0 && (
                    <path
                      d={arcPath(GAUGE_CX, GAUGE_CY, GAUGE_R, arcFrac)}
                      fill="none" stroke={clsColor} strokeWidth={8}
                      strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 6px ${clsColor}88)` }}
                    />
                  )}
                  {/* Score text */}
                  <text x={GAUGE_CX} y={GAUGE_CY + 5}
                    textAnchor="middle" fontSize={22} fontWeight={700}
                    fill={clsColor} fontFamily="'JetBrains Mono',monospace">
                    {score}
                  </text>
                  <text x={GAUGE_CX} y={GAUGE_CY + 18}
                    textAnchor="middle" fontSize={7} fill="#4a6070"
                    fontFamily="'JetBrains Mono',monospace">
                    /100
                  </text>
                </svg>

                {/* Sub-metric contribution bars */}
                <div style={{ flex: 1 }}>
                  {[
                    { label: "OPS EVENTS",   value: latest?.ops   ?? 0, norm: latest ? (latest.ops   / (maxScore || 1)) : 0, color: RED,   weight: "40%" },
                    { label: "RISK SIGNALS", value: latest?.risk  ?? 0, norm: latest ? (latest.risk  / (maxScore || 1)) : 0, color: AMBER, weight: "35%" },
                    { label: "SWARM JOBS",   value: latest?.swarm ?? 0, norm: latest ? (latest.swarm / (maxScore || 1)) : 0, color: CY,    weight: "25%" },
                  ].map(({ label, value, color, weight }) => (
                    <div key={label} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#5a7080", marginBottom: 2 }}>
                        <span>{label}</span>
                        <span style={{ color }}>{value} <span style={{ color: "#3a5060" }}>({weight})</span></span>
                      </div>
                      <div style={{ height: 4, background: "rgba(41,231,255,0.08)", borderRadius: 2 }}>
                        <div style={{
                          height: "100%", width: `${Math.min(100, value * 3)}%`,
                          background: color, borderRadius: 2,
                          transition: "width 0.5s ease",
                          boxShadow: `0 0 4px ${color}66`,
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sparkline */}
              {history.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 8, color: "#4a6070", letterSpacing: 1, marginBottom: 4 }}>
                    SCORE HISTORY ({history.length} READINGS)
                  </div>
                  <svg width="100%" height={36} viewBox={`0 0 ${MAX_HISTORY} 36`}
                    preserveAspectRatio="none" style={{ display: "block" }}>
                    {history.map((h, i) => {
                      const barH = Math.max(2, Math.round((h.score / 100) * 32));
                      const { color: barColor } = tempoClass(h.score);
                      const isLast = i === history.length - 1;
                      return (
                        <rect
                          key={i}
                          x={i} y={36 - barH} width={0.8} height={barH}
                          fill={isLast ? barColor : `${barColor}66`}
                        />
                      );
                    })}
                    {/* Pad empty slots */}
                    {Array.from({ length: MAX_HISTORY - history.length }).map((_, i) => (
                      <rect
                        key={`p${i}`}
                        x={history.length + i} y={34} width={0.8} height={2}
                        fill="rgba(41,231,255,0.1)"
                      />
                    ))}
                  </svg>
                </div>
              )}

              {/* Stat row */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4,1fr)",
                gap: 6, borderTop: "1px solid rgba(41,231,255,0.1)", paddingTop: 8,
                marginBottom: 10,
              }}>
                {[
                  { label: "SCORE",   value: score,            color: clsColor },
                  { label: "RANGE",   value: `${minScore}–${maxScore}`, color: CY },
                  { label: "SAMPLES", value: history.length,   color: "#4a6070" },
                  { label: "UPDATED", value: lastTs,           color: "#4a6070", small: true },
                ].map(({ label, value, color, small }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: small ? 8 : 14, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: 7, color: "#3a5060", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Assess button */}
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  width: "100%", padding: "5px 0",
                  background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.08)",
                  border: `1px solid ${CY}44`, borderRadius: 5,
                  color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5,
                  cursor: assessing ? "default" : "pointer",
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ ASSESS TEMPO"}
              </button>

              {brief && (
                <div style={{
                  marginTop: 8, fontSize: 9, color: "#8ab0c0", lineHeight: 1.6,
                  borderTop: "1px solid rgba(41,231,255,0.08)", paddingTop: 8,
                }}>
                  {brief}
                </div>
              )}

              <div style={{
                marginTop: 8, fontSize: 8, color: "#3a5060", letterSpacing: 0.5,
                borderTop: "1px solid rgba(41,231,255,0.06)", paddingTop: 6,
              }}>
                POLLS /v1/ops/events + /entities/RiskSignal + /entities/SwarmJob every 45 s
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes oti-pulse {
          0%,100% { box-shadow: 0 0 12px ${RED}88; }
          50%      { box-shadow: 0 0 28px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
