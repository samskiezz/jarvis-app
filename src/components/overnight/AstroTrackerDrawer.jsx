/**
 * AstroTrackerDrawer — F90: Solar System Tracker
 * Right-edge slide-in drawer showing live planet ephemeris positions from
 * GET /v1/astro/planets. Polls every 10 minutes while open.
 *
 * Tab sits at 59 % from top (between MessagesInboxDrawer 57 % and
 * DecisionLedgerPanel 65 %).
 *
 * Each planet row shows: name, RA (h m s), Dec (° ' "), Earth distance (AU).
 * When astropy is unavailable the endpoint returns { available: false } and the
 * drawer shows a DEGRADED badge rather than crashing.
 *
 * Mounted in src/Layout.jsx after AssetDnaDrawer.
 *
 * Endpoints:
 *   GET /v1/astro/planets  → { available: bool, time: str,
 *                               planets: { [name]: { ra_deg, dec_deg,
 *                                                     earth_dist_au, ... } } }
 *   GET /v1/astro/stars    → { stars: { [name]: { ra_deg, dec_deg } } }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 600_000; // 10 min
const DRAWER_W = 320;
const ACCENT = "#38BDF8"; // sky-blue — distinct from other panels

// Convert decimal degrees → hours, minutes, seconds (for RA)
function degToHMS(deg) {
  const h = (((deg % 360) + 360) % 360) / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
}

// Convert decimal degrees → degrees, arcmin, arcsec (for Dec)
function degToDMS(deg) {
  const sign = deg < 0 ? "−" : "+";
  const abs = Math.abs(deg);
  const dd = Math.floor(abs);
  const mm = Math.floor((abs - dd) * 60);
  const ss = Math.round(((abs - dd) * 60 - mm) * 60);
  return `${sign}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}′ ${String(ss).padStart(2, "0")}″`;
}

// AU → millions of km (1 AU = 149.598 Mkm)
function auToMkm(au) {
  if (au == null || isNaN(au)) return null;
  return (au * 149.598).toFixed(1);
}

// Canonical planet order for display
const PLANET_ORDER = [
  "Mercury", "Venus", "Earth", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

function sortPlanets(planets) {
  const names = Object.keys(planets);
  const ordered = PLANET_ORDER.filter((n) => names.includes(n));
  const rest = names.filter((n) => !PLANET_ORDER.includes(n)).sort();
  return [...ordered, ...rest];
}

export default function AstroTrackerDrawer() {
  const [open, setOpen] = useState(false);
  const [planetData, setPlanetData] = useState(null);
  const [starData, setStarData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState("planets"); // "planets" | "stars"
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/astro/planets").catch(() => null),
      kimiClient.request("/v1/astro/stars").catch(() => null),
    ]).then(([planets, stars]) => {
      if (!alive) return;
      if (!planets && !stars) { setErr(true); return; }
      setErr(false);
      if (planets) setPlanetData(planets);
      if (stars) setStarData(stars);
    });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const available = planetData?.available !== false;
  const planets = planetData?.planets ?? {};
  const planetNames = sortPlanets(planets);
  const stars = starData?.stars ?? {};
  const starNames = Object.keys(stars).sort();

  return (
    <>
      {/* Toggle tab — right edge, 59 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close solar system tracker" : "Open solar system tracker (ASTRO)"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "59%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "ASTRO ▶" : "◀ ASTRO"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8999,
          background: "rgba(3,8,18,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderLeft: `1px solid ${ACCENT}44`,
          display: "flex",
          flexDirection: "column",
          fontFamily: S.mono,
          fontSize: S.fs.xs,
          transition: "right 0.2s ease",
          overflowY: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 8px",
            borderBottom: `1px solid ${ACCENT}33`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: ACCENT, letterSpacing: 2, fontWeight: 700 }}>
            SOLAR SYSTEM
          </span>
          {!available && planetData && (
            <span
              style={{
                background: "rgba(255,170,0,0.15)",
                color: "#FFAA00",
                border: "1px solid rgba(255,170,0,0.4)",
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              DEGRADED
            </span>
          )}
          {planetData?.time && (
            <span
              style={{
                marginLeft: "auto",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 0.5,
              }}
            >
              {planetData.time.slice(0, 16).replace("T", " ")}
            </span>
          )}
          <button
            onClick={() => bump()}
            title="Reload"
            style={{
              background: "transparent",
              border: `1px solid ${ACCENT}44`,
              borderRadius: 3,
              color: ACCENT,
              cursor: "pointer",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              padding: "1px 5px",
              fontFamily: "inherit",
              marginLeft: planetData?.time ? 0 : "auto",
            }}
          >
            ↺
          </button>
        </div>

        {/* Sub-tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${ACCENT}22`,
            flexShrink: 0,
          }}
        >
          {["planets", "stars"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                background: tab === t ? `${ACCENT}14` : "transparent",
                border: "none",
                borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: tab === t ? ACCENT : "#4E6070",
                fontFamily: S.mono,
                fontSize: S.fs.xxs,
                letterSpacing: 1.5,
                padding: "6px 0",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {t}
              {t === "planets" && planetNames.length > 0 && (
                <span
                  style={{
                    marginLeft: 5,
                    background: `${ACCENT}22`,
                    color: ACCENT,
                    borderRadius: 3,
                    padding: "0 4px",
                    fontSize: S.fs.xxs,
                  }}
                >
                  {planetNames.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {err && (
            <div
              style={{
                padding: "12px 14px",
                color: "#FF5555",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              ERROR — /v1/astro/* unreachable
            </div>
          )}

          {!err && !planetData && !starData && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          )}

          {/* PLANETS tab */}
          {!err && tab === "planets" && planetData && (
            <>
              {!available && (
                <div
                  style={{
                    padding: "10px 14px",
                    color: "#FFAA00",
                    fontSize: S.fs.xxs,
                    letterSpacing: 0.5,
                  }}
                >
                  astropy not installed — planet positions unavailable.
                  Install astropy on the backend to enable live ephemeris.
                </div>
              )}
              {available && planetNames.length === 0 && (
                <div
                  style={{
                    padding: "16px 14px",
                    color: "#4E6070",
                    fontSize: S.fs.xxs,
                    letterSpacing: 1,
                  }}
                >
                  NO PLANETS
                </div>
              )}
              {available && planetNames.map((name) => {
                const p = planets[name];
                const ra = p?.ra_deg != null ? degToHMS(p.ra_deg) : "—";
                const dec = p?.dec_deg != null ? degToDMS(p.dec_deg) : "—";
                const dist = p?.earth_dist_au != null
                  ? `${p.earth_dist_au.toFixed(3)} AU`
                  : "—";
                const mkm = p?.earth_dist_au != null
                  ? `${auToMkm(p.earth_dist_au)} Mkm`
                  : null;

                return (
                  <div
                    key={name}
                    style={{
                      padding: "9px 14px",
                      borderBottom: `1px solid ${ACCENT}11`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          color: "#C8DDE8",
                          fontSize: S.fs.xs,
                          fontWeight: 700,
                          flex: 1,
                          letterSpacing: 0.5,
                        }}
                      >
                        {name.toUpperCase()}
                      </span>
                      <span
                        style={{
                          color: ACCENT,
                          fontSize: S.fs.xxs,
                          letterSpacing: 0.5,
                        }}
                      >
                        {dist}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        color: "#4E6070",
                        fontSize: S.fs.xxs,
                        letterSpacing: 0.3,
                      }}
                    >
                      <span>RA {ra}</span>
                      <span>Dec {dec}</span>
                      {mkm && (
                        <span style={{ marginLeft: "auto", color: `${ACCENT}88` }}>
                          {mkm}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* STARS tab */}
          {!err && tab === "stars" && starData && (
            <>
              {starNames.length === 0 && (
                <div
                  style={{
                    padding: "16px 14px",
                    color: "#4E6070",
                    fontSize: S.fs.xxs,
                    letterSpacing: 1,
                  }}
                >
                  NO STARS
                </div>
              )}
              {starNames.map((name) => {
                const s = stars[name];
                const ra = s?.ra_deg != null ? degToHMS(s.ra_deg) : "—";
                const dec = s?.dec_deg != null ? degToDMS(s.dec_deg) : "—";

                return (
                  <div
                    key={name}
                    style={{
                      padding: "9px 14px",
                      borderBottom: `1px solid ${ACCENT}11`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        color: "#C8DDE8",
                        fontSize: S.fs.xs,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}
                    >
                      {name}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        color: "#4E6070",
                        fontSize: S.fs.xxs,
                        letterSpacing: 0.3,
                      }}
                    >
                      <span>RA {ra}</span>
                      <span>Dec {dec}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${ACCENT}22`,
            padding: "5px 14px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#2E4050", fontSize: S.fs.xxs, letterSpacing: 1 }}>
            GET /v1/astro/planets · /v1/astro/stars · 10 min poll
          </span>
        </div>
      </div>
    </>
  );
}
