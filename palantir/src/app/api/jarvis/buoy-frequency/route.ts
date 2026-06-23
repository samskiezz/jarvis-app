import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS buoy FREQUENCY monitor — reads REAL NOAA NDBC wave-frequency spectra.
 *
 * HONEST SCOPE: NDBC buoys broadcast wave-energy frequency spectra (m^2/Hz vs
 * Hz) and summary wave parameters — NOT hydrophone audio, NOT sonar, and there
 * is NO covert-submarine position feed anywhere in this data. The only things
 * plotted are real wave-frequency spectra and statistical spectral anomalies.
 *
 *   GET ?station=<id>  -> that station's real frequency spectrum
 *                         (.data_spec preferred, .spec dominant-freq fallback)
 *   GET (no station)   -> a capped roster of active stations with dominant
 *                         frequency + sig wave height, anomaly flags computed
 *                         by z-score over the sampled set. Anomalies are POSTed
 *                         to the existing /v1/acoustic/contact map layer.
 */

const JARVIS_API_BASE = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';
const NDBC_BASE = 'https://www.ndbc.noaa.gov/data/realtime2';

const ROSTER_SAMPLE_CAP = 30; // keep the roster fast
const ANOMALY_Z = 2.5; // z-score outlier threshold
const FETCH_TIMEOUT_MS = 12000;

interface Spectrum {
  station: string;
  frequencies: number[];
  densities: number[];
  dominant_freq_hz: number | null;
  dominant_period_s: number | null;
}

interface BuoyMeta {
  id: string;
  lat: number;
  lng: number;
}

// ── Parse the most-recent data row of an NDBC .data_spec table ──
// Row shape: YY MM DD hh mm Sep_Freq  d1 (f1) d2 (f2) ...
function parseDataSpec(station: string, text: string): Spectrum | null {
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) return null;
  const row = lines[0].trim();
  const pairRe = /([\d.+eE-]+)\s*\(([\d.+eE-]+)\)/g;
  const frequencies: number[] = [];
  const densities: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(row)) !== null) {
    const density = Number(m[1]);
    const freq = Number(m[2]);
    if (Number.isFinite(density) && Number.isFinite(freq)) {
      densities.push(density);
      frequencies.push(freq);
    }
  }
  if (frequencies.length === 0) return null;
  let peakIdx = 0;
  for (let i = 1; i < densities.length; i++) {
    if (densities[i] > densities[peakIdx]) peakIdx = i;
  }
  const dominant_freq_hz = frequencies[peakIdx] ?? null;
  return {
    station,
    frequencies,
    densities,
    dominant_freq_hz,
    dominant_period_s: dominant_freq_hz && dominant_freq_hz > 0 ? 1 / dominant_freq_hz : null,
  };
}

// ── Parse the most-recent data row of an NDBC .spec summary table ──
// Columns: YY MM DD hh mm WVHT SwH SwP WWH WWP SwD WWD STEEPNESS APD MWD
// DPD (dominant period) is not in .spec; we use APD (avg period) as the
// fallback dominant-period source, which gives a real dominant frequency.
function parseSpecSummary(text: string): { wvht: number | null; dpd: number | null } | null {
  const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) return null;
  const cols = lines[0].trim().split(/\s+/);
  if (cols.length < 15) return null;
  const wvht = Number(cols[5]);
  const apd = Number(cols[13]);
  return {
    wvht: Number.isFinite(wvht) && wvht !== 99 && wvht !== 999 ? wvht : null,
    dpd: Number.isFinite(apd) && apd !== 99 && apd !== 999 && apd > 0 ? apd : null,
  };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Single-station spectrum: .data_spec preferred, .spec fallback ──
async function getStationSpectrum(station: string): Promise<Spectrum | { error: string }> {
  const dataSpec = await fetchText(`${NDBC_BASE}/${station}.data_spec`);
  if (dataSpec) {
    const parsed = parseDataSpec(station, dataSpec);
    if (parsed) return parsed;
  }
  // Fallback: .spec gives a dominant period -> dominant frequency (no full spectrum)
  const spec = await fetchText(`${NDBC_BASE}/${station}.spec`);
  if (spec) {
    const s = parseSpecSummary(spec);
    if (s && s.dpd) {
      const dominant_freq_hz = 1 / s.dpd;
      return {
        station,
        frequencies: [dominant_freq_hz],
        densities: [s.wvht ?? 0],
        dominant_freq_hz,
        dominant_period_s: s.dpd,
      };
    }
  }
  return { error: `NDBC spectra unavailable for ${station}` };
}

