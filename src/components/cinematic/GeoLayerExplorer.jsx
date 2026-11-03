/**
 * GeoLayerExplorer — F298 (overnight 2026-11-03)
 *
 * MAP + TREE-VIEW: list geo layers and inspect their GeoJSON-ish features on
 * an SVG world map.
 *
 * Data sources:
 *   GET  /v1/geo/layers                         → {count, layers:[{id,name,type,…}]}
 *   GET  /v1/geo/layers/{layer_id}/features     → GeoJSON-ish features array
 *
 * Features:
 *   - Layer catalog sidebar with toggle checkboxes + feature count badges
 *   - Selected layer → fetch features → render on SVG Mercator world map:
 *       points → colored dots; polygons → outlined fills; lines → stroked paths
 *   - Feature type legend (Point / Polygon / LineString)
 *   - Click feature → props tooltip overlay
 *   - ASSESS → POST /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier
 *
 * Toggle: ◈ GEOLYR  left:214680  bottom:8  zIndex:394
 * Event:  jarvis:geolyr-toggle
 * Voice:  "geo layer / geolyr / layer explorer / layer catalog /
 *          map layers / geo layers / layer features"
 *
 * Exported for JarvisBrain: isGeolyrQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const MG   = "#D946EF";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const PANEL_W = 720;
const PANEL_H = 680;
const MAP_W   = PANEL_W - 200;
const MAP_H   = 340;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const GEOLYR_RE =
  /\b(geo[\s_-]?lyr\b|geo[\s_-]?layer|layer[\s_-]?explorer|layer[\s_-]?catalog|map[\s_-]?layers|geo[\s_-]?layers|layer[\s_-]?features)\b/i;

export function isGeolyrQuery(q) {
  return GEOLYR_RE.test(q || "");
}

// ─── Mercator projection ──────────────────────────────────────────────────────
function lonLatToXY(lon, lat, w, h) {
  const x = ((lon + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN / Math.PI) * h * 0.5;
  return { x, y };
}

// ─── feature color by type ────────────────────────────────────────────────────
const TYPE_COLOR = { Point: GN, Polygon: AM, LineString: CY, MultiPolygon: AM, MultiLineString: CY };
const featureColor = (type) => TYPE_COLOR[type] || MG;

// ─── SVG rendering helpers ────────────────────────────────────────────────────
function renderFeature(feat, idx, w, h, onClick) {
  const geom = feat.geometry || {};
  const color = featureColor(geom.type);
  const key = feat.id ?? idx;

  if (geom.type === "Point") {
    const [lon, lat] = geom.coordinates || [0, 0];
    const { x, y } = lonLatToXY(lon, lat, w, h);
    return (
      <circle
        key={key}
        cx={x} cy={y} r={5}
        fill={color} fillOpacity={0.85}
        stroke="#0a1628" strokeWidth={1}
        style={{ cursor: "pointer" }}
        onClick={() => onClick(feat)}
      />
    );
  }

  if (geom.type === "LineString") {
    const pts = (geom.coordinates || [])
      .map(([lo, la]) => { const p = lonLatToXY(lo, la, w, h); return `${p.x},${p.y}`; })
      .join(" ");
    return (
      <polyline
        key={key}
        points={pts}
        fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.8}
        style={{ cursor: "pointer" }}
        onClick={() => onClick(feat)}
      />
    );
  }

  if (geom.type === "MultiLineString") {
    return (geom.coordinates || []).map((line, li) => {
      const pts = line
        .map(([lo, la]) => { const p = lonLatToXY(lo, la, w, h); return `${p.x},${p.y}`; })
        .join(" ");
      return (
        <polyline
          key={`${key}-${li}`}
          points={pts}
          fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.8}
          style={{ cursor: "pointer" }}
          onClick={() => onClick(feat)}
        />
      );
    });
  }

  if (geom.type === "Polygon") {
    const ring = (geom.coordinates || [[]])[0] || [];
    const pts = ring
      .map(([lo, la]) => { const p = lonLatToXY(lo, la, w, h); return `${p.x},${p.y}`; })
      .join(" ");
    return (
      <polygon
        key={key}
        points={pts}
        fill={color} fillOpacity={0.15}
        stroke={color} strokeWidth={1.2} strokeOpacity={0.8}
        style={{ cursor: "pointer" }}
        onClick={() => onClick(feat)}
      />
    );
  }

  if (geom.type === "MultiPolygon") {
    return (geom.coordinates || []).map((poly, pi) => {
      const ring = (poly[0] || []);
      const pts = ring
        .map(([lo, la]) => { const p = lonLatToXY(lo, la, w, h); return `${p.x},${p.y}`; })
        .join(" ");
      return (
        <polygon
          key={`${key}-${pi}`}
          points={pts}
          fill={color} fillOpacity={0.15}
          stroke={color} strokeWidth={1.2} strokeOpacity={0.8}
          style={{ cursor: "pointer" }}
          onClick={() => onClick(feat)}
        />
      );
    });
  }

  return null;
}

// ─── main component ───────────────────────────────────────────────────────────
export default function GeoLayerExplorer() {
  const [visible, setVisible]         = useState(false);
  const [layers, setLayers]           = useState([]);
  const [enabled, setEnabled]         = useState({});
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [features, setFeatures]       = useState([]);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [loadingFeats, setLoadingFeats]   = useState(false);
  const [tooltip, setTooltip]         = useState(null);
  const [assessText, setAssessText]   = useState("");
  const [assessing, setAssessing]     = useState(false);
  const panelRef = useRef(null);

  // ─── toggle ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setVisible((v) => !v);
    window.addEventListener("jarvis:geolyr-toggle", handler);
    return () => window.removeEventListener("jarvis:geolyr-toggle", handler);
  }, []);

  // ─── fetch layers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setLoadingLayers(true);
    fetch(`${apiBase()}/v1/geo/layers`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const list = d.layers || [];
        setLayers(list);
        const init = {};
        list.forEach((l) => { init[l.id ?? l.name] = true; });
        setEnabled(init);
      })
      .catch(() => setLayers([]))
      .finally(() => setLoadingLayers(false));
  }, [visible]);

  // ─── fetch features when layer selected ──────────────────────────────────────
  useEffect(() => {
    if (!selectedLayer) { setFeatures([]); return; }
    setLoadingFeats(true);
    const lid = encodeURIComponent(selectedLayer.id ?? selectedLayer.name);
    fetch(`${apiBase()}/v1/geo/layers/${lid}/features`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then((r) => r.json())
      .then((d) => {
        const feats = Array.isArray(d) ? d : (d.features || d.items || []);
        setFeatures(feats);
      })
      .catch(() => setFeatures([]))
      .finally(() => setLoadingFeats(false));
  }, [selectedLayer]);

  // ─── ASSESS ──────────────────────────────────────────────────────────────────
  const handleAssess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    const layerNames = layers.map((l) => l.name || l.id).join(", ");
    const msg = `Briefly assess geo layer coverage. Layers available: ${layerNames || "none"}. Selected: ${selectedLayer?.name || "none"} (${features.length} features). One paragraph, operational focus.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(text);
      if (text) {
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text } })
        );
      }
    } catch {
      setAssessText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, layers, selectedLayer, features]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed", bottom: 8, left: 214680, zIndex: 394,
          background: "rgba(10,18,28,0.82)", border: `1px solid ${BORD}`,
          color: CY, fontFamily: "monospace", fontSize: 11, padding: "3px 8px",
          cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ GEOLYR
      </button>
    );
  }

  // ─── render ───────────────────────────────────────────────────────────────────
  const typeCounts = {};
  features.forEach((f) => {
    const t = f.geometry?.type || "Unknown";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed", bottom: 48, left: 214680, zIndex: 394,
        width: PANEL_W, maxHeight: PANEL_H,
        background: SURF, border: `1px solid ${BORD}`,
        fontFamily: "monospace", color: CY, fontSize: 12,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 10px", borderBottom: `1px solid ${BORD}`, flexShrink: 0,
      }}>
        <span style={{ fontWeight: "bold", letterSpacing: 2 }}>◈ GEO LAYER EXPLORER</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: "rgba(41,231,255,0.12)", border: `1px solid ${CY}`,
              color: CY, fontFamily: "monospace", fontSize: 11, padding: "2px 8px",
              cursor: assessing ? "default" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: "transparent", border: "none", color: CY,
              cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── body: sidebar + map ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── layer sidebar ── */}
        <div style={{
          width: 196, borderRight: `1px solid ${BORD}`,
          overflowY: "auto", padding: "6px 0", flexShrink: 0,
        }}>
          <div style={{ padding: "0 8px 4px", color: AM, fontSize: 10, letterSpacing: 1 }}>
            LAYERS {loadingLayers ? "…" : `(${layers.length})`}
          </div>
          {layers.map((layer) => {
            const lid = layer.id ?? layer.name;
            const isSel = selectedLayer && (selectedLayer.id ?? selectedLayer.name) === lid;
            return (
              <div
                key={lid}
                onClick={() => setSelectedLayer(isSel ? null : layer)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 8px", cursor: "pointer",
                  background: isSel ? "rgba(41,231,255,0.08)" : "transparent",
                  borderLeft: isSel ? `2px solid ${CY}` : "2px solid transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!enabled[lid]}
                  onChange={(e) => {
                    e.stopPropagation();
                    setEnabled((prev) => ({ ...prev, [lid]: e.target.checked }));
                  }}
                  style={{ accentColor: CY, width: 12, height: 12, flexShrink: 0 }}
                />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    color: isSel ? "#fff" : CY, fontSize: 11,
                  }}>
                    {layer.name || lid}
                  </div>
                  {layer.type && (
                    <div style={{ color: "#4E6070", fontSize: 10 }}>{layer.type}</div>
                  )}
                </div>
                {layer.feature_count != null && (
                  <span style={{
                    background: "rgba(41,231,255,0.15)", color: CY,
                    fontSize: 9, padding: "1px 4px", borderRadius: 2, flexShrink: 0,
                  }}>
                    {layer.feature_count}
                  </span>
                )}
              </div>
            );
          })}
          {!loadingLayers && layers.length === 0 && (
            <div style={{ color: "#4E6070", padding: "8px", fontSize: 11 }}>No layers</div>
          )}
        </div>

        {/* ── right pane: map + details ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── SVG map ── */}
          <div style={{ position: "relative", height: MAP_H, flexShrink: 0 }}>
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              style={{ width: "100%", height: "100%", background: "#0a1628", display: "block" }}
            >
              <rect width={MAP_W} height={MAP_H} fill="#0d1f3c" />
              {/* grid lines */}
              {[-60, -30, 0, 30, 60].map((la) => {
                const { y } = lonLatToXY(0, la, MAP_W, MAP_H);
                return (
                  <line key={`lat${la}`} x1={0} y1={y} x2={MAP_W} y2={y}
                    stroke="#1a3050" strokeWidth={0.5} />
                );
              })}
              {[-120, -60, 0, 60, 120].map((lo) => {
                const { x } = lonLatToXY(lo, 0, MAP_W, MAP_H);
                return (
                  <line key={`lon${lo}`} x1={x} y1={0} x2={x} y2={MAP_H}
                    stroke="#1a3050" strokeWidth={0.5} />
                );
              })}

              {/* features for enabled layers */}
              {selectedLayer && enabled[selectedLayer.id ?? selectedLayer.name] && features.map((feat, idx) =>
                renderFeature(feat, idx, MAP_W, MAP_H, (f) => {
                  setTooltip(f.properties || {});
                })
              )}
            </svg>

            {/* loading overlay */}
            {loadingFeats && (
              <div style={{
                position: "absolute", inset: 0, background: "rgba(10,18,28,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: CY, fontSize: 12, letterSpacing: 2,
              }}>
                LOADING FEATURES…
              </div>
            )}

            {/* feature type legend */}
            <div style={{
              position: "absolute", bottom: 6, right: 8,
              display: "flex", gap: 10, fontSize: 10,
            }}>
              {Object.entries(TYPE_COLOR).slice(0, 3).map(([type, color]) => (
                <span key={type} style={{ color }}>● {type}</span>
              ))}
            </div>
          </div>

          {/* ── feature stats ── */}
          <div style={{
            display: "flex", gap: 12, padding: "6px 10px",
            borderTop: `1px solid ${BORD}`, flexShrink: 0,
          }}>
            <span style={{ color: AM }}>
              {selectedLayer ? (selectedLayer.name || selectedLayer.id) : "No layer selected"}
            </span>
            {Object.entries(typeCounts).map(([t, n]) => (
              <span key={t} style={{ color: featureColor(t) }}>
                {t}: {n}
              </span>
            ))}
            {features.length > 0 && (
              <span style={{ color: "#4E6070" }}>total: {features.length}</span>
            )}
          </div>

          {/* ── tooltip / props ── */}
          {tooltip && (
            <div style={{
              flex: 1, overflowY: "auto", padding: "6px 10px",
              borderTop: `1px solid ${BORD}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: AM, fontSize: 10, letterSpacing: 1 }}>FEATURE PROPERTIES</span>
                <button
                  onClick={() => setTooltip(null)}
                  style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 12 }}
                >✕</button>
              </div>
              {Object.entries(tooltip).length === 0
                ? <span style={{ color: "#4E6070" }}>No properties</span>
                : Object.entries(tooltip).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                      <span style={{ color: "#4E6070", width: 120, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: "#fff" }}>{String(v)}</span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* ── assess text ── */}
          {assessText && !tooltip && (
            <div style={{
              flex: 1, overflowY: "auto", padding: "6px 10px",
              borderTop: `1px solid ${BORD}`, color: "#b0c8d8", fontSize: 11, lineHeight: 1.5,
            }}>
              {assessText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
