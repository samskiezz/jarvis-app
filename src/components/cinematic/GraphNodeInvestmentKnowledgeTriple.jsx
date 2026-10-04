import { useState, useEffect, useCallback } from 'react';

const API = '';

const GNIKTR_RE = /\b(gniktr|graph[._-]?node[._-]?invest[._-]?know|node[._-]?invest[._-]?knowledge|graph[._-]?invest[._-]?knowledge|invest[._-]?knowledge[._-]?node|node[._-]?knowledge[._-]?invest|graph[._-]?investment[._-]?knowledge|knowledge[._-]?invest[._-]?node|network[._-]?invest[._-]?knowledge|graph[._-]?node[._-]?knowledge[._-]?invest)\b/i;

export function isGniktrQuery(t) {
  return GNIKTR_RE.test(t || '');
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'centrality', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.slice(0, 60).map((n, i) => ({
    id:        n.id || n.node_id || String(i),
    name:      n.label || n.name || n.id || `Node ${i + 1}`,
    type:      n.type || n.kind || n.category || '',
    influence: typeof n.score === 'number' ? n.score : (typeof n.centrality === 'number' ? n.centrality : 0),
    desc:      String(n.description || n.summary || '').slice(0, 200),
    tags:      Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
  }));
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'items', 'results', 'data', 'records', 'portfolio'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((iv, i) => ({
    id:     iv.id || String(i),
    name:   iv.name || iv.title || iv.label || `Investment ${i + 1}`,
    sector: iv.sector || iv.industry || iv.category || '',
    ticker: iv.ticker || iv.symbol || '',
    desc:   String(iv.notes || iv.description || iv.summary || '').slice(0, 200),
    tags:   Array.isArray(iv.tags) ? iv.tags.join(' ') : (iv.tags || ''),
  }));
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'knowledge', 'items', 'results', 'data', 'records', 'documents'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.title || a.name || a.subject || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    desc:     String(a.summary || a.content || a.description || a.body || '').slice(0, 200),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(nodeToks, other) {
  const otherToks = [
    ...tokens(other.name     || ''),
    ...tokens(other.sector   || other.category || other.type || ''),
    ...tokens(other.ticker   || ''),
    ...tokens(other.desc     || other.description || other.summary || ''),
    ...tokens(other.tags     || ''),
  ].filter(Boolean);
  if (!nodeToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, otherToks.length);
}

function correlate(nodes, investments, articles) {
  return nodes.map(node => {
    const toks = new Set([
      ...tokens(node.name),
      ...tokens(node.type),
      ...tokens(node.desc),
      ...tokens(node.tags),
    ].filter(Boolean));

    const matchedInvestments = investments
      .map(iv => ({ ...iv, _score: matchScore(toks, iv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedArticles = articles
      .map(a => ({ ...a, _score: matchScore(toks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasInvestment = matchedInvestments.length > 0;
    const hasArticle    = matchedArticles.length > 0;

    let coverage;
    if (hasInvestment && hasArticle) coverage = 'FULLY MAPPED';
    else if (hasInvestment)           coverage = 'INVESTED';
    else if (hasArticle)              coverage = 'DOCUMENTED';
    else                              coverage = 'BLIND';

    return { ...node, _investments: matchedInvestments, _articles: matchedArticles, _coverage: coverage };
  });
}

export async function buildGniktrScript() {
  const [nR, iR, aR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
  ]);
  const nodes       = normaliseNodes(nR.status       === 'fulfilled' ? nR.value : []);
  const investments = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
  const articles    = normaliseArticles(aR.status    === 'fulfilled' ? aR.value : []);
  const enriched    = correlate(nodes, investments, articles);
  const fm   = enriched.filter(e => e._coverage === 'FULLY MAPPED').length;
  const inv  = enriched.filter(e => e._coverage === 'INVESTED').length;
  const doc  = enriched.filter(e => e._coverage === 'DOCUMENTED').length;
  const bld  = enriched.filter(e => e._coverage === 'BLIND').length;
  return (
    `Graph Node × Investment × Knowledge Triple Coverage: ${nodes.length} top-influence graph nodes cross-referenced against ` +
    `${investments.length} investments and ${articles.length} KB articles. ` +
    `${fm} FULLY MAPPED (investment-aligned + knowledge-backed); ` +
    `${inv} INVESTED (portfolio connection found, no KB backing); ` +
    `${doc} DOCUMENTED (KB article found, no investment position); ` +
    `${bld} BLIND (neither — high-influence node with no financial or knowledge coverage). ` +
    `Top blind nodes: ${enriched.filter(e => e._coverage === 'BLIND').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const TE = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY MAPPED': GR,
  'INVESTED':     TE,
  'DOCUMENTED':   LM,
  'BLIND':        '#555',
};

const chip = (label, color = TE) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY MAPPED', 'INVESTED', 'DOCUMENTED', 'BLIND'];

export default function GraphNodeInvestmentKnowledgeTriple() {
  const [open, setOpen]             = useState(false);
  const [nodes, setNodes]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [nR, iR, aR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
      ]);
      const raw_n = normaliseNodes(nR.status       === 'fulfilled' ? nR.value : []);
      const raw_i = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
      const raw_a = normaliseArticles(aR.status    === 'fulfilled' ? aR.value : []);
      setNodes(correlate(raw_n, raw_i, raw_a));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gniktr-toggle', toggle);
    return () => window.removeEventListener('jarvis:gniktr-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildGniktrScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Graph Node × Investment × Knowledge triple coverage brief: ${brief}. Give a 2-sentence assessment of which high-influence nodes are fully mapped with both portfolio and knowledge coverage versus blind spots with neither.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const blindCount = nodes.filter(n => n._coverage === 'BLIND').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Node × Investment × Knowledge Triple Coverage (GNIKTR)"
        style={{
          position: 'fixed', left: 736720, bottom: 8, zIndex: 344,
          background: blindCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${blindCount > 0 ? AM : TE + '44'}`,
          color: blindCount > 0 ? AM : TE, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GNIKTR{blindCount > 0 ? ` ⚠${blindCount}` : ''}
      </button>
    );
  }

  const fm  = nodes.filter(n => n._coverage === 'FULLY MAPPED').length;
  const inv = nodes.filter(n => n._coverage === 'INVESTED').length;
  const doc = nodes.filter(n => n._coverage === 'DOCUMENTED').length;
  const bld = nodes.filter(n => n._coverage === 'BLIND').length;

  const visible = nodes.filter(n =>
    (tab === 'ALL' || n._coverage === tab) &&
    (!search || n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.type.toLowerCase().includes(search.toLowerCase()) ||
      n.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: TE, fontWeight: 700, fontSize: 11 }}>◈ GRAPH NODE × INVESTMENT × KNOWLEDGE TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GNIKTR</span>
        {bld > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {bld} BLIND</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['GRAPH NODES',  nodes.length, TE],
          ['FULLY MAPPED', fm,           GR],
          ['INVESTED',     inv,          TE],
          ['DOCUMENTED',   doc,          LM],
          ['BLIND',        bld,          '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {nodes.length > 0 && [
            [fm, GR], [inv, TE], [doc, LM], [bld, '#444']
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || TE) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || TE) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || TE) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${nodes.filter(n => n._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search graph nodes…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: TE, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No nodes match filter.</div>}
        {visible.map(node => {
          const color = COVERAGE_COLOR[node._coverage] || TE;
          const isExp = expanded === node.id;
          return (
            <div key={node.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : node.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                {node.type && chip(node.type, '#888')}
                {node.influence > 0 && chip(`inf:${node.influence.toFixed ? node.influence.toFixed(2) : node.influence}`, '#555')}
                {chip(node._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: TE, marginBottom: 4, fontWeight: 600 }}>INVESTMENTS ({node._investments.length})</div>
                    {node._investments.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No investment alignment</div>
                      : node._investments.map(iv => (
                        <div key={iv.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.name}</span>
                            {iv.sector && chip(iv.sector, '#888')}
                            {iv.ticker && chip(iv.ticker, '#555')}
                          </div>
                          <ScoreBar score={iv._score} color={TE} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>KB ARTICLES ({node._articles.length})</div>
                    {node._articles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No knowledge backing</div>
                      : node._articles.map(a => (
                        <div key={a.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            {a.category && chip(a.category, '#888')}
                          </div>
                          <ScoreBar score={a._score} color={LM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: TE, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
