import { useState, useEffect, useCallback } from 'react';

const API = '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_neural_bridge',
  '03_threat_matrix',
  '04_quantum_core',
  '05_data_vault',
  '06_field_ops',
  '07_comms_hub',
  '08_analytics_grid',
  '09_strategic_ops',
  '10_deep_intel',
];

const SRTRI_RE = /\b(scene[._-]?risk[._-]?task|srtri|scene[._-]?defence|defended[._-]?scene|unprotected[._-]?scene|scene[._-]?triple|scene[._-]?task[._-]?risk|scene[._-]?defend|scene[._-]?risk[._-]?cover|risk[._-]?task[._-]?scene|scene[._-]?risk[._-]?task[._-]?coverage|scene[._-]?coverage[._-]?triple)\b/i;

export function isScrtriQuery(t) {
  return SRTRI_RE.test(t || '');
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function anchorTokens(scene) {
  const anchors = scene.anchors || scene.anchor_points || scene.data || [];
  const anchorText = Array.isArray(anchors)
    ? anchors.map(a => `${a.label || a.name || ''} ${a.description || a.value || ''}`).join(' ')
    : '';
  return new Set([
    ...tokens(scene.title || ''),
    ...tokens(scene.name || ''),
    ...tokens(scene.description || ''),
    ...tokens(scene.id || ''),
    ...tokens(anchorText),
  ].filter(Boolean));
}

function matchScore(sceneToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || other.label || ''),
    ...tokens(other.category || other.sector || other.type || other.kind || ''),
    ...tokens(other.description || other.desc || other.summary || ''),
    ...tokens(Array.isArray(other.tags) ? other.tags.join(' ') : (other.tags || '')),
  ].filter(Boolean);
  if (!sceneToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, otherToks.length);
}

function normaliseRiskSignals(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'riskSignals', 'signals', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:          r.id || String(i),
    name:        r.name || r.title || r.signal || `Signal ${i + 1}`,
    severity:    r.severity || r.level || r.priority || '',
    category:    r.category || r.type || '',
    description: String(r.description || r.summary || r.source || '').slice(0, 200),
    tags:        Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.name || t.title || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.mission || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function correlate(scenes, riskSignals, tasks) {
  return scenes.map(scene => {
    const sToks = anchorTokens(scene);
    const sceneLabel = scene.title || scene.name || scene.id || '?';

    const matchedRisks = riskSignals
      .map(r => ({ ...r, _score: matchScore(sToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(sToks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasRisk = matchedRisks.length > 0;
    const hasTask = matchedTasks.length > 0;

    let coverage;
    if (hasRisk && hasTask) coverage = 'FULLY DEFENDED';
    else if (hasRisk)       coverage = 'RISK-EXPOSED';
    else if (hasTask)       coverage = 'TASKED';
    else                    coverage = 'UNPROTECTED';

    return { ...scene, _label: sceneLabel, _risks: matchedRisks, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildScrtriScript() {
  const sceneResults = await Promise.allSettled(
    SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
  );
  const scenes = sceneResults.map((r, i) => ({
    id: SCENE_IDS[i],
    ...(r.status === 'fulfilled' ? r.value : {}),
  }));
  const [rR, tR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const riskSignals = normaliseRiskSignals(rR.status === 'fulfilled' ? rR.value : []);
  const tasks       = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
  const enriched    = correlate(scenes, riskSignals, tasks);
  const fd  = enriched.filter(s => s._coverage === 'FULLY DEFENDED').length;
  const re  = enriched.filter(s => s._coverage === 'RISK-EXPOSED').length;
  const tk  = enriched.filter(s => s._coverage === 'TASKED').length;
  const up  = enriched.filter(s => s._coverage === 'UNPROTECTED').length;
  const unprotectedNames = enriched.filter(s => s._coverage === 'UNPROTECTED').slice(0, 3).map(s => s._label).join(', ') || 'none';
  return (
    `Scene × Risk Signal × Task Triple Coverage: ${scenes.length} scenes cross-referenced against ${riskSignals.length} risk signals and ${tasks.length} tasks. ` +
    `${fd} scenes are FULLY DEFENDED (risk-aligned + task-backed); ${re} are RISK-EXPOSED (risk signal found, no task response); ` +
    `${tk} are TASKED (task exists, no risk signal); ${up} are UNPROTECTED (no risk or task coverage — operational gap). ` +
    `Unprotected scenes: ${unprotectedNames}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY DEFENDED': GR,
  'RISK-EXPOSED':   AM,
  'TASKED':         CY,
  'UNPROTECTED':    RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY DEFENDED', 'RISK-EXPOSED', 'TASKED', 'UNPROTECTED'];

export default function SceneRiskTaskTriple() {
  const [open, setOpen]         = useState(false);
  const [scenes, setScenes]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const sceneResults = await Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
      );
      const rawScenes = sceneResults.map((r, i) => ({
        id: SCENE_IDS[i],
        ...(r.status === 'fulfilled' ? r.value : {}),
      }));
      const [rR, tR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const rawRisks = normaliseRiskSignals(rR.status === 'fulfilled' ? rR.value : []);
      const rawTasks = normaliseTasks(tR.status === 'fulfilled' ? tR.value : []);
      setScenes(correlate(rawScenes, rawRisks, rawTasks));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:srtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:srtri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildScrtriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Scene × RiskSignal × Task triple coverage brief: ${brief}. Give a 2-sentence scene defence coverage assessment.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const upCount = scenes.filter(s => s._coverage === 'UNPROTECTED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scene × Risk Signal × Task Triple Coverage (SRTRI)"
        style={{
          position: 'fixed', left: 717120, bottom: 8, zIndex: 309,
          background: upCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${upCount > 0 ? RD : CY + '44'}`,
          color: upCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SRTRI{upCount > 0 ? ` ⚠${upCount}` : ''}
      </button>
    );
  }

  const fd = scenes.filter(s => s._coverage === 'FULLY DEFENDED').length;
  const re = scenes.filter(s => s._coverage === 'RISK-EXPOSED').length;
  const tk = scenes.filter(s => s._coverage === 'TASKED').length;
  const up = scenes.filter(s => s._coverage === 'UNPROTECTED').length;

  const visible = scenes.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s._label.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SCENE × RISK SIGNAL × TASK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SRTRI</span>
        {up > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {up} UNPROTECTED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SCENES',          scenes.length, CY],
          ['FULLY DEFENDED',  fd, GR],
          ['RISK-EXPOSED',    re, AM],
          ['TASKED',          tk, LM],
          ['UNPROTECTED',     up, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {scenes.length > 0 && [
            [fd, GR], [re, AM], [tk, LM], [up, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${scenes.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search scenes…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No scenes match filter.</div>}
        {visible.map(scene => {
          const color = COVERAGE_COLOR[scene._coverage] || CY;
          const isExp = expanded === scene.id;
          return (
            <div key={scene.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : scene.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scene._label}</span>
                <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{scene.id}</span>
                {chip(scene._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Risk signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({scene._risks.length})</div>
                    {scene._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk signal alignment</div>
                      : scene._risks.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && chip(r.severity, r.severity?.toLowerCase().includes('crit') ? RD : AM)}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({scene._tasks.length})</div>
                    {scene._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : scene._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, GR)}
                            {t.priority && chip(t.priority, t.priority?.toLowerCase().includes('high') || t.priority?.toLowerCase().includes('crit') ? RD : AM)}
                          </div>
                          <ScoreBar score={t._score} color={GR} />
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

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
