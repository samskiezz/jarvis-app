import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const KGAOE_RE = /\b(kgaoe|knowledge\s+annotation\s+ops|knowledge\s+graph\s+ops|kb\s+annotation\s+ops|kb\s+annotation\s+event|knowledge\s+ops\s+annotation)\b/i;

export function isKgaoeQuery(t) {
  return KGAOE_RE.test(t || '');
}

export async function buildKgaoeScript() {
  try {
    const [kbRes, anRes, opsRes] = await Promise.all([
      fetch(`${API}/knowledge`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const items = normaliseKnowledge(kbRes);
    const anns = normaliseAnnotations(anRes);
    const ops = normaliseOps(opsRes);
    const classified = items.map(kb => classifyKb(kb, anns, ops));
    const fullyWired = classified.filter(c => c.state === 'FULLY_WIRED').length;
    const graphTagged = classified.filter(c => c.state === 'GRAPH_TAGGED').length;
    const opsTriggered = classified.filter(c => c.state === 'OPS_TRIGGERED').length;
    const dormant = classified.filter(c => c.state === 'DORMANT').length;
    return `KGAOE knowledge-annotation-ops coverage: ${items.length} items — ${fullyWired} fully wired (annotation+ops), ${graphTagged} graph-tagged only, ${opsTriggered} ops-triggered only, ${dormant} dormant (neither — intelligence and operational gap). ${dormant > 0 ? `${dormant} knowledge items have no graph annotation or ops event linkage.` : 'All knowledge items have at least one active linkage.'}`;
  } catch {
    return 'KGAOE data unavailable — check /knowledge, /v1/graph/annotations, and /v1/ops/events endpoints.';
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

function normaliseKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.articles || raw?.nodes || raw?.results || raw?.data || []);
  return arr.map((k, i) => ({
    id: k.id || k._id || k.uid || `kb-${i}`,
    title: k.title || k.name || k.label || k.heading || `Knowledge Item ${i + 1}`,
    category: k.category || k.type || k.kind || '',
    tags: Array.isArray(k.tags) ? k.tags.join(' ') : (k.tags || ''),
    summary: k.summary || k.description || k.content || k.body || '',
    source: k.source || k.origin || '',
  }));
}

function normaliseAnnotations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.annotations || raw?.items || raw?.data || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann-${i}`,
    label: a.label || a.title || a.name || a.text || '',
    entity: a.entity || a.entity_id || a.target || '',
    notes: a.notes || a.description || a.body || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseOps(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.events || raw?.items || raw?.data || []);
  return arr.map((e, i) => ({
    id: e.id || e._id || e.event_id || `ops-${i}`,
    title: e.title || e.name || e.summary || e.type || `Ops Event ${i + 1}`,
    type: e.type || e.event_type || e.kind || '',
    severity: e.severity || e.priority || e.level || '',
    description: e.description || e.body || e.notes || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function classifyKb(kb, annotations, ops) {
  const kToks = tok([kb.title, kb.category, kb.tags, kb.summary, kb.source].join(' '));

  const matchedAnns = annotations.filter(a => {
    const score = matchScore(kToks, [a.label, a.entity, a.notes, a.tags].join(' '));
    return score >= THRESHOLD;
  });

  const matchedOps = ops.filter(e => {
    const score = matchScore(kToks, [e.title, e.type, e.description, e.tags].join(' '));
    return score >= THRESHOLD;
  });

  let state;
  if (matchedAnns.length > 0 && matchedOps.length > 0) state = 'FULLY_WIRED';
  else if (matchedAnns.length > 0) state = 'GRAPH_TAGGED';
  else if (matchedOps.length > 0) state = 'OPS_TRIGGERED';
  else state = 'DORMANT';

  return { ...kb, state, matchedAnns, matchedOps };
}

const STATE_META = {
  FULLY_WIRED:   { label: 'FULLY WIRED',    color: '#22d3ee', bg: 'rgba(34,211,238,0.13)' },
  GRAPH_TAGGED:  { label: 'GRAPH TAGGED',   color: '#a78bfa', bg: 'rgba(167,139,250,0.13)' },
  OPS_TRIGGERED: { label: 'OPS TRIGGERED',  color: '#fb923c', bg: 'rgba(251,146,60,0.13)'  },
  DORMANT:       { label: 'DORMANT',         color: '#6b7280', bg: 'rgba(107,114,128,0.13)' },
};

const FILTERS = ['ALL', 'FULLY_WIRED', 'GRAPH_TAGGED', 'OPS_TRIGGERED', 'DORMANT'];

export default function KnowledgeAnnotationOpsTriple() {
  const [open, setOpen] = useState(false);
  const [knowledge, setKnowledge] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
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
      const [kbRes, anRes, opsRes] = await Promise.all([
        fetch(`${API}/knowledge`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const kbNorm = normaliseKnowledge(kbRes);
      const anNorm = normaliseAnnotations(anRes);
      const opsNorm = normaliseOps(opsRes);
      setKnowledge(kbNorm);
      setAnnotations(anNorm);
      setOpsEvents(opsNorm);
      setClassified(kbNorm.map(kb => classifyKb(kb, anNorm, opsNorm)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:kgaoe-toggle', onToggle);
    return () => window.removeEventListener('jarvis:kgaoe-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const onVoice = e => {
      if (KGAOE_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => window.removeEventListener('jarvis:voice-query', onVoice);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const dormant = classified.filter(c => c.state === 'DORMANT').map(c => c.title).slice(0, 5).join(', ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Assess KGAOE knowledge-annotation-ops coverage. ${knowledge.length} knowledge items. Dormant (no annotation or ops linkage): ${dormant || 'none'}. In 2 sentences, identify the largest coverage gap and recommend the highest-priority action.`,
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
  }, [classified, knowledge.length]);

  if (!open) return null;

  const counts = {
    FULLY_WIRED:   classified.filter(c => c.state === 'FULLY_WIRED').length,
    GRAPH_TAGGED:  classified.filter(c => c.state === 'GRAPH_TAGGED').length,
    OPS_TRIGGERED: classified.filter(c => c.state === 'OPS_TRIGGERED').length,
    DORMANT:       classified.filter(c => c.state === 'DORMANT').length,
  };
  const total = classified.length || 1;

  const visible = classified.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 831920, bottom: 8, zIndex: 514,
      width: 520, maxHeight: '88vh',
      background: 'rgba(8,12,20,0.97)',
      border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 10,
      boxShadow: '0 0 32px rgba(34,211,238,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(34,211,238,0.15)',
        background: 'rgba(34,211,238,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#22d3ee', fontWeight: 700, letterSpacing: 1 }}>◈ KGAOE</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>KNOWLEDGE × ANNOTATION × OPS</span>
          {loading && <span style={{ color: '#22d3ee', fontSize: 10 }}>SYNCING…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {counts.DORMANT > 0 && (
            <span style={{
              background: 'rgba(107,114,128,0.25)', color: '#9ca3af',
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
          { label: 'KB ITEMS', value: knowledge.length, color: '#22d3ee' },
          { label: 'ANNOTATIONS', value: annotations.length, color: '#a78bfa' },
          { label: 'OPS EVENTS', value: opsEvents.length, color: '#fb923c' },
          { label: 'FULLY WIRED', value: counts.FULLY_WIRED, color: '#22d3ee' },
          { label: 'GRAPH TAGGED', value: counts.GRAPH_TAGGED, color: '#a78bfa' },
          { label: 'OPS TRIGGERED', value: counts.OPS_TRIGGERED, color: '#fb923c' },
          { label: 'DORMANT', value: counts.DORMANT, color: '#6b7280' },
          { label: 'COVERAGE', value: `${Math.round(((total - counts.DORMANT) / total) * 100)}%`, color: '#22d3ee' },
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
          {(['FULLY_WIRED','GRAPH_TAGGED','OPS_TRIGGERED','DORMANT']).map(state => (
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
            background: filter === f ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#22d3ee' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#22d3ee' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
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
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No items match</div>
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
                  {item.title}
                </span>
                {item.category && (
                  <span style={{ color: '#475569', fontSize: 9 }}>{item.category}</span>
                )}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {/* Annotations */}
                  <div>
                    <div style={{ color: '#a78bfa', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      GRAPH ANNOTATIONS ({item.matchedAnns.length})
                    </div>
                    {item.matchedAnns.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No annotation matches</div>
                      : item.matchedAnns.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>{a.label || a.entity}</div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.title,item.category,item.tags,item.summary].join(' ')), [a.label,a.entity,a.notes,a.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#a78bfa', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Ops Events */}
                  <div>
                    <div style={{ color: '#fb923c', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      OPS EVENTS ({item.matchedOps.length})
                    </div>
                    {item.matchedOps.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No ops event matches</div>
                      : item.matchedOps.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {e.title}
                            {e.severity && <span style={{ color: '#fb923c', fontSize: 9, marginLeft: 4 }}>[{e.severity}]</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.title,item.category,item.tags,item.summary].join(' ')), [e.title,e.type,e.description,e.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#fb923c', height: '100%',
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
        borderTop: '1px solid rgba(34,211,238,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(34,211,238,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(34,211,238,0.06)' : 'rgba(34,211,238,0.14)',
          border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '⬡ ASSESS COVERAGE'}
        </button>
      </div>
    </div>
  );
}
