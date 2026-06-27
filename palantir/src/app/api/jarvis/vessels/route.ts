import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Digitraffic AIS surface vessels — real ship positions. REGIONAL: this Finnish
 * Transport Agency feed only covers the Baltic Sea / Gulf of Finland, so the map
 * layer and toggle state that caveat. The 'Accept-Encoding: gzip' header is
 * mandatory — Digitraffic returns HTTP 406 without it.
 */
const DIGITRAFFIC_AIS = 'https://meri.digitraffic.fi/api/ais/v1/locations';

interface Vessel {
  mmsi: number;
  lat: number;
  lng: number;
  sog: number;
  cog: number;
}

export async function GET() {
  try {
    const res = await fetch(DIGITRAFFIC_AIS, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return NextResponse.json({ vessels: [], total: 0, error: `digitraffic ${res.status}` }, { status: 502 });
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    const vessels: Vessel[] = [];
    for (const f of features as Record<string, any>[]) {
      const coords = f?.geometry?.coordinates;
      const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const p = f?.properties ?? {};
      vessels.push({
        mmsi: Number(p?.mmsi) || 0,
        lat,
        lng,
        sog: Number.isFinite(Number(p?.sog)) ? Number(p.sog) : 0,
        cog: Number.isFinite(Number(p?.cog)) ? Number(p.cog) : 0,
      });
    }
    return NextResponse.json(
      { vessels, total: vessels.length, region: 'Baltic Sea / Gulf of Finland', source: 'Digitraffic AIS (meri.digitraffic.fi)' },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    );
  } catch (e) {
    return NextResponse.json(
      { vessels: [], total: 0, error: e instanceof Error ? e.message : 'digitraffic unavailable' },
      { status: 502 },
    );
  }
}
