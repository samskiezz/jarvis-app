/**
 * TaskContactOpsAlertBrainMissionChain — F124
 *
 * Fetches /entities/Task + /entities/Contact + /v1/ops/alerts + /v1/cinematic/brain.
 *
 * Keyword-matches each task against contacts, ops alerts, and brain nodes to classify:
 *
 *   CRITICAL  — task matches contact AND ops alert AND brain node
 *               (fully grounded: staffed, triggered, and modeled)
 *   STAFFED   — task matches contact AND ops alert but no brain model
 *               (actionable but unmodeled — knowledge gap)
 *   ALERTED   — task matches ops alert but no contact owner
 *               (triggered but unstaffed — ownership gap)
 *   ADRIFT    — no match to any source
 *               (mission orphan: no owner, no trigger, no brain model)
 *
 * Toggle: ◈ MCRCHN button (fixed, bottom strip) left:117800, zIndex:221
 * Stat tiles: tasks / contacts / alerts / brain-nodes / critical / staffed / alerted / adrift
 * Red pulse on ADRIFT count (mission orphans).
 * Expandable rows: matched contacts with role/org +
 *                  matched ops alerts with severity badge +
 *                  matched brain nodes with centrality score badge.
 * Filter tabs: ALL / CRITICAL / STAFFED / ALERTED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "mcrchn"/"mission chain"/"task response chain"/"critical response"/"mission critical"
 *        "task ops alert"/"task brain response"/"task contact chain"/"task adrift"
 *        "adrift tasks"/"mission orphan"/"unstaffed task"/"task coverage chain"
 *        "critical mission chain"/"response chain"/"task response coverage"
 * Event: jarvis:mcrchn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CRITICAL', 'STAFFED', 'ALERTED', 'ADRIFT'];

const CLS_COLOR = {
  CRITICAL: '#22C55E',
  STAFFED:  '#3B82F6',
  ALERTED:  '#F97316',
  ADRIFT:   '#EF4444',
};

export function isMcrchQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'mcrchn', 'mission chain', 'task response chain', 'critical response', 'mission critical',
    'task ops alert', 'task brain response', 'task contact chain', 'task adrift',
    'adrift tasks', 'mission orphan', 'unstaffed task', 'task coverage chain',
    'critical mission chain', 'response chain', 'task response coverage',
    'task brain chain', 'task contact ops', 'mission critical response',
  ].some(kw => s.includes(kw));
}

export function buildMcrchScript(q) {
  return `JARVIS task–contact–ops-alert–brain mission critical response chain triggered by: "${q}". Fetch /entities/Task + /entities/Contact + /v1/ops/alerts + /v1/cinematic/brain. Classify each task as CRITICAL/STAFFED/ALERTED/ADRIFT. Report the adrift count and top 3 mission orphans with no contact owner, no ops alert trigger, and no brain model grounding.`;
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
  return t.title || t.name || t.description || t.id || 'Unknown';
}

function taskTokens(t) {
  return tokens(
    `${t.title || ''} ${t.name || ''} ${t.description || ''} ${t.type || ''} ${t.category || ''} ${t.tags ? (Array.isArray(t.tags) ? t.tags.join(' ') : t.tags) : ''}`
  );
}

function classifyTask(task, contacts, alerts, brainNodes) {
  const toks = taskTokens(task);

  const mContacts = contacts.filter(c =>
    overlaps(toks, `${c.name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''} ${c.description || ''} ${c.tags ? (Array.isArray(c.tags) ? c.tags.join(' ') : c.tags) : ''}`)
  );
  const mAlerts = alerts.filter(a =>
    overlaps(toks, `${a.title || ''} ${a.name || ''} ${a.message || ''} ${a.description || ''} ${a.type || ''} ${a.category || ''} ${a.tags ? (Array.isArray(a.tags) ? a.tags.join(' ') : a.tags) : ''}`)
  );
  const mBrain = brainNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.entity || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`)
  );

  const hasContact = mContacts.length > 0;
  const hasAlert   = mAlerts.length > 0;
  const hasBrain   = mBrain.length > 0;

  let cls;
  if (hasContact && hasAlert && hasBrain)  cls = 'CRITICAL';
  else if (hasContact && hasAlert)         cls = 'STAFFED';
  else if (hasAlert)                       cls = 'ALERTED';
  else                                     cls = 'ADRIFT';

  return { task, cls, mContacts, mAlerts, mBrain };
}

export default function TaskContactOpsAlertBrainMissionChain() {
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
      const [taskRaw, contactRaw, alertRaw, brainRaw] = await Promise.all([
        fetcher('/entities/Task'),
        fetcher('/entities/Contact'),
        fetcher('/v1/ops/alerts'),
        fetcher('/v1/cinematic/brain'),
      ]);

      const tasks    = normalizeArray(taskRaw,    ['tasks', 'data', 'items', 'results']);
      const contacts = normalizeArray(contactRaw, ['contacts', 'data', 'items', 'results']);
      const alerts   = normalizeArray(alertRaw,   ['alerts', 'data', 'items', 'results']);
      const brainNodes = normalizeArray(
        brainRaw,
        ['nodes', 'entities', 'data', 'items', 'results']
      );

      setRows(tasks.map(t => classifyTask(t, contacts, alerts, brainNodes)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:mcrchn-toggle', handler);
    return () => window.removeEventListener('jarvis:mcrchn-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    CRITICAL: rows.filter(r => r.cls === 'CRITICAL').length,
    STAFFED:  rows.filter(r => r.cls === 'STAFFED').length,
    ALERTED:  rows.filter(r => r.cls === 'ALERTED').length,
    ADRIFT:   rows.filter(r => r.cls === 'ADRIFT').length,
  };

  const contactCount = rows.reduce((n, r) => n + r.mContacts.length, 0);
  const alertCount   = rows.reduce((n, r) => n + r.mAlerts.length,   0);
  const brainCount   = rows.reduce((n, r) => n + r.mBrain.length,    0);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return taskLabel(r.task).toLowerCase().includes(s) ||
             (r.task.type || r.task.status || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Tasks: ${rows.length}. Critical: ${counts.CRITICAL}. Staffed: ${counts.STAFFED}. Alerted: ${counts.ALERTED}. Adrift: ${counts.ADRIFT}.`;
    const prompt = `JARVIS task–contact–ops-alert–brain mission critical response chain: ${summary}. Identify the most dangerous ADRIFT tasks — mission orphans with no contact owner, no ops alert trigger, and no brain model grounding. Provide a 2-sentence advisory on the highest-risk adrift tasks and priority actions to close the mission coverage gap.`;
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
          position: 'fixed', bottom: 8, left: 117800, zIndex: 221,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ MCRCHN</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 221, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ MCRCHN</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Task × Contact × Ops Alert × Brain — Mission Critical Response Chain</span>
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
          { label: 'TASKS',    val: rows.length,     color: '#94a3b8' },
          { label: 'CONTACTS', val: contactCount,    color: '#22D3EE' },
          { label: 'ALERTS',   val: alertCount,      color: '#F97316' },
          { label: 'BRAIN',    val: brainCount,      color: '#a78bfa' },
          { label: 'CRITICAL', val: counts.CRITICAL, color: CLS_COLOR.CRITICAL },
          { label: 'STAFFED',  val: counts.STAFFED,  color: CLS_COLOR.STAFFED },
          { label: 'ALERTED',  val: counts.ALERTED,  color: CLS_COLOR.ALERTED },
          { label: 'ADRIFT',   val: counts.ADRIFT,   color: CLS_COLOR.ADRIFT, pulse: counts.ADRIFT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'mcrchn-pulse 2s ease-in-out infinite' : 'none',
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
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
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
                  {taskLabel(r.task)}
                </span>
                {(r.task.status || r.task.type) && (
                  <span style={{ background: '#030c18', border: '1px solid #1e3a5f', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.task.status || r.task.type}
                  </span>
                )}
                {r.task.priority && (
                  <span style={{ background: '#180800', border: '1px solid #7c2d12', color: '#F97316', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    P:{r.task.priority}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.org || c.organisation) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{c.role || ''}{c.role && (c.org || c.organisation) ? ' · ' : ''}{c.org || c.organisation || ''}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#F97316', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((a, k) => (
                          <span key={k} style={{ background: '#180800', border: '1px solid #7c2d12', color: '#F97316', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.name || a.message || a.id}
                            {(a.severity || a.level) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{a.severity || a.level}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mBrain.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mBrain.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mBrain.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.entity || n.id}
                            {n.centrality != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [c:{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length === 0 && r.mAlerts.length === 0 && r.mBrain.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No contact owner, no ops alert trigger, no brain model — mission orphan with zero operational grounding.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes mcrchn-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
