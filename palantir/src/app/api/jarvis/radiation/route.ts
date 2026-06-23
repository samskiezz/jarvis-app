import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * JARVIS space-radiation bridge — the "waves in space" feed for the SOLAR SYSTEM panel.
 *
 * Pulls real-time solar/geomagnetic radiation from NOAA's Space Weather Prediction
 * Center (SWPC). All four feeds are public and key-free:
 *   • GOES primary X-ray flux  (0.1–0.8 nm long channel → flare class A/B/C/M/X)
 *   • GOES integral proton flux (>=10 MeV → radiation-storm S-scale driver)
 *   • Real-time solar-wind plasma (speed km/s)
 *   • Planetary K-index (Kp → geomagnetic G-scale storm level)
 *
 * Mirrors the space-weather route style: AbortSignal.timeout, Promise.allSettled so
 * one dead feed never blanks the rest, and a safe shape on total failure.
 */

const XRAY_URL = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json';
const PROTON_URL = 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json';
const PLASMA_URL = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json';
const KP_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

// GOES long-channel (0.1–0.8 nm) peak flux → NOAA flare class letter.
function xrayClass(flux: number): string {
  if (!Number.isFinite(flux) || flux <= 0) return '—';
  if (flux >= 1e-4) return `X${(flux / 1e-4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux / 1e-5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux / 1e-7).toFixed(1)}`;
  return `A${(flux / 1e-8).toFixed(1)}`;
}

function stormFromKp(kp: number): { level: string; color: string } {
  if (kp >= 8) return { level: 'Extreme (G5)', color: '#FF1744' };
  if (kp >= 7) return { level: 'Severe (G4)', color: '#FF3D3D' };
  if (kp >= 6) return { level: 'Strong (G3)', color: '#FF9500' };
  if (kp >= 5) return { level: 'Moderate (G2)', color: '#FFD700' };
  if (kp >= 4) return { level: 'Minor (G1)', color: '#FFD700' };
  if (kp >= 3) return { level: 'Unsettled', color: '#D4AF37' };
  return { level: 'Quiet', color: '#00E676' };
}

const SAFE = {
  xray_class: '—',
  xray_flux: 0,
  proton_flux: 0,
  solar_wind_speed: 0,
  kp: 0,
  storm_level: 'Unknown',
  storm_color: '#555',
  timestamp: '',
};

export async function GET() {
  try {
    const [xrayRes, protonRes, plasmaRes, kpRes] = await Promise.allSettled([
      fetch(XRAY_URL, { signal: AbortSignal.timeout(8000), cache: 'no-store' }).then((r) => r.json()),
      fetch(PROTON_URL, { signal: AbortSignal.timeout(8000), cache: 'no-store' }).then((r) => r.json()),
      fetch(PLASMA_URL, { signal: AbortSignal.timeout(8000), cache: 'no-store' }).then((r) => r.json()),
      fetch(KP_URL, { signal: AbortSignal.timeout(8000), cache: 'no-store' }).then((r) => r.json()),
    ]);

    // ── X-ray: take latest long-channel (0.1–0.8 nm) sample ──
    let xrayFlux = 0;
    let xrayTime = '';
    if (xrayRes.status === 'fulfilled' && Array.isArray(xrayRes.value)) {
      const long = xrayRes.value.filter((d: { energy?: string }) => d.energy === '0.1-0.8nm');
      const latest = long[long.length - 1];
      if (latest && typeof latest.flux === 'number') {
        xrayFlux = latest.flux;
        xrayTime = latest.time_tag || '';
      }
    }

    // ── Protons: latest >=10 MeV integral flux ──
    let protonFlux = 0;
    if (protonRes.status === 'fulfilled' && Array.isArray(protonRes.value)) {
      const p10 = protonRes.value.filter((d: { energy?: string }) => d.energy === '>=10 MeV');
      const latest = p10[p10.length - 1];
      if (latest && typeof latest.flux === 'number') protonFlux = latest.flux;
    }

    // ── Solar wind: latest plasma speed (array-of-arrays with header row) ──
    let solarWindSpeed = 0;
    if (plasmaRes.status === 'fulfilled' && Array.isArray(plasmaRes.value) && plasmaRes.value.length > 1) {
      const last = plasmaRes.value[plasmaRes.value.length - 1];
      if (Array.isArray(last)) {
        const speed = Number(last[2]);
        if (Number.isFinite(speed)) solarWindSpeed = speed;
      }
    }

    // ── Kp: latest planetary K-index (array of {time_tag, Kp} objects) ──
    let kp = 0;
    if (kpRes.status === 'fulfilled' && Array.isArray(kpRes.value) && kpRes.value.length > 0) {
      const last = kpRes.value[kpRes.value.length - 1];
      const k = Number(last?.Kp ?? last?.kp_index);
      if (Number.isFinite(k)) kp = k;
    }

    const storm = stormFromKp(kp);

    return NextResponse.json(
      {
        xray_class: xrayClass(xrayFlux),
        xray_flux: xrayFlux,
        proton_flux: protonFlux,
        solar_wind_speed: solarWindSpeed,
        kp,
        storm_level: storm.level,
        storm_color: storm.color,
        timestamp: xrayTime || new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[JARVIS] radiation bridge error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ...SAFE, error: 'NOAA SWPC radiation feed unavailable' }, { status: 502 });
  }
}
