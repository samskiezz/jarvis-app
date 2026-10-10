import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium', '02_intelligence_nexus', '03_threat_theatre',
  '04_mission_forge', '05_signals_bridge', '06_synthetic_oracle',
  '07_sovereign_archive', '08_field_operations', '09_crisis_calculus', '10_sentinel_watch',
];

const SCLGANN_RE = /\b(sclgann|scene\s+live\s+annotation|cinematic\s+live\s+annotation|scene\s+annotation\s+live|scene\s+live\s+intel\s+annotation|live\s+scene\s+annotation|dark\s+scene\s+live|scene\s+live\s+world\s+annotation|scene\s+live\s+graph|cinematic\s+live\s+graph|scene\s+world\s+graph\s+annotation|cinematic\s+annotation\s+live)\b/i;
const THRESHOLD = 0.07;

export function isSclgannQuery(t) {
  return SCLGANN_RE.test(t || '');
}

export async function buildSclgannScript() {
  try {
    const [sceneRaws, liRes, annRes] = await Promise.all([
      Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : []),
    ]);
    const scenes = normaliseScenes(sceneRaws);
    const liveEvents = normaliseLiveIntel(liRes);
    const annotations = normaliseAnnotations(annRes);
    const classified = scenes.map(s => classifyScene(s, liveEvents, annotations));
    const fullyLive = classified.filter(s => s.state === 'FULLY_LIVE').length;
    const dark = classified.filter(s => s.state === 'DARK').length;
    return `SCLGANN analysis: ${scenes.length} cinematic scenes cross-referenced against ${liveEvents.length} live world events and ${annotations.length} graph annotations. ${fullyLive} scenes are FULLY LIVE with both current world event trigger and graph annotation backing. ${dark} scenes are DARK — no live intel or annotation coverage — representing operational blind spots with no current world event or graph-level backing.`;
  } catch {
    return 'SCLGANN data unavailable — check /v1/cinematic/scene, /functions/getLiveIntel, and /v1/graph/annotations endpoints.';
  }
}

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

function normaliseScenes(rawArr) {
  return rawArr
    .map((raw, i) => {
      if (!raw) return null;
      const id = raw?.id || raw?.scene_id || SCENE_IDS[i] || `scene-${i}`;
      const label = raw?.name || raw?.title || id.replace(/_/g, ' ').replace(/^\d+\s+/, '');
      const description = raw?.description || raw?.summary || '';
      const anchors = Array.isArray(raw?.anchors)
        ? raw.anchors.map(a => typeof a === 'string' ? a : (a?.label || a?.text || '')).join(' ')
        : String(raw?.anchors || '');
      const tags = Array.isArray(raw?.tags) ? raw.tags.join(' ') : String(raw?.tags || '');
      return {
        id,
        label,
        description,
        anchors,
        tags,
        _searchText: [label, description, anchors, tags].filter(Boolean).join(' '),
      };
    })
    .filter(Boolean);
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.intel) ? raw.intel
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => {
    const type = e.type || e.category || (e.mag !== undefined ? 'SEISMIC' : e.symbol ? 'CRYPTO' : e.pair ? 'FX' : 'INTEL');
    const label = e.place || e.location || e.symbol || e.pair || e.name || e.title || `Event ${i + 1}`;
    const searchText = [e.place, e.location, e.symbol, e.pair, e.name, e.title, e.type, e.category, e.description].filter(Boolean).join(' ');
    return { id: e.id || e._id || `li-${i}`, label, type, magnitude: e.mag, _searchText: searchText };
  });
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
    id: a.id || a._id || `ann-${i}`,
    label: a.text || a.label || a.name || a.content || `Annotation ${i + 1}`,
    targetType: a.target_type || a.targetType || a.type || a.category || '',
    actor: a.actor || a.author || a.created_by || '',
    _searchText: [a.text, a.label, a.name, a.content, a.target_type, a.targetType, a.type, a.category, a.actor, a.author, a.tags].filter(Boolean).join(' '),
  }));
}

