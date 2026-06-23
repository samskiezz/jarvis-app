import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Operator remediation proxy — forwards a restart request from the /nexus UI to
 * the JARVIS control plane. The backend gates this to localhost + registry-known
 * ids, so this same-origin proxy (running on this host) is the authorized path.
 */
const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${JARVIS_API_BASE}/v1/control/intervene`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'intervene proxy failed' },
      { status: 502 },
    );
  }
}
