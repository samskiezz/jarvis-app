/**
 * GeofenceManager — F287.
 *
 * Data sources:
 *   GET  /v1/geo/geofences              → {count, geofences:[{id,name,polygon,created_ts}]}
 *   POST /v1/geo/geofences              → {id}  (body: {name, polygon: [[lat,lon],…]})
 *   GET  /v1/geo/contains?lat=&lon=     → {lat, lon, count, geofences:[…]}
 *
 * Displays:
 *   - Geofence list with vertex count badge
 *   - Click geofence → highlight polygon on SVG world map
 *   - "Test Point" form (lat/lon) → GET /v1/geo/contains → green highlight
 *   - "New Geofence" form: name + polygon coords textarea → POST /v1/geo/geofences
 *   - Geofence count badge on toggle button
 *   - ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ GEOFNC  left:208520  bottom:8  zIndex:383
 * Event:  jarvis:geofnc-toggle
 * Voice:  "geofence / geofences / geofnc / geo fence / fence manager /
 *          geofence manager / test point / point in geofence"
 *
 * Exported for JarvisBrain: isGeofncQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RD  = "#FF4C4C";
const DIM = "rgba(0,0,0,0.55)";

// ─── voice trigger ─────────────────────────────────────────────────────────────
const TRIGGERS = [
  "geofence", "geofences", "geofnc", "geo fence", "fence manager",
  "geofence manager", "test point", "point in geofence",
];
export function isGeofncQuery(q = "") {
  const lq = q.toLowerCase();
  return TRIGGERS.some((t) => lq.includes(t));
}

// ─── Mercator helpers ──────────────────────────────────────────────────────────
const W = 540, H = 260;
const project = (lat, lon) => ({
  x: ((lon + 180) / 360) * W,
  y: ((90 - lat) / 180) * H,
});

// ─── SVG world outline (simplified) ──────────────────────────────────────────
const WORLD_PATH =
  "M0,0 L540,0 L540,260 L0,260 Z";

function WorldMap({ fences, selected, testResult, testPoint }) {
  const polyPoints = (polygon) =>
    polygon
      .map(([la, lo]) => {
        const p = project(la, lo);
        return `${p.x},${p.y}`;
      })
      .join(" ");

  const testPt = testPoint.lat && testPoint.lon
    ? project(parseFloat(testPoint.lat), parseFloat(testPoint.lon))
    : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "100%", background: "#0a1628" }}
    >
      {/* ocean fill */}
      <rect width={W} height={H} fill="#0d1f3c" />
      {/* grid lines */}
      {[-60,-30,0,30,60].map((la) => {
        const y = project(la, 0).y;
        return <line key={la} x1={0} y1={y} x2={W} y2={y} stroke="#1a3050" strokeWidth={0.5} />;
      })}
      {[-120,-60,0,60,120].map((lo) => {
        const x = project(0, lo).x;
        return <line key={lo} x1={x} y1={0} x2={x} y2={H} stroke="#1a3050" strokeWidth={0.5} />;
      })}
      {/* fences */}
      {fences.map((f) => {
        const poly = f.polygon || [];
        if (poly.length < 3) return null;
        const matched = testResult?.geofences?.some((r) => r.id === f.id);
        const isSel = selected?.id === f.id;
        const fill = matched ? "rgba(74,222,128,0.25)" : isSel ? "rgba(41,231,255,0.18)" : "rgba(245,166,35,0.12)";
        const stroke = matched ? GN : isSel ? CY : AM;
        return (
          <polygon
            key={f.id}
            points={polyPoints(poly)}
            fill={fill}
            stroke={stroke}
            strokeWidth={isSel ? 1.5 : 1}
            strokeLinejoin="round"
            style={{ cursor: "pointer" }}
          />
        );
      })}
      {/* test point */}
      {testPt && (
        <circle cx={testPt.x} cy={testPt.y} r={4} fill={RD} stroke="#fff" strokeWidth={1} />
      )}
      {/* equator label */}
      <text x={4} y={project(0,0).y - 2} fill="#2a4060" fontSize={7}>EQ</text>
    </svg>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function GeofenceManager() {
  const [open, setOpen] = useState(false);
  const [fences, setFences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  // test point
  const [testLat, setTestLat] = useState("");
  const [testLon, setTestLon] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  // new geofence
  const [newName, setNewName] = useState("");
  const [newPolygon, setNewPolygon] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  // assess
  const [assessing, setAssessing] = useState(false);
  const ttsRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/geo/geofences`);
      const d = await r.json();
      setFences(d.geofences || []);
    } catch {
      setFences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen((o) => !o);
    window.addEventListener("jarvis:geofnc-toggle", h);
    return () => window.removeEventListener("jarvis:geofnc-toggle", h);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleTest = async () => {
    if (!testLat || !testLon) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await fetch(
        `${apiBase()}/v1/geo/contains?lat=${encodeURIComponent(testLat)}&lon=${encodeURIComponent(testLon)}`
      );
      const d = await r.json();
      setTestResult(d);
    } catch {
      setTestResult({ error: "Request failed" });
    } finally {
      setTestLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreateError("");
    if (!newName.trim() || !newPolygon.trim()) {
      setCreateError("Name and polygon required.");
      return;
    }
    let polygon;
    try {
      polygon = JSON.parse(newPolygon);
      if (!Array.isArray(polygon) || polygon.length < 3)
        throw new Error("Need at least 3 points.");
    } catch (e) {
      setCreateError(`Invalid polygon JSON: ${e.message}`);
      return;
    }
    setCreating(true);
    try {
      const r = await fetch(`${apiBase()}/v1/geo/geofences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), polygon }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || r.statusText);
      }
      setNewName("");
      setNewPolygon("");
      await load();
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const speak = useCallback(async (text) => {
    try {
      if (ttsRef.current) ttsRef.current.pause();
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsRef.current = audio;
      audio.play();
    } catch {}
  }, []);

  const handleAssess = async () => {
    setAssessing(true);
    try {
      const msg = `Geofence coverage analysis: ${fences.length} geofences configured. ${testResult ? `Last point test (${testLat},${testLon}) matched ${testResult.count ?? 0} fences.` : "No point test run."} Assess coverage and gaps.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) speak(answer);
    } catch {}
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 208520 % 3600 + 8,
          zIndex: 383,
          background: DIM,
          border: `1px solid ${AM}`,
          color: AM,
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        ◈ GEOFNC
        {fences.length > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 3, padding: "0 4px" }}>
            {fences.length}
          </span>
        )}
      </button>
    );
  }

  const testPt = { lat: testLat, lon: testLon };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 383,
        background: "rgba(5,12,28,0.96)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        color: CY,
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid #1a2f50` }}>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ GEOFENCE MANAGER
          <span style={{ marginLeft: 8, color: AM, fontSize: 11 }}>{fences.length} zones</span>
        </span>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{ background: "transparent", border: `1px solid ${GN}`, color: GN, borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer", marginRight: 8 }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "transparent", border: `1px solid ${RD}`, color: RD, borderRadius: 3, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* left panel: list + forms */}
        <div style={{ width: 280, borderRight: `1px solid #1a2f50`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* geofence list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 6 }}>STORED GEOFENCES</div>
            {loading && <div style={{ color: "#4a6080", fontSize: 11 }}>Loading…</div>}
            {!loading && fences.length === 0 && (
              <div style={{ color: "#4a6080", fontSize: 11 }}>No geofences stored.</div>
            )}
            {fences.map((f) => {
              const verts = (f.polygon || []).length;
              const isSel = selected?.id === f.id;
              const matched = testResult?.geofences?.some((r) => r.id === f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => setSelected(isSel ? null : f)}
                  style={{
                    padding: "5px 7px",
                    marginBottom: 4,
                    borderRadius: 4,
                    border: `1px solid ${isSel ? CY : matched ? GN : "#1a3050"}`,
                    cursor: "pointer",
                    background: isSel ? "rgba(41,231,255,0.07)" : matched ? "rgba(74,222,128,0.07)" : "transparent",
                  }}
                >
                  <div style={{ fontSize: 11, color: isSel ? CY : matched ? GN : "#8ab0c0" }}>{f.name || f.id}</div>
                  <div style={{ fontSize: 9, color: "#4a6080", marginTop: 2 }}>
                    {verts} vertices
                    {matched && <span style={{ marginLeft: 6, color: GN }}>✓ contains point</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* test point */}
          <div style={{ padding: "8px 10px", borderTop: `1px solid #1a2f50` }}>
            <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 5 }}>TEST POINT</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <input
                placeholder="lat"
                value={testLat}
                onChange={(e) => setTestLat(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="lon"
                value={testLon}
                onChange={(e) => setTestLon(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              onClick={handleTest}
              disabled={testLoading || !testLat || !testLon}
              style={btnStyle(CY)}
            >
              {testLoading ? "Testing…" : "Test Point"}
            </button>
            {testResult && !testResult.error && (
              <div style={{ fontSize: 10, color: GN, marginTop: 4 }}>
                {testResult.count} geofence{testResult.count !== 1 ? "s" : ""} contain this point.
              </div>
            )}
            {testResult?.error && (
              <div style={{ fontSize: 10, color: RD, marginTop: 4 }}>{testResult.error}</div>
            )}
          </div>

          {/* new geofence */}
          <div style={{ padding: "8px 10px", borderTop: `1px solid #1a2f50` }}>
            <div style={{ fontSize: 10, color: "#4a6080", marginBottom: 5 }}>NEW GEOFENCE</div>
            <input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ ...inputStyle, width: "100%", marginBottom: 4 }}
            />
            <textarea
              placeholder='Polygon JSON e.g. [[51.5,-0.1],[51.6,-0.1],[51.55,0.05]]'
              value={newPolygon}
              onChange={(e) => setNewPolygon(e.target.value)}
              rows={3}
              style={{ ...inputStyle, width: "100%", resize: "vertical", marginBottom: 4 }}
            />
            {createError && (
              <div style={{ fontSize: 9, color: RD, marginBottom: 4 }}>{createError}</div>
            )}
            <button
              onClick={handleCreate}
              disabled={creating}
              style={btnStyle(GN)}
            >
              {creating ? "Creating…" : "Create Geofence"}
            </button>
          </div>
        </div>

        {/* right panel: map */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <WorldMap fences={fences} selected={selected} testResult={testResult} testPoint={testPt} />
            {selected && (
              <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(5,12,28,0.88)", border: `1px solid ${CY}`, borderRadius: 4, padding: "5px 10px", fontSize: 10, color: CY }}>
                <strong>{selected.name || selected.id}</strong>
                <span style={{ marginLeft: 8, color: AM }}>{(selected.polygon || []).length} vertices</span>
              </div>
            )}
          </div>
          {/* legend */}
          <div style={{ padding: "6px 14px", borderTop: `1px solid #1a2f50`, display: "flex", gap: 16, fontSize: 10, color: "#4a6080" }}>
            <span><span style={{ color: AM }}>■</span> Geofence</span>
            <span><span style={{ color: CY }}>■</span> Selected</span>
            <span><span style={{ color: GN }}>■</span> Contains test point</span>
            <span><span style={{ color: RD }}>●</span> Test point</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  background: "#0d1f38",
  border: "1px solid #1a3050",
  color: CY,
  borderRadius: 3,
  padding: "3px 6px",
  fontSize: 10,
  fontFamily: "monospace",
  flex: 1,
  boxSizing: "border-box",
};

const btnStyle = (color) => ({
  background: "transparent",
  border: `1px solid ${color}`,
  color,
  borderRadius: 3,
  padding: "3px 10px",
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "monospace",
  width: "100%",
});
