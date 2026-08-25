/**
 * VitalsDashboard — F246.
 *
 * Data sources (all real — backed by server/routes/vitals.py):
 *   GET /v1/vitals/latest
 *       → {ok, items:{hr:{ts,value,unit,source}, hrv, spo2, steps, sleep_min,
 *          weight_kg, ...}, count, schema_version, source}
 *   GET /v1/vitals/trend?metric=<metric>&hours=24
 *       → {ok, metric, points:[{ts,value,unit,source}], count, schema_version}
 *
 * Displays:
 *   - Stat tiles: HR / HRV / SpO2 / steps / sleep / weight
 *   - Per-metric rows with last-updated age chip; expand → 24h trend sparkline
 *   - Source badge (LIVE / DEFAULT SCHEMA)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence health brief + TTS
 *
 * Toggle: ⊕ VTLS at left:151200, bottom:8, zIndex:126.
 * Badge: green = live data; amber = default schema.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isVtlsQuery(q) / buildVtlsScript()
 *
 * Voice triggers: "vitals / biometrics / heart rate / hrv / spo2 / steps /
 *   sleep / weight / health metrics / vtls / health trends / body metrics /
 *   health dashboard / biometric monitor / fitness data"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RED  = "#F87171";
const DIM  = "#3A4A55";
const ROSE = "#FB7185";
const PURP = "#A78BFA";

const BTN_LEFT   = 151200;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const VTLS_RE =
  /\b(vitals?|biometric(?:s)?|heart[\s-]*rate|hrv|spo2|step(?:s)?(?:\s*count)?|sleep(?:\s*(?:min|data|score|duration))?|weight(?:\s*kg)?|health\s*(?:metric|trend|dashboard|data)|body\s*metric|biometric\s*monitor|fitness\s*data|vtls)\b/i;

export function isVtlsQuery(t) {
  return VTLS_RE.test(t || "");
}

export async function buildVtlsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/vitals/latest`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    if (!d?.ok) return "Vitals endpoint returned an error — check server/routes/vitals.py.";
    const src = d.source || "unknown";
    if (src === "default-schema") {
      return "Vitals are not yet synced. Backend returns the default schema — post observations via POST /v1/vitals/observation from your Apple Health shortcut, Garmin webhook, or wearables bridge to populate live readings.";
    }
    const it = d.items || {};
    const hr   = it.hr?.value       ?? null;
    const hrv  = it.hrv?.value      ?? null;
    const spo2 = it.spo2?.value     ?? null;
    const steps= it.steps?.value    ?? null;
    const slp  = it.sleep_min?.value ?? null;
    const wt   = it.weight_kg?.value ?? null;
    const parts = [];
    if (hr   != null) parts.push(`HR ${Math.round(hr)} bpm`);
    if (hrv  != null) parts.push(`HRV ${Math.round(hrv)} ms`);
    if (spo2 != null) parts.push(`SpO2 ${spo2.toFixed(1)}%`);
    if (steps != null) parts.push(`${Math.round(steps).toLocaleString()} steps`);
    if (slp  != null) parts.push(`${Math.round(slp / 60 * 10) / 10}h sleep`);
    if (wt   != null) parts.push(`${wt.toFixed(1)} kg`);
    if (parts.length === 0) return "No vitals data found in the database yet.";
    return `Latest vitals: ${parts.join(", ")}. ${d.count} metric${d.count !== 1 ? "s" : ""} tracked — schema v${d.schema_version || "?"}.`;
  } catch {
    return "Unable to retrieve vitals data at this time, sir.";
  }
}

// ─── colours per metric ───────────────────────────────────────────────────────

const METRIC_META = {
  hr:        { label: "HEART RATE",   unit: "bpm",  color: ROSE,  icon: "♥" },
  hrv:       { label: "HRV",          unit: "ms",   color: PURP,  icon: "≋" },
  spo2:      { label: "SPO2",         unit: "%",    color: CY,    icon: "○" },
  steps:     { label: "STEPS",        unit: "",     color: GN,    icon: "◎" },
  sleep_min: { label: "SLEEP",        unit: "min",  color: AM,    icon: "☽" },
  weight_kg: { label: "WEIGHT",       unit: "kg",   color: "#67E8F9", icon: "⊠" },
};

function metaFor(k) {
  return METRIC_META[k] || { label: k.toUpperCase(), unit: "", color: DIM, icon: "•" };
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchLatest() {
  const r = await fetch(`${apiBase()}/v1/vitals/latest`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchTrend(metric, hours = 24) {
  const r = await fetch(
    `${apiBase()}/v1/vitals/trend?metric=${encodeURIComponent(metric)}&hours=${hours}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(items, count, source) {
  const parts = Object.entries(items)
    .map(([k, v]) => `${k}=${v.value}${v.unit ? " " + v.unit : ""}`)
    .join(", ");
  const prompt = `Vitals snapshot (${source}): ${parts}. ${count} metrics tracked. Give a 2-sentence health brief: highlight any notable values and the overall picture. Be direct.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── small helpers ────────────────────────────────────────────────────────────

function ageStr(ts) {
  if (!ts) return "–";
  const delta = Math.round(Date.now() / 1000 - ts);
  if (delta < 60)   return `${delta}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

function fmtVal(k, val) {
  if (val == null) return "–";
  if (k === "sleep_min") return `${Math.round(val / 60 * 10) / 10}h`;
  if (k === "steps") return Math.round(val).toLocaleString();
  if (Number.isInteger(val) || Math.abs(val) >= 100) return Math.round(val).toString();
  return val.toFixed(1);
}

// ─── sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ points, color }) {
  if (!points || points.length < 2) {
    return <span style={{ fontSize: 8, color: DIM }}>NO TREND DATA</span>;
  }
  const W = 240, H = 36;
  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = maxV - minV || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = vals.map((v) => H - ((v - minV) / span) * (H - 4) - 2);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const last = vals[vals.length - 1];
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill={color} />
      <text x={W - 2} y={ys[ys.length - 1] - 4} textAnchor="end" fontSize="7" fill={color}>
        {last?.toFixed ? last.toFixed(0) : last}
      </text>
    </svg>
  );
}

// ─── stat tile ────────────────────────────────────────────────────────────────

function Tile({ label, value, unit, color }) {
  return (
    <div style={{
      flex: "1 1 80px", padding: "8px 10px",
      background: `${color}0d`, border: `1px solid ${color}33`,
      borderRadius: 8, textAlign: "center",
    }}>
      <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      {unit && <div style={{ fontSize: 7, color: `${color}99`, marginTop: 1 }}>{unit}</div>}
    </div>
  );
}

// ─── metric row ───────────────────────────────────────────────────────────────

function MetricRow({ metricKey, obs }) {
  const [expanded, setExpanded] = useState(false);
  const [trend, setTrend]       = useState(null);
  const [loadingTrend, setLT]   = useState(false);
  const meta = metaFor(metricKey);

  async function expand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!trend) {
      setLT(true);
      try {
        const t = await fetchTrend(metricKey, 24);
        setTrend(t);
      } catch { setTrend({ ok: false, points: [] }); }
      setLT(false);
    }
  }

  return (
    <div style={{ borderBottom: `1px solid ${CY}11` }}>
      <div
        onClick={expand}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "7px 12px", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 11, color: meta.color, minWidth: 14 }}>{meta.icon}</span>
        <span style={{ fontSize: 9, color: meta.color, letterSpacing: 1, flex: 1 }}>{meta.label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>
          {fmtVal(metricKey, obs?.value)}
          {meta.unit && <span style={{ fontSize: 8, color: `${meta.color}99`, marginLeft: 2 }}>{meta.unit}</span>}
        </span>
        <span style={{ fontSize: 7, color: DIM, minWidth: 52, textAlign: "right" }}>
          {ageStr(obs?.ts)}
        </span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "6px 14px 10px 14px" }}>
          <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 4 }}>24H TREND</div>
          {loadingTrend
            ? <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            : <Sparkline points={trend?.points || []} color={meta.color} />
          }
          {obs?.source && (
            <div style={{ fontSize: 7, color: DIM, marginTop: 4 }}>
              SOURCE: <span style={{ color: CY }}>{obs.source.toUpperCase()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function VitalsDashboard() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchLatest();
      setData(d);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VTLS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:vtls-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:vtls-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing || !data?.items) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(data.items, data.count ?? 0, data.source || "unknown");
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const items   = data?.items || {};
  const count   = data?.count ?? 0;
  const source  = data?.source || "–";
  const isLive  = source === "live";
  const isDef   = source === "default-schema" || source === "stub-pending-spec";

  const hr   = items.hr?.value   ?? null;
  const hrv  = items.hrv?.value  ?? null;
  const spo2 = items.spo2?.value ?? null;
  const steps= items.steps?.value ?? null;

  const badgeColor = isLive ? GN : isDef ? AM : DIM;

  // Ordered display keys: known first, then extras
  const knownOrder = ["hr", "hrv", "spo2", "steps", "sleep_min", "weight_kg"];
  const extraKeys  = Object.keys(items).filter((k) => !knownOrder.includes(k));
  const displayKeys = [...knownOrder.filter((k) => items[k] !== undefined), ...extraKeys];

  return (
    <>
      {/* ── toggle button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Vitals Dashboard"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 126,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${ROSE}55`,
          color: ROSE, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ⊕ VTLS
        {count > 0 && (
          <span style={{
            marginLeft: 5, background: badgeColor,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {count}
          </span>
        )}
      </button>

      {/* ── panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 127,
          width: "min(480px, 94vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${ROSE}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${ROSE}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${ROSE}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: ROSE, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ⊕ VITALS DASHBOARD
            </span>
            {loading && (
              <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>POLLING…</span>
            )}
            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 7, letterSpacing: 1,
              color: isLive ? GN : isDef ? AM : DIM,
              border: `1px solid ${isLive ? GN : isDef ? AM : DIM}55`,
              padding: "1px 5px", borderRadius: 3,
            }}>
              {isLive ? "LIVE" : isDef ? "DEFAULT SCHEMA" : source.toUpperCase()}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
            >×</button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tile
                label="HEART RATE"
                value={hr != null ? Math.round(hr) : "–"}
                unit="bpm"
                color={hr != null && hr > 100 ? RED : hr != null && hr < 50 ? AM : ROSE}
              />
              <Tile
                label="HRV"
                value={hrv != null ? Math.round(hrv) : "–"}
                unit="ms"
                color={hrv != null && hrv >= 50 ? GN : hrv != null && hrv >= 25 ? AM : PURP}
              />
              <Tile
                label="SPO2"
                value={spo2 != null ? `${spo2.toFixed(1)}` : "–"}
                unit="%"
                color={spo2 != null && spo2 < 95 ? RED : spo2 != null && spo2 < 97 ? AM : CY}
              />
              <Tile
                label="STEPS"
                value={steps != null ? Math.round(steps).toLocaleString() : "–"}
                unit=""
                color={GN}
              />
            </div>

            {/* Metric rows */}
            {displayKeys.length > 0 && (
              <div style={{ border: `1px solid ${CY}22`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{
                  fontSize: 9, color: ROSE, letterSpacing: 2,
                  padding: "6px 12px", borderBottom: `1px solid ${CY}11`,
                }}>
                  METRICS ({displayKeys.length})
                </div>
                {displayKeys.map((k) => (
                  <MetricRow key={k} metricKey={k} obs={items[k]} />
                ))}
              </div>
            )}

            {displayKeys.length === 0 && !loading && (
              <div style={{ fontSize: 9, color: DIM, textAlign: "center", padding: "24px 0" }}>
                No vitals data yet. POST to /v1/vitals/observation to begin tracking.
              </div>
            )}

            {/* ASSESS */}
            <div style={{ marginTop: 4 }}>
              <button
                onClick={handleAssess}
                disabled={assessing || displayKeys.length === 0}
                style={{
                  background: assessing ? `${ROSE}22` : `${ROSE}11`,
                  border: `1px solid ${ROSE}55`, color: ROSE,
                  fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                  borderRadius: 6,
                  cursor: (assessing || displayKeys.length === 0) ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                  opacity: displayKeys.length === 0 ? 0.4 : 1,
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ ASSESS"}
              </button>
              {dossier && (
                <div style={{
                  marginTop: 8, padding: 10,
                  background: `${ROSE}08`, border: `1px solid ${ROSE}22`,
                  borderRadius: 6, fontSize: 10, color: "#C0D0DC", lineHeight: 1.6,
                }}>
                  {dossier}
                </div>
              )}
            </div>

            {/* schema version */}
            {data?.schema_version && (
              <div style={{ fontSize: 7, color: `${DIM}88`, textAlign: "right" }}>
                schema v{data.schema_version} · {count} metric{count !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
