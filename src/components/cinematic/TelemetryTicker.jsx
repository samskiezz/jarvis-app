/**
 * TelemetryTicker — live CPU/mem/load + brain nodes/synapses in the top bar.
 * Polls /v1/jarvis/system/status and /v1/cinematic/brain every 15 s.
 * F03 — additive only, mounted via Layout.jsx top strip.
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { SHELL as S } from "@/domain/colors";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CY = "#29E7FF";

function pct(n) {
  const v = typeof n === "number" ? n : parseFloat(n);
  return isNaN(v) ? "--" : `${v.toFixed(0)}%`;
}

function fmt(n) {
  const v = typeof n === "number" ? n : parseInt(n, 10);
  return isNaN(v) ? "--" : v.toLocaleString();
}

function load1(val) {
  if (Array.isArray(val)) {
    const v = parseFloat(val[0]);
    return isNaN(v) ? "--" : v.toFixed(2);
  }
  const v = parseFloat(val);
  return isNaN(v) ? "--" : v.toFixed(2);
}

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

export default function TelemetryTicker() {
  const [sys, setSys] = useState(null);
  const [brain, setBrain] = useState(null);

  async function refresh() {
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [sr, br] = await Promise.allSettled([
      fetch(`${base}/v1/jarvis/system/status`, { headers }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${base}/v1/cinematic/brain`, { headers }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);
    if (sr.status === "fulfilled" && sr.value) setSys(sr.value);
    if (br.status === "fulfilled" && br.value) setBrain(br.value);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, []);

  const cpu = dig(sys, "cpu_percent", "cpu", "system.cpu_percent");
  const mem = dig(sys, "memory.percent", "memory_percent", "mem_percent", "mem");
  const loadVal = dig(sys, "load_avg", "load", "system.load_avg", "load_average");
  const nodes = dig(brain, "nodes", "node_count", "neurons");
  const synapses = dig(brain, "synapses", "edge_count", "edges");

  const items = [
    { label: "CPU", value: pct(cpu) },
    { label: "MEM", value: pct(mem) },
    { label: "LOAD", value: load1(loadVal) },
    { label: "NODES", value: fmt(nodes) },
    { label: "SYN", value: fmt(synapses) },
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        marginLeft: 8,
        overflow: "hidden",
      }}
    >
      {items.map((item, i) => (
        <span key={item.label} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <span
              style={{ color: S.border, padding: "0 5px", fontSize: S.fs.xxs }}
            >
              ·
            </span>
          )}
          <span
            style={{
              fontSize: S.fs.xxs,
              color: S.text,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {item.label}
          </span>
          <span
            style={{
              fontSize: S.fs.xxs,
              color: item.value === "--" ? S.text : CY,
              letterSpacing: 1,
              marginLeft: 3,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}
