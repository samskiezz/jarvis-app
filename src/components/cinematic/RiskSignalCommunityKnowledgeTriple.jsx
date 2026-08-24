import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSGCKCO_RE = /\b(rsgckco|risk\s+signal\s+community\s+knowledge|risk\s+community\s+kb|risk\s+signal\s+graph\s+knowledge|community\s+risk\s+knowledge|dark\s+risk\s+signal|risk\s+knowledge\s+community|risk\s+graph\s+community|risk\s+community\s+graph|knowledge\s+risk\s+community|risk\s+signal\s+knowledge\s+base|unmapped\s+risk\s+signal|risk\s+signal\s+community|risk\s+community\s+knowledge)\b/i;
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

function normaliseRiskSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.signals) ? raw.signals
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `rs-${i}`,
    label: s.name || s.title || s.signal_name || `Signal ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    sector: s.sector || '',
    severity: s.severity || s.level || '',
    description: s.description || s.summary || '',
    source: s.source || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.title, s.signal_name, s.category, s.type, s.kind, s.sector, s.severity, s.description, s.summary, s.source, s.tags].filter(Boolean).join(' '),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.communities) ? raw.communities
    : Array.isArray(raw.clusters) ? raw.clusters
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `comm-${i}`,
    label: c.name || c.label || c.title || `Community ${i + 1}`,
    type: c.type || c.community_type || c.kind || '',
    category: c.category || '',
    description: c.description || c.summary || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    members: c.members || c.member_count || 0,
    _searchText: [c.name, c.label, c.title, c.type, c.community_type, c.kind, c.category, c.description, c.summary, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseKbArticles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.articles) ? raw.articles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.documents) ? raw.documents
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `kb-${i}`,
    label: a.title || a.name || a.heading || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    content: String(a.content || a.body || a.summary || a.description || '').slice(0, 400),
    _searchText: [a.title, a.name, a.heading, a.category, a.type, a.kind, a.tags, a.content, a.body, a.summary, a.description].filter(Boolean).join(' '),
  }));
}

function correlate(signals, communities, articles) {
  return signals.map(sig => {
    const sToks = tok(sig._searchText);
    const matchedComms = communities
      .map(c => ({ ...c, score: matchScore(sToks, c._searchText) }))
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedKb = articles
      .map(a => ({ ...a, score: matchScore(sToks, a._searchText) }))
      .filter(a => a.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasComm = matchedComms.length > 0;
    const hasKb = matchedKb.length > 0;
    let coverage;
    if (hasComm && hasKb) coverage = 'FULLY_MAPPED';
    else if (hasComm) coverage = 'COMMUNITY_LINKED';
    else if (hasKb) coverage = 'KB_BACKED';
    else coverage = 'DARK';
    return { ...sig, matchedComms, matchedKb, coverage };
  });
}

export function isRsgckcoQuery(t) {
  return RSGCKCO_RE.test(t || '');
}

export async function buildRsgckcoScript() {
  try {
    const [sigR, commR, kbR] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseRiskSignals(sigR), normaliseCommunities(commR), normaliseKbArticles(kbR));
    const fullyMapped = rows.filter(r => r.coverage === 'FULLY_MAPPED').length;
    const dark = rows.filter(r => r.coverage === 'DARK').length;
    return `RSGCKCO coverage: ${rows.length} risk signals assessed against graph communities and knowledge base — ${fullyMapped} fully mapped (both community network context and KB coverage), ${dark} dark (no community or knowledge backing — intelligence isolation). ${dark > 0 ? `${dark} risk signal${dark > 1 ? 's have' : ' has'} zero network community and zero knowledge base coverage — immediate intelligence integration review required.` : 'All risk signals have either community or knowledge backing at this time.'}`;
  } catch {
    return 'RSGCKCO: risk signal community knowledge coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY MAPPED', 'COMMUNITY-LINKED', 'KB-BACKED', 'DARK'];
const TAB_KEY = {
  'ALL': null,
  'FULLY MAPPED': 'FULLY_MAPPED',
  'COMMUNITY-LINKED': 'COMMUNITY_LINKED',
  'KB-BACKED': 'KB_BACKED',
  'DARK': 'DARK',
};

const COVER_COLOR = {
  FULLY_MAPPED: '#22c55e',
  COMMUNITY_LINKED: '#06b6d4',
  KB_BACKED: '#a78bfa',
  DARK: '#f59e0b',
};

const LABEL_MAP = {
  FULLY_MAPPED: 'FULLY MAPPED',
  COMMUNITY_LINKED: 'COMMUNITY-LINKED',
  KB_BACKED: 'KB-BACKED',
  DARK: 'DARK',
};

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };

export default function RiskSignalCommunityKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, comms: 0, kb: 0, fullyMapped: 0, commLinked: 0, kbBacked: 0, dark: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sigR, commR, kbR] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : Promise.reject(`RiskSignal ${r.status}`)),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : Promise.reject(`communities ${r.status}`)),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(`knowledge ${r.status}`)),
      ]);
      const signals = normaliseRiskSignals(sigR);
      const communities = normaliseCommunities(commR);
      const articles = normaliseKbArticles(kbR);
      const correlated = correlate(signals, communities, articles);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        comms: communities.length,
        kb: articles.length,
        fullyMapped: correlated.filter(r => r.coverage === 'FULLY_MAPPED').length,
        commLinked: correlated.filter(r => r.coverage === 'COMMUNITY_LINKED').length,
        kbBacked: correlated.filter(r => r.coverage === 'KB_BACKED').length,
        dark: correlated.filter(r => r.coverage === 'DARK').length,
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
    window.addEventListener('jarvis:rsgckco-toggle', handler);
    return () => window.removeEventListener('jarvis:rsgckco-toggle', handler);
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
        r.category.toLowerCase().includes(s) ||
        r.sector.toLowerCase().includes(s) ||
        r.severity.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const total = counts.total || 1;
  const barMapped = (counts.fullyMapped / total * 100).toFixed(1);
  const barComm = (counts.commLinked / total * 100).toFixed(1);
  const barKb = (counts.kbBacked / total * 100).toFixed(1);
  const barDark = (counts.dark / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse risk signal "${row.label}"${row.severity ? ' (severity: ' + row.severity + ')' : ''}${row.category ? ', category: ' + row.category : ''} for graph community and knowledge base coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched communities: ${row.matchedComms.map(c => c.label).join(', ') || 'none'}. Matched KB articles: ${row.matchedKb.map(a => a.label).join(', ') || 'none'}. ${row.coverage === 'FULLY_MAPPED' ? 'This risk signal has both community network context and knowledge base backing — assess coverage completeness and recommend optimisation.' : row.coverage === 'DARK' ? 'This risk signal has no community or knowledge base coverage — assess the intelligence isolation and recommend immediate integration action.' : row.coverage === 'COMMUNITY_LINKED' ? 'This signal has network community context but no knowledge base backing — assess the knowledge gap.' : 'This signal has knowledge base backing but no network community context — assess the community grounding gap.'} Respond in exactly 2 sentences.`;
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
          position: 'fixed', left: 824640, bottom: 8, zIndex: 501,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Risk Signal × Graph Community × Knowledge Triple Coverage (RSGCKCO)"
      >
        ◈ RSGCKCO
        {counts.dark > 0 && (
          <span style={{
            background: '#f59e0b', color: '#0f172a', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 501,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13 }}>◈ RSGCKCO</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Risk Signal × Graph Community × Knowledge Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'RISK SIGNALS', val: counts.total, color: '#94a3b8' },
          { label: 'COMMUNITIES', val: counts.comms, color: '#06b6d4' },
          { label: 'KB ARTICLES', val: counts.kb, color: '#a78bfa' },
          { label: 'FULLY MAPPED', val: counts.fullyMapped, color: '#22c55e' },
          { label: 'COMM-LINKED', val: counts.commLinked, color: '#06b6d4' },
          { label: 'KB-BACKED', val: counts.kbBacked, color: '#a78bfa' },
          { label: 'DARK', val: counts.dark, color: '#f59e0b' },
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
        <div style={{ width: `${barMapped}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${barComm}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barKb}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDark}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
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
            background: tab === t ? 'rgba(245,158,11,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#f59e0b' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#f59e0b' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No signals match current filter.</div>
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
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 120 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              {row.severity && (
                <span style={{
                  color: SEV_COLOR[row.severity?.toLowerCase()] || '#94a3b8',
                  fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px',
                  fontWeight: 700,
                }}>{row.severity.toUpperCase()}</span>
              )}
              {row.category && (
                <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.category.slice(0, 16)}</span>
              )}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedComms.length}co {row.matchedKb.length}kb
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{row.description.slice(0, 120)}{row.description.length > 120 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Graph Communities */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>GRAPH COMMUNITIES ({row.matchedComms.length})</div>
                    {row.matchedComms.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched communities.</div>
                      : row.matchedComms.slice(0, 5).map(c => (
                        <div key={c.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(c.score * 400, 100)}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            {c.type && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(6,182,212,0.1)', borderRadius: 3, padding: '1px 4px' }}>{c.type.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{c.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* KB Articles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>KB ARTICLES ({row.matchedKb.length})</div>
                    {row.matchedKb.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched articles.</div>
                      : row.matchedKb.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(a.score * 400, 100)}%`, height: '100%', background: '#a78bfa' }} />
                            </div>
                            {a.category && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 4px' }}>{a.category.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{a.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid #f59e0b44',
                    borderRadius: 4, color: '#f59e0b', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
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
