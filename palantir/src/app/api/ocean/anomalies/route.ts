import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * OCEAN / SUBSURFACE acoustic-anomaly engine — ACOUSTIC DOMAIN ONLY.
 *
 * This route carries NO electromagnetic-spectrum / space data (no RF, X-ray,
 * gamma, solar, NEO, etc.). It fuses the existing ocean sibling routes
 * server-side and applies pure deterministic logic over REAL fetched values —
 * no randomness, no fabricated contacts. If an input route errors, that band is
 * marked degraded and we never manufacture detections to fill the gap.
 *
 * Three honest sections:
 *   1. darkContacts  — acoustic contacts (/api/jarvis/acoustic) with NO AIS
 *      vessel (/api/jarvis/vessels) within ~15 km. AIS here is Baltic-only, so a
 *      contact OUTSIDE that coverage box is "no AIS coverage", NOT a dark vessel.
 *   2. hydrophones   — Orcasound listening stations (/api/jarvis/hydrophones),
 *      metadata only. Classification, where present, is general-audio (YAMNet),
 *      NOT a marine/military-trained model — labelled honestly.
 *   3. waveAnomalies — NDBC buoy WAVE-energy spectral outliers
 *      (/api/jarvis/buoy-frequency), relabelled as ocean-wave/swell/storm
 *      geophysics — these are surface gravity waves (~0.03–0.5 Hz), NOT sound.
 */

const DARK_RADIUS_KM = 15; // no AIS vessel within this radius ⇒ candidate dark contact
const RADIUS_MIN_KM = 1;
const RADIUS_MAX_KM = 200;
const EARTH_RADIUS_KM = 6371;

// Digitraffic AIS only covers the Baltic Sea / Gulf of Finland. Outside this box
// there is no AIS at all, so absence of a nearby vessel means "no coverage", not
// "dark contact". This geofence is the single biggest correctness guard here.
const AIS_COVERAGE_BBOX = { minLat: 53, maxLat: 66, minLng: 9, maxLng: 30 };

interface AcousticContact {
  lat: number;
  lng: number;
  label: string;
  classification: string;
  confidence: number | null;
  source: string;
}

interface Vessel {
  mmsi: number;
  lat: number;
  lng: number;
  sog: number;
  cog: number;
}

interface Hydrophone {
  name: string;
  slug: string;
  lat: number;
  lng: number;
}

interface RosterRow {
  station: string;
  lat: number;
  lng: number;
  dominant_freq_hz: number | null;
  sig_wave_height_m: number | null;
  anomaly: boolean;
}

interface DarkContact {
  kind: 'dark_contact';
  lat: number;
  lng: number;
  label: string;
  classification: string;
  confidence: number | null;
  source: string;
  nearestVesselKm: number | null;
  nearestVesselMmsi: number | null;
  note: string;
}

