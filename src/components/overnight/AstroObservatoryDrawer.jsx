/**
 * AstroObservatoryDrawer — left-edge slide-in drawer showing live celestial
 * positions (planets) and the bright-star J2000 catalogue.
 *
 * Tab sits at 80 % from top, between RemindersPanel (75 %) and
 * ForgeApprovalsPanel (83 %).
 * Polls GET /v1/astro/planets every 5 min while open.
 * Fetches GET /v1/astro/stars once per open (catalogue is static J2000).
 *
 * Endpoints:
 *   GET /v1/astro/planets
 *   → { available: bool, time: string, planets: { [name]: { ra_deg, dec_deg, distance_au } } }
 *
 *   GET /v1/astro/stars
 *   → { stars: { [name]: { ra_deg, dec_deg } } }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const ACCENT = "#C084FC";

const PLANET_ORDER = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune",
];

function fmtRa(deg) {
  const h = Math.floor(deg / 15);
  const m = Math.floor(((deg / 15) - h) * 60);
  const s = Math.round((((deg / 15) - h) * 60 - m) * 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function fmtDec(deg) {
  const sign = deg < 0 ? "-" : "+";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60);
  return `${sign}${String(d).padStart(2, "0")}° ${String(m).padStart(2, "0")}' ${String(s).padStart(2, "0")}"`;
}

function PlanetRow({ name, data }) {
  const labelColor = name === "sun" ? "#FBBF24"
    : name === "moon" ? "#94A3B8"
    : ACCENT;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 80px",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderBottom: `1px solid ${S.border}`,
      }}
    >
      <span
        style={{
          fontSize: S.fs.xxs,
          color: labelColor,
          letterSpacing: 1,
          fontFamily: S.mono,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {name}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: S.fs.xxs, color: S.textHi, fontFamily: S.mono, letterSpacing: 0.5 }}>
          {fmtRa(data.ra_deg)}
        </span>
        <span style={{ fontSize: S.fs.xxs, color: S.text, fontFamily: S.mono, letterSpacing: 0.5 }}>
          {fmtDec(data.dec_deg)}
        </span>
      </div>
      <span
        style={{
          fontSize: S.fs.xxs,
          color: `${ACCENT}CC`,
          fontFamily: S.mono,
          letterSpacing: 0.5,
          textAlign: "right",
        }}
      >
        {data.distance_au < 0.01
          ? `${(data.distance_au * 149597870.7).toFixed(0)} km`
          : `${data.distance_au} AU`}
      </span>
    </div>
  );
}

function StarRow({ name, data }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr",
        alignItems: "center",
        gap: 6,
        padding: "4px 14px",
        borderBottom: `1px solid ${S.border}22`,
      }}
    >
      <span
        style={{
          fontSize: S.fs.xxs,
          color: "#FBBF2488",
          letterSpacing: 1,
          fontFamily: S.mono,
          textTransform: "uppercase",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontSize: S.fs.xxs,
          color: S.text,
          fontFamily: S.mono,
          letterSpacing: 0.3,
        }}
      >
        {fmtRa(data.ra_deg)} {fmtDec(data.dec_deg)}
      </span>
    </div>
  );
}

export default function AstroObservatoryDrawer() {
  const [open, setOpen] = useState(false);
  const [planets, setPlanets] = useState(null);
  const [stars, setStars] = useState(null);
  const [available, setAvailable] = useState(true);
  const [err, setErr] = useState(false);
  const [starsOpen, setStarsOpen] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const starsFetched = useRef(false);

  // Poll planets every 5 min while open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/astro/planets")
      .then((d) => {
        if (!alive) return;
        setAvailable(d.available !== false);
        setPlanets(d.planets || {});
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    const timer = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, tick]);

  // Fetch stars once per open session
  useEffect(() => {
    if (!open || starsFetched.current) return;
    starsFetched.current = true;
    kimiClient
      .request("/v1/astro/stars")
      .then((d) => setStars(d.stars || {}))
      .catch(() => {});
  }, [open]);

  const sortedPlanets = planets
    ? PLANET_ORDER.filter((n) => planets[n]).map((n) => ({ name: n, data: planets[n] }))
    : [];

  return (
    <>
      {/* Toggle tab — left edge, 80 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close astro observatory" : "Open astro observatory"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "80%",
          transform: "translateY(0)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "ASTRO ▶" : "✦ ASTRO ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8996,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            ✦ ASTRO OBSERVATORY
          </span>
          {!available && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: "#FBBF24",
                letterSpacing: 1,
                background: "#FBBF2422",
                border: "1px solid #FBBF2444",
                borderRadius: 3,
                padding: "1px 6px",
              }}
            >
              DEGRADED
            </span>
          )}
        </div>

        {/* Column headers */}
        {planets && sortedPlanets.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 80px",
              gap: 6,
              padding: "4px 14px",
              borderBottom: `1px solid ${S.border}`,
              flexShrink: 0,
            }}
          >
            {["BODY", "RA · DEC (J2000)", "DIST"].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: S.fs.xxs,
                  color: `${ACCENT}88`,
                  letterSpacing: 1,
                  fontFamily: S.mono,
                  textAlign: h === "DIST" ? "right" : "left",
                }}
              >
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: ACCENT, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !planets ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : sortedPlanets.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO PLANET DATA
            </div>
          ) : (
            <>
              {sortedPlanets.map(({ name, data }) => (
                <PlanetRow key={name} name={name} data={data} />
              ))}

              {/* Stars section */}
              {stars && (
                <>
                  <button
                    onClick={() => setStarsOpen((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 14px",
                      width: "100%",
                      background: `${ACCENT}08`,
                      border: "none",
                      borderTop: `1px solid ${S.border}`,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: S.fs.xxs, color: "#FBBF2488", letterSpacing: 1, fontFamily: S.mono, flex: 1 }}>
                      ★ BRIGHT STARS (J2000)
                    </span>
                    <span style={{ fontSize: S.fs.xxs, color: S.text, fontFamily: S.mono }}>
                      {starsOpen ? "▲" : "▼"}
                    </span>
                  </button>
                  {starsOpen &&
                    Object.entries(stars).map(([name, data]) => (
                      <StarRow key={name} name={name} data={data} />
                    ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {err
            ? "ERR"
            : !planets
            ? "…"
            : available
            ? "LIVE · 5 MIN POLL · ASTROPY"
            : "DEGRADED · ASTROPY MISSING · 5 MIN POLL"}
        </div>
      </div>
    </>
  );
}
