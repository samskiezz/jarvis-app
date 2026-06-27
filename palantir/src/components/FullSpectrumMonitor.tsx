'use client';

import { useEffect, useState } from 'react';
import SolarSystemSection from './spectrum/SolarSystemSection';
import SkyAnomaliesSection from './spectrum/SkyAnomaliesSection';

const GOLD = '#D4AF37';
const CYAN = '#00E5FF';
const RED = '#FF3D6A';
const GREEN = '#76FF03';
const ORANGE = '#FF8A3D';

// ── /api/spectrum/correlate response shape (see audit/SPECTRUM_SCHEMA.md §1) ──
type Band =
  | 'xray' | 'radio' | 'solarWind' | 'magnetic' | 'protons' | 'electrons'
  | 'cme' | 'kp' | 'orbital';
type Severity = 'none' | 'low' | 'moderate' | 'high' | 'severe';
type ThreatLevel = 'NOMINAL' | 'ELEVATED' | 'HIGH' | 'SEVERE';

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
    | 'majorSolarEruption' | 'geomagneticStorm' | 'radiationStorm'
    | 'radioBlackout' | 'neoCloseApproach' | 'impactRiskObject';
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
  overallThreat: { score: number; level: ThreatLevel; headline: string };
  inputs: { spaceWeather: boolean; donki: boolean; dsn: boolean; neoRisk: boolean };
  updated: string;
  errors?: string[];
  error?: string;
}

// ── presentation helpers ──
const THREAT_COLOR: Record<ThreatLevel, string> = {
  NOMINAL: GREEN,
  ELEVATED: GOLD,
  HIGH: ORANGE,
  SEVERE: RED,
};
const SEVERITY_COLOR: Record<Severity, string> = {
  none: '#5a5a66',
  low: GREEN,
  moderate: GOLD,
  high: ORANGE,
  severe: RED,
};
const KIND_LABEL: Record<CorrelatedEvent['kind'], string> = {
  majorSolarEruption: 'MAJOR SOLAR ERUPTION',
  geomagneticStorm: 'GEOMAGNETIC STORM',
  radiationStorm: 'RADIATION STORM',
  radioBlackout: 'RADIO BLACKOUT',
  neoCloseApproach: 'NEO CLOSE APPROACH',
  impactRiskObject: 'IMPACT-RISK OBJECT',
};
const BAND_LABEL: Record<Band, string> = {
  xray: 'X-RAY', radio: 'RADIO', solarWind: 'SOLAR WIND', magnetic: 'MAGNETIC',
  protons: 'PROTONS', electrons: 'ELECTRONS', cme: 'CME', kp: 'KP', orbital: 'ORBITAL',
};

function severityColor(sev: number): string {
  if (sev >= 80) return RED;
  if (sev >= 55) return ORANGE;
  if (sev >= 25) return GOLD;
  return GREEN;
}

// ── SENSOR BANDS table (SPECTRUM_SCHEMA.md §3) ──
// LIVE rows derive their state honestly from the /correlate payload:
//   feedKey  → which inputs[] flag reports the upstream is reachable
//   band     → which Band tag, when present in an event, flags the row "active"
// REFERENCE rows have no live stream — they show an authoritative link only.
interface LiveBandDef {
  kind: 'live';
  label: string;
  feedKey: keyof Correlate['inputs'];
  band?: Band;
  note: string;
}
interface RefBandDef {
  kind: 'reference';
  label: string;
  note: string;
  href: string;
  hrefLabel: string;
}
type BandDef = LiveBandDef | RefBandDef;

