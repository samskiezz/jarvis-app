import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const INVKGC_RE = /\b(invkgc|investment[._-]?knowledge[._-]?graph|portfolio[._-]?knowledge[._-]?graph|investment[._-]?kb[._-]?graph|invest[._-]?knowledge[._-]?centrality|knowledge[._-]?backed[._-]?invest|graph[._-]?backed[._-]?invest|invest[._-]?graph[._-]?kb|investment[._-]?intel[._-]?graph|portfolio[._-]?intel[._-]?graph|documented[._-]?invest|undocumented[._-]?invest|investment[._-]?knowledge[._-]?coverage|portfolio[._-]?coverage[._-]?triple)\b/i;

export function isInvkgcQuery(t) { return INVKGC_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.07;

const COV = {
  FULLY_DOCUMENTED: 'FULLY_DOCUMENTED',
  KB_BACKED: 'KB_BACKED',
  NODE_BACKED: 'NODE_BACKED',
  UNDOCUMENTED: 'UNDOCUMENTED',
};

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function classifyInvestment(invTokens, articles, nodes) {
  let bestKbScore = 0;
  let bestKbArticle = null;
  for (const a of articles) {
    const at = tok([a?.title, a?.category, a?.summary, a?.description, (a?.tags || []).join(' ')].join(' '));
    const s = matchScore(invTokens, at);
    if (s > bestKbScore) { bestKbScore = s; bestKbArticle = a; }
  }
  let bestNodeScore = 0;
  let bestNode = null;
  for (const n of nodes) {
    const nt = tok([n?.id, n?.entity_id, n?.name, n?.label, n?.type, n?.domain, (n?.aliases || []).join(' ')].join(' '));
    const s = matchScore(invTokens, nt);
    if (s > bestNodeScore) { bestNodeScore = s; bestNode = n; }
  }
  const hasKb = bestKbScore >= THRESHOLD;
  const hasNode = bestNodeScore >= THRESHOLD;
  let cov;
  if (hasKb && hasNode) cov = COV.FULLY_DOCUMENTED;
  else if (hasKb) cov = COV.KB_BACKED;
  else if (hasNode) cov = COV.NODE_BACKED;
  else cov = COV.UNDOCUMENTED;
  return { cov, bestKbArticle, bestKbScore, bestNode, bestNodeScore };
}

export async function buildInvkgcScript() {
  try {
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, kbRes, graphRes] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const investments = normaliseArray(
      invRes.status === 'fulfilled' ? invRes.value : [],
      'items', 'data', 'investments'
    );
    const articles = normaliseArray(
      kbRes.status === 'fulfilled' ? kbRes.value : {},
      'articles', 'knowledge', 'items', 'results', 'data'
    );
    const nodes = normaliseArray(
      graphRes.status === 'fulfilled' ? graphRes.value : [],
      'nodes', 'centrality', 'items', 'data'
    );
    const enriched = investments.map(inv => {
      const invTokens = tok([inv?.name, inv?.ticker, inv?.sector, inv?.asset_class, inv?.description, inv?.notes, (inv?.tags || []).join(' ')].join(' '));
      return { inv, invTokens, ...classifyInvestment(invTokens, articles, nodes) };
    });
    const fullyDocumented = enriched.filter(e => e.cov === COV.FULLY_DOCUMENTED).length;
    const kbBacked = enriched.filter(e => e.cov === COV.KB_BACKED).length;
    const nodeBacked = enriched.filter(e => e.cov === COV.NODE_BACKED).length;
    const undocumented = enriched.filter(e => e.cov === COV.UNDOCUMENTED).length;
    const undocNames = enriched.filter(e => e.cov === COV.UNDOCUMENTED).slice(0, 3).map(e => e.inv?.name || e.inv?.ticker || '?').join(', ');
    return (
      `Investment × Knowledge × Graph Centrality: ${investments.length} investments cross-matched against ${articles.length} KB articles and ${nodes.length} graph nodes. ` +
      `${fullyDocumented} are FULLY_DOCUMENTED (both KB and graph backing); ${kbBacked} KB_BACKED; ${nodeBacked} NODE_BACKED; ${undocumented} UNDOCUMENTED (intelligence gap). ` +
      `Top undocumented: ${undocNames || 'none'}. Recommend prioritising KB and graph enrichment for undocumented holdings.`
    );
  } catch {
    return 'Investment Knowledge Graph assessment unavailable.';
  }
}

