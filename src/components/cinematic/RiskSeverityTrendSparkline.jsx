/**
 * RiskSeverityTrendSparkline — F45 Risk Severity Trend Sparkline.
 *
 * Polls /entities/RiskSignal every 60 s, buckets by severity
 * (CRITICAL/HIGH/MEDIUM/LOW/INFO), and stores a rolling window of up to 30
 * readings (~30 minutes) in localStorage so the trend survives reloads.
 *
 * Displays a compact toolbar button showing the current CRITICAL count and a
 * sparkline; expanding reveals a stacked-bar history of the last 30 readings
 * with a stat row + spoken assessment via /v1/jarvis/agent/chat + TTS.
 *
 * Button: ◈ RTREND (bottom strip, left:660 bottom:18)
 * Endpoint: /entities/RiskSignal (+ /v1/jarvis/agent/chat for ASSESS)
 * Voice trigger: "risk trend" | "risk history" | "risk sparkline" | "rtrend" | "risk over time"
 * Event: jarvis:rtrend-toggle
 * Refresh: 60 s auto-poll (2 min max between reads survives sleep).
 *
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY   = "#29E7FF";
const RED  = "#FF3B6B";
const AMB  = "#F59E0B";
const YEL  = "#FDE047";
const BLU  = "#38BDF8";
const GRY  = "#6E8AA0";
const DIM  = "#4A6070";
const BG   = "rgba(5,10,18,0.96)";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const LS_KEY   = "jarvis.rtrend.history.v1";
const MAX_KEEP = 30;
const POLL_MS  = 60_000;
const BTN_LEFT = 660;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const VOICE_RE =
  /\b(risk\s*trend|risk\s*history|risk\s*sparkline|risk\s*over\s*time|risktrend|rtrend)\b/i;

export function isRtrendQuery(t) { return VOICE_RE.test(t || ""); }

export async function buildRtrendScript() {
  const history = loadHistory();
  const latest  = history[history.length - 1];
  if (!latest) {
    return (
      "JARVIS risk severity trend: no readings recorded yet. " +
      "Open the RTREND panel once so a baseline snapshot can be captured, sir."
    );
  }
  const first = history[0];
  const dCrit = latest.CRITICAL - first.CRITICAL;
  const dHigh = latest.HIGH     - first.HIGH;
  const trend =
    dCrit > 0 ? "CRITICAL count rising"
    : dCrit < 0 ? "CRITICAL count falling"
    : dHigh > 0 ? "HIGH count rising"
    : dHigh < 0 ? "HIGH count falling"
    : "levels flat";
  return (
    `Assess JARVIS risk-signal severity trend in 2 sentences. ` +
    `Window: ${history.length} readings over ${humanSpan(first.ts, latest.ts)}. ` +
    `Now: ${latest.CRITICAL} CRITICAL, ${latest.HIGH} HIGH, ${latest.MEDIUM} MEDIUM. ` +
    `Change since window start: ΔCRITICAL ${dCrit >= 0 ? "+" : ""}${dCrit}, ` +
    `ΔHIGH ${dHigh >= 0 ? "+" : ""}${dHigh} — ${trend}.`
  );
}

// ── history helpers ──────────────────────────────────────────────────────────

const SEVS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     AMB,
  MEDIUM:   YEL,
  LOW:      BLU,
  INFO:     GRY,
};

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveHistory(hist) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(hist)); } catch { /* quota */ }
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.results)        ? raw.results
    : Array.isArray(raw?.risk_signals)   ? raw.risk_signals
    : Array.isArray(raw?.signals)        ? raw.signals
    : raw && typeof raw === "object"     ? Object.values(raw)
    : [];
  return arr.filter((x) => x && typeof x === "object");
}

function severityOf(sig) {
  const raw = sig.severity || sig.level || sig.priority || sig.impact || "MEDIUM";
  const s = String(raw).toUpperCase().replace(/[^A-Z]/g, "");
  if (s.startsWith("CRIT")) return "CRITICAL";
  if (s.startsWith("HIGH") || s.startsWith("URG")) return "HIGH";
  if (s.startsWith("MED") || s.startsWith("MOD"))  return "MEDIUM";
  if (s.startsWith("LOW"))  return "LOW";
  if (s.startsWith("INFO") || s.startsWith("MIN")) return "INFO";
  return "MEDIUM";
}

function bucket(signals) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const s of signals) counts[severityOf(s)]++;
  return counts;
}

