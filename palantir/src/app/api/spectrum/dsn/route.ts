import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * NASA Deep Space Network (DSN Now) — live deep-space RF/signal band.
 * Parses eyes.nasa.gov/dsn/data/dsn.xml (a flat <dsn> sequence of self-closing
 * <station> tags each followed by their <dish> blocks) into grouped stations.
 * No XML dependency: the feed is a stable, well-formed attribute-only shape, so
 * a scoped regex tokenizer is sufficient. On upstream failure the route returns
 * an empty stations list + an honest error string, never fabricated links.
 */
const DSN_URL = 'https://eyes.nasa.gov/dsn/data/dsn.xml';

type Direction = 'down' | 'up';

interface DsnDish {
  spacecraft: string;
  direction: Direction;
  band: string | null;          // X / S / Ka / K — the meaningful RF descriptor
  active: boolean;              // whether the link is carrying signal right now
  signalType: string | null;   // "data" | "carrier" | "none"
  frequencyHz: number | null;  // NOTE: NASA's public DSN Now feed reports 0 for all signals
  dataRateBps: number | null;  // real (e.g. 2,500,000 bps)
  powerDbm: number | null;
}

interface DsnStation {
  name: string;
  friendlyName: string;
  dishes: DsnDish[];
}

interface DsnResponse {
  stations: DsnStation[];
  updated: string;
  source: 'NASA DSN Now';
  error?: string;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function numOrNull(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSignals(dishBlock: string): DsnDish[] {
  const signals: DsnDish[] = [];
  const signalRe = /<(up|down)Signal\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = signalRe.exec(dishBlock)) !== null) {
    const direction: Direction = m[1] === 'up' ? 'up' : 'down';
    const tag = m[2];
    const spacecraft = attr(tag, 'spacecraft');
    signals.push({
      spacecraft: spacecraft ?? 'unknown',
      direction,
      band: attr(tag, 'band'),
      active: attr(tag, 'active') === 'true',
      signalType: attr(tag, 'signalType'),
      frequencyHz: numOrNull(attr(tag, 'frequency')),
      dataRateBps: numOrNull(attr(tag, 'dataRate')),
      powerDbm: numOrNull(attr(tag, 'power')),
    });
  }
  return signals;
}

function parseDsn(xml: string): DsnStation[] {
  const stations: DsnStation[] = [];
  // Walk the document in order: each self-closing <station .../> starts a new
  // station; every <dish>...</dish> block until the next station belongs to it.
  const tokenRe = /<station\b([^>]*?)\/>|<dish\b([^>]*?)>([\s\S]*?)<\/dish>/g;
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(xml)) !== null) {
    if (token[1] !== undefined) {
      const stationTag = token[1];
      stations.push({
        name: attr(stationTag, 'name') ?? 'unknown',
        friendlyName: attr(stationTag, 'friendlyName') ?? '',
        dishes: [],
      });
      continue;
    }
    if (stations.length === 0) continue;
    const dishBlock = token[3] ?? '';
    const current = stations[stations.length - 1];
    for (const sig of parseSignals(dishBlock)) {
      current.dishes.push(sig);
    }
  }
  return stations;
}

export async function GET() {
  const now = new Date().toISOString();
  try {
    const res = await fetch(DSN_URL, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) {
      const body: DsnResponse = {
        stations: [],
        updated: now,
        source: 'NASA DSN Now',
        error: `dsn ${res.status}`,
      };
      return NextResponse.json(body, { status: 502 });
    }
    const xml = await res.text();
    const stations = parseDsn(xml);
    const body: DsnResponse = { stations, updated: now, source: 'NASA DSN Now' };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (e) {
    const body: DsnResponse = {
      stations: [],
      updated: now,
      source: 'NASA DSN Now',
      error: e instanceof Error ? e.message : 'dsn unavailable',
    };
    return NextResponse.json(body, { status: 502 });
  }
}
