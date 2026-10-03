import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SSSWRSK_RE = /\b(ssswrsk|system\s+swarm\s+risk|service\s+swarm\s+risk|system\s+status\s+swarm|triple\s+service\s+alarm|swarm\s+service\s+risk|system\s+swarm\s+alarm|service\s+risk\s+swarm|operational\s+triple\s+alarm|system\s+risk\s+swarm)\b/i;
export function isSsswrskQuery(t) { return SSSWRSK_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseServices(raw) {
  if (!raw) return [];
  const services = raw.services || raw.components || raw.checks || [];
  if (Array.isArray(services)) {
    return services.map((s, i) => ({
      id: s.id || s.name || String(i),
      name: s.name || s.service || s.component || `Service ${i + 1}`,
      status: s.status || s.health || s.state || 'unknown',
      desc: [s.name, s.service, s.component, s.description, s.type].filter(Boolean).join(' '),
    }));
  }
  if (typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([k]) => !['status', 'version', 'uptime'].includes(k))
      .map(([k, v], i) => ({
        id: k,
        name: k,
        status: typeof v === 'string' ? v : (v && v.status) || 'unknown',
        desc: k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v).slice(0, 80)),
      }));
  }
  return [];
}

function normaliseSwarmJobs(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.swarm_jobs) ? raw.swarm_jobs
    : raw && Array.isArray(raw.jobs) ? raw.jobs
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || String(i),
    text: [r.name, r.title, r.type, r.target, r.description, r.status, r.kind].filter(Boolean).join(' '),
    label: r.name || r.title || `SwarmJob ${i + 1}`,
  }));
}

function normaliseRiskSignals(raw) {
  const arr = Array.isArray(raw) ? raw
    : raw && Array.isArray(raw.risk_signals) ? raw.risk_signals
    : raw && Array.isArray(raw.signals) ? raw.signals
    : raw && Array.isArray(raw.data) ? raw.data
    : raw && Array.isArray(raw.items) ? raw.items
    : raw && Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || String(i),
    text: [r.name, r.title, r.description, r.type, r.severity, r.source].filter(Boolean).join(' '),
    label: r.name || r.title || `RiskSignal ${i + 1}`,
    severity: r.severity || r.level || 'medium',
  }));
}

function matchScore(serviceToks, fieldText) {
  if (!serviceToks.length) return 0;
  const fToks = new Set(tok(fieldText));
  let hits = 0;
  for (const t of serviceToks) if (fToks.has(t)) hits++;
  return hits / serviceToks.length;
}

const THRESHOLD = 0.08;

function correlate(services, swarmJobs, riskSignals) {
  return services.map(svc => {
    const toks = tok(svc.desc);
    let bestSwarm = null, swarmScore = 0;
    for (const j of swarmJobs) {
      const s = matchScore(toks, j.text);
      if (s > swarmScore) { swarmScore = s; bestSwarm = j; }
    }
    let bestRisk = null, riskScore = 0;
    for (const rs of riskSignals) {
      const s = matchScore(toks, rs.text);
      if (s > riskScore) { riskScore = s; bestRisk = rs; }
    }
    const hasSwarm = swarmScore >= THRESHOLD;
    const hasRisk = riskScore >= THRESHOLD;
    let state;
    if (hasSwarm && hasRisk) state = 'FULLY ALARMED';
    else if (hasSwarm) state = 'AUTOMATED';
    else if (hasRisk) state = 'RISK-FLAGGED';
    else state = 'BLIND';
    return { ...svc, state, bestSwarm, swarmScore, bestRisk, riskScore };
  });
}

export async function buildSsswrskScript() {
  const key = (typeof localStorage !== 'undefined' && localStorage.getItem('jarvis_api_key')) || 'dev-key';
  const h = { Authorization: `Bearer ${key}` };
  const base = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
  const [sysRes, swarmRes, riskRes] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`, { headers: h }).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`, { headers: h }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()),
  ]);
  const services = normaliseServices(sysRes.status === 'fulfilled' ? sysRes.value : null);
  const swarms = normaliseSwarmJobs(swarmRes.status === 'fulfilled' ? swarmRes.value : []);
  const risks = normaliseRiskSignals(riskRes.status === 'fulfilled' ? riskRes.value : []);
  const rows = correlate(services, swarms, risks);
  const alarmed = rows.filter(r => r.state === 'FULLY ALARMED').length;
  const blind = rows.filter(r => r.state === 'BLIND').length;
  return `SSSWRSK: ${rows.length} services, ${swarms.length} swarm jobs, ${risks.length} risk signals. ${alarmed} FULLY ALARMED (swarm coverage + active risk signal), ${blind} BLIND (no swarm or risk coverage). ${alarmed > 0 ? `${alarmed} service${alarmed > 1 ? 's' : ''} have both swarm automation and active risk signals — triple operational alarm state.` : 'No services in triple alarm state.'} ${blind > 0 ? `${blind} service${blind > 1 ? 's' : ''} lack both swarm coverage and risk signal visibility.` : 'All services have at least swarm or risk coverage.'}`;
}

