/**
 * NeoScreenDrawer — F108 Near-Earth Object orbital screen.
 * Wires to GET /v1/astro/neo?a=&e= (real Keplerian MOID + orbit propagation).
 * Right-edge slide-in at 55% vertical. Red accent — hazard detection theme.
 * Additive only; mounted in Layout.jsx after InfSwarmAgentsDrawer.
 */
import { useState, useCallback } from "react";

const ACC = "#EF4444";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";

const PRESETS = [
  { label: "Aten",   a: 0.92, e: 0.18, desc: "Interior orbit, crosses Earth's path" },
  { label: "Apollo", a: 1.47, e: 0.56, desc: "Classic Earth-crossing class" },
  { label: "Amor",   a: 1.25, e: 0.15, desc: "Grazes Earth from outside" },
  { label: "Atira",  a: 0.74, e: 0.32, desc: "Purely interior orbit (Apohele)" },
];

export default function NeoScreenDrawer() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(1); // Apollo default
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async (idx) => {
    if (cache[idx]) return;
    const p = PRESETS[idx];
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/v1/astro/neo?a=${p.a}&e=${p.e}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCache((prev) => ({ ...prev, [idx]: data }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [cache]);

  const pick = (idx) => {
    setSel(idx);
    load(idx);
  };

  const handleOpen = () => {
    setOpen(true);
    load(sel);
  };

  const result = cache[sel];
  const orbit = result?.orbit || {};
  const approach = result?.approach || {};
  const hazardous = approach.hazardous;

  return (
    <>
      {/* Tab button */}
      <div
        onClick={() => (open ? setOpen(false) : handleOpen())}
        style={{
          position: "fixed",
          right: open ? 300 : 0,
          top: "55%",
          zIndex: 200,
          background: hazardous ? `${ACC}22` : "#0a0c10",
          border: `1px solid ${hazardous ? ACC : ACC}55`,
          borderRight: "none",
          color: ACC,
          padding: "6px 4px",
          cursor: "pointer",
          fontSize: 10,
          fontFamily: "monospace",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          userSelect: "none",
          letterSpacing: 1,
          transition: "right 0.2s",
        }}
      >
        ◉ NEO
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            bottom: 0,
            width: 300,
            zIndex: 199,
            background: "rgba(8,10,14,0.97)",
            borderLeft: `1px solid ${ACC}44`,
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${ACC}33`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: ACC, fontSize: 11, letterSpacing: 2, flex: 1 }}>
              ◉ NEO SCREEN
            </span>
            {hazardous && (
              <span
                style={{
                  background: `${ACC}33`,
                  color: ACC,
                  fontSize: 9,
                  padding: "2px 6px",
                  borderRadius: 4,
                  letterSpacing: 1,
                }}
              >
                PHA
              </span>
            )}
            <span
              onClick={() => setOpen(false)}
              style={{ color: "#4E6070", cursor: "pointer", fontSize: 14 }}
            >
              ×
            </span>
          </div>

          {/* Preset tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${ACC}22`,
              flexShrink: 0,
            }}
          >
            {PRESETS.map((p, i) => (
              <div
                key={p.label}
                onClick={() => pick(i)}
                style={{
                  flex: 1,
                  padding: "6px 4px",
                  background: i === sel ? `${ACC}18` : "transparent",
                  borderBottom: i === sel ? `2px solid ${ACC}` : "2px solid transparent",
                  color: i === sel ? "#DCEBF5" : "#4E6070",
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {p.label}
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 10 }}>
              {PRESETS[sel].desc} · a={PRESETS[sel].a} AU · e={PRESETS[sel].e}
            </div>

            {loading && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: 20 }}>
                COMPUTING ORBIT…
              </div>
            )}
            {err && (
              <div style={{ color: ACC, fontSize: 10, padding: "8px 0" }}>⚠ {err}</div>
            )}

            {orbit.semi_major_axis_au !== undefined && (
              <>
                <Row label="ORBITAL ELEMENTS" header />
                <Row label="Semi-major axis" value={`${orbit.semi_major_axis_au} AU`} />
                <Row label="Eccentricity" value={orbit.eccentricity} />
                <Row label="Perihelion" value={`${orbit.perihelion_au} AU`} />
                <Row label="Aphelion" value={`${orbit.aphelion_au} AU`} />
                <Row label="Period" value={`${orbit.period_years} yr`} />

                <StatusBadge
                  ok={!orbit.earth_crossing}
                  msgOk="✓ NON-CROSSING ORBIT"
                  msgWarn="⚠ EARTH-CROSSING ORBIT"
                />

                <Row label="MOID ASSESSMENT" header mt />
                <Row label="Min orbit dist." value={`${approach.min_orbit_intersection_au} AU`} />
                <Row label="Lunar distances" value={`${approach.lunar_distances} LD`} />
                <Row label="PHA threshold" value="< 0.05 AU / 19.5 LD" dim />

                <StatusBadge
                  ok={!hazardous}
                  msgOk="✓ NON-HAZARDOUS"
                  msgWarn="⚠ POTENTIALLY HAZARDOUS"
                />
              </>
            )}

            {!loading && !err && orbit.semi_major_axis_au === undefined && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: 20 }}>
                Select a class above to screen
              </div>
            )}
          </div>

          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${ACC}22`,
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            Keplerian two-body MOID · GET /v1/astro/neo
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, header, dim, mt }) {
  if (header) {
    return (
      <div
        style={{
          color: "#7A95AB",
          fontSize: 9,
          letterSpacing: 1.5,
          margin: `${mt ? 10 : 0}px 0 6px`,
        }}
      >
        {label}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ color: "#4E6070", fontSize: 10 }}>{label}</span>
      <span style={{ color: dim ? "#4E6070" : "#DCEBF5", fontSize: 10 }}>{value}</span>
    </div>
  );
}

function StatusBadge({ ok, msgOk, msgWarn }) {
  const color = ok ? GREEN : ACC;
  return (
    <div
      style={{
        margin: "8px 0",
        padding: "6px 8px",
        background: `${color}15`,
        borderRadius: 4,
        border: `1px solid ${color}33`,
      }}
    >
      <span style={{ color, fontSize: 9, letterSpacing: 1 }}>{ok ? msgOk : msgWarn}</span>
    </div>
  );
}
