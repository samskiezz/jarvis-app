'use client';

import { useEffect, useState } from 'react';

const GOLD = '#D4AF37';
const CYAN = '#00E5FF';
const RED = '#FF3D6A';

interface RosterRow {
  station: string;
  lat: number;
  lng: number;
  dominant_freq_hz: number | null;
  sig_wave_height_m: number | null;
  anomaly: boolean;
}
interface Roster {
  monitored: RosterRow[];
  total: number;
  sampled: number;
  roster_size: number;
  anomaly_count: number;
  contacts_posted: number;
  source?: string;
  error?: string;
}
interface Spectrum {
  station: string;
  frequencies: number[];
  densities: number[];
  dominant_freq_hz: number | null;
  dominant_period_s: number | null;
}

// ── /api/ocean/anomalies shapes (ACOUSTIC domain only) ──
interface DarkContact {
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
interface HydrophoneRow {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  nearestContactKm: number | null;
  classification: string | null;
  classifierModel: string;
  note: string;
}
interface OceanCounts {
  stationsTracked: number | null;
  spectraSampled: number | null;
  hydrophones: number;
  darkContacts: number;
  waveAnomalies: number;
  vesselsInView: number;
  acousticContacts: number;
}
interface OceanAnomalies {
  darkContacts: DarkContact[];
  hydrophones: HydrophoneRow[];
  counts: OceanCounts;
  radiusKm: number;
  aisCoverage: string;
  inputs: { acoustic: boolean; vessels: boolean; hydrophones: boolean; buoyFrequency: boolean };
  updated: string;
  errors?: string[];
}

export default function FrequencyMonitor({ onClose }: { onClose: () => void }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [spec, setSpec] = useState<Spectrum | null>(null);
  const [ocean, setOcean] = useState<OceanAnomalies | null>(null);
  const [oceanErr, setOceanErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch('/api/jarvis/buoy-frequency', { cache: 'no-store' });
        const d = (await r.json()) as Roster;
        if (!active) return;
        setRoster(d);
        setErr(d.error || null);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'fetch failed');
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch('/api/ocean/anomalies', { cache: 'no-store' });
        const d = (await r.json()) as OceanAnomalies;
        if (!active) return;
        setOcean(d);
        setOceanErr(Array.isArray(d.errors) && d.errors.length ? d.errors.join(' · ') : null);
      } catch (e) {
        if (active) setOceanErr(e instanceof Error ? e.message : 'ocean anomaly fetch failed');
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!sel) { setSpec(null); return; }
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/jarvis/buoy-frequency?station=${encodeURIComponent(sel)}`, { cache: 'no-store' });
        const d = await r.json();
        if (active) setSpec('error' in d ? null : d);
      } catch { if (active) setSpec(null); }
    })();
    return () => { active = false; };
  }, [sel]);

  const rows = roster?.monitored || [];
  const maxD = spec ? Math.max(...spec.densities, 0.0001) : 1;

  // Reconcile counts: positions tracked vs spectra actually sampled. Prefer the
  // ocean-anomalies counts (single source of truth); fall back to the roster.
  const stationsTracked = ocean?.counts.stationsTracked ?? roster?.roster_size ?? null;
  const spectraSampled = ocean?.counts.spectraSampled ?? roster?.total ?? null;
  const darkContacts = ocean?.darkContacts || [];
  const hydrophones = ocean?.hydrophones || [];

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 460, maxWidth: '92vw', zIndex: 500,
      background: '#06060Cf2', borderLeft: `1px solid ${GOLD}33`, color: '#e8e8ea', fontFamily: 'ui-monospace, monospace',
      display: 'flex', flexDirection: 'column', backdropFilter: 'blur(6px)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${GOLD}33` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: CYAN, boxShadow: `0 0 8px ${CYAN}` }} />
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', color: GOLD }}>OCEAN ACOUSTIC MONITOR</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', color: '#FF6D7D', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* ── SECTION 1: WAVE-ENERGY SPECTRA (geophysics, NOT sound) ── */}
        <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ fontSize: 11, color: GOLD, letterSpacing: '0.15em' }}>OCEAN WAVE-ENERGY SPECTRA</div>
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 3, lineHeight: 1.5 }}>
            NOAA NDBC surface-wave spectra (swell · storm · tsunami geophysics, ~0.03–0.5&nbsp;Hz) — m²/Hz vs Hz. These are ocean surface-gravity waves, <b style={{ color: GOLD }}>NOT underwater sound</b>, sonar, or hydrophone audio.
          </div>
          <div style={{ fontSize: 10, opacity: 0.75, marginTop: 6 }}>
            {stationsTracked != null || spectraSampled != null ? (
              <>
                <b style={{ color: CYAN }}>{stationsTracked ?? '—'}</b> stations tracked (positions)
                {' · '}
                <b style={{ color: CYAN }}>{spectraSampled ?? '—'}</b> spectra sampled this run
              </>
            ) : 'loading NDBC spectra…'}
            {roster && (
              <> · <b style={{ color: roster.anomaly_count ? RED : '#76FF03' }}>{roster.anomaly_count} wave anomalies</b></>
            )}
          </div>
          <div style={{ fontSize: 8, opacity: 0.4, marginTop: 3 }}>
            ~1,360 NDBC positions exist; the backend roster is capped, then a subset is spectrally sampled — the gap between the two counts is by design, not a fault.
          </div>
        </div>

        {err && <div style={{ padding: '8px 16px', color: '#FF6D7D', fontSize: 11, background: '#FF174411' }}>[ {err} ]</div>}

        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.length === 0 && !err && <div style={{ opacity: 0.4, fontSize: 12, padding: 8 }}>polling buoy wave spectra…</div>}
          {rows.map((r) => (
            <div key={r.station} onClick={() => setSel(sel === r.station ? null : r.station)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
                background: r.anomaly ? `${RED}1a` : '#ffffff06', border: `1px solid ${r.anomaly ? RED + '66' : '#ffffff10'}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.anomaly ? RED : CYAN, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 64 }}>{r.station}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>{r.dominant_freq_hz != null ? r.dominant_freq_hz.toFixed(3) + ' Hz' : '—'}</span>
              <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 'auto' }}>{r.sig_wave_height_m != null ? r.sig_wave_height_m.toFixed(1) + ' m' : ''}</span>
              {r.anomaly && <span style={{ fontSize: 9, color: RED, letterSpacing: '0.1em' }}>WAVE ANOMALY</span>}
            </div>
          ))}
        </div>

        {spec && (
          <div style={{ borderTop: `1px solid ${GOLD}33`, padding: '10px 16px' }}>
            <div style={{ fontSize: 11, color: GOLD, marginBottom: 8 }}>
              {spec.station} WAVE SPECTRUM · dominant {spec.dominant_freq_hz?.toFixed(3)} Hz ({spec.dominant_period_s?.toFixed(1)} s)
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 80 }}>
              {spec.densities.map((d, i) => (
                <div key={i} title={`${spec.frequencies[i]?.toFixed(3)} Hz · ${d.toFixed(2)} m²/Hz`}
                  style={{ flex: 1, height: `${Math.max(2, (d / maxD) * 100)}%`, background: `linear-gradient(${CYAN},${GOLD})`, opacity: 0.85 }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, opacity: 0.5, marginTop: 3 }}>
              <span>{spec.frequencies[0]?.toFixed(3)} Hz</span>
              <span>wave energy density (m²/Hz)</span>
              <span>{spec.frequencies[spec.frequencies.length - 1]?.toFixed(3)} Hz</span>
            </div>
          </div>
        )}

        {/* ── SECTION 2: DARK VESSEL / SUBSURFACE (true acoustic) ── */}
        <div style={{ borderTop: `1px solid ${RED}44`, padding: '12px 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: RED, boxShadow: `0 0 6px ${RED}`, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: RED, letterSpacing: '0.15em' }}>DARK VESSEL / SUBSURFACE</span>
          </div>
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4, lineHeight: 1.5 }}>
            Acoustic contacts with <b>no AIS vessel</b> within {ocean?.radiusKm ?? 15}&nbsp;km — a possible submerged or dark (transponder-off) vessel. <b style={{ color: RED }}>AIS coverage is Baltic-only</b> (Gulf of Finland), so this test runs only inside that box; everywhere else "no nearby ship" just means no AIS coverage.
          </div>

          {oceanErr && <div style={{ color: '#FF6D7D', fontSize: 10, marginTop: 6 }}>[ {oceanErr} ]</div>}

          {ocean && ocean.inputs.vessels === false && (
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>AIS vessel feed degraded — dark-contact test suspended (a missing vessel feed must not manufacture detections).</div>
          )}

          {ocean && darkContacts.length === 0 && ocean.inputs.vessels !== false && !oceanErr && (
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
              No unmarked acoustic contacts · {ocean.counts.acousticContacts} contacts vs {ocean.counts.vesselsInView} AIS vessels in view (all currently explained or outside coverage).
            </div>
          )}

          {!ocean && !oceanErr && <div style={{ opacity: 0.4, fontSize: 12, marginTop: 8 }}>correlating acoustic contacts against AIS…</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {darkContacts.map((c, i) => (
              <div key={`${c.lat},${c.lng},${i}`}
                style={{ padding: '8px 10px', borderRadius: 4, background: `${RED}14`, border: `1px solid ${RED}55` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: RED, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{c.label || 'acoustic contact'}</span>
                  <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 'auto' }}>{c.lat.toFixed(3)}, {c.lng.toFixed(3)}</span>
                </div>
                <div style={{ fontSize: 9, opacity: 0.7, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>nearest AIS vessel: <b style={{ color: RED }}>{c.nearestVesselKm != null ? c.nearestVesselKm.toFixed(1) + ' km' : 'none in range'}</b></span>
                  {c.classification && <span>class: {c.classification}</span>}
                  <span>confidence: {c.confidence != null ? (c.confidence * 100).toFixed(0) + '%' : 'n/a'}</span>
                  <span style={{ opacity: 0.6 }}>src: {c.source}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 3: HYDROPHONE LISTENING STATIONS ── */}
        <div style={{ borderTop: `1px solid ${GOLD}33`, padding: '12px 16px 16px' }}>
          <div style={{ fontSize: 11, color: GOLD, letterSpacing: '0.15em' }}>HYDROPHONE LISTENING STATIONS</div>
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4, lineHeight: 1.5 }}>
            Orcasound network · Puget Sound / Salish Sea (WA) · live underwater audio. <b style={{ color: GOLD }}>No marine/military-trained classifier</b> is wired — any label shown is general-audio (YAMNet: whale / vessel / mechanical / unknown), not a confirmed target ID.
          </div>

          {!ocean && !oceanErr && <div style={{ opacity: 0.4, fontSize: 12, marginTop: 8 }}>loading hydrophone stations…</div>}
          {ocean && ocean.inputs.hydrophones === false && (
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>hydrophone feed degraded.</div>
          )}
          {ocean && hydrophones.length === 0 && ocean.inputs.hydrophones !== false && (
            <div style={{ opacity: 0.4, fontSize: 12, marginTop: 8 }}>no stations listed</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {hydrophones.map((h) => (
              <div key={h.slug || h.name}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 4,
                  background: '#ffffff06', border: '1px solid #ffffff10' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: CYAN, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{h.name}</span>
                {h.classification && (
                  <span style={{ fontSize: 9, opacity: 0.55 }}>{h.classification}</span>
                )}
                <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 'auto' }}>
                  {h.lat.toFixed(3)}, {h.lng.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
          {ocean?.counts && (
            <div style={{ fontSize: 8, opacity: 0.4, marginTop: 8 }}>
              {ocean.counts.hydrophones} listening stations (entire Orcasound network) · classifier: general-audio, marine model pending
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