// ── Roster: sample active stations, get dominant freq + wave height ──
interface RosterRow {
  station: string;
  lat: number;
  lng: number;
  dominant_freq_hz: number | null;
  sig_wave_height_m: number | null;
  anomaly: boolean;
}

async function getStationSummary(b: BuoyMeta): Promise<RosterRow | null> {
  const spec = await fetchText(`${NDBC_BASE}/${b.id}.spec`);
  if (!spec) return null;
  const s = parseSpecSummary(spec);
  if (!s) return null;
  return {
    station: b.id,
    lat: b.lat,
    lng: b.lng,
    dominant_freq_hz: s.dpd ? 1 / s.dpd : null,
    sig_wave_height_m: s.wvht,
    anomaly: false,
  };
}

function zFlag(values: number[]): (v: number) => boolean {
  const n = values.length;
  if (n < 4) return () => false;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std === 0) return () => false;
  return (v: number) => Math.abs((v - mean) / std) > ANOMALY_Z;
}

async function loadBuoyRoster(): Promise<BuoyMeta[]> {
  const res = await fetch(`${JARVIS_API_BASE}/v1/geo/layers/buoys/features`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const fc = await res.json();
  const feats = Array.isArray(fc.features) ? fc.features : [];
  return feats
    .map((f: { geometry?: { coordinates?: number[] }; properties?: { id?: string } }) => {
      const c = f.geometry?.coordinates;
      const id = f.properties?.id;
      if (!id || !Array.isArray(c) || c.length !== 2) return null;
      return { id: String(id), lng: Number(c[0]), lat: Number(c[1]) };
    })
    .filter((b: BuoyMeta | null): b is BuoyMeta => b !== null && Number.isFinite(b.lat) && Number.isFinite(b.lng));
}

// ── Push an anomalous buoy to the existing acoustic-contact map layer ──
async function postAnomalyContact(row: RosterRow): Promise<boolean> {
  try {
    const res = await fetch(`${JARVIS_API_BASE}/v1/acoustic/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: row.lat,
        lon: row.lng,
        label: `freq-anomaly ${row.station}`,
        classification: 'spectral-anomaly',
        confidence: 0.6,
        source: 'buoy-frequency',
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const station = searchParams.get('station');

  // ── Single-station real frequency spectrum ──
  if (station) {
    if (!/^[A-Za-z0-9]{1,8}$/.test(station)) {
      return NextResponse.json({ error: 'invalid station id' }, { status: 400 });
    }
    const result = await getStationSpectrum(station.toUpperCase());
    if ('error' in result) {
      return NextResponse.json(result, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }

  // ── Roster: capped sample of active stations + anomaly detection ──
  try {
    const buoys = await loadBuoyRoster();
    if (buoys.length === 0) {
      return NextResponse.json(
        { monitored: [], total: 0, anomaly_count: 0, error: 'buoy roster unavailable' },
        { status: 502 },
      );
    }
    const sample = buoys.slice(0, ROSTER_SAMPLE_CAP);
    const settled = await Promise.all(sample.map(getStationSummary));
    const rows = settled.filter((r): r is RosterRow => r !== null);

    const freqs = rows.map((r) => r.dominant_freq_hz).filter((v): v is number => v !== null);
    const heights = rows.map((r) => r.sig_wave_height_m).filter((v): v is number => v !== null);
    const isFreqOutlier = zFlag(freqs);
    const isHeightOutlier = zFlag(heights);

    const monitored = rows.map((r) => ({
      ...r,
      anomaly:
        (r.dominant_freq_hz !== null && isFreqOutlier(r.dominant_freq_hz)) ||
        (r.sig_wave_height_m !== null && isHeightOutlier(r.sig_wave_height_m)),
    }));

    const anomalies = monitored.filter((r) => r.anomaly);
    const posted = await Promise.all(anomalies.map(postAnomalyContact));
    const contacts_posted = posted.filter(Boolean).length;

    return NextResponse.json(
      {
        monitored,
        total: monitored.length,
        sampled: sample.length,
        roster_size: buoys.length,
        anomaly_count: anomalies.length,
        contacts_posted,
        anomaly_threshold_z: ANOMALY_Z,
        source: 'NOAA NDBC realtime2 (.spec wave-frequency summaries)',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { monitored: [], total: 0, anomaly_count: 0, error: e instanceof Error ? e.message : 'roster unavailable' },
      { status: 502 },
    );
  }
}
