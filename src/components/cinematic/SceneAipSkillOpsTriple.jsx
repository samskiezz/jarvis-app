import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_intelligence_nexus',
  '03_threat_theatre',
  '04_mission_forge',
  '05_signals_bridge',
  '06_synthetic_oracle',
  '07_sovereign_archive',
  '08_field_operations',
  '09_crisis_calculus',
  '10_sentinel_watch',
];

const SCASOE_RE = /\b(scasoe|scene\s+aip\s+skill\s+ops|scene\s+skill\s+ops|scene\s+ops\s+skill|scene\s+capability\s+ops|cinematic\s+ops\s+skill|armed\s+scene\s+ops|dark\s+scene\s+ops|scene\s+ops\s+event\s+skill|scene\s+aip\s+ops|cinematic\s+skill\s+ops|scene\s+armed|cinematic\s+aip\s+ops)\b/i;
const THRESHOLD = 0.07;

export function isScasoeQuery(t) {
  return SCASOE_RE.test(t || '');
}

export async function buildScasoeScript() {
  try {
    const [scenesR, skillsRes, opsRes] = await Promise.all([
      Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
      ),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const rawScenes = scenesR
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
    const scenes = normaliseScenes(rawScenes);
    const skills = normaliseSkills(skillsRes);
    const events = normaliseEvents(opsRes);
    const classified = scenes.map(s => classifyScene(s, skills, events));
    const fullyArmed = classified.filter(s => s.state === 'FULLY_ARMED').length;
    const skilled    = classified.filter(s => s.state === 'SKILLED').length;
    const opsOnly    = classified.filter(s => s.state === 'OPS_TRIGGERED').length;
    const dark       = classified.filter(s => s.state === 'DARK').length;
    const pct = scenes.length ? Math.round((fullyArmed / scenes.length) * 100) : 0;
    const darkTitles = classified.filter(s => s.state === 'DARK').slice(0, 3).map(s => s.title).join(', ') || 'none';
    return (
      `SCASOE: ${scenes.length} cinematic scenes correlated against ${skills.length} AIP skills and ${events.length} ops events. ` +
      `${fullyArmed} (${pct}%) are FULLY ARMED — both skill-backed and ops-monitored. ` +
      `${skilled} are SKILLED (capability without live ops trigger), ${opsOnly} are OPS_TRIGGERED (live events without skill backing), ${dark} are DARK with no coverage. ` +
      `Dark scenes: ${darkTitles}.`
    );
  } catch {
    return 'SCASOE data unavailable — check /v1/cinematic/scene, /v1/aip/skill, /v1/ops/events endpoints.';
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

function normaliseScenes(rawArr) {
  return rawArr.map((raw, i) => {
    const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
    const title = raw?.title || raw?.name || id.replace(/_/g, ' ').replace(/^\d+\s*/, '').toUpperCase();
    const desc  = String(raw?.description || raw?.summary || raw?.briefing || '').slice(0, 300);
    const tags  = Array.isArray(raw?.tags) ? raw.tags.join(' ') : (raw?.tags || '');
    const anchors = Array.isArray(raw?.anchors)
      ? raw.anchors.map(a => (typeof a === 'string' ? a : (a?.label || a?.title || a?.text || ''))).join(' ')
      : '';
    return { id, title, desc, tags, anchors, _text: `${title} ${desc} ${tags} ${anchors}` };
  });
}

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = ['skills', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    category: s.category || s.domain || s.type || '',
    desc:     String(s.description || s.summary || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
    _text:    `${s.name || ''} ${s.title || ''} ${s.category || ''} ${s.description || ''} ${Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || '')}`,
  }));
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.title || e.name || e.event_type || `Event ${i + 1}`,
    type:     e.type || e.event_type || e.category || '',
    severity: e.severity || e.priority || e.level || '',
    desc:     String(e.description || e.summary || e.details || '').slice(0, 200),
    _text:    `${e.title || ''} ${e.name || ''} ${e.type || ''} ${e.event_type || ''} ${e.description || ''} ${e.severity || ''}`,
  }));
}

function classifyScene(scene, skills, events) {
  const toks = tok(scene._text);
  const matchedSkills = skills
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._text), matchScore(tok(s._text), scene._text)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedEvents = events
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._text), matchScore(tok(e._text), scene._text)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const state = (matchedSkills.length > 0 && matchedEvents.length > 0) ? 'FULLY_ARMED'
    : matchedSkills.length > 0 ? 'SKILLED'
    : matchedEvents.length > 0 ? 'OPS_TRIGGERED' : 'DARK';
  return { ...scene, state, matchedSkills, matchedEvents };
}

