import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSITRIP_RE = /\b(rsitrip|report\s+swarm\s+intel|report\s+swarm\s+profile|swarm\s+intel\s+report|swarm\s+profile\s+report|report\s+automation\s+profile|fully\s+covered\s+report|dark\s+report|report\s+triple\s+coverage|report\s+swarm\s+triple)\b/i;

export function isRsitripQuery(t) { return RSITRIP_RE.test(t || ''); }

export async function buildRsitripScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [rpR, swR, ipR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
  ]);
  const reports = Array.isArray(rpR.value) ? rpR.value : (rpR.value?.reports ?? rpR.value?.data ?? []);
  const swarmJobs = Array.isArray(swR.value) ? swR.value : (swR.value?.jobs ?? swR.value?.data ?? []);
  const intelProfiles = Array.isArray(ipR.value) ? ipR.value : (ipR.value?.profiles ?? ipR.value?.data ?? []);

  const swText = swarmJobs.map(j => `${j.name ?? j.title ?? j.id ?? ''} ${j.description ?? ''}`.toLowerCase()).join(' ');
  const ipText = intelProfiles.map(p => `${p.name ?? p.subject ?? p.id ?? ''} ${p.summary ?? ''}`.toLowerCase()).join(' ');

  let fullyCovered = 0, swarmOnly = 0, profiled = 0, dark = 0;
  for (const rp of reports) {
    const name = `${rp.title ?? rp.name ?? rp.id ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(Boolean);
    const score = t => tokens.reduce((s, tok) => s + (t.includes(tok) ? 1 : 0), 0);
    const swHit = score(swText) > 0;
    const ipHit = score(ipText) > 0;
    if (swHit && ipHit) fullyCovered++;
    else if (swHit) swarmOnly++;
    else if (ipHit) profiled++;
    else dark++;
  }
  return `RSITRIP Report × SwarmJob × IntelProfile: ${reports.length} reports assessed. ` +
    `FULLY COVERED: ${fullyCovered} (swarm automation + intel profile). ` +
    `SWARM-ONLY: ${swarmOnly} (swarm job matched, no intel profile). ` +
    `PROFILED: ${profiled} (intel profile matched, no swarm job). ` +
    `DARK: ${dark} (neither swarm nor profile). ` +
    `${swarmJobs.length} active swarm jobs. ${intelProfiles.length} tracked intel profiles.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY COVERED': '#22d3ee', 'SWARM-ONLY': '#a78bfa', 'PROFILED': '#34d399', 'DARK': '#f59e0b' };
const STATE_ORDER = ['FULLY COVERED', 'SWARM-ONLY', 'PROFILED', 'DARK'];

function correlate(report, swarmJobs, intelProfiles) {
  const name = `${report.title ?? report.name ?? report.id ?? ''}`.toLowerCase();
  const tokens = name.split(/\W+/).filter(Boolean);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const swText = swarmJobs.map(j => `${j.name ?? j.title ?? j.id ?? ''} ${j.description ?? ''}`).join(' ');
  const ipText = intelProfiles.map(p => `${p.name ?? p.subject ?? p.id ?? ''} ${p.summary ?? ''}`).join(' ');
  const swHit = score(swText) > 0;
  const ipHit = score(ipText) > 0;
  if (swHit && ipHit) return 'FULLY COVERED';
  if (swHit) return 'SWARM-ONLY';
  if (ipHit) return 'PROFILED';
  return 'DARK';
}

export default function ReportSwarmIntelTriple() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [swarmJobs, setSwarmJobs] = useState([]);
  const [intelProfiles, setIntelProfiles] = useState([]);
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
      const [rpR, swR, ipR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
      ]);
      const rps = Array.isArray(rpR.value) ? rpR.value : (rpR.value?.reports ?? rpR.value?.data ?? []);
      const sws = Array.isArray(swR.value) ? swR.value : (swR.value?.jobs ?? swR.value?.data ?? []);
      const ips = Array.isArray(ipR.value) ? ipR.value : (ipR.value?.profiles ?? ipR.value?.data ?? []);
      setReports(rps);
      setSwarmJobs(sws);
      setIntelProfiles(ips);
      setRows(rps.map(rp => ({ ...rp, state: correlate(rp, sws, ips) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:rsitrip-toggle', toggle);
    return () => window.removeEventListener('jarvis:rsitrip-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const dark = rows.filter(r => r.state === 'DARK').length;
    const summary = `RSITRIP: ${rows.length} reports. FULLY COVERED: ${rows.filter(r => r.state === 'FULLY COVERED').length}. SWARM-ONLY: ${rows.filter(r => r.state === 'SWARM-ONLY').length}. PROFILED: ${rows.filter(r => r.state === 'PROFILED').length}. DARK: ${dark}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this RSITRIP coverage state and recommend next steps: ${summary}` }),
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
    (!search || (r.title ?? r.name ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const darkCount = stateCounts['DARK'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9981, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="RSITRIP Report × SwarmJob × IntelProfile Coverage" style={{
        position: 'fixed', left: 757440, bottom: 8, zIndex: 381,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ RSITRIP
        {darkCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY COVERED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ RSITRIP</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Report × SwarmJob × IntelProfile Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
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
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULL COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no reports match</div>
        ) : visible.map((rp, i) => (
          <div key={rp.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[rp.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[rp.state], minWidth: 90, letterSpacing: 0.5 }}>{rp.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rp.title ?? rp.name ?? rp.id ?? '—'}
            </span>
            {rp.created_at && <span style={{ fontSize: 8, color: '#475569' }}>{rp.created_at.slice(0, 10)}</span>}
          </div>
        ))}
      </div>

      {/* Footer */}
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
