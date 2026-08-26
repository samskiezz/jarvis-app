import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GCITRI_RE = /\b(gcitri|graph\s+communit\w*\s+invest\w*\s+task|communit\w*\s+invest\w*\s+task|graph\s+communit\w*\s+task|unclaimed\s+communit\w*|communit\w*\s+task\s+invest\w*|communit\w*\s+invest\w*\s+task\w*|communit\w*\s+operational\s+gap|graph\s+communit\w*\s+invest\w*|graph\s+communit\w*\s+triple)\b/i;

export function isGcitriQuery(t) { return GCITRI_RE.test(t || ''); }

export async function buildGcitriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [commR, invR, taskR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
  ]);
  const commRaw = commR.value ?? {};
  const communities = Array.isArray(commRaw) ? commRaw
    : (commRaw.communities ?? commRaw.data ?? commRaw.results ?? []);
  const invRaw = invR.value ?? {};
  const investigations = Array.isArray(invRaw) ? invRaw
    : (invRaw.investigations ?? invRaw.data ?? invRaw.results ?? []);
  const taskRaw = taskR.value ?? {};
  const tasks = Array.isArray(taskRaw) ? taskRaw
    : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);

  const invText = investigations.map(i =>
    `${i.name ?? i.title ?? i.id ?? ''} ${i.description ?? ''} ${i.type ?? ''} ${i.subject ?? ''}`.toLowerCase()
  ).join(' ');
  const taskText = tasks.map(t =>
    `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''} ${t.assignee ?? ''}`.toLowerCase()
  ).join(' ');

  let fully = 0, investigated = 0, tasked = 0, unclaimed = 0;
  for (const c of communities) {
    const name = `${c.name ?? c.label ?? c.id ?? ''} ${c.description ?? ''} ${c.category ?? ''} ${c.tags ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(t => t.length > 2);
    const hasInv = tokens.some(tok => invText.includes(tok));
    const hasTask = tokens.some(tok => taskText.includes(tok));
    if (hasInv && hasTask) fully++;
    else if (hasInv) investigated++;
    else if (hasTask) tasked++;
    else unclaimed++;
  }
  return `GCITRI Graph Community × Investigation × Task: ${communities.length} communities assessed against ` +
    `${investigations.length} investigations and ${tasks.length} tasks. ` +
    `FULLY ENGAGED: ${fully} (investigation + task backing). INVESTIGATED: ${investigated} (investigation found, no task). ` +
    `TASKED: ${tasked} (task found, no investigation). UNCLAIMED: ${unclaimed} (no operational coverage — intelligence gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ENGAGED': '#4ade80',
  INVESTIGATED: '#818cf8',
  TASKED: '#fbbf24',
  UNCLAIMED: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreInvestigations(community, investigations) {
  const name = `${community.name ?? community.label ?? community.id ?? ''} ${community.description ?? ''} ${community.category ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const matched = [];
  for (const inv of investigations) {
    const invText = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.type ?? ''} ${inv.subject ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => invText.includes(tok));
    if (hits.length > 0) matched.push({ item: inv, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreTasks(community, tasks) {
  const name = `${community.name ?? community.label ?? community.id ?? ''} ${community.description ?? ''} ${community.category ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const matched = [];
  for (const task of tasks) {
    const taskText = `${task.name ?? task.title ?? task.id ?? ''} ${task.description ?? ''} ${task.type ?? ''} ${task.assignee ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => taskText.includes(tok));
    if (hits.length > 0) matched.push({ item: task, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(community, investigations, tasks) {
  const name = `${community.name ?? community.label ?? community.id ?? ''} ${community.description ?? ''} ${community.category ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const invText = investigations.map(i => `${i.name ?? i.title ?? i.id ?? ''} ${i.description ?? ''} ${i.type ?? ''}`.toLowerCase()).join(' ');
  const taskText = tasks.map(t => `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''}`.toLowerCase()).join(' ');
  const hasInv = tokens.some(tok => invText.includes(tok));
  const hasTask = tokens.some(tok => taskText.includes(tok));
  if (hasInv && hasTask) return 'FULLY ENGAGED';
  if (hasInv) return 'INVESTIGATED';
  if (hasTask) return 'TASKED';
  return 'UNCLAIMED';
}

export default function GraphCommunityInvestTaskTriple() {
  const [open, setOpen] = useState(false);
  const [communities, setCommunities] = useState([]);
  const [investigations, setInvestigations] = useState([]);
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
      const [commR, invR, taskR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/investigations`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
      ]);
      const commRaw = commR.value ?? {};
      const comms = Array.isArray(commRaw) ? commRaw : (commRaw.communities ?? commRaw.data ?? commRaw.results ?? []);
      const invRaw = invR.value ?? {};
      const invs = Array.isArray(invRaw) ? invRaw : (invRaw.investigations ?? invRaw.data ?? invRaw.results ?? []);
      const taskRaw = taskR.value ?? {};
      const tks = Array.isArray(taskRaw) ? taskRaw : (taskRaw.tasks ?? taskRaw.data ?? taskRaw.results ?? []);
      setCommunities(comms);
      setInvestigations(invs);
      setTasks(tks);
      setRows(comms.map(c => ({
        c,
        state: correlate(c, invs, tks),
        leftMatched: scoreInvestigations(c, invs),
        rightMatched: scoreTasks(c, tks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gcitri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gcitri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY ENGAGED').length;
  const investigatedCount = rows.filter(r => r.state === 'INVESTIGATED').length;
  const taskedCount = rows.filter(r => r.state === 'TASKED').length;
  const unclaimedCount = rows.filter(r => r.state === 'UNCLAIMED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.c.name ?? r.c.label ?? r.c.id ?? ''} ${r.c.category ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.c.name ?? row.c.label ?? row.c.id ?? 'community';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const invNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const taskNames = row.rightMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY ENGAGED'
        ? `has both investigation backing (${invNames || 'found'}) and task coverage (${taskNames || 'found'})`
        : row.state === 'INVESTIGATED'
          ? `has investigation coverage (${invNames || 'found'}) but no assigned task`
          : row.state === 'TASKED'
            ? `has task assignment (${taskNames || 'found'}) but no active investigation`
            : 'has NO investigation or task coverage — operational blind spot';
      const prompt = `Graph community "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational coverage completeness for this community.`;
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
      position: 'fixed', left: 788240, bottom: 8, zIndex: 436,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ GCITRI — GRAPH COMMUNITY × INVESTIGATION × TASK</span>
        {unclaimedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unclaimedCount} UNCLAIMED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Communities', val: communities.length },
          { label: 'Fully Engaged', val: fullyCount, color: '#4ade80' },
          { label: 'Investigated', val: investigatedCount, color: '#818cf8' },
          { label: 'Tasked', val: taskedCount, color: '#fbbf24' },
          { label: 'Unclaimed', val: unclaimedCount, color: '#ef4444' },
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
            <div style={{ height: '100%', width: `${Math.round((investigatedCount / rows.length) * 100)}%`, background: '#818cf8', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((taskedCount / rows.length) * 100)}%`, background: '#fbbf24', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully engaged · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY ENGAGED', 'INVESTIGATED', 'TASKED', 'UNCLAIMED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'UNCLAIMED' ? '#fff' : '#000') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no communities match</div>
        )}
        {visible.map((row, i) => {
          const id = row.c.name ?? row.c.label ?? row.c.id ?? `community-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.c.category && (
                  <span style={{ fontSize: 10, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.c.category}</span>
                )}
                {row.c.nodeCount !== undefined && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.c.nodeCount}n</span>
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
                    {/* Left pane: Investigations */}
                    <div>
                      <div style={{ fontSize: 10, color: '#818cf8', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>INVESTIGATIONS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no investigation matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `inv-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd' }}>{n}</span>
                              {m.item.status && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.status}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#818cf8', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Tasks */}
                    <div>
                      <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>TASKS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no task matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `task-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fde68a' }}>{n}</span>
                              {m.item.priority && (
                                <span style={{ fontSize: 9, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.priority}</span>
                              )}
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
