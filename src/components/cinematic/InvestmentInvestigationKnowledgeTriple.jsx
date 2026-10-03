import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IIKNOW_RE = /\b(iiknow|investment\s+investig\w*\s+know\w*|investment\s+know\w*\s+investig\w*|portfolio\s+investig\w*\s+know\w*|invest\w*\s+case\s+know\w*|invest\w*\s+know\w*\s+case|charted\s+invest\w*|dark\s+invest\w*|investment\s+intel\s+case|investment\s+knowledge\s+gap|portfolio\s+case\s+knowledge|invest\w*\s+fully\s+chart\w*|investment\s+investigation\s+kb|investment\s+case\s+kb)\b/i;
const THRESHOLD = 0.07;

export function isIiknowQuery(t) {
  return IIKNOW_RE.test(t || '');
}

export async function buildIiknowScript() {
  try {
    const [invRes, invgRes, kbRes] = await Promise.all([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
    ]);
    const investments = normaliseInvestments(invRes);
    const investigations = normaliseInvestigations(invgRes);
    const articles = normaliseKb(kbRes);
    const classified = investments.map(inv => classifyInvestment(inv, investigations, articles));
    const fullyCharted = classified.filter(i => i.state === 'FULLY_CHARTED').length;
    const dark = classified.filter(i => i.state === 'DARK').length;
    return `IIKNOW analysis: ${investments.length} investments cross-referenced against ${investigations.length} active investigations and ${articles.length} knowledge base articles. ${fullyCharted} investments are FULLY CHARTED — both open case investigation and knowledge base backing confirmed. ${dark} investments are DARK — no investigation or knowledge coverage detected, representing portfolio intelligence gaps that require immediate case opening and documentation.`;
  } catch {
    return 'IIKNOW data unavailable — check /entities/Investment, /v1/investigations, and /knowledge/ endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.investments) ? raw.investments
    : [];
  return arr.map((inv, i) => ({
    id: inv.id || inv._id || `inv-${i}`,
    label: inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    sector: inv.sector || inv.category || inv.type || '',
    ticker: inv.ticker || inv.symbol || '',
    _searchText: [inv.name, inv.title, inv.asset, inv.sector, inv.category, inv.type, inv.ticker, inv.symbol, inv.notes, inv.description, inv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investigations) ? raw.investigations
    : Array.isArray(raw.cases) ? raw.cases
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `case-${i}`,
    label: c.title || c.name || c.subject || `Investigation ${i + 1}`,
    status: c.status || c.state || '',
    priority: c.priority || c.severity || '',
    _searchText: [c.title, c.name, c.subject, c.description, c.summary, c.tags, c.kind, c.priority, c.status].filter(Boolean).join(' '),
  }));
}

function normaliseKb(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `kb-${i}`,
    label: a.title || a.name || a.topic || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    _searchText: [a.title, a.name, a.topic, a.summary, a.description, a.tags, a.category, a.type, a.content].filter(Boolean).join(' '),
  }));
}

