/**
 * F06 — Live World Incident Feed
 * Polls /functions/getLiveIntel for earthquake data.
 * Panel: scrolling incident list + SVG world globe with magnitude-scaled pins.
 * Additive only — mounted via App.jsx. Zero edits to protected files.
 *
 * Voice intent: "world incidents" / "earthquake feed" / "seismic feed" /
 *               "live quakes" / "incident feed" / "global incidents"
 * Toggle event: jarvis:incidents-toggle
 * Button: ⚡ QUAKES at left:8700, bottom:18
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveIntel } from "@/api/backendFunctions";

const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const AMBER = "#FFA500";
const RED   = "#FF4466";
const DIM   = "#445566";
const SURF  = "rgba(8,16,28,0.96)";
const BTN_LEFT   = 8700;
const POLL_MS    = 60_000;
const MAP_W      = 520;
const MAP_H      = 240;

// ── voice intent ──────────────────────────────────────────────────────────────
const INTENT_RE =
  /\b(world.?incidents?|earthquake.?feed|seismic.?feed|live.?quakes?|incident.?feed|global.?incidents?|quake.?feed|seismic.?report|recent.?quakes?|earthquake.?list)\b/i;

export function isIncidentFeedQuery(text) {
  return INTENT_RE.test(text || "");
}

export async function buildIncidentFeedScript() {
  try {
    const data = await getLiveIntel({ type: "all" });
    const quakes = data?.earthquakes ?? [];
    if (!quakes.length) {
      return "No significant seismic events detected at this time, sir.";
    }
    const top = [...quakes]
      .sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0))
      .slice(0, 3);
    const summary = top
      .map((q) => `Magnitude ${(q.mag ?? "?").toFixed ? q.mag.toFixed(1) : q.mag} near ${q.place || "unknown"}`)
      .join("; ");
    return `${quakes.length} seismic events on record, sir. Most significant: ${summary}.`;
  } catch {
    return "Live incident feed is unavailable. Please check the connection to the intelligence backend.";
  }
}

// ── magnitude helpers ─────────────────────────────────────────────────────────
function magColor(mag) {
  if (mag >= 7)   return RED;
  if (mag >= 5)   return AMBER;
  if (mag >= 3)   return CY;
  return GRN;
}

function magLabel(mag) {
  if (mag >= 7)   return "MAJOR";
  if (mag >= 5)   return "STRONG";
  if (mag >= 3)   return "MODERATE";
  return "MINOR";
}

function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(typeof ts === "number" ? ts : Number(ts)).toUTCString().slice(0, 25);
  } catch { return "—"; }
}

// ── SVG globe (equirectangular projection) ────────────────────────────────────
// Minimal world silhouette outline path. Approximate coast shape drawn as
// a single SVG polygon chain — not geographically exact, but enough to
// give spatial context for the earthquake pins.
const CONTINENTS = [
  // North America (simplified)
  "M 52 52 L 58 45 L 72 42 L 88 45 L 100 50 L 106 58 L 108 70 L 100 82 L 90 90 L 80 96 L 70 100 L 58 108 L 52 120 L 55 130 L 62 138 L 65 148 L 55 155 L 40 148 L 30 135 L 28 120 L 34 108 L 38 96 L 40 80 L 36 68 L 40 58 Z",
  // South America
  "M 100 155 L 108 148 L 118 148 L 126 155 L 130 165 L 128 178 L 120 190 L 110 202 L 100 210 L 90 215 L 82 210 L 80 198 L 84 185 L 90 172 Z",
  // Europe
  "M 238 45 L 250 42 L 262 44 L 268 50 L 265 58 L 258 62 L 250 65 L 244 60 L 238 55 Z",
  // Africa
  "M 238 80 L 248 75 L 258 76 L 266 82 L 270 95 L 268 110 L 262 125 L 255 140 L 248 155 L 240 162 L 232 158 L 226 145 L 224 130 L 226 115 L 228 100 Z",
  // Asia
  "M 270 45 L 290 42 L 320 44 L 350 46 L 370 48 L 385 52 L 395 60 L 390 70 L 380 78 L 370 82 L 360 85 L 350 88 L 338 90 L 325 92 L 310 90 L 296 86 L 284 80 L 276 72 L 270 62 Z",
  // India
  "M 320 92 L 330 90 L 338 95 L 340 108 L 336 120 L 330 128 L 322 132 L 316 126 L 312 114 L 314 102 Z",
  // Southeast Asia
  "M 360 90 L 372 92 L 380 98 L 378 108 L 368 112 L 358 108 L 355 98 Z",
  // Australia
  "M 370 148 L 385 143 L 400 144 L 410 150 L 415 162 L 412 175 L 404 183 L 392 186 L 380 184 L 370 176 L 366 163 Z",
];

function latLngToXY(lat, lng) {
  // equirectangular: x = (lng+180)/360*W, y = (90-lat)/180*H
  const x = ((lng + 180) / 360) * MAP_W;
  const y = ((90 - lat) / 180) * MAP_H;
  return [x, y];
}

function Pin({ lat, lng, mag, place }) {
  const [hovered, setHovered] = useState(false);
  const [x, y] = latLngToXY(lat, lng);
  const r  = Math.max(3, Math.min(10, (mag ?? 2) * 1.2));
  const c  = magColor(mag ?? 0);
  return (
    <g
      style={{ cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <circle cx={x} cy={y} r={r + 4} fill={c} opacity={0.15} />
      <circle cx={x} cy={y} r={r} fill={c} opacity={0.85} stroke="#000" strokeWidth={0.5} />
      {hovered && (
        <g>
          <rect x={x + 6} y={y - 16} width={160} height={22} rx={3} fill="rgba(8,16,28,0.92)" stroke={c} strokeWidth={0.8} />
          <text x={x + 10} y={y - 3} fill={c} fontSize={9} fontFamily="monospace">
            M{mag?.toFixed ? mag.toFixed(1) : mag} — {(place || "").slice(0, 26)}
          </text>
        </g>
      )}
    </g>
  );
}

function WorldMap({ quakes }) {
  return (
    <svg
      width={MAP_W}
      height={MAP_H}
      style={{ background: "rgba(4,12,22,0.9)", borderRadius: 6, display: "block", border: `1px solid ${DIM}` }}
    >
      {/* grid lines */}
      {[-60, -30, 0, 30, 60].map((lat) => {
        const y = ((90 - lat) / 180) * MAP_H;
        return <line key={lat} x1={0} y1={y} x2={MAP_W} y2={y} stroke={DIM} strokeWidth={0.3} strokeDasharray="2,4" />;
      })}
      {[-120, -60, 0, 60, 120].map((lng) => {
        const x = ((lng + 180) / 360) * MAP_W;
        return <line key={lng} x1={x} y1={0} x2={x} y2={MAP_H} stroke={DIM} strokeWidth={0.3} strokeDasharray="2,4" />;
      })}
      {/* continent fills */}
      {CONTINENTS.map((d, i) => (
        <path key={i} d={d} fill="rgba(40,60,80,0.55)" stroke="rgba(80,120,160,0.4)" strokeWidth={0.6} />
      ))}
      {/* earthquake pins */}
      {quakes.map((q, i) => {
        if (q.lat == null || q.lng == null) return null;
        return <Pin key={q.id ?? i} lat={q.lat} lng={q.lng} mag={q.mag} place={q.place} />;
      })}
      {/* equator label */}
      <text x={4} y={MAP_H / 2 - 2} fill={DIM} fontSize={7} fontFamily="monospace">EQ</text>
    </svg>
  );
}

