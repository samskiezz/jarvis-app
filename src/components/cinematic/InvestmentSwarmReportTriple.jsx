import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISJREP_RE = /\b(isjrep|investment\s+swarm\s+report|invest\s+swarm\s+report|swarm\s+report\s+invest|invest\s+automation\s+report|portfolio\s+swarm\s+report|investment\s+automation\s+coverage|investment\s+report\s+swarm|untracked\s+investment|invest\s+doc\s+coverage|investment\s+swarm\s+coverage|portfolio\s+report\s+swarm|swarm\s+invest\s+report|investment\s+fully\s+documented)\b/i;
const THRESHOLD = 0.08;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.investments || raw.items || raw.data || []);
  return arr.map((inv, i) => ({
    id: inv.id || inv.investment_id || `inv-${i}`,
    label: inv.name || inv.title || inv.label || `Investment ${i + 1}`,
    sector: inv.sector || inv.industry || inv.asset_class || '',
    ticker: inv.ticker || inv.symbol || '',
    notes: inv.notes || inv.description || inv.summary || '',
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
    _searchText: [inv.name, inv.title, inv.label, inv.sector, inv.industry, inv.asset_class, inv.ticker, inv.symbol, inv.notes, inv.description, inv.summary, inv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.jobs || raw.swarm_jobs || raw.items || raw.data || []);
  return arr.map((j, i) => ({
    id: j.id || j.job_id || `job-${i}`,
    label: j.name || j.title || j.label || `Job ${i + 1}`,
    type: j.type || j.kind || j.category || '',
    status: j.status || j.state || '',
    description: j.description || j.summary || '',
    _searchText: [j.name, j.title, j.label, j.type, j.kind, j.category, j.status, j.description, j.summary, j.tags].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.reports || raw.items || raw.data || []);
  return arr.map((r, i) => ({
    id: r.id || r.report_id || `rpt-${i}`,
    label: r.title || r.name || r.label || `Report ${i + 1}`,
    type: r.type || r.kind || r.category || '',
    summary: r.summary || r.description || r.abstract || '',
    _searchText: [r.title, r.name, r.label, r.type, r.kind, r.category, r.summary, r.description, r.abstract, r.tags].filter(Boolean).join(' '),
  }));
}

function correlate(investments, swarmJobs, reports) {
  return investments.map(inv => {
    const iToks = tok(inv._searchText);
    const matchedJobs = swarmJobs
      .map(j => ({ ...j, score: matchScore(iToks, j._searchText) }))
      .filter(j => j.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedReports = reports
      .map(r => ({ ...r, score: matchScore(iToks, r._searchText) }))
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasSwarm = matchedJobs.length > 0;
    const hasReport = matchedReports.length > 0;
    let coverage;
    if (hasSwarm && hasReport) coverage = 'FULLY_DOCUMENTED';
    else if (hasSwarm) coverage = 'AUTOMATED';
    else if (hasReport) coverage = 'REPORTED';
    else coverage = 'UNTRACKED';
    return { ...inv, matchedJobs, matchedReports, coverage };
  });
}

export function isIsjrepQuery(t) {
  return ISJREP_RE.test(t || '');
}

export async function buildIsjrepScript() {
  try {
    const [invR, jobR, rptR] = await Promise.all([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseInvestments(invR), normaliseSwarmJobs(jobR), normaliseReports(rptR));
    const fullyDoc = rows.filter(r => r.coverage === 'FULLY_DOCUMENTED').length;
    const untracked = rows.filter(r => r.coverage === 'UNTRACKED').length;
    return `ISJREP coverage: ${rows.length} investments assessed against swarm automation and intelligence reports — ${fullyDoc} fully documented (both swarm coverage and report backing), ${untracked} untracked (no swarm or report coverage — intelligence and automation gap). ${untracked > 0 ? `${untracked} investment${untracked > 1 ? 's have' : ' has'} zero swarm automation and zero report coverage — immediate intelligence and automation review required.` : 'All investments have either swarm automation or report coverage at this time.'}`;
  } catch {
    return 'ISJREP: investment swarm report coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY DOCUMENTED', 'AUTOMATED', 'REPORTED', 'UNTRACKED'];
const TAB_KEY = {
  'ALL': null,
  'FULLY DOCUMENTED': 'FULLY_DOCUMENTED',
  'AUTOMATED': 'AUTOMATED',
  'REPORTED': 'REPORTED',
  'UNTRACKED': 'UNTRACKED',
};

const COVER_COLOR = {
  FULLY_DOCUMENTED: '#22c55e',
  AUTOMATED: '#06b6d4',
  REPORTED: '#a78bfa',
  UNTRACKED: '#64748b',
};

const LABEL_MAP = {
  FULLY_DOCUMENTED: 'FULLY DOCUMENTED',
  AUTOMATED: 'AUTOMATED',
  REPORTED: 'REPORTED',
  UNTRACKED: 'UNTRACKED',
};

export default function InvestmentSwarmReportTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, jobs: 0, reports: 0, fullyDoc: 0, automated: 0, reported: 0, untracked: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invR, jobR, rptR] = await Promise.all([
        fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : Promise.reject(`investments ${r.status}`)),
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(`swarmjobs ${r.status}`)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(`reports ${r.status}`)),
      ]);
      const investments = normaliseInvestments(invR);
      const swarmJobs = normaliseSwarmJobs(jobR);
      const reports = normaliseReports(rptR);
      const correlated = correlate(investments, swarmJobs, reports);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        jobs: swarmJobs.length,
        reports: reports.length,
        fullyDoc: correlated.filter(r => r.coverage === 'FULLY_DOCUMENTED').length,
        automated: correlated.filter(r => r.coverage === 'AUTOMATED').length,
        reported: correlated.filter(r => r.coverage === 'REPORTED').length,
        untracked: correlated.filter(r => r.coverage === 'UNTRACKED').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:isjrep-toggle', handler);
    return () => window.removeEventListener('jarvis:isjrep-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) ||
        r.sector.toLowerCase().includes(s) ||
        r.ticker.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const total = counts.total || 1;
  const barFull = (counts.fullyDoc / total * 100).toFixed(1);
  const barAuto = (counts.automated / total * 100).toFixed(1);
  const barRep = (counts.reported / total * 100).toFixed(1);
  const barUnt = (counts.untracked / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse investment "${row.label}"${row.sector ? ' (sector: ' + row.sector + ')' : ''} for swarm automation and intelligence report coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched swarm jobs: ${row.matchedJobs.map(j => j.label).join(', ') || 'none'}. Matched reports: ${row.matchedReports.map(r => r.label).join(', ') || 'none'}. ${row.coverage === 'FULLY_DOCUMENTED' ? 'This investment has both swarm automation and report coverage — assess the completeness of coverage and recommend optimisation.' : row.coverage === 'UNTRACKED' ? 'This investment has no swarm automation or report coverage — assess the intelligence and automation gap and recommend immediate action.' : row.coverage === 'AUTOMATED' ? 'This investment has swarm coverage but no intelligence report — assess the reporting gap.' : 'This investment has report coverage but no swarm automation — assess the automation gap.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 823520, bottom: 8, zIndex: 499,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Investment × SwarmJob × Report Triple Coverage (ISJREP)"
      >
        ◈ ISJREP
        {counts.untracked > 0 && (
          <span style={{
            background: '#64748b', color: '#f8fafc', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.untracked}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 499,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ ISJREP</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Investment × SwarmJob × Report Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'INVESTMENTS', val: counts.total, color: '#94a3b8' },
          { label: 'SWARM JOBS', val: counts.jobs, color: '#06b6d4' },
          { label: 'REPORTS', val: counts.reports, color: '#a78bfa' },
          { label: 'FULLY DOCUMENTED', val: counts.fullyDoc, color: '#22c55e' },
          { label: 'AUTOMATED', val: counts.automated, color: '#06b6d4' },
          { label: 'REPORTED', val: counts.reported, color: '#a78bfa' },
          { label: 'UNTRACKED', val: counts.untracked, color: '#64748b' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barFull}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${barAuto}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barRep}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
        <div style={{ width: `${barUnt}%`, background: '#64748b', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22c55e' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22c55e' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No investments match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 130 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              {row.sector && (
                <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.sector.slice(0, 18)}</span>
              )}
              {row.ticker && (
                <span style={{ color: '#94a3b8', fontSize: 9, background: 'rgba(100,116,139,0.2)', borderRadius: 3, padding: '1px 5px' }}>{row.ticker}</span>
              )}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedJobs.length}sw {row.matchedReports.length}rpt
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.notes && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{row.notes.slice(0, 120)}{row.notes.length > 120 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Swarm jobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SWARM JOBS ({row.matchedJobs.length})</div>
                    {row.matchedJobs.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched swarm jobs.</div>
                      : row.matchedJobs.slice(0, 5).map(j => (
                        <div key={j.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(j.score * 400, 100)}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            {j.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(6,182,212,0.1)', borderRadius: 3, padding: '1px 4px' }}>{j.type.slice(0, 16)}</span>}
                            {j.status && <span style={{ color: '#64748b', fontSize: 9 }}>{j.status.slice(0, 10)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{j.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Reports */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>REPORTS ({row.matchedReports.length})</div>
                    {row.matchedReports.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched reports.</div>
                      : row.matchedReports.slice(0, 5).map(r => (
                        <div key={r.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(r.score * 400, 100)}%`, height: '100%', background: '#a78bfa' }} />
                            </div>
                            {r.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 4px' }}>{r.type.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{r.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e44',
                    borderRadius: 4, color: '#22c55e', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
