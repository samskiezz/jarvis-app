import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/**
 * JARVIS science-engine bridge — per-console methods, examples, and run.
 *
 * Mirrors the graph bridge pattern (force-dynamic, JARVIS_API_BASE default,
 * AbortSignal timeout, no-store, safe try/catch shape).
 *
 *   GET  /api/jarvis/sci/{domain}              → { id, label, methods:[…] }
 *   GET  /api/jarvis/sci/{domain}?examples=1   → { id, examples:[{field,value}] }
 *   POST /api/jarvis/sci/{domain}              → run result (body: { field, value })
 */

const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

function safeDomain(domain: string): string {
  // Console ids are lowercase ascii words/underscores — reject anything else
  // so a crafted segment cannot escape into the upstream path.
  return /^[a-z0-9_]{1,40}$/.test(domain) ? domain : '';
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded', methods: [], examples: [] }, { status: 429 });
  }

  const { domain } = await params;
  const id = safeDomain(domain);
  if (!id) {
    return NextResponse.json({ error: 'Invalid console id', methods: [], examples: [] }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const wantExamples = searchParams.get('examples') === '1';
  const upstream = wantExamples
    ? `${JARVIS_API_BASE}/v1/sci/domains/${id}/examples`
    : `${JARVIS_API_BASE}/v1/sci/domains/${id}/methods`;

  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `JARVIS science returned ${res.status}`, methods: [], examples: [] },
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
      { error: 'JARVIS science backend unavailable', methods: [], examples: [] },
      { status: 502 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 30, 60_000)) {
    return NextResponse.json({ status: 'error', error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { domain } = await params;
  const id = safeDomain(domain);
  if (!id) {
    return NextResponse.json({ status: 'error', error: 'Invalid console id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Invalid JSON body' }, { status: 400 });
  }

  const field = typeof (body as { field?: unknown })?.field === 'string'
    ? (body as { field: string }).field
    : '';
  if (!field) {
    return NextResponse.json({ status: 'error', error: 'Missing method field' }, { status: 400 });
  }
  const rawValue = (body as { value?: unknown })?.value;
  const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : undefined;

  try {
    const res = await fetch(`${JARVIS_API_BASE}/v1/sci/domains/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch (e) {
    console.error('[JARVIS] science run error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { status: 'error', error: 'JARVIS science backend unavailable' },
      { status: 502 },
    );
  }
}
