/**
 * GraphOpsAlertTaskContactCommand — F236
 *
 * Fetches /v1/graph/centrality + /v1/ops/alerts +
 *         /entities/Task + /entities/Contact
 *
 * Keyword-matches each graph node (label/name/type) against
 * ops alert titles/descriptions, task names/descriptions, and
 * contact names/roles/orgs to classify:
 *
 *   COMMANDING — matches all 3 sources
 *                (node is active, alerted, tasked, and staffed)
 *   ACTIVE     — matches 2 of 3 sources
 *   STAFFED    — matches exactly 1 source
 *   DARK       — no match to any source
 *                (blind-spot node — no alert coverage, no task, no contact owner)
 *
 * Toggle: ◈ GORCN button (fixed, bottom strip) left:179960, zIndex:332
 * Stat tiles: nodes / alerts / tasks / contacts /
 *             commanding / active / staffed / dark
 * Red pulse on DARK count (blind-spot nodes).
 * Expandable rows: matched ops alerts with severity badge +
 *                  matched tasks with status badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / COMMANDING / ACTIVE / STAFFED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "gorcn"/"graph command"/"graph ops"/"node command"/
 *        "dark node"/"blind node"/"graph task"/"graph contact"/
 *        "operational node"/"node coverage"/"graph coverage"
 * Event: jarvis:gorcn-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'STAFFED', 'DARK'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#38BDF8',
  STAFFED:    '#F59E0B',
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

function normalizeNodes(raw) {
  if (Array.isArray(raw?.nodes))     return raw.nodes;
  if (Array.isArray(raw?.graph?.nodes)) return raw.graph.nodes;
  if (Array.isArray(raw?.centrality)) return raw.centrality;
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.alerts))   return raw.alerts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.tasks))   return raw.tasks;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data))    return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function nodeLabel(n) {
  return n?.label || n?.name || n?.title || n?.id || 'Unknown';
}

function nodeText(n) {
  return [n?.label, n?.name, n?.title, n?.type, n?.category, n?.description].join(' ');
}

function classify(node, alerts, tasks, contacts) {
  const ntoks = tokens(nodeText(node));

  const matchedAlerts = alerts.filter(a =>
    overlaps(ntoks, [a?.title, a?.name, a?.description, a?.type, a?.category,
                     a?.severity, a?.source].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(ntoks, [t?.name, t?.title, t?.description, t?.type, t?.category,
                     t?.status, t?.objective].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(ntoks, [c?.name, c?.full_name, c?.role, c?.organisation, c?.org,
                     c?.email, (c?.tags || []).join(' ')].join(' '))
  );

  const hasA = matchedAlerts.length > 0;
  const hasT = matchedTasks.length > 0;
  const hasC = matchedContacts.length > 0;
  const srcCnt = [hasA, hasT, hasC].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'COMMANDING';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'STAFFED';
  else                   cls = 'DARK';

  return { cls, matchedAlerts, matchedTasks, matchedContacts };
}

export function isGorcnQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('gorcn') ||
    s.includes('graph command') ||
    s.includes('graph ops') ||
    s.includes('node command') ||
    s.includes('dark node') ||
    s.includes('blind node') ||
    s.includes('graph task') ||
    s.includes('graph contact') ||
    s.includes('operational node') ||
    s.includes('node coverage') ||
    s.includes('graph coverage')
  );
}

export function buildGorcnScript(counts) {
  return `Analyse the JARVIS Graph Ops Alert Task Contact Operational Readiness Command Network.
Total graph nodes: ${counts.total}. Commanding: ${counts.commanding}. Active: ${counts.active}. Staffed: ${counts.staffed}. Dark: ${counts.dark}.
Focus on the ${counts.dark} dark blind-spot nodes — graph nodes with no ops alert coverage, no task assignment, and no contact owner.
Identify the highest-priority dark nodes by centrality score and propose grounding actions: link each to a relevant ops alert, assign a responsible contact, or create a task to investigate.`;
}

export default function GraphOpsAlertTaskContactCommand() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef                  = useRef(null);

  const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nRes, aRes, tRes, cRes] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/centrality`,  { headers: hdrs }),
        fetch(`${apiBase()}/v1/ops/alerts`,        { headers: hdrs }),
        fetch(`${apiBase()}/entities/Task`,        { headers: hdrs }),
        fetch(`${apiBase()}/entities/Contact`,     { headers: hdrs }),
      ]);
      const [nRaw, aRaw, tRaw, cRaw] = await Promise.all([
        nRes.ok ? nRes.json() : [],
        aRes.ok ? aRes.json() : [],
        tRes.ok ? tRes.json() : [],
        cRes.ok ? cRes.json() : [],
      ]);
      const nodes   = normalizeNodes(nRaw);
      const alts    = normalizeAlerts(aRaw);
      const tsks    = normalizeTasks(tRaw);
      const ctcts   = normalizeContacts(cRaw);
      setAlerts(alts); setTasks(tsks); setContacts(ctcts);
      setRows(nodes.map(n => ({ node: n, ...classify(n, alts, tsks, ctcts) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gorcn-toggle', toggle);
    return () => window.removeEventListener('jarvis:gorcn-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const dark = rows.filter(r => r.cls === 'DARK').length;
    const script = buildGorcnScript({
      total:      rows.length,
      commanding: rows.filter(r => r.cls === 'COMMANDING').length,
      active:     rows.filter(r => r.cls === 'ACTIVE').length,
      staffed:    rows.filter(r => r.cls === 'STAFFED').length,
      dark,
    });
    setAssessing(true); setAssessment('');
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: script }),
      });
      const j = await res.json();
      const txt = j?.response || j?.message || j?.content || JSON.stringify(j);
      setAssessment(txt);
      if (window.__jarvisTTS) window.__jarvisTTS(txt.slice(0, 300));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = {
    total:      rows.length,
    commanding: rows.filter(r => r.cls === 'COMMANDING').length,
    active:     rows.filter(r => r.cls === 'ACTIVE').length,
    staffed:    rows.filter(r => r.cls === 'STAFFED').length,
    dark:       rows.filter(r => r.cls === 'DARK').length,
  };
  const darkPulse = counts.dark > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || nodeLabel(r.node).toLowerCase().includes(search.toLowerCase()))
  );

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const TILE = (label, val, color) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', minWidth: 72, textAlign: 'center' }}>
      <div style={{ color, fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{val}</div>
      <div style={{ color: '#64748B', fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 179960, zIndex: 332,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ GORCN
        {darkPulse && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff', borderRadius: 9,
            padding: '1px 5px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>
            {counts.dark}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 0, right: 0, margin: '0 auto',
          width: 760, maxHeight: '70vh', zIndex: 10332,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ GRAPH OPS ALERT TASK CONTACT COMMAND</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F236 · /v1/graph/centrality + /v1/ops/alerts + /entities/Task + /entities/Contact</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('NODES',      counts.total,      '#94A3B8')}
            {TILE('ALERTS',     alerts.length,     '#F87171')}
            {TILE('TASKS',      tasks.length,      '#FCD34D')}
            {TILE('CONTACTS',   contacts.length,   '#38BDF8')}
            {TILE('COMMANDING', counts.commanding, '#22C55E')}
            {TILE('ACTIVE',     counts.active,     '#38BDF8')}
            {TILE('STAFFED',    counts.staffed,    '#F59E0B')}
            {TILE('DARK',       counts.dark,       '#EF4444')}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(239,68,68,0.2)' : 'transparent',
                  border: `1px solid ${tab === t ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
                  color: tab === t ? '#EF4444' : '#64748B',
                  padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1',
                padding: '2px 8px', fontSize: 10, borderRadius: 4, width: 160,
              }}
            />
          </div>

          {/* Row list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
            {loading && <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>Loading…</div>}
            {error   && <div style={{ color: '#EF4444', fontSize: 11, padding: 12 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No nodes match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.node?.id || row.node?.name || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              const score  = row.node?.score ?? row.node?.centrality ?? row.node?.weight;
              return (
                <div key={id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => toggleRow(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 5,
                      background: isOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isOpen ? 'rgba(239,68,68,0.2)' : 'transparent'}`,
                    }}
                  >
                    <span style={{ color, fontSize: 9, minWidth: 88, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nodeLabel(row.node)}
                    </span>
                    {score != null && (
                      <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.3)', color: '#94A3B8', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {typeof score === 'number' ? score.toFixed(3) : score}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>OPS ALERTS ({row.matchedAlerts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedAlerts.slice(0, 6).map((a, ai) => (
                              <span key={ai} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {a?.title || a?.name || a?.id || '—'}
                                {a?.severity ? ` · ${a.severity}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>TASKS ({row.matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedTasks.slice(0, 6).map((t, ti) => (
                              <span key={ti} style={{ background: 'rgba(252,211,77,0.1)', border: '1px solid rgba(252,211,77,0.3)', color: '#FCD34D', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.name || t?.title || t?.id || '—'}
                                {t?.status ? ` · ${t.status}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({row.matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedContacts.slice(0, 6).map((c, ci) => (
                              <span key={ci} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || c?.full_name || c?.email || '—'}
                                {(c?.role || c?.organisation || c?.org) ? ` · ${c.role || c.organisation || c.org}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedAlerts.length === 0 && row.matchedTasks.length === 0 && row.matchedContacts.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — operational blind spot.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS button + result */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(239,68,68,0.1)' }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444',
                padding: '4px 14px', fontSize: 10, cursor: assessing ? 'not-allowed' : 'pointer',
                borderRadius: 4,
              }}
            >
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS DARK NODES'}
            </button>
            {assessment && (
              <div style={{ marginTop: 6, color: '#CBD5E1', fontSize: 10, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
