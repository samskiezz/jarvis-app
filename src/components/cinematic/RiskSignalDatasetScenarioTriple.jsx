import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSDSCN_RE = /\b(rsdscn|risk\s+dataset\s+scenario|risk\s+signal\s+dataset(?:\s+scenario)?|dataset\s+risk(?:\s+scenario)?|scenario\s+risk(?:\s+dataset)?|risk\s+data\s+scenario|unresolved\s+risk(?:\s+signal)?|risk\s+signal\s+scenario\s+data|risk\s+coverage\s+gap|risk\s+signal\s+data\s+gap)\b/i;
const THRESHOLD = 0.07;

export function isRsdscnQuery(t) {
  return RSDSCN_RE.test(t || '');
}

export async function buildRsdscnScript() {
  try {
    const [riskRes, dsRes, scRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normaliseSignals(riskRes);
    const datasets = normaliseDatasets(dsRes);
    const scenarios = normaliseScenarios(scRes);
    const classified = signals.map(s => classifySignal(s, datasets, scenarios));
    const fullyMapped = classified.filter(s => s.state === 'FULLY_MAPPED').length;
    const unresolved = classified.filter(s => s.state === 'UNRESOLVED').length;
    return `RSDSCN analysis: ${signals.length} risk signals cross-referenced against ${datasets.length} datasets and ${scenarios.length} active scenarios. ${fullyMapped} signals are FULLY MAPPED — both dataset intelligence backing and scenario response coverage confirmed. ${unresolved} signals are UNRESOLVED — no dataset or scenario coverage detected, representing critical intelligence and response planning gaps requiring immediate attention.`;
  } catch {
    return 'RSDSCN data unavailable — check /entities/RiskSignal, /v1/datasets, and /v1/scenario/list endpoints.';
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

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `sig-${i}`,
    label: s.name || s.title || s.signal_name || `RiskSignal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || s.sector || '',
    source: s.source || s.origin || '',
    _searchText: [s.name, s.title, s.category, s.sector, s.description, s.source, s.tags].filter(Boolean).join(' '),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    label: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind: d.kind || d.type || d.category || '',
    rows: d.row_count || d.rows || d.count || null,
    _text: [d.name, d.title, d.description, d.kind, d.type, d.category, d.tags].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((sc, i) => ({
    id: sc.id || sc._id || `sc-${i}`,
    label: sc.name || sc.title || sc.scenario_name || `Scenario ${i + 1}`,
    status: sc.status || sc.state || '',
    category: sc.category || sc.type || sc.kind || '',
    _text: [sc.name, sc.title, sc.description, sc.category, sc.type, sc.tags].filter(Boolean).join(' '),
  }));
}

function classifySignal(signal, datasets, scenarios) {
  const toks = tok(signal._searchText);
  const dsMatches = datasets
    .map(d => ({ ...d, score: matchScore(toks, d._text) }))
    .filter(d => d.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const scMatches = scenarios
    .map(sc => ({ ...sc, score: matchScore(toks, sc._text) }))
    .filter(sc => sc.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasDs = dsMatches.length > 0;
  const hasSc = scMatches.length > 0;
  const state = hasDs && hasSc ? 'FULLY_MAPPED'
    : hasDs ? 'DATA_BACKED'
    : hasSc ? 'SCENARIO_COVERED'
    : 'UNRESOLVED';
  return { ...signal, state, dsMatches, scMatches };
}

const STATE_LABELS = {
  ALL: 'ALL',
  FULLY_MAPPED: '◉ FULLY MAPPED',
  DATA_BACKED: '◎ DATA-BACKED',
  SCENARIO_COVERED: '◈ SCENARIO-COVERED',
  UNRESOLVED: '○ UNRESOLVED',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: '#1e293b', marginTop: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
  );
}

const SEV_COLOR = { CRITICAL: '#f87171', HIGH: '#fb923c', MEDIUM: '#fbbf24', LOW: '#4ade80' };

export default function RiskSignalDatasetScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [riskRes, dsRes, scRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      ]);
      const s = normaliseSignals(riskRes);
      const d = normaliseDatasets(dsRes);
      const sc = normaliseScenarios(scRes);
      setSignals(s); setDatasets(d); setScenarios(sc);
      setClassified(s.map(sig => classifySignal(sig, d, sc)));
    } catch (err) {
      setError('Fetch failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) fetchAll();
        return !o;
      });
    };
    window.addEventListener('jarvis:rsdscn-toggle', toggle);
    return () => window.removeEventListener('jarvis:rsdscn-toggle', toggle);
  }, [fetchAll]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  const counts = {
    FULLY_MAPPED: classified.filter(s => s.state === 'FULLY_MAPPED').length,
    DATA_BACKED: classified.filter(s => s.state === 'DATA_BACKED').length,
    SCENARIO_COVERED: classified.filter(s => s.state === 'SCENARIO_COVERED').length,
    UNRESOLVED: classified.filter(s => s.state === 'UNRESOLVED').length,
  };

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s._searchText.toLowerCase().includes(q) || s.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `RSDSCN RiskSignal × Dataset × Scenario Triple Coverage: ${signals.length} risk signals cross-referenced against ${datasets.length} datasets and ${scenarios.length} active scenarios. Coverage: FULLY_MAPPED=${counts.FULLY_MAPPED}, DATA_BACKED=${counts.DATA_BACKED}, SCENARIO_COVERED=${counts.SCENARIO_COVERED}, UNRESOLVED=${counts.UNRESOLVED}. In 2 sentences, assess risk signal data-scenario coverage posture, identifying the most critical unresolved signals that lack both dataset intelligence backing and scenario response planning.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const fullyPct = classified.length ? Math.round((counts.FULLY_MAPPED / classified.length) * 100) : 0;
  const dataPct = classified.length ? Math.round((counts.DATA_BACKED / classified.length) * 100) : 0;
  const scenPct = classified.length ? Math.round((counts.SCENARIO_COVERED / classified.length) * 100) : 0;
  const unresPct = classified.length ? Math.round((counts.UNRESOLVED / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 849840, bottom: 8, zIndex: 546,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #92400e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(146,64,14,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13 }}>◈ RSDSCN</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>RiskSignal × Dataset × Scenario Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#f59e0b', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'RISK SIGNALS', val: signals.length, color: '#e2e8f0' },
          { label: 'DATASETS', val: datasets.length, color: '#60a5fa' },
          { label: 'SCENARIOS', val: scenarios.length, color: '#c084fc' },
          { label: 'FULLY MAPPED', val: counts.FULLY_MAPPED, color: '#4ade80', badge: counts.FULLY_MAPPED > 0 },
          { label: 'DATA-BACKED', val: counts.DATA_BACKED, color: '#60a5fa' },
          { label: 'SCENARIO-COVERED', val: counts.SCENARIO_COVERED, color: '#c084fc' },
          { label: 'UNRESOLVED', val: counts.UNRESOLVED, color: '#fbbf24', badge: counts.UNRESOLVED > 0 },
          { label: 'RESOLVED %', val: `${fullyPct}%`, color: '#4ade80' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#4ade80' }}>{fullyPct}% fully mapped</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {fullyPct > 0 && <div style={{ width: `${fullyPct}%`, background: '#4ade80' }} />}
          {dataPct > 0 && <div style={{ width: `${dataPct}%`, background: '#60a5fa' }} />}
          {scenPct > 0 && <div style={{ width: `${scenPct}%`, background: '#c084fc' }} />}
          {unresPct > 0 && <div style={{ width: `${unresPct}%`, background: '#92400e' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#4ade80' }}>● FULLY MAPPED</span>
          <span style={{ color: '#60a5fa' }}>● DATA-BACKED</span>
          <span style={{ color: '#c084fc' }}>● SCENARIO-COVERED</span>
          <span style={{ color: '#92400e' }}>● UNRESOLVED</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_MAPPED', 'DATA_BACKED', 'SCENARIO_COVERED', 'UNRESOLVED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#451a03' : '#0f172a',
            border: `1px solid ${filter === f ? '#f59e0b' : '#1e293b'}`,
            color: filter === f ? '#fde68a' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No risk signals match current filter.</div>
        )}
        {visible.map(s => {
          const stateColor = s.state === 'FULLY_MAPPED' ? '#4ade80'
            : s.state === 'DATA_BACKED' ? '#60a5fa'
            : s.state === 'SCENARIO_COVERED' ? '#c084fc'
            : '#fbbf24';
          const isExp = expanded === s.id;
          const sevColor = SEV_COLOR[String(s.severity).toUpperCase()] || '#94a3b8';
          return (
            <div key={s.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#92400e' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 200 }}>{STATE_LABELS[s.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{s.label}</span>
                {s.severity && (
                  <span style={{ background: '#0f172a', color: sevColor, border: `1px solid ${sevColor}44`, borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>
                    {s.severity}
                  </span>
                )}
                {s.category && (
                  <span style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>
                    {s.category}
                  </span>
                )}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {s.source && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>Source: {s.source}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Datasets pane */}
                    <div>
                      <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>DATASETS ({s.dsMatches.length})</div>
                      {s.dsMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No dataset coverage</div>
                        : s.dsMatches.slice(0, 6).map(d => (
                          <div key={d.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#93c5fd', fontSize: 11 }}>{d.label.slice(0, 42)}{d.label.length > 42 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {d.rows != null && <span style={{ color: '#475569', fontSize: 9 }}>{d.rows.toLocaleString()}r</span>}
                                {d.kind && <span style={{ background: '#1e3a5f', color: '#60a5fa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{d.kind}</span>}
                              </div>
                            </div>
                            <ScoreBar score={d.score} color="#60a5fa" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Scenarios pane */}
                    <div>
                      <div style={{ color: '#c084fc', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>SCENARIOS ({s.scMatches.length})</div>
                      {s.scMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No scenario coverage</div>
                        : s.scMatches.slice(0, 6).map(sc => (
                          <div key={sc.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#d8b4fe', fontSize: 11 }}>{sc.label.slice(0, 42)}{sc.label.length > 42 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {sc.status && <span style={{ background: '#2e1065', color: '#c084fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{sc.status}</span>}
                                {sc.category && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{sc.category}</span>}
                              </div>
                            </div>
                            <ScoreBar score={sc.score} color="#c084fc" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#451a03', border: '1px solid #f59e0b',
            color: assessing ? '#475569' : '#fde68a', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
