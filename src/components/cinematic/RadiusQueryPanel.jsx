/**
 * RadiusQueryPanel — F275.
 *
 * Data sources:
 *   GET  /v1/geo/radius?lat=&lon=&km=   → {count, objects:[{object_id,label,type,lat,lon,distance_km,...}]}
 *   GET  /v1/geo/tracks/{object_id}     → {count, tracks:[{lat,lon,ts}]}
 *
 * Displays:
 *   - lat / lon / km inputs + Search button
 *   - SVG Mercator map centred on the query point with radius circle and result dots
 *   - Sorted result list below map with distance badge
 *   - Click result object → GET /v1/geo/tracks/{id} → animated dashed path on map
 *   - "Clear" resets all state
 *   - ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ RADQRY  left:201800  bottom:8  zIndex:371
 * Event:  jarvis:radqry-toggle
 * Voice:  "radius query / radqry / nearby objects / objects near / geo radius /
 *          radius search / proximity search / area search"
 *
 * Exported for JarvisBrain: isRadqryQuery
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
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const TYPE_COLORS = {
  vessel:   "#29E7FF",
  aircraft: "#4ADE80",
  vehicle:  "#F5A623",
  person:   "#B06EFF",
  facility: "#F87171",
  device:   "#38BDF8",
  sensor:   "#34D399",
  station:  "#FB923C",
  asset:    "#A78BFA",
  threat:   "#F43F5E",
};
function typeColor(t) {
  return TYPE_COLORS[(t || "").toLowerCase()] || AM;
}

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT = 201800;
const PANEL_W  = 820;
const PANEL_H  = 620;
const MAP_W    = 780;
const MAP_H    = 310;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const RADQRY_RE =
  /\b(radius\s+quer(?:y|ies)|radqry\b|nearby\s+objects?|objects?\s+near\b|geo\s+radius|radius\s+search|proximity\s+search|area\s+search)\b/i;

export function isRadqryQuery(q) {
  return RADQRY_RE.test(q || "");
}

// ─── Mercator helpers ─────────────────────────────────────────────────────────
function mercatorXY(lon, lat, w, h) {
  const x = ((lon + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN / Math.PI) * h * 0.5;
  return { x, y };
}

// Approximate radius in SVG pixels for a given km at a given lat
function kmToPixels(km, lat, mapW) {
  const earthCircumKm = 40075;
  const degPerKm = 360 / earthCircumKm;
  const lonDeg = km * degPerKm / Math.cos((lat * Math.PI) / 180);
  const pxPerDeg = mapW / 360;
  return lonDeg * pxPerDeg;
}

// ─── tiny TTS ─────────────────────────────────────────────────────────────────
function speak(text) {
  if (!text) return;
  fetch(`${apiBase()}/v1/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ text, voice: "onyx" }),
  }).catch(() => {});
}

// ─── component ────────────────────────────────────────────────────────────────
export default function RadiusQueryPanel() {
  const [open, setOpen] = useState(false);

  // form state
  const [lat, setLat]   = useState("51.5074");
  const [lon, setLon]   = useState("-0.1278");
  const [km, setKm]     = useState("100");

  // result state
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [results, setResults]   = useState([]);   // [{object_id,label,type,lat,lon,distance_km}]
  const [queryPt, setQueryPt]   = useState(null); // {lat,lon,km}

  // track state
  const [trackObjId, setTrackObjId]   = useState(null);
  const [trackData, setTrackData]     = useState([]);  // [{lat,lon,ts}]
  const [trackLoading, setTrackLoading] = useState(false);
  const [animFrame, setAnimFrame]     = useState(0);
  const animRef = useRef(null);

  // assess state
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  // ── toggle ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onToggle() { setOpen(v => !v); }
    window.addEventListener("jarvis:radqry-toggle", onToggle);
    return () => window.removeEventListener("jarvis:radqry-toggle", onToggle);
  }, []);

  // ── search ──────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    const kmN  = parseFloat(km);
    if (isNaN(latN) || isNaN(lonN) || isNaN(kmN) || kmN <= 0) {
      setError("Enter valid lat / lon / km.");
      return;
    }
    setError("");
    setLoading(true);
    setResults([]);
    setTrackObjId(null);
    setTrackData([]);
    setAnimFrame(0);
    setAssessment("");
    try {
      const url = `${apiBase()}/v1/geo/radius?lat=${latN}&lon=${lonN}&km=${kmN}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const objs = Array.isArray(data.objects) ? data.objects : [];
      const sorted = [...objs].sort(
        (a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999)
      );
      setResults(sorted);
      setQueryPt({ lat: latN, lon: lonN, km: kmN });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [lat, lon, km]);

  // ── load track ───────────────────────────────────────────────────────────────
  const loadTrack = useCallback(async (objId) => {
    if (trackObjId === objId) { setTrackObjId(null); setTrackData([]); return; }
    setTrackLoading(true);
    setTrackObjId(objId);
    setTrackData([]);
    setAnimFrame(0);
    if (animRef.current) clearInterval(animRef.current);
    try {
      const r = await fetch(`${apiBase()}/v1/geo/tracks/${objId}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const pts = Array.isArray(data.tracks) ? data.tracks : [];
      setTrackData(pts);
      if (pts.length > 1) {
        let frame = 0;
        animRef.current = setInterval(() => {
          frame++;
          if (frame >= pts.length) { clearInterval(animRef.current); frame = pts.length - 1; }
          setAnimFrame(frame);
        }, 80);
      }
    } catch (_) {
    } finally {
      setTrackLoading(false);
    }
  }, [trackObjId]);

  useEffect(() => () => { if (animRef.current) clearInterval(animRef.current); }, []);

  // ── clear ────────────────────────────────────────────────────────────────────
  const handleClear = () => {
    setResults([]); setQueryPt(null); setError(""); setTrackObjId(null);
    setTrackData([]); setAnimFrame(0); setAssessment("");
    if (animRef.current) clearInterval(animRef.current);
  };

  // ── assess ───────────────────────────────────────────────────────────────────
  const handleAssess = useCallback(async () => {
    if (!queryPt || results.length === 0) return;
    setAssessing(true);
    try {
      const summary = `Radius query: lat=${queryPt.lat}, lon=${queryPt.lon}, km=${queryPt.km}. ` +
        `Found ${results.length} objects. ` +
        `Closest: ${results[0]?.label ?? "unknown"} (${(results[0]?.distance_km ?? "?").toString().slice(0,6)} km). ` +
        `Types: ${[...new Set(results.map(o => o.type))].join(", ")}.`;
      const prompt = `${summary} Speak 2 sentences about what is clustered in this area and any patterns worth noting.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await r.json();
      const reply = data.response ?? data.message ?? data.result ?? JSON.stringify(data).slice(0, 200);
      setAssessment(reply);
      speak(reply);
    } catch (_) {
    } finally {
      setAssessing(false);
    }
  }, [queryPt, results]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 371,
          background: "rgba(10,18,28,0.85)",
          border: `1px solid ${BORD}`,
          color: CY,
          fontFamily: "monospace",
          fontSize: 11,
          padding: "4px 10px",
          cursor: "pointer",
          borderRadius: 4,
          whiteSpace: "nowrap",
        }}
        title="Radius Query Panel"
      >
        ◈ RADQRY
      </button>
    );
  }

  // ── map rendering ─────────────────────────────────────────────────────────
  const mapViewBox = `0 0 ${MAP_W} ${MAP_H}`;

  let circleSvg = null;
  let queryDot  = null;
  if (queryPt) {
    const { x: cx, y: cy } = mercatorXY(queryPt.lon, queryPt.lat, MAP_W, MAP_H);
    const r = kmToPixels(queryPt.km, queryPt.lat, MAP_W);
    circleSvg = (
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke={CY} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6} />
    );
    queryDot = <circle cx={cx} cy={cy} r={5} fill={CY} opacity={0.9} />;
  }

  const resultDots = results.map(obj => {
    const { x, y } = mercatorXY(obj.lon ?? 0, obj.lat ?? 0, MAP_W, MAP_H);
    return (
      <circle key={obj.object_id}
        cx={x} cy={y} r={4}
        fill={typeColor(obj.type)}
        opacity={0.85}
        style={{ cursor: "pointer" }}
        onClick={() => loadTrack(obj.object_id)}
      >
        <title>{obj.label} ({obj.type}) — {(obj.distance_km ?? "?").toString().slice(0,8)} km</title>
      </circle>
    );
  });

  // animated track path
  let trackPath = null;
  if (trackData.length > 1 && queryPt) {
    const visible = trackData.slice(0, animFrame + 1);
    const pts = visible.map(p => {
      const { x, y } = mercatorXY(p.lon, p.lat, MAP_W, MAP_H);
      return `${x},${y}`;
    });
    const d = "M " + pts.join(" L ");
    const last = visible[visible.length - 1];
    const { x: lx, y: ly } = mercatorXY(last.lon, last.lat, MAP_W, MAP_H);
    trackPath = (
      <>
        <path d={d} fill="none" stroke={PURP} strokeWidth={2} strokeDasharray="8 4" opacity={0.85} />
        <circle cx={lx} cy={ly} r={5} fill={PURP} />
      </>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%)",
        width: PANEL_W,
        maxHeight: "90vh",
        overflowY: "auto",
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 8,
        zIndex: 2000,
        color: "#cdd8e3",
        fontFamily: "monospace",
        fontSize: 12,
        boxShadow: "0 0 40px rgba(41,231,255,0.08)",
        padding: "14px 16px 18px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 14 }}>◈ RADIUS QUERY PANEL</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16 }}
        >✕</button>
      </div>

      {/* Form */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {[
          { label: "Lat", value: lat, set: setLat },
          { label: "Lon", value: lon, set: setLon },
          { label: "Km",  value: km,  set: setKm  },
        ].map(({ label, value, set }) => (
          <label key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#888", width: 28 }}>{label}</span>
            <input
              type="number"
              value={value}
              onChange={e => set(e.target.value)}
              style={{
                width: 90, background: "rgba(41,231,255,0.07)", border: `1px solid ${BORD}`,
                color: CY, borderRadius: 4, padding: "3px 6px", fontFamily: "monospace", fontSize: 12,
              }}
            />
          </label>
        ))}
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            background: loading ? "#1a2a3a" : "rgba(41,231,255,0.12)",
            border: `1px solid ${CY}`, color: CY, cursor: loading ? "default" : "pointer",
            borderRadius: 4, padding: "4px 14px", fontFamily: "monospace", fontSize: 12,
          }}
        >{loading ? "Searching…" : "Search"}</button>
        <button
          onClick={handleClear}
          style={{
            background: "none", border: `1px solid #333`, color: "#888",
            cursor: "pointer", borderRadius: 4, padding: "4px 12px", fontFamily: "monospace", fontSize: 12,
          }}
        >Clear</button>
      </div>

      {error && <div style={{ color: RD, marginBottom: 8 }}>{error}</div>}

      {/* Map */}
      <div style={{
        border: `1px solid ${BORD}`, borderRadius: 6, overflow: "hidden",
        background: "rgba(0,8,20,0.95)", marginBottom: 10, position: "relative",
      }}>
        {/* Simple SVG world outline approximation using horizontal fill */}
        <svg width={MAP_W} height={MAP_H} viewBox={mapViewBox} style={{ display: "block" }}>
          <rect width={MAP_W} height={MAP_H} fill="#030D1A" />
          {/* faint grid */}
          {[-60,-30,0,30,60].map(latLine => {
            const { y } = mercatorXY(0, latLine, MAP_W, MAP_H);
            return <line key={latLine} x1={0} y1={y} x2={MAP_W} y2={y}
              stroke="rgba(41,231,255,0.08)" strokeWidth={0.5} />;
          })}
          {[-120,-60,0,60,120].map(lonLine => {
            const { x } = mercatorXY(lonLine, 0, MAP_W, MAP_H);
            return <line key={lonLine} x1={x} y1={0} x2={x} y2={MAP_H}
              stroke="rgba(41,231,255,0.08)" strokeWidth={0.5} />;
          })}
          {circleSvg}
          {resultDots}
          {trackPath}
          {queryDot}
        </svg>
        {queryPt && (
          <div style={{
            position: "absolute", top: 4, left: 6, color: CY, fontSize: 10, opacity: 0.7,
          }}>
            {queryPt.lat.toFixed(4)}, {queryPt.lon.toFixed(4)} • {queryPt.km} km radius • {results.length} objects
          </div>
        )}
        {trackLoading && (
          <div style={{
            position: "absolute", bottom: 4, right: 8, color: PURP, fontSize: 10,
          }}>loading track…</div>
        )}
        {trackObjId && !trackLoading && trackData.length === 0 && (
          <div style={{ position: "absolute", bottom: 4, right: 8, color: "#666", fontSize: 10 }}>no track data</div>
        )}
      </div>

      {/* Results list */}
      {results.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 4 }}>
            Results sorted by distance — click object to show track
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {results.map((obj, i) => {
              const active = trackObjId === obj.object_id;
              return (
                <div
                  key={obj.object_id}
                  onClick={() => loadTrack(obj.object_id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                    background: active ? "rgba(176,110,255,0.12)" : "transparent",
                    borderBottom: `1px solid rgba(41,231,255,0.07)`,
                  }}
                >
                  <span style={{ color: "#555", width: 22, textAlign: "right" }}>{i + 1}.</span>
                  <span style={{
                    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                    background: typeColor(obj.type), flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, color: active ? PURP : "#cdd8e3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {obj.label || obj.object_id}
                  </span>
                  <span style={{
                    background: "rgba(41,231,255,0.08)", border: `1px solid ${BORD}`,
                    color: CY, borderRadius: 4, padding: "1px 6px", fontSize: 10, flexShrink: 0,
                  }}>
                    {obj.type || "—"}
                  </span>
                  <span style={{
                    background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)",
                    color: AM, borderRadius: 4, padding: "1px 6px", fontSize: 10, flexShrink: 0, minWidth: 60, textAlign: "right",
                  }}>
                    {obj.distance_km != null ? `${Number(obj.distance_km).toFixed(1)} km` : "? km"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assess */}
      {results.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: "rgba(74,222,128,0.1)", border: `1px solid ${GN}`,
              color: GN, cursor: assessing ? "default" : "pointer",
              borderRadius: 4, padding: "4px 14px", fontFamily: "monospace", fontSize: 12,
            }}
          >{assessing ? "Assessing…" : "▶ ASSESS"}</button>
          {assessment && (
            <div style={{
              marginTop: 8, padding: "8px 10px",
              background: "rgba(74,222,128,0.05)", border: `1px solid rgba(74,222,128,0.2)`,
              borderRadius: 4, color: GN, fontSize: 11, lineHeight: 1.5,
            }}>{assessment}</div>
          )}
        </div>
      )}
    </div>
  );
}
