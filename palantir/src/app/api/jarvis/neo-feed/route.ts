import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * NASA NeoWs near-Earth object feed — real close-approach data for today.
 * DEMO_KEY is key-free and rate-limited; if NASA throttles us the route returns
 * an honest empty list + error rather than fabricating objects.
 */
const NASA_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';

interface Neo {
  name: string;
  date: string;
  miss_distance_km: number;
  velocity_kms: number;
  diameter_m: number;
  hazardous: boolean;
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${NASA_KEY}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return NextResponse.json({ neos: [], total: 0, error: `nasa neows ${res.status}` }, { status: 502 });
    const data = await res.json();
    const byDate = (data?.near_earth_objects ?? {}) as Record<string, unknown[]>;
    const neos: Neo[] = [];
    for (const day of Object.keys(byDate)) {
      const list = Array.isArray(byDate[day]) ? byDate[day] : [];
      for (const o of list as Record<string, any>[]) {
        const ca = Array.isArray(o?.close_approach_data) ? o.close_approach_data[0] : null;
        const diam = o?.estimated_diameter?.meters;
        const missKm = Number(ca?.miss_distance?.kilometers);
        const velKms = Number(ca?.relative_velocity?.kilometers_per_second);
        const dMin = Number(diam?.estimated_diameter_min);
        const dMax = Number(diam?.estimated_diameter_max);
        neos.push({
          name: typeof o?.name === 'string' ? o.name.replace(/^\(|\)$/g, '') : 'unknown',
          date: typeof ca?.close_approach_date === 'string' ? ca.close_approach_date : day,
          miss_distance_km: Number.isFinite(missKm) ? missKm : 0,
          velocity_kms: Number.isFinite(velKms) ? velKms : 0,
          diameter_m: Number.isFinite(dMin) && Number.isFinite(dMax) ? (dMin + dMax) / 2 : 0,
          hazardous: o?.is_potentially_hazardous_asteroid === true,
        });
      }
    }
    neos.sort((a, b) => a.miss_distance_km - b.miss_distance_km);
    return NextResponse.json(
      { neos, total: neos.length, date: today, source: 'NASA NeoWs (api.nasa.gov)' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch (e) {
    return NextResponse.json(
      { neos: [], total: 0, error: e instanceof Error ? e.message : 'neows unavailable' },
      { status: 502 },
    );
  }
}
