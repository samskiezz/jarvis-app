/**
 * IntelProfileRiskTaskKnowledgePriority — F238
 *
 * Fetches /entities/IntelProfile + /entities/RiskSignal +
 *         /entities/Task + /knowledge/
 *
 * Keyword-matches each intel profile (name/category/description)
 * against risk signal titles/descriptions/sources,
 * task names/descriptions/objectives,
 * and knowledge article titles/summaries/categories to classify:
 *
 *   CRITICAL — matches all 3 sources
 *              (profile has active risk, assigned task, and knowledge grounding)
 *   ACTIVE   — matches 2 of 3 sources
 *   TRACKED  — matches exactly 1 source
 *   DARK     — no match to any source
 *              (blind-spot profiles — no risk signal, no task, no knowledge article)
 *
 * Toggle: ◈ IRTKPM button (fixed, bottom strip) left:181080, zIndex:334
 * Stat tiles: profiles / risk signals / tasks / articles /
 *             critical / active / tracked / dark
 * Red pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched risk signals with severity badge +
 *                  matched tasks with status badge +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / CRITICAL / ACTIVE / TRACKED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "irtkpm"/"intel priority"/"intel risk task"/"intel priority matrix"/
 *        "dark intel"/"intel blind"/"blind profile"/"intel grounding"/
 *        "profile dark"/"intel knowledge"/"intel risk knowledge"
 * Event: jarvis:irtkpm-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'CRITICAL', 'ACTIVE', 'TRACKED', 'DARK'];

const CLS_COLOR = {
  CRITICAL: '#EF4444',
  ACTIVE:   '#22C55E',
  TRACKED:  '#38BDF8',
  DARK:     '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeIntelProfiles(raw) {
  if (Array.isArray(raw))                        return raw;
  if (Array.isArray(raw?.intel_profiles))        return raw.intel_profiles;
  if (Array.isArray(raw?.profiles))              return raw.profiles;
  if (Array.isArray(raw?.items))                 return raw.items;
  if (Array.isArray(raw?.results))               return raw.results;
  if (Array.isArray(raw?.data))                  return raw.data;
  return [];
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.risk_signals))    return raw.risk_signals;
  if (Array.isArray(raw?.signals))         return raw.signals;
  if (Array.isArray(raw?.items))           return raw.items;
  if (Array.isArray(raw?.results))         return raw.results;
  if (Array.isArray(raw?.data))            return raw.data;
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

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.articles))         return raw.articles;
  if (Array.isArray(raw?.knowledge))        return raw.knowledge;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.results))          return raw.results;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

function profileLabel(p) {
  return p?.name || p?.full_name || p?.title || p?.id || 'Unknown';
}

function profileText(p) {
  return [p?.name, p?.full_name, p?.title, p?.category, p?.description,
          p?.summary, p?.type, p?.tags, p?.keywords, p?.subject].join(' ');
}

function classify(profile, riskSignals, tasks, articles) {
  const ptoks = tokens(profileText(profile));

  const matchedRisks = riskSignals.filter(r =>
    overlaps(ptoks, [r?.title, r?.name, r?.description, r?.type,
                     r?.category, r?.severity, r?.source, r?.signal].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(ptoks, [t?.name, t?.title, t?.description, t?.type,
                     t?.category, t?.status, t?.objective].join(' '))
  );
  const matchedArticles = articles.filter(a =>
    overlaps(ptoks, [a?.title, a?.name, a?.heading, a?.category,
                     a?.content, a?.summary, a?.tags, a?.keywords].join(' '))
  );

  const hasR = matchedRisks.length > 0;
  const hasT = matchedTasks.length > 0;
  const hasA = matchedArticles.length > 0;
  const srcCnt = [hasR, hasT, hasA].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'CRITICAL';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'TRACKED';
  else                   cls = 'DARK';

  return { cls, matchedRisks, matchedTasks, matchedArticles };
}

export function isIrtkpmQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('irtkpm') ||
    s.includes('intel priority') ||
    s.includes('intel risk task') ||
    s.includes('intel priority matrix') ||
    s.includes('dark intel') ||
    s.includes('intel blind') ||
    s.includes('blind profile') ||
    s.includes('intel grounding') ||
    s.includes('profile dark') ||
    s.includes('intel knowledge') ||
    s.includes('intel risk knowledge')
  );
}

export function buildIrtkpmScript(counts) {
  return `Analyse the JARVIS Intel Profile Risk Task Knowledge Priority Matrix.
Total intel profiles: ${counts.total}. Critical (3-source): ${counts.critical}. Active (2-source): ${counts.active}. Tracked (1-source): ${counts.tracked}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark profiles — intelligence blind spots with no risk signal, no assigned task, and no knowledge article.
Identify the highest-priority dark profiles and propose grounding actions: link to a relevant risk signal, create a task, or connect to a knowledge article.`;
}

export default function IntelProfileRiskTaskKnowledgePriority() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [tasks, setTasks]             = useState([]);
  const [articles, setArticles]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState({});
  const [assessment, setAssessment]   = useState('');
  const [assessing, setAssessing]     = useState(false);
  const timerRef                      = useRef(null);

  const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pRes, rRes, tRes, kRes] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile`, { headers: hdrs }),
        fetch(`${apiBase()}/entities/RiskSignal`,   { headers: hdrs }),
        fetch(`${apiBase()}/entities/Task`,         { headers: hdrs }),
        fetch(`${apiBase()}/knowledge/`,            { headers: hdrs }),
      ]);
      const [pRaw, rRaw, tRaw, kRaw] = await Promise.all([
        pRes.ok ? pRes.json() : [],
        rRes.ok ? rRes.json() : [],
        tRes.ok ? tRes.json() : [],
        kRes.ok ? kRes.json() : [],
      ]);
      const profiles = normalizeIntelProfiles(pRaw);
      const risks    = normalizeRiskSignals(rRaw);
      const tsks     = normalizeTasks(tRaw);
      const arts     = normalizeKnowledge(kRaw);
      setRiskSignals(risks); setTasks(tsks); setArticles(arts);
      setRows(profiles.map(p => ({ profile: p, ...classify(p, risks, tsks, arts) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:irtkpm-toggle', toggle);
    return () => window.removeEventListener('jarvis:irtkpm-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const script = buildIrtkpmScript({
      total:    rows.length,
      critical: rows.filter(r => r.cls === 'CRITICAL').length,
      active:   rows.filter(r => r.cls === 'ACTIVE').length,
      tracked:  rows.filter(r => r.cls === 'TRACKED').length,
      dark:     rows.filter(r => r.cls === 'DARK').length,
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
    total:    rows.length,
    critical: rows.filter(r => r.cls === 'CRITICAL').length,
    active:   rows.filter(r => r.cls === 'ACTIVE').length,
    tracked:  rows.filter(r => r.cls === 'TRACKED').length,
    dark:     rows.filter(r => r.cls === 'DARK').length,
  };
  const darkPulse = counts.dark > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || profileLabel(r.profile).toLowerCase().includes(search.toLowerCase()))
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
          position: 'fixed', bottom: 8, left: 181080, zIndex: 334,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ IRTKPM
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
          width: 760, maxHeight: '70vh', zIndex: 10334,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ INTEL PROFILE RISK TASK KNOWLEDGE PRIORITY</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F238 · /entities/IntelProfile + /entities/RiskSignal + /entities/Task + /knowledge/</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('PROFILES',      counts.total,    '#94A3B8')}
            {TILE('RISK SIGNALS',  riskSignals.length, '#F87171')}
            {TILE('TASKS',         tasks.length,    '#FCD34D')}
            {TILE('ARTICLES',      articles.length, '#A78BFA')}
            {TILE('CRITICAL',      counts.critical, '#EF4444')}
            {TILE('ACTIVE',        counts.active,   '#22C55E')}
            {TILE('TRACKED',       counts.tracked,  '#38BDF8')}
            {TILE('DARK',          counts.dark,     '#F59E0B')}
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
              placeholder="search profiles…"
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
              <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>No profiles match this filter.</div>
            )}
            {visible.map((row, i) => {
              const id     = row.profile?.id || row.profile?.name || i;
              const isOpen = !!expanded[id];
              const color  = CLS_COLOR[row.cls];
              const cat    = row.profile?.category || row.profile?.type || null;
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
                    <span style={{ color, fontSize: 9, minWidth: 72, fontWeight: 700 }}>{row.cls}</span>
                    <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profileLabel(row.profile)}
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
                      {row.matchedRisks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>RISK SIGNALS ({row.matchedRisks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedRisks.slice(0, 6).map((r, ri) => (
                              <span key={ri} style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {r?.title || r?.name || r?.id || '—'}
                                {r?.severity ? ` · ${r.severity}` : ''}
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
                      {row.matchedArticles.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>KNOWLEDGE ARTICLES ({row.matchedArticles.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedArticles.slice(0, 6).map((a, ai) => (
                              <span key={ai} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {a?.title || a?.name || a?.heading || a?.id || '—'}
                                {a?.category ? ` · ${a.category}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedRisks.length === 0 && row.matchedTasks.length === 0 && row.matchedArticles.length === 0 && (
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
              {assessing ? '▶ ASSESSING…' : '▶ ASSESS DARK PROFILES'}
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
