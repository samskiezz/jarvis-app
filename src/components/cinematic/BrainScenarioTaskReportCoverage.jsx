/**
 * BrainScenarioTaskReportCoverage — F222
 *
 * Fetches /v1/cinematic/brain + /v1/scenario/list +
 *         /entities/Task + /v1/reports
 *
 * Keyword-matches each brain node (label/name/type/entity_type) against
 * scenario names/descriptions, task titles/descriptions, and report titles/tags
 * to classify:
 *
 *   COMMANDED — matches all 3 sources (scenario + task + report)
 *               (fully operationalised brain node: scripted, tasked, and reported)
 *   ACTIVE    — matches 2 of 3 sources
 *               (brain node has partial operational coverage)
 *   PARTIAL   — matches exactly 1 source
 *               (brain node minimally referenced — only scenario, task, or report)
 *   DARK      — no match to any source
 *               (brain node with no scenario playbook, no active task, no filed report)
 *
 * Toggle: ◈ BSTRC button (fixed, bottom strip) left:172120, zIndex:318
 * Stat tiles: nodes / scenarios / tasks / reports /
 *             commanded / active / partial / dark
 * Red pulse on DARK count (unoperationalised brain nodes).
 * Expandable rows: matched scenarios with status badge +
 *                  matched tasks with status badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / COMMANDED / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "bstrc"/"brain scenario task"/"brain coverage"/"brain report"/
 *        "brain task coverage"/"dark brain node"/"unoperationalised brain"/
 *        "brain command coverage"/"brain scenario coverage"/"brain report coverage"
 * Event: jarvis:bstrc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDED', 'ACTIVE', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  COMMANDED: '#22C55E',
  ACTIVE:    '#38BDF8',
  PARTIAL:   '#F59E0B',
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

function normalizeBrain(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.nodes))     return raw.nodes;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normalizeTasks(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.tasks))    return raw.tasks;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeReports(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.reports))    return raw.reports;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function nodeLabel(n) {
  return n?.label || n?.name || n?.id || 'Untitled';
}

function nodeText(n) {
  return [n?.label, n?.name, n?.type, n?.entity_type, n?.description, n?.category].join(' ');
}

function classify(node, scenarios, tasks, reports) {
  const ntoks = tokens(nodeText(node));

  const matchedScenarios = scenarios.filter(sc =>
    overlaps(ntoks, [sc?.name, sc?.title, sc?.description, sc?.objective, sc?.tags?.join?.(' ')].join(' '))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(ntoks, [t?.title, t?.name, t?.description, t?.type, t?.tags?.join?.(' ')].join(' '))
  );
  const matchedReports = reports.filter(r =>
    overlaps(ntoks, [r?.title, r?.name, r?.description, r?.tags?.join?.(' '), r?.category, r?.type].join(' '))
  );

  const hasSc  = matchedScenarios.length > 0;
  const hasTk  = matchedTasks.length > 0;
  const hasRp  = matchedReports.length > 0;
  const srcCnt = [hasSc, hasTk, hasRp].filter(Boolean).length;

  let cls;
  if (srcCnt === 3) cls = 'COMMANDED';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'PARTIAL';
  else cls = 'DARK';

  return { cls, matchedScenarios, matchedTasks, matchedReports };
}

/* ─── exported query helper ─── */
export function isBstrcQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'bstrc', 'brain scenario task', 'brain coverage', 'brain report',
    'brain task coverage', 'dark brain node', 'unoperationalised brain',
    'brain command coverage', 'brain scenario coverage', 'brain report coverage',
  ].some(k => s.includes(k));
}

