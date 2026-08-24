import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCENE_IDS = [
  '01_command_atrium','02_neural_bridge','03_threat_matrix',
  '04_quantum_core','05_data_vault','06_field_ops','07_comms_hub',
  '08_analytics_grid','09_strategic_ops','10_deep_intel',
];

const SIPTRI_RE = /\b(siptri|scene[._-]?intel[._-]?task|scene intel profile task|intel task scene|scene.*intel.*task|task.*intel.*scene|defended scene|scene defence|undefended scene)\b/i;
export function isSiptriQuery(t) { return SIPTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function anchorTokens(scene) {
  const parts = [];
  if (scene.title) parts.push(...tok(scene.title));
  if (scene.name) parts.push(...tok(scene.name));
  if (scene.description) parts.push(...tok(scene.description));
  const anchors = scene.anchors || scene.anchor_points || [];
  for (const a of anchors) {
    if (typeof a === 'string') parts.push(...tok(a));
    else if (a && typeof a === 'object') {
      ['text', 'label', 'title', 'name', 'description'].forEach(k => { if (a[k]) parts.push(...tok(a[k])); });
    }
  }
  return [...new Set(parts)];
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const k of ['items', 'data', 'results', 'records', 'entities']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    return Object.values(raw);
  }
  return [];
}

function normProfiles(raw) {
  return normaliseArray(raw).map(p => {
    const o = p || {};
    return {
      id: o.id || o._id || o.profile_id || String(Math.random()),
      name: o.name || o.subject || o.title || o.label || 'Unknown',
      role: o.role || o.type || o.category || '',
      org: o.org || o.organization || o.affiliation || '',
      desc: o.description || o.summary || o.notes || '',
      tags: (o.tags || o.labels || o.keywords || []).join(' '),
    };
  });
}

function normTasks(raw) {
  return normaliseArray(raw).map(t => {
    const o = t || {};
    return {
      id: o.id || o._id || o.task_id || String(Math.random()),
      name: o.name || o.title || o.label || 'Task',
      status: o.status || o.state || '',
      type: o.type || o.category || '',
      desc: o.description || o.notes || o.summary || '',
      tags: (o.tags || o.labels || []).join(' '),
    };
  });
}

function matchScore(sceneToks, itemToks) {
  if (!sceneToks.length || !itemToks.length) return 0;
  const sSet = new Set(sceneToks);
  const shared = itemToks.filter(t => sSet.has(t)).length;
  return shared / Math.max(sceneToks.length, itemToks.length);
}

const THRESHOLD = 0.1;

function correlate(scenes, profiles, tasks) {
  return scenes.map(scene => {
    const sToks = anchorTokens(scene);
    const sceneId = scene.id || scene.scene_id || '';
    const sceneLabel = scene.name || scene.title || sceneId;

    let bestProfile = null, bestProfileScore = 0;
    for (const p of profiles) {
      const pToks = tok(`${p.name} ${p.role} ${p.org} ${p.desc} ${p.tags}`);
      const s = matchScore(sToks, pToks);
      if (s > bestProfileScore) { bestProfileScore = s; bestProfile = p; }
    }

    let bestTask = null, bestTaskScore = 0;
    for (const t of tasks) {
      const tToks = tok(`${t.name} ${t.type} ${t.status} ${t.desc} ${t.tags}`);
      const s = matchScore(sToks, tToks);
      if (s > bestTaskScore) { bestTaskScore = s; bestTask = t; }
    }

    const hasProfile = bestProfileScore >= THRESHOLD;
    const hasTask = bestTaskScore >= THRESHOLD;

    let state;
    if (hasProfile && hasTask) state = 'FULLY DEFENDED';
    else if (hasProfile) state = 'PROFILED';
    else if (hasTask) state = 'TASKED';
    else state = 'UNDEFENDED';

    return {
      sceneId, sceneLabel, state,
      profile: hasProfile ? bestProfile : null, profileScore: bestProfileScore,
      task: hasTask ? bestTask : null, taskScore: bestTaskScore,
    };
  });
}