function classifyInvestment(inv, investigations, articles) {
  const toks = tok(inv._searchText);
  const caseMatches = investigations
    .map(c => ({ ...c, score: Math.max(matchScore(toks, c._searchText), matchScore(tok(c._searchText), inv._searchText)) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const kbMatches = articles
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), inv._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasCase = caseMatches.length > 0;
  const hasKb = kbMatches.length > 0;
  let state;
  if (hasCase && hasKb) state = 'FULLY_CHARTED';
  else if (hasCase) state = 'CASE_ACTIVE';
  else if (hasKb) state = 'KNOWLEDGE_BACKED';
  else state = 'DARK';
  return { ...inv, state, caseMatches, kbMatches };
}

const STATE_LABELS = {
  FULLY_CHARTED: 'FULLY CHARTED',
  CASE_ACTIVE: 'CASE-ACTIVE',
  KNOWLEDGE_BACKED: 'KB-BACKED',
  DARK: 'DARK',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function InvestmentInvestigationKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [articles, setArticles] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [invRes, invgRes, kbRes] = await Promise.all([
        fetch(`${API}/entities/Investment`, { headers }),
        fetch(`${API}/v1/investigations`, { headers }),
        fetch(`${API}/knowledge/`, { headers }),
      ]);
      const [invJson, invgJson, kbJson] = await Promise.all([invRes.json(), invgRes.json(), kbRes.json()]);
      const invs = normaliseInvestments(invJson);
      const cases = normaliseInvestigations(invgJson);
      const kbs = normaliseKb(kbJson);
      setInvestments(invs);
      setInvestigations(cases);
      setArticles(kbs);
      setClassified(invs.map(inv => classifyInvestment(inv, cases, kbs)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:iiknow-toggle', handler);
    return () => window.removeEventListener('jarvis:iiknow-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (IIKNOW_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_CHARTED: classified.filter(i => i.state === 'FULLY_CHARTED').length,
    CASE_ACTIVE: classified.filter(i => i.state === 'CASE_ACTIVE').length,
    KNOWLEDGE_BACKED: classified.filter(i => i.state === 'KNOWLEDGE_BACKED').length,
    DARK: classified.filter(i => i.state === 'DARK').length,
  };

  const visible = classified.filter(inv => {
    if (filter !== 'ALL' && inv.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return inv._searchText.toLowerCase().includes(q) || inv.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `IIKNOW Investment × Investigation × Knowledge Triple Coverage: ${investments.length} investments cross-referenced against ${investigations.length} investigations and ${articles.length} KB articles. Coverage: FULLY CHARTED=${counts.FULLY_CHARTED}, CASE-ACTIVE=${counts.CASE_ACTIVE}, KB-BACKED=${counts.KNOWLEDGE_BACKED}, DARK=${counts.DARK}. In 2 sentences, assess portfolio investigation and knowledge coverage gaps and identify the most critical dark investments lacking both active case investigation and knowledge base backing.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const chartedPct = classified.length ? Math.round((counts.FULLY_CHARTED / classified.length) * 100) : 0;
  const casePct = classified.length ? Math.round((counts.CASE_ACTIVE / classified.length) * 100) : 0;
  const kbPct = classified.length ? Math.round((counts.KNOWLEDGE_BACKED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 845360, bottom: 8, zIndex: 538,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(30,58,95,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#34d399', fontWeight: 700, fontSize: 13 }}>◈ IIKNOW</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Investment × Investigation × Knowledge Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#34d399', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'INVESTMENTS', val: investments.length, color: '#e2e8f0' },
          { label: 'CASES', val: investigations.length, color: '#818cf8' },
          { label: 'KB ARTICLES', val: articles.length, color: '#34d399' },
          { label: 'FULLY CHARTED', val: counts.FULLY_CHARTED, color: '#34d399', badge: counts.FULLY_CHARTED > 0 },
          { label: 'CASE-ACTIVE', val: counts.CASE_ACTIVE, color: '#818cf8' },
          { label: 'KB-BACKED', val: counts.KNOWLEDGE_BACKED, color: '#22d3ee' },
          { label: 'DARK', val: counts.DARK, color: '#6b7280', badge: counts.DARK > 0 },
          { label: 'CHARTED %', val: `${chartedPct}%`, color: '#34d399' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Portfolio Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#34d399' }}>{chartedPct}% fully charted</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {chartedPct > 0 && <div style={{ width: `${chartedPct}%`, background: '#34d399' }} />}
          {casePct > 0 && <div style={{ width: `${casePct}%`, background: '#818cf8' }} />}
          {kbPct > 0 && <div style={{ width: `${kbPct}%`, background: '#22d3ee' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#34d399' }}>● FULLY CHARTED</span>
          <span style={{ color: '#818cf8' }}>● CASE-ACTIVE</span>
          <span style={{ color: '#22d3ee' }}>● KB-BACKED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_CHARTED', 'CASE_ACTIVE', 'KNOWLEDGE_BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#022c22' : '#0f172a',
            border: `1px solid ${filter === f ? '#34d399' : '#1e293b'}`,
            color: filter === f ? '#6ee7b7' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No investments match current filter.</div>
        )}
        {visible.map(inv => {
          const stateColor = inv.state === 'FULLY_CHARTED' ? '#34d399' : inv.state === 'CASE_ACTIVE' ? '#818cf8' : inv.state === 'KNOWLEDGE_BACKED' ? '#22d3ee' : '#6b7280';
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#1e3a5f' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 160 }}>{STATE_LABELS[inv.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{inv.label}</span>
                {inv.sector && <span style={{ background: '#0f172a', color: '#fbbf24', border: '1px solid #451a03', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{inv.sector.slice(0, 20)}</span>}
                {inv.ticker && <span style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{inv.ticker}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Cases pane */}
                    <div>
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>INVESTIGATIONS ({inv.caseMatches.length})</div>
                      {inv.caseMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No active case investigation</div>
                        : inv.caseMatches.slice(0, 6).map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5b4fc', fontSize: 11 }}>{c.label.slice(0, 40)}{c.label.length > 40 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {c.status && <span style={{ background: '#1e1b4b', color: '#818cf8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.status}</span>}
                                {c.priority && <span style={{ background: '#0f0a2e', color: '#c4b5fd', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{c.priority}</span>}
                              </div>
                            </div>
                            <ScoreBar score={c.score} color="#818cf8" />
                          </div>
                        ))
                      }
                    </div>
                    {/* KB pane */}
                    <div>
                      <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>KNOWLEDGE ({inv.kbMatches.length})</div>
                      {inv.kbMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No knowledge base coverage</div>
                        : inv.kbMatches.slice(0, 6).map(a => (
                          <div key={a.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#67e8f9', fontSize: 11 }}>{a.label.slice(0, 40)}{a.label.length > 40 ? '…' : ''}</span>
                              {a.category && <span style={{ background: '#082f3e', color: '#22d3ee', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{a.category}</span>}
                            </div>
                            <ScoreBar score={a.score} color="#22d3ee" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#022c22', border: '1px solid #34d399',
            color: assessing ? '#475569' : '#6ee7b7', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