const SENSOR_BANDS: BandDef[] = [
  { kind: 'live', label: 'X-RAY — solar flare flux', feedKey: 'spaceWeather', band: 'xray', note: 'SWPC GOES 0.1–0.8nm → flareClass' },
  { kind: 'live', label: 'RF — radio blackout (R-scale)', feedKey: 'spaceWeather', band: 'radio', note: 'SWPC scales.R · X-ray driven' },
  { kind: 'live', label: 'SOLAR WIND — plasma', feedKey: 'spaceWeather', band: 'solarWind', note: 'SWPC plasma + wind-speed (km/s)' },
  { kind: 'live', label: 'MAGNETIC — IMF / Bz', feedKey: 'spaceWeather', band: 'magnetic', note: 'SWPC mag-1-day (nT, Bz southward)' },
  { kind: 'live', label: 'GEOMAGNETIC — Kp / G-scale', feedKey: 'spaceWeather', band: 'kp', note: 'SWPC planetary K-index (0–9)' },
  { kind: 'live', label: 'PROTONS — radiation (S-scale)', feedKey: 'spaceWeather', band: 'protons', note: 'SWPC GOES ≥10 MeV integral (pfu)' },
  { kind: 'live', label: 'ELECTRONS — energetic', feedKey: 'spaceWeather', band: 'electrons', note: 'SWPC GOES ≥2 MeV integral' },
  { kind: 'live', label: 'CME / SEP — DONKI events', feedKey: 'donki', band: 'cme', note: 'NASA DONKI 30-day window (DEMO_KEY rate-limited)' },
  { kind: 'live', label: 'RF — deep-space comms (DSN)', feedKey: 'dsn', note: 'DSN Now S/X/Ka/K antenna links' },
  { kind: 'live', label: 'ORBITAL — NEO close-approach + impact', feedKey: 'neoRisk', band: 'orbital', note: 'JPL CAD + Sentry' },
  // ── REFERENCE-SCAFFOLD: no public live JSON stream; authoritative link only ──
  { kind: 'reference', label: 'GAMMA — GRB / transients', note: 'live elsewhere via JARVIS /api/jarvis/grb (GCN Circulars)', href: 'https://gcn.nasa.gov/circulars', hrefLabel: 'NASA GCN Circulars' },
  { kind: 'reference', label: 'VISIBLE — planet positions', note: 'live elsewhere via JARVIS Solar System tracker (astropy)', href: 'https://ssd.jpl.nasa.gov/horizons/', hrefLabel: 'JPL Horizons' },
  { kind: 'reference', label: 'MICROWAVE — F10.7 / radio bursts', note: 'no real-time public JSON', href: 'https://www.spaceweather.gc.ca/forecast-prevision/solar-solaire/solarflux/sx-en.php', hrefLabel: 'DRAO Penticton F10.7' },
  { kind: 'reference', label: 'UV / EUV — solar imaging', note: 'SDO/AIA imagery, not JSON', href: 'https://sdo.gsfc.nasa.gov/assets/img/latest/', hrefLabel: 'SDO/AIA latest' },
  { kind: 'reference', label: 'IR — solar / thermal imaging', note: 'SDO imagery, not JSON', href: 'https://sdo.gsfc.nasa.gov/data/', hrefLabel: 'SDO data archive' },
  { kind: 'reference', label: 'RADAR — asteroid radar', note: 'no real-time public stream', href: 'https://echo.jpl.nasa.gov/asteroids/', hrefLabel: 'JPL Goldstone radar' },
  { kind: 'reference', label: 'OPTICAL — minor-planet tracking', note: 'no real-time public stream', href: 'https://minorplanetcenter.net', hrefLabel: 'Minor Planet Center' },
  { kind: 'reference', label: 'PULSAR / planetary-radio', note: 'no real-time public JSON', href: 'https://www.cv.nrao.edu', hrefLabel: 'NRAO' },
];

function chipColor(band: Band, activeBands: Set<Band>): string {
  return activeBands.has(band) ? CYAN : '#5a5a66';
}

interface BandRowState {
  active: boolean;       // band currently contributing to a flagged event
  detail: string | null; // driving summary fragment from the flagged event
}

function deriveLiveRows(data: Correlate | null): Map<string, BandRowState> {
  const out = new Map<string, BandRowState>();
  if (!data) return out;
  const flagged = new Set<Band>();
  for (const ev of data.events) for (const b of ev.bands) flagged.add(b);
  for (const def of SENSOR_BANDS) {
    if (def.kind !== 'live' || !def.band) continue;
    const active = flagged.has(def.band);
    let detail: string | null = null;
    if (active) {
      const ev = data.events.find((e) => e.bands.includes(def.band as Band));
      detail = ev ? ev.summary : null;
    }
    out.set(def.label, { active, detail });
  }
  return out;
}

