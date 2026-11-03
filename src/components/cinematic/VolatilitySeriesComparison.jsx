/**
 * VolatilitySeriesComparison — F310.
 *
 * Multi-select up to 4 series from GET /v1/history/series.
 * Fetches GET /v1/temporal/patterns?series_id= for each selected series in parallel.
 * Response per series: { series_id, anomalies:[{t,value,z,kind}], n_anomalies, volatility, windows:[{t0,t1,vol}] }
 *
 * Renders stacked horizontal SVG bands:
 *   rows = series names (y-axis labels on left)
 *   x = shared time axis (union of all window ranges)
 *   cell colour = rolling_volatility intensity (blue → amber → red HSL)
 *   anomaly z-score spikes = vertical tick bars, height ∝ |z|
 * Hover cross-hair snaps to nearest window point across all bands.
 * ASSESS speaks about which series is most volatile + co-occurring anomalies → TTS.
 *
 * Button: ◈ VOLCOMP (left:221400, zIndex:406). Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3B6B";
const GREEN = "#00c878";
const BLUE  = "#0096D4";

const BTN_LEFT  = 221400;
const Z_IDX     = 406;
const MAX_SERIES = 4;
const BAND_H    = 48;
const BAND_GAP  = 10;
const LABEL_W   = 100;
const AXIS_H    = 20;
const SVG_W     = 560;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── intent helpers ────────────────────────────────────────────────────────────

const VOLCOMP_RE = /volatil.{0,20}(?:series|compar|compare)|volcomp\b/i;

export function isVolcompQuery(q) {
  return VOLCOMP_RE.test(q || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function normaliseSeriesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.series)) return raw.series;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function seriesId(s) {
  return typeof s === "string" ? s : s.series_id || s.id || "";
}

function volColor(vol, maxVol) {
  if (maxVol <= 0) return "hsl(200,60%,18%)";
  const r = Math.min(vol / maxVol, 1);
  if (r < 0.5) {
    const h = Math.round(200 - r * 2 * 160); // 200 (blue) → 40 (amber)
    const l = Math.round(20 + r * 20);
    return `hsl(${h},80%,${l}%)`;
  }
  const r2 = (r - 0.5) * 2;
  const h = Math.round(40 - r2 * 40); // 40 (amber) → 0 (red)
  return `hsl(${h},90%,${Math.round(40 - r2 * 10)}%)`;
}

function buildTimeRange(allData) {
  let tMin = Infinity, tMax = -Infinity;
  allData.forEach((d) => {
    (d.windows || []).forEach((w) => {
      if (w.t0 < tMin) tMin = w.t0;
      if (w.t1 > tMax) tMax = w.t1;
    });
    (d.anomalies || []).forEach((a) => {
      if (a.t < tMin) tMin = a.t;
      if (a.t > tMax) tMax = a.t;
    });
  });
  return tMin === Infinity ? [0, 1] : [tMin, tMax];
}

function toPx(t, tMin, tMax) {
  if (tMax === tMin) return LABEL_W;
  return LABEL_W + ((t - tMin) / (tMax - tMin)) * (SVG_W - LABEL_W - 8);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function VolatilitySeriesComparison() {
  const [visible, setVisible]       = useState(false);
  const [allSeries, setAllSeries]   = useState([]);
  const [selected, setSelected]     = useState([]);   // up to 4 series_id strings
  const [data, setData]             = useState({});   // { series_id: patternsData }
  const [loading, setLoading]       = useState(false);
  const [hoverX, setHoverX]         = useState(null); // px x in SVG
  const [tooltip, setTooltip]       = useState(null); // {text, x, y}
  const [assessing, setAssessing]   = useState(false);
  const svgRef                      = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:volcomp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:volcomp-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetch(`${apiBase()}/v1/history/series`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then((r) => r.json())
      .then((raw) => {
        const list = normaliseSeriesList(raw);
        setAllSeries(list);
        if (selected.length === 0 && list.length > 0) {
          const first = seriesId(list[0]);
          if (first) setSelected([first]);
        }
      })
      .catch(() => {});
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPatterns = useCallback(async () => {
    if (selected.length === 0) return;
    setLoading(true);
    const results = await Promise.all(
      selected.map((sid) =>
        fetch(
          `${apiBase()}/v1/temporal/patterns?series_id=${encodeURIComponent(sid)}`,
          { headers: { Authorization: `Bearer ${API_KEY}` } }
        )
          .then((r) => r.json())
          .catch(() => ({ series_id: sid, windows: [], anomalies: [], volatility: 0, n_anomalies: 0 }))
      )
    );
    const map = {};
    results.forEach((d) => {
      const id = d.series_id || selected[results.indexOf(d)];
      map[id] = d;
    });
    setData(map);
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    if (visible && selected.length > 0) fetchPatterns();
  }, [visible, selected, fetchPatterns]);

  function toggleSeries(sid) {
    setSelected((prev) => {
      if (prev.includes(sid)) return prev.filter((x) => x !== sid);
      if (prev.length >= MAX_SERIES) return prev;
      return [...prev, sid];
    });
  }

  const allData = selected.map((sid) => data[sid]).filter(Boolean);
  const [tMin, tMax] = allData.length > 0 ? buildTimeRange(allData) : [0, 1];

  const maxVolGlobal = allData.reduce((mx, d) => {
    const mv = (d.windows || []).reduce((m, w) => Math.max(m, w.vol), 0);
    return Math.max(mx, mv);
  }, 0);

  const svgH = selected.length * (BAND_H + BAND_GAP) + AXIS_H + 8;

  function onSvgMouseMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverX(x);

    // Find nearest window point across all series
    const tAtX = tMin + ((x - LABEL_W) / (SVG_W - LABEL_W - 8)) * (tMax - tMin);
    let nearest = null, bestDist = Infinity;
    allData.forEach((d) => {
      (d.windows || []).forEach((w) => {
        const wMid = (w.t0 + w.t1) / 2;
        const dist = Math.abs(wMid - tAtX);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = { series: d.series_id, t: wMid, vol: w.vol, t0: w.t0, t1: w.t1 };
        }
      });
    });
    if (nearest) {
      setTooltip({
        text: `${nearest.series}: vol=${nearest.vol.toFixed(4)} · ${new Date(nearest.t0).toISOString().slice(0, 10)}`,
        x: e.clientX,
        y: e.clientY,
      });
    }
  }

  async function assess() {
    setAssessing(true);
    const summaries = allData.map((d) => {
      const mvol = (d.windows || []).reduce((m, w) => Math.max(m, w.vol), 0);
      return `${d.series_id}: mean_vol=${d.volatility?.toFixed(4)}, max_vol=${mvol.toFixed(4)}, anomalies=${d.n_anomalies}`;
    }).join("; ");
    const prompt = `As JARVIS, briefly assess these volatility series: ${summaries}. Which is most volatile? When did anomalies co-occur? Respond in 2 sentences.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Volatility series assessment unavailable, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Volatility comparison assessment is temporarily unavailable, sir." },
        })
      );
    }
    setAssessing(false);
  }

  const mostVolatile = allData.length > 0
    ? allData.reduce((best, d) => (d.volatility > best.volatility ? d : best), allData[0])
    : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Volatility Series Comparison (F310)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: Z_IDX,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ VOLCOMP
        {mostVolatile && visible && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{selected.length}</span>
        )}
      </button>

      {visible && (
        <div
          style={{
            position: "fixed", bottom: 32, left: BTN_LEFT - 380, zIndex: Z_IDX,
            width: 700, maxHeight: "82vh", overflowY: "auto",
            background: "rgba(6,11,18,0.96)",
            border: `1px solid ${CY}44`,
            borderRadius: 10, padding: "14px 16px",
            fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
            backdropFilter: "blur(12px)",
            boxShadow: `0 0 60px ${CY}18`,
          }}
          onClick={() => setTooltip(null)}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ VOLATILITY SERIES COMPARISON
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); fetchPatterns(); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={(e) => { e.stopPropagation(); assess(); }}
              disabled={assessing || allData.length === 0}
              style={{
                background: assessing ? "#1a2530" : `${CY}18`,
                color: assessing ? "#445566" : CY,
                border: `1px solid ${CY}44`,
                borderRadius: 3, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                letterSpacing: 1, cursor: assessing || allData.length === 0 ? "default" : "pointer",
              }}
            >{assessing ? "…" : "▶ ASSESS"}</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#445566", cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Series selector */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: "#556677", fontSize: 7, letterSpacing: 1, marginBottom: 5 }}>
              SELECT UP TO {MAX_SERIES} SERIES ({selected.length}/{MAX_SERIES} active)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {allSeries.length === 0 && (
                <span style={{ color: "#334455", fontSize: 8 }}>loading series…</span>
              )}
              {allSeries.map((s) => {
                const sid = seriesId(s);
                const active = selected.includes(sid);
                const disabled = !active && selected.length >= MAX_SERIES;
                return (
                  <button
                    key={sid}
                    onClick={(e) => { e.stopPropagation(); toggleSeries(sid); }}
                    disabled={disabled}
                    style={{
                      background: active ? `${CY}22` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${active ? CY : "#223344"}`,
                      color: active ? CY : disabled ? "#334455" : "#7A8F9E",
                      borderRadius: 3, padding: "2px 7px", fontSize: 7,
                      cursor: disabled ? "default" : "pointer", letterSpacing: 1,
                      transition: "all 0.15s",
                    }}
                  >{sid}</button>
                );
              })}
            </div>
          </div>

          {/* Stats row */}
          {allData.length > 0 && !loading && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {allData.map((d) => (
                <div
                  key={d.series_id}
                  style={{
                    background: d === mostVolatile ? `${AMBER}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${d === mostVolatile ? AMBER : "#223344"}`,
                    borderRadius: 5, padding: "4px 8px", minWidth: 120,
                  }}
                >
                  <div style={{ color: d === mostVolatile ? AMBER : CY, fontSize: 8, letterSpacing: 1 }}>
                    {d.series_id}
                    {d === mostVolatile && <span style={{ marginLeft: 4, fontSize: 7 }}>★ MOST VOLATILE</span>}
                  </div>
                  <div style={{ color: "#556677", fontSize: 7, marginTop: 2 }}>
                    vol={d.volatility?.toFixed(4)} · {d.n_anomalies} anom
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SVG bands */}
          {loading ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              loading volatility data…
            </div>
          ) : selected.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              Select at least one series above.
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <svg
                ref={svgRef}
                width={SVG_W}
                height={svgH}
                style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
                onMouseMove={onSvgMouseMove}
                onMouseLeave={() => { setHoverX(null); setTooltip(null); }}
                onClick={(e) => e.stopPropagation()}
              >
                {selected.map((sid, si) => {
                  const d = data[sid];
                  const bY = si * (BAND_H + BAND_GAP);
                  const windows = d?.windows || [];
                  const anomalies = d?.anomalies || [];
                  const maxVolLocal = windows.reduce((m, w) => Math.max(m, w.vol), 0);

                  return (
                    <g key={sid}>
                      {/* Band background */}
                      <rect
                        x={LABEL_W}
                        y={bY}
                        width={SVG_W - LABEL_W - 8}
                        height={BAND_H}
                        rx={2}
                        fill="rgba(255,255,255,0.02)"
                        stroke="#1a2530"
                        strokeWidth={0.5}
                      />

                      {/* Series label */}
                      <text
                        x={LABEL_W - 4}
                        y={bY + BAND_H / 2 + 4}
                        textAnchor="end"
                        style={{ fontSize: 7, fill: d?.series_id === mostVolatile?.series_id ? AMBER : CY, fontFamily: "'JetBrains Mono',monospace" }}
                      >
                        {sid.length > 14 ? sid.slice(0, 13) + "…" : sid}
                      </text>

                      {/* Anomaly count badge */}
                      {(d?.n_anomalies || 0) > 0 && (
                        <text
                          x={LABEL_W - 4}
                          y={bY + BAND_H - 4}
                          textAnchor="end"
                          style={{ fontSize: 6, fill: RED, fontFamily: "'JetBrains Mono',monospace" }}
                        >⚠{d.n_anomalies}</text>
                      )}

                      {/* Volatility window rects */}
                      {windows.map((w, wi) => {
                        const x0 = toPx(w.t0, tMin, tMax);
                        const x1 = toPx(w.t1, tMin, tMax);
                        const ww = Math.max(x1 - x0, 1);
                        return (
                          <rect
                            key={wi}
                            x={x0}
                            y={bY + 2}
                            width={ww}
                            height={BAND_H - 4}
                            rx={1}
                            fill={volColor(w.vol, maxVolGlobal > 0 ? maxVolGlobal : maxVolLocal)}
                            opacity={0.85}
                          />
                        );
                      })}

                      {/* Anomaly z-score spike bars */}
                      {anomalies.map((a, ai) => {
                        const ax = toPx(a.t, tMin, tMax);
                        const maxZ = 4;
                        const relZ = Math.min(Math.abs(a.z) / maxZ, 1);
                        const barH = relZ * (BAND_H - 6);
                        return (
                          <g key={ai}>
                            <line
                              x1={ax}
                              y1={bY + BAND_H - 3}
                              x2={ax}
                              y2={bY + BAND_H - 3 - barH}
                              stroke={a.z > 0 ? RED : BLUE}
                              strokeWidth={1.5}
                              opacity={0.9}
                            />
                            <circle
                              cx={ax}
                              cy={bY + BAND_H - 3 - barH}
                              r={1.5}
                              fill={a.z > 0 ? RED : BLUE}
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Hover cross-hair */}
                {hoverX !== null && hoverX >= LABEL_W && (
                  <line
                    x1={hoverX}
                    y1={0}
                    x2={hoverX}
                    y2={selected.length * (BAND_H + BAND_GAP)}
                    stroke={`${CY}77`}
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    pointerEvents="none"
                  />
                )}

                {/* Time axis labels */}
                {allData.length > 0 && tMin !== tMax && (
                  <>
                    <text
                      x={LABEL_W}
                      y={selected.length * (BAND_H + BAND_GAP) + 14}
                      style={{ fontSize: 7, fill: "#334455", fontFamily: "'JetBrains Mono',monospace" }}
                    >{new Date(tMin).toISOString().slice(0, 10)}</text>
                    <text
                      x={SVG_W - 8}
                      y={selected.length * (BAND_H + BAND_GAP) + 14}
                      textAnchor="end"
                      style={{ fontSize: 7, fill: "#334455", fontFamily: "'JetBrains Mono',monospace" }}
                    >{new Date(tMax).toISOString().slice(0, 10)}</text>
                  </>
                )}
              </svg>

              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{
                    height: 6, width: 80,
                    background: "linear-gradient(90deg, hsl(200,80%,22%), hsl(40,90%,40%), hsl(0,90%,38%))",
                    borderRadius: 3,
                  }} />
                  <span style={{ color: "#334455", fontSize: 7 }}>volatility</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 1.5, height: 10, background: RED }} />
                  <span style={{ color: "#334455", fontSize: 7 }}>▲ spike</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 1.5, height: 10, background: BLUE }} />
                  <span style={{ color: "#334455", fontSize: 7 }}>▼ drop</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/history/series · /v1/temporal/patterns · hover for cross-hair · spike height ∝ |z-score|
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(tooltip.x + 12, window.innerWidth - 300),
            top: Math.max(tooltip.y - 60, 8),
            zIndex: Z_IDX + 10,
            background: "rgba(6,11,18,0.97)",
            border: `1px solid ${CY}55`,
            borderRadius: 6, padding: "8px 12px",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
            color: "#DCEBF5", minWidth: 200,
            pointerEvents: "none",
            boxShadow: `0 0 20px ${CY}22`,
          }}
        >
          <span style={{ color: CY }}>{tooltip.text}</span>
        </div>
      )}
    </>
  );
}
