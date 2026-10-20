/**
 * InvestigationScenarioKnowledgeActionability — F61
 *
 * Fetches /v1/investigations + /v1/scenario/list + /knowledge/
 * Cross-references each investigation against runnable scenarios AND knowledge articles to classify:
 *   ACTIONABLE — investigation matched both a scenario AND a knowledge article (fully supported)
 *   SCRIPTED   — investigation matched a scenario only (playbook exists, no documented knowledge)
 *   KNOWN      — investigation matched knowledge only (documented, no runnable playbook)
 *   COLD       — no match in either (cold cases with no operational support)
 *
 * Toggle: ◈ INVACT button (fixed, bottom strip) left:82520, zIndex:158
 * Stat tiles: investigations / scenarios / articles / actionable / scripted / known / cold
 * Amber pulse on COLD count.
 * Expandable rows: matched scenarios with status badge + matched knowledge articles with category badge.
 * Filter tabs: ALL / ACTIONABLE / SCRIPTED / KNOWN / COLD + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "invact"/"investigation actionability"/"cold cases"/"cold investigations"/
 *        "investigation scenario"/"investigation knowledge"/"actionable investigations"/
 *        "open cold cases"/"inv action"/"case readiness"
 * Event: jarvis:invact-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIONABLE', 'SCRIPTED', 'KNOWN', 'COLD'];

const CLS_COLOR = {
  ACTIONABLE: '#00FF88',
  SCRIPTED:   '#A78BFA',
  KNOWN:      '#38BDF8',
  COLD:       '#FFB800',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function classify(invToks, scenarios, articles) {
  const matchedScenarios = scenarios.filter(s =>
    overlaps(invToks, [
      s.id, s.name, s.title, s.scenario, s.type, s.category,
      s.description, s.tags, s.domain, s.objective,
    ].join(' '))
  );
  const matchedArticles = articles.filter(a =>
    overlaps(invToks, [
      a.id, a.name, a.title, a.category, a.type,
      a.content, a.summary, a.tags, a.domain, a.topic,
    ].join(' '))
  );
  const hasScenario = matchedScenarios.length > 0;
  const hasArticle  = matchedArticles.length > 0;
  const cls = hasScenario && hasArticle ? 'ACTIONABLE'
            : hasScenario               ? 'SCRIPTED'
            : hasArticle                ? 'KNOWN'
            : 'COLD';
  return {
    cls,
    matchedScenarios: matchedScenarios.slice(0, 4),
    matchedArticles:  matchedArticles.slice(0, 4),
  };
}

export function isInvactQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('invact') ||
    s.includes('investigation actionability') ||
    s.includes('cold cases') ||
    s.includes('cold investigations') ||
    s.includes('cold case') ||
    s.includes('investigation scenario') ||
    s.includes('investigation knowledge') ||
    s.includes('actionable investigations') ||
    s.includes('open cold cases') ||
    s.includes('inv action') ||
    s.includes('case readiness')
  );
}

export default function InvestigationScenarioKnowledgeActionability() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, scnRes, knwRes] = await Promise.all([
        fetch(`${API}/v1/investigations`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/v1/scenario/list`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${API}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [invRaw, scnRaw, knwRaw] = await Promise.all([
        invRes.ok ? invRes.json() : {},
        scnRes.ok ? scnRes.json() : {},
        knwRes.ok ? knwRes.json() : {},
      ]);

      const investigations = normalizeArray(invRaw, ['investigations', 'items', 'data', 'results']);
      const scenarios      = normalizeArray(scnRaw, ['scenarios', 'items', 'data', 'results']);
      const articles       = normalizeArray(knwRaw, ['articles', 'items', 'data', 'results', 'knowledge']);

      const classified = investigations.map(inv => {
        const label = [inv.id, inv.name, inv.title, inv.subject, inv.description, inv.tags, inv.type].join(' ');
        const toks  = tokens(label);
        const { cls, matchedScenarios, matchedArticles } = classify(toks, scenarios, articles);
        return { ...inv, cls, matchedScenarios, matchedArticles, _label: label, _toks: toks };
      });

      setRows(classified);
    } catch (_) {
      /* network error — leave existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:invact-toggle', handler);
    return () => window.removeEventListener('jarvis:invact-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setAssessment('');
    const coldCount      = rows.filter(r => r.cls === 'COLD').length;
    const actionableCount = rows.filter(r => r.cls === 'ACTIONABLE').length;
    const prompt = `Jarvis, I have ${rows.length} investigations. ${coldCount} are COLD (no matching scenario or knowledge). ${actionableCount} are fully ACTIONABLE. Provide a 2-sentence operational advisory on prioritising cold-case investigation support.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = r.ok ? await r.json() : {};
      const text = data.response || data.message || data.answer || data.content || '';
      setAssessment(text);
      if (text) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice: 'ash' }),
          });
        } catch (_) { /* TTS is best-effort */ }
      }
    } catch (_) { /* assessment failed */ } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    total:      rows.length,
    actionable: rows.filter(r => r.cls === 'ACTIONABLE').length,
    scripted:   rows.filter(r => r.cls === 'SCRIPTED').length,
    known:      rows.filter(r => r.cls === 'KNOWN').length,
    cold:       rows.filter(r => r.cls === 'COLD').length,
  };

  const visible = rows.filter(r =>
    (tab === 'ALL' || r.cls === tab) &&
    (!search || (r._label || '').toLowerCase().includes(search.toLowerCase()))
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 82520, zIndex: 158,
          background: 'rgba(255,184,0,0.08)', border: '1px solid #FFB80044',
          color: '#FFB800', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
        title="Investigation × Scenario × Knowledge Actionability"
      >◈ INVACT</button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 52, right: 14, zIndex: 158,
        width: 560, maxHeight: '78vh',
        background: 'rgba(8,10,18,0.97)', border: '1px solid #FFB80033',
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', fontSize: 11, color: '#ccc',
        boxShadow: '0 0 32px rgba(255,184,0,0.08)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 12px', borderBottom: '1px solid #FFB80022',
          background: 'rgba(255,184,0,0.04)',
        }}>
          <span style={{ color: '#FFB800', fontWeight: 700, letterSpacing: 1, fontSize: 10 }}>
            ◈ INVACT — INVESTIGATION ACTIONABILITY
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {loading && <span style={{ color: '#FFB80077', fontSize: 9 }}>LOADING…</span>}
            <button onClick={load} title="Refresh"
              style={{ background: 'none', border: 'none', color: '#FFB80066', cursor: 'pointer', fontSize: 12, padding: 0 }}>↻</button>
            <button onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
          {[
            ['TOTAL',      counts.total,      '#888'],
            ['ACTIONABLE', counts.actionable, '#00FF88'],
            ['SCRIPTED',   counts.scripted,   '#A78BFA'],
            ['KNOWN',      counts.known,      '#38BDF8'],
            ['COLD',       counts.cold,       '#FFB800', true],
          ].map(([label, val, color, pulse]) => (
            <div key={label} style={{
              background: `rgba(${color === '#FFB800' ? '255,184,0' : color === '#00FF88' ? '0,255,136' : color === '#A78BFA' ? '167,139,250' : '56,189,248'},0.07)`,
              border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 68,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse && val > 0 ? 'invact-pulse 1.8s ease-in-out infinite' : 'none',
              }}>{val}</span>
              <span style={{ fontSize: 8, color: `${color}99`, letterSpacing: 1 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'rgba(255,184,0,0.15)' : 'none',
                border: `1px solid ${tab === t ? '#FFB800' : '#FFB80033'}`,
                color: tab === t ? '#FFB800' : '#888',
                fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: 1,
              }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,184,0,0.04)',
              border: '1px solid #FFB80033', borderRadius: 3, color: '#ccc',
              fontSize: 9, padding: '2px 8px', fontFamily: 'monospace', outline: 'none', width: 110,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 10 }}>
              {rows.length === 0 ? 'No investigations loaded.' : 'No matches.'}
            </div>
          )}
          {visible.map((inv, idx) => {
            const id = inv.id || inv.name || String(idx);
            const isExp = !!expanded[id];
            const color = CLS_COLOR[inv.cls] || '#888';
            return (
              <div key={id} style={{
                marginBottom: 4, background: `rgba(${color === '#FFB800' ? '255,184,0' : color === '#00FF88' ? '0,255,136' : color === '#A78BFA' ? '167,139,250' : '56,189,248'},0.03)`,
                border: `1px solid ${color}22`, borderRadius: 4,
              }}>
                <div
                  onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}
                >
                  <span style={{ color, fontSize: 9, fontWeight: 700, letterSpacing: 1, minWidth: 72 }}>{inv.cls}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ccc' }}>
                    {inv.title || inv.name || inv.subject || id}
                  </span>
                  {inv.status && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', color: '#aaa', letterSpacing: 1,
                    }}>{String(inv.status).toUpperCase()}</span>
                  )}
                  <span style={{ color: '#555', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 8px 8px', borderTop: `1px solid ${color}11` }}>
                    {inv.description && (
                      <div style={{ fontSize: 9, color: '#888', marginBottom: 6, lineHeight: 1.5 }}>
                        {String(inv.description).slice(0, 200)}
                      </div>
                    )}
                    {/* Matched Scenarios */}
                    {inv.matchedScenarios.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA99', marginBottom: 3, letterSpacing: 1 }}>MATCHED SCENARIOS</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {inv.matchedScenarios.map((s, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33', color: '#A78BFA',
                            }}>
                              {s.name || s.title || s.id}
                              {s.status && <span style={{ color: '#A78BFA77', marginLeft: 4 }}>{String(s.status).toUpperCase()}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Matched Knowledge */}
                    {inv.matchedArticles.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: '#38BDF899', marginBottom: 3, letterSpacing: 1 }}>MATCHED KNOWLEDGE</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {inv.matchedArticles.map((a, i) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 2,
                              background: 'rgba(56,189,248,0.10)', border: '1px solid #38BDF833', color: '#38BDF8',
                            }}>
                              {a.name || a.title || a.id}
                              {a.category && <span style={{ color: '#38BDF877', marginLeft: 4 }}>{String(a.category).toUpperCase()}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {inv.matchedScenarios.length === 0 && inv.matchedArticles.length === 0 && (
                      <div style={{ fontSize: 9, color: '#FFB80066' }}>No matching scenarios or knowledge articles found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Assess */}
        <div style={{ padding: '6px 12px 10px', borderTop: '1px solid #FFB80011' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.05)' : 'rgba(255,184,0,0.10)',
              border: '1px solid #FFB80055', color: '#FFB800',
              fontSize: 10, padding: '4px 14px', borderRadius: 3,
              cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS INVESTIGATION ACTIONABILITY'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,184,0,0.03)',
              border: '1px solid #FFB80022', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>

      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 82520, zIndex: 158,
          background: 'rgba(255,184,0,0.15)', border: '1px solid #FFB800',
          color: '#FFB800', fontSize: 9, padding: '3px 8px', borderRadius: 3,
          cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >◈ INVACT ✕</button>

      <style>{`
        @keyframes invact-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </>
  );
}
