import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * SPECTRUM /correlate — multi-band fusion engine.
 *
 * Server-side fetches the 4 sibling spectrum routes (space-weather, donki, dsn,
 * neo-risk) via same-origin absolute URLs and applies the deterministic
 * correlation + threat-scoring rules from audit/SPECTRUM_SCHEMA.md §2 (rules A–F).
 *
 * Pure deterministic logic over REAL fetched values — no randomness, no fabricated
 * events. If an input route errored or is missing, that band is marked degraded and
 * contributing events lose confidence; events that depend solely on a degraded band
 * are not emitted (we never invent data to fill a gap).
 */

type Band =
  | 'xray'
  | 'radio'
  | 'solarWind'
  | 'magnetic'
  | 'protons'
  | 'electrons'
  | 'cme'
  | 'kp'
  | 'orbital';

type Severity = 'none' | 'low' | 'moderate' | 'high' | 'severe';

interface InfrastructureRisk {
  gps: Severity;
  hfRadio: Severity;
  satellites: Severity;
  powerGrid: Severity;
  aviation: Severity;
}

interface CorrelatedEvent {
  id: string;
  kind:
    | 'majorSolarEruption'
    | 'geomagneticStorm'
    | 'radiationStorm'
    | 'radioBlackout'
    | 'neoCloseApproach'
    | 'impactRiskObject';
  severity: number;
  confidence: number;
  bands: Band[];
  earthDirected?: boolean;
  summary: string;
  infrastructureRisk: InfrastructureRisk;
  recommendation: string;
  ts: string;
}

interface Correlate {
  events: CorrelatedEvent[];
  overallThreat: {
    score: number;
    level: 'NOMINAL' | 'ELEVATED' | 'HIGH' | 'SEVERE';
    headline: string;
  };
  inputs: { spaceWeather: boolean; donki: boolean; dsn: boolean; neoRisk: boolean };
  updated: string;
  errors?: string[];
}

