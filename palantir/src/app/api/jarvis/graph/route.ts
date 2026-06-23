import { NextResponse } from 'next/server';
import { isRateLimited, getClientIp } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/**
 * JARVIS ontology graph bridge — the "Foundry" brain seam.
 *
 * Surfaces the real JARVIS knowledge ontology (the 497k-object / 782k-link
 * graph in brain.db / ontology.db, served by the FastAPI backend at
 * /v1/graph/*) through the SAME `{ nodes, links }` contract the force-graph
 * UI already consumes for map-entity expansion.
 *
 *   GET /api/jarvis/graph                      → top-level ontology neighbourhood
 *   GET /api/jarvis/graph?id=<node_id>         → 1-hop expand of a node (click)
 *   GET /api/jarvis/graph?seeds=a,b&depth=1    → BFS subgraph from seeds
 *
 * JARVIS backend node:  { id, label, type, mark, props }
 * JARVIS backend edge:  { a, b, relation, strength }
 * UI node:              { id, label, type, group, val }
 * UI link:              { source, target, label, strength }
 */

const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';

type JarvisNode = { id?: string; label?: string; type?: string; mark?: string | null; props?: Record<string, unknown> };
type JarvisEdge = { a?: string; b?: string; relation?: string; strength?: number };

function translate(data: { nodes?: JarvisNode[]; edges?: JarvisEdge[] }) {
  const nodes = (data.nodes || []).map((n) => ({
    id: String(n.id ?? ''),
    label: String(n.label ?? n.id ?? ''),
    type: String(n.type ?? 'object').toLowerCase(),
    group: String(n.type ?? 'object'),
    val: 2,
  }));
  const links = (data.edges || [])
    .filter((e) => e.a && e.b)
    .map((e) => ({
      source: String(e.a),
      target: String(e.b),
      label: String(e.relation ?? ''),
      strength: typeof e.strength === 'number' ? e.strength : 1,
    }));
  return { nodes, links };
}

export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded', nodes: [], links: [] }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') || '').trim();
  const seeds = (searchParams.get('seeds') || '').trim();
  const depth = Math.max(0, Math.min(5, Number(searchParams.get('depth') || '1') || 1));

  let upstream: string;
  if (id) {
    upstream = `${JARVIS_API_BASE}/v1/graph/expand/${encodeURIComponent(id)}`;
  } else {
    const qs = new URLSearchParams({ seeds, depth: String(depth) });
    upstream = `${JARVIS_API_BASE}/v1/graph/subgraph?${qs}`;
  }

  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `JARVIS ontology returned ${res.status}`, nodes: [], links: [] },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(translate(data), {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (e) {
    console.error('[JARVIS] ontology bridge error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'JARVIS ontology backend unavailable', nodes: [], links: [] },
      { status: 502 },
    );
  }
}