interface WaveAnomaly {
  kind: 'wave_anomaly';
  station: string;
  lat: number;
  lng: number;
  dominant_freq_hz: number | null;
  dominant_period_s: number | null;
  sig_wave_height_m: number | null;
  note: string;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Great-circle distance in km between two lat/lng points. */
function haversineKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const toRad = Math.PI / 180;
  const dLat = (latB - latA) * toRad;
  const dLng = (lngB - lngA) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * toRad) * Math.cos(latB * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function inAisCoverage(lat: number, lng: number): boolean {
  return (
    lat >= AIS_COVERAGE_BBOX.minLat &&
    lat <= AIS_COVERAGE_BBOX.maxLat &&
    lng >= AIS_COVERAGE_BBOX.minLng &&
    lng <= AIS_COVERAGE_BBOX.maxLng
  );
}

/** Fetch a sibling route same-origin; returns null on any failure. */
async function fetchRoute(path: string, base: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, any>;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const base = request.url;
  const { searchParams } = new URL(request.url);

  // Optional tunable dark-contact radius — validated at the boundary. A missing or
  // non-numeric param must fall back to the default (note: Number(null) is 0, so we
  // check the raw string is present before parsing).
  const radiusRaw = searchParams.get('radius');
  const radiusParam = radiusRaw !== null && radiusRaw.trim() !== '' ? num(radiusRaw) : null;
  const radiusKm =
    radiusParam !== null ? clamp(radiusParam, RADIUS_MIN_KM, RADIUS_MAX_KM) : DARK_RADIUS_KM;

  const errors: string[] = [];

  const [acousticR, vesselsR, hydroR, buoyR] = await Promise.allSettled([
    fetchRoute('/api/jarvis/acoustic', base),
    fetchRoute('/api/jarvis/vessels', base),
    fetchRoute('/api/jarvis/hydrophones', base),
    fetchRoute('/api/jarvis/buoy-frequency', base),
  ]);

  const acousticBody = acousticR.status === 'fulfilled' ? acousticR.value : null;
  const vesselsBody = vesselsR.status === 'fulfilled' ? vesselsR.value : null;
  const hydroBody = hydroR.status === 'fulfilled' ? hydroR.value : null;
  const buoyBody = buoyR.status === 'fulfilled' ? buoyR.value : null;

  const inputs = {
    acoustic: acousticBody !== null,
    vessels: vesselsBody !== null,
    hydrophones: hydroBody !== null,
    buoyFrequency: buoyBody !== null,
  };
  if (!inputs.acoustic) errors.push('acoustic degraded');
  if (!inputs.vessels) errors.push('vessels degraded');
  if (!inputs.hydrophones) errors.push('hydrophones degraded');
  if (!inputs.buoyFrequency) errors.push('buoy-frequency degraded');

  // ── Inputs as typed arrays ──
  const contacts: AcousticContact[] = Array.isArray(acousticBody?.acoustic_contacts)
    ? (acousticBody!.acoustic_contacts as any[])
        .filter((c) => num(c?.lat) !== null && num(c?.lng) !== null)
        .map((c) => ({
          lat: Number(c.lat),
          lng: Number(c.lng),
          label: typeof c?.label === 'string' ? c.label : 'acoustic contact',
          classification: typeof c?.classification === 'string' ? c.classification : '',
          confidence: num(c?.confidence),
          source: typeof c?.source === 'string' ? c.source : 'operator',
        }))
    : [];

  const vessels: Vessel[] = Array.isArray(vesselsBody?.vessels)
    ? (vesselsBody!.vessels as any[])
        .filter((v) => num(v?.lat) !== null && num(v?.lng) !== null)
        .map((v) => ({
          mmsi: num(v?.mmsi) ?? 0,
          lat: Number(v.lat),
          lng: Number(v.lng),
          sog: num(v?.sog) ?? 0,
          cog: num(v?.cog) ?? 0,
        }))
    : [];

  const hydrophones: Hydrophone[] = Array.isArray(hydroBody?.hydrophones)
    ? (hydroBody!.hydrophones as any[])
        .filter((h) => num(h?.lat) !== null && num(h?.lng) !== null)
        .map((h) => ({
          name: typeof h?.name === 'string' ? h.name : 'unknown',
          slug: typeof h?.slug === 'string' ? h.slug : '',
          lat: Number(h.lat),
          lng: Number(h.lng),
        }))
    : [];

  const roster: RosterRow[] = Array.isArray(buoyBody?.monitored)
    ? (buoyBody!.monitored as any[]).map((r) => ({
        station: typeof r?.station === 'string' ? r.station : '',
        lat: num(r?.lat) ?? NaN,
        lng: num(r?.lng) ?? NaN,
        dominant_freq_hz: num(r?.dominant_freq_hz),
        sig_wave_height_m: num(r?.sig_wave_height_m),
        anomaly: r?.anomaly === true,
      }))
    : [];

  // ── 1. DARK CONTACTS ──
  // A missing vessel feed must not manufacture submarines: if the vessels band is
  // degraded, we do not emit dark contacts at all.
  const darkContacts: DarkContact[] = [];
  if (inputs.vessels) {
    for (const c of contacts) {
      if (!inAisCoverage(c.lat, c.lng)) {
        // Outside AIS coverage — absence of vessels is a coverage gap, not a dark contact.
        continue;
      }
      let minKm = Infinity;
      let nearestMmsi: number | null = null;
      for (const v of vessels) {
        const d = haversineKm(c.lat, c.lng, v.lat, v.lng);
        if (d < minKm) {
          minKm = d;
          nearestMmsi = v.mmsi || null;
        }
      }
      const nearestKm = Number.isFinite(minKm) ? minKm : null;
      if (nearestKm === null || nearestKm > radiusKm) {
        darkContacts.push({
          kind: 'dark_contact',
          lat: c.lat,
          lng: c.lng,
          label: c.label,
          classification: c.classification,
          confidence: c.confidence,
          source: c.source,
          nearestVesselKm: nearestKm,
          nearestVesselMmsi: nearestKm === null ? null : nearestMmsi,
          note: `acoustic signature with no AIS vessel currently reported within ${radiusKm} km — possible submarine / dark ship (AIS coverage here is Baltic-only)`,
        });
      }
    }
  }

  // ── 2. HYDROPHONE LISTENING ──
  // Metadata only. Match each station to any acoustic classification near it, but
  // label honestly: this is a general-audio classifier, not a marine model.
  const acousticModel =
    typeof acousticBody?.model === 'string'
      ? acousticBody.model
      : 'yamnet-general (marine model pending)';
  const hydrophoneList = hydrophones.map((h) => {
    let nearest: AcousticContact | null = null;
    let nearestKm = Infinity;
    for (const c of contacts) {
      const d = haversineKm(h.lat, h.lng, c.lat, c.lng);
      if (d < nearestKm) {
        nearestKm = d;
        nearest = c;
      }
    }
    return {
      name: h.name,
      slug: h.slug,
      lat: h.lat,
      lng: h.lng,
      nearestContactKm: Number.isFinite(nearestKm) ? nearestKm : null,
      classification: nearest ? nearest.classification || 'unknown' : null,
      classifierModel: acousticModel,
      note: 'live underwater listening station — classification (if any) is general-audio (whale/vessel/mechanical/unknown), NOT a marine/military-trained model',
    };
  });

  // ── 3. WAVE-SPECTRA ANOMALIES (geophysics, NOT sound) ──
  const waveAnomalies: WaveAnomaly[] = roster
    .filter((r) => r.anomaly && r.station)
    .map((r) => ({
      kind: 'wave_anomaly',
      station: r.station,
      lat: Number.isFinite(r.lat) ? r.lat : 0,
      lng: Number.isFinite(r.lng) ? r.lng : 0,
      dominant_freq_hz: r.dominant_freq_hz,
      dominant_period_s:
        r.dominant_freq_hz && r.dominant_freq_hz > 0 ? 1 / r.dominant_freq_hz : null,
      sig_wave_height_m: r.sig_wave_height_m,
      note: 'NDBC wave-energy spectral outlier — ocean swell/storm/tsunami surface-gravity-wave geophysics (~0.03–0.5 Hz), NOT hydrophone/sonar sound',
    }));

  // Reconcile the buoy counts honestly: positions tracked vs spectra actually sampled.
  const spectraSampled = num(buoyBody?.total);
  const stationsTracked = num(buoyBody?.roster_size);

  const body = {
    darkContacts,
    hydrophones: hydrophoneList,
    waveAnomalies,
    counts: {
      stationsTracked: stationsTracked, // ~1360 NDBC positions exist; backend roster is capped (200)
      spectraSampled: spectraSampled, // how many stations returned a usable wave spectrum this run
      hydrophones: hydrophoneList.length,
      darkContacts: darkContacts.length,
      waveAnomalies: waveAnomalies.length,
      vesselsInView: vessels.length,
      acousticContacts: contacts.length,
    },
    radiusKm,
    aisCoverage: 'Baltic Sea / Gulf of Finland (Digitraffic) — dark-contact test only applies inside this box',
    inputs,
    updated: new Date().toISOString(),
    sources: {
      acoustic: 'JARVIS backend /v1/acoustic/contacts (YAMNet general-audio + operator tags; marine model pending)',
      vessels: 'Digitraffic AIS (Baltic Sea / Gulf of Finland)',
      hydrophones: 'Orcasound (live.orcasound.net) — listening stations, metadata only',
      buoyFrequency: 'NOAA NDBC realtime2 wave-energy spectra (.spec / .data_spec) — geophysics, NOT sound',
    },
    notes: [
      'ACOUSTIC DOMAIN ONLY — no electromagnetic-spectrum / space data in this route.',
      'Dark-contact detection requires AIS, which is Baltic-only; contacts outside that box are excluded (no coverage), not flagged as dark.',
      'No trained marine/sonar classifier exists; hydrophone classification is general-audio.',
      'Wave anomalies are surface-gravity-wave geophysics, categorically not sound.',
    ],
    ...(errors.length ? { errors } : {}),
  };

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
