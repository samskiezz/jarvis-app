/**
 * ReportGraphSkillOpsAlertCoverage — F239
 *
 * Fetches /v1/reports + /v1/graph/centrality +
 *         /v1/aip/skill + /v1/ops/alerts
 *
 * Keyword-matches each report (title/summary/tags)
 * against graph centrality node labels/entities,
 * skill titles/descriptions,
 * and ops alert titles/descriptions to classify:
 *
 *   COMMANDED — matches all 3 sources
 *               (report is graph-anchored, skill-backed, and ops-alerted)
 *   ACTIVE    — matches 2 of 3 sources
 *   PARTIAL   — matches exactly 1 source
 *   DARK      — no match to any source
 *               (intelligence dead-ends — reports with no graph trace,
 *                no skill backing, and no ops alert coverage)
 *
 * Toggle: ◈ RGSCOV button (fixed, bottom strip) left:181640, zIndex:335
 * Stat tiles: reports / graph nodes / skills / alerts /
 *             commanded / active / partial / dark
 * Red pulse on DARK count (intelligence dead-ends).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched skills with score badge +
 *                  matched ops alerts with severity badge.
 * Filter tabs: ALL / COMMANDED / ACTIVE / PARTIAL / DARK + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rgscov"/"report command"/"report graph skill"/"report intelligence"/
 *        "dark reports"/"report coverage"/"report ops alert"/"report skill graph"
 * Event: jarvis:rgscov-toggle
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

function normalizeReports(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.reports))       return raw.reports;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function normalizeGraphNodes(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.nodes))         return raw.nodes;
  if (Array.isArray(raw?.entities))      return raw.entities;
  if (Array.isArray(raw?.centrality))    return raw.centrality;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function normalizeSkills(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.skills))        return raw.skills;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function normalizeAlerts(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.alerts))        return raw.alerts;
  if (Array.isArray(raw?.ops_alerts))    return raw.ops_alerts;
  if (Array.isArray(raw?.data))          return raw.data;
  if (Array.isArray(raw?.results))       return raw.results;
  return [];
}

function reportText(r) {
  return [r?.title, r?.summary, r?.description, ...(r?.tags || [])].join(' ');
}

function graphNodeText(n) {
  return [n?.label, n?.entity, n?.name, n?.type, n?.id].join(' ');
}

function skillText(s) {
  return [s?.title, s?.name, s?.description, s?.category, s?.domain].join(' ');
}

function alertText(a) {
  return [a?.title, a?.message, a?.description, a?.alert_type, a?.source].join(' ');
}

function classify(report, graphNodes, skills, alerts) {
  const rtoks = tokens(reportText(report));
  const matchedGraph  = graphNodes.filter(n => overlaps(rtoks, graphNodeText(n)));
  const matchedSkills = skills.filter(s => overlaps(rtoks, skillText(s)));
  const matchedAlerts = alerts.filter(a => overlaps(rtoks, alertText(a)));
  const hasG = matchedGraph.length > 0;
  const hasS = matchedSkills.length > 0;
  const hasA = matchedAlerts.length > 0;
  const srcCnt = [hasG, hasS, hasA].filter(Boolean).length;
  let cls;
  if (srcCnt === 3)      cls = 'COMMANDED';
  else if (srcCnt === 2) cls = 'ACTIVE';
  else if (srcCnt === 1) cls = 'PARTIAL';
  else                   cls = 'DARK';
  return { cls, matchedGraph, matchedSkills, matchedAlerts };
}

export function isRgscovQuery(q) {
  const s = (q || '').toLowerCase();
  return (
    s.includes('rgscov') ||
    s.includes('report command') ||
    s.includes('report graph skill') ||
    s.includes('report intelligence') ||
    s.includes('dark reports') ||
    s.includes('report coverage') ||
    s.includes('report ops alert') ||
    s.includes('report skill graph') ||
    s.includes('commanded report') ||
    s.includes('report graph ops')
  );
}

export function buildRgscovScript(counts) {
  return `Analyse the JARVIS Report × Graph × Skill × Ops Alert Command Intelligence Coverage.
Total reports: ${counts.total}. Commanded (all 3 sources): ${counts.commanded}. Active (2 sources): ${counts.active}. Partial (1 source): ${counts.partial}. Dark (no source): ${counts.dark}.
Focus on the ${counts.dark} dark reports — intelligence dead-ends with no graph trace, no skill backing, and no ops alert coverage.
Identify the highest-priority dark reports and propose command actions: link to a relevant graph node, assign a supporting skill, or create a covering ops alert.`;
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

export default function ReportGraphSkillOpsAlertCoverage() {
  const [open, setOpen]           = useState(false);
  const [reports, setReports]     = useState([]);
  const [graphNodes, setGraph]    = useState([]);
  const [skills, setSkills]       = useState([]);
  const [alerts, setAlerts]       = useState([]);
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
      const [rRaw, gRaw, sRaw, aRaw] = await Promise.all([
        safeFetch(`${API}/v1/reports`),
        safeFetch(`${API}/v1/graph/centrality`),
        safeFetch(`${API}/v1/aip/skill`),
        safeFetch(`${API}/v1/ops/alerts`),
      ]);
      const rArr = normalizeReports(rRaw);
      const gArr = normalizeGraphNodes(gRaw);
      const sArr = normalizeSkills(sRaw);
      const aArr = normalizeAlerts(aRaw);
      setReports(rArr);
      setGraph(gArr);
      setSkills(sArr);
      setAlerts(aArr);
      setClass(rArr.map(r => ({ report: r, ...classify(r, gArr, sArr, aArr) })));
    } catch (e) {
      setErr(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:rgscov-toggle', handler);
    return () => window.removeEventListener('jarvis:rgscov-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    total:     classified.length,
    commanded: classified.filter(c => c.cls === 'COMMANDED').length,
    active:    classified.filter(c => c.cls === 'ACTIVE').length,
    partial:   classified.filter(c => c.cls === 'PARTIAL').length,
    dark:      classified.filter(c => c.cls === 'DARK').length,
  };

  const visible = classified.filter(c => {
    if (tab !== 'ALL' && c.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return reportText(c.report).toLowerCase().includes(s);
    }
    return true;
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true);
    setAssess('');
    try {
      const script = buildRgscovScript(counts);
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

  const panel = {
    position: 'fixed', inset: 0, zIndex: 10335,
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
          position: 'fixed', bottom: 8, left: 181640, zIndex: 335,
          background: 'rgba(10,20,40,0.85)',
          border: '1px solid #1e3a5f',
          color: darkPulse ? '#EF4444' : '#38bdf8',
          borderRadius: 4, padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', letterSpacing: 1,
          boxShadow: darkPulse ? '0 0 6px #EF444488' : 'none',
          animation: darkPulse ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
        }}
      >◈ RGSCOV</button>

      {open && (
        <div style={panel}>
          <div style={header}>
            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ REPORT × GRAPH × SKILL × OPS ALERT — COMMAND INTELLIGENCE COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              {reports.length} reports · {graphNodes.length} nodes · {skills.length} skills · {alerts.length} alerts
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none', color: '#64748b',
              fontSize: 16, cursor: 'pointer', marginLeft: 8,
            }}>✕</button>
          </div>

          <div style={tileRow}>
            {tile('REPORTS',    counts.total,     '#94a3b8')}
            {tile('GRAPH',      graphNodes.length,'#64748b')}
            {tile('SKILLS',     skills.length,    '#64748b')}
            {tile('ALERTS',     alerts.length,    '#64748b')}
            {tile('COMMANDED',  counts.commanded, '#22C55E')}
            {tile('ACTIVE',     counts.active,    '#38BDF8')}
            {tile('PARTIAL',    counts.partial,   '#F59E0B')}
            {tile('DARK',       counts.dark,      '#EF4444')}
          </div>

          <div style={tabRow}>
            {TABS.map(tabBtn)}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
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
              const { report, cls, matchedGraph, matchedSkills, matchedAlerts } = item;
              const id = report?.id ?? report?.title ?? i;
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
                      borderRadius: 3, padding: '1px 6px', minWidth: 80, textAlign: 'center',
                    }}>{cls}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>
                      {report?.title || report?.id || '—'}
                    </span>
                    {report?.date && (
                      <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.05)', borderRadius: 3, padding: '1px 5px' }}>
                        {report.date}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 4 }}>
                      G:{matchedGraph.length} S:{matchedSkills.length} A:{matchedAlerts.length}
                      {isExpanded ? ' ▲' : ' ▼'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 6, paddingLeft: 12, fontSize: 11 }}>
                      {report?.summary && (
                        <div style={{ color: '#94a3b8', marginBottom: 6 }}>{report.summary}</div>
                      )}
                      {matchedGraph.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Graph nodes: </span>
                          {matchedGraph.slice(0, 5).map((n, ni) => (
                            <span key={ni} style={{
                              marginRight: 5, background: 'rgba(56,189,248,0.1)',
                              border: '1px solid #38bdf844', borderRadius: 3,
                              padding: '1px 5px', color: '#38bdf8',
                            }}>
                              {n?.label || n?.entity || n?.name || n?.id}
                              {n?.centrality_score != null && (
                                <span style={{ color: '#64748b', marginLeft: 3 }}>
                                  {Number(n.centrality_score).toFixed(2)}
                                </span>
                              )}
                            </span>
                          ))}
                          {matchedGraph.length > 5 && <span style={{ color: '#475569' }}>+{matchedGraph.length - 5}</span>}
                        </div>
                      )}
                      {matchedSkills.length > 0 && (
                        <div style={{ marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>Skills: </span>
                          {matchedSkills.slice(0, 4).map((s, si) => (
                            <span key={si} style={{
                              marginRight: 5, background: 'rgba(34,197,94,0.1)',
                              border: '1px solid #22c55e44', borderRadius: 3,
                              padding: '1px 5px', color: '#22c55e',
                            }}>
                              {s?.title || s?.name || s?.id}
                              {(s?.score != null || s?.relevance != null) && (
                                <span style={{ color: '#64748b', marginLeft: 3 }}>
                                  {Number(s?.score ?? s?.relevance ?? 0).toFixed(1)}
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
                      {matchedGraph.length === 0 && matchedSkills.length === 0 && matchedAlerts.length === 0 && (
                        <div style={{ color: '#EF4444', fontStyle: 'italic' }}>
                          No graph node, skill, or ops alert matched — intelligence dead-end.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '20px 0', color: '#475569', fontSize: 12 }}>No reports match the current filter.</div>
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
