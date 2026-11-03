import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

export function isBboxqryQuery(q) {
  return /bbox\s*query|bboxqry|bounding\s*box|spatial\s*query|bbox\s*search|bbox\s*spatial/i.test(q || "");
}

const BTN_LEFT = 218040;
const PANEL_W = 820;
const PANEL_H = 650;
const MAP_W = 780;
const MAP_H = 310;

const CY = "#29E7FF";
const AM = "#F5A623";
const GN = "#4ADE80";
const RD = "#F87171";
const PURP = "#B06EFF";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TYPE_COLORS = {
  vessel: CY, aircraft: AM, vehicle: GN, person: RD, location: PURP,
  facility: "#FB923C", sensor: "#34D399", default: "#94A3B8",
};
function typeColor(t) {
  return TYPE_COLORS[(t || "").toLowerCase()] || TYPE_COLORS.default;
}

function mercatorXY(lon, lat, w, h) {
  const x = ((lon + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN * h) / (2 * Math.PI);
  return { x, y };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function bboxSVGRect(minLat, minLon, maxLat, maxLon, w, h) {
  const tl = mercatorXY(minLon, maxLat, w, h);
  const br = mercatorXY(maxLon, minLat, w, h);
  const rx = clamp(tl.x, 0, w);
  const ry = clamp(tl.y, 0, h);
  const rw = clamp(br.x - tl.x, 1, w - rx);
  const rh = clamp(br.y - tl.y, 1, h - ry);
  return { x: rx, y: ry, w: rw, h: rh };
}

export default function BboxSpatialQuery() {
  const [open, setOpen] = useState(false);
  const [minLat, setMinLat] = useState("-34");
  const [minLon, setMinLon] = useState("115");
  const [maxLat, setMaxLat] = useState("-31");
  const [maxLon, setMaxLon] = useState("122");
  const [loading, setLoading] = useState(false);
  const [objects, setObjects] = useState([]);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState(null);
  const [track, setTrack] = useState([]);
  const [trackLoading, setTrackLoading] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [assessing, setAssessing] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:bboxqry-toggle", toggle);
    return () => window.removeEventListener("jarvis:bboxqry-toggle", toggle);
  }, []);

  async function speak(text) {
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      const a = new Audio(url);
      audioRef.current = a;
      a.play().catch(() => {});
    } catch {}
  }

  async function search() {
    const lat1 = parseFloat(minLat), lon1 = parseFloat(minLon);
    const lat2 = parseFloat(maxLat), lon2 = parseFloat(maxLon);
    if ([lat1, lon1, lat2, lon2].some(isNaN)) { setError("Invalid coordinates."); return; }
    setLoading(true); setError(""); setObjects([]); setTrack([]); setSelectedId(null); setAssessText("");
    try {
      const url = `${apiBase()}/v1/geo/bbox?min_lat=${lat1}&min_lon=${lon1}&max_lat=${lat2}&max_lon=${lon2}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
      if (!r.ok) { setError(`HTTP ${r.status}`); return; }
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.objects || d.results || d.data || []);
      setObjects(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTrack(id) {
    if (selectedId === id) { setSelectedId(null); setTrack([]); return; }
    setSelectedId(id); setTrack([]); setTrackLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/geo/tracks/${id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      const pts = Array.isArray(d) ? d : (d.points || d.track || []);
      setTrack(pts);
    } catch {}
    finally { setTrackLoading(false); }
  }

  async function assess() {
    if (!objects.length) return;
    setAssessing(true); setAssessText("");
    const summary = objects.slice(0, 10).map(o =>
      `${o.name || o.id || "object"} (${o.object_type || o.type || "unknown"})`
    ).join(", ");
    const msg = `Spatial bbox query results: ${objects.length} objects in bounding box min_lat=${minLat} min_lon=${minLon} max_lat=${maxLat} max_lon=${maxLon}. Objects: ${summary}. Briefly assess what is concentrated in this bounding box and any significance.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(text);
      if (text) speak(text);
    } catch {}
    finally { setAssessing(false); }
  }

  function exportCoords() {
    const lines = objects.map(o => {
      const lat = o.lat ?? o.latitude ?? o.position?.lat ?? "";
      const lon = o.lon ?? o.longitude ?? o.position?.lon ?? "";
      return `${o.name || o.id || "?"},${lat},${lon}`;
    }).join("\n");
    navigator.clipboard.writeText(lines).catch(() => {});
  }

  const minLatN = parseFloat(minLat) || 0;
  const minLonN = parseFloat(minLon) || 0;
  const maxLatN = parseFloat(maxLat) || 0;
  const maxLonN = parseFloat(maxLon) || 0;

  const allTypes = ["ALL", ...Array.from(new Set(objects.map(o => (o.object_type || o.type || "unknown").toLowerCase())))];
  const filtered = typeFilter === "ALL" ? objects : objects.filter(o =>
    (o.object_type || o.type || "unknown").toLowerCase() === typeFilter
  );

  const bboxRect = bboxSVGRect(minLatN, minLonN, maxLatN, maxLonN, MAP_W, MAP_H);

  const trackPath = (() => {
    if (!track.length) return "";
    const pts = track.map(p => {
      const lat = p.lat ?? p.latitude ?? p.position?.lat ?? 0;
      const lon = p.lon ?? p.longitude ?? p.position?.lon ?? 0;
      return mercatorXY(lon, lat, MAP_W, MAP_H);
    });
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  })();

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  return (
    <>
      <audio ref={audioRef} style={{ display: "none" }} />
      <button
        onClick={() => setOpen(o => !o)}
        title="Bbox Spatial Query"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 400,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, padding: "3px 10px", cursor: "pointer",
          fontSize: 11, letterSpacing: 1, ...mono,
          boxShadow: open ? `0 0 18px ${CY}` : "none",
        }}
      >◈ BBOXQRY</button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT, zIndex: 399,
          width: PANEL_W, maxHeight: PANEL_H, overflowY: "auto",
          background: SURF, border: `1px solid ${BORD}`,
          borderRadius: 12, padding: "16px 18px",
          boxShadow: `0 0 60px ${CY}22`, color: "#DCEBF5", ...mono,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 3, fontSize: 13,
              textShadow: `0 0 12px ${CY}` }}>◈ BBOX SPATIAL QUERY</span>
            {objects.length > 0 && (
              <span style={{ marginLeft: "auto", background: `${CY}22`, color: CY,
                border: `1px solid ${CY}44`, borderRadius: 10, padding: "1px 10px", fontSize: 11 }}>
                {objects.length} objects
              </span>
            )}
            <button onClick={() => setOpen(false)} style={{
              marginLeft: objects.length ? 0 : "auto",
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: 0,
            }}>✕</button>
          </div>

          {/* Inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 12 }}>
            {[
              ["Min Lat", minLat, setMinLat],
              ["Min Lon", minLon, setMinLon],
              ["Max Lat", maxLat, setMaxLat],
              ["Max Lon", maxLon, setMaxLon],
            ].map(([label, val, set]) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 3, letterSpacing: 1 }}>{label}</div>
                <input
                  type="number"
                  value={val}
                  onChange={e => set(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`,
                    color: CY, borderRadius: 5, padding: "5px 8px", fontSize: 12, ...mono,
                  }}
                />
              </div>
            ))}
            <button onClick={search} disabled={loading} style={{
              alignSelf: "flex-end", background: loading ? "rgba(41,231,255,0.1)" : `${CY}22`,
              border: `1px solid ${CY}`, color: CY, borderRadius: 6,
              padding: "6px 14px", cursor: loading ? "default" : "pointer",
              fontSize: 11, letterSpacing: 1, ...mono,
            }}>
              {loading ? "…" : "SEARCH"}
            </button>
          </div>

          {error && <div style={{ color: RD, fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}

          {/* SVG Map */}
          <div style={{ marginBottom: 12, border: `1px solid ${BORD}`, borderRadius: 8, overflow: "hidden" }}>
            <svg width={MAP_W} height={MAP_H} style={{ display: "block", background: "rgba(4,8,14,0.95)" }}>
              {/* graticule */}
              {[-60, -30, 0, 30, 60].map(lat => {
                const { y } = mercatorXY(0, lat, MAP_W, MAP_H);
                return <line key={`lat${lat}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke="rgba(41,231,255,0.07)" strokeWidth={1} />;
              })}
              {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(lon => {
                const { x } = mercatorXY(lon, 0, MAP_W, MAP_H);
                return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke="rgba(41,231,255,0.07)" strokeWidth={1} />;
              })}

              {/* bbox rectangle */}
              {(minLatN !== maxLatN || minLonN !== maxLonN) && (
                <rect
                  x={bboxRect.x} y={bboxRect.y} width={bboxRect.w} height={bboxRect.h}
                  fill={`${CY}11`} stroke={CY} strokeWidth={1.5} strokeDasharray="6,3" rx={2}
                />
              )}

              {/* track */}
              {trackPath && (
                <path d={trackPath} fill="none" stroke={AM} strokeWidth={1.5} opacity={0.8} />
              )}

              {/* object dots */}
              {objects.map((o, i) => {
                const lat = o.lat ?? o.latitude ?? o.position?.lat;
                const lon = o.lon ?? o.longitude ?? o.position?.lon;
                if (lat == null || lon == null) return null;
                const { x, y } = mercatorXY(lon, lat, MAP_W, MAP_H);
                const col = typeColor(o.object_type || o.type);
                const sel = selectedId === (o.id || o.object_id);
                return (
                  <g key={o.id || i} onClick={() => fetchTrack(o.id || o.object_id)}
                    style={{ cursor: "pointer" }}>
                    <circle cx={x} cy={y} r={sel ? 7 : 4}
                      fill={col} stroke={sel ? "#fff" : col} strokeWidth={sel ? 2 : 0.5} opacity={0.9} />
                    {sel && <circle cx={x} cy={y} r={11} fill="none" stroke={col} strokeWidth={1} opacity={0.4} />}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Type filters */}
          {allTypes.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {allTypes.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={{
                  background: typeFilter === t ? `${typeColor(t)}33` : "rgba(41,231,255,0.05)",
                  border: `1px solid ${typeFilter === t ? typeColor(t) : BORD}`,
                  color: typeFilter === t ? typeColor(t) : "#94A3B8",
                  borderRadius: 10, padding: "2px 10px", fontSize: 10, cursor: "pointer", ...mono,
                }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Results list */}
          {filtered.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 12 }}>
              {filtered.map((o, i) => {
                const col = typeColor(o.object_type || o.type);
                const sel = selectedId === (o.id || o.object_id);
                return (
                  <div key={o.id || i}
                    onClick={() => fetchTrack(o.id || o.object_id)}
                    style={{
                      padding: "5px 8px", borderRadius: 5, cursor: "pointer", marginBottom: 2,
                      background: sel ? `${col}18` : "rgba(41,231,255,0.03)",
                      border: `1px solid ${sel ? col : BORD}`,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: col, minWidth: 70 }}>
                      {(o.object_type || o.type || "?").toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>
                      {o.name || o.id || "—"}
                    </span>
                    {trackLoading && sel && (
                      <span style={{ fontSize: 9, color: AM }}>loading track…</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          {objects.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: assessText ? 10 : 0 }}>
              <button onClick={assess} disabled={assessing} style={{
                background: `${PURP}22`, border: `1px solid ${PURP}`, color: PURP,
                borderRadius: 6, padding: "5px 14px", cursor: assessing ? "default" : "pointer",
                fontSize: 11, letterSpacing: 1, ...mono,
              }}>
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button onClick={exportCoords} style={{
                background: `${GN}18`, border: `1px solid ${GN}`, color: GN,
                borderRadius: 6, padding: "5px 14px", cursor: "pointer",
                fontSize: 11, letterSpacing: 1, ...mono,
              }}>
                ⬇ EXPORT COORDS
              </button>
            </div>
          )}

          {/* ASSESS output */}
          {assessText && (
            <div style={{
              marginTop: 10, padding: "10px 12px",
              background: `${PURP}11`, border: `1px solid ${PURP}44`,
              borderRadius: 8, fontSize: 11, lineHeight: 1.6, color: "#C4D4E0",
            }}>
              {assessText}
            </div>
          )}
        </div>
      )}
    </>
  );
}
