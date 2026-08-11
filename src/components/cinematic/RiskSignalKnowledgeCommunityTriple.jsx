import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSKGCTRI_RE = /\b(rskgctri|risk\s+signal\s+knowledge\s+community|risk\s+kb\s+community|risk\s+knowledge\s+community|grounded\s+risk|exposed\s+risk\s+signal\s+triple|risk\s+community\s+kb|risk\s+signal\s+grounded|risk\s+network\s+knowledge|risk\s+signal\s+triple\s+coverage)\b/i;

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

function normaliseRiskSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.signals) ? data.signals
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    name: r.name || r.title || r.signal || 'Unknown Signal',
    category: r.category || r.type || r.domain || '',
    sector: r.sector || '',
    description: r.description || r.summary || r.details || '',
    source: r.source || r.origin || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    severity: r.severity || r.level || r.priority || 'UNKNOWN',
    raw: r,
  }));
}

function normaliseKnowledge(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.articles) ? data.articles
    : Array.isArray(data.entries) ? data.entries
    : Array.isArray(data.documents) ? data.documents
    : Array.isArray(data.knowledge) ? data.knowledge
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(k => ({
    id: k.id || k._id || k.slug || String(Math.random()),
    name: k.name || k.title || k.heading || k.label || 'Untitled Article',
    description: k.description || k.summary || k.body || k.content || k.abstract || '',
    category: k.category || k.type || k.domain || k.topic || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    raw: k,
  }));
}

function normaliseCommunities(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.communities) ? data.communities
    : Array.isArray(data.clusters) ? data.clusters
    : Array.isArray(data.groups) ? data.groups
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || c.communityId || c.clusterId || String(Math.random()),
    name: c.name || c.label || c.title || c.community || `Community ${c.id || '?'}`,
    description: c.description || c.summary || c.details || '',
    category: c.category || c.type || c.domain || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    nodeCount: c.nodeCount || c.node_count || c.size || c.members || 0,
    raw: c,
  }));
}

function correlate(riskSignals, kbArticles, communities) {
  return riskSignals.map(signal => {
    const toks = tok([signal.name, signal.category, signal.sector, signal.description, signal.source, signal.tags].join(' '));

    const matchedKb = kbArticles
      .map(k => {
        const score = Math.max(
          matchScore(toks, k.name),
          matchScore(toks, k.description),
          matchScore(toks, k.category),
          matchScore(toks, k.tags),
        );
        return { ...k, matchScore: score };
      })
      .filter(k => k.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedCommunities = communities
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.description),
          matchScore(toks, c.category),
          matchScore(toks, c.tags),
        );
        return { ...c, matchScore: score };
      })
      .filter(c => c.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasKb = matchedKb.length > 0;
    const hasComm = matchedCommunities.length > 0;

    let state;
    if (hasKb && hasComm) state = 'FULLY GROUNDED';
    else if (hasKb) state = 'KB-BACKED';
    else if (hasComm) state = 'COMMUNITY-MAPPED';
    else state = 'EXPOSED';

    return { signal, matchedKb, matchedCommunities, state };
  });
}

export function isRskgctriQuery(t) {
  return RSKGCTRI_RE.test(t || '');
}

