import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * SKY /anomalies — AIR + SPACE anomaly fusion engine.
 *
 * STRICTLY electromagnetic / aerospace domain. This route contains NO acoustic,
 * hydrophone, ocean, or buoy data — that belongs to the separate OCEAN domain
 * (/api/jarvis/ocean-anomaly). Keep the two domains apart.
 *
 * Server-side fetches existing same-origin routes and fuses REAL values only —
 * no randomness, no fabricated aircraft, no invented sightings. If an upstream
 * fails, its band is marked degraded in `sources` and contributes nothing; we
 * never manufacture data to fill a gap.
 *
 * Bands fused:
 *   - Aircraft anomalies: /api/flights (military tag, emergency squawks 7500/7600/7700,
 *     ADS-B GPS-integrity dropouts via nac_p). The flight feed DOES carry `squawk`,
 *     so emergency filtering is real here; the payload states this honestly.
 *   - Unmatched space objects: /api/spectrum/neo-risk (impact-risk sentry objects +
 *     close approaches) and /api/jarvis/fireballs (atmospheric airbursts) — objects
 *     whose origin/trajectory is tracked but "unexplained" in the threat sense.
 *   - UAP: NUFORC has no live JSON feed reachable; we return uap:[] with an honest
 *     source note + the authoritative link, never fabricated sightings.
 */

interface AircraftAnomaly {
  callsign: string;
  icao24: string;
  model: string;
  lat: number;
  lng: number;
  alt: number;
  speed_knots: number | null;
  heading: number | null;
  squawk: string;
  category: string;
  /** Reasons this aircraft was flagged (e.g. 'military', 'emergency:7700', 'gps-integrity-loss'). */
  flags: string[];
  emergency: string | null;
}

interface UnmatchedSpaceObject {
  id: string;
  kind: 'impactRiskObject' | 'closeApproach' | 'fireball';
  designation: string;
  summary: string;
  /** Hazard ordering hint, higher = more notable. Derived from real fields only. */
  severity: number;
  lat: number | null;
  lng: number | null;
  date: string | null;
  detail: Record<string, number | string | null>;
}

interface UapReport {
  date: string;
  city: string;
  state: string;
  shape: string;
  summary: string;
  lat: number | null;
  lng: number | null;
}

interface Correlation {
  summary: string;
  aircraft?: string;
  space?: string;
  uap?: string;
  distance_km?: number | null;
}

interface SourceStatus {
  ok: boolean;
  note?: string;
}

interface SkyAnomalies {
  aircraftAnomalies: AircraftAnomaly[];
  unmatchedSpace: UnmatchedSpaceObject[];
  uap: UapReport[];
  uap_source_note: string;
  correlations: Correlation[];
  updated: string;
  sources: {
    flights: SourceStatus;
    neoRisk: SourceStatus;
    fireballs: SourceStatus;
    uap: SourceStatus;
    squawkField: SourceStatus;
  };
  errors?: string[];
}

const EMERGENCY_SQUAWKS: Record<string, string> = {
  '7500': 'hijack',
  '7600': 'radio-failure',
  '7700': 'general-emergency',
};

/** ADS-B navigation-accuracy-category-position; <=4 indicates GPS integrity loss/spoofing. */
const NAC_P_INTEGRITY_FLOOR = 4;

/** Sentry Palermo Scale above this is notable enough to surface as "unmatched". */
const PS_NOTABLE = -4;

/** Correlate an air/UAP point with a space ground-track within this radius. */
const CORRELATION_RADIUS_KM = 500;

const NUFORC_NOTE =
  'No live machine-readable NUFORC feed is reachable from this service (the site is a ' +
  'nonce-gated WordPress table and data.nuforc.org does not resolve). UAP reports are not ' +
  'fabricated here. Authoritative source: https://nuforc.org';

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Great-circle distance in km. */
function haversineKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const R = 6371;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Fetch a sibling route same-origin; returns null on any failure. */
async function fetchRoute(path: string, base: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, any>;
  } catch {
    return null;
  }
}

