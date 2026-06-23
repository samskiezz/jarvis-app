import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/**
 * JARVIS science-engine bridge — the "SCIENCE" console catalog.
 *
 * Surfaces the 14 curated science consoles (sonar, meteor, ocean_buoys, …)
 * served by the FastAPI backend at /v1/sci/domains. Mirrors the graph bridge
 * pattern: force-dynamic, JARVIS_API_BASE default, AbortSignal timeout,
 * no-store, try/catch returning a safe shape so a dead backend never throws
 * in the client.
 *
 *   GET /api/jarvis/sci  →  { available, total, domains:[…] }
 */

const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 60, 60_000)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', available: false, total: 0, domains: [] },
      { status: 429 },
    );
  }

  try {
    const res = await fetch(`${JARVIS_API_BASE}/v1/sci/domains`, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `JARVIS science returned ${res.status}`, available: false, total: 0, domains: [] },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (e) {
    console.error('[JARVIS] science bridge error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'JARVIS science backend unavailable', available: false, total: 0, domains: [] },
      { status: 502 },
    );
  }
}
