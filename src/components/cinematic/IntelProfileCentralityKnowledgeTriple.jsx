import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPGCKCO_RE = /\b(ipgckco|intel\s+profile\s+centrality\s+knowledge|intel\s+graph\s+knowledge|profile\s+centrality\s+kb|intel\s+knowledge\s+centrality|profile\s+node\s+knowledge|profile\s+graph\s+kb|centrality\s+intel\s+knowledge|intel\s+profile\s+centrality|centrality\s+knowledge\s+intel|intel\s+profile\s+graph\s+knowledge|intel\s+graph\s+kb|profile\s+kb\s+centrality)\b/i;

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

function normaliseProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.profiles) ? data.profiles
    : Array.isArray(data.intel_profiles) ? data.intel_profiles
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(p => ({
    id: p.id || p._id || String(Math.random()),
    name: p.name || p.full_name || p.label || 'Unnamed Profile',
    company: p.company || p.organisation || p.organization || '',
    role: p.role || p.title || p.position || '',
    sector: p.sector || p.industry || p.domain || '',
    nationality: p.nationality || p.country || p.region || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : String(p.aliases || ''),
    description: p.description || p.summary || p.bio || '',
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    raw: p,
  }));
}

function normaliseCentrality(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.nodes) ? data.nodes
    : Array.isArray(data.centrality) ? data.centrality
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.slice(0, 80).map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: n.name || n.label || n.title || 'Unnamed Node',
    type: n.type || n.kind || n.category || '',
    score: n.score || n.centrality_score || n.weight || 0,
    description: n.description || n.summary || '',
    category: n.category || n.group || '',
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags || ''),
    raw: n,
  }));
}

function normaliseKnowledge(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.articles) ? data.articles
    : Array.isArray(data.knowledge) ? data.knowledge
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(k => ({
    id: k.id || k._id || String(Math.random()),
    title: k.title || k.name || k.label || 'Untitled',
    category: k.category || k.type || k.kind || '',
    content: k.content || k.body || k.text || k.summary || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : String(k.tags || ''),
    raw: k,
  }));
}

