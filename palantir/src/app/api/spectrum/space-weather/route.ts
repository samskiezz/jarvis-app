import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Full-spectrum solar-weather fusion — fuses ALL key-free NOAA SWPC products into the
 * normalized SpaceWeather shape from audit/SPECTRUM_SCHEMA.md. No API key required.
 *
 * Each sub-feed is fetched via Promise.allSettled so one failing feed never nulls the
 * rest: a sub-feed failure pushes its name to `errors[]` and the route still returns 200
 * with honest `null` values for that band. Only a total wipe-out (every feed failed)
 * returns 502. Numeric upstream values are Number()-coerced; non-finite → null (never
 * faked 0). flareClass/sScale/gScale are DERIVED deterministically from the live flux/Kp.
 */

const SWPC = 'https://services.swpc.noaa.gov';
const TIMEOUT_MS = 20000;
const HEADERS = { 'User-Agent': 'jarvis-palantir/1.0' } as const;

const ENDPOINTS = {
  scales: `${SWPC}/products/noaa-scales.json`,
  xray: `${SWPC}/json/goes/primary/xrays-6-hour.json`,
  windSpeed: `${SWPC}/products/summary/solar-wind-speed.json`,
  mag: `${SWPC}/products/solar-wind/mag-1-day.json`,
  plasma: `${SWPC}/products/solar-wind/plasma-1-day.json`,
  kp: `${SWPC}/json/planetary_k_index_1m.json`,
  protons: `${SWPC}/json/goes/primary/integral-protons-6-hour.json`,
  electrons: `${SWPC}/json/goes/primary/integral-electrons-6-hour.json`,
  regions: `${SWPC}/json/solar_regions.json`,
  alerts: `${SWPC}/products/alerts.json`,
} as const;

type FeedKey = keyof typeof ENDPOINTS;

/** Number()-coerce, returning null for non-finite (honest "no data"). */
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** SWPC "product" feeds are header-row arrays: [[col,...],[val,...]]. Map last data row to an object keyed by the header. */
function rowToObject(table: unknown): Record<string, string> | null {
  if (!Array.isArray(table) || table.length < 2) return null;
  const header = table[0];
  const last = table[table.length - 1];
  if (!Array.isArray(header) || !Array.isArray(last)) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) out[String(header[i])] = String(last[i]);
  return out;
}

/** GOES long-band X-ray flux (W/m²) → NOAA flare class string, e.g. "C8.2", "M1.0", "X1.4". */
function flareClassFromFlux(flux: number | null): string {
  if (flux == null || flux <= 0) return 'A0.0';
  const bands: Array<{ letter: string; base: number }> = [
    { letter: 'X', base: 1e-4 },
    { letter: 'M', base: 1e-5 },
    { letter: 'C', base: 1e-6 },
    { letter: 'B', base: 1e-7 },
    { letter: 'A', base: 1e-8 },
  ];
  for (const b of bands) {
    if (flux >= b.base) {
      const mantissa = flux / b.base;
      // X-class is open-ended (no rollover to a higher letter), e.g. X12.3.
      return `${b.letter}${mantissa.toFixed(1)}`;
    }
  }
  return 'A0.0';
}

/** Proton flux (pfu, ≥10 MeV) → NOAA S-scale (radiation storm). */
function sScaleFromProtons(flux: number | null): string {
  if (flux == null) return 'S0';
  if (flux >= 1e5) return 'S5';
  if (flux >= 1e4) return 'S4';
  if (flux >= 1e3) return 'S3';
  if (flux >= 100) return 'S2';
  if (flux >= 10) return 'S1';
  return 'S0';
}

