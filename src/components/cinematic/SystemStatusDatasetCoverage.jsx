import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SSDSCOV_RE = /\b(ssdscov|system\s+status\s+dataset|service\s+dataset|service\s+data\s+coverage|system\s+dataset\s+coverage|dataset\s+service\s+coverage|status\s+dataset\s+map)\b/i;

export function isSsdscovQuery(t) { return SSDSCOV_RE.test(t || ''); }

export async function buildSsdscovScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [stR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
  ]);
  const raw = stR.value ?? {};
  const services = Array.isArray(raw) ? raw
    : (raw.services ?? raw.components ?? raw.checks ?? raw.data ?? []);
  const datasets = Array.isArray(dsR.value) ? dsR.value
    : (dsR.value?.datasets ?? dsR.value?.data ?? []);

  const dsText = datasets.map(d =>
    `${d.name ?? d.title ?? d.id ?? ''} ${d.description ?? ''}`.toLowerCase()
  ).join(' ');

  let monitored = 0, dark = 0;
  for (const svc of services) {
    const label = `${svc.name ?? svc.id ?? svc.service ?? ''}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(Boolean);
    const hit = tokens.some(tok => tok.length > 2 && dsText.includes(tok));
    if (hit) monitored++; else dark++;
  }
  return `SSDSCOV System Status × Dataset Coverage: ${services.length} services assessed. ` +
    `DATA-MONITORED: ${monitored} (dataset backing found). ` +
    `DARK: ${dark} (no dataset coverage). ` +
    `${datasets.length} datasets indexed.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'DATA-MONITORED': '#22d3ee', 'DARK': '#f59e0b' };
const STATE_ORDER = ['DATA-MONITORED', 'DARK'];

function correlate(service, datasets) {
  const label = `${service.name ?? service.id ?? service.service ?? ''}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(Boolean);
  const dsText = datasets.map(d =>
    `${d.name ?? d.title ?? d.id ?? ''} ${d.description ?? ''}`.toLowerCase()
  ).join(' ');
  const hit = tokens.some(tok => tok.length > 2 && dsText.includes(tok));
  return hit ? 'DATA-MONITORED' : 'DARK';
}

export default function SystemStatusDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [stR, dsR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
      ]);
      const raw = stR.value ?? {};
      const svcs = Array.isArray(raw) ? raw
        : (raw.services ?? raw.components ?? raw.checks ?? raw.data ?? []);
      const dss = Array.isArray(dsR.value) ? dsR.value
        : (dsR.value?.datasets ?? dsR.value?.data ?? []);
      setServices(svcs);
      setDatasets(dss);
      setRows(svcs.map(svc => ({ ...svc, state: correlate(svc, dss) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:ssdscov-toggle', toggle);
    return () => window.removeEventListener('jarvis:ssdscov-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 60_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const dark = rows.filter(r => r.state === 'DARK').length;
    const summary = `SSDSCOV: ${rows.length} services. DATA-MONITORED: ${rows.filter(r => r.state === 'DATA-MONITORED').length}. DARK: ${dark} (no dataset backing).`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this SSDSCOV system-status × dataset coverage state and recommend which dark services need dataset instrumentation: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || (r.name ?? r.id ?? r.service ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const darkCount = stateCounts['DARK'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9983, width: 620, maxHeight: 580,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="SSDSCOV System Status × Dataset Coverage" style={{
        position: 'fixed', left: 760100, bottom: 8, zIndex: 385,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ SSDSCOV
        {darkCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const monitored = stateCounts['DATA-MONITORED'] ?? 0;
  const pct = total > 0 ? Math.round((monitored / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ SSDSCOV</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>System Status × Dataset Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>DATASETS</div>
          <div style={VAL}>{datasets.length}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>DATASET MONITORING COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search services…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no services match</div>
        ) : visible.map((svc, i) => (
          <div key={svc.id ?? svc.name ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[svc.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[svc.state], minWidth: 110, letterSpacing: 0.5 }}>{svc.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {svc.name ?? svc.id ?? svc.service ?? '—'}
            </span>
            {svc.status && <span style={{ fontSize: 8, color: svc.status === 'healthy' || svc.status === 'ok' ? '#22d3ee' : '#f87171' }}>{svc.status}</span>}
            {svc.uptime != null && <span style={{ fontSize: 8, color: '#64748b' }}>{svc.uptime}</span>}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.12)',
          border: '1px solid rgba(34,211,238,0.3)', borderRadius: 4,
          color: '#22d3ee', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
