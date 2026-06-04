/**
 * Dashboard — "DASHBOARD": a single-glance board of live platform metrics.
 *
 * Pulls four independent live sources and renders each as its own widget so any
 * one failing degrades just that tile (the rest of the board still renders):
 *   - getLiveIntel({type:"all"})  → market count + quake count + a markets
 *     sparkline (change_pct per ticker).
 *   - /v1/predict/skill           → prediction skill scorecard (best-effort: we
 *     surface whatever scalar metrics the backend returns).
 *   - /v1/ontology/objects        → ontology object count.
 *   - /v1/alerts                  → open alert count.
 *
 * DRY via Wave1Kit (Btn) + PageKit (StatTile / PanelCard / Grid). Inline SVG
 * charts keep us dependency-free.
 */
import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiGet, qs, asList } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";

const ACCENT = C.blue;

// A tiny inline sparkline from an array of numbers (centered on zero).
function Sparkline({ values, color = ACCENT, height = 44 }) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length < 2) return <div style={{ fontSize: 9, color: C.text }}>insufficient data</div>;
  const W = 240;
  const max = Math.max(...nums.map(Math.abs), 1e-9);
  const step = W / (nums.length - 1);
  const y = (v) => height / 2 - (v / max) * (height / 2 - 3);
  const pts = nums.map((v, i) => `${i * step},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <line x1="0" y1={height / 2} x2={W} y2={height / 2} stroke={C.border} strokeWidth="1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
      {nums.map((v, i) => (
        <circle key={i} cx={i * step} cy={y(v)} r="1.8" fill={v >= 0 ? C.neon : C.red} />
      ))}
    </svg>
  );
}

// Horizontal mini bar list for the skill scorecard scalars.
function ScalarBars({ pairs, color = C.purple }) {
  if (!pairs.length) return <div style={{ fontSize: 9, color: C.text }}>no scalar metrics returned</div>;
  const max = Math.max(...pairs.map(([, v]) => Math.abs(v)), 1e-9);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, color: C.text, width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%`, height: "100%", background: color }} />
          </div>
          <span style={{ fontSize: 8, color: C.textB, width: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {Math.abs(v) < 1 ? v.toFixed(3) : v.toPrecision(4)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Extract numeric scalars from a (possibly nested) skill payload.
function scalarPairs(obj) {
  const src = (obj && (obj.metrics || obj.scorecard || obj.skill || obj)) || {};
  if (typeof src !== "object") return [];
  return Object.entries(src)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .slice(0, 8);
}

export default function Dashboard() {
  const [state, setState] = useState({
    intel: null, intelErr: null,
    skill: null, skillErr: null,
    objCount: null, objErr: null,
    alertCount: null, alertErr: null,
    loading: true,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const [intel, skill, objs, alerts] = await Promise.allSettled([
      getLiveIntel({ type: "all" }),
      apiGet("/v1/predict/skill"),
      apiGet(`/v1/ontology/objects${qs({ limit: 1000 })}`),
      apiGet("/v1/alerts"),
    ]);
    setState({
      loading: false,
      intel: intel.status === "fulfilled" ? (intel.value || {}) : null,
      intelErr: intel.status === "rejected" ? intel.reason : null,
      skill: skill.status === "fulfilled" ? (skill.value || {}) : null,
      skillErr: skill.status === "rejected" ? skill.reason : null,
      objCount: objs.status === "fulfilled" ? asList(objs.value, "objects").length : null,
      objErr: objs.status === "rejected" ? objs.reason : null,
      alertCount: alerts.status === "fulfilled" ? asList(alerts.value, "alerts").length : null,
      alertErr: alerts.status === "rejected" ? alerts.reason : null,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const { intel, intelErr, skill, skillErr, objCount, objErr, alertCount, alertErr, loading } = state;
  const markets = Array.isArray(intel?.markets) ? intel.markets : [];
  const quakes = Array.isArray(intel?.earthquakes) ? intel.earthquakes : [];
  const marketChanges = markets.map((m) => Number(m.change_pct));
  const skillScalars = scalarPairs(skill);

  const fmt = (v, err) => (err ? "⚠" : v == null ? "—" : v);

  return (
    <PageShell
      title="DASHBOARD"
      subtitle="LIVE PLATFORM METRICS · MARKETS · PREDICTION SKILL · ONTOLOGY · ALERTS"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={load} disabled={loading}>{loading ? "◌ SYNC" : "↻ REFRESH"}</Btn>}
    >
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="Markets Live" value={fmt(markets.length, intelErr)} accent={C.gold}
          sub={intelErr ? "feed down" : "tickers"} />
        <StatTile label="Earthquakes" value={fmt(quakes.length, intelErr)} accent={C.orange}
          sub={intelErr ? "feed down" : "USGS significant"} />
        <StatTile label="Ontology Objects" value={fmt(objCount, objErr)} accent={C.neon}
          sub={objErr ? "feed down" : "entities"} />
        <StatTile label="Open Alerts" value={fmt(alertCount, alertErr)}
          accent={alertCount ? C.red : C.text} sub={alertErr ? "feed down" : "operations"} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="MARKETS SPARKLINE" accent={C.gold}
          right={<Badge color={C.gold}>{markets.length}</Badge>}>
          {intelErr ? (
            <div style={{ fontSize: 10, color: C.red, padding: 8 }}>⚠ live intel feed unavailable</div>
          ) : markets.length === 0 ? (
            <div style={{ fontSize: 10, color: C.text, padding: 8 }}>No market data on the feed.</div>
          ) : (
            <>
              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 6 }}>% CHANGE PER TICKER</div>
              <Sparkline values={marketChanges} color={C.gold} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {markets.slice(0, 8).map((m, i) => {
                  const ch = Number(m.change_pct);
                  const up = ch >= 0;
                  return (
                    <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                      borderRadius: 4, padding: "5px 8px", minWidth: 78 }}>
                      <div style={{ fontSize: 8, color: C.text }}>{m.display || m.symbol}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.textB }}>{m.price}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: up ? C.neon : C.red }}>
                        {Number.isFinite(ch) ? `${up ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </PanelCard>

        <PanelCard title="PREDICTION SKILL" accent={C.purple}
          right={<Badge color={skillErr ? C.red : C.purple}>{skillErr ? "DOWN" : skill ? "LIVE" : "—"}</Badge>}>
          {skillErr ? (
            <div style={{ fontSize: 10, color: C.red, padding: 8 }}>⚠ skill scorecard unavailable</div>
          ) : (
            <>
              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 8 }}>SCORECARD METRICS</div>
              <ScalarBars pairs={skillScalars} />
              {skill?.n != null && (
                <div style={{ fontSize: 8, color: C.text, marginTop: 8 }}>n = {skill.n} predictions scored</div>
              )}
            </>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