export async function buildRskgctriScript() {
  try {
    const apiBase = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const key = (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';
    const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const [rRes, kRes, cRes] = await Promise.all([
      fetch(`${apiBase}/entities/RiskSignal`, { headers: hdr }),
      fetch(`${apiBase}/knowledge/`, { headers: hdr }),
      fetch(`${apiBase}/v1/graph/communities`, { headers: hdr }),
    ]);
    const [rData, kData, cData] = await Promise.all([rRes.json(), kRes.json(), cRes.json()]);
    const riskSignals = normaliseRiskSignals(rData);
    const kbArticles = normaliseKnowledge(kData);
    const communities = normaliseCommunities(cData);
    const rows = correlate(riskSignals, kbArticles, communities);
    const grounded = rows.filter(r => r.state === 'FULLY GROUNDED').length;
    const kbBacked = rows.filter(r => r.state === 'KB-BACKED').length;
    const commMapped = rows.filter(r => r.state === 'COMMUNITY-MAPPED').length;
    const exposed = rows.filter(r => r.state === 'EXPOSED').length;
    return `RSKGCTRI coverage across ${rows.length} risk signals: ${grounded} fully grounded (KB article + network community), ${kbBacked} KB-backed only, ${commMapped} community-mapped only, ${exposed} exposed with no knowledge or network coverage. ${exposed > 0 ? `${exposed} risk signal${exposed > 1 ? 's' : ''} lack both KB and network context — recommend intelligence prioritisation.` : 'All risk signals have at least one coverage layer.'}`;
  } catch {
    return 'RSKGCTRI coverage data unavailable — check risk signal, knowledge, and graph communities endpoints.';
  }
}

const STATE_COLOR = {
  'FULLY GROUNDED': '#4ade80',
  'KB-BACKED': '#a78bfa',
  'COMMUNITY-MAPPED': '#22d3ee',
  'EXPOSED': '#ef4444',
};

const SEV_COLOR = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#facc15',
  LOW: '#4ade80',
  UNKNOWN: '#6b7280',
};

const TABS = ['ALL', 'FULLY GROUNDED', 'KB-BACKED', 'COMMUNITY-MAPPED', 'EXPOSED'];

export default function RiskSignalKnowledgeCommunityTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const apiBase = () => (typeof window !== 'undefined' && window.__JARVIS_API__) || API;
  const apiKey = () => (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` };
      const [rRes, kRes, cRes] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${apiBase()}/knowledge/`, { headers: hdr }),
        fetch(`${apiBase()}/v1/graph/communities`, { headers: hdr }),
      ]);
      const [rData, kData, cData] = await Promise.all([rRes.json(), kRes.json(), cRes.json()]);
      const riskSignals = normaliseRiskSignals(rData);
      const kbArticles = normaliseKnowledge(kData);
      const communities = normaliseCommunities(cData);
      setRows(correlate(riskSignals, kbArticles, communities));
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

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rskgctri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rskgctri-toggle', onToggle);
  }, []);

  const counts = {
    'ALL': rows.length,
    'FULLY GROUNDED': rows.filter(r => r.state === 'FULLY GROUNDED').length,
    'KB-BACKED': rows.filter(r => r.state === 'KB-BACKED').length,
    'COMMUNITY-MAPPED': rows.filter(r => r.state === 'COMMUNITY-MAPPED').length,
    'EXPOSED': rows.filter(r => r.state === 'EXPOSED').length,
  };

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.state === tab;
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.signal.name.toLowerCase().includes(q)
      || r.signal.description.toLowerCase().includes(q)
      || r.signal.category.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(true);
    try {
      const msg = `Assess risk signal "${row.signal.name}" (severity: ${row.signal.severity}, state: ${row.state}): ${row.matchedKb.length} KB article(s) matched, ${row.matchedCommunities.length} network community(ies) matched. Summarise risk intelligence coverage and recommended next action in 2 sentences.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const text = (d.answer || '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { /* swallow */ } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    const exposedCount = counts['EXPOSED'];
    return (
      <button
        onClick={() => setOpen(true)}
        title="RiskSignal × Knowledge × Graph Community Triple Coverage"
        style={{
          position: 'fixed', left: 779840, bottom: 8, zIndex: 421,
          background: exposedCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.08)',
          border: `1px solid ${exposedCount > 0 ? '#ef444466' : '#4ade8044'}`,
          color: exposedCount > 0 ? '#ef4444' : '#4ade80',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ RSKGCTRI{exposedCount > 0 && (
          <span style={{ marginLeft: 5, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9 }}>
            {exposedCount}
          </span>
        )}
      </button>
    );
  }

  const grounded = counts['FULLY GROUNDED'];
  const total = counts['ALL'];
  const pct = total > 0 ? Math.round((grounded / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 779840, bottom: 48, zIndex: 421,
      width: 490, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,10,18,0.97)', border: '1px solid #4ade8033',
      borderRadius: 8, fontFamily: 'monospace', overflow: 'hidden',
      boxShadow: '0 0 40px #4ade8011',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #4ade8022', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ RSKGCTRI</span>
        <span style={{ color: '#6b7280', fontSize: 10, flex: 1 }}>RiskSignal × Knowledge × Graph Community</span>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: '#4ade8088', cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #4ade8011' }}>
        {[
          { label: 'GROUNDED', val: counts['FULLY GROUNDED'], col: '#4ade80' },
          { label: 'KB-BACKED', val: counts['KB-BACKED'], col: '#a78bfa' },
          { label: 'COMM-MAP', val: counts['COMMUNITY-MAPPED'], col: '#22d3ee' },
          { label: 'EXPOSED', val: counts['EXPOSED'], col: '#ef4444' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: col + '88', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid #4ade8011' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280', fontSize: 9 }}>FULLY GROUNDED COVERAGE</span>
          <span style={{ color: '#4ade80', fontSize: 9 }}>{pct}% ({grounded}/{total})</span>
        </div>
        <div style={{ height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#4ade80,#a78bfa)', transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #4ade8011', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${STATE_COLOR[t] || '#4ade80'}22` : 'none',
            border: `1px solid ${tab === t ? (STATE_COLOR[t] || '#4ade80') + '66' : '#4ade8022'}`,
            color: tab === t ? (STATE_COLOR[t] || '#4ade80') : '#6b7280',
            padding: '2px 7px', borderRadius: 3, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {t} {counts[t] !== undefined ? `(${counts[t]})` : ''}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #4ade8022',
            color: '#c8e6ff', padding: '2px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace', outline: 'none', width: 90,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {loading && <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: '#f87171', fontSize: 10, padding: 8 }}>{err}</div>}

        {visible.map((row, i) => {
          const isExpanded = expanded[row.signal.id];
          const sevColor = SEV_COLOR[String(row.signal.severity).toUpperCase()] || '#6b7280';
          return (
            <div key={row.signal.id + i} style={{
              marginBottom: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${STATE_COLOR[row.state]}22`,
              borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setExpanded(e => ({ ...e, [row.signal.id]: !e[row.signal.id] }))}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, color: STATE_COLOR[row.state],
                  background: `${STATE_COLOR[row.state]}18`, border: `1px solid ${STATE_COLOR[row.state]}44`,
                  borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.signal.name}
                </span>
                <span style={{
                  fontSize: 8, padding: '1px 4px', borderRadius: 2,
                  background: `${sevColor}22`, color: sevColor,
                  border: `1px solid ${sevColor}44`, whiteSpace: 'nowrap',
                }}>
                  {row.signal.severity}
                </span>
                <span style={{ fontSize: 9, color: '#a78bfa88' }}>{row.matchedKb.length}KB</span>
                <span style={{ fontSize: 9, color: '#22d3ee88' }}>{row.matchedCommunities.length}GC</span>
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* KB Articles */}
                  <div style={{ flex: 1, background: 'rgba(167,139,250,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      KB ARTICLES ({row.matchedKb.length})
                    </div>
                    {row.matchedKb.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No KB match</div>
                    ) : (
                      row.matchedKb.slice(0, 5).map((k, ki) => (
                        <div key={k.id + ki} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{k.name}</span>
                            {k.category && <span style={{ fontSize: 9, color: '#a78bfa88', whiteSpace: 'nowrap' }}>{k.category}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(k.matchScore * 100)}%`, background: '#a78bfa', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Graph Communities */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#22d3ee', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      GRAPH COMMUNITIES ({row.matchedCommunities.length})
                    </div>
                    {row.matchedCommunities.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No community match</div>
                    ) : (
                      row.matchedCommunities.slice(0, 5).map((c, ci) => (
                        <div key={c.id + ci} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
                            {c.nodeCount > 0 && <span style={{ fontSize: 9, color: '#22d3ee88', whiteSpace: 'nowrap' }}>{c.nodeCount}N</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(c.matchScore * 100)}%`, background: '#22d3ee', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade8044',
                      color: '#4ade80', padding: '3px 12px', borderRadius: 3,
                      fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
