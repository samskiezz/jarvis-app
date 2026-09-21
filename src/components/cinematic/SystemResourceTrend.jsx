/**
 * SystemResourceTrend — F92 (SRSUTRD)
 *
 * Polls /v1/jarvis/system/status every 30 s, stores a rolling 20-reading
 * history in localStorage (jarvis_srsutrd_history), and renders three SVG
 * sparklines — CPU / MEM / LOAD — with min/avg/max annotations per metric.
 *
 * Stat tiles: UPTIME | AVG CPU | AVG MEM | AVG LOAD
 * Deviation alert when the current reading is > avg + 1 stdev.
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat (2-sentence assessment) + TTS
 * ◈ SRSUTRD button at left:971660, bottom:8, zIndex:116
 * 30-s auto-refresh
 *
 * Exported: isSrsutrdQuery, buildSrsutrdScript (wired in JarvisBrain.jsx)
 * Event: jarvis:srsutrd-toggle
 *
 * Voice: "srsutrd" / "system trend" / "resource trend" / "cpu trend" /
 *        "memory trend" / "load trend" / "system history" / "resource usage trend"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#FFB347";
const RED    = "#FF3D5A";
const PURPLE = "#B97AFF";

const BTN_LEFT    = 971660;
const REFRESH_MS  = 30_000;
const MAX_HISTORY = 20;
const LS_KEY      = "jarvis_srsutrd_history";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(hist) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(hist.slice(-MAX_HISTORY)));
  } catch { /* quota */ }
}

// ── stats helpers ─────────────────────────────────────────────────────────────

function stats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0, stdev: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return { min, max, avg, stdev: Math.sqrt(variance) };
}

// ── SVG sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ values, color, height = 42, width = 220 }) {
  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#333" strokeWidth="1" />
        <text x={width / 2} y={height / 2 + 4} fill="#555" fontSize="9" textAnchor="middle">
          no data
        </text>
      </svg>
    );
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - lo) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

// ── exported query helpers ────────────────────────────────────────────────────

export function isSrsutrdQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("srsutrd") ||
    s.includes("system trend") ||
    s.includes("resource trend") ||
    s.includes("cpu trend") ||
    s.includes("memory trend") ||
    s.includes("load trend") ||
    s.includes("system history") ||
    s.includes("resource usage trend") ||
    s.includes("resource history") ||
    s.includes("system usage trend")
  );
}

