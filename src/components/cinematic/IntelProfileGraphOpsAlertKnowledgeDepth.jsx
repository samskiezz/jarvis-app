/**
 * IntelProfileGraphOpsAlertKnowledgeDepth — F227
 *
 * Fetches /entities/IntelProfile + /v1/graph/centrality +
 *         /v1/ops/alerts + /knowledge/
 *
 * Keyword-matches each intel profile (name/category/description/tags)
 * against graph centrality nodes, ops alerts, and knowledge articles
 * to classify:
 *
 *   SATURATED — matches all 3 sources (graph + alert + knowledge)
 *               (profile is fully grounded — modelled, monitored, documented)
 *   TRACED    — matches 2 of 3 sources
 *               (profile is partially grounded)
 *   ALERTED   — matches exactly 1 source
 *               (profile has minimal operational footprint)
 *   DARK      — no match to any source
 *               (intelligence dead-end — no graph node, no alert, no knowledge article)
 *
 * Toggle: ◈ IGOADEP button (fixed, bottom strip) left:174920, zIndex:323
 * Stat tiles: profiles / graph nodes / alerts / knowledge /
 *             saturated / traced / alerted / dark
 * Red pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched ops alerts with severity badge +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / SATURATED / TRACED / ALERTED / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "igoadep"/"intel depth"/"intel profile depth"/"profile graph alert"/
 *        "dark intel profile"/"intel knowledge"/"profile knowledge"/
 *        "intel alert depth"/"profile ops alert"/"intel graph depth"/
 *        "intelligence depth"/"intel saturation"/"dark profiles"
 * Event: jarvis:igoadep-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SATURATED', 'TRACED', 'ALERTED', 'DARK'];

const CLS_COLOR = {
  SATURATED: '#22C55E',
  TRACED:    '#38BDF8',
  ALERTED:   '#F59E0B',
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

function normalizeProfiles(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.intel_profiles))  return raw.intel_profiles;
  if (Array.isArray(raw?.profiles))        return raw.profiles;
  if (Array.isArray(raw?.items))           return raw.items;
  if (Array.isArray(raw?.results))         return raw.results;
  if (Array.isArray(raw?.data))            return raw.data;
  return [];
}

function normalizeGraph(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.nodes))    return raw.nodes;
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

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.knowledge))   return raw.knowledge;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function profileLabel(p) {
  return p?.name || p?.title || p?.profile_name || p?.id || 'Unknown';
}

function profileText(p) {
  return [p?.name, p?.title, p?.profile_name, p?.description, p?.category, p?.type, (p?.tags || []).join(' ')].join(' ');
}

function classify(profile, graphNodes, alerts, knowledge) {
  const ptoks = tokens(profileText(profile));

  const matchedGraph = graphNodes.filter(n =>
    overlaps(ptoks, [n?.label, n?.name, n?.id, n?.type, n?.category, n?.description].join(' '))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(ptoks, [a?.title, a?.name, a?.description, a?.type, a?.alert_type, a?.severity, a?.category].join(' '))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(ptoks, [k?.title, k?.name, k?.content, k?.summary, k?.category, k?.tags, k?.description].join(' '))
  );

  const hasG = matchedGraph.length > 0;
  const hasA = matchedAlerts.length > 0;
  const hasK = matchedKnowledge.length > 0;
  const srcCnt = [hasG, hasA, hasK].filter(Boolean).length;

  let cls;
  if (srcCnt === 3)      cls = 'SATURATED';
  else if (srcCnt === 2) cls = 'TRACED';
  else if (srcCnt === 1) cls = 'ALERTED';
  else                   cls = 'DARK';

  return { cls, matchedGraph, matchedAlerts, matchedKnowledge };
}

export function isIgoadepQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('igoadep') ||
    s.includes('intel depth') ||
    s.includes('intel profile depth') ||
    s.includes('profile graph alert') ||
    s.includes('dark intel profile') ||
    s.includes('intel knowledge') ||
    s.includes('profile knowledge') ||
    s.includes('intel alert depth') ||
    s.includes('profile ops alert') ||
    s.includes('intel graph depth') ||
    s.includes('intelligence depth') ||
    s.includes('intel saturation') ||
    s.includes('dark profiles')
  );
}

export function buildIgoadepScript(counts) {
  return `Analyse the JARVIS IntelProfile Graph/Ops/Knowledge Intelligence Depth Map.
Total profiles: ${counts.total}. Saturated: ${counts.saturated}. Traced: ${counts.traced}. Alerted: ${counts.alerted}. Dark: ${counts.dark}.
Focus on the ${counts.dark} DARK profiles — intel profiles with no graph trace, no ops alert coverage, and no knowledge article grounding.
These are intelligence dead-ends. Identify the highest-priority dark profiles and propose concrete grounding actions: add a graph node, create an ops alert for monitoring, or produce a knowledge article.`;
}

export default function IntelProfileGraphOpsAlertKnowledgeDepth() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [graphNodes, setGraphNodes] = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [knowledge, setKnowledge] = useState([]);
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
      const [pRes, gRes, aRes, kRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`,    { headers: hdrs }),
        fetch(`${API}/v1/graph/centrality`,      { headers: hdrs }),
        fetch(`${API}/v1/ops/alerts`,            { headers: hdrs }),
        fetch(`${API}/knowledge/`,               { headers: hdrs }),
      ]);
      const [pRaw, gRaw, aRaw, kRaw] = await Promise.all([
        pRes.ok ? pRes.json() : [],
        gRes.ok ? gRes.json() : [],
        aRes.ok ? aRes.json() : [],
        kRes.ok ? kRes.json() : [],
      ]);
      const profiles = normalizeProfiles(pRaw);
      const nodes    = normalizeGraph(gRaw);
      const alrts    = normalizeAlerts(aRaw);
      const kn       = normalizeKnowledge(kRaw);
      setGraphNodes(nodes); setAlerts(alrts); setKnowledge(kn);
      setRows(profiles.map(p => ({ profile: p, ...classify(p, nodes, alrts, kn) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:igoadep-toggle', toggle);
    return () => window.removeEventListener('jarvis:igoadep-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const dark = rows.filter(r => r.cls === 'DARK').length;
    const script = buildIgoadepScript({
      total:     rows.length,
      saturated: rows.filter(r => r.cls === 'SATURATED').length,
      traced:    rows.filter(r => r.cls === 'TRACED').length,
      alerted:   rows.filter(r => r.cls === 'ALERTED').length,
      dark,
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
    saturated: rows.filter(r => r.cls === 'SATURATED').length,
    traced:    rows.filter(r => r.cls === 'TRACED').length,
    alerted:   rows.filter(r => r.cls === 'ALERTED').length,
    dark:      rows.filter(r => r.cls === 'DARK').length,
  };
  const darkPulse = counts.dark > 0;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || profileLabel(r.profile).toLowerCase().includes(search.toLowerCase()))
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
          position: 'fixed', bottom: 8, left: 174920, zIndex: 323,
          background: open ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${open ? '#EF4444' : 'rgba(239,68,68,0.3)'}`,
          color: '#EF4444', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ IGOADEP
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
          width: 740, maxHeight: '70vh', zIndex: 10323,
          background: 'rgba(10,14,22,0.97)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 40px rgba(239,68,68,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 700 }}>◈ INTEL PROFILE THREAT DEPTH MAP</span>
              <span style={{ color: '#64748B', fontSize: 10, marginLeft: 8 }}>F227 · /entities/IntelProfile + /v1/graph/centrality + /v1/ops/alerts + /knowledge/</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: '8px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {TILE('PROFILES',   counts.total,     '#94A3B8')}
            {TILE('GRAPH NODES', graphNodes.length, '#818CF8')}
            {TILE('ALERTS',     alerts.length,    '#F472B6')}
            {TILE('KNOWLEDGE',  knowledge.length, '#34D399')}
            {TILE('SATURATED',  counts.saturated, '#22C55E')}
            {TILE('TRACED',     counts.traced,    '#38BDF8')}
            {TILE('ALERTED',    counts.alerted,   '#F59E0B')}
            {TILE('DARK',       counts.dark,      '#EF4444')}
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
                    {row.profile?.category && (
                      <span style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.3)', color: '#94A3B8', padding: '1px 6px', fontSize: 9, borderRadius: 3 }}>
                        {row.profile.category}
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 5, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {row.matchedGraph.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>GRAPH NODES ({row.matchedGraph.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedGraph.slice(0, 6).map((n, ni) => {
                              const score = n?.centrality ?? n?.score ?? n?.weight;
                              return (
                                <span key={ni} style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: '#818CF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                  {n?.label || n?.name || n?.id || '—'}
                                  {score != null ? ` · ${typeof score === 'number' ? score.toFixed(3) : score}` : ''}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {row.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>OPS ALERTS ({row.matchedAlerts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedAlerts.slice(0, 6).map((a, ai) => (
                              <span key={ai} style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.3)', color: '#F472B6', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {a?.title || a?.name || a?.id || '—'}
                                {(a?.severity || a?.level) ? ` · ${a.severity || a.level}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedKnowledge.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>KNOWLEDGE ARTICLES ({row.matchedKnowledge.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {row.matchedKnowledge.slice(0, 6).map((k, ki) => (
                              <span key={ki} style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {k?.title || k?.name || k?.id || '—'}
                                {k?.category ? ` · ${k.category}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.matchedGraph.length === 0 && row.matchedAlerts.length === 0 && row.matchedKnowledge.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No matched sources — intelligence dead-end profile.</div>
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
