/**
 * TaskBrainGraphReportOpsMissionControl — F129
 *
 * 5-source mission control intelligence audit.
 * Fetches /entities/Task + /v1/cinematic/brain + /v1/graph/centrality
 *         + /v1/reports + /v1/ops/alerts
 *
 * Keyword-matches each task against brain nodes, graph centrality nodes,
 * filed reports, and ops alerts to classify mission control coverage:
 *
 *   COMMANDED — matches brain + graph + report + ops alert
 *               (fully controlled: modeled, traced, documented, alerted)
 *   MODELED   — matches brain + graph but no report/alert
 *               (architecturally placed but not operationally active)
 *   GRAPHED   — matches graph + report but no brain/alert
 *               (documented and traced but not modeled or monitored)
 *   DOCUMENTED — matches report only (no brain/graph/alert grounding)
 *               (filed but operationally unanchored)
 *   ADRIFT    — no match to any source
 *               (mission orphan: zero brain model, graph trace, report, alert)
 *
 * Toggle: ◈ MCTRL button (fixed, bottom strip) left:120600, zIndex:226
 * Stat tiles: tasks / brain-nodes / graph-nodes / reports / alerts /
 *             commanded / modeled / graphed / documented / adrift
 * Red pulse on ADRIFT count (mission orphans).
 * Expandable rows: matched brain nodes with centrality score badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched reports with date badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / COMMANDED / MODELED / GRAPHED / DOCUMENTED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "mctrl"/"mission control"/"task mission control"/"task intelligence control"
 *        "task brain graph"/"task report alert"/"mission orphan"/"adrift tasks"
 *        "task control"/"mission control intelligence"/"task ops alert"
 *        "commanded tasks"/"mission modeled"/"task graphed"/"mission audit"
 *        "task 5 source"/"task full coverage"/"mission coverage"/"ops mission"
 * Event: jarvis:mctrl-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'MODELED', 'GRAPHED', 'DOCUMENTED', 'ADRIFT'];

const CLS_COLOR = {
  COMMANDED:  '#22C55E',
  MODELED:    '#3B82F6',
  GRAPHED:    '#F97316',
  DOCUMENTED: '#F59E0B',
  ADRIFT:     '#EF4444',
};

export function isMctrlQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'mctrl', 'mission control', 'task mission control', 'task intelligence control',
    'task brain graph', 'task report alert', 'mission orphan', 'adrift tasks',
    'task control', 'mission control intelligence', 'task ops alert',
    'commanded tasks', 'mission modeled', 'task graphed', 'mission audit',
    'task 5 source', 'task full coverage', 'mission coverage', 'ops mission',
    'task mission audit', 'mission control audit', 'task command intelligence',
    'mission intelligence control', 'task adrift', 'task orphan',
  ].some(kw => s.includes(kw));
}

export function buildMctrlScript(q) {
  return `JARVIS task mission-control intelligence audit triggered by: "${q}". Fetch /entities/Task + /v1/cinematic/brain + /v1/graph/centrality + /v1/reports + /v1/ops/alerts. Classify each task as COMMANDED/MODELED/GRAPHED/DOCUMENTED/ADRIFT. Report the ADRIFT count and top 3 mission orphan tasks with zero brain model, graph trace, report, or ops alert coverage.`;
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function taskLabel(t) {
  return t.name || t.title || t.task_name || t.description?.slice(0, 60) || t.id || 'Unknown';
}

function taskTokens(t) {
  return tokens(
    `${t.name || ''} ${t.title || ''} ${t.task_name || ''} ${t.description || ''} ${t.type || ''} ${t.category || ''} ${t.status || ''} ${t.tags ? (Array.isArray(t.tags) ? t.tags.join(' ') : t.tags) : ''}`
  );
}

function classifyTask(t, brainNodes, graphNodes, reports, alerts) {
  const toks = taskTokens(t);

  const mBrain = brainNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`)
  );
  const mGraph = graphNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`)
  );
  const mReports = reports.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.description || ''} ${r.category || ''} ${r.type || ''} ${r.tags ? (Array.isArray(r.tags) ? r.tags.join(' ') : r.tags) : ''}`)
  );
  const mAlerts = alerts.filter(a =>
    overlaps(toks, `${a.title || ''} ${a.name || ''} ${a.message || ''} ${a.description || ''} ${a.type || ''} ${a.category || ''} ${a.source || ''}`)
  );

  const hasBrain  = mBrain.length > 0;
  const hasGraph  = mGraph.length > 0;
  const hasReport = mReports.length > 0;
  const hasAlert  = mAlerts.length > 0;

  let cls;
  if (hasBrain && hasGraph && hasReport && hasAlert) cls = 'COMMANDED';
  else if (hasBrain && hasGraph)                     cls = 'MODELED';
  else if (hasGraph && hasReport)                    cls = 'GRAPHED';
  else if (hasReport)                                cls = 'DOCUMENTED';
  else                                               cls = 'ADRIFT';

  return { t, cls, mBrain, mGraph, mReports, mAlerts };
}

export default function TaskBrainGraphReportOpsMissionControl() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [taskRaw, brainRaw, graphRaw, reportRaw, alertRaw] = await Promise.all([
        fetcher('/entities/Task'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/graph/centrality'),
        fetcher('/v1/reports'),
        fetcher('/v1/ops/alerts'),
      ]);

      const tasks      = normalizeArray(taskRaw,   ['tasks', 'data', 'items', 'results']);
      const brainNodes = normalizeArray(brainRaw,  ['nodes', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(graphRaw,  ['nodes', 'data', 'items', 'results']);
      const reports    = normalizeArray(reportRaw, ['reports', 'data', 'items', 'results']);
      const alerts     = normalizeArray(alertRaw,  ['alerts', 'data', 'items', 'results']);

      setRows(tasks.map(t => classifyTask(t, brainNodes, graphNodes, reports, alerts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:mctrl-toggle', handler);
    return () => window.removeEventListener('jarvis:mctrl-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    COMMANDED:  rows.filter(r => r.cls === 'COMMANDED').length,
    MODELED:    rows.filter(r => r.cls === 'MODELED').length,
    GRAPHED:    rows.filter(r => r.cls === 'GRAPHED').length,
    DOCUMENTED: rows.filter(r => r.cls === 'DOCUMENTED').length,
    ADRIFT:     rows.filter(r => r.cls === 'ADRIFT').length,
  };

  const brainCount  = rows.reduce((n, r) => n + r.mBrain.length,   0);
  const graphCount  = rows.reduce((n, r) => n + r.mGraph.length,   0);
  const reportCount = rows.reduce((n, r) => n + r.mReports.length, 0);
  const alertCount  = rows.reduce((n, r) => n + r.mAlerts.length,  0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return taskLabel(r.t).toLowerCase().includes(s) ||
             (r.t.status || r.t.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Tasks: ${rows.length}. Commanded: ${counts.COMMANDED}. Modeled: ${counts.MODELED}. Graphed: ${counts.GRAPHED}. Documented: ${counts.DOCUMENTED}. Adrift: ${counts.ADRIFT}.`;
    const prompt = `JARVIS task mission-control intelligence audit: ${summary}. Identify the most critical ADRIFT tasks — those with no brain model, no graph trace, no report, and no ops alert coverage — representing full mission orphans. Provide a 2-sentence advisory on the top adrift tasks and priority actions to bring them into operational command across the brain, graph, reporting, and alert layers.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 120600, zIndex: 226,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ MCTRL</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 226, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ MCTRL</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Task × Brain × Graph × Report × Ops Alert — Mission Control Intelligence (5-source)</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'TASKS',      val: rows.length,       color: '#94a3b8' },
          { label: 'BRAIN',      val: brainCount,        color: '#22D3EE' },
          { label: 'GRAPH',      val: graphCount,        color: '#a78bfa' },
          { label: 'REPORTS',    val: reportCount,       color: '#F97316' },
          { label: 'ALERTS',     val: alertCount,        color: '#F59E0B' },
          { label: 'COMMANDED',  val: counts.COMMANDED,  color: CLS_COLOR.COMMANDED },
          { label: 'MODELED',    val: counts.MODELED,    color: CLS_COLOR.MODELED },
          { label: 'GRAPHED',    val: counts.GRAPHED,    color: CLS_COLOR.GRAPHED },
          { label: 'DOCUMENTED', val: counts.DOCUMENTED, color: CLS_COLOR.DOCUMENTED },
          { label: 'ADRIFT',     val: counts.ADRIFT,     color: CLS_COLOR.ADRIFT, pulse: counts.ADRIFT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'mctrl-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {taskLabel(r.t)}
                </span>
                {r.t.status && (
                  <span style={{ background: '#030c18', border: '1px solid #1e3a5f', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.t.status}
                  </span>
                )}
                {r.t.type && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.t.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mBrain.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mBrain.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mBrain.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {(n.centrality !== undefined || n.score !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(n.centrality ?? n.score ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraph.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {(n.centrality !== undefined || n.score !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(n.centrality ?? n.score ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rep, k) => (
                          <span key={k} style={{ background: '#150800', border: '1px solid #7c2d12', color: '#F97316', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rep.title || rep.name || rep.id}
                            {(rep.date || rep.created_at || rep.published_at) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(rep.date || rep.created_at || rep.published_at || '').toString().slice(0, 10)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, k) => (
                          <span key={k} style={{ background: '#120a00', border: '1px solid #78350f', color: '#F59E0B', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.name || a.message?.slice(0, 40) || a.id}
                            {(a.severity || a.level || a.priority) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{a.severity || a.level || a.priority}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mBrain.length === 0 && r.mGraph.length === 0 && r.mReports.length === 0 && r.mAlerts.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No brain model, no graph trace, no report, no ops alert — mission orphan with zero operational command grounding.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes mctrl-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
