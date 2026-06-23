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

export default function FrequencyMonitor({ onClose }: { onClose: () => void }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [spec, setSpec] = useState<Spectrum | null>(null);

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

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, height: '100%', width: 460, maxWidth: '92vw', zIndex: 500,
      background: '#06060Cf2', borderLeft: `1px solid ${GOLD}33`, color: '#e8e8ea', fontFamily: 'ui-monospace, monospace',
      display: 'flex', flexDirection: 'column', backdropFilter: 'blur(6px)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${GOLD}33` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: CYAN, boxShadow: `0 0 8px ${CYAN}` }} />
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', color: GOLD }}>BUOY FREQUENCY MONITOR</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', color: '#FF6D7D', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </header>

      <div style={{ padding: '8px 16px', fontSize: 10, opacity: 0.7, borderBottom: '1px solid #ffffff10' }}>
        {roster ? <>NOAA NDBC wave-frequency spectra · {roster.sampled}/{roster.roster_size} sampled · <b style={{ color: roster.anomaly_count ? RED : '#76FF03' }}>{roster.anomaly_count} anomalies</b> → {roster.contacts_posted} contacts plotted</> : 'loading NDBC spectra…'}
      </div>

      {err && <div style={{ padding: '8px 16px', color: '#FF6D7D', fontSize: 11, background: '#FF174411' }}>[ {err} ]</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.length === 0 && !err && <div style={{ opacity: 0.4, fontSize: 12, padding: 8 }}>polling buoy spectra…</div>}
        {rows.map((r) => (
          <div key={r.station} onClick={() => setSel(sel === r.station ? null : r.station)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
              background: r.anomaly ? `${RED}1a` : '#ffffff06', border: `1px solid ${r.anomaly ? RED + '66' : '#ffffff10'}` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: r.anomaly ? RED : CYAN, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 64 }}>{r.station}</span>
            <span style={{ fontSize: 11, opacity: 0.85 }}>{r.dominant_freq_hz != null ? r.dominant_freq_hz.toFixed(3) + ' Hz' : '—'}</span>
            <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 'auto' }}>{r.sig_wave_height_m != null ? r.sig_wave_height_m.toFixed(1) + ' m' : ''}</span>
            {r.anomaly && <span style={{ fontSize: 9, color: RED, letterSpacing: '0.1em' }}>ANOMALY</span>}
          </div>
        ))}
      </div>

      {spec && (
        <div style={{ borderTop: `1px solid ${GOLD}33`, padding: '10px 16px', maxHeight: '38%', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: GOLD, marginBottom: 8 }}>
            {spec.station} SPECTRUM · dominant {spec.dominant_freq_hz?.toFixed(3)} Hz ({spec.dominant_period_s?.toFixed(1)} s)
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
    </div>
  );
}
