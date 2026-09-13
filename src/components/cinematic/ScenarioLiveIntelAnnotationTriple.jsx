import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCLIANN_RE = /\b(scliann|scenario\s+live\s+annotation|scenario\s+world\s+annotation|scenario\s+annotation\s+live|primed\s+scenario|scenario\s+graph\s+annotation\s+live|scenario\s+live\s+intel\s+annotation|scenario\s+annotation\s+world|dormant\s+scenario\s+live|scenario\s+live\s+world\s+annotation)\b/i;

export function isScliannQuery(t) {
  return SCLIANN_RE.test(t || '');
}

export async function buildScliannScript() {
  try {
    const [scenRes, liRes, anRes] = await Promise.all([
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const scenarios = normaliseScenarios(scenRes);
    const live = normaliseLiveIntel(liRes);
    const anns = normaliseAnnotations(anRes);
    const classified = scenarios.map(s => classifyScenario(s, live, anns));
    const fullyPrimed = classified.filter(s => s.state === 'FULLY_PRIMED').length;
    const worldTriggered = classified.filter(s => s.state === 'WORLD_TRIGGERED').length;
    const graphAnnotated = classified.filter(s => s.state === 'GRAPH_ANNOTATED').length;
    const dormant = classified.filter(s => s.state === 'DORMANT').length;
    return `SCLIANN scenario-live-annotation coverage: ${scenarios.length} scenarios — ${fullyPrimed} fully primed (live intel+annotation), ${worldTriggered} world-triggered only, ${graphAnnotated} graph-annotated only, ${dormant} dormant (neither). ${dormant > 0 ? `${dormant} scenarios have no live world event or graph annotation linkage.` : 'All scenarios have at least one active linkage.'}`;
  } catch {
    return 'SCLIANN data unavailable — check /v1/scenario/list, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
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

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.scenarios || raw?.items || raw?.data || raw?.results || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || s.uid || `scen-${i}`,
    name: s.name || s.title || s.label || `Scenario ${i + 1}`,
    description: s.description || s.summary || s.objective || s.notes || '',
    category: s.category || s.type || s.kind || '',
    status: s.status || s.state || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const quakes = (raw.earthquakes || raw.quakes || []).map(e => ({
    id: e.id || e.place || `q-${e.place || Math.random()}`,
    title: e.place || e.location || e.title || 'Seismic Event',
    type: 'SEISMIC',
    detail: e.mag != null ? `M${e.mag}` : '',
  }));
  const crypto = (raw.crypto || raw.markets || []).map(c => ({
    id: c.symbol || c.id || `cr-${c.symbol || Math.random()}`,
    title: c.symbol || c.name || 'Crypto Asset',
    type: 'CRYPTO',
    detail: c.price ? `$${Number(c.price).toLocaleString()}` : '',
  }));
  const fx = (raw.fx || raw.forex || []).map(f => ({
    id: f.symbol || f.pair || `fx-${f.symbol || Math.random()}`,
    title: f.symbol || f.pair || 'FX Pair',
    type: 'FX',
    detail: f.rate ? String(f.rate) : '',
  }));
  const combined = [...quakes, ...crypto, ...fx];
  if (combined.length) return combined;
  const fallback = Array.isArray(raw) ? raw : (raw?.results || raw?.events || raw?.items || raw?.data || []);
  return fallback.map((e, i) => ({
    id: e.id || `li-${i}`,
    title: e.title || e.name || e.type || `Event ${i + 1}`,
    type: e.type || e.kind || '',
    detail: e.detail || '',
  }));
}

function normaliseAnnotations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.annotations || raw?.items || raw?.data || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann-${i}`,
    label: a.label || a.title || a.name || a.text || '',
    targetType: a.target_type || a.targetType || a.entity_type || '',
    entity: a.entity || a.entity_id || a.target || '',
    notes: a.notes || a.description || a.body || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function classifyScenario(scenario, liveEvents, annotations) {
  const sToks = tok([scenario.name, scenario.description, scenario.category, scenario.status, scenario.tags].join(' '));

  const matchedLive = liveEvents.filter(e => {
    const score = matchScore(sToks, [e.title, e.type, e.detail].join(' '));
    return score >= THRESHOLD;
  });

  const matchedAnns = annotations.filter(a => {
    const score = matchScore(sToks, [a.label, a.entity, a.notes, a.tags].join(' '));
    return score >= THRESHOLD;
  });

  let state;
  if (matchedLive.length > 0 && matchedAnns.length > 0) state = 'FULLY_PRIMED';
  else if (matchedLive.length > 0) state = 'WORLD_TRIGGERED';
  else if (matchedAnns.length > 0) state = 'GRAPH_ANNOTATED';
  else state = 'DORMANT';

  return { ...scenario, state, matchedLive, matchedAnns };
}

const STATE_META = {
  FULLY_PRIMED:    { label: 'FULLY PRIMED',    color: '#4ade80', bg: 'rgba(74,222,128,0.13)'  },
  WORLD_TRIGGERED: { label: 'WORLD TRIGGERED',  color: '#fb923c', bg: 'rgba(251,146,60,0.13)'  },
  GRAPH_ANNOTATED: { label: 'GRAPH ANNOTATED',  color: '#a78bfa', bg: 'rgba(167,139,250,0.13)' },
  DORMANT:         { label: 'DORMANT',           color: '#6b7280', bg: 'rgba(107,114,128,0.13)' },
};

const FILTERS = ['ALL', 'FULLY_PRIMED', 'WORLD_TRIGGERED', 'GRAPH_ANNOTATED', 'DORMANT'];

export default function ScenarioLiveIntelAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [annotations, setAnnotations] = useState([]);
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
      const [scenRes, liRes, anRes] = await Promise.all([
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      ]);
      const sNorm = normaliseScenarios(scenRes);
      const liNorm = normaliseLiveIntel(liRes);
      const anNorm = normaliseAnnotations(anRes);
      setScenarios(sNorm);
      setLiveEvents(liNorm);
      setAnnotations(anNorm);
      setClassified(sNorm.map(s => classifyScenario(s, liNorm, anNorm)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:scliann-toggle', onToggle);
    return () => window.removeEventListener('jarvis:scliann-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const onVoice = e => {
      if (SCLIANN_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => window.removeEventListener('jarvis:voice-query', onVoice);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const dormant = classified.filter(s => s.state === 'DORMANT').map(s => s.name).slice(0, 5).join(', ');
      const primed = classified.filter(s => s.state === 'FULLY_PRIMED').map(s => s.name).slice(0, 3).join(', ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Assess SCLIANN scenario live-world-annotation coverage. ${scenarios.length} scenarios. Fully primed (live intel+annotation): ${primed || 'none'}. Dormant (no live or annotation linkage): ${dormant || 'none'}. In 2 sentences, identify the largest scenario readiness gap and recommend the highest-priority intelligence action.`,
        }),
      });
      const data = r.ok ? await r.json() : null;
      const text = data?.response || data?.message || data?.answer || 'Assessment unavailable.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setAssessment('Assessment failed — check /v1/jarvis/agent/chat.');
    } finally {
      setAssessing(false);
    }
  }, [classified, scenarios.length]);

  if (!open) return null;

  const counts = {
    FULLY_PRIMED:    classified.filter(s => s.state === 'FULLY_PRIMED').length,
    WORLD_TRIGGERED: classified.filter(s => s.state === 'WORLD_TRIGGERED').length,
    GRAPH_ANNOTATED: classified.filter(s => s.state === 'GRAPH_ANNOTATED').length,
    DORMANT:         classified.filter(s => s.state === 'DORMANT').length,
  };
  const total = classified.length || 1;

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 834720, bottom: 8, zIndex: 519,
      width: 520, maxHeight: '88vh',
      background: 'rgba(8,12,20,0.97)',
      border: '1px solid rgba(74,222,128,0.25)',
      borderRadius: 10,
      boxShadow: '0 0 32px rgba(74,222,128,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(74,222,128,0.15)',
        background: 'rgba(74,222,128,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#4ade80', fontWeight: 700, letterSpacing: 1 }}>◈ SCLIANN</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>SCENARIO × LIVE INTEL × ANNOTATION</span>
          {loading && <span style={{ color: '#4ade80', fontSize: 10 }}>SYNCING…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {counts.FULLY_PRIMED > 0 && (
            <span style={{
              background: 'rgba(74,222,128,0.2)', color: '#4ade80',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.FULLY_PRIMED} PRIMED</span>
          )}
          {counts.DORMANT > 0 && (
            <span style={{
              background: 'rgba(107,114,128,0.18)', color: '#9ca3af',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.DORMANT} DORMANT</span>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >×</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '4px 12px', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: 11, flexShrink: 0 }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, padding: '8px 12px', flexShrink: 0 }}>
        {[
          { label: 'SCENARIOS',   value: scenarios.length,           color: '#4ade80' },
          { label: 'LIVE EVENTS', value: liveEvents.length,          color: '#fb923c' },
          { label: 'ANNOTATIONS', value: annotations.length,         color: '#a78bfa' },
          { label: 'PRIMED',      value: counts.FULLY_PRIMED,        color: '#4ade80' },
          { label: 'WORLD TRIG',  value: counts.WORLD_TRIGGERED,     color: '#fb923c' },
          { label: 'GRAPH ANNOT', value: counts.GRAPH_ANNOTATED,     color: '#a78bfa' },
          { label: 'DORMANT',     value: counts.DORMANT,             color: '#6b7280' },
          { label: 'COVERAGE',    value: `${Math.round(((total - counts.DORMANT) / total) * 100)}%`, color: '#4ade80' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)', borderRadius: 5,
            padding: '5px 6px', textAlign: 'center',
          }}>
            <div style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.value}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#1e293b', overflow: 'hidden', display: 'flex' }}>
          {(['FULLY_PRIMED','WORLD_TRIGGERED','GRAPH_ANNOTATED','DORMANT']).map(state => (
            <div key={state} style={{
              width: `${(counts[state] / total) * 100}%`,
              background: STATE_META[state].color,
              transition: 'width 0.4s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {Object.entries(STATE_META).map(([k, v]) => (
            <span key={k} style={{ color: v.color, fontSize: 9 }}>
              ■ {v.label} ({counts[k]})
            </span>
          ))}
        </div>
      </div>

      {/* Filters + Search */}
      <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#4ade80' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#4ade80' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search scenarios…"
          style={{
            flex: 1, minWidth: 80, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4,
            color: '#cbd5e1', padding: '2px 8px', fontSize: 10,
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No scenarios match</div>
        )}
        {visible.map(item => {
          const meta = STATE_META[item.state];
          const isExp = expanded === item.id;
          return (
            <div key={item.id} style={{
              border: `1px solid ${isExp ? meta.color : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 6, marginBottom: 4,
              background: isExp ? meta.bg : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', transition: 'all 0.2s',
            }} onClick={() => setExpanded(isExp ? null : item.id)}>
              {/* Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px' }}>
                <span style={{
                  background: meta.bg, color: meta.color,
                  borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>{meta.label}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
                {item.status && (
                  <span style={{ color: '#475569', fontSize: 9, whiteSpace: 'nowrap' }}>{item.status}</span>
                )}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {/* Live Events */}
                  <div>
                    <div style={{ color: '#fb923c', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      LIVE INTEL ({item.matchedLive.length})
                    </div>
                    {item.matchedLive.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No live event matches</div>
                      : item.matchedLive.slice(0, 5).map((e, idx) => (
                        <div key={e.id || idx} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {e.title}
                            {e.type && <span style={{ color: '#fb923c', fontSize: 9, marginLeft: 4 }}>[{e.type}]</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.name,item.description,item.category,item.tags].join(' ')), [e.title,e.type,e.detail].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#fb923c', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Annotations */}
                  <div>
                    <div style={{ color: '#a78bfa', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      GRAPH ANNOTATIONS ({item.matchedAnns.length})
                    </div>
                    {item.matchedAnns.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No annotation matches</div>
                      : item.matchedAnns.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {a.label || a.entity}
                            {a.targetType && <span style={{ color: '#a78bfa', fontSize: 9, marginLeft: 4 }}>[{a.targetType}]</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.name,item.description,item.category,item.tags].join(' ')), [a.label,a.entity,a.notes,a.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#a78bfa', height: '100%',
                            }} />
                          </div>
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

      {/* Assessment footer */}
      <div style={{
        borderTop: '1px solid rgba(74,222,128,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(74,222,128,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.12)',
          border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '⬡ ASSESS COVERAGE'}
        </button>
      </div>
    </div>
  );
}
