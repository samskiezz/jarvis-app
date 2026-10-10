import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const LSTTRI_RE = /\b(lsttri|live[._\-\s]?system[._\-\s]?task|live[._\-\s]?intel[._\-\s]?task[._\-\s]?system|world[._\-\s]?event[._\-\s]?task[._\-\s]?system|fully[._\-\s]?reactive[._\-\s]?event|untracked[._\-\s]?world[._\-\s]?event)\b/i;

export function isLsttriQuery(t) { return LSTTRI_RE.test(t || ''); }

function normaliseIntelEvents(raw) {
  if (Array.isArray(raw)) return raw;
  const out = [];
  if (Array.isArray(raw.quakes)) out.push(...raw.quakes.map(q => ({ ...q, _src: 'quake', name: q.place ?? q.location ?? q.id })));
  if (Array.isArray(raw.crypto)) out.push(...raw.crypto.map(c => ({ ...c, _src: 'crypto', name: c.symbol ?? c.name ?? c.id })));
  if (Array.isArray(raw.fx)) out.push(...raw.fx.map(f => ({ ...f, _src: 'fx', name: f.pair ?? f.symbol ?? f.id })));
  if (Array.isArray(raw.events)) out.push(...raw.events);
  if (Array.isArray(raw.data)) out.push(...raw.data);
  if (Array.isArray(raw.results)) out.push(...raw.results);
  if (Array.isArray(raw.items)) out.push(...raw.items);
  return out;
}

function normaliseServices(raw) {
  if (Array.isArray(raw)) return raw;
  return raw.services ?? raw.components ?? raw.checks ?? raw.data ?? raw.results ?? [];
}

