import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TSJSC_RE = /\b(tsjsc|task\s+swarm\s+scenario|task\s+coordination|fully\s+coordinated\s+task|coordinated\s+task|task\s+automation\s+scenario|task\s+swarm\s+plan|swarm\s+task\s+scenario|task\s+scenario\s+swarm|task\s+coordination\s+gap|uncoordinated\s+task)\b/i;

const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.tasks) ? data.tasks
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(t => ({
    id: t.id || t._id || String(Math.random()),
    name: t.name || t.title || t.label || 'Unnamed Task',
    description: t.description || t.summary || t.mission || '',
    category: t.category || t.type || t.kind || '',
    priority: t.priority || t.severity || '',
    status: t.status || t.state || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || ''),
    raw: t,
  }));
}

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.swarm_jobs) ? data.swarm_jobs
    : Array.isArray(data.jobs) ? data.jobs
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(j => ({
    id: j.id || j._id || String(Math.random()),
    name: j.name || j.title || j.label || 'Unnamed Job',
    type: j.type || j.kind || j.category || '',
    status: j.status || j.state || '',
    description: j.description || j.summary || j.objective || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    raw: j,
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.scenarios) ? data.scenarios
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Scenario',
    category: s.category || s.type || s.kind || '',
    status: s.status || s.state || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(tasks, swarmJobs, scenarios) {
  return tasks.map(task => {
    const toks = tok([task.name, task.description, task.category, task.priority, task.tags].join(' '));

    const matchedSwarm = swarmJobs
      .map(j => {
        const score = Math.max(
          matchScore(toks, j.name),
          matchScore(toks, j.type),
          matchScore(toks, j.description),
          matchScore(toks, j.tags),
        );
        return { ...j, score };
      })
      .filter(j => j.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedScenarios = scenarios
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.category),
          matchScore(toks, s.description),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasSwarm = matchedSwarm.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let state;
    if (hasSwarm && hasScenario) state = 'FULLY COORDINATED';
    else if (hasSwarm) state = 'SWARM-BACKED';
    else if (hasScenario) state = 'SCENARIO-LINKED';
    else state = 'UNCOORDINATED';

    return { task, matchedSwarm, matchedScenarios, state };
  });
}

export function isTsjscQuery(t) {
  return TSJSC_RE.test(t || '');
}

export async function buildTsjscScript() {
  try {
    const [taskRes, swarmRes, scenRes] = await Promise.allSettled([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : null),
    ]);

    const tasks = normaliseTasks(taskRes.status === 'fulfilled' ? taskRes.value : null);
    const swarmJobs = normaliseSwarmJobs(swarmRes.status === 'fulfilled' ? swarmRes.value : null);
    const scenarios = normaliseScenarios(scenRes.status === 'fulfilled' ? scenRes.value : null);
    const rows = correlate(tasks, swarmJobs, scenarios);

    const fullyCoord = rows.filter(r => r.state === 'FULLY COORDINATED').length;
    const swarmBacked = rows.filter(r => r.state === 'SWARM-BACKED').length;
    const scenLinked = rows.filter(r => r.state === 'SCENARIO-LINKED').length;
    const uncoord = rows.filter(r => r.state === 'UNCOORDINATED').length;

    return `TSJSC Task×SwarmJob×Scenario: ${tasks.length} tasks analysed against ${swarmJobs.length} swarm jobs and ${scenarios.length} scenarios. ` +
      `${fullyCoord} FULLY COORDINATED (swarm+scenario), ` +
      `${swarmBacked} SWARM-BACKED (automation only), ${scenLinked} SCENARIO-LINKED (plan only), ${uncoord} UNCOORDINATED (no coverage). ` +
      (uncoord > 0 ? `${uncoord} tasks have no swarm automation or scenario plan — coordination gaps require attention.` :
        fullyCoord > 0 ? `${fullyCoord} tasks are fully coordinated with both swarm automation and scenario planning.` :
        'Task coordination coverage nominal.');
  } catch {
    return 'TSJSC: data fetch failed.';
  }
}

const STATE_COLOUR = {
  'FULLY COORDINATED': '#69f0ae',
  'SWARM-BACKED': '#00e5ff',
  'SCENARIO-LINKED': '#ce93d8',
  'UNCOORDINATED': '#455a64',
};

const PRIORITY_COLOUR = {
  CRITICAL: '#f44336',
  HIGH: '#ff7043',
  MEDIUM: '#ffab40',
  LOW: '#69f0ae',
  NORMAL: '#4fc3f7',
};

export default function TaskSwarmScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:tsjsc-toggle', handler);
    return () => window.removeEventListener('jarvis:tsjsc-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [taskRes, swarmRes, scenRes] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const tasks = normaliseTasks(taskRes.status === 'fulfilled' ? taskRes.value : null);
      const swarmJobs = normaliseSwarmJobs(swarmRes.status === 'fulfilled' ? swarmRes.value : null);
      const scenarios = normaliseScenarios(scenRes.status === 'fulfilled' ? scenRes.value : null);

      if (!tasks.length && !swarmJobs.length && !scenarios.length) {
        setErr('No data returned from Task, SwarmJob, or Scenario endpoints.');
      }

      setRows(correlate(tasks, swarmJobs, scenarios));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCoord = rows.filter(r => r.state === 'FULLY COORDINATED').length;
  const swarmBacked = rows.filter(r => r.state === 'SWARM-BACKED').length;
  const scenLinked = rows.filter(r => r.state === 'SCENARIO-LINKED').length;
  const uncoord = rows.filter(r => r.state === 'UNCOORDINATED').length;

  const TABS = ['ALL', 'FULLY COORDINATED', 'SWARM-BACKED', 'SCENARIO-LINKED', 'UNCOORDINATED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.task.name.toLowerCase().includes(q) ||
        r.matchedSwarm.some(j => j.name.toLowerCase().includes(q)) ||
        r.matchedScenarios.some(s => s.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    coord: (fullyCoord / total) * 100,
    swarm: (swarmBacked / total) * 100,
    scen: (scenLinked / total) * 100,
    uncoord: (uncoord / total) * 100,
  } : { coord: 0, swarm: 0, scen: 0, uncoord: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Task "${row.task.name}" [${row.state}]: ` +
      `matched swarm jobs: ${row.matchedSwarm.map(j => j.name).join(', ') || 'none'}. ` +
      `matched scenarios: ${row.matchedScenarios.map(s => s.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence task coordination coverage brief focusing on automation and scenario planning gaps.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 816800,
          bottom: 8,
          zIndex: 487,
          background: 'rgba(0,8,20,0.85)',
          border: `1px solid ${fullyCoord > 0 ? '#69f0ae' : '#1a3050'}`,
          color: fullyCoord > 0 ? '#69f0ae' : '#2a6090',
          padding: '3px 7px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >
        ◈ TSJSC{fullyCoord > 0 ? ` [${fullyCoord}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      left: 20,
      top: 60,
      width: 640,
      maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,8,20,0.97)',
      border: '1px solid #1a3050',
      borderRadius: 8,
      zIndex: 9900,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1a3050',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ color: '#69f0ae', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ TSJSC</span>
        <span style={{ color: '#4a6fa0', fontSize: 10, flex: 1 }}>Task × SwarmJob × Scenario Triple Coverage</span>
        {loading && <span style={{ color: '#00e5ff', fontSize: 9 }}>LOADING…</span>}
        {lastRefresh && !loading && (
          <span style={{ color: '#2a4060', fontSize: 9 }}>
            {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={load}
          disabled={loading}
          style={{ background: 'none', border: '1px solid #1a3050', color: '#2a6090', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}
        >↺</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#2a4060', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        >✕</button>
      </div>

      {err && (
        <div style={{ padding: '6px 14px', background: '#f4433612', color: '#f44336', fontSize: 10 }}>{err}</div>
      )}

      {/* Stat tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        padding: '8px 14px',
        borderBottom: '1px solid #1a3050',
        flexShrink: 0,
      }}>
        {[
          { label: 'TASKS', val: rows.length, col: '#4fc3f7' },
          { label: 'SWARM', val: rows.reduce((acc, r) => acc + r.matchedSwarm.length, 0), col: '#00e5ff' },
          { label: 'SCENARIOS', val: rows.reduce((acc, r) => acc + r.matchedScenarios.length, 0), col: '#ce93d8' },
          { label: 'FULLY-COORD', val: fullyCoord, col: '#69f0ae' },
          { label: 'SWARM-BACK', val: swarmBacked, col: '#00e5ff' },
          { label: 'SCEN-LINK', val: scenLinked, col: '#ce93d8' },
          { label: 'UNCOORD', val: uncoord, col: '#455a64' },
        ].map(t => (
          <div key={t.label} style={{ textAlign: 'center' }}>
            <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#2a4060', fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ height: 4, display: 'flex', flexShrink: 0, margin: '0 14px 8px' }}>
        <div style={{ width: `${cbw.coord}%`, background: '#69f0ae', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.swarm}%`, background: '#00e5ff', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.scen}%`, background: '#ce93d8', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.uncoord}%`, background: '#455a6480', transition: 'width 0.4s' }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? `${STATE_COLOUR[tab] || '#00e5ff'}22` : 'none',
              border: `1px solid ${filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#1a3050'}`,
              color: filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#2a6090',
              padding: '2px 7px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,20,40,0.6)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 7px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            width: 110,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', fontSize: 11, padding: '20px 14px', textAlign: 'center' }}>
            No tasks match current filter.
          </div>
        )}
        {visible.map(row => (
          <div
            key={row.task.id}
            style={{
              borderBottom: '1px solid #0d1e30',
              background: expanded === row.task.id ? 'rgba(0,20,40,0.4)' : 'transparent',
            }}
          >
            <div
              onClick={() => setExpanded(expanded === row.task.id ? null : row.task.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                cursor: 'pointer',
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 130,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.task.name}
              </span>
              {row.task.priority && (
                <span style={{
                  fontSize: 9,
                  color: PRIORITY_COLOUR[row.task.priority?.toUpperCase()] || '#4fc3f7',
                  background: `${PRIORITY_COLOUR[row.task.priority?.toUpperCase()] || '#4fc3f7'}22`,
                  borderRadius: 2,
                  padding: '0 4px',
                }}>{row.task.priority}</span>
              )}
              <span style={{ color: '#00e5ff', fontSize: 9 }}>{row.matchedSwarm.length}S</span>
              <span style={{ color: '#ce93d8', fontSize: 9 }}>{row.matchedScenarios.length}P</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(105,240,174,0.12)',
                  border: '1px solid #69f0ae55',
                  color: '#69f0ae',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.task.id ? '▲' : '▼'}</span>
            </div>

            {/* Expand: split pane */}
            {expanded === row.task.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: SwarmJobs */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#00e5ff', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    SWARM JOBS ({row.matchedSwarm.length})
                  </div>
                  {row.matchedSwarm.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No swarm job match — automation gap</div>
                  ) : row.matchedSwarm.slice(0, 5).map(j => (
                    <div key={j.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{j.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {j.type && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#00e5ff22', borderRadius: 2, padding: '0 3px' }}>
                            {j.type}
                          </span>
                        )}
                        {j.status && (
                          <span style={{ color: '#4a6fa0', fontSize: 9 }}>{j.status}</span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(j.score * 100)}%`, background: '#00e5ff', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Scenarios */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ce93d8', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    SCENARIOS ({row.matchedScenarios.length})
                  </div>
                  {row.matchedScenarios.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No scenario match — planning gap</div>
                  ) : row.matchedScenarios.slice(0, 5).map(s => (
                    <div key={s.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{s.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s.category && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ce93d822', borderRadius: 2, padding: '0 3px' }}>
                            {s.category}
                          </span>
                        )}
                        {s.status && (
                          <span style={{ color: '#4a6fa0', fontSize: 9 }}>{s.status}</span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(s.score * 100)}%`, background: '#ce93d8', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Task description if available */}
                {row.task.description && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050' }}>
                    <span style={{ color: '#2a4060', fontSize: 9 }}>TASK: </span>
                    <span style={{ color: '#4a6fa0', fontSize: 10 }}>
                      {row.task.description.slice(0, 200)}{row.task.description.length > 200 ? '…' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
