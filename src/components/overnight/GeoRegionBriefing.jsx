/**
 * GeoRegionBriefing — F154
 * Right-edge slide-in at 48 % from top.
 * POST /functions/getLiveIntel → groups earthquakes by geographic region.
 * Shows region name | quake count | max-magnitude badge | most-recent location.
 * Click a row → expands to show all quakes in that region (loc + mag + age).
 * Polls every 3 minutes while open. Rose (#FB7185) accent.
 *
 * Mount point: src/Layout.jsx, after <LiveIntelPulseDrawer />.
 */
import { useEffect, useRef, useState } from "react";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 330;
const ACC = "#FB7185";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const REGION_MAP = [
  [/alaska|aleutian/i,                          "ALASKA"],
  [/japan|honshu|kyushu|shikoku|hokkaido/i,     "JAPAN"],
  [/indonesia|sumatra|java|sulawesi|molucca/i,  "INDONESIA"],
  [/tonga|fiji|vanuatu|samoa|kermadec/i,        "SW PACIFIC"],
  [/new zealand/i,                              "NEW ZEALAND"],
  [/solomon|papua new guinea/i,                 "SOLOMON IS."],
  [/philippines|mindanao|luzon/i,               "PHILIPPINES"],
  [/chile|peru|bolivia|argentina/i,             "S. AMERICA"],
  [/central america|mexico|guatemala|costa rica|el salvador|nicaragua/i, "C. AMERICA"],
  [/california|nevada|oregon|washington state/i, "W. N. AMERICA"],
  [/turkey|greece|aegean|mediterranean|italy/i, "MEDITERRANEAN"],
  [/iran|afghanistan|pakistan|tajikistan/i,     "C. ASIA"],
  [/nepal|india|tibet|china|myanmar/i,          "S. ASIA"],
  [/russia|kamchatka|sakhalin/i,                "RUSSIA"],
  [/hawaii/i,                                   "HAWAII"],
  [/mid-atlantic|atlantic/i,                    "ATLANTIC"],
  [/indian ocean/i,                             "INDIAN OCEAN"],
  [/pacific/i,                                  "PACIFIC"],
];

function classifyRegion(location) {
  if (!location) return "OTHER";
  for (const [re, label] of REGION_MAP) {
    if (re.test(location)) return label;
  }
  return "OTHER";
}

function magColor(mag) {
  const m = Number(mag);
  if (m >= 6.0) return "#FF2200";
  if (m >= 5.0) return "#FF8800";
  if (m >= 4.5) return "#FFCC00";
  return "#88FF88";
}