function normaliseTasks(raw) {
  if (Array.isArray(raw)) return raw;
  return raw.tasks ?? raw.data ?? raw.results ?? raw.items ?? [];
}

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreAgainst(event, items, nameFields) {
  const text = `${event._src ?? ''} ${event.type ?? ''} ${event.name ?? event.id ?? ''} ${event.location ?? ''} ${event.symbol ?? ''} ${event.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const item of items) {
    const itext = nameFields.map(f => `${item[f] ?? ''}`).join(' ').toLowerCase();
    const hits = tokens.filter(tok => itext.includes(tok));
    if (hits.length > 0) matched.push({ item, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function classifyEvent(event, services, tasks) {
  const text = `${event._src ?? ''} ${event.type ?? ''} ${event.name ?? event.id ?? ''} ${event.location ?? ''} ${event.symbol ?? ''} ${event.description ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const svcBlob = services.map(s => `${s.name ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''}`.toLowerCase()).join(' ');
  const taskBlob = tasks.map(t => `${t.name ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''} ${t.priority ?? ''}`.toLowerCase()).join(' ');
  const hasSvc = tokens.some(tok => svcBlob.includes(tok));
  const hasTask = tokens.some(tok => taskBlob.includes(tok));
  if (hasSvc && hasTask) return 'FULLY REACTIVE';
  if (hasSvc) return 'SVC-ONLY';
  if (hasTask) return 'TASKED';
  return 'UNTRACKED';
}

export async function buildLsttriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [intelR, sysR, taskR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
  ]);
  const events = normaliseIntelEvents(intelR.value ?? {});
  const services = normaliseServices(sysR.value ?? {});
  const tasks = normaliseTasks(taskR.value ?? {});

  let fullyReactive = 0, svcOnly = 0, tasked = 0, untracked = 0;
  for (const ev of events) {
    const st = classifyEvent(ev, services, tasks);
    if (st === 'FULLY REACTIVE') fullyReactive++;
    else if (st === 'SVC-ONLY') svcOnly++;
    else if (st === 'TASKED') tasked++;
    else untracked++;
  }
  return `LSTTRI Live Intel × System × Task Triple: ${events.length} live world events assessed against ${services.length} system services and ${tasks.length} active tasks. ` +
    `FULLY REACTIVE: ${fullyReactive} (service + task coverage). ` +
    `SVC-ONLY: ${svcOnly} (service match, no task). ` +
    `TASKED: ${tasked} (task match, no service). ` +
    `UNTRACKED: ${untracked} (no system or task coverage — operational gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 76, textAlign: 'center' };
const LBL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 20, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY REACTIVE': '#22d3ee',
  'SVC-ONLY': '#34d399',
  'TASKED': '#fbbf24',
  'UNTRACKED': '#94a3b8',
};

export default function LiveIntelSystemTaskTriple() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [services, setServices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [intelR, sysR, taskR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
      ]);
      const evts = normaliseIntelEvents(intelR.value ?? {});
      const svcs = normaliseServices(sysR.value ?? {});
      const tsks = normaliseTasks(taskR.value ?? {});
      setEvents(evts);
      setServices(svcs);
      setTasks(tsks);
      setRows(evts.map(ev => ({
        ev,
        state: classifyEvent(ev, svcs, tsks),
        matchedServices: scoreAgainst(ev, svcs, ['name', 'id', 'description', 'type']),
        matchedTasks: scoreAgainst(ev, tsks, ['name', 'id', 'description', 'type', 'priority']),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lsttri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:lsttri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyReactiveCount = rows.filter(r => r.state === 'FULLY REACTIVE').length;
  const svcOnlyCount = rows.filter(r => r.state === 'SVC-ONLY').length;
  const taskedCount = rows.filter(r => r.state === 'TASKED').length;
  const untrackedCount = rows.filter(r => r.state === 'UNTRACKED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = `${r.ev._src ?? ''} ${r.ev.type ?? ''} ${r.ev.name ?? r.ev.id ?? ''} ${r.ev.location ?? ''} ${r.ev.symbol ?? ''}`.toLowerCase();
      if (!label.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const label = row.ev.name ?? row.ev.id ?? 'event';
    setAssessing(label);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const svcNames = row.matchedServices.slice(0, 2).map(m => m.item.name ?? m.item.id ?? '?').join(', ');
      const taskNames = row.matchedTasks.slice(0, 2).map(m => m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY REACTIVE'
        ? `is fully reactive — matched system services (${svcNames || 'found'}) and active tasks (${taskNames || 'found'})`
        : row.state === 'SVC-ONLY'
        ? `has service-only coverage — matched services (${svcNames || 'found'}) but no active task is tracking it`
        : row.state === 'TASKED'
        ? `is task-assigned — matched tasks (${taskNames || 'found'}) but no system service monitors it`
        : 'is UNTRACKED — no system service or active task covers this live world event';
      const prompt = `Live world event "${label}" (type: ${row.ev._src ?? row.ev.type ?? 'unknown'}) ${stateDesc}. In exactly 2 sentences, assess the operational gap and the highest-priority action for the system.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 787120, bottom: 8, zIndex: 434,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(34,211,238,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#22d3ee', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ LSTTRI — LIVE INTEL × SYSTEM × TASK</span>
        {fullyReactiveCount > 0 && (
          <span style={{ background: '#22d3ee', color: '#0f172a', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{fullyReactiveCount} REACTIVE</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Live Events', val: events.length },
          { label: 'Services', val: services.length },
          { label: 'Tasks', val: tasks.length },
          { label: 'Fully Reactive', val: fullyReactiveCount, color: '#22d3ee' },
          { label: 'Svc-Only', val: svcOnlyCount, color: '#34d399' },
          { label: 'Tasked', val: taskedCount, color: '#fbbf24' },
          { label: 'Untracked', val: untrackedCount, color: '#94a3b8' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LBL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyReactiveCount / rows.length) * 100)}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((svcOnlyCount / rows.length) * 100)}%`, background: '#34d399', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((taskedCount / rows.length) * 100)}%`, background: '#fbbf24', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyReactiveCount / rows.length) * 100) : 0}% fully reactive · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY REACTIVE', 'SVC-ONLY', 'TASKED', 'UNTRACKED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#22d3ee') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#000' : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no events match</div>
        )}
        {visible.map((row, i) => {
          const label = row.ev.name ?? row.ev.id ?? `event-${i}`;
          const src = row.ev._src ?? row.ev.type ?? '';
          const isExp = expanded === label;
          return (
            <div key={label} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : label)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {src && (
                  <span style={{ fontSize: 9, color: '#22d3ee', background: 'rgba(34,211,238,0.1)', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: 1 }}>{src}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === label}
                    style={{ background: assessing === label ? '#444' : 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: assessing === label ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === label ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: matched system services */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#34d399', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        SERVICES ({row.matchedServices.length})
                      </div>
                      {row.matchedServices.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no service match — system gap</div>
                      ) : row.matchedServices.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.id ?? `svc-${mi}`;
                        const status = m.item.status ?? m.item.state ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#6ee7b7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {status && <span style={{ fontSize: 9, color: '#065f46', background: 'rgba(6,95,70,0.25)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{status}</span>}
                              <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#34d399', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right: matched tasks */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        TASKS ({row.matchedTasks.length})
                      </div>
                      {row.matchedTasks.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no task match — task gap</div>
                      ) : row.matchedTasks.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.id ?? `task-${mi}`;
                        const priority = m.item.priority ?? m.item.type ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#fde68a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {priority && <span style={{ fontSize: 9, color: '#78350f', background: 'rgba(120,53,15,0.25)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{priority}</span>}
                              <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#fbbf24', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
