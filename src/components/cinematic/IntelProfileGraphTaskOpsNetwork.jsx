/**
 * IntelProfileGraphTaskOpsNetwork — F244
 *
 * Fetches /entities/IntelProfile + /v1/graph/centrality +
 *         /entities/Task + /v1/ops/alerts
 *
 * Keyword-matches each intel profile (name/category/description)
 * against graph centrality nodes, tasks, and ops alerts to classify:
 *
 *   COMMANDING — matches all 3 sources
 *                (profile has graph trace, active task, AND ops alert)
 *   ACTIVE     — matches 2 of 3 sources
 *   PARTIAL    — matches exactly 1 source
 *   DARK       — no match to any source
 *                (intelligence dead-ends — no graph trace,
 *                 no task, no ops alert coverage)
 *
 * Toggle: ◈ IGTOA button (fixed, bottom strip) left:184440, zIndex:340
 * Stat tiles: profiles / graph nodes / tasks / alerts /
 *             commanding / active / partial / dark
 * Red pulse on DARK count (blind intelligence assets).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched tasks with status badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / COMMANDING / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "igtoa"/"intel graph task"/"intel ops network"/
 *        "dark intel profile"/"intelligence command network"/
 *        "intel profile ops"/"profile dark"/"intel command"/
 *        "intel task ops"/"profile ops alert"
 * Event: jarvis:igtoa-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#38BDF8',
  PARTIAL:    '#F59E0B',
  DARK:       '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeProfiles(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.profiles))           return raw.profiles;
  if (Array.isArray(raw?.intel_profiles))     return raw.intel_profiles;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeGraph(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.nodes))              return raw.nodes;
  if (Array.isArray(raw?.centrality))         return raw.centrality;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.tasks))              return raw.tasks;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.alerts))             return raw.alerts;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function profileText(p) {
  return [p?.name, p?.full_name, p?.category, p?.description, p?.tags?.join?.(' ')].join(' ');
}

function graphText(n) {
  return [n?.label, n?.name, n?.type, n?.community, n?.description].join(' ');
}

function taskText(t) {
  return [t?.title, t?.name, t?.description, t?.objective, t?.type, t?.assignee].join(' ');
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.source, a?.category].join(' ');
}

function classify(profile, nodes, tasks, alerts) {
  const ptoks        = tokens(profileText(profile));
  const matchedNodes  = nodes.filter(n  => overlaps(ptoks, graphText(n)));
  const matchedTasks  = tasks.filter(t  => overlaps(ptoks, taskText(t)));
  const matchedAlerts = alerts.filter(a => overlaps(ptoks, alertText(a)));
  const hasGr = matchedNodes.length > 0;
  const hasTk = matchedTasks.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const srcCnt = [hasGr, hasTk, hasAl].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'COMMANDING';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'PARTIAL';
  else                   cls = 'DARK';
  return { cls, matchedNodes, matchedTasks, matchedAlerts };
}

export function isIgtoaQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('igtoa') ||
    s.includes('intel graph task') ||
    s.includes('intel ops network') ||
    s.includes('dark intel profile') ||
    s.includes('intelligence command network') ||
    s.includes('intel profile ops') ||
    s.includes('profile dark') ||
    s.includes('intel command network') ||
    s.includes('intel task ops') ||
    s.includes('profile ops alert') ||
    s.includes('intel network coverage') ||
    s.includes('profile command')
  );
}

export function buildIgtoaScript(counts) {
  return `Analyse the JARVIS IntelProfile × Graph × Task × Ops Alert Intelligence Command Network.
Total intel profiles: ${counts.total}. Commanding (all 3 sources): ${counts.commanding}. Active (2 sources): ${counts.active}. Partial (1 source): ${counts.partial}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark profiles — intelligence dead-ends with no graph trace, no active task, and no ops alert coverage.
Identify the highest-priority dark profiles and propose activation steps: link to a relevant graph node, assign a task, or connect to a monitoring alert.`;
}

const hdr = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` });

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdr() });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export default function IntelProfileGraphTaskOpsNetwork() {
  const [open, setOpen]           = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [nodes, setNodes]         = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [classified, setClass]    = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssess]   = useState('');
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [pRaw, gRaw, tRaw, aRaw] = await Promise.all([
        safeFetch(`${API}/entities/IntelProfile`),
        safeFetch(`${API}/v1/graph/centrality`),
        safeFetch(`${API}/entities/Task`),
        safeFetch(`${API}/v1/ops/alerts`),
      ]);
      const pArr = normalizeProfiles(pRaw);
      const gArr = normalizeGraph(gRaw);
      const tArr = normalizeTasks(tRaw);
      const aArr = normalizeAlerts(aRaw);
      setProfiles(pArr);
      setNodes(gArr);
      setTasks(tArr);
      setAlerts(aArr);
      setClass(pArr.map(p => ({ p, ...classify(p, gArr, tArr, aArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:igtoa-toggle', handler);
    return () => window.removeEventListener('jarvis:igtoa-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:      classified.length,
    commanding: classified.filter(c => c.cls === 'COMMANDING').length,
    active:     classified.filter(c => c.cls === 'ACTIVE').length,
    partial:    classified.filter(c => c.cls === 'PARTIAL').length,
    dark:       classified.filter(c => c.cls === 'DARK').length,
  };

  const visible = classified.filter(item => {
    if (tab !== 'ALL' && item.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return profileText(item.p).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildIgtoaScript(counts);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ message: script }),
      });
      const j = await r.json();
      const text = j?.response || j?.message || j?.result || 'No assessment returned.';
      setAssess(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST', headers: hdr(),
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setAssess(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const darkPulse = counts.dark > 0;

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10340,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#e2e8f0',
  };
  const header = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 18px',
    borderBottom: '1px solid #1e3a5f',
    background: 'rgba(10,20,40,0.95)',
  };
  const tileRow = {
    display: 'flex', gap: 10, padding: '10px 18px',
    borderBottom: '1px solid #1e3a5f',
    flexWrap: 'wrap',
  };
  const tile = (label, val, color) => (
    <div key={label} style={{
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${color}44`,
      borderRadius: 6, padding: '6px 14px', minWidth: 90, textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
  const tabRow = {
    display: 'flex', gap: 6, padding: '8px 18px',
    borderBottom: '1px solid #1e3a5f',
  };
  const tabBtn = (t) => (
    <button key={t} onClick={() => setTab(t)} style={{
      background: tab === t ? '#1e3a5f' : 'transparent',
      border: `1px solid ${tab === t ? '#38bdf8' : '#334155'}`,
      color: tab === t ? '#38bdf8' : '#94a3b8',
      borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
    }}>{t}</button>
  );

  const statusColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'open' || v === 'active')  return '#38BDF8';
    if (v === 'closed' || v === 'done')  return '#22C55E';
    if (v === 'pending')                 return '#F59E0B';
    return '#64748b';
  };

  const severityColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'critical' || v === 'high')   return '#EF4444';
    if (v === 'medium' || v === 'moderate') return '#F59E0B';
    return '#64748b';
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 184440, zIndex: 340,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ IGTOA</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ INTELPROFILE × GRAPH × TASK × OPS ALERT — INTELLIGENCE COMMAND NETWORK
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {profiles.length} profiles · {nodes.length} nodes · {tasks.length} tasks · {alerts.length} alerts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('PROFILES',   counts.total,      '#94a3b8')}
            {tile('GR NODES',   nodes.length,      '#64748b')}
            {tile('TASKS',      tasks.length,      '#64748b')}
            {tile('ALERTS',     alerts.length,     '#64748b')}
            {tile('COMMANDING', counts.commanding, '#22C55E')}
            {tile('ACTIVE',     counts.active,     '#38BDF8')}
            {tile('PARTIAL',    counts.partial,    '#F59E0B')}
            {tile('DARK',       counts.dark,       '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
                border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', fontSize: 11, padding: '3px 8px', outline: 'none',
              }}
            />
          </div>

          {loading && (
            <div style={{ padding: 18, color: '#64748b', fontSize: 12 }}>Loading data…</div>
          )}
          {err && (
            <div style={{ padding: 18, color: '#EF4444', fontSize: 11 }}>Error: {err}</div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 18px' }}>
            {visible.map((item, i) => {
              const { p, cls, matchedNodes, matchedTasks, matchedAlerts } = item;
              const id = p?.id ?? p?.name ?? i;
              const isExpanded = !!expanded[id];
              return (
                <div key={id} style={{ borderBottom: '1px solid #1e2a3a', padding: '7px 0' }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    onClick={() => toggleRow(id)}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1,
                      color: CLS_COLOR[cls],
                      border: `1px solid ${CLS_COLOR[cls]}44`,
                      borderRadius: 3, padding: '1px 6px', minWidth: 84, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {p?.name || p?.full_name || p?.id || '—'}
                    </span>
                    {p?.category && (
                      <span style={{
                        fontSize: 10, color: '#a78bfa',
                        background: 'rgba(167,139,250,0.08)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {p.category}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      G:{matchedNodes.length} T:{matchedTasks.length} A:{matchedAlerts.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedNodes.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Graph: </span>
                          {matchedNodes.slice(0, 4).map((n, ni) => (
                            <span key={ni} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38bdf8',
                            }}>
                              {n?.label || n?.name || n?.id}
                              {n?.score != null && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{(+n.score).toFixed(3)}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedNodes.length > 4 && <span style={{ color: '#475569' }}>+{matchedNodes.length - 4}</span>}
                        </div>
                      )}
                      {matchedTasks.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Tasks: </span>
                          {matchedTasks.slice(0, 4).map((t, ti) => (
                            <span key={ti} style={{
                              marginRight: 5, background: 'rgba(245,158,11,0.1)',
                              border: '1px solid #f59e0b44', borderRadius: 3,
                              padding: '1px 5px', color: '#F59E0B',
                            }}>
                              {t?.title || t?.name || t?.id}
                              {t?.status && (
                                <span style={{ color: statusColor(t.status), marginLeft: 3, textTransform: 'uppercase', fontSize: 9 }}>
                                  [{t.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedTasks.length > 4 && <span style={{ color: '#475569' }}>+{matchedTasks.length - 4}</span>}
                        </div>
                      )}
                      {matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Ops Alerts: </span>
                          {matchedAlerts.slice(0, 4).map((a, ai) => (
                            <span key={ai} style={{
                              marginRight: 5, background: 'rgba(239,68,68,0.1)',
                              border: '1px solid #ef444444', borderRadius: 3,
                              padding: '1px 5px', color: '#EF4444',
                            }}>
                              {a?.title || a?.name || a?.id}
                              {a?.severity && (
                                <span style={{ color: severityColor(a.severity), marginLeft: 3, textTransform: 'uppercase', fontSize: 9 }}>
                                  [{a.severity}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedAlerts.length > 4 && <span style={{ color: '#475569' }}>+{matchedAlerts.length - 4}</span>}
                        </div>
                      )}
                      {matchedNodes.length === 0 && matchedTasks.length === 0 && matchedAlerts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No graph trace, task, or ops alert — dark intelligence asset.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No intel profiles match the current filter.
              </div>
            )}
          </div>

          <div style={{
            padding: '10px 18px',
            borderTop: '1px solid #1e3a5f',
            background: 'rgba(10,20,40,0.95)',
          }}>
            {assessment && (
              <div style={{
                marginBottom: 8, padding: 10,
                background: 'rgba(56,189,248,0.05)',
                border: '1px solid #1e3a5f', borderRadius: 6,
                fontSize: 11, color: '#94a3b8', maxHeight: 100, overflowY: 'auto',
              }}>{assessment}</div>
            )}
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? 'rgba(56,189,248,0.1)' : 'rgba(56,189,248,0.15)',
              border: '1px solid #38bdf8', color: '#38bdf8',
              borderRadius: 4, padding: '5px 16px', cursor: assessing ? 'not-allowed' : 'pointer',
              fontSize: 11, letterSpacing: 1,
            }}>
              {assessing ? 'ASSESSING…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
