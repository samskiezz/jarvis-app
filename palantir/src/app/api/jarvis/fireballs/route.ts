import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS fireball bridge — recent atmospheric meteor airbursts for the SOLAR SYSTEM
 * panel and the Osiris map 'fireballs' layer.
 *
 * Source: NASA/JPL CNEOS Fireball Data API (ssd-api.jpl.nasa.gov/fireball.api).
 * Public, key-free. Returns date, total radiated energy (kt of TNT equivalent),
 * altitude (km) and ground-track lat/lon for each detected airburst.
 *
 * The API delivers a {fields, data:[[...]]} column/row shape; we normalize it into
 * objects with signed lat/lng (S/W are negative) for direct map consumption.
 */

const FIREBALL_URL = 'https://ssd-api.jpl.nasa.gov/fireball.api?limit=50&sort=-date';

interface Fireball {
  date: string;
  lat: number | null;
  lng: number | null;
  energy_kt: number | null;
  altitude: number | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const res = await fetch(FIREBALL_URL, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { fireballs: [], error: `CNEOS returned ${res.status}` },
        { status: 502 },
      );
    }
    const json = await res.json();
    const fields: string[] = Array.isArray(json?.fields) ? json.fields : [];
    const rows: unknown[][] = Array.isArray(json?.data) ? json.data : [];

    const idx = (name: string) => fields.indexOf(name);
    const iDate = idx('date');
    const iEnergy = idx('energy');
    const iLat = idx('lat');
    const iLatDir = idx('lat-dir');
    const iLon = idx('lon');
    const iLonDir = idx('lon-dir');
    const iAlt = idx('alt');

    const fireballs: Fireball[] = rows.map((row) => {
      let lat = num(row[iLat]);
      let lng = num(row[iLon]);
      if (lat !== null && row[iLatDir] === 'S') lat = -lat;
      if (lng !== null && row[iLonDir] === 'W') lng = -lng;
      return {
        date: String(row[iDate] ?? ''),
        lat,
        lng,
        energy_kt: num(row[iEnergy]),
        altitude: num(row[iAlt]),
      };
    });

    return NextResponse.json(
      { fireballs, count: fireballs.length, source: 'NASA/JPL CNEOS Fireball API' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[JARVIS] fireball bridge error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { fireballs: [], error: 'NASA CNEOS fireball feed unavailable' },
      { status: 502 },
    );
  }
}
