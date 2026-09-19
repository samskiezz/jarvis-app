import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SSGNCO_RE = /\b(ssgnco|system\s+graph\s+node|service\s+graph\s+node|system\s+network\s+coverage|service\s+centrality|graph\s+node\s+system|node\s+service\s+coverage|system\s+centrality\s+coverage)\b/i;

export function isSsgncoQuery(t) { return SSGNCO_RE.test(t || ''); }

export async function buildSsgncoScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [stR, cnR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
  ]);
  const raw = stR.value ?? {};
  const services = Array.isArray(raw) ? raw
    : (raw.services ?? raw.components ?? raw.checks ?? raw.data ?? []);
  const cnRaw = cnR.value ?? {};
  const nodes = Array.isArray(cnRaw) ? cnRaw
    : (cnRaw.nodes ?? cnRaw.results ?? cnRaw.data ?? []);

  const svcText = services.map(s =>
    `${s.name ?? s.id ?? s.service ?? ''}`.toLowerCase()
  ).join(' ');

  let networked = 0, isolated = 0;
  for (const node of nodes) {
    const text = `${node.id ?? node.node ?? node.name ?? node.label ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hit = tokens.some(tok => svcText.includes(tok));
    if (hit) networked++; else isolated++;
  }
  return `SSGNCO System Status × Graph Node Coverage: ${nodes.length} centrality nodes assessed against ${services.length} live services. ` +
    `NETWORKED: ${networked} (system service alignment found). ` +
    `ISOLATED: ${isolated} (no system service monitors this graph node — coverage gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { NETWORKED: '#22d3ee', ISOLATED: '#f59e0b' };
const STATE_ORDER = ['NETWORKED', 'ISOLATED'];

function scoreMatch(node, services) {
  const text = `${node.id ?? node.node ?? node.name ?? node.label ?? ''}`.toLowerCase();
  const tokens = text.split(/\W+/).filter(t => t.length > 2);
  const matched = [];
  for (const svc of services) {
    const svcName = `${svc.name ?? svc.id ?? svc.service ?? ''}`.toLowerCase();
    const svcTokens = svcName.split(/\W+/).filter(t => t.length > 2);
    const hits = tokens.filter(tok => svcName.includes(tok) || svcTokens.some(st => text.includes(st)));
    if (hits.length > 0) {
      matched.push({ svc, score: Math.min(100, hits.length * 25) });
    }
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(node, services) {
  const text = `${node.id ?? node.node ?? node.name ?? node.label ?? ''}`.toLowerCase();
  const tokens = text.split(/\W+/).filter(t => t.length > 2);
  const svcText = services.map(s => `${s.name ?? s.id ?? s.service ?? ''}`.toLowerCase()).join(' ');
  const hit = tokens.some(tok => svcText.includes(tok));
  return hit ? 'NETWORKED' : 'ISOLATED';
}

export default function SystemStatusGraphNodeCoverage() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [stR, cnR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
      ]);
      const raw = stR.value ?? {};
      const svcs = Array.isArray(raw) ? raw
        : (raw.services ?? raw.components ?? raw.checks ?? raw.data ?? []);
      const cnRaw = cnR.value ?? {};
      const nodes = Array.isArray(cnRaw) ? cnRaw
        : (cnRaw.nodes ?? cnRaw.results ?? cnRaw.data ?? []);
      setServices(svcs);
      setRows(nodes.map(node => ({ ...node, state: correlate(node, svcs), matches: scoreMatch(node, svcs) })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:ssgnco-toggle', toggle);
    return () => window.removeEventListener('jarvis:ssgnco-toggle', toggle);
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
    const isolated = rows.filter(r => r.state === 'ISOLATED').length;
    const networked = rows.filter(r => r.state === 'NETWORKED').length;
    const summary = `SSGNCO: ${rows.length} graph centrality nodes assessed. NETWORKED: ${networked}. ISOLATED: ${isolated} (no system service monitors these high-influence graph nodes — coverage gap).`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this SSGNCO system-status × graph node coverage state in 2 sentences and recommend which isolated high-influence nodes need system service instrumentation: ${summary}` }),
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
    (!search || (r.id ?? r.node ?? r.name ?? r.label ?? '').toLowerCase().includes(search.toLowerCase()))
  );
  const isolatedCount = stateCounts['ISOLATED'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9985, width: 660, maxHeight: 600,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.08)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="SSGNCO System Status × Graph Node Coverage" style={{
        position: 'fixed', left: 781520, bottom: 8, zIndex: 424,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ SSGNCO
        {isolatedCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {isolatedCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const networked = stateCounts['NETWORKED'] ?? 0;
  const pct = total > 0 ? Math.round((networked / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ SSGNCO</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>System Status × Graph Node Coverage</span>
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
          <div style={LABEL}>SERVICES</div>
          <div style={VAL}>{services.length}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>SYSTEM SERVICE COVERAGE</span><span>{pct}%</span>
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
          placeholder="search graph nodes…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no graph nodes match</div>
        ) : visible.map((row, i) => {
          const nodeId = row.id ?? row.node ?? row.name ?? row.label ?? i;
          const isExp = expanded === nodeId;
          const influence = row.centrality ?? row.score ?? row.degree ?? null;
          return (
            <div key={nodeId} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isExp ? null : nodeId)}
                style={{
                  padding: '6px 8px', borderRadius: 5,
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[row.state]}22`,
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 8, color: STATE_COLOR[row.state], minWidth: 80, letterSpacing: 0.5 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(nodeId)}
                </span>
                {row.type && <span style={{ fontSize: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px', color: '#94a3b8' }}>{row.type}</span>}
                {influence != null && (
                  <span style={{ fontSize: 8, color: '#22d3ee', minWidth: 40, textAlign: 'right' }}>
                    {typeof influence === 'number' ? influence.toFixed(3) : influence}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#475569' }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ margin: '2px 0 4px 12px', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, borderLeft: `2px solid ${STATE_COLOR[row.state]}44` }}>
                  {row.matches && row.matches.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 8, color: '#64748b', marginBottom: 4, letterSpacing: 1 }}>MATCHED SERVICES ({row.matches.length})</div>
                      {row.matches.slice(0, 6).map((m, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: '#22d3ee', minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.svc.name ?? m.svc.id ?? m.svc.service ?? '—'}
                          </span>
                          {m.svc.status && (
                            <span style={{ fontSize: 7, background: m.svc.status === 'healthy' || m.svc.status === 'ok' ? 'rgba(34,211,238,0.15)' : 'rgba(248,113,113,0.15)', borderRadius: 3, padding: '1px 4px', color: m.svc.status === 'healthy' || m.svc.status === 'ok' ? '#22d3ee' : '#f87171' }}>
                              {m.svc.status}
                            </span>
                          )}
                          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${m.score}%`, background: '#22d3ee', borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 8, color: '#64748b', minWidth: 28, textAlign: 'right' }}>{m.score}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: '#f59e0b' }}>⚠ No system service monitors this graph node</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
          color: '#f59e0b', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>
    </div>
  );
}
