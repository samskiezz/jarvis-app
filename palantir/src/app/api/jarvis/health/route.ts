import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * APOLLO plane — unified-stack health.
 *
 * Aggregates the real health of every tier behind the single JARVIS·PALANTIR
 * surface so the "Apollo / production" plane reflects actual running state:
 *   - this Next surface (always ok if it answers)
 *   - the JARVIS brain (FastAPI /v1/graph backend)
 *   - the entity-resolution intel resolver
 *   - live-feed freshness (USGS earthquakes as a canary)
 */

const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';
const INTEL_URL = process.env.INTEL_URL || 'http://127.0.0.1:4000';

async function probe(name: string, url: string, ms = 6000) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
    return { name, ok: res.ok, status: res.status, latency_ms: Date.now() - started };
  } catch (e) {
    return { name, ok: false, status: 0, latency_ms: Date.now() - started, error: e instanceof Error ? e.message : 'unreachable' };
  }
}

export async function GET() {
  const [brain, intel, quakes] = await Promise.all([
    probe('jarvis_brain', `${JARVIS_API_BASE}/health`),
    probe('intel_resolver', `${INTEL_URL}/health`),
    probe('live_feeds', 'http://127.0.0.1:3000/api/earthquakes'),
  ]);

  const tiers = [{ name: 'surface', ok: true, status: 200, latency_ms: 0 }, brain, intel, quakes];
  const healthy = tiers.filter((t) => t.ok).length;
  const overall = healthy === tiers.length ? 'operational' : healthy >= tiers.length - 1 ? 'degraded' : 'down';

  return NextResponse.json(
    {
      plane: 'apollo',
      overall,
      healthy: `${healthy}/${tiers.length}`,
      tiers,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
