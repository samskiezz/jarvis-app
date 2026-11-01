/**
 * IntelProfileTaskScenarioKnowledgeCoverage — F249
 *
 * Fetches /entities/IntelProfile + /entities/Task +
 *         /v1/scenario/list + /knowledge/
 *
 * Keyword-matches each intel profile (name/title/category/description/tags)
 * against tasks, scenarios, and knowledge articles to classify:
 *
 *   ORCHESTRATED — matches all 3 sources
 *   ACTIVE       — matches 2 of 3 sources
 *   SCRIPTED     — matches exactly 1 source
 *   DORMANT      — no match to any source
 *                  (profiles with no task, no scenario, no knowledge article)
 *
 * Toggle: ◈ ITSKOC button (fixed, bottom strip) left:187240, zIndex:345
 * Stat tiles: profiles / tasks / scenarios / articles /
 *             orchestrated / active / scripted / dormant
 * Red pulse on DORMANT count (intelligence dead-ends).
 * Expandable rows: matched tasks with status badge +
 *                  matched scenarios with status badge +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / ORCHESTRATED / ACTIVE / SCRIPTED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "itskoc"/"intel profile task scenario"/"intel orchestration"/
 *        "dormant profiles"/"profile coverage"/"intel task knowledge"/
 *        "intel scenario coverage"/"profile intelligence coverage"
 * Event: jarvis:itskoc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ORCHESTRATED', 'ACTIVE', 'SCRIPTED', 'DORMANT'];

const CLS_COLOR = {
  ORCHESTRATED: '#22C55E',
  ACTIVE:       '#38BDF8',
  SCRIPTED:     '#F59E0B',
  DORMANT:      '#EF4444',
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
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.tasks))       return raw.tasks;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function profileText(p) {
  return [p?.name, p?.title, p?.category, p?.description, p?.tags?.join?.(' ')].join(' ');
}

function taskText(t) {
  return [t?.name, t?.title, t?.description, t?.category, t?.type].join(' ');
}

function scenarioText(s) {
  return [s?.name, s?.title, s?.description, s?.phase, s?.type].join(' ');
}

function articleText(a) {
  return [a?.name, a?.title, a?.summary, a?.category, a?.tags?.join?.(' ')].join(' ');
}

function classify(profile, tasks, scenarios, articles) {
  const ptoks         = tokens(profileText(profile));
  const matchedTasks  = tasks.filter(t     => overlaps(ptoks, taskText(t)));
  const matchedScens  = scenarios.filter(s => overlaps(ptoks, scenarioText(s)));
  const matchedArts   = articles.filter(a  => overlaps(ptoks, articleText(a)));
  const hasTsk = matchedTasks.length > 0;
  const hasSc  = matchedScens.length > 0;
  const hasArt = matchedArts.length > 0;
  const srcCnt = [hasTsk, hasSc, hasArt].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'ORCHESTRATED';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'SCRIPTED';
  else                   cls = 'DORMANT';
  return { cls, matchedTasks, matchedScens, matchedArts };
}

export function isItskocQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('itskoc') ||
    s.includes('intel profile task scenario') ||
    s.includes('intel orchestration') ||
    s.includes('dormant profiles') ||
    s.includes('profile coverage') ||
    s.includes('intel task knowledge') ||
    s.includes('intel scenario coverage') ||
    s.includes('profile intelligence coverage') ||
    s.includes('intel profile knowledge') ||
    s.includes('orchestrated profiles')
  );
}

export function buildItskocScript(counts) {
  return `Analyse the JARVIS IntelProfile × Task × Scenario × Knowledge Intelligence Orchestration Coverage.
Total profiles: ${counts.total}. Orchestrated (all 3 sources): ${counts.orchestrated}. Active (2 sources): ${counts.active}. Scripted (1 source): ${counts.scripted}. Dormant (no source): ${counts.dormant}.
Focus on the ${counts.dormant} dormant profiles — intelligence assets with no task grounding, no scenario playbook, and no knowledge article coverage.
Identify the highest-priority dormant profiles and propose steps to activate them: assign relevant tasks, link to operational scenarios, or create matching knowledge articles.`;
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

export default function IntelProfileTaskScenarioKnowledgeCoverage() {
  const [open, setOpen]           = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles]   = useState([]);
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
      const [pRaw, tRaw, sRaw, aRaw] = await Promise.all([
        safeFetch(`${API}/entities/IntelProfile`),
        safeFetch(`${API}/entities/Task`),
        safeFetch(`${API}/v1/scenario/list`),
        safeFetch(`${API}/knowledge/`),
      ]);
      const pArr = normalizeProfiles(pRaw);
      const tArr = normalizeTasks(tRaw);
      const sArr = normalizeScenarios(sRaw);
      const aArr = normalizeKnowledge(aRaw);
      setProfiles(pArr);
      setTasks(tArr);
      setScenarios(sArr);
      setArticles(aArr);
      setClass(pArr.map(p => ({ p, ...classify(p, tArr, sArr, aArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:itskoc-toggle', handler);
    return () => window.removeEventListener('jarvis:itskoc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:        classified.length,
    orchestrated: classified.filter(x => x.cls === 'ORCHESTRATED').length,
    active:       classified.filter(x => x.cls === 'ACTIVE').length,
    scripted:     classified.filter(x => x.cls === 'SCRIPTED').length,
    dormant:      classified.filter(x => x.cls === 'DORMANT').length,
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
      const script = buildItskocScript(counts);
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

  const dormantPulse = counts.dormant > 0;

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10345,
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

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 187240, zIndex: 345,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: dormantPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: dormantPulse ? '0 0 6px #EF444488' : 'none',
          animation: dormantPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ ITSKOC</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ INTELPROFILE × TASK × SCENARIO × KNOWLEDGE — INTELLIGENCE ORCHESTRATION COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {profiles.length} profiles · {tasks.length} tasks · {scenarios.length} scenarios · {articles.length} articles
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('PROFILES',     counts.total,        '#94a3b8')}
            {tile('TASKS',        tasks.length,         '#64748b')}
            {tile('SCENARIOS',    scenarios.length,     '#64748b')}
            {tile('ARTICLES',     articles.length,      '#64748b')}
            {tile('ORCHESTRATED', counts.orchestrated,  '#22C55E')}
            {tile('ACTIVE',       counts.active,        '#38BDF8')}
            {tile('SCRIPTED',     counts.scripted,      '#F59E0B')}
            {tile('DORMANT',      counts.dormant,       '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search intel profiles…"
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
              const { p, cls, matchedTasks, matchedScens, matchedArts } = item;
              const id = p?.id ?? p?.name ?? i;
              const isExp = !!expanded[id];
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 100, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {p?.name || p?.title || p?.id || '—'}
                    </span>
                    {p?.category && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {p.category}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      T:{matchedTasks.length} S:{matchedScens.length} K:{matchedArts.length}
                      {isExp ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedTasks.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Tasks: </span>
                          {matchedTasks.slice(0, 4).map((t, ti) => (
                            <span key={ti} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38BDF8',
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
                      {matchedScens.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Scenarios: </span>
                          {matchedScens.slice(0, 4).map((s, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(245,158,11,0.1)',
                              border: '1px solid #f59e0b44', borderRadius: 3,
                              padding: '1px 5px', color: '#F59E0B',
                            }}>
                              {s?.name || s?.title || s?.id}
                              {s?.status && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{s.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedScens.length > 4 && <span style={{ color: '#475569' }}>+{matchedScens.length - 4}</span>}
                        </div>
                      )}
                      {matchedArts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Knowledge: </span>
                          {matchedArts.slice(0, 4).map((a, ai) => (
                            <span key={ai} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.08)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22C55E',
                            }}>
                              {a?.name || a?.title || a?.id}
                              {a?.category && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{a.category}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedArts.length > 4 && <span style={{ color: '#475569' }}>+{matchedArts.length - 4}</span>}
                        </div>
                      )}
                      {matchedTasks.length === 0 && matchedScens.length === 0 && matchedArts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No task, scenario, or knowledge article — dormant intel profile with zero operational grounding.
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
