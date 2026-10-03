/**
 * F85 — Brain Node Velocity Monitor (BNVM)
 *
 * Polls /v1/cinematic/brain every 30 s and computes the RATE-OF-CHANGE
 * (velocity) of nodes and synapses — how fast the brain is growing, not
 * just how large it is (that's F16 BrainGrowthSparkline).
 *
 * Velocity = Δnodes / interval (nodes/min).  Trend = slope of the last
 * N readings via linear regression → ACCELERATING / STEADY / DECELERATING.
 *
 * Stores up to 20 velocity readings in localStorage so trend survives reloads.
 *
 * Stat tiles: current node velocity (nodes/min) · synapse velocity · trend state · peak velocity
 * Velocity sparklines for nodes and synapses.
 * ▶ ASSESS: 2-sentence growth-velocity brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ BNVM  at left:2580 bottom:18, zIndex:68.
 * Event:   jarvis:bnvm-toggle
 * Voice:   "brain velocity / node velocity / brain acceleration /
 *           bnvm / growth velocity / brain growth rate / neural growth / growth rate"
 * Refresh: 30 s auto-poll.
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

const BTN_LEFT      = 2580;
const REFRESH_MS    = 30_000;
const MAX_READINGS  = 20;
const STORAGE_KEY   = "jarvis_bnvm_history";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(hist) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hist)); } catch { /* quota full */ }
}

/**
 * Linear regression slope over the last N readings.
 * Each reading: { nodesVelocity, synapsesVelocity, ts }
 */
function slope(readings, key) {
  const n = readings.length;
  if (n < 2) return 0;
  const xs = readings.map((_, i) => i);
  const ys = readings.map((r) => r[key] ?? 0);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function trendLabel(s) {
  if (s > 0.05)  return { label: "ACCELERATING", color: GREEN };
  if (s < -0.05) return { label: "DECELERATING", color: RED };
  return { label: "STEADY", color: CY };
}

// Tiny SVG sparkline — values array, width, height, color
function Sparkline({ values, width = 120, height = 32, color = CY }) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height}><text x={4} y={height / 2 + 4} fill={MUTED} fontSize={10}>no data</text></svg>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* last point dot */}
      {(() => {
        const last = values[values.length - 1];
        const x = (values.length - 1) * step;
        const y = height - ((last - min) / range) * (height - 4) - 2;
        return <circle cx={x} cy={y} r={3} fill={color} />;
      })()}
    </svg>
  );
}