const TILE = { background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '6px 10px', textAlign: 'center', minWidth: 72 };
const LBL = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 };
const VAL = { fontSize: 18, fontWeight: 700, color: '#e2e8f0' };
const STATE_COLOR = { 'FULLY ALARMED': '#f87171', 'AUTOMATED': '#22d3ee', 'RISK-FLAGGED': '#f59e0b', 'BLIND': '#64748b' };
const STATE_ORDER = ['FULLY ALARMED', 'AUTOMATED', 'RISK-FLAGGED', 'BLIND'];

export default function SystemSwarmRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const h = { Authorization: `Bearer ${key}` };
      const [sysRes, swarmRes, riskRes] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, { headers: h }).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`, { headers: h }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.json()),
      ]);
      const services = normaliseServices(sysRes.status === 'fulfilled' ? sysRes.value : null);
      const swarms = normaliseSwarmJobs(swarmRes.status === 'fulfilled' ? swarmRes.value : []);
      const risks = normaliseRiskSignals(riskRes.status === 'fulfilled' ? riskRes.value : []);
      setRows(correlate(services, swarms, risks));
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:ssswrsk-toggle', handler);
    return () => window.removeEventListener('jarvis:ssswrsk-toggle', handler);
  }, []);

  useEffect(() => {
    if (open && rows.length === 0) load();
    if (open) {
      timerRef.current = setInterval(load, 60000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load, rows.length]);

  const assess = useCallback(async () => {
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const alarmed = rows.filter(r => r.state === 'FULLY ALARMED');
    const blind = rows.filter(r => r.state === 'BLIND');
    const msg = `SSSWRSK system × swarm × risk triple: ${rows.length} services total. ${alarmed.length} FULLY ALARMED (have both swarm automation and active risk signal). ${blind.length} BLIND (no swarm coverage and no risk signal). ${alarmed.length > 0 ? `Top alarmed services: ${alarmed.slice(0, 3).map(r => r.name).join(', ')}.` : 'No fully alarmed services.'} Provide a 2-sentence operational brief on swarm coverage gaps and risk signal priorities.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || JSON.stringify(data);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: `SSSWRSK assess error: ${e}` } }));
    }
  }, [rows]);

  const counts = STATE_ORDER.reduce((acc, s) => { acc[s] = rows.filter(r => r.state === s).length; return acc; }, {});
  const alarmed = counts['FULLY ALARMED'] || 0;
  const blind = counts['BLIND'] || 0;
  const automated = counts['AUTOMATED'] || 0;
  const coverBar = rows.length ? Math.round((automated / rows.length) * 100) : 0;
  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (rows.length === 0) load(); }}
        style={{
          position: 'fixed', left: 772000, bottom: 8, zIndex: 407,
          background: 'rgba(30,41,59,0.92)', border: '1px solid rgba(100,116,139,0.4)',
          borderRadius: 6, color: '#94a3b8', fontSize: 10, fontWeight: 600,
          padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.5,
        }}
      >
        ◈ SSSWRSK{alarmed > 0 && <span style={{ color: '#f87171', marginLeft: 4 }}>{alarmed}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9999,
      width: 680, maxHeight: 620,
      background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(100,116,139,0.35)',
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(100,116,139,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171', letterSpacing: 1 }}>◈ SSSWRSK</span>
        <span style={{ fontSize: 10, color: '#64748b', flex: 1 }}>System Status × SwarmJob × RiskSignal Triple Coverage</span>
        {loading && <span style={{ fontSize: 9, color: '#64748b' }}>⟳</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'SERVICES', val: rows.length, color: '#e2e8f0' },
          { label: 'ALARMED', val: alarmed, color: '#f87171' },
          { label: 'AUTOMATED', val: automated, color: '#22d3ee' },
          { label: 'RISK-FLAG', val: counts['RISK-FLAGGED'] || 0, color: '#f59e0b' },
          { label: 'BLIND', val: blind, color: '#64748b' },
        ].map(({ label, val, color }) => (
          <div key={label} style={TILE}>
            <div style={LBL}>{label}</div>
            <div style={{ ...VAL, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Automation coverage bar */}
      <div style={{ padding: '2px 14px 8px' }}>
        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>SWARM AUTOMATED {coverBar}%</div>
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${coverBar}%`, background: '#22d3ee', borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? (STATE_COLOR[s] || 'rgba(100,116,139,0.5)') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 4, color: filter === s ? '#0f172a' : '#94a3b8',
            fontSize: 9, fontWeight: 600, padding: '3px 8px', cursor: 'pointer', letterSpacing: 0.5,
          }}>{s} {s !== 'ALL' ? `(${counts[s] || 0})` : `(${rows.length})`}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 6px' }}>
        <input
          placeholder="Search services…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(100,116,139,0.3)', borderRadius: 5, color: '#e2e8f0',
            fontSize: 10, padding: '4px 8px', outline: 'none',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {err && <div style={{ fontSize: 10, color: '#f87171', marginBottom: 6 }}>{err}</div>}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', paddingTop: 24 }}>No services</div>
        )}
        {visible.map(r => {
          const isExp = expanded === r.id;
          return (
            <div key={r.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 6, cursor: 'pointer',
                  borderLeft: `3px solid ${STATE_COLOR[r.state]}`,
                }}
              >
                <span style={{ fontSize: 10, flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 9, color: '#64748b', minWidth: 54, textAlign: 'center' }}>
                  {r.status}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: STATE_COLOR[r.state], minWidth: 84, textAlign: 'right' }}>
                  {r.state}
                </span>
                <span style={{ fontSize: 10, color: '#475569' }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '6px 8px 2px 12px' }}>
                  {/* SwarmJob pane */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.07)', borderRadius: 5, padding: '5px 7px' }}>
                    <div style={{ fontSize: 9, color: '#22d3ee', marginBottom: 3, fontWeight: 600 }}>⚙ SWARM JOB</div>
                    {r.bestSwarm ? (
                      <>
                        <div style={{ fontSize: 9, color: '#cbd5e1', marginBottom: 3 }}>{r.bestSwarm.label}</div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
                          <div style={{ height: '100%', width: `${Math.round(r.swarmScore * 100)}%`, background: '#22d3ee', borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{Math.round(r.swarmScore * 100)}% match</div>
                      </>
                    ) : <div style={{ fontSize: 9, color: '#475569' }}>No swarm job found</div>}
                  </div>
                  {/* RiskSignal pane */}
                  <div style={{ flex: 1, background: 'rgba(248,113,113,0.07)', borderRadius: 5, padding: '5px 7px' }}>
                    <div style={{ fontSize: 9, color: '#f87171', marginBottom: 3, fontWeight: 600 }}>⚠ RISK SIGNAL</div>
                    {r.bestRisk ? (
                      <>
                        <div style={{ fontSize: 9, color: '#cbd5e1', marginBottom: 3 }}>{r.bestRisk.label}</div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
                          <div style={{ height: '100%', width: `${Math.round(r.riskScore * 100)}%`, background: '#f87171', borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{Math.round(r.riskScore * 100)}% match · {r.bestRisk.severity}</div>
                      </>
                    ) : <div style={{ fontSize: 9, color: '#475569' }}>No risk signal found</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(100,116,139,0.15)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={load} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(100,116,139,0.3)',
          borderRadius: 5, color: '#94a3b8', fontSize: 9, padding: '3px 10px', cursor: 'pointer',
        }}>⟳ Refresh</button>
        <button onClick={assess} style={{
          background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: 5, color: '#f87171', fontSize: 9, fontWeight: 700, padding: '3px 10px', cursor: 'pointer',
        }}>▶ ASSESS</button>
        {lastRefresh && <span style={{ fontSize: 8, color: '#475569', marginLeft: 'auto' }}>↻ {lastRefresh}</span>}
      </div>
    </div>
  );
}
