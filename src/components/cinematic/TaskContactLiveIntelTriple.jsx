import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TCLIT_RE = /\b(tclit|task\s+contact\s+live|live\s+task\s+contact|reactive\s+task|task\s+world\s+event|task.*contact.*live|live.*intel.*task)\b/i;

const THRESHOLD = 0.08;

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
    id: t.id || t._id || t.taskId || String(Math.random()),
    name: t.name || t.title || t.label || 'Unnamed Task',
    description: t.description || t.desc || t.summary || '',
    priority: t.priority || t.urgency || t.level || '',
    status: t.status || t.state || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || ''),
    raw: t,
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.contacts) ? data.contacts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || c.contactId || String(Math.random()),
    name: c.name || c.fullName || c.label || 'Unknown Contact',
    role: c.role || c.title || c.position || '',
    org: c.org || c.organisation || c.organization || c.company || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function normaliseLiveIntel(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.intel) ? data.intel
    : [];
  return arr.map(e => ({
    id: e.id || e._id || e.eventId || String(Math.random()),
    label: e.label || e.title || e.name || e.type || 'Live Event',
    category: e.category || e.type || e.kind || '',
    region: e.region || e.location || e.area || '',
    summary: e.summary || e.description || e.detail || '',
    raw: e,
  }));
}

function correlate(tasks, contacts, liveIntel) {
  return tasks.map(task => {
    const toks = tok([task.name, task.description, task.priority, task.tags].join(' '));

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.role),
          matchScore(toks, c.org),
          matchScore(toks, c.tags),
        );
        return { ...c, score };
      })
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedEvents = liveIntel
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.label),
          matchScore(toks, e.category),
          matchScore(toks, e.region),
          matchScore(toks, e.summary),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasContact = matchedContacts.length > 0;
    const hasEvent = matchedEvents.length > 0;

    let state;
    if (hasContact && hasEvent) state = 'FULLY REACTIVE';
    else if (hasContact) state = 'TASK-ASSIGNED';
    else if (hasEvent) state = 'LIVE-ALERTED';
    else state = 'DORMANT';

    return { task, matchedContacts, matchedEvents, state };
  });
}

export function isTaskContactLiveQuery(t) {
  return TCLIT_RE.test(t || '');
}

export async function buildTaskContactLiveScript() {
  try {
    const [tRes, cRes, lRes] = await Promise.allSettled([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : null),
    ]);
    const tasks = normaliseTasks(tRes.status === 'fulfilled' ? tRes.value : null);
    const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
    const liveIntel = normaliseLiveIntel(lRes.status === 'fulfilled' ? lRes.value : null);
    const rows = correlate(tasks, contacts, liveIntel);
    const fullyReactive = rows.filter(r => r.state === 'FULLY REACTIVE').length;
    const taskAssigned = rows.filter(r => r.state === 'TASK-ASSIGNED').length;
    const liveAlerted = rows.filter(r => r.state === 'LIVE-ALERTED').length;
    const dormant = rows.filter(r => r.state === 'DORMANT').length;
    return `TCLIT Task×Contact×LiveIntel: ${rows.length} tasks analysed. ` +
      `${fullyReactive} FULLY REACTIVE (task+contact+live event match), ` +
      `${taskAssigned} TASK-ASSIGNED, ${liveAlerted} LIVE-ALERTED, ${dormant} DORMANT. ` +
      (fullyReactive > 0 ? `Top reactive: ${rows.find(r => r.state === 'FULLY REACTIVE')?.task.name || 'see panel'}.` : 'No fully reactive tasks at this time.');
  } catch {
    return 'TCLIT: data fetch failed.';
  }
}

