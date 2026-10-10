import { useState, useEffect, useCallback } from 'react';

const API = '';

const TASKSWJ_RE = /\b(task[._-]?swarm|swarm[._-]?task|tkswj|automated[._-]?task|manual[._-]?task|task[._-]?automation|unautomated[._-]?task|task[._-]?swarm[._-]?job|swarm[._-]?backed[._-]?task|which[._-]?tasks?[._-]?have[._-]?swarm|task[._-]?execution[._-]?gap|swarm[._-]?coverage[._-]?task)\b/i;

export function isTaskSwjQuery(t) {
  return TASKSWJ_RE.test(t || '');
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'tasks', 'jobs', 'items', 'results', 'data', 'records', 'entities'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function taskTokens(task) {
  return new Set([
    ...tokens(task.title),
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.mission),
    ...tokens(task.priority),
    ...tokens(task.type),
    ...tokens(task.status),
    ...(Array.isArray(task.tags) ? task.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean));
}

function jobTokens(job) {
  return [
    ...tokens(job.name),
    ...tokens(job.title),
    ...tokens(job.description),
    ...tokens(job.kind),
    ...tokens(job.type),
    ...tokens(job.target),
    ...tokens(job.domain),
    ...(Array.isArray(job.tags) ? job.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(task, job) {
  const tToks = taskTokens(task);
  const jToks = jobTokens(job);
  if (!tToks.size || !jToks.length) return 0;
  let hits = 0;
  for (const t of jToks) if (tToks.has(t)) hits++;
  return hits / Math.max(tToks.size, jToks.length);
}

function correlate(tasks, jobs) {
  return tasks.map(task => {
    const scored = jobs
      .map(job => ({ job, score: matchScore(task, job) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...task, _matches: scored, _automated: scored.length > 0 };
  });
}

export async function buildTaskSwjScript() {
  const [tasksR, jobsR] = await Promise.allSettled([
    fetch(`${API}/entities/Task`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const tasks = normaliseArray(tasksR.status === 'fulfilled' ? tasksR.value : [], 'tasks');
  const jobs = normaliseArray(jobsR.status === 'fulfilled' ? jobsR.value : [], 'jobs');
  const enriched = correlate(tasks, jobs);
  const manual = enriched.filter(t => !t._automated).length;
  const automated = enriched.length - manual;
  const topManual = enriched
    .filter(t => !t._automated)
    .slice(0, 3)
    .map(t => t.title || t.name || '?')
    .join(', ') || 'none';
  return (
    `Task × SwarmJob Coverage: ${tasks.length} active tasks, ${jobs.length} swarm jobs indexed. ` +
    `${automated} task${automated !== 1 ? 's' : ''} have swarm automation coverage (AUTOMATED); ` +
    `${manual} task${manual !== 1 ? 's' : ''} lack any swarm backing (MANUAL — execution gap). ` +
    `Top manual tasks: ${topManual}.`
  );
}

function priorityColor(p) {
  const s = String(p || '').toLowerCase();
  if (s === 'critical' || s === 'urgent') return '#ef4444';
  if (s === 'high') return '#f97316';
  if (s === 'medium') return '#eab308';
  if (s === 'low') return '#22c55e';
  return '#64748b';
}

function statusColor(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'complete' || v === 'completed' || v === 'done') return '#22c55e';
  if (v === 'in_progress' || v === 'in progress' || v === 'active') return '#38bdf8';
  if (v === 'blocked') return '#ef4444';
  return '#94a3b8';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function TaskSwarmJobCoverage() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [jobs, setJobs] = useState([]);
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
      const [tasksR, jobsR] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
      ]);
      const rawTasks = normaliseArray(tasksR.status === 'fulfilled' ? tasksR.value : [], 'tasks');
      const rawJobs = normaliseArray(jobsR.status === 'fulfilled' ? jobsR.value : [], 'jobs');
      setTasks(rawTasks);
      setJobs(rawJobs);
      setEnriched(correlate(rawTasks, rawJobs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:tkswj-toggle', h);
    return () => window.removeEventListener('jarvis:tkswj-toggle', h);
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
    const manualCount = enriched.filter(t => !t._automated).length;
    const autoCount = enriched.filter(t => t._automated).length;
    const topManual = enriched
      .filter(t => !t._automated)
      .map(t => t.title || t.name || '?')
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Task × SwarmJob Coverage: ${tasks.length} active tasks, ${jobs.length} swarm jobs. ` +
      `${autoCount} tasks have swarm automation backing (AUTOMATED); ` +
      `${manualCount} tasks lack any swarm coverage (MANUAL — execution gap). ` +
      `Top unautomated tasks: ${topManual}. ` +
      `Give a 2-sentence task-automation execution gap brief.`;
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

  const manualCount = enriched.filter(t => !t._automated).length;
  const badge = manualCount > 0 ? '#eab308' : '#22c55e';

  const visible = enriched.filter(task => {
    const label = (task.title || task.name || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'AUTOMATED') return task._automated;
    if (tab === 'MANUAL') return !task._automated;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Task × SwarmJob Coverage"
        style={{
          position: 'fixed',
          left: 704240,
          bottom: 8,
          zIndex: 286,
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
          boxShadow: manualCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        TKSWJ
        {manualCount > 0 && (
          <span style={{ background: badge, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {manualCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 640,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9680,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#eab308' }}>◈ TASK × SWARM JOB COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.35)', borderRadius: 6, color: '#eab308', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'TASKS', val: tasks.length, color: '#38bdf8' },
              { label: 'SWARM JOBS', val: jobs.length, color: '#a78bfa' },
              { label: 'AUTOMATED', val: enriched.filter(t => t._automated).length, color: '#22c55e' },
              { label: 'MANUAL GAP', val: manualCount, color: manualCount > 0 ? '#eab308' : '#64748b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, fontSize: 12, color: '#fde68a', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'AUTOMATED', 'MANUAL'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(234,179,8,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#eab308' : '#94a3b8',
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
              const id = task.id || task._id || i;
              const label = task.title || task.name || `Task ${i + 1}`;
              const priority = task.priority || task.severity || '';
              const status = task.status || task.state || '';
              const desc = task.description || task.summary || task.mission || '';
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
                      background: task._automated ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                      color: task._automated ? '#22c55e' : '#eab308',
                      border: `1px solid ${task._automated ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`,
                    }}>
                      {task._automated ? 'AUTOMATED' : 'MANUAL'}
                    </span>
                    {priority && (
                      <span style={{ ...PILL, background: `${priorityColor(priority)}22`, color: priorityColor(priority), border: `1px solid ${priorityColor(priority)}44` }}>
                        {String(priority).toUpperCase()}
                      </span>
                    )}
                    {status && (
                      <span style={{ ...PILL, background: `${statusColor(status)}22`, color: statusColor(status), border: `1px solid ${statusColor(status)}44` }}>
                        {String(status).toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {task._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{task._matches.length} job{task._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {desc && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(desc).slice(0, 220)}</div>
                      )}
                      {task._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched swarm jobs:</div>
                          {task._matches.map(({ job, score }, j) => {
                            const jobLabel = job.name || job.title || `job-${j}`;
                            const jobKind = job.kind || job.type || '';
                            const jobStatus = job.status || job.state || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#a78bfa', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jobLabel}</span>
                                  {jobKind && (
                                    <span style={{ ...PILL, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
                                      {String(jobKind).toUpperCase()}
                                    </span>
                                  )}
                                  {jobStatus && (
                                    <span style={{ ...PILL, background: `${statusColor(jobStatus)}22`, color: statusColor(jobStatus), border: `1px solid ${statusColor(jobStatus)}44` }}>
                                      {String(jobStatus).toUpperCase()}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#eab308', fontSize: 11 }}>⚠ No swarm job found for this task — manual execution only (gap).</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} tasks · {jobs.length} swarm jobs indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
