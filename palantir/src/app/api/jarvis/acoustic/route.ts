import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS acoustic-contacts bridge — plots operator/analyst-tagged acoustic
 * contacts from the JARVIS backend (/v1/acoustic/contacts) onto the Osiris map
 * as the `acoustic-contacts` layer.
 *
 * HONEST SCOPE: these contacts come from a general-audio classifier
 * (YAMNet, room-audio) plus human tagging — there is NO trained marine model.
 * The backend labels every contact `yamnet-general (marine model pending)`.
 */
const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

export async function GET() {
  try {
    const res = await fetch(`${JARVIS_API_BASE}/v1/acoustic/contacts`, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ acoustic_contacts: [], total: 0, error: `backend ${res.status}` }, { status: 502 });
    }
    const body = await res.json();
    const raw = Array.isArray(body.contacts) ? body.contacts : [];
    const acoustic_contacts = raw
      .filter((c: { lat?: number; lon?: number }) => typeof c?.lat === 'number' && typeof c?.lon === 'number')
      .map((c: { lat: number; lon: number; label?: string; classification?: string; confidence?: number; source?: string }) => ({
        lat: c.lat,
        lng: c.lon,
        label: c.label || c.classification || 'acoustic contact',
        classification: c.classification || '',
        confidence: typeof c.confidence === 'number' ? c.confidence : null,
        source: c.source || 'operator',
      }));
    return NextResponse.json(
      { acoustic_contacts, total: acoustic_contacts.length, model: body.model },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { acoustic_contacts: [], total: 0, error: e instanceof Error ? e.message : 'acoustic unavailable' },
      { status: 502 },
    );
  }
}
