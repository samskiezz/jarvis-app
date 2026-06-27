'use client';

import { useEffect, useState } from 'react';

/**
 * SkyAnomaliesSection — SPACE & AIR anomaly fusion, folded into FullSpectrumMonitor.
 *
 * Self-fetches GET /api/sky/anomalies (electromagnetic / aerospace domain ONLY —
 * NO acoustic / ocean / hydrophone data is consumed or shown here). It renders the
 * route's REAL values verbatim:
 *   • aircraftAnomalies — military / emergency-squawk / GPS-integrity-loss tracks
 *     from the live flight feed.
 *   • unmatchedSpace    — sentry impact-risk objects, NEO close approaches,
 *     atmospheric fireballs.
 *   • uap               — honest empty-or-real list; every row tagged UNVERIFIED.
 *   • correlations      — deterministic air/UAP ↔ space ground-track proximities.
 *
 * No randomness, no fabricated rows — if a band is degraded the route omits it and
 * we surface that honestly via `sources`.
 */

const GOLD = '#D4AF37';
const CYAN = '#00E5FF';
const RED = '#FF3D6A';
const GREEN = '#76FF03';
const ORANGE = '#FF8A3D';

const SKY_REFRESH_MS = 60_000;

interface AircraftAnomaly {
  callsign: string;
  icao24: string;
  model: string;
  lat: number;
  lng: number;
  alt: number;
  speed_knots: number | null;
  heading: number | null;
  squawk: string;
  category: string;
  flags: string[];
  emergency: string | null;
}
interface UnmatchedSpaceObject {
  id: string;
  kind: 'impactRiskObject' | 'closeApproach' | 'fireball';
  designation: string;
  summary: string;
  severity: number;
  lat: number | null;
  lng: number | null;
  date: string | null;
  detail: Record<string, number | string | null>;
}
interface UapReport {
  date: string;
  city: string;
  state: string;
  shape: string;
  summary: string;
  lat: number | null;
  lng: number | null;
}
interface Correlation {
  summary: string;
  aircraft?: string;
  space?: string;
  uap?: string;
  distance_km?: number | null;
}
interface SourceStatus {
  ok: boolean;
  note?: string;
}
interface SkyAnomalies {
  aircraftAnomalies: AircraftAnomaly[];
  unmatchedSpace: UnmatchedSpaceObject[];
  uap: UapReport[];
  uap_source_note: string;
  correlations: Correlation[];
  updated: string;
  sources: {
    flights: SourceStatus;
    neoRisk: SourceStatus;
    fireballs: SourceStatus;
    uap: SourceStatus;
    squawkField: SourceStatus;
  };
  errors?: string[];
}

const KIND_LABEL: Record<UnmatchedSpaceObject['kind'], string> = {
  impactRiskObject: 'IMPACT-RISK OBJECT',
  closeApproach: 'CLOSE APPROACH',
  fireball: 'ATMOSPHERIC FIREBALL',
};

function flagColor(flag: string): string {
  if (flag.startsWith('emergency')) return RED;
  if (flag === 'gps-integrity-loss') return ORANGE;
  if (flag === 'military') return GOLD;
  return CYAN;
}

function spaceSeverityColor(sev: number): string {
  if (sev >= 80) return RED;
  if (sev >= 50) return ORANGE;
  if (sev >= 20) return GOLD;
  return CYAN;
}

