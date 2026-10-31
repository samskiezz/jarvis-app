/**
 * RiskSignalScenarioGraphDatasetLandscape — F221
 *
 * Fetches /entities/RiskSignal + /v1/scenario/list +
 *         /v1/graph/centrality + /v1/datasets
 *
 * Keyword-matches each risk signal (title/description/type/category) against
 * scenario names/descriptions, graph node labels, and dataset names/tags to classify:
 *
 *   COVERED  — matches all 3 sources (scenario + graph + dataset)
 *              (fully mapped threat: scripted in playbook, graphed, data-backed)
 *   PARTIAL  — matches 2 of 3 sources
 *              (threat has partial landscape coverage)
 *   TRACED   — matches exactly 1 source
 *              (threat is minimally mapped — only scenario, graph, or dataset)
 *   EXPOSED  — no match to any source
 *              (unmapped threat — no playbook, no graph node, no data source)
 *
 * Toggle: ◈ THLMAP button (fixed, bottom strip) left:171560, zIndex:317
 * Stat tiles: signals / scenarios / graph nodes / datasets /
 *             covered / partial / traced / exposed
 * Red pulse on EXPOSED count (fully unmapped threats).
 * Expandable rows: matched scenarios with status badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched datasets with row-count badge.
 * Filter tabs: ALL / COVERED / PARTIAL / TRACED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "thlmap"/"threat landscape"/"risk landscape"/"risk coverage map"/
 *        "unmapped threat"/"exposed risk"/"threat graph"/"risk graph map"/
 *        "risk scenario graph"/"threat dataset"/"threat blind spot"
 * Event: jarvis:thlmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COVERED', 'PARTIAL', 'TRACED', 'EXPOSED'];

const CLS_COLOR = {
  COVERED: '#22C55E',
  PARTIAL: '#38BDF8',
  TRACED:  '#F59E0B',
  EXPOSED: '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeRiskSignals(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.items))         return raw.items;
  if (Array.isArray(raw?.risk_signals))  return raw.risk_signals;
  if (Array.isArray(raw?.signals))       return raw.signals;
  if (Array.isArray(raw?.results))       return raw.results;
  if (Array.isArray(raw?.data))          return raw.data;
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

function normalizeGraph(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.nodes))    return raw.nodes;
  if (Array.isArray(raw?.results))  return raw.results;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normalizeDatasets(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.datasets))    return raw.datasets;
  if (Array.isArray(raw?.results))     return raw.results;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function rsLabel(rs) {
  return rs?.title || rs?.name || rs?.id || 'Untitled';
}

function rsText(rs) {
  return [rs?.title, rs?.name, rs?.description, rs?.type, rs?.category, rs?.source].join(' ');
}

function classify(rs, scenarios, graphNodes, datasets) {
  const rtoks = tokens(rsText(rs));

  const matchedScenarios = scenarios.filter(sc =>
    overlaps(rtoks, [sc?.name, sc?.title, sc?.description, sc?.objective, sc?.tags?.join?.(' ')].join(' '))
  );
  const matchedGraph = graphNodes.filter(node =>
    overlaps(rtoks, [node?.label, node?.name, node?.type, node?.description, node?.entity_type].join(' '))
  );
  const matchedDatasets = datasets.filter(ds =>
    overlaps(rtoks, [ds?.name, ds?.title, ds?.description, ds?.tags?.join?.(' '), ds?.type, ds?.category].join(' '))
  );

  const hasSc  = matchedScenarios.length > 0;
  const hasGr  = matchedGraph.length > 0;
  const hasDs  = matchedDatasets.length > 0;
  const srcCnt = [hasSc, hasGr, hasDs].filter(Boolean).length;

  let cls;
  if (srcCnt === 3) {
    cls = 'COVERED';
  } else if (srcCnt === 2) {
    cls = 'PARTIAL';
  } else if (srcCnt === 1) {
    cls = 'TRACED';
  } else {
    cls = 'EXPOSED';
  }

  return { cls, matchedScenarios, matchedGraph, matchedDatasets };
}

/* ─── exported query helper ─── */
export function isThlmapQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'thlmap', 'threat landscape', 'risk landscape', 'risk coverage map',
    'unmapped threat', 'exposed risk', 'threat graph', 'risk graph map',
    'risk scenario graph', 'threat dataset', 'threat blind spot',
  ].some(k => s.includes(k));
}

