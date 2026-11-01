/**
 * BrainIntelProfileOpsAlertTaskActivation — F247
 *
 * Fetches /v1/cinematic/brain + /entities/IntelProfile +
 *         /v1/ops/alerts + /entities/Task
 *
 * Keyword-matches each brain node (label/type/description)
 * against intel profiles, ops alerts, and tasks to classify:
 *
 *   ACTIVATED  — matches all 3 sources
 *   COMMANDING — matches 2 of 3 sources
 *   ACTIVE     — matches exactly 1 source
 *   DARK       — no match to any source
 *               (unactivated brain nodes with no intel profile,
 *                no ops alert, no task grounding)
 *
 * Toggle: ◈ BIOTCMD button (fixed, bottom strip) left:186120, zIndex:343
 * Stat tiles: brain nodes / intel profiles / alerts / tasks /
 *             activated / commanding / active / dark
 * Red pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched intel profiles with category badge +
 *                  matched ops alerts with severity badge +
 *                  matched tasks with status badge.
 * Filter tabs: ALL / ACTIVATED / COMMANDING / ACTIVE / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "biotcmd"/"brain intel ops"/"brain activation"/"brain command"/
 *        "dark brain"/"brain ops alert"/"brain task activation"/
 *        "unactivated brain"/"brain intel task"/"brain command activation"
 * Event: jarvis:biotcmd-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'COMMANDING', 'ACTIVE', 'DARK'];

const CLS_COLOR = {
  ACTIVATED:  '#22C55E',
  COMMANDING: '#38BDF8',
  ACTIVE:     '#F59E0B',
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

function normalizeBrain(raw) {
  if (Array.isArray(raw?.nodes))   return raw.nodes;
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

function normalizeIntel(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.intel_profiles))    return raw.intel_profiles;
  if (Array.isArray(raw?.profiles))          return raw.profiles;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.alerts))        return raw.alerts;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.tasks))        return raw.tasks;
  if (Array.isArray(raw?.data))         return raw.data;
  if (Array.isArray(raw?.results))      return raw.results;
  return [];
}

function nodeText(n) {
  return [n?.label, n?.name, n?.type, n?.description, n?.category].join(' ');
}

function intelText(p) {
  return [p?.name, p?.title, p?.category, p?.description, p?.tags?.join?.(' ')].join(' ');
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.source, a?.category].join(' ');
}

function taskText(t) {
  return [t?.name, t?.title, t?.description, t?.objective, t?.type].join(' ');
}

function classify(node, profiles, alerts, tasks) {
  const ntoks          = tokens(nodeText(node));
  const matchedProfiles = profiles.filter(p => overlaps(ntoks, intelText(p)));
  const matchedAlerts   = alerts.filter(a   => overlaps(ntoks, alertText(a)));
  const matchedTasks    = tasks.filter(t    => overlaps(ntoks, taskText(t)));
  const hasIp = matchedProfiles.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const hasTk = matchedTasks.length > 0;
  const srcCnt = [hasIp, hasAl, hasTk].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'ACTIVATED';
  else if (srcCnt === 2) cls = 'COMMANDING';
  else if (srcCnt === 1) cls = 'ACTIVE';
  else                   cls = 'DARK';
  return { cls, matchedProfiles, matchedAlerts, matchedTasks };
}

export function isBiotcmdQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('biotcmd') ||
    s.includes('brain intel ops') ||
    s.includes('brain activation') ||
    s.includes('brain command') ||
    s.includes('dark brain') ||
    s.includes('brain ops alert') ||
    s.includes('brain task activation') ||
    s.includes('unactivated brain') ||
    s.includes('brain intel task') ||
    s.includes('brain command activation') ||
    s.includes('brain intel profile ops') ||
    s.includes('intelligence activation')
  );
}

export function buildBiotcmdScript(counts) {
  return `Analyse the JARVIS Brain × IntelProfile × Ops Alert × Task Intelligence Command Activation.
Total brain nodes: ${counts.total}. Activated (all 3 sources): ${counts.activated}. Commanding (2 sources): ${counts.commanding}. Active (1 source): ${counts.active}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark brain nodes — no intel profile attribution, no ops alert coverage, and no active task grounding — these are full intelligence blind spots.
Identify the highest-priority dark nodes and propose activation steps: link to a relevant intel profile, connect to an ops alert monitoring rule, or assign a task.`;
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

export default function BrainIntelProfileOpsAlertTaskActivation() {
  const [open, setOpen]             = useState(false);
  const [nodes, setNodes]           = useState([]);
  const [profiles, setProfiles]     = useState([]);
  const [alerts, setAlerts]         = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [classified, setClass]      = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState('');
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssess]     = useState('');
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [bRaw, pRaw, aRaw, tRaw] = await Promise.all([
        safeFetch(`${API}/v1/cinematic/brain`),
        safeFetch(`${API}/entities/IntelProfile`),
        safeFetch(`${API}/v1/ops/alerts`),
        safeFetch(`${API}/entities/Task`),
      ]);
      const nArr = normalizeBrain(bRaw);
      const pArr = normalizeIntel(pRaw);
      const aArr = normalizeAlerts(aRaw);
      const tArr = normalizeTasks(tRaw);
      setNodes(nArr);
      setProfiles(pArr);
      setAlerts(aArr);
      setTasks(tArr);
      setClass(nArr.map(n => ({ n, ...classify(n, pArr, aArr, tArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:biotcmd-toggle', handler);
    return () => window.removeEventListener('jarvis:biotcmd-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:      classified.length,
    activated:  classified.filter(c => c.cls === 'ACTIVATED').length,
    commanding: classified.filter(c => c.cls === 'COMMANDING').length,
    active:     classified.filter(c => c.cls === 'ACTIVE').length,
    dark:       classified.filter(c => c.cls === 'DARK').length,
  };

  const visible = classified.filter(item => {
    if (tab !== 'ALL' && item.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return nodeText(item.n).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildBiotcmdScript(counts);
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
    position: 'fixed', inset: 0, zIndex: 10343,
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
          position: 'fixed', bottom: 8, left: 186120, zIndex: 343,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ BIOTCMD</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ BRAIN × INTEL PROFILE × OPS ALERT × TASK — INTELLIGENCE COMMAND ACTIVATION
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {nodes.length} nodes · {profiles.length} profiles · {alerts.length} alerts · {tasks.length} tasks
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('BRAIN NODES', counts.total,      '#94a3b8')}
            {tile('PROFILES',    profiles.length,   '#64748b')}
            {tile('ALERTS',      alerts.length,     '#64748b')}
            {tile('TASKS',       tasks.length,      '#64748b')}
            {tile('ACTIVATED',   counts.activated,  '#22C55E')}
            {tile('COMMANDING',  counts.commanding, '#38BDF8')}
            {tile('ACTIVE',      counts.active,     '#F59E0B')}
            {tile('DARK',        counts.dark,       '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search brain nodes…"
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
              const { n, cls, matchedProfiles, matchedAlerts, matchedTasks } = item;
              const id = n?.id ?? n?.label ?? n?.name ?? i;
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 90, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {n?.label || n?.name || n?.id || '—'}
                    </span>
                    {n?.type && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {n.type}
                      </span>
                    )}
                    {n?.centrality !== undefined && (
                      <span style={{ fontSize: 10, color: '#38bdf8', marginLeft: 4 }}>
                        ⬡{(n.centrality * 100).toFixed(0)}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      P:{matchedProfiles.length} A:{matchedAlerts.length} T:{matchedTasks.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedProfiles.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Intel Profiles: </span>
                          {matchedProfiles.slice(0, 4).map((p, pi) => (
                            <span key={pi} style={{
                              marginRight: 5, background: 'rgba(167,139,250,0.1)',
                              border: '1px solid #a78bfa44', borderRadius: 3,
                              padding: '1px 5px', color: '#a78bfa',
                            }}>
                              {p?.name || p?.title || p?.id}
                              {p?.category && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{p.category}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedProfiles.length > 4 && <span style={{ color: '#475569' }}>+{matchedProfiles.length - 4}</span>}
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
                      {matchedTasks.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Tasks: </span>
                          {matchedTasks.slice(0, 4).map((t, ti) => (
                            <span key={ti} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.1)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22C55E',
                            }}>
                              {t?.name || t?.title || t?.id}
                              {t?.status && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{t.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedTasks.length > 4 && <span style={{ color: '#475569' }}>+{matchedTasks.length - 4}</span>}
                        </div>
                      )}
                      {matchedProfiles.length === 0 && matchedAlerts.length === 0 && matchedTasks.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No intel profile, ops alert, or task — unactivated brain node (intelligence dark zone).
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No brain nodes match the current filter.
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
