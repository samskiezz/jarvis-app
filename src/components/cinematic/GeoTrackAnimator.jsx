/**
 * GeoTrackAnimator — F293 (overnight 2026-11-02)
 *
 * MAP + SCRUBBER: pick a tracked object from GET /v1/geo/objects, load its
 * historical movement from GET /v1/geo/tracks/{object_id}, render the
 * dashed path on an SVG world map, and animate a dot along the track with
 * play/pause/step controls at 1×/5×/20× speed.
 *
 * Features:
 *   - Dropdown populated from GET /v1/geo/objects (objects that have lat/lon)
 *   - GET /v1/geo/tracks/{object_id} → array of {lat, lon, ts} waypoints
 *   - SVG Mercator world map, dashed historical path + animated dot
 *   - Play/Pause/Step-back/Step-forward scrubber (slider + buttons)
 *   - Speed selector: 1× / 5× / 20×
 *   - Current timestamp as ISO string in header
 *   - Distance-traveled badge (great-circle sum in km)
 *   - Waypoint tooltip on hover
 *   - ASSESS → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier
 *
 * Toggle: ◈ GEOTRK  left:211880  zIndex:389
 * Event:  jarvis:geotrk-toggle
 * Voice:  "geo track / geotrk / track animator / movement track /
 *          object track / geo movement / track playback"
 *
 * Exported for JarvisBrain: isGeoTrkQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const PANEL_W = 600;
const PANEL_H = 680;
const MAP_W   = PANEL_W - 4;
const MAP_H   = 320;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const GEOTRK_RE =
  /\b(geo[\s_-]?trk\b|geo[\s_-]?track|track[\s_-]?animator|movement[\s_-]?track|object[\s_-]?track|geo[\s_-]?movement|track[\s_-]?playback|track[\s_-]?history|historical[\s_-]?track)\b/i;

export function isGeoTrkQuery(q) {
  return GEOTRK_RE.test(q || "");
}

// ─── Mercator projection ──────────────────────────────────────────────────────
function lonLatToXY(lon, lat, w, h) {
  const x = ((lon + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN / Math.PI) * h * 0.5;
  return { x, y };
}

// Great-circle distance in km (Haversine)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistance(waypoints) {
  let d = 0;
  for (let i = 1; i < waypoints.length; i++) {
    d += haversineKm(
      waypoints[i - 1].lat,
      waypoints[i - 1].lon,
      waypoints[i].lat,
      waypoints[i].lon,
    );
  }
  return d;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────
function hdrs() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function fetchObjects() {
  const r = await fetch(`${apiBase()}/v1/geo/objects`, { headers: hdrs() });
  if (!r.ok) throw new Error(`geo/objects ${r.status}`);
  const d = await r.json();
  const arr = Array.isArray(d?.objects)
    ? d.objects
    : Array.isArray(d?.items)
    ? d.items
    : Array.isArray(d)
    ? d
    : [];
  return arr.map((o) => ({
    id:    String(o.object_id || o.id || "?"),
    label: o.label || o.name || o.type || o.id || "—",
    type:  o.type || "unknown",
  }));
}

async function fetchTracks(objectId) {
  const r = await fetch(
    `${apiBase()}/v1/geo/tracks/${encodeURIComponent(objectId)}`,
    { headers: hdrs() },
  );
  if (!r.ok) throw new Error(`geo/tracks ${r.status}`);
  const d = await r.json();
  const arr = Array.isArray(d?.track)
    ? d.track
    : Array.isArray(d?.points)
    ? d.points
    : Array.isArray(d?.waypoints)
    ? d.waypoints
    : Array.isArray(d)
    ? d
    : [];
  return arr
    .filter((p) => p && typeof p.lat === "number" && typeof p.lon === "number")
    .map((p) => ({
      lat: p.lat,
      lon: p.lon,
      ts:  p.ts || p.timestamp || p.time || null,
    }));
}

async function postAssess(message) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: hdrs(),
    body:    JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error(`assess ${r.status}`);
  const d = await r.json();
  return d.response || d.message || d.text || d.content || JSON.stringify(d).slice(0, 400);
}

// ─── simple world map SVG paths (lat/lon grid lines) ─────────────────────────
function WorldMapBg({ w, h }) {
  const lats  = [-60, -30, 0, 30, 60];
  const lons  = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  return (
    <g opacity={0.18}>
      {lats.map((lat) => {
        const y = lonLatToXY(0, lat, w, h).y;
        return (
          <line key={`lat${lat}`} x1={0} y1={y} x2={w} y2={y}
            stroke={CY} strokeWidth={0.5} />
        );
      })}
      {lons.map((lon) => {
        const x = lonLatToXY(lon, 0, w, h).x;
        return (
          <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={h}
            stroke={CY} strokeWidth={0.5} />
        );
      })}
      {/* Equator highlight */}
      <line x1={0} y1={lonLatToXY(0, 0, w, h).y} x2={w}
        y2={lonLatToXY(0, 0, w, h).y}
        stroke={AM} strokeWidth={0.8} />
    </g>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function GeoTrackAnimator() {
  const [open, setOpen]             = useState(false);
  const [objects, setObjects]       = useState([]);
  const [objLoading, setObjLoading] = useState(false);
  const [objError, setObjError]     = useState(null);

  const [selectedId, setSelectedId] = useState("");
  const [track, setTrack]           = useState([]);
  const [trackLoading, setTrkLoading] = useState(false);
  const [trackError, setTrkError]   = useState(null);

  const [frame, setFrame]           = useState(0);
  const [playing, setPlaying]       = useState(false);
  const [speed, setSpeed]           = useState(1);

  const [tooltip, setTooltip]       = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");

  const animRef = useRef(null);
  const lastRef = useRef(null);

  // ─── toggle listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:geotrk-toggle", handler);
    return () => window.removeEventListener("jarvis:geotrk-toggle", handler);
  }, []);

  // ─── JarvisBrain voice hook ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (isGeoTrkQuery(e.detail?.query || "")) {
        setOpen(true);
      }
    };
    window.addEventListener("jarvis:ask", handler);
    return () => window.removeEventListener("jarvis:ask", handler);
  }, []);

  // ─── load object list when panel opens ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setObjLoading(true);
    setObjError(null);
    fetchObjects()
      .then(setObjects)
      .catch((e) => setObjError(e.message))
      .finally(() => setObjLoading(false));
  }, [open]);

  // ─── load track when object selected ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setTrack([]); return; }
    setTrkLoading(true);
    setTrkError(null);
    setPlaying(false);
    setFrame(0);
    fetchTracks(selectedId)
      .then(setTrack)
      .catch((e) => setTrkError(e.message))
      .finally(() => setTrkLoading(false));
  }, [selectedId]);

  // ─── animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || track.length === 0) return;
    const BASE_MS = 600;
    const interval = BASE_MS / speed;

    function tick(now) {
      if (lastRef.current === null) lastRef.current = now;
      if (now - lastRef.current >= interval) {
        lastRef.current = now;
        setFrame((f) => {
          if (f >= track.length - 1) {
            setPlaying(false);
            return f;
          }
          return f + 1;
        });
      }
      animRef.current = requestAnimationFrame(tick);
    }

    lastRef.current = null;
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, speed, track.length]);

  // ─── ASSESS ────────────────────────────────────────────────────────────────
  const handleAssess = useCallback(async () => {
    if (!selectedId || track.length === 0) return;
    setAssessing(true);
    setAssessText("");
    const label = objects.find((o) => o.id === selectedId)?.label || selectedId;
    const dist  = totalDistance(track).toFixed(1);
    const first = track[0]?.ts ? ` from ${track[0].ts}` : "";
    const last  = track[track.length - 1]?.ts ? ` to ${track[track.length - 1].ts}` : "";
    const prompt = `You are JARVIS. Analyse this movement track for object "${label}": ${track.length} waypoints${first}${last}, total distance ${dist} km. Current playback position: waypoint ${frame + 1} of ${track.length}. Summarise the movement pattern, any notable trajectory features, and operational significance in two sentences.`;
    try {
      const text = await postAssess(prompt);
      setAssessText(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setAssessText(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [selectedId, track, frame, objects]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       211880,
          zIndex:     389,
          background: "rgba(10,18,28,0.92)",
          border:     `1px solid ${BORD}`,
          color:      CY,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize:   9,
          padding:    "3px 7px",
          cursor:     "pointer",
          letterSpacing: 1.5,
        }}
      >
        ◈ GEOTRK
      </button>
    );
  }

  const currentWp  = track[frame] || null;
  const dist       = totalDistance(track.slice(0, frame + 1)).toFixed(1);
  const totalDist  = totalDistance(track).toFixed(1);
  const objLabel   = objects.find((o) => o.id === selectedId)?.label || selectedId || "—";

  const pathPts = track.slice(0, frame + 1).map((wp) =>
    lonLatToXY(wp.lon, wp.lat, MAP_W, MAP_H),
  );
  const dotPt = currentWp ? lonLatToXY(currentWp.lon, currentWp.lat, MAP_W, MAP_H) : null;

  const pathD = pathPts.length > 1
    ? pathPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    : "";

  return (
    <div
      style={{
        position:   "fixed",
        top:        "50%",
        left:       "50%",
        transform:  "translate(-50%,-50%)",
        width:      PANEL_W,
        maxHeight:  PANEL_H,
        overflowY:  "auto",
        background: SURF,
        border:     `1px solid ${BORD}`,
        zIndex:     10389,
        fontFamily: "'JetBrains Mono',monospace",
        color:      CY,
        fontSize:   11,
        boxShadow:  `0 0 40px rgba(41,231,255,0.12)`,
      }}
    >
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "8px 12px",
        borderBottom:   `1px solid ${BORD}`,
        background:     "rgba(41,231,255,0.04)",
      }}>
        <span style={{ letterSpacing: 2, fontSize: 10 }}>◈ GEO TRACK ANIMATOR</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentWp?.ts && (
            <span style={{ color: AM, fontSize: 9 }}>
              {typeof currentWp.ts === "string"
                ? currentWp.ts
                : new Date(currentWp.ts).toISOString()}
            </span>
          )}
          <button
            onClick={() => { setOpen(false); setPlaying(false); }}
            style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}
          >✕</button>
        </div>
      </div>

      <div style={{ padding: "10px 12px" }}>
        {/* Object selector */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 9, color: GRAY, display: "block", marginBottom: 3 }}>
            SELECT OBJECT
          </label>
          {objLoading && <span style={{ color: GRAY, fontSize: 9 }}>Loading objects…</span>}
          {objError   && <span style={{ color: RD,   fontSize: 9 }}>Error: {objError}</span>}
          {!objLoading && !objError && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                width:      "100%",
                background: "rgba(10,18,28,0.9)",
                border:     `1px solid ${BORD}`,
                color:      CY,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize:   10,
                padding:    "4px 6px",
              }}
            >
              <option value="">— pick an object —</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  [{o.type}] {o.label} ({o.id})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Map */}
        <div style={{
          border:     `1px solid ${BORD}`,
          background: "rgba(0,0,0,0.6)",
          position:   "relative",
          marginBottom: 8,
        }}>
          <svg width={MAP_W} height={MAP_H}>
            <WorldMapBg w={MAP_W} h={MAP_H} />

            {/* Full dashed path ghost */}
            {track.length > 1 && (() => {
              const allPts = track.map((wp) =>
                lonLatToXY(wp.lon, wp.lat, MAP_W, MAP_H),
              );
              const ghostD = allPts
                .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(" ");
              return (
                <path
                  d={ghostD}
                  fill="none"
                  stroke={GRAY}
                  strokeWidth={1}
                  strokeDasharray="3,4"
                  opacity={0.35}
                />
              );
            })()}

            {/* Traveled path */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={CY}
                strokeWidth={1.8}
                strokeDasharray="4,3"
                opacity={0.9}
              />
            )}

            {/* Waypoint dots (hover targets) */}
            {track.slice(0, frame + 1).map((wp, i) => {
              const p = lonLatToXY(wp.lon, wp.lat, MAP_W, MAP_H);
              return (
                <circle
                  key={i}
                  cx={p.x} cy={p.y} r={i === frame ? 0 : 2}
                  fill={GRAY} opacity={0.5}
                  onMouseEnter={() => setTooltip({ ...wp, idx: i, x: p.x, y: p.y })}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}

            {/* Animated dot */}
            {dotPt && (
              <>
                <circle cx={dotPt.x} cy={dotPt.y} r={7} fill={CY} opacity={0.15} />
                <circle cx={dotPt.x} cy={dotPt.y} r={4} fill={CY} opacity={0.9} />
              </>
            )}

            {/* Tooltip */}
            {tooltip && (() => {
              const tx = tooltip.x + 8;
              const ty = Math.max(14, tooltip.y - 4);
              const ts = tooltip.ts
                ? (typeof tooltip.ts === "string" ? tooltip.ts : new Date(tooltip.ts).toISOString())
                : "—";
              return (
                <g>
                  <rect x={tx - 2} y={ty - 11} width={180} height={28}
                    fill="rgba(10,18,28,0.92)" stroke={BORD} strokeWidth={0.5} />
                  <text x={tx} y={ty} fill={CY} fontSize={9}>
                    {`WP ${tooltip.idx + 1}: ${tooltip.lat.toFixed(4)}, ${tooltip.lon.toFixed(4)}`}
                  </text>
                  <text x={tx} y={ty + 12} fill={AM} fontSize={8}>{ts}</text>
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Track state */}
        {trackLoading && <div style={{ color: GRAY, fontSize: 9, marginBottom: 6 }}>Loading track…</div>}
        {trackError   && <div style={{ color: RD,   fontSize: 9, marginBottom: 6 }}>Track error: {trackError}</div>}

        {track.length > 0 && (
          <>
            {/* Stats row */}
            <div style={{
              display:       "flex",
              gap:           10,
              marginBottom:  8,
              flexWrap:      "wrap",
            }}>
              <span style={{ background: "rgba(41,231,255,0.08)", border: `1px solid ${BORD}`, padding: "2px 6px", fontSize: 9 }}>
                OBJECT: <span style={{ color: AM }}>{objLabel}</span>
              </span>
              <span style={{ background: "rgba(41,231,255,0.08)", border: `1px solid ${BORD}`, padding: "2px 6px", fontSize: 9 }}>
                WAYPOINTS: <span style={{ color: GN }}>{track.length}</span>
              </span>
              <span style={{ background: "rgba(41,231,255,0.08)", border: `1px solid ${BORD}`, padding: "2px 6px", fontSize: 9 }}>
                TRAVELED: <span style={{ color: AM }}>{dist} km</span>
                {" / "}<span style={{ color: GRAY }}>{totalDist} km total</span>
              </span>
              <span style={{ background: "rgba(41,231,255,0.08)", border: `1px solid ${BORD}`, padding: "2px 6px", fontSize: 9 }}>
                FRAME: <span style={{ color: CY }}>{frame + 1} / {track.length}</span>
              </span>
            </div>

            {/* Scrubber */}
            <input
              type="range"
              min={0}
              max={track.length - 1}
              value={frame}
              onChange={(e) => { setPlaying(false); setFrame(Number(e.target.value)); }}
              style={{ width: "100%", marginBottom: 8, accentColor: CY }}
            />

            {/* Controls */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => { setPlaying(false); setFrame((f) => Math.max(0, f - 1)); }}
                style={btnStyle}
              >◀ STEP</button>
              <button
                onClick={() => setPlaying((v) => !v)}
                style={{ ...btnStyle, color: playing ? AM : GN }}
              >{playing ? "⏸ PAUSE" : "▶ PLAY"}</button>
              <button
                onClick={() => { setPlaying(false); setFrame((f) => Math.min(track.length - 1, f + 1)); }}
                style={btnStyle}
              >STEP ▶</button>
              <button
                onClick={() => { setPlaying(false); setFrame(0); }}
                style={btnStyle}
              >■ RESET</button>

              {/* Speed */}
              <span style={{ color: GRAY, fontSize: 9, marginLeft: 4 }}>SPEED:</span>
              {[1, 5, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  style={{ ...btnStyle, color: speed === s ? AM : GRAY, borderColor: speed === s ? AM : BORD }}
                >{s}×</button>
              ))}
            </div>
          </>
        )}

        {!selectedId && !objLoading && (
          <div style={{ color: GRAY, fontSize: 9, textAlign: "center", padding: "12px 0" }}>
            Select a tracked object to load its movement history.
          </div>
        )}

        {selectedId && !trackLoading && track.length === 0 && !trackError && (
          <div style={{ color: GRAY, fontSize: 9, textAlign: "center", padding: "12px 0" }}>
            No track waypoints on record for this object.
          </div>
        )}

        {/* ASSESS */}
        {track.length > 0 && (
          <div>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{ ...btnStyle, color: AM, borderColor: AM, width: "100%", padding: "5px 0", marginTop: 4 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS MOVEMENT PATTERN"}
            </button>
            {assessText && (
              <div style={{
                marginTop: 6,
                padding:   "6px 8px",
                border:    `1px solid ${BORD}`,
                background: "rgba(41,231,255,0.04)",
                fontSize:  9,
                color:     CY,
                lineHeight: 1.5,
              }}>
                {assessText}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  background:    "rgba(10,18,28,0.85)",
  border:        `1px solid ${BORD}`,
  color:         CY,
  fontFamily:    "'JetBrains Mono',monospace",
  fontSize:      9,
  padding:       "3px 8px",
  cursor:        "pointer",
  letterSpacing: 1,
};
