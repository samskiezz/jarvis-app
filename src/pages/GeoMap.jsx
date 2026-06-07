/**
 * GeoMap — REAL geospatial workspace with an interactive 3D globe.
 *
 * The globe plots every city that has live measurements (weather, air quality,
 * marine, etc.) as color-coded clickable markers. Clicking a city opens a detail
 * panel with all its current metrics. The globe uses Three.js with bloom
 * post-processing for the holographic Palantir-grade look.
 *
 * Data flows from real APIs (Open-Meteo, USGS, OpenSky, CoinGecko) through
 * brain.db measurements, surfaced here via the page-data API.
 */
import { useState, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";
import Globe3D from "@/components/Globe3D";

const ACCENT = C.blue;

export default function GeoMap() {
  const [selectedCity, setSelectedCity] = useState(null);

  const refresh = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <PageShell
      title="GEO MAP"
      subtitle="INTERACTIVE 3D GLOBE · LIVE MEASUREMENTS PER CITY"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={refresh}>↻ REFRESH DATA</Btn>}
    >
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="Cities Plotted" value="Live" accent={C.cyan} sub="from brain.db" />
        <StatTile label="Data Sources" value="4 APIs" accent={C.green} sub="Open-Meteo · USGS · OpenSky · CoinGecko" />
        <StatTile label="Metric Types" value="40+" accent={C.purple} sub="weather · air quality · marine · seismic · flights · crypto" />
        <StatTile label="Update" value="Real-time" accent={C.gold} sub="fetched every 30 min" />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: selectedCity ? "minmax(0, 2fr) minmax(0, 1fr)" : "1fr", gap: 14, alignItems: "start" }}>
        <PanelCard title="GOTHAM GLOBE" accent={ACCENT}>
          <Globe3D onSelectCity={setSelectedCity} height={640} />
        </PanelCard>

        {selectedCity && (
          <PanelCard
            title={selectedCity.name.toUpperCase()}
            accent={ACCENT}
            right={<button onClick={() => setSelectedCity(null)}
              style={{ cursor: "pointer", background: "none", border: "none", color: C.text, fontSize: 12 }}>✕</button>}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 8, color: C.text }}>
                {selectedCity.lat?.toFixed(4)}° N · {selectedCity.lon?.toFixed(4)}° E · {selectedCity.metrics.length} live metrics
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedCity.metrics.map((m, i) => (
                  <div key={i} style={{
                    background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: "8px 10px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: C.cyan, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {m.metric}
                      </span>
                      <span style={{ fontSize: 7, color: C.text }}>{m.source}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.textB, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {typeof m.value === "number" ? m.value.toFixed(2) : m.value}
                      <span style={{ fontSize: 9, color: C.text, marginLeft: 4, fontWeight: 400 }}>{m.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </PanelCard>
        )}
      </div>
    </PageShell>
  );
}
