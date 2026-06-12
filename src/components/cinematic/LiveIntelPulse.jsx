/**
 * LiveIntelPulse — F58
 * Polls /functions/getLiveIntel every 2 minutes to compute a 0–100
 * "global activity pulse" from seismic intensity, crypto volatility,
 * and FX spread. Displays a pulsing score ring, breakdown tiles, and a
 * rolling 20-point history sparkline. AI commentary on demand.
 *
 * Toggle: ⚡ PULSE at left:4756 bottom strip.
 * Event:  jarvis:intel-pulse-toggle
 * Voice:  "JARVIS, pulse" | "global pulse" | "intel pulse" | "world activity"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#39FF14";
const AM  = "#F5A623";
const RD  = "#FF4444";
const PUR = "#b18cff";
const DIM = "#4A6070";
const BG  = "rgba(3,5,9,0.97)";
const POLL = 120_000; // 2 minutes
const HIST = 20;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const PULSE_RE =
  /\b(intel[\s-]?pulse|global[\s-]?pulse|world[\s-]?activ|activity[\s-]?pulse|pulse[\s-]?score|live[\s-]?pulse|world[\s-]?pulse|seismic[\s-]?pulse)\b/i;

export function isIntelPulseQuery(t) {
  return PULSE_RE.test(t || "");
}

function normArr(d, ...keys) {
  if (Array.isArray(d)) return d;
  for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
  return [];
}

async function fetchIntel() {
  const r = await fetch(`${apiBase()}/functions/getLiveIntel`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("Intel fetch failed");
  return r.json();
}

function computePulse(data) {
  // Seismic factor: count quakes with mag >= 4.0, weighted by magnitude
  const quakes = normArr(data?.earthquakes, "earthquakes", "features", "events");
  const seismicRaw = quakes.reduce((sum, q) => {
    const mag = parseFloat(q?.magnitude || q?.mag || q?.properties?.mag || 0);
    return sum + (mag >= 4.0 ? mag : 0);
  }, 0);
  const seismicScore = Math.min(100, Math.round((seismicRaw / 30) * 100));

  // Crypto factor: average absolute % change across coins
  const cryptos = normArr(data?.crypto, "crypto", "cryptocurrencies");
  let cryptoScore = 0;
  if (cryptos.length > 0) {
    const avgChange = cryptos.reduce((sum, c) => {
      const chg = Math.abs(parseFloat(c?.change_24h || c?.percent_change_24h || c?.change || 0));
      return sum + chg;
    }, 0) / cryptos.length;
    cryptoScore = Math.min(100, Math.round(avgChange * 5));
  }

  // FX factor: average absolute % deviation of exchange rates
  const fx = normArr(data?.fx, "fx", "forex", "currencies");
  let fxScore = 0;
  if (fx.length > 0) {
    const avgDev = fx.reduce((sum, f) => {
      const chg = Math.abs(parseFloat(f?.change || f?.change_24h || f?.deviation || 0));
      return sum + chg;
    }, 0) / fx.length;
    fxScore = Math.min(100, Math.round(avgDev * 10));
  }

  const pulse = Math.round((seismicScore * 0.45) + (cryptoScore * 0.35) + (fxScore * 0.20));
  return {
    pulse: Math.min(100, pulse),
    seismicScore,
    cryptoScore,
    fxScore,
    quakeCount: quakes.length,
    cryptoCount: cryptos.length,
    fxCount: fx.length,
    topQuake: quakes.slice().sort((a, b) =>
      parseFloat(b?.magnitude || b?.mag || b?.properties?.mag || 0) -
      parseFloat(a?.magnitude || a?.mag || a?.properties?.mag || 0)
    )[0] || null,
  };
}

export async function buildIntelPulseScript() {
  try {
    const data = await fetchIntel();
    const { pulse, seismicScore, cryptoScore, fxScore, quakeCount } = computePulse(data);
    const level = pulse >= 75 ? "ELEVATED" : pulse >= 50 ? "MODERATE" : "NOMINAL";
    return (
      `Global intelligence pulse is ${pulse} out of 100 — ${level}. ` +
      `Seismic activity index ${seismicScore}, ${quakeCount} seismic event${quakeCount !== 1 ? "s" : ""} tracked. ` +
      `Crypto volatility index ${cryptoScore}. Foreign exchange pressure index ${fxScore}, sir.`
    );
  } catch (_) {
    return "Unable to compute global pulse — intel feed unavailable, sir.";
  }
}

function pulseColor(score) {
  if (score >= 75) return RD;
  if (score >= 50) return AM;
  return GN;
}

function PulseRing({ score }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = pulseColor(score);
  return (
    <svg width={110} height={110} viewBox="0 0 110 110" style={{ display: "block" }}>
      <circle cx={55} cy={55} r={r} fill="none" stroke={`${color}15`} strokeWidth={8} />
      <circle
        cx={55} cy={55} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dasharray 1s ease, stroke 0.5s" }}
      />
      <text x={55} y={50} textAnchor="middle" fill={color}
        style={{ fontSize: 22, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>
        {score}
      </text>
      <text x={55} y={65} textAnchor="middle" fill={DIM}
        style={{ fontSize: 8, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>
        PULSE
      </text>
    </svg>
  );
}

function Sparkline({ history }) {
  if (history.length < 2) return null;
  const W = 460, H = 40;
  const max = Math.max(...history, 1);
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x},${y}`;
  }).join(" ");
  const color = pulseColor(history[history.length - 1]);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ display: "block", marginBottom: 6 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      <polyline
        points={`0,${H} ${pts} ${W},${H}`}
        fill={`${color}18`} stroke="none"
      />
    </svg>
  );
}

export default function LiveIntelPulse() {
  const [open, setOpen]         = useState(false);
  const [metrics, setMetrics]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [history, setHistory]   = useState([]);
  const [aiText, setAiText]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchIntel();
      const m = computePulse(data);
      setMetrics(m);
      setHistory(prev => [...prev.slice(-(HIST - 1)), m.pulse]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:intel-pulse-toggle", handler);
    return () => window.removeEventListener("jarvis:intel-pulse-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function runAiCommentary() {
    if (aiLoading || !metrics) return;
    setAiLoading(true); setAiText("");
    try {
      const { pulse, seismicScore, cryptoScore, fxScore, quakeCount } = metrics;
      const level = pulse >= 75 ? "ELEVATED" : pulse >= 50 ? "MODERATE" : "NOMINAL";
      const prompt =
        `You are JARVIS. Provide a 2-sentence British-butler intelligence briefing on current global activity.\n` +
        `Global pulse score: ${pulse}/100 (${level}).\n` +
        `Seismic index: ${seismicScore} (${quakeCount} events tracked). ` +
        `Crypto volatility index: ${cryptoScore}. FX pressure index: ${fxScore}.\n` +
        `Comment on what this indicates and what to watch.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiText(text || "Commentary unavailable.");
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAiText("Unable to reach reasoning core.");
    } finally {
      setAiLoading(false);
    }
  }

  const score = metrics?.pulse ?? 0;
  const color = pulseColor(score);

  const panelStyle = {
    position: "fixed",
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    width: 500,
    maxHeight: "calc(100vh - 100px)",
    background: BG,
    border: `1px solid ${color}33`,
    borderRadius: 10,
    zIndex: 72,
    display: "flex",
    flexDirection: "column",
    fontFamily: "'JetBrains Mono',monospace",
    boxShadow: `0 0 40px ${color}22`,
    overflow: "hidden",
  };

  return (
    <>
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${color}22`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
                ⚡ LIVE INTEL PULSE
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}
              >✕</button>
            </div>
            <div style={{ color: DIM, fontSize: 7, marginTop: 2, letterSpacing: 0.5 }}>
              /functions/getLiveIntel — seismic · crypto · fx · 2 min refresh
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 14px" }}>
            {loading && !metrics ? (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 20 }}>
                Computing global pulse…
              </div>
            ) : error ? (
              <div style={{ color: RD, fontSize: 9, padding: 8 }}>{error}</div>
            ) : metrics ? (
              <>
                {/* Ring + breakdown row */}
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
                  <PulseRing score={score} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { label: "SEISMIC",  value: metrics.seismicScore, sub: `${metrics.quakeCount} event${metrics.quakeCount !== 1 ? "s" : ""}`, weight: "45%" },
                      { label: "CRYPTO VOLATILITY", value: metrics.cryptoScore, sub: `${metrics.cryptoCount} coins`,  weight: "35%" },
                      { label: "FX PRESSURE",       value: metrics.fxScore,     sub: `${metrics.fxCount} pairs`,    weight: "20%" },
                    ].map(({ label, value, sub, weight }) => {
                      const c = pulseColor(value);
                      return (
                        <div key={label}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</span>
                            <span style={{ color: c, fontSize: 8, fontWeight: 700 }}>{value}</span>
                          </div>
                          <div style={{ height: 4, background: `${c}15`, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${value}%`,
                              background: c,
                              borderRadius: 2,
                              transition: "width 0.8s ease",
                            }} />
                          </div>
                          <div style={{ color: DIM, fontSize: 6, marginTop: 1, letterSpacing: 0.5 }}>
                            {sub} · weight {weight}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top quake */}
                {metrics.topQuake && (
                  <div style={{
                    background: `${AM}08`,
                    border: `1px solid ${AM}22`,
                    borderRadius: 6,
                    padding: "6px 10px",
                    marginBottom: 12,
                  }}>
                    <div style={{ color: AM, fontSize: 7, letterSpacing: 1, marginBottom: 2 }}>
                      STRONGEST SEISMIC EVENT
                    </div>
                    <div style={{ color: "#DCEBF5", fontSize: 8 }}>
                      {metrics.topQuake?.place || metrics.topQuake?.location || metrics.topQuake?.region ||
                        metrics.topQuake?.properties?.place || "Unknown location"} —{" "}
                      M{parseFloat(
                        metrics.topQuake?.magnitude || metrics.topQuake?.mag ||
                        metrics.topQuake?.properties?.mag || 0
                      ).toFixed(1)}
                    </div>
                  </div>
                )}

                {/* Sparkline history */}
                {history.length >= 2 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>
                      PULSE HISTORY ({history.length} readings)
                    </div>
                    <Sparkline history={history} />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: DIM, fontSize: 6 }}>oldest</span>
                      <span style={{ color: DIM, fontSize: 6 }}>latest</span>
                    </div>
                  </div>
                )}

                {/* AI commentary */}
                <div style={{
                  background: `${CY}08`,
                  border: `1px solid ${CY}22`,
                  borderRadius: 6,
                  padding: "8px 10px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ color: CY, fontSize: 7, letterSpacing: 1 }}>AI INTELLIGENCE COMMENTARY</span>
                    <button
                      onClick={runAiCommentary}
                      disabled={aiLoading}
                      style={{
                        background: `${CY}15`,
                        border: `1px solid ${CY}44`,
                        color: CY,
                        fontSize: 7,
                        padding: "2px 8px",
                        borderRadius: 4,
                        cursor: aiLoading ? "not-allowed" : "pointer",
                        letterSpacing: 1,
                        fontFamily: "inherit",
                        opacity: aiLoading ? 0.5 : 1,
                      }}
                    >
                      {aiLoading ? "CONSULTING…" : "BRIEF ME"}
                    </button>
                  </div>
                  {aiText ? (
                    <div style={{ fontSize: 9, color: "#DCEBF5", lineHeight: 1.7 }}>{aiText}</div>
                  ) : (
                    <div style={{ fontSize: 8, color: DIM, fontStyle: "italic" }}>
                      Click BRIEF ME for an AI global-activity intelligence brief.
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div style={{ padding: "4px 14px", borderTop: `1px solid ${color}11`, flexShrink: 0 }}>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
              /functions/getLiveIntel · /v1/jarvis/agent/chat — refreshes every 2 min
            </span>
          </div>
        </div>
      )}

      {/* Toggle — left:4756 bottom strip */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Live Intel Pulse"
        style={{
          position: "fixed",
          left: 4756,
          bottom: 18,
          zIndex: 68,
          background: open ? color : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : color,
          border: `1px solid ${color}`,
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 8,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 12px ${color}` : "none",
          animation: !open && score >= 75 ? "iplpulse 1.5s ease-in-out infinite" : "none",
        }}
      >
        ⚡ PULSE
        {score > 0 && (
          <span style={{
            marginLeft: 4,
            background: color,
            color: "#030509",
            borderRadius: 8,
            fontSize: 7,
            padding: "0 4px",
            fontWeight: 700,
          }}>
            {score}
          </span>
        )}
      </button>

      <style>{`
        @keyframes iplpulse {
          0%, 100% { box-shadow: 0 0 4px ${RD}; }
          50%       { box-shadow: 0 0 16px ${RD}; }
        }
      `}</style>
    </>
  );
}
