import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * NASA DONKI — the multi-band solar-event database (CME, FLR flares, GST geomagnetic
 * storms, SEP particles, IPS shocks, RBE radiation belt, HSS high-speed streams).
 * 30-day window. Uses NASA_API_KEY when present, else DEMO_KEY (~30/hr — hence the
 * 1h server cache). Per-type 429/failure → that array is [] and the type is recorded
 * in `errors`; values are never fabricated. Shape matches audit/SPECTRUM_SCHEMA.md so
 * /api/spectrum/correlate can fuse it.
 */
const KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const BASE = 'https://api.nasa.gov/DONKI';
const TYPES = ['CME', 'FLR', 'GST', 'SEP', 'IPS', 'RBE', 'HSS'] as const;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchType(type: string, start: string, end: string): Promise<{ data: any[]; error?: string }> {
  try {
    const res = await fetch(`${BASE}/${type}?startDate=${start}&endDate=${end}&api_key=${KEY}`, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    if (!res.ok) return { data: [], error: `${type} ${res.status === 429 ? 'over_rate_limit' : res.status}` };
    const json = await res.json();
    return { data: Array.isArray(json) ? json : [] };
  } catch (e) {
    return { data: [], error: `${type} ${e instanceof Error ? e.message : 'failed'}` };
  }
}

export async function GET() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = start.toISOString().slice(0, 10);

  const results = await Promise.all(TYPES.map((t) => fetchType(t, startDate, endDate)));
  const byType: Record<string, { data: any[]; error?: string }> = {};
  TYPES.forEach((t, i) => { byType[t] = results[i]; });
  const errors = TYPES.map((t) => byType[t].error).filter(Boolean) as string[];

  const cme = byType.CME.data.map((c: any) => {
    const analyses = Array.isArray(c?.cmeAnalyses) ? c.cmeAnalyses : [];
    const best = analyses.find((a: any) => a?.isMostAccurate) || analyses[analyses.length - 1] || null;
    return {
      id: String(c?.activityID ?? ''),
      startTime: String(c?.startTime ?? ''),
      sourceLocation: String(c?.sourceLocation ?? ''),
      activeRegion: num(c?.activeRegionNum),
      speed: best ? num(best?.speed) : null,
      halfAngle: best ? num(best?.halfAngle) : null,
      type: best && best?.type != null ? String(best.type) : null,
      note: String(c?.note ?? ''),
      link: String(c?.link ?? ''),
    };
  });

  const flr = byType.FLR.data.map((f: any) => ({
    id: String(f?.flrID ?? ''),
    classType: String(f?.classType ?? ''),
    beginTime: String(f?.beginTime ?? ''),
    peakTime: String(f?.peakTime ?? ''),
    endTime: f?.endTime != null ? String(f.endTime) : null,
    sourceLocation: String(f?.sourceLocation ?? ''),
    activeRegion: num(f?.activeRegionNum),
    link: String(f?.link ?? ''),
  }));

  const gst = byType.GST.data.map((g: any) => {
    const kps = Array.isArray(g?.allKpIndex) ? g.allKpIndex : [];
    let maxKp: number | null = null;
    for (const k of kps) {
      const v = num(k?.kpIndex);
      if (v !== null && (maxKp === null || v > maxKp)) maxKp = v;
    }
    return { id: String(g?.gstID ?? ''), startTime: String(g?.startTime ?? ''), maxKp, kpReadings: kps.length, link: String(g?.link ?? '') };
  });

  const sep = byType.SEP.data.map((s: any) => ({ id: String(s?.sepID ?? ''), eventTime: String(s?.eventTime ?? ''), link: String(s?.link ?? '') }));
  const ips = byType.IPS.data.map((s: any) => ({ id: String(s?.activityID ?? ''), location: String(s?.location ?? ''), eventTime: String(s?.eventTime ?? ''), link: String(s?.link ?? '') }));
  const rbe = byType.RBE.data.map((s: any) => ({ id: String(s?.rbeID ?? ''), eventTime: String(s?.eventTime ?? ''), link: String(s?.link ?? '') }));
  const hss = byType.HSS.data.map((s: any) => ({ id: String(s?.hssID ?? ''), eventTime: String(s?.eventTime ?? ''), link: String(s?.link ?? '') }));

  return NextResponse.json(
    {
      cme, flr, gst, sep, ips, rbe, hss,
      window: { startDate, endDate },
      updated: new Date().toISOString(),
      source: 'NASA DONKI (api.nasa.gov/DONKI)',
      ...(errors.length ? { errors } : {}),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
  );
}
