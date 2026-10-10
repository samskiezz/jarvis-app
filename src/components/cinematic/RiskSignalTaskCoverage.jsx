import { useState, useEffect, useCallback } from 'react';

const API = '';

const RSKTSK_RE = /\b(risk[._-]?task[._-]?coverage|task[._-]?risk[._-]?coverage|rsktsk|risk[._-]?task[._-]?gap|exposed[._-]?risks?|uncovered[._-]?risks?|signal[._-]?task[._-]?coverage|which[._-]?risks?[._-]?have[._-]?tasks?|risk[._-]?without[._-]?task|task[._-]?gap|operational[._-]?risk[._-]?gap)\b/i;

export function isRsktskQuery(t) {
  return RSKTSK_RE.test(t || '');
}

export async function buildRsktskScript() {
  const [rsR, tkR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const signals = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : [], 'signals');
  const tasks = normaliseArray(tkR.status === 'fulfilled' ? tkR.value : [], 'tasks');
  const enriched = correlate(signals, tasks);
  const exposed = enriched.filter(s => s._matches.length === 0).length;
  const covered = enriched.length - exposed;
  const topExposed = enriched
    .filter(s => s._matches.length === 0)
    .slice(0, 3)
    .map(s => s.title || s.name || s.signal || '?')
    .join(', ') || 'none';
  return (
    `Risk Signal × Task Coverage: ${signals.length} active risk signals, ${tasks.length} tasks indexed. ` +
    `${covered} signal${covered !== 1 ? 's' : ''} have at least one task aligned (COVERED); ` +
    `${exposed} signal${exposed !== 1 ? 's' : ''} have no task response (EXPOSED — operational gap). ` +
    `Top exposed signals: ${topExposed}.`
  );
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'signals', 'tasks', 'items', 'results', 'data', 'records', 'entities'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function signalTokens(signal) {
  return new Set([
    ...tokens(signal.title),
    ...tokens(signal.name),
    ...tokens(signal.signal),
    ...tokens(signal.description),
    ...tokens(signal.category),
    ...tokens(signal.type),
    ...tokens(signal.source),
    ...(Array.isArray(signal.tags) ? signal.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean));
}

function taskTokens(task) {
  return [
    ...tokens(task.title),
    ...tokens(task.name),
    ...tokens(task.description),
    ...tokens(task.objective),
    ...tokens(task.category),
    ...(Array.isArray(task.tags) ? task.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(signal, task) {
  const sigToks = signalTokens(signal);
  const tskToks = taskTokens(task);
  if (!sigToks.size || !tskToks.length) return 0;
  let hits = 0;
  for (const t of tskToks) if (sigToks.has(t)) hits++;
  return hits / Math.max(sigToks.size, tskToks.length);
}

function correlate(signals, tasks) {
  return signals.map(signal => {
    const scored = tasks
      .map(task => ({ task, score: matchScore(signal, task) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...signal, _matches: scored, _covered: scored.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '#ef4444';
  if (s === 'high') return '#f97316';
  if (s === 'medium') return '#eab308';
  if (s === 'low') return '#22c55e';
  return '#64748b';
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'done' || s === 'complete' || s === 'closed') return '#22c55e';
  if (s === 'in_progress' || s === 'active' || s === 'open') return '#60a5fa';
  if (s === 'blocked' || s === 'failed') return '#ef4444';
  return '#94a3b8';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function RiskSignalTaskCoverage() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
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
      const [rsR, tkR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const rawSignals = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : [], 'signals');
      const rawTasks = normaliseArray(tkR.status === 'fulfilled' ? tkR.value : [], 'tasks');
      setSignals(rawSignals);
      setTasks(rawTasks);
      setEnriched(correlate(rawSignals, rawTasks));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:rsktsk-toggle', h);
    return () => window.removeEventListener('jarvis:rsktsk-toggle', h);
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
    const exposed = enriched.filter(s => !s._covered).length;
    const covered = enriched.filter(s => s._covered).length;
    const topExposed = enriched
      .filter(s => !s._covered)
      .map(s => s.title || s.name || s.signal || '?')
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Risk Signal × Task Coverage: ${signals.length} active risk signals, ${tasks.length} tasks. ` +
      `${covered} signals have at least one task response (COVERED); ` +
      `${exposed} signals have no task assigned (EXPOSED — operational gap). ` +
      `Top exposed signals with no task: ${topExposed}. ` +
      `Give a 2-sentence risk-task gap brief.`;
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

  const exposedCount = enriched.filter(s => !s._covered).length;
  const badge = exposedCount > 0 ? '#f97316' : '#22c55e';

  const visible = enriched.filter(signal => {
    const label = (signal.title || signal.name || signal.signal || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'COVERED') return signal._covered;
    if (tab === 'EXPOSED') return !signal._covered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Risk Signal × Task Coverage"
        style={{
          position: 'fixed',
          left: 61000,
          bottom: 8,
          zIndex: 120,
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
        RSKTSK
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
          width: 600,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9660,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f97316' }}>◈ RISK SIGNAL × TASK COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 6, color: '#f97316', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SIGNALS', val: signals.length, color: '#f97316' },
              { label: 'TASKS', val: tasks.length, color: '#60a5fa' },
              { label: 'COVERED', val: enriched.filter(s => s._covered).length, color: '#22c55e' },
              { label: 'EXPOSED', val: exposedCount, color: exposedCount > 0 ? '#f97316' : '#64748b' },
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
            {['ALL', 'COVERED', 'EXPOSED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f97316' : '#94a3b8',
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
              placeholder="Search signals…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No signals match the current filter.</div>
          )}

          <div>
            {visible.map((signal, i) => {
              const id = signal.id || signal._id || i;
              const label = signal.title || signal.name || signal.signal || `Signal ${i + 1}`;
              const sev = signal.severity || signal.level || signal.priority || '';
              const desc = signal.description || signal.summary || '';
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
                      background: signal._covered ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)',
                      color: signal._covered ? '#22c55e' : '#f97316',
                      border: `1px solid ${signal._covered ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
                    }}>
                      {signal._covered ? 'COVERED' : 'EXPOSED'}
                    </span>
                    {sev && (
                      <span style={{ ...PILL, background: `${severityColor(sev)}22`, color: severityColor(sev), border: `1px solid ${severityColor(sev)}44` }}>
                        {String(sev).toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {signal._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{signal._matches.length} task{signal._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {desc && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(desc).slice(0, 200)}</div>
                      )}
                      {signal._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched tasks:</div>
                          {signal._matches.map(({ task, score }, j) => {
                            const taskLabel = task.title || task.name || task.objective || `task-${j}`;
                            const status = task.status || task.state || '';
                            const priority = task.priority || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#93c5fd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{taskLabel}</span>
                                  {status && (
                                    <span style={{ ...PILL, background: `${statusColor(status)}22`, color: statusColor(status), border: `1px solid ${statusColor(status)}44` }}>
                                      {String(status).toUpperCase()}
                                    </span>
                                  )}
                                  {priority && (
                                    <span style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' }}>
                                      {String(priority).toUpperCase()}
                                    </span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#f97316', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f97316', fontSize: 11 }}>⚠ No task found that addresses this risk signal — operational gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} signals · {tasks.length} tasks indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
