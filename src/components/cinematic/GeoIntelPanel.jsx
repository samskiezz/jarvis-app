/**
 * GeoIntelPanel — F271.
 *
 * Data sources:
 *   GET  /v1/geo/objects          (poll 90 s)  → {count, objects:[{object_id,type,lat,lon,...}]}
 *   GET  /v1/geo/layers           (on open)    → {count, layers:[{layer_id,name,...}]}
 *   GET  /v1/geo/geofences        (on open)    → {count, geofences:[{id,name,polygon,...}]}
 *   GET  /v1/geo/layers/{id}/features (lazy)   → {features:[...], count}
 *
 * Displays:
 *   - Stat tiles: geo objects / layers / geofences / located (objects with valid coords)
 *   - OBJECTS | LAYERS | FENCES tab switcher + text search
 *   - OBJECTS: object_id, type chip, lat/lon chip
 *   - LAYERS: layer_id, name, feature count; expand → lazy feature list
 *   - FENCES: name, vertex count of polygon
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence geo brief + TTS
 *
 * Toggle: ◈ GEO at left:256080, bottom:8, zIndex:149.
 * Green badge = located object count; amber when any geofences exist.
 *
 * Exported helpers for JarvisBrain:
 *   isGeoQuery(q) / buildGeoScript()
 *
 * Voice triggers: "geo / geospatial / geo objects / map objects / layers /
 *   geofences / geo intel / located objects / geo map / spatial data /
 *   map data / map layer / geo panel"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#4ADE80";
const PURP  = "#B06EFF";
const GRAY  = "#4E6070";
const RED   = "#F87171";

const BTN_LEFT   = 256080;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchObjects() {
  const r = await fetch(`${apiBase()}/v1/geo/objects`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`geo/objects ${r.status}`);
  return r.json();
}

async function fetchLayers() {
  const r = await fetch(`${apiBase()}/v1/geo/layers`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`geo/layers ${r.status}`);
  return r.json();
}

async function fetchGeofences() {
  const r = await fetch(`${apiBase()}/v1/geo/geofences`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`geo/geofences ${r.status}`);
  return r.json();
}

async function fetchLayerFeatures(layerId) {
  const r = await fetch(
    `${apiBase()}/v1/geo/layers/${encodeURIComponent(layerId)}/features?limit=50`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`geo/layers/${layerId}/features ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const GEO_RE =
  /\b(geo|geospatial|geo.?objects?|map.?objects?|map.?layer|geo.?layer|geofences?|geo.?intel|geo.?map|located.?objects?|spatial.?data|map.?data|geo.?panel|where.?are.?objects?|spatial.?objects?)\b/i;

export function isGeoQuery(q) {
  return GEO_RE.test(q || "");
}

export async function buildGeoScript() {
  try {
    const [objs, layers, fences] = await Promise.allSettled([
      fetchObjects(),
      fetchLayers(),
      fetchGeofences(),
    ]);
    window.dispatchEvent(new CustomEvent("jarvis:geo-toggle"));
    const objCount    = objs.status    === "fulfilled" ? (objs.value?.count    ?? 0) : 0;
    const layerCount  = layers.status  === "fulfilled" ? (layers.value?.count  ?? 0) : 0;
    const fenceCount  = fences.status  === "fulfilled" ? (fences.value?.count  ?? 0) : 0;
    const objList     = objs.status    === "fulfilled" ? (objs.value?.objects  ?? []) : [];
    const located     = objList.filter((o) => o.lat != null && o.lon != null).length;
    return (
      `Geo intelligence: ${objCount} ontology object${objCount !== 1 ? "s" : ""} indexed` +
      (located ? `, ${located} with coordinates` : "") +
      `, ${layerCount} map layer${layerCount !== 1 ? "s" : ""}` +
      (fenceCount ? `, ${fenceCount} geofence${fenceCount !== 1 ? "s" : ""} active` : "") +
      ". Geo panel open, sir."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:geo-toggle"));
    return "Geo Intelligence Panel open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtCoord(v) {
  if (v == null) return "—";
  return Number(v).toFixed(4);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 7,
        padding: "7px 10px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: color || CY,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: GRAY, marginTop: 2, letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color || CY}18`,
        border: `1px solid ${color || CY}44`,
        borderRadius: 4,
        padding: "1px 5px",
        color: color || CY,
        fontSize: 7,
        letterSpacing: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ObjectRow({ obj }) {
  const hasCoords = obj.lat != null && obj.lon != null;
  return (
    <div
      style={{
        borderBottom: `1px solid ${CY}18`,
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: hasCoords ? GREEN : GRAY,
          boxShadow: hasCoords ? `0 0 5px ${GREEN}` : undefined,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: CY,
          fontSize: 9,
          fontWeight: 600,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {obj.object_id || obj.id || "—"}
      </span>
      {obj.type && <Chip label={obj.type.toUpperCase()} color={PURP} />}
      {hasCoords ? (
        <Chip
          label={`${fmtCoord(obj.lat)}, ${fmtCoord(obj.lon)}`}
          color={GREEN}
        />
      ) : (
        <span style={{ fontSize: 7, color: GRAY }}>no coords</span>
      )}
    </div>
  );
}

function LayerRow({ layer }) {
  const [expanded,  setExpanded]  = useState(false);
  const [features,  setFeatures]  = useState(null);
  const [loadingFt, setLoadingFt] = useState(false);

  async function toggle() {
    if (!expanded && features === null) {
      setLoadingFt(true);
      try {
        const data = await fetchLayerFeatures(layer.layer_id || layer.id);
        setFeatures(data?.features ?? []);
      } catch {
        setFeatures([]);
      } finally {
        setLoadingFt(false);
      }
    }
    setExpanded((v) => !v);
  }

  const layerId = layer.layer_id || layer.id || "—";

  return (
    <div style={{ borderBottom: `1px solid ${CY}18` }}>
      <div
        style={{
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
        onClick={toggle}
      >
        <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span
          style={{
            color: CY,
            fontSize: 9,
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {layer.name || layerId}
        </span>
        {layer.name && layer.layer_id && (
          <span style={{ fontSize: 7, color: GRAY }}>{layerId}</span>
        )}
        {loadingFt && <span style={{ fontSize: 7, color: GRAY }}>…</span>}
        {features !== null && (
          <Chip label={`${features.length} feat`} color={AMBER} />
        )}
      </div>
      {expanded && features !== null && features.length > 0 && (
        <div
          style={{
            paddingLeft: 24,
            paddingBottom: 4,
            borderTop: `1px solid ${CY}11`,
          }}
        >
          {features.slice(0, 20).map((f, i) => (
            <div
              key={f.id || i}
              style={{ fontSize: 8, color: GRAY, padding: "2px 0" }}
            >
              <span style={{ color: CY }}>
                {f.id || f.feature_id || f.name || `feat-${i}`}
              </span>
              {f.type && (
                <span style={{ marginLeft: 6, color: PURP }}>
                  {f.type}
                </span>
              )}
            </div>
          ))}
          {features.length > 20 && (
            <div style={{ fontSize: 7, color: GRAY, padding: "2px 0" }}>
              +{features.length - 20} more…
            </div>
          )}
        </div>
      )}
      {expanded && features !== null && features.length === 0 && (
        <div
          style={{
            paddingLeft: 24,
            paddingBottom: 6,
            fontSize: 8,
            color: GRAY,
          }}
        >
          No features in this layer.
        </div>
      )}
    </div>
  );
}

function FenceRow({ fence }) {
  const vertexCount =
    Array.isArray(fence.polygon) ? fence.polygon.length : "—";
  return (
    <div
      style={{
        borderBottom: `1px solid ${CY}18`,
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 2,
          background: AMBER,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: CY,
          fontSize: 9,
          fontWeight: 600,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {fence.name || fence.id || "—"}
      </span>
      {typeof vertexCount === "number" && (
        <Chip label={`${vertexCount} pts`} color={AMBER} />
      )}
      {fence.id && fence.name && (
        <span style={{ fontSize: 7, color: GRAY }}>{fence.id}</span>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GeoIntelPanel() {
  const [visible,    setVisible]    = useState(false);
  const [objects,    setObjects]    = useState(null);
  const [layers,     setLayers]     = useState(null);
  const [geofences,  setGeofences]  = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("OBJECTS");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:geo-toggle", onToggle);
    return () => window.removeEventListener("jarvis:geo-toggle", onToggle);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [objs, lyr, fences] = await Promise.allSettled([
        fetchObjects(),
        fetchLayers(),
        fetchGeofences(),
      ]);
      if (objs.status    === "fulfilled") setObjects(objs.value);
      if (lyr.status     === "fulfilled") setLayers(lyr.value);
      if (fences.status  === "fulfilled") setGeofences(fences.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadData();
    timer.current = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [visible, loadData]);

  const objList    = objects?.objects    ?? [];
  const layerList  = layers?.layers     ?? [];
  const fenceList  = geofences?.geofences ?? [];

  const locatedCount = objList.filter((o) => o.lat != null && o.lon != null).length;
  const totalObjs    = objects?.count    ?? 0;
  const totalLayers  = layers?.count     ?? 0;
  const totalFences  = geofences?.count  ?? 0;

  const q = search.toLowerCase();

  const filteredObjs = objList.filter(
    (o) =>
      !q ||
      (o.object_id || o.id || "").toLowerCase().includes(q) ||
      (o.type || "").toLowerCase().includes(q)
  );

  const filteredLayers = layerList.filter(
    (l) =>
      !q ||
      (l.name || "").toLowerCase().includes(q) ||
      (l.layer_id || l.id || "").toLowerCase().includes(q)
  );

  const filteredFences = fenceList.filter(
    (f) =>
      !q ||
      (f.name || "").toLowerCase().includes(q) ||
      (f.id || "").toLowerCase().includes(q)
  );

  const hasGeofences = totalFences > 0;
  const badgeColor   = hasGeofences ? AMBER : locatedCount > 0 ? GREEN : GRAY;
  const badgeLabel   = locatedCount > 0 ? `${locatedCount}` : "—";

  async function handleAssess() {
    setAssessing(true);
    try {
      const ctx =
        `geo_objects=${totalObjs}, located=${locatedCount}, layers=${totalLayers}, geofences=${totalFences}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `In 2 sentences, assess the geospatial intelligence picture. Context: ${ctx}`,
        }),
      });
      const d = await r.json();
      const brief = (d.answer || "Geo assessment unavailable.")
        .replace(/<<ACTION:[^>]*>>/g, "")
        .trim();
      setAssessment(brief);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
      );
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const TABS   = ["OBJECTS", "LAYERS", "FENCES"];
  const panelW = 440;

  return (
    <>
      {/* ── trigger button ── */}
      <div
        style={{
          position:      "fixed",
          left:          `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          bottom:        8,
          zIndex:        149,
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           2,
        }}
      >
        <div
          style={{
            background:   badgeColor,
            color:        "#000",
            borderRadius: 8,
            fontSize:     7,
            padding:      "1px 5px",
            fontWeight:   700,
            letterSpacing: 1,
          }}
        >
          {badgeLabel}
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("jarvis:geo-toggle"))}
          style={{
            background:    "rgba(41,231,255,0.08)",
            border:        `1px solid ${CY}55`,
            borderRadius:  6,
            padding:       "3px 8px",
            color:         CY,
            fontSize:      8,
            letterSpacing: 1,
            cursor:        "pointer",
            fontFamily:    "inherit",
            whiteSpace:    "nowrap",
          }}
        >
          ◈ GEO
        </button>
      </div>

      {/* ── panel ── */}
      {visible && (
        <div
          style={{
            position:      "fixed",
            left:          `min(${BTN_LEFT}px, calc(100vw - ${panelW + 10}px))`,
            bottom:        40,
            zIndex:        149,
            width:         panelW,
            maxHeight:     "74vh",
            background:    "rgba(4,14,22,0.97)",
            border:        `1px solid ${CY}44`,
            borderRadius:  10,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            fontFamily:    "monospace",
            boxShadow:     `0 0 28px ${CY}22`,
          }}
        >
          {/* header */}
          <div
            style={{
              padding:      "8px 12px 6px",
              borderBottom: `1px solid ${CY}22`,
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              flexShrink:   0,
            }}
          >
            <span style={{ color: CY, fontWeight: 700, fontSize: 10, letterSpacing: 2 }}>
              ◈ GEO INTELLIGENCE PANEL
            </span>
            {loading && <span style={{ color: GRAY, fontSize: 8 }}>…</span>}
            <div style={{ flex: 1 }} />
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background:    "rgba(41,231,255,0.08)",
                border:        `1px solid ${CY}44`,
                borderRadius:  4,
                padding:       "2px 7px",
                color:         CY,
                fontSize:      8,
                cursor:        assessing ? "default" : "pointer",
                fontFamily:    "inherit",
                letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent",
                border:     "none",
                color:      GRAY,
                fontSize:   11,
                cursor:     "pointer",
                fontFamily: "inherit",
                padding:    "0 3px",
              }}
            >
              ✕
            </button>
          </div>

          {/* assessment */}
          {assessment && (
            <div
              style={{
                padding:      "6px 12px",
                fontSize:     9,
                color:        CY,
                background:   `${CY}08`,
                borderBottom: `1px solid ${CY}22`,
                flexShrink:   0,
              }}
            >
              {assessment}
            </div>
          )}

          {/* stat tiles */}
          <div
            style={{
              display:    "flex",
              gap:        6,
              padding:    "8px 12px 6px",
              flexShrink: 0,
            }}
          >
            <StatTile label="GEO OBJECTS" value={totalObjs}   color={CY}    />
            <StatTile label="LOCATED"     value={locatedCount} color={locatedCount > 0 ? GREEN : GRAY} />
            <StatTile label="LAYERS"      value={totalLayers}  color={PURP}  />
            <StatTile label="GEOFENCES"   value={totalFences}  color={totalFences > 0 ? AMBER : GRAY} />
          </div>

          {/* tabs */}
          <div
            style={{
              display:      "flex",
              gap:          4,
              padding:      "4px 12px",
              flexShrink:   0,
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:    tab === t ? `${CY}22` : "transparent",
                  border:        `1px solid ${tab === t ? CY : CY + "33"}`,
                  borderRadius:  4,
                  padding:       "2px 10px",
                  color:         tab === t ? CY : GRAY,
                  fontSize:      8,
                  cursor:        "pointer",
                  fontFamily:    "inherit",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: "5px 12px", flexShrink: 0 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "OBJECTS"
                  ? "search objects…"
                  : tab === "LAYERS"
                  ? "search layers…"
                  : "search geofences…"
              }
              style={{
                width:        "100%",
                background:   "rgba(41,231,255,0.05)",
                border:       `1px solid ${CY}22`,
                borderRadius: 5,
                padding:      "3px 8px",
                color:        CY,
                fontSize:     9,
                fontFamily:   "inherit",
                outline:      "none",
                boxSizing:    "border-box",
              }}
            />
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {tab === "OBJECTS" && (
              filteredObjs.length === 0 ? (
                <div style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}>
                  {loading
                    ? "Loading geo objects…"
                    : search
                    ? "No matching objects."
                    : "No geo objects indexed."}
                </div>
              ) : (
                filteredObjs.map((o, i) => (
                  <ObjectRow key={o.object_id || o.id || i} obj={o} />
                ))
              )
            )}

            {tab === "LAYERS" && (
              filteredLayers.length === 0 ? (
                <div style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}>
                  {loading
                    ? "Loading layers…"
                    : search
                    ? "No matching layers."
                    : "No map layers defined."}
                </div>
              ) : (
                filteredLayers.map((l, i) => (
                  <LayerRow key={l.layer_id || l.id || i} layer={l} />
                ))
              )
            )}

            {tab === "FENCES" && (
              filteredFences.length === 0 ? (
                <div style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}>
                  {loading
                    ? "Loading geofences…"
                    : search
                    ? "No matching geofences."
                    : "No geofences stored."}
                </div>
              ) : (
                filteredFences.map((f, i) => (
                  <FenceRow key={f.id || i} fence={f} />
                ))
              )
            )}
          </div>

          {/* footer */}
          <div
            style={{
              padding:    "5px 12px",
              fontSize:   8,
              color:      GRAY,
              borderTop:  `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            {tab === "OBJECTS"
              ? `${filteredObjs.length} of ${objList.length} object${objList.length !== 1 ? "s" : ""}`
              : tab === "LAYERS"
              ? `${filteredLayers.length} of ${layerList.length} layer${layerList.length !== 1 ? "s" : ""}`
              : `${filteredFences.length} of ${fenceList.length} geofence${fenceList.length !== 1 ? "s" : ""}`}{" "}
            · poll 90 s · /v1/geo/*
          </div>
        </div>
      )}
    </>
  );
}
