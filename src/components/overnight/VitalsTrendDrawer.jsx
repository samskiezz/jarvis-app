/**
 * F171 — Vitals Trend Drawer
 *
 * Right-edge slide-in at 5.5% vertical.
 * Fetches GET /v1/vitals/trend?metric={hr,hrv,spo2}&hours=24 for each metric.
 * Shows an SVG sparkline + latest reading per metric.
 * Polls every 5 minutes while open.
 * Accent: rose (#F43F5E).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 5 * 60 * 1000;

const C = {
  bg:     "#0a0f1e",
  panel:  "#0d1424",
  border: "#1e3a5f",
  accent: "#F43F5E",
  dim:    "#4b6a8a",
  text:   "#c8d6e8",
  muted:  "#6b8caf",
};

const METRICS = [
  { key: "hr",        label: "Heart Rate",   unit: "bpm", color: "#F43F5E" },
  { key: "hrv",       label: "HRV",          unit: "ms",  color: "#FB923C" },
  { key: "spo2",      label: "SpO2",         unit: "%",   color: "#34D399" },
];

function Sparkline({ points, color, width = 240, height = 36 }) {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke={color + "44"} strokeWidth={1} strokeDasharray="4 4" />
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle"
          fill={C.muted} fontSize={9} fontFamily="monospace">
          NO DATA
        </text>
      </svg>
    );
  }

  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV - minV || 1;

  const pad = 3;
  const W = width - pad * 2;
  const H = height - pad * 2;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * W;
    const y = pad + H - ((p.value - minV) / rangeV) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const latest = values[values.length - 1];
  const latestY = pad + H - ((latest - minV) / rangeV) * H;
  const latestX = pad + W;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* area fill */}
      <path
        d={`M ${coords[0]} L ${coords.join(" L ")} L ${latestX.toFixed(1)},${(pad + H).toFixed(1)} L ${pad},${(pad + H).toFixed(1)} Z`}
        fill={`url(#sg-${color.replace("#", "")})`}
      />
      {/* line */}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* latest dot */}
      <circle cx={latestX} cy={latestY} r={3} fill={color} />
    </svg>
  );
}

export default function VitalsTrendDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData]   = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        METRICS.map((m) =>
          kimiClient
            .request(`/v1/vitals/trend?metric=${m.key}&hours=24`)
            .then((d) => ({ key: m.key, points: d?.points ?? [] }))
            .catch(() => ({ key: m.key, points: [] }))
        )
      );
      const map = {};
      for (const r of results) map[r.key] = r.points;
      setData(map);
    } catch (e) {
      setError(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchAll();
    timerRef.current = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  const tabStyle = {
    position: "fixed",
    right: open ? 340 : 0,
    top: "5.5%",
    transform: "translateY(-50%)",
    zIndex: 3800,
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    background: C.panel,
    border: `1px solid ${C.accent}`,
    borderRight: open ? "none" : `1px solid ${C.accent}`,
    color: C.accent,
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1,
    padding: "10px 5px",
    cursor: "pointer",
    borderRadius: open ? "6px 0 0 6px" : 6,
    transition: "right 0.3s ease",
    userSelect: "none",
    boxShadow: open ? "none" : `0 0 8px ${C.accent}44`,
  };

  const panelStyle = {
    position: "fixed",
    right: open ? 0 : -340,
    top: 0,
    height: "100vh",
    width: 340,
    background: C.bg,
    borderLeft: `1px solid ${C.border}`,
    zIndex: 3799,
    display: "flex",
    flexDirection: "column",
    transition: "right 0.3s ease",
    fontFamily: "monospace",
    overflow: "hidden",
  };

  return (
    <>
      <div style={tabStyle} onClick={() => setOpen((v) => !v)}>
        {open ? "▶" : "◀"} VITALS
      </div>

      <div style={panelStyle}>
        {/* header */}
        <div style={{
          padding: "10px 12px 8px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ color: C.accent, fontSize: 11, letterSpacing: 1 }}>
            ◈ VITALS TREND · 24 H
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {loading && (
              <span style={{ color: C.muted, fontSize: 9 }}>LOADING…</span>
            )}
            <button
              onClick={fetchAll}
              style={{
                background: "none", border: `1px solid ${C.border}`,
                borderRadius: 3, color: C.muted, cursor: "pointer",
                fontSize: 9, padding: "2px 6px", letterSpacing: 1,
              }}
            >
              ↻
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: C.dim,
                cursor: "pointer", fontSize: 14, padding: "0 2px",
              }}
            >
              ×
            </button>
          </span>
        </div>

        {/* body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 14px" }}>
          {error && (
            <div style={{
              color: "#F87171", fontSize: 10, padding: "8px 0",
              borderBottom: `1px solid ${C.border}`,
            }}>
              ⚠ {error}
            </div>
          )}

          {METRICS.map((m) => {
            const pts = data[m.key] ?? [];
            const latest = pts.length ? pts[pts.length - 1].value : null;
            const oldest = pts.length ? pts[0].value : null;
            const delta = latest !== null && oldest !== null ? latest - oldest : null;

            return (
              <div
                key={m.key}
                style={{
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: `1px solid ${C.border}22`,
                }}
              >
                {/* metric header row */}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", marginBottom: 6,
                }}>
                  <span style={{ color: m.color, fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>
                    {m.label.toUpperCase()}
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    {latest !== null ? (
                      <>
                        <span style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>
                          {latest.toFixed(m.key === "spo2" ? 1 : 0)}
                        </span>
                        <span style={{ color: C.muted, fontSize: 9 }}>{m.unit}</span>
                      </>
                    ) : (
                      <span style={{ color: C.dim, fontSize: 10 }}>—</span>
                    )}
                    {delta !== null && (
                      <span style={{
                        fontSize: 9,
                        color: delta > 0 ? "#34D399" : delta < 0 ? "#F87171" : C.muted,
                      }}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(m.key === "spo2" ? 1 : 0)}
                      </span>
                    )}
                  </span>
                </div>

                {/* sparkline */}
                <Sparkline points={pts} color={m.color} width={294} height={40} />

                {/* point count */}
                <div style={{ color: C.dim, fontSize: 8, marginTop: 4, letterSpacing: 0.5 }}>
                  {pts.length} readings · last 24 h
                </div>
              </div>
            );
          })}

          {!loading && Object.keys(data).length === 0 && !error && (
            <div style={{ color: C.dim, fontSize: 10, paddingTop: 20, textAlign: "center" }}>
              NO VITALS DATA
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: "6px 12px",
          borderTop: `1px solid ${C.border}`,
          color: C.dim,
          fontSize: 8,
          letterSpacing: 0.5,
          flexShrink: 0,
        }}>
          SOURCE: /v1/vitals/trend · POLLS EVERY 5 MIN
        </div>
      </div>
    </>
  );
}
