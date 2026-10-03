import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IGRCOV_RE = /\b(igrcov|invest(?:ment)?[_\s-]?graph[_\s-]?(?:community|report)|invest(?:ment)?[_\s-]?community[_\s-]?report|invest(?:ment)?[_\s-]?report[_\s-]?(?:graph|community)|graph[_\s-]?community[_\s-]?invest(?:ment)?|uncovered[_\s-]?invest(?:ment)?|invest(?:ment)?[_\s-]?network[_\s-]?report|portfolio[_\s-]?community|portfolio[_\s-]?report[_\s-]?coverage)\b/i;

export function isIgrcovQuery(t) { return IGRCOV_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function normInvestments(raw) {
  return normaliseArray(raw).map(inv => ({
    id: inv.id || inv._id || String(Math.random()),
    label: inv.name || inv.title || inv.symbol || inv.ticker || 'Unnamed Investment',
    sector: inv.sector || inv.industry || inv.asset_class || inv.category || '',
    ticker: inv.ticker || inv.symbol || '',
    description: String(inv.description || inv.notes || inv.summary || ''),
    tags: Array.isArray(inv.tags) ? inv.tags : [],
  }));
}

function normCommunities(raw) {
  return normaliseArray(raw).map(c => ({
    id: c.id || c._id || String(Math.random()),
    label: c.label || c.name || c.title || 'Community',
    type: c.type || c.kind || '',
    summary: String(c.summary || c.description || c.detail || ''),
    members: c.member_count || c.members || c.size || 0,
    tags: Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normReports(raw) {
  return normaliseArray(raw).map(r => ({
    id: r.id || r._id || String(Math.random()),
    title: r.title || r.name || r.heading || 'Untitled Report',
    type: r.type || r.category || r.kind || '',
    summary: String(r.summary || r.description || r.abstract || '').slice(0, 300),
    tags: Array.isArray(r.tags) ? r.tags : [],
  }));
}

function matchScore(invToks, fields) {
  if (!invToks.length) return 0;
  const pool = tok(fields.join(' '));
  if (!pool.length) return 0;
  const hits = invToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(invToks.length, pool.length);
}

const THRESHOLD = 0.1;

function correlate(investments, communities, reports) {
  return investments.map(inv => {
    const invToks = tok([inv.label, inv.sector, inv.ticker, inv.description, ...inv.tags].join(' '));

    const bestComm = communities.reduce((best, c) => {
      const s = matchScore(invToks, [c.label, c.summary, c.type, ...c.tags]);
      return s > best.score ? { score: s, item: c } : best;
    }, { score: 0, item: null });

    const bestReport = reports.reduce((best, r) => {
      const s = matchScore(invToks, [r.title, r.summary, r.type, ...r.tags]);
      return s > best.score ? { score: s, item: r } : best;
    }, { score: 0, item: null });

    const hasComm = bestComm.score >= THRESHOLD;
    const hasReport = bestReport.score >= THRESHOLD;

    let state;
    if (hasComm && hasReport) state = 'FULLY DOCUMENTED';
    else if (hasComm) state = 'COMMUNITY-BACKED';
    else if (hasReport) state = 'REPORTED';
    else state = 'UNCOVERED';

    return { ...inv, state, comm: hasComm ? bestComm : null, report: hasReport ? bestReport : null };
  });
}

export async function buildIgrcovScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [iR, cR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
  ]);
  const investments = normInvestments(iR.status === 'fulfilled' ? iR.value : []);
  const communities = normCommunities(cR.status === 'fulfilled' ? cR.value : []);
  const reports = normReports(rR.status === 'fulfilled' ? rR.value : []);
  const rows = correlate(investments, communities, reports);
  const fd = rows.filter(r => r.state === 'FULLY DOCUMENTED').length;
  const cb = rows.filter(r => r.state === 'COMMUNITY-BACKED').length;
  const rp = rows.filter(r => r.state === 'REPORTED').length;
  const uc = rows.filter(r => r.state === 'UNCOVERED').length;
  return `IGRCOV Investment × Graph Community × Report: ${investments.length} investments cross-referenced against ${communities.length} graph communities and ${reports.length} reports. ` +
    `FULLY DOCUMENTED: ${fd} (community network context + report backing). ` +
    `COMMUNITY-BACKED: ${cb} (network community found, no report). ` +
    `REPORTED: ${rp} (report found, no community context). ` +
    `UNCOVERED: ${uc} (no graph community or report coverage — portfolio intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 88, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY DOCUMENTED': '#22d3ee',
  'COMMUNITY-BACKED': '#34d399',
  'REPORTED': '#a78bfa',
  'UNCOVERED': '#f59e0b',
};
const STATE_ORDER = ['FULLY DOCUMENTED', 'COMMUNITY-BACKED', 'REPORTED', 'UNCOVERED'];

export default function InvestmentGraphReportTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [reports, setReports] = useState([]);
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
      const [iR, cR, rR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
      ]);
      const investments = normInvestments(iR.status === 'fulfilled' ? iR.value : []);
      const comm = normCommunities(cR.status === 'fulfilled' ? cR.value : []);
      const rpts = normReports(rR.status === 'fulfilled' ? rR.value : []);
      setCommunities(comm);
      setReports(rpts);
      setRows(correlate(investments, comm, rpts));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:igrcov-toggle', toggle);
    return () => window.removeEventListener('jarvis:igrcov-toggle', toggle);
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
    const fd = rows.filter(r => r.state === 'FULLY DOCUMENTED').length;
    const uc = rows.filter(r => r.state === 'UNCOVERED').length;
    const summary = `IGRCOV: ${rows.length} investments. FULLY DOCUMENTED: ${fd}. COMMUNITY-BACKED: ${rows.filter(r => r.state === 'COMMUNITY-BACKED').length}. REPORTED: ${rows.filter(r => r.state === 'REPORTED').length}. UNCOVERED (gap): ${uc}. ${communities.length} graph communities, ${reports.length} reports indexed.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this IGRCOV investment graph community and report coverage state. Identify the two highest-priority uncovered investments that need network context or report documentation: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows, communities, reports]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()))
  );
  const uncoveredCount = stateCounts['UNCOVERED'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9987, width: 700, maxHeight: 620,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.06)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="IGRCOV Investment × Graph Community × Report Triple Coverage" style={{
        position: 'fixed', left: 760800, bottom: 8, zIndex: 387,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ IGRCOV
        {uncoveredCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {uncoveredCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY DOCUMENTED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ IGRCOV</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Investment × Graph Community × Report Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
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
          <div style={LABEL}>COMMUNITIES</div>
          <div style={{ ...VAL, fontSize: 16 }}>{communities.length}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>REPORTS</div>
          <div style={{ ...VAL, fontSize: 16 }}>{reports.length}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY DOCUMENTED COVERAGE</span>
          <span>{pct}% · {communities.length} communities · {reports.length} reports</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#f59e0b') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no investments match</div>
        ) : visible.map((inv, i) => (
          <div key={inv.id ?? i} style={{
            padding: '7px 10px', marginBottom: 5, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[inv.state]}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: inv.comm || inv.report ? 4 : 0 }}>
              <span style={{ fontSize: 8, color: STATE_COLOR[inv.state], minWidth: 140, letterSpacing: 0.5, flexShrink: 0 }}>{inv.state}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inv.label || '—'}
              </span>
              {inv.ticker && <span style={{ fontSize: 8, color: '#64748b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{inv.ticker}</span>}
              {inv.sector && <span style={{ fontSize: 8, color: '#475569', flexShrink: 0 }}>{inv.sector}</span>}
            </div>
            {(inv.comm || inv.report) && (
              <div style={{ paddingLeft: 148, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {inv.comm && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#34d399', minWidth: 18 }}>GC</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.comm.item?.label}</span>
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(inv.comm.score * 100)}%`, background: '#34d399', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(inv.comm.score * 100)}%</span>
                  </div>
                )}
                {inv.report && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#a78bfa', minWidth: 18 }}>RP</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.report.item?.title}</span>
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(inv.report.score * 100)}%`, background: '#a78bfa', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(inv.report.score * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
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

      <div style={{ padding: '4px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 8, color: 'rgba(0,212,255,0.25)', textAlign: 'right' }}>
        /entities/Investment × /v1/graph/communities × /v1/reports
      </div>
    </div>
  );
}
