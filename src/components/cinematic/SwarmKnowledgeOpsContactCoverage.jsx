/**
 * SwarmKnowledgeOpsContactCoverage — F245
 *
 * Fetches /entities/SwarmJob + /knowledge/ +
 *         /v1/ops/alerts + /entities/Contact
 *
 * Keyword-matches each swarm job (name/description/objective/type)
 * against knowledge articles, ops alerts, and contacts to classify:
 *
 *   COVERED  — matches all 3 sources
 *              (swarm job has knowledge backing, ops alert, AND contact owner)
 *   ALERTED  — matches 2 of 3 sources
 *   STAFFED  — matches exactly 1 source
 *   BLIND    — no match to any source
 *              (automation blind spots — no knowledge article,
 *               no ops alert coverage, no contact owner)
 *
 * Toggle: ◈ SKOAC button (fixed, bottom strip) left:185000, zIndex:341
 * Stat tiles: swarm jobs / knowledge / alerts / contacts /
 *             covered / alerted / staffed / blind
 * Amber pulse on BLIND count (unmonitored automation).
 * Expandable rows: matched knowledge articles with category badge +
 *                  matched ops alerts with severity badge +
 *                  matched contacts with role/org.
 * Filter tabs: ALL / COVERED / ALERTED / STAFFED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "skoac"/"swarm knowledge ops"/"automation coverage"/
 *        "swarm blind"/"automation ops contact"/"swarm alert contact"/
 *        "blind automation"/"swarm knowledge contact"/"automation intelligence"
 * Event: jarvis:skoac-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'ALERTED', 'STAFFED', 'BLIND'];

const CLS_COLOR = {
  COVERED: '#22C55E',
  ALERTED: '#38BDF8',
  STAFFED: '#F59E0B',
  BLIND:   '#F59E0B',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeSwarms(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.swarm_jobs))      return raw.swarm_jobs;
  if (Array.isArray(raw?.jobs))            return raw.jobs;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.articles))        return raw.articles;
  if (Array.isArray(raw?.items))           return raw.items;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.alerts))          return raw.alerts;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))                  return raw;
  if (Array.isArray(raw?.contacts))        return raw.contacts;
  if (Array.isArray(raw?.data))            return raw.data;
  if (Array.isArray(raw?.results))         return raw.results;
  return [];
}

function swarmText(s) {
  return [s?.name, s?.title, s?.description, s?.objective, s?.type, s?.status].join(' ');
}

function knowledgeText(k) {
  return [k?.title, k?.name, k?.category, k?.description, k?.tags?.join?.(' ')].join(' ');
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.source, a?.category].join(' ');
}

function contactText(c) {
  return [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.tags?.join?.(' ')].join(' ');
}

function classify(job, articles, alerts, contacts) {
  const jtoks           = tokens(swarmText(job));
  const matchedArticles = articles.filter(k => overlaps(jtoks, knowledgeText(k)));
  const matchedAlerts   = alerts.filter(a   => overlaps(jtoks, alertText(a)));
  const matchedContacts = contacts.filter(c  => overlaps(jtoks, contactText(c)));
  const hasKn = matchedArticles.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const hasCt = matchedContacts.length > 0;
  const srcCnt = [hasKn, hasAl, hasCt].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'COVERED';
  else if (srcCnt === 2) cls = 'ALERTED';
  else if (srcCnt === 1) cls = 'STAFFED';
  else                   cls = 'BLIND';
  return { cls, matchedArticles, matchedAlerts, matchedContacts };
}

export function isSkoacQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('skoac') ||
    s.includes('swarm knowledge ops') ||
    s.includes('automation coverage') ||
    s.includes('swarm blind') ||
    s.includes('automation ops contact') ||
    s.includes('swarm alert contact') ||
    s.includes('blind automation') ||
    s.includes('swarm knowledge contact') ||
    s.includes('automation intelligence') ||
    s.includes('swarm ops coverage') ||
    s.includes('automation knowledge')
  );
}

export function buildSkoacScript(counts) {
  return `Analyse the JARVIS SwarmJob × Knowledge × Ops Alert × Contact Automation Intelligence Coverage.
Total swarm jobs: ${counts.total}. Covered (all 3 sources): ${counts.covered}. Alerted (2 sources): ${counts.alerted}. Staffed (1 source): ${counts.staffed}. Blind (no source): ${counts.blind}.
Focus on the ${counts.blind} blind automation jobs — no knowledge article, no ops alert coverage, and no contact owner.
Identify the highest-priority blind jobs and propose coverage steps: link to a relevant knowledge article, connect to a monitoring alert, or assign a responsible contact.`;
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

export default function SwarmKnowledgeOpsContactCoverage() {
  const [open, setOpen]           = useState(false);
  const [jobs, setJobs]           = useState([]);
  const [articles, setArticles]   = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [contacts, setContacts]   = useState([]);
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
      const [jRaw, kRaw, aRaw, cRaw] = await Promise.all([
        safeFetch(`${apiBase()}/entities/SwarmJob`),
        safeFetch(`${apiBase()}/knowledge/`),
        safeFetch(`${apiBase()}/v1/ops/alerts`),
        safeFetch(`${apiBase()}/entities/Contact`),
      ]);
      const jArr = normalizeSwarms(jRaw);
      const kArr = normalizeKnowledge(kRaw);
      const aArr = normalizeAlerts(aRaw);
      const cArr = normalizeContacts(cRaw);
      setJobs(jArr);
      setArticles(kArr);
      setAlerts(aArr);
      setContacts(cArr);
      setClass(jArr.map(j => ({ j, ...classify(j, kArr, aArr, cArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:skoac-toggle', handler);
    return () => window.removeEventListener('jarvis:skoac-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:   classified.length,
    covered: classified.filter(c => c.cls === 'COVERED').length,
    alerted: classified.filter(c => c.cls === 'ALERTED').length,
    staffed: classified.filter(c => c.cls === 'STAFFED').length,
    blind:   classified.filter(c => c.cls === 'BLIND').length,
  };

  const visible = classified.filter(item => {
    if (tab !== 'ALL' && item.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return swarmText(item.j).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildSkoacScript(counts);
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

  const blindPulse = counts.blind > 0;

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10341,
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
          position: 'fixed', bottom: 8, left: 185000, zIndex: 341,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: blindPulse ? '#F59E0B' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: blindPulse ? '0 0 6px #F59E0B88' : 'none',
          animation: blindPulse ? 'pulse-amber 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ SKOAC</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ SWARMJOB × KNOWLEDGE × OPS ALERT × CONTACT — AUTOMATION INTELLIGENCE COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {jobs.length} jobs · {articles.length} articles · {alerts.length} alerts · {contacts.length} contacts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('SWARM JOBS', counts.total,   '#94a3b8')}
            {tile('KNOWLEDGE',  articles.length, '#64748b')}
            {tile('ALERTS',     alerts.length,   '#64748b')}
            {tile('CONTACTS',   contacts.length, '#64748b')}
            {tile('COVERED',    counts.covered,  '#22C55E')}
            {tile('ALERTED',    counts.alerted,  '#38BDF8')}
            {tile('STAFFED',    counts.staffed,  '#F59E0B')}
            {tile('BLIND',      counts.blind,    '#F59E0B')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search swarm jobs…"
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
              const { j, cls, matchedArticles, matchedAlerts, matchedContacts } = item;
              const id = j?.id ?? j?.name ?? i;
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 72, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {j?.name || j?.title || j?.id || '—'}
                    </span>
                    {j?.status && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {j.status}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      K:{matchedArticles.length} A:{matchedAlerts.length} C:{matchedContacts.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedArticles.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Knowledge: </span>
                          {matchedArticles.slice(0, 4).map((k, ki) => (
                            <span key={ki} style={{
                              marginRight: 5, background: 'rgba(167,139,250,0.1)',
                              border: '1px solid #a78bfa44', borderRadius: 3,
                              padding: '1px 5px', color: '#a78bfa',
                            }}>
                              {k?.title || k?.name || k?.id}
                              {k?.category && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{k.category}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedArticles.length > 4 && <span style={{ color: '#475569' }}>+{matchedArticles.length - 4}</span>}
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
                      {matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Contacts: </span>
                          {matchedContacts.slice(0, 4).map((c, ci) => (
                            <span key={ci} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.1)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22C55E',
                            }}>
                              {c?.name || c?.full_name || c?.id}
                              {(c?.role || c?.organisation || c?.org) && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{c.role || ''}{c.role && (c.organisation || c.org) ? '/' : ''}{c.organisation || c.org || ''}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedContacts.length > 4 && <span style={{ color: '#475569' }}>+{matchedContacts.length - 4}</span>}
                        </div>
                      )}
                      {matchedArticles.length === 0 && matchedAlerts.length === 0 && matchedContacts.length === 0 && (
                        <div style={{ color: '#F59E0B', fontStyle: 'italic' }}>
                          No knowledge article, ops alert, or contact owner — blind automation job.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No swarm jobs match the current filter.
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
