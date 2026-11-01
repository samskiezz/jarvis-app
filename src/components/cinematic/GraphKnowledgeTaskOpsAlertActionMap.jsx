/**
 * GraphKnowledgeTaskOpsAlertActionMap — F242
 *
 * Fetches /v1/graph/centrality + /knowledge/ +
 *         /entities/Task + /v1/ops/alerts
 *
 * Keyword-matches each graph centrality node (label/type/community)
 * against knowledge articles, active tasks, and ops alerts to classify:
 *
 *   COMMANDED — matches all 3 sources
 *               (node has knowledge grounding, active task, AND ops alert coverage)
 *   GROUNDED  — matches 2 of 3 sources
 *   ACTIVE    — matches exactly 1 source
 *   DARK      — no match to any source
 *               (blind-spot nodes with no knowledge article, no task, no ops alert)
 *
 * Toggle: ◈ GKTAMAP button (fixed, bottom strip) left:183320, zIndex:338
 * Stat tiles: nodes / articles / tasks / alerts /
 *             commanded / grounded / active / dark
 * Red pulse on DARK count (blind-spot nodes).
 * Expandable rows: matched knowledge articles with category badge +
 *                  matched tasks with status badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / COMMANDED / GROUNDED / ACTIVE / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "gktamap"/"graph knowledge task"/"graph action map"/"dark node"/"blind node"/
 *        "graph coverage"/"node coverage"/"graph ops alert"/"graph knowledge ops"/
 *        "node grounding"/"action map"/"graph ops coverage"
 * Event: jarvis:gktamap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'GROUNDED', 'ACTIVE', 'DARK'];

const CLS_COLOR = {
  COMMANDED: '#22C55E',
  GROUNDED:  '#38BDF8',
  ACTIVE:    '#F59E0B',
  DARK:      '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeGraph(raw) {
  if (Array.isArray(raw))                       return raw;
  if (Array.isArray(raw?.nodes))                return raw.nodes;
  if (Array.isArray(raw?.centrality))           return raw.centrality;
  if (Array.isArray(raw?.data))                 return raw.data;
  if (Array.isArray(raw?.results))              return raw.results;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))                       return raw;
  if (Array.isArray(raw?.articles))             return raw.articles;
  if (Array.isArray(raw?.knowledge))            return raw.knowledge;
  if (Array.isArray(raw?.data))                 return raw.data;
  if (Array.isArray(raw?.results))              return raw.results;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))                       return raw;
  if (Array.isArray(raw?.tasks))                return raw.tasks;
  if (Array.isArray(raw?.data))                 return raw.data;
  if (Array.isArray(raw?.results))              return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                       return raw;
  if (Array.isArray(raw?.alerts))               return raw.alerts;
  if (Array.isArray(raw?.data))                 return raw.data;
  if (Array.isArray(raw?.results))              return raw.results;
  return [];
}

function nodeText(n) {
  return [n?.label, n?.name, n?.type, n?.community, n?.description].join(' ');
}

function knowledgeText(k) {
  return [k?.title, k?.name, k?.summary, k?.description, k?.category, k?.tags?.join?.(' ')].join(' ');
}

function taskText(t) {
  return [t?.title, t?.name, t?.description, t?.objective, t?.type, t?.assignee].join(' ');
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.type, a?.source].join(' ');
}

function classify(node, articles, tasks, alerts) {
  const ntoks = tokens(nodeText(node));
  const matchedArticles = articles.filter(a => overlaps(ntoks, knowledgeText(a)));
  const matchedTasks    = tasks.filter(t    => overlaps(ntoks, taskText(t)));
  const matchedAlerts   = alerts.filter(a   => overlaps(ntoks, alertText(a)));
  const hasKn = matchedArticles.length > 0;
  const hasTk = matchedTasks.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const srcCnt = [hasKn, hasTk, hasAl].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'COMMANDED';
  else if (srcCnt === 2) cls = 'GROUNDED';
  else if (srcCnt === 1) cls = 'ACTIVE';
  else                   cls = 'DARK';
  return { cls, matchedArticles, matchedTasks, matchedAlerts };
}

export function isGktamapQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('gktamap') ||
    s.includes('graph knowledge task') ||
    s.includes('graph action map') ||
    s.includes('node grounding') ||
    s.includes('action map') ||
    s.includes('graph ops coverage') ||
    s.includes('graph ops alert') ||
    s.includes('graph knowledge ops') ||
    s.includes('node coverage') ||
    s.includes('graph coverage') ||
    s.includes('dark node') ||
    s.includes('blind node')
  );
}

export function buildGktamapScript(counts) {
  return `Analyse the JARVIS Graph × Knowledge × Task × Ops Alert Intelligence Action Map.
Total graph nodes: ${counts.total}. Commanded (all 3 sources): ${counts.commanded}. Grounded (2 sources): ${counts.grounded}. Active (1 source): ${counts.active}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} DARK nodes — operational blind spots with no knowledge article, no active task, and no ops alert coverage.
Identify the highest-centrality dark nodes and propose remediation: link to a relevant knowledge article, assign an active task, or create an ops alert to begin monitoring.`;
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

export default function GraphKnowledgeTaskOpsAlertActionMap() {
  const [open, setOpen]         = useState(false);
  const [nodes, setNodes]       = useState([]);
  const [articles, setArticles] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [classified, setClass]  = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssess]   = useState('');
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [gRaw, kRaw, tRaw, aRaw] = await Promise.all([
        safeFetch(`${apiBase()}/v1/graph/centrality`),
        safeFetch(`${apiBase()}/knowledge/`),
        safeFetch(`${apiBase()}/entities/Task`),
        safeFetch(`${apiBase()}/v1/ops/alerts`),
      ]);
      const gArr = normalizeGraph(gRaw);
      const kArr = normalizeKnowledge(kRaw);
      const tArr = normalizeTasks(tRaw);
      const aArr = normalizeAlerts(aRaw);
      setNodes(gArr);
      setArticles(kArr);
      setTasks(tArr);
      setAlerts(aArr);
      setClass(gArr.map(n => ({ n, ...classify(n, kArr, tArr, aArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:gktamap-toggle', handler);
    return () => window.removeEventListener('jarvis:gktamap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:     classified.length,
    commanded: classified.filter(c => c.cls === 'COMMANDED').length,
    grounded:  classified.filter(c => c.cls === 'GROUNDED').length,
    active:    classified.filter(c => c.cls === 'ACTIVE').length,
    dark:      classified.filter(c => c.cls === 'DARK').length,
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
      const script = buildGktamapScript(counts);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ message: script }),
      });
      const j = await r.json();
      const text = j?.response || j?.message || j?.result || 'No assessment returned.';
      setAssess(text);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
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
    position: 'fixed', inset: 0, zIndex: 10338,
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
    if (v === 'critical') return '#EF4444';
    if (v === 'high')     return '#F97316';
    if (v === 'medium')   return '#F59E0B';
    return '#64748b';
  };

  const statusColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'open' || v === 'active')  return '#38BDF8';
    if (v === 'closed' || v === 'done')  return '#22C55E';
    if (v === 'pending')                 return '#F59E0B';
    return '#64748b';
  };

  const catColor = () => '#A78BFA';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 183320, zIndex: 338,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ GKTAMAP</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ GRAPH × KNOWLEDGE × TASK × OPS ALERT — INTELLIGENCE ACTION MAP
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {nodes.length} nodes · {articles.length} articles · {tasks.length} tasks · {alerts.length} alerts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('NODES',     counts.total,     '#94a3b8')}
            {tile('ARTICLES',  articles.length,  '#64748b')}
            {tile('TASKS',     tasks.length,     '#64748b')}
            {tile('ALERTS',    alerts.length,    '#64748b')}
            {tile('COMMANDED', counts.commanded, '#22C55E')}
            {tile('GROUNDED',  counts.grounded,  '#38BDF8')}
            {tile('ACTIVE',    counts.active,    '#F59E0B')}
            {tile('DARK',      counts.dark,      '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search nodes…"
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
              const { n, cls, matchedArticles, matchedTasks, matchedAlerts } = item;
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 80, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {n?.label || n?.name || n?.id || '—'}
                    </span>
                    {(n?.type || n?.community) && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(255,255,255,0.04)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {[n.type, n.community !== undefined ? `community:${n.community}` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {n?.centrality !== undefined && (
                      <span style={{
                        fontSize: 10, color: '#64748b',
                        background: 'rgba(255,255,255,0.03)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        ◈{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      K:{matchedArticles.length} T:{matchedTasks.length} A:{matchedAlerts.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedArticles.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Knowledge: </span>
                          {matchedArticles.slice(0, 4).map((a, ai) => (
                            <span key={ai} style={{
                              marginRight: 5, background: 'rgba(167,139,250,0.1)',
                              border: '1px solid #a78bfa44', borderRadius: 3,
                              padding: '1px 5px', color: catColor(),
                            }}>
                              {a?.title || a?.name || a?.id}
                              {a?.category && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{a.category}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedArticles.length > 4 && <span style={{ color: '#475569' }}>+{matchedArticles.length - 4}</span>}
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
                              marginRight: 5, background: 'rgba(239,68,68,0.08)',
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
                      {matchedArticles.length === 0 && matchedTasks.length === 0 && matchedAlerts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No knowledge article, task, or ops alert matched — dark node.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No nodes match the current filter.
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
