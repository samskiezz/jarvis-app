import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPEOTRI_RE = /\b(ipeotri|intel\s+profile\s+ops\s+task|profile\s+ops\s+task|untracked\s+intel\s+profile|intel\s+operational\s+coverage|profile\s+task\s+ops|ops\s+task\s+intel\s+profile|intel\s+profile\s+task\s+ops|intel\s+task\s+ops|profile\s+ops\s+event\s+task)\b/i;

export function isIpeotriQuery(t) { return IPEOTRI_RE.test(t || ''); }

export async function buildIpeotriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [profR, opsR, taskR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
  ]);
  const profRaw = profR.value ?? {};
  const profiles = Array.isArray(profRaw) ? profRaw : (profRaw.profiles ?? profRaw.data ?? profRaw.results ?? []);
  const opsRaw = opsR.value ?? {};
  const events = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);
  const taskRaw = taskR.value ?? {};
  const tasks = Array.isArray(taskRaw) ? taskRaw : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);

  const opsText = events.map(e =>
    `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''} ${e.service ?? ''}`.toLowerCase()
  ).join(' ');
  const taskText = tasks.map(t =>
    `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''} ${t.priority ?? ''}`.toLowerCase()
  ).join(' ');

  let fully = 0, opsActive = 0, tasked = 0, untracked = 0;
  for (const p of profiles) {
    const text = `${p.name ?? p.id ?? ''} ${p.company ?? ''} ${p.role ?? ''} ${p.sector ?? ''} ${p.nationality ?? ''} ${Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases ?? '')}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasOps = tokens.some(tok => opsText.includes(tok));
    const hasTask = tokens.some(tok => taskText.includes(tok));
    if (hasOps && hasTask) fully++;
    else if (hasOps) opsActive++;
    else if (hasTask) tasked++;
    else untracked++;
  }
  return `IPEOTRI Intel Profile × Ops Event × Task: ${profiles.length} intel profiles assessed against ` +
    `${events.length} ops events and ${tasks.length} tasks. ` +
    `FULLY OPERATIONAL: ${fully} (ops event triggered + task assigned). OPS-ACTIVE: ${opsActive} (live trigger, no task). ` +
    `TASKED: ${tasked} (action assigned, no live ops trigger). UNTRACKED: ${untracked} (no operational coverage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY OPERATIONAL': '#4ade80',
  'OPS-ACTIVE': '#fb923c',
  TASKED: '#facc15',
  UNTRACKED: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreOps(profile, events) {
  const text = `${profile.name ?? profile.id ?? ''} ${profile.company ?? ''} ${profile.role ?? ''} ${profile.sector ?? ''} ${profile.nationality ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const e of events) {
    const eText = `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''} ${e.service ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => eText.includes(tok));
    if (hits.length > 0) matched.push({ item: e, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreTasks(profile, tasks) {
  const text = `${profile.name ?? profile.id ?? ''} ${profile.company ?? ''} ${profile.role ?? ''} ${profile.sector ?? ''} ${profile.nationality ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const t of tasks) {
    const tText = `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''} ${t.priority ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => tText.includes(tok));
    if (hits.length > 0) matched.push({ item: t, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(profile, events, tasks) {
  const text = `${profile.name ?? profile.id ?? ''} ${profile.company ?? ''} ${profile.role ?? ''} ${profile.sector ?? ''} ${profile.nationality ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const opsText = events.map(e => `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''}`.toLowerCase()).join(' ');
  const taskText = tasks.map(t => `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''}`.toLowerCase()).join(' ');
  const hasOps = tokens.some(tok => opsText.includes(tok));
  const hasTask = tokens.some(tok => taskText.includes(tok));
  if (hasOps && hasTask) return 'FULLY OPERATIONAL';
  if (hasOps) return 'OPS-ACTIVE';
  if (hasTask) return 'TASKED';
  return 'UNTRACKED';
}

export default function IntelProfileOpsTaskTriple() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [events, setEvents] = useState([]);
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
      const [profR, opsR, taskR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
      ]);
      const profRaw = profR.value ?? {};
      const profs = Array.isArray(profRaw) ? profRaw : (profRaw.profiles ?? profRaw.data ?? profRaw.results ?? []);
      const opsRaw = opsR.value ?? {};
      const evts = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);
      const taskRaw = taskR.value ?? {};
      const tsks = Array.isArray(taskRaw) ? taskRaw : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);
      setProfiles(profs);
      setEvents(evts);
      setTasks(tsks);
      setRows(profs.map(p => ({
        p,
        state: correlate(p, evts, tsks),
        leftMatched: scoreOps(p, evts),
        rightMatched: scoreTasks(p, tsks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ipeotri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ipeotri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY OPERATIONAL').length;
  const opsCount = rows.filter(r => r.state === 'OPS-ACTIVE').length;
  const taskedCount = rows.filter(r => r.state === 'TASKED').length;
  const untrackedCount = rows.filter(r => r.state === 'UNTRACKED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${r.p.name ?? r.p.id ?? ''} ${r.p.company ?? ''} ${r.p.role ?? ''} ${r.p.sector ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.p.name ?? row.p.id ?? 'intel profile';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const opsNames = row.leftMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.type ?? m.item.id ?? '?').join(', ');
      const taskNames = row.rightMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY OPERATIONAL'
        ? `has both ops event coverage (${opsNames || 'found'}) and task assignment (${taskNames || 'found'})`
        : row.state === 'OPS-ACTIVE'
          ? `has active ops event coverage (${opsNames || 'found'}) but no task assigned`
          : row.state === 'TASKED'
            ? `has task assignment (${taskNames || 'found'}) but no active ops event trigger`
            : 'has NO ops event or task coverage — intelligence operational gap';
      const prompt = `Intel profile "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational coverage status of this intel profile.`;
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
      position: 'fixed', left: 789920, bottom: 8, zIndex: 439,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ IPEOTRI — INTEL PROFILE × OPS EVENT × TASK</span>
        {untrackedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{untrackedCount} UNTRACKED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Intel Profiles', val: profiles.length },
          { label: 'Fully Operational', val: fullyCount, color: '#4ade80' },
          { label: 'Ops-Active', val: opsCount, color: '#fb923c' },
          { label: 'Tasked', val: taskedCount, color: '#facc15' },
          { label: 'Untracked', val: untrackedCount, color: '#ef4444' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyCount / rows.length) * 100)}%`, background: '#4ade80', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((opsCount / rows.length) * 100)}%`, background: '#fb923c', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((taskedCount / rows.length) * 100)}%`, background: '#facc15', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully operational · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY OPERATIONAL', 'OPS-ACTIVE', 'TASKED', 'UNTRACKED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'UNTRACKED' ? '#fff' : '#000') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search intel profiles…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no intel profiles match</div>
        )}
        {visible.map((row, i) => {
          const id = row.p.name ?? row.p.id ?? `profile-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.p.company && (
                  <span style={{ fontSize: 10, color: '#22d3ee', background: 'rgba(34,211,238,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.p.company}</span>
                )}
                {row.p.sector && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.p.sector}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, color: '#4ade80', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Ops Events */}
                    <div>
                      <div style={{ fontSize: 10, color: '#fb923c', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>OPS EVENTS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no ops event matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.type ?? m.item.id ?? `event-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fdba74' }}>{n}</span>
                              {m.item.severity && (
                                <span style={{ fontSize: 9, color: '#fb923c', background: 'rgba(251,146,60,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.severity}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#fb923c', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Tasks */}
                    <div>
                      <div style={{ fontSize: 10, color: '#facc15', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>TASKS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no task matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `task-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fef08a' }}>{n}</span>
                              {m.item.priority && (
                                <span style={{ fontSize: 9, color: '#facc15', background: 'rgba(250,204,21,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.priority}</span>
                              )}
                              {m.item.status && !m.item.priority && (
                                <span style={{ fontSize: 9, color: '#facc15', background: 'rgba(250,204,21,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.status}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#facc15', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#facc15', borderRadius: 2 }} />
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