export default function FullSpectrumMonitor({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Correlate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch('/api/spectrum/correlate', { cache: 'no-store' });
        const d = (await r.json()) as Correlate;
        if (!active) return;
        if (!r.ok || d.error) {
          setData(d && d.overallThreat ? d : null);
          setErr(d.error || `correlate ${r.status}`);
        } else {
          setData(d);
          setErr(d.errors && d.errors.length ? d.errors.join(' · ') : null);
        }
      } catch (e) {
        if (active) {
          setData(null);
          setErr(e instanceof Error ? e.message : 'fetch failed');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const threat = data?.overallThreat;
  const level: ThreatLevel = threat?.level ?? 'NOMINAL';
  const threatColor = THREAT_COLOR[level];
  const events = data?.events ?? [];
  const inputs = data?.inputs;
  const liveRows = deriveLiveRows(data);

  return (
    <div role="region" aria-label="Full Spectrum Monitor" style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 460, maxWidth: '92vw', zIndex: 500,
      background: '#06060Cf2', borderLeft: `1px solid ${GOLD}33`, color: '#e8e8ea', fontFamily: 'ui-monospace, monospace',
      display: 'flex', flexDirection: 'column', backdropFilter: 'blur(6px)' }}>

      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${GOLD}33` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: threatColor, boxShadow: `0 0 8px ${threatColor}` }} />
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', color: GOLD }}>SPACE &amp; SKY MONITOR</span>
        <button onClick={onClose} aria-label="Close Space and Sky Monitor" style={{ marginLeft: 'auto', color: '#FF6D7D', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </header>

      <div style={{ padding: '8px 16px', fontSize: 10, opacity: 0.7, borderBottom: '1px solid #ffffff10' }}>
        Solar-system ephemeris · cross-band threat fusion (SWPC · DONKI · DSN · JPL) · space &amp; air anomalies — electromagnetic / aerospace domain only
        {data?.updated && <> · <span style={{ opacity: 0.55 }}>upd {new Date(data.updated).toISOString().slice(11, 19)}Z</span></>}
      </div>

      {err && <div style={{ padding: '8px 16px', color: '#FF6D7D', fontSize: 11, background: '#FF174411' }}>[ {err} ]</div>}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* ── (a) THREAT ASSESSMENT banner ── */}
        <div style={{ margin: '12px', padding: '12px 14px', borderRadius: 6, border: `1px solid ${threatColor}55`,
          background: `${threatColor}12` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.18em', color: '#9a9aa4' }}>THREAT ASSESSMENT</span>
            <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, letterSpacing: '0.12em', color: threatColor }}>{level}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* score meter */}
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#ffffff12', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, threat?.score ?? 0))}%`, height: '100%', background: threatColor, boxShadow: `0 0 8px ${threatColor}` }} />
            </div>
            <span style={{ fontSize: 11, color: threatColor, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{threat ? Math.round(threat.score) : '—'}</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.4, color: '#d8d8de' }}>
            {loading && !data ? 'polling spectrum fusion engine…' : (threat?.headline || 'All bands nominal')}
          </div>
          {inputs && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([['SWPC', inputs.spaceWeather], ['DONKI', inputs.donki], ['DSN', inputs.dsn], ['JPL', inputs.neoRisk]] as Array<[string, boolean]>).map(([name, ok]) => (
                <span key={name} style={{ fontSize: 9, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 10,
                  border: `1px solid ${ok ? GREEN : RED}55`, color: ok ? GREEN : '#FF6D7D', background: `${ok ? GREEN : RED}11` }}>
                  {name} {ok ? 'UP' : 'DOWN'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── (b) CORRELATED EVENTS ── */}
        <div style={{ padding: '0 12px 6px' }}>
          <div style={{ fontSize: 11, color: GOLD, letterSpacing: '0.15em', padding: '4px 4px 8px' }}>
            CORRELATED EVENTS{events.length ? ` · ${events.length}` : ''}
          </div>

          {!loading && data && events.length === 0 && (
            <div style={{ opacity: 0.45, fontSize: 12, padding: '8px 6px' }}>
              No correlated events — all monitored bands within nominal thresholds.
            </div>
          )}
          {loading && !data && (
            <div style={{ opacity: 0.4, fontSize: 12, padding: '8px 6px' }}>loading correlated events…</div>
          )}
          {!loading && !data && (
            <div style={{ opacity: 0.45, fontSize: 12, padding: '8px 6px' }}>
              Fusion engine unreachable — no event data. {err ? '' : 'Awaiting /api/spectrum/correlate.'}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.map((ev) => {
              const sevC = severityColor(ev.severity);
              const activeBands = new Set(ev.bands);
              return (
                <div key={ev.id} style={{ padding: '10px 12px', borderRadius: 5, background: '#ffffff06', border: `1px solid ${sevC}44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sevC, flexShrink: 0, boxShadow: `0 0 6px ${sevC}` }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>{KIND_LABEL[ev.kind]}</span>
                    {ev.earthDirected && <span style={{ fontSize: 8, color: RED, border: `1px solid ${RED}66`, borderRadius: 8, padding: '1px 5px', letterSpacing: '0.08em' }}>EARTH-DIRECTED</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: sevC, fontWeight: 700 }}>SEV {Math.round(ev.severity)}</span>
                  </div>

                  {/* severity bar */}
                  <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#ffffff12', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, ev.severity))}%`, height: '100%', background: sevC }} />
                  </div>

                  {/* contributing bands as chips */}
                  <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {ev.bands.map((b) => (
                      <span key={b} style={{ fontSize: 8, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 3,
                        border: `1px solid ${chipColor(b, activeBands)}55`, color: chipColor(b, activeBands), background: '#ffffff05' }}>
                        {BAND_LABEL[b]}
                      </span>
                    ))}
                    <span style={{ fontSize: 8, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 3, color: '#8a8a94', marginLeft: 'auto' }}>
                      conf {(ev.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div style={{ marginTop: 7, fontSize: 11, lineHeight: 1.4, color: '#d2d2d8' }}>{ev.summary}</div>

                  {/* infrastructureRisk row */}
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {([['GPS', ev.infrastructureRisk.gps], ['HF', ev.infrastructureRisk.hfRadio], ['SAT', ev.infrastructureRisk.satellites], ['GRID', ev.infrastructureRisk.powerGrid], ['AVN', ev.infrastructureRisk.aviation]] as Array<[string, Severity]>).map(([k, s]) => (
                      <span key={k} title={`${k}: ${s} impact`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLOR[s] }} />
                        <span style={{ color: '#9a9aa4', letterSpacing: '0.05em' }}>{k}</span>
                      </span>
                    ))}
                  </div>

                  <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.4, color: GOLD, opacity: 0.85, borderTop: '1px solid #ffffff0d', paddingTop: 7 }}>
                    ▸ {ev.recommendation}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── (c) SENSOR BANDS stack ── */}
        <div style={{ borderTop: `1px solid ${GOLD}33`, marginTop: 6, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: GOLD, letterSpacing: '0.15em', padding: '0 4px 4px' }}>SENSOR BANDS</div>
          <div style={{ fontSize: 9, opacity: 0.5, padding: '0 4px 8px' }}>
            LIVE = real feed wired in. REFERENCE = authoritative source link, not a live stream.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SENSOR_BANDS.map((def) => {
              if (def.kind === 'reference') {
                return (
                  <div key={def.label} style={{ padding: '7px 10px', borderRadius: 4, background: '#ffffff04', border: '1px solid #ffffff0d' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5a5a66', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{def.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 8, letterSpacing: '0.1em', color: '#7a7a84', border: '1px solid #ffffff14', borderRadius: 8, padding: '1px 6px' }}>REFERENCE</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 9, opacity: 0.55, paddingLeft: 15 }}>
                      {def.note} ·{' '}
                      <a href={def.href} target="_blank" rel="noopener noreferrer" style={{ color: CYAN, textDecoration: 'underline' }}>
                        {def.hrefLabel}
                      </a>
                    </div>
                  </div>
                );
              }
              // LIVE row
              const feedUp = inputs ? inputs[def.feedKey] : undefined;
              const row = liveRows.get(def.label);
              const isActive = !!row?.active;
              const dot = feedUp === false ? RED : isActive ? CYAN : feedUp === true ? GREEN : '#5a5a66';
              const statusLabel = feedUp === false ? 'FEED DOWN' : isActive ? 'ACTIVE' : feedUp === true ? 'NOMINAL' : '—';
              return (
                <div key={def.label} style={{ padding: '7px 10px', borderRadius: 4,
                  background: isActive ? `${CYAN}10` : '#ffffff06', border: `1px solid ${isActive ? CYAN + '44' : '#ffffff10'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: dot === '#5a5a66' ? 'none' : `0 0 6px ${dot}` }} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{def.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 8, letterSpacing: '0.1em', color: dot, border: `1px solid ${dot === '#5a5a66' ? '#ffffff14' : dot + '55'}`, borderRadius: 8, padding: '1px 6px' }}>
                      {def.feedKey && feedUp === undefined ? 'LIVE' : statusLabel}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 9, opacity: 0.55, paddingLeft: 15 }}>
                    {row?.detail ? row.detail : def.note}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── (d) SOLAR SYSTEM — live ephemeris, NEOs, bright stars (merged from tracker) ── */}
        <SolarSystemSection />

        {/* ── (e) SPACE & AIR ANOMALIES — self-fetches /api/sky/anomalies ── */}
        <SkyAnomaliesSection />

        <div style={{ padding: '10px 16px 16px', fontSize: 8, opacity: 0.4, lineHeight: 1.5 }}>
          Threat events are deterministically derived server-side from SWPC, NASA DONKI, NASA DSN and JPL SSD/CNEOS feeds.
          A close approach is not an impact; impact-risk objects are long-horizon statistical estimates that typically
          decrease with new astrometry. This panel is electromagnetic / aerospace domain only — no acoustic / ocean data.
        </div>
      </div>
    </div>
  );
}