export default function TaskContactLiveIntelTriple() {
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
    window.addEventListener('jarvis:tclit-toggle', handler);
    return () => window.removeEventListener('jarvis:tclit-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [tRes, cRes, lRes] = await Promise.allSettled([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const tasks = normaliseTasks(tRes.status === 'fulfilled' ? tRes.value : null);
      const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
      const liveIntel = normaliseLiveIntel(lRes.status === 'fulfilled' ? lRes.value : null);
      if (!tasks.length && !contacts.length && !liveIntel.length) {
        setErr('No data returned from Task, Contact, or LiveIntel endpoints.');
      }
      setRows(correlate(tasks, contacts, liveIntel));
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
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyReactive = rows.filter(r => r.state === 'FULLY REACTIVE').length;
  const taskAssigned = rows.filter(r => r.state === 'TASK-ASSIGNED').length;
  const liveAlerted = rows.filter(r => r.state === 'LIVE-ALERTED').length;
  const dormant = rows.filter(r => r.state === 'DORMANT').length;

  const TABS = ['ALL', 'FULLY REACTIVE', 'TASK-ASSIGNED', 'LIVE-ALERTED', 'DORMANT'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.task.name.toLowerCase().includes(q) ||
        r.task.description.toLowerCase().includes(q) ||
        r.matchedContacts.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedEvents.some(e => e.label.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Task "${row.task.name}" [${row.state}]: ` +
      `contacts: ${row.matchedContacts.map(c => c.name).join(', ') || 'none'}. ` +
      `live events: ${row.matchedEvents.map(e => e.label).join(', ') || 'none'}. ` +
      `Priority: ${row.task.priority || 'unknown'}. ` +
      `Give a 2-sentence operational engagement brief.`;
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

  const STATE_COLOUR = {
    'FULLY REACTIVE': '#ff4444',
    'TASK-ASSIGNED': '#00e5ff',
    'LIVE-ALERTED': '#ffbb00',
    'DORMANT': '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 773680,
          bottom: 8,
          zIndex: 410,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00e5ff44',
          color: '#00e5ff',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ⊛ TCLIT
        {fullyReactive > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ff4444',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {fullyReactive}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00e5ff55',
      borderRadius: 8,
      zIndex: 410,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00e5ff22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00e5ff22',
        background: 'rgba(0,229,255,0.05)',
      }}>
        <span style={{ color: '#00e5ff', fontWeight: 700, letterSpacing: 1 }}>
          ⊛ TASK × CONTACT × LIVE INTEL
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #00e5ff44',
              color: '#00e5ff',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00e5ff11' }}>
        {[
          { label: 'FULLY REACTIVE', val: fullyReactive, col: '#ff4444' },
          { label: 'TASK-ASSIGNED', val: taskAssigned, col: '#00e5ff' },
          { label: 'LIVE-ALERTED', val: liveAlerted, col: '#ffbb00' },
          { label: 'DORMANT', val: dormant, col: '#555' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,229,255,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00e5ff22' : 'none',
              border: `1px solid ${filter === t ? '#00e5ff' : '#00e5ff33'}`,
              color: filter === t ? '#00e5ff' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid #00e5ff33',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching tasks.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.task.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.task.id}
              style={{
                borderBottom: '1px solid #00e5ff0d',
                background: isExp ? 'rgba(0,229,255,0.04)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.task.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.task.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.task.priority && (
                  <span style={{ color: '#ffbb00', fontSize: 9, marginLeft: 4 }}>
                    P:{row.task.priority}
                  </span>
                )}
                <span style={{ color: '#00e5ff44', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.task.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.task.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched contacts */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#00e5ff', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        CONTACTS ({row.matchedContacts.length})
                      </div>
                      {row.matchedContacts.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No contacts matched.</div>
                      )}
                      {row.matchedContacts.slice(0, 5).map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8e6ff', fontWeight: 600 }}>{c.name}</span>
                            <span style={{ color: '#00e5ff', fontSize: 10 }}>{(c.score * 100).toFixed(0)}%</span>
                          </div>
                          {c.role && <div style={{ color: '#556', fontSize: 10 }}>{c.role} {c.org ? `· ${c.org}` : ''}</div>}
                          <div style={{ height: 3, background: '#001a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(c.score * 100, 100)}%`,
                              background: `linear-gradient(90deg, #00e5ff, #0088aa)`,
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched live events */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ffbb00', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        LIVE EVENTS ({row.matchedEvents.length})
                      </div>
                      {row.matchedEvents.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No live events matched.</div>
                      )}
                      {row.matchedEvents.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffe0a0', fontWeight: 600 }}>{e.label}</span>
                            <span style={{ color: '#ffbb00', fontSize: 10 }}>{(e.score * 100).toFixed(0)}%</span>
                          </div>
                          {(e.category || e.region) && (
                            <div style={{ color: '#556', fontSize: 10 }}>
                              {e.category}{e.region ? ` · ${e.region}` : ''}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#1a1000', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(e.score * 100, 100)}%`,
                              background: `linear-gradient(90deg, #ffbb00, #aa7700)`,
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(0,229,255,0.08)',
                      border: '1px solid #00e5ff55',
                      color: '#00e5ff',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
