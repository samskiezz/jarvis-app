/**
 * IntelProfileDatasetOpsGraphReportCommand — F131
 *
 * 5-source intelligence command coverage.
 * Fetches /entities/IntelProfile + /v1/datasets + /v1/ops/alerts
 *         + /v1/graph/centrality + /v1/reports
 *
 * Keyword-matches each intel profile against datasets, ops alerts,
 * graph centrality nodes, and reports to classify command coverage:
 *
 *   COMMANDING — matches all 4+ other sources
 *                (fully active intel: owned data, active alert, graph trace, filed report)
 *   ACTIVE     — matches 3 other sources
 *                (operationally active with partial coverage)
 *   PARTIAL    — matches 1–2 other sources
 *                (some grounding but coverage gaps remain)
 *   DORMANT    — no match to any source
 *                (dead intel — no data source, no alert, no graph trace, no report)
 *
 * Toggle: ◈ IDOAGR button (fixed, bottom strip) left:121720, zIndex:228
 * Stat tiles: profiles / datasets / alerts / graph-nodes / reports /
 *             commanding / active / partial / dormant
 * Red pulse on DORMANT count (dead intelligence profiles).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched ops alerts with severity badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / COMMANDING / ACTIVE / PARTIAL / DORMANT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "idoagr"/"intel command"/"intel coverage command"
 *        "intel profile dataset"/"intel profile ops"/"intel profile graph report"
 *        "dormant intel"/"dead intel"/"intel dormant"
 *        "intelligence command coverage"/"intel command audit"/"intel grounding"
 *        "intel ops alert"/"intel signal report"/"intel graph command"
 *        "intel commanding"/"commanding intel"/"intel coverage audit"
 * Event: jarvis:idoagr-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMMANDING', 'ACTIVE', 'PARTIAL', 'DORMANT'];

const CLS_COLOR = {
  COMMANDING: '#22C55E',
  ACTIVE:     '#3B82F6',
  PARTIAL:    '#F59E0B',
  DORMANT:    '#EF4444',
};

export function isIdoagrQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'idoagr', 'intel command', 'intel coverage command',
    'intel profile dataset', 'intel profile ops', 'intel profile graph report',
    'dormant intel', 'dead intel', 'intel dormant',
    'intelligence command coverage', 'intel command audit', 'intel grounding',
    'intel ops alert', 'intel signal report', 'intel graph command',
    'intel commanding', 'commanding intel', 'intel coverage audit',
    'intel profile coverage', 'intel profile command', 'intel 5 source',
    'intel full coverage', 'intel command nexus', 'intel coverage map',
  ].some(kw => s.includes(kw));
}

export function buildIdoagrScript(q) {
  return `JARVIS intel profile command coverage audit triggered by: "${q}". Fetch /entities/IntelProfile + /v1/datasets + /v1/ops/alerts + /v1/graph/centrality + /v1/reports. Classify each intel profile as COMMANDING/ACTIVE/PARTIAL/DORMANT. Report the DORMANT count and top 3 dead intel profiles with zero dataset source, no ops alert, no graph trace, and no filed report.`;
}

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

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function profileLabel(p) {
  return p.name || p.title || p.handle || p.profile_name || p.description?.slice(0, 60) || p.id || 'Unknown';
}

function profileTokens(p) {
  return tokens(
    `${p.name || ''} ${p.title || ''} ${p.handle || ''} ${p.profile_name || ''} ${p.description || ''} ${p.content?.slice(0, 200) || ''} ${p.category || ''} ${p.type || ''} ${p.tags ? (Array.isArray(p.tags) ? p.tags.join(' ') : p.tags) : ''} ${p.org || ''} ${p.organization || ''} ${p.topic || ''} ${p.aliases ? (Array.isArray(p.aliases) ? p.aliases.join(' ') : p.aliases) : ''}`
  );
}

function classifyProfile(p, datasets, alerts, graphNodes, reports) {
  const toks = profileTokens(p);

  const mDatasets = datasets.filter(d =>
    overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.category || ''} ${d.type || ''} ${d.tags ? (Array.isArray(d.tags) ? d.tags.join(' ') : d.tags) : ''}`)
  );
  const mAlerts = alerts.filter(al =>
    overlaps(toks, `${al.title || ''} ${al.name || ''} ${al.message || ''} ${al.description || ''} ${al.type || ''} ${al.category || ''} ${al.source || ''}`)
  );
  const mGraph = graphNodes.filter(n =>
    overlaps(toks, `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.category || ''} ${n.description || ''}`)
  );
  const mReports = reports.filter(r =>
    overlaps(toks, `${r.title || ''} ${r.name || ''} ${r.description || ''} ${r.category || ''} ${r.type || ''} ${r.summary || ''} ${r.content?.slice(0, 200) || ''}`)
  );

  const sourceCount = [mDatasets.length > 0, mAlerts.length > 0, mGraph.length > 0, mReports.length > 0].filter(Boolean).length;

  let cls;
  if (sourceCount >= 4)       cls = 'COMMANDING';
  else if (sourceCount >= 3)  cls = 'ACTIVE';
  else if (sourceCount >= 1)  cls = 'PARTIAL';
  else                        cls = 'DORMANT';

  return { p, cls, mDatasets, mAlerts, mGraph, mReports };
}

export default function IntelProfileDatasetOpsGraphReportCommand() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [err,        setErr]        = useState(null);
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState({});
  const [assessment, setAssessment] = useState('');
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const datasetCount = rows.reduce((n, r) => n + r.mDatasets.length, 0);
  const alertCount   = rows.reduce((n, r) => n + r.mAlerts.length,   0);
  const graphCount   = rows.reduce((n, r) => n + r.mGraph.length,    0);
  const reportCount  = rows.reduce((n, r) => n + r.mReports.length,  0);

  const counts = {
    COMMANDING: rows.filter(r => r.cls === 'COMMANDING').length,
    ACTIVE:     rows.filter(r => r.cls === 'ACTIVE').length,
    PARTIAL:    rows.filter(r => r.cls === 'PARTIAL').length,
    DORMANT:    rows.filter(r => r.cls === 'DORMANT').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [profileRaw, datasetRaw, alertRaw, graphRaw, reportRaw] = await Promise.all([
        fetcher('/entities/IntelProfile'),
        fetcher('/v1/datasets'),
        fetcher('/v1/ops/alerts'),
        fetcher('/v1/graph/centrality'),
        fetcher('/v1/reports'),
      ]);

      const profiles   = normalizeArray(profileRaw,  ['profiles', 'intel_profiles', 'data', 'items', 'results']);
      const datasets   = normalizeArray(datasetRaw,  ['datasets', 'data', 'items', 'results']);
      const alerts     = normalizeArray(alertRaw,    ['alerts', 'data', 'items', 'results']);
      const graphNodes = normalizeArray(graphRaw,    ['nodes', 'data', 'items', 'results']);
      const reports    = normalizeArray(reportRaw,   ['reports', 'data', 'items', 'results']);

      setRows(profiles.map(p => classifyProfile(p, datasets, alerts, graphNodes, reports)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:idoagr-toggle', handler);
    return () => window.removeEventListener('jarvis:idoagr-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return profileLabel(r.p).toLowerCase().includes(s) ||
             (r.p.category || r.p.type || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Intel profiles: ${rows.length}. Commanding: ${counts.COMMANDING}. Active: ${counts.ACTIVE}. Partial: ${counts.PARTIAL}. Dormant: ${counts.DORMANT}.`;
    const prompt = `JARVIS intel profile command coverage audit: ${summary}. Identify the most critical DORMANT intel profiles — those with no dataset source, no ops alert trigger, no graph trace, and no filed report — representing dead intelligence assets. Provide a 2-sentence advisory on the top dormant profiles and priority actions to bring them into full command coverage across datasets, ops alerts, graph, and reports.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || JSON.stringify(d);
      setAssessment(text);
      try {
        await fetch(`${API}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch (_) {}
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 121720, zIndex: 228,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ IDOAGR</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 228, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ IDOAGR</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>IntelProfile × Dataset × Ops Alert × Graph × Report — Intelligence Command Coverage (5-source)</span>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {loading ? '⟳' : '↺ refresh'}
        </button>
        <button onClick={assess} disabled={assessing || loading} style={{ background: 'none', border: '1px solid #EF444455', color: '#EF4444', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'PROFILES',   val: rows.length,          color: '#94a3b8' },
          { label: 'DATASETS',   val: datasetCount,         color: '#22D3EE' },
          { label: 'ALERTS',     val: alertCount,           color: '#F59E0B' },
          { label: 'GRAPH',      val: graphCount,           color: '#a78bfa' },
          { label: 'REPORTS',    val: reportCount,          color: '#34D399' },
          { label: 'COMMANDING', val: counts.COMMANDING,    color: CLS_COLOR.COMMANDING },
          { label: 'ACTIVE',     val: counts.ACTIVE,        color: CLS_COLOR.ACTIVE },
          { label: 'PARTIAL',    val: counts.PARTIAL,       color: CLS_COLOR.PARTIAL },
          { label: 'DORMANT',    val: counts.DORMANT,       color: CLS_COLOR.DORMANT, pulse: counts.DORMANT > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 88, textAlign: 'center',
            animation: pulse ? 'idoagr-pulse 2s ease-in-out infinite' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid #EF444444', borderRadius: 5, fontSize: 11, color: '#fca5a5', lineHeight: 1.5, flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#EF444422' : 'none',
            border: `1px solid ${tab === t ? '#EF4444' : '#1e293b'}`,
            color: tab === t ? '#EF4444' : '#64748b', borderRadius: 3,
            padding: '2px 8px', cursor: 'pointer', fontSize: 10,
          }}>{t}{t !== 'ALL' && ` (${counts[t] ?? 0})`}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {err && <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 8 }}>Error: {err}</div>}
        {loading && !rows.length && <div style={{ color: '#64748b', fontSize: 11 }}>Loading…</div>}
        {visible.map((r, i) => {
          const isExp = !!expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: 'rgba(15,23,35,0.6)', border: `1px solid ${CLS_COLOR[r.cls]}33`, borderRadius: 5, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[r.cls], flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#DCEBF5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileLabel(r.p)}
                </span>
                {r.p.category && (
                  <span style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.p.category}
                  </span>
                )}
                {r.p.type && (
                  <span style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.p.type}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#22D3EE', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, k) => (
                          <span key={k} style={{ background: '#031015', border: '1px solid #164e63', color: '#22D3EE', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {(d.row_count !== undefined || d.rows !== undefined || d.count !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(d.row_count ?? d.rows ?? d.count ?? '').toString()}r]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mAlerts.length > 0 && (
                    <div>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 3 }}>OPS ALERTS ({r.mAlerts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mAlerts.slice(0, 8).map((al, k) => (
                          <span key={k} style={{ background: '#120a00', border: '1px solid #78350f', color: '#F59E0B', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {al.title || al.name || al.message?.slice(0, 40) || al.id}
                            {(al.severity || al.level || al.priority) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{al.severity || al.level || al.priority}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraph.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#0d0820', border: '1px solid #3b0764', color: '#a78bfa', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {(n.centrality !== undefined || n.score !== undefined) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(n.centrality ?? n.score ?? '').toString().slice(0, 5)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mReports.length > 0 && (
                    <div>
                      <div style={{ color: '#34D399', fontSize: 10, marginBottom: 3 }}>REPORTS ({r.mReports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mReports.slice(0, 8).map((rep, k) => (
                          <span key={k} style={{ background: '#001008', border: '1px solid #064e3b', color: '#34D399', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {rep.title || rep.name || rep.id}
                            {(rep.date || rep.created_at || rep.published_at) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{(rep.date || rep.created_at || rep.published_at || '').toString().slice(0, 10)}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mAlerts.length === 0 && r.mGraph.length === 0 && r.mReports.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No dataset source, no ops alert, no graph trace, no filed report — dead intelligence with zero command coverage.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes idoagr-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