// ── incident row ──────────────────────────────────────────────────────────────
function IncidentRow({ quake }) {
  const mag = quake.mag ?? quake.magnitude ?? 0;
  const c   = magColor(mag);
  const lbl = magLabel(mag);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderBottom: "1px solid rgba(40,60,80,0.5)",
        fontSize: 11,
        fontFamily: "monospace",
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: c, flexShrink: 0,
          boxShadow: mag >= 5 ? `0 0 6px ${c}` : "none",
        }}
      />
      <span style={{ color: c, minWidth: 38, fontWeight: 700, letterSpacing: 0.5 }}>
        M{mag?.toFixed ? mag.toFixed(1) : mag}
      </span>
      <span style={{ color: "rgba(200,220,240,0.5)", minWidth: 58, fontSize: 9 }}>{lbl}</span>
      <span style={{ color: "rgba(200,220,240,0.85)", flex: 1 }}>{quake.place || "—"}</span>
      <span style={{ color: DIM, fontSize: 9, whiteSpace: "nowrap" }}>{fmt(quake.time)}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function LiveWorldIncidentFeed() {
  const [open,   setOpen]   = useState(false);
  const [quakes, setQuakes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err,    setErr]    = useState(null);
  const [lastAt, setLastAt] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await getLiveIntel({ type: "all" });
      const raw  = data?.earthquakes ?? [];
      // sort by magnitude descending
      const sorted = [...raw].sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0));
      setQuakes(sorted);
      setLastAt(new Date().toUTCString().slice(0, 25));
    } catch (e) {
      setErr(e?.message ?? "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // listen for toggle event from JarvisBrain
  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:incidents-toggle", handler);
    return () => window.removeEventListener("jarvis:incidents-toggle", handler);
  }, []);

  // initial load + polling when open
  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const major = quakes.filter((q) => (q.mag ?? 0) >= 5).length;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 70,
          background: open ? "rgba(41,231,255,0.15)" : "rgba(6,14,24,0.88)",
          border: `1px solid ${open ? CY : DIM}`,
          color: open ? CY : "rgba(180,200,220,0.7)",
          borderRadius: 4, padding: "3px 10px",
          fontSize: 10, letterSpacing: 1, fontFamily: "monospace",
          cursor: "pointer",
        }}
        title="Live World Incident Feed — F06"
      >
        ⚡ QUAKES{major > 0 ? ` (${major})` : ""}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position: "fixed", left: BTN_LEFT - 540, bottom: 50, zIndex: 70,
            width: MAP_W + 30, maxHeight: 560,
            background: SURF,
            border: `1px solid ${CY}`,
            borderRadius: 8,
            display: "flex", flexDirection: "column",
            fontFamily: "monospace",
            boxShadow: `0 0 24px rgba(41,231,255,0.12)`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 14px",
              borderBottom: `1px solid ${DIM}`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⚡ LIVE WORLD INCIDENT FEED
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {loading && <span style={{ color: AMBER, fontSize: 9 }}>UPDATING…</span>}
              {lastAt && <span style={{ color: DIM, fontSize: 9 }}>{lastAt} UTC</span>}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none",
                  color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1,
                }}
              >✕</button>
            </div>
          </div>

          {/* stat row */}
          <div
            style={{
              display: "flex", gap: 16, padding: "6px 14px",
              borderBottom: `1px solid ${DIM}`, flexShrink: 0,
            }}
          >
            {[
              { label: "TOTAL",    val: quakes.length,   c: CY },
              { label: "M5+",      val: quakes.filter((q) => (q.mag ?? 0) >= 5).length, c: AMBER },
              { label: "M7+",      val: quakes.filter((q) => (q.mag ?? 0) >= 7).length, c: RED },
            ].map(({ label, val, c }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ color: c, fontSize: 14, fontWeight: 700 }}>{val}</span>
                <span style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* error */}
          {err && (
            <div style={{ padding: "8px 14px", color: RED, fontSize: 10 }}>
              Error: {err}
            </div>
          )}

          {/* globe map */}
          <div style={{ padding: "10px 15px 4px", flexShrink: 0 }}>
            <WorldMap quakes={quakes} />
            <div style={{ color: DIM, fontSize: 8, marginTop: 3 }}>
              EQUIRECTANGULAR — hover pin for details · pins scale with magnitude
            </div>
          </div>

          {/* scrolling list */}
          <div
            style={{
              overflowY: "auto", flex: 1,
              minHeight: 100, maxHeight: 200,
            }}
          >
            {quakes.length === 0 && !loading && !err && (
              <div style={{ color: DIM, fontSize: 10, padding: "12px 14px" }}>
                No seismic data available.
              </div>
            )}
            {quakes.map((q, i) => <IncidentRow key={q.id ?? i} quake={q} />)}
          </div>

          {/* footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${DIM}`,
              color: DIM, fontSize: 8, letterSpacing: 1, flexShrink: 0,
            }}
          >
            SOURCE: USGS SIGNIFICANT EVENTS · REFRESHES EVERY 60 s
          </div>
        </div>
      )}
    </>
  );
}