function correlate(profiles, nodes, kbArticles) {
  return profiles.map(profile => {
    const toks = tok([
      profile.name, profile.company, profile.role,
      profile.sector, profile.nationality, profile.aliases,
      profile.description, profile.tags,
    ].join(' '));

    const matchedNodes = nodes
      .map(n => {
        const score = Math.max(
          matchScore(toks, n.name),
          matchScore(toks, n.type),
          matchScore(toks, n.description),
          matchScore(toks, n.category),
          matchScore(toks, n.tags),
        );
        return { ...n, score };
      })
      .filter(n => n.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedKB = kbArticles
      .map(k => {
        const score = Math.max(
          matchScore(toks, k.title),
          matchScore(toks, k.category),
          matchScore(toks, k.content),
          matchScore(toks, k.tags),
        );
        return { ...k, score };
      })
      .filter(k => k.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasNode = matchedNodes.length > 0;
    const hasKB = matchedKB.length > 0;

    let state;
    if (hasNode && hasKB) state = 'FULLY MAPPED';
    else if (hasNode) state = 'NODE-LINKED';
    else if (hasKB) state = 'KB-BACKED';
    else state = 'DARK';

    return { profile, matchedNodes, matchedKB, state };
  });
}

export function isIpgckcoQuery(t) {
  return IPGCKCO_RE.test(t || '');
}

export async function buildIpgckcoScript() {
  try {
    const [profRes, nodeRes, kbRes] = await Promise.allSettled([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
    ]);

    const profiles = normaliseProfiles(profRes.status === 'fulfilled' ? profRes.value : null);
    const nodes = normaliseCentrality(nodeRes.status === 'fulfilled' ? nodeRes.value : null);
    const kbArticles = normaliseKnowledge(kbRes.status === 'fulfilled' ? kbRes.value : null);
    const rows = correlate(profiles, nodes, kbArticles);

    const fullyMapped = rows.filter(r => r.state === 'FULLY MAPPED').length;
    const nodeLinked = rows.filter(r => r.state === 'NODE-LINKED').length;
    const kbBacked = rows.filter(r => r.state === 'KB-BACKED').length;
    const dark = rows.filter(r => r.state === 'DARK').length;

    return `IPGCKCO IntelProfile×Centrality×Knowledge: ${profiles.length} intel profiles correlated against ${nodes.length} top-influence nodes and ${kbArticles.length} KB articles. ` +
      `${fullyMapped} FULLY MAPPED (node+KB), ${nodeLinked} NODE-LINKED (centrality only), ` +
      `${kbBacked} KB-BACKED (knowledge only), ${dark} DARK (no coverage). ` +
      (dark > 0
        ? `${dark} intel profiles have no graph centrality or knowledge coverage — intelligence blind spots.`
        : fullyMapped > 0
        ? `${fullyMapped} profiles are fully mapped with both network centrality context and knowledge backing.`
        : 'Intel profile intelligence coverage nominal.');
  } catch {
    return 'IPGCKCO: data fetch failed.';
  }
}

const STATE_COLOUR = {
  'FULLY MAPPED': '#69f0ae',
  'NODE-LINKED': '#00e5ff',
  'KB-BACKED': '#7986cb',
  'DARK': '#455a64',
};

export default function IntelProfileCentralityKnowledgeTriple() {
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
    window.addEventListener('jarvis:ipgckco-toggle', handler);
    return () => window.removeEventListener('jarvis:ipgckco-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [profRes, nodeRes, kbRes] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const profiles = normaliseProfiles(profRes.status === 'fulfilled' ? profRes.value : null);
      const nodes = normaliseCentrality(nodeRes.status === 'fulfilled' ? nodeRes.value : null);
      const kbArticles = normaliseKnowledge(kbRes.status === 'fulfilled' ? kbRes.value : null);

      if (!profiles.length && !nodes.length && !kbArticles.length) {
        setErr('No data from IntelProfile, graph/centrality, or knowledge endpoints.');
      }

      setRows(correlate(profiles, nodes, kbArticles));
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

  const fullyMapped = rows.filter(r => r.state === 'FULLY MAPPED').length;
  const nodeLinked = rows.filter(r => r.state === 'NODE-LINKED').length;
  const kbBacked = rows.filter(r => r.state === 'KB-BACKED').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY MAPPED', 'NODE-LINKED', 'KB-BACKED', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.profile.name.toLowerCase().includes(q) ||
        r.matchedNodes.some(n => n.name.toLowerCase().includes(q)) ||
        r.matchedKB.some(k => k.title.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    mapped: (fullyMapped / total) * 100,
    node: (nodeLinked / total) * 100,
    kb: (kbBacked / total) * 100,
    dark: (dark / total) * 100,
  } : { mapped: 0, node: 0, kb: 0, dark: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Intel profile "${row.profile.name}" [${row.profile.role || ''}/${row.profile.company || ''}] coverage state: ${row.state}. ` +
      `Matched centrality nodes: ${row.matchedNodes.map(n => n.name).join(', ') || 'none'}. ` +
      `Matched KB articles: ${row.matchedKB.map(k => k.title).join(', ') || 'none'}. ` +
      `Give a 2-sentence intel profile network centrality and knowledge coverage brief.`;
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
          left: 817360,
          bottom: 8,
          zIndex: 488,
          background: 'rgba(0,8,20,0.85)',
          border: `1px solid ${dark > 0 ? '#f4433680' : '#1a3050'}`,
          color: dark > 0 ? '#f44336' : '#2a6090',
          padding: '3px 7px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >
        ◈ IPGCKCO{dark > 0 ? ` [${dark}]` : ''}
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
        <span style={{ color: '#69f0ae', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ IPGCKCO</span>
        <span style={{ color: '#4a6fa0', fontSize: 10, flex: 1 }}>IntelProfile × Centrality × Knowledge Triple Coverage</span>
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
          { label: 'PROFILES', val: rows.length, col: '#4fc3f7' },
          { label: 'NODES', val: rows.reduce((a, r) => a + r.matchedNodes.length, 0), col: '#00e5ff' },
          { label: 'KB ART', val: rows.reduce((a, r) => a + r.matchedKB.length, 0), col: '#7986cb' },
          { label: 'FULLY-MAP', val: fullyMapped, col: '#69f0ae' },
          { label: 'NODE-LINK', val: nodeLinked, col: '#00e5ff' },
          { label: 'KB-BACK', val: kbBacked, col: '#7986cb' },
          { label: 'DARK', val: dark, col: dark > 0 ? '#f44336' : '#455a64' },
        ].map(t => (
          <div key={t.label} style={{ textAlign: 'center' }}>
            <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#2a4060', fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ height: 4, display: 'flex', flexShrink: 0, margin: '0 14px 8px' }}>
        <div style={{ width: `${cbw.mapped}%`, background: '#69f0ae', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.node}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.kb}%`, background: '#7986cb', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.dark}%`, background: '#455a6480', transition: 'width 0.4s' }} />
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
            No profiles match current filter.
          </div>
        )}
        {visible.map(row => (
          <div
            key={row.profile.id}
            style={{
              borderBottom: '1px solid #0d1e30',
              background: expanded === row.profile.id ? 'rgba(0,20,40,0.4)' : 'transparent',
            }}
          >
            <div
              onClick={() => setExpanded(expanded === row.profile.id ? null : row.profile.id)}
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
                {row.profile.name}
              </span>
              {row.profile.role && (
                <span style={{ color: '#4a6fa0', fontSize: 9, background: '#00e5ff11', borderRadius: 2, padding: '0 4px' }}>
                  {row.profile.role}
                </span>
              )}
              <span style={{ color: '#00e5ff', fontSize: 9 }}>{row.matchedNodes.length}N</span>
              <span style={{ color: '#7986cb', fontSize: 9 }}>{row.matchedKB.length}K</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(105,240,174,0.12)',
                  border: '1px solid #69f0ae55',
                  color: '#69f0ae',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.profile.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.profile.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Graph Centrality Nodes */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#00e5ff', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    CENTRALITY NODES ({row.matchedNodes.length})
                  </div>
                  {row.matchedNodes.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No graph centrality match — network gap</div>
                  ) : row.matchedNodes.slice(0, 5).map(n => (
                    <div key={n.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{n.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {n.type && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#00e5ff22', borderRadius: 2, padding: '0 3px' }}>
                            {n.type}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(n.score * 100)}%`, background: '#00e5ff', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: KB Articles */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#7986cb', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    KB ARTICLES ({row.matchedKB.length})
                  </div>
                  {row.matchedKB.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No KB match — knowledge gap</div>
                  ) : row.matchedKB.slice(0, 5).map(k => (
                    <div key={k.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{k.title}</div>
                      {k.category && (
                        <span style={{ color: '#4a6fa0', fontSize: 9, background: '#7986cb22', borderRadius: 2, padding: '0 3px' }}>
                          {k.category}
                        </span>
                      )}
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(k.score * 100)}%`, background: '#7986cb', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Profile metadata footer */}
                {(row.profile.company || row.profile.sector || row.profile.nationality) && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {row.profile.company && (
                      <span style={{ color: '#4a6fa0', fontSize: 9 }}>ORG: <span style={{ color: '#6a8faf' }}>{row.profile.company}</span></span>
                    )}
                    {row.profile.sector && (
                      <span style={{ color: '#4a6fa0', fontSize: 9 }}>SECTOR: <span style={{ color: '#6a8faf' }}>{row.profile.sector}</span></span>
                    )}
                    {row.profile.nationality && (
                      <span style={{ color: '#4a6fa0', fontSize: 9 }}>NAT: <span style={{ color: '#6a8faf' }}>{row.profile.nationality}</span></span>
                    )}
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
