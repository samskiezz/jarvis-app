/**
 * F03 — Live Telemetry Ticker (top bar)
 * Polls /v1/jarvis/system/status (30 s) for CPU, memory, load.
 * Polls /v1/cinematic/brain (30 s) for node + synapse counts.
 * Renders a thin fixed strip at the very top of the viewport.
 * Additive only — mounted via App.jsx; zero edits to protected files.
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";
const RED = "#FF3B3B";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 30_000;

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

function pctColor(pct) {
  if (pct >= 90) return RED;
  if (pct >= 70) return YLW;
  return GRN;
}

function loadColor(l) {
  if (l >= 4) return RED;
  if (l >= 2) return YLW;
  return GRN;
}

function Pill({ label, value, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 4,
      padding: "0 8px",
      borderRight: "1px solid #29E7FF22",
    }}>
      <span style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: 9, letterSpacing: 2, color: "#29E7FF88",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: 11, letterSpacing: 1,
        color: color || CY,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </span>
  );
}

export default function LiveTelemetryTicker() {
  const [sys, setSys] = useState(null);
  const [brain, setBrain] = useState(null);

  async function fetchSys() {
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      setSys(await r.json());
    } catch (_) {}
  }

  async function fetchBrain() {
    try {
      const r = await fetch(`${apiBase()}/v1/cinematic/brain`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      setBrain(await r.json());
    } catch (_) {}
  }

  useEffect(() => {
    fetchSys();
    fetchBrain();
    const t1 = setInterval(fetchSys, POLL_MS);
    const t2 = setInterval(fetchBrain, POLL_MS);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const cpu   = sys != null ? parseFloat(dig(sys, "cpu_percent", "cpu", "system.cpu_percent") ?? NaN) : NaN;
  const mem   = sys != null ? parseFloat(dig(sys, "memory.percent", "memory_percent", "mem_percent", "mem") ?? NaN) : NaN;
  const rawLoad = sys != null ? dig(sys, "load_avg", "load", "system.load_avg", "load_average") : null;
  const load  = rawLoad != null
    ? parseFloat(Array.isArray(rawLoad) ? rawLoad[0] : rawLoad)
    : NaN;

  const nodes    = brain != null ? (dig(brain, "nodes", "node_count", "neurons") ?? "—") : "—";
  const synapses = brain != null ? (dig(brain, "synapses", "edge_count", "edges") ?? "—") : "—";

  const hasAny = !isNaN(cpu) || !isNaN(mem) || !isNaN(load) || brain != null;

  if (!hasAny) return null;

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 19000,
        height: 22,
        background: "rgba(4,7,12,0.82)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #29E7FF18",
        display: "flex", alignItems: "center",
        overflow: "hidden",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: 9, letterSpacing: 3, color: CY, opacity: 0.5,
        padding: "0 10px",
        borderRight: "1px solid #29E7FF22",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}>
        JARVIS
      </span>

      {!isNaN(cpu) && (
        <Pill label="CPU" value={`${Math.round(cpu)}%`} color={pctColor(cpu)} />
      )}
      {!isNaN(mem) && (
        <Pill label="MEM" value={`${Math.round(mem)}%`} color={pctColor(mem)} />
      )}
      {!isNaN(load) && (
        <Pill label="LOAD" value={load.toFixed(2)} color={loadColor(load)} />
      )}

      {brain != null && (
        <>
          <Pill label="NODES"    value={nodes}    color={CY} />
          <Pill label="SYNAPSES" value={synapses} color={CY} />
        </>
      )}
    </div>
  );
}
