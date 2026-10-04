/**
 * OperationalPulseRing — F166 (overnight 2026-09-13)
 *
 * Ambient 56×56 SVG health ring fixed at bottom-right corner.
 * No panel — pure persistent visual indicator.
 *
 * Outer arc = system health  ( 100 − cpu_percent, clamped 0–100 )
 * Inner arc = risk health    ( 100 − critical×15 − high×8, clamped 0–100 )
 * Overall score = mean of both arcs.
 *
 * Colour:  green ≥75 | amber 40–74 | red <40
 *
 * Endpoints used:
 *   /v1/jarvis/system/status  →  cpu_percent / cpu
 *   /entities/RiskSignal      →  severity/level field
 *
 * Dismissed via localStorage key jarvis_pulse_hidden=1.
 * Voice trigger:  "pulse ring" / "health ring" / "operational ring"
 * Event in: jarvis:pulse-show / jarvis:pulse-hide
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const POLL_MS   = 45_000;
const LS_KEY    = "jarvis_pulse_hidden";
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function clamp(v, lo = 0, hi = 100) { return Math.min(hi, Math.max(lo, v)); }

function scoreColor(s) {
  if (s >= 75) return "#00E5A0";   // green
  if (s >= 40) return "#F5A623";   // amber
  return "#FF3D5A";                 // red
}

/** Convert a 0-100 score to an SVG arc path on a circle of radius r at cx,cy. */
function arcPath(cx, cy, r, score) {
  const pct   = clamp(score) / 100;
  const start = -Math.PI / 2;                   // 12-o'clock
  const end   = start + 2 * Math.PI * pct;
  const x1    = cx + r * Math.cos(start);
  const y1    = cy + r * Math.sin(start);
  const x2    = cx + r * Math.cos(end);
  const y2    = cy + r * Math.sin(end);
  const large = pct > 0.5 ? 1 : 0;
  if (pct >= 1) {
    // Full circle — use two 180° arcs
    return `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
  }
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

async function fetchScores() {
  const hdrs = { Authorization: `Bearer ${API_KEY}` };
  let sysSc = 80;
  let riskSc = 80;

  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers: hdrs });
    if (r.ok) {
      const d = await r.json();
      const cpu = d?.cpu_percent ?? d?.cpu ?? d?.system?.cpu_percent ?? 20;
      sysSc = clamp(100 - Math.round(cpu));
    }
  } catch (_) {}

  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
    if (r.ok) {
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      const crit = arr.filter(x => (x.severity || x.level || "").toLowerCase() === "critical").length;
      const high = arr.filter(x => (x.severity || x.level || "").toLowerCase() === "high").length;
      riskSc = clamp(100 - crit * 15 - high * 8);
    }
  } catch (_) {}

  return { sysSc, riskSc, overall: Math.round((sysSc + riskSc) / 2) };
}

export default function OperationalPulseRing() {
  const [hidden,  setHidden]  = useState(() => localStorage.getItem(LS_KEY) === "1");
  const [scores,  setScores]  = useState({ sysSc: 80, riskSc: 80, overall: 80 });
  const [tooltip, setTooltip] = useState(false);
  const timer = useRef(null);

  const refresh = useCallback(() => {
    fetchScores().then(setScores).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer.current);
  }, [refresh]);

  useEffect(() => {
    const show = () => { localStorage.removeItem(LS_KEY); setHidden(false); };
    const hide = () => { localStorage.setItem(LS_KEY, "1"); setHidden(true); };
    window.addEventListener("jarvis:pulse-show", show);
    window.addEventListener("jarvis:pulse-hide", hide);
    return () => {
      window.removeEventListener("jarvis:pulse-show", show);
      window.removeEventListener("jarvis:pulse-hide", hide);
    };
  }, []);

  if (hidden) return null;

  const { sysSc, riskSc, overall } = scores;
  const outerColor = scoreColor(sysSc);
  const innerColor = scoreColor(riskSc);
  const CX = 28; const CY = 28;
  const R_OUTER = 22; const R_INNER = 14;
  const STROKE = 4;

  return (
    <div
      style={{
        position:   "fixed",
        bottom:     70,
        right:      12,
        zIndex:     9990,
        cursor:     "pointer",
        userSelect: "none",
      }}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
      onClick={() => window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: "system health score" } }))}
      title={`Sys: ${sysSc}%  Risk: ${riskSc}%  Overall: ${overall}/100`}
    >
      {/* SVG Ring */}
      <svg width={56} height={56} viewBox="0 0 56 56" style={{ display: "block" }}>
        {/* Track circles */}
        <circle cx={CX} cy={CY} r={R_OUTER} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
        <circle cx={CX} cy={CY} r={R_INNER} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
        {/* Outer arc — system health */}
        <path
          d={arcPath(CX, CY, R_OUTER, sysSc)}
          fill="none"
          stroke={outerColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${outerColor})` }}
        />
        {/* Inner arc — risk health */}
        <path
          d={arcPath(CX, CY, R_INNER, riskSc)}
          fill="none"
          stroke={innerColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${innerColor})` }}
        />
        {/* Overall score text */}
        <text
          x={CX} y={CY + 4}
          textAnchor="middle"
          fill={scoreColor(overall)}
          fontSize={10}
          fontFamily="'JetBrains Mono',monospace"
          fontWeight="bold"
        >
          {overall}
        </text>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:    "absolute",
          bottom:      60,
          right:       0,
          background:  "rgba(3,5,9,0.95)",
          border:      "1px solid rgba(41,231,255,0.25)",
          borderRadius: 4,
          padding:     "6px 10px",
          fontSize:    10,
          color:       "#CBD5E1",
          fontFamily:  "'JetBrains Mono',monospace",
          whiteSpace:  "nowrap",
          pointerEvents: "none",
        }}>
          <div style={{ color: outerColor }}>SYS&nbsp;&nbsp;{sysSc}%</div>
          <div style={{ color: innerColor }}>RISK&nbsp;{riskSc}%</div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 4, paddingTop: 4, color: scoreColor(overall) }}>
            SCORE&nbsp;{overall}/100
          </div>
        </div>
      )}
    </div>
  );
}

/** JarvisBrain intent exports */
export function isPulseQuery(text) {
  return /\b(pulse\s*ring|health\s*ring|operational\s*ring|pulse\s*score|ring\s*score)\b/i.test(text || "");
}
export function buildPulseScript(scores) {
  if (!scores) return "Operational pulse ring is active, sir.";
  const { sysSc, riskSc, overall } = scores;
  const level = overall >= 75 ? "nominal" : overall >= 40 ? "elevated pressure" : "CRITICAL pressure";
  return `Operational pulse: overall score ${overall} out of 100 — ${level}. System health at ${sysSc}%, risk health at ${riskSc}%.`;
}
