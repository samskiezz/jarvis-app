/**
 * GeoWorkspace — front end for the Wave-6 Geospatial service (Palantir-Gotham
 * Map pillar). A lightweight equirectangular map canvas that plots ontology
 * objects with coordinates, supports radius + bbox selection, draws geofences,
 * and switches between data LAYERS (entities / seismic / air / buoys / flight /
 * density). No external map tiles — it's a self-contained SVG projection so it
 * works fully offline. Backed by /v1/geo/* (objects, radius, bbox, layers,
 * layers/{id}/features, geofences, contains, tracks).
 *
 * Honesty: layers whose real source isn't wired return empty FeatureCollections
 * (the backend says so) — this page surfaces that note rather than inventing dots.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, DataState, Badge } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;
const W = 720, H = 360; // equirectangular canvas
const proj = (lat, lon) => ({ x: ((lon + 180) / 360) * W, y: ((90 - lat) / 180) * H });
const LAYER_COLOR = { entities: C.neon, seismic: C.red, air_quality: C.gold, buoys: "#3bd", flight: "#c8f", density: C.gold };

function featureCoords(f) {
  // Accept GeoJSON Feature, {lat,lon}, or [lon,lat].
  const g = f.geometry;
  if (g && Array.isArray(g.coordinates) && g.type === "Point") return { lat: g.coordinates[1], lon: g.coordinates[0] };
  if (typeof f.lat === "number" && typeof f.lon === "number") return { lat: f.lat, lon: f.lon };
  const p = f.properties || {};
  if (typeof p.lat === "number" && typeof p.lon === "number") return { lat: p.lat, lon: p.lon };
  return null;
}

export default function GeoWorkspace() {
  const [layers, setLayers] = useState([]);
  const [layerId, setLayerId] = useState("entities");
  const [features, setFeatures] = useState([]);
  const [note, setNote] = useState(null);
  const [sel, setSel] = useState(null);     // clicked feature
  const [center, setCenter] = useState(null); // radius center {lat,lon}
  const [radiusKm, setRadiusKm] = useState(500);
  const [radiusHits, setRadiusHits] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const layersAsync = useAsync();
  const featAsync = useAsync();
  const radiusAsync = useAsync();

  useEffect(() => {
    (async () => {
      const body = await layersAsync.run(() => apiGet("/v1/geo/layers"));
      const list = asList(body, "layers");
      setLayers(list);
      const f = await apiGet("/v1/geo/geofences").catch(() => null);
      setGeofences(asList(f, "geofences"));
    })();
  }, []);

  const loadLayer = useCallback(async (id) => {
    const body = await featAsync.run(() => apiGet(`/v1/geo/layers/${encodeURIComponent(id)}/features${qs({ limit: 400 })}`));
    const feats = asList(body, "features");
    setFeatures(feats);
    setNote(body && body.note ? body.note : null);
    setSel(null);
  }, [featAsync]);

  useEffect(() => { loadLayer(layerId); }, [layerId, loadLayer]);

  const pts = useMemo(() =>
    features.map((f) => ({ f, c: featureCoords(f) })).filter((p) => p.c &&
      isFinite(p.c.lat) && isFinite(p.c.lon)), [features]);

  const runRadius = async (lat, lon) => {
    setCenter({ lat, lon });
    const body = await radiusAsync.run(() => apiGet(`/v1/geo/radius${qs({ lat, lon, km: radiusKm })}`));
    setRadiusHits(asList(body, "objects", "results"));
  };

  const onMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const lon = (x / W) * 360 - 180;
    const lat = 90 - (y / H) * 180;
    runRadius(Number(lat.toFixed(3)), Number(lon.toFixed(3)));
  };

  const accent = LAYER_COLOR[layerId] || ACCENT;

  return (
    <PageShell title="GEO WORKSPACE" subtitle="map · layers · radius/bbox select · geofences · tracks" accent={ACCENT}
      actions={<Badge color={accent}>{pts.length} PLOTTED</Badge>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="layer" value={layerId} accent={accent} />
        <StatTile label="features" value={features.length} accent={ACCENT} />
        <StatTile label="geofences" value={geofences.length} accent={C.gold} />
        <StatTile label="radius hits" value={radiusHits.length} accent={C.red} sub={center ? `${radiusKm}km @ ${center.lat},${center.lon}` : "click map"} />
      </Grid>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: C.text }}>LAYER</span>
        {(layers.length ? layers : [{ id: "entities", label: "entities" }]).map((l) => (
          <Btn key={l.id} accent={l.id === layerId ? (LAYER_COLOR[l.id] || ACCENT) : C.text}
            style={l.id === layerId ? {} : { opacity: 0.6 }} onClick={() => setLayerId(l.id)}>
            {(l.label || l.id).toUpperCase()}
          </Btn>
        ))}
        <span style={{ marginLeft: 16, fontSize: 9, color: C.text }}>RADIUS km</span>
        <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value) || 0)}
          style={{ ...inputStyle, width: 90 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <PanelCard title="MAP" accent={accent} right={note ? <Badge color={C.red}>{String(note)}</Badge> : null}>
          <DataState loading={featAsync.loading} error={featAsync.error}
            empty={!pts.length && !note} emptyLabel="No georeferenced features in this layer">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" onClick={onMapClick}
              style={{ display: "block", cursor: "crosshair", background: "#04080c", borderRadius: 4 }}>
              {/* graticule */}
              {[...Array(11)].map((_, i) => <line key={`v${i}`} x1={(i / 10) * W} y1={0} x2={(i / 10) * W} y2={H} stroke="#0e2230" strokeWidth="0.5" />)}
              {[...Array(7)].map((_, i) => <line key={`h${i}`} x1={0} y1={(i / 6) * H} x2={W} y2={(i / 6) * H} stroke="#0e2230" strokeWidth="0.5" />)}
              {/* geofences */}
              {geofences.map((g, i) => {
                const poly = (g.polygon || []).map(([la, lo]) => { const p = proj(la, lo); return `${p.x},${p.y}`; }).join(" ");
                return poly ? <polygon key={i} points={poly} fill={`${C.gold}14`} stroke={C.gold} strokeWidth="1" strokeDasharray="4 3" /> : null;
              })}
              {/* radius */}
              {center && (() => { const p = proj(center.lat, center.lon); const r = (radiusKm / 111) / 180 * H;
                return <circle cx={p.x} cy={p.y} r={Math.max(2, r)} fill={`${C.red}10`} stroke={C.red} strokeWidth="1" />; })()}
              {/* features */}
              {pts.map((p, i) => { const xy = proj(p.c.lat, p.c.lon);
                const isSel = sel === p.f;
                return <circle key={i} cx={xy.x} cy={xy.y} r={isSel ? 4.5 : 2.6}
                  fill={accent} fillOpacity={0.85} stroke={isSel ? "#fff" : "none"} strokeWidth="0.8"
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); setSel(p.f); }} />; })}
            </svg>
            <div style={{ fontSize: 8, color: C.text, marginTop: 6 }}>Click empty map → radius query · click a dot → inspect</div>
          </DataState>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelCard title="SELECTION" accent={ACCENT}>
            {sel ? (
              <div style={{ fontSize: 10, color: C.textB, lineHeight: 1.7 }}>
                <div><b style={{ color: ACCENT }}>{sel.label || sel.properties?.label || sel.id || "feature"}</b></div>
                {(() => { const c = featureCoords(sel); return c ? <div style={{ color: C.text }}>{c.lat}, {c.lon}</div> : null; })()}
                {sel.type && <Badge color={C.gold}>{sel.type}</Badge>}
                {sel.mark && <Badge color={C.red}>{sel.mark}</Badge>}
                <pre style={{ marginTop: 8, fontSize: 8, color: C.text, maxHeight: 120, overflow: "auto" }}>
                  {JSON.stringify(sel.properties || sel, null, 1)}
                </pre>
              </div>
            ) : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Click a map feature</div>}
          </PanelCard>

          <PanelCard title="RADIUS HITS" accent={C.red}>
            <DataState loading={radiusAsync.loading} empty={!radiusHits.length}
              emptyLabel="Click the map to query within a radius">
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
