import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCDSSC_RE = /\b(gcdssc|graph\s+centrality\s+dataset\s+scenario|centrality\s+dataset\s+scenario|node\s+dataset\s+scenario|unplanned\s+centrality|graph\s+node\s+dataset|node\s+scenario\s+dataset|centrality\s+dataset\s+plan|high\s+influence\s+dataset|graph\s+dataset\s+scenario|centrality\s+unplanned|graph\s+centrality\s+scenario|centrality\s+node\s+scenario)\b/i;
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

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.nodes || raw.centrality || raw.items || raw.data || []);
  return arr.map((n, i) => ({
    id: n.id || n.node_id || `node-${i}`,
    label: n.label || n.name || n.title || `Node ${i + 1}`,
    type: n.type || n.kind || n.category || '',
    score: n.score || n.centrality_score || n.influence || 0,
    description: n.description || n.summary || '',
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
    _searchText: [n.label, n.name, n.title, n.type, n.kind, n.category, n.description, n.summary, n.tags].filter(Boolean).join(' '),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.datasets || raw.items || raw.data || []);
  return arr.map((d, i) => ({
    id: d.id || d.dataset_id || `ds-${i}`,
    label: d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.format || '',
    description: d.description || d.summary || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
    _searchText: [d.name, d.title, d.label, d.kind, d.type, d.format, d.description, d.summary, d.source, d.tags].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.scenarios || raw.items || raw.data || []);
  return arr.map((s, i) => ({
    id: s.id || s.scenario_id || `scn-${i}`,
    label: s.name || s.title || s.label || `Scenario ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    status: s.status || s.state || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
    _searchText: [s.name, s.title, s.label, s.category, s.type, s.kind, s.description, s.summary, s.tags].filter(Boolean).join(' '),
  }));
}

function correlate(nodes, datasets, scenarios) {
  return nodes.map(node => {
    const nToks = tok(node._searchText);
    const matchedDatasets = datasets
      .map(d => ({ ...d, score: matchScore(nToks, d._searchText) }))
      .filter(d => d.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedScenarios = scenarios
      .map(s => ({ ...s, score: matchScore(nToks, s._searchText) }))
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasDs = matchedDatasets.length > 0;
    const hasScn = matchedScenarios.length > 0;
    let coverage;
    if (hasDs && hasScn) coverage = 'FULLY_PLANNED';
    else if (hasDs) coverage = 'DATA_BACKED';
    else if (hasScn) coverage = 'SCENARIO_LINKED';
    else coverage = 'UNPLANNED';
    return { ...node, matchedDatasets, matchedScenarios, coverage };
  });
}

export function isGcdsscQuery(t) {
  return GCDSSC_RE.test(t || '');
}

export async function buildGcdsscScript() {
  try {
    const [nodeR, dsR, scnR] = await Promise.all([
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);
    const rows = correlate(normaliseNodes(nodeR), normaliseDatasets(dsR), normaliseScenarios(scnR));
    const planned = rows.filter(r => r.coverage === 'FULLY_PLANNED').length;
    const unplanned = rows.filter(r => r.coverage === 'UNPLANNED').length;
    return `GCDSSC coverage: ${rows.length} high-influence graph nodes assessed — ${planned} fully planned (both dataset and scenario coverage), ${unplanned} unplanned (no dataset or scenario backing). ${unplanned > 0 ? `${unplanned} node${unplanned > 1 ? 's have' : ' has'} no empirical data or response planning — strategic intelligence gaps requiring immediate remediation.` : 'All high-influence nodes have dataset or scenario coverage — network strategy is grounded.'}`;
  } catch {
    return 'GCDSSC: graph centrality dataset scenario coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY PLANNED', 'DATA BACKED', 'SCENARIO LINKED', 'UNPLANNED'];
const TAB_KEY = {
  'ALL': null,
  'FULLY PLANNED': 'FULLY_PLANNED',
  'DATA BACKED': 'DATA_BACKED',
  'SCENARIO LINKED': 'SCENARIO_LINKED',
  'UNPLANNED': 'UNPLANNED',
};

const COVER_COLOR = {
  FULLY_PLANNED: '#22c55e',
  DATA_BACKED: '#34d399',
  SCENARIO_LINKED: '#8b5cf6',
  UNPLANNED: '#64748b',
};

const LABEL_MAP = {
  FULLY_PLANNED: 'FULLY PLANNED',
  DATA_BACKED: 'DATA BACKED',
  SCENARIO_LINKED: 'SCENARIO LINKED',
  UNPLANNED: 'UNPLANNED',
};

export default function GraphCentralityDatasetScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, datasets: 0, scenarios: 0, planned: 0, dataBacked: 0, scenarioLinked: 0, unplanned: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nodeR, dsR, scnR] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(`centrality ${r.status}`)),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : Promise.reject(`datasets ${r.status}`)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(`scenarios ${r.status}`)),
      ]);
      const nodes = normaliseNodes(nodeR);
      const datasets = normaliseDatasets(dsR);
      const scenarios = normaliseScenarios(scnR);
      const correlated = correlate(nodes, datasets, scenarios);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        datasets: datasets.length,
        scenarios: scenarios.length,
        planned: correlated.filter(r => r.coverage === 'FULLY_PLANNED').length,
        dataBacked: correlated.filter(r => r.coverage === 'DATA_BACKED').length,
        scenarioLinked: correlated.filter(r => r.coverage === 'SCENARIO_LINKED').length,
        unplanned: correlated.filter(r => r.coverage === 'UNPLANNED').length,
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
    window.addEventListener('jarvis:gcdssc-toggle', handler);
    return () => window.removeEventListener('jarvis:gcdssc-toggle', handler);
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
      return r.label.toLowerCase().includes(s) || r.type.toLowerCase().includes(s) || r.description.toLowerCase().includes(s);
    }
    return true;
  });

  const total = counts.total || 1;
  const barPlanned = (counts.planned / total * 100).toFixed(1);
  const barData = (counts.dataBacked / total * 100).toFixed(1);
  const barScen = (counts.scenarioLinked / total * 100).toFixed(1);
  const barUnplan = (counts.unplanned / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse high-influence graph node "${row.label}" (type: ${row.type || 'unknown'}) for dataset and scenario coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched datasets: ${row.matchedDatasets.map(d => d.label).join(', ') || 'none'}. Matched scenarios: ${row.matchedScenarios.map(s => s.label).join(', ') || 'none'}. ${row.coverage === 'UNPLANNED' ? 'This high-influence node has no empirical dataset or scenario plan — identify the strategic gap and recommend immediate remediation.' : 'Assess the quality of the coverage and any remaining gaps.'} Respond in exactly 2 sentences.`;
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
          position: 'fixed', left: 822400, bottom: 8, zIndex: 497,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Graph Centrality × Dataset × Scenario Triple Coverage (GCDSSC)"
      >
        ◈ GCDSSC
        {counts.unplanned > 0 && (
          <span style={{
            background: '#64748b', color: '#f8fafc', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.unplanned}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 497,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ GCDSSC</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Graph Centrality × Dataset × Scenario Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'NODES', val: counts.total, color: '#94a3b8' },
          { label: 'DATASETS', val: counts.datasets, color: '#34d399' },
          { label: 'SCENARIOS', val: counts.scenarios, color: '#8b5cf6' },
          { label: 'FULLY PLANNED', val: counts.planned, color: '#22c55e' },
          { label: 'DATA BACKED', val: counts.dataBacked, color: '#34d399' },
          { label: 'SCENARIO LINKED', val: counts.scenarioLinked, color: '#8b5cf6' },
          { label: 'UNPLANNED', val: counts.unplanned, color: '#64748b' },
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
        <div style={{ width: `${barPlanned}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${barData}%`, background: '#34d399', transition: 'width 0.4s' }} />
        <div style={{ width: `${barScen}%`, background: '#8b5cf6', transition: 'width 0.4s' }} />
        <div style={{ width: `${barUnplan}%`, background: '#64748b', transition: 'width 0.4s' }} />
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
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22c55e' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22c55e' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search nodes…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No nodes match current filter.</div>
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
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 130 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              {row.type && (
                <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(71,85,105,0.3)', borderRadius: 3, padding: '1px 5px' }}>{row.type.slice(0, 18)}</span>
              )}
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedDatasets.length}ds {row.matchedScenarios.length}scn
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8, fontStyle: 'italic' }}>{row.description.slice(0, 200)}{row.description.length > 200 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Datasets */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#34d399', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>DATASETS ({row.matchedDatasets.length})</div>
                    {row.matchedDatasets.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched datasets.</div>
                      : row.matchedDatasets.slice(0, 5).map(d => (
                        <div key={d.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(d.score * 400, 100)}%`, height: '100%', background: '#34d399' }} />
                            </div>
                            {d.kind && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(52,211,153,0.1)', borderRadius: 3, padding: '1px 4px' }}>{d.kind.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{d.label}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#8b5cf6', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SCENARIOS ({row.matchedScenarios.length})</div>
                    {row.matchedScenarios.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched scenarios.</div>
                      : row.matchedScenarios.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(s.score * 400, 100)}%`, height: '100%', background: '#8b5cf6' }} />
                            </div>
                            {s.category && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(139,92,246,0.1)', borderRadius: 3, padding: '1px 4px' }}>{s.category.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{s.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e44',
                    borderRadius: 4, color: '#22c55e', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
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
