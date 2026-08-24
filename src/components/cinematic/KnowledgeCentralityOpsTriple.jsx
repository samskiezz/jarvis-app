import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const KGCOE_RE = /\b(kgcoe|knowledge\s+centrality\s+ops|knowledge\s+graph\s+ops(?:\s+event)?|kb\s+centrality\s+ops|knowledge\s+node\s+ops|kb\s+graph\s+ops|knowledge\s+ops\s+centrality|dormant\s+knowledge|knowledge\s+article\s+ops|knowledge\s+ops\s+event|kb\s+ops\s+centrality|fully\s+active\s+knowledge|knowledge\s+centrality\s+event|knowledge\s+ops\s+node|knowledge\s+graph\s+event|kb\s+centrality\s+event)\b/i;

const THRESHOLD = 0.08;

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

function normaliseKbArticles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.articles) ? data.articles
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.documents) ? data.documents
    : [];
  return arr.map(a => ({
    id: a.id || a._id || String(Math.random()),
    title: a.title || a.name || a.heading || 'Untitled Article',
    category: a.category || a.type || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    content: String(a.content || a.body || a.summary || a.description || '').slice(0, 400),
    raw: a,
  }));
}

function normaliseCentralityNodes(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.nodes) ? data.nodes
    : Array.isArray(data.centrality) ? data.centrality
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: n.name || n.label || n.title || 'Unnamed Node',
    type: n.type || n.node_type || n.kind || '',
    category: n.category || '',
    score: typeof n.score === 'number' ? n.score
      : typeof n.centrality_score === 'number' ? n.centrality_score
      : typeof n.centrality === 'number' ? n.centrality
      : 0,
    description: n.description || n.summary || '',
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags || ''),
    raw: n,
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || String(Math.random()),
    name: e.name || e.title || e.message || e.description || 'Unnamed Event',
    type: e.type || e.event_type || e.kind || '',
    severity: e.severity || e.level || e.priority || '',
    description: e.description || e.details || e.summary || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(articles, nodes, events) {
  return articles.map(article => {
    const toks = tok([article.title, article.category, article.tags, article.content].join(' '));

    const matchedNodes = nodes
      .map(n => {
        const score = Math.max(
          matchScore(toks, n.name),
          matchScore(toks, n.type),
          matchScore(toks, n.category),
          matchScore(toks, n.description),
          matchScore(toks, n.tags),
        );
        return { ...n, score };
      })
      .filter(n => n.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedEvents = events
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.type),
          matchScore(toks, e.severity),
          matchScore(toks, e.description),
          matchScore(toks, e.tags),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasNode = matchedNodes.length > 0;
    const hasEvent = matchedEvents.length > 0;

    let state;
    if (hasNode && hasEvent) state = 'FULLY ACTIVE';
    else if (hasNode) state = 'NODE-LINKED';
    else if (hasEvent) state = 'OPS-TRIGGERED';
    else state = 'DORMANT';

    return { article, matchedNodes, matchedEvents, state };
  });
}

export function isKgcoeQuery(t) {
  return KGCOE_RE.test(t || '');
}

export async function buildKgcoeScript() {
  try {
    const [kRes, nRes, eRes] = await Promise.allSettled([
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : null),
    ]);
    const articles = normaliseKbArticles(kRes.status === 'fulfilled' ? kRes.value : null);
    const nodes = normaliseCentralityNodes(nRes.status === 'fulfilled' ? nRes.value : null);
    const events = normaliseOpsEvents(eRes.status === 'fulfilled' ? eRes.value : null);
    const rows = correlate(articles, nodes, events);
    const fullyActive = rows.filter(r => r.state === 'FULLY ACTIVE').length;
    const nodeLinked = rows.filter(r => r.state === 'NODE-LINKED').length;
    const opsTriggered = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
    const dormant = rows.filter(r => r.state === 'DORMANT').length;
    return `KGCOE Knowledge×Centrality×Ops: ${rows.length} KB articles analysed. ` +
      `${fullyActive} FULLY ACTIVE (graph node + ops event), ` +
      `${nodeLinked} NODE-LINKED (graph context only), ${opsTriggered} OPS-TRIGGERED (live event only), ${dormant} DORMANT (no coverage). ` +
      (dormant > 0 ? `${dormant} knowledge articles have no graph centrality or ops event context — intelligence blind spots.` :
        fullyActive > 0 ? `Top active: "${rows.find(r => r.state === 'FULLY ACTIVE')?.article.title || 'see panel'}".` :
        'No fully active knowledge articles at this time.');
  } catch {
    return 'KGCOE: data fetch failed.';
  }
}