/** Flag anomalous aircraft from the flight payload. Pure: only reads existing fields. */
function deriveAircraftAnomalies(
  flights: Record<string, any> | null,
  squawkPresent: { value: boolean },
): AircraftAnomaly[] {
  if (!flights) return [];
  const pools: any[] = [
    ...(Array.isArray(flights.military_flights) ? flights.military_flights : []),
    ...(Array.isArray(flights.commercial_flights) ? flights.commercial_flights : []),
    ...(Array.isArray(flights.private_flights) ? flights.private_flights : []),
    ...(Array.isArray(flights.private_jets) ? flights.private_jets : []),
  ];

  const out: AircraftAnomaly[] = [];
  for (const f of pools) {
    const lat = num(f?.lat);
    const lng = num(f?.lng);
    if (lat === null || lng === null) continue;

    const squawk = str(f?.squawk);
    if (squawk) squawkPresent.value = true;

    const flags: string[] = [];
    let emergency: string | null = null;

    if (f?.category === 'military') flags.push('military');

    if (squawk && EMERGENCY_SQUAWKS[squawk]) {
      emergency = EMERGENCY_SQUAWKS[squawk];
      flags.push(`emergency:${squawk}`);
    }

    const nacP = num(f?.nac_p);
    if (nacP !== null && nacP <= NAC_P_INTEGRITY_FLOOR) {
      flags.push('gps-integrity-loss');
    }

    if (flags.length === 0) continue;

    out.push({
      callsign: str(f?.callsign),
      icao24: str(f?.icao24),
      model: str(f?.model),
      lat,
      lng,
      alt: num(f?.alt) ?? 0,
      speed_knots: num(f?.speed_knots),
      heading: num(f?.heading),
      squawk,
      category: str(f?.category),
      flags,
      emergency,
    });
  }

  // Emergencies first, then GPS-integrity, then military.
  out.sort((a, b) => rankAircraft(b) - rankAircraft(a));
  return out;
}

function rankAircraft(a: AircraftAnomaly): number {
  if (a.emergency) return 3;
  if (a.flags.includes('gps-integrity-loss')) return 2;
  return 1;
}

/** Build the unmatched-space list from sentry impact-risk objects, close approaches, fireballs. */
function deriveUnmatchedSpace(
  neoRisk: Record<string, any> | null,
  fireballs: Record<string, any> | null,
): UnmatchedSpaceObject[] {
  const out: UnmatchedSpaceObject[] = [];

  const sentry = neoRisk && Array.isArray(neoRisk.sentry) ? neoRisk.sentry : [];
  for (const o of sentry) {
    const ps = num(o?.ps);
    const ip = num(o?.ip);
    // Only surface impact-risk objects above the notable Palermo threshold.
    if (ps === null || ps < PS_NOTABLE) continue;
    const diameterKm = num(o?.diameterKm);
    out.push({
      id: `sentry:${str(o?.des) || 'unknown'}`,
      kind: 'impactRiskObject',
      designation: str(o?.des) || 'unknown',
      summary: `Impact-risk object ${str(o?.des)} — Palermo ${ps}${ip !== null ? `, cumulative impact prob ${ip}` : ''}`,
      severity: 100 + ps, // higher PS => higher severity
      lat: null,
      lng: null,
      date: null,
      detail: { palermoScale: ps, impactProbability: ip, diameterKm },
    });
  }

  const approaches = neoRisk && Array.isArray(neoRisk.closeApproaches) ? neoRisk.closeApproaches : [];
  for (const a of approaches) {
    const distLD = num(a?.distLD);
    out.push({
      id: `cad:${str(a?.des) || 'unknown'}:${str(a?.date)}`,
      kind: 'closeApproach',
      designation: str(a?.des) || 'unknown',
      summary: `Near-Earth close approach ${str(a?.des)}${distLD !== null ? ` at ${distLD.toFixed(1)} lunar distances` : ''}`,
      severity: distLD !== null ? Math.max(0, 50 - distLD) : 10,
      lat: null,
      lng: null,
      date: str(a?.date) || null,
      detail: {
        distanceLD: distLD,
        distanceAU: num(a?.distAU),
        velocityKps: num(a?.velKps),
        diameterM: num(a?.diameterM),
      },
    });
  }

  const balls = fireballs && Array.isArray(fireballs.fireballs) ? fireballs.fireballs : [];
  for (const b of balls) {
    const energy = num(b?.energy_kt);
    const lat = num(b?.lat);
    const lng = num(b?.lng);
    out.push({
      id: `fireball:${str(b?.date)}`,
      kind: 'fireball',
      designation: 'atmospheric airburst',
      summary: `Atmospheric fireball${energy !== null ? ` — ${energy} kt radiated energy` : ''}${str(b?.date) ? ` (${str(b?.date)})` : ''}`,
      severity: energy !== null ? Math.min(80, energy) : 5,
      lat,
      lng,
      date: str(b?.date) || null,
      detail: { energyKt: energy, altitudeKm: num(b?.altitude) },
    });
  }

  out.sort((a, b) => b.severity - a.severity);
  return out;
}

