/**
 * BrainGrowthSparkline — F16
 * Polls /v1/cinematic/brain every 30s and maintains a rolling time-series of
 * nodes + synapses counts. Renders live AreaChart sparklines in a floating panel.
 * Toggle button at bottom-left strip (left: 804). "JARVIS, brain growth" → TTS brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import {
  AreaChart, Area, Tooltip, ResponsiveContainer, YAxis,
} from "recharts";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BRAIN_RE = /\bbrain.growth|brain.spark|brain.trend|nodes.over|synap.over|brain.expand/i;
const MAX_POINTS = 40;

function dig(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    for (const k of path.split(".")) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("brain fetch failed");
  return r.json();
}

export function isBrainQuery(text) {
  return BRAIN_RE.test(text || "");
}

export async function buildBrainScript(history) {
  let nodes = "--", synapses = "--";
  try {
    const d = await fetchBrain();
    nodes    = dig(d, "nodes", "node_count", "neurons") ?? "--";
    synapses = dig(d, "synapses", "edge_count", "edges") ?? "--";
  } catch (_) {}

  const pts = (history || []).length;
  const trendNote = pts >= 2
    ? (() => {
        const last = history[history.length - 1];
        const first = history[0];
        const dn = (last?.nodes ?? 0) - (first?.nodes ?? 0);
        const ds = (last?.synapses ?? 0) - (first?.synapses ?? 0);
        if (dn === 0 && ds === 0) return "Growth is currently stable.";
        const parts = [];
        if (dn !== 0) parts.push(`nodes ${dn > 0 ? "up" : "down"} ${Math.abs(dn)}`);
        if (ds !== 0) parts.push(`synapses ${ds > 0 ? "up" : "down"} ${Math.abs(ds)}`);
        return `Trend over ${pts} samples: ${parts.join(", ")}.`;
      })()
    : "Insufficient history for trend analysis.";

  return (
    `Brain growth report: ${nodes} nodes, ${synapses} synapses currently active. ` +
    trendNote
  );
}

function fmt(n) {
  if (n == null) return "--";
  const v = typeof n === "number" ? n : parseInt(n, 10);
  return isNaN(v) ? "--" : v.toLocaleString();
}

function Trend({ history, key_ }) {
  if (history.length < 2) return null;
  const last  = history[history.length - 1][key_] ?? 0;
  const first = history[0][key_] ?? 0;
  const delta = last - first;
  if (delta === 0) return <span style={{ color: "#566878", fontSize: 9 }}>—</span>;
  const sign = delta > 0 ? "▲" : "▼";
  const col  = delta > 0 ? GRN : "#FF4466";
  return (
    <span style={{ color: col, fontSize: 9, letterSpacing: 0.5 }}>
      {sign} {Math.abs(delta).toLocaleString()}
    </span>
  );
}

function Sparkline({ data, dataKey, color }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#566878", fontSize: 9 }}>collecting data…</span>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis domain={["auto", "auto"]} hide />
        <Tooltip
          contentStyle={{
            background: "rgba(4,8,14,0.95)", border: `1px solid ${color}44`,
            borderRadius: 6, fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5", padding: "3px 8px",
          }}
          formatter={(v) => [fmt(v), dataKey]}
          labelFormatter={(_, pl) => pl?.[0]?.payload?.label || ""}
          cursor={{ stroke: `${color}55`, strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${dataKey})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function BrainGrowthSparkline() {
  const [open,    setOpen]    = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [last,    setLast]    = useState(null);
  const histRef = useRef([]);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchBrain();
      const nodes    = dig(d, "nodes", "node_count", "neurons");
      const synapses = dig(d, "synapses", "edge_count", "edges");
      if (nodes == null && synapses == null) return;

      const ts   = Date.now();
      const mins = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const pt   = {
        ts,
        label:    mins,
        nodes:    typeof nodes    === "number" ? nodes    : parseInt(nodes,    10) || 0,
        synapses: typeof synapses === "number" ? synapses : parseInt(synapses, 10) || 0,
      };

      histRef.current = [...histRef.current, pt].slice(-MAX_POINTS);
      setHistory([...histRef.current]);
      setLast(new Date(ts));
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (BRAIN_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const latest   = history[history.length - 1];
  const nowNodes = latest?.nodes    ?? null;
  const nowSyn   = latest?.synapses ?? null;
  const pts      = history.length;

  function fmtAge(d) {
    if (!d) return "—";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Brain Growth Sparkline"
        style={{
          position: "fixed", left: 804, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${CY}55`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        BRAIN
      </button>

      {/* Sparkline panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(400px,92vw)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: CY,
              boxShadow: `0 0 10px ${CY}`, display: "inline-block",
              animation: loading ? "bgpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              BRAIN GROWTH
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "POLLING" : `↻ ${fmtAge(last)}`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat row */}
          <div style={{
            padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", gap: 20, alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 8, color: "#566878", letterSpacing: 1, marginBottom: 2 }}>NODES</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, color: CY, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {fmt(nowNodes)}
                </span>
                <Trend history={history} key_="nodes" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8, color: "#566878", letterSpacing: 1, marginBottom: 2 }}>SYNAPSES</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, color: GRN, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {fmt(nowSyn)}
                </span>
                <Trend history={history} key_="synapses" />
              </div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 8, color: "#566878" }}>
              {pts} sample{pts !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Nodes sparkline */}
          <div style={{ padding: "10px 14px 4px" }}>
            <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4, opacity: 0.7 }}>
              NODES OVER TIME
            </div>
            <Sparkline data={history} dataKey="nodes" color={CY} />
          </div>

          {/* Synapses sparkline */}
          <div style={{ padding: "4px 14px 12px" }}>
            <div style={{ fontSize: 8, color: GRN, letterSpacing: 1, marginBottom: 4, opacity: 0.7 }}>
              SYNAPSES OVER TIME
            </div>
            <Sparkline data={history} dataKey="synapses" color={GRN} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes bgpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%  { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