const STATE_COLOR = {
  FULLY_ARMED:   '#f59e0b',
  SKILLED:       '#8b5cf6',
  OPS_TRIGGERED: '#f97316',
  DARK:          '#6b7280',
};

const STATE_LABEL = {
  FULLY_ARMED:   'FULLY ARMED',
  SKILLED:       'SKILLED',
  OPS_TRIGGERED: 'OPS TRIGGERED',
  DARK:          'DARK',
};

export default function SceneAipSkillOpsTriple() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [scenes,     setScenes]     = useState([]);
  const [skills,     setSkills]     = useState([]);
  const [events,     setEvents]     = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter,     setFilter]     = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [scenesR, skillsRes, opsRes] = await Promise.all([
        Promise.allSettled(
          SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
        ),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const rawScenes = scenesR
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
      const sc = normaliseScenes(rawScenes);
      const sk = normaliseSkills(skillsRes);
      const ev = normaliseEvents(opsRes);
      setScenes(sc);
      setSkills(sk);
      setEvents(ev);
      setClassified(sc.map(s => classifyScene(s, sk, ev)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:scasoe-toggle', handler);
    return () => window.removeEventListener('jarvis:scasoe-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      if (SCASOE_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const counts = {
        FULLY_ARMED:   classified.filter(s => s.state === 'FULLY_ARMED').length,
        SKILLED:       classified.filter(s => s.state === 'SKILLED').length,
        OPS_TRIGGERED: classified.filter(s => s.state === 'OPS_TRIGGERED').length,
        DARK:          classified.filter(s => s.state === 'DARK').length,
      };
      const prompt = `SCASOE Scene × AIP Skill × Ops Event Triple Coverage: ${scenes.length} cinematic scenes cross-referenced against ${skills.length} AIP skills and ${events.length} ops events. Coverage: FULLY_ARMED=${counts.FULLY_ARMED} (both skill and ops event backed), SKILLED=${counts.SKILLED} (skill capability, no live ops trigger), OPS_TRIGGERED=${counts.OPS_TRIGGERED} (live ops event, no skill backing), DARK=${counts.DARK} (neither — operational blind spots). In 2 sentences, assess which scenes have complete capability-operational coverage versus those that are dark or missing either skill backing or live operational triggers, and identify the most critical coverage gaps.`;
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

  const counts = {
    FULLY_ARMED:   classified.filter(s => s.state === 'FULLY_ARMED').length,
    SKILLED:       classified.filter(s => s.state === 'SKILLED').length,
    OPS_TRIGGERED: classified.filter(s => s.state === 'OPS_TRIGGERED').length,
    DARK:          classified.filter(s => s.state === 'DARK').length,
  };
  const armedPct = classified.length ? Math.round((counts.FULLY_ARMED   / classified.length) * 100) : 0;
  const skillPct = classified.length ? Math.round((counts.SKILLED        / classified.length) * 100) : 0;
  const opsPct   = classified.length ? Math.round((counts.OPS_TRIGGERED  / classified.length) * 100) : 0;
  const darkPct  = classified.length ? Math.round((counts.DARK           / classified.length) * 100) : 0;

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const mono = "'JetBrains Mono',monospace";

  return (
    <div style={{
      position: 'fixed', left: 852080, bottom: 8, zIndex: 550,
      width: 900, maxHeight: 680, background: '#0a0f1a',
      border: '1px solid #f59e0b33', borderRadius: 10,
      fontFamily: mono, fontSize: 11, color: '#cbd5e1',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 0 24px #f59e0b22',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', borderBottom: '1px solid #1e293b', background: '#060d18' }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ SCASOE
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>
          SCENE × AIP SKILL × OPS EVENT
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {counts.FULLY_ARMED > 0 && (
            <span style={{ background: '#f59e0b22', color: '#f59e0b', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.FULLY_ARMED} ARMED
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#6b728022', color: '#9ca3af', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.DARK} DARK
            </span>
          )}
          {loading && <span style={{ color: '#64748b' }}>◌</span>}
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {error && (
        <div style={{ color: '#f87171', padding: '4px 12px', fontSize: 10, background: '#1a0a0a' }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4, padding: '8px 12px 0' }}>
        {[
          ['SCENES',   scenes.length,         '#94a3b8'],
          ['SKILLS',   skills.length,          '#8b5cf6'],
          ['OPS EVT',  events.length,          '#f97316'],
          ['ARMED',    counts.FULLY_ARMED,     '#f59e0b'],
          ['SKILLED',  counts.SKILLED,         '#8b5cf6'],
          ['OPS TRG',  counts.OPS_TRIGGERED,   '#f97316'],
          ['DARK',     counts.DARK,            '#6b7280'],
          ['ARMED%',   armedPct + '%',         '#f59e0b'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: '#0f172a', borderRadius: 5, padding: '5px 4px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {classified.length > 0 && (
        <div style={{ margin: '8px 12px 0', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: armedPct + '%', background: '#f59e0b' }} title={`FULLY ARMED ${armedPct}%`} />
          <div style={{ width: skillPct + '%', background: '#8b5cf6' }} title={`SKILLED ${skillPct}%`} />
          <div style={{ width: opsPct   + '%', background: '#f97316' }} title={`OPS TRIGGERED ${opsPct}%`} />
          <div style={{ width: darkPct  + '%', background: '#374151' }} title={`DARK ${darkPct}%`} />
        </div>
      )}

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px 4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_ARMED', 'SKILLED', 'OPS_TRIGGERED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] || '#334155' : '#0f172a',
            color: filter === f ? '#000' : '#64748b',
            border: '1px solid ' + (filter === f ? STATE_COLOR[f] || '#475569' : '#1e293b'),
            borderRadius: 4, padding: '2px 9px', cursor: 'pointer', fontSize: 10, fontFamily: mono,
          }}>
            {f === 'ALL' ? 'ALL' : STATE_LABEL[f]}
            {f !== 'ALL' && <span style={{ marginLeft: 4, opacity: 0.8 }}>({counts[f] || 0})</span>}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b',
            color: '#94a3b8', borderRadius: 4, padding: '3px 8px', fontSize: 10,
            fontFamily: mono, outline: 'none', width: 160,
          }}
        />
      </div>

      {/* Scene list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 4px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#334155', padding: 16, textAlign: 'center' }}>
            {classified.length === 0 ? 'No scene data loaded.' : 'No scenes match filter.'}
          </div>
        )}
        {visible.map(scene => (
          <div key={scene.id}>
            <div
              onClick={() => setExpanded(expanded === scene.id ? null : scene.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
                borderRadius: 5, cursor: 'pointer', marginBottom: 2,
                background: expanded === scene.id ? '#0f172a' : 'transparent',
                borderLeft: `3px solid ${STATE_COLOR[scene.state]}`,
              }}
            >
              <span style={{ color: STATE_COLOR[scene.state], fontSize: 10, minWidth: 90, fontWeight: 600 }}>
                {STATE_LABEL[scene.state]}
              </span>
              <span style={{ color: '#e2e8f0', flex: 1, fontSize: 11 }}>{scene.title}</span>
              <span style={{ color: '#475569', fontSize: 10 }}>
                S:{scene.matchedSkills.length} E:{scene.matchedEvents.length}
              </span>
              <span style={{ color: '#334155', fontSize: 10 }}>{expanded === scene.id ? '▲' : '▼'}</span>
            </div>

            {expanded === scene.id && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: '6px 6px 8px', background: '#060d18', borderRadius: 5, marginBottom: 4,
              }}>
                {/* AIP Skills */}
                <div>
                  <div style={{ color: '#8b5cf6', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    AIP SKILLS ({scene.matchedSkills.length})
                  </div>
                  {scene.matchedSkills.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No skill matches.</div>
                  ) : scene.matchedSkills.slice(0, 6).map(sk => (
                    <div key={sk.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#c4b5fd', fontSize: 10 }}>{sk.name}</span>
                        {sk.category && (
                          <span style={{ background: '#4c1d9533', color: '#a78bfa', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                            {sk.category}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(sk.score * 100) + '%', background: '#8b5cf6', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Ops Events */}
                <div>
                  <div style={{ color: '#f97316', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    OPS EVENTS ({scene.matchedEvents.length})
                  </div>
                  {scene.matchedEvents.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No ops event matches.</div>
                  ) : scene.matchedEvents.slice(0, 6).map(ev => (
                    <div key={ev.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, gap: 4 }}>
                        <span style={{ color: '#fdba74', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.name}
                        </span>
                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                          {ev.type && (
                            <span style={{ background: '#431a0733', color: '#fb923c', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                              {ev.type}
                            </span>
                          )}
                          {ev.severity && (
                            <span style={{ background: '#7c2d1233', color: '#fca5a5', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                              {ev.severity}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(ev.score * 100) + '%', background: '#f97316', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ASSESS footer */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #1e293b', background: '#060d18' }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assessment}</div>
        )}
        <button onClick={assess} disabled={assessing || classified.length === 0} style={{
          background: assessing ? '#1e293b' : '#431a0766',
          border: '1px solid #f59e0b44',
          color: '#f59e0b', borderRadius: 5, padding: '4px 14px',
          cursor: assessing ? 'default' : 'pointer', fontSize: 11,
          fontFamily: mono, letterSpacing: 1,
        }}>
          {assessing ? '◌ assessing…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
