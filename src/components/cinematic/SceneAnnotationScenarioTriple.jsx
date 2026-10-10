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

const SGANSC_RE = /\b(sgansc|scene\s+annotation\s+scenario|scene\s+graph\s+scenario|scene\s+graph\s+annotation|annotated\s+scene|dark\s+scene\s+annotation|primed\s+scene|scene\s+scenario\s+annotation|scene\s+graph\s+plan|cinematic\s+annotation\s+scenario)\b/i;
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
    label: a.text || a.title || a.name || `Annotation ${i + 1}`,
    targetType: a.target_type || a.target || a.type || '',
    actor: a.actor || a.author || '',
    category: a.category || a.kind || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : String(a.tags || ''),
    description: a.description || a.summary || '',
    _searchText: [a.text, a.title, a.name, a.target_type, a.target, a.type, a.actor, a.author, a.category, a.kind, a.description, a.summary, a.tags].filter(Boolean).join(' '),
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
    id: s.id || s._id || `scen-${i}`,
    label: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    status: s.status || s.state || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    _searchText: [s.name, s.title, s.scenario_name, s.category, s.type, s.kind, s.status, s.state, s.description, s.summary, s.tags].filter(Boolean).join(' '),
  }));
}

function correlate(scenes, annotations, scenarios) {
  return scenes.map(scene => {
    const sToks = tok(scene._searchText);
    const matchedAnnotations = annotations
      .map(a => ({ ...a, score: matchScore(sToks, a._searchText) }))
      .filter(a => a.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedScenarios = scenarios
      .map(s => ({ ...s, score: matchScore(sToks, s._searchText) }))
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasAnn = matchedAnnotations.length > 0;
    const hasScen = matchedScenarios.length > 0;
    let coverage;
    if (hasAnn && hasScen) coverage = 'FULLY_PRIMED';
    else if (hasAnn) coverage = 'ANNOTATED';
    else if (hasScen) coverage = 'SCENARIO_LINKED';
    else coverage = 'DARK';
    return { ...scene, matchedAnnotations, matchedScenarios, coverage };
  });
}

export function isSganscQuery(t) {
  return SGANSC_RE.test(t || '');
}

export async function buildSganscScript() {
  try {
    const [sceneResults, annR, scenR] = await Promise.all([
      Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))),
      fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);
    const rawScenes = sceneResults.map(r => r.status === 'fulfilled' ? r.value : null);
    const rows = correlate(normaliseScenes(rawScenes), normaliseAnnotations(annR), normaliseScenarios(scenR));
    const fullyPrimed = rows.filter(r => r.coverage === 'FULLY_PRIMED').length;
    const dark = rows.filter(r => r.coverage === 'DARK').length;
    return `SGANSC coverage: ${rows.length} cinematic scenes assessed against graph annotations and scenario plans — ${fullyPrimed} fully primed (both annotation context and scenario response plan), ${dark} dark (no annotation or scenario coverage — operational blind spot). ${dark > 0 ? `${dark} scene${dark > 1 ? 's have' : ' has'} no annotation or scenario backing — intelligence integration review recommended.` : 'All scenes have either annotation or scenario backing at this time.'}`;
  } catch {
    return 'SGANSC: scene annotation scenario coverage data unavailable.';
  }
}

const TABS = ['ALL', 'FULLY PRIMED', 'ANNOTATED', 'SCENARIO-LINKED', 'DARK'];
const TAB_KEY = {
  'ALL': null,
  'FULLY PRIMED': 'FULLY_PRIMED',
  'ANNOTATED': 'ANNOTATED',
  'SCENARIO-LINKED': 'SCENARIO_LINKED',
  'DARK': 'DARK',
};

const COVER_COLOR = {
  FULLY_PRIMED: '#22c55e',
  ANNOTATED: '#06b6d4',
  SCENARIO_LINKED: '#a78bfa',
  DARK: '#6b7280',
};

const LABEL_MAP = {
  FULLY_PRIMED: 'FULLY PRIMED',
  ANNOTATED: 'ANNOTATED',
  SCENARIO_LINKED: 'SCENARIO-LINKED',
  DARK: 'DARK',
};