export async function buildSrsutrdScript() {
  try {
    const hist = loadHistory();
    if (!hist.length) return "I have no system resource history recorded yet, sir.";
    const cpuVals = hist.map((r) => r.cpu ?? 0);
    const memVals = hist.map((r) => r.mem ?? 0);
    const loadVals = hist.map((r) => r.load ?? 0);
    const cs = stats(cpuVals);
    const ms = stats(memVals);
    const ls = stats(loadVals);
    const latest = hist[hist.length - 1];
    const uptime = latest?.uptime_seconds
      ? `${Math.floor(latest.uptime_seconds / 3600)}h ${Math.floor((latest.uptime_seconds % 3600) / 60)}m`
      : "unknown";
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `System resource trend — ${hist.length} readings, uptime ${uptime}. CPU avg ${cs.avg.toFixed(1)}% (min ${cs.min.toFixed(1)}, max ${cs.max.toFixed(1)}). MEM avg ${ms.avg.toFixed(1)}% (min ${ms.min.toFixed(1)}, max ${ms.max.toFixed(1)}). LOAD avg ${ls.avg.toFixed(2)}. Assess in two sentences.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Resource trend assessed.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return "Unable to assess resource trend at this time.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SystemResourceTrend() {
  const [open, setOpen]         = useState(false);
  const [history, setHistory]   = useState(() => loadHistory());
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssess]  = useState(false);
  const [assessment, setAsmTxt] = useState("");
  const timer = useRef(null);

  // listen for toggle
  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:srsutrd-toggle", handler);
    return () => window.removeEventListener("jarvis:srsutrd-toggle", handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();

      // Normalise — field names vary across backend versions
      const cpu  = parseFloat(d.cpu_percent   ?? d.cpu   ?? d.cpu_usage   ?? 0);
      const mem  = parseFloat(d.memory_percent ?? d.mem   ?? d.mem_usage   ?? d.memory_usage ?? 0);
      const load = parseFloat(d.load_avg       ?? d.load  ?? d.load_average ?? d.load1 ?? 0);
      const uptime_seconds = d.uptime_seconds ?? d.uptime ?? 0;

      const entry = { ts: Date.now(), cpu, mem, load, uptime_seconds };
      setHistory((prev) => {
        const next = [...prev, entry].slice(-MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // auto-refresh
  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setAsmTxt("");
    const txt = await buildSrsutrdScript();
    setAsmTxt(txt);
    setAssess(false);
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch { /* TTS optional */ }
  }, []);

  // derived stats
  const cpuVals  = history.map((r) => r.cpu  ?? 0);
  const memVals  = history.map((r) => r.mem  ?? 0);
  const loadVals = history.map((r) => r.load ?? 0);
  const cStats   = stats(cpuVals);
  const mStats   = stats(memVals);
  const lStats   = stats(loadVals);
  const latest   = history[history.length - 1];
  const uptime   = latest?.uptime_seconds
    ? `${Math.floor(latest.uptime_seconds / 3600)}h ${Math.floor((latest.uptime_seconds % 3600) / 60)}m`
    : "—";

  // deviation alerts
  const cpuAlert  = latest && cStats.stdev > 0 && (latest.cpu  - cStats.avg) > cStats.stdev;
  const memAlert  = latest && mStats.stdev > 0 && (latest.mem  - mStats.avg) > mStats.stdev;
  const loadAlert = latest && lStats.stdev > 0 && (latest.load - lStats.avg) > lStats.stdev;

  // ── toggle button (always visible) ──────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 116,
          background: "transparent", border: `1px solid ${open ? CY : "#333"}`,
          color: open ? CY : "#555", fontFamily: "monospace", fontSize: 9,
          padding: "2px 6px", cursor: "pointer", borderRadius: 2, whiteSpace: "nowrap",
        }}
        title="System Resource Usage Trend (SRSUTRD) — F92"
      >
        ◈ SRSUTRD
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 550, zIndex: 9116,
          width: 600, background: "#0d0d0d", border: `1px solid ${CY}44`,
          borderRadius: 6, padding: 16, fontFamily: "monospace",
          boxShadow: `0 0 24px ${CY}22`,
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
              ◈ SYSTEM RESOURCE TREND — SRSUTRD
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={assess} disabled={assessing} style={btnStyle(GREEN)}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={load} disabled={loading} style={btnStyle(CY)}>
                {loading ? "…" : "⟳"}
              </button>
              <button onClick={() => setOpen(false)} style={btnStyle(RED)}>✕</button>
            </div>
          </div>

          {error && (
            <div style={{ color: RED, fontSize: 10, marginBottom: 8 }}>⚠ {error}</div>
          )}

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "UPTIME",   val: uptime,                     col: GREEN },
              { label: "AVG CPU",  val: `${cStats.avg.toFixed(1)}%`, col: cpuAlert  ? RED : CY },
              { label: "AVG MEM",  val: `${mStats.avg.toFixed(1)}%`, col: memAlert  ? RED : AMBER },
              { label: "AVG LOAD", val: lStats.avg.toFixed(2),        col: loadAlert ? RED : PURPLE },
            ].map((t) => (
              <div key={t.label} style={{
                background: "#111", border: `1px solid ${t.col}33`, borderRadius: 4,
                padding: "6px 12px", minWidth: 110, textAlign: "center",
              }}>
                <div style={{ fontSize: 16, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* deviation alerts */}
          {(cpuAlert || memAlert || loadAlert) && (
            <div style={{
              background: `${RED}11`, border: `1px solid ${RED}44`, borderRadius: 4,
              padding: "6px 10px", marginBottom: 12,
            }}>
              <span style={{ color: RED, fontSize: 10, fontWeight: 700 }}>
                ⚠ DEVIATION ABOVE BASELINE —
              </span>
              <span style={{ color: "#aaa", fontSize: 10 }}>
                {[
                  cpuAlert  ? `CPU ${latest.cpu.toFixed(1)}% (avg ${cStats.avg.toFixed(1)}%)`  : null,
                  memAlert  ? `MEM ${latest.mem.toFixed(1)}% (avg ${mStats.avg.toFixed(1)}%)`  : null,
                  loadAlert ? `LOAD ${latest.load.toFixed(2)} (avg ${lStats.avg.toFixed(2)})` : null,
                ].filter(Boolean).join("  ·  ")}
              </span>
            </div>
          )}

          {/* sparklines */}
          {[
            { label: "CPU %",  vals: cpuVals,  color: CY,     s: cStats },
            { label: "MEM %",  vals: memVals,  color: AMBER,  s: mStats },
            { label: "LOAD",   vals: loadVals, color: PURPLE, s: lStats },
          ].map(({ label, vals, color, s }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color, fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: 9, color: "#666" }}>
                  min {s.min.toFixed(1)} · avg {s.avg.toFixed(1)} · max {s.max.toFixed(1)}
                </span>
              </div>
              <Sparkline values={vals} color={color} width={564} height={44} />
            </div>
          ))}

          {/* reading history count */}
          <div style={{ fontSize: 9, color: "#444", marginBottom: 8 }}>
            {history.length} / {MAX_HISTORY} readings stored · auto-refresh 30 s · /v1/jarvis/system/status
          </div>

          {/* assessment */}
          {assessment && (
            <div style={{
              background: "#111", border: `1px solid ${GREEN}33`, borderRadius: 4,
              padding: "8px 10px", fontSize: 11, color: "#ccc", marginTop: 4,
            }}>
              {assessment}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function btnStyle(col) {
  return {
    background: "transparent", border: `1px solid ${col}`, color: col,
    fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
    cursor: "pointer", borderRadius: 3,
  };
}
