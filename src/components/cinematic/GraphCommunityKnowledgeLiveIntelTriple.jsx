import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCKLIVE_RE = /\b(gcklive|graph\s+community\s+knowledge\s+live|community\s+knowledge\s+live|graph\s+community\s+live|live\s+community\s+kb|community\s+intel\s+live|graph\s+kb\s+live|dark\s+community\s+triple|illuminated\s+community|community\s+live\s+knowledge|graph\s+live\s+kb)\b/i;

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
    id: k.id || k._id || k.articleId || k.slug || String(Math.random()),
    name: k.name || k.title || k.heading || k.label || 'Untitled Article',
    description: k.description || k.summary || k.body || k.content || k.abstract || '',
    category: k.category || k.type || k.domain || k.topic || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    raw: k,
  }));
}

function normaliseLiveIntel(data) {
  if (!data) return [];
  const quakes = (data.earthquakes || data.quakes || []).map(q => ({
    id: q.id || String(Math.random()),
    title: `M${q.magnitude || q.mag || '?'} ${q.location || q.place || 'Seismic event'}`,
    description: q.description || q.details || q.location || q.place || '',
    source: 'SEISMIC',
    type: 'SEISMIC',
    raw: q,
  }));
  const crypto = (data.crypto || data.cryptocurrency || []).map(c => ({
    id: c.id || c.symbol || String(Math.random()),
    title: `${c.symbol || c.name || 'Crypto'} ${c.changePercent ? `${c.changePercent}%` : ''}`,
    description: `${c.name || c.symbol || ''} price ${c.price || ''} change ${c.changePercent || ''}%`,
    source: 'CRYPTO',
    type: 'CRYPTO',
    raw: c,
  }));
  const fx = (data.fx || data.forex || data.forexRates || []).map(f => ({
    id: f.id || f.pair || String(Math.random()),
    title: `${f.pair || f.symbol || 'FX'} ${f.rate || ''}`,
    description: `${f.pair || f.symbol || ''} rate ${f.rate || ''} change ${f.change || ''}`,
    source: 'FX',
    type: 'FX',
    raw: f,
  }));
  return [...quakes, ...crypto, ...fx];
}

function correlate(communities, kbArticles, liveEvents) {
  return communities.map(comm => {
    const toks = tok([comm.name, comm.description, comm.category, comm.tags].join(' '));

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

    const matchedLive = liveEvents
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.title),
          matchScore(toks, e.description),
        );
        return { ...e, matchScore: score };
      })
      .filter(e => e.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasKb = matchedKb.length > 0;
    const hasLive = matchedLive.length > 0;

    let state;
    if (hasKb && hasLive) state = 'FULLY ILLUMINATED';
    else if (hasKb) state = 'KB-BACKED';
    else if (hasLive) state = 'LIVE-TRIGGERED';
    else state = 'DARK';

    return { comm, matchedKb, matchedLive, state };
  });
}

export function isGckliveQuery(t) {
  return GCKLIVE_RE.test(t || '');
}