function classifyScene(scene, liveEvents, annotations) {
  const toks = tok(scene._searchText);
  const liveMatches = liveEvents
    .map(e => ({ ...e, score: Math.max(matchScore(toks, e._searchText), matchScore(tok(e._searchText), scene._searchText)) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const annMatches = annotations
    .map(a => ({ ...a, score: Math.max(matchScore(toks, a._searchText), matchScore(tok(a._searchText), scene._searchText)) }))
    .filter(a => a.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasLive = liveMatches.length > 0;
  const hasAnn = annMatches.length > 0;
  let state;
  if (hasLive && hasAnn) state = 'FULLY_LIVE';
  else if (hasLive) state = 'WORLD_TRIGGERED';
  else if (hasAnn) state = 'GRAPH_ANNOTATED';
  else state = 'DARK';
  return { ...scene, state, liveMatches, annMatches };
}

const STATE_LABELS = {
  FULLY_LIVE: 'FULLY LIVE',
  WORLD_TRIGGERED: 'WORLD-TRIGGERED',
  GRAPH_ANNOTATED: 'GRAPH-ANNOTATED',
  DARK: 'DARK',
};

const TYPE_COLORS = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#10b981', INTEL: '#6366f1' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function SceneLiveAnnotationTriple() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
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
      const headers = { 'Content-Type': 'application/json' };
      const [sceneRaws, liRes, annRes] = await Promise.all([
        Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`, { headers }).then(r => r.ok ? r.json() : null))),
        fetch(`${API}/functions/getLiveIntel`, { headers }),
        fetch(`${API}/v1/graph/annotations`, { headers }),
      ]);
      const [liJson, annJson] = await Promise.all([liRes.json(), annRes.json()]);
      const sc = normaliseScenes(sceneRaws);
      const li = normaliseLiveIntel(liJson);
      const ann = normaliseAnnotations(annJson);
      setScenes(sc);
      setLiveEvents(li);
      setAnnotations(ann);
      setClassified(sc.map(s => classifyScene(s, li, ann)));
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
    window.addEventListener('jarvis:sclgann-toggle', handler);
    return () => window.removeEventListener('jarvis:sclgann-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (SCLGANN_RE.test(q)) { setOpen(true); }
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_LIVE: classified.filter(s => s.state === 'FULLY_LIVE').length,
    WORLD_TRIGGERED: classified.filter(s => s.state === 'WORLD_TRIGGERED').length,
    GRAPH_ANNOTATED: classified.filter(s => s.state === 'GRAPH_ANNOTATED').length,
    DARK: classified.filter(s => s.state === 'DARK').length,
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
      const prompt = `SCLGANN Scene × Live Intel × Graph Annotation Triple Coverage: ${scenes.length} cinematic scenes cross-referenced against ${liveEvents.length} live world events and ${annotations.length} graph annotations. Coverage: FULLY LIVE=${counts.FULLY_LIVE}, WORLD-TRIGGERED=${counts.WORLD_TRIGGERED}, GRAPH-ANNOTATED=${counts.GRAPH_ANNOTATED}, DARK=${counts.DARK}. In 2 sentences, assess scene operational live coverage and identify the most critical dark scenes requiring immediate live intel or graph annotation to restore situational awareness.`;
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

  const livePct = classified.length ? Math.round((counts.FULLY_LIVE / classified.length) * 100) : 0;
  const worldPct = classified.length ? Math.round((counts.WORLD_TRIGGERED / classified.length) * 100) : 0;
  const annPct = classified.length ? Math.round((counts.GRAPH_ANNOTATED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 839760, bottom: 8, zIndex: 528,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #0f4c75',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(15,76,117,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>◈ SCLGANN</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Scene × Live Intel × Graph Annotation Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#fbbf24', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'SCENES', val: scenes.length, color: '#fbbf24' },
          { label: 'LIVE EVENTS', val: liveEvents.length, color: '#fb923c' },
          { label: 'ANNOTATIONS', val: annotations.length, color: '#818cf8' },
          { label: 'FULLY LIVE', val: counts.FULLY_LIVE, color: '#fbbf24', badge: counts.FULLY_LIVE > 0 },
          { label: 'WORLD-TRIG', val: counts.WORLD_TRIGGERED, color: '#fb923c' },
          { label: 'GRAPH-ANN', val: counts.GRAPH_ANNOTATED, color: '#818cf8' },
          { label: 'DARK', val: counts.DARK, color: '#6b7280', badge: counts.DARK > 0 },
          { label: 'COVERAGE', val: `${livePct}%`, color: '#22d3ee' },
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
          <span style={{ marginLeft: 'auto', color: '#fbbf24' }}>{livePct}% fully live</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {livePct > 0 && <div style={{ width: `${livePct}%`, background: '#fbbf24' }} />}
          {worldPct > 0 && <div style={{ width: `${worldPct}%`, background: '#fb923c' }} />}
          {annPct > 0 && <div style={{ width: `${annPct}%`, background: '#818cf8' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#fbbf24' }}>● FULLY LIVE</span>
          <span style={{ color: '#fb923c' }}>● WORLD-TRIGGERED</span>
          <span style={{ color: '#818cf8' }}>● GRAPH-ANNOTATED</span>
          <span style={{ color: '#374151' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_LIVE', 'WORLD_TRIGGERED', 'GRAPH_ANNOTATED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#0c3852' : '#0f172a',
            border: `1px solid ${filter === f ? '#fbbf24' : '#1e293b'}`,
            color: filter === f ? '#fde68a' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No scenes match current filter.</div>
        )}
        {visible.map(s => {
          const stateColor = s.state === 'FULLY_LIVE' ? '#fbbf24' : s.state === 'WORLD_TRIGGERED' ? '#fb923c' : s.state === 'GRAPH_ANNOTATED' ? '#818cf8' : '#6b7280';
          const isExp = expanded === s.id;
          return (
            <div key={s.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#0f4c75' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 130 }}>{STATE_LABELS[s.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{s.label}</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {s.description && <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, marginTop: 6 }}>{s.description.slice(0, 160)}{s.description.length > 160 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Live Intel pane */}
                    <div>
                      <div style={{ color: '#fb923c', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>LIVE INTEL ({s.liveMatches.length})</div>
                      {s.liveMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No live intel coverage</div>
                        : s.liveMatches.slice(0, 6).map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#fdba74', fontSize: 11 }}>{e.label}</span>
                              <span style={{ background: '#431407', color: TYPE_COLORS[e.type] || '#fb923c', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{e.type}</span>
                            </div>
                            <ScoreBar score={e.score} color="#fb923c" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Graph Annotations pane */}
                    <div>
                      <div style={{ color: '#818cf8', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>GRAPH ANNOTATIONS ({s.annMatches.length})</div>
                      {s.annMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No annotation coverage</div>
                        : s.annMatches.slice(0, 6).map(a => (
                          <div key={a.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#a5b4fc', fontSize: 11 }}>{a.label.slice(0, 50)}{a.label.length > 50 ? '…' : ''}</span>
                              {a.targetType && <span style={{ background: '#1e1b4b', color: '#818cf8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{a.targetType}</span>}
                            </div>
                            <ScoreBar score={a.score} color="#818cf8" />
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
            background: assessing ? '#1e293b' : '#0c3852', border: '1px solid #fbbf24',
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
