import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TIRREP_RE = /\b(tirrep|task\s+investigation\s+report|task\s+report\s+investigation|orphaned\s+task|tracked\s+task\s+triple|task\s+fully\s+tracked|task\s+inv\s+report|task\s+investigation\s+rep|task\s+report\s+triple)\b/i;

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
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.tasks) ? data.tasks
    : Array.isArray(data.data) ? data.data
    : [];
  return arr.map(t => ({
    id: t.id || t._id || String(Math.random()),
    name: t.name || t.title || t.task || 'Unknown Task',
    description: t.description || t.summary || t.details || '',
    priority: t.priority || t.urgency || '',
    status: t.status || t.state || '',
    assignee: t.assignee || t.assigned_to || t.owner || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || ''),
    raw: t,
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.investigations) ? data.investigations
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : [];
  return arr.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: i.name || i.title || i.subject || 'Untitled Investigation',
    description: i.description || i.summary || i.details || i.notes || '',
    status: i.status || i.state || '',
    category: i.category || i.type || i.domain || '',
    tags: Array.isArray(i.tags) ? i.tags.join(' ') : String(i.tags || ''),
    raw: i,
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.reports) ? data.reports
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.data) ? data.data
    : [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    name: r.name || r.title || r.report || 'Untitled Report',
    description: r.description || r.summary || r.abstract || r.content || '',
    category: r.category || r.type || r.domain || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
  }));
}

