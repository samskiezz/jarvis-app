/**
 * GeoSeismicAnalyst — F78.
 *
 * Fetches /functions/getLiveIntel earthquake data, bins events into geographic
 * regions (5°×5° lat/lng grid cells → named macro-region labels), computes
 * per-region threat scores (avg magnitude, max depth, event count), and renders
 * a ranked region threat panel.
 *
 * Stat tiles: total quakes / regions active / avg magnitude / max magnitude
 * Region rows: colour-coded by threat score, sorted highest-first.
 * Click ▶ ANALYZE on any region → /v1/jarvis/agent/chat AI 2-sentence regional
 *   threat analysis + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "geo seismic" / "seismic regions" / "earthquake regions" /
 *         "regional seismic" / "quake regions" / "geos" / "seismic analysis"
 *   → jarvis:geo-seismic-toggle + TTS brief via buildGeoSeismicScript()
 *
 * Toggle: ◎ GEOS at left:6836, zIndex 65. Pulse on elevated threat.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const BTN_LEFT = 6836;
const REFRESH_MS = 5 * 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── geo helpers ─────────────────────────────────────────────────────────────

function latBand(lat) {
  if (lat > 60) return "Arctic";
  if (lat > 23) return "N Temperate";
  if (lat > 0) return "N Tropical";
  if (lat > -23) return "S Tropical";
  if (lat > -60) return "S Temperate";
  return "Antarctic";
}

function lngSector(lng) {
  if (lng < -120) return "W Pacific";
  if (lng < -60) return "Americas";
  if (lng < 0) return "W Atlantic";
  if (lng < 60) return "Europe/Africa";
  if (lng < 120) return "C Asia";
  return "E Pacific";
}

function regionName(lat, lng) {
  // Refined named regions for common seismic zones
  if (lat > 50 && lng > 130) return "Kamchatka";
  if (lat > 30 && lng > 130 && lng < 150) return "Japan";
  if (lat > 20 && lng > 120 && lng <= 130) return "Philippines";
  if (lat > 0 && lat <= 20 && lng > 90 && lng <= 110) return "Indonesia W";
  if (lat >= -10 && lat <= 10 && lng > 110 && lng <= 130) return "Indonesia E";
  if (lat > 60 && lng > -180 && lng < -140) return "Alaska";
  if (lat > 50 && lng < -130) return "NW Pacific USA";
  if (lat > 30 && lat <= 50 && lng < -100) return "Western USA";
  if (lat > 0 && lat <= 30 && lng < -80) return "C America";
  if (lat <= 0 && lng < -60) return "S America W";
  if (lat > 35 && lat <= 45 && lng > 25 && lng <= 45) return "Turkey/Caucasus";
  if (lat > 20 && lat <= 35 && lng > 55 && lng <= 75) return "Hindu Kush";
  if (lat > 25 && lat <= 40 && lng > 70 && lng <= 90) return "Himalayas";
  if (lat > 30 && lat <= 45 && lng > 95 && lng <= 115) return "Sichuan";
  if (lat > -45 && lat <= -35 && lng > -75 && lng <= -65) return "Chile";
  if (lat > 35 && lat <= 45 && lng > 10 && lng <= 30) return "Aegean";
  return `${latBand(lat)} / ${lngSector(lng)}`;
}

function threatenScore(events) {
  if (events.length === 0) return 0;
  const avgMag = events.reduce((s, e) => s + (e.magnitude || 0), 0) / events.length;
  const maxMag = Math.max(...events.map((e) => e.magnitude || 0));
  const count = events.length;
  // Weighted composite: count contribution (log-scaled) + avg mag + max mag bonus
  return Math.min(100, Math.round(
    Math.log1p(count) * 12 + avgMag * 6 + maxMag * 3
  ));
}

function normaliseQuakes(raw) {
  // getLiveIntel returns { seismic: [...] } or { earthquakes: [...] } or direct array
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.seismic)) arr = raw.seismic;
  else if (raw && Array.isArray(raw.earthquakes)) arr = raw.earthquakes;
  else if (raw && Array.isArray(raw.data)) arr = raw.data;
  else if (raw && typeof raw === "object") {
    // May have nested keys
    for (const key of Object.keys(raw)) {
      if (Array.isArray(raw[key]) && raw[key].length > 0 && raw[key][0].magnitude !== undefined) {
        arr = raw[key]; break;
      }
    }
  }
  return arr.map((q) => ({
    id: q.id || q.event_id || String(Math.random()),
    magnitude: parseFloat(q.magnitude || q.mag || q.ml || 0) || 0,
    depth: parseFloat(q.depth || q.depth_km || 0) || 0,
    lat: parseFloat(q.latitude || q.lat || 0) || 0,
    lng: parseFloat(q.longitude || q.lon || q.lng || 0) || 0,
    place: q.place || q.location || q.region || "",
    time: q.time || q.timestamp || q.occurred_at || null,
  }));
}

function clusterByRegion(quakes) {
  const map = {};
  for (const q of quakes) {
    const r = regionName(q.lat, q.lng);
    if (!map[r]) map[r] = [];
    map[r].push(q);
  }
  return Object.entries(map).map(([region, events]) => ({
    region,
    events,
    count: events.length,
    avgMag: events.reduce((s, e) => s + e.magnitude, 0) / events.length,
    maxMag: Math.max(...events.map((e) => e.magnitude)),
    avgDepth: events.reduce((s, e) => s + e.depth, 0) / events.length,
    score: threatenScore(events),
    latCenter: events.reduce((s, e) => s + e.lat, 0) / events.length,
    lngCenter: events.reduce((s, e) => s + e.lng, 0) / events.length,
  })).sort((a, b) => b.score - a.score);
}

function scoreColor(score) {
  if (score >= 75) return RED;
  if (score >= 50) return AMBER;
  if (score >= 25) return CY;
  return GREEN;
}

function scoreLabel(score) {
  if (score >= 75) return "ELEVATED";
  if (score >= 50) return "ACTIVE";
  if (score >= 25) return "MODERATE";
  return "QUIET";
}

function fmtMag(v) {
  return isNaN(v) ? "—" : v.toFixed(1);
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const GEO_SEISMIC_RE =
  /geo.{0,15}seismic|seismic.{0,15}(region|analy|zone|map|cluster)|earthquake.{0,15}region|regional.{0,15}(quake|seismic)|quake.{0,15}region|seismic\s*analy|geos\b/i;

export function isGeoSeismicQuery(q) {
  return GEO_SEISMIC_RE.test(q || "");
}

export async function buildGeoSeismicScript() {
  try {
    const raw = await fetch(`${apiBase()}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json());
    const quakes = normaliseQuakes(raw);
    const regions = clusterByRegion(quakes);
    const top = regions[0];
    const elevated = regions.filter((r) => r.score >= 75).length;
    if (quakes.length === 0)
      return "No seismic intelligence available at this time, sir. Opening the geo-seismic analyst panel.";
    return `Geo-seismic analysis complete, sir. ${quakes.length} event${quakes.length !== 1 ? "s" : ""} recorded across ${regions.length} active region${regions.length !== 1 ? "s" : ""}. ${top ? `Highest threat: ${top.region} with ${top.count} event${top.count !== 1 ? "s" : ""}, peak magnitude ${fmtMag(top.maxMag)}.` : ""} ${elevated > 0 ? `${elevated} region${elevated !== 1 ? "s" : ""} at elevated threat level.` : "No regions at elevated threat."} Opening the geo-seismic analyst panel now.`;
  } catch (_) {
    return "Geo-seismic analyst is standing by, sir. Opening the panel now.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function GeoSeismicAnalyst() {
  const [visible, setVisible] = useState(false);
  const [quakes, setQuakes] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [analyzing, setAnalyzing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const raw = await fetch(`${apiBase()}/functions/getLiveIntel`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json());
      const q = normaliseQuakes(raw);
      setQuakes(q);
      setRegions(clusterByRegion(q));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:geo-seismic-toggle", onToggle);
    return () => window.removeEventListener("jarvis:geo-seismic-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function analyze(region) {
    setAnalyzing(region.region);
    const q = region.events;
    const places = [...new Set(q.map((e) => e.place).filter(Boolean))].slice(0, 4).join("; ");
    const prompt = `As JARVIS, provide a concise 2-sentence seismic threat assessment for the region "${region.region}": ${region.count} event${region.count !== 1 ? "s" : ""}, average magnitude ${fmtMag(region.avgMag)}, peak magnitude ${fmtMag(region.maxMag)}, average depth ${Math.round(region.avgDepth)} km. ${places ? `Notable locations: ${places}.` : ""} What does this seismic activity indicate and what should be monitored?`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Seismic activity in this region warrants continued monitoring, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Seismic analysis unavailable at this time, sir." },
      }));
    }
    setAnalyzing(null);
  }

  const allRegions = regions;
  const elevatedRegions = regions.filter((r) => r.score >= 75);
  const activeRegions = regions.filter((r) => r.score >= 50 && r.score < 75);
  const quietRegions = regions.filter((r) => r.score < 50);

  const displayed =
    tab === "ELEVATED" ? elevatedRegions :
    tab === "ACTIVE"   ? activeRegions :
    tab === "QUIET"    ? quietRegions :
    allRegions;

  const avgMag = quakes.length
    ? quakes.reduce((s, e) => s + e.magnitude, 0) / quakes.length
    : 0;
  const maxMag = quakes.length
    ? Math.max(...quakes.map((e) => e.magnitude))
    : 0;

  const topRegion = regions[0];
  const elevated = elevatedRegions.length;
  const isElevated = elevated > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Geo-Seismic Intelligence Analyst (F78)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◎ GEOS
        {isElevated && (
          <span style={{
            marginLeft: 4,
            background: RED, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
            animation: "geos-pulse 1.4s ease-in-out infinite",
          }}>{elevated}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
          width: 580, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.94)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◎ GEO-SEISMIC ANALYST</span>
            {topRegion && !loading && (
              <span style={{ fontSize: 8, color: AMBER, marginLeft: 4 }}>
                TOP: {topRegion.region}
              </span>
            )}
            <button
              onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["QUAKES", quakes.length, CY],
              ["REGIONS", regions.length, AMBER],
              ["AVG MAG", fmtMag(avgMag), GREEN],
              ["MAX MAG", fmtMag(maxMag), maxMag >= 6 ? RED : maxMag >= 4 ? AMBER : CY],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[
              ["ALL", allRegions.length],
              ["ELEVATED", elevatedRegions.length],
              ["ACTIVE", activeRegions.length],
              ["QUIET", quietRegions.length],
            ].map(([t, count]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4, padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                  letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{t}{count > 0 && <span style={{ opacity: 0.6 }}> ({count})</span>}</button>
            ))}
          </div>

          {/* Region rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              clustering seismic intelligence by region…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              No seismic activity in this category, sir.
            </div>
          ) : (
            displayed.map((region) => {
              const col = scoreColor(region.score);
              const isOpen = expanded === region.region;
              const isAnalyzing = analyzing === region.region;

              return (
                <div
                  key={region.region}
                  onClick={() => setExpanded(isOpen ? null : region.region)}
                  style={{
                    background: `${col}06`,
                    border: `1px solid ${isOpen ? `${col}55` : `${col}22`}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Region header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: col,
                      boxShadow: region.score >= 75 ? `0 0 8px ${RED}` : "none",
                      animation: region.score >= 75 ? "geos-pulse 1.4s ease-in-out infinite" : "none",
                    }} />
                    <span style={{
                      fontSize: 7, color: col, border: `1px solid ${col}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                    }}>{scoreLabel(region.score)}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, lineHeight: 1.3, fontWeight: "bold" }}>
                      {region.region}
                    </span>
                    <span style={{ fontSize: 7, color: "#445566", whiteSpace: "nowrap" }}>
                      {region.count} event{region.count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Score bar + metrics */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{
                      flex: 1, height: 4, background: "#0a141e",
                      borderRadius: 2, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", width: `${region.score}%`,
                        background: col,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: col, minWidth: 24, textAlign: "right" }}>
                      {region.score}
                    </span>
                    <span style={{ fontSize: 7, color: "#556677" }}>
                      M{fmtMag(region.avgMag)} avg · M{fmtMag(region.maxMag)} max
                    </span>
                  </div>

                  {/* Avg depth + action */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455" }}>
                      depth ~{Math.round(region.avgDepth)} km avg
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); analyze(region); }}
                      disabled={isAnalyzing}
                      style={{
                        background: isAnalyzing ? "#1a2530" : `${col}18`,
                        color: isAnalyzing ? "#445566" : col,
                        border: `1px solid ${col}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: isAnalyzing ? "default" : "pointer",
                      }}
                    >{isAnalyzing ? "…analyzing" : "▶ ANALYZE"}</button>
                  </div>

                  {/* Expanded: event list */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${col}18` }}>
                      <div style={{ color: col, fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>
                        EVENTS IN REGION ({region.events.length})
                      </div>
                      {region.events
                        .sort((a, b) => b.magnitude - a.magnitude)
                        .slice(0, 8)
                        .map((ev) => {
                          const evCol = ev.magnitude >= 6 ? RED : ev.magnitude >= 4 ? AMBER : CY;
                          return (
                            <div key={ev.id} style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "3px 6px",
                              background: `${evCol}08`, border: `1px solid ${evCol}22`,
                              borderRadius: 3, marginBottom: 3,
                            }}>
                              <span style={{
                                fontSize: 9, fontWeight: "bold", color: evCol,
                                minWidth: 28, textAlign: "right",
                              }}>M{fmtMag(ev.magnitude)}</span>
                              <span style={{ fontSize: 8, color: "#80a0b0", flex: 1 }}>
                                {ev.place || `${ev.lat.toFixed(1)}°, ${ev.lng.toFixed(1)}°`}
                              </span>
                              <span style={{ fontSize: 7, color: "#445566", whiteSpace: "nowrap" }}>
                                {ev.depth > 0 ? `${Math.round(ev.depth)} km` : ""}
                              </span>
                            </div>
                          );
                        })}
                      {region.events.length > 8 && (
                        <div style={{ fontSize: 7, color: "#334455", textAlign: "center", padding: "2px 0" }}>
                          + {region.events.length - 8} more events
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /functions/getLiveIntel · geo-clustered by region · 5-min auto-refresh · ▶ ANALYZE for AI assessment
          </div>
        </div>
      )}

      <style>{`
        @keyframes geos-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
