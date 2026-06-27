import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Orcasound hydrophones — real live underwater listening stations in Puget Sound.
 * Listing / metadata only: the live audio streams exist, but no acoustic
 * classification (orca / vessel / submarine detection) is wired here. Names and
 * locations are surfaced honestly without any inferred detections.
 */
const ORCASOUND_FEEDS = 'https://live.orcasound.net/api/json/feeds';

interface Hydrophone {
  name: string;
  slug: string;
  lat: number;
  lng: number;
}

export async function GET() {
  try {
    const res = await fetch(ORCASOUND_FEEDS, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return NextResponse.json({ hydrophones: [], total: 0, error: `orcasound ${res.status}` }, { status: 502 });
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    const hydrophones: Hydrophone[] = [];
    for (const item of list as Record<string, any>[]) {
      const a = item?.attributes ?? {};
      const coords = a?.location_point?.coordinates;
      const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      hydrophones.push({
        name: typeof a?.name === 'string' ? a.name : 'unknown',
        slug: typeof a?.slug === 'string' ? a.slug : '',
        lat,
        lng,
      });
    }
    return NextResponse.json(
      { hydrophones, total: hydrophones.length, source: 'Orcasound (live.orcasound.net)' },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch (e) {
    return NextResponse.json(
      { hydrophones: [], total: 0, error: e instanceof Error ? e.message : 'orcasound unavailable' },
      { status: 502 },
    );
  }
}