export function buildBstrcScript() {
  return (
    'Fetch /v1/cinematic/brain (nodes), /v1/scenario/list, ' +
    '/entities/Task, and /v1/reports. ' +
    'Keyword-match each brain node (label/name/type/entity_type) against ' +
    'scenario names/descriptions, task titles/descriptions, and report titles/tags. ' +
    'Classify each brain node as COMMANDED (matches scenario + task + report — ' +
    'fully operationalised: scripted in a playbook, tasked, and reported on), ' +
    'ACTIVE (matches 2 of 3 sources — partial operational coverage), ' +
    'PARTIAL (matches exactly 1 source — minimally referenced), ' +
    'or DARK (no match to any source — brain node with no scenario playbook, ' +
    'no active task, no filed report — fully unoperationalised intelligence node). ' +
    'Report the total DARK count, identify which dark brain nodes represent the highest ' +
    'operational risk (high centrality nodes with no coverage), ' +
    'and recommend which scenarios should be created to operationalise them, ' +
    'which tasks should be assigned, ' +
    'and which reports should be filed as evidence.'
  );
}

/* ─── component ─── */
export default function BrainScenarioTaskReportCoverage() {
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
      const [rBr, rSc, rTk, rRp] = await Promise.all([
        fetch(`${API}/v1/cinematic/brain`,  { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`,    { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Task`,       { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/reports`,          { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const brainNodes = normalizeBrain(rBr);
      const scenarios  = normalizeScenarios(rSc);
      const tasks      = normalizeTasks(rTk);
      const reports    = normalizeReports(rRp);

      const classified = brainNodes.map(node => ({
        node,
        ...classify(node, scenarios, tasks, reports),
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
    window.addEventListener('jarvis:bstrc-toggle', handler);
    return () => window.removeEventListener('jarvis:bstrc-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { COMMANDED: 0, ACTIVE: 0, PARTIAL: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return nodeLabel(r.node).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildBstrcScript();
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

  const darkPulse = counts.DARK > 0;

  const btnStyle = {
    position: 'fixed',
    bottom: 8,
    left: 172120,
    zIndex: 318,
    background: darkPulse ? 'rgba(239,68,68,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${darkPulse ? '#EF4444' : 'rgba(100,116,139,0.5)'}`,
    color: darkPulse ? '#EF4444' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: darkPulse ? 'jarvis-pulse-red 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 680,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    zIndex: 3180,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Brain × Scenario × Task × Report Coverage Chain">
        ◈ BSTRC{counts.DARK > 0 ? ` [${counts.DARK}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ BRAIN × SCENARIO × TASK × REPORT — COVERAGE CHAIN
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
              { label: 'NODES',     val: rows.length,          color: '#94A3B8' },
              { label: 'COMMANDED', val: counts.COMMANDED,     color: CLS_COLOR.COMMANDED },
              { label: 'ACTIVE',    val: counts.ACTIVE,        color: CLS_COLOR.ACTIVE },
              { label: 'PARTIAL',   val: counts.PARTIAL,       color: CLS_COLOR.PARTIAL },
              { label: 'DARK',      val: counts.DARK,          color: CLS_COLOR.DARK },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 90, textAlign: 'center' }}>
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
              placeholder="search nodes…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 170 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No nodes match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { node, cls, matchedScenarios, matchedTasks, matchedReports } = item;
              const isExpanded = expanded[idx];
              const nodeType = node?.type || node?.entity_type;
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 80, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeLabel(node)}</span>
                    {nodeType && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{nodeType}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* scenarios */}
                      {matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedScenarios.slice(0, 6).map((sc, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {sc?.name || sc?.title || sc?.id || '—'} · {sc?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* tasks */}
                      {matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>TASKS ({matchedTasks.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedTasks.slice(0, 6).map((t, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {t?.title || t?.name || t?.id || '—'} · {t?.status || '?'}
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
                            {matchedReports.slice(0, 6).map((rp, i) => (
                              <span key={i} style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', color: '#FB923C', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {rp?.title || rp?.name || rp?.id || '—'}{rp?.date || rp?.created_at ? ` · ${(rp.date || rp.created_at || '').slice(0, 10)}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedScenarios.length === 0 && matchedTasks.length === 0 && matchedReports.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No coverage — fully unoperationalised brain node.</div>
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
              {assessing ? 'Assessing…' : '▶ ASSESS DARK NODES'}
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
