import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Orbital / gravitational band — JPL SSD/CNEOS close approaches (cad.api) +
 * impact-risk objects (sentry.api), fetched in parallel, no API key needed.
 * 1 lunar distance (LD) = 0.00257 AU, so distLD = distAU / 0.00257.
 * diameterM is ESTIMATED from absolute magnitude H via the standard 0.14-albedo
 * relation (null when H is missing) — never a faked value. On full upstream
 * failure the route returns empty lists + an honest error, mirroring neo-feed.
 */
const CAD_URL =
  'https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.05&date-min=now&date-max=+60&limit=50';
const SENTRY_URL = 'https://ssd-api.jpl.nasa.gov/sentry.api';

const AU_PER_LD = 0.00257;
const ALBEDO = 0.14;

interface CloseApproach {
  des: string;
  date: string;
  distLD: number | null;
  distAU: number | null;
  velKps: number | null;
  diameterM: number | null;
}

interface SentryObject {
  des: string;
  ps: number | null;
  ip: number | null;
  diameterKm: number | null;
}

interface NeoRiskResponse {
  closeApproaches: CloseApproach[];
  sentry: SentryObject[];
  source: 'JPL SSD/CNEOS (ssd-api.jpl.nasa.gov)';
  errors?: string[];
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Estimated diameter in metres from absolute magnitude H (standard 0.14 albedo). */
function diameterMFromH(h: number | null): number | null {
  if (h === null) return null;
  const diameterKm = (1329 / Math.sqrt(ALBEDO)) * Math.pow(10, -0.2 * h);
  const diameterM = diameterKm * 1000;
  return Number.isFinite(diameterM) ? diameterM : null;
}

function fetchUpstream(url: string): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
    headers: { 'User-Agent': 'jarvis-palantir/1.0' },
  });
}

function parseCad(data: unknown, errors: string[]): CloseApproach[] {
  const root = data as Record<string, unknown>;
  const fields = Array.isArray(root?.fields) ? (root.fields as string[]) : [];
  const rows = Array.isArray(root?.data) ? (root.data as unknown[][]) : [];
  if (fields.length === 0 || rows.length === 0) {
    if (rows.length === 0) errors.push('cad empty');
    return [];
  }
  const idx = (name: string): number => fields.indexOf(name);
  const iDes = idx('des');
  const iCd = idx('cd');
  const iDist = idx('dist');
  const iV = idx('v_rel');
  const iH = idx('h');

  return rows.map((row): CloseApproach => {
    const distAU = iDist >= 0 ? numOrNull(row[iDist]) : null;
    const hMag = iH >= 0 ? numOrNull(row[iH]) : null;
    return {
      des: iDes >= 0 && typeof row[iDes] === 'string' ? (row[iDes] as string) : 'unknown',
      date: iCd >= 0 && typeof row[iCd] === 'string' ? (row[iCd] as string) : '',
      distAU,
      distLD: distAU !== null ? distAU / AU_PER_LD : null,
      velKps: iV >= 0 ? numOrNull(row[iV]) : null,
      diameterM: diameterMFromH(hMag),
    };
  });
}

function parseSentry(data: unknown, errors: string[]): SentryObject[] {
  const root = data as Record<string, unknown>;
  const list = Array.isArray(root?.data) ? (root.data as Record<string, unknown>[]) : [];
  if (list.length === 0) {
    errors.push('sentry empty');
    return [];
  }
  return list.map((o): SentryObject => ({
    des: typeof o?.des === 'string' ? o.des : 'unknown',
    ps: numOrNull(o?.ps_max),
    ip: numOrNull(o?.ip),
    diameterKm: numOrNull(o?.diameter),
  }));
}

export async function GET() {
  const errors: string[] = [];
  const [cadResult, sentryResult] = await Promise.allSettled([
    fetchUpstream(CAD_URL),
    fetchUpstream(SENTRY_URL),
  ]);

  let closeApproaches: CloseApproach[] = [];
  if (cadResult.status === 'fulfilled' && cadResult.value.ok) {
    try {
      closeApproaches = parseCad(await cadResult.value.json(), errors);
    } catch {
      errors.push('cad parse');
    }
  } else {
    errors.push(
      cadResult.status === 'fulfilled' ? `cad ${cadResult.value.status}` : 'cad timeout',
    );
  }

  let sentry: SentryObject[] = [];
  if (sentryResult.status === 'fulfilled' && sentryResult.value.ok) {
    try {
      sentry = parseSentry(await sentryResult.value.json(), errors);
    } catch {
      errors.push('sentry parse');
    }
  } else {
    errors.push(
      sentryResult.status === 'fulfilled'
        ? `sentry ${sentryResult.value.status}`
        : 'sentry timeout',
    );
  }

  const body: NeoRiskResponse = {
    closeApproaches,
    sentry,
    source: 'JPL SSD/CNEOS (ssd-api.jpl.nasa.gov)',
  };
  if (errors.length > 0) body.errors = errors;

  const bothFailed = closeApproaches.length === 0 && sentry.length === 0 && errors.length > 0;
  return NextResponse.json(body, {
    status: bothFailed ? 502 : 200,
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  });
}
