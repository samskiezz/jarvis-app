/**
 * AnomalyVolatilityHeatmap — F285.
 *
 * Series selector (GET /v1/history/series) → GET /v1/temporal/patterns?series_id=
 * Response: { series_id, anomalies:[{t,value,z,kind}], n_anomalies, volatility, windows:[{t0,t1,vol}] }
 *
 * Renders a 2-D SVG grid: rows = ISO weeks, columns = day of week (Mon-Sun).
 * Cell color = volatility level via CSS HSL blue→amber→red.
 * Click cell → tooltip: date, z-score (if anomaly falls in window), volatility, anomaly flag.
 * Stats sidebar: peak volatility date, mean z-score, anomaly count.
 * ASSESS button → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier.
 *
 * Button: ◈ ANVOHTM (left:207400, zIndex:381). Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const RED    = "#FF3B6B";
const GREEN  = "#00c878";
const BLUE   = "#0096D4";

const BTN_LEFT = 207400;
const Z_IDX    = 381;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// ── intent helpers ─────────────────────────────────────────────────────────────

const ANVOHTM_RE =
  /anomaly.{0,20}volatil|volatil.{0,20}heatmap|anvohtm\b/i;

export function isAnvohtmQuery(q) {
  return ANVOHTM_RE.test(q || "");
}

// ── helpers ────────────────────────────────────────────────────────────────────

function normaliseSeriesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.series)) return raw.series;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function isoWeekKey(ts) {
  const d = new Date(ts);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function dayOfWeekIndex(ts) {
  const day = new Date(ts).getDay(); // 0=Sun
  return day === 0 ? 6 : day - 1;   // remap: 0=Mon … 6=Sun
}

function volatilityColor(vol, maxVol) {
  if (maxVol <= 0) return "hsl(200,60%,25%)";
  const ratio = Math.min(vol / maxVol, 1);
  if (ratio < 0.5) {
    const h = 200 + ratio * 2 * (40 - 200); // 200 (blue) → 40 (amber)
    return `hsl(${Math.round(200 - ratio * 2 * 160)},80%,${Math.round(20 + ratio * 20)}%)`;
  }
  const r = (ratio - 0.5) * 2;
  const h = Math.round(40 - r * 40); // 40 (amber) → 0 (red)
  return `hsl(${h},90%,${Math.round(40 - r * 10)}%)`;
}

function buildGrid(windows, anomalies) {
  const anomalyByWindow = {};
  anomalies.forEach((a) => {
    const idx = windows.findIndex((w) => a.t >= w.t0 && a.t <= w.t1);
    if (idx >= 0) {
      if (!anomalyByWindow[idx]) anomalyByWindow[idx] = [];
      anomalyByWindow[idx].push(a);
    }
  });

  const weekOrder = [];
  const weekSet = new Set();
  windows.forEach((w) => {
    const key = isoWeekKey(w.t0);
    if (!weekSet.has(key)) { weekSet.add(key); weekOrder.push(key); }
  });

  const cells = {};
  windows.forEach((w, i) => {
    const week = isoWeekKey(w.t0);
    const day  = dayOfWeekIndex(w.t0);
    const key  = `${week}|${day}`;
    const prev = cells[key];
    if (!prev || w.vol > prev.vol) {
      cells[key] = {
        week, day, vol: w.vol, t0: w.t0, t1: w.t1,
        anomalies: anomalyByWindow[i] || [],
      };
    }
  });

  return { weekOrder, cells };
}

// ── component ──────────────────────────────────────────────────────────────────

export default function AnomalyVolatilityHeatmap() {
  const [visible, setVisible]       = useState(false);
  const [seriesList, setSeriesList] = useState([]);
  const [seriesId, setSeriesId]     = useState("");
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [tooltip, setTooltip]       = useState(null); // {cell, x, y}
  const [assessing, setAssessing]   = useState(false);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:anvohtm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:anvohtm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetch(`${apiBase()}/v1/history/series`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then((r) => r.json())
      .then((raw) => {
        const list = normaliseSeriesList(raw);
        setSeriesList(list);
        if (list.length > 0 && !seriesId) {
          const first = list[0]?.series_id || list[0]?.id || list[0];
          if (typeof first === "string") setSeriesId(first);
        }
      })
      .catch(() => {});
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPatterns = useCallback(() => {
    if (!seriesId) return;
    setLoading(true);
    fetch(`${apiBase()}/v1/temporal/patterns?series_id=${encodeURIComponent(seriesId)}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [seriesId]);

  useEffect(() => {
    if (visible && seriesId) fetchPatterns();
  }, [visible, seriesId, fetchPatterns]);

  async function assess() {
    if (!data) return;
    setAssessing(true);
    const prompt = `As JARVIS, provide a 2-sentence assessment of anomaly volatility for series "${data.series_id}". There are ${data.n_anomalies} anomalies detected. Mean volatility is ${data.volatility?.toFixed(4)}. Describe what the heatmap pattern implies operationally.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        `Anomaly volatility assessment for ${data.series_id} is unavailable, sir.`;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Volatility assessment is temporarily unavailable, sir." },
        })
      );
    }
    setAssessing(false);
  }

  const anomalyCount   = data?.n_anomalies ?? 0;
  const meanVol        = data?.volatility ?? 0;
  const windows        = data?.windows ?? [];
  const anomalies      = data?.anomalies ?? [];
  const maxVol         = windows.length > 0 ? Math.max(...windows.map((w) => w.vol)) : 0;

  const peakWindow = windows.length > 0
    ? windows.reduce((best, w) => (w.vol > best.vol ? w : best), windows[0])
    : null;
  const peakDate = peakWindow
    ? new Date(peakWindow.t0).toISOString().slice(0, 10)
    : "—";

  const meanZ = anomalies.length > 0
    ? (anomalies.reduce((s, a) => s + Math.abs(a.z), 0) / anomalies.length).toFixed(2)
    : "0.00";

  const { weekOrder, cells } = windows.length > 0
    ? buildGrid(windows, anomalies)
    : { weekOrder: [], cells: {} };

  const CELL = 18;
  const GAP  = 2;
  const svgW = 7 * (CELL + GAP) + 28;
  const svgH = weekOrder.length * (CELL + GAP) + 20;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Anomaly Volatility Heatmap (F285)"
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
        ◈ ANVOHTM
        {anomalyCount > 0 && visible && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{anomalyCount}</span>
        )}
      </button>

      {visible && (
        <div
          style={{
            position: "fixed", bottom: 32, left: BTN_LEFT - 320, zIndex: Z_IDX,
            width: 640, maxHeight: "80vh", overflowY: "auto",
            background: "rgba(6,11,18,0.95)",
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
              ◈ ANOMALY VOLATILITY HEATMAP
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
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#445566", cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Series selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "#556677", fontSize: 8, letterSpacing: 1 }}>SERIES</span>
            <select
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgba(0,150,212,0.08)", border: `1px solid ${CY}33`,
                color: CY, borderRadius: 4, padding: "3px 8px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                cursor: "pointer", flex: 1, maxWidth: 280,
              }}
            >
              {seriesList.length === 0 && <option value="">loading…</option>}
              {seriesList.map((s) => {
                const id = typeof s === "string" ? s : s.series_id || s.id || "";
                return <option key={id} value={id}>{id}</option>;
              })}
            </select>
            <button
              onClick={(e) => { e.stopPropagation(); assess(); }}
              disabled={assessing || !data}
              style={{
                background: assessing ? "#1a2530" : `${CY}18`,
                color: assessing ? "#445566" : CY,
                border: `1px solid ${CY}44`,
                borderRadius: 3, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                letterSpacing: 1, cursor: assessing || !data ? "default" : "pointer",
              }}
            >{assessing ? "…" : "▶ ASSESS"}</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>
            {[
              ["ANOMALY COUNT", loading ? "…" : anomalyCount, RED],
              ["MEAN |Z-SCORE|", loading ? "…" : meanZ, AMBER],
              ["PEAK VOL DATE", loading ? "…" : peakDate, BLUE],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: "#445566", fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Heatmap + sidebar */}
          {loading ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              loading volatility data…
            </div>
          ) : weekOrder.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              {seriesId ? "No windowed data for this series." : "Select a series above."}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16 }}>
              {/* SVG grid */}
              <div style={{ position: "relative" }}>
                <svg
                  width={svgW}
                  height={svgH + 16}
                  style={{ display: "block", overflow: "visible" }}
                >
                  {/* Day-of-week headers */}
                  {DAY_LABELS.map((lbl, di) => (
                    <text
                      key={lbl}
                      x={28 + di * (CELL + GAP) + CELL / 2}
                      y={10}
                      textAnchor="middle"
                      style={{ fontSize: 7, fill: "#445566", fontFamily: "'JetBrains Mono',monospace" }}
                    >{lbl}</text>
                  ))}

                  {weekOrder.map((week, wi) => (
                    <g key={week}>
                      <text
                        x={0}
                        y={16 + wi * (CELL + GAP) + CELL / 2 + 2}
                        style={{ fontSize: 6, fill: "#334455", fontFamily: "'JetBrains Mono',monospace" }}
                      >W{week.slice(-2)}</text>
                      {DAY_LABELS.map((_, di) => {
                        const cell = cells[`${week}|${di}`];
                        const filled = !!cell;
                        const color = filled ? volatilityColor(cell.vol, maxVol) : "rgba(255,255,255,0.03)";
                        const hasAnom = filled && cell.anomalies.length > 0;
                        return (
                          <g key={di}>
                            <rect
                              x={28 + di * (CELL + GAP)}
                              y={16 + wi * (CELL + GAP)}
                              width={CELL}
                              height={CELL}
                              rx={2}
                              fill={color}
                              stroke={hasAnom ? RED : "rgba(255,255,255,0.05)"}
                              strokeWidth={hasAnom ? 1.5 : 0.5}
                              style={{ cursor: filled ? "pointer" : "default" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!filled) return;
                                setTooltip({ cell, x: e.clientX, y: e.clientY });
                              }}
                            />
                            {hasAnom && (
                              <text
                                x={28 + di * (CELL + GAP) + CELL / 2}
                                y={16 + wi * (CELL + GAP) + CELL / 2 + 3}
                                textAnchor="middle"
                                style={{ fontSize: 7, fill: RED, pointerEvents: "none" }}
                              >✗</text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </svg>

                {/* Color legend */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ color: "#334455", fontSize: 7 }}>LOW</span>
                  <div style={{
                    height: 6, flex: 1,
                    background: "linear-gradient(90deg, hsl(200,80%,25%), hsl(40,90%,40%), hsl(0,90%,35%))",
                    borderRadius: 3,
                  }} />
                  <span style={{ color: "#334455", fontSize: 7 }}>HIGH</span>
                </div>
              </div>

              {/* Sidebar stats */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#556677", fontSize: 7, letterSpacing: 1, marginBottom: 6 }}>
                  TOP ANOMALIES
                </div>
                {anomalies.length === 0 ? (
                  <div style={{ color: "#334455", fontSize: 8 }}>No anomalies detected.</div>
                ) : (
                  [...anomalies]
                    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
                    .slice(0, 8)
                    .map((a, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex", gap: 6, alignItems: "center",
                          padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          fontSize: 8,
                        }}
                      >
                        <span style={{
                          color: a.kind === "spike_up" ? RED : BLUE,
                          fontSize: 7, flexShrink: 0,
                        }}>{a.kind === "spike_up" ? "▲" : "▼"}</span>
                        <span style={{ color: "#7A8F9E", fontSize: 7, flexShrink: 0 }}>
                          {new Date(a.t).toISOString().slice(0, 10)}
                        </span>
                        <span style={{ color: AMBER, fontSize: 7, flexShrink: 0 }}>
                          z={a.z.toFixed(2)}
                        </span>
                        <span style={{ color: "#445566", fontSize: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          v={a.value.toFixed(3)}
                        </span>
                      </div>
                    ))
                )}

                {/* Mean volatility */}
                <div style={{ marginTop: 10, color: "#556677", fontSize: 7, letterSpacing: 1 }}>MEAN VOLATILITY</div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${maxVol > 0 ? Math.round((meanVol / maxVol) * 100) : 0}%`,
                    background: `linear-gradient(90deg, ${BLUE}, ${AMBER})`,
                    borderRadius: 3,
                  }} />
                </div>
                <div style={{ color: AMBER, fontSize: 9, marginTop: 3 }}>{meanVol.toFixed(4)}</div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/history/series · /v1/temporal/patterns · click cell for detail · ✗ = anomaly window
          </div>
        </div>
      )}

      {/* Cell tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(tooltip.x + 12, window.innerWidth - 240),
            top: Math.max(tooltip.y - 80, 8),
            zIndex: Z_IDX + 10,
            background: "rgba(6,11,18,0.97)",
            border: `1px solid ${CY}55`,
            borderRadius: 6, padding: "10px 12px",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
            color: "#DCEBF5", minWidth: 200,
            pointerEvents: "none",
            boxShadow: `0 0 20px ${CY}22`,
          }}
        >
          <div style={{ color: CY, marginBottom: 4 }}>
            {new Date(tooltip.cell.t0).toISOString().slice(0, 10)} –{" "}
            {new Date(tooltip.cell.t1).toISOString().slice(0, 10)}
          </div>
          <div style={{ color: "#7A8F9E" }}>volatility: <span style={{ color: AMBER }}>{tooltip.cell.vol.toFixed(4)}</span></div>
          {tooltip.cell.anomalies.length > 0 ? (
            <>
              <div style={{ color: RED, marginTop: 4 }}>⚠ {tooltip.cell.anomalies.length} anomaly window(s)</div>
              {tooltip.cell.anomalies.slice(0, 3).map((a, i) => (
                <div key={i} style={{ color: "#556677", fontSize: 7 }}>
                  {a.kind === "spike_up" ? "▲" : "▼"} z={a.z.toFixed(2)} v={a.value.toFixed(3)}
                </div>
              ))}
            </>
          ) : (
            <div style={{ color: GREEN, marginTop: 4 }}>✓ no anomalies</div>
          )}
        </div>
      )}
    </>
  );
}
