/**
 * ScenarioBrainContactOpsActivation — F243
 *
 * Fetches /v1/scenario/list + /v1/cinematic/brain +
 *         /entities/Contact + /v1/ops/alerts
 *
 * Keyword-matches each scenario (name/description/phase/tags)
 * against brain nodes, contacts, and ops alerts to classify:
 *
 *   ACTIVE   — matches all 3 sources
 *              (scenario has brain model grounding, contact owner, AND ops alert monitoring)
 *   PARTIAL  — matches 2 of 3 sources
 *   MINIMAL  — matches exactly 1 source
 *   DARK     — no match to any source
 *              (unactivated scenarios with no brain model, no contact, no ops alert)
 *
 * Toggle: ◈ SBCOA button (fixed, bottom strip) left:183880, zIndex:339
 * Stat tiles: scenarios / brain nodes / contacts / alerts /
 *             active / partial / minimal / dark
 * Red pulse on DARK count (unactivated scenarios).
 * Expandable rows: matched brain nodes with type badge +
 *                  matched contacts with role/org +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / ACTIVE / PARTIAL / MINIMAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sbcoa"/"scenario activation"/"scenario brain contact"/"unactivated scenario"/
 *        "dark scenario"/"scenario ops alert"/"scenario coverage"/
 *        "scenario brain coverage"/"scenario contact coverage"/"activation coverage"
 * Event: jarvis:sbcoa-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVE', 'PARTIAL', 'MINIMAL', 'DARK'];

const CLS_COLOR = {
  ACTIVE:   '#22C55E',
  PARTIAL:  '#38BDF8',
  MINIMAL:  '#F59E0B',
  DARK:     '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.scenarios))          return raw.scenarios;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeBrain(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.nodes))              return raw.nodes;
  if (Array.isArray(raw?.centrality))         return raw.centrality;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.contacts))           return raw.contacts;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                     return raw;
  if (Array.isArray(raw?.alerts))             return raw.alerts;
  if (Array.isArray(raw?.data))               return raw.data;
  if (Array.isArray(raw?.results))            return raw.results;
  return [];
}

function scenarioText(s) {
  return [s?.name, s?.title, s?.description, s?.phase, s?.objective, s?.tags?.join?.(' ')].join(' ');
}

function brainText(n) {
  return [n?.label, n?.name, n?.type, n?.community, n?.description].join(' ');
}

function contactText(c) {
  return [c?.name, c?.role, c?.organization, c?.org, c?.email, c?.tags?.join?.(' ')].join(' ');
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.type, a?.source].join(' ');
}

function classify(scenario, brainNodes, contacts, alerts) {
  const stoks = tokens(scenarioText(scenario));
  const matchedBrain    = brainNodes.filter(n => overlaps(stoks, brainText(n)));
  const matchedContacts = contacts.filter(c  => overlaps(stoks, contactText(c)));
  const matchedAlerts   = alerts.filter(a    => overlaps(stoks, alertText(a)));
  const hasBr = matchedBrain.length > 0;
  const hasCo = matchedContacts.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const srcCnt = [hasBr, hasCo, hasAl].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'ACTIVE';
  else if (srcCnt === 2) cls = 'PARTIAL';
  else if (srcCnt === 1) cls = 'MINIMAL';
  else                   cls = 'DARK';
  return { cls, matchedBrain, matchedContacts, matchedAlerts };
}

export function isSbcoaQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('sbcoa') ||
    s.includes('scenario activation') ||
    s.includes('scenario brain contact') ||
    s.includes('unactivated scenario') ||
    s.includes('dark scenario') ||
    s.includes('scenario ops alert') ||
    s.includes('scenario coverage') ||
    s.includes('scenario brain coverage') ||
    s.includes('scenario contact coverage') ||
    s.includes('activation coverage')
  );
}

export function buildSbcoaScript(rows) {
  const dark    = rows.filter(r => r.cls === 'DARK').length;
  const minimal = rows.filter(r => r.cls === 'MINIMAL').length;
  return (
    `Scenario × Brain × Contact × Ops Alert Activation Coverage: ` +
    `${rows.length} scenarios assessed. ` +
    `${rows.filter(r => r.cls === 'ACTIVE').length} fully active (brain model + contact + ops alert). ` +
    `${rows.filter(r => r.cls === 'PARTIAL').length} partial coverage. ` +
    `${minimal} minimal. ${dark} dark (no brain model, no contact owner, no ops alert). ` +
    `Identify and activate the ${dark + minimal} unanchored scenarios. ` +
    `What are the top 3 highest-priority scenarios to activate next, and what single action makes the biggest impact?`
  );
}

export default function ScenarioBrainContactOpsActivation() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [sR, bR, cR, aR] = await Promise.all([
        fetch(`${API}/v1/scenario/list`,       { headers: hdrs }),
        fetch(`${API}/v1/cinematic/brain`,     { headers: hdrs }),
        fetch(`${API}/entities/Contact`,       { headers: hdrs }),
        fetch(`${API}/v1/ops/alerts`,          { headers: hdrs }),
      ]);
      const [sD, bD, cD, aD] = await Promise.all([
        sR.ok ? sR.json() : [],
        bR.ok ? bR.json() : [],
        cR.ok ? cR.json() : [],
        aR.ok ? aR.json() : [],
      ]);
      const scenarios  = normalizeScenarios(sD);
      const brainNodes = normalizeBrain(bD);
      const contacts   = normalizeContacts(cD);
      const alerts     = normalizeAlerts(aD);
      const classified = scenarios.map(s => ({
        ...s,
        ...classify(s, brainNodes, contacts, alerts),
      }));
      setRows(classified);
    } catch (_) {
      // silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:sbcoa-toggle', handler);
    return () => window.removeEventListener('jarvis:sbcoa-toggle', handler);
  }, []);

  const counts = {
    ACTIVE:  rows.filter(r => r.cls === 'ACTIVE').length,
    PARTIAL: rows.filter(r => r.cls === 'PARTIAL').length,
    MINIMAL: rows.filter(r => r.cls === 'MINIMAL').length,
    DARK:    rows.filter(r => r.cls === 'DARK').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || '').toLowerCase().includes(q) ||
             (r.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    const script = buildSbcoaScript(rows);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || d.message || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 500) }),
        });
      } catch (_) {}
    } catch (_) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }, [rows, assessing]);

  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  function clsColor(c) { return CLS_COLOR[c] || '#94a3b8'; }

  function phaseColor(p) {
    if (!p) return '#94a3b8';
    const s = p.toLowerCase();
    if (s === 'active' || s === 'running') return '#22C55E';
    if (s === 'planned' || s === 'pending') return '#F59E0B';
    if (s === 'complete' || s === 'done')   return '#38BDF8';
    return '#94a3b8';
  }

  function severityColor(sv) {
    const s = (sv || '').toLowerCase();
    if (s === 'critical' || s === 'high') return '#EF4444';
    if (s === 'medium' || s === 'moderate') return '#F59E0B';
    return '#38BDF8';
  }

  function nodeTypeColor() { return '#a78bfa'; }

  const tile = (label, val, col) => (
    <div key={label} style={{
      flex: '1 1 80px', background: 'rgba(10,20,40,0.7)',
      border: `1px solid ${col}33`, borderRadius: 6,
      padding: '8px 10px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 183880,
          zIndex: 339, background: 'rgba(10,20,40,0.85)',
          border: `1px solid ${counts.DARK > 0 ? '#ef4444' : '#1e3a5f'}`,
          borderRadius: 4, padding: '3px 8px',
          color: counts.DARK > 0 ? '#EF4444' : '#38bdf8',
          fontSize: 10, letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ◈ SBCOA
        {counts.DARK > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444',
            borderRadius: '50%', padding: '0 5px',
            color: '#fff', fontSize: 9,
            animation: 'pulse 1.4s infinite',
          }}>{counts.DARK}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 36, left: 183880,
          zIndex: 340, width: 520,
          background: 'rgba(8,16,32,0.97)',
          border: '1px solid #1e3a5f', borderRadius: 8,
          boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', maxHeight: 560,
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #1e3a5f',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
                SCENARIO × BRAIN × CONTACT × OPS ALERT
              </span>
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                Strategic Activation Coverage
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#64748b',
              cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap' }}>
            {tile('SCENARIOS', rows.length, '#38bdf8')}
            {tile('ACTIVE', counts.ACTIVE, CLS_COLOR.ACTIVE)}
            {tile('PARTIAL', counts.PARTIAL, CLS_COLOR.PARTIAL)}
            {tile('MINIMAL', counts.MINIMAL, CLS_COLOR.MINIMAL)}
            {tile('DARK', counts.DARK, CLS_COLOR.DARK)}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(56,189,248,0.15)' : 'transparent',
                border: `1px solid ${tab === t ? '#38bdf8' : '#1e3a5f'}`,
                borderRadius: 4, padding: '2px 8px',
                color: tab === t ? '#38bdf8' : '#64748b',
                fontSize: 9, cursor: 'pointer', letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: 'auto', background: 'rgba(30,58,95,0.3)',
                border: '1px solid #1e3a5f', borderRadius: 4,
                padding: '2px 7px', color: '#94a3b8', fontSize: 10, width: 100,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
            {loading && (
              <div style={{ padding: 20, color: '#38bdf8', fontSize: 11, textAlign: 'center' }}>
                Loading…
              </div>
            )}
            {!loading && visible.map((r, i) => {
              const id = r.id || r.name || i;
              const isExp = !!expanded[id];
              const { matchedBrain, matchedContacts, matchedAlerts } = r;
              return (
                <div key={id} style={{
                  borderBottom: '1px solid #0f172a', padding: '7px 0',
                }}>
                  <div
                    onClick={() => toggleExpand(id)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <span style={{
                        color: clsColor(r.cls), fontWeight: 600,
                        fontSize: 10, letterSpacing: 1, marginRight: 6,
                      }}>{r.cls}</span>
                      <span style={{ color: '#e2e8f0', fontSize: 11 }}>
                        {r.name || r.title || id}
                      </span>
                      {r.phase && (
                        <span style={{
                          marginLeft: 6, fontSize: 9,
                          color: phaseColor(r.phase), textTransform: 'uppercase',
                        }}>[{r.phase}]</span>
                      )}
                    </div>
                    <span style={{ color: '#475569', fontSize: 10, marginLeft: 8 }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{
                      marginTop: 6, padding: '6px 8px',
                      background: 'rgba(30,58,95,0.12)',
                      borderRadius: 4, fontSize: 10,
                    }}>
                      {r.description && (
                        <div style={{ color: '#64748b', marginBottom: 5, fontStyle: 'italic' }}>
                          {r.description.slice(0, 160)}{r.description.length > 160 ? '…' : ''}
                        </div>
                      )}
                      {matchedBrain.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Brain nodes: </span>
                          {matchedBrain.slice(0, 4).map((n, ni) => (
                            <span key={ni} style={{
                              marginRight: 5, background: 'rgba(167,139,250,0.1)',
                              border: '1px solid #a78bfa44', borderRadius: 3,
                              padding: '1px 5px', color: nodeTypeColor(),
                            }}>
                              {n?.label || n?.name || n?.id}
                              {n?.type && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{n.type}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedBrain.length > 4 && (
                            <span style={{ color: '#475569' }}>+{matchedBrain.length - 4}</span>
                          )}
                        </div>
                      )}
                      {matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Contacts: </span>
                          {matchedContacts.slice(0, 4).map((c, ci) => (
                            <span key={ci} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.08)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38BDF8',
                            }}>
                              {c?.name || c?.id}
                              {(c?.role || c?.organization || c?.org) && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{c.role || ''}{c.role && (c.organization || c.org) ? ' · ' : ''}{c.organization || c.org || ''}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedContacts.length > 4 && (
                            <span style={{ color: '#475569' }}>+{matchedContacts.length - 4}</span>
                          )}
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
                          {matchedAlerts.length > 4 && (
                            <span style={{ color: '#475569' }}>+{matchedAlerts.length - 4}</span>
                          )}
                        </div>
                      )}
                      {matchedBrain.length === 0 && matchedContacts.length === 0 && matchedAlerts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No brain model, contact owner, or ops alert matched — dark scenario.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No scenarios match the current filter.
              </div>
            )}
          </div>

          {/* Assess footer */}
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
