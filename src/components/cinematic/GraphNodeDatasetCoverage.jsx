import { useState, useEffect, useCallback } from 'react';

const API = '';
const GNDC_RE = /\b(graph[._-]?dataset|dataset[._-]?node|node[._-]?data|graph[._-]?data[._-]?cover|node[._-]?data[._-]?cover|uncharted[._-]?nodes|gndc|which[._-]?nodes[._-]?have[._-]?data|node[._-]?dataset[._-]?gap)\b/i;

export function isGndcQuery(t) {
  return GNDC_RE.test(t || '');
}

export async function buildGndcScript() {
  const [grR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(grR.status === 'fulfilled' ? grR.value : []);
  const datasets = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const enriched = correlate(nodes, datasets);
  const covered = enriched.filter(n => n._covered).length;
  const uncharted = enriched.filter(n => !n._covered).length;
  const top = enriched.filter(n => !n._covered).slice(0, 4)
    .map(n => n.label || n.id || '?').join(', ');
  return `Graph Node × Dataset Coverage: ${nodes.length} top-influence nodes cross-referenced against ${datasets.length} datasets. ` +
    `${covered} nodes are COVERED by at least one dataset; ${uncharted} are UNCHARTED with no dataset support. ` +
    `Top uncharted nodes: ${top || 'none'}.`;
}

function normaliseNodes(raw) {
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'items', 'results', 'data', 'centrality']) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function normaliseDatasets(raw) {
  if (Array.isArray(raw)) return raw;
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
}

function nodeLabel(n) {
  return [n.label, n.name, n.title, n.type, n.description, n.category, n.entity_type].filter(Boolean).join(' ');
}

function datasetLabel(ds) {
  return [ds.name, ds.title, ds.description, ds.type, ds.source, ...(ds.tags || [])].filter(Boolean).join(' ');
}

function matchScore(node, dataset) {
  const nodeToks = new Set(tokens(nodeLabel(node)));
  const dsToks = tokens(datasetLabel(dataset));
  if (!nodeToks.size || !dsToks.length) return 0;
  let hits = 0;
  for (const t of dsToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, dsToks.length);
}

function correlate(nodes, datasets) {
  return nodes.map(node => {
    const scored = datasets
      .map(ds => ({ ds, score: matchScore(node, ds) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...node, _matches: scored, _covered: scored.length > 0 };
  });
}

const ACCENT = '#f59e0b';
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function GraphNodeDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [grR, dsR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      const n = normaliseNodes(grR.status === 'fulfilled' ? grR.value : []);
      const d = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      setNodes(n);
      setDatasets(d);
      setEnriched(correlate(n, d));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:gndc-toggle', h);
    return () => window.removeEventListener('jarvis:gndc-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const covered = enriched.filter(n => n._covered);
    const uncharted = enriched.filter(n => !n._covered);
    const prompt =
      `Graph Node × Dataset Coverage: ${nodes.length} top-influence nodes, ${datasets.length} datasets. ` +
      `${covered.length} nodes COVERED (dataset support confirmed); ${uncharted.length} UNCHARTED (no dataset — intelligence gap). ` +
      `Top uncharted nodes: ${uncharted.slice(0, 5).map(n => n.label || n.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence graph-data readiness brief: which gaps matter most and what to acquire.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const unchartedCount = enriched.filter(n => !n._covered).length;
  const coveredCount = enriched.filter(n => n._covered).length;
  const badge = unchartedCount > 0 ? ACCENT : '#22c55e';

  const visible = enriched.filter(node => {
    const label = (node.label || node.name || node.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'COVERED') return node._covered;
    if (tab === 'UNCHARTED') return !node._covered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph Node × Dataset Coverage"
        style={{
          position: 'fixed',
          left: 58440,
          bottom: 8,
          zIndex: 113,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: unchartedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        GNDC
        {unchartedCount > 0 && (
          <span style={{ background: badge, color: '#0f172a', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unchartedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9606,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>◈ GRAPH NODE × DATASET COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'NODES', val: nodes.length, color: '#60a5fa' },
              { label: 'DATASETS', val: datasets.length, color: '#94a3b8' },
              { label: 'COVERED', val: coveredCount, color: '#22c55e' },
              { label: 'UNCHARTED', val: unchartedCount, color: unchartedCount > 0 ? ACCENT : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'COVERED', 'UNCHARTED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? ACCENT : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search nodes…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No nodes match the current filter.</div>
          )}

          <div>
            {visible.map((node, i) => {
              const id = node.id || node.node_id || i;
              const label = node.label || node.name || `Node ${id}`;
              const entityType = node.entity_type || node.type || node.category || '';
              const influence = node.centrality || node.score || node.influence || null;
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: node._covered ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: node._covered ? '#22c55e' : ACCENT,
                      border: `1px solid ${node._covered ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {node._covered ? 'COVERED' : 'UNCHARTED'}
                    </span>
                    {entityType && (
                      <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                        {entityType}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {influence !== null && (
                      <span style={{ color: '#475569', fontSize: 10, whiteSpace: 'nowrap' }}>
                        {typeof influence === 'number' ? influence.toFixed(3) : influence}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {node._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Supporting datasets:</div>
                          {node._matches.map(({ ds, score }, j) => {
                            const dsName = ds.name || ds.title || ds.id || `dataset-${j}`;
                            const dsType = ds.type || ds.format || ds.category || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  {dsType && (
                                    <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                                      {dsType}
                                    </span>
                                  )}
                                  <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dsName}</span>
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: ACCENT, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 11 }}>No datasets matched — this node has no data support in the catalog.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} nodes · {datasets.length} datasets indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
