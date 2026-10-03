import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ROETRI_RE = /\b(roetri|report\s+ops\s+task|report\s+event\s+task|archived\s+report|report\s+ops\s+event\s+task|fully\s+active\s+report|report\s+task\s+ops|ops\s+task\s+report|report\s+task\s+coverage|report\s+operational\s+coverage|unactioned\s+report)\b/i;

export function isRoetriQuery(t) { return ROETRI_RE.test(t || ''); }

export async function buildRoetriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [rR, oR, tR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
  ]);
  const rRaw = rR.value ?? {};
  const reports = Array.isArray(rRaw) ? rRaw : (rRaw.reports ?? rRaw.data ?? rRaw.results ?? []);
  const oRaw = oR.value ?? {};
  const opsEvents = Array.isArray(oRaw) ? oRaw : (oRaw.events ?? oRaw.data ?? oRaw.results ?? []);
  const tRaw = tR.value ?? {};
  const tasks = Array.isArray(tRaw) ? tRaw : (tRaw.tasks ?? tRaw.data ?? tRaw.results ?? []);

  const opsText = opsEvents.map(e =>
    `${e.name ?? e.title ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''}`.toLowerCase()
  ).join(' ');
  const taskText = tasks.map(t =>
    `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''} ${t.priority ?? ''}`.toLowerCase()
  ).join(' ');

  let fullyActive = 0, opsTriggered = 0, taskBacked = 0, archived = 0;
  for (const rep of reports) {
    const text = `${rep.name ?? rep.title ?? rep.id ?? ''} ${rep.description ?? ''} ${rep.type ?? ''} ${rep.category ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasOps = tokens.some(tok => opsText.includes(tok));
    const hasTask = tokens.some(tok => taskText.includes(tok));
    if (hasOps && hasTask) fullyActive++;
    else if (hasOps) opsTriggered++;
    else if (hasTask) taskBacked++;
    else archived++;
  }
  return `ROETRI Report × Ops Event × Task: ${reports.length} reports assessed against ` +
    `${opsEvents.length} ops events and ${tasks.length} tasks. ` +
    `FULLY ACTIVE: ${fullyActive} (ops event triggered + task assigned — report is operationally relevant with action coverage). ` +
    `OPS-TRIGGERED: ${opsTriggered} (ops event found, no task — trigger without action). ` +
    `TASK-BACKED: ${taskBacked} (task found, no ops event — action without live trigger). ` +
    `ARCHIVED: ${archived} (no ops event or task coverage — intelligence not being actioned).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 76, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 20, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ACTIVE': '#22c55e',
  'OPS-TRIGGERED': '#f97316',
  'TASK-BACKED': '#f59e0b',
  ARCHIVED: '#94a3b8',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreOpsEvents(report, events) {
  const text = `${report.name ?? report.title ?? report.id ?? ''} ${report.description ?? ''} ${report.type ?? ''} ${report.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const ev of events) {
    const eText = `${ev.name ?? ev.title ?? ev.type ?? ev.id ?? ''} ${ev.description ?? ''} ${ev.category ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => eText.includes(tok));
    if (hits.length > 0) matched.push({ item: ev, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreTasks(report, tasks) {
  const text = `${report.name ?? report.title ?? report.id ?? ''} ${report.description ?? ''} ${report.type ?? ''} ${report.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const tk of tasks) {
    const tText = `${tk.name ?? tk.title ?? tk.id ?? ''} ${tk.description ?? ''} ${tk.type ?? ''} ${tk.priority ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => tText.includes(tok));
    if (hits.length > 0) matched.push({ item: tk, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(report, opsEvents, tasks) {
  const text = `${report.name ?? report.title ?? report.id ?? ''} ${report.description ?? ''} ${report.type ?? ''} ${report.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const opsText = opsEvents.map(e => `${e.name ?? e.title ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''}`.toLowerCase()).join(' ');
  const taskText = tasks.map(t => `${t.name ?? t.title ?? t.id ?? ''} ${t.description ?? ''} ${t.type ?? ''} ${t.priority ?? ''}`.toLowerCase()).join(' ');
  const hasOps = tokens.some(tok => opsText.includes(tok));
  const hasTask = tokens.some(tok => taskText.includes(tok));
  if (hasOps && hasTask) return 'FULLY ACTIVE';
  if (hasOps) return 'OPS-TRIGGERED';
  if (hasTask) return 'TASK-BACKED';
  return 'ARCHIVED';
}

export default function ReportOpsTaskTriple() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
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
      const [rR, oR, tR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.json()),
      ]);
      const rRaw = rR.value ?? {};
      const rpts = Array.isArray(rRaw) ? rRaw : (rRaw.reports ?? rRaw.data ?? rRaw.results ?? []);
      const oRaw = oR.value ?? {};
      const evts = Array.isArray(oRaw) ? oRaw : (oRaw.events ?? oRaw.data ?? oRaw.results ?? []);
      const tRaw = tR.value ?? {};
      const tsks = Array.isArray(tRaw) ? tRaw : (tRaw.tasks ?? tRaw.data ?? tRaw.results ?? []);
      setReports(rpts);
      setOpsEvents(evts);
      setTasks(tsks);
      setRows(rpts.map(rep => ({
        rep,
        state: correlate(rep, evts, tsks),
        leftMatched: scoreOpsEvents(rep, evts),
        rightMatched: scoreTasks(rep, tsks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:roetri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:roetri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyActiveCount = rows.filter(r => r.state === 'FULLY ACTIVE').length;
  const opsTriggeredCount = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
  const taskBackedCount = rows.filter(r => r.state === 'TASK-BACKED').length;
  const archivedCount = rows.filter(r => r.state === 'ARCHIVED').length;

  const visible = rows.filter(row => {
    if (filter !== 'ALL' && row.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${row.rep.name ?? row.rep.title ?? row.rep.id ?? ''} ${row.rep.type ?? ''} ${row.rep.category ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.rep.name ?? row.rep.title ?? row.rep.id ?? 'report';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const opsNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.type ?? m.item.id ?? '?').join(', ');
      const taskNames = row.rightMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY ACTIVE'
        ? `has both ops event triggers (${opsNames || 'found'}) AND task coverage (${taskNames || 'found'}) — fully operationally active`
        : row.state === 'OPS-TRIGGERED'
          ? `has ops event triggers (${opsNames || 'found'}) but no task coverage — trigger without action`
          : row.state === 'TASK-BACKED'
            ? `has task coverage (${taskNames || 'found'}) but no live ops event trigger`
            : 'has no ops event or task coverage — archived intelligence not being actioned';
      const prompt = `Intelligence report "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational coverage status of this report.`;
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
      position: 'fixed', left: 791600, bottom: 8, zIndex: 442,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(34,197,94,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#22c55e', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ ROETRI — REPORT × OPS EVENT × TASK</span>
        {archivedCount > 0 && (
          <span style={{ background: '#94a3b8', color: '#0f172a', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{archivedCount} ARCHIVED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Reports', val: reports.length },
          { label: 'Ops Events', val: opsEvents.length },
          { label: 'Tasks', val: tasks.length },
          { label: 'Fully Active', val: fullyActiveCount, color: '#22c55e' },
          { label: 'Ops-Triggered', val: opsTriggeredCount, color: '#f97316' },
          { label: 'Task-Backed', val: taskBackedCount, color: '#f59e0b' },
          { label: 'Archived', val: archivedCount, color: '#94a3b8' },
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
            <div style={{ height: '100%', width: `${Math.round((fullyActiveCount / rows.length) * 100)}%`, background: '#22c55e', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((opsTriggeredCount / rows.length) * 100)}%`, background: '#f97316', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((taskBackedCount / rows.length) * 100)}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyActiveCount / rows.length) * 100) : 0}% fully active · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 5, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY ACTIVE', 'OPS-TRIGGERED', 'TASK-BACKED', 'ARCHIVED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#888') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'FULLY ACTIVE' ? '#000' : f === 'ARCHIVED' ? '#0f172a' : '#000') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no reports match</div>
        )}
        {visible.map((row, i) => {
          const id = row.rep.name ?? row.rep.title ?? row.rep.id ?? `report-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</span>
                {row.rep.type && (
                  <span style={{ fontSize: 9, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{row.rep.type}</span>
                )}
                {row.rep.category && (
                  <span style={{ fontSize: 9, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{row.rep.category}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, color: '#22c55e', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Ops Events */}
                    <div>
                      <div style={{ fontSize: 10, color: '#f97316', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>OPS EVENTS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no ops event matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.type ?? m.item.id ?? `event-${mi}`;
                        const sev = m.item.severity ?? m.item.payload?.severity ?? null;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fed7aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                              {sev != null && (
                                <span style={{ fontSize: 9, color: '#f97316', background: 'rgba(249,115,22,0.12)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>SEV {sev}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#f97316', fontWeight: 700, flexShrink: 0 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f97316', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Tasks */}
                    <div>
                      <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>TASKS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no task matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `task-${mi}`;
                        const priority = m.item.priority ?? m.item.status ?? null;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fde68a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                              {priority && (
                                <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>{priority}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f59e0b', borderRadius: 2 }} />
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
