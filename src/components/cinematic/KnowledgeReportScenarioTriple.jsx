import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const KRSCTRI_RE = /\b(krsctri|knowledge\s+report\s+scenario|kb\s+report\s+scenario|dormant\s+knowledge|fully\s+informed\s+knowledge|knowledge\s+scenario\s+report|report\s+scenario\s+knowledge|kb\s+scenario\s+report|knowledge\s+article\s+scenario|knowledge\s+document\s+scenario|article\s+report\s+scenario)\b/i;
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

function normaliseKnowledge(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.articles || raw.items || raw.data || raw.knowledge || []);
  return arr.map((a, i) => ({
    id: a.id || a.article_id || `kb-${i}`,
    title: a.title || a.name || a.label || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
    content: a.content || a.body || a.summary || a.description || '',
    _searchText: [a.title, a.name, a.category, a.type, a.kind, a.tags, a.content, a.summary, a.description].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.reports || raw.items || raw.data || []);
  return arr.map((r, i) => ({
    id: r.id || r.report_id || `rpt-${i}`,
    title: r.title || r.name || r.label || `Report ${i + 1}`,
    type: r.type || r.category || r.report_type || '',
    summary: r.summary || r.description || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
    _searchText: [r.title, r.name, r.type, r.category, r.summary, r.description, r.tags].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.scenarios || raw.items || raw.data || []);
  return arr.map((s, i) => ({
    id: s.id || s.scenario_id || `sc-${i}`,
    name: s.name || s.title || s.label || `Scenario ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    status: s.status || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
    _searchText: [s.name, s.title, s.category, s.type, s.description, s.summary, s.tags].filter(Boolean).join(' '),
  }));
}

function correlate(articles, reports, scenarios) {
  return articles.map(art => {
    const aToks = tok(art._searchText);
    const matchedRpts = reports
      .map(r => ({ ...r, score: matchScore(aToks, r._searchText) }))
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedScs = scenarios
      .map(s => ({ ...s, score: matchScore(aToks, s._searchText) }))
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasRpt = matchedRpts.length > 0;
    const hasSc = matchedScs.length > 0;
    let coverage;
    if (hasRpt && hasSc) coverage = 'FULLY_INFORMED';
    else if (hasRpt) coverage = 'REPORT_BACKED';
    else if (hasSc) coverage = 'SCENARIO_LINKED';
    else coverage = 'DORMANT';
    return { ...art, matchedRpts, matchedScs, coverage };
  });
}

export function isKrsctriQuery(t) {
  return KRSCTRI_RE.test(t || '');
}

export async function buildKrsctriScript() {
  try {
    const [kbR, rptR, scR] = await Promise.all([
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseKnowledge(kbR), normaliseReports(rptR), normaliseScenarios(scR));
    const dormant = rows.filter(r => r.coverage === 'DORMANT').length;
    const informed = rows.filter(r => r.coverage === 'FULLY_INFORMED').length;
    return `KRSCTRI coverage: ${rows.length} KB articles assessed — ${informed} fully informed (report and scenario), ${dormant} dormant (no report or scenario coverage). ${dormant > 0 ? `Priority gap: ${dormant} article${dormant > 1 ? 's have' : ' has'} no documentary or planning backing — review for intelligence gaps.` : 'All articles have either report or scenario coverage.'}`;
  } catch {
    return 'KRSCTRI: knowledge report scenario coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY INFORMED', 'REPORT BACKED', 'SCENARIO LINKED', 'DORMANT'];
const TAB_KEY = { 'ALL': null, 'FULLY INFORMED': 'FULLY_INFORMED', 'REPORT BACKED': 'REPORT_BACKED', 'SCENARIO LINKED': 'SCENARIO_LINKED', 'DORMANT': 'DORMANT' };

const COVER_COLOR = {
  FULLY_INFORMED: '#22d3ee',
  REPORT_BACKED: '#06b6d4',
  SCENARIO_LINKED: '#818cf8',
  DORMANT: '#64748b',
};

const LABEL_MAP = {
  FULLY_INFORMED: 'FULLY INFORMED',
  REPORT_BACKED: 'REPORT BACKED',
  SCENARIO_LINKED: 'SCENARIO LINKED',
  DORMANT: 'DORMANT',
};

export default function KnowledgeReportScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, reports: 0, scenarios: 0, informed: 0, reportBacked: 0, scenLinked: 0, dormant: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [kbR, rptR, scR] = await Promise.all([
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(`knowledge ${r.status}`)),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(`reports ${r.status}`)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(`scenarios ${r.status}`)),
      ]);
      const articles = normaliseKnowledge(kbR);
      const reports = normaliseReports(rptR);
      const scenarios = normaliseScenarios(scR);
      const correlated = correlate(articles, reports, scenarios);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        reports: reports.length,
        scenarios: scenarios.length,
        informed: correlated.filter(r => r.coverage === 'FULLY_INFORMED').length,
        reportBacked: correlated.filter(r => r.coverage === 'REPORT_BACKED').length,
        scenLinked: correlated.filter(r => r.coverage === 'SCENARIO_LINKED').length,
        dormant: correlated.filter(r => r.coverage === 'DORMANT').length,
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
    window.addEventListener('jarvis:krsctri-toggle', handler);
    return () => window.removeEventListener('jarvis:krsctri-toggle', handler);
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
      return r.title.toLowerCase().includes(s) || r.category.toLowerCase().includes(s) || r.content.toLowerCase().includes(s);
    }
    return true;
  });

  const total = counts.total || 1;
  const barInformed = (counts.informed / total * 100).toFixed(1);
  const barRpt = (counts.reportBacked / total * 100).toFixed(1);
  const barScn = (counts.scenLinked / total * 100).toFixed(1);
  const barDorm = (counts.dormant / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse KB article "${row.title}" (category: ${row.category || 'unknown'}) for report and scenario coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched reports: ${row.matchedRpts.map(r => r.title).join(', ') || 'none'}. Matched scenarios: ${row.matchedScs.map(s => s.name).join(', ') || 'none'}. ${row.coverage === 'DORMANT' ? 'This knowledge article has no report or scenario coverage — identify the intelligence gap and recommend immediate action.' : 'Assess the quality of coverage and any remaining gaps.'} Respond in exactly 2 sentences.`;
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
          position: 'fixed', left: 821280, bottom: 8, zIndex: 495,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Knowledge × Report × Scenario Triple Coverage (KRSCTRI)"
      >
        ◈ KRSCTRI
        {counts.dormant > 0 && (
          <span style={{
            background: '#64748b', color: '#fff', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.dormant}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 880, maxHeight: '78vh', zIndex: 495,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ KRSCTRI</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Knowledge × Report × Scenario Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'KB ARTICLES', val: counts.total, color: '#94a3b8' },
          { label: 'REPORTS', val: counts.reports, color: '#06b6d4' },
          { label: 'SCENARIOS', val: counts.scenarios, color: '#818cf8' },
          { label: 'FULLY INFORMED', val: counts.informed, color: '#22d3ee' },
          { label: 'REPORT BACKED', val: counts.reportBacked, color: '#06b6d4' },
          { label: 'SCEN LINKED', val: counts.scenLinked, color: '#818cf8' },
          { label: 'DORMANT', val: counts.dormant, color: '#64748b' },
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
        <div style={{ width: `${barInformed}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
        <div style={{ width: `${barRpt}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barScn}%`, background: '#818cf8', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDorm}%`, background: '#64748b', transition: 'width 0.4s' }} />
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
            background: tab === t ? 'rgba(34,211,238,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22d3ee' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22d3ee' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No articles match current filter.</div>
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
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 108 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.title}</span>
              {row.category && <span style={{ color: '#475569', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.category}</span>}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedRpts.length}rpt {row.matchedScs.length}sc
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.content && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8, fontStyle: 'italic' }}>{row.content.slice(0, 200)}{row.content.length > 200 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Reports */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>REPORTS ({row.matchedRpts.length})</div>
                    {row.matchedRpts.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched reports.</div>
                      : row.matchedRpts.slice(0, 5).map(r => (
                        <div key={r.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(r.score * 400, 100)}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            {r.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(6,182,212,0.1)', borderRadius: 3, padding: '1px 4px' }}>{r.type.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{r.title}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#818cf8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SCENARIOS ({row.matchedScs.length})</div>
                    {row.matchedScs.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched scenarios.</div>
                      : row.matchedScs.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(s.score * 400, 100)}%`, height: '100%', background: '#818cf8' }} />
                            </div>
                            {s.category && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(129,140,248,0.1)', borderRadius: 3, padding: '1px 4px' }}>{s.category.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{s.name}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,211,238,0.1)', border: '1px solid #22d3ee44',
                    borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
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
