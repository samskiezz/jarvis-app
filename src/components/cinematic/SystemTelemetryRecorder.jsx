/**
 * F64 — System Telemetry Recorder
 *
 * Polls /v1/jarvis/system/status every 60 s, stores up to 60 readings
 * (cpu_percent / memory_percent / load_avg) in localStorage under the key
 * "jarvis:telemetry_rec", and renders three live SVG sparklines so the user
 * can see raw resource trends over the last hour.
 *
 * Distinct from TelemetryTicker (F03, shows current values in top bar),
 * SystemHealthScorecard (F47, composite 0-100 score), and
 * ResourcePressureMonitor (F57, cross-source pressure index).
 *
 * Voice trigger: "telemetry chart / cpu history / system trend / stelm"
 * Toggle:  ⟁ STELM  at left:8396, bottom:8, zIndex 65
 */
import { useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 8396;
const LS_KEY   = "jarvis:telemetry_rec";
const MAX_PTS  = 60;
const POLL_MS  = 60_000;

const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

function dig(obj, ...paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let v = obj;
    for (const p of parts) {
      if (v == null || typeof v !== "object") { v = undefined; break; }
      v = v[p];
    }
    if (v != null) return v;
  }
  return null;
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}

function saveHistory(h) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(h)); } catch { /* quota */ }
}

// Draw a simple SVG polyline from a numeric array. Values are normalised to [min,max].
function Sparkline({ points, color, width = 220, height = 36 }) {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.3} />
      </svg>
    );
  }
  const valid = points.filter((v) => v != null && !isNaN(v));
  if (valid.length < 2) return null;

  const lo  = Math.min(...valid);
  const hi  = Math.max(...valid);
  const rng = hi - lo || 1;
  const pad = 2;
  const W = width - pad * 2;
  const H = height - pad * 2;

  const pts = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * W;
    const y = pad + (1 - (v - lo) / rng) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} />
      {/* fill under curve */}
      <polygon
        fill={color}
        fillOpacity={0.08}
        points={`${pad},${height - pad} ${pts} ${pad + W},${height - pad}`}
      />
    </svg>
  );
}

function MetricRow({ label, points, color, unit = "%" }) {
  const last = points.length ? points[points.length - 1] : null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  const delta = last != null && prev != null ? (last - prev).toFixed(1) : null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 3, fontFamily: S.mono, fontSize: S.fs.xs, letterSpacing: 1 }}>
        <span style={{ color: color, fontWeight: 700 }}>{label}</span>
        <span style={{ color: S.textHi }}>
          {last != null ? `${last.toFixed(1)}${unit}` : "—"}
          {delta != null && (
            <span style={{ marginLeft: 6, color: delta > 0 ? C.red : C.neon, fontSize: S.fs.xxs }}>
              {delta > 0 ? "+" : ""}{delta}
            </span>
          )}
        </span>
      </div>
      <Sparkline points={points} color={color} />
    </div>
  );
}

export default function SystemTelemetryRecorder() {
  const [open, setOpen]       = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const timerRef              = useRef(null);

  async function poll() {
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const data = await r.json();

      const cpu  = dig(data, "cpu_percent", "cpu", "system.cpu_percent");
      const mem  = dig(data, "memory.percent", "memory_percent", "mem_percent", "mem");
      const rawL = dig(data, "load_avg", "load", "system.load_avg", "load_average");
      const load = rawL != null
        ? (Array.isArray(rawL) ? parseFloat(rawL[0]) : parseFloat(rawL))
        : null;

      const point = {
        ts:   Date.now(),
        cpu:  cpu  != null ? parseFloat(cpu)  : null,
        mem:  mem  != null ? parseFloat(mem)  : null,
        load: load != null ? parseFloat(load) : null,
      };

      setHistory((prev) => {
        const next = [...prev, point].slice(-MAX_PTS);
        saveHistory(next);
        return next;
      });
    } catch { /* backend unreachable */ }
  }

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  // Voice trigger — listen for jarvis:ask; if the query matches, open the panel.
  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (/\b(telemetry chart|cpu history|system trend|mem history|load chart|stelm)\b/.test(q)) {
        setOpen(true);
      }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  // Programmatic toggle (from future JARVIS command palette entries).
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:telem-toggle", onToggle);
    return () => window.removeEventListener("jarvis:telem-toggle", onToggle);
  }, []);

  const cpuPts  = history.map((h) => h.cpu);
  const memPts  = history.map((h) => h.mem);
  const loadPts = history.map((h) => h.load);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="System telemetry sparklines (⟁ STELM)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
        }}
      >
        ⟁ STELM{history.length > 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>{history.length}</span>}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 64,
          bottom: 36, left: Math.max(8, BTN_LEFT - 200),
          width: 260,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          padding: "10px 12px",
          boxShadow: `0 4px 24px rgba(0,0,0,0.5)`,
          fontFamily: S.mono,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10, borderBottom: `1px solid ${S.border}`, paddingBottom: 6 }}>
            <span style={{ color: C.neon, fontSize: S.fs.xs, letterSpacing: 2, fontWeight: 700 }}>
              TELEMETRY HISTORY
            </span>
            <span style={{ color: S.text, fontSize: S.fs.xxs }}>
              {history.length}/{MAX_PTS} pts · 60 s
            </span>
          </div>

          {history.length === 0 ? (
            <div style={{ color: S.text, fontSize: S.fs.xs, padding: "8px 0" }}>
              Collecting first reading…
            </div>
          ) : (
            <>
              <MetricRow label="CPU"  points={cpuPts}  color={C.neon}   unit="%" />
              <MetricRow label="MEM"  points={memPts}  color={C.blue}   unit="%" />
              <MetricRow label="LOAD" points={loadPts} color={C.gold}   unit="" />
            </>
          )}

          <div style={{ marginTop: 6, color: S.text, fontSize: S.fs.xxs, letterSpacing: 0.5 }}>
            /v1/jarvis/system/status · {history.length > 0
              ? new Date(history[history.length - 1].ts).toLocaleTimeString("en-GB")
              : "—"}
          </div>
        </div>
      )}
    </>
  );
}