/**
 * Cross-correlate geolocatable air anomalies and UAP reports with geolocatable space
 * ground-tracks (fireballs / approaches). Sentry objects have no ground point, so they
 * are not spatially correlated. Deterministic; emits only real proximities.
 */
function deriveCorrelations(
  aircraft: AircraftAnomaly[],
  space: UnmatchedSpaceObject[],
  uap: UapReport[],
): Correlation[] {
  const correlations: Correlation[] = [];
  const groundSpace = space.filter((s) => s.lat !== null && s.lng !== null);

  for (const s of groundSpace) {
    for (const a of aircraft) {
      const d = haversineKm(a.lat, a.lng, s.lat as number, s.lng as number);
      if (d <= CORRELATION_RADIUS_KM) {
        correlations.push({
          summary: `Anomalous aircraft ${a.callsign || a.icao24} within ${Math.round(d)} km of ${s.designation}`,
          aircraft: a.callsign || a.icao24,
          space: s.designation,
          distance_km: Math.round(d),
        });
      }
    }
    for (const u of uap) {
      if (u.lat === null || u.lng === null) continue;
      const d = haversineKm(u.lat, u.lng, s.lat as number, s.lng as number);
      if (d <= CORRELATION_RADIUS_KM) {
        correlations.push({
          summary: `UAP report (${u.city}) within ${Math.round(d)} km of ${s.designation}`,
          uap: `${u.city}, ${u.state}`,
          space: s.designation,
          distance_km: Math.round(d),
        });
      }
    }
  }

  return correlations;
}

export async function GET(request: Request) {
  const base = request.url;
  const errors: string[] = [];

  const [flightsRes, neoRiskRes, fireballsRes] = await Promise.allSettled([
    fetchRoute('/api/flights', base),
    fetchRoute('/api/spectrum/neo-risk', base),
    fetchRoute('/api/jarvis/fireballs', base),
  ]);

  const flights = flightsRes.status === 'fulfilled' ? flightsRes.value : null;
  const neoRisk = neoRiskRes.status === 'fulfilled' ? neoRiskRes.value : null;
  const fireballs = fireballsRes.status === 'fulfilled' ? fireballsRes.value : null;

  if (!flights) errors.push('flights degraded');
  if (!neoRisk) errors.push('neo-risk degraded');
  if (!fireballs) errors.push('fireballs degraded');

  const squawkPresent = { value: false };
  const aircraftAnomalies = deriveAircraftAnomalies(flights, squawkPresent);
  const unmatchedSpace = deriveUnmatchedSpace(neoRisk, fireballs);

  // UAP: no live feed — honest empty list, never fabricated.
  const uap: UapReport[] = [];

  const correlations = deriveCorrelations(aircraftAnomalies, unmatchedSpace, uap);

  const body: SkyAnomalies = {
    aircraftAnomalies,
    unmatchedSpace,
    uap,
    uap_source_note: NUFORC_NOTE,
    correlations,
    updated: new Date().toISOString(),
    sources: {
      flights: { ok: flights !== null },
      neoRisk: {
        ok: neoRisk !== null,
        note:
          neoRisk && Array.isArray(neoRisk.closeApproaches) && neoRisk.closeApproaches.length === 0
            ? 'close-approach band empty (upstream cad)'
            : undefined,
      },
      fireballs: { ok: fireballs !== null },
      uap: { ok: false, note: NUFORC_NOTE },
      squawkField: {
        ok: squawkPresent.value,
        note: squawkPresent.value
          ? undefined
          : 'no aircraft in this window reported a squawk; emergency filtering used what was present',
      },
    },
  };
  if (errors.length > 0) body.errors = errors;

  const allFailed = !flights && !neoRisk && !fireballs;
  return NextResponse.json(body, {
    status: allFailed ? 502 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