function correlate(tasks, investigations, reports) {
  return tasks.map(task => {
    const toks = tok([task.name, task.description, task.priority, task.status, task.assignee, task.tags].join(' '));

    const matchedInvestigations = investigations
      .map(i => {
        const score = Math.max(
          matchScore(toks, i.name),
          matchScore(toks, i.description),
          matchScore(toks, i.category),
          matchScore(toks, i.tags),
        );
        return { ...i, matchScore: score };
      })
      .filter(i => i.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedReports = reports
      .map(r => {
        const score = Math.max(
          matchScore(toks, r.name),
          matchScore(toks, r.description),
          matchScore(toks, r.category),
          matchScore(toks, r.tags),
        );
        return { ...r, matchScore: score };
      })
      .filter(r => r.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasInv = matchedInvestigations.length > 0;
    const hasRep = matchedReports.length > 0;

    let state;
    if (hasInv && hasRep) state = 'FULLY TRACKED';
    else if (hasInv) state = 'INVESTIGATED';
    else if (hasRep) state = 'REPORTED';
    else state = 'ORPHANED';

    return { task, matchedInvestigations, matchedReports, state };
  });
}

export function isTirrepQuery(t) {
  return TIRREP_RE.test(t || '');
}

export async function buildTirrepScript() {
  try {
    const apiBase = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const key = (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';
    const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const [tRes, iRes, rRes] = await Promise.all([
      fetch(`${apiBase}/entities/Task`, { headers: hdr }),
      fetch(`${apiBase}/v1/investigations`, { headers: hdr }),
      fetch(`${apiBase}/v1/reports`, { headers: hdr }),
    ]);
    const [tData, iData, rData] = await Promise.all([tRes.json(), iRes.json(), rRes.json()]);
    const tasks = normaliseTasks(tData);
    const investigations = normaliseInvestigations(iData);
    const reports = normaliseReports(rData);
    const rows = correlate(tasks, investigations, reports);
    const tracked = rows.filter(r => r.state === 'FULLY TRACKED').length;
    const investigated = rows.filter(r => r.state === 'INVESTIGATED').length;
    const reported = rows.filter(r => r.state === 'REPORTED').length;
    const orphaned = rows.filter(r => r.state === 'ORPHANED').length;
    return `TIRREP coverage across ${rows.length} tasks: ${tracked} fully tracked (investigation + report), ${investigated} investigation-only, ${reported} report-only, ${orphaned} orphaned with no investigation or report linkage. ${orphaned > 0 ? `${orphaned} task${orphaned > 1 ? 's' : ''} lack both investigation and report coverage — operational blind spots requiring triage.` : 'All tasks have at least one coverage layer.'}`;
  } catch {
    return 'TIRREP coverage data unavailable — check task, investigations, and reports endpoints.';
  }
}

const STATE_COLOR = {
  'FULLY TRACKED': '#4ade80',
  'INVESTIGATED': '#60a5fa',
  'REPORTED': '#f59e0b',
  'ORPHANED': '#ef4444',
};

const PRIORITY_COLOR = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#facc15',
  LOW: '#4ade80',
  UNKNOWN: '#6b7280',
};

const TABS = ['ALL', 'FULLY TRACKED', 'INVESTIGATED', 'REPORTED', 'ORPHANED'];

export default function TaskInvestigationReportTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const apiBase = () => (typeof window !== 'undefined' && window.__JARVIS_API__) || API;
  const apiKey = () => (typeof window !== 'undefined' && window.__JARVIS_KEY__) || 'dev-key';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` };
      const [tRes, iRes, rRes] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, { headers: hdr }),
        fetch(`${apiBase()}/v1/investigations`, { headers: hdr }),
        fetch(`${apiBase()}/v1/reports`, { headers: hdr }),
      ]);
      const [tData, iData, rData] = await Promise.all([tRes.json(), iRes.json(), rRes.json()]);
      const tasks = normaliseTasks(tData);
      const investigations = normaliseInvestigations(iData);
      const reports = normaliseReports(rData);
      setRows(correlate(tasks, investigations, reports));
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

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tirrep-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tirrep-toggle', onToggle);
  }, []);

  const counts = {
    'ALL': rows.length,
    'FULLY TRACKED': rows.filter(r => r.state === 'FULLY TRACKED').length,
    'INVESTIGATED': rows.filter(r => r.state === 'INVESTIGATED').length,
    'REPORTED': rows.filter(r => r.state === 'REPORTED').length,
    'ORPHANED': rows.filter(r => r.state === 'ORPHANED').length,
  };

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r.state === tab;
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.task.name.toLowerCase().includes(q)
      || r.task.description.toLowerCase().includes(q)
      || r.task.status.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess(row) {
    setAssessing(true);
    try {
      const msg = `Assess task "${row.task.name}" (priority: ${row.task.priority}, status: ${row.task.status}, state: ${row.state}): ${row.matchedInvestigations.length} investigation(s) matched, ${row.matchedReports.length} report(s) matched. Summarise task coverage gap and recommended next operational action in 2 sentences.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const text = (d.answer || '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { /* swallow */ } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    const orphanedCount = counts['ORPHANED'];
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Investigation × Report Triple Coverage"
        style={{
          position: 'fixed', left: 780400, bottom: 8, zIndex: 422,
          background: orphanedCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.08)',
          border: `1px solid ${orphanedCount > 0 ? '#ef444466' : '#4ade8044'}`,
          color: orphanedCount > 0 ? '#ef4444' : '#4ade80',
          padding: '3px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
          fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ TIRREP{orphanedCount > 0 && (
          <span style={{ marginLeft: 5, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 9 }}>
            {orphanedCount}
          </span>
        )}
      </button>
    );
  }

  const tracked = counts['FULLY TRACKED'];
  const total = counts['ALL'];
  const pct = total > 0 ? Math.round((tracked / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 780400, bottom: 48, zIndex: 422,
      width: 490, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(6,10,18,0.97)', border: '1px solid #4ade8033',
      borderRadius: 8, fontFamily: 'monospace', overflow: 'hidden',
      boxShadow: '0 0 40px #4ade8011',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #4ade8022', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ TIRREP</span>
        <span style={{ color: '#6b7280', fontSize: 10, flex: 1 }}>Task × Investigation × Report</span>
        <button onClick={load} disabled={loading} style={{ background: 'none', border: 'none', color: '#4ade8088', cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #4ade8011' }}>
        {[
          { label: 'TRACKED', val: counts['FULLY TRACKED'], col: '#4ade80' },
          { label: 'INVEST', val: counts['INVESTIGATED'], col: '#60a5fa' },
          { label: 'REPORTED', val: counts['REPORTED'], col: '#f59e0b' },
          { label: 'ORPHANED', val: counts['ORPHANED'], col: '#ef4444' },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: col + '88', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid #4ade8011' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: '#6b7280', fontSize: 9 }}>FULLY TRACKED COVERAGE</span>
          <span style={{ color: '#4ade80', fontSize: 9 }}>{pct}% ({tracked}/{total})</span>
        </div>
        <div style={{ height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#4ade80,#60a5fa)', transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #4ade8011', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${STATE_COLOR[t] || '#4ade80'}22` : 'none',
            border: `1px solid ${tab === t ? (STATE_COLOR[t] || '#4ade80') + '66' : '#4ade8022'}`,
            color: tab === t ? (STATE_COLOR[t] || '#4ade80') : '#6b7280',
            padding: '2px 7px', borderRadius: 3, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {t} {counts[t] !== undefined ? `(${counts[t]})` : ''}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #4ade8022',
            color: '#c8e6ff', padding: '2px 7px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace', outline: 'none', width: 90,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {loading && <div style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: '#f87171', fontSize: 10, padding: 8 }}>{err}</div>}

        {visible.map((row, i) => {
          const isExpanded = expanded[row.task.id];
          const priColor = PRIORITY_COLOR[String(row.task.priority).toUpperCase()] || '#6b7280';
          return (
            <div key={row.task.id + i} style={{
              marginBottom: 4, background: 'rgba(255,255,255,0.02)', border: `1px solid ${STATE_COLOR[row.state]}22`,
              borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setExpanded(e => ({ ...e, [row.task.id]: !e[row.task.id] }))}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1, color: STATE_COLOR[row.state],
                  background: `${STATE_COLOR[row.state]}18`, border: `1px solid ${STATE_COLOR[row.state]}44`,
                  borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.task.name}
                </span>
                {row.task.priority && (
                  <span style={{
                    fontSize: 8, padding: '1px 4px', borderRadius: 2,
                    background: `${priColor}22`, color: priColor,
                    border: `1px solid ${priColor}44`, whiteSpace: 'nowrap',
                  }}>
                    {row.task.priority}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#60a5fa88' }}>{row.matchedInvestigations.length}INV</span>
                <span style={{ fontSize: 9, color: '#f59e0b88' }}>{row.matchedReports.length}REP</span>
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Investigations */}
                  <div style={{ flex: 1, background: 'rgba(96,165,250,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#60a5fa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      INVESTIGATIONS ({row.matchedInvestigations.length})
                    </div>
                    {row.matchedInvestigations.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No investigation match</div>
                    ) : (
                      row.matchedInvestigations.slice(0, 5).map((inv, ii) => (
                        <div key={inv.id + ii} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{inv.name}</span>
                            {inv.status && <span style={{ fontSize: 9, color: '#60a5fa88', whiteSpace: 'nowrap' }}>{inv.status}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(inv.matchScore * 100)}%`, background: '#60a5fa', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Reports */}
                  <div style={{ flex: 1, background: 'rgba(245,158,11,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      REPORTS ({row.matchedReports.length})
                    </div>
                    {row.matchedReports.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No report match</div>
                    ) : (
                      row.matchedReports.slice(0, 5).map((rep, ri) => (
                        <div key={rep.id + ri} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{rep.name}</span>
                            {rep.category && <span style={{ fontSize: 9, color: '#f59e0b88', whiteSpace: 'nowrap' }}>{rep.category}</span>}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(rep.matchScore * 100)}%`, background: '#f59e0b', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(74,222,128,0.1)', border: '1px solid #4ade8044',
                      color: '#4ade80', padding: '3px 12px', borderRadius: 3,
                      fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
