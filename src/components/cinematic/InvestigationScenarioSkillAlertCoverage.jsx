/**
 * InvestigationScenarioSkillAlertCoverage — F240
 *
 * Fetches /v1/investigations + /v1/scenario/list +
 *         /v1/aip/skill + /v1/ops/alerts
 *
 * Keyword-matches each investigation (title/description/status)
 * against scenario titles/descriptions,
 * skill titles/descriptions,
 * and ops alert titles/descriptions to classify:
 *
 *   COVERED  — matches all 3 sources
 *              (investigation has scenario playbook, skill support, AND ops alert)
 *   SCRIPTED — matches 2 of 3 sources
 *   SKILLED  — matches exactly 1 source
 *   EXPOSED  — no match to any source
 *              (fully undefended open cases — no playbook,
 *               no skill coverage, no monitoring)
 *
 * Toggle: ◈ ISSCRC button (fixed, bottom strip) left:182200, zIndex:336
 * Stat tiles: investigations / scenarios / skills / alerts /
 *             covered / scripted / skilled / exposed
 * Red pulse on EXPOSED count (undefended open cases).
 * Expandable rows: matched scenarios with status badge +
 *                  matched skills with score badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / COVERED / SCRIPTED / SKILLED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "isscrc"/"investigation coverage"/"investigation scenario skill"/
 *        "exposed investigation"/"case coverage"/"active case response"/
 *        "investigation alert"/"case response coverage"
 * Event: jarvis:isscrc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'SCRIPTED', 'SKILLED', 'EXPOSED'];

const CLS_COLOR = {
  COVERED:  '#22C55E',
  SCRIPTED: '#38BDF8',
  SKILLED:  '#F59E0B',
  EXPOSED:  '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                        return raw;
  if (Array.isArray(raw?.investigations))        return raw.investigations;
  if (Array.isArray(raw?.data))                  return raw.data;
  if (Array.isArray(raw?.results))               return raw.results;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))                        return raw;
  if (Array.isArray(raw?.scenarios))             return raw.scenarios;
  if (Array.isArray(raw?.data))                  return raw.data;
  if (Array.isArray(raw?.results))               return raw.results;
  return [];
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))                        return raw;
  if (Array.isArray(raw?.skills))                return raw.skills;
  if (Array.isArray(raw?.data))                  return raw.data;
  if (Array.isArray(raw?.results))               return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                        return raw;
  if (Array.isArray(raw?.alerts))                return raw.alerts;
  if (Array.isArray(raw?.ops_alerts))            return raw.ops_alerts;
  if (Array.isArray(raw?.data))                  return raw.data;
  if (Array.isArray(raw?.results))               return raw.results;
  return [];
}

function investigationText(inv) {
  return [inv?.title, inv?.name, inv?.description, inv?.summary, inv?.status, inv?.type].join(' ');
}

function scenarioText(s) {
  return [s?.title, s?.name, s?.description, s?.objective, s?.type].join(' ');
}

function skillText(s) {
  return [s?.title, s?.name, s?.description, s?.category, s?.domain].join(' ');
}

function alertText(a) {
  return [a?.title, a?.message, a?.description, a?.alert_type, a?.source].join(' ');
}

function classify(inv, scenarios, skills, alerts) {
  const itoks = tokens(investigationText(inv));
  const matchedScenarios = scenarios.filter(s => overlaps(itoks, scenarioText(s)));
  const matchedSkills    = skills.filter(s    => overlaps(itoks, skillText(s)));
  const matchedAlerts    = alerts.filter(a    => overlaps(itoks, alertText(a)));
  const hasSc = matchedScenarios.length > 0;
  const hasSk = matchedSkills.length > 0;
  const hasAl = matchedAlerts.length > 0;
  const srcCnt = [hasSc, hasSk, hasAl].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'COVERED';
  else if (srcCnt === 2) cls = 'SCRIPTED';
  else if (srcCnt === 1) cls = 'SKILLED';
  else                   cls = 'EXPOSED';
  return { cls, matchedScenarios, matchedSkills, matchedAlerts };
}

export function isIsscrcQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('isscrc') ||
    s.includes('investigation coverage') ||
    s.includes('investigation scenario skill') ||
    s.includes('exposed investigation') ||
    s.includes('case coverage') ||
    s.includes('active case response') ||
    s.includes('investigation alert') ||
    s.includes('case response coverage') ||
    s.includes('investigation response') ||
    s.includes('undefended case') ||
    s.includes('case skill') ||
    s.includes('open case response')
  );
}

export function buildIsscrcScript(counts) {
  return `Analyse the JARVIS Investigation × Scenario × Skill × Ops Alert Active Case Response Coverage.
Total investigations: ${counts.total}. Covered (all 3 sources): ${counts.covered}. Scripted (2 sources): ${counts.scripted}. Skilled (1 source): ${counts.skilled}. Exposed (no source): ${counts.exposed}.
Focus on the ${counts.exposed} exposed investigations — fully undefended open cases with no scenario playbook, no matching skill, and no ops alert monitoring.
Identify the highest-priority exposed investigations and propose response actions: link to a scenario playbook, assign a supporting skill, or create a covering ops alert.`;
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

export default function InvestigationScenarioSkillAlertCoverage() {
  const [open, setOpen]                 = useState(false);
  const [investigations, setInvs]       = useState([]);
  const [scenarios, setScenarios]       = useState([]);
  const [skills, setSkills]             = useState([]);
  const [alerts, setAlerts]             = useState([]);
  const [classified, setClass]          = useState([]);
  const [loading, setLoading]           = useState(false);
  const [err, setErr]                   = useState('');
  const [tab, setTab]                   = useState('ALL');
  const [search, setSearch]             = useState('');
  const [expanded, setExpanded]         = useState({});
  const [assessing, setAssessing]       = useState(false);
  const [assessment, setAssess]         = useState('');
  const timerRef                        = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iRaw, scRaw, skRaw, aRaw] = await Promise.all([
        safeFetch(`${apiBase()}/v1/investigations`),
        safeFetch(`${apiBase()}/v1/scenario/list`),
        safeFetch(`${apiBase()}/v1/aip/skill`),
        safeFetch(`${apiBase()}/v1/ops/alerts`),
      ]);
      const iArr  = normalizeInvestigations(iRaw);
      const scArr = normalizeScenarios(scRaw);
      const skArr = normalizeSkills(skRaw);
      const aArr  = normalizeAlerts(aRaw);
      setInvs(iArr);
      setScenarios(scArr);
      setSkills(skArr);
      setAlerts(aArr);
      setClass(iArr.map(inv => ({ inv, ...classify(inv, scArr, skArr, aArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:isscrc-toggle', handler);
    return () => window.removeEventListener('jarvis:isscrc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:    classified.length,
    covered:  classified.filter(c => c.cls === 'COVERED').length,
    scripted: classified.filter(c => c.cls === 'SCRIPTED').length,
    skilled:  classified.filter(c => c.cls === 'SKILLED').length,
    exposed:  classified.filter(c => c.cls === 'EXPOSED').length,
  };

  const visible = classified.filter(c => {
    if (tab !== 'ALL' && c.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return investigationText(c.inv).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildIsscrcScript(counts);
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

  const exposedPulse = counts.exposed > 0;

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10336,
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
    if (v === 'open' || v === 'active') return '#38BDF8';
    if (v === 'closed')                 return '#22C55E';
    if (v === 'pending')                return '#F59E0B';
    return '#64748b';
  };

  const sevColor = s => {
    const v = (s || '').toLowerCase();
    if (v === 'critical') return '#EF4444';
    if (v === 'high')     return '#F97316';
    if (v === 'medium')   return '#F59E0B';
    return '#38BDF8';
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 8, left: 182200, zIndex: 336,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: exposedPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: exposedPulse ? '0 0 6px #EF444488' : 'none',
          animation: exposedPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ ISSCRC</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ INVESTIGATION × SCENARIO × SKILL × OPS ALERT — ACTIVE CASE RESPONSE COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {investigations.length} investigations · {scenarios.length} scenarios · {skills.length} skills · {alerts.length} alerts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('CASES',     counts.total,     '#94a3b8')}
            {tile('SCENARIOS', scenarios.length, '#64748b')}
            {tile('SKILLS',    skills.length,    '#64748b')}
            {tile('ALERTS',    alerts.length,    '#64748b')}
            {tile('COVERED',   counts.covered,   '#22C55E')}
            {tile('SCRIPTED',  counts.scripted,  '#38BDF8')}
            {tile('SKILLED',   counts.skilled,   '#F59E0B')}
            {tile('EXPOSED',   counts.exposed,   '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investigations…"
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
              const { inv, cls, matchedScenarios, matchedSkills, matchedAlerts } = item;
              const id = inv?.id ?? inv?.title ?? i;
              const isExpanded = !!expanded[id];
              return (
                <div key={id} style={{
                  borderBottom: '1px solid #1e2a3a',
                  padding: '7px 0',
                }}>
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
                      {inv?.title || inv?.name || inv?.id || '—'}
                    </span>
                    {inv?.status && (
                      <span style={{
                        fontSize: 10, color: statusColor(inv.status),
                        background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px',
                        textTransform: 'uppercase',
                      }}>
                        {inv.status}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      Sc:{matchedScenarios.length} Sk:{matchedSkills.length} A:{matchedAlerts.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {inv?.description && (
                        <div style={{ color: '#94a3b8', marginBottom: 6 }}>{inv.description}</div>
                      )}
                      {matchedScenarios.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Scenarios: </span>
                          {matchedScenarios.slice(0, 4).map((sc, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38bdf8',
                            }}>
                              {sc?.title || sc?.name || sc?.id}
                              {sc?.status && (
                                <span style={{ color: '#64748b', marginLeft: 3, textTransform: 'uppercase', fontSize: 9 }}>
                                  [{sc.status}]
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedScenarios.length > 4 && <span style={{ color: '#475569' }}>+{matchedScenarios.length - 4}</span>}
                        </div>
                      )}
                      {matchedSkills.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Skills: </span>
                          {matchedSkills.slice(0, 4).map((sk, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.1)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22c55e',
                            }}>
                              {sk?.title || sk?.name || sk?.id}
                              {(sk?.score != null || sk?.relevance != null) && (
                                <span style={{ color: '#64748b', marginLeft: 3 }}>
                                  {Number(sk?.score ?? sk?.relevance ?? 0).toFixed(1)}
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedSkills.length > 4 && <span style={{ color: '#475569' }}>+{matchedSkills.length - 4}</span>}
                        </div>
                      )}
                      {matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Ops alerts: </span>
                          {matchedAlerts.slice(0, 4).map((a, ai) => (
                            <span key={ai} style={{
                              marginRight: 5, background: 'rgba(239,68,68,0.08)',
                              border: `1px solid ${sevColor(a?.severity)}44`, borderRadius: 3,
                              padding: '1px 5px', color: sevColor(a?.severity),
                            }}>
                              {a?.title || a?.message || a?.id}
                              {a?.severity && (
                                <span style={{ marginLeft: 3, textTransform: 'uppercase', fontSize: 9 }}>[{a.severity}]</span>
                              )}
                            </span>
                          ))}
                          {matchedAlerts.length > 4 && <span style={{ color: '#475569' }}>+{matchedAlerts.length - 4}</span>}
                        </div>
                      )}
                      {matchedScenarios.length === 0 && matchedSkills.length === 0 && matchedAlerts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No scenario, skill, or ops alert matched — fully undefended case.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>
                No investigations match the current filter.
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