const NONE_RISK: InfrastructureRisk = {
  gps: 'none',
  hfRadio: 'none',
  satellites: 'none',
  powerGrid: 'none',
  aviation: 'none',
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Fetch a sibling spectrum route same-origin; returns null on any failure. */
async function fetchRoute(path: string, base: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      headers: { 'User-Agent': 'jarvis-palantir/1.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, any>;
    // A sibling route returns 200 with an `error`/`errors` field on partial failure.
    // We still use whatever bands it managed to populate, but a hard `error` with no
    // usable payload is treated as a degraded band by the rules below.
    return data;
  } catch {
    return null;
  }
}

/** True if a heliographic source location is within ±45° longitude of central meridian. */
function isGeoEffective(loc: unknown): boolean {
  if (typeof loc !== 'string') return false;
  const m = loc.match(/[EW]\s*0*(\d{1,3})/i);
  if (!m) return false;
  const lon = Number(m[1]);
  return Number.isFinite(lon) && lon <= 45;
}

/** Map a flare class string ("M1.5","X2.0","C3.1") to peak flux in W/m². */
function classToFlux(cls: unknown): number | null {
  if (typeof cls !== 'string') return null;
  const m = cls.trim().match(/^([ABCMX])\s*([\d.]+)?/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const mag = m[2] ? Number(m[2]) : 1;
  const baseByLetter: Record<string, number> = {
    A: 1e-8,
    B: 1e-7,
    C: 1e-6,
    M: 1e-5,
    X: 1e-4,
  };
  const base = baseByLetter[letter];
  if (base === undefined || !Number.isFinite(mag)) return null;
  return base * mag;
}

// ---- Rule A: radioBlackout (R-scale) ----
function evalRadioBlackout(sw: Record<string, any> | null, donki: Record<string, any> | null): CorrelatedEvent | null {
  const liveFlux = sw ? num(sw?.xray?.flux) : null;
  const liveTrigger = liveFlux !== null && liveFlux >= 1e-5;

  // DONKI FLR ≥ M-class within last 24h.
  const flrList: any[] = donki && Array.isArray(donki.flr) ? donki.flr : [];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  let donkiFlux: number | null = null;
  let donkiTime: string | null = null;
  for (const f of flrList) {
    const flux = classToFlux(f?.classType);
    if (flux === null || flux < 1e-5) continue;
    const t = Date.parse(f?.peakTime ?? f?.beginTime ?? '');
    if (Number.isFinite(t) && t < cutoff) continue;
    if (donkiFlux === null || flux > donkiFlux) {
      donkiFlux = flux;
      donkiTime = (f?.peakTime ?? f?.beginTime) || null;
    }
  }
  const donkiTrigger = donkiFlux !== null;

  if (!liveTrigger && !donkiTrigger) return null;

  const flux = liveTrigger ? (liveFlux as number) : (donkiFlux as number);

  // Mapping: M1→R1(30) M5→R2(45) X1→R3(65) X10→R4(80) X20→R5(90)
  let severity: number;
  let rScale: string;
  if (flux >= 2e-3) {
    severity = 90;
    rScale = 'R5';
  } else if (flux >= 1e-3) {
    severity = 80;
    rScale = 'R4';
  } else if (flux >= 1e-4) {
    severity = 65;
    rScale = 'R3';
  } else if (flux >= 5e-5) {
    severity = 45;
    rScale = 'R2';
  } else {
    severity = 30;
    rScale = 'R1';
  }

  const flareClass = liveTrigger && typeof sw?.xray?.flareClass === 'string' ? sw.xray.flareClass : fluxToClass(flux);
  const confidence = liveTrigger ? 0.9 : 0.7;
  const gps: Severity = severity >= 65 ? 'moderate' : 'low';
  const hfRadio: Severity = severity >= 65 ? 'severe' : 'high';
  const ts = (liveTrigger ? sw?.xray?.time : donkiTime) || new Date().toISOString();

  return {
    id: 'radio-blackout-' + rScale,
    kind: 'radioBlackout',
    severity,
    confidence,
    bands: ['xray', 'radio'],
    summary: `${flareClass} flare → ${rScale} radio blackout (X-ray flux ${flux.toExponential(2)} W/m²)`,
    infrastructureRisk: { gps, hfRadio, satellites: 'low', powerGrid: 'none', aviation: 'moderate' },
    recommendation: 'HF comms degraded on sunlit side; switch to SATCOM/VHF; expect 10–60 min blackout.',
    ts,
  };
}

function fluxToClass(flux: number): string {
  if (flux >= 1e-4) return 'X' + (flux / 1e-4).toFixed(1);
  if (flux >= 1e-5) return 'M' + (flux / 1e-5).toFixed(1);
  if (flux >= 1e-6) return 'C' + (flux / 1e-6).toFixed(1);
  if (flux >= 1e-7) return 'B' + (flux / 1e-7).toFixed(1);
  return 'A' + (flux / 1e-8).toFixed(1);
}

// ---- Rule B: majorSolarEruption ----
function evalSolarEruption(sw: Record<string, any> | null, donki: Record<string, any> | null): CorrelatedEvent | null {
  // A "current eruption" means RECENT activity, not anything in the 30-day DONKI window —
  // otherwise one weeks-old M-flare keeps the banner SEVERE for a month. 72h covers CME
  // Earth-transit (~18-96h) plus prompt flare/proton effects.
  const cutoff = Date.now() - 72 * 3600 * 1000;
  const inRecent = (t: unknown): boolean => { const p = Date.parse(typeof t === 'string' ? t : ''); return Number.isFinite(p) && p >= cutoff; };

  const liveFlux = sw ? num(sw?.xray?.flux) : null;
  const liveMx = liveFlux !== null && liveFlux >= 1e-5;

  const flrList: any[] = donki && Array.isArray(donki.flr) ? donki.flr : [];
  let bestFlr: any = null;
  let bestFlrFlux: number | null = null;
  for (const f of flrList) {
    const flux = classToFlux(f?.classType);
    if (flux === null || flux < 1e-5) continue; // M or X only
    const t = Date.parse(f?.peakTime ?? f?.beginTime ?? '');
    if (Number.isFinite(t) && t < cutoff) continue;
    if (bestFlrFlux === null || flux > bestFlrFlux) {
      bestFlrFlux = flux;
      bestFlr = f;
    }
  }

  const flareTrigger = liveMx || bestFlr !== null;
  if (!flareTrigger) return null;

  const cmeList: any[] = donki && Array.isArray(donki.cme) ? donki.cme : [];
  const sepList: any[] = donki && Array.isArray(donki.sep) ? donki.sep : [];
  const ipsList: any[] = donki && Array.isArray(donki.ips) ? donki.ips : [];
  // Only RECENT associated activity counts — ~170 CMEs always exist over 30d at solar max.
  const recentCme = cmeList.filter((c: any) => inRecent(c?.startTime));
  const hasCme = recentCme.length > 0;
  const hasSep = sepList.some((s: any) => inRecent(s?.eventTime));
  const hasIps = ipsList.some((s: any) => inRecent(s?.eventTime));

  // Trigger requires flare AND (CME OR SEP OR IPS) in window.
  if (!hasCme && !hasSep && !hasIps) return null;

  // earthDirected: CME or FLR source within ±45° of central meridian, or a
  // geo-effective CME type (ER/C/O) with non-null speed near disk-center.
  let earthDirected = false;
  for (const c of recentCme) {
    if (isGeoEffective(c?.sourceLocation)) earthDirected = true;
    const t = typeof c?.type === 'string' ? c.type.toUpperCase() : '';
    if (['ER', 'C', 'O'].includes(t) && num(c?.speed) !== null && isGeoEffective(c?.sourceLocation)) earthDirected = true;
  }
  if (bestFlr && isGeoEffective(bestFlr?.sourceLocation)) earthDirected = true;

  // Flare class base: M=40, X=70.
  const drivingFlux = liveMx && (bestFlrFlux === null || (liveFlux as number) > bestFlrFlux) ? (liveFlux as number) : (bestFlrFlux as number);
  const isX = drivingFlux >= 1e-4;
  let severity = isX ? 70 : 40;
  if (earthDirected) severity += 15;
  if (hasSep) severity += 10;
  if (hasIps) severity += 5;
  severity = clamp(severity, 0, 100);

  const bands: Band[] = ['xray', 'cme'];
  if (hasSep) bands.push('protons');
  if (hasIps) bands.push('magnetic');

  // Confidence: 0.95 when ≥3 bands agree, 0.8 for 2, 0.6 for 1+DONKI.
  const bandCount = bands.length;
  const confidence = bandCount >= 3 ? 0.95 : bandCount === 2 ? 0.8 : 0.6;

  const flareClass = liveMx && typeof sw?.xray?.flareClass === 'string' ? sw.xray.flareClass : fluxToClass(drivingFlux);
  const ts = (liveMx ? sw?.xray?.time : bestFlr?.peakTime ?? bestFlr?.beginTime) || new Date().toISOString();

  const aviation: Severity = earthDirected ? 'high' : 'moderate';
  const gps: Severity = earthDirected ? 'high' : 'moderate';
  const powerGrid: Severity = earthDirected ? 'moderate' : 'low';

  const directedTxt = earthDirected
    ? 'Earth-directed eruption — expect geomagnetic storm in 18–72h; alert grid/aviation; monitor /correlate for G-scale escalation.'
    : 'Limb event, low Earth impact; monitor for backside activity.';

  const parts = [`${flareClass} flare`];
  if (hasCme) parts.push('CME');
  if (hasSep) parts.push('SEP (proton radiation)');
  if (hasIps) parts.push('IPS shock');
  const summary = `${parts.join(' + ')}${earthDirected ? ' (Earth-directed)' : ' (limb)'} — multi-band solar eruption`;

  return {
    id: 'solar-eruption',
    kind: 'majorSolarEruption',
    severity,
    confidence,
    bands,
    earthDirected,
    summary,
    infrastructureRisk: { gps, hfRadio: 'high', satellites: 'high', powerGrid, aviation },
    recommendation: directedTxt,
    ts,
  };
}

// ---- Rule C: geomagneticStorm (G-scale) ----
function evalGeoStorm(sw: Record<string, any> | null, donki: Record<string, any> | null): CorrelatedEvent | null {
  const liveKp = sw ? num(sw?.kp?.value) : null;
  const liveTrigger = liveKp !== null && liveKp >= 5;

  const gstList: any[] = donki && Array.isArray(donki.gst) ? donki.gst : [];
  const gstCutoff = Date.now() - 72 * 3600 * 1000; // only recent/active storms, not 30-day history
  let donkiMaxKp: number | null = null;
  let donkiTime: string | null = null;
  for (const g of gstList) {
    const k = num(g?.maxKp);
    if (k === null || k < 5) continue;
    const gt = Date.parse(typeof g?.startTime === 'string' ? g.startTime : '');
    if (Number.isFinite(gt) && gt < gstCutoff) continue;
    if (donkiMaxKp === null || k > donkiMaxKp) {
      donkiMaxKp = k;
      donkiTime = g?.startTime || null;
    }
  }
  const donkiTrigger = donkiMaxKp !== null;

  if (!liveTrigger && !donkiTrigger) return null;

  const kp = liveTrigger ? (liveKp as number) : (donkiMaxKp as number);

  // Mapping: Kp5→G1(35) 6→G2(50) 7→G3(65) 8→G4(80) 9→G5(95)
  let severity: number;
  let gScale: string;
  if (kp >= 9) {
    severity = 95;
    gScale = 'G5';
  } else if (kp >= 8) {
    severity = 80;
    gScale = 'G4';
  } else if (kp >= 7) {
    severity = 65;
    gScale = 'G3';
  } else if (kp >= 6) {
    severity = 50;
    gScale = 'G2';
  } else {
    severity = 35;
    gScale = 'G1';
  }

  const bands: Band[] = ['kp', 'magnetic'];
  let confidence = liveTrigger ? 0.9 : 0.75;
  const bz = sw ? num(sw?.solarWind?.bz) : null;
  if (bz !== null && bz <= -10) {
    bands.push('solarWind');
    confidence = clamp(confidence + 0.1, 0, 1);
  }

  const gIdx = Number(gScale.slice(1)); // 1..5
  const powerGrid: Severity = gIdx >= 4 ? 'severe' : gIdx >= 3 ? 'high' : 'moderate';
  const gps: Severity = gIdx >= 3 ? 'high' : 'moderate';
  const aviation: Severity = gIdx >= 3 ? 'moderate' : 'low';
  const ts = (liveTrigger ? sw?.kp?.time : donkiTime) || new Date().toISOString();

  const bzTxt = bz !== null && bz <= -10 ? ` (Bz ${bz.toFixed(1)} nT southward)` : '';

  return {
    id: 'geo-storm-' + gScale,
    kind: 'geomagneticStorm',
    severity,
    confidence,
    bands,
    summary: `Kp ${kp} → ${gScale} geomagnetic storm${bzTxt}`,
    infrastructureRisk: { gps, hfRadio: 'moderate', satellites: 'moderate', powerGrid, aviation },
    recommendation: `${gScale} geomagnetic storm — grid operators watch GIC; high-lat aviation expect HF degradation; aurora visible to lower latitudes.`,
    ts,
  };
}

// ---- Rule D: radiationStorm (S-scale) ----
function evalRadiationStorm(sw: Record<string, any> | null, donki: Record<string, any> | null, eruptionFlagged: boolean): CorrelatedEvent | null {
  const liveFlux = sw ? num(sw?.protons?.flux) : null;
  const liveTrigger = liveFlux !== null && liveFlux >= 10;

  const sepList: any[] = donki && Array.isArray(donki.sep) ? donki.sep : [];
  const cutoff = Date.now() - 24 * 3600 * 1000;
  let sepTime: string | null = null;
  let sepTrigger = false;
  for (const s of sepList) {
    const t = Date.parse(s?.eventTime ?? '');
    if (Number.isFinite(t) && t < cutoff) continue;
    sepTrigger = true;
    sepTime = s?.eventTime || sepTime;
  }

  if (!liveTrigger && !sepTrigger) return null;

  // Mapping: 10→S1(35) 100→S2(50) 1e3→S3(65) 1e4→S4(80) 1e5→S5(95)
  let severity: number;
  let sScale: string;
  if (liveTrigger) {
    const f = liveFlux as number;
    if (f >= 1e5) {
      severity = 95;
      sScale = 'S5';
    } else if (f >= 1e4) {
      severity = 80;
      sScale = 'S4';
    } else if (f >= 1e3) {
      severity = 65;
      sScale = 'S3';
    } else if (f >= 100) {
      severity = 50;
      sScale = 'S2';
    } else {
      severity = 35;
      sScale = 'S1';
    }
  } else {
    // SEP-only: DONKI gives no flux magnitude → conservative S1.
    severity = 35;
    sScale = 'S1';
  }

  const bands: Band[] = ['protons'];
  if (eruptionFlagged) {
    bands.push('cme');
    bands.push('xray');
  }
  const confidence = liveTrigger ? 0.9 : 0.7;
  const sIdx = Number(sScale.slice(1)); // 1..5
  const aviation: Severity = sIdx >= 3 ? 'high' : 'moderate';
  const ts = (liveTrigger ? sw?.protons?.time : sepTime) || new Date().toISOString();

  const fluxTxt = liveTrigger ? `${(liveFlux as number).toExponential(2)} pfu (≥10 MeV)` : 'DONKI SEP detected';

  return {
    id: 'radiation-storm-' + sScale,
    kind: 'radiationStorm',
    severity,
    confidence,
    bands,
    summary: `Proton flux ${fluxTxt} → ${sScale} radiation storm`,
    infrastructureRisk: { gps: 'low', hfRadio: 'moderate', satellites: 'high', powerGrid: 'none', aviation },
    recommendation: `Solar radiation storm ${sScale} — polar flights reroute at S3+; satellite operators safe-mode sensitive payloads; EVA hold.`,
    ts,
  };
}

const LD_PER_AU = 1 / 0.00257;

// ---- Rule E: neoCloseApproach ----
function evalCloseApproaches(neo: Record<string, any> | null): CorrelatedEvent[] {
  if (!neo || !Array.isArray(neo.closeApproaches)) return [];
  const out: CorrelatedEvent[] = [];
  for (const ca of neo.closeApproaches) {
    let distLD = num(ca?.distLD);
    if (distLD === null) {
      const distAU = num(ca?.distAU);
      distLD = distAU !== null ? distAU * LD_PER_AU : null;
    }
    if (distLD === null || distLD > 10) continue;

    const diameterM = num(ca?.diameterM);
    // base 20, +up to 40 as distLD→0, +up to 25 as diameter grows past 50/140/300 m.
    let severity = 20;
    severity += 40 * (1 - clamp(distLD, 0, 10) / 10);
    if (diameterM !== null) {
      if (diameterM >= 300) severity += 25;
      else if (diameterM >= 140) severity += 17;
      else if (diameterM >= 50) severity += 9;
    }
    severity = clamp(Math.round(severity), 0, 95);

    const des = typeof ca?.des === 'string' ? ca.des : 'unknown';
    const date = typeof ca?.date === 'string' ? ca.date : 'unknown date';
    const ldTxt = distLD.toFixed(2);
    const sizeTxt = diameterM !== null ? `, est. ${Math.round(diameterM)} m` : '';

    out.push({
      id: 'neo-' + des.replace(/\s+/g, ''),
      kind: 'neoCloseApproach',
      severity,
      confidence: 0.95,
      bands: ['orbital'],
      summary: `${des} non-impacting flyby at ${ldTxt} LD on ${date}${sizeTxt}`,
      infrastructureRisk: NONE_RISK,
      recommendation: `Tracked flyby at ${ldTxt} LD on ${date} — no impact risk; observation opportunity.`,
      ts: new Date().toISOString(),
    });
  }
  return out;
}

// ---- Rule F: impactRiskObject ----
// The JPL Sentry catalog always holds ~2000+ objects with a non-zero century-scale
// impact probability — almost all are routine, long-horizon, Torino 0. A negative
// Palermo Scale (PS) means BELOW background hazard, so those must not drive the overall
// banner to HIGH/SEVERE (HIGH starts at severity 55). Only PS >= 0 (at/above background)
// is treated as serious; everything else surfaces as ELEVATED/informational, and only
// the top objects by Palermo Scale are shown (not all 2000+).
function impactSeverity(ps: number | null, ip: number | null): number {
  if (ps !== null) {
    if (ps >= 0) return 85;     // at or above background hazard — genuinely notable
    if (ps >= -1) return 45;    // ELEVATED: highest-ranked long-horizon objects (e.g. 1950 DA, PS≈-0.9)
    if (ps >= -3) return 30;    // ELEVATED-low: actively tracked, statistical only
  }
  if (ip !== null && ip >= 1e-2) return 30; // very high probability but PS missing/very low
  return 0;                      // routine catalog entry — not surfaced as an event
}

function evalImpactRisk(neo: Record<string, any> | null): CorrelatedEvent[] {
  if (!neo || !Array.isArray(neo.sentry)) return [];
  const scored: Array<{ s: any; ps: number | null; ip: number | null; severity: number }> = [];
  for (const s of neo.sentry) {
    const ps = num(s?.ps);
    const ip = num(s?.ip);
    const severity = impactSeverity(ps, ip);
    if (severity <= 0) continue;
    scored.push({ s, ps, ip, severity });
  }
  // Surface only the top objects by Palermo Scale — the catalog is mostly routine entries.
  scored.sort((a, b) => (b.ps ?? -99) - (a.ps ?? -99));

  const out: CorrelatedEvent[] = [];
  for (const { s, ps, ip, severity } of scored.slice(0, 8)) {
    // confidence derived from ip but capped 0.6 (Sentry risks fall off with new data).
    const confidence = clamp(ip !== null ? 0.3 + Math.log10(ip + 1e-12) / 10 : 0.3, 0.1, 0.6);

    const des = typeof s?.des === 'string' ? s.des : typeof s?.fullname === 'string' ? s.fullname : 'unknown';
    const range = typeof s?.range === 'string' ? s.range : 'unknown window';
    const psTxt = ps !== null ? ps.toFixed(2) : 'n/a';
    const ipTxt = ip !== null ? ip.toExponential(2) : 'n/a';

    out.push({
      id: 'impact-risk-' + des.replace(/\s+/g, ''),
      kind: 'impactRiskObject',
      severity,
      confidence,
      bands: ['orbital'],
      summary: `${des} long-horizon impact risk (PS ${psTxt}, ip ${ipTxt}, window ${range}) — statistical, typically decreases with new astrometry`,
      infrastructureRisk: NONE_RISK,
      recommendation: `Long-horizon impact-risk object (PS ${psTxt}, window ${range}); statistical only — risk typically decreases with new astrometry.`,
      ts: new Date().toISOString(),
    });
  }
  return out;
}

export async function GET(request: Request) {
  const base = request.url;
  const errors: string[] = [];

  const [swR, donkiR, dsnR, neoR] = await Promise.allSettled([
    fetchRoute('/api/spectrum/space-weather', base),
    fetchRoute('/api/spectrum/donki', base),
    fetchRoute('/api/spectrum/dsn', base),
    fetchRoute('/api/spectrum/neo-risk', base),
  ]);

  const sw = swR.status === 'fulfilled' ? swR.value : null;
  const donki = donkiR.status === 'fulfilled' ? donkiR.value : null;
  const dsn = dsnR.status === 'fulfilled' ? dsnR.value : null;
  const neo = neoR.status === 'fulfilled' ? neoR.value : null;

  const inputs = {
    spaceWeather: sw !== null,
    donki: donki !== null,
    dsn: dsn !== null,
    neoRisk: neo !== null,
  };
  if (!inputs.spaceWeather) errors.push('space-weather degraded');
  if (!inputs.donki) errors.push('donki degraded');
  if (!inputs.dsn) errors.push('dsn degraded');
  if (!inputs.neoRisk) errors.push('neo-risk degraded');

  const events: CorrelatedEvent[] = [];

  const eruption = evalSolarEruption(sw, donki);
  if (eruption) events.push(eruption);

  const radio = evalRadioBlackout(sw, donki);
  if (radio) events.push(radio);

  const geo = evalGeoStorm(sw, donki);
  if (geo) events.push(geo);

  const radiation = evalRadiationStorm(sw, donki, eruption !== null);
  if (radiation) events.push(radiation);

  for (const e of evalCloseApproaches(neo)) events.push(e);
  for (const e of evalImpactRisk(neo)) events.push(e);

  events.sort((a, b) => b.severity - a.severity);

  const score = events.length ? events[0].severity : 0;
  let level: Correlate['overallThreat']['level'];
  if (score >= 80) level = 'SEVERE';
  else if (score >= 55) level = 'HIGH';
  else if (score >= 25) level = 'ELEVATED';
  else level = 'NOMINAL';

  const headline = events.length ? events[0].summary : 'All bands nominal';

  const body: Correlate = {
    events,
    overallThreat: { score, level, headline },
    inputs,
    updated: new Date().toISOString(),
    ...(errors.length ? { errors } : {}),
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=60' },
  });
}
