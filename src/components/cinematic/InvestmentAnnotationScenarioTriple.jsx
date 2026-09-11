import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IGANSC_RE = /\b(igansc|invest(?:ment)?\s+annot\w*\s+scenario|invest(?:ment)?\s+graph\s+scenario|invest(?:ment)?\s+scenario\s+annot\w*|portfolio\s+graph\s+scenario|unplanned\s+invest(?:ment)?|invest(?:ment)?\s+annot\w*\s+plan|invest(?:ment)?\s+graph\s+plan|invest(?:ment)?\s+scenario\s+graph|portfolio\s+annotation\s+scenario|invest(?:ment)?\s+plan\s+annot\w*|graph\s+scenario\s+invest(?:ment)?|annotation\s+scenario\s+invest(?:ment)?|scenario\s+annot\w*\s+invest(?:ment)?|portfolio\s+unplanned|invest(?:ment)?\s+coverage\s+scenario)\b/i;

export function isIganscQuery(t) {
  return IGANSC_RE.test(t || '');
}

export async function buildIganscScript() {
  try {
    const [ivRes, anRes, scRes] = await Promise.all([
      fetch(`${API}/entities/Investment`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
    ]);
    const inv = normaliseInvestments(ivRes);
    const ann = normaliseAnnotations(anRes);
    const sc = normaliseScenarios(scRes);
    const classified = inv.map(i => classifyInvestment(i, ann, sc));
    const fullyPlanned = classified.filter(i => i.state === 'FULLY_PLANNED').length;
    const unplanned = classified.filter(i => i.state === 'UNPLANNED').length;
    return `IGANSC analysis: ${inv.length} investments cross-referenced against ${ann.length} graph annotations and ${sc.length} scenario plans. ${fullyPlanned} investments are FULLY PLANNED with both graph intelligence context and scenario response coverage. ${unplanned} investments are UNPLANNED — no annotation or scenario coverage — representing critical strategic blind spots requiring immediate intelligence gathering and response planning.`;
  } catch {
    return 'IGANSC data unavailable — check /entities/Investment, /v1/graph/annotations, and /v1/scenario/list endpoints.';
  }
}

const THRESHOLD = 0.07;

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

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.investments) ? raw.investments
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((iv, i) => ({
    id: iv.id || iv._id || `iv-${i}`,
    label: iv.name || iv.title || iv.investment_name || `Investment ${i + 1}`,
    ticker: iv.ticker || iv.symbol || '',
    sector: iv.sector || iv.category || iv.type || '',
    notes: iv.notes || iv.summary || iv.description || '',
    tags: Array.isArray(iv.tags) ? iv.tags.join(' ') : String(iv.tags || ''),
    _searchText: [iv.name, iv.title, iv.ticker, iv.symbol, iv.sector, iv.category, iv.type, iv.notes, iv.description, iv.summary, iv.tags].filter(Boolean).join(' '),
  }));
}

function normaliseAnnotations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.annotations) ? raw.annotations
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((a, i) => ({
    id: a.id || a._id || `an-${i}`,
    label: a.label || a.text || a.name || a.title || `Annotation ${i + 1}`,
    targetType: a.target_type || a.targetType || a.type || '',
    actor: a.actor || a.author || '',
    category: a.category || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    _searchText: [a.label, a.text, a.name, a.title, a.target_type, a.actor, a.category, a.description, a.tags].filter(Boolean).join(' '),
  }));
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
    id: s.id || s._id || `sc-${i}`,
    label: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    status: s.status || s.state || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.title, s.category, s.type, s.kind, s.status, s.description, s.summary, s.tags].filter(Boolean).join(' '),
  }));
}

function classifyInvestment(iv, annotations, scenarios) {
  const toks = tok(iv._searchText);
  const annMatches = annotations
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), iv._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const scMatches = scenarios
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._searchText), matchScore(tok(s._searchText), iv._searchText)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasAnn = annMatches.length > 0;
  const hasSc = scMatches.length > 0;
  let state;
  if (hasAnn && hasSc) state = 'FULLY_PLANNED';
  else if (hasAnn) state = 'GRAPH_MAPPED';
  else if (hasSc) state = 'SCENARIO_LINKED';
  else state = 'UNPLANNED';
  return { ...iv, state, annMatches, scMatches };
}

