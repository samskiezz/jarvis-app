/**
 * GeoWorkspace — the Gotham-grade map application. A real Leaflet dark-tile map
 * (CartoDB dark_matter basemap, no key) with live data LAYERS, radius/bbox
 * selection, geofences, and movement. Switch layers (entities / seismic / flight
 * / buoys / air_quality / density) — all backed by real /v1/geo feeds. Click the
 * map to run a radius query; draw geofences server-side. Replaces the old SVG
 * canvas with a true pan/zoom/select map workspace.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, Polygon, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, qs, asList, useAsync } from "@/lib/wave1";

const LAYER_COLOR = { entities: "#00c878", seismic: "#e8203c", air_quality: "#e8a800", buoys: "#3bd4ff", flight: "#c88cff", density: "#e8a800" };
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR = "&copy; OpenStreetMap &copy; CARTO";

function featureCoords(f) {
  const g = f.geometry;
  if (g && Array.isArray(g.coordinates) && g.type === "Point") return { lat: g.coordinates[1], lon: g.coordinates[0] };
  if (typeof f.lat === "number" && typeof f.lon === "number") return { lat: f.lat, lon: f.lon };
  const p = f.properties || {};
  if (typeof p.lat === "number" && typeof p.lon === "number") return { lat: p.lat, lon: p.lon };
  return null;
}

// Leaflet click → radius query (must be a child of MapContainer).
function ClickToQuery({ onClick }) {
  useMapEvents({ click(e) { onClick(Number(e.latlng.lat.toFixed(3)), Number(e.latlng.lng.toFixed(3))); } });
  return null;
}

export default function GeoWorkspace() {
  const [layers, setLayers] = useState([]);
  const [layerId, setLayerId] = useState("entities");
  const [features, setFeatures] = useState([]);
  const [note, setNote] = useState(null);
  const [sel, setSel] = useState(null);
  const [center, setCenter] = useState(null);
  const [radiusKm, setRadiusKm] = useState(500);
  const [radiusHits, setRadiusHits] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const layersAsync = useAsync();
  const featAsync = useAsync();
  const radiusAsync = useAsync();

  useEffect(() => {
    (async () => {
      const body = await layersAsync.run(() => apiGet("/v1/geo/layers"));
      setLayers(asList(body, "layers"));
      const f = await apiGet("/v1/geo/geofences").catch(() => null);
      setGeofences(asList(f, "geofences"));
    })();
  }, []);

  const loadLayer = useCallback(async (id) => {
    const body = await featAsync.run(() => apiGet(`/v1/geo/layers/${encodeURIComponent(id)}/features${qs({ limit: 500 })}`));
    setFeatures(asList(body, "features"));
    setNote(body && body.note ? body.note : null);
    setSel(null);
  }, [featAsync]);
  useEffect(() => { loadLayer(layerId); }, [layerId, loadLayer]);

  const pts = useMemo(() =>
    features.map((f) => ({ f, c: featureCoords(f) })).filter((p) => p.c && isFinite(p.c.lat) && isFinite(p.c.lon)), [features]);

  const runRadius = useCallback(async (lat, lon) => {
    setCenter({ lat, lon });
    const body = await radiusAsync.run(() => apiGet(`/v1/geo/radius${qs({ lat, lon, km: radiusKm })}`));
    setRadiusHits(asList(body, "objects", "results"));
  }, [radiusAsync, radiusKm]);

  const accent = LAYER_COLOR[layerId] || C.neon;

  return (
    <PageShell title="GEO WORKSPACE" subtitle="live Leaflet map · layers · radius select · geofences" accent={C.neon}
      actions={<Badge color={accent}>{pts.length} PLOTTED</Badge>}>
      <Grid min={150} style={{ marginBottom: 12 }}>
        <StatTile label="layer" value={layerId} accent={accent} />
        <StatTile label="features" value={features.length} accent={C.neon} />
        <StatTile label="geofences" value={geofences.length} accent={C.gold} />
        <StatTile label="radius hits" value={radiusHits.length} accent={C.red} sub={center ? `${radiusKm}km @ ${center.lat},${center.lon}` : "click map"} />
      </Grid>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: C.text }}>LAYER</span>
        {(layers.length ? layers : [{ id: "entities", label: "entities" }]).map((l) => (
          <Btn key={l.id} accent={l.id === layerId ? (LAYER_COLOR[l.id] || C.neon) : C.text}
            style={l.id === layerId ? {} : { opacity: 0.6 }} onClick={() => setLayerId(l.id)}>
            {(l.label || l.id).toUpperCase()}
          </Btn>
        ))}
        <span style={{ marginLeft: 16, fontSize: 9, color: C.text }}>RADIUS km</span>
        <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value) || 0)} style={{ ...inputStyle, width: 90 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <PanelCard title="MAP" accent={accent} right={note ? <Badge color={C.red}>{String(note)}</Badge> : null}>
          <div style={{ height: 460, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <MapContainer center={[20, 0]} zoom={2} minZoom={2} worldCopyJump style={{ height: "100%", width: "100%", background: "#04080c" }}>
              <TileLayer url={DARK_TILES} attribution={TILE_ATTR} subdomains="abcd" />
              <ClickToQuery onClick={runRadius} />
              {pts.map((p, i) => {
                const isSel = sel === p.f;
                return (
                  <CircleMarker key={i} center={[p.c.lat, p.c.lon]} radius={isSel ? 8 : 5}
                    pathOptions={{ color: isSel ? "#fff" : accent, fillColor: accent, fillOpacity: 0.85, weight: isSel ? 2 : 1 }}
                    eventHandlers={{ click: () => setSel(p.f) }}>
                    <Popup>
                      <div style={{ fontFamily: "monospace", fontSize: 11 }}>
                        <b>{p.f.label || p.f.properties?.label || p.f.id || "feature"}</b><br />
                        {p.c.lat.toFixed(3)}, {p.c.lon.toFixed(3)}
                        {p.f.properties?.mag != null && <><br />mag {p.f.properties.mag}</>}
                        {p.f.properties?.us_aqi != null && <><br />AQI {p.f.properties.us_aqi}</>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
              {geofences.map((g, i) => {
                const poly = (g.polygon || []).map(([la, lo]) => [la, lo]);
                return poly.length ? <Polygon key={i} positions={poly} pathOptions={{ color: C.gold, fillOpacity: 0.08, dashArray: "5 4" }} /> : null;
              })}
              {center && <Circle center={[center.lat, center.lon]} radius={radiusKm * 1000} pathOptions={{ color: C.red, fillOpacity: 0.06 }} />}
            </MapContainer>
          </div>
          <div style={{ fontSize: 8, color: C.text, marginTop: 6 }}>Click the map → radius query · click a marker → inspect</div>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelCard title="SELECTION" accent={C.neon}>
            {sel ? (
              <div style={{ fontSize: 10, color: C.textB, lineHeight: 1.7 }}>
                <div><b style={{ color: accent }}>{sel.label || sel.properties?.label || sel.id || "feature"}</b></div>
                {(() => { const c = featureCoords(sel); return c ? <div style={{ color: C.text }}>{c.lat}, {c.lon}</div> : null; })()}
                {sel.type && <Badge color={C.gold}>{sel.type}</Badge>}{" "}
                {sel.mark && <Badge color={C.red}>{sel.mark}</Badge>}
                <pre style={{ marginTop: 8, fontSize: 8, color: C.text, maxHeight: 160, overflow: "auto" }}>{JSON.stringify(sel.properties || sel, null, 1)}</pre>
              </div>
            ) : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Click a map marker</div>}
          </PanelCard>
          <PanelCard title="RADIUS HITS" accent={C.red}>
            <DataState loading={radiusAsync.loading} empty={!radiusHits.length} emptyLabel="Click the map to query within a radius">
              <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {radiusHits.slice(0, 40).map((o, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 10, padding: "3px 5px", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.textB, flex: 1 }}>{o.label || o.id}</span>
                    <span style={{ color: C.gold }}>{typeof o.distance === "number" ? `${o.distance.toFixed(0)}km` : o.distance_km ? `${Number(o.distance_km).toFixed(0)}km` : ""}</span>
                  </div>
                ))}
              </div>
            </DataState>
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
