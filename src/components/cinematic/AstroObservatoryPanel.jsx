/**
 * AstroObservatoryPanel — F263.
 *
 * Data sources (real — confirmed endpoints):
 *   GET /v1/astro/planets[?when=]
 *       → { available, time, planets: { <name>: { ra, dec, distance_au, ... } } }
 *   GET /v1/astro/stars
 *       → { stars: { <name>: { ra, dec, mag, ... } } }
 *   GET /v1/astro/neo[?a=&e=]
 *       → { orbit: { a, e, period_yr, q, Q, v_peri, v_apo },
 *           approach: { moid_au, v_inf_km_s, t_close_days, risk } }
 *   POST /v1/jarvis/agent/chat { message }
 *       → { answer }
 *
 * Logic:
 *   Polls planet ephemeris every 5 min; fetches star catalogue on mount;
 *   lazy-fetches NEO screening on tab switch. Surfaces live RA/Dec/AU data
 *   for the solar system, bright-star catalogue, and meteoroid close-approach.
 *
 * Displays:
 *   - Stat tiles: planets / stars / NEO MOID (AU) / availability
 *   - PLANETS | STARS | NEO tab switcher
 *   - PLANETS: list with name, RA, Dec, distance-AU bar
 *   - STARS: catalogue with name, J2000 RA/Dec, magnitude
 *   - NEO: orbit parameters + close-approach MOID + risk chip
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence astro brief + TTS
 *
 * Toggle: ◉ AOBS at left:224160, bottom:8, zIndex:142.
 * Badge: green = live (astropy OK), amber = degraded (astropy missing).
 * 300 s auto-refresh (planets).
 *
 * Exported helpers for JarvisBrain:
 *   isAobsQuery(q) / buildAobsScript()
 *
 * Voice triggers: "astro / planets / solar system / star catalog / neo /
 *   meteoroid / planet positions / where are the planets / aobs / space /
 *   orbit / astronomy / near earth object / planet tracker"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 224160;
const REFRESH_MS = 300_000; // 5 min — planet ephemeris changes slowly
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const AOBS_RE =
  /\b(astro|planets?|solar system|star cata|near.?earth|neo|meteoroid|planet positions?|where are the planets|aobs|orbit tracker|astronomy|planet tracker|bright stars?|planet ephemeris|space monitor|sky monitor)\b/i;

export function isAobsQuery(t) {
  return AOBS_RE.test(t || "");
}

export async function buildAobsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/astro/planets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    if (!d.available) {
      return `Astro engine is in degraded mode (reason: ${d.reason || "astropy unavailable"}).` +
        " Planet ephemeris unavailable; star catalogue and NEO screening remain operational.";
    }
    const names = Object.keys(d.planets || {});
    if (names.length === 0) {
      return "Planet ephemeris returned no data at this time. Check vLLM and astropy installation.";
    }
    const closest = names.reduce((a, b) =>
      (d.planets[a]?.distance_au ?? 999) < (d.planets[b]?.distance_au ?? 999) ? a : b
    );
    const au = (d.planets[closest]?.distance_au ?? 0).toFixed(3);
    return (
      `Astro Observatory live: ${names.length} planet positions tracked at ${d.time || "UTC now"}.` +
      ` Closest body: ${closest} at ${au} AU.`
    );
  } catch {
    return "Unable to reach the astro endpoints at this time.";
  }
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPlanets() {
  const r = await fetch(`${apiBase()}/v1/astro/planets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`planets HTTP ${r.status}`);
  return r.json();
}

async function fetchStars() {
  const r = await fetch(`${apiBase()}/v1/astro/stars`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`stars HTTP ${r.status}`);
  return r.json();
}

async function fetchNeo(a = 1.5, e = 0.4) {
  const r = await fetch(
    `${apiBase()}/v1/astro/neo?a=${a}&e=${e}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`neo HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(available, planetCount, neoMoid) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess solar system status in 2 sentences: ` +
        (available
          ? `${planetCount} planet positions tracked via real ephemeris.`
          : "Planet ephemeris unavailable (astropy missing).") +
        (neoMoid != null ? ` Default NEO MOID: ${neoMoid} AU.` : ""),
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function fmt(v, digits = 3) {
  if (v == null) return "—";
  return typeof v === "number" ? v.toFixed(digits) : String(v);
}

function riskColor(risk) {
  const r = (risk || "").toLowerCase();
  if (r === "high")   return RED;
  if (r === "medium" || r === "mod") return AM;
  if (r === "low")    return GN;
  return DIM;
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 56, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function AuBar({ au, maxAu = 30 }) {
  const pct = Math.min(100, ((au || 0) / maxAu) * 100);
  return (
    <div style={{ height: 3, background: `${CY}22`, borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: CY, borderRadius: 2 }} />
    </div>
  );
}

function PlanetList({ planets }) {
  const entries = Object.entries(planets || {}).sort(
    (a, b) => (a[1].distance_au ?? 999) - (b[1].distance_au ?? 999)
  );
  if (entries.length === 0) {
    return <div style={{ fontSize: 8, color: DIM, padding: "10px 12px", textAlign: "center" }}>No planet data.</div>;
  }
  return (
    <div>
      {entries.map(([name, p]) => (
        <div key={name} style={{ padding: "7px 12px", borderBottom: `1px solid ${CY}11` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 8, color: AM, width: 70, flexShrink: 0, fontWeight: 700, letterSpacing: 1 }}>
              {name.toUpperCase()}
            </span>
            <span style={{ fontSize: 7, color: CY, width: 64, flexShrink: 0 }}>
              {fmt(p.distance_au)} AU
            </span>
            <span style={{ fontSize: 7, color: DIM, flex: 1 }}>
              RA {fmt(p.ra, 2)}° Dec {fmt(p.dec, 2)}°
            </span>
          </div>
          <AuBar au={p.distance_au} maxAu={32} />
        </div>
      ))}
    </div>
  );
}

function StarList({ stars }) {
  const entries = Object.entries(stars || {}).sort((a, b) =>
    (a[1].mag ?? 99) - (b[1].mag ?? 99)
  );
  if (entries.length === 0) {
    return <div style={{ fontSize: 8, color: DIM, padding: "10px 12px", textAlign: "center" }}>No star data.</div>;
  }
  return (
    <div>
      {entries.map(([name, s]) => (
        <div key={name} style={{
          padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 8, color: PUR, width: 80, flexShrink: 0, fontWeight: 700 }}>
            {name}
          </span>
          <span style={{ fontSize: 7, color: DIM, flex: 1 }}>
            RA {fmt(s.ra, 2)}° Dec {fmt(s.dec, 2)}°
          </span>
          {s.mag != null && (
            <span style={{ fontSize: 7, color: AM, flexShrink: 0 }}>
              m {fmt(s.mag, 2)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function NeoPanel({ neo, loading }) {
  if (loading) {
    return <div style={{ fontSize: 8, color: DIM, padding: "12px", textAlign: "center" }}>Loading NEO…</div>;
  }
  if (!neo) {
    return <div style={{ fontSize: 8, color: DIM, padding: "12px", textAlign: "center" }}>NEO data unavailable.</div>;
  }
  const { orbit = {}, approach = {} } = neo;
  const risk = approach.risk || "unknown";
  const rc = riskColor(risk);

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 2 }}>
        DEFAULT ORBIT PARAMS: a=1.5 AU, e=0.4
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7, color: DIM, marginBottom: 4, letterSpacing: 1 }}>ORBIT</div>
          {[
            ["Semi-major axis",   `${fmt(orbit.a)} AU`],
            ["Eccentricity",      fmt(orbit.e, 3)],
            ["Period",            `${fmt(orbit.period_yr, 2)} yr`],
            ["Perihelion (q)",    `${fmt(orbit.q)} AU`],
            ["Aphelion (Q)",      `${fmt(orbit.Q)} AU`],
            ["v at peri",         `${fmt(orbit.v_peri, 1)} km/s`],
            ["v at apo",          `${fmt(orbit.v_apo, 1)} km/s`],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 7, color: DIM }}>{label}</span>
              <span style={{ fontSize: 7, color: CY }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7, color: DIM, marginBottom: 4, letterSpacing: 1 }}>CLOSE APPROACH</div>
          {[
            ["MOID",      `${fmt(approach.moid_au, 4)} AU`],
            ["v∞",        `${fmt(approach.v_inf_km_s, 1)} km/s`],
            ["t_close",   `${fmt(approach.t_close_days, 1)} d`],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 7, color: DIM }}>{label}</span>
              <span style={{ fontSize: 7, color: CY }}>{val}</span>
            </div>
          ))}

          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 7, color: DIM }}>Risk level</span>
            <div style={{
              marginTop: 4, fontSize: 8, padding: "2px 8px", borderRadius: 4,
              border: `1px solid ${rc}55`, color: rc, display: "inline-block",
              letterSpacing: 1, fontWeight: 700,
            }}>
              {risk.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function AstroObservatoryPanel() {
  const [open,       setOpen]       = useState(false);
  const [planets,    setPlanets]    = useState({});
  const [available,  setAvailable]  = useState(null);
  const [epochTime,  setEpochTime]  = useState(null);
  const [stars,      setStars]      = useState({});
  const [neo,        setNeo]        = useState(null);
  const [tab,        setTab]        = useState("PLANETS");
  const [loading,    setLoading]    = useState(false);
  const [neoLoading, setNeoLoading] = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);

  const intervalRef = useRef(null);
  const neoFetched  = useRef(false);

  const loadPlanets = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchPlanets();
      setAvailable(d.available ?? false);
      setPlanets(d.planets || {});
      setEpochTime(d.time || null);
    } catch (_) {
      setAvailable(false);
    }
    setLoading(false);
  }, []);

  const loadStars = useCallback(async () => {
    try {
      const d = await fetchStars();
      setStars(d.stars || {});
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadPlanets();
    loadStars();
    intervalRef.current = setInterval(loadPlanets, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [loadPlanets, loadStars]);

  useEffect(() => {
    if (tab === "NEO" && !neoFetched.current) {
      neoFetched.current = true;
      setNeoLoading(true);
      fetchNeo().then((d) => setNeo(d)).catch(() => setNeo(null)).finally(() => setNeoLoading(false));
    }
  }, [tab]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (AOBS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:aobs-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:aobs-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const neoMoid = neo?.approach?.moid_au ?? null;
      const brief = await agentAssess(!!available, Object.keys(planets).length, neoMoid);
      setDossier(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const planetCount = Object.keys(planets).length;
  const starCount   = Object.keys(stars).length;
  const neoMoid     = neo?.approach?.moid_au;

  const badgeColor = available === true ? GN : available === false ? AM : DIM;
  const badgeLabel = available === true ? "LIVE" : available === false ? "DEG" : "?";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 142,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ◉ AOBS
        <span style={{
          background: badgeColor, color: "#000", borderRadius: 3,
          fontSize: 6, padding: "0 4px", fontWeight: 700,
        }}>
          {badgeLabel}
        </span>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 142,
      width: 360, maxHeight: 560,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ◉ ASTRO OBSERVATORY
        </span>
        {epochTime && (
          <span style={{ fontSize: 7, color: DIM }}>{epochTime.slice(0, 16)} UTC</span>
        )}
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="PLANETS"  value={planetCount}                          color={AM} />
        <Tile label="STARS"    value={starCount}                             color={PUR} />
        <Tile label="NEO MOID" value={neoMoid != null ? `${fmt(neoMoid, 3)} AU` : "—"} color={CY} />
        <Tile label="ENGINE"   value={available === null ? "—" : available ? "OK" : "DEG"} color={available ? GN : AM} />
      </div>

      {/* tabs */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {["PLANETS", "STARS", "NEO"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* degraded banner */}
      {available === false && (
        <div style={{
          margin: "0 12px 6px", fontSize: 7, color: AM, lineHeight: 1.4,
          padding: "4px 8px", background: `${AM}0d`, borderRadius: 5,
          border: `1px solid ${AM}33`,
        }}>
          ⚠ Planet ephemeris unavailable — astropy not installed on model server.
          Stars and NEO use numpy only and remain operational.
        </div>
      )}

      {/* tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "PLANETS" && <PlanetList planets={planets} />}
        {tab === "STARS"   && <StarList stars={stars} />}
        {tab === "NEO"     && <NeoPanel neo={neo} loading={neoLoading} />}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{planetCount} planets · {starCount} stars</span>
        <span>300 s poll · /v1/astro/*</span>
      </div>
    </div>
  );
}
