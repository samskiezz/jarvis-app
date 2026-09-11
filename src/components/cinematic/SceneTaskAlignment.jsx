/**
 * F440 — Scene × Task Intelligence Alignment (SITA)
 *
 * Answers: "Which of the 10 cinematic intelligence scenes have active tasks
 * tracking them — and which are flying blind with no operational footprint?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/cinematic/scene/{id}  × 10 → scene anchor data (keys/values/metadata)
 *   GET /entities/Task             → task catalog (name, description, status, priority)
 *
 * Classification:
 *   TASKED   — scene keyword-matches ≥1 active task
 *   UNMAPPED — no task references this scene's anchors
 *
 * Stat tiles:  scenes / tasks / tasked / unmapped
 * Amber badge: unmapped count on button
 * Expand row:  matched tasks with priority/status badge + relevance score bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ SITA  at left:7500 bottom:18, zIndex:68
 * Event:   jarvis:sita-toggle
 * Voice:   "scene task / task scene / sita / tasked scenes / unmapped scenes /
 *           cinematic task / scene task alignment / which scenes have tasks"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const SCENE_IDS = [
  '01_command_atrium', '02_intelligence_nexus', '03_threat_matrix',
  '04_operations_center', '05_data_sanctum', '06_entity_vault',
  '07_scenario_forge', '08_graph_observatory', '09_oracle_chamber',
  '10_apex_sanctum',
];

const FILTERS      = ['ALL', 'TASKED', 'UNMAPPED'];
const CLASS_COLOR  = { TASKED: GR, UNMAPPED: AM };

const PRIORITY_COLOR = {
  CRITICAL: RD,
  HIGH:     '#F97316',
  MEDIUM:   AM,
  LOW:      GR,
  NORMAL:   CY,
};

const STATUS_COLOR = {
  IN_PROGRESS: CY,
  ACTIVE:      CY,
  PENDING:     AM,
  DONE:        GR,
  COMPLETED:   GR,
  BLOCKED:     RD,
  CANCELLED:   MU,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const SITA_RE =
  /\b(scene[._-]?task|task[._-]?scene|sita|tasked[._-]?scenes?|unmapped[._-]?scenes?|cinematic[._-]?task|scene[._-]?task[._-]?align|which[._-]?scenes?[._-]?have[._-]?tasks?|scene[._-]?alignment)\b/i;

export function isSitaQuery(t) {
  return SITA_RE.test(t || '');
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function extractSceneTokens(sceneData) {
  const tokens = new Set();
  const add = v => {
    if (!v) return;
    String(v).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).forEach(w => {
      if (w.length > 2) tokens.add(w);
    });
  };
  const walk = obj => {
    if (!obj || typeof obj !== 'object') { add(obj); return; }
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    Object.entries(obj).forEach(([k, v]) => { add(k); walk(v); });
  };
  walk(sceneData);
  return tokens;
}

function normTasks(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.tasks ?? raw?.data ?? []);
  return arr.map(t => ({
    id:       t.id ?? t._id ?? String(Math.random()),
    name:     t.name ?? t.title ?? '(task)',
    status:   (t.status ?? 'PENDING').toString().toUpperCase(),
    priority: (t.priority ?? 'NORMAL').toString().toUpperCase(),
    tags:     [t.name, t.description, t.tags, t.category, t.objective]
               .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function keywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(sceneTokens, taskTags) {
  const tk = keywords(taskTags);
  return [...sceneTokens].filter(w => tk.includes(w)).length;
}

function sceneLabel(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── async helpers ────────────────────────────────────────────────────────────
async function fetchScene(id) {
  try {
    const r = await fetch(`${API}/v1/cinematic/scene/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchTasks() {
  const r = await fetch(`${API}/entities/Task?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`Tasks ${r.status}`);
  return r.json();
}

// ─── build script for JarvisBrain ────────────────────────────────────────────
export async function buildSitaScript() {
  try {
    const [scenesRaw, tasksRaw] = await Promise.all([
      Promise.all(SCENE_IDS.map(fetchScene)),
      fetchTasks(),
    ]);
    const tasks = normTasks(tasksRaw);
    let tasked = 0, unmapped = 0;
    scenesRaw.forEach((sd, i) => {
      if (!sd) { unmapped++; return; }
      const tokens = extractSceneTokens(sd);
      const matched = tasks.filter(t => relevance(tokens, t.tags) > 0).length;
      if (matched > 0) tasked++; else unmapped++;
    });
    const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `SITA Scene-Task Alignment: ${tasked} of ${SCENE_IDS.length} cinematic scenes have matching active tasks; ${unmapped} scenes have no task coverage (unmapped). Total tasks: ${tasks.length}. Provide a 2-sentence operational alignment brief.`,
        system_prompt: 'You are JARVIS. Be direct and technical. 2 sentences maximum.',
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response ?? d.message ?? d.content ?? `${tasked} scenes tasked, ${unmapped} unmapped across ${tasks.length} total tasks.`;
    }
  } catch {}
  return 'Scene-task alignment data unavailable. Check /v1/cinematic/scene/* and /entities/Task endpoints.';
}

// ─── component ───────────────────────────────────────────────────────────────
export default function SceneTaskAlignment() {
  const [open,     setOpen]     = useState(false);
  const [scenes,   setScenes]   = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState('ALL');
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [brief,    setBrief]    = useState('');
  const [assessing,setAssessing]= useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [scenesRaw, tasksRaw] = await Promise.all([
        Promise.all(SCENE_IDS.map(fetchScene)),
        fetchTasks(),
      ]);
      const allTasks = normTasks(tasksRaw);
      setTasks(allTasks);

      const enriched = SCENE_IDS.map((id, i) => {
        const sd    = scenesRaw[i];
        const label = sceneLabel(id);
        if (!sd) {
          return { id, label, _class: 'UNMAPPED', _tasks: [], _tokens: new Set() };
        }
        const tokens  = extractSceneTokens(sd);
        const matched = allTasks
          .map(t => ({ ...t, _score: relevance(tokens, t.tags) }))
          .filter(t => t._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5);
        return {
          id,
          label,
          _class:  matched.length > 0 ? 'TASKED' : 'UNMAPPED',
          _tasks:  matched,
          _tokens: tokens,
        };
      });
      setScenes(enriched);
    } catch (e) {
      setError(e.message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:sita-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sita-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildSitaScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const tasked   = scenes.filter(s => s._class === 'TASKED').length;
  const unmapped = scenes.filter(s => s._class === 'UNMAPPED').length;

  const visible = scenes.filter(s => {
    if (filter !== 'ALL' && s._class !== filter) return false;
    if (search && !s.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scene × Task Intelligence Alignment (SITA)"
        style={{
          position: 'fixed', left: 7500, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${unmapped > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ SITA
        {unmapped > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{unmapped}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 680, maxHeight: '76vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SCENE × TASK INTELLIGENCE ALIGNMENT
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${AM}`, borderRadius: 4, color: AM, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: `1px solid ${MU}`, borderRadius: 4, color: MU, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, fontFamily: MONO, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'SCENES',  value: scenes.length, color: CY },
          { label: 'TASKS',   value: tasks.length,  color: '#94A3B8' },
          { label: 'TASKED',  value: tasked,         color: GR },
          { label: 'UNMAPPED',value: unmapped,        color: AM },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.07)', borderBottom: `1px solid ${BD}`, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', color: RD, fontSize: 10 }}>{error}</div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? AM : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            borderRadius: 4, color: filter === f ? '#000' : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 8px', cursor: 'pointer',
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scene…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 4, color: '#CBD5E1', fontFamily: MONO, fontSize: 10, padding: '2px 8px', width: 130, outline: 'none' }}
        />
      </div>

      {/* Scene rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && scenes.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>Loading scenes…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>No scenes match filter.</div>
        )}
        {visible.map(s => {
          const classColor = CLASS_COLOR[s._class] ?? MU;
          const isEx = expanded[s.id];
          return (
            <div key={s.id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [s.id]: !p[s.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: MU, fontSize: 9, minWidth: 28 }}>{s.id.split('_')[0]}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                {s._class === 'TASKED' && (
                  <span style={{ color: MU, fontSize: 9 }}>{s._tasks.length} task{s._tasks.length !== 1 ? 's' : ''}</span>
                )}
                <span style={{
                  background: classColor + '22',
                  color: classColor,
                  border: `1px solid ${classColor}`,
                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 6px',
                }}>{s._class}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${BD}` }}>
                  {s._tasks.length === 0 ? (
                    <div style={{ color: MU, fontSize: 10 }}>No tasks reference this scene's anchor data.</div>
                  ) : (
                    s._tasks.map(t => {
                      const prColor  = PRIORITY_COLOR[t.priority] ?? MU;
                      const stColor  = STATUS_COLOR[t.status]     ?? MU;
                      const maxScore = s._tasks[0]?._score || 1;
                      return (
                        <div key={t.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ background: prColor + '22', color: prColor, border: `1px solid ${prColor}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{t.priority}</span>
                            <span style={{ background: stColor + '22', color: stColor, border: `1px solid ${stColor}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{t.status}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            <span style={{ color: AM, fontSize: 9 }}>score {t._score}</span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((t._score / maxScore) * 100)}%`, background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: MU, fontSize: 9 }}>90 s auto-refresh · 10 scenes · {tasks.length} tasks</span>
        <span style={{ color: unmapped > 0 ? AM : GR, fontSize: 9, fontWeight: 700 }}>
          {unmapped > 0 ? `${unmapped} UNMAPPED` : 'ALL TASKED'}
        </span>
      </div>
    </div>
  );
}
