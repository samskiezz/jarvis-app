import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS Palantir geo bridge — plots the real geo-tagged ontology objects from
 * the JARVIS backend (/v1/geo/objects) onto the Osiris map. Returns BOTH the
 * combined `jarvis_geo` (the map layer) AND per-type arrays (so each LayerPanel
 * toggle shows its own count, not the total). EarthquakeEvents excluded — they
 * double-plot the dedicated quake layer.
 */
const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

type Pt = { id?: string; label?: string; type?: string; lat: number; lng: number };

function bucketKey(t: string): string {
  if (t === 'SpeciesOccurrence') return 'jarvis_wildlife';
  if (t === 'Sensor') return 'jarvis_sensors';
  if (t === 'Measurement') return 'jarvis_measure';
  if (t === 'Place') return 'jarvis_places';
  return 'jarvis_assets'; // Asset, Event, anything else
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get('limit') || '50000';
  try {
    const res = await fetch(`${JARVIS_API_BASE}/v1/geo/objects?limit=${encodeURIComponent(limit)}`, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ jarvis_geo: [], total: 0, error: `backend ${res.status}` }, { status: 502 });
    const data = await res.json();
    const objects = Array.isArray(data.objects) ? data.objects : [];

    const jarvis_geo: Pt[] = [];
    const buckets: Record<string, Pt[]> = {
      jarvis_wildlife: [], jarvis_sensors: [], jarvis_measure: [], jarvis_places: [], jarvis_assets: [],
    };
    for (const o of objects) {
      if (typeof o.lat !== 'number' || typeof o.lon !== 'number' || o.type === 'EarthquakeEvent') continue;
      const p: Pt = { id: o.id, label: o.label, type: o.type, lat: o.lat, lng: o.lon };
      jarvis_geo.push(p);
      buckets[bucketKey(o.type)].push(p);
    }
    return NextResponse.json(
      { jarvis_geo, ...buckets, total: jarvis_geo.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { jarvis_geo: [], total: 0, error: e instanceof Error ? e.message : 'jarvis geo unavailable' },
      { status: 502 },
    );
  }
}
