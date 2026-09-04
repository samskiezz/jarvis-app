import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ASLIANN_RE = /\b(asliann|aip\s+skill\s+live\s+annotation|skill\s+live\s+annotation|skill\s+annotation\s+live|primed\s+skill|skill\s+graph\s+annotation\s+live|skill\s+live\s+intel\s+annotation|dormant\s+skill\s+live|skill\s+live\s+world\s+annotation|aip\s+skill\s+world\s+annotation|skill\s+world\s+annotation)\b/i;

export function isAsliannQuery(t) {
  return ASLIANN_RE.test(t || '');
}

export async function buildAsliannScript() {
  try {
    const [skillRes, liRes, anRes] = await Promise.all([
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const skills = normaliseSkills(skillRes);
    const live = normaliseLiveIntel(liRes);
    const anns = normaliseAnnotations(anRes);
    const classified = skills.map(s => classifySkill(s, live, anns));
    const primed = classified.filter(s => s.state === 'FULLY_PRIMED').length;
    const worldTriggered = classified.filter(s => s.state === 'WORLD_TRIGGERED').length;
    const graphTagged = classified.filter(s => s.state === 'GRAPH_TAGGED').length;
    const dormant = classified.filter(s => s.state === 'DORMANT').length;
    return `ASLIANN AIP skill live-annotation coverage: ${skills.length} skills — ${primed} fully primed (live intel+graph annotation), ${worldTriggered} world-triggered only, ${graphTagged} graph-tagged only, ${dormant} dormant (neither). ${dormant > 0 ? `${dormant} skills have no live world event or graph annotation backing — these capabilities lack current intelligence context.` : 'All skills have either live world event or graph annotation coverage.'}`;
  } catch {
    return 'ASLIANN data unavailable — check /v1/aip/skill, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
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

function normaliseSkills(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.skills || raw?.items || raw?.data || raw?.results || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || s.uid || `skill-${i}`,
    name: s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    description: s.description || s.summary || s.brief || '',
    category: s.category || s.type || s.kind || '',
    domain: s.domain || s.area || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const quakes = (raw.earthquakes || raw.quakes || []).map(e => ({
    id: e.id || e.place || `q-${e.place}`,
    title: e.place || e.location || e.title || 'Seismic Event',
    type: 'SEISMIC',
    detail: e.mag != null ? `M${e.mag}` : '',
  }));
  const crypto = (raw.crypto || raw.markets || []).map(c => ({
    id: c.symbol || c.id || `cr-${c.symbol}`,
    title: c.symbol || c.name || 'Crypto Asset',
    type: 'CRYPTO',
    detail: c.price ? `$${Number(c.price).toLocaleString()}` : '',
  }));
  const fx = (raw.fx || raw.forex || []).map(f => ({
    id: f.symbol || f.pair || `fx-${f.symbol}`,
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

function classifySkill(skill, liveEvents, annotations) {
  const sToks = tok([skill.name, skill.description, skill.category, skill.domain, skill.tags].join(' '));

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
  else if (matchedAnns.length > 0) state = 'GRAPH_TAGGED';
  else state = 'DORMANT';

  return { ...skill, state, matchedLive, matchedAnns };
}

const STATE_META = {
  FULLY_PRIMED:    { label: 'FULLY PRIMED',    color: '#f59e0b', bg: 'rgba(245,158,11,0.13)'  },
  WORLD_TRIGGERED: { label: 'WORLD TRIGGERED', color: '#fb923c', bg: 'rgba(251,146,60,0.13)'  },
  GRAPH_TAGGED:    { label: 'GRAPH TAGGED',    color: '#a78bfa', bg: 'rgba(167,139,250,0.13)' },
  DORMANT:         { label: 'DORMANT',         color: '#6b7280', bg: 'rgba(107,114,128,0.13)' },
};

const FILTERS = ['ALL', 'FULLY_PRIMED', 'WORLD_TRIGGERED', 'GRAPH_TAGGED', 'DORMANT'];

export default function AipSkillLiveAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
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
      const [skillRes, liRes, anRes] = await Promise.all([
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
      ]);
      const sNorm = normaliseSkills(skillRes);
      const liNorm = normaliseLiveIntel(liRes);
      const anNorm = normaliseAnnotations(anRes);
      setSkills(sNorm);
      setLiveEvents(liNorm);
      setAnnotations(anNorm);
      setClassified(sNorm.map(s => classifySkill(s, liNorm, anNorm)));
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:asliann-toggle', onToggle);
    return () => window.removeEventListener('jarvis:asliann-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const onVoice = e => {
      if (ASLIANN_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', onVoice);
    return () => window.removeEventListener('jarvis:voice-query', onVoice);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const primed = classified.filter(s => s.state === 'FULLY_PRIMED').map(s => s.name).slice(0, 5).join(', ');
      const dormant = classified.filter(s => s.state === 'DORMANT').map(s => s.name).slice(0, 3).join(', ');
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Assess ASLIANN AIP skill live-world-annotation coverage. ${skills.length} skills. Fully primed (live intel+annotation): ${primed || 'none'}. Dormant (no live event or annotation linkage): ${dormant || 'none'}. In 2 sentences, identify which dormant skills represent the highest capability intelligence gap and recommend the most urgent enrichment action.`,
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
  }, [classified, skills.length]);

  if (!open) return null;

  const counts = {
    FULLY_PRIMED:    classified.filter(s => s.state === 'FULLY_PRIMED').length,
    WORLD_TRIGGERED: classified.filter(s => s.state === 'WORLD_TRIGGERED').length,
    GRAPH_TAGGED:    classified.filter(s => s.state === 'GRAPH_TAGGED').length,
    DORMANT:         classified.filter(s => s.state === 'DORMANT').length,
  };
  const total = classified.length || 1;

  const visible = classified.filter(skill => {
    if (filter !== 'ALL' && skill.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q) || skill.category.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 840880, bottom: 8, zIndex: 530,
      width: 520, maxHeight: '88vh',
      background: 'rgba(8,12,20,0.97)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 10,
      boxShadow: '0 0 32px rgba(245,158,11,0.08)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(245,158,11,0.15)',
        background: 'rgba(245,158,11,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#f59e0b', fontWeight: 700, letterSpacing: 1 }}>◈ ASLIANN</span>
          <span style={{ color: '#64748b', fontSize: 10 }}>AIP SKILL × LIVE INTEL × ANNOTATION</span>
          {loading && <span style={{ color: '#f59e0b', fontSize: 10 }}>SYNCING…</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {counts.FULLY_PRIMED > 0 && (
            <span style={{
              background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
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
          { label: 'SKILLS',       value: skills.length,              color: '#f59e0b' },
          { label: 'LIVE EVENTS',  value: liveEvents.length,          color: '#fb923c' },
          { label: 'ANNOTATIONS',  value: annotations.length,         color: '#a78bfa' },
          { label: 'FULLY PRIMED', value: counts.FULLY_PRIMED,        color: '#f59e0b' },
          { label: 'WORLD TRIG',   value: counts.WORLD_TRIGGERED,     color: '#fb923c' },
          { label: 'GRAPH TAG',    value: counts.GRAPH_TAGGED,        color: '#a78bfa' },
          { label: 'DORMANT',      value: counts.DORMANT,             color: '#6b7280' },
          { label: 'COVERAGE',     value: `${Math.round(((total - counts.DORMANT) / total) * 100)}%`, color: '#f59e0b' },
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
          {(['FULLY_PRIMED', 'WORLD_TRIGGERED', 'GRAPH_TAGGED', 'DORMANT']).map(state => (
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
            background: filter === f ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === f ? '#f59e0b' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f ? '#f59e0b' : '#64748b',
            borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>
            {f === 'ALL' ? `ALL (${classified.length})` : `${STATE_META[f]?.label} (${counts[f]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search skills…"
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
          <div style={{ color: '#475569', textAlign: 'center', padding: 20 }}>No skills match</div>
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
                {item.category && (
                  <span style={{ color: '#64748b', fontSize: 9, whiteSpace: 'nowrap' }}>{item.category}</span>
                )}
                {item.domain && (
                  <span style={{ color: '#475569', fontSize: 9, whiteSpace: 'nowrap' }}>{item.domain}</span>
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
                              width: `${Math.min(100, matchScore(tok([item.name, item.description, item.category, item.domain, item.tags].join(' ')), [e.title, e.type, e.detail].join(' ')) * 100 / THRESHOLD)}%`,
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
                              width: `${Math.min(100, matchScore(tok([item.name, item.description, item.category, item.domain, item.tags].join(' ')), [a.label, a.entity, a.notes, a.tags].join(' ')) * 100 / THRESHOLD)}%`,
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
        borderTop: '1px solid rgba(245,158,11,0.12)',
        padding: '6px 12px', flexShrink: 0,
        background: 'rgba(245,158,11,0.04)',
      }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
          borderRadius: 5, padding: '4px 12px', fontSize: 10,
          cursor: assessing ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
        }}>
          {assessing ? 'ASSESSING…' : '⬡ ASSESS SKILL INTELLIGENCE COVERAGE'}
        </button>
      </div>
    </div>
  );
}
