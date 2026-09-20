import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCRRISK_RE = /\b(gcrrisk|graph\s+community\s+report\s+risk|community\s+risk\s+report|community\s+report\s+risk|dark\s+community|fully\s+flagged\s+community|community\s+threat\s+report|risk\s+report\s+community|community\s+intelligence\s+risk|community\s+risk\s+signal\s+report|network\s+community\s+risk|community\s+report\s+threat|community\s+flagged\s+risk)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseCommunities(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.communities) ? data.communities
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.label || c.title || 'Unnamed Community',
    description: c.description || c.summary || '',
    category: c.category || c.type || c.kind || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.reports) ? data.reports
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    name: r.name || r.title || r.label || 'Unnamed Report',
    type: r.type || r.kind || r.category || '',
    summary: r.summary || r.description || r.abstract || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function normaliseRisks(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.signals) ? data.signals
    : Array.isArray(data.risk_signals) ? data.risk_signals
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Risk',
    category: s.category || s.type || s.kind || '',
    severity: s.severity || s.level || s.priority || '',
    description: s.description || s.summary || s.details || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(communities, reports, risks) {
  return communities.map(comm => {
    const toks = [
      ...tok(comm.name),
      ...tok(comm.description),
      ...tok(comm.category),
      ...tok(comm.tags),
    ];

    const matchedReports = reports
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.summary),
          matchScore(toks, r.type),
          matchScore(toks, r.tags),
        );
        return { ...r, score };
      })
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedRisks = risks
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.description),
          matchScore(toks, s.category),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasReport = matchedReports.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let state;
    if (hasReport && hasRisk) state = 'FULLY FLAGGED';
    else if (hasReport) state = 'REPORT-BACKED';
    else if (hasRisk) state = 'RISK-EXPOSED';
    else state = 'DARK';

    return { comm, matchedReports, matchedRisks, state };
  });
}

export function isGcrriskQuery(t) {
  return GCRRISK_RE.test(t || '');
}

export async function buildGcrriskScript() {
  try {
    const [commRes, rptRes, rskRes] = await Promise.allSettled([
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : null),
    ]);

    const communities = normaliseCommunities(commRes.status === 'fulfilled' ? commRes.value : null);
    const reports = normaliseReports(rptRes.status === 'fulfilled' ? rptRes.value : null);
    const risks = normaliseRisks(rskRes.status === 'fulfilled' ? rskRes.value : null);
    const rows = correlate(communities, reports, risks);

    const flagged = rows.filter(r => r.state === 'FULLY FLAGGED').length;
    const reportBacked = rows.filter(r => r.state === 'REPORT-BACKED').length;
    const riskExposed = rows.filter(r => r.state === 'RISK-EXPOSED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;

    return `GCRRISK Graph Community×Report×RiskSignal: ${communities.length} communities correlated against ${reports.length} reports and ${risks.length} risk signals. ` +
      `${flagged} FULLY FLAGGED (report+risk — both documentary backing and active threat signal), ` +
      `${reportBacked} REPORT-BACKED (documented, no active threat), ` +
      `${riskExposed} RISK-EXPOSED (threat flagged, undocumented), ` +
      `${dark} DARK (no report or risk coverage — network intelligence blind spot). ` +
      (flagged > 0
        ? `${flagged} communities have both report coverage and active risk signals — review required.`
        : dark > 0
        ? `${dark} communities lack both report and risk coverage — intelligence gaps detected.`
        : 'Network community coverage nominal.');
  } catch {
    return 'GCRRISK: data fetch failed.';
  }
}

const STATE_COLOUR = {
  'FULLY FLAGGED': '#f44336',
  'REPORT-BACKED': '#4fc3f7',
  'RISK-EXPOSED': '#ff7043',
  'DARK': '#37474f',
};

