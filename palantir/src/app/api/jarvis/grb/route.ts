import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS gamma-ray-burst bridge — recent high-energy transient alerts for the
 * SOLAR SYSTEM panel.
 *
 * Source: NASA GCN (General Coordinates Network) circulars archive, the modern
 * public successor to the GCN classic notices. The archive index is served as
 * JSON via the site's Remix `_data` route, key-free:
 *   /circulars?_data=routes/circulars._archive._index&query=GRB
 *
 * The index gives circularId + subject per alert. We parse the burst name and the
 * reporting detector/instrument out of the subject and link back to the canonical
 * circular. RA/Dec are NOT present in the index (they live inside individual
 * circular bodies), so we do not fabricate coordinates — only fields actually
 * present in the feed are surfaced. Returns { available:false } if the feed is
 * unreachable rather than inventing data.
 */

const GCN_URL =
  'https://gcn.nasa.gov/circulars?_data=routes/circulars._archive._index&query=GRB&limit=20';
const GCN_BASE = 'https://gcn.nasa.gov/circulars/';

interface Burst {
  name: string;
  detector: string;
  subject: string;
  circularId: string;
  url: string;
  time: string;
}

// Pull a burst/transient designation (GRB 260616B, EP260623a, IceCube-260622A …).
function burstName(subject: string): string {
  const m = subject.match(/\b(GRB\s?\d{6}[A-Z]?|EP\d{6}[a-z]?|IceCube-\d{6}[A-Z]?|SGR\s?[\d.+-]+)\b/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : subject.split(':')[0].trim();
}

// The reporting instrument is the segment after the first colon, before the verb.
function detector(subject: string): string {
  const parts = subject.split(':');
  if (parts.length < 2) return '—';
  const tail = parts.slice(1).join(':').trim();
  const m = tail.match(/^([A-Za-z0-9/_+().\- ]{2,40}?)\s+(detection|observation|follow|optical|redshift|GRM|GBM|discovery)/i);
  return (m ? m[1] : tail.split(' ').slice(0, 3).join(' ')).trim() || '—';
}

export async function GET() {
  try {
    const res = await fetch(GCN_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { available: false, bursts: [], error: `GCN returned ${res.status}` },
        { status: 502 },
      );
    }
    const json = await res.json();
    const items: { circularId?: string | number; subject?: string }[] = Array.isArray(json?.items)
      ? json.items
      : [];

    const bursts: Burst[] = items
      .filter((it) => typeof it.subject === 'string')
      .map((it) => {
        const subject = String(it.subject);
        const id = String(it.circularId ?? '');
        return {
          name: burstName(subject),
          detector: detector(subject),
          subject,
          circularId: id,
          url: id ? `${GCN_BASE}${id}` : GCN_BASE,
          time: '',
        };
      });

    return NextResponse.json(
      { available: true, bursts, count: bursts.length, source: 'NASA GCN Circulars' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[JARVIS] grb bridge error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { available: false, bursts: [], error: 'NASA GCN burst feed unavailable' },
      { status: 502 },
    );
  }
}