export function buildThlmapScript() {
  return (
    'Fetch /entities/RiskSignal, /v1/scenario/list, ' +
    '/v1/graph/centrality, and /v1/datasets. ' +
    'Keyword-match each risk signal (title/description/type/category) against ' +
    'scenario names/descriptions, graph node labels/types, and dataset names/tags. ' +
    'Classify each risk signal as COVERED (matches scenario + graph + dataset — ' +
    'fully mapped threat: scripted in a playbook, graphed, and data-backed), ' +
    'PARTIAL (matches 2 of 3 sources — partial landscape coverage), ' +
    'TRACED (matches exactly 1 source — minimally mapped), ' +
    'or EXPOSED (no match to any source — unmapped threat: no scenario playbook, ' +
    'no graph node, no data source — full blind spot in the threat landscape). ' +
    'Report the total EXPOSED count, identify which exposed signals represent the highest ' +
    'threat risk (e.g. critical/high severity, recently triggered, or recurring), ' +
    'and recommend which scenarios should be created to address them, ' +
    'which graph nodes should link to them, ' +
    'and which datasets should be tagged as evidence sources.'
  );
}

/* ─── component ─── */
export default function RiskSignalScenarioGraphDatasetLandscape() {
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
      const [rRs, rSc, rGr, rDs] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`,    { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/scenario/list`,        { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/graph/centrality`,     { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/datasets`,             { headers: h }).then(r => r.ok ? r.json() : null),
      ]);

      const riskSignals = normalizeRiskSignals(rRs);
      const scenarios   = normalizeScenarios(rSc);
      const graphNodes  = normalizeGraph(rGr);
      const datasets    = normalizeDatasets(rDs);

      const classified = riskSignals.map(rs => ({
        rs,
        ...classify(rs, scenarios, graphNodes, datasets),
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
    window.addEventListener('jarvis:thlmap-toggle', handler);
    return () => window.removeEventListener('jarvis:thlmap-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { COVERED: 0, PARTIAL: 0, TRACED: 0, EXPOSED: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return rsLabel(r.rs).toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
      const script = buildThlmapScript();
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
    left: 171560,
    zIndex: 317,
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
    width: 680,
    maxHeight: '78vh',
    overflowY: 'auto',
    background: 'rgba(10,14,26,0.97)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    zIndex: 3170,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#CBD5E1',
    boxShadow: '0 0 32px rgba(239,68,68,0.12)',
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)} title="RiskSignal × Scenario × Graph × Dataset Threat Landscape Coverage Map">
        ◈ THLMAP{counts.EXPOSED > 0 ? ` [${counts.EXPOSED}]` : ''}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: 12 }}>
              ◈ RISKSIGNAL × SCENARIO × GRAPH × DATASET — THREAT LANDSCAPE
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
              { label: 'SIGNALS', val: rows.length,        color: '#94A3B8' },
              { label: 'COVERED', val: counts.COVERED,     color: CLS_COLOR.COVERED },
              { label: 'PARTIAL', val: counts.PARTIAL,     color: CLS_COLOR.PARTIAL },
              { label: 'TRACED',  val: counts.TRACED,      color: CLS_COLOR.TRACED },
              { label: 'EXPOSED', val: counts.EXPOSED,     color: CLS_COLOR.EXPOSED },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
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
              placeholder="search signals…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', color: '#CBD5E1', padding: '3px 8px', fontSize: 10, borderRadius: 3, fontFamily: 'monospace', width: 170 }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: '6px 0' }}>
            {visible.length === 0 && (
              <div style={{ color: '#475569', fontSize: 11, padding: '16px 14px', textAlign: 'center' }}>
                {loading ? 'Loading…' : 'No signals match this filter.'}
              </div>
            )}
            {visible.map((item, idx) => {
              const { rs, cls, matchedScenarios, matchedGraph, matchedDatasets } = item;
              const isExpanded = expanded[idx];
              const sev = rs?.severity || rs?.level || rs?.priority;
              return (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [idx]: !e[idx] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', cursor: 'pointer' }}
                  >
                    <span style={{ color: CLS_COLOR[cls], fontSize: 9, fontWeight: 700, minWidth: 64, letterSpacing: '0.04em' }}>{cls}</span>
                    <span style={{ flex: 1, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rsLabel(rs)}</span>
                    {sev && (
                      <span style={{ color: '#64748B', fontSize: 9, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 2 }}>{sev}</span>
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
                      {/* graph nodes */}
                      {matchedGraph.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>GRAPH NODES ({matchedGraph.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedGraph.slice(0, 6).map((node, i) => (
                              <span key={i} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#A78BFA', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {node?.label || node?.name || node?.id || '—'} · {node?.centrality != null ? node.centrality.toFixed(3) : '?'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* datasets */}
                      {matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ color: '#64748B', fontSize: 9, marginBottom: 3 }}>DATASETS ({matchedDatasets.length})</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {matchedDatasets.slice(0, 6).map((ds, i) => (
                              <span key={i} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8', padding: '1px 7px', fontSize: 9, borderRadius: 3 }}>
                                {ds?.name || ds?.title || ds?.id || '—'}{ds?.row_count != null ? ` · ${ds.row_count.toLocaleString()} rows` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchedScenarios.length === 0 && matchedGraph.length === 0 && matchedDatasets.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 10 }}>No landscape matches — fully unmapped threat.</div>
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
              {assessing ? 'Assessing…' : '▶ ASSESS EXPOSED THREATS'}
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
