import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Nexus operator-view proxy. Same-origin bridge from the :3000 surface to the
 * JARVIS control plane (/v1/control/state) so the browser can render the live
 * collective without a cross-origin call. Mirrors the api/jarvis/* pattern.
 */
const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

const EMPTY = { services: { count: 0, alive: 0, roster: [] }, latest_snapshot: null, recent_events: [] };

export async function GET() {
  try {
    const res = await fetch(`${JARVIS_API_BASE}/v1/control/state`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ ...EMPTY, error: `backend ${res.status}` }, { status: 502 });
    }
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { ...EMPTY, error: e instanceof Error ? e.message : 'nexus backend unavailable' },
      { status: 502 },
    );
  }
}