const STATE_LABELS = {
  FULLY_PLANNED: 'FULLY PLANNED',
  GRAPH_MAPPED: 'GRAPH-MAPPED',
  SCENARIO_LINKED: 'SCENARIO-LINKED',
  UNPLANNED: 'UNPLANNED',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function InvestmentAnnotationScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [ivRes, anRes, scRes] = await Promise.all([
        fetch(`${API}/entities/Investment`, { headers }),
        fetch(`${API}/v1/graph/annotations`, { headers }),
        fetch(`${API}/v1/scenario/list`, { headers }),
      ]);
      const [ivJson, anJson, scJson] = await Promise.all([ivRes.json(), anRes.json(), scRes.json()]);
      const inv = normaliseInvestments(ivJson);
      const ann = normaliseAnnotations(anJson);
      const sc = normaliseScenarios(scJson);
      setInvestments(inv);
      setAnnotations(ann);
      setScenarios(sc);
      setClassified(inv.map(i => classifyInvestment(i, ann, sc)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:igansc-toggle', handler);
    return () => window.removeEventListener('jarvis:igansc-toggle', handler);
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
      if (IGANSC_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_PLANNED: classified.filter(i => i.state === 'FULLY_PLANNED').length,
    GRAPH_MAPPED: classified.filter(i => i.state === 'GRAPH_MAPPED').length,
    SCENARIO_LINKED: classified.filter(i => i.state === 'SCENARIO_LINKED').length,
    UNPLANNED: classified.filter(i => i.state === 'UNPLANNED').length,
  };

  const visible = classified.filter(iv => {
    if (filter !== 'ALL' && iv.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return iv._searchText.toLowerCase().includes(q) || iv.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `IGANSC Investment × Graph Annotation × Scenario Triple Coverage summary: ${investments.length} investments, ${annotations.length} graph annotations, ${scenarios.length} scenario plans. Coverage: FULLY PLANNED=${counts.FULLY_PLANNED}, GRAPH-MAPPED=${counts.GRAPH_MAPPED}, SCENARIO-LINKED=${counts.SCENARIO_LINKED}, UNPLANNED=${counts.UNPLANNED}. In 2 sentences, assess investment strategic planning coverage and identify the most critical unplanned gaps requiring immediate intelligence and scenario response attention.`;
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

  const plannedPct = classified.length ? Math.round((counts.FULLY_PLANNED / classified.length) * 100) : 0;
  const graphPct = classified.length ? Math.round((counts.GRAPH_MAPPED / classified.length) * 100) : 0;
  const scenPct = classified.length ? Math.round((counts.SCENARIO_LINKED / classified.length) * 100) : 0;
  const unplannedPct = classified.length ? Math.round((counts.UNPLANNED / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 831360, bottom: 8, zIndex: 513,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #365314',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(54,83,20,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#84cc16', fontWeight: 700, fontSize: 13 }}>◈ IGANSC</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Investment × Graph Annotation × Scenario Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#84cc16', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'INVESTMENTS', val: investments.length, color: '#84cc16' },
          { label: 'ANNOTATIONS', val: annotations.length, color: '#38bdf8' },
          { label: 'SCENARIOS', val: scenarios.length, color: '#a78bfa' },
          { label: 'FULLY PLANNED', val: counts.FULLY_PLANNED, color: '#84cc16' },
          { label: 'GRAPH-MAPPED', val: counts.GRAPH_MAPPED, color: '#38bdf8' },
          { label: 'SCEN-LINKED', val: counts.SCENARIO_LINKED, color: '#a78bfa' },
          { label: 'UNPLANNED', val: counts.UNPLANNED, color: '#6b7280', badge: counts.UNPLANNED > 0 },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid #6b7280' : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 16 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#84cc16' }}>{plannedPct}% fully planned</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {plannedPct > 0 && <div style={{ width: `${plannedPct}%`, background: '#84cc16' }} />}
          {graphPct > 0 && <div style={{ width: `${graphPct}%`, background: '#38bdf8' }} />}
          {scenPct > 0 && <div style={{ width: `${scenPct}%`, background: '#a78bfa' }} />}
          {unplannedPct > 0 && <div style={{ width: `${unplannedPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#84cc16' }}>● FULLY PLANNED</span>
          <span style={{ color: '#38bdf8' }}>● GRAPH-MAPPED</span>
          <span style={{ color: '#a78bfa' }}>● SCENARIO-LINKED</span>
          <span style={{ color: '#374151' }}>● UNPLANNED</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_PLANNED', 'GRAPH_MAPPED', 'SCENARIO_LINKED', 'UNPLANNED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1a2e05' : '#0f172a',
            border: `1px solid ${filter === f ? '#84cc16' : '#1e293b'}`,
            color: filter === f ? '#bef264' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No investments match current filter.</div>
        )}
        {visible.map(iv => {
          const stateColor = iv.state === 'FULLY_PLANNED' ? '#84cc16' : iv.state === 'GRAPH_MAPPED' ? '#38bdf8' : iv.state === 'SCENARIO_LINKED' ? '#a78bfa' : '#6b7280';
          const isExp = expanded === iv.id;
          return (
            <div key={iv.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#365314' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : iv.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 130 }}>{STATE_LABELS[iv.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{iv.label}</span>
                {iv.ticker && <span style={{ background: '#1a2e05', color: '#84cc16', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{iv.ticker}</span>}
                {iv.sector && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{iv.sector}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {iv.notes && <div style={{ color: '#64748b', fontSize: 11, margin: '6px 0' }}>{iv.notes.slice(0, 200)}{iv.notes.length > 200 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Graph Annotations pane */}
                    <div>
                      <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH ANNOTATIONS ({iv.annMatches.length})</div>
                      {iv.annMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No annotation coverage</div>
                        : iv.annMatches.slice(0, 6).map(a => (
                          <div key={a.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#7dd3fc', fontSize: 11 }}>{a.label}</span>
                              {a.targetType && <span style={{ background: '#0c4a6e', color: '#38bdf8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{a.targetType}</span>}
                            </div>
                            <ScoreBar score={a.score} color="#38bdf8" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Scenarios pane */}
                    <div>
                      <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>SCENARIOS ({iv.scMatches.length})</div>
                      {iv.scMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No scenario coverage</div>
                        : iv.scMatches.slice(0, 6).map(s => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#c4b5fd', fontSize: 11 }}>{s.label}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {s.category && <span style={{ background: '#2e1065', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{s.category}</span>}
                                {s.status && <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{s.status}</span>}
                              </div>
                            </div>
                            <ScoreBar score={s.score} color="#a78bfa" />
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
            background: assessing ? '#1e293b' : '#1a2e05', border: '1px solid #84cc16',
            color: assessing ? '#475569' : '#bef264', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