/** Kp (0..9) → NOAA G-scale (geomagnetic storm). */
function gScaleFromKp(kp: number | null): string {
  if (kp == null) return 'G0';
  if (kp >= 9) return 'G5';
  if (kp >= 8) return 'G4';
  if (kp >= 7) return 'G3';
  if (kp >= 6) return 'G2';
  if (kp >= 5) return 'G1';
  return 'G0';
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store', headers: HEADERS });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function GET() {
  const keys = Object.keys(ENDPOINTS) as FeedKey[];
  const settled = await Promise.allSettled(keys.map((k) => fetchJson(ENDPOINTS[k])));

  const data = {} as Record<FeedKey, unknown>;
  const errors: string[] = [];
  keys.forEach((k, i) => {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      data[k] = r.value;
    } else {
      data[k] = null;
      errors.push(`${k} ${r.reason instanceof Error ? r.reason.message : 'failed'}`);
    }
  });

  // Every feed failed → honest total failure.
  if (errors.length === keys.length) {
    return NextResponse.json(
      { error: 'all SWPC sub-feeds failed', errors, updated: new Date().toISOString() },
      { status: 502 },
    );
  }

  // --- X-ray (long band 0.1-0.8nm only) ---
  const xrayArr = Array.isArray(data.xray) ? (data.xray as Record<string, unknown>[]) : [];
  const longBand = xrayArr.filter((x) => x?.energy === '0.1-0.8nm');
  const xLast = longBand.length ? longBand[longBand.length - 1] : null;
  const xrayFlux = xLast ? num(xLast.flux) : null;
  const xray = {
    flux: xrayFlux,
    energy: '0.1-0.8nm',
    flareClass: flareClassFromFlux(xrayFlux),
    satellite: xLast ? num(xLast.satellite) : null,
    time: xLast && typeof xLast.time_tag === 'string' ? xLast.time_tag : null,
  };

  // --- Solar wind: speed summary + plasma (density/temp/speed fallback) + mag (Bz/Bt) ---
  const windSpeedArr = Array.isArray(data.windSpeed) ? (data.windSpeed as Record<string, unknown>[]) : [];
  const plasmaRow = rowToObject(data.plasma);
  const magRow = rowToObject(data.mag);
  const speedFromSummary = windSpeedArr.length ? num(windSpeedArr[0]?.proton_speed) : null;
  const speedFromPlasma = plasmaRow ? num(plasmaRow.speed) : null;
  const solarWind = {
    speed: speedFromSummary ?? speedFromPlasma,
    density: plasmaRow ? num(plasmaRow.density) : null,
    temp: plasmaRow ? num(plasmaRow.temperature) : null,
    bz: magRow ? num(magRow.bz_gsm) : null,
    bt: magRow ? num(magRow.bt) : null,
    time: (plasmaRow?.time_tag ?? magRow?.time_tag) || null,
  };

  // --- Kp (planetary K index) ---
  const kpArr = Array.isArray(data.kp) ? (data.kp as Record<string, unknown>[]) : [];
  const kpLast = kpArr.length ? kpArr[kpArr.length - 1] : null;
  const kpValue = kpLast ? (num(kpLast.kp_index) ?? num(kpLast.estimated_kp)) : null;
  const kp = {
    value: kpValue,
    gScale: gScaleFromKp(kpValue),
    time: kpLast && typeof kpLast.time_tag === 'string' ? kpLast.time_tag : null,
  };

  // --- Protons (≥10 MeV) ---
  const protonArr = Array.isArray(data.protons) ? (data.protons as Record<string, unknown>[]) : [];
  const p10 = protonArr.filter((p) => p?.energy === '>=10 MeV');
  const pLast = p10.length ? p10[p10.length - 1] : null;
  const protonFlux = pLast ? num(pLast.flux) : null;
  const protons = {
    flux: protonFlux,
    energy: '>=10 MeV',
    sScale: sScaleFromProtons(protonFlux),
    time: pLast && typeof pLast.time_tag === 'string' ? pLast.time_tag : null,
  };

  // --- Electrons (≥2 MeV) ---
  const electronArr = Array.isArray(data.electrons) ? (data.electrons as Record<string, unknown>[]) : [];
  const e2 = electronArr.filter((e) => e?.energy === '>=2 MeV');
  const eLast = e2.length ? e2[e2.length - 1] : null;
  const electrons = {
    flux: eLast ? num(eLast.flux) : null,
    energy: '>=2 MeV',
    time: eLast && typeof eLast.time_tag === 'string' ? eLast.time_tag : null,
  };

  // --- NOAA scales (current 24h observed = key "0") ---
  const scalesObj = data.scales && typeof data.scales === 'object' ? (data.scales as Record<string, unknown>) : null;
  const cur = (scalesObj?.['0'] ?? null) as Record<string, unknown> | null;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const band = (b: unknown) => {
    const o = b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
    return { scale: str(o?.Scale), text: str(o?.Text) };
  };
  const scales = {
    R: band(cur?.R),
    S: band(cur?.S),
    G: band(cur?.G),
  };

  // --- Active sunspot regions (latest observed_date only; feed is sorted oldest-first) ---
  const regionArr = Array.isArray(data.regions) ? (data.regions as Record<string, unknown>[]) : [];
  let regions: Array<{
    region: number; location: string; latitude: number | null; longitude: number | null;
    numberSpots: number | null; magClass: string | null; spotClass: string | null;
    area: number | null; mFlareProb: number | null; xFlareProb: number | null;
  }> = [];
  if (regionArr.length) {
    const latestDate = regionArr.reduce<string>((max, r) => {
      const d = typeof r?.observed_date === 'string' ? r.observed_date : '';
      return d > max ? d : max;
    }, '');
    regions = regionArr
      .filter((r) => r?.observed_date === latestDate && r?.region != null)
      .map((r) => ({
        region: Number(r.region),
        location: typeof r.location === 'string' ? r.location : '',
        latitude: num(r.latitude),
        longitude: num(r.longitude),
        numberSpots: num(r.number_spots),
        magClass: typeof r.mag_class === 'string' ? r.mag_class : null,
        spotClass: typeof r.spot_class === 'string' ? r.spot_class : null,
        area: num(r.area),
        mFlareProb: num(r.m_flare_probability),
        xFlareProb: num(r.x_flare_probability),
      }));
  }

  // --- Alerts (most recent 10) ---
  const alertArr = Array.isArray(data.alerts) ? (data.alerts as Record<string, unknown>[]) : [];
  const alerts = alertArr.slice(0, 10).map((a) => ({
    id: typeof a?.product_id === 'string' ? a.product_id : '',
    issued: typeof a?.issue_datetime === 'string' ? a.issue_datetime : '',
    message: typeof a?.message === 'string' ? a.message.trim().slice(0, 240) : '',
  }));

  const body = {
    xray,
    solarWind,
    kp,
    protons,
    electrons,
    scales,
    regions,
    alerts,
    updated: new Date().toISOString(),
    source: 'NOAA SWPC (services.swpc.noaa.gov)' as const,
    ...(errors.length ? { errors } : {}),
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