export default function SkyAnomaliesSection() {
  const [data, setData] = useState<SkyAnomalies | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch('/api/sky/anomalies', { cache: 'no-store' });
        const d = (await r.json()) as SkyAnomalies;
        if (!active) return;
        setData(d);
        setErr(Array.isArray(d.errors) && d.errors.length ? d.errors.join(' · ') : null);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'sky anomaly fetch failed');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, SKY_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const aircraft = data?.aircraftAnomalies ?? [];
  const space = data?.unmatchedSpace ?? [];
  const uap = data?.uap ?? [];
  const correlations = data?.correlations ?? [];
  const sources = data?.sources;

  return (
    <div style={{ borderTop: `1px solid ${RED}44`, marginTop: 6 }}>
      <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: ORANGE, boxShadow: `0 0 6px ${ORANGE}`, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: GOLD, letterSpacing: '0.15em' }}>SPACE & AIR ANOMALIES</span>
        {data?.updated && <span style={{ marginLeft: 'auto', fontSize: 8, opacity: 0.5 }}>upd {new Date(data.updated).toISOString().slice(11, 19)}Z</span>}
      </div>
      <div style={{ padding: '0 12px 6px', fontSize: 9, opacity: 0.55, lineHeight: 1.5 }}>
        Electromagnetic / aerospace domain only · anomalous aircraft (ADS-B), unmatched space objects (JPL Sentry/CAD + CNEOS), UAP. No acoustic / ocean data.
      </div>

      {/* source status chips */}
      {sources && (
        <div style={{ padding: '0 12px 6px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {([['FLIGHTS', sources.flights.ok], ['NEO-RISK', sources.neoRisk.ok], ['FIREBALLS', sources.fireballs.ok]] as Array<[string, boolean]>).map(([name, ok]) => (
            <span key={name} style={{ fontSize: 8, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 10,
              border: `1px solid ${ok ? GREEN : RED}55`, color: ok ? GREEN : '#FF6D7D', background: `${ok ? GREEN : RED}11` }}>
              {name} {ok ? 'UP' : 'DOWN'}
            </span>
          ))}
        </div>
      )}

      {err && <div style={{ padding: '4px 12px', color: '#FF6D7D', fontSize: 10 }}>[ {err} ]</div>}
      {loading && !data && <div style={{ padding: '6px 14px', opacity: 0.4, fontSize: 12 }}>polling sky anomaly fusion…</div>}

      {/* ── AIRCRAFT ANOMALIES ── */}
      <div style={{ padding: '4px 12px 6px' }}>
        <div style={{ fontSize: 10, color: CYAN, letterSpacing: '0.12em', padding: '4px 2px' }}>
          ANOMALOUS AIRCRAFT{aircraft.length ? ` · ${aircraft.length}` : ''}
        </div>
        {data && aircraft.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.5, padding: '2px 2px 4px' }}>
            No flagged aircraft in the current window (military / 7500·7600·7700 squawk / GPS-integrity loss).
            {sources && !sources.flights.ok && ' Flight feed degraded.'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {aircraft.map((a) => (
            <div key={a.icao24 || `${a.callsign}-${a.lat}-${a.lng}`}
              style={{ padding: '7px 10px', borderRadius: 4, background: a.emergency ? `${RED}14` : '#ffffff06',
                border: `1px solid ${a.emergency ? RED + '55' : '#ffffff10'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.emergency ? RED : a.flags.includes('gps-integrity-loss') ? ORANGE : GOLD, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{a.callsign || a.icao24 || 'UNKNOWN'}</span>
                {a.model && <span style={{ fontSize: 9, opacity: 0.5 }}>{a.model}</span>}
                <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 'auto' }}>{a.lat.toFixed(2)}, {a.lng.toFixed(2)}</span>
              </div>
              <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {a.flags.map((f) => (
                  <span key={f} style={{ fontSize: 8, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 3,
                    border: `1px solid ${flagColor(f)}66`, color: flagColor(f), background: '#ffffff05' }}>
                    {f.toUpperCase()}
                  </span>
                ))}
                {a.squawk && <span style={{ fontSize: 8, opacity: 0.5, padding: '2px 6px' }}>sqwk {a.squawk}</span>}
                {a.alt > 0 && <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 'auto', padding: '2px 0' }}>{Math.round(a.alt).toLocaleString()} ft</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── UNMATCHED SPACE OBJECTS ── */}
      <div style={{ padding: '0 12px 6px' }}>
        <div style={{ fontSize: 10, color: CYAN, letterSpacing: '0.12em', padding: '4px 2px' }}>
          UNMATCHED SPACE OBJECTS{space.length ? ` · ${space.length}` : ''}
        </div>
        {data && space.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.5, padding: '2px 2px 4px' }}>
            No notable impact-risk objects, close approaches, or fireballs this window.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {space.map((s) => {
            const sc = spaceSeverityColor(s.severity);
            return (
              <div key={s.id} style={{ padding: '7px 10px', borderRadius: 4, background: '#ffffff06', border: `1px solid ${sc}44` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0, boxShadow: `0 0 6px ${sc}` }} />
                  <span style={{ fontSize: 9, letterSpacing: '0.08em', color: sc }}>{KIND_LABEL[s.kind]}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{s.designation}</span>
                  {s.date && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 'auto' }}>{s.date}</span>}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, opacity: 0.75, lineHeight: 1.4 }}>{s.summary}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── UAP ── */}
      <div style={{ padding: '0 12px 6px' }}>
        <div style={{ fontSize: 10, color: CYAN, letterSpacing: '0.12em', padding: '4px 2px' }}>
          UAP REPORTS{uap.length ? ` · ${uap.length}` : ''}
        </div>
        {data && uap.length === 0 && (
          <div style={{ fontSize: 10, opacity: 0.55, padding: '2px 2px 4px', lineHeight: 1.5 }}>
            {data.uap_source_note}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {uap.map((u, i) => (
            <div key={`${u.date}-${u.city}-${i}`} style={{ padding: '7px 10px', borderRadius: 4, background: '#ffffff06', border: '1px solid #ffffff10' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9a9aa4', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{[u.city, u.state].filter(Boolean).join(', ') || 'unknown location'}</span>
                <span style={{ fontSize: 8, letterSpacing: '0.08em', color: ORANGE, border: `1px solid ${ORANGE}66`, borderRadius: 8, padding: '1px 6px', marginLeft: 'auto' }}>UNVERIFIED</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 10, opacity: 0.7, lineHeight: 1.4 }}>
                {u.shape && <span style={{ opacity: 0.6 }}>{u.shape} · </span>}{u.summary}{u.date ? ` (${u.date})` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CORRELATIONS ── */}
      <div style={{ padding: '0 12px 12px' }}>
        <div style={{ fontSize: 10, color: CYAN, letterSpacing: '0.12em', padding: '4px 2px' }}>
          CROSS-DOMAIN CORRELATIONS{correlations.length ? ` · ${correlations.length}` : ''}
        </div>
        {data && correlations.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.5, padding: '2px 2px 4px' }}>
            No air/UAP ↔ space ground-track proximities within threshold.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {correlations.map((c, i) => (
            <div key={`${c.summary}-${i}`} style={{ padding: '7px 10px', borderRadius: 4, background: `${ORANGE}10`, border: `1px solid ${ORANGE}44` }}>
              <div style={{ fontSize: 10, lineHeight: 1.4, color: '#e8d8b8' }}>
                ▸ {c.summary}{c.distance_km != null ? ` · ${c.distance_km} km` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
