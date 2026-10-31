/**
 * RiskSignalTaskKnowledgeReportCoverage — F230
 *
 * Fetches /entities/RiskSignal + /entities/Task +
 *         /knowledge/ + /v1/reports
 *
 * Keyword-matches each risk signal (title/description/category/severity) against
 * task names/descriptions, knowledge article titles/summaries, and report titles
 * to classify:
 *
 *   COVERED   — matches all 3 sources (task + knowledge + report)
 *               (fully documented and actioned threat: has a task, a knowledge article, and a report)
 *   ACTIONED  — matches 2 of 3 sources
 *               (partially grounded threat with some evidence trail)
 *   TRACKED   — matches 1 source only
 *               (minimal coverage: only one evidence dimension)
 *   EXPOSED   — no match to any source
 *               (fully ungrounded threat signal: no task, no knowledge, no report)
 *
 * Toggle: ◈ RSTKRC button (fixed, bottom strip) left:176600, zIndex:326
 * Stat tiles: risk signals / tasks / knowledge articles / reports /
 *             covered / actioned / tracked / exposed
 * Red pulse on EXPOSED count (fully ungrounded threats).
 * Expandable rows: matched tasks with status badge +
 *                  matched knowledge articles with category badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / COVERED / ACTIONED / TRACKED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rstkrc"/"threat response coverage"/"risk task knowledge"/"risk evidence"/
 *        "exposed risk signal"/"risk report"/"threat knowledge gap"/"risk coverage"/
 *        "ungrounded threat"/"threat evidence gap"
 * Event: jarvis:rstkrc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'ACTIONED', 'TRACKED', 'EXPOSED'];

const CLS_COLOR = {
  COVERED:  '#22C55E',
  ACTIONED: '#38BDF8',
  TRACKED:  '#A78BFA',
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

function normalizeRisks(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.items))         return raw.items;
  if (Array.isArray(raw?.risk_signals))  return raw.risk_signals;
  if (Array.isArray(raw?.signals))       return raw.signals;
  if (Array.isArray(raw?.results))       return raw.results;
  if (Array.isArray(raw?.data))          return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.tasks))   return raw.tasks;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.data))    return raw.data;
  return [];
}

function normalizeKnowledge(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.knowledge))   return raw.knowledge;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeReports(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.reports))  return raw.reports;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function riskLabel(r) {
  return r?.title || r?.name || r?.signal_type || r?.id || 'Untitled';
}

function riskText(r) {
  return [r?.title, r?.name, r?.description, r?.category, r?.signal_type, r?.severity, r?.tags?.join?.(' ')].join(' ');
}

function classify(risk, tasks, knowledge, reports) {
  const rtoks = tokens(riskText(risk));

  const matchedTasks = tasks.filter(t =>
    overlaps(rtoks, [t?.name, t?.title, t?.description, t?.tags?.join?.(' ')].join(' '))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(rtoks, [k?.title, k?.name, k?.summary, k?.content, k?.category, k?.tags?.join?.(' ')].join(' '))
  );
  const matchedReports = reports.filter(rep =>
    overlaps(rtoks, [rep?.title, rep?.name, rep?.summary, rep?.description, rep?.tags?.join?.(' ')].join(' '))
  );

  const srcCount = [matchedTasks.length > 0, matchedKnowledge.length > 0, matchedReports.length > 0].filter(Boolean).length;

  let cls;
  if (srcCount === 3)      cls = 'COVERED';
  else if (srcCount === 2) cls = 'ACTIONED';
  else if (srcCount === 1) cls = 'TRACKED';
  else                     cls = 'EXPOSED';

  return { cls, matchedTasks, matchedKnowledge, matchedReports };
}

/* ─── exported query helpers ─── */
export function isRstkrcQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'rstkrc', 'threat response coverage', 'risk task knowledge', 'risk evidence',
    'exposed risk signal', 'risk report', 'threat knowledge gap', 'risk coverage',
    'ungrounded threat', 'threat evidence gap',
  ].some(k => s.includes(k));
}

