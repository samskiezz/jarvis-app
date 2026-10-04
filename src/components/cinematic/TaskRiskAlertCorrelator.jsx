import { useState, useEffect, useCallback } from 'react';

const API = '';
const TRAC_RE = /\b(task[._-]?alert|task[._-]?risk|trac|tasks[._-]?with[._-]?alert|exposed[._-]?task|alert[._-]?task|task[._-]?coverage|which[._-]?tasks[._-]?have[._-]?alert|task[._-]?alert[._-]?map)\b/i;

export function isTracQuery(t) {
  return TRAC_RE.test(t || '');
}

export async function buildTracScript() {
  const [taskR, alR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/v1/alerts`).then(r => r.json()),
  ]);
  const tasks = normaliseArray(taskR.status === 'fulfilled' ? taskR.value : []);
  const alerts = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
  const correlated = correlateTasks(tasks, alerts);
  const exposed = correlated.filter(t => t._exposed).length;
  const clear = correlated.filter(t => !t._exposed).length;
  const top = correlated.filter(t => t._exposed).slice(0, 4).map(t => t.title || t.name || t.id || '?').join(', ');
  return (
    `Task Risk Alert Correlator: ${tasks.length} tasks assessed against ${alerts.length} active alerts — ` +
    `${exposed} EXPOSED (matched alert), ${clear} CLEAR. ` +
    `Exposed tasks: ${top || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'tasks', 'alerts', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(aToks, candidateFields) {
  if (!aToks.length) return 0;
  const cToks = candidateFields.flatMap(f => tokens(f)).filter(Boolean);
  if (!cToks.length) return 0;
  const cSet = new Set(cToks);
  let hits = 0;
  for (const t of aToks) if (cSet.has(t)) hits++;
  return hits / Math.max(aToks.length, cToks.length);
}

function correlateTasks(tasks, alerts) {
  return tasks.map(task => {
    const title = task.title || task.name || task.label || task.description || task.id || '';
    const taskToks = tokens(title);

    const alertMatches = alerts
      .map(al => ({
        al,
        score: matchScore(taskToks, [al.type, al.category, al.message, al.source, al.resource, al.name]),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const exposed = alertMatches.length > 0;
    const topSev = alertMatches.length > 0
      ? (alertMatches[0].al.severity || alertMatches[0].al.level || '')
      : '';

    return { ...task, _title: title, _exposed: exposed, _alertMatches: alertMatches, _topSev: topSev };
  });
}

function sevColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '#ef4444';
  if (s === 'high' || s === 'error') return '#f97316';
  if (s === 'medium' || s === 'warning' || s === 'warn') return '#f59e0b';
  return '#60a5fa';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function TaskRiskAlertCorrelator() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [correlated, setCorrelated] = useState([]);
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
      const [taskR, alR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/v1/alerts`).then(r => r.json()),
      ]);
      const ts = normaliseArray(taskR.status === 'fulfilled' ? taskR.value : []);
      const als = normaliseArray(alR.status === 'fulfilled' ? alR.value : []);
      setTasks(ts);
      setAlerts(als);
      setCorrelated(correlateTasks(ts, als));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:trac-toggle', h);
    return () => window.removeEventListener('jarvis:trac-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const exposed = correlated.filter(t => t._exposed);
    const prompt =
      `Task Risk Alert Correlator: ${tasks.length} tasks, ${alerts.length} active alerts. ` +
      `${exposed.length} tasks EXPOSED (have alert coverage), ${correlated.length - exposed.length} CLEAR. ` +
      `Most exposed: ${exposed.slice(0, 5).map(t => t._title || t.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence task risk brief.`;
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

  const exposedCount = correlated.filter(t => t._exposed).length;
  const badge = exposedCount > 0 ? '#f97316' : '#22c55e';

  const visible = correlated.filter(t => {
    const label = (t._title || t.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'EXPOSED') return t._exposed;
    if (tab === 'CLEAR') return !t._exposed;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Task Risk Alert Correlator"
        style={{
          position: 'fixed',
          left: 420240,
          bottom: 8,
          zIndex: 185,
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
          boxShadow: exposedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        TRAC
        {exposedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {exposedCount}
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
          maxHeight: '82vh',
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
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f97316' }}>◈ TASK RISK ALERT CORRELATOR</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 6, color: '#f97316', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'TASKS', val: tasks.length, color: '#60a5fa' },
              { label: 'ALERTS', val: alerts.length, color: '#f97316' },
              { label: 'EXPOSED', val: exposedCount, color: '#ef4444' },
              { label: 'CLEAR', val: correlated.length - exposedCount, color: '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, fontSize: 12, color: '#fdba74', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'EXPOSED', 'CLEAR'].map(t => {
              const accent = t === 'EXPOSED' ? '#ef4444' : t === 'CLEAR' ? '#22c55e' : '#60a5fa';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${accent}22` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${tab === t ? `${accent}66` : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6,
                    color: tab === t ? accent : '#94a3b8',
                    padding: '3px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: tab === t ? 700 : 400,
                  }}
                >
                  {t}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No tasks match the current filter.</div>
          )}

          <div>
            {visible.map((task, i) => {
              const id = task.id || task.task_id || i;
              const label = task._title || `Task ${id}`;
              const isExp = expanded === id;
              const statusColor = task._exposed ? '#f97316' : '#22c55e';
              const statusLabel = task._exposed ? 'EXPOSED' : 'CLEAR';
              const status = task.status || task.state || '';
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: `${statusColor}22`,
                      color: statusColor,
                      border: `1px solid ${statusColor}55`,
                      boxShadow: task._exposed ? `0 0 5px ${statusColor}44` : 'none',
                    }}>
                      {statusLabel}
                    </span>
                    {status && (
                      <span style={{ ...PILL, background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                        {status}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {task._exposed && task._topSev && (
                      <span style={{ ...PILL, background: `${sevColor(task._topSev)}22`, color: sevColor(task._topSev), border: `1px solid ${sevColor(task._topSev)}44`, marginRight: 0 }}>
                        {task._topSev}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {task._alertMatches.length > 0 ? (
                        <>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched alerts:</div>
                          {task._alertMatches.map(({ al, score }, j) => {
                            const alertLabel = al.type || al.category || al.message || al.name || `alert-${j}`;
                            const sev = al.severity || al.level || '';
                            const alStatus = al.status || '';
                            return (
                              <div key={j} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#fb923c', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alertLabel}</span>
                                  {sev && <span style={{ ...PILL, background: `${sevColor(sev)}22`, color: sevColor(sev), border: `1px solid ${sevColor(sev)}44` }}>{sev}</span>}
                                  {alStatus && <span style={{ color: '#94a3b8', fontSize: 10 }}>{alStatus}</span>}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: sevColor(sev) || '#fb923c', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: '#22c55e', fontSize: 11 }}>✓ No active alert correlation for this task.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {correlated.length} tasks · {alerts.length} alerts · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
