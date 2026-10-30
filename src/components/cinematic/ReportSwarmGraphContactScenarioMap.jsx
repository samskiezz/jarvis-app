/**
 * ReportSwarmGraphContactScenarioMap — F218
 *
 * Fetches /v1/reports + /entities/SwarmJob + /v1/graph/centrality +
 *         /entities/Contact + /v1/scenario/list
 *
 * Keyword-matches each report (title/summary/tags/source) against swarm job
 * names/descriptions, graph node labels/types, contact names/roles/orgs,
 * and scenario names/descriptions to classify:
 *
 *   ACTIVATED — report matches all 4 sources (swarm + graph + contact + scenario)
 *               (fully activated intelligence: automated, traced, owned, actionable)
 *   ACTIVE    — report matches swarm + graph + scenario (3 sources, no contact owner)
 *               (active intelligence with automation + graph trace + playbook, no owner)
 *   PARTIAL   — report matches at least 1 source but not ACTIVATED/ACTIVE
 *               (partial intelligence activation — some grounding coverage)
 *   DARK      — no match to any source
 *               (dead intelligence — report with no swarm automation, no graph trace,
 *                no contact owner, no scenario backing — intelligence dead-end)
 *
 * Toggle: ◈ RSGSMAP button (fixed, bottom strip) left:169880, zIndex:314
 * Stat tiles: reports / swarm-jobs / graph-nodes / contacts / scenarios /
 *             activated / active / partial / dark
 * Amber pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched swarm jobs with status badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched contacts with role/org +
 *                  matched scenarios with status badge.
 * Filter tabs: ALL / ACTIVATED / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rsgsmap"/"report swarm"/"report scenario map"/"intelligence activation"/
 *        "report graph contact"/"report scenario"/"dark reports"/"dead intelligence"/
 *        "report activation"/"report coverage map"/"intelligence dead end"/
 *        "activation chain"
 * Event: jarvis:rsgsmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACTIVATED', 'ACTIVE', 'PARTIAL', 'DARK'];

const CLS_COLOR = {
  ACTIVATED: '#22C55E',
  ACTIVE:    '#38BDF8',
  PARTIAL:   '#F59E0B',
  DARK:      '#F97316',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeReports(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.reports))  return raw.reports;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeSwarm(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.jobs))     return raw.jobs;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeGraph(raw) {
  const arr =
    raw?.nodes || raw?.results || raw?.data ||
    (Array.isArray(raw) ? raw : null);
  return Array.isArray(arr) ? arr : [];
}

function normalizeContacts(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.results))   return raw.results;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function normalizeScenarios(raw) {
  if (Array.isArray(raw))             return raw;
  if (Array.isArray(raw?.items))      return raw.items;
  if (Array.isArray(raw?.scenarios))  return raw.scenarios;
  if (Array.isArray(raw?.results))    return raw.results;
  if (Array.isArray(raw?.data))       return raw.data;
  return [];
}

function reportLabel(r) {
  return r?.title || r?.name || r?.id || 'Untitled';
}

function reportText(r) {
  return [r?.title, r?.name, r?.summary, r?.tags?.join?.(' '), r?.source, r?.type].join(' ');
}

function classify(report, swarmJobs, graphNodes, contacts, scenarios) {
  const rtoks = tokens(reportText(report));

  const matchedSwarm = swarmJobs.filter(j =>
    overlaps(rtoks, [j?.name, j?.description, j?.type, j?.status].join(' '))
  );
  const matchedGraph = graphNodes.filter(n =>
    overlaps(rtoks, [n?.label, n?.type, n?.name, n?.id].join(' '))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(rtoks, [c?.name, c?.role, c?.organisation, c?.org, c?.title, c?.email].join(' '))
  );
  const matchedScenarios = scenarios.filter(s =>
    overlaps(rtoks, [s?.name, s?.title, s?.description, s?.tags?.join?.(' ')].join(' '))
  );

  const hasSwarm    = matchedSwarm.length > 0;
  const hasGraph    = matchedGraph.length > 0;
  const hasContact  = matchedContacts.length > 0;
  const hasScenario = matchedScenarios.length > 0;

  let cls;
  if (hasSwarm && hasGraph && hasContact && hasScenario) {
    cls = 'ACTIVATED';
  } else if (hasSwarm && hasGraph && hasScenario && !hasContact) {
    cls = 'ACTIVE';
  } else if (hasSwarm || hasGraph || hasContact || hasScenario) {
    cls = 'PARTIAL';
  } else {
    cls = 'DARK';
  }

  return { cls, matchedSwarm, matchedGraph, matchedContacts, matchedScenarios };
}

/* ─── exported query helper ─── */
export function isRsgsmapQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'rsgsmap', 'report swarm', 'report scenario map', 'intelligence activation',
    'report graph contact', 'report scenario', 'dark reports', 'dead intelligence',
    'report activation', 'report coverage map', 'intelligence dead end',
    'activation chain',
  ].some(k => s.includes(k));
}

export function buildRsgsmapScript() {
  return (
    'Fetch /v1/reports, /entities/SwarmJob, /v1/graph/centrality, ' +
    '/entities/Contact, and /v1/scenario/list. ' +
    'Keyword-match each report (title/summary/tags/source) against ' +
    'swarm job names/descriptions, graph node labels/types, ' +
    'contact names/roles/orgs, and scenario names/descriptions. ' +
    'Classify each report as ACTIVATED (matches all 4 sources — swarm automation, ' +
    'graph trace, contact owner, and scenario — fully activated intelligence), ' +
    'ACTIVE (matches swarm + graph + scenario — 3 sources, no contact owner), ' +
    'PARTIAL (matches at least one source but not ACTIVATED or ACTIVE), ' +
    'or DARK (no match to any source — intelligence dead-end: report with no swarm ' +
    'automation, no graph trace, no contact owner, no scenario backing). ' +
    'Report total DARK count, identify which dark reports represent the highest ' +
    'intelligence risk (recent or high-priority reports with zero activation coverage), ' +
    'and recommend which swarm jobs should automate them, which graph nodes should ' +
    'trace them, which contacts should own them, and which scenarios should back them ' +
    'to eliminate these intelligence dead-ends.'
  );
}

