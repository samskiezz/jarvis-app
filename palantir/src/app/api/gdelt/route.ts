import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const dynamic = 'force-dynamic';

/**
 * OSIRIS — Real-Time Geopolitical Events (GDELT 2.0 GeoJSON API)
 * Source: GDELT Project — completely free, no auth required
 * Replaces the old RSS scraper with actual GDELT geo-coded events.
 */

export async function GET() {
  try {
    // GDELT GEO 2.0 API — returns real events with actual coordinates
    const queries = [
      'protest OR riot OR unrest',
      'conflict OR military OR attack OR strike',
      'coup OR revolution OR emergency',
    ];
    
    const allEvents: any[] = [];
    let eventId = 0;

    for (const query of queries) {
      try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodedQuery}&format=GeoJSON&timespan=24h&maxpoints=100`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const geojson = await Promise.race([
          (async () => {
            const res = await stealthFetch(url, { signal: controller.signal, cache: 'no-store' });
            if (!res.ok) throw new Error('Not OK');
            return await res.json();
          })(),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GDELT Timeout')), 5000))
        ]).finally(() => clearTimeout(timeoutId));

        if (!geojson?.features) continue;

        for (const feature of geojson.features) {
          const coords = feature.geometry?.coordinates;
          if (!coords || coords.length < 2) continue;

          const props = feature.properties || {};
          const name = props.name || props.html?.replace(/<[^>]*>/g, '').slice(0, 120) || 'GDELT Event';
          const url = props.url || props.shareimage || '';

          // Deduplicate by proximity (within 0.5 degrees)
          const isDupe = allEvents.some(e => 
            Math.abs(e.lat - coords[1]) < 0.5 && Math.abs(e.lng - coords[0]) < 0.5 && e.name === name
          );
          if (isDupe) continue;

          allEvents.push({
            id: `gdelt-${eventId++}`,
            lat: coords[1],
            lng: coords[0],
            name,
            url,
            html: props.html || '',
            type: query.includes('protest') ? 'unrest' : query.includes('conflict') ? 'conflict' : 'political',
            count: props.count || 1,
            shareimage: props.shareimage || '',
          });
        }
      } catch {
        // Individual query failure is non-fatal
      }
    }

    // Fail honest: never fabricate events. Return empty when upstream is unavailable.
    // (Previously this block generated synthetic incidents at random coordinates.)

    return NextResponse.json({
      events: allEvents,
      total: allEvents.length,
      timestamp: new Date().toISOString(),
      source: 'GDELT 2.0 GeoJSON API',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[OSIRIS] GDELT fetch error:', error);
    return NextResponse.json({ events: [], total: 0, error: 'GDELT unavailable' }, { status: 500 });
  }
}
