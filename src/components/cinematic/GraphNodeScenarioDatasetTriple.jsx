import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GNSCDS_RE = /\b(gnscds|graph\s+node\s+scenario\s+dataset|centrality\s+scenario\s+dataset|node\s+scenario\s+dataset|graph\s+scenario\s+data|centrality\s+dataset\s+scenario|node\s+dataset\s+scenario|graph\s+node\s+data|centrality\s+scenario\s+data|graph\s+dataset\s+scenario|dark\s+centrality\s+node|fully\s+ready\s+node|graph\s+centrality\s+scenario\s+dataset|graph\s+node\s+scenario\s+data|centrality\s+node\s+scenario)\b/i;
const THRESHOLD = 0.07;

export function isGnscdsQuery(t) {
  return GNSCDS_RE.test(t || '');
}

export async function buildGnscdsScript() {
  try {
    const [nodeRes, scenRes, dsRes] = await Promise.all([
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const nodes = normaliseNodes(nodeRes);
    const scenarios = normaliseScenarios(scenRes);
    const datasets = normaliseDatasets(dsRes);
    const classified = nodes.map(n => classifyNode(n, scenarios, datasets));
    const fullyReady = classified.filter(n => n.state === 'FULLY_READY').length;
    const dark = classified.filter(n => n.state === 'DARK').length;
    return `GNSCDS analysis: ${nodes.length} top-influence graph centrality nodes cross-referenced against ${scenarios.length} active scenarios and ${datasets.length} datasets. ${fullyReady} nodes are FULLY READY — both threat scenario coverage and empirical dataset backing confirmed for these high-influence network entities. ${dark} nodes are DARK — no scenario or dataset coverage detected, representing high-influence network entities with zero operational or data intelligence — critical gaps requiring immediate scenario modeling and data ingestion.`;
  } catch {
    return 'GNSCDS data unavailable — check /v1/graph/centrality, /v1/scenario/list, and /v1/datasets endpoints.';
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

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.centrality) ? raw.centrality
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.entity || `Node ${i + 1}`,
    score: typeof n.score === 'number' ? n.score
      : typeof n.centrality_score === 'number' ? n.centrality_score
      : 0,
    type: n.type || n.category || n.kind || '',
    _text: [
      n.label, n.name, n.entity, n.description,
      n.type, n.category, n.tags, n.domain,
    ].filter(Boolean).join(' '),
  })).sort((a, b) => b.score - a.score).slice(0, 100);
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.scenarios) ? raw.scenarios
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `scen-${i}`,
    label: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    status: s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    risk: s.risk_level || s.severity || s.risk || '',
    _text: [
      s.name, s.title, s.scenario_name, s.description,
      s.category, s.type, s.tags, s.status, s.domain,
    ].filter(Boolean).join(' '),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.datasets) ? raw.datasets
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    label: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    rows: d.row_count || d.rows || d.count || null,
    _text: [
      d.name, d.title, d.dataset_name, d.description,
      d.kind, d.type, d.category, d.tags, d.domain, d.source,
    ].filter(Boolean).join(' '),
  }));
}

function classifyNode(node, scenarios, datasets) {
  const toks = tok(node._text);
  const matchedScenarios = scenarios
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._text), matchScore(tok(s._text), node._text)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedDatasets = datasets
    .map(d => ({ ...d, score: Math.max(matchScore(toks, d._text), matchScore(tok(d._text), node._text)) }))
    .filter(d => d.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasSc = matchedScenarios.length > 0;
  const hasDs = matchedDatasets.length > 0;
  const state = hasSc && hasDs ? 'FULLY_READY'
    : hasSc ? 'SCENARIO_ONLY'
    : hasDs ? 'DATA_BACKED'
    : 'DARK';

  return { ...node, state, matchedScenarios, matchedDatasets };
}

const STATE_COLOR = {
  FULLY_READY: '#22c55e',
  SCENARIO_ONLY: '#8b5cf6',
  DATA_BACKED: '#38bdf8',
  DARK: '#6b7280',
};

