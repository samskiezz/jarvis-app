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

const SCTASK_RE = /\b(scene[._-]?task|task[._-]?scene|sctask|scene[._-]?operations?|scene[._-]?coverage|unattended[._-]?scenes?|scene[._-]?action|scene[._-]?work|which[._-]?scenes?[._-]?have[._-]?tasks?|scene[._-]?task[._-]?coverage|operational[._-]?scene[._-]?coverage|scenes?[._-]?without[._-]?tasks?|scene[._-]?operational[._-]?gap)\b/i;

export function isScTaskQuery(t) {
  return SCTASK_RE.test(t || '');
}

export async function buildScTaskScript() {
  const sceneResults = await Promise.allSettled(
    SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
  );
  const scenes = sceneResults.map((r, i) => ({
    id: SCENE_IDS[i],
    ...(r.status === 'fulfilled' ? r.value : {}),
  }));
  const tR = await fetch(`${API}/entities/Task`).then(r => r.json()).catch(() => []);
  const tasks = normaliseArray(tR, 'tasks');
  const enriched = correlate(scenes, tasks);
  const tasked = enriched.filter(s => s._matches.length > 0).length;
  const unattended = enriched.length - tasked;
  const topUnattended = enriched
    .filter(s => s._matches.length === 0)
    .slice(0, 4)
    .map(s => s.title || s.name || s.id || '?')
    .join(', ') || 'none';
  return (
    `Scene × Task Coverage: ${scenes.length} scenes, ${tasks.length} tasks indexed. ` +
    `${tasked} scenes have active task coverage (TASKED); ${unattended} scenes have no task addressing their domain (UNATTENDED). ` +
    `Top unattended scenes: ${topUnattended}.`
  );
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = ['tasks', 'items', 'results', 'data', 'records', 'entities'];
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
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
    ...tokens(scene.id),
    ...tokens(anchorText),
  ].filter(Boolean));
}

function matchScore(scene, task) {
  const sceneToks = anchorTokens(scene);
  const taskToks = [
    ...tokens(task.title),
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.type),
    ...tokens(task.status),
    ...tokens(task.priority),
  ].filter(Boolean);
  if (!sceneToks.size || !taskToks.length) return 0;
  let hits = 0;
  for (const t of taskToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, taskToks.length);
}

function correlate(scenes, tasks) {
  return scenes.map(scene => {
    const scored = tasks
      .map(task => ({ task, score: matchScore(scene, task) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...scene, _matches: scored, _tasked: scored.length > 0 };
  });
}

function sceneLabel(id) {
  return String(id || '').replace(/^\d+_/, '').replace(/_/g, ' ').toUpperCase();
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'done' || s === 'complete' || s === 'completed') return '#22c55e';
  if (s === 'in_progress' || s === 'active' || s === 'open') return '#60a5fa';
  if (s === 'blocked' || s === 'failed') return '#ef4444';
  if (s === 'pending' || s === 'queued') return '#f59e0b';
  return '#94a3b8';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function SceneTaskCoverage() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sceneResults, tR] = await Promise.allSettled([
        Promise.allSettled(
          SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
        ),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const rawScenes = sceneResults.status === 'fulfilled'
        ? sceneResults.value.map((r, i) => ({
            id: SCENE_IDS[i],
            ...(r.status === 'fulfilled' ? r.value : {}),
          }))
        : SCENE_IDS.map(id => ({ id }));
      const rawTasks = normaliseArray(
        tR.status === 'fulfilled' ? tR.value : [],
        'tasks'
      );
      setScenes(rawScenes);
      setTasks(rawTasks);
      setEnriched(correlate(rawScenes, rawTasks));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:sctask-toggle', h);
    return () => window.removeEventListener('jarvis:sctask-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const tasked = enriched.filter(s => s._tasked).length;
    const unattended = enriched.filter(s => !s._tasked).length;
    const prompt =
      `Scene × Task Coverage: ${scenes.length} cinematic operational scenes, ${tasks.length} active tasks. ` +
      `${tasked} scenes have at least one task covering their domain (TASKED); ${unattended} scenes have no task addressing their operational domain (UNATTENDED). ` +
      `Unattended scenes: ${enriched.filter(s => !s._tasked).map(s => s.title || sceneLabel(s.id)).slice(0, 5).join(', ') || 'none'}. ` +
      `Give a 2-sentence scene operational coverage brief.`;
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

  const unattendedCount = enriched.filter(s => !s._tasked).length;
  const badge = unattendedCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(scene => {
    const label = (scene.title || sceneLabel(scene.id)).toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'TASKED') return scene._tasked;
    if (tab === 'UNATTENDED') return !scene._tasked;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Task Coverage"
        style={{
          position: 'fixed',
          left: 72440,
          bottom: 8,
          zIndex: 139,
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
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: unattendedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SCTASK
        {unattendedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unattendedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ SCENE × TASK COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES', val: scenes.length, color: '#60a5fa' },
              { label: 'TASKS', val: tasks.length, color: '#a78bfa' },
              { label: 'TASKED', val: enriched.filter(s => s._tasked).length, color: '#22c55e' },
              { label: 'UNATTENDED', val: unattendedCount, color: unattendedCount > 0 ? '#f59e0b' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'TASKED', 'UNATTENDED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search scenes…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No scenes match the current filter.</div>
          )}

          <div>
            {visible.map((scene, i) => {
              const id = scene.id || i;
              const label = scene.title || sceneLabel(scene.id) || `Scene ${i + 1}`;
              const sub = scene.subtitle || scene.description || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: scene._tasked ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: scene._tasked ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${scene._tasked ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {scene._tasked ? 'TASKED' : 'UNATTENDED'}
                    </span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {scene._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{scene._matches.length} task{scene._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {sub && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(sub).slice(0, 200)}</div>
                      )}
                      {scene._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched tasks:</div>
                          {scene._matches.map(({ task, score }, j) => {
                            const taskLabel = task.title || task.name || task.id || `task-${j}`;
                            const taskStatus = task.status || '';
                            const taskType = task.type || task.kind || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#c4b5fd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taskLabel}</span>
                                  {taskType && (
                                    <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                                      {taskType}
                                    </span>
                                  )}
                                  {taskStatus && (
                                    <span style={{ ...PILL, background: `${statusColor(taskStatus)}22`, color: statusColor(taskStatus), border: `1px solid ${statusColor(taskStatus)}44` }}>
                                      {taskStatus}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No task covers this scene's operational domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} scenes · {tasks.length} tasks indexed · auto-refresh 120s
          </div>
        </div>
      )}
    </>
  );
}
