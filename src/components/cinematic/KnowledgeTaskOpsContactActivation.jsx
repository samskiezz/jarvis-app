/**
 * KnowledgeTaskOpsContactActivation — F237
 *
 * Fetches /knowledge/ + /entities/Task +
 *         /v1/ops/alerts + /entities/Contact
 *
 * Keyword-matches each knowledge article (title/category/content)
 * against task names/descriptions, ops alert titles/descriptions,
 * and contact names/roles/orgs to classify:
 *
 *   ACTIVATED — matches all 3 sources
 *               (article is tasked, alerted, and staffed)
 *   ACTIONED  — matches 2 of 3 sources
 *   ALERTED   — matches exactly 1 source
 *   DORMANT   — no match to any source
 *               (blind-spot article — no task, no alert, no contact owner)
 *
 * Toggle: ◈ KTOCAC button (fixed, bottom strip) left:180520, zIndex:333
 * Stat tiles: articles / tasks / alerts / contacts /
 *             activated / actioned / alerted / dormant
 * Red pulse on DORMANT count (intelligence dead-ends).
 * Expandable rows: matched tasks with status badge +
 *                  matched ops alerts with severity badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / ACTIVATED / ACTIONED / ALERTED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ktocac"/"knowledge activation"/"knowledge task ops"/
 *        "dormant knowledge"/"dormant article"/"knowledge coverage"/
 *        "knowledge contact"/"knowledge alert"/"intel activation"/
 *        "knowledge ops"/"dead knowledge"/"knowledge grounding"
 * Event: jarvis:ktocac-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'ACTIONED', 'ALERTED', 'DORMANT'];

const CLS_COLOR = {
  ACTIVATED: '#22C55E',
  ACTIONED:  '#38BDF8',
  ALERTED:   '#F59E0B',
  DORMANT:   '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.articles))         return raw.articles;
  if (Array.isArray(raw?.knowledge))        return raw.knowledge;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.results))          return raw.results;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.tasks))    return raw.tasks;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
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

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function articleLabel(a) {
  return a?.title || a?.name || a?.heading || a?.id || 'Unknown';
}

function articleText(a) {
  return [a?.title, a?.name, a?.heading, a?.category, a?.content,
          a?.summary, a?.tags, a?.keywords].join(' ');
}

function classify(article, tasks, alerts, contacts) {
  const atoks = tokens(articleText(article));

  const matchedTasks = tasks.filter(t =>
    overlaps(atoks, [t?.name, t?.title, t?.description, t?.type,
                     t?.category, t?.status, t?.objective].join(' '))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(atoks, [a?.title, a?.name, a?.description, a?.type,
                     a?.category, a?.severity, a?.source].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(atoks, [c?.name, c?.full_name, c?.role, c?.organisation,
                     c?.org, c?.email, (c?.tags || []).join(' ')].join(' '))
  );

  const hasT = matchedTasks.length > 0;
  const hasA = matchedAlerts.length > 0;
  const hasC = matchedContacts.length > 0;
  const srcCnt = [hasT, hasA, hasC].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'ACTIVATED';
  else if (srcCnt === 2) cls = 'ACTIONED';
  else if (srcCnt === 1) cls = 'ALERTED';
  else                   cls = 'DORMANT';

  return { cls, matchedTasks, matchedAlerts, matchedContacts };
}

export function isKtocacQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('ktocac') ||
    s.includes('knowledge activation') ||
    s.includes('knowledge task ops') ||
    s.includes('dormant knowledge') ||
    s.includes('dormant article') ||
    s.includes('knowledge coverage') ||
    s.includes('knowledge contact') ||
    s.includes('knowledge alert') ||
    s.includes('intel activation') ||
    s.includes('knowledge ops') ||
    s.includes('dead knowledge') ||
    s.includes('knowledge grounding')
  );
}

export function buildKtocacScript(counts) {
  return `Analyse the JARVIS Knowledge Task Ops Alert Contact Intelligence Activation Coverage.
Total knowledge articles: ${counts.total}. Activated: ${counts.activated}. Actioned: ${counts.actioned}. Alerted: ${counts.alerted}. Dormant: ${counts.dormant}.
Focus on the ${counts.dormant} dormant articles — knowledge with no task, no ops alert, and no contact owner.
Identify the highest-priority dormant articles and propose grounding actions: assign a responsible contact, create a task to action the knowledge, or link to a relevant ops alert.`;
}

export default function KnowledgeTaskOpsContactActivation() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [alerts, setAlerts]       = useState([]);
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
      const [kRes, tRes, aRes, cRes] = await Promise.all([
        fetch(`${API}/knowledge/`,       { headers: hdrs }),
        fetch(`${API}/entities/Task`,    { headers: hdrs }),
        fetch(`${API}/v1/ops/alerts`,    { headers: hdrs }),
        fetch(`${API}/entities/Contact`, { headers: hdrs }),
      ]);
      const [kRaw, tRaw, aRaw, cRaw] = await Promise.all([
        kRes.ok ? kRes.json() : [],
        tRes.ok ? tRes.json() : [],
        aRes.ok ? aRes.json() : [],
        cRes.ok ? cRes.json() : [],
      ]);
      const articles = normalizeKnowledge(kRaw);
      const tsks     = normalizeTasks(tRaw);
      const alts     = normalizeAlerts(aRaw);
      const ctcts    = normalizeContacts(cRaw);
      setTasks(tsks); setAlerts(alts); setContacts(ctcts);
      setRows(articles.map(a => ({ article: a, ...classify(a, tsks, alts, ctcts) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ktocac-toggle', toggle);
    return () => window.removeEventListener('jarvis:ktocac-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const script = buildKtocacScript({
      total:     rows.length,
      activated: rows.filter(r => r.cls === 'ACTIVATED').length,
      actioned:  rows.filter(r => r.cls === 'ACTIONED').length,
      alerted:   rows.filter(r => r.cls === 'ALERTED').length,
      dormant:   rows.filter(r => r.cls === 'DORMANT').length,
    });
    setAssessing(true); setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
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
    total:     rows.length,
    activated: rows.filter(r => r.cls === 'ACTIVATED').length,
    actioned:  rows.filter(r => r.cls === 'ACTIONED').length,
    alerted:   rows.filter(r => r.cls === 'ALERTED').length,
    dormant:   rows.filter(r => r.cls === 'DORMANT').length,
  };
  const dormantPulse = counts.dormant > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || articleLabel(r.article).toLowerCase().includes(search.toLowerCase()))
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
          position: 'fixed', bottom: 8, left: 180520, zIndex: 333,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ KTOCAC
        {dormantPulse && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff', borderRadius: 9,
            padding: '1px 5px', fontSize: 9, fontWeight: 700,
            animation: 'pulse 1.5s infinite',
          }}>
            {counts.dormant}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 0, right: 0, margin: '0 auto',
          width: 760, maxHeight: '70vh', zIndex: 10333,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ KNOWLEDGE TASK OPS CONTACT ACTIVATION</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F237 · /knowledge/ + /entities/Task + /v1/ops/alerts + /entities/Contact</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('ARTICLES',  counts.total,      '#94A3B8')}
            {TILE('TASKS',     tasks.length,      '#FCD34D')}
            {TILE('ALERTS',    alerts.length,     '#F87171')}
            {TILE('CONTACTS',  contacts.length,   '#38BDF8')}
            {TILE('ACTIVATED', counts.activated,  '#22C55E')}
            {TILE('ACTIONED',  counts.actioned,   '#38BDF8')}
            {TILE('ALERTED',   counts.alerted,    '#F59E0B')}
            {TILE('DORMANT',   counts.dormant,    '#EF4444')}
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
              placeholder="search articles…"
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
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No articles match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.article?.id || row.article?.title || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              const cat    = row.article?.category || row.article?.type || null;
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
                    <span style={{ color, fontSize: 9, minWidth: 80, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {articleLabel(row.article)}
                    </span>
                    {cat && (
                      <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.3)', color: '#94A3B8', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {cat}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      {row.matchedTasks.length === 0 && row.matchedAlerts.length === 0 && row.matchedContacts.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — intelligence dead-end.</div>
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
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS DORMANT ARTICLES'}
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