export default function GraphCommunityReportRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:gcrrisk-toggle', handler);
    return () => window.removeEventListener('jarvis:gcrrisk-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [commRes, rptRes, rskRes] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const communities = normaliseCommunities(commRes.status === 'fulfilled' ? commRes.value : null);
      const reports = normaliseReports(rptRes.status === 'fulfilled' ? rptRes.value : null);
      const risks = normaliseRisks(rskRes.status === 'fulfilled' ? rskRes.value : null);

      if (!communities.length && !reports.length && !risks.length) {
        setErr('No data from graph/communities, reports, or RiskSignal endpoints.');
      }

      setRows(correlate(communities, reports, risks));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const flagged = rows.filter(r => r.state === 'FULLY FLAGGED').length;
  const reportBacked = rows.filter(r => r.state === 'REPORT-BACKED').length;
  const riskExposed = rows.filter(r => r.state === 'RISK-EXPOSED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY FLAGGED', 'REPORT-BACKED', 'RISK-EXPOSED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.comm.name.toLowerCase().includes(q) ||
        r.matchedReports.some(rp => rp.name.toLowerCase().includes(q)) ||
        r.matchedRisks.some(s => s.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    flagged: (flagged / total) * 100,
    report: (reportBacked / total) * 100,
    risk: (riskExposed / total) * 100,
    dark: (dark / total) * 100,
  } : { flagged: 0, report: 0, risk: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Graph community "${row.comm.name}" [${row.comm.category || ''}] coverage state: ${row.state}. ` +
      `Matched reports: ${row.matchedReports.map(r => r.name).join(', ') || 'none'}. ` +
      `Matched risk signals: ${row.matchedRisks.map(s => s.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence community threat coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 819040,
          bottom: 8,
          zIndex: 491,
          background: 'rgba(0,8,20,0.85)',
          border: `1px solid ${flagged > 0 ? '#f4433680' : '#1a3050'}`,
          color: flagged > 0 ? '#f44336' : '#2a6090',
          padding: '3px 7px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >
        ◈ GCRRISK{flagged > 0 ? ` [${flagged}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      left: 20,
      top: 60,
      width: 660,
      maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,8,20,0.97)',
      border: '1px solid #1a3050',
      borderRadius: 8,
      zIndex: 9900,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1a3050',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ color: '#f44336', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ GCRRISK</span>
        <span style={{ color: '#4a6fa0', fontSize: 10, flex: 1 }}>Graph Community × Report × Risk Signal Triple Coverage</span>
        {loading && <span style={{ color: '#00e5ff', fontSize: 9 }}>LOADING…</span>}
        {lastRefresh && !loading && (
          <span style={{ color: '#2a4060', fontSize: 9 }}>{lastRefresh.toLocaleTimeString()}</span>
        )}
        <button
          onClick={load}
          disabled={loading}
          style={{ background: 'none', border: '1px solid #1a3050', color: '#2a6090', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}
        >↺</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#2a4060', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        >✕</button>
      </div>

      {err && (
        <div style={{ padding: '6px 14px', background: '#f4433612', color: '#f44336', fontSize: 10 }}>{err}</div>
      )}

      {/* Stat tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        padding: '8px 14px',
        borderBottom: '1px solid #1a3050',
        flexShrink: 0,
      }}>
        {[
          { label: 'COMMS', val: rows.length, col: '#f44336' },
          { label: 'REPORTS', val: rows.reduce((a, r) => a + r.matchedReports.length, 0), col: '#4fc3f7' },
          { label: 'RISKS', val: rows.reduce((a, r) => a + r.matchedRisks.length, 0), col: '#ff7043' },
          { label: 'FLAGGED', val: flagged, col: flagged > 0 ? '#f44336' : '#37474f' },
          { label: 'RPT-BKD', val: reportBacked, col: '#4fc3f7' },
          { label: 'RSK-EXP', val: riskExposed, col: '#ff7043' },
          { label: 'DARK', val: dark, col: dark > 0 ? '#607d8b' : '#37474f' },
        ].map(t => (
          <div key={t.label} style={{ textAlign: 'center' }}>
            <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#2a4060', fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ height: 4, display: 'flex', flexShrink: 0, margin: '0 14px 8px' }}>
        <div style={{ width: `${cbw.flagged}%`, background: '#f44336', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.report}%`, background: '#4fc3f7', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.risk}%`, background: '#ff7043', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.dark}%`, background: '#37474f80', transition: 'width 0.4s' }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? `${STATE_COLOUR[tab] || '#00e5ff'}22` : 'none',
              border: `1px solid ${filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#1a3050'}`,
              color: filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#2a6090',
              padding: '2px 7px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,20,40,0.6)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 7px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            width: 110,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', fontSize: 11, padding: '20px 14px', textAlign: 'center' }}>
            No communities match current filter.
          </div>
        )}
        {visible.map(row => (
          <div
            key={row.comm.id}
            style={{
              borderBottom: '1px solid #0d1e30',
              background: expanded === row.comm.id ? 'rgba(0,20,40,0.4)' : 'transparent',
            }}
          >
            <div
              onClick={() => setExpanded(expanded === row.comm.id ? null : row.comm.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer' }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 110,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.comm.name}
              </span>
              {row.comm.category && (
                <span style={{ color: '#4a6fa0', fontSize: 9, background: '#f4433622', borderRadius: 2, padding: '0 4px' }}>
                  {row.comm.category}
                </span>
              )}
              <span style={{ color: '#4fc3f7', fontSize: 9 }}>{row.matchedReports.length}R</span>
              <span style={{ color: '#ff7043', fontSize: 9 }}>{row.matchedRisks.length}S</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(244,67,54,0.12)',
                  border: '1px solid #f4433655',
                  color: '#f44336',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.comm.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.comm.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Reports */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#4fc3f7', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    REPORTS ({row.matchedReports.length})
                  </div>
                  {row.matchedReports.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No report match — undocumented community</div>
                  ) : row.matchedReports.slice(0, 5).map(r => (
                    <div key={r.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{r.name}</div>
                      {r.type && (
                        <span style={{ color: '#4a6fa0', fontSize: 9, background: '#4fc3f722', borderRadius: 2, padding: '0 3px' }}>
                          {r.type}
                        </span>
                      )}
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(r.score * 100)}%`, background: '#4fc3f7', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Risk Signals */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ff7043', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    RISK SIGNALS ({row.matchedRisks.length})
                  </div>
                  {row.matchedRisks.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No risk signal match — no active threat</div>
                  ) : row.matchedRisks.slice(0, 5).map(s => (
                    <div key={s.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{s.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s.category && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ff704322', borderRadius: 2, padding: '0 3px' }}>
                            {s.category}
                          </span>
                        )}
                        {s.severity && (
                          <span style={{ color: '#ff7043', fontSize: 9, background: '#ff704311', borderRadius: 2, padding: '0 3px' }}>
                            {s.severity}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(s.score * 100)}%`, background: '#ff7043', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {row.comm.description && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050' }}>
                    <span style={{ color: '#4a6fa0', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.comm.description.slice(0, 120)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