export function buildRstkrcScript() {
  return (
    'Fetch /entities/RiskSignal, /entities/Task, /knowledge/, and /v1/reports. ' +
    'Keyword-match each risk signal (title/description/category/severity) against ' +
    'task names/descriptions, knowledge article titles/summaries, and report titles. ' +
    'Classify each risk signal as COVERED (matches task + knowledge + report — ' +
    'fully documented and actioned threat with a task, a knowledge article, and a report), ' +
    'ACTIONED (matches 2 of 3 sources — partially grounded threat with some evidence trail), ' +
    'TRACKED (matches 1 source only — minimal coverage with only one evidence dimension), ' +
    'or EXPOSED (no match to any source — fully ungrounded threat signal). ' +
    'Report the total EXPOSED count, identify which exposed risk signals represent the highest ' +
    'threat risk (e.g. critical/high severity, unmonitored signal types, or long-standing signals), ' +
    'and recommend which tasks should reference them, ' +
    'which knowledge articles should be created to document them, ' +
    'and which reports should capture their status.'
  );
}

/* ─── component ─── */
export default function RiskSignalTaskKnowledgeReportCoverage() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing]   = useState(false);
  const timerRef                    = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const [rRisk, rTask, rKnow, rRep] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Task`,       { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/knowledge/`,          { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/reports`,          { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const risks     = normalizeRisks(rRisk);
      const tasks     = normalizeTasks(rTask);
      const knowledge = normalizeKnowledge(rKnow);
      const reports   = normalizeReports(rRep);

      const classified = risks.map(risk => ({
        risk,
        ...classify(risk, tasks, knowledge, reports),
      }));

      setRows(classified);
    } catch (_) {
      // network error — leave existing rows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:rstkrc-toggle', handler);
    return () => window.removeEventListener('jarvis:rstkrc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { COVERED: 0, ACTIONED: 0, TRACKED: 0, EXPOSED: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return riskLabel(r.risk).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildRstkrcScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      setAssessment(txt);
      if (txt) {
        try {
          await fetch(`${API}/v1/voice/tts`, {
            method: 'POST', headers: h,
            body: JSON.stringify({ text: txt.slice(0, 400) }),
          });
        } catch (_) {}
      }
    } catch (_) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const exposedPulse = counts.EXPOSED > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 176600,
    zIndex: 326,
    background: exposedPulse ? 'rgba(239,68,68,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${exposedPulse ? '#EF4444' : 'rgba(100,116,139,0.5)'}`,
    color: exposedPulse ? '#EF4444' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: exposedPulse ? 'jarvis-pulse-red 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 700,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    zIndex: 3260,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="RiskSignal × Task × Knowledge × Report Threat Response Evidence Coverage">
        ◈ RSTKRC{counts.EXPOSED > 0 ? ` [${counts.EXPOSED}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ RISK × TASK × KNOWLEDGE × REPORT
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
            {[
              { label: 'RISK SIGNALS', val: rows.length,        color: '#94A3B8' },
              { label: 'COVERED',      val: counts.COVERED,     color: CLS_COLOR.COVERED },
              { label: 'ACTIONED',     val: counts.ACTIONED,    color: CLS_COLOR.ACTIONED },
              { label: 'TRACKED',      val: counts.TRACKED,     color: CLS_COLOR.TRACKED },
              { label: 'EXPOSED',      val: counts.EXPOSED,     color: CLS_COLOR.EXPOSED },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 88, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(239,68,68,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(239,68,68,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #EF4444' : '2px solid transparent',
                color: tab === t ? '#EF4444' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search risk signals…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 180 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No risk signals match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { risk, cls, matchedTasks, matchedKnowledge, matchedReports } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 72, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{riskLabel(risk)}</span>
                    {risk?.severity && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{risk.severity}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* tasks */}
                      {matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>TASKS ({matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedTasks.slice(0, 6).map((t, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.name || t?.title || t?.id || '—'} · {t?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* knowledge */}
                      {matchedKnowledge.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>KNOWLEDGE ({matchedKnowledge.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedKnowledge.slice(0, 6).map((k, i) => (
                              <span key={i} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {k?.title || k?.name || k?.id || '—'} · {k?.category || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* reports */}
                      {matchedReports.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>REPORTS ({matchedReports.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedReports.slice(0, 6).map((rep, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {rep?.title || rep?.name || rep?.id || '—'} · {rep?.date || rep?.created_at?.slice?.(0,10) || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedTasks.length === 0 && matchedKnowledge.length === 0 && matchedReports.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — fully exposed threat signal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.2)',
                border: '1px solid #EF4444', color: '#EF4444',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS EXPOSED RISK SIGNALS'}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