/* ─── component ─── */
export default function ReportSwarmGraphContactScenarioMap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const [rRep, rSwarm, rGraph, rContact, rScen] = await Promise.all([
        fetch(`${API}/v1/reports`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/SwarmJob`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`, { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const reports   = normalizeReports(rRep);
      const swarmJobs = normalizeSwarm(rSwarm);
      const graphNodes = normalizeGraph(rGraph);
      const contacts  = normalizeContacts(rContact);
      const scenarios = normalizeScenarios(rScen);

      const classified = reports.map(report => ({
        report,
        ...classify(report, swarmJobs, graphNodes, contacts, scenarios),
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
    window.addEventListener('jarvis:rsgsmap-toggle', handler);
    return () => window.removeEventListener('jarvis:rsgsmap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { ACTIVATED: 0, ACTIVE: 0, PARTIAL: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return reportLabel(r.report).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildRsgsmapScript();
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
    left: 169880,
    zIndex: 314,
    background: darkPulse ? 'rgba(249,115,22,0.18)' : 'rgba(30,41,59,0.85)',
    border: `1px solid ${darkPulse ? '#F97316' : 'rgba(100,116,139,0.5)'}`,
    color: darkPulse ? '#F97316' : '#94A3B8',
    padding: '3px 9px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    borderRadius: 4,
    letterSpacing: '0.05em',
    animation: darkPulse ? 'jarvis-pulse-amber 1.6s infinite' : 'none',
  };

  const panelStyle = {
    position: 'fixed',
    bottom: 36,
    right: 18,
    width: 680,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(249,115,22,0.35)',
    borderRadius: 8,
    zIndex: 3140,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(249,115,22,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="Report × SwarmJob × Graph × Contact × Scenario Intelligence Activation Chain">
        ◈ RSGSMAP{counts.DARK > 0 ? ` [${counts.DARK}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(249,115,22,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#F97316', fontWeight: 700, fontSize: 12 }}>
              ◈ REPORT × SWARM × GRAPH × CONTACT × SCENARIO
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ color: '#64748B', fontSize: 10 }}>loading…</span>}
              <button onClick={load} style={{ background: 'none', border: '1px solid #334155', color: '#94A3B8', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}>↻</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(249,115,22,0.1)' }}>
            {[
              { label: 'REPORTS',   val: rows.length,         color: '#94A3B8' },
              { label: 'ACTIVATED', val: counts.ACTIVATED,    color: CLS_COLOR.ACTIVATED },
              { label: 'ACTIVE',    val: counts.ACTIVE,       color: CLS_COLOR.ACTIVE },
              { label: 'PARTIAL',   val: counts.PARTIAL,      color: CLS_COLOR.PARTIAL },
              { label: 'DARK',      val: counts.DARK,         color: CLS_COLOR.DARK },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center' }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#64748B', fontSize: 9, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid rgba(249,115,22,0.1)', flexWrap: 'wrap', alignItems: 'center' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(249,115,22,0.18)' : 'none',
                border: 'none',
                borderBottom: tab === t ? '2px solid #F97316' : '2px solid transparent',
                color: tab === t ? '#F97316' : '#64748B',
                padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 160 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No reports match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { report, cls, matchedSwarm, matchedGraph, matchedContacts, matchedScenarios } = item;
              const isExpanded = expanded[idx];
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer', ':hover': { background: 'rgba(255,255,255,0.03)' } }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 66, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reportLabel(report)}</span>
                    <span style={{ color: '#475569', fontSize: 9 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 14px 10px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* swarm jobs */}
                      {matchedSwarm.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SWARM JOBS ({matchedSwarm.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedSwarm.slice(0, 6).map((j, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {j?.name || j?.id || '—'} · {j?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* graph nodes */}
                      {matchedGraph.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>GRAPH NODES ({matchedGraph.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedGraph.slice(0, 6).map((n, i) => (
                              <span key={i} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {n?.label || n?.name || n?.id || '—'} · {(n?.centrality_score ?? n?.score ?? '?').toString().slice(0, 5)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* contacts */}
                      {matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>CONTACTS ({matchedContacts.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedContacts.slice(0, 6).map((c, i) => (
                              <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {c?.name || '—'} · {c?.role || c?.title || '?'} / {c?.organisation || c?.org || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* scenarios */}
                      {matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>SCENARIOS ({matchedScenarios.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedScenarios.slice(0, 6).map((s, i) => (
                              <span key={i} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {s?.name || s?.title || s?.id || '—'} · {s?.status || '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedSwarm.length === 0 && matchedGraph.length === 0 && matchedContacts.length === 0 && matchedScenarios.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No source matches — intelligence dead-end.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ASSESS footer */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(249,115,22,0.2)' }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.2)',
                border: '1px solid #F97316', color: '#F97316',
                padding: '5px 14px', fontSize: 11, cursor: assessing ? 'default' : 'pointer',
                borderRadius: 4, fontFamily: 'monospace',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS DARK REPORTS'}
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
