/**
 * F114 — Vitals Trend Analyzer
 *
 * First feature to use /v1/vitals/trend — parallel-fetches 24h trend data
 * for each key biometric metric, renders SVG sparklines, detects anomalies
 * (latest value >1.5 SD from 24h mean) and computes trend direction per metric.
 *
 * Metrics polled:   heart_rate · hrv · spo2 · steps · sleep_score · weight
 * Stat tiles:       metrics / data-points / anomalies / trending-up
 * Filter tabs:      ALL | TRENDING UP | TRENDING DOWN | ANOMALOUS
 * Text search:      across metric names
 * Expand metric:    full sparkline + min/max/mean/latest + anomaly flag
 * Red badge:        on anomalous metric count
 * ▶ ASSESS:         /v1/jarvis/agent/chat 2-sentence health-trend brief + TTS
 *
 * Toggle:   ◈ VITTREND at bottom:8 left:33480, zIndex:71.
 * Voice:    "vitals trend / health trend / biometric trend / body trend /
 *            vital signs trend / vittrend"
 * Event:    jarvis:vittrend-toggle
 * Refresh:  300 s auto-poll (5 min — trend data is slow-moving).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";

const BTN_LEFT  = 33480;
const POLL_MS   = 300_000;
const ANOMALY_SD = 1.5;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const METRICS = [
  { key: "heart_rate",   label: "Heart Rate",   unit: "bpm",  icon: "♥" },
  { key: "hrv",          label: "HRV",           unit: "ms",   icon: "⟲" },
  { key: "spo2",         label: "SpO₂",          unit: "%",    icon: "◉" },
  { key: "steps",        label: "Steps",         unit: "steps",icon: "⟶" },
  { key: "sleep_score",  label: "Sleep Score",   unit: "pts",  icon: "◐" },
  { key: "weight",       label: "Weight",        unit: "kg",   icon: "⊟" },
];

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const VITTREND_RE =
  /\b(vitals?\s+trend|health\s+trend|biometric\s+trend|body\s+trend|vital\s+signs?\s+trend|vittrend)\b/i;

export function isVitTrendQuery(q) { return VITTREND_RE.test(q); }

export async function buildVitTrendScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const results = await Promise.all(
      METRICS.map(m =>
        fetch(`${base}/v1/vitals/trend?metric=${m.key}&hours=24`, { headers: hdr })
          .then(r => r.json())
          .then(d => ({ key: m.key, label: m.label, unit: m.unit, points: d.points || [] }))
          .catch(() => ({ key: m.key, label: m.label, unit: m.unit, points: [] }))
      )
    );
    const analysed = results.map(m => ({ ...m, ...analysePoints(m.points) }));
    const anomalous = analysed.filter(m => m.isAnomalous).map(m => m.label).join(", ") || "none";
    const rising    = analysed.filter(m => m.trend === "up").map(m => m.label).join(", ") || "none";
    const totalPts  = analysed.reduce((s, m) => s + m.points.length, 0);

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS 24-hour biometric trend analysis: ${totalPts} data points across ` +
          `${METRICS.length} vital metrics. ` +
          `Trending up: ${rising}. ` +
          `Statistical anomalies (>1.5 SD): ${anomalous}. ` +
          `Give a 2-sentence operator health-trend brief — formal British butler tone, ` +
          `first person plural, flag any anomalous metrics as priority attention.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Biometric trend analysis complete, sir.").trim();
  } catch {
    return "Biometric trend analysis unavailable at this time, sir.";
  }
}

// ── analytics helpers ────────────────────────────────────────────────────────

function analysePoints(pts) {
  if (!pts.length) return { trend: "unknown", mean: null, sd: null, latest: null, min: null, max: null, isAnomalous: false };
  const vals  = pts.map(p => Number(p.value)).filter(v => !isNaN(v));
  if (!vals.length) return { trend: "unknown", mean: null, sd: null, latest: null, min: null, max: null, isAnomalous: false };
  const mean  = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd    = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  const latest = vals[vals.length - 1];
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const trend = vals.length < 2
    ? "stable"
    : latest > vals[0] + sd * 0.25 ? "up" : latest < vals[0] - sd * 0.25 ? "down" : "stable";
  const isAnomalous = sd > 0 && Math.abs(latest - mean) > ANOMALY_SD * sd;
  return { trend, mean, sd, latest, min, max, isAnomalous };
}

// ── SVG sparkline ────────────────────────────────────────────────────────────

function Sparkline({ points, color, width = 120, height = 32 }) {
  if (!points.length) {
    return (
      <svg width={width} height={height}>
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle" fill="#4A607A" fontSize={9}>no data</text>
      </svg>
    );
  }
  const vals = points.map(p => Number(p.value)).filter(v => !isNaN(v));
  if (vals.length < 2) return (
    <svg width={width} height={height}>
      <circle cx={width / 2} cy={height / 2} r={3} fill={color} />
    </svg>
  );
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 4;
  const aw = width - pad * 2;
  const ah = height - pad * 2;
  const ptStr = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * aw;
    const y = pad + (1 - (v - min) / range) * ah;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height}>
      <polyline points={ptStr} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle
        cx={pad + aw}
        cy={pad + (1 - (vals[vals.length - 1] - min) / range) * ah}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

// ── main component ───────────────────────────────────────────────────────────

const TAB_ALL   = "ALL";
const TAB_UP    = "TRENDING UP";
const TAB_DOWN  = "TRENDING DOWN";
const TAB_ANOM  = "ANOMALOUS";
const TABS      = [TAB_ALL, TAB_UP, TAB_DOWN, TAB_ANOM];

const TREND_COLOR = { up: "#29E7FF", down: "#FF6B6B", stable: "#6E8AA0", unknown: "#4A607A" };
const TREND_ICON  = { up: "↑", down: "↓", stable: "→", unknown: "?" };

export default function VitalsTrendAnalyzer() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState([]);   // [{key,label,unit,icon,points,trend,mean,sd,latest,min,max,isAnomalous}]
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState(TAB_ALL);
  const [search, setSearch]   = useState("");
  const [expanded, setExpand] = useState(null);
  const [assessing, setAss]   = useState(false);
  const pollRef               = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const results = await Promise.all(
        METRICS.map(m =>
          fetch(`${base}/v1/vitals/trend?metric=${m.key}&hours=24`, { headers: hdr })
            .then(r => r.json())
            .then(d => ({ ...m, points: d.points || [] }))
            .catch(() => ({ ...m, points: [] }))
        )
      );
      setData(results.map(m => ({ ...m, ...analysePoints(m.points) })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:vittrend-toggle", h);
    return () => window.removeEventListener("jarvis:vittrend-toggle", h);
  }, []);

  const assess = async () => {
    if (!data.length || assessing) return;
    setAss(true);
    const brief = await buildVitTrendScript().catch(() => "Analysis unavailable, sir.");
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    setAss(false);
  };

  const anomCount  = data.filter(m => m.isAnomalous).length;
  const upCount    = data.filter(m => m.trend === "up").length;
  const totalPts   = data.reduce((s, m) => s + m.points.length, 0);

  const visible = data.filter(m => {
    if (tab === TAB_UP)   return m.trend === "up";
    if (tab === TAB_DOWN) return m.trend === "down";
    if (tab === TAB_ANOM) return m.isAnomalous;
    return true;
  }).filter(m => !search || m.label.toLowerCase().includes(search.toLowerCase()));

  const CY = "#29E7FF";
  const PANEL_W = 580;

  const btn = (
    <button
      onClick={() => setOpen(v => !v)}
      title="Vitals Trend Analyzer"
      style={{
        position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 71,
        background: open ? CY : "rgba(5,8,13,0.82)",
        color: open ? "#04060A" : anomCount > 0 ? "#FF6B6B" : CY,
        border: `1px solid ${anomCount > 0 ? "#FF6B6B" : CY}55`,
        borderRadius: 5, padding: "3px 9px", fontSize: 10, letterSpacing: 1.5,
        cursor: "pointer", backdropFilter: "blur(6px)", fontFamily: "'JetBrains Mono',monospace",
        boxShadow: anomCount > 0 ? "0 0 10px #FF6B6B44" : `0 0 8px ${CY}33`,
      }}
    >
      ◈ VITTREND{anomCount > 0 && <span style={{ marginLeft: 4, color: open ? "#04060A" : "#FF6B6B", fontWeight: 700 }}>●{anomCount}</span>}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: "fixed", bottom: 40, left: BTN_LEFT - 480, zIndex: 71, width: PANEL_W,
        background: "rgba(6,10,16,0.94)", border: `1px solid ${CY}33`,
        borderRadius: 10, padding: "14px 16px", backdropFilter: "blur(12px)",
        boxShadow: `0 0 40px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
        color: "#DCEBF5", maxHeight: "72vh", display: "flex", flexDirection: "column", gap: 10,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ VITALS TREND ANALYZER</span>
          {loading && <span style={{ fontSize: 9, color: "#4A607A", marginLeft: 4 }}>loading…</span>}
          <button onClick={assess} disabled={assessing} style={{
            marginLeft: "auto", background: assessing ? "#1A2A3A" : `${CY}22`,
            border: `1px solid ${CY}55`, color: assessing ? "#4A607A" : CY,
            borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
            letterSpacing: 1, fontFamily: "inherit",
          }}>
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#4A607A", cursor: "pointer", fontSize: 14, padding: "0 2px",
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {[
            { label: "METRICS",    val: data.length,  col: CY },
            { label: "DATA PTS",   val: totalPts,     col: "#29E7FF" },
            { label: "ANOMALOUS",  val: anomCount,    col: anomCount > 0 ? "#FF6B6B" : "#6E8AA0" },
            { label: "TRENDING↑",  val: upCount,      col: "#4DFFB8" },
          ].map(t => (
            <div key={t.label} style={{
              background: "rgba(255,255,255,0.03)", border: `1px solid ${t.col}22`,
              borderRadius: 6, padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.col }}>{t.val}</div>
              <div style={{ fontSize: 8, color: "#4A607A", letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CY : "rgba(255,255,255,0.04)",
              color: tab === t ? "#04060A" : "#6E8AA0",
              border: `1px solid ${tab === t ? CY : "#1A2A3A"}`,
              borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search metric…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid #1A2A3A`,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, color: "#DCEBF5",
              fontFamily: "inherit", outline: "none", width: 120,
            }}
          />
        </div>

        {/* metric rows */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.length === 0 && (
            <div style={{ color: "#4A607A", fontSize: 10, textAlign: "center", padding: 20 }}>
              {loading ? "Loading trend data…" : "No metrics match filter."}
            </div>
          )}
          {visible.map(m => {
            const isEx  = expanded === m.key;
            const tc    = TREND_COLOR[m.trend] || "#6E8AA0";
            const ti    = TREND_ICON[m.trend]  || "?";
            const anom  = m.isAnomalous;
            return (
              <div key={m.key} style={{
                border: `1px solid ${anom ? "#FF6B6B33" : "#1A2A3A"}`,
                borderRadius: 7, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpand(isEx ? null : m.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", cursor: "pointer",
                    background: anom ? "rgba(255,107,107,0.05)" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <span style={{ color: tc, fontSize: 13 }}>{m.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: anom ? "#FF6B6B" : "#DCEBF5", flex: 1 }}>
                    {m.label}
                  </span>
                  {m.latest != null && (
                    <span style={{ fontSize: 10, color: tc, minWidth: 60, textAlign: "right" }}>
                      {Number(m.latest).toFixed(1)} {m.unit}
                    </span>
                  )}
                  <span style={{
                    fontSize: 11, color: tc, fontWeight: 700, minWidth: 14, textAlign: "center",
                  }}>{ti}</span>
                  {anom && <span style={{ fontSize: 9, color: "#FF6B6B", letterSpacing: 1 }}>⚠ANOM</span>}
                  <Sparkline points={m.points} color={tc} width={100} height={28} />
                  <span style={{ fontSize: 9, color: "#4A607A", marginLeft: 4 }}>{isEx ? "▲" : "▼"}</span>
                </div>

                {isEx && (
                  <div style={{
                    padding: "8px 12px", background: "rgba(0,0,0,0.3)",
                    borderTop: `1px solid #1A2A3A`,
                    display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6,
                  }}>
                    {[
                      { l: "LATEST",  v: m.latest != null ? `${Number(m.latest).toFixed(1)} ${m.unit}` : "—" },
                      { l: "MEAN",    v: m.mean   != null ? `${Number(m.mean).toFixed(1)} ${m.unit}`   : "—" },
                      { l: "MIN",     v: m.min    != null ? `${Number(m.min).toFixed(1)} ${m.unit}`    : "—" },
                      { l: "MAX",     v: m.max    != null ? `${Number(m.max).toFixed(1)} ${m.unit}`    : "—" },
                    ].map(s => (
                      <div key={s.l} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: tc, fontWeight: 700 }}>{s.v}</div>
                        <div style={{ fontSize: 8, color: "#4A607A", marginTop: 2 }}>{s.l}</div>
                      </div>
                    ))}
                    {m.points.length > 0 && (
                      <div style={{ gridColumn: "1/-1", marginTop: 6 }}>
                        <Sparkline points={m.points} color={tc} width={PANEL_W - 40} height={48} />
                      </div>
                    )}
                    {m.sd != null && (
                      <div style={{
                        gridColumn: "1/-1", fontSize: 9, color: "#4A607A", marginTop: 4,
                        borderTop: `1px solid #1A2A3A`, paddingTop: 4,
                      }}>
                        σ = {Number(m.sd).toFixed(2)} {m.unit} · {m.points.length} data points over 24h
                        {anom && (
                          <span style={{ marginLeft: 8, color: "#FF6B6B" }}>
                            ⚠ Latest deviates {Math.abs(m.latest - m.mean) / (m.sd || 1) >= 1 ? ((Math.abs(m.latest - m.mean) / (m.sd || 1)).toFixed(1) + "σ") : ""} from mean
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 8, color: "#2A3A4A", borderTop: `1px solid #0D1520`, paddingTop: 6 }}>
          SOURCE: /v1/vitals/trend · 24h window · anomaly threshold {ANOMALY_SD}σ · auto-refresh {POLL_MS / 60000} min
        </div>
      </div>
    </>
  );
}