export default function GraphNodeScenarioDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nodes, setNodes] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nodeRes, scenRes, dsRes] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      ]);
      const n = normaliseNodes(nodeRes);
      const s = normaliseScenarios(scenRes);
      const d = normaliseDatasets(dsRes);
      setNodes(n);
      setScenarios(s);
      setDatasets(d);
      setClassified(n.map(node => classifyNode(node, s, d)));
    } catch (err) {
      setError('Fetch error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:gnscds-toggle', handler);
    return () => window.removeEventListener('jarvis:gnscds-toggle', handler);
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
      if (GNSCDS_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_READY: classified.filter(n => n.state === 'FULLY_READY').length,
    SCENARIO_ONLY: classified.filter(n => n.state === 'SCENARIO_ONLY').length,
    DATA_BACKED: classified.filter(n => n.state === 'DATA_BACKED').length,
    DARK: classified.filter(n => n.state === 'DARK').length,
  };

  const visible = classified.filter(n => {
    if (filter !== 'ALL' && n.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return n._text.toLowerCase().includes(q) || n.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `GNSCDS Graph Node × Scenario × Dataset Triple Coverage: ${nodes.length} top-influence graph centrality nodes cross-referenced against ${scenarios.length} active scenarios and ${datasets.length} datasets. Coverage breakdown: FULLY_READY=${counts.FULLY_READY} (both scenario and dataset), SCENARIO_ONLY=${counts.SCENARIO_ONLY} (scenario but no data), DATA_BACKED=${counts.DATA_BACKED} (data but no scenario), DARK=${counts.DARK} (neither — high-influence nodes with zero coverage). In 2 sentences, assess which high-influence network nodes have complete scenario and data coverage versus those that are dark with no scenario modeling or empirical data backing, and identify the most critical network intelligence gaps.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || j.answer || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const readyPct  = classified.length ? Math.round((counts.FULLY_READY   / classified.length) * 100) : 0;
  const scenPct   = classified.length ? Math.round((counts.SCENARIO_ONLY  / classified.length) * 100) : 0;
  const dataPct   = classified.length ? Math.round((counts.DATA_BACKED    / classified.length) * 100) : 0;
  const darkPct   = classified.length ? Math.round((counts.DARK           / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 851520, bottom: 8, zIndex: 549,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ GNSCDS</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Graph Node × Scenario × Dataset Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#22c55e', fontSize: 10 }}>SYNCING…</span>}
          {counts.FULLY_READY > 0 && (
            <span style={{ background: '#14532d', color: '#22c55e', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.FULLY_READY} READY
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#1f2937', color: '#9ca3af', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.DARK} DARK
            </span>
          )}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'GRAPH NODES', val: nodes.length, color: '#e2e8f0' },
          { label: 'SCENARIOS', val: scenarios.length, color: '#8b5cf6' },
          { label: 'DATASETS', val: datasets.length, color: '#38bdf8' },
          { label: 'FULLY READY', val: counts.FULLY_READY, color: '#22c55e', badge: counts.FULLY_READY > 0 },
          { label: 'SCENARIO ONLY', val: counts.SCENARIO_ONLY, color: '#8b5cf6' },
          { label: 'DATA BACKED', val: counts.DATA_BACKED, color: '#38bdf8' },
          { label: 'DARK', val: counts.DARK, color: '#9ca3af', badge: counts.DARK > 0 },
          { label: 'READY %', val: `${readyPct}%`, color: '#22c55e' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          <div style={{ width: `${readyPct}%`, background: '#22c55e' }} title={`FULLY READY ${readyPct}%`} />
          <div style={{ width: `${scenPct}%`, background: '#8b5cf6' }} title={`SCENARIO ONLY ${scenPct}%`} />
          <div style={{ width: `${dataPct}%`, background: '#38bdf8' }} title={`DATA BACKED ${dataPct}%`} />
          <div style={{ width: `${darkPct}%`, background: '#374151' }} title={`DARK ${darkPct}%`} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#64748b' }}>
          <span style={{ color: '#22c55e' }}>■ READY {readyPct}%</span>
          <span style={{ color: '#8b5cf6' }}>■ SCENARIO {scenPct}%</span>
          <span style={{ color: '#38bdf8' }}>■ DATA {dataPct}%</span>
          <span style={{ color: '#9ca3af' }}>■ DARK {darkPct}%</span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY_READY', 'SCENARIO_ONLY', 'DATA_BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e293b' : 'none', border: `1px solid ${filter === f ? '#334155' : '#1e293b'}`,
            color: filter === f ? '#e2e8f0' : '#64748b', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 10,
          }}>{f.replace(/_/g, ' ')}{f !== 'ALL' ? ` (${counts[f] ?? 0})` : ` (${classified.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search graph nodes…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 160 }} />
      </div>

      {/* Node list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
        {visible.slice(0, 120).map(n => (
          <div key={n.id}>
            <div onClick={() => setExpanded(expanded === n.id ? null : n.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f172a', cursor: 'pointer' }}>
              <span style={{ color: STATE_COLOR[n.state], fontWeight: 700, fontSize: 10, minWidth: 100 }}>{n.state.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', flex: 1 }}>{n.label}</span>
              {n.type && <span style={{ color: '#64748b', fontSize: 10 }}>{n.type}</span>}
              {n.score > 0 && (
                <span style={{ background: '#0f172a', color: '#22c55e', borderRadius: 3, padding: '0 5px', fontSize: 9, border: '1px solid #166534' }}>
                  {n.score.toFixed ? n.score.toFixed(3) : n.score}
                </span>
              )}
              <span style={{ color: '#334155', fontSize: 10 }}>
                {n.matchedScenarios.length}sc {n.matchedDatasets.length}ds
              </span>
            </div>
            {expanded === n.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '8px 0 8px 8px', borderBottom: '1px solid #1e293b' }}>
                <div>
                  <div style={{ color: '#8b5cf6', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SCENARIOS ({n.matchedScenarios.length})</div>
                  {n.matchedScenarios.slice(0, 8).map(s => (
                    <div key={s.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#cbd5e1', fontSize: 11 }}>{s.label}</span>
                        {s.status && <span style={{ background: '#1e1b4b', color: '#8b5cf6', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>{s.status}</span>}
                        {s.risk && <span style={{ color: '#64748b', fontSize: 9 }}>{s.risk}</span>}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(s.score * 100)}%`, background: '#8b5cf6' }} />
                      </div>
                    </div>
                  ))}
                  {n.matchedScenarios.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no scenarios matched</div>}
                </div>
                <div>
                  <div style={{ color: '#38bdf8', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>DATASETS ({n.matchedDatasets.length})</div>
                  {n.matchedDatasets.slice(0, 8).map(d => (
                    <div key={d.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#cbd5e1', fontSize: 11 }}>{d.label}</span>
                        {d.kind && <span style={{ background: '#0c4a6e', color: '#38bdf8', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>{d.kind}</span>}
                        {d.rows != null && <span style={{ color: '#475569', fontSize: 9 }}>{d.rows} rows</span>}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(d.score * 100)}%`, background: '#38bdf8' }} />
                      </div>
                    </div>
                  ))}
                  {n.matchedDatasets.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no datasets matched</div>}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ padding: '20px 0', color: '#475569', textAlign: 'center' }}>no nodes match current filter</div>
        )}
      </div>

      {/* ASSESS footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assessment}</div>}
        <button onClick={assess} disabled={assessing || classified.length === 0} style={{
          background: assessing ? '#1e293b' : '#14532d', border: '1px solid #22c55e44',
          color: '#22c55e', borderRadius: 5, padding: '4px 14px', cursor: assessing ? 'default' : 'pointer', fontSize: 11,
        }}>
          {assessing ? '◌ assessing…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