function relAge(ts) {
  if (!ts) return "—";
  const epoch = typeof ts === "number" ? ts : Date.parse(ts);
  if (isNaN(epoch)) return "—";
  const sec = Math.floor((Date.now() - epoch) / 1000);
  if (sec < 60) return `${Math.max(0, sec)}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

function toQuakes(d) {
  return Array.isArray(d?.earthquakes) ? d.earthquakes
    : Array.isArray(d?.quakes) ? d.quakes
    : Array.isArray(d?.seismic) ? d.seismic
    : [];
}

function buildRegions(quakes) {
  const map = new Map();
  for (const q of quakes) {
    const loc = q.location ?? q.place ?? q.loc ?? "";
    const region = classifyRegion(loc);
    if (!map.has(region)) map.set(region, { region, quakes: [] });
    map.get(region).quakes.push(q);
  }
  return [...map.values()].map((r) => {
    const mags = r.quakes.map((q) => Number(q.mag ?? q.magnitude ?? 0)).filter(Number.isFinite);
    const maxMag = mags.length ? Math.max(...mags) : 0;
    const latest = r.quakes.reduce((best, q) => {
      const ts = q.time ?? q.ts ?? q.timestamp ?? 0;
      const t = typeof ts === "number" ? ts : Date.parse(ts) || 0;
      return t > (best.t || 0) ? { q, t } : best;
    }, {});
    return {
      region: r.region,
      count: r.quakes.length,
      maxMag,
      latestLoc: latest.q?.location ?? latest.q?.place ?? latest.q?.loc ?? "—",
      latestTs: latest.q?.time ?? latest.q?.ts ?? null,
      quakes: r.quakes
        .map((q) => ({ ...q, _mag: Number(q.mag ?? q.magnitude ?? 0), _ts: q.time ?? q.ts ?? null }))
        .sort((a, b) => b._mag - a._mag),
    };
  }).sort((a, b) => b.maxMag - a.maxMag);
}

export default function GeoRegionBriefing() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const load = () => {
      setLoading(true);
      kimiClient.functions
        .getLiveIntel({ type: "all" })
        .then((d) => {
          if (!alive) return;
          setData(d);
          setErr(false);
        })
        .catch(() => { if (alive) setErr(true); })
        .finally(() => { if (alive) setLoading(false); });
    };

    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timerRef.current);
    };
  }, [open]);

  const quakes = toQuakes(data);
  const regions = buildRegions(quakes);
  const topRegion = regions[0];

  const tabStyle = {
    position: "fixed",
    right: open ? DRAWER_W : 0,
    top: "48%",
    transform: "translateY(-50%) rotate(180deg)",
    zIndex: 1200,
    writingMode: "vertical-rl",
    cursor: "pointer",
    padding: "10px 5px",
    background: open ? ACC : "rgba(5,9,16,0.85)",
    color: open ? "#04060A" : ACC,
    border: `1px solid ${ACC}55`,
    borderRight: "none",
    borderRadius: "6px 0 0 6px",
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 2,
    userSelect: "none",
    transition: "right 0.25s ease, background 0.15s",
  };

  const drawerStyle = {
    position: "fixed",
    right: open ? 0 : -DRAWER_W,
    top: 0,
    height: "100vh",
    width: DRAWER_W,
    zIndex: 1199,
    background: "rgba(5,9,16,0.97)",
    borderLeft: `1px solid ${ACC}44`,
    display: "flex",
    flexDirection: "column",
    fontFamily: MONO,
    transition: "right 0.25s ease",
    overflowY: "auto",
  };

  const pill = (txt, color) => (
    <span style={{
      background: `${color}22`, border: `1px solid ${color}66`,
      borderRadius: 4, padding: "1px 6px", fontSize: 9, color, letterSpacing: 1,
    }}>{txt}</span>
  );

  return (
    <>
      <div style={tabStyle} onClick={() => { setOpen((o) => !o); setExpanded(null); }}>
        GEO INTEL
      </div>

      <div style={drawerStyle}>
        {/* Header */}
        <div style={{
          padding: "14px 14px 10px",
          borderBottom: `1px solid ${ACC}33`,
          flexShrink: 0,
        }}>
          <div style={{ color: ACC, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ GEO-REGION INTEL
          </div>
          {topRegion && !err && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#7A9BA5", letterSpacing: 1 }}>
              MOST ACTIVE:&nbsp;
              <span style={{ color: magColor(topRegion.maxMag), fontWeight: 700 }}>
                {topRegion.region}
              </span>
              &nbsp;M{topRegion.maxMag.toFixed(1)}
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 9, color: "#3A5060", letterSpacing: 1 }}>
            {loading ? "POLLING…" : err ? "FETCH ERROR" : `${quakes.length} EVENTS · ${regions.length} REGIONS`}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err && (
            <div style={{ padding: "16px 14px", color: "#F87171", fontSize: 11, letterSpacing: 1 }}>
              ✗ FETCH ERROR — /functions/getLiveIntel
            </div>
          )}
          {!err && !data && !loading && (
            <div style={{ padding: "16px 14px", color: "#3A5060", fontSize: 11, letterSpacing: 1 }}>
              OPENING FEED…
            </div>
          )}
          {!err && regions.length === 0 && data && (
            <div style={{ padding: "16px 14px", color: "#3A5060", fontSize: 11, letterSpacing: 1 }}>
              NO SEISMIC EVENTS RETURNED
            </div>
          )}
          {regions.map((r) => {
            const isExpanded = expanded === r.region;
            return (
              <div key={r.region}>
                {/* Region row */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : r.region)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 14px",
                    cursor: "pointer",
                    borderLeft: isExpanded ? `2px solid ${ACC}` : "2px solid transparent",
                    background: isExpanded ? `${ACC}0D` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Magnitude badge */}
                  <span style={{
                    minWidth: 36, textAlign: "center",
                    background: `${magColor(r.maxMag)}22`,
                    border: `1px solid ${magColor(r.maxMag)}66`,
                    borderRadius: 3, padding: "1px 4px",
                    color: magColor(r.maxMag), fontSize: 9,
                    fontWeight: 700, letterSpacing: 1, flexShrink: 0,
                  }}>
                    M{r.maxMag.toFixed(1)}
                  </span>

                  {/* Region label */}
                  <span style={{
                    color: isExpanded ? ACC : "#A8BFC8",
                    fontSize: 10, letterSpacing: 1, flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {r.region}
                  </span>

                  {/* Count */}
                  <span style={{
                    color: "#3A5060", fontSize: 9, letterSpacing: 1, flexShrink: 0,
                  }}>
                    ×{r.count}
                  </span>

                  {/* Expand indicator */}
                  <span style={{ color: ACC, fontSize: 9, opacity: 0.6 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {/* Location excerpt when collapsed */}
                {!isExpanded && (
                  <div style={{
                    padding: "0 14px 5px 60px",
                    color: "#3A5060", fontSize: 9, letterSpacing: 0.5,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {r.latestLoc} · {relAge(r.latestTs)}
                  </div>
                )}

                {/* Expanded quake list */}
                {isExpanded && (
                  <div style={{
                    background: "rgba(251,113,133,0.04)",
                    borderTop: `1px solid ${ACC}22`,
                    borderBottom: `1px solid ${ACC}22`,
                    padding: "6px 0",
                  }}>
                    {r.quakes.map((q, i) => {
                      const loc = q.location ?? q.place ?? q.loc ?? "—";
                      const mag = q._mag;
                      const ts = q._ts;
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "4px 14px 4px 20px",
                        }}>
                          <span style={{
                            color: magColor(mag), fontSize: 9, fontWeight: 700,
                            minWidth: 30, flexShrink: 0,
                          }}>
                            M{mag.toFixed(1)}
                          </span>
                          <span style={{
                            color: "#7A9BA5", fontSize: 9, flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {loc}
                          </span>
                          <span style={{ color: "#3A5060", fontSize: 9, flexShrink: 0 }}>
                            {relAge(ts)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "7px 14px",
          borderTop: `1px solid ${ACC}22`,
          color: "#2E4050", fontSize: 9, letterSpacing: 1, flexShrink: 0,
        }}>
          POST /functions/getLiveIntel · 3-min poll
        </div>
      </div>
    </>
  );
}
