'use client';

import { useCallback, useEffect, useState } from 'react';
import { Satellite, Loader2, AlertTriangle, Star, Orbit, Radio, Flame, Zap, Globe2 } from 'lucide-react';

/**
 * SolarSystemSection — the live real-astronomy engine
 * (server/services/discovery_astro.py) surfaced via the fail-safe proxies
 * /api/jarvis/{astro,radiation,fireballs,neo-feed,grb}. Folded into
 * FullSpectrumMonitor as its "SOLAR SYSTEM" section so the merged panel
 * carries one scroll column.
 *
 *   • Live PLANET TRACKING — RA / Dec / distance (AU) from astropy ephemeris,
 *     refreshed every 60s. Honestly flags when planets are astropy-degraded.
 *   • SPACE RADIATION — NOAA SWPC X-ray / proton / wind / Kp + storm level.
 *   • BRIGHT STAR catalogue — J2000 RA / Dec.
 *   • NEAR-EARTH OBJECTS — today's close approaches (NASA NeoWs).
 *   • FIREBALLS — NASA CNEOS atmospheric airbursts.
 *   • GAMMA-RAY BURSTS — NASA GCN circulars.
 *   • NEO close-approach screen — orbit (a, e) → earth-crossing + hazardous +
 *     lunar distances, the same two-body Keplerian screen real NEO surveys use.
 */

interface PlanetPos {
  ra_deg: number;
  dec_deg: number;
  distance_au: number;
}
interface StarPos {
  ra_deg: number;
  dec_deg: number;
}
interface AstroSnapshot {
  planetsAvailable: boolean;
  planetsReason: string | null;
  planets: Record<string, PlanetPos>;
  stars: Record<string, StarPos>;
  time: string;
}
interface NeoResult {
  orbit: {
    semi_major_axis_au?: number;
    eccentricity?: number;
    perihelion_au?: number;
    aphelion_au?: number;
    earth_crossing?: boolean;
    period_years?: number;
  };
  approach: {
    min_orbit_intersection_au?: number;
    hazardous?: boolean;
    lunar_distances?: number;
  };
  error?: string;
}

interface NeoFeedItem {
  name: string;
  date: string;
  miss_distance_km: number;
  velocity_kms: number;
  diameter_m: number;
  hazardous: boolean;
}
interface NeoFeedSnapshot {
  neos?: NeoFeedItem[];
  total?: number;
  date?: string;
  error?: string;
}

interface RadiationSnapshot {
  xray_class: string;
  xray_flux: number;
  proton_flux: number;
  solar_wind_speed: number;
  kp: number;
  storm_level: string;
  storm_color: string;
  timestamp: string;
  error?: string;
}
interface Fireball {
  date: string;
  lat: number | null;
  lng: number | null;
  energy_kt: number | null;
  altitude: number | null;
}
interface FireballSnapshot {
  fireballs: Fireball[];
  count?: number;
  error?: string;
}
interface Burst {
  name: string;
  detector: string;
  subject: string;
  circularId: string;
  url: string;
}
interface GrbSnapshot {
  available: boolean;
  bursts: Burst[];
  count?: number;
  error?: string;
}

const PLANET_REFRESH_MS = 60_000;
const RADIATION_REFRESH_MS = 60_000;

