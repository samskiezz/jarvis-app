/**
 * MetricForecastEngine — F232.
 *
 * Data sources:
 *   GET /v1/jarvis/analytics/anomalies?limit=30
 *       → {count, anomalies:[{metric,latest,mean,std,zscore,severity}]}
 *   GET /v1/jarvis/analytics/forecast/{metric}
 *       → {metric,n,trend,slope,latest,predicted,rmse,anomaly,forecast:[{step,value}]}
 *
 * Displays:
 *   - Stat tiles: total anomalies / high severity / medium severity / trending-up count
 *   - ALL / HIGH / MEDIUM filter tabs + metric-name search
 *   - Anomaly rows: metric name, z-score bar, severity badge, latest vs mean
 *   - Expand row → lazy-fetch forecast; shows trend/slope/RMSE + 10-step sparkline
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◉ MFCE at left:91920, bottom:8, zIndex:113.
 * Red badge = high severity count, amber badge = any anomaly, no badge = clean.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isMfceQuery(q) / buildMfceScript()
 *
 * Voice triggers: "metric forecast / forecast engine / mfce / metric anomaly /
 *   measurement forecast / predict metric / anomaly forecast / zscore forecast /
 *   forecast metrics / metric predictor"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const RED    = "#F87171";
const GREEN  = "#4ADE80";
const VIOLET = "#A78BFA";
const GRAY   = "#4E6070";

const BTN_LEFT   = 91920;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchAnomalies() {
  const r = await fetch(
    `${apiBase()}/v1/jarvis/analytics/anomalies?limit=30`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`anomalies ${r.status}`);
  return r.json();
}

async function fetchForecast(metric) {
  const r = await fetch(
    `${apiBase()}/v1/jarvis/analytics/forecast/${encodeURIComponent(metric)}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`forecast ${r.status}`);
  return r.json();
}

function fmtNum(v, decimals = 2) {
  if (v == null) return "–";
  return Number(v).toFixed(decimals);
}

function trendIcon(t) {
  if (t === "up")   return "↑";
  if (t === "down") return "↓";
  return "→";
}

function trendColor(t) {
  if (t === "up")   return GREEN;
  if (t === "down") return RED;
  return CY;
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

export function isMfceQuery(q) {
  return /metric.forecast|forecast.engine|mfce\b|metric.anomal|measurement.forecast|predict.metric|anomal.forecast|zscore.forecast|forecast.metrics|metric.predictor|measurement.predict/i.test(
    q || ""
  );
}

export async function buildMfceScript() {
  try {
    const data = await fetchAnomalies();
    window.dispatchEvent(new CustomEvent("jarvis:mfce-toggle"));
    const total  = data?.count ?? 0;
    const highs  = (data?.anomalies ?? []).filter((a) => a.severity === "high");
    const worst  = (data?.anomalies ?? [])[0];
    if (!worst) {
      return "Metric Forecast Engine online, sir. No anomalous measurements detected at this time — all monitored metrics are within normal bounds.";
    }
    const worstDir = worst.zscore > 0 ? "above" : "below";
    return `Metric Forecast Engine active, sir. ${total} measurement anomal${total === 1 ? "y" : "ies"} detected — ${highs.length} high-severity. The most extreme is metric "${worst.metric}" at ${fmtNum(worst.zscore, 2)}σ ${worstDir} its historical mean, with a latest reading of ${fmtNum(worst.latest, 3)} against a mean of ${fmtNum(worst.mean, 3)}. Expanding any metric will surface its linear-regression forecast and step-ahead projections.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:mfce-toggle"));
    return "Metric Forecast Engine open, sir.";
  }
}

// ─── mini sparkline ──────────────────────────────────────────────────────────

function Sparkline({ points, color }) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  const W = 120, H = 28;
  const xs = vals.map((_, i) => (i / (vals.length - 1)) * W);
  const ys = vals.map((v)    => H - ((v - min) / range) * H);
  const d  = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={d} stroke={color} strokeWidth={1.5} fill="none" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.5} fill={color} />
    </svg>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MetricForecastEngine() {
  const [visible,    setVisible]    = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [forecasts,  setForecasts]  = useState({});
  const [fcLoading,  setFcLoading]  = useState({});
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:mfce-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mfce-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchAnomalies();
      setData(d);
    } catch {
      // retain stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const anomalies = data?.anomalies ?? [];
  const total     = data?.count ?? 0;
  const highs     = anomalies.filter((a) => a.severity === "high").length;
  const meds      = anomalies.filter((a) => a.severity === "medium").length;
  const ups       = anomalies.filter((a) => forecasts[a.metric]?.trend === "up").length;

  const badgeColor = highs > 0 ? RED : total > 0 ? AMBER : null;
  const badgeVal   = highs > 0 ? highs : total > 0 ? total : null;

  const visible_rows = anomalies
    .filter((a) => tab === "ALL" || a.severity === tab.toLowerCase())
    .filter((a) => !search || a.metric.toLowerCase().includes(search.toLowerCase()));

  async function handleExpand(metric) {
    if (expanded === metric) { setExpanded(null); return; }
    setExpanded(metric);
    if (forecasts[metric]) return;
    setFcLoading((p) => ({ ...p, [metric]: true }));
    try {
      const fc = await fetchForecast(metric);
      setForecasts((p) => ({ ...p, [metric]: fc }));
    } catch {
      setForecasts((p) => ({ ...p, [metric]: { error: true } }));
    } finally {
      setFcLoading((p) => ({ ...p, [metric]: false }));
    }
  }

  async function handleAssess() {
    setAssessing(true);
    try {
      const worst  = anomalies[0];
      const context = worst
        ? `top anomaly: metric="${worst.metric}" zscore=${fmtNum(worst.zscore)}, severity=${worst.severity}, latest=${fmtNum(worst.latest)}, mean=${fmtNum(worst.mean)}, total_anomalies=${total}`
        : `no anomalies, total_checked=${total}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Interpret this JARVIS metric anomaly snapshot in 2 sentences: ${context}. Focus on what the most extreme deviation means operationally.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.reply || d.message || "Assessment complete.";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          zIndex: 113,
          background: visible ? `${CY}22` : "rgba(5,10,18,0.82)",
          border: `1px solid ${visible ? CY : CY + "55"}`,
          borderRadius: 6,
          padding: "3px 9px",
          color: visible ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◉ MFCE
        {badgeVal != null && (
          <span
            style={{
              marginLeft: 5,
              background: badgeColor + "33",
              border: `1px solid ${badgeColor}66`,
              borderRadius: 3,
              padding: "0 4px",
              color: badgeColor,
              fontSize: 9,
            }}
          >
            {badgeVal}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 38,
            left: `min(${BTN_LEFT - 330}px, calc(100vw - 490px))`,
            width: 460,
            maxHeight: "74vh",
            overflowY: "auto",
            zIndex: 114,
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderRadius: 12,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 60px ${CY}18, 0 20px 40px rgba(0,0,0,0.8)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}33`,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◉ METRIC FORECAST ENGINE
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: GRAY, fontSize: 9 }}>◌ LOADING</span>
              )}
              <button
                onClick={handleAssess}
                disabled={assessing || !data}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? GRAY : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !data ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: GRAY,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ padding: "10px 14px" }}>
            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
              {[
                { label: "ANOMALIES", value: total,  color: CY },
                { label: "HIGH",      value: highs,  color: RED },
                { label: "MEDIUM",    value: meds,   color: AMBER },
                { label: "UP TREND",  value: ups,    color: GREEN },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    background: color + "0E",
                    border: `1px solid ${color}33`,
                    borderRadius: 6,
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color, fontSize: 14, letterSpacing: 0.5 }}>{value}</div>
                  <div style={{ color: GRAY, fontSize: 8, marginTop: 2, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Filter tabs + search */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
              {["ALL", "HIGH", "MEDIUM"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${CY}22` : "transparent",
                    border: `1px solid ${tab === t ? CY : CY + "33"}`,
                    borderRadius: 4,
                    padding: "2px 8px",
                    color: tab === t ? CY : GRAY,
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t}
                </button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search metric…"
                style={{
                  flex: 1,
                  background: "#0A1420",
                  border: `1px solid ${CY}22`,
                  borderRadius: 4,
                  padding: "2px 7px",
                  color: CY,
                  fontSize: 9,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>

            {/* Anomaly rows */}
            {visible_rows.length === 0 && !loading && (
              <div style={{ color: GRAY, fontSize: 10, textAlign: "center", padding: "16px 0" }}>
                {total === 0 ? "No measurement anomalies detected" : "No matches"}
              </div>
            )}
            {visible_rows.map((a) => {
              const isOpen = expanded === a.metric;
              const fc     = forecasts[a.metric];
              const fcLoad = fcLoading[a.metric];
              const sevColor = a.severity === "high" ? RED : AMBER;
              const zsAbs    = Math.abs(a.zscore);
              const zsBarPct = Math.min(100, (zsAbs / 5) * 100);

              return (
                <div
                  key={a.metric}
                  style={{
                    marginBottom: 6,
                    background: isOpen ? `${CY}08` : "#0A1420",
                    border: `1px solid ${isOpen ? CY + "44" : CY + "18"}`,
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => handleExpand(a.metric)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: isOpen ? CY : CY + "CC", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.metric}
                    </span>
                    <span
                      style={{
                        background: sevColor + "22",
                        border: `1px solid ${sevColor}55`,
                        borderRadius: 3,
                        padding: "0 5px",
                        color: sevColor,
                        fontSize: 8,
                        letterSpacing: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.severity.toUpperCase()}
                    </span>
                    <span style={{ color: sevColor, fontSize: 10, whiteSpace: "nowrap" }}>
                      {a.zscore > 0 ? "+" : ""}{fmtNum(a.zscore)}σ
                    </span>
                    <span style={{ color: GRAY, fontSize: 9 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Z-score bar */}
                  <div style={{ padding: "0 10px 4px" }}>
                    <div style={{ height: 3, background: "#0A1420", borderRadius: 2, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${zsBarPct}%`,
                          height: "100%",
                          background: sevColor,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      <span style={{ color: GRAY, fontSize: 8 }}>
                        latest {fmtNum(a.latest, 3)}  mean {fmtNum(a.mean, 3)}  σ {fmtNum(a.std, 3)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded forecast */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${CY}22`, padding: "8px 10px" }}>
                      {fcLoad && (
                        <div style={{ color: GRAY, fontSize: 9 }}>◌ fetching forecast…</div>
                      )}
                      {fc && !fc.error && !fcLoad && (
                        <>
                          <div style={{ display: "flex", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                            <div>
                              <span style={{ color: trendColor(fc.trend), fontSize: 13 }}>
                                {trendIcon(fc.trend)} {fc.trend?.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ color: GRAY, fontSize: 9 }}>
                              slope <span style={{ color: CY }}>{fmtNum(fc.slope, 4)}</span>
                            </div>
                            <div style={{ color: GRAY, fontSize: 9 }}>
                              RMSE <span style={{ color: CY }}>{fmtNum(fc.rmse, 4)}</span>
                            </div>
                            <div style={{ color: GRAY, fontSize: 9 }}>
                              n <span style={{ color: CY }}>{fc.n}</span>
                            </div>
                            {fc.anomaly && (
                              <span
                                style={{
                                  background: RED + "22",
                                  border: `1px solid ${RED}55`,
                                  borderRadius: 3,
                                  padding: "0 5px",
                                  color: RED,
                                  fontSize: 8,
                                  letterSpacing: 1,
                                }}
                              >
                                ANOMALY
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>
                              latest <span style={{ color: CY }}>{fmtNum(fc.latest, 4)}</span>
                              {" "}predicted <span style={{ color: VIOLET }}>{fmtNum(fc.predicted, 4)}</span>
                            </span>
                          </div>
                          {fc.forecast && fc.forecast.length > 0 && (
                            <div>
                              <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                                10-STEP FORECAST
                              </div>
                              <Sparkline
                                points={fc.forecast}
                                color={trendColor(fc.trend)}
                              />
                            </div>
                          )}
                        </>
                      )}
                      {fc?.error && !fcLoad && (
                        <div style={{ color: RED, fontSize: 9 }}>
                          Forecast unavailable for this metric
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Assessment output */}
            {assessment && (
              <div
                style={{
                  background: `${CY}0A`,
                  border: `1px solid ${CY}33`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "#DCEBF5",
                  fontSize: 10,
                  lineHeight: 1.5,
                  letterSpacing: 0.3,
                  marginTop: 8,
                }}
              >
                {assessment}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}1A`,
              padding: "5px 14px",
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            /v1/jarvis/analytics/anomalies · /v1/jarvis/analytics/forecast/{"{metric}"} · 90 s refresh
          </div>
        </div>
      )}
    </>
  );
}
