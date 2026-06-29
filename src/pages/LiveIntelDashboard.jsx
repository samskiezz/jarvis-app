/**
 * LiveIntelDashboard — real-time global intelligence feed.
 * Endpoint: POST /functions/getLiveIntel → { earthquakes, markets }
 *
 * Three panels:
 *   1. Seismic Activity — earthquakes ranked by magnitude (colour-coded M2–M8+)
 *   2. Markets — crypto + FX with price and 24-h change (green/red)
 *   3. Summary tiles — top magnitude, quake count, market movers
 *
 * Polls every 120 s.  Additive-only — no existing files modified.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.orange || "#F97316";
const POLL_MS = 120_000;

function magColor(m) {
  const v = Number(m) || 0;
  if (v >= 7)   return "#EF4444";
  if (v >= 6)   return "#F97316";
  if (v >= 5)   return "#F59E0B";
  if (v >= 4)   return "#EAB308";
  if (v >= 3)   return "#84CC16";
  return C.text || "#7A95AB";
}

function changeColor(pct) {
  const v = Number(pct) || 0;
  return v >= 0 ? (C.neon || "#00c878") : (C.red || "#E8203C");
}

function fmtChange(pct) {
  const v = Number(pct) || 0;
  return `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(2)}%`;
}

function fmtPrice(p) {
  const v = Number(p);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000)  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1)     return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return v.toFixed(6);
}

function quakeLabel(q) {
  return (
    q?.place || q?.location || q?.title || q?.description ||
    (q?.lat != null && q?.lng != null ? `${Number(q.lat).toFixed(2)}, ${Number(q.lng).toFixed(2)}` : "Unknown location")
  );
}

function QuakeRow({ q }) {
  const mag = Number(q?.mag) || 0;
  const col = magColor(mag);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{
        minWidth: 36, textAlign: "center", fontWeight: 700,
        fontSize: 13, color: col, textShadow: `0 0 8px ${col}66`,
        fontVariantNumeric: "tabular-nums",
      }}>
        M{mag.toFixed(1)}
      </span>
      <span style={{ flex: 1, fontSize: 11, color: C.textB || "#DCEBF5", letterSpacing: 0.3, overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {quakeLabel(q)}
      </span>
      {q?.depth != null && (
        <span style={{ fontSize: 9, color: C.text, letterSpacing: 1, flexShrink: 0 }}>
          {Number(q.depth).toFixed(0)} km
        </span>
      )}
    </div>
  );
}

function MarketRow({ m }) {
  const pct = Number(m?.change_pct) || 0;
  const col = changeColor(pct);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ minWidth: 72, fontSize: 11, fontWeight: 700,
        color: C.textB || "#DCEBF5", letterSpacing: 1 }}>
        {m?.display || m?.symbol || "—"}
      </span>
      <span style={{ flex: 1, fontSize: 11, color: C.text || "#7A95AB",
        fontVariantNumeric: "tabular-nums" }}>
        {fmtPrice(m?.price)}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: col,
        textShadow: `0 0 6px ${col}55`, letterSpacing: 0.5 }}>
        {fmtChange(pct)}
      </span>
    </div>
  );
}

export default function LiveIntelDashboard() {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLiveIntel({ type: "all" });
      setIntel(res || {});
      setLastFetch(Date.now());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const quakes = Array.isArray(intel?.earthquakes)
    ? [...intel.earthquakes].sort((a, b) => (Number(b?.mag) || 0) - (Number(a?.mag) || 0))
    : [];

  const markets = Array.isArray(intel?.markets) ? intel.markets : [];
  const crypto  = markets.filter((m) => !String(m?.type || "").toLowerCase().includes("fx"));
  const fx      = markets.filter((m) =>  String(m?.type || "").toLowerCase().includes("fx"));

  const topMag  = quakes.length ? Math.max(...quakes.map((q) => Number(q?.mag) || 0)) : null;
  const topGain = markets.reduce((best, m) =>
    (Number(m?.change_pct) || 0) > (Number(best?.change_pct) || -Infinity) ? m : best, null);
  const topLoss = markets.reduce((best, m) =>
    (Number(m?.change_pct) || 0) < (Number(best?.change_pct) || Infinity) ? m : best, null);

  const ageSec  = lastFetch ? Math.round((Date.now() - lastFetch) / 1000) : null;

  return (
    <PageShell
      title="LIVE INTEL DASHBOARD"
      subtitle={`GLOBAL SIGNAL FUSION · POST /functions/getLiveIntel · ${POLL_MS / 1000}s POLL${ageSec != null ? ` · ${ageSec}s AGO` : ""}`}
      accent={ACCENT}
    >
      {/* Summary stat tiles */}
      <Grid min={150} gap={10} style={{ marginBottom: 16 }}>
        <StatTile label="Earthquakes" value={loading ? "…" : quakes.length}
          accent={C.red} sub="USGS significant events" />
        <StatTile label="Top Magnitude"
          value={loading ? "…" : topMag != null ? `M${topMag.toFixed(1)}` : "—"}
          accent={magColor(topMag)} />
        <StatTile label="Market Signals"  value={loading ? "…" : markets.length}
          accent={ACCENT} sub={`${crypto.length} crypto · ${fx.length} fx`} />
        <StatTile label="Top Gainer"
          value={topGain ? fmtChange(topGain?.change_pct) : "—"}
          accent={C.neon} sub={topGain?.display || "—"} />
        <StatTile label="Top Mover Down"
          value={topLoss ? fmtChange(topLoss?.change_pct) : "—"}
          accent={C.red} sub={topLoss?.display || "—"} />
      </Grid>

      <DataState loading={loading && !intel} error={error && !intel} empty={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Seismic panel */}
          <PanelCard
            title={`SEISMIC ACTIVITY — ${quakes.length} EVENT${quakes.length !== 1 ? "S" : ""}`}
            accent={C.red}
            right={<Badge color={C.red}>RANKED BY MAG</Badge>}
          >
            <DataState loading={loading && !intel} error={null} empty={!loading && quakes.length === 0} emptyLabel="No significant seismic events">
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {quakes.slice(0, 50).map((q, i) => <QuakeRow key={i} q={q} />)}
              </div>
            </DataState>
          </PanelCard>

          {/* Markets panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PanelCard
              title={`CRYPTO MARKETS — ${crypto.length} PAIR${crypto.length !== 1 ? "S" : ""}`}
              accent={ACCENT}
              right={<Badge color={ACCENT}>LIVE</Badge>}
            >
              <DataState loading={loading && !intel} error={null} empty={!loading && crypto.length === 0} emptyLabel="No crypto data">
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {crypto.map((m, i) => <MarketRow key={i} m={m} />)}
                </div>
              </DataState>
            </PanelCard>

            <PanelCard
              title={`FX RATES — ${fx.length} PAIR${fx.length !== 1 ? "S" : ""}`}
              accent={C.blue}
              right={<Badge color={C.blue}>LIVE</Badge>}
            >
              <DataState loading={loading && !intel} error={null} empty={!loading && fx.length === 0} emptyLabel="No FX data">
                <div style={{ maxHeight: 190, overflowY: "auto" }}>
                  {fx.map((m, i) => <MarketRow key={i} m={m} />)}
                </div>
              </DataState>

              {/* Fallback: if backend doesn't classify, show all markets in combined view */}
              {fx.length === 0 && crypto.length === 0 && markets.length > 0 && (
                <div style={{ maxHeight: 190, overflowY: "auto" }}>
                  {markets.map((m, i) => <MarketRow key={i} m={m} />)}
                </div>
              )}
            </PanelCard>
          </div>
        </div>
      </DataState>
    </PageShell>
  );
}