function StatTile({ label, value, color = CY, sub }) {
  return (
    <div style={{
      flex: "1 1 120px", minWidth: 110, background: "rgba(41,231,255,0.04)",
      border: `1px solid ${color}22`, borderRadius: 8, padding: "10px 14px",
    }}>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isBnvmQuery(q) {
  return /brain\s*veloc|node\s*veloc|brain\s*accel|bnvm|growth\s*veloc|brain\s*growth\s*rate|neural\s*growth|growth\s*rate/i.test(q);
}

export async function buildBnvmScript() {
  try {
    const res = await fetch(`${apiBase()}/v1/cinematic/brain`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const nodes = data.nodes ?? data.node_count ?? data.total_nodes ?? 0;
    const synapses = data.synapses ?? data.synapse_count ?? data.total_synapses ?? 0;

    const hist = loadHistory();
    const nodesVels  = hist.map((r) => r.nodesVelocity ?? 0);
    const last = nodesVels[nodesVels.length - 1] ?? 0;
    const s = slope(hist, "nodesVelocity");
    const { label: trend } = trendLabel(s);
    const peak = hist.reduce((m, r) => Math.max(m, r.nodesVelocity ?? 0), 0);

    return `JARVIS brain currently has ${nodes.toLocaleString()} nodes and ${synapses.toLocaleString()} synapses. ` +
      `Node growth velocity is ${last.toFixed(2)} nodes/min — trend is ${trend} ` +
      `(peak: ${peak.toFixed(2)} nodes/min across ${hist.length} readings). ` +
      (trend === "ACCELERATING"
        ? "The knowledge graph is expanding rapidly — recommend monitoring enrichment loop resource consumption."
        : trend === "DECELERATING"
        ? "Growth velocity is declining — consider checking research autopilot and enrichment loop status."
        : "Growth velocity is stable — the brain is in a steady operational cadence.");
  } catch (e) {
    return `JARVIS brain velocity assessment unavailable: ${e.message}. Check /v1/cinematic/brain endpoint.`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function BrainNodeVelocityMonitor() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [history, setHistory]   = useState(() => loadHistory());
  const [lastNodes, setLastNodes] = useState(null);
  const [lastSyn, setLastSyn]   = useState(null);
  const [error, setError]       = useState(null);
  const pollRef = useRef(null);

  const speak = useCallback((text) => {
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }, []);

  const fetchBrain = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/v1/cinematic/brain`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nodes    = data.nodes ?? data.node_count ?? data.total_nodes ?? 0;
      const synapses = data.synapses ?? data.synapse_count ?? data.total_synapses ?? 0;
      const now = Date.now();

      setHistory((prev) => {
        const prevNodes = lastNodes;
        const prevSyn   = lastSyn;
        const intervalMin = REFRESH_MS / 60_000;

        const nodesVelocity    = prevNodes !== null ? (nodes - prevNodes) / intervalMin : 0;
        const synapsesVelocity = prevSyn   !== null ? (synapses - prevSyn) / intervalMin : 0;

        const updated = [
          ...prev,
          { ts: now, nodes, synapses, nodesVelocity, synapsesVelocity },
        ].slice(-MAX_READINGS);

        saveHistory(updated);
        return updated;
      });

      setLastNodes(nodes);
      setLastSyn(synapses);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [lastNodes, lastSyn]);

  // bootstrap + poll
  useEffect(() => {
    fetchBrain();
    pollRef.current = setInterval(fetchBrain, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // toggle event
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:bnvm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:bnvm-toggle", onToggle);
  }, []);

  const handleAssess = async () => {
    setAssess(true);
    try {
      const script = await buildBnvmScript();
      speak(script);
    } finally {
      setAssess(false);
    }
  };

  const handleClear = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    setHistory([]);
    setLastNodes(null);
    setLastSyn(null);
  };

  // ─── derived ───────────────────────────────────────────────────────────────
  const nodesVels    = history.map((r) => r.nodesVelocity ?? 0);
  const synVels      = history.map((r) => r.synapsesVelocity ?? 0);
  const latestNV     = nodesVels[nodesVels.length - 1] ?? 0;
  const latestSV     = synVels[synVels.length - 1] ?? 0;
  const peakNV       = nodesVels.reduce((m, v) => Math.max(m, v), 0);
  const nodeSlope    = slope(history, "nodesVelocity");
  const { label: trendStr, color: trendColor } = trendLabel(nodeSlope);
  const currentNodes = history.length > 0 ? history[history.length - 1].nodes : null;

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Brain Node Velocity Monitor (BNVM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          padding: "5px 10px", borderRadius: 6,
          border: `1px solid ${CY}55`, background: "rgba(4,7,14,0.8)",
          color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1,
          cursor: "pointer", backdropFilter: "blur(6px)",
          boxShadow: `0 0 10px ${CY}22`,
        }}
      >
        ◈ BNVM
        {history.length > 0 && (
          <span style={{
            marginLeft: 6, background: trendColor + "33",
            border: `1px solid ${trendColor}55`, borderRadius: 4,
            padding: "1px 5px", fontSize: 9, color: trendColor, letterSpacing: 1,
          }}>
            {trendStr.slice(0, 4)}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: "fixed", left: Math.min(BTN_LEFT, window.innerWidth - 500), bottom: 52,
          width: "min(480px,94vw)", zIndex: 69,
          background: BG, border: `1px solid ${CY}33`, borderRadius: 14,
          padding: "16px 18px 14px", backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${CY}18`, fontFamily: MONO, color: "#DCEBF5",
          maxHeight: "80vh", overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 3, textShadow: `0 0 14px ${CY}` }}>
              BRAIN NODE VELOCITY
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
              {history.length} / {MAX_READINGS} readings
            </span>
            <button
              onClick={() => { setLoading(true); fetchBrain().finally(() => setLoading(false)); }}
              style={{ background: "none", border: `1px solid ${CY}44`, borderRadius: 5,
                color: CY, fontSize: 10, padding: "2px 8px", cursor: "pointer" }}
            >
              {loading ? "…" : "↺"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, fontSize: 14,
                cursor: "pointer", padding: "0 4px" }}
            >✕</button>
          </div>

          {error && (
            <div style={{ color: RED, fontSize: 11, marginBottom: 10, padding: "6px 10px",
              background: RED + "11", borderRadius: 6, border: `1px solid ${RED}33` }}>
              ⚠ {error}
            </div>
          )}

          {/* stat tiles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <StatTile label="NODE VELOCITY" value={`${latestNV.toFixed(2)}`} color={CY} sub="nodes/min" />
            <StatTile label="SYNAPSE VELOCITY" value={`${latestSV.toFixed(2)}`} color="#A78BFA" sub="synapses/min" />
            <StatTile label="TREND" value={trendStr} color={trendColor} sub={`slope ${nodeSlope.toFixed(3)}`} />
            <StatTile label="PEAK VELOCITY" value={`${peakNV.toFixed(2)}`} color={AMBER} sub="nodes/min (all-time)" />
          </div>

          {/* current brain size */}
          {currentNodes !== null && (
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 12, padding: "6px 10px",
              background: "rgba(41,231,255,0.04)", borderRadius: 6,
              border: `1px solid ${CY}22` }}>
              Current size: {currentNodes.toLocaleString()} nodes · {
                (history[history.length - 1]?.synapses ?? 0).toLocaleString()} synapses
            </div>
          )}

          {/* sparklines */}
          {history.length >= 2 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: MUTED, letterSpacing: 2, marginBottom: 6 }}>NODE VELOCITY OVER TIME</div>
              <Sparkline values={nodesVels} width={420} height={40} color={CY} />
              <div style={{ fontSize: 10, color: MUTED, letterSpacing: 2, marginTop: 10, marginBottom: 6 }}>SYNAPSE VELOCITY OVER TIME</div>
              <Sparkline values={synVels} width={420} height={40} color="#A78BFA" />
            </div>
          )}

          {history.length < 2 && (
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 12, textAlign: "center", padding: "12px 0" }}>
              Collecting velocity data… need ≥2 readings ({history.length}/{2} so far).
            </div>
          )}

          {/* reading history table */}
          {history.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: MUTED, letterSpacing: 2, marginBottom: 6 }}>READING HISTORY</div>
              <div style={{ maxHeight: 140, overflowY: "auto" }}>
                {[...history].reverse().map((r, i) => {
                  const ago = Math.round((Date.now() - r.ts) / 1000);
                  const agoStr = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
                  return (
                    <div key={r.ts} style={{
                      display: "flex", gap: 10, padding: "4px 0",
                      borderBottom: "1px solid rgba(41,231,255,0.08)", fontSize: 11,
                      alignItems: "center",
                    }}>
                      <span style={{ color: MUTED, width: 60, flexShrink: 0, fontSize: 10 }}>{agoStr}</span>
                      <span style={{ color: CY, width: 80, flexShrink: 0 }}>
                        {r.nodesVelocity != null ? `${r.nodesVelocity.toFixed(2)} n/m` : "—"}
                      </span>
                      <span style={{ color: "#A78BFA", width: 80, flexShrink: 0 }}>
                        {r.synapsesVelocity != null ? `${r.synapsesVelocity.toFixed(2)} s/m` : "—"}
                      </span>
                      <span style={{ color: MUTED, fontSize: 10 }}>
                        {(r.nodes ?? 0).toLocaleString()} nodes
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                flex: 1, padding: "7px 14px", borderRadius: 7,
                border: `1px solid ${CY}55`, background: assessing ? CY + "22" : "transparent",
                color: CY, fontFamily: MONO, fontSize: 11, cursor: "pointer", letterSpacing: 1,
              }}
            >
              {assessing ? "⟳ ASSESSING…" : "▶ ASSESS"}
            </button>
            <button
              onClick={handleClear}
              title="Clear stored velocity history"
              style={{
                padding: "7px 14px", borderRadius: 7,
                border: `1px solid ${MUTED}44`, background: "transparent",
                color: MUTED, fontFamily: MONO, fontSize: 11, cursor: "pointer",
              }}
            >
              ⌫ CLEAR
            </button>
          </div>

          <div style={{ fontSize: 9, color: MUTED, marginTop: 10, textAlign: "right", letterSpacing: 1 }}>
            POLLING /v1/cinematic/brain every {REFRESH_MS / 1000}s · {MAX_READINGS}-reading window
          </div>
        </div>
      )}
    </>
  );
}
