import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJIOE_RE = /\b(sjioe|swarm\s+intel\s+ops|swarm\s+profile\s+ops|armed\s+swarm|swarm\s+adversary\s+ops|swarm\s+intel\s+event|profile\s+ops\s+swarm|swarm\s+threat\s+ops)\b/i;

export function isSjioeQuery(t) { return SJIOE_RE.test(t || ''); }

export async function buildSjioeScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [sjR, ipR, oeR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const jobs = Array.isArray(sjR.value) ? sjR.value : (sjR.value?.jobs ?? sjR.value?.data ?? []);
  const profiles = Array.isArray(ipR.value) ? ipR.value : (ipR.value?.profiles ?? ipR.value?.data ?? []);
  const events = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);

  const ipText = profiles.map(p => `${p.name ?? p.subject ?? ''} ${p.description ?? ''} ${p.category ?? ''} ${p.nationality ?? ''} ${(p.aliases ?? []).join(' ')} ${(p.tags ?? []).join(' ')}`.toLowerCase()).join(' ');
  const oeText = events.map(e => `${e.name ?? e.title ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''} ${e.severity ?? ''}`.toLowerCase()).join(' ');

  let fullyArmed = 0, intelAware = 0, opsTriggered = 0, blind = 0;
  for (const sj of jobs) {
    const label = `${sj.name ?? sj.title ?? ''} ${sj.description ?? ''} ${sj.type ?? ''} ${(sj.tags ?? []).join(' ')}`.toLowerCase();
    const tokens = label.split(/\W+/).filter(t => t.length > 2);
    const score = text => tokens.reduce((s, tok) => s + (text.includes(tok) ? 1 : 0), 0);
    const ipHit = score(ipText) > 0;
    const oeHit = score(oeText) > 0;
    if (ipHit && oeHit) fullyArmed++;
    else if (ipHit) intelAware++;
    else if (oeHit) opsTriggered++;
    else blind++;
  }
  return `SJIOE SwarmJob × IntelProfile × Ops Event: ${jobs.length} swarm jobs assessed. ` +
    `FULLY ARMED: ${fullyArmed} (intel-profiled + ops-triggered — job has adversarial context and live ops coverage). ` +
    `INTEL-AWARE: ${intelAware} (intel profile match, no ops event). ` +
    `OPS-TRIGGERED: ${opsTriggered} (ops event match, no intel profile). ` +
    `BLIND: ${blind} (neither — automation gap with no intel or ops coverage). ` +
    `${profiles.length} intel profiles. ${events.length} ops events.`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { 'FULLY ARMED': '#22d3ee', 'INTEL-AWARE': '#a78bfa', 'OPS-TRIGGERED': '#4ade80', 'BLIND': '#f59e0b' };
const STATE_ORDER = ['FULLY ARMED', 'INTEL-AWARE', 'OPS-TRIGGERED', 'BLIND'];

function correlate(sj, profiles, events) {
  const label = `${sj.name ?? sj.title ?? ''} ${sj.description ?? ''} ${sj.type ?? ''} ${(sj.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = label.split(/\W+/).filter(t => t.length > 2);
  const score = text => tokens.reduce((s, tok) => s + (text.toLowerCase().includes(tok) ? 1 : 0), 0);
  const ipText = profiles.map(p => `${p.name ?? p.subject ?? ''} ${p.description ?? ''} ${p.category ?? ''} ${p.nationality ?? ''} ${(p.aliases ?? []).join(' ')} ${(p.tags ?? []).join(' ')}`).join(' ');
  const oeText = events.map(e => `${e.name ?? e.title ?? ''} ${e.description ?? ''} ${e.type ?? ''} ${e.category ?? ''} ${e.severity ?? ''}`).join(' ');
  const ipHit = score(ipText) > 0;
  const oeHit = score(oeText) > 0;
  if (ipHit && oeHit) return 'FULLY ARMED';
  if (ipHit) return 'INTEL-AWARE';
  if (oeHit) return 'OPS-TRIGGERED';
  return 'BLIND';
}

export default function SwarmJobIntelProfileOpsTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [events, setEvents] = useState([]);
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
      const [sjR, ipR, oeR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const sjs = Array.isArray(sjR.value) ? sjR.value : (sjR.value?.jobs ?? sjR.value?.data ?? []);
      const ips = Array.isArray(ipR.value) ? ipR.value : (ipR.value?.profiles ?? ipR.value?.data ?? []);
      const oes = Array.isArray(oeR.value) ? oeR.value : (oeR.value?.events ?? oeR.value?.data ?? []);
      setJobs(sjs);
      setProfiles(ips);
      setEvents(oes);
      setRows(sjs.map(sj => ({ ...sj, state: correlate(sj, ips, oes) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:sjioe-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjioe-toggle', toggle);
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
    const summary = `SJIOE: ${rows.length} swarm jobs. FULLY ARMED: ${rows.filter(r => r.state === 'FULLY ARMED').length}. INTEL-AWARE: ${rows.filter(r => r.state === 'INTEL-AWARE').length}. OPS-TRIGGERED: ${rows.filter(r => r.state === 'OPS-TRIGGERED').length}. BLIND: ${rows.filter(r => r.state === 'BLIND').length}.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this SJIOE swarm job × intel profile × ops event coverage state and recommend next steps: ${summary}` }),
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
    (!search || (r.name ?? r.title ?? r.id ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const blindCount = stateCounts['BLIND'] ?? 0;
  const total = rows.length;
  const fullyArmedCount = stateCounts['FULLY ARMED'] ?? 0;
  const pct = total > 0 ? Math.round((fullyArmedCount / total) * 100) : 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9986, width: 680, maxHeight: 610,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(34,211,238,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="SJIOE SwarmJob × IntelProfile × Ops Event Triple Coverage" style={{
        position: 'fixed', left: 764720, bottom: 8, zIndex: 394,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ SJIOE
        {blindCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {blindCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ SJIOE</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>SwarmJob × IntelProfile × Ops Event Triple Coverage</span>
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
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY ARMED COVERAGE</span><span>{pct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#f59e0b' : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no swarm jobs match</div>
        ) : visible.map((sj, i) => (
          <div key={sj.id ?? i} style={{
            padding: '6px 8px', marginBottom: 4, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[sj.state]}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 8, color: STATE_COLOR[sj.state], minWidth: 120, letterSpacing: 0.5 }}>{sj.state}</span>
            <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sj.name ?? sj.title ?? sj.id ?? '—'}
            </span>
            {(sj.type ?? sj.kind) && (
              <span style={{ fontSize: 8, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                {sj.type ?? sj.kind}
              </span>
            )}
            {sj.status && <span style={{ fontSize: 8, color: '#475569' }}>{sj.status}</span>}
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
