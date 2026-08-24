/**
 * F71 — Scene × Scenario Coverage (SCSCEN)
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} anchors +
 * /v1/scenario/list, then keyword-correlates each scene's anchor
 * texts against active scenarios to surface:
 *   SCRIPTED  — at least one scenario covers this scene's domain
 *   UNPLANNED — no scenario coverage (action gap)
 *
 * Stat tiles: scenes / scenarios / scripted / unplanned
 * Filter tabs: ALL | SCRIPTED | UNPLANNED
 * Expand any scene → matched scenarios with status badge + relevance score.
 * Amber badge on UNPLANNED count.
 * ▶ ASSESS: 2-sentence scene-scenario readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCSCEN  at bottom:8 left:686320, zIndex:254.
 * Event:   jarvis:scscen-toggle
 * Voice:   "scene scenario / scenario scene / scscen / scripted scene /
 *           unplanned scene / scene coverage / scene scenario coverage /
 *           which scenes have scenarios / scenario backed scene"
 * Refresh: 120 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const POLL_MS = 120_000;
const AM = '#f59e0b';

const SCENE_IDS = [
  '01_command_atrium',
  '02_ai_core_chamber',
  '03_world_control_room',
  '04_intelligence_graph_space',
  '05_operations_war_room',
  '06_data_fusion_reactor',
  '07_document_intelligence_vault',
  '08_simulation_theatre',
  '09_analytics_observatory',
  '10_system_security_core',
];

const SCSCEN_RE =
  /\b(scene[._-]?scenario|scenario[._-]?scene[s]?|scscen|scripted[._-]?scene[s]?|unplanned[._-]?scene[s]?|scene[._-]?coverage|scene[._-]?scenario[._-]?coverage|which[._-]?scenes?[._-]?(have|lack)[._-]?scenario|scenario[._-]?backed[._-]?scene[s]?|unscripted[._-]?scene[s]?)\b/i;

export function isScscenQuery(t) {
  return SCSCEN_RE.test(t || '');
}

export async function buildScscenScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [sceneResults, scenarioR] = await Promise.allSettled([
      Promise.allSettled(
        SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr }).then(r => r.json())
        )
      ),
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    ]);

    const scenes = sceneResults.status === 'fulfilled'
      ? sceneResults.value.map((r, i) => ({
          id: SCENE_IDS[i],
          ...(r.status === 'fulfilled' ? r.value : {}),
        }))
      : SCENE_IDS.map(id => ({ id }));

    const scenarios = normaliseScenarios(scenarioR.status === 'fulfilled' ? scenarioR.value : []);
    const enriched = correlate(scenes, scenarios);
    const scripted = enriched.filter(s => s._scripted).length;
    const unplanned = enriched.length - scripted;
    const topUnplanned = enriched
      .filter(s => !s._scripted)
      .slice(0, 4)
      .map(s => s.title || sceneLabel(s.id))
      .join(', ') || 'none';

    return (
      `Scene × Scenario Coverage: ${scenes.length} cinematic operational scenes cross-matched against ` +
      `${scenarios.length} active scenarios. ${scripted} scenes are SCRIPTED (scenario planning found); ` +
      `${unplanned} scenes are UNPLANNED (no scenario covers this domain — action gap). ` +
      `Top unplanned scenes: ${topUnplanned}.`
    );
  } catch {
    return 'Scene × Scenario Coverage assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.scenarios)          ? raw.scenarios
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || s.scenario_id || String(i),
    name:        s.name        || s.title       || s.label || `Scenario ${i + 1}`,
    status:      s.status      || s.state       || '',
    category:    s.category    || s.type        || s.domain || '',
    description: (s.description || s.summary   || s.details || s.objective || '').toString().slice(0, 300),
    tags:        Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function anchorTokens(scene) {
  const anchors = scene.anchors || scene.anchor_points || scene.data || [];
  const anchorText = Array.isArray(anchors)
    ? anchors.map(a => `${a.label || a.name || ''} ${a.description || a.value || ''}`).join(' ')
    : '';
  return new Set([
    ...tokens(scene.title),
    ...tokens(scene.name),
    ...tokens(scene.description),
    ...tokens(String(scene.id || '').replace(/_/g, ' ')),
    ...tokens(anchorText),
  ].filter(Boolean));
}

function matchScore(scene, scenario) {
  const sceneToks = anchorTokens(scene);
  const scenarioToks = [
    ...tokens(scenario.name),
    ...tokens(scenario.description),
    ...tokens(scenario.category),
    ...tokens(scenario.tags),
  ].filter(Boolean);
  if (!sceneToks.size || !scenarioToks.length) return 0;
  let hits = 0;
  for (const t of scenarioToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, scenarioToks.length);
}

function correlate(scenes, scenarios) {
  return scenes.map(scene => {
    const scored = scenarios
      .map(sc => ({ ...sc, _score: matchScore(scene, sc) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...scene, _matches: scored, _scripted: scored.length > 0 };
  });
}

function sceneLabel(id) {
  return String(id || '').replace(/^\d+_/, '').replace(/_/g, ' ').toUpperCase();
}

function statusColor(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('active') || s.includes('running') || s.includes('live'))  return '#22c55e';
  if (s.includes('pend')   || s.includes('queue')   || s.includes('draft')) return '#facc15';
  if (s.includes('complet') || s.includes('done')   || s.includes('closed'))return '#94a3b8';
  if (s.includes('fail')   || s.includes('error')   || s.includes('abort')) return '#f87171';
  return '#64748b';
}

// ── styles ────────────────────────────────────────────────────────────────────

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ['ALL', 'SCRIPTED', 'UNPLANNED'];

export default function SceneScenarioCoverage() {
  const [open,       setOpen]       = useState(false);
  const [scenes,     setScenes]     = useState([]);
  const [scenarios,  setScenarios]  = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState('');
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [sceneResults, scenarioR] = await Promise.allSettled([
        Promise.allSettled(
          SCENE_IDS.map(id =>
            fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr }).then(r => r.json())
          )
        ),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawScenes = sceneResults.status === 'fulfilled'
        ? sceneResults.value.map((r, i) => ({
            id: SCENE_IDS[i],
            ...(r.status === 'fulfilled' ? r.value : {}),
          }))
        : SCENE_IDS.map(id => ({ id }));
      const rawScenarios = normaliseScenarios(scenarioR.status === 'fulfilled' ? scenarioR.value : []);
      setScenes(rawScenes);
      setScenarios(rawScenarios);
      setEnriched(correlate(rawScenes, rawScenarios));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:scscen-toggle', h);
    return () => window.removeEventListener('jarvis:scscen-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const scripted  = enriched.filter(s => s._scripted).length;
    const unplanned = enriched.filter(s => !s._scripted).length;
    const prompt =
      `Scene × Scenario Coverage: ${scenes.length} cinematic operational scenes cross-matched against ` +
      `${scenarios.length} active scenarios. ${scripted} scenes are SCRIPTED (scenario planning coverage found); ` +
      `${unplanned} scenes are UNPLANNED (no scenario covers this operational domain — action gap). ` +
      `Unplanned domains: ${enriched.filter(s => !s._scripted).map(s => s.title || sceneLabel(s.id)).slice(0, 5).join(', ') || 'none'}. ` +
      `Give a 2-sentence scene-scenario readiness brief: which operational areas have scenario planning, ` +
      `and where are the critical gaps requiring immediate scenario development.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const unplannedCount = enriched.filter(s => !s._scripted).length;
  const badgeColor     = unplannedCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(scene => {
    const label = (scene.title || sceneLabel(scene.id)).toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'SCRIPTED')  return scene._scripted;
    if (tab === 'UNPLANNED') return !scene._scripted;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Scenario Coverage"
        style={{
          position: 'fixed',
          left: 686320,
          bottom: 8,
          zIndex: 254,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: unplannedCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        SCSCEN
        {unplannedCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unplannedCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9100,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(245,158,11,0.12)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ SCENE × SCENARIO COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${scenes.length} scenes · ${scenarios.length} scenarios`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES',    val: enriched.length,                         color: '#94a3b8' },
              { label: 'SCENARIOS', val: scenarios.length,                         color: '#94a3b8' },
              { label: 'SCRIPTED',  val: enriched.filter(s => s._scripted).length, color: '#22c55e' },
              { label: 'UNPLANNED', val: unplannedCount,                           color: AM },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? AM : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#000' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map((scene) => {
              const label    = scene.title || sceneLabel(scene.id);
              const isExp    = expanded === scene.id;
              const stateClr = scene._scripted ? '#22c55e' : AM;
              return (
                <div key={scene.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : scene.id)}
                    style={{ ...ROW, background: isExp ? 'rgba(245,158,11,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(245,158,11,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stateClr + '22', color: stateClr }}>
                        {scene._scripted ? 'SCRIPTED' : 'UNPLANNED'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                      {scene._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 'auto' }}>
                          {scene._matches.length} scenario{scene._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched scenarios */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {scene._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>No scenario matches — action gap in this domain.</div>
                      ) : (
                        scene._matches.map((sc) => (
                          <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ ...PILL, background: statusColor(sc.status) + '22', color: statusColor(sc.status) }}>
                              {sc.status || 'UNKNOWN'}
                            </span>
                            {sc.category && (
                              <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{sc.category}</span>
                            )}
                            <span style={{ fontSize: 11, flex: 1 }}>{sc.name}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, sc._score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(sc._score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess + assessment */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${AM}44`,
                background: assessing ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)',
                color: AM, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              }}
            >
              {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
