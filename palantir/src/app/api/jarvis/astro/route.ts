import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/**
 * JARVIS solar-system tracker bridge — the "SOLAR SYSTEM" panel seam.
 *
 * Surfaces the real-astronomy engine served by the FastAPI backend at
 * /v1/astro/* (planet ephemeris via astropy + bright-star catalogue) through a
 * single combined shape the SolarSystemTracker panel consumes. Mirrors the
 * graph/science bridge pattern: force-dynamic, JARVIS_API_BASE default,
 * AbortSignal timeout, no-store, try/catch returning a safe shape so a dead
 * backend (or a degraded astropy-less planet feed) never throws in the client.
 *
 *   GET /api/jarvis/astro            → { planets, planetsAvailable, stars, time }
 *   GET /api/jarvis/astro?when=...   → planets at a specific UTC time
 *
 * The NEO close-approach checker calls /v1/astro/neo directly through this same
 * proxy with ?neo=1&a=&e=.
 */

const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

function safeError() {
  return NextResponse.json(
    {
      error: 'JARVIS astro backend unavailable',
      planetsAvailable: false,
      planets: {},
      stars: {},
      time: '',
    },
    { status: 502 },
  );
}

export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 60, 60_000)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', planetsAvailable: false, planets: {}, stars: {}, time: '' },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(req.url);

  // ── NEO close-approach screen (forwarded as-is) ──
  if (searchParams.get('neo')) {
    const a = searchParams.get('a') ?? '1.5';
    const e = searchParams.get('e') ?? '0.4';
    const qs = new URLSearchParams({ a, e });
    try {
      const res = await fetch(`${JARVIS_API_BASE}/v1/astro/neo?${qs}`, {
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `JARVIS astro returned ${res.status}`, orbit: {}, approach: {} },
          { status: 502 },
        );
      }
      return NextResponse.json(await res.json(), {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      console.error('[JARVIS] astro neo bridge error:', e instanceof Error ? e.message : e);
      return NextResponse.json(
        { error: 'JARVIS astro backend unavailable', orbit: {}, approach: {} },
        { status: 502 },
      );
    }
  }

  // ── Combined planet + star snapshot ──
  const when = (searchParams.get('when') || '').trim();
  const planetsUrl = when
    ? `${JARVIS_API_BASE}/v1/astro/planets?when=${encodeURIComponent(when)}`
    : `${JARVIS_API_BASE}/v1/astro/planets`;

  try {
    const [planetsRes, starsRes] = await Promise.all([
      fetch(planetsUrl, { signal: AbortSignal.timeout(15000), cache: 'no-store' }),
      fetch(`${JARVIS_API_BASE}/v1/astro/stars`, { signal: AbortSignal.timeout(15000), cache: 'no-store' }),
    ]);

    const planetsData = planetsRes.ok ? await planetsRes.json() : {};
    const starsData = starsRes.ok ? await starsRes.json() : {};

    return NextResponse.json(
      {
        planetsAvailable: Boolean(planetsData?.available),
        planetsReason: planetsData?.reason ?? null,
        planets: planetsData?.planets ?? {},
        stars: starsData?.stars ?? {},
        time: planetsData?.time ?? when,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[JARVIS] astro bridge error:', e instanceof Error ? e.message : e);
    return safeError();
  }
}