function humanSpan(fromTs, toTs) {
  const secs = Math.max(1, Math.round((toTs - fromTs) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h`;
}

function fmtClock(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

// ── sub-components ───────────────────────────────────────────────────────────

function Sparkline({ history, sev = "CRITICAL", width = 92, height = 16 }) {
  if (!history.length) return <span style={{ color: DIM, fontSize: 9 }}>—</span>;
  const values = history.map((h) => h[sev] || 0);
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const path = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <path d={path} stroke={SEV_COLOR[sev]} strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StackedHistoryBar({ history, width, height }) {
  if (!history.length) {
    return <div style={{ color: DIM, fontSize: 10, padding: "12px 4px" }}>No history captured yet.</div>;
  }
  const totals = history.map((h) => SEVS.reduce((a, s) => a + (h[s] || 0), 0));
  const max = Math.max(1, ...totals);
  const barW = Math.max(3, Math.floor(width / history.length) - 1);
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {history.map((h, i) => {
        const total = totals[i];
        const scale = total ? (height / max) : 0;
        let y = height;
        return (
          <g key={i} transform={`translate(${i * (barW + 1)},0)`}>
            {SEVS.map((sev) => {
              const v = h[sev] || 0;
              if (!v) return null;
              const bh = v * scale;
              y -= bh;
              return (
                <rect key={sev} x={0} y={y} width={barW} height={bh} fill={SEV_COLOR[sev]} opacity={0.85}>
                  <title>{`${fmtClock(h.ts)} · ${sev}: ${v}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function RiskSeverityTrendSparkline() {
  const [open, setOpen]         = useState(false);
  const [history, setHistory]   = useState(() => loadHistory());
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const raw = await r.json();
      const signals = normaliseSignals(raw);
      const counts = bucket(signals);
      const reading = { ts: Date.now(), total: signals.length, ...counts };
      setHistory((prev) => {
        const next = [...prev, reading].slice(-MAX_KEEP);
        saveHistory(next);
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // toggle listener — voice trigger or external event
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rtrend-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rtrend-toggle", onToggle);
  }, []);

  // background poll — always on so the trend accumulates whether panel is open or not
  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const latest = history[history.length - 1];
  const critNow = latest?.CRITICAL || 0;

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildRtrendScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || d.response || script).trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Unable to generate risk-trend assessment at this time, sir." },
      }));
    } finally {
      setAssessing(false);
    }
  }

  function clearHistory() {
    if (typeof window === "undefined") return;
    if (!window.confirm("Clear stored risk-severity history?")) return;
    saveHistory([]);
    setHistory([]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Risk Severity Trend"
        style={{
          position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: 65,
          background: "rgba(5,8,14,0.82)", border: `1px solid ${RED}66`,
          color: RED, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          backdropFilter: "blur(6px)",
        }}
      >
        <span>◈ RTREND</span>
        <Sparkline history={history} sev="CRITICAL" width={40} height={12} />
        {critNow > 0 && (
          <span style={{
            background: RED, color: "#0A0D14", borderRadius: 8,
            fontSize: 9, padding: "1px 5px", fontWeight: 700,
          }}>{critNow}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 60, left: BTN_LEFT - 260, zIndex: 65,
      width: 460, background: BG, border: `1px solid ${RED}55`, borderRadius: 10,
      display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${RED}22`, fontFamily: MONO, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderBottom: `1px solid ${RED}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ RISK SEVERITY TREND
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
          {loading ? "sampling…" : `${history.length}/${MAX_KEEP} readings`}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {/* current counts row */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        {SEVS.map((sev) => {
          const v = latest?.[sev] || 0;
          return (
            <div key={sev} style={{
              flex: "1 1 0", minWidth: 60,
              background: "rgba(0,0,0,0.3)",
              border: `1px solid ${SEV_COLOR[sev]}33`,
              borderRadius: 6, padding: "6px 4px", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: SEV_COLOR[sev], fontFamily: MONO }}>{v}</div>
              <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginTop: 2 }}>{sev}</div>
            </div>
          );
        })}
      </div>

      {/* stacked history */}
      <div style={{ padding: "6px 12px 4px", position: "relative" }}>
        <div style={{
          background: "rgba(0,0,0,0.35)", border: `1px solid rgba(255,255,255,0.05)`,
          borderRadius: 6, padding: "8px 8px 4px",
        }}>
          <StackedHistoryBar history={history} width={432} height={90} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 9, color: DIM }}>{history[0] ? fmtClock(history[0].ts) : "—"}</span>
            <span style={{ fontSize: 9, color: DIM }}>{latest ? fmtClock(latest.ts) : "—"}</span>
          </div>
        </div>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 10, padding: "4px 12px 8px", flexWrap: "wrap" }}>
        {SEVS.map((sev) => (
          <span key={sev} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: DIM }}>
            <span style={{
              width: 8, height: 8, background: SEV_COLOR[sev],
              display: "inline-block", borderRadius: 2,
            }} />
            {sev}
          </span>
        ))}
      </div>

      {error && (
        <div style={{ color: RED, fontSize: 10, padding: "0 12px 6px" }}>Error: {error}</div>
      )}

      {/* footer */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${RED}33`,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 8,
      }}>
        <button
          onClick={assess}
          disabled={assessing || history.length === 0}
          style={{
            background: assessing ? "rgba(0,0,0,0.4)" : `${RED}22`,
            border: `1px solid ${RED}66`, color: RED,
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 4, cursor: assessing ? "default" : "pointer",
          }}
        >
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
          auto-refresh 60 s
        </span>
        <button
          onClick={load}
          title="Sample now"
          style={{
            background: "none", border: `1px solid ${DIM}44`, color: DIM,
            fontFamily: MONO, fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
          }}
        >↺</button>
        <button
          onClick={clearHistory}
          title="Clear stored history"
          style={{
            background: "none", border: `1px solid ${DIM}44`, color: DIM,
            fontFamily: MONO, fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
          }}
        >⌫</button>
      </div>
    </div>
  );
}
