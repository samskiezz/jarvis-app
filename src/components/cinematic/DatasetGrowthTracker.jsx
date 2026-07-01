/**
 * DatasetGrowthTracker — F39
 *
 * Polls /v1/datasets every 90 s and tracks per-dataset ROW COUNT changes
 * over time in localStorage (up to 20 readings per dataset, keyed by name).
 *
 * Displays each dataset as a row with:
 *   • Current row count
 *   • Delta vs previous reading  (↑ cyan-green / → amber / ↓ red)
 *   • Mini SVG sparkline of the last 20 readings
 *   • Fastest-growing highlighted in cyan
 *
 * This is distinct from DatasetsBrowser (catalog) and DatasetFreshnessMonitor
 * (timestamp staleness). Growth Tracker is purely about VOLUME trends.
 *
 * Toggle:  ⟁ DSGR  at bottom left:8060, zIndex 65.
 * Event:   jarvis:dsgr-toggle
 * Voice:   "dataset growth" | "data growth" | "which dataset is growing" |
 *          "dataset trends" | "row count" | "dsgr"
 *
 * Exports: isDatasetGrowthQuery, buildDatasetGrowthScript
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GN   = "#4ADE80";
const AM   = "#F5A623";
const RD   = "#FF3D5A";
const DIM  = "#3A4E5E";
const BG   = "rgba(3,6,11,0.97)";
const POLL = 90_000;
const MAX_HIST = 20;
const LS_KEY = "jarvis_dsgr_history";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DSGR_RE =
  /\b(dataset[\s-]?growth|data[\s-]?growth|which[\s-]?dataset.*grow|dataset[\s-]?trend|row[\s-]?count[\s-]?trend|growing[\s-]?dataset|dsgr)\b/i;

export function isDatasetGrowthQuery(text) {
  return DSGR_RE.test(text || "");
}

export async function buildDatasetGrowthScript() {
  window.dispatchEvent(new CustomEvent("jarvis:dsgr-toggle"));
  try {
    const datasets = await fetchDatasets();
    if (!datasets.length) return "No datasets found in the data fusion reactor, sir.";
    const history = loadHistory();
    const now = Date.now();
    updateHistory(history, datasets, now);
    const top = fastestGrowing(history, datasets);
    if (!top) return `Monitoring ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} for growth. No deltas yet — awaiting a second reading, sir.`;
    return `Monitoring ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}. Fastest growth: ${top.name} has added ${top.delta.toLocaleString()} rows since last reading, sir.`;
  } catch (_) {
    return "Dataset growth panel open, sir.";
  }
}

export default function DatasetGrowthTracker() {
  const [visible, setVisible] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dsgr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsgr-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const datasets = await fetchDatasets();
      if (!datasets.length) { setLoading(false); return; }
      const history = loadHistory();
      const now = Date.now();
      updateHistory(history, datasets, now);
      saveHistory(history);
      setRows(buildRows(history, datasets));
    } catch (_) {
      // leave existing data intact
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const topGrowth = rows.length > 0 ? rows.reduce((a, b) => (b.delta > a.delta ? b : a), rows[0]) : null;

  return (
    <>
      <button
        onClick={() => setVisible((v) => !v)}
        title="Dataset Growth Tracker"
        style={{
          position: "fixed", bottom: 8, left: 8060, zIndex: 65,
          height: 26, padding: "0 8px",
          background: visible ? `${CY}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? CY : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {topGrowth && topGrowth.delta > 0 && !visible && (
          <span style={{
            display: "inline-block", marginRight: 5,
            background: GN, color: "#000", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 700, lineHeight: "14px",
          }}>
            +{fmt(topGrowth.delta)}
          </span>
        )}
        ⟁ DSGR
      </button>

      {visible && (
        <div style={{
          position: "fixed",
          bottom: 44,
          left: Math.min(8060, typeof window !== "undefined" ? window.innerWidth - 540 : 8060),
          zIndex: 65,
          width: 520,
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          background: BG,
          border: `1px solid ${CY}44`,
          borderTop: `2px solid ${CY}`,
          borderRadius: 12,
          boxShadow: `0 0 40px ${CY}12, 0 8px 32px rgba(0,0,0,0.75)`,
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 13 }}>⟁</span>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              DATASET GROWTH TRACKER
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>polling…</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={load}
              title="Refresh now"
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 13 }}
            >↻</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Summary bar */}
          {rows.length > 0 && (
            <div style={{
              display: "flex", gap: 16, padding: "8px 14px",
              borderBottom: `1px solid ${CY}18`, flexShrink: 0,
            }}>
              <Stat label="DATASETS"  value={rows.length} color={CY} />
              <Stat label="GROWING"   value={rows.filter(r => r.delta > 0).length} color={GN} />
              <Stat label="SHRINKING" value={rows.filter(r => r.delta < 0).length} color={RD} />
              <Stat label="STABLE"    value={rows.filter(r => r.delta === 0).length} color={AM} />
            </div>
          )}

          {/* Dataset rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {rows.length === 0 && !loading && (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#4E6A7A", fontSize: 10, letterSpacing: 1 }}>
                No datasets loaded. Polling /v1/datasets…
              </div>
            )}
            {rows.map((r) => (
              <DatasetRow
                key={r.name}
                row={r}
                isTop={topGrowth && r.name === topGrowth.name && r.delta > 0}
              />
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${CY}18`, flexShrink: 0,
            fontSize: 8, color: "#4E6A7A", letterSpacing: 1,
          }}>
            /v1/datasets · up to {MAX_HIST} readings/dataset in localStorage · auto-poll {POLL / 1000} s
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 7, color: "#4E6A7A", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DatasetRow({ row, isTop }) {
  const deltaColor = row.delta > 0 ? GN : row.delta < 0 ? RD : AM;
  const trendSymbol = row.delta > 0 ? "↑" : row.delta < 0 ? "↓" : "→";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 14px",
      borderBottom: `1px solid ${isTop ? `${CY}22` : "#0F1E2A"}`,
      background: isTop ? `${CY}06` : "transparent",
    }}>
      {/* Trend symbol */}
      <span style={{ width: 14, textAlign: "center", fontSize: 14, color: deltaColor, flexShrink: 0 }}>
        {trendSymbol}
      </span>

      {/* Name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, color: isTop ? CY : "#C8DDF0", fontWeight: isTop ? 700 : 400,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {row.name}
        </div>
        <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 2 }}>
          {row.count !== null ? `${fmt(row.count)} rows` : "—"}
          {row.delta !== 0 && (
            <span style={{ color: deltaColor, marginLeft: 6 }}>
              {row.delta > 0 ? "+" : ""}{fmt(row.delta)} Δ
            </span>
          )}
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline values={row.history} color={deltaColor} />
    </div>
  );
}

function Sparkline({ values, color }) {
  if (!values || values.length < 2) {
    return <div style={{ width: 80, height: 28, background: "#0F1E2A", borderRadius: 3 }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 80, H = 28, pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} style={{ flexShrink: 0, background: "#0A1520", borderRadius: 3 }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}88)` }}
      />
    </svg>
  );
}

// ── data helpers ──────────────────────────────────────────────────────────────

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.datasets) ? d.datasets
    : Array.isArray(d?.results) ? d.results
    : [];
  return arr;
}

function extractRowCount(ds) {
  const v =
    ds.row_count ?? ds.rows ?? ds.count ?? ds.num_rows ?? ds.size ??
    ds.record_count ?? ds.records ?? ds.total_rows ?? ds.total ?? null;
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch (_) { return {}; }
}

function saveHistory(h) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(h)); } catch (_) {}
}

function updateHistory(history, datasets, ts) {
  for (const ds of datasets) {
    const name = ds.name || ds.id || ds.dataset_id || ds.title || "unknown";
    const count = extractRowCount(ds);
    if (count === null) continue;
    if (!history[name]) history[name] = [];
    history[name].push({ ts, count });
    if (history[name].length > MAX_HIST) history[name] = history[name].slice(-MAX_HIST);
  }
}

function buildRows(history, datasets) {
  const rows = [];
  for (const ds of datasets) {
    const name = ds.name || ds.id || ds.dataset_id || ds.title || "unknown";
    const hist = history[name] || [];
    const current = hist.length > 0 ? hist[hist.length - 1].count : null;
    const prev    = hist.length > 1 ? hist[hist.length - 2].count : null;
    const delta   = current !== null && prev !== null ? current - prev : 0;
    rows.push({
      name,
      count: current,
      delta,
      history: hist.map((h) => h.count),
    });
  }
  // Sort: growing first, then by absolute delta desc
  rows.sort((a, b) => {
    if (a.delta !== b.delta) return b.delta - a.delta;
    return (b.count ?? 0) - (a.count ?? 0);
  });
  return rows;
}

function fastestGrowing(history, datasets) {
  const rows = buildRows(history, datasets);
  const growing = rows.filter((r) => r.delta > 0);
  if (!growing.length) return null;
  return growing[0];
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
