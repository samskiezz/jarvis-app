/**
 * SystemHeartbeatWaveform — F298
 * Polls /v1/jarvis/system/status every 10 s, keeps a rolling 40-reading
 * history of CPU and MEM %, and renders both as ECG-style SVG waveforms.
 * Stat line: current CPU / MEM / LOAD + min/max/avg over the window.
 * ▶ ASSESS → /v1/jarvis/agent/chat 1-sentence live summary + TTS.
 * Auto-refresh: 10 s.
 *
 * Toggle:  jarvis:heartbeat-toggle event
 * Voice:   "JARVIS, heartbeat" / "cpu waveform" / "system beat" /
 *          "system pulse" / "health waveform" / "vitals waveform"
 * Button:  ♥ BEAT at left:57320, bottom:8, zIndex:111
 * Additive — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB830";
const RED = "#FF3B3B";
const DIM = "#4A5568";

const POLL_MS   = 10_000;
const MAX_PTS   = 40;
const STORAGE_K = "jarvis_heartbeat_history";
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BEAT_RE =
  /\bheartbeat\b|\bcpu[\s-]waveform\b|\bsystem[\s-]beat\b|\bsystem[\s-]pulse\b|\bhealth[\s-]waveform\b|\bvitals[\s-]waveform\b/i;

// ── exported voice intents ────────────────────────────────────────────────────

export function isHeartbeatQuery(text) {
  return BEAT_RE.test(text || "");
}

export async function buildHeartbeatScript() {
  try {
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/system/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j   = await res.json();
    const cpu = j.cpu_percent ?? j.cpu ?? 0;
    const mem = j.memory_percent ?? j.mem ?? j.memory?.percent ?? 0;
    const load = Array.isArray(j.load_average)
      ? j.load_average[0]
      : j.load ?? 0;
    const services = Array.isArray(j.services) ? j.services.length : 0;
    return (
      `System heartbeat nominal, sir. CPU at ${cpu.toFixed(1)} percent, ` +
      `memory at ${mem.toFixed(1)} percent, load average ${load.toFixed(2)}. ` +
      (services ? `${services} services monitored.` : "")
    ).trim();
  } catch {
    return "System heartbeat data unavailable at this time, sir.";
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_K);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(pts) {
  try {
    localStorage.setItem(STORAGE_K, JSON.stringify(pts.slice(-MAX_PTS)));
  } catch {}
}

function parseStatus(j) {
  const cpu  = j.cpu_percent  ?? j.cpu  ?? 0;
  const mem  = j.memory_percent ?? j.mem ?? j.memory?.percent ?? 0;
  const load = Array.isArray(j.load_average) ? j.load_average[0] : j.load ?? 0;
  return { cpu: +cpu, mem: +mem, load: +load, ts: Date.now() };
}

function stats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { min: +min.toFixed(1), max: +max.toFixed(1), avg: +avg.toFixed(1) };
}

// Build a polyline path from an array of 0-100 values, width × height canvas.
function buildPath(values, w, h, pad = 6) {
  if (values.length < 2) return "";
  const usableW = w - pad * 2;
  const usableH = h - pad * 2;
  const step = usableW / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + usableH - (Math.min(100, Math.max(0, v)) / 100) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(" L ")}`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SystemHeartbeatWaveform() {
  const [open,    setOpen]    = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const timerRef = useRef(null);

  const probe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
        signal:  AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j   = await res.json();
      const pt  = parseStatus(j);
      setHistory(prev => {
        const next = [...prev, pt].slice(-MAX_PTS);
        saveHistory(next);
        return next;
      });
    } catch (err) {
      setError(err.message || "probe failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    probe();
    timerRef.current = setInterval(probe, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [probe]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:heartbeat-toggle", fn);
    return () => window.removeEventListener("jarvis:heartbeat-toggle", fn);
  }, []);

  const cpuVals  = history.map(p => p.cpu);
  const memVals  = history.map(p => p.mem);
  const last     = history[history.length - 1] || null;
  const cpuStats = stats(cpuVals);
  const memStats = stats(memVals);

  const W = 480, H = 80;

  function cpuColour(v) {
    if (v === undefined) return DIM;
    if (v > 85) return RED;
    if (v > 60) return AMB;
    return GRN;
  }
  function memColour(v) {
    if (v === undefined) return DIM;
    if (v > 85) return RED;
    if (v > 70) return AMB;
    return CY;
  }

  async function handleAssess() {
    setAiStatus("…");
    try {
      const base   = apiBase();
      const prompt = last
        ? `Briefly (1 sentence) assess system health: CPU ${last.cpu.toFixed(1)}%, MEM ${last.mem.toFixed(1)}%, load ${last.load.toFixed(2)}. Rolling CPU avg ${cpuStats.avg}%, peak ${cpuStats.max}%.`
        : "Briefly (1 sentence) assess current system health from your available data.";
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ message: prompt }),
        signal:  AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const brief = j.response || j.message || j.content || JSON.stringify(j).slice(0, 200);
      setAiStatus(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: brief }));
    } catch (err) {
      setAiStatus(`Error: ${err.message}`);
    }
  }

  if (!open) {
    const cpuNow = last?.cpu ?? null;
    const pulse  = cpuNow !== null && cpuNow > 85;
    return (
      <button
        onClick={() => setOpen(true)}
        title="System Heartbeat Waveform"
        style={{
          position:    "fixed",
          left:        57320,
          bottom:      8,
          zIndex:      111,
          background:  pulse ? `${RED}22` : "#0a0a0f",
          border:      `1px solid ${pulse ? RED : DIM}`,
          borderRadius: 4,
          color:       pulse ? RED : GRN,
          fontFamily:  "monospace",
          fontSize:    10,
          padding:     "3px 7px",
          cursor:      "pointer",
          whiteSpace:  "nowrap",
        }}
      >
        ♥ BEAT{cpuNow !== null ? ` ${cpuNow.toFixed(0)}%` : ""}
        {loading && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
      </button>
    );
  }

  return (
    <div style={{
      position:      "fixed",
      right:         20,
      bottom:        48,
      zIndex:        1100,
      width:         W + 40,
      background:    "#0a0a0fee",
      border:        `1px solid ${CY}44`,
      borderRadius:  8,
      fontFamily:    "monospace",
      color:         "#DCEBF5",
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
    }}>
      {/* Header */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        padding:        "12px 16px 8px",
        borderBottom:   `1px solid ${CY}22`,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>♥ SYSTEM HEARTBEAT</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: DIM, fontSize: 9 }}>
            {history.length} readings · {POLL_MS / 1000}s interval
          </span>
          <button
            onClick={probe}
            disabled={loading}
            style={{
              background: "none", border: `1px solid ${CY}55`, borderRadius: 3,
              color: CY, fontSize: 9, padding: "2px 6px",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
            }}
          >{loading ? "…" : "↻"}</button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>
      </div>

      {/* Live stat row */}
      {last && (
        <div style={{ display: "flex", gap: 12, padding: "8px 16px 4px", fontSize: 10 }}>
          <span style={{ color: cpuColour(last.cpu) }}>CPU {last.cpu.toFixed(1)}%</span>
          <span style={{ color: memColour(last.mem) }}>MEM {last.mem.toFixed(1)}%</span>
          <span style={{ color: DIM }}>LOAD {last.load.toFixed(2)}</span>
        </div>
      )}

      {/* CPU waveform */}
      <div style={{ padding: "4px 16px 0" }}>
        <div style={{ fontSize: 8, color: GRN, letterSpacing: 1, marginBottom: 2 }}>
          CPU · min {cpuStats.min}% avg {cpuStats.avg}% max {cpuStats.max}%
        </div>
        <svg
          width={W} height={H}
          style={{ display: "block", background: "#ffffff05", borderRadius: 4, overflow: "visible" }}
        >
          <defs>
            <linearGradient id="cpu-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GRN} stopOpacity="0.4" />
              <stop offset="100%" stopColor={GRN} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {cpuVals.length >= 2 && (
            <>
              <path
                d={buildPath(cpuVals, W, H) + ` L ${(W - 6).toFixed(1)},${H - 6} L 6,${H - 6} Z`}
                fill="url(#cpu-grad)"
                stroke="none"
              />
              <path
                d={buildPath(cpuVals, W, H)}
                fill="none"
                stroke={GRN}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
          {cpuVals.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill={DIM} fontSize={9}>awaiting data…</text>
          )}
        </svg>
      </div>

      {/* MEM waveform */}
      <div style={{ padding: "8px 16px 4px" }}>
        <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 2 }}>
          MEM · min {memStats.min}% avg {memStats.avg}% max {memStats.max}%
        </div>
        <svg
          width={W} height={H}
          style={{ display: "block", background: "#ffffff05", borderRadius: 4, overflow: "visible" }}
        >
          <defs>
            <linearGradient id="mem-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CY} stopOpacity="0.3" />
              <stop offset="100%" stopColor={CY} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {memVals.length >= 2 && (
            <>
              <path
                d={buildPath(memVals, W, H) + ` L ${(W - 6).toFixed(1)},${H - 6} L 6,${H - 6} Z`}
                fill="url(#mem-grad)"
                stroke="none"
              />
              <path
                d={buildPath(memVals, W, H)}
                fill="none"
                stroke={CY}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
          {memVals.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill={DIM} fontSize={9}>awaiting data…</text>
          )}
        </svg>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: RED, fontSize: 9, padding: "4px 16px" }}>
          Error: {error}
        </div>
      )}

      {/* AI assess */}
      <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${CY}22` }}>
        <button
          onClick={handleAssess}
          disabled={!!aiStatus && aiStatus !== "…"}
          style={{
            background:   `${CY}22`,
            border:       `1px solid ${CY}55`,
            borderRadius: 4,
            color:        CY,
            fontFamily:   "monospace",
            fontSize:     9,
            padding:      "4px 12px",
            cursor:       aiStatus && aiStatus !== "…" ? "not-allowed" : "pointer",
            opacity:      aiStatus && aiStatus !== "…" ? 0.5 : 1,
          }}
        >
          ▶ ASSESS
        </button>
        {aiStatus && (
          <div style={{
            marginTop: 6, fontSize: 9, color: "#A0AEC0",
            lineHeight: 1.4, maxHeight: 40, overflow: "hidden",
          }}>
            {aiStatus}
          </div>
        )}
      </div>
    </div>
  );
}
