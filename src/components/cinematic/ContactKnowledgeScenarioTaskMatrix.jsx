/**
 * ContactKnowledgeScenarioTaskMatrix — F241
 *
 * Fetches /entities/Contact + /knowledge/ +
 *         /v1/scenario/list + /entities/Task
 *
 * Keyword-matches each contact (name/role/org/description)
 * against knowledge articles, scenarios, and tasks to classify:
 *
 *   ACTIVATED — matches all 3 sources
 *               (contact has knowledge grounding, scenario link, AND active task)
 *   SCENED    — matches 2 of 3 sources
 *   TASKED    — matches exactly 1 source
 *   DORMANT   — no match to any source
 *               (inactive contacts — no knowledge article,
 *                no scenario, no active task)
 *
 * Toggle: ◈ CKSTMX button (fixed, bottom strip) left:182760, zIndex:337
 * Stat tiles: contacts / articles / scenarios / tasks /
 *             activated / scened / tasked / dormant
 * Amber pulse on DORMANT count (inactive contacts).
 * Expandable rows: matched knowledge articles with category badge +
 *                  matched scenarios with status badge +
 *                  matched tasks with status badge.
 * Filter tabs: ALL / ACTIVATED / SCENED / TASKED / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ckstmx"/"contact knowledge"/"contact scenario task"/
 *        "dormant contact"/"inactive contact"/"contact activation"/
 *        "contact intelligence"/"contact task scenario"
 * Event: jarvis:ckstmx-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'SCENED', 'TASKED', 'DORMANT'];

const CLS_COLOR = {
  ACTIVATED: '#22C55E',
  SCENED:    '#38BDF8',
  TASKED:    '#F59E0B',
  DORMANT:   '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.contacts))          return raw.contacts;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.articles))          return raw.articles;
  if (Array.isArray(raw?.knowledge))         return raw.knowledge;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.scenarios))         return raw.scenarios;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.tasks))             return raw.tasks;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function contactText(c) {
  return [c?.name, c?.full_name, c?.role, c?.org, c?.organisation, c?.description, c?.email].join(' ');
}

function knowledgeText(k) {
  return [k?.title, k?.name, k?.summary, k?.description, k?.category, k?.tags?.join?.(' ')].join(' ');
}

function scenarioText(s) {
  return [s?.title, s?.name, s?.description, s?.objective, s?.type].join(' ');
}

function taskText(t) {
  return [t?.title, t?.name, t?.description, t?.objective, t?.type, t?.assignee].join(' ');
}

function classify(contact, articles, scenarios, tasks) {
  const ctoks = tokens(contactText(contact));
  const matchedArticles   = articles.filter(a  => overlaps(ctoks, knowledgeText(a)));
  const matchedScenarios  = scenarios.filter(s => overlaps(ctoks, scenarioText(s)));
  const matchedTasks      = tasks.filter(t     => overlaps(ctoks, taskText(t)));
  const hasKn = matchedArticles.length > 0;
  const hasSc = matchedScenarios.length > 0;
  const hasTk = matchedTasks.length > 0;
  const srcCnt = [hasKn, hasSc, hasTk].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'ACTIVATED';
  else if (srcCnt === 2) cls = 'SCENED';
  else if (srcCnt === 1) cls = 'TASKED';
  else                   cls = 'DORMANT';
  return { cls, matchedArticles, matchedScenarios, matchedTasks };
}

export function isCkstmxQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('ckstmx') ||
    s.includes('contact knowledge') ||
    s.includes('contact scenario task') ||
    s.includes('dormant contact') ||
    s.includes('inactive contact') ||
    s.includes('contact activation') ||
    s.includes('contact intelligence') ||
    s.includes('contact task scenario') ||
    s.includes('contact coverage') ||
    s.includes('contact scenario knowledge') ||
    s.includes('contact task knowledge')
  );
}

export function buildCkstmxScript(counts) {
  return `Analyse the JARVIS Contact × Knowledge × Scenario × Task Intelligence Activation Coverage.
Total contacts: ${counts.total}. Activated (all 3 sources): ${counts.activated}. Scened (2 sources): ${counts.scened}. Tasked (1 source): ${counts.tasked}. Dormant (no source): ${counts.dormant}.
Focus on the ${counts.dormant} dormant contacts — inactive actors with no knowledge grounding, no scenario link, and no active task.
Identify the highest-priority dormant contacts and propose activation steps: link to a relevant knowledge article, assign to a runnable scenario, or create an activating task.`;
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

export default function ContactKnowledgeScenarioTaskMatrix() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [articles, setArticles]   = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [tasks, setTasks]         = useState([]);
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
      const [cRaw, kRaw, scRaw, tRaw] = await Promise.all([
        safeFetch(`${API}/entities/Contact`),
        safeFetch(`${API}/knowledge/`),
        safeFetch(`${API}/v1/scenario/list`),
        safeFetch(`${API}/entities/Task`),
      ]);
      const cArr  = normalizeContacts(cRaw);
      const kArr  = normalizeKnowledge(kRaw);
      const scArr = normalizeScenarios(scRaw);
      const tArr  = normalizeTasks(tRaw);
      setContacts(cArr);
      setArticles(kArr);
      setScenarios(scArr);
      setTasks(tArr);
      setClass(cArr.map(c => ({ c, ...classify(c, kArr, scArr, tArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:ckstmx-toggle', handler);
    return () => window.removeEventListener('jarvis:ckstmx-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:     classified.length,
    activated: classified.filter(c => c.cls === 'ACTIVATED').length,
    scened:    classified.filter(c => c.cls === 'SCENED').length,
    tasked:    classified.filter(c => c.cls === 'TASKED').length,
    dormant:   classified.filter(c => c.cls === 'DORMANT').length,
  };

  const visible = classified.filter(item => {
    if (tab !== 'ALL' && item.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return contactText(item.c).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildCkstmxScript(counts);
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
    position: 'fixed', inset: 0, zIndex: 10337,
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

  const catColor = () => '#A78BFA';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 182760, zIndex: 337,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: dormantPulse ? '#F59E0B' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: dormantPulse ? '0 0 6px #F59E0B88' : 'none',
          animation: dormantPulse ? 'pulse-amber 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ CKSTMX</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ CONTACT × KNOWLEDGE × SCENARIO × TASK — INTELLIGENCE ACTIVATION COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {contacts.length} contacts · {articles.length} articles · {scenarios.length} scenarios · {tasks.length} tasks
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('CONTACTS',  counts.total,     '#94a3b8')}
            {tile('ARTICLES',  articles.length,  '#64748b')}
            {tile('SCENARIOS', scenarios.length, '#64748b')}
            {tile('TASKS',     tasks.length,     '#64748b')}
            {tile('ACTIVATED', counts.activated, '#22C55E')}
            {tile('SCENED',    counts.scened,    '#38BDF8')}
            {tile('TASKED',    counts.tasked,    '#F59E0B')}
            {tile('DORMANT',   counts.dormant,   '#F59E0B')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
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
              const { c, cls, matchedArticles, matchedScenarios, matchedTasks } = item;
              const id = c?.id ?? c?.name ?? i;
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 74, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {c?.name || c?.full_name || c?.id || '—'}
                    </span>
                    {(c?.role || c?.org || c?.organisation) && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(255,255,255,0.04)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      K:{matchedArticles.length} Sc:{matchedScenarios.length} T:{matchedTasks.length}
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
                      {matchedScenarios.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Scenarios: </span>
                          {matchedScenarios.slice(0, 4).map((s, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38bdf8',
                            }}>
                              {s?.title || s?.name || s?.id}
                              {s?.status && (
                                <span style={{ color: statusColor(s.status), marginLeft: 3, textTransform: 'uppercase', fontSize: 9 }}>
                                  [{s.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedScenarios.length > 4 && <span style={{ color: '#475569' }}>+{matchedScenarios.length - 4}</span>}
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
                      {matchedArticles.length === 0 && matchedScenarios.length === 0 && matchedTasks.length === 0 && (
                        <div style={{ color: '#F59E0B', fontStyle: 'italic' }}>
                          No knowledge article, scenario, or task matched — dormant contact.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No contacts match the current filter.
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
