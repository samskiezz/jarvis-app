/**
 * ScenarioDatasetContactBrainGraphRisk — F189
 *
 * Fetches /v1/scenario/list + /v1/datasets + /entities/Contact
 *         + /v1/cinematic/brain + /v1/graph/centrality + /entities/RiskSignal
 *
 * Keyword-matches each scenario against datasets, contacts, brain nodes,
 * graph nodes, and risk signals to classify:
 *
 *   FORTIFIED — scenario matches all 5 secondary sources (full mission foundation)
 *   STAGED    — matches 3–4 secondary sources
 *   PARTIAL   — matches 1–2 secondary sources
 *   UNARMED   — no match across any secondary source (fully unexecutable blind spot)
 *
 * Toggle: ◈ SCDBGR button (fixed, bottom strip) left:154200, zIndex:286
 * Stat tiles: scenarios / datasets / contacts / brain / nodes / signals /
 *             fortified / staged / partial / unarmed
 * Red pulse on UNARMED count (scenarios with zero mission foundation).
 * Expandable rows: matched datasets with row-count badge +
 *                  matched contacts with role/org +
 *                  matched brain nodes with type badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched risk signals with severity badge
 * Filter tabs: ALL / FORTIFIED / STAGED / PARTIAL / UNARMED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scdbgr"/"scenario foundation"/"scenario dataset contact"
 *        "unarmed scenario"/"scenario blind spot"/"scenario brain graph"
 *        "mission foundation"/"scenario coverage foundation"
 *        "scenario risk coverage"/"fortified scenario"
 * Event: jarvis:scdbgr-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'FORTIFIED', 'STAGED', 'PARTIAL', 'UNARMED'];

const CLS_COLOR = {
  FORTIFIED: '#22C55E',
  STAGED:    '#38BDF8',
  PARTIAL:   '#F97316',
  UNARMED:   '#EF4444',
};

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

function classify(scenario, datasets, contacts, brainNodes, graphNodes, signals) {
  const label = scenario.name || scenario.title || scenario.id || '';
  const desc  = scenario.description || scenario.summary || '';
  const toks  = tokens(`${label} ${desc}`);

  const mDatasets = datasets.filter(d => overlaps(toks, `${d.name || ''} ${d.title || ''} ${d.description || ''} ${d.type || ''}`));
  const mContacts = contacts.filter(c => overlaps(toks, `${c.name || ''} ${c.role || ''} ${c.org || ''} ${c.organisation || ''} ${c.title || ''}`));
  const mBrain    = brainNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.description || ''} ${n.name || ''}`));
  const mGraph    = graphNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.description || ''} ${n.name || ''} ${n.id || ''}`));
  const mSignals  = signals.filter(s => overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.category || ''} ${s.type || ''}`));

  const matched = [
    mDatasets.length > 0,
    mContacts.length > 0,
    mBrain.length > 0,
    mGraph.length > 0,
    mSignals.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (matched === 5)      cls = 'FORTIFIED';
  else if (matched >= 3)  cls = 'STAGED';
  else if (matched >= 1)  cls = 'PARTIAL';
  else                    cls = 'UNARMED';

  return { scenario, cls, mDatasets, mContacts, mBrain, mGraph, mSignals };
}

export function isScdbgrQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'scdbgr', 'scenario foundation', 'scenario dataset contact',
    'unarmed scenario', 'scenario blind spot', 'scenario brain graph',
    'mission foundation', 'scenario coverage foundation',
    'scenario risk coverage', 'fortified scenario',
    'scenario dataset brain', 'scenario graph risk',
    'scenario full coverage', 'scenario intelligence foundation',
  ].some(kw => s.includes(kw));
}

export function buildScdbgrScript(stats) {
  return `SCDBGR: ${stats.scenarios} scenarios | ${stats.fortified} FORTIFIED | ${stats.staged} STAGED | ${stats.partial} PARTIAL | ${stats.unarmed} UNARMED (fully unexecutable blind spots). Sources: ${stats.datasets} datasets, ${stats.contacts} contacts, ${stats.brain} brain nodes, ${stats.nodes} graph nodes, ${stats.signals} risk signals. Identify the most dangerous unarmed scenarios with zero mission foundation and recommend immediate remediation to establish dataset backing, contact ownership, brain model grounding, graph tracing, and risk signal coverage.`;
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export default function ScenarioDatasetContactBrainGraphRisk() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ scenarios:0, datasets:0, contacts:0, brain:0, nodes:0, signals:0, fortified:0, staged:0, partial:0, unarmed:0 });
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [scRaw, dsRaw, ctRaw, brRaw, grRaw, rsRaw] = await Promise.all([
        fetcher('/v1/scenario/list'),
        fetcher('/v1/datasets'),
        fetcher('/entities/Contact'),
        fetcher('/v1/cinematic/brain'),
        fetcher('/v1/graph/centrality'),
        fetcher('/entities/RiskSignal'),
      ]);

      const scenarios  = normalizeArray(scRaw, ['scenarios','items','data','results','list']);
      const datasets   = normalizeArray(dsRaw, ['datasets','items','data','results']);
      const contacts   = normalizeArray(ctRaw, ['contacts','items','data','results']);
      const brainNodes = normalizeArray(brRaw, ['nodes','items','data','brain','graph']);
      const graphNodes = normalizeArray(grRaw, ['nodes','centrality','items','data','results']);
      const signals    = normalizeArray(rsRaw, ['signals','items','data','results','risk_signals']);

      const classified = scenarios.map(sc =>
        classify(sc, datasets, contacts, brainNodes, graphNodes, signals)
      );
      setRows(classified);
      setStats({
        scenarios: scenarios.length,
        datasets:  datasets.length,
        contacts:  contacts.length,
        brain:     brainNodes.length,
        nodes:     graphNodes.length,
        signals:   signals.length,
        fortified: classified.filter(r => r.cls === 'FORTIFIED').length,
        staged:    classified.filter(r => r.cls === 'STAGED').length,
        partial:   classified.filter(r => r.cls === 'PARTIAL').length,
        unarmed:   classified.filter(r => r.cls === 'UNARMED').length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:scdbgr-toggle', handler);
    return () => window.removeEventListener('jarvis:scdbgr-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const summary = buildScdbgrScript(stats);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Scenario mission foundation assessment: ${summary}` }),
      });
      const d = await r.json();
      const text = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (text) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = r.scenario.name || r.scenario.title || r.scenario.id || '';
      return label.toLowerCase().includes(s)
          || (r.scenario.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 154200, zIndex: 286,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #334155',
          color: '#94a3b8', fontSize: 10, padding: '2px 6px',
          cursor: 'pointer', borderRadius: 3, letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >◈ SCDBGR</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 48, right: 20, zIndex: 9900,
      width: 900, maxHeight: '82vh',
      background: 'rgba(2,6,23,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 8, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(239,68,68,0.12)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#ef4444', fontSize: 14 }}>◈</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>SCDBGR</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Scenario × Dataset × Contact × Brain × Graph × RiskSignal — Mission Foundation</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={assess} disabled={assessing}
            style={{ background: '#1e40af', border: 'none', color: '#bfdbfe', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
          >{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => load()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
        {[
          ['SCENARIOS', stats.scenarios, '#94a3b8'],
          ['DATASETS',  stats.datasets,  '#64748b'],
          ['CONTACTS',  stats.contacts,  '#64748b'],
          ['BRAIN',     stats.brain,     '#64748b'],
          ['NODES',     stats.nodes,     '#64748b'],
          ['SIGNALS',   stats.signals,   '#64748b'],
          ['FORTIFIED', stats.fortified, CLS_COLOR.FORTIFIED],
          ['STAGED',    stats.staged,    CLS_COLOR.STAGED],
          ['PARTIAL',   stats.partial,   CLS_COLOR.PARTIAL],
          ['UNARMED',   stats.unarmed,   CLS_COLOR.UNARMED],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: '#0f172a', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 60,
          }}>
            <div style={{ color, fontSize: 15, fontWeight: 700, ...(label === 'UNARMED' && val > 0 ? {
              animation: 'scdbgr-pulse 1.4s ease-in-out infinite',
            } : {}) }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #1e3a5f', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#1e3a5f' : '#0f172a',
            border: `1px solid ${tab === t ? '#3b82f6' : '#1e293b'}`,
            color: tab === t ? '#bfdbfe' : '#64748b',
            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 140 }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
        {loading && <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>loading…</div>}
        {error   && <div style={{ color: '#ef4444', textAlign: 'center', padding: 8 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 16 }}>no results</div>
        )}
        {visible.map((r, i) => {
          const id = r.scenario.id || r.scenario.name || i;
          const ex = expanded[id];
          const scLabel = r.scenario.name || r.scenario.title || r.scenario.id || `scenario-${i}`;
          const scStatus = r.scenario.status || r.scenario.state || '';
          return (
            <div key={id} style={{ borderBottom: '1px solid #0f172a' }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                  cursor: 'pointer', background: ex ? '#0f172a' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: CLS_COLOR[r.cls], fontSize: 10, minWidth: 80 }}>{r.cls}</span>
                <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {scLabel}
                </span>
                {scStatus && (
                  <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {scStatus}
                  </span>
                )}
                <span style={{ color: '#475569', fontSize: 10 }}>{ex ? '▲' : '▼'}</span>
              </div>
              {ex && (
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.mDatasets.length > 0 && (
                    <div>
                      <div style={{ color: '#fbbf24', fontSize: 10, marginBottom: 3 }}>DATASETS ({r.mDatasets.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mDatasets.slice(0, 8).map((d, j) => (
                          <span key={j} style={{ background: '#1c1400', border: '1px solid #78350f', color: '#fde68a', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {d.name || d.title || d.id}
                            {typeof (d.row_count ?? d.rows ?? d.count) === 'number' && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> {(d.row_count ?? d.rows ?? d.count).toLocaleString()}r</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mContacts.length > 0 && (
                    <div>
                      <div style={{ color: '#34d399', fontSize: 10, marginBottom: 3 }}>CONTACTS ({r.mContacts.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mContacts.slice(0, 8).map((c, j) => (
                          <span key={j} style={{ background: '#021a0a', border: '1px solid #065f46', color: '#6ee7b7', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {c.name || c.id}
                            {(c.role || c.org || c.organisation) && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> {c.role || ''}{c.role && (c.org || c.organisation) ? '/' : ''}{c.org || c.organisation || ''}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mBrain.length > 0 && (
                    <div>
                      <div style={{ color: '#c084fc', fontSize: 10, marginBottom: 3 }}>BRAIN NODES ({r.mBrain.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mBrain.slice(0, 8).map((n, j) => (
                          <span key={j} style={{ background: '#1a0b2e', border: '1px solid #6b21a8', color: '#d8b4fe', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.type && <span style={{ color: '#94a3b8', fontSize: 9 }}> {n.type}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mGraph.length > 0 && (
                    <div>
                      <div style={{ color: '#38bdf8', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mGraph.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mGraph.slice(0, 8).map((n, j) => (
                          <span key={j} style={{ background: '#0c1a2e', border: '1px solid #0e4f6e', color: '#7dd3fc', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {typeof n.centrality === 'number' && <span style={{ color: '#94a3b8', fontSize: 9 }}> c:{n.centrality.toFixed(3)}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mSignals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSignals.slice(0, 8).map((s, j) => (
                          <span key={j} style={{ background: '#1c0505', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> {s.severity}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mDatasets.length === 0 && r.mContacts.length === 0 && r.mBrain.length === 0 && r.mGraph.length === 0 && r.mSignals.length === 0 && (
                    <div style={{ color: '#ef4444', fontSize: 10 }}>No dataset, contact, brain node, graph node, or risk signal match — fully unexecutable scenario with zero mission foundation.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes scdbgr-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
