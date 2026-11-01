/**
 * ContactScenarioOpsRiskCoverage — F248
 *
 * Fetches /entities/Contact + /v1/scenario/list +
 *         /v1/ops/alerts + /entities/RiskSignal
 *
 * Keyword-matches each contact (name/role/org/tags)
 * against scenarios, ops alerts, and risk signals to classify:
 *
 *   COVERED  — matches all 3 sources
 *              (contact has a matching scenario, ops alert, AND risk signal)
 *   ALERTED  — matches 2 of 3 sources
 *   PARTIAL  — matches exactly 1 source
 *   DARK     — no match to any source
 *              (contacts with no scenario, no ops alert, no risk signal)
 *
 * Toggle: ◈ CSORC button (fixed, bottom strip) left:186680, zIndex:344
 * Stat tiles: contacts / scenarios / alerts / signals /
 *             covered / alerted / partial / dark
 * Red pulse on DARK count (invisible operators).
 * Expandable rows: matched scenarios with status badge +
 *                  matched ops alerts with severity badge +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / COVERED / ALERTED / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "csorc"/"contact scenario ops"/"contact ops risk"/
 *        "operator threat coverage"/"contact risk coverage"/
 *        "contact scenario risk"/"operator coverage"/"dark operators"
 * Event: jarvis:csorc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'ALERTED', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  COVERED: '#22C55E',
  ALERTED: '#38BDF8',
  PARTIAL: '#F59E0B',
  DARK:    '#EF4444',
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
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.contacts))    return raw.contacts;
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

function normalizeAlerts(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.alerts))      return raw.alerts;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function normalizeRisks(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.signals))     return raw.signals;
  if (Array.isArray(raw?.risk_signals)) return raw.risk_signals;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

function contactText(c) {
  return [c?.name, c?.full_name, c?.role, c?.organisation, c?.org, c?.tags?.join?.(' ')].join(' ');
}

function scenarioText(s) {
  return [s?.name, s?.title, s?.description, s?.phase, s?.type].join(' ');
}

function alertText(a) {
  return [a?.title, a?.name, a?.description, a?.source, a?.category].join(' ');
}

function riskText(r) {
  return [r?.name, r?.title, r?.description, r?.category, r?.source].join(' ');
}

function classify(contact, scenarios, alerts, risks) {
  const ctoks           = tokens(contactText(contact));
  const matchedScenarios = scenarios.filter(s => overlaps(ctoks, scenarioText(s)));
  const matchedAlerts    = alerts.filter(a   => overlaps(ctoks, alertText(a)));
  const matchedRisks     = risks.filter(r    => overlaps(ctoks, riskText(r)));
  const hasSc = matchedScenarios.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const hasRk = matchedRisks.length > 0;
  const srcCnt = [hasSc, hasAl, hasRk].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'COVERED';
  else if (srcCnt === 2) cls = 'ALERTED';
  else if (srcCnt === 1) cls = 'PARTIAL';
  else                   cls = 'DARK';
  return { cls, matchedScenarios, matchedAlerts, matchedRisks };
}

export function isCsorcQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('csorc') ||
    s.includes('contact scenario ops') ||
    s.includes('contact ops risk') ||
    s.includes('operator threat coverage') ||
    s.includes('contact risk coverage') ||
    s.includes('contact scenario risk') ||
    s.includes('operator coverage') ||
    s.includes('dark operators') ||
    s.includes('contact threat coverage') ||
    s.includes('operator risk scenario')
  );
}

export function buildCsorcScript(counts) {
  return `Analyse the JARVIS Contact × Scenario × Ops Alert × RiskSignal Operational Threat Coverage.
Total contacts: ${counts.total}. Covered (all 3 sources): ${counts.covered}. Alerted (2 sources): ${counts.alerted}. Partial (1 source): ${counts.partial}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark contacts — personnel with no matching scenario playbook, no ops alert, and no risk signal coverage.
Identify the highest-priority invisible operators and propose steps to bring them into the operational threat picture: link to relevant scenarios, create monitoring alerts, or associate with known risk signals.`;
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

export default function ContactScenarioOpsRiskCoverage() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [risks, setRisks]         = useState([]);
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
      const [cRaw, sRaw, aRaw, rRaw] = await Promise.all([
        safeFetch(`${API}/entities/Contact`),
        safeFetch(`${API}/v1/scenario/list`),
        safeFetch(`${API}/v1/ops/alerts`),
        safeFetch(`${API}/entities/RiskSignal`),
      ]);
      const cArr = normalizeContacts(cRaw);
      const sArr = normalizeScenarios(sRaw);
      const aArr = normalizeAlerts(aRaw);
      const rArr = normalizeRisks(rRaw);
      setContacts(cArr);
      setScenarios(sArr);
      setAlerts(aArr);
      setRisks(rArr);
      setClass(cArr.map(c => ({ c, ...classify(c, sArr, aArr, rArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:csorc-toggle', handler);
    return () => window.removeEventListener('jarvis:csorc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:   classified.length,
    covered: classified.filter(x => x.cls === 'COVERED').length,
    alerted: classified.filter(x => x.cls === 'ALERTED').length,
    partial: classified.filter(x => x.cls === 'PARTIAL').length,
    dark:    classified.filter(x => x.cls === 'DARK').length,
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
      const script = buildCsorcScript(counts);
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

  const darkPulse = counts.dark > 0;

  const severityColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'critical' || v === 'high')   return '#EF4444';
    if (v === 'medium' || v === 'moderate') return '#F59E0B';
    return '#64748b';
  };

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10344,
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
          position: 'fixed', bottom: 8, left: 186680, zIndex: 344,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ CSORC</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ CONTACT × SCENARIO × OPS ALERT × RISKSIGNAL — OPERATIONAL THREAT COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {contacts.length} contacts · {scenarios.length} scenarios · {alerts.length} alerts · {risks.length} signals
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('CONTACTS',  counts.total,    '#94a3b8')}
            {tile('SCENARIOS', scenarios.length, '#64748b')}
            {tile('ALERTS',    alerts.length,    '#64748b')}
            {tile('SIGNALS',   risks.length,     '#64748b')}
            {tile('COVERED',   counts.covered,   '#22C55E')}
            {tile('ALERTED',   counts.alerted,   '#38BDF8')}
            {tile('PARTIAL',   counts.partial,   '#F59E0B')}
            {tile('DARK',      counts.dark,      '#EF4444')}
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
              const { c, cls, matchedScenarios, matchedAlerts, matchedRisks } = item;
              const id = c?.id ?? c?.name ?? i;
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 72, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {c?.name || c?.full_name || c?.id || '—'}
                    </span>
                    {(c?.role || c?.organisation || c?.org) && (
                      <span style={{
                        fontSize: 10, color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)', borderRadius: 3, padding: '1px 5px',
                      }}>
                        {c.role || ''}{c.role && (c.organisation || c.org) ? '/' : ''}{c.organisation || c.org || ''}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      S:{matchedScenarios.length} A:{matchedAlerts.length} R:{matchedRisks.length}
                      {isExp ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {matchedScenarios.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Scenarios: </span>
                          {matchedScenarios.slice(0, 4).map((s, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38BDF8',
                            }}>
                              {s?.name || s?.title || s?.id}
                              {s?.status && (
                                <span style={{ color: '#64748b', marginLeft: 3, fontSize: 9 }}>
                                  [{s.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedScenarios.length > 4 && <span style={{ color: '#475569' }}>+{matchedScenarios.length - 4}</span>}
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
                      {matchedRisks.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Risk Signals: </span>
                          {matchedRisks.slice(0, 4).map((r, ri) => (
                            <span key={ri} style={{
                              marginRight: 5, background: 'rgba(239,68,68,0.08)',
                              border: '1px solid #ef444444', borderRadius: 3,
                              padding: '1px 5px', color: '#EF4444',
                            }}>
                              {r?.name || r?.title || r?.id}
                              {r?.severity && (
                                <span style={{ color: severityColor(r.severity), marginLeft: 3, textTransform: 'uppercase', fontSize: 9 }}>
                                  [{r.severity}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedRisks.length > 4 && <span style={{ color: '#475569' }}>+{matchedRisks.length - 4}</span>}
                        </div>
                      )}
                      {matchedScenarios.length === 0 && matchedAlerts.length === 0 && matchedRisks.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No scenario, ops alert, or risk signal — invisible operator with zero threat coverage.
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
