/**
 * KnowledgeContactTaskRiskActivation — F224
 *
 * Fetches /knowledge/ + /entities/Contact + /entities/Task + /entities/RiskSignal
 *
 * Keyword-matches each knowledge article (title/category/tags/summary) against
 * contact names/roles/orgs, task titles/descriptions, and risk signal names/types
 * to classify:
 *
 *   ACTIVATED — matches all 3 sources (contact + task + risk signal)
 *               (knowledge fully operationalised — owned, tasked, and threat-referenced)
 *   ACTIONED  — matches 2 of 3 sources
 *               (knowledge partially operationalised)
 *   REFERENCED — matches exactly 1 source
 *               (knowledge minimally linked — only in contacts, tasks, or risk signals)
 *   DORMANT   — no match to any source
 *               (dormant knowledge — no contact owner, no active task, no threat signal)
 *
 * Toggle: ◈ KCTRAS button (fixed, bottom strip) left:173240, zIndex:320
 * Stat tiles: articles / contacts / tasks / risk signals /
 *             activated / actioned / referenced / dormant
 * Amber pulse on DORMANT count (unoperationalised intelligence).
 * Expandable rows: matched contacts with role/org badge +
 *                  matched tasks with status badge +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / ACTIVATED / ACTIONED / REFERENCED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "kctras"/"knowledge activation"/"dormant knowledge"/"knowledge contact"/
 *        "knowledge task"/"knowledge risk"/"knowledge map"/"intelligence activation map"/
 *        "dormant intel"/"knowledge operationalisation"/"knowledge coverage"
 * Event: jarvis:kctras-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'ACTIONED', 'REFERENCED', 'DORMANT'];

const CLS_COLOR = {
  ACTIVATED:  '#22C55E',
  ACTIONED:   '#38BDF8',
  REFERENCED: '#F59E0B',
  DORMANT:    '#F59E0B',
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
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.contacts))    return raw.contacts;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.tasks))       return raw.tasks;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeRisk(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.signals))     return raw.signals;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function articleLabel(a) {
  return a?.title || a?.name || a?.id || 'Unknown';
}

function articleText(a) {
  return [a?.title, a?.name, a?.category, a?.summary, a?.description, (a?.tags || []).join(' ')].join(' ');
}

function classify(article, contacts, tasks, riskSignals) {
  const atoks = tokens(articleText(article));

  const matchedContacts = contacts.filter(c =>
    overlaps(atoks, [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.email, (c?.tags || []).join(' ')].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(atoks, [t?.title, t?.name, t?.description, t?.type, t?.status, t?.category].join(' '))
  );
  const matchedRisk = riskSignals.filter(r =>
    overlaps(atoks, [r?.name, r?.title, r?.type, r?.description, r?.category, r?.signal_type].join(' '))
  );

  const hasC = matchedContacts.length > 0;
  const hasT = matchedTasks.length > 0;
  const hasR = matchedRisk.length > 0;
  const srcCnt = [hasC, hasT, hasR].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'ACTIVATED';
  else if (srcCnt === 2) cls = 'ACTIONED';
  else if (srcCnt === 1) cls = 'REFERENCED';
  else                   cls = 'DORMANT';

  return { cls, matchedContacts, matchedTasks, matchedRisk };
}

export function isKctrasQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('kctras') ||
    s.includes('knowledge activation') ||
    s.includes('dormant knowledge') ||
    s.includes('dormant intel') ||
    s.includes('knowledge operationalisation') ||
    s.includes('knowledge coverage') ||
    s.includes('knowledge contact') ||
    s.includes('knowledge task') ||
    s.includes('knowledge risk') ||
    s.includes('knowledge map') ||
    s.includes('intelligence activation map')
  );
}

export function buildKctrasScript(counts) {
  return `Analyse the JARVIS Knowledge Activation Map.
Total knowledge articles: ${counts.total}. Activated: ${counts.activated}. Actioned: ${counts.actioned}. Referenced: ${counts.referenced}. Dormant: ${counts.dormant}.
Focus on the ${counts.dormant} dormant articles — knowledge with no contact owner, no active task, and no risk signal reference.
Identify the highest-priority dormant articles and propose concrete activation steps: assign a contact owner, create a task, or link to an existing risk signal.`;
}

export default function KnowledgeContactTaskRiskActivation() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [riskSignals, setRisk]    = useState([]);
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
      const [kRes, cRes, tRes, rRes] = await Promise.all([
        fetch(`${API}/knowledge/`,           { headers: hdrs }),
        fetch(`${API}/entities/Contact`,     { headers: hdrs }),
        fetch(`${API}/entities/Task`,        { headers: hdrs }),
        fetch(`${API}/entities/RiskSignal`,  { headers: hdrs }),
      ]);
      const [kRaw, cRaw, tRaw, rRaw] = await Promise.all([
        kRes.ok ? kRes.json() : [],
        cRes.ok ? cRes.json() : [],
        tRes.ok ? tRes.json() : [],
        rRes.ok ? rRes.json() : [],
      ]);
      const articles = normalizeKnowledge(kRaw);
      const ctcts    = normalizeContacts(cRaw);
      const tsks     = normalizeTasks(tRaw);
      const risks    = normalizeRisk(rRaw);
      setContacts(ctcts); setTasks(tsks); setRisk(risks);
      setRows(articles.map(a => ({ article: a, ...classify(a, ctcts, tsks, risks) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:kctras-toggle', toggle);
    return () => window.removeEventListener('jarvis:kctras-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const dormant = rows.filter(r => r.cls === 'DORMANT').length;
    const script  = buildKctrasScript({
      total: rows.length, activated: rows.filter(r => r.cls === 'ACTIVATED').length,
      actioned: rows.filter(r => r.cls === 'ACTIONED').length,
      referenced: rows.filter(r => r.cls === 'REFERENCED').length,
      dormant,
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
    total:      rows.length,
    activated:  rows.filter(r => r.cls === 'ACTIVATED').length,
    actioned:   rows.filter(r => r.cls === 'ACTIONED').length,
    referenced: rows.filter(r => r.cls === 'REFERENCED').length,
    dormant:    rows.filter(r => r.cls === 'DORMANT').length,
  };
  const dormantPulse = counts.dormant > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || articleLabel(r.article).toLowerCase().includes(search.toLowerCase()))
  );

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const TILE = (label, val, color) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', minWidth: 70, textAlign: 'center' }}>
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
          position: 'fixed', bottom: 8, left: 173240, zIndex: 320,
          background: open ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${open ? '#F59E0B' : 'rgba(245,158,11,0.3)'}`,
          color: '#F59E0B', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ KCTRAS
        {dormantPulse && (
          <span style={{
            marginLeft: 5, background: '#F59E0B', color: '#000', borderRadius: 9,
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
          width: 720, maxHeight: '70vh', zIndex: 10320,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(245,158,11,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#F59E0B', fontSize: 13, fontWeight: 700 }}>◈ KNOWLEDGE ACTIVATION MAP</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F224 · /knowledge/ + /entities/Contact,Task,RiskSignal</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
            {TILE('ARTICLES',   counts.total,      '#94A3B8')}
            {TILE('CONTACTS',   contacts.length,   '#38BDF8')}
            {TILE('TASKS',      tasks.length,      '#818CF8')}
            {TILE('RISKS',      riskSignals.length,'#F87171')}
            {TILE('ACTIVATED',  counts.activated,  '#22C55E')}
            {TILE('ACTIONED',   counts.actioned,   '#38BDF8')}
            {TILE('REFERENCED', counts.referenced, '#F59E0B')}
            {TILE('DORMANT',    counts.dormant,    '#F59E0B')}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: '1px solid rgba(245,158,11,0.1)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'transparent',
                  border: `1px solid ${tab === t ? '#F59E0B' : 'rgba(255,255,255,0.1)'}`,
                  color: tab === t ? '#F59E0B' : '#64748B',
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
              const id      = row.article?.id || row.article?.title || i;
              const isOpen  = !!expanded[id];
              const color   = CLS_COLOR[row.cls];
              return (
                <div key={id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => toggleRow(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 5,
                      background: isOpen ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isOpen ? 'rgba(245,158,11,0.2)' : 'transparent'}`,
                    }}
                  >
                    <span style={{ color, fontSize: 9, minWidth: 72, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {articleLabel(row.article)}
                    </span>
                    {row.article?.category && (
                      <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)', color: '#94A3B8', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {row.article.category}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      {row.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>TASKS ({row.matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedTasks.slice(0, 6).map((t, ti) => (
                              <span key={ti} style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: '#818CF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.title || t?.name || t?.id || '—'}
                                {t?.status ? ` · ${t.status}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedRisk.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>RISK SIGNALS ({row.matchedRisk.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedRisk.slice(0, 6).map((r, ri) => (
                              <span key={ri} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {r?.name || r?.title || r?.id || '—'}
                                {r?.severity ? ` · ${r.severity}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedContacts.length === 0 && row.matchedTasks.length === 0 && row.matchedRisk.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No coverage — fully dormant knowledge with zero operationalisation footprint.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.2)',
                border: '1px solid #F59E0B', color: '#F59E0B',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS DORMANT KNOWLEDGE'}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