export async function buildGckliveScript() {
  try {
    const apiBase = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const key = (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';
    const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const [gRes, kRes, lRes] = await Promise.all([
      fetch(`${apiBase}/v1/graph/communities`, { headers: hdr }),
      fetch(`${apiBase}/knowledge/`, { headers: hdr }),
      fetch(`${apiBase}/functions/getLiveIntel`, { headers: hdr }),
    ]);
    const [gData, kData, lData] = await Promise.all([gRes.json(), kRes.json(), lRes.json()]);
    const communities = normaliseCommunities(gData);
    const kbArticles = normaliseKnowledge(kData);
    const liveEvents = normaliseLiveIntel(lData);
    const rows = correlate(communities, kbArticles, liveEvents);
    const illuminated = rows.filter(r => r.state === 'FULLY ILLUMINATED').length;
    const kbBacked = rows.filter(r => r.state === 'KB-BACKED').length;
    const liveTriggered = rows.filter(r => r.state === 'LIVE-TRIGGERED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;
    return `GCKLIVE coverage across ${rows.length} graph communities: ${illuminated} fully illuminated (KB + live event), ${kbBacked} KB-backed only, ${liveTriggered} live-triggered (no KB — emerging gap), ${dark} dark with no knowledge or live world coverage. ${dark > 0 ? `${dark} communit${dark > 1 ? 'ies' : 'y'} lack both knowledge base and live intel — recommend intelligence prioritisation.` : 'All communities have at least one coverage layer.'}`;
  } catch {
    return 'GCKLIVE coverage data unavailable — check graph communities, knowledge, and live intel endpoints.';
  }
}

const STATE_COLOR = {
  'FULLY ILLUMINATED': '#22d3ee',
  'KB-BACKED': '#a78bfa',
  'LIVE-TRIGGERED': '#fb923c',
  'DARK': '#6b7280',
};

const TYPE_COLOR = { SEISMIC: '#f87171', CRYPTO: '#facc15', FX: '#34d399' };

const TABS = ['ALL', 'FULLY ILLUMINATED', 'KB-BACKED', 'LIVE-TRIGGERED', 'DARK'];

export default function GraphCommunityKnowledgeLiveIntelTriple() {
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
      const [gRes, kRes, lRes] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/communities`, { headers: hdr }),
        fetch(`${apiBase()}/knowledge/`, { headers: hdr }),
        fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      const [gData, kData, lData] = await Promise.all([gRes.json(), kRes.json(), lRes.json()]);
      const communities = normaliseCommunities(gData);
      const kbArticles = normaliseKnowledge(kData);
      const liveEvents = normaliseLiveIntel(lData);
      setRows(correlate(communities, kbArticles, liveEvents));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gcklive-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gcklive-toggle', onToggle);
  }, []);

  const counts = {
    'ALL': rows.length,
    'FULLY ILLUMINATED': rows.filter(r => r.state === 'FULLY ILLUMINATED').length,
    'KB-BACKED': rows.filter(r => r.state === 'KB-BACKED').length,
    'LIVE-TRIGGERED': rows.filter(r => r.state === 'LIVE-TRIGGERED').length,
    'DARK': rows.filter(r => r.state === 'DARK').length,
  };

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.state === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || r.comm.name.toLowerCase().includes(q) || r.comm.description.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(true);
    try {
      const msg = `Assess graph community "${row.comm.name}" (${row.state}): ${row.matchedKb.length} KB article(s) matched, ${row.matchedLive.length} live world event(s). Summarise community intelligence coverage and recommend next action in 2 sentences.`;
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
    const darkCount = counts['DARK'];
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Knowledge × Live Intel Triple Coverage"
        style={{
          position: 'fixed', left: 779280, bottom: 8, zIndex: 420,
          background: darkCount > 0 ? 'rgba(107,114,128,0.15)' : 'rgba(34,211,238,0.08)',
          border: `1px solid ${darkCount > 0 ? '#6b728066' : '#22d3ee44'}`,
          color: darkCount > 0 ? '#9ca3af' : '#22d3ee',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ GCKLIVE{darkCount > 0 && <span style={{ marginLeft: 5, background: '#6b7280', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9 }}>{darkCount}</span>}
      </button>
    );
  }

  const illuminated = counts['FULLY ILLUMINATED'];
  const total = counts['ALL'];
  const pct = total > 0 ? Math.round((illuminated / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 779280, bottom: 48, zIndex: 420,
      width: 490, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,10,18,0.97)', border: '1px solid #22d3ee33',
      borderRadius: 8, fontFamily: 'monospace', overflow: 'hidden',
      boxShadow: '0 0 40px #22d3ee11',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #22d3ee22', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ GCKLIVE</span>
        <span style={{ color: '#6b7280', fontSize: 10, flex: 1 }}>Graph Community × Knowledge × Live Intel</span>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: '#22d3ee88', cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #22d3ee11' }}>
        {[
          { label: 'ILLUMINATED', val: counts['FULLY ILLUMINATED'], col: '#22d3ee' },
          { label: 'KB-BACKED', val: counts['KB-BACKED'], col: '#a78bfa' },
          { label: 'LIVE-TRIGGER', val: counts['LIVE-TRIGGERED'], col: '#fb923c' },
          { label: 'DARK', val: counts['DARK'], col: '#6b7280' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: col + '88', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid #22d3ee11' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280', fontSize: 9 }}>FULLY ILLUMINATED COVERAGE</span>
          <span style={{ color: '#22d3ee', fontSize: 9 }}>{pct}% ({illuminated}/{total})</span>
        </div>
        <div style={{ height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#22d3ee,#a78bfa)', transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #22d3ee11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${STATE_COLOR[t] || '#22d3ee'}22` : 'none',
            border: `1px solid ${tab === t ? (STATE_COLOR[t] || '#22d3ee') + '66' : '#22d3ee22'}`,
            color: tab === t ? (STATE_COLOR[t] || '#22d3ee') : '#6b7280',
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
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #22d3ee22',
            color: '#c8e6ff', padding: '2px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace', outline: 'none', width: 90,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {loading && <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: '#f87171', fontSize: 10, padding: 8 }}>{err}</div>}

        {visible.map((row, i) => {
          const isExpanded = expanded[row.comm.id];
          return (
            <div key={row.comm.id + i} style={{
              marginBottom: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${STATE_COLOR[row.state]}22`,
              borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setExpanded(e => ({ ...e, [row.comm.id]: !e[row.comm.id] }))}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, color: STATE_COLOR[row.state],
                  background: `${STATE_COLOR[row.state]}18`, border: `1px solid ${STATE_COLOR[row.state]}44`,
                  borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.comm.name}
                </span>
                {row.comm.nodeCount > 0 && (
                  <span style={{ fontSize: 9, color: '#22d3ee66' }}>{row.comm.nodeCount}N</span>
                )}
                <span style={{ fontSize: 9, color: '#a78bfa88' }}>{row.matchedKb.length}KB</span>
                <span style={{ fontSize: 9, color: '#fb923c88' }}>{row.matchedLive.length}LV</span>
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
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{k.name}</span>
                            {k.category && <span style={{ fontSize: 9, color: '#a78bfa88' }}>{k.category}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(k.matchScore * 100)}%`, background: '#a78bfa', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Live Events */}
                  <div style={{ flex: 1, background: 'rgba(251,146,60,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      LIVE EVENTS ({row.matchedLive.length})
                    </div>
                    {row.matchedLive.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No live match</div>
                    ) : (
                      row.matchedLive.slice(0, 5).map((e, ei) => (
                        <div key={e.id + ei} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{
                              fontSize: 8, padding: '1px 4px', borderRadius: 2,
                              background: `${TYPE_COLOR[e.type] || '#888'}22`,
                              color: TYPE_COLOR[e.type] || '#888',
                              border: `1px solid ${TYPE_COLOR[e.type] || '#888'}44`,
                            }}>{e.type}</span>
                            <span style={{ color: '#c8e6ff', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{e.title}</span>
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(e.matchScore * 100)}%`, background: '#fb923c', height: '100%' }} />
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
                      background: 'rgba(34,211,238,0.1)', border: '1px solid #22d3ee44',
                      color: '#22d3ee', padding: '3px 12px', borderRadius: 3,
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
