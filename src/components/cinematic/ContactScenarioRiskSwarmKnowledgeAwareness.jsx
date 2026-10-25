/**
 * ContactScenarioRiskSwarmKnowledgeAwareness — F185
 *
 * Fetches /entities/Contact + /v1/scenario/list + /entities/RiskSignal
 *         + /entities/SwarmJob + /knowledge/
 *
 * Keyword-matches each contact (name/role/org) against scenario titles,
 * risk signal labels/categories, swarm job names/types, and knowledge
 * article titles/categories to classify:
 *
 *   AWARE    — contact matches scenario + risk signal + swarm job + knowledge
 *              (fully situationally aware across all 5 sources)
 *   COVERED  — contact matches 3 of 4 secondary sources
 *   PARTIAL  — contact matches 1–2 secondary sources
 *   DARK     — no match to any source (invisible operators — zero mission awareness)
 *
 * Toggle: ◈ CSRSK button (fixed, bottom strip) left:151960, zIndex:282
 * Stat tiles: contacts / scenarios / risks / swarmjobs / knowledge / aware / covered / partial / dark
 * Amber pulse on DARK count (invisible operators with zero mission awareness).
 * Expandable rows: matched scenarios with status badge +
 *                  matched risk signals with severity badge +
 *                  matched swarm jobs with status badge +
 *                  matched knowledge articles with category badge.
 * Filter tabs: ALL / AWARE / COVERED / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "csrsk"/"contact scenario risk swarm"/"mission awareness"
 *        "dark contacts"/"invisible operators"/"contact awareness gap"
 *        "contact mission awareness"/"operator situational awareness"
 * Event: jarvis:csrsk-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'AWARE', 'COVERED', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  AWARE:    '#22C55E',
  COVERED:  '#38BDF8',
  PARTIAL:  '#F97316',
  DARK:     '#FBBF24',
};

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

export function isCsrskQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'csrsk', 'contact scenario risk swarm', 'mission awareness',
    'dark contacts', 'invisible operators', 'contact awareness gap',
    'contact mission awareness', 'operator situational awareness',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classify(contact, scenarios, risks, swarmJobs, articles) {
  const toks = tokens(`${contact.name || ''} ${contact.role || ''} ${contact.org || ''} ${contact.organisation || ''}`);
  const mScenarios = scenarios.filter(s => overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''}`));
  const mRisks     = risks.filter(r => overlaps(toks, `${r.label || ''} ${r.category || ''} ${r.description || ''} ${r.name || ''}`));
  const mSwarm     = swarmJobs.filter(j => overlaps(toks, `${j.name || ''} ${j.type || ''} ${j.description || ''}`));
  const mArticles  = articles.filter(a => overlaps(toks, `${a.title || ''} ${a.category || ''} ${a.tags || ''}`));

  const matched = [mScenarios.length > 0, mRisks.length > 0, mSwarm.length > 0, mArticles.length > 0].filter(Boolean).length;

  let cls;
  if (matched === 4) cls = 'AWARE';
  else if (matched === 3) cls = 'COVERED';
  else if (matched >= 1) cls = 'PARTIAL';
  else cls = 'DARK';

  return { contact, cls, mScenarios, mRisks, mSwarm, mArticles };
}

export default function ContactScenarioRiskSwarmKnowledgeAwareness() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [stats, setStats]   = useState({ contacts:0, scenarios:0, risks:0, swarmJobs:0, articles:0, aware:0, covered:0, partial:0, dark:0 });
  const [tab, setTab]       = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ctRaw, scRaw, rkRaw, swRaw, knRaw] = await Promise.all([
        fetcher('/entities/Contact'),
        fetcher('/v1/scenario/list'),
        fetcher('/entities/RiskSignal'),
        fetcher('/entities/SwarmJob'),
        fetcher('/knowledge/'),
      ]);
      const contacts  = normalizeArray(ctRaw, ['contacts','items','data','results']);
      const scenarios = normalizeArray(scRaw, ['scenarios','items','data','results']);
      const risks     = normalizeArray(rkRaw, ['risk_signals','riskSignals','items','data','results']);
      const swarmJobs = normalizeArray(swRaw, ['swarm_jobs','swarmJobs','items','data','results']);
      const articles  = normalizeArray(knRaw, ['articles','knowledge','items','data','results']);

      const classified = contacts.map(c => classify(c, scenarios, risks, swarmJobs, articles));
      setRows(classified);
      setStats({
        contacts: contacts.length, scenarios: scenarios.length,
        risks: risks.length, swarmJobs: swarmJobs.length, articles: articles.length,
        aware:   classified.filter(r => r.cls === 'AWARE').length,
        covered: classified.filter(r => r.cls === 'COVERED').length,
        partial: classified.filter(r => r.cls === 'PARTIAL').length,
        dark:    classified.filter(r => r.cls === 'DARK').length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:csrsk-toggle', handler);
    return () => window.removeEventListener('jarvis:csrsk-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const summary = `CSRSK: ${stats.contacts} contacts | ${stats.aware} AWARE | ${stats.covered} COVERED | ${stats.partial} PARTIAL | ${stats.dark} DARK (invisible operators). Scenarios: ${stats.scenarios}, RiskSignals: ${stats.risks}, SwarmJobs: ${stats.swarmJobs}, KnowledgeArticles: ${stats.articles}.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Mission awareness assessment: ${summary} Identify the highest-risk dark contacts with zero situational awareness and recommend immediate awareness uplift actions.` }),
      });
      const d = await r.json();
      const text = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const c = r.contact;
      return (c.name || '').toLowerCase().includes(s)
          || (c.role || '').toLowerCase().includes(s)
          || (c.org || c.organisation || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 151960, zIndex: 282,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 10, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >◈ CSRSK</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20, zIndex: 9900,
      width: 820, maxHeight: '82vh',
      background: 'rgba(2,6,23,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(251,191,36,0.12)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#fbbf24', fontSize: 14 }}>◈</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>CSRSK</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Contact × Scenario × RiskSignal × SwarmJob × Knowledge — Mission Awareness</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={assess} disabled={assessing}
            style={{ background: '#1e40af', border: 'none', color: '#bfdbfe', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
          >{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => load()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
        {[
          ['CONTACTS',  stats.contacts,  '#94a3b8'],
          ['SCENARIOS', stats.scenarios, '#64748b'],
          ['RISKS',     stats.risks,     '#64748b'],
          ['SWARM',     stats.swarmJobs, '#64748b'],
          ['KNOWLEDGE', stats.articles,  '#64748b'],
          ['AWARE',     stats.aware,     CLS_COLOR.AWARE],
          ['COVERED',   stats.covered,   CLS_COLOR.COVERED],
          ['PARTIAL',   stats.partial,   CLS_COLOR.PARTIAL],
          ['DARK',      stats.dark,      CLS_COLOR.DARK],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: '#0f172a', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 56,
          }}>
            <div style={{ color, fontSize: 15, fontWeight: 700, ...(label === 'DARK' && val > 0 ? {
              animation: 'csrsk-pulse 1.4s ease-in-out infinite',
            } : {}) }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1e3a5f' : '#0f172a',
            border: `1px solid ${tab === t ? '#3b82f6' : '#1e293b'}`,
            color: tab === t ? '#bfdbfe' : '#64748b',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>loading…</div>}
        {error   && <div style={{ color: '#ef4444', textAlign: 'center', padding: 8 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>no results</div>
        )}
        {visible.map((r, i) => {
          const c  = r.contact;
          const id = c.id || c._id || i;
          const ex = expanded[id];
          return (
            <div key={id} style={{ borderBottom: '1px solid #0f172a' }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                  cursor: 'pointer', background: ex ? '#0f172a' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 10, minWidth: 68 }}>{r.cls}</span>
                <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name || c.id || '—'}
                </span>
                {(c.role || c.org || c.organisation) && (
                  <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{ex ? '▲' : '▼'}</span>
              </div>
              {ex && (
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((s, j) => (
                          <span key={j} style={{ background: '#0c1a2e', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> {s.status}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mRisks.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mRisks.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mRisks.slice(0, 8).map((rk, j) => (
                          <span key={j} style={{ background: '#1c0b0b', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rk.label || rk.name || rk.id}
                            {rk.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {rk.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSwarm.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>SWARM JOBS ({r.mSwarm.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSwarm.slice(0, 8).map((sw, j) => (
                          <span key={j} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {sw.name || sw.id}
                            {sw.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> {sw.status}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mArticles.length > 0 && (
                    <div>
                      <div style={{ color: '#4ade80', fontSize: 10, marginBottom: 3 }}>KNOWLEDGE ({r.mArticles.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mArticles.slice(0, 8).map((a, j) => (
                          <span key={j} style={{ background: '#0a1e0e', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {a.title || a.id}
                            {a.category && <span style={{ color: '#94a3b8', fontSize: 9 }}> {a.category}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length === 0 && r.mRisks.length === 0 && r.mSwarm.length === 0 && r.mArticles.length === 0 && (
                    <div style={{ color: '#fbbf24', fontSize: 10 }}>No scenario, risk signal, swarm job, or knowledge match — invisible operator.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes csrsk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
