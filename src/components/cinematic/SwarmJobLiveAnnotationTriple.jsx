import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJLIANN_RE = /\b(sjliann|swarm\s+job\s+live\s+annotation|swarm\s+live\s+annotation|swarm\s+annotation\s+live|armed\s+swarm\s+job|swarm\s+graph\s+annotation\s+live|swarm\s+live\s+intel\s+annotation|dark\s+swarm\s+live|swarm\s+world\s+annotation|swarm\s+live\s+world)\b/i;

export function isSjliannQuery(t) {
  return SJLIANN_RE.test(t || '');
}

export async function buildSjliannScript() {
  try {
    const [sjRes, liRes, anRes] = await Promise.all([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const jobs = normaliseSwarmJobs(sjRes);
    const live = normaliseLiveIntel(liRes);
    const anns = normaliseAnnotations(anRes);
    const classified = jobs.map(j => classifyJob(j, live, anns));
    const fullyArmed = classified.filter(j => j.state === 'FULLY_ARMED').length;
    const worldTriggered = classified.filter(j => j.state === 'WORLD_TRIGGERED').length;
    const graphTagged = classified.filter(j => j.state === 'GRAPH_TAGGED').length;
    const dark = classified.filter(j => j.state === 'DARK').length;
    return `SJLIANN swarm-job live-annotation coverage: ${jobs.length} swarm jobs — ${fullyArmed} fully armed (live intel+annotation), ${worldTriggered} world-triggered only, ${graphTagged} graph-tagged only, ${dark} dark (neither). ${dark > 0 ? `${dark} swarm jobs have no live world event or graph annotation linkage — operational blind spot.` : 'All swarm jobs have at least one active linkage.'}`;
  } catch {
    return 'SJLIANN data unavailable — check /entities/SwarmJob, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
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

function normaliseSwarmJobs(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.swarmJobs || raw?.swarm_jobs || raw?.jobs || raw?.items || raw?.data || raw?.results || []);
  return arr.map((j, i) => ({
    id: j.id || j._id || j.uid || `sj-${i}`,
    name: j.name || j.title || j.objective || `SwarmJob ${i + 1}`,
    type: j.type || j.kind || j.job_type || '',
    objective: j.objective || j.goal || j.description || '',
    status: j.status || j.state || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
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

function classifyJob(job, liveEvents, annotations) {
  const jToks = tok([job.name, job.type, job.objective, job.status, job.tags].join(' '));

  const matchedLive = liveEvents.filter(e => {
    const score = matchScore(jToks, [e.title, e.type, e.detail].join(' '));
    return score >= THRESHOLD;
  });

  const matchedAnns = annotations.filter(a => {
    const score = matchScore(jToks, [a.label, a.entity, a.notes, a.tags].join(' '));
    return score >= THRESHOLD;
  });

  let state;
  if (matchedLive.length > 0 && matchedAnns.length > 0) state = 'FULLY_ARMED';
  else if (matchedLive.length > 0) state = 'WORLD_TRIGGERED';
  else if (matchedAnns.length > 0) state = 'GRAPH_TAGGED';
  else state = 'DARK';

  return { ...job, state, matchedLive, matchedAnns };
}

const STATE_META = {
  FULLY_ARMED:     { label: 'FULLY ARMED',     color: '#a78bfa', bg: 'rgba(167,139,250,0.13)' },
  WORLD_TRIGGERED: { label: 'WORLD TRIGGERED',  color: '#fb923c', bg: 'rgba(251,146,60,0.13)'  },
  GRAPH_TAGGED:    { label: 'GRAPH TAGGED',      color: '#38bdf8', bg: 'rgba(56,189,248,0.13)'  },
  DARK:            { label: 'DARK',              color: '#6b7280', bg: 'rgba(107,114,128,0.13)' },
};

const FILTERS = ['ALL', 'FULLY_ARMED', 'WORLD_TRIGGERED', 'GRAPH_TAGGED', 'DARK'];

export default function SwarmJobLiveAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
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
      const [sjRes, liRes, anRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      ]);
      const jNorm = normaliseSwarmJobs(sjRes);
      const liNorm = normaliseLiveIntel(liRes);
      const anNorm = normaliseAnnotations(anRes);
      setJobs(jNorm);
      setLiveEvents(liNorm);
      setAnnotations(anNorm);
      setClassified(jNorm.map(j => classifyJob(j, liNorm, anNorm)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sjliann-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sjliann-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const onVoice = e => {
      if (SJLIANN_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => window.removeEventListener('jarvis:voice-query', onVoice);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const dark = classified.filter(j => j.state === 'DARK').map(j => j.name).slice(0, 5).join(', ');
      const armed = classified.filter(j => j.state === 'FULLY_ARMED').map(j => j.name).slice(0, 3).join(', ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Assess SJLIANN swarm-job live-world-annotation coverage. ${jobs.length} swarm jobs. Fully armed (live intel+annotation): ${armed || 'none'}. Dark (no live event or annotation linkage): ${dark || 'none'}. In 2 sentences, identify the largest swarm job operational blind spot and recommend the highest-priority remediation action.`,
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
  }, [classified, jobs.length]);

  if (!open) return null;

  const counts = {
    FULLY_ARMED:     classified.filter(j => j.state === 'FULLY_ARMED').length,
    WORLD_TRIGGERED: classified.filter(j => j.state === 'WORLD_TRIGGERED').length,
    GRAPH_TAGGED:    classified.filter(j => j.state === 'GRAPH_TAGGED').length,
    DARK:            classified.filter(j => j.state === 'DARK').length,
  };
  const total = classified.length || 1;

  const visible = classified.filter(j => {
    if (filter !== 'ALL' && j.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return j.name.toLowerCase().includes(q) || j.type.toLowerCase().includes(q) || j.objective.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 835840, bottom: 8, zIndex: 521,
      width: 520, maxHeight: '88vh',
      background: 'rgba(8,12,20,0.97)',
      border: '1px solid rgba(167,139,250,0.25)',
      borderRadius: 10,
      boxShadow: '0 0 32px rgba(167,139,250,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(167,139,250,0.15)',
        background: 'rgba(167,139,250,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#a78bfa', fontWeight: 700, letterSpacing: 1 }}>◈ SJLIANN</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>SWARM JOB × LIVE INTEL × ANNOTATION</span>
          {loading && <span style={{ color: '#a78bfa', fontSize: 10 }}>SYNCING…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {counts.FULLY_ARMED > 0 && (
            <span style={{
              background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.FULLY_ARMED} ARMED</span>
          )}
          {counts.DARK > 0 && (
            <span style={{
              background: 'rgba(107,114,128,0.18)', color: '#9ca3af',
              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            }}>{counts.DARK} DARK</span>
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
          { label: 'SWARM JOBS',  value: jobs.length,              color: '#a78bfa' },
          { label: 'LIVE EVENTS', value: liveEvents.length,        color: '#fb923c' },
          { label: 'ANNOTATIONS', value: annotations.length,       color: '#38bdf8' },
          { label: 'FULLY ARMED', value: counts.FULLY_ARMED,       color: '#a78bfa' },
          { label: 'WORLD TRIG',  value: counts.WORLD_TRIGGERED,   color: '#fb923c' },
          { label: 'GRAPH TAG',   value: counts.GRAPH_TAGGED,      color: '#38bdf8' },
          { label: 'DARK',        value: counts.DARK,              color: '#6b7280' },
          { label: 'COVERAGE',    value: `${Math.round(((total - counts.DARK) / total) * 100)}%`, color: '#a78bfa' },
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
          {(['FULLY_ARMED','WORLD_TRIGGERED','GRAPH_TAGGED','DARK']).map(state => (
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
            background: filter === f ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#a78bfa' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#a78bfa' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search swarm jobs…"
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
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No swarm jobs match</div>
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
                {item.type && (
                  <span style={{ color: '#475569', fontSize: 9, whiteSpace: 'nowrap' }}>{item.type}</span>
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
                              width: `${Math.min(100, matchScore(tok([item.name,item.type,item.objective,item.status,item.tags].join(' ')), [e.title,e.type,e.detail].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#fb923c', height: '100%',
                            }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Annotations */}
                  <div>
                    <div style={{ color: '#38bdf8', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                      GRAPH ANNOTATIONS ({item.matchedAnns.length})
                    </div>
                    {item.matchedAnns.length === 0
                      ? <div style={{ color: '#334155', fontSize: 10 }}>No annotation matches</div>
                      : item.matchedAnns.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 3 }}>
                          <div style={{ color: '#cbd5e1', fontSize: 10 }}>
                            {a.label || a.entity}
                            {a.targetType && <span style={{ color: '#38bdf8', fontSize: 9, marginLeft: 4 }}>[{a.targetType}]</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, marginTop: 2, background: '#1e293b', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, matchScore(tok([item.name,item.type,item.objective,item.status,item.tags].join(' ')), [a.label,a.entity,a.notes,a.tags].join(' ')) * 100 / THRESHOLD)}%`,
                              background: '#38bdf8', height: '100%',
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
        borderTop: '1px solid rgba(167,139,250,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(167,139,250,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(167,139,250,0.06)' : 'rgba(167,139,250,0.12)',
          border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '⬡ ASSESS COVERAGE'}
        </button>
      </div>
    </div>
  );
}