export default function KnowledgeCentralityOpsTriple() {
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
    window.addEventListener('jarvis:kgcoe-toggle', handler);
    return () => window.removeEventListener('jarvis:kgcoe-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [kRes, nRes, eRes] = await Promise.allSettled([
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const articles = normaliseKbArticles(kRes.status === 'fulfilled' ? kRes.value : null);
      const nodes = normaliseCentralityNodes(nRes.status === 'fulfilled' ? nRes.value : null);
      const events = normaliseOpsEvents(eRes.status === 'fulfilled' ? eRes.value : null);
      if (!articles.length && !nodes.length && !events.length) {
        setErr('No data returned from Knowledge, Graph Centrality, or Ops Events endpoints.');
      }
      setRows(correlate(articles, nodes, events));
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

  const fullyActive = rows.filter(r => r.state === 'FULLY ACTIVE').length;
  const nodeLinked = rows.filter(r => r.state === 'NODE-LINKED').length;
  const opsTriggered = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
  const dormant = rows.filter(r => r.state === 'DORMANT').length;

  const TABS = ['ALL', 'FULLY ACTIVE', 'NODE-LINKED', 'OPS-TRIGGERED', 'DORMANT'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.article.title.toLowerCase().includes(q) ||
        r.matchedNodes.some(n => n.name.toLowerCase().includes(q)) ||
        r.matchedEvents.some(e => e.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    fully: (fullyActive / total) * 100,
    node: (nodeLinked / total) * 100,
    ops: (opsTriggered / total) * 100,
    dormant: (dormant / total) * 100,
  } : { fully: 0, node: 0, ops: 0, dormant: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Knowledge article "${row.article.title}" [${row.state}] (category: ${row.article.category || 'unknown'}): ` +
      `matched centrality nodes: ${row.matchedNodes.map(n => n.name).join(', ') || 'none'}. ` +
      `matched ops events: ${row.matchedEvents.map(e => e.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence knowledge article operational context brief.`;
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

  const STATE_COLOUR = {
    'FULLY ACTIVE': '#69f0ae',
    'NODE-LINKED': '#00e5ff',
    'OPS-TRIGGERED': '#ff9800',
    'DORMANT': '#7c4dff',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 819600,
          bottom: 8,
          zIndex: 492,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #7c4dff44',
          color: '#aaa',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ KGCOE
        {dormant > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#7c4dff',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {dormant}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #7c4dff55',
      borderRadius: 8,
      zIndex: 492,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #7c4dff22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px 8px',
        borderBottom: '1px solid #7c4dff33',
        background: 'rgba(124,77,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}>
        <div>
          <span style={{ color: '#7c4dff', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ KGCOE</span>
          <span style={{ color: '#4a6fa0', marginLeft: 10, fontSize: 10 }}>
            Knowledge × Graph Centrality × Ops Event
          </span>
          {lastRefresh && (
            <span style={{ color: '#2a4060', marginLeft: 10, fontSize: 9 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#7c4dff', fontSize: 10 }}>◌ LOADING</span>}
          <button onClick={load} style={{ background: 'none', border: '1px solid #7c4dff44', color: '#7c4dff', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4a6fa0', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 6px', flexWrap: 'wrap' }}>
        {[
          { label: 'KB ARTICLES', val: total, col: '#7c4dff' },
          { label: 'FULLY ACTIVE', val: fullyActive, col: '#69f0ae' },
          { label: 'NODE-LINKED', val: nodeLinked, col: '#00e5ff' },
          { label: 'OPS-TRIGGERED', val: opsTriggered, col: '#ff9800' },
          { label: 'DORMANT', val: dormant, col: '#7c4dff' },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${t.col}44`,
            borderRadius: 4,
            padding: '4px 10px',
            minWidth: 90,
            textAlign: 'center',
          }}>
            <div style={{ color: t.col, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#4a6fa0', fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#111' }}>
          <div style={{ width: `${cbw.fully}%`, background: '#69f0ae', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.node}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.ops}%`, background: '#ff9800', transition: 'width 0.4s' }} />
          <div style={{ width: `${cbw.dormant}%`, background: '#7c4dff', transition: 'width 0.4s' }} />
        </div>
      )}

      {/* Error */}
      {err && <div style={{ color: '#f44', padding: '4px 14px', fontSize: 10 }}>{err}</div>}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 14px 6px', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? '#7c4dff22' : 'none',
              border: `1px solid ${filter === tab ? '#7c4dff' : '#1a3050'}`,
              color: filter === tab ? '#7c4dff' : '#4a6fa0',
              padding: '2px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            marginLeft: 'auto',
            width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ padding: '0 14px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', textAlign: 'center', padding: 20, fontSize: 11 }}>
            No articles match current filter.
          </div>
        )}
        {visible.map(row => (
          <div key={row.article.id} style={{
            marginBottom: 6,
            border: `1px solid ${STATE_COLOUR[row.state]}33`,
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            {/* Row header */}
            <div
              onClick={() => setExpanded(expanded === row.article.id ? null : row.article.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                background: expanded === row.article.id ? `${STATE_COLOUR[row.state]}11` : 'transparent',
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 100,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.article.title}
              </span>
              {row.article.category && (
                <span style={{ color: '#2a4060', fontSize: 9 }}>{row.article.category}</span>
              )}
              <span style={{ color: '#00e5ff', fontSize: 9 }}>{row.matchedNodes.length}N</span>
              <span style={{ color: '#ff9800', fontSize: 9 }}>{row.matchedEvents.length}E</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(124,77,255,0.12)',
                  border: '1px solid #7c4dff55',
                  color: '#7c4dff',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.article.id ? '▲' : '▼'}</span>
            </div>

            {/* Expand: split pane */}
            {expanded === row.article.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Centrality Nodes */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#00e5ff', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>CENTRALITY NODES ({row.matchedNodes.length})</div>
                  {row.matchedNodes.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No node match</div>
                  ) : row.matchedNodes.slice(0, 5).map(n => (
                    <div key={n.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{n.name}</div>
                      {n.type && <div style={{ color: '#4a6fa0', fontSize: 9 }}>{n.type}</div>}
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(n.score * 100)}%`, background: '#00e5ff', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Ops Events */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ff9800', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>OPS EVENTS ({row.matchedEvents.length})</div>
                  {row.matchedEvents.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No ops event match</div>
                  ) : row.matchedEvents.slice(0, 5).map(e => (
                    <div key={e.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{e.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {e.type && <span style={{ color: '#4a6fa0', fontSize: 9 }}>{e.type}</span>}
                        {e.severity && (
                          <span style={{ color: '#ff9800', fontSize: 9, background: '#ff980022', borderRadius: 2, padding: '0 3px' }}>{e.severity}</span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(e.score * 100)}%`, background: '#ff9800', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Article excerpt */}
                {row.article.content && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050' }}>
                    <span style={{ color: '#2a4060', fontSize: 9 }}>KB: </span>
                    <span style={{ color: '#4a6fa0', fontSize: 10 }}>{row.article.content.slice(0, 200)}{row.article.content.length > 200 ? '…' : ''}</span>
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
