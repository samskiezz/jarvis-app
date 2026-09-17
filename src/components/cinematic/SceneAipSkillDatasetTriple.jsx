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

const SCASKDS_RE = /\b(scaskds|scene\s+skill\s+dataset|scene\s+aip\s+dataset|scene\s+capability\s+dataset|scene\s+data\s+capability|powered\s+scene|dark\s+scene\s+skill|scene\s+skill\s+data|cinematic\s+skill\s+data|cinematic\s+skill\s+dataset|scene\s+aip\s+skill\s+data|scene\s+aip\s+data)\b/i;
const THRESHOLD = 0.07;

export function isScaskdsQuery(t) {
  return SCASKDS_RE.test(t || '');
}

export async function buildScaskdsScript() {
  try {
    const sceneResults = await Promise.all(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const [skillRes, dsRes] = await Promise.all([
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []),
    ]);
    const scenes = normaliseScenes(sceneResults);
    const skills = normaliseSkills(skillRes);
    const datasets = normaliseDatasets(dsRes);
    const classified = scenes.map(s => classifyScene(s, skills, datasets));
    const powered = classified.filter(s => s.state === 'FULLY_POWERED').length;
    const dark = classified.filter(s => s.state === 'DARK').length;
    return `SCASKDS analysis: ${scenes.length} cinematic scenes cross-referenced against ${skills.length} AIP skills and ${datasets.length} datasets. ${powered} scenes are FULLY POWERED — both capability backing and data evidence confirmed. ${dark} scenes are DARK — no AIP skill or dataset coverage detected, representing operational blind spots requiring immediate capability assignment and data sourcing.`;
  } catch {
    return 'SCASKDS data unavailable — check /v1/cinematic/scene/{id}, /v1/aip/skill, and /v1/datasets endpoints.';
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

function normaliseSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.skills) ? raw.skills
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `sk-${i}`,
    label: s.name || s.title || s.skill || `Skill ${i + 1}`,
    category: s.category || s.domain || s.type || '',
    _searchText: [s.name, s.title, s.skill, s.description, s.category, s.domain, s.type, s.tags].filter(Boolean).join(' '),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.datasets) ? raw.datasets
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds-${i}`,
    label: d.name || d.title || d.dataset || `Dataset ${i + 1}`,
    kind: d.type || d.kind || d.category || '',
    rows: d.row_count || d.rows || d.count || null,
    _searchText: [d.name, d.title, d.dataset, d.description, d.tags, d.type, d.kind, d.category, d.source].filter(Boolean).join(' '),
  }));
}

function classifyScene(scene, skills, datasets) {
  const toks = tok(scene._searchText);
  const skillMatches = skills
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._searchText), matchScore(tok(s._searchText), scene._searchText)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const datasetMatches = datasets
    .map(d => ({ ...d, score: Math.max(matchScore(toks, d._searchText), matchScore(tok(d._searchText), scene._searchText)) }))
    .filter(d => d.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasSkill = skillMatches.length > 0;
  const hasDataset = datasetMatches.length > 0;
  let state;
  if (hasSkill && hasDataset) state = 'FULLY_POWERED';
  else if (hasSkill) state = 'SKILLED';
  else if (hasDataset) state = 'DATA_BACKED';
  else state = 'DARK';
  return { ...scene, state, skillMatches, datasetMatches };
}

const STATE_LABELS = {
  FULLY_POWERED: 'FULLY POWERED',
  SKILLED: 'SKILLED',
  DATA_BACKED: 'DATA-BACKED',
  DARK: 'DARK',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function SceneAipSkillDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [skills, setSkills] = useState([]);
  const [datasets, setDatasets] = useState([]);
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
      const sceneResults = await Promise.all(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null).catch(() => null))
      );
      const [skillRes, dsRes] = await Promise.all([
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const sc = normaliseScenes(sceneResults);
      const sk = normaliseSkills(skillRes);
      const ds = normaliseDatasets(dsRes);
      setScenes(sc);
      setSkills(sk);
      setDatasets(ds);
      setClassified(sc.map(s => classifyScene(s, sk, ds)));
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
    window.addEventListener('jarvis:scaskds-toggle', handler);
    return () => window.removeEventListener('jarvis:scaskds-toggle', handler);
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
      if (SCASKDS_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_POWERED: classified.filter(s => s.state === 'FULLY_POWERED').length,
    SKILLED: classified.filter(s => s.state === 'SKILLED').length,
    DATA_BACKED: classified.filter(s => s.state === 'DATA_BACKED').length,
    DARK: classified.filter(s => s.state === 'DARK').length,
  };

  const visible = classified.filter(sc => {
    if (filter !== 'ALL' && sc.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return sc._searchText.toLowerCase().includes(q) || sc.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `SCASKDS Scene × AIP Skill × Dataset Triple Coverage: ${scenes.length} cinematic scenes cross-referenced against ${skills.length} AIP skills and ${datasets.length} datasets. Coverage: FULLY POWERED=${counts.FULLY_POWERED}, SKILLED=${counts.SKILLED}, DATA-BACKED=${counts.DATA_BACKED}, DARK=${counts.DARK}. In 2 sentences, assess which scenes lack both capability and data backing, and identify the most critical operational blind spots requiring immediate skill assignment and dataset sourcing.`;
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

  const poweredPct = classified.length ? Math.round((counts.FULLY_POWERED / classified.length) * 100) : 0;
  const skilledPct = classified.length ? Math.round((counts.SKILLED / classified.length) * 100) : 0;
  const dataPct = classified.length ? Math.round((counts.DATA_BACKED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 846480, bottom: 8, zIndex: 540,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #0f2d1a',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,80,40,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 13 }}>◈ SCASKDS</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Scene × AIP Skill × Dataset Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#4ade80', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'SCENES', val: scenes.length, color: '#e2e8f0' },
          { label: 'AIP SKILLS', val: skills.length, color: '#a78bfa' },
          { label: 'DATASETS', val: datasets.length, color: '#34d399' },
          { label: 'FULLY POWERED', val: counts.FULLY_POWERED, color: '#4ade80', badge: counts.FULLY_POWERED > 0 },
          { label: 'SKILLED', val: counts.SKILLED, color: '#a78bfa' },
          { label: 'DATA-BACKED', val: counts.DATA_BACKED, color: '#34d399' },
          { label: 'DARK', val: counts.DARK, color: '#64748b', badge: counts.DARK > 0 },
          { label: 'COVERAGE %', val: `${poweredPct}%`, color: '#4ade80' },
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
          <span>Scene Capability & Data Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#4ade80' }}>{poweredPct}% fully powered</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {poweredPct > 0 && <div style={{ width: `${poweredPct}%`, background: '#4ade80' }} />}
          {skilledPct > 0 && <div style={{ width: `${skilledPct}%`, background: '#a78bfa' }} />}
          {dataPct > 0 && <div style={{ width: `${dataPct}%`, background: '#34d399' }} />}
          {darkPct > 0 && <div style={{ width: `${darkPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#4ade80' }}>● FULLY POWERED</span>
          <span style={{ color: '#a78bfa' }}>● SKILLED</span>
          <span style={{ color: '#34d399' }}>● DATA-BACKED</span>
          <span style={{ color: '#64748b' }}>● DARK</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_POWERED', 'SKILLED', 'DATA_BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#071a0e' : '#0f172a',
            border: `1px solid ${filter === f ? '#4ade80' : '#1e293b'}`,
            color: filter === f ? '#86efac' : '#64748b',
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
        {visible.map(sc => {
          const stateColor = sc.state === 'FULLY_POWERED' ? '#4ade80' : sc.state === 'SKILLED' ? '#a78bfa' : sc.state === 'DATA_BACKED' ? '#34d399' : '#475569';
          const isExp = expanded === sc.id;
          return (
            <div key={sc.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#0f2d1a' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : sc.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 140 }}>{STATE_LABELS[sc.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{sc.label}</span>
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  {sc.description && (
                    <div style={{ color: '#64748b', fontSize: 10, margin: '6px 0', fontStyle: 'italic' }}>{sc.description.slice(0, 120)}{sc.description.length > 120 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* AIP Skills pane */}
                    <div>
                      <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>AIP SKILLS ({sc.skillMatches.length})</div>
                      {sc.skillMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No AIP skill coverage</div>
                        : sc.skillMatches.slice(0, 6).map(s => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#c4b5fd', fontSize: 11 }}>{s.label.slice(0, 38)}{s.label.length > 38 ? '…' : ''}</span>
                              {s.category && <span style={{ background: '#1e1030', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{s.category.slice(0, 14)}</span>}
                            </div>
                            <ScoreBar score={s.score} color="#a78bfa" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Datasets pane */}
                    <div>
                      <div style={{ color: '#34d399', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>DATASETS ({sc.datasetMatches.length})</div>
                      {sc.datasetMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No dataset coverage</div>
                        : sc.datasetMatches.slice(0, 6).map(d => (
                          <div key={d.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#6ee7b7', fontSize: 11 }}>{d.label.slice(0, 38)}{d.label.length > 38 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {d.kind && <span style={{ background: '#022c22', color: '#34d399', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{d.kind}</span>}
                                {d.rows != null && <span style={{ background: '#0f172a', color: '#475569', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{d.rows.toLocaleString()} rows</span>}
                              </div>
                            </div>
                            <ScoreBar score={d.score} color="#34d399" />
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
            background: assessing ? '#1e293b' : '#071a0e', border: '1px solid #4ade80',
            color: assessing ? '#475569' : '#86efac', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
