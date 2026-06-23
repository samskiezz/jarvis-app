import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS ocean buoys — the FULL NOAA NDBC active network (~1,360 stations) read
 * directly from activestations.xml (the JARVIS backend layer was capped at 200).
 * DART tsunami buoys are tagged 'dart' for red styling on the map.
 */
const NDBC_ACTIVE = 'https://www.ndbc.noaa.gov/activestations.xml';

function attr(s: string, k: string): string {
  const m = s.match(new RegExp(`${k}="([^"]*)"`));
  return m ? m[1] : '';
}

export async function GET() {
  try {
    const res = await fetch(NDBC_ACTIVE, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return NextResponse.json({ buoys: [], total: 0, error: `ndbc ${res.status}` }, { status: 502 });
    const xml = await res.text();
    const buoys: { id: string; label: string; type: string; lng: number; lat: number }[] = [];
    const re = /<station\s+([^>]*?)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const a = m[1];
      const lat = Number(attr(a, 'lat'));
      const lon = Number(attr(a, 'lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const isDart = attr(a, 'dart') === 'y';
      buoys.push({
        id: attr(a, 'id'),
        label: attr(a, 'name') || attr(a, 'id'),
        type: isDart ? 'dart' : attr(a, 'type') || 'buoy',
        lng: lon,
        lat,
      });
    }
    return NextResponse.json(
      { buoys, total: buoys.length, source: 'NOAA NDBC activestations.xml' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch (e) {
    return NextResponse.json(
      { buoys: [], total: 0, error: e instanceof Error ? e.message : 'ndbc unavailable' },
      { status: 502 },
    );
  }
}