export async function buildSiptriScript() {
  const BASE = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
  try {
    const [scenesData, profilesData, tasksData] = await Promise.all([
      Promise.all(SCENE_IDS.map(id =>
        fetch(`${BASE}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : { id }).catch(() => ({ id }))
      )),
      fetch(`${BASE}/entities/IntelProfile`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${BASE}/entities/Task`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    const profiles = normProfiles(profilesData);
    const tasks = normTasks(tasksData);
    const rows = correlate(scenesData, profiles, tasks);
    const defended = rows.filter(r => r.state === 'FULLY DEFENDED').length;
    const profiled = rows.filter(r => r.state === 'PROFILED').length;
    const tasked = rows.filter(r => r.state === 'TASKED').length;
    const undefended = rows.filter(r => r.state === 'UNDEFENDED').length;
    const lines = rows.map(r =>
      `${r.sceneLabel}: ${r.state}${r.profile ? ` | Intel: ${r.profile.name}` : ''}${r.task ? ` | Task: ${r.task.name}` : ''}`
    );
    return `Scene × IntelProfile × Task Defence Coverage (SIPTRI)\n` +
      `Profiles: ${profiles.length} | Tasks: ${tasks.length} | Scenes: ${rows.length}\n` +
      `FULLY DEFENDED: ${defended} | PROFILED: ${profiled} | TASKED: ${tasked} | UNDEFENDED: ${undefended}\n\n` +
      lines.join('\n');
  } catch (e) {
    return `SIPTRI error: ${e.message}`;
  }
}

const STATE_COLOR = {
  'FULLY DEFENDED': '#39FF14',
  'PROFILED': '#29E7FF',
  'TASKED': '#FFD700',
  'UNDEFENDED': '#FF4444',
};
const STATE_ORDER = ['FULLY DEFENDED', 'PROFILED', 'TASKED', 'UNDEFENDED'];

export default function SceneIntelProfileTaskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scenesData, profilesData, tasksData] = await Promise.all([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : { id }).catch(() => ({ id }))
        )),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const profiles = normProfiles(profilesData);
      const tasks = normTasks(tasksData);
      setRows(correlate(scenesData, profiles, tasks));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:siptri-toggle', handler);
    return () => window.removeEventListener('jarvis:siptri-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildSiptriScript();
      const resp = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev-key' },
        body: JSON.stringify({ message: `Analyse this SIPTRI defence coverage and identify which scenes are most exposed:\n\n${script}` }),
      });
      const j = await resp.json();
      const txt = j.response || j.message || j.content || JSON.stringify(j);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } finally {
      setAssessing(false);
    }
  }

  const counts = STATE_ORDER.reduce((acc, s) => { acc[s] = rows.filter(r => r.state === s).length; return acc; }, {});
  const undefended = counts['UNDEFENDED'] || 0;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.sceneLabel.toLowerCase().includes(q) &&
          !(r.profile?.name || '').toLowerCase().includes(q) &&
          !(r.task?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 765840, bottom: 8, zIndex: 396,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #FF4444',
          color: '#FF4444', fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, padding: '3px 8px', cursor: 'pointer',
          borderRadius: 3, textTransform: 'uppercase',
        }}
      >
        SIPTRI{undefended > 0 && <span style={{ marginLeft: 4, background: '#FF4444', color: '#000', borderRadius: 2, padding: '0 4px', fontSize: 8 }}>{undefended}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 765840, bottom: 44, zIndex: 396, width: 520,
      background: 'rgba(5,8,13,0.95)', border: '1px solid #FF4444',
      borderRadius: 8, fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      boxShadow: '0 0 40px #FF444422',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #FF444433' }}>
        <span style={{ color: '#FF4444', fontSize: 10, letterSpacing: 3, flex: 1 }}>SIPTRI · SCENE × INTEL × TASK</span>
        {loading && <span style={{ fontSize: 8, color: '#6E8AA0' }}>LOADING…</span>}
        <button onClick={assess} disabled={assessing} style={{ fontSize: 8, padding: '2px 7px', background: 'transparent', border: '1px solid #FF4444', color: '#FF4444', borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ fontSize: 10, background: 'transparent', border: 'none', color: '#6E8AA0', cursor: 'pointer' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: `1px solid ${STATE_COLOR[s]}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, color: STATE_COLOR[s], fontWeight: 700 }}>{counts[s] || 0}</div>
            <div style={{ fontSize: 7, color: '#6E8AA0', letterSpacing: 1 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ height: 4, display: 'flex', margin: '0 12px 8px' }}>
          {STATE_ORDER.map(s => (counts[s] || 0) > 0 && (
            <div key={s} style={{ flex: counts[s], background: STATE_COLOR[s], opacity: 0.8 }} />
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            fontSize: 8, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
            background: filter === s ? (STATE_COLOR[s] || '#29E7FF') : 'transparent',
            border: `1px solid ${STATE_COLOR[s] || '#29E7FF'}`,
            color: filter === s ? '#000' : (STATE_COLOR[s] || '#29E7FF'),
          }}>{s === 'ALL' ? `ALL (${rows.length})` : s.split(' ').map(w => w[0]).join('')}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="filter scenes / profiles / tasks…"
          style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid #1E3A4A', borderRadius: 3, padding: '3px 7px', color: '#DCEBF5', fontSize: 9, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ maxHeight: 280, overflowY: 'auto', padding: '0 12px 8px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#6E8AA0', fontSize: 9, textAlign: 'center', padding: 16 }}>no scenes match</div>
        ) : visible.map((r, i) => (
          <div key={r.sceneId || i} style={{ padding: '5px 8px', marginBottom: 4, background: 'rgba(0,0,0,0.35)', borderRadius: 4, borderLeft: `3px solid ${STATE_COLOR[r.state]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 700 }}>{r.sceneLabel}</span>
              <span style={{ fontSize: 8, color: STATE_COLOR[r.state], letterSpacing: 1 }}>{r.state}</span>
            </div>
            {r.profile && (
              <div style={{ fontSize: 8, color: '#29E7FF', marginTop: 2 }}>
                ◈ {r.profile.name}{r.profile.role ? ` · ${r.profile.role}` : ''} <span style={{ color: '#6E8AA0' }}>({(r.profileScore * 100).toFixed(0)}%)</span>
              </div>
            )}
            {r.task && (
              <div style={{ fontSize: 8, color: '#FFD700', marginTop: 1 }}>
                ⚑ {r.task.name}{r.task.status ? ` [${r.task.status}]` : ''} <span style={{ color: '#6E8AA0' }}>({(r.taskScore * 100).toFixed(0)}%)</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #FF444422', padding: '5px 12px', display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#6E8AA0' }}>
        <span>SIPTRI · auto-refresh 120s</span>
        <span>{rows.length} scenes · {counts['FULLY DEFENDED'] || 0} defended</span>
      </div>
    </div>
  );
}
