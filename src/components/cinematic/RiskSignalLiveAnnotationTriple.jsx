import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSLIANN_RE = /\b(rsliann|risk\s+signal\s+live\s+annotation|risk\s+signal\s+world\s+annotation|risk\s+annotation\s+live|elevated\s+risk\s+signal|risk\s+graph\s+annotation\s+live|risk\s+live\s+intel\s+annotation|dormant\s+risk\s+signal|risk\s+world\s+annotation|signal\s+live\s+annotation|signal\s+annotation\s+live|risk\s+signal\s+annotation\s+world)\b/i;

export function isRsliannQuery(t) {
  return RSLIANN_RE.test(t || '');
}

export async function buildRsliannScript() {
  try {
    const [rsRes, liRes, anRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normaliseSignals(rsRes);
    const live = normaliseLiveIntel(liRes);
    const anns = normaliseAnnotations(anRes);
    const classified = signals.map(s => classifySignal(s, live, anns));
    const fullyElevated = classified.filter(s => s.state === 'FULLY_ELEVATED').length;
    const worldTriggered = classified.filter(s => s.state === 'WORLD_TRIGGERED').length;
    const graphTagged = classified.filter(s => s.state === 'GRAPH_TAGGED').length;
    const dormant = classified.filter(s => s.state === 'DORMANT').length;
    return `RSLIANN risk signal live-annotation coverage: ${signals.length} risk signals — ${fullyElevated} fully elevated (live intel+annotation), ${worldTriggered} world-triggered only, ${graphTagged} graph-tagged only, ${dormant} dormant (neither). ${fullyElevated > 0 ? `${fullyElevated} risk signals have simultaneous live world event and graph annotation exposure — threat posture elevated.` : 'No risk signals have concurrent live and annotation activation.'}`;
  } catch {
    return 'RSLIANN data unavailable — check /entities/RiskSignal, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
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

function normaliseSignals(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.risk_signals || raw?.signals || raw?.items || raw?.data || raw?.results || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || s.uid || `rs-${i}`,
    name: s.name || s.title || s.signal || `Risk Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || s.kind || '',
    description: s.description || s.summary || s.notes || '',
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

function classifySignal(sig, liveEvents, annotations) {
  const sToks = tok([sig.name, sig.severity, sig.category, sig.description, sig.tags].join(' '));

  const matchedLive = liveEvents.filter(e => {
    const score = matchScore(sToks, [e.title, e.type, e.detail].join(' '));
    return score >= THRESHOLD;
  });

  const matchedAnns = annotations.filter(a => {
    const score = matchScore(sToks, [a.label, a.entity, a.notes, a.tags].join(' '));
    return score >= THRESHOLD;
  });

  let state;
  if (matchedLive.length > 0 && matchedAnns.length > 0) state = 'FULLY_ELEVATED';
  else if (matchedLive.length > 0) state = 'WORLD_TRIGGERED';
  else if (matchedAnns.length > 0) state = 'GRAPH_TAGGED';
  else state = 'DORMANT';

  return { ...sig, state, matchedLive, matchedAnns };
}

const STATE_META = {
  FULLY_ELEVATED:  { label: 'FULLY ELEVATED',  color: '#ef4444', bg: 'rgba(239,68,68,0.13)'   },
  WORLD_TRIGGERED: { label: 'WORLD TRIGGERED', color: '#fb923c', bg: 'rgba(251,146,60,0.13)'  },
  GRAPH_TAGGED:    { label: 'GRAPH TAGGED',    color: '#a78bfa', bg: 'rgba(167,139,250,0.13)' },
  DORMANT:         { label: 'DORMANT',         color: '#6b7280', bg: 'rgba(107,114,128,0.13)' },
};

const FILTERS = ['ALL', 'FULLY_ELEVATED', 'WORLD_TRIGGERED', 'GRAPH_TAGGED', 'DORMANT'];

export default function RiskSignalLiveAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
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
      const [rsRes, liRes, anRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      ]);
      const sNorm = normaliseSignals(rsRes);
      const liNorm = normaliseLiveIntel(liRes);
      const anNorm = normaliseAnnotations(anRes);
      setSignals(sNorm);
      setLiveEvents(liNorm);
      setAnnotations(anNorm);
      setClassified(sNorm.map(s => classifySignal(s, liNorm, anNorm)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rsliann-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rsliann-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const onVoice = e => {
      if (RSLIANN_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => window.removeEventListener('jarvis:voice-query', onVoice);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const elevated = classified.filter(s => s.state === 'FULLY_ELEVATED').map(s => s.name).slice(0, 5).join(', ');
      const dormant = classified.filter(s => s.state === 'DORMANT').map(s => s.name).slice(0, 3).join(', ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Assess RSLIANN risk signal live-world-annotation coverage. ${signals.length} risk signals. Fully elevated (live intel+annotation): ${elevated || 'none'}. Dormant (no live event or annotation): ${dormant || 'none'}. In 2 sentences, identify the highest-priority threat signal and recommend the most urgent defensive action.`,
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
  }, [classified, signals.length]);

  if (!open) return null;

  const counts = {
    FULLY_ELEVATED:  classified.filter(s => s.state === 'FULLY_ELEVATED').length,
    WORLD_TRIGGERED: classified.filter(s => s.state === 'WORLD_TRIGGERED').length,
    GRAPH_TAGGED:    classified.filter(s => s.state === 'GRAPH_TAGGED').length,
    DORMANT:         classified.filter(s => s.state === 'DORMANT').length,
  };
  const total = classified.length || 1;

  const visible = classified.filter(sig => {
    if (filter !== 'ALL' && sig.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return sig.name.toLowerCase().includes(q) || sig.category.toLowerCase().includes(q) || sig.severity.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 836960, bottom: 8, zIndex: 523,
      width: 520, maxHeight: '88vh',
      background: 'rgba(8,12,20,0.97)',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 10,
      boxShadow: '0 0 32px rgba(239,68,68,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(239,68,68,0.15)',
        background: 'rgba(239,68,68,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ef4444', fontWeight: 700, letterSpacing: 1 }}>◈ RSLIANN</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>RISK SIGNAL × LIVE INTEL × ANNOTATION</span>
          {loading && <span style={{ color: '#ef4444', fontSize: 10 }}>SYNCING…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {counts.FULLY_ELEVATED > 0 && (
            <span style={{
              background: 'rgba(239,68,68,0.2)', color: '#ef4444',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.FULLY_ELEVATED} ELEVATED</span>
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
          { label: 'RISK SIGNALS', value: signals.length,          color: '#ef4444' },
          { label: 'LIVE EVENTS',  value: liveEvents.length,        color: '#fb923c' },
          { label: 'ANNOTATIONS',  value: annotations.length,       color: '#a78bfa' },
          { label: 'FULLY ELEV',   value: counts.FULLY_ELEVATED,    color: '#ef4444' },
          { label: 'WORLD TRIG',   value: counts.WORLD_TRIGGERED,   color: '#fb923c' },
          { label: 'GRAPH TAG',    value: counts.GRAPH_TAGGED,      color: '#a78bfa' },
          { label: 'DORMANT',      value: counts.DORMANT,           color: '#6b7280' },
          { label: 'COVERAGE',     value: `${Math.round(((total - counts.DORMANT) / total) * 100)}%`, color: '#ef4444' },
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
          {(['FULLY_ELEVATED','WORLD_TRIGGERED','GRAPH_TAGGED','DORMANT']).map(state => (
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
            background: filter === f ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#ef4444' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search risk signals…"
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
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No risk signals match</div>
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
                {item.severity && (
                  <span style={{ color: '#64748b', fontSize: 9, whiteSpace: 'nowrap' }}>{item.severity}</span>
                )}
                {item.category && (
                  <span style={{ color: '#475569', fontSize: 9, whiteSpace: 'nowrap' }}>{item.category}</span>
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
                              width: `${Math.min(100, matchScore(tok([item.name,item.severity,item.category,item.description,item.tags].join(' ')), [e.title,e.type,e.detail].join(' ')) * 100 / THRESHOLD)}%`,
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
                              width: `${Math.min(100, matchScore(tok([item.name,item.severity,item.category,item.description,item.tags].join(' ')), [a.label,a.entity,a.notes,a.tags].join(' ')) * 100 / THRESHOLD)}%`,
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
        borderTop: '1px solid rgba(239,68,68,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(239,68,68,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '⬡ ASSESS THREAT POSTURE'}
        </button>
      </div>
    </div>
  );
}
