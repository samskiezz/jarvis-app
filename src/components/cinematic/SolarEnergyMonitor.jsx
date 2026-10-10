/**
 * SolarEnergyMonitor — F240.
 *
 * Data sources (all real — backed by server/routes/solar.py):
 *   GET /v1/solar/now
 *       → {kw_now, kw_today_kwh, lifetime_kwh, ac_v, freq_hz, temp_c,
 *          batteries:[{id,soc_pct,dc_v,kw,temp_c}],
 *          grid_export_kw, grid_import_kw, ts, source, schema_version}
 *   GET /v1/solar/config
 *       → {ok, kind, host_set, supported, source}
 *
 * Displays:
 *   - Stat tiles: current kW / today kWh / lifetime kWh / battery count
 *   - Live power gauge bar (kw_now, capped at configured kW_MAX)
 *   - Grid export / import bars
 *   - Battery SOC bars per battery (id, soc_pct, temp_c)
 *   - AC voltage + frequency + inverter temp display
 *   - Source & config info row
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence energy brief + TTS
 *
 * Toggle: ☀ SOLAR at left:123840, bottom:8, zIndex:120.
 * Badge: green = kw_now > 0 (generating); amber = grid importing.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isSolarQuery(q) / buildSolarScript()
 *
 * Voice triggers: "solar / solar energy / solar power / inverter / energy monitor /
 *   grid export / grid import / solar panel / battery soc / kw now / solar status /
 *   solar monitor / energy status / photovoltaic / pv power"
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
const GOLD = "#FCD34D";
const ORNG = "#FB923C";

const BTN_LEFT   = 123840;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SOLAR_RE =
  /\b(solar(?:\s*(?:energy|power|panel|monitor|status))?|inverter|energy\s*monitor|grid\s*export|grid\s*import|battery\s*soc|kw\s*now|solar\s*monitor|energy\s*status|photovoltaic|pv\s*power)\b/i;

export function isSolarQuery(t) {
  return SOLAR_RE.test(t || "");
}

export async function buildSolarScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/solar/now`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const kw      = d?.kw_now        ?? 0;
    const today   = d?.kw_today_kwh  ?? 0;
    const life    = d?.lifetime_kwh  ?? 0;
    const exp     = d?.grid_export_kw ?? 0;
    const imp     = d?.grid_import_kw ?? 0;
    const bats    = d?.batteries || [];
    const src     = d?.source || "unknown";
    if (src === "default-schema") {
      return "Solar inverter is not yet connected. Backend returns default schema — configure INVERTER_KIND and INVERTER_HOST (or ENVOY_HOST) to enable live readings.";
    }
    const gridStr = exp > 0
      ? `exporting ${exp.toFixed(2)} kW to grid`
      : imp > 0
        ? `importing ${imp.toFixed(2)} kW from grid`
        : "grid balanced";
    const batStr  = bats.length
      ? ` ${bats.length} batter${bats.length !== 1 ? "ies" : "y"} at avg ${Math.round(bats.reduce((s, b) => s + (b.soc_pct || 0), 0) / bats.length)}% SOC.`
      : "";
    return `Solar generating ${kw.toFixed(2)} kW now, ${today.toFixed(1)} kWh today, ${life.toFixed(0)} kWh lifetime; ${gridStr}.${batStr}`;
  } catch {
    return "Unable to retrieve solar energy data at this time, sir.";
  }
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchNow() {
  const r = await fetch(`${apiBase()}/v1/solar/now`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchConfig() {
  const r = await fetch(`${apiBase()}/v1/solar/config`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(kw, today, life, gridExp, gridImp, batCount, source) {
  const gridNote = gridExp > 0 ? `exporting ${gridExp.toFixed(2)} kW` : gridImp > 0 ? `importing ${gridImp.toFixed(2)} kW` : "balanced";
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess this solar energy system in 2 sentences: currently generating ${kw.toFixed(2)} kW, ` +
        `${today.toFixed(1)} kWh today, ${life.toFixed(0)} kWh lifetime, grid ${gridNote}, ` +
        `${batCount} batter${batCount !== 1 ? "ies" : "y"}, data source: ${source}.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, unit, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 90, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 9, marginLeft: 3, color: `${color}99` }}>{unit}</span>}
      </span>
    </div>
  );
}

function Bar({ label, value, max, color, suffix }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 8, color }}>
          {typeof value === "number" ? value.toFixed(2) : value}{suffix}
        </span>
      </div>
      <div style={{ height: 5, background: `${color}1a`, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function SocBar({ bat }) {
  const soc   = bat.soc_pct ?? 0;
  const color = soc > 60 ? GN : soc > 25 ? AM : RED;
  return (
    <div style={{
      padding: "6px 10px", borderBottom: `1px solid ${CY}11`,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 8, color: DIM, minWidth: 80, letterSpacing: 1 }}>
        {String(bat.id || "bat").slice(0, 12)}
      </span>
      <div style={{ flex: 1, height: 6, background: `${color}22`, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${soc}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 9, color, minWidth: 36, textAlign: "right" }}>{soc.toFixed(0)}%</span>
      {bat.temp_c != null && (
        <span style={{ fontSize: 8, color: DIM, minWidth: 40, textAlign: "right" }}>{bat.temp_c.toFixed(1)}°C</span>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SolarEnergyMonitor() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [cfg,       setCfg]       = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [now, config] = await Promise.all([fetchNow(), fetchConfig()]);
      setData(now);
      setCfg(config);
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
      if (SOLAR_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:solar-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:solar-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing || !data) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(
        data.kw_now ?? 0,
        data.kw_today_kwh ?? 0,
        data.lifetime_kwh ?? 0,
        data.grid_export_kw ?? 0,
        data.grid_import_kw ?? 0,
        (data.batteries || []).length,
        data.source || "unknown",
      );
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const kw       = data?.kw_now        ?? 0;
  const today    = data?.kw_today_kwh  ?? 0;
  const life     = data?.lifetime_kwh  ?? 0;
  const acV      = data?.ac_v          ?? 0;
  const freq     = data?.freq_hz       ?? 0;
  const tempC    = data?.temp_c        ?? 0;
  const gridExp  = data?.grid_export_kw ?? 0;
  const gridImp  = data?.grid_import_kw ?? 0;
  const batteries= data?.batteries     || [];
  const source   = data?.source        || "–";
  const isLive   = source === "live";
  const isDefault= source === "default-schema" || source === "stub-pending-spec";

  const generating = kw > 0;
  const importing  = gridImp > 0 && !generating;

  const kwMax = Math.max(5, kw * 1.25);

  return (
    <>
      {/* ── toggle button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Solar Energy Monitor"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 120,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${GOLD}55`,
          color: GOLD, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ☀ SOLAR
        {generating && (
          <span style={{
            marginLeft: 5, background: GN,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {kw.toFixed(1)}kW
          </span>
        )}
        {!generating && importing && (
          <span style={{
            marginLeft: 5, background: AM,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            IMP
          </span>
        )}
      </button>

      {/* ── panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 121,
          width: "min(500px, 94vw)", maxHeight: "82vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${GOLD}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${GOLD}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${GOLD}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: GOLD, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ☀ SOLAR ENERGY MONITOR
            </span>
            {loading && (
              <span style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>POLLING…</span>
            )}
            <div style={{ flex: 1 }} />
            {/* source badge */}
            <span style={{
              fontSize: 7, letterSpacing: 1,
              color: isLive ? GN : isDefault ? AM : DIM,
              border: `1px solid ${isLive ? GN : isDefault ? AM : DIM}55`,
              padding: "1px 5px", borderRadius: 3,
            }}>
              {isLive ? "LIVE" : isDefault ? "DEFAULT SCHEMA" : source.toUpperCase()}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: DIM,
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Config row */}
            {cfg && (
              <div style={{
                fontSize: 8, color: DIM, display: "flex", gap: 12, flexWrap: "wrap",
              }}>
                <span>KIND: <span style={{ color: CY }}>{cfg.kind || "unset"}</span></span>
                <span>BACKEND: <span style={{ color: cfg.host_set ? GN : RED }}>{cfg.host_set ? "CONNECTED" : "NOT SET"}</span></span>
                <span>SUPPORTED: <span style={{ color: DIM }}>{(cfg.supported || []).join(" / ").toUpperCase()}</span></span>
              </div>
            )}

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tile label="POWER NOW" value={kw.toFixed(2)} unit="kW" color={generating ? GN : DIM} />
              <Tile label="TODAY" value={today.toFixed(1)} unit="kWh" color={GOLD} />
              <Tile label="LIFETIME" value={life >= 1000 ? (life / 1000).toFixed(1) : life.toFixed(0)} unit={life >= 1000 ? "MWh" : "kWh"} color={CY} />
              <Tile label="BATTERIES" value={batteries.length} unit="" color={batteries.length > 0 ? GN : DIM} />
            </div>

            {/* Live power gauge */}
            <div>
              <div style={{ fontSize: 9, color: GOLD, letterSpacing: 2, marginBottom: 6 }}>POWER OUTPUT</div>
              <Bar label="GENERATING NOW" value={kw} max={kwMax} color={generating ? GN : DIM} suffix=" kW" />
              <Bar label="GRID EXPORT" value={gridExp} max={Math.max(2, gridExp * 1.5)} color={GN} suffix=" kW" />
              <Bar label="GRID IMPORT" value={gridImp} max={Math.max(2, gridImp * 1.5)} color={importing ? AM : DIM} suffix=" kW" />
            </div>

            {/* AC metrics */}
            <div>
              <div style={{ fontSize: 9, color: GOLD, letterSpacing: 2, marginBottom: 6 }}>AC / INVERTER</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { label: "VOLTAGE", value: `${acV.toFixed(1)} V`, color: CY },
                  { label: "FREQUENCY", value: `${freq.toFixed(2)} Hz`, color: ORNG },
                  { label: "INV TEMP", value: `${tempC.toFixed(1)} °C`, color: tempC > 70 ? RED : tempC > 50 ? AM : GN },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ minWidth: 90 }}>
                    <div style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Battery SOC */}
            {batteries.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: GOLD, letterSpacing: 2, marginBottom: 6 }}>
                  BATTERY SOC ({batteries.length})
                </div>
                <div style={{
                  border: `1px solid ${CY}22`, borderRadius: 8, overflow: "hidden",
                }}>
                  {batteries.map((bat, i) => (
                    <SocBar key={bat.id || i} bat={bat} />
                  ))}
                </div>
              </div>
            )}

            {/* ASSESS */}
            <div style={{ marginTop: 4 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: assessing ? `${GOLD}22` : `${GOLD}11`,
                  border: `1px solid ${GOLD}55`, color: GOLD,
                  fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                  borderRadius: 6, cursor: assessing ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ ASSESS"}
              </button>
              {dossier && (
                <div style={{
                  marginTop: 8, padding: 10,
                  background: `${GOLD}08`, border: `1px solid ${GOLD}22`,
                  borderRadius: 6, fontSize: 10, color: "#C0D0DC", lineHeight: 1.6,
                }}>
                  {dossier}
                </div>
              )}
            </div>

            {/* schema version */}
            {data?.schema_version && (
              <div style={{ fontSize: 7, color: `${DIM}88`, textAlign: "right" }}>
                schema v{data.schema_version} · ts {data.ts ? new Date(data.ts * 1000).toISOString().slice(11, 19) : "–"}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
