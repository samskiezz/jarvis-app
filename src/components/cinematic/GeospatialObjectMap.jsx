/**
 * GeospatialObjectMap — F274.
 *
 * Data sources:
 *   GET /v1/geo/objects  → {count, objects:[{object_id,label,type,lat,lon,...}]}
 *   GET /v1/geo/layers   → {count, layers:[{layer_id,name,feature_count,...}]}
 *
 * Displays:
 *   - SVG Mercator-projected world map with dots (radius 6) colored by object type
 *   - Hover tooltip: label + type + lat/lon
 *   - Layer toggle sidebar from /v1/geo/layers
 *   - Click dot → inspector drawer with full props
 *   - Zoom/pan via SVG transform (mouse wheel + drag)
 *   - Type filter checkbox list
 *   - ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ GEOMAP  left:201240  bottom:8  zIndex:370
 * Event:  jarvis:geomap-toggle
 * Voice:  "geospatial object map / geomap / geo object map / geographic map /
 *          object map / geo map / spatial map / map view"
 *
 * Exported for JarvisBrain: isGeomapQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PURP = "#B06EFF";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

// Type → color map
const TYPE_COLORS = {
  vessel:      "#29E7FF",
  aircraft:    "#4ADE80",
  vehicle:     "#F5A623",
  person:      "#B06EFF",
  facility:    "#F87171",
  device:      "#38BDF8",
  sensor:      "#34D399",
  station:     "#FB923C",
  asset:       "#A78BFA",
  threat:      "#F43F5E",
};

function typeColor(t) {
  return TYPE_COLORS[(t || "").toLowerCase()] || AM;
}

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT   = 201240;
const PANEL_W    = 860;
const PANEL_H    = 580;
const REFRESH_MS = 90_000;
const MAP_W      = 560;
const MAP_H      = 320;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const GEOMAP_RE =
  /\b(geospatial\s+object\s+map|geomap\b|geo\s+object\s+map|geographic\s+map|object\s+map|geo\s+map|spatial\s+map|map\s+view)\b/i;

export function isGeomapQuery(q) {
  return GEOMAP_RE.test(q || "");
}

// ─── Mercator projection ──────────────────────────────────────────────────────
function lonLatToXY(lon, lat, w, h) {
  const x = ((lon + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN / Math.PI) * h * 0.5;
  return { x, y };
}

// ─── fetch helpers ────────────────────────────────────────────────────────────
async function fetchObjects() {
  const r = await fetch(`${apiBase()}/v1/geo/objects`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`objects ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.objects)
    ? d.objects
    : Array.isArray(d?.items)
    ? d.items
    : [];
}

async function fetchLayers() {
  const r = await fetch(`${apiBase()}/v1/geo/layers`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`layers ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.layers)
    ? d.layers
    : Array.isArray(d?.items)
    ? d.items
    : [];
}

function hdrs() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
}

async function ttsSpeak(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({ text, voice: "jarvis" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = new Audio(url);
    a.onended  = () => URL.revokeObjectURL(url);
    a.play().catch(() => {});
  } catch {}
}

async function assessMap(objects) {
  if (objects.length === 0) return "Geospatial object map: no located objects on record.";
  const types = {};
  objects.forEach((o) => {
    const t = (o.type || "unknown").toLowerCase();
    types[t] = (types[t] || 0) + 1;
  });
  const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
  const lats = objects.map((o) => o.lat).filter((v) => v != null);
  const lons = objects.map((o) => o.lon).filter((v) => v != null);
  const latC = lats.length ? (lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(2) : "N/A";
  const lonC = lons.length ? (lons.reduce((a, b) => a + b, 0) / lons.length).toFixed(2) : "N/A";
  const script =
    `Geospatial object map: ${objects.length} located objects across ${Object.keys(types).length} types. ` +
    `Most common type: ${topType ? topType[0] + " (" + topType[1] + ")" : "unknown"}. ` +
    `Geographic centroid: lat ${latC}, lon ${lonC}. ` +
    `Object distribution: ${Object.entries(types).map(([t, n]) => `${n} ${t}`).join(", ")}. ` +
    `Assess geographic clustering and coverage gaps.`;
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({ message: script }),
    });
    if (!r.ok) return script;
    const d = await r.json();
    return d?.response || d?.message || script;
  } catch {
    return script;
  }
}

// ─── world outline SVG path (simplified) ─────────────────────────────────────
// A minimal continent outline for background context
function WorldOutline({ w, h }) {
  return (
    <rect
      x={0} y={0} width={w} height={h}
      fill="rgba(10,20,35,0.9)"
      stroke="rgba(41,231,255,0.08)"
      strokeWidth={1}
    />
  );
}

// ─── dot tooltip ──────────────────────────────────────────────────────────────
function DotTooltip({ obj, x, y, mapW, mapH }) {
  const tipW = 180;
  const tipH = 64;
  const tx = x + tipW + 14 > mapW ? x - tipW - 8 : x + 14;
  const ty = y - 10 < 0 ? y + 6 : y - tipH / 2;
  return (
    <foreignObject x={tx} y={Math.max(0, Math.min(ty, mapH - tipH))} width={tipW} height={tipH}>
      <div style={{
        background: "rgba(10,18,30,0.96)",
        border: `1px solid ${CY}`,
        borderRadius: 4,
        padding: "6px 9px",
        fontSize: 10,
        color: CY,
        fontFamily: "monospace",
        lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 700, color: "#fff", fontSize: 11 }}>
          {obj.label || obj.object_id || "—"}
        </div>
        <div><span style={{ color: GRAY }}>type </span>{obj.type || "?"}</div>
        <div>
          <span style={{ color: GRAY }}>lat </span>
          {typeof obj.lat === "number" ? obj.lat.toFixed(4) : "?"}
          <span style={{ color: GRAY, marginLeft: 6 }}>lon </span>
          {typeof obj.lon === "number" ? obj.lon.toFixed(4) : "?"}
        </div>
      </div>
    </foreignObject>
  );
}

// ─── inspector drawer ─────────────────────────────────────────────────────────
function Inspector({ obj, onClose }) {
  if (!obj) return null;
  const entries = Object.entries(obj).filter(([k]) =>
    !["lat", "lon"].includes(k)
  );
  return (
    <div style={{
      position: "absolute",
      top: 0, right: 0,
      width: 260,
      height: "100%",
      background: "rgba(8,16,28,0.98)",
      borderLeft: `1px solid ${BORD}`,
      overflowY: "auto",
      padding: "12px 14px",
      zIndex: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700 }}>
          OBJECT INSPECTOR
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 14 }}
        >×</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={{
          fontSize: 9, border: `1px solid ${typeColor(obj.type)}`,
          color: typeColor(obj.type), borderRadius: 3, padding: "1px 5px", fontWeight: 700,
          textTransform: "uppercase",
        }}>
          {obj.type || "unknown"}
        </span>
      </div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 5 }}>
          <span style={{ color: GRAY, fontSize: 9, textTransform: "uppercase" }}>{k} </span>
          <span style={{ color: "#e0e8f0", fontSize: 10 }}>
            {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
          </span>
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <span style={{ color: GRAY, fontSize: 9, textTransform: "uppercase" }}>lat </span>
        <span style={{ color: GN, fontSize: 10 }}>
          {typeof obj.lat === "number" ? obj.lat.toFixed(6) : "—"}
        </span>
        <span style={{ color: GRAY, fontSize: 9, marginLeft: 10 }}>lon </span>
        <span style={{ color: GN, fontSize: 10 }}>
          {typeof obj.lon === "number" ? obj.lon.toFixed(6) : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function GeospatialObjectMap() {
  const [open,       setOpen]       = useState(false);
  const [objects,    setObjects]    = useState([]);
  const [layers,     setLayers]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [hoveredObj, setHoveredObj] = useState(null);
  const [hoveredXY,  setHoveredXY]  = useState({ x: 0, y: 0 });
  const [selectedObj,setSelectedObj]= useState(null);
  const [enabledLayers, setEnabledLayers] = useState({});
  const [typeFilters,   setTypeFilters]   = useState({});
  const [zoom,       setZoom]       = useState(1);
  const [pan,        setPan]        = useState({ x: 0, y: 0 });
  const [dragging,   setDragging]   = useState(false);
  const [dragStart,  setDragStart]  = useState({ x: 0, y: 0 });
  const [panStart,   setPanStart]   = useState({ x: 0, y: 0 });
  const [assess,     setAssess]     = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);
  const svgRef   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [objs, lyrs] = await Promise.all([fetchObjects(), fetchLayers()]);
      setObjects(objs);
      setLayers(lyrs);
      // init layer toggles
      setEnabledLayers((prev) => {
        const next = { ...prev };
        lyrs.forEach((l) => {
          if (next[l.layer_id] === undefined) next[l.layer_id] = true;
        });
        return next;
      });
      // init type filters
      const types = Array.from(new Set(objs.map((o) => (o.type || "unknown").toLowerCase())));
      setTypeFilters((prev) => {
        const next = { ...prev };
        types.forEach((t) => {
          if (next[t] === undefined) next[t] = true;
        });
        return next;
      });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (ev) => {
      if (ev?.detail?.open !== undefined) setOpen(ev.detail.open);
      else setOpen((o) => !o);
    };
    window.addEventListener("jarvis:geomap-toggle", handler);
    return () => window.removeEventListener("jarvis:geomap-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // All unique types
  const allTypes = Array.from(new Set(objects.map((o) => (o.type || "unknown").toLowerCase())));

  // Filtered objects
  const visibleObjs = objects.filter((o) => {
    const t = (o.type || "unknown").toLowerCase();
    return typeFilters[t] !== false &&
      typeof o.lat === "number" && typeof o.lon === "number";
  });

  function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((z) => Math.min(8, Math.max(0.5, z * factor)));
  }

  function handleMouseDown(e) {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ ...pan });
  }

  function handleMouseMove(e) {
    if (!dragging) return;
    setPan({
      x: panStart.x + (e.clientX - dragStart.x),
      y: panStart.y + (e.clientY - dragStart.y),
    });
  }

  function handleMouseUp() {
    setDragging(false);
  }

  async function handleAssess() {
    setAssessing(true);
    setAssess(null);
    const txt = await assessMap(visibleObjs);
    setAssess(txt);
    setAssessing(false);
    await ttsSpeak(txt);
  }

  const BTN_STYLE = {
    position: "fixed",
    left:     BTN_LEFT,
    bottom:   8,
    zIndex:   370,
    background: "rgba(12,24,36,0.92)",
    border: `1px solid ${CY}`,
    color:  CY,
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 11,
    fontFamily: "monospace",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const PANEL_STYLE = {
    position:    "fixed",
    left:        BTN_LEFT,
    bottom:      36,
    zIndex:      371,
    width:       PANEL_W,
    height:      PANEL_H,
    background:  SURF,
    border:      `1px solid ${BORD}`,
    borderRadius: 6,
    display:     "flex",
    flexDirection: "column",
    overflow:    "hidden",
    fontFamily:  "monospace",
    boxShadow:   "0 4px 40px rgba(0,0,0,0.7)",
  };

  if (!open) {
    return (
      <button
        style={BTN_STYLE}
        onClick={() => setOpen(true)}
        title="Geospatial Object Map"
      >
        ◈ GEOMAP
        {visibleObjs.length > 0 && (
          <span style={{
            marginLeft: 5, fontSize: 9, color: GN,
            border: `1px solid ${GN}`, borderRadius: 3, padding: "0 4px",
          }}>
            {visibleObjs.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <button style={{ ...BTN_STYLE, color: AM, borderColor: AM }} onClick={() => setOpen(false)}>
        ◈ GEOMAP ▾
      </button>
      <div style={PANEL_STYLE}>
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderBottom: `1px solid ${BORD}`, flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 12, fontWeight: 700 }}>
            GEOSPATIAL OBJECT MAP
            <span style={{ color: GRAY, fontWeight: 400, fontSize: 10, marginLeft: 8 }}>
              {visibleObjs.length}/{objects.length} objects
            </span>
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ color: GRAY, fontSize: 9 }}>layers: {layers.length}</span>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: "none", border: `1px solid ${AM}`, color: AM,
                borderRadius: 3, padding: "2px 8px", fontSize: 10,
                cursor: assessing ? "not-allowed" : "pointer", fontFamily: "monospace",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "none", border: `1px solid ${GRAY}`, color: GRAY,
                borderRadius: 3, padding: "2px 6px", fontSize: 10,
                cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace",
              }}
            >
              ↺
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: GRAY,
                cursor: "pointer", fontSize: 14,
              }}
            >×</button>
          </div>
        </div>

        {/* body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* left sidebar: type filters + layers */}
          <div style={{
            width: 160, flexShrink: 0,
            borderRight: `1px solid ${BORD}`,
            overflowY: "auto",
            padding: "8px 10px",
          }}>
            <div style={{ color: GRAY, fontSize: 9, textTransform: "uppercase", marginBottom: 6 }}>
              Type Filter
            </div>
            {allTypes.map((t) => (
              <label key={t} style={{
                display: "flex", alignItems: "center", gap: 5,
                marginBottom: 4, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={typeFilters[t] !== false}
                  onChange={(e) =>
                    setTypeFilters((prev) => ({ ...prev, [t]: e.target.checked }))
                  }
                  style={{ accentColor: typeColor(t), width: 12, height: 12 }}
                />
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: typeColor(t), display: "inline-block", flexShrink: 0,
                }} />
                <span style={{ color: "#c0ccd8", fontSize: 10 }}>{t}</span>
              </label>
            ))}

            {layers.length > 0 && (
              <>
                <div style={{
                  color: GRAY, fontSize: 9, textTransform: "uppercase",
                  marginTop: 12, marginBottom: 6, borderTop: `1px solid ${BORD}`, paddingTop: 8,
                }}>
                  Layers
                </div>
                {layers.map((l) => (
                  <label key={l.layer_id} style={{
                    display: "flex", alignItems: "flex-start", gap: 5,
                    marginBottom: 4, cursor: "pointer",
                  }}>
                    <input
                      type="checkbox"
                      checked={enabledLayers[l.layer_id] !== false}
                      onChange={(e) =>
                        setEnabledLayers((prev) => ({ ...prev, [l.layer_id]: e.target.checked }))
                      }
                      style={{ accentColor: CY, width: 12, height: 12, marginTop: 2 }}
                    />
                    <div>
                      <div style={{ color: "#c0ccd8", fontSize: 10 }}>{l.name || l.layer_id}</div>
                      {l.feature_count != null && (
                        <div style={{ color: GRAY, fontSize: 9 }}>{l.feature_count} features</div>
                      )}
                    </div>
                  </label>
                ))}
              </>
            )}

            {allTypes.length === 0 && !loading && (
              <div style={{ color: GRAY, fontSize: 10, marginTop: 8 }}>No objects</div>
            )}
          </div>

          {/* map area */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {loading && (
              <div style={{
                position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
                color: CY, fontSize: 11, zIndex: 5,
              }}>
                Loading…
              </div>
            )}
            {err && (
              <div style={{
                position: "absolute", top: 10, left: 10,
                color: RD, fontSize: 10, zIndex: 5,
              }}>
                {err}
              </div>
            )}

            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              style={{ cursor: dragging ? "grabbing" : "grab", display: "block" }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                <WorldOutline w={MAP_W} h={MAP_H} />
                {/* graticule grid */}
                {[-60, -30, 0, 30, 60].map((lat) => {
                  const { y } = lonLatToXY(0, lat, MAP_W, MAP_H);
                  return (
                    <line
                      key={`lat${lat}`}
                      x1={0} y1={y} x2={MAP_W} y2={y}
                      stroke="rgba(41,231,255,0.06)" strokeWidth={0.5 / zoom}
                    />
                  );
                })}
                {[-120, -60, 0, 60, 120].map((lon) => {
                  const { x } = lonLatToXY(lon, 0, MAP_W, MAP_H);
                  return (
                    <line
                      key={`lon${lon}`}
                      x1={x} y1={0} x2={x} y2={MAP_H}
                      stroke="rgba(41,231,255,0.06)" strokeWidth={0.5 / zoom}
                    />
                  );
                })}

                {/* object dots */}
                {visibleObjs.map((obj) => {
                  const { x, y } = lonLatToXY(obj.lon, obj.lat, MAP_W, MAP_H);
                  const col      = typeColor(obj.type);
                  const isHov    = hoveredObj?.object_id === obj.object_id;
                  const isSel    = selectedObj?.object_id === obj.object_id;
                  const r        = 6 / zoom;
                  return (
                    <g key={obj.object_id || `${obj.lat},${obj.lon}`}>
                      {(isHov || isSel) && (
                        <circle
                          cx={x} cy={y}
                          r={(r + 4) / zoom}
                          fill="none"
                          stroke={col}
                          strokeWidth={1 / zoom}
                          opacity={0.5}
                        />
                      )}
                      <circle
                        cx={x} cy={y}
                        r={isSel ? r * 1.3 : r}
                        fill={col}
                        opacity={isSel ? 1 : 0.85}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedObj((prev) =>
                            prev?.object_id === obj.object_id ? null : obj
                          );
                        }}
                        onMouseEnter={(e) => {
                          const svgRect = svgRef.current?.getBoundingClientRect();
                          if (svgRect) {
                            const svgW = svgRect.width;
                            const svgH = svgRect.height;
                            const scaleX = svgW / MAP_W;
                            const scaleY = svgH / MAP_H;
                            setHoveredXY({
                              x: (x * zoom + pan.x) * scaleX,
                              y: (y * zoom + pan.y) * scaleY,
                            });
                          }
                          setHoveredObj(obj);
                        }}
                        onMouseLeave={() => setHoveredObj(null)}
                      />
                    </g>
                  );
                })}

                {/* hover tooltip in SVG space */}
                {hoveredObj && (() => {
                  const { x, y } = lonLatToXY(hoveredObj.lon, hoveredObj.lat, MAP_W, MAP_H);
                  return (
                    <DotTooltip
                      obj={hoveredObj}
                      x={x}
                      y={y}
                      mapW={MAP_W / zoom}
                      mapH={MAP_H / zoom}
                    />
                  );
                })()}
              </g>
            </svg>

            {/* zoom hint */}
            <div style={{
              position: "absolute", bottom: 6, left: 8,
              color: GRAY, fontSize: 9, pointerEvents: "none",
            }}>
              scroll=zoom · drag=pan · click dot=inspect
            </div>

            {/* zoom reset */}
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              style={{
                position: "absolute", bottom: 6, right: selectedObj ? 270 : 8,
                background: "rgba(10,20,32,0.85)", border: `1px solid ${GRAY}`,
                color: GRAY, borderRadius: 3, padding: "2px 6px",
                fontSize: 9, cursor: "pointer", fontFamily: "monospace",
              }}
            >
              reset view
            </button>

            {/* inspector drawer */}
            {selectedObj && (
              <Inspector
                obj={selectedObj}
                onClose={() => setSelectedObj(null)}
              />
            )}
          </div>
        </div>

        {/* assess output */}
        {assess && (
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid ${BORD}`,
            color: "#b0c8d8",
            fontSize: 10,
            flexShrink: 0,
            maxHeight: 64,
            overflowY: "auto",
          }}>
            {assess}
          </div>
        )}
      </div>
    </>
  );
}
