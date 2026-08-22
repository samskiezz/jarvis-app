import { useState, useEffect, useCallback } from 'react';

const API = '';

const TKINV_RE = /\b(task[._-]?invest(?:igation)?|invest(?:igation)?[._-]?task|tkinv|investigated[._-]?tasks?|task[._-]?investigation[._-]?coverage|which[._-]?tasks?[._-]?(have|with)[._-]?(invest|cases?)|task[._-]?case[._-]?coverage|unchecked[._-]?tasks?|task[._-]?oversight)\b/i;

export function isTinvQuery(t) { return TKINV_RE.test(t || ''); }
export function isTkinvQuery(t) { return TKINV_RE.test(t || ''); }

export async function buildTinvScript() {
  return buildTkinvScript();
}

export async function buildTkinvScript() {
  const [taskR, invR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const tasks          = normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []);
  const investigations = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
  const enriched       = correlate(tasks, investigations);
  const investigated   = enriched.filter(t => t._investigated).length;
  const unchecked      = enriched.length - investigated;
  return (
    `Task × Investigation Coverage: ${tasks.length} tasks, ${investigations.length} investigations indexed. ` +
    `${investigated} tasks are INVESTIGATED (active investigation backing found); ${unchecked} are UNCHECKED (no investigation — oversight gap). ` +
    `Top investigated: ${enriched.filter(t => t._investigated).slice(0, 4).map(t => t.name || t.title || t.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:          t.id || String(i),
    name:        t.name || t.title || t.task || `Task ${i + 1}`,
    description: String(t.description || t.summary || t.detail || t.mission || '').slice(0, 300),
    status:      t.status || t.state || '',
    priority:    t.priority || t.urgency || t.severity || '',
    tags:        Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:          inv.id || String(i),
    name:        inv.name || inv.title || inv.subject || `Case ${i + 1}`,
    description: String(inv.description || inv.summary || inv.narrative || inv.brief || '').slice(0, 300),
    status:      inv.status || inv.state || inv.phase || '',
    kind:        inv.kind || inv.type || inv.category || '',
    seeds:       Array.isArray(inv.seeds) ? inv.seeds.length : (inv.seed_count || 0),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(task, inv) {
  const taskToks = new Set([
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.priority),
    ...tokens(task.tags),
  ].filter(Boolean));
  const invToks = [
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.kind),
  ].filter(Boolean);
  if (!taskToks.size || !invToks.length) return 0;
  let hits = 0;
  for (const t of invToks) if (taskToks.has(t)) hits++;
  return hits / Math.max(taskToks.size, invToks.length);
}

function correlate(tasks, investigations) {
  return tasks.map(task => {
    const scored = investigations
      .map(inv => ({ ...inv, _score: matchScore(task, inv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...task, _investigated: scored.length > 0, _matches: scored };
  });
}

function invStatusColor(st) {
  const s = String(st || '').toLowerCase();
  if (s.includes('open') || s.includes('active') || s.includes('live'))  return '#22c55e';
  if (s.includes('pend') || s.includes('review') || s.includes('hold'))  return '#facc15';
  if (s.includes('close') || s.includes('resolv') || s.includes('done')) return '#6E8AA0';
  return '#94a3b8';
}

function priorityColor(p) {
  const s = String(p || '').toLowerCase();
  if (s.includes('crit') || s.includes('high')) return '#ef4444';
  if (s.includes('med'))                         return '#facc15';
  if (s.includes('low'))                         return '#22c55e';
  return '#94a3b8';
}

const PANEL_W = 580;
const PANEL_H = 560;
const VL = '#A78BFA';
const AM = '#F59E0B';
const GR = '#22C55E';
const CY = '#00CFFF';

const chip = (label, color = VL) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = VL) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function TaskInvestigationCorrelator() {
  const [open, setOpen]             = useState(false);
  const [tasks, setTasks]           = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [brief, setBrief]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskR, invR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      setTasks(normaliseTasks(taskR.status === 'fulfilled' ? taskR.value : []));
      setInvestigations(normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tinv-toggle', onToggle);
    window.addEventListener('jarvis:tkinv-toggle', onToggle);
    return () => {
      window.removeEventListener('jarvis:tinv-toggle', onToggle);
      window.removeEventListener('jarvis:tkinv-toggle', onToggle);
    };
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched     = correlate(tasks, investigations);
  const investigated = enriched.filter(t => t._investigated);
  const unchecked    = enriched.filter(t => !t._investigated);
  const badgeCount   = investigated.length;
  const badgeColor   = badgeCount > 0 ? VL : GR;

  const filtered = enriched
    .filter(t => tab === 'ALL' || (tab === 'INVESTIGATED' ? t._investigated : !t._investigated))
    .filter(t => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(t.name || '').toLowerCase().includes(s) ||
        String(t.description || '').toLowerCase().includes(s) ||
        String(t.priority || '').toLowerCase().includes(s) ||
        String(t.status || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${tasks.length} tasks and ${investigations.length} open investigations. ` +
            `${investigated.length} tasks are INVESTIGATED (active investigation backing found); ` +
            `${unchecked.length} are UNCHECKED (no investigation linkage — oversight gap). ` +
            `Give a 2-sentence task-investigation coverage brief highlighting the most significant pattern or gap.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const taskLabel = t => t.name || t.title || t.id || '?';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Investigation Correlator"
        style={{
          position: 'fixed', bottom: 8, left: 707040, zIndex: 291,
          background: '#0d1829', border: `1px solid ${VL}55`, borderRadius: 6,
          color: VL, fontSize: 10, letterSpacing: 1, padding: '3px 8px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        ◈ TKINV
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#0d1829', borderRadius: 8,
            padding: '0 5px', fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 24, zIndex: 9291,
      width: PANEL_W, maxHeight: PANEL_H,
      background: 'rgba(10,18,32,0.97)', border: `1px solid ${VL}44`,
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', overflow: 'hidden',
      boxShadow: `0 0 32px ${VL}22`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${VL}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: VL, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ TASK × INVESTIGATION CORRELATOR
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#6E8AA0', fontSize: 9 }}>LOADING…</span>}
          <button onClick={assess} disabled={assessing} style={{
            background: assessing ? '#1a2535' : `${VL}22`, border: `1px solid ${VL}44`,
            color: VL, fontSize: 9, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
          }}>▶ ASSESS</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${VL}22` }}>
        {[
          { label: 'TASKS',          val: tasks.length,           col: CY },
          { label: 'INVESTIGATIONS', val: investigations.length,  col: AM },
          { label: 'INVESTIGATED',   val: investigated.length,    col: VL },
          { label: 'UNCHECKED',      val: unchecked.length,       col: '#ef4444' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: `${col}0d`, border: `1px solid ${col}33`, borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${VL}22`, alignItems: 'center' }}>
        {['ALL', 'INVESTIGATED', 'UNCHECKED'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${VL}22` : 'none',
            border: `1px solid ${tab === t ? VL : '#2a3a4a'}`,
            color: tab === t ? VL : '#6E8AA0',
            fontSize: 9, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{ marginLeft: 'auto', background: '#0d1829', border: '1px solid #1a2535', color: '#94a3b8', fontSize: 10, padding: '2px 8px', borderRadius: 4, width: 120 }}
        />
      </div>

      {/* ASSESS brief */}
      {brief && (
        <div style={{ padding: '6px 14px', background: `${VL}0d`, borderBottom: `1px solid ${VL}22`, color: '#94a3b8', fontSize: 10, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {filtered.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', marginTop: 24 }}>
            {loading ? 'Loading…' : 'No tasks match the current filter.'}
          </div>
        )}
        {filtered.map(task => (
          <div key={task.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                background: '#0d1829', border: `1px solid ${task._investigated ? VL + '44' : '#1a2535'}`,
                borderRadius: 6, cursor: 'pointer',
              }}
            >
              <span style={{ color: task._investigated ? VL : '#ef4444', fontSize: 9, minWidth: 16 }}>
                {task._investigated ? '●' : '○'}
              </span>
              <span style={{ color: '#e2e8f0', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {taskLabel(task)}
              </span>
              {task.priority && chip(task.priority.toUpperCase(), priorityColor(task.priority))}
              {task.status && (
                <span style={{ color: '#6E8AA0', fontSize: 9 }}>{task.status}</span>
              )}
              <span style={{ color: task._investigated ? VL : '#ef4444', fontSize: 9, minWidth: 60, textAlign: 'right' }}>
                {task._investigated ? `${task._matches.length} case${task._matches.length !== 1 ? 's' : ''}` : 'UNCHECKED'}
              </span>
              <span style={{ color: '#6E8AA0', fontSize: 9 }}>{expanded === task.id ? '▲' : '▼'}</span>
            </div>

            {expanded === task.id && (
              <div style={{ marginTop: 2, padding: '6px 10px', background: '#080f1a', borderRadius: '0 0 6px 6px', border: `1px solid ${VL}22`, borderTop: 'none' }}>
                {task.description && (
                  <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                    {task.description.slice(0, 200)}
                  </div>
                )}
                {task._investigated ? (
                  task._matches.map((inv, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ color: invStatusColor(inv.status), fontSize: 9, minWidth: 8 }}>●</span>
                      <span style={{ color: '#94a3b8', fontSize: 9, flex: 1 }}>{inv.name}</span>
                      {inv.kind && chip(inv.kind, AM)}
                      {inv.seeds > 0 && <span style={{ color: '#6E8AA0', fontSize: 8 }}>{inv.seeds}s</span>}
                      {scorebar(inv._score, VL)}
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#ef4444', fontSize: 9, letterSpacing: 1 }}>
                    ⚠ NO INVESTIGATION BACKING — OVERSIGHT GAP
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 14px', borderTop: `1px solid ${VL}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#3a5060', fontSize: 8 }}>
          /entities/Task × /v1/investigations · 90s auto-refresh
        </span>
        <span style={{ color: '#3a5060', fontSize: 8 }}>◈ TKINV</span>
      </div>
    </div>
  );
}
