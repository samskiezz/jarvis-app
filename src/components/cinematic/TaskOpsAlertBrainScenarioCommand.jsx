/**
 * TaskOpsAlertBrainScenarioCommand — F211
 *
 * Fetches /entities/Task + /v1/ops/alerts + /v1/cinematic/brain +
 *         /v1/scenario/list.
 *
 * Keyword-matches each task (name/title/description/status) against
 * ops-alert names/descriptions, brain node labels, and scenario
 * names/descriptions to classify:
 *
 *   COMMANDED  — task matches ops alert + brain node + scenario
 *                (fully grounded: alerted, modeled, and scripted)
 *   ARMED      — task matches brain node + scenario, or ops alert + scenario
 *                (modeled + scripted, or alerted + scripted — no full coverage)
 *   MONITORED  — task matches ops alert + brain node only, or any single source
 *                (partially grounded)
 *   ADRIFT     — no match to any source
 *                (operationally blind — no alert, no model, no playbook)
 *
 * Toggle: ◈ TOBSCMD button (fixed, bottom strip) left:165960, zIndex:307
 * Stat tiles: tasks / alerts / brain / scenarios / commanded / armed / monitored / adrift
 * Red pulse on ADRIFT count (full mission blind spots).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched brain nodes with centrality score badge +
 *                  matched scenarios with status badge.
 * Filter tabs: ALL / COMMANDED / ARMED / MONITORED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tobscmd"/"task command"/"mission command"/"adrift tasks"
 *        "task alert brain"/"task scenario"/"mission intelligence"
 *        "task operational command"/"task mission"/"blind tasks"
 *        "task brain scenario"/"task ops alert"/"task grounding"
 * Event: jarvis:tobscmd-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'ARMED', 'MONITORED', 'ADRIFT'];

const CLS_COLOR = {
  COMMANDED: '#22C55E',
  ARMED:     '#38BDF8',
  MONITORED: '#F97316',
  ADRIFT:    '#EF4444',
};

const SEV_COLOR = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B',
  low: '#22C55E', info: '#38BDF8',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.tasks))    return raw.tasks;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  if (Array.isArray(raw?.entities)) return raw.entities;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeBrain(raw) {
  const nodes = raw?.nodes || raw?.graph?.nodes || raw?.data?.nodes || [];
  return Array.isArray(nodes) ? nodes : [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

export function isTobscmdQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'tobscmd', 'task command', 'mission command', 'adrift tasks',
    'task alert brain', 'task scenario', 'mission intelligence',
    'task operational command', 'task mission', 'blind tasks',
    'task brain scenario', 'task ops alert', 'task grounding',
  ].some(k => s.includes(k));
}

export function buildTobscmdScript() {
  return (
    'Fetch /entities/Task, /v1/ops/alerts, /v1/cinematic/brain, and /v1/scenario/list. ' +
    'Keyword-match each task (name/title/description/status) against ops-alert names/descriptions, ' +
    'brain node labels/types, and scenario names/descriptions. ' +
    'Classify each task as COMMANDED (matches ops alert + brain node + scenario — fully grounded), ' +
    'ARMED (matches brain node + scenario, or ops alert + scenario — partial coverage), ' +
    'MONITORED (matches ops alert + brain node only, or any single source), ' +
    'or ADRIFT (no match — operational blind spot with no alert trigger, no brain model, no playbook). ' +
    'Report total ADRIFT count. Identify which adrift tasks are highest priority by status or keywords. ' +
    'Recommend which ops alerts should be linked, which brain model areas should cover them, ' +
    'and which scenarios should be scripted to eliminate mission blind spots.'
  );
}

export default function TaskOpsAlertBrainScenarioCommand() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    tasks: 0, alerts: 0, brain: 0, scenarios: 0,
    commanded: 0, armed: 0, monitored: 0, adrift: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      const [tasksRaw, alertsRaw, brainRaw, scenariosRaw] = await Promise.all([
        fetch(`${API}/entities/Task`,        { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/ops/alerts`,        { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/cinematic/brain`,   { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const tasks     = normalizeTasks(tasksRaw);
      const alerts    = normalizeAlerts(alertsRaw);
      const brain     = normalizeBrain(brainRaw);
      const scenarios = normalizeScenarios(scenariosRaw);

      const built = tasks.map((task, idx) => {
        const taskText = [
          task.name, task.title, task.description, task.status,
          task.type, task.category, task.tags?.join?.(' '),
          task.owner, task.assignee, task.objective,
        ].filter(Boolean).join(' ');
        const tToks = tokens(taskText);

        const matchedAlerts = alerts.filter(a => {
          const s = [a.name, a.title, a.description, a.category, a.type, a.message, a.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(tToks, s);
        });

        const matchedBrain = brain.filter(n => {
          const s = [n.label, n.name, n.type, n.description, n.category]
            .filter(Boolean).join(' ');
          return overlaps(tToks, s);
        });

        const matchedScenarios = scenarios.filter(sc => {
          const s = [sc.name, sc.title, sc.description, sc.category, sc.type, sc.tags?.join?.(' ')]
            .filter(Boolean).join(' ');
          return overlaps(tToks, s);
        });

        const hasAlert    = matchedAlerts.length > 0;
        const hasBrain    = matchedBrain.length > 0;
        const hasScenario = matchedScenarios.length > 0;

        let cls;
        if (hasAlert && hasBrain && hasScenario) {
          cls = 'COMMANDED';
        } else if ((hasBrain && hasScenario) || (hasAlert && hasScenario)) {
          cls = 'ARMED';
        } else if (hasAlert || hasBrain || hasScenario) {
          cls = 'MONITORED';
        } else {
          cls = 'ADRIFT';
        }

        return {
          id:              `task-${idx}`,
          label:           task.name || task.title || `Task ${idx + 1}`,
          status:          task.status || '',
          type:            task.type || task.category || '',
          cls,
          matchedAlerts,
          matchedBrain,
          matchedScenarios,
        };
      });

      const commanded = built.filter(r => r.cls === 'COMMANDED').length;
      const armed     = built.filter(r => r.cls === 'ARMED').length;
      const monitored = built.filter(r => r.cls === 'MONITORED').length;
      const adrift    = built.filter(r => r.cls === 'ADRIFT').length;

      setRows(built);
      setCounts({
        tasks: built.length,
        alerts: alerts.length,
        brain: brain.length,
        scenarios: scenarios.length,
        commanded, armed, monitored, adrift,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:tobscmd-toggle', handler);
    return () => window.removeEventListener('jarvis:tobscmd-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildTobscmdScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.adrift > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s)
        || r.status.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 165960, zIndex: 307,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ TOBSCMD{counts.adrift > 0 ? <span style={pulse}> {counts.adrift}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 740, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(239,68,68,0.07)',
        }}>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 13 }}>
            ◈ TOBSCMD — Task Mission Command Intelligence
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          {[
            ['Tasks',      counts.tasks,      '#94A3B8'],
            ['Alerts',     counts.alerts,     '#94A3B8'],
            ['Brain',      counts.brain,      '#94A3B8'],
            ['Scenarios',  counts.scenarios,  '#94A3B8'],
            ['Commanded',  counts.commanded,  CLS_COLOR.COMMANDED],
            ['Armed',      counts.armed,      CLS_COLOR.ARMED],
            ['Monitored',  counts.monitored,  CLS_COLOR.MONITORED],
            ['Adrift',     counts.adrift,     CLS_COLOR.ADRIFT],
          ].map(([lbl, val, clr]) => (
            <div key={lbl} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${clr}44`,
              borderRadius: 6, padding: '5px 10px', minWidth: 72, textAlign: 'center',
            }}>
              <div style={{ color: clr, fontSize: 18, fontWeight: 700,
                ...(lbl === 'Adrift' && val > 0 ? pulse : {}) }}>{val}</div>
              <div style={{ color: '#64748B', fontSize: 10 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: tab === t ? CLS_COLOR[t] || '#EF4444' : 'rgba(255,255,255,0.05)',
              color: tab === t ? '#000' : '#94A3B8', border: 'none', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              marginLeft: 'auto', padding: '3px 8px', fontSize: 11, borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
              color: '#E2E8F0', fontFamily: 'monospace', width: 160,
            }} />
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          <button onClick={assess} disabled={assessing} style={{
            padding: '4px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
            background: assessing ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)',
            border: '1px solid #EF4444', color: '#EF4444', borderRadius: 4,
            fontFamily: 'monospace',
          }}>{assessing ? '⟳ Assessing…' : '▶ ASSESS'}</button>
          {assessment && (
            <div style={{ marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
              background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'pre-wrap',
            }}>{assessment}</div>
          )}
        </div>

        {/* Error / loading */}
        {error   && <div style={{ padding: '8px 14px', color: '#EF4444', fontSize: 11 }}>Error: {error}</div>}
        {loading && <div style={{ padding: '8px 14px', color: '#64748B', fontSize: 11 }}>Loading…</div>}

        {/* Rows */}
        <div style={{ padding: '8px 14px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#475569', fontSize: 12, padding: '12px 0' }}>No tasks match this filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => toggleExpand(row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${CLS_COLOR[row.cls]}33`,
                }}
              >
                <span style={{
                  padding: '1px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`, color: CLS_COLOR[row.cls],
                  whiteSpace: 'nowrap',
                }}>{row.cls}</span>
                <span style={{ color: '#E2E8F0', fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.status && <span style={{ color: '#94A3B8', fontSize: 10 }}>{row.status}</span>}
                {row.type && <span style={{ color: '#64748B', fontSize: 10 }}>{row.type}</span>}
                <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>
                  {expanded[row.id] ? '▲' : '▼'}
                </span>
              </div>

              {expanded[row.id] && (
                <div style={{
                  marginTop: 2, marginLeft: 12, padding: '8px 12px',
                  background: 'rgba(0,0,0,0.3)', borderRadius: 4,
                  border: '1px solid rgba(239,68,68,0.1)',
                }}>
                  {/* Ops Alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>OPS ALERTS</div>
                      {row.matchedAlerts.map((a, i) => {
                        const sev = (a.severity || a.level || a.priority || 'medium').toLowerCase();
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: `${SEV_COLOR[sev] || '#94A3B8'}22`,
                              color: SEV_COLOR[sev] || '#94A3B8',
                            }}>{sev.toUpperCase()}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                              {a.name || a.title || a.message || a.description || 'Alert'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Brain Nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>BRAIN NODES</div>
                      {row.matchedBrain.map((n, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(n.centrality !== undefined || n.score !== undefined) && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(168,85,247,0.12)', color: '#A855F7',
                            }}>{(n.centrality ?? n.score ?? 0).toFixed(3)}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {n.label || n.name || 'Node'}
                          </span>
                          {n.type && <span style={{ color: '#64748B', fontSize: 10 }}>{n.type}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Scenarios */}
                  {row.matchedScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4 }}>SCENARIOS</div>
                      {row.matchedScenarios.map((sc, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {(sc.status || sc.state) && (
                            <span style={{
                              padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                              background: 'rgba(56,189,248,0.12)', color: '#38BDF8',
                            }}>{(sc.status || sc.state).toUpperCase()}</span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 11 }}>
                            {sc.name || sc.title || 'Scenario'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedAlerts.length === 0 && row.matchedBrain.length === 0 &&
                   row.matchedScenarios.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 11 }}>No matching alerts, brain nodes, or scenarios found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
