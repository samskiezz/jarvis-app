/**
 * GeoMap — "GEO MAP": a geospatial workspace plotting live world signals on an
 * interactive 2D equirectangular world map.
 *
 * Live sources (each degrades independently so a single dead feed never blanks
 * the map):
 *   - getLiveIntel({type:"all"})  → earthquakes (lat/lng/mag) plotted as
 *     magnitude-scaled glowing dots, colored by magnitude (earthquakeColor).
 *   - /v1/ontology/objects        → ontology entities that carry geo props are
 *     plotted as diamond markers.
 *
 * Layers (Earthquakes / Entities / Heatmap) toggle on a hairline-bordered SVG
 * world (continent silhouettes as a faint backdrop). A magnitude legend sits
 * bottom-left; clicking any point opens a glass detail panel on the right.
 * House style throughout (PageKit glass + colors tokens).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C, earthquakeColor } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiGet, qs, asList, labelOf } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";

const ACCENT = C.blue;

// Equirectangular projection into a 360 (w) x 180 (h) viewBox.
const MAP_W = 360;
const MAP_H = 180;
const project = (lat, lng) => ({
  x: ((Number(lng) + 180) / 360) * MAP_W,
  y: ((90 - Number(lat)) / 180) * MAP_H,
});

// Very coarse continent silhouettes (just enough to orient the eye) — drawn as
// faint filled blobs behind the graticule. Pure decoration, no data.
const LAND = [
  // N. America
  "M40,28 L82,24 L96,44 L78,70 L58,78 L46,60 L40,42 Z",
  // S. America
  "M84,92 L100,88 L104,116 L92,140 L82,130 L82,104 Z",
  // Europe
  "M168,30 L196,26 L200,44 L182,52 L170,46 Z",
  // Africa
  "M170,60 L208,56 L214,96 L196,128 L182,110 L172,82 Z",
  // Asia
  "M204,24 L300,22 L312,58 L268,74 L224,64 L204,44 Z",
  // Australia
  "M286,116 L322,112 L330,134 L300,142 L284,130 Z",
];

// Pull a [lat,lng] out of an ontology object no matter where it stuffed them.
function geoOf(o) {
  const p = (o && (o.properties || o.props || o.geo || o)) || {};
  const lat = Number(p.lat ?? p.latitude ?? o?.lat ?? o?.latitude);
  const lng = Number(p.lng ?? p.lon ?? p.longitude ?? o?.lng ?? o?.lon ?? o?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

const LAYERS = [
  { id: "quakes", label: "EARTHQUAKES", color: C.orange },
  { id: "entities", label: "ENTITIES", color: C.gold },
  { id: "heatmap", label: "HEATMAP", color: C.red },
];

export default function GeoMap() {
  const [intel, setIntel] = useState(null);
  const [intelErr, setIntelErr] = useState(null);
  const [objects, setObjects] = useState([]);
  const [objErr, setObjErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [layers, setLayers] = useState({ quakes: true, entities: true, heatmap: false });
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setIntelErr(null);
    setObjErr(null);
    // Each feed is awaited independently so one failure can't blank the other.
    const [intelRes, objRes] = await Promise.allSettled([
      getLiveIntel({ type: "all" }),
      apiGet(`/v1/ontology/objects${qs({ limit: 500 })}`),
    ]);
    if (intelRes.status === "fulfilled") setIntel(intelRes.value || {});
    else { setIntel({}); setIntelErr(intelRes.reason); }
    if (objRes.status === "fulfilled") setObjects(asList(objRes.value, "objects"));
    else { setObjects([]); setObjErr(objRes.reason); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const quakes = useMemo(() => {
    const list = Array.isArray(intel?.earthquakes) ? intel.earthquakes : [];
    return list
      .map((q, i) => {
        const lat = Number(q.lat ?? q.latitude);
        const lng = Number(q.lng ?? q.lon ?? q.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { ...q, lat, lng, mag: Number(q.mag) || 0, _id: `q${i}` };
      })
      .filter(Boolean);
  }, [intel]);

  const entities = useMemo(() => {
    return objects
      .map((o, i) => {
        const g = geoOf(o);
        if (!g) return null;
        return { ...o, ...g, _id: `e${o.id ?? i}` };
      })
      .filter(Boolean);
  }, [objects]);

  const markets = Array.isArray(intel?.markets) ? intel.markets : [];
  const empty = !loading && !quakes.length && !entities.length;

  const toggle = (id) => setLayers((l) => ({ ...l, [id]: !l[id] }));

  return (
    <PageShell
      title="GEO MAP"
      subtitle="GEOSPATIAL WORKSPACE · LIVE SEISMIC · GEO-TAGGED ONTOLOGY ENTITIES"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={load} disabled={loading}>{loading ? "◌ SYNC" : "↻ REFRESH"}</Btn>}
    >
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="Earthquakes" value={quakes.length} accent={C.orange} sub={intelErr ? "feed down" : "USGS significant"} />
        <StatTile label="Geo Entities" value={entities.length} accent={C.gold} sub={objErr ? "feed down" : `${objects.length} objects`} />
        <StatTile label="Markets" value={markets.length} accent={C.blue} />
        <StatTile label="Max Mag" value={quakes.length ? Math.max(...quakes.map((q) => q.mag)).toFixed(1) : "—"} accent={C.red} />
      </Grid>

      {(intelErr || objErr) && (
        <div style={{ marginBottom: 14, padding: "9px 12px", border: `1px solid ${C.red}44`,
          background: C.redD, borderRadius: 5, fontSize: 9.5, color: C.textB }}>
          ⚠ PARTIAL FEED{intelErr && objErr ? "S" : ""} DOWN —{" "}
          {[intelErr && "live intel", objErr && "ontology"].filter(Boolean).join(" · ")} unavailable; other layers still render.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: selected ? "minmax(0,1.5fr) minmax(0,1fr)" : "1fr", gap: 14, alignItems: "start" }}>
        <PanelCard
          title="WORLD MAP"
          accent={ACCENT}
          right={
            <div style={{ display: "flex", gap: 6 }}>
              {LAYERS.map((L) => {
                const on = layers[L.id];
                return (
                  <button key={L.id} onClick={() => toggle(L.id)}
                    style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 8, letterSpacing: 1,
                      fontWeight: 700, padding: "4px 9px", borderRadius: 4,
                      border: `1px solid ${on ? L.color + "88" : C.border}`,
                      background: on ? L.color + "1a" : "rgba(0,0,0,0.25)", color: on ? L.color : C.text }}>
                    {on ? "● " : "○ "}{L.label}
                  </button>
                );
              })}
            </div>
          }
        >
          <DataState loading={loading} error={null} empty={empty} emptyLabel="No geospatial data on any live feed.">
            <div style={{ position: "relative", width: "100%", background: "#010408",
              border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" style={{ display: "block" }}
                onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
                <defs>
                  <radialGradient id="heatdot">
                    <stop offset="0%" stopColor={C.red} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={C.red} stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Continent silhouettes */}
                {LAND.map((d, i) => (
                  <path key={i} d={d} fill="rgba(0,150,212,0.06)" stroke="rgba(0,150,212,0.12)" strokeWidth="0.3" />
                ))}

                {/* Graticule */}
                {Array.from({ length: 11 }, (_, i) => i * (MAP_H / 10)).map((y, i) => (
                  <line key={`h${i}`} x1="0" y1={y} x2={MAP_W} y2={y} stroke="rgba(0,200,120,0.05)" strokeWidth="0.3" />
                ))}
                {Array.from({ length: 13 }, (_, i) => i * (MAP_W / 12)).map((x, i) => (
                  <line key={`v${i}`} x1={x} y1="0" x2={x} y2={MAP_H} stroke="rgba(0,200,120,0.05)" strokeWidth="0.3" />
                ))}
                <line x1="0" y1={MAP_H / 2} x2={MAP_W} y2={MAP_H / 2} stroke="rgba(0,200,120,0.12)" strokeWidth="0.4" />

                {/* Heatmap layer — soft red blooms scaled by magnitude */}
                {layers.heatmap && quakes.map((q) => {
                  const { x, y } = project(q.lat, q.lng);
                  return <circle key={`hm${q._id}`} cx={x} cy={y} r={2 + q.mag * 1.6} fill="url(#heatdot)" pointerEvents="none" />;
                })}

                {/* Entity markers (diamonds) */}
                {layers.entities && entities.map((en) => {
                  const { x, y } = project(en.lat, en.lng);
                  const active = selected?._kind === "entity" && selected._id === en._id;
                  const s = active ? 2.6 : 1.8;
                  return (
                    <g key={en._id} transform={`translate(${x},${y}) rotate(45)`} style={{ cursor: "pointer" }}
                      onClick={() => setSelected({ ...en, _kind: "entity" })}>
                      <rect x={-s} y={-s} width={s * 2} height={s * 2}
                        fill={C.gold + (active ? "" : "cc")} stroke="#010408" strokeWidth="0.3" />
                      {active && <rect x={-s - 1.5} y={-s - 1.5} width={(s + 1.5) * 2} height={(s + 1.5) * 2}
                        fill="none" stroke={C.gold} strokeWidth="0.4" transform="rotate(0)" />}
                    </g>
                  );
                })}

                {/* Earthquake dots (magnitude-scaled, mag-colored, glowing) */}
                {layers.quakes && quakes.map((q) => {
                  const { x, y } = project(q.lat, q.lng);
                  const col = earthquakeColor(q.mag);
                  const r = Math.max(1, (q.mag - 3) * 0.9 + 1);
                  const active = selected?._kind === "quake" && selected._id === q._id;
                  return (
                    <g key={q._id} style={{ cursor: "pointer" }} onClick={() => setSelected({ ...q, _kind: "quake" })}>
                      <circle cx={x} cy={y} r={r * 2.2} fill={col} opacity={0.18} />
                      <circle cx={x} cy={y} r={r} fill={col} stroke={active ? "#fff" : "#010408"} strokeWidth={active ? 0.6 : 0.3} />
                    </g>
                  );
                })}
              </svg>

              {/* Magnitude / intensity legend */}
              <div style={{ position: "absolute", left: 10, bottom: 10, padding: "8px 10px",
                background: "rgba(1,4,8,0.82)", border: `1px solid ${C.border}`, borderRadius: 5,
                backdropFilter: "blur(8px)" }}>
                <div style={{ fontSize: 7, letterSpacing: 1, color: C.text, marginBottom: 5 }}>MAGNITUDE</div>
                {[["6.0+", 6], ["5.0–5.9", 5], ["4.5–4.9", 4.6], ["< 4.5", 4]].map(([lab, m]) => (
                  <div key={lab} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: earthquakeColor(m),
                      boxShadow: `0 0 5px ${earthquakeColor(m)}` }} />
                    <span style={{ fontSize: 7.5, color: C.textB }}>{lab}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ width: 8, height: 8, background: C.gold, transform: "rotate(45deg)" }} />
                  <span style={{ fontSize: 7.5, color: C.textB }}>Entity</span>
                </div>
              </div>

              <div style={{ position: "absolute", top: 8, right: 10, fontSize: 7, color: "rgba(0,150,212,0.4)", letterSpacing: 1 }}>
                EQUIRECTANGULAR · {quakes.length} EQ · {entities.length} GEO ENTITIES
              </div>
            </div>
          </DataState>
        </PanelCard>

        {selected && (
          <PanelCard
            title={selected._kind === "quake" ? "SEISMIC EVENT" : "ENTITY"}
            accent={selected._kind === "quake" ? C.orange : C.gold}
            right={<button onClick={() => setSelected(null)}
              style={{ cursor: "pointer", background: "none", border: "none", color: C.text, fontSize: 12 }}>✕</button>}
          >
            {selected._kind === "quake" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: earthquakeColor(selected.mag), lineHeight: 1 }}>
                  M{selected.mag.toFixed(1)}
                </div>
                <div style={{ fontSize: 11, color: C.textB }}>{selected.place || "Unknown location"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                  <StatTile label="Lat" value={selected.lat.toFixed(2)} accent={C.blue} />
                  <StatTile label="Lng" value={selected.lng.toFixed(2)} accent={C.blue} />
                </div>
                {selected.depth != null && <Badge color={C.orange}>DEPTH {Number(selected.depth).toFixed(0)} km</Badge>}
                <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>
                  {selected.time ? new Date(typeof selected.time === "number" ? selected.time : Date.parse(selected.time)).toLocaleString() : "—"}
                </div>
                {selected.url && (
                  <a href={selected.url} target="_blank" rel="noreferrer" style={{ fontSize: 9, color: ACCENT }}>USGS event ↗</a>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{labelOf(selected)}</div>
                {selected.type && <Badge color={C.gold}>{selected.type}</Badge>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                  <StatTile label="Lat" value={selected.lat.toFixed(2)} accent={C.blue} />
                  <StatTile label="Lng" value={selected.lng.toFixed(2)} accent={C.blue} />
                </div>
                <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>ID {String(selected.id ?? "—")}</div>
              </div>
            )}
          </PanelCard>
        )}
      </div>
    </PageShell>
  );
}