const AM = '#f59e0b';
const CY = '#22d3ee';
const GR = '#4ade80';
const SL = '#475569';
const VI = '#a78bfa';

export default function InvestmentKnowledgeGraphTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [articles, setArticles] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessText, setAssessText] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, kbRes, graphRes] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      const invs = normaliseArray(invRes.status === 'fulfilled' ? invRes.value : [], 'items', 'data', 'investments');
      const arts = normaliseArray(kbRes.status === 'fulfilled' ? kbRes.value : {}, 'articles', 'knowledge', 'items', 'results', 'data');
      const nds = normaliseArray(graphRes.status === 'fulfilled' ? graphRes.value : [], 'nodes', 'centrality', 'items', 'data');
      setInvestments(invs);
      setArticles(arts);
      setNodes(nds);
      const rows = invs.map(inv => {
        const invTokens = tok([inv?.name, inv?.ticker, inv?.sector, inv?.asset_class, inv?.description, inv?.notes, (inv?.tags || []).join(' ')].join(' '));
        return { inv, ...classifyInvestment(invTokens, arts, nds) };
      });
      setEnriched(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, POLL_MS);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:invkgc-toggle', handler);
    return () => window.removeEventListener('jarvis:invkgc-toggle', handler);
  }, []);

  const counts = {
    [COV.FULLY_DOCUMENTED]: enriched.filter(e => e.cov === COV.FULLY_DOCUMENTED).length,
    [COV.KB_BACKED]: enriched.filter(e => e.cov === COV.KB_BACKED).length,
    [COV.NODE_BACKED]: enriched.filter(e => e.cov === COV.NODE_BACKED).length,
    [COV.UNDOCUMENTED]: enriched.filter(e => e.cov === COV.UNDOCUMENTED).length,
  };
  const total = enriched.length;
  const undocPct = total ? Math.round((counts[COV.UNDOCUMENTED] / total) * 100) : 0;

  const sq = search.toLowerCase();
  const visible = enriched.filter(e => {
    if (filter !== 'ALL' && e.cov !== filter) return false;
    if (sq) {
      const name = String(e.inv?.name || e.inv?.ticker || '').toLowerCase();
      return name.includes(sq);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildInvkgcScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 877280, bottom: 8, zIndex: 575,
          background: 'rgba(5,8,13,0.75)', border: `1px solid ${AM}55`,
          color: AM, borderRadius: 4, padding: '3px 7px', fontSize: 10,
          fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
        }}
        title="Investment × Knowledge × Graph Centrality Triple Coverage (INVKGC)"
      >
        ◈ INVKGC
        {counts[COV.UNDOCUMENTED] > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {counts[COV.UNDOCUMENTED]}
          </span>
        )}
      </button>
    );
  }

  const barPcts = total
    ? [
        { w: (counts[COV.FULLY_DOCUMENTED] / total) * 100, c: GR },
        { w: (counts[COV.KB_BACKED] / total) * 100, c: CY },
        { w: (counts[COV.NODE_BACKED] / total) * 100, c: VI },
        { w: (counts[COV.UNDOCUMENTED] / total) * 100, c: AM },
      ]
    : [];

  return (
    <div style={{
      position: 'fixed', left: 877280, bottom: 36, zIndex: 575,
      width: 360, maxHeight: '72vh', overflowY: 'auto',
      background: 'rgba(5,8,13,0.95)', border: `1px solid ${AM}44`,
      borderRadius: 8, padding: 14, fontFamily: 'monospace',
      color: '#cdd6f4', backdropFilter: 'blur(10px)',
      boxShadow: `0 0 30px ${AM}22`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: AM, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ INVKGC</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Investment × Knowledge × Graph Centrality</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'investments', val: total, c: '#94a3b8' },
          { label: 'kb articles', val: articles.length, c: CY },
          { label: 'graph nodes', val: nodes.length, c: VI },
          { label: 'undoc%', val: `${undocPct}%`, c: AM },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'fully doc', val: counts[COV.FULLY_DOCUMENTED], c: GR },
          { label: 'kb only', val: counts[COV.KB_BACKED], c: CY },
          { label: 'node only', val: counts[COV.NODE_BACKED], c: VI },
          { label: 'undoc', val: counts[COV.UNDOCUMENTED], c: AM },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
          {barPcts.map((b, i) => <div key={i} style={{ width: `${b.w}%`, background: b.c }} />)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', COV.FULLY_DOCUMENTED, COV.KB_BACKED, COV.NODE_BACKED, COV.UNDOCUMENTED].map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: filter === tab
              ? (tab === 'ALL' ? '#22d3ee'
                : tab === COV.FULLY_DOCUMENTED ? GR
                : tab === COV.KB_BACKED ? CY
                : tab === COV.NODE_BACKED ? VI : AM)
              : '#1e293b',
            color: filter === tab ? (tab === COV.FULLY_DOCUMENTED ? '#000' : '#fff') : '#94a3b8',
            border: 'none', letterSpacing: 0.5,
          }}>
            {tab === 'ALL' ? 'ALL' : tab.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="filter investments…"
        style={{
          width: '100%', boxSizing: 'border-box', background: '#1e293b',
          border: `1px solid ${AM}33`, color: '#cdd6f4', borderRadius: 4,
          padding: '4px 8px', fontSize: 10, marginBottom: 8,
        }}
      />

      <button onClick={assess} disabled={assessing} style={{
        width: '100%', marginBottom: 10, padding: '5px 0', fontSize: 10,
        background: assessing ? '#1e293b' : `${AM}22`, border: `1px solid ${AM}55`,
        color: AM, borderRadius: 4, cursor: assessing ? 'not-allowed' : 'pointer', letterSpacing: 1,
      }}>
        {assessing ? '◌ ASSESSING…' : '▶ ASSESS — AI brief + TTS'}
      </button>
      {assessText && (
        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 8, padding: '6px 8px', background: '#0f172a', borderRadius: 4, lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {loading && <div style={{ fontSize: 9, color: SL, marginBottom: 6 }}>◌ refreshing…</div>}

      <div>
        {visible.slice(0, 30).map((row, idx) => {
          const { inv, cov, bestKbArticle, bestKbScore, bestNode, bestNodeScore } = row;
          const name = inv?.name || inv?.ticker || `Investment #${idx + 1}`;
          const sector = inv?.sector || inv?.asset_class;
          const isExp = expanded === idx;
          const covColor = cov === COV.FULLY_DOCUMENTED ? GR : cov === COV.KB_BACKED ? CY : cov === COV.NODE_BACKED ? VI : AM;
          return (
            <div key={idx} onClick={() => setExpanded(isExp ? null : idx)} style={{
              borderRadius: 4, padding: '6px 8px', marginBottom: 4, cursor: 'pointer',
              background: '#0f172a', border: `1px solid ${covColor}33`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {sector && (
                  <span style={{ color: '#64748b', fontSize: 9, minWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(sector).toUpperCase().slice(0, 8)}
                  </span>
                )}
                <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </span>
                <span style={{ fontSize: 8, color: covColor, letterSpacing: 1, fontWeight: 700 }}>
                  {cov.replace(/_/g, ' ')}
                </span>
              </div>
              {isExp && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLE</div>
                    {bestKbArticle ? (
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>
                        <div style={{ color: '#e2e8f0', marginBottom: 2 }}>{bestKbArticle.title || bestKbArticle.name || 'Article'}</div>
                        {bestKbArticle.category && <div style={{ color: CY, fontSize: 8 }}>[{bestKbArticle.category}]</div>}
                        <div style={{ marginTop: 3, background: '#1e293b', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, bestKbScore * 700)}%`, background: CY, height: '100%' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: SL }}>no kb match</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: VI, letterSpacing: 1, marginBottom: 4 }}>GRAPH NODE</div>
                    {bestNode ? (
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>
                        <div style={{ color: '#e2e8f0', marginBottom: 2 }}>{bestNode.name || bestNode.label || bestNode.id || 'Node'}</div>
                        {bestNode.type && <div style={{ color: VI, fontSize: 8 }}>[{bestNode.type}]</div>}
                        <div style={{ fontSize: 8, color: SL }}>
                          centrality: {typeof bestNode.centrality === 'number' ? bestNode.centrality.toFixed(3) : bestNode.score?.toFixed(3) || '—'}
                        </div>
                        <div style={{ marginTop: 3, background: '#1e293b', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, bestNodeScore * 700)}%`, background: VI, height: '100%' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: SL }}>no node match</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visible.length > 30 && (
          <div style={{ fontSize: 9, color: SL, textAlign: 'center', marginTop: 4 }}>
            +{visible.length - 30} more — refine filter
          </div>
        )}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 9, color: SL, textAlign: 'center', padding: 12 }}>no investments match</div>
        )}
      </div>
    </div>
  );
}