function fmtLatLng(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return '—';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lng).toFixed(1)}°${ew}`;
}

export default function SolarSystemSection() {
  const [snap, setSnap] = useState<AstroSnapshot | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(true);

  const [neoA, setNeoA] = useState('1.5');
  const [neoE, setNeoE] = useState('0.4');
  const [neo, setNeo] = useState<NeoResult | null>(null);
  const [neoLoading, setNeoLoading] = useState(false);
  const [neoError, setNeoError] = useState<string | null>(null);

  const [rad, setRad] = useState<RadiationSnapshot | null>(null);
  const [radError, setRadError] = useState<string | null>(null);
  const [fireballs, setFireballs] = useState<Fireball[] | null>(null);
  const [fireballError, setFireballError] = useState<string | null>(null);
  const [grb, setGrb] = useState<GrbSnapshot | null>(null);
  const [grbError, setGrbError] = useState<string | null>(null);
  const [neoFeed, setNeoFeed] = useState<NeoFeedItem[] | null>(null);
  const [neoFeedError, setNeoFeedError] = useState<string | null>(null);

  // ── Live space radiation (NOAA SWPC), refreshing every 60s ──
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/jarvis/radiation', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setRad(d as RadiationSnapshot);
          setRadError(d?.error ?? null);
        })
        .catch((e) => {
          if (alive) setRadError(e instanceof Error ? e.message : 'Failed to load radiation feed');
        });
    };
    load();
    const id = setInterval(load, RADIATION_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ── Recent fireball airbursts (NASA CNEOS) ──
  useEffect(() => {
    let alive = true;
    fetch('/api/jarvis/fireballs', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: FireballSnapshot) => {
        if (!alive) return;
        setFireballs(Array.isArray(d.fireballs) ? d.fireballs : []);
        setFireballError(d?.error ?? null);
      })
      .catch((e) => {
        if (alive) setFireballError(e instanceof Error ? e.message : 'Failed to load fireball feed');
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Near-Earth objects, today's close approaches (NASA NeoWs) ──
  useEffect(() => {
    let alive = true;
    fetch('/api/jarvis/neo-feed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: NeoFeedSnapshot) => {
        if (!alive) return;
        setNeoFeed(Array.isArray(d.neos) ? d.neos : []);
        setNeoFeedError(d?.error ?? null);
      })
      .catch((e) => {
        if (alive) setNeoFeedError(e instanceof Error ? e.message : 'Failed to load NEO feed');
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Recent gamma-ray bursts (NASA GCN circulars) ──
  useEffect(() => {
    let alive = true;
    fetch('/api/jarvis/grb', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: GrbSnapshot) => {
        if (!alive) return;
        setGrb(d);
        setGrbError(d?.error ?? null);
      })
      .catch((e) => {
        if (alive) setGrbError(e instanceof Error ? e.message : 'Failed to load burst feed');
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Live planet + star snapshot, refreshing planets every 60s ──
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/jarvis/astro', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setSnap(d as AstroSnapshot);
          setSnapError(d?.error ?? null);
        })
        .catch((e) => {
          if (alive) setSnapError(e instanceof Error ? e.message : 'Failed to load tracker');
        })
        .finally(() => {
          if (alive) setLoadingSnap(false);
        });
    };
    load();
    const id = setInterval(load, PLANET_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ── NEO close-approach screen ──
  const runNeo = useCallback(() => {
    const a = Number(neoA);
    const e = Number(neoE);
    if (!Number.isFinite(a) || !Number.isFinite(e)) {
      setNeoError('Enter numeric a and e');
      return;
    }
    setNeoLoading(true);
    setNeoError(null);
    const qs = new URLSearchParams({ neo: '1', a: String(a), e: String(e) });
    fetch(`/api/jarvis/astro?${qs}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setNeo(d as NeoResult);
        if (d?.error) setNeoError(d.error);
      })
      .catch((err) => setNeoError(err instanceof Error ? err.message : 'NEO screen failed'))
      .finally(() => setNeoLoading(false));
  }, [neoA, neoE]);

  // Seed the NEO checker once on mount with the default Earth-crossing orbit.
  useEffect(() => {
    runNeo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planetRows = snap ? Object.entries(snap.planets) : [];
  const starRows = snap ? Object.entries(snap.stars) : [];

  return (
    <div className="border-t border-[var(--gold-primary)]/20 mt-1.5">
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
        <Satellite className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
        <span className="font-mono text-[11px] tracking-[0.15em] text-[var(--gold-primary)]">SOLAR SYSTEM</span>
        <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-widest">REAL EPHEMERIS</span>
      </div>

      {/* ── SPACE RADIATION ── */}
      <section className="px-3 pt-2 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
            <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
              SPACE RADIATION
            </span>
            <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
              NOAA SWPC · LIVE
            </span>
          </div>
          {rad?.timestamp && (
            <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
              {rad.timestamp.replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '')} UTC
            </span>
          )}
        </div>

        {!rad && !radError && (
          <div className="flex items-center gap-2 py-3 text-[var(--text-muted)] text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading solar radiation…
          </div>
        )}

        {radError && (
          <div className="flex items-start gap-2 py-2 text-[#FF9500] text-xs font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {radError}
          </div>
        )}

        {rad && !radError && (
          <>
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px] mb-2">
              <Stat label="X-ray class (GOES)" value={rad.xray_class} />
              <Stat
                label="Proton flux ≥10 MeV"
                value={`${rad.proton_flux.toExponential(2)} pfu`}
              />
              <Stat label="Solar wind" value={`${rad.solar_wind_speed.toFixed(0)} km/s`} />
              <Stat label="Planetary Kp" value={rad.kp.toFixed(2)} />
            </div>
            <div
              className="flex items-center justify-between px-3 py-2 rounded border"
              style={{ borderColor: `${rad.storm_color}55`, backgroundColor: `${rad.storm_color}12` }}
            >
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)]">
                GEOMAGNETIC STORM
              </span>
              <span
                className="font-mono text-[12px] font-bold tracking-wide tabular-nums"
                style={{ color: rad.storm_color }}
              >
                {rad.storm_level}
              </span>
            </div>
          </>
        )}
      </section>

      {/* ── PLANET TRACKING ── */}
      <section className="px-3 pt-2 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Orbit className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
            <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
              PLANET TRACKING
            </span>
          </div>
          {snap?.time && (
            <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
              {snap.time} UTC
            </span>
          )}
        </div>

        {loadingSnap && (
          <div className="flex items-center gap-2 py-3 text-[var(--text-muted)] text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading ephemeris…
          </div>
        )}

        {snapError && (
          <div className="flex items-start gap-2 py-2 text-[#FF9500] text-xs font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {snapError}
          </div>
        )}

        {!loadingSnap && snap && !snap.planetsAvailable && (
          <div className="flex items-start gap-2 py-2 mb-2 text-[#FF9500] text-[11px] font-mono leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Planet positions degraded ({snap.planetsReason || 'astropy unavailable'}). Star
              catalogue and NEO screen below remain live.
            </span>
          </div>
        )}

        {planetRows.length > 0 && (
          <div className="overflow-hidden rounded border border-white/5">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="text-[var(--cyan-primary)] bg-white/[0.03]">
                  <th className="px-3 py-1.5 font-normal tracking-wider">PLANET</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">RA°</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">DEC°</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">DIST (AU)</th>
                </tr>
              </thead>
              <tbody>
                {planetRows.map(([name, p]) => (
                  <tr key={name} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 text-white/90 capitalize">{name}</td>
                    <td className="px-3 py-1.5 text-right text-white/70">{p.ra_deg.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right text-white/70">{p.dec_deg.toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right text-[var(--gold-primary)]">
                      {p.distance_au.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── BRIGHT STARS ── */}
      <section className="px-3 pt-1 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
            BRIGHT STAR CATALOGUE
          </span>
          <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">J2000</span>
        </div>
        {starRows.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {starRows.map(([name, s]) => (
              <div
                key={name}
                className="flex items-center justify-between font-mono text-[10px] px-2 py-1 rounded bg-white/[0.02] border border-white/5"
              >
                <span className="text-white/90 truncate">{name}</span>
                <span className="text-white/55 tabular-nums">
                  {s.ra_deg.toFixed(1)}° / {s.dec_deg.toFixed(1)}°
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── NEAR-EARTH OBJECTS ── */}
      <section className="px-3 pt-1 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
            <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
              NEAR-EARTH OBJECTS
            </span>
            <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
              NASA NeoWs · TODAY
            </span>
          </div>
          {neoFeed && (
            <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
              {neoFeed.length} close approaches
            </span>
          )}
        </div>

        {!neoFeed && !neoFeedError && (
          <div className="flex items-center gap-2 py-3 text-[var(--text-muted)] text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading close-approach feed…
          </div>
        )}

        {neoFeedError && (
          <div className="flex items-start gap-2 py-2 text-[#FF9500] text-xs font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {neoFeedError}
          </div>
        )}

        {neoFeed && !neoFeedError && neoFeed.length === 0 && (
          <div className="py-2 text-[var(--text-muted)] text-[11px] font-mono">
            No catalogued close approaches today.
          </div>
        )}

        {neoFeed && neoFeed.length > 0 && (
          <div className="overflow-hidden rounded border border-white/5">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="text-[var(--cyan-primary)] bg-white/[0.03]">
                  <th className="px-3 py-1.5 font-normal tracking-wider">OBJECT</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">MISS (km)</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">VEL (km/s)</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">Ø (m)</th>
                </tr>
              </thead>
              <tbody>
                {neoFeed.map((n) => (
                  <tr
                    key={`${n.name}-${n.date}`}
                    className="border-t border-white/5 hover:bg-white/[0.03]"
                    style={n.hazardous ? { backgroundColor: '#D32F2F12' } : undefined}
                  >
                    <td className="px-3 py-1.5">
                      <span className={n.hazardous ? 'text-[#FF5252]' : 'text-white/90'}>{n.name}</span>
                      {n.hazardous && (
                        <span className="ml-1.5 font-mono text-[8px] tracking-widest text-[#FF5252]">
                          HAZARD
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/70 tabular-nums">
                      {Math.round(n.miss_distance_km).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/70 tabular-nums">
                      {n.velocity_kms.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[var(--gold-primary)] tabular-nums">
                      {Math.round(n.diameter_m)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── FIREBALLS ── */}
      <section className="px-3 pt-1 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Flame className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
            FIREBALLS
          </span>
          <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
            NASA CNEOS · AIRBURSTS
          </span>
        </div>

        {!fireballs && !fireballError && (
          <div className="flex items-center gap-2 py-2 text-[var(--text-muted)] text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading fireball log…
          </div>
        )}

        {fireballError && (
          <div className="flex items-start gap-2 py-2 text-[#FF9500] text-xs font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {fireballError}
          </div>
        )}

        {fireballs && fireballs.length > 0 && (
          <div className="overflow-hidden rounded border border-white/5">
            <table className="w-full text-left font-mono text-[10px]">
              <thead>
                <tr className="text-[var(--cyan-primary)] bg-white/[0.03]">
                  <th className="px-3 py-1.5 font-normal tracking-wider">DATE (UTC)</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">ENERGY</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">ALT</th>
                  <th className="px-3 py-1.5 font-normal tracking-wider text-right">LOCATION</th>
                </tr>
              </thead>
              <tbody>
                {fireballs.slice(0, 12).map((f, i) => (
                  <tr key={`${f.date}-${i}`} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-3 py-1.5 text-white/90">{f.date}</td>
                    <td className="px-3 py-1.5 text-right text-[var(--gold-primary)]">
                      {f.energy_kt !== null ? `${f.energy_kt.toFixed(1)} kt` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/70">
                      {f.altitude !== null ? `${f.altitude.toFixed(0)} km` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-white/60">{fmtLatLng(f.lat, f.lng)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {fireballs && fireballs.length === 0 && !fireballError && (
          <p className="font-mono text-[10px] text-[var(--text-muted)] py-2">
            No fireball events currently reported.
          </p>
        )}
      </section>

      {/* ── GAMMA-RAY BURSTS ── */}
      <section className="px-3 pt-1 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
            GAMMA-RAY BURSTS
          </span>
          <span className="font-mono text-[9px] text-[var(--text-muted)] tracking-wide">
            NASA GCN
          </span>
        </div>

        {!grb && !grbError && (
          <div className="flex items-center gap-2 py-2 text-[var(--text-muted)] text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading burst alerts…
          </div>
        )}

        {(grbError || (grb && grb.available === false)) && (
          <div className="flex items-start gap-2 py-2 text-[#FF9500] text-[11px] font-mono leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Burst feed unavailable{grbError ? ` (${grbError})` : ''}.</span>
          </div>
        )}

        {grb && grb.available && grb.bursts.length > 0 && (
          <div className="flex flex-col gap-1">
            {grb.bursts.slice(0, 10).map((b) => (
              <a
                key={b.circularId}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 font-mono text-[10px] px-2.5 py-1.5 rounded bg-white/[0.02] border border-white/5 hover:border-[var(--gold-primary)]/30 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[var(--gold-primary)] shrink-0 tabular-nums">{b.name}</span>
                <span className="text-white/55 truncate">{b.detector}</span>
              </a>
            ))}
          </div>
        )}

        {grb && grb.available && grb.bursts.length === 0 && !grbError && (
          <p className="font-mono text-[10px] text-[var(--text-muted)] py-2">
            No recent gamma-ray burst circulars.
          </p>
        )}
      </section>

      {/* ── NEO CLOSE-APPROACH CHECKER ── */}
      <section className="px-3 pt-1 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Satellite className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
          <span className="font-mono text-[11px] tracking-widest text-[var(--gold-primary)]">
            NEO CLOSE-APPROACH SCREEN
          </span>
        </div>
        <p className="font-mono text-[10px] text-[var(--text-muted)] leading-relaxed mb-2">
          Two-body Keplerian screen — semi-major axis (a, AU) + eccentricity (e) → Earth-crossing
          classification + minimum-orbit-intersection hazard.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] tracking-widest text-[var(--cyan-primary)]">a (AU)</span>
            <input
              value={neoA}
              onChange={(e) => setNeoA(e.target.value)}
              inputMode="decimal"
              className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-white/90 focus:border-[var(--gold-primary)]/50 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] tracking-widest text-[var(--cyan-primary)]">e</span>
            <input
              value={neoE}
              onChange={(e) => setNeoE(e.target.value)}
              inputMode="decimal"
              className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-white/90 focus:border-[var(--gold-primary)]/50 focus:outline-none"
            />
          </label>
          <button
            onClick={runNeo}
            disabled={neoLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--gold-primary)]/30 bg-[var(--gold-primary)]/10 hover:bg-[var(--gold-primary)]/20 transition-colors font-mono text-[11px] tracking-widest text-[var(--gold-primary)] disabled:opacity-50"
          >
            {neoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Orbit className="w-3.5 h-3.5" />}
            SCREEN
          </button>
        </div>

        {neoError && (
          <div className="flex items-start gap-2 py-1 text-[#FF9500] text-[11px] font-mono">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {neoError}
          </div>
        )}

        {neo && !neo.error && (
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
            <Stat label="Perihelion" value={`${(neo.orbit.perihelion_au ?? 0).toFixed(3)} AU`} />
            <Stat label="Aphelion" value={`${(neo.orbit.aphelion_au ?? 0).toFixed(3)} AU`} />
            <Stat label="Period" value={`${(neo.orbit.period_years ?? 0).toFixed(2)} yr`} />
            <Stat
              label="Earth-crossing"
              value={neo.orbit.earth_crossing ? 'YES' : 'no'}
              accent={neo.orbit.earth_crossing ? 'warn' : 'muted'}
            />
            <Stat
              label="Min orbit intersection"
              value={`${(neo.approach.min_orbit_intersection_au ?? 0).toFixed(5)} AU`}
            />
            <Stat
              label="Lunar distances"
              value={`${(neo.approach.lunar_distances ?? 0).toFixed(2)} LD`}
            />
            <div className="col-span-2">
              <Stat
                label="Hazard classification"
                value={neo.approach.hazardous ? 'POTENTIALLY HAZARDOUS' : 'not hazardous'}
                accent={neo.approach.hazardous ? 'danger' : 'safe'}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = 'default',
}: {
  label: string;
  value: string;
  accent?: 'default' | 'muted' | 'warn' | 'danger' | 'safe';
}) {
  const valueColor =
    accent === 'danger'
      ? 'text-[#FF453A]'
      : accent === 'warn'
        ? 'text-[#FF9500]'
        : accent === 'safe'
          ? 'text-[#30D158]'
          : accent === 'muted'
            ? 'text-white/50'
            : 'text-[var(--gold-primary)]';
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-white/[0.02] border border-white/5">
      <span className="text-[var(--text-muted)] tracking-wide">{label}</span>
      <span className={`tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}