export default function SceneAnnotationScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [counts, setCounts] = useState({ total: 0, annotations: 0, scenarios: 0, fullyPrimed: 0, annotated: 0, scenarioLinked: 0, dark: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sceneResults, annR, scenR] = await Promise.all([
        Promise.allSettled(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : Promise.reject(`scene/${id} ${r.status}`)))),
        fetch(`${API}/v1/graph/annotations`).then(r => r.ok ? r.json() : Promise.reject(`annotations ${r.status}`)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(`scenario/list ${r.status}`)),
      ]);
      const rawScenes = sceneResults.map(r => r.status === 'fulfilled' ? r.value : null);
      const annotations = normaliseAnnotations(annR);
      const scenarios = normaliseScenarios(scenR);
      const correlated = correlate(normaliseScenes(rawScenes), annotations, scenarios);
      setRows(correlated);
      setCounts({
        total: correlated.length,
        annotations: annotations.length,
        scenarios: scenarios.length,
        fullyPrimed: correlated.filter(r => r.coverage === 'FULLY_PRIMED').length,
        annotated: correlated.filter(r => r.coverage === 'ANNOTATED').length,
        scenarioLinked: correlated.filter(r => r.coverage === 'SCENARIO_LINKED').length,
        dark: correlated.filter(r => r.coverage === 'DARK').length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) setOpen(e.detail.open);
      else setOpen(v => !v);
    };
    window.addEventListener('jarvis:sgansc-toggle', handler);
    return () => window.removeEventListener('jarvis:sgansc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const tabKey = TAB_KEY[tab];
    if (tabKey && r.coverage !== tabKey) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(s) ||
        r.description.toLowerCase().includes(s) ||
        r.anchors.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const total = counts.total || 1;
  const barPrimed = (counts.fullyPrimed / total * 100).toFixed(1);
  const barAnn = (counts.annotated / total * 100).toFixed(1);
  const barScen = (counts.scenarioLinked / total * 100).toFixed(1);
  const barDark = (counts.dark / total * 100).toFixed(1);

  async function assess(row) {
    setAssessing(row.id);
    try {
      const prompt = `Analyse cinematic scene "${row.label}" for graph annotation and scenario coverage. Coverage state: ${LABEL_MAP[row.coverage]}. Matched annotations: ${row.matchedAnnotations.map(a => a.label).join(', ') || 'none'}. Matched scenarios: ${row.matchedScenarios.map(s => s.label).join(', ') || 'none'}. ${row.coverage === 'FULLY_PRIMED' ? 'This scene has both graph annotation context and a scenario response plan — assess operational readiness.' : row.coverage === 'DARK' ? 'This scene has no annotation or scenario coverage — assess the intelligence blind spot and recommend action.' : row.coverage === 'ANNOTATED' ? 'This scene has annotation context but no scenario plan — assess the response planning gap.' : 'This scene has a scenario plan but no annotation context — assess the intelligence grounding gap.'} Respond in exactly 2 sentences.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.__JARVIS_KEY__ || 'dev-key'}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      await fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      /* silent */
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 825760, bottom: 8, zIndex: 503,
          background: 'rgba(14,20,28,0.82)', border: '1px solid #374151',
          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
          fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
        }}
        title="Scene × Graph Annotation × Scenario Triple Coverage (SGANSC)"
      >
        ◈ SGANSC
        {counts.dark > 0 && (
          <span style={{
            background: '#6b7280', color: '#f1f5f9', borderRadius: 8,
            fontSize: 10, padding: '0 5px', fontWeight: 700, lineHeight: '16px',
          }}>{counts.dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 44, left: '50%', transform: 'translateX(-50%)',
      width: 900, maxHeight: '78vh', zIndex: 503,
      background: 'rgba(10,14,20,0.97)', border: '1px solid #1e293b',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      fontFamily: 'monospace',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ SGANSC</span>
        <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>Scene × Graph Annotation × Scenario Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 10 }}>LOADING…</span>}
        <button onClick={load} style={{ background: 'none', border: '1px solid #374151', borderRadius: 4, color: '#64748b', fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: counts.total, color: '#94a3b8' },
          { label: 'ANNOTATIONS', val: counts.annotations, color: '#06b6d4' },
          { label: 'SCENARIOS', val: counts.scenarios, color: '#a78bfa' },
          { label: 'FULLY PRIMED', val: counts.fullyPrimed, color: '#22c55e' },
          { label: 'ANNOTATED', val: counts.annotated, color: '#06b6d4' },
          { label: 'SCENARIO-LINKED', val: counts.scenarioLinked, color: '#a78bfa' },
          { label: 'DARK', val: counts.dark, color: '#6b7280' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(30,41,59,0.6)', borderRadius: 6, padding: '4px 10px',
            border: `1px solid ${s.color}33`,
          }}>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ margin: '0 14px 8px', height: 6, borderRadius: 3, background: '#1e293b', display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: `${barPrimed}%`, background: '#22c55e', transition: 'width 0.4s' }} />
        <div style={{ width: `${barAnn}%`, background: '#06b6d4', transition: 'width 0.4s' }} />
        <div style={{ width: `${barScen}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
        <div style={{ width: `${barDark}%`, background: '#6b7280', transition: 'width 0.4s' }} />
      </div>

      {error && (
        <div style={{ margin: '0 14px 6px', color: '#ef4444', fontSize: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 4, padding: '4px 8px' }}>
          {error}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(34,197,94,0.15)' : 'rgba(30,41,59,0.4)',
            border: `1px solid ${tab === t ? '#22c55e' : '#374151'}`,
            borderRadius: 4, color: tab === t ? '#22c55e' : '#64748b',
            fontSize: 10, padding: '2px 8px', cursor: 'pointer',
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: 'auto', background: 'rgba(30,41,59,0.6)', border: '1px solid #374151',
            borderRadius: 4, color: '#cbd5e1', fontSize: 10, padding: '2px 8px', width: 160,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 24 }}>No scenes match current filter.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: 'rgba(30,41,59,0.5)', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${COVER_COLOR[row.coverage]}33`,
              }}
            >
              <span style={{ color: COVER_COLOR[row.coverage], fontSize: 10, fontWeight: 700, minWidth: 130 }}>
                {LABEL_MAP[row.coverage]}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1 }}>{row.label}</span>
              <span style={{ color: '#64748b', fontSize: 9 }}>
                {row.matchedAnnotations.length}ann {row.matchedScenarios.length}scen
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>{expanded === row.id ? '▲' : '▼'}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: '8px 8px 4px', background: 'rgba(15,23,42,0.6)', borderRadius: '0 0 6px 6px', border: '1px solid #1e293b', borderTop: 'none' }}>
                {row.description && (
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{row.description.slice(0, 120)}{row.description.length > 120 ? '…' : ''}</div>
                )}
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Annotations */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#06b6d4', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>ANNOTATIONS ({row.matchedAnnotations.length})</div>
                    {row.matchedAnnotations.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched annotations.</div>
                      : row.matchedAnnotations.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(a.score * 400, 100)}%`, height: '100%', background: '#06b6d4' }} />
                            </div>
                            {a.targetType && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(6,182,212,0.1)', borderRadius: 3, padding: '1px 4px' }}>{a.targetType.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{a.label.slice(0, 80)}{a.label.length > 80 ? '…' : ''}</div>
                        </div>
                      ))
                    }
                  </div>
                  {/* Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SCENARIOS ({row.matchedScenarios.length})</div>
                    {row.matchedScenarios.length === 0
                      ? <div style={{ color: '#475569', fontSize: 10 }}>No matched scenarios.</div>
                      : row.matchedScenarios.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(s.score * 400, 100)}%`, height: '100%', background: '#a78bfa' }} />
                            </div>
                            {s.category && <span style={{ color: '#64748b', fontSize: 9, background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 4px' }}>{s.category.slice(0, 16)}</span>}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 10 }}>{s.label}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                <button
                  onClick={() => assess(row)}
                  disabled={assessing === row.id}
                  style={{
                    marginTop: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e44',
                    borderRadius: 4, color: '#22c55e', fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                    opacity: assessing === row.id ? 0.5 : 1,
                  }}
                >
                  {assessing === row.id ? 'ASSESSING…' : '⬡ ASSESS'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
