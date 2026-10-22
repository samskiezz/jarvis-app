/**
 * InvestmentScenarioGraphRiskWealthMap — F115
 *
 * Fetches /entities/Investment + /v1/scenario/list + /v1/graph/centrality + /entities/RiskSignal.
 *
 * Keyword-matches each investment (name/type/description/asset class) against
 * scenario names/descriptions, graph node labels/types, and risk signal names/categories
 * to classify:
 *
 *   SECURED  — investment matches scenario AND graph AND risk signal
 *              (fully defended: operationally scripted, graph-traced, and threat-monitored)
 *   COVERED  — investment matches 2 of the 3 sources
 *              (partially protected — missing one defensive axis)
 *   GROUNDED — investment matches only 1 of the 3 sources
 *              (thin coverage — asset exists but isn't operationally anchored)
 *   EXPOSED  — no match to any source
 *              (wealth blind spot — zero scenario, graph trace, or risk-signal coverage)
 *
 * Toggle: ◈ ISGRMX button (fixed, bottom strip) left:112760, zIndex:212
 * Stat tiles: investments / scenarios / graph nodes / risk signals / secured / covered / grounded / exposed
 * Red pulse on EXPOSED count (wealth blind spots).
 * Expandable rows: matched scenarios with status badge +
 *                  matched graph nodes with centrality score badge +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / SECURED / COVERED / GROUNDED / EXPOSED + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "isgrmx"/"investment wealth map"/"investment risk scenario"/"wealth exposure map"
 *        "investment graph risk"/"wealth defense map"/"exposed investment"/"investment exposed"
 *        "wealth blind spot"/"investment coverage"/"wealth secured"/"investment scenario risk"
 *        "investment graph scenario"/"wealth risk map"/"investment risk graph"
 * Event: jarvis:isgrmx-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SECURED', 'COVERED', 'GROUNDED', 'EXPOSED'];

const CLS_COLOR = {
  SECURED:  '#22C55E',
  COVERED:  '#3B82F6',
  GROUNDED: '#F97316',
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

function normalizeArray(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export function isIsgrmxQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'isgrmx', 'investment wealth map', 'investment risk scenario', 'wealth exposure map',
    'investment graph risk', 'wealth defense map', 'exposed investment', 'investment exposed',
    'wealth blind spot', 'investment coverage', 'wealth secured', 'investment scenario risk',
    'investment graph scenario', 'wealth risk map', 'investment risk graph',
  ].some(kw => s.includes(kw));
}

async function fetcher(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function classifyInvestment(inv, scenarios, graphNodes, riskSignals) {
  const toks = tokens(
    `${inv.name || ''} ${inv.type || ''} ${inv.asset_class || ''} ${inv.description || ''} ${inv.label || ''} ${inv.ticker || ''}`
  );
  const mScenarios  = scenarios.filter(s => overlaps(toks, `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.type || ''}`));
  const mNodes      = graphNodes.filter(n => overlaps(toks, `${n.label || ''} ${n.type || ''} ${n.name || ''}`));
  const mSignals    = riskSignals.filter(r => overlaps(toks, `${r.name || ''} ${r.category || ''} ${r.type || ''} ${r.description || ''}`));

  const matchCount = (mScenarios.length > 0 ? 1 : 0) + (mNodes.length > 0 ? 1 : 0) + (mSignals.length > 0 ? 1 : 0);

  let cls;
  if (matchCount === 3) cls = 'SECURED';
  else if (matchCount === 2) cls = 'COVERED';
  else if (matchCount === 1) cls = 'GROUNDED';
  else cls = 'EXPOSED';

  return { inv, cls, mScenarios, mNodes, mSignals };
}

export default function InvestmentScenarioGraphRiskWealthMap() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [invRaw, scenRaw, graphRaw, riskRaw] = await Promise.all([
        fetcher('/entities/Investment'),
        fetcher('/v1/scenario/list'),
        fetcher('/v1/graph/centrality'),
        fetcher('/entities/RiskSignal'),
      ]);

      const investments = normalizeArray(invRaw,  ['investments', 'data', 'items', 'results']);
      const scenarios   = normalizeArray(scenRaw, ['scenarios', 'data', 'items', 'results']);
      const graphNodes  = normalizeArray(graphRaw, ['nodes', 'entities', 'data', 'items', 'results']);
      const riskSignals = normalizeArray(riskRaw, ['signals', 'riskSignals', 'data', 'items', 'results']);

      setRows(investments.map(inv => classifyInvestment(inv, scenarios, graphNodes, riskSignals)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:isgrmx-toggle', handler);
    return () => window.removeEventListener('jarvis:isgrmx-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    SECURED:  rows.filter(r => r.cls === 'SECURED').length,
    COVERED:  rows.filter(r => r.cls === 'COVERED').length,
    GROUNDED: rows.filter(r => r.cls === 'GROUNDED').length,
    EXPOSED:  rows.filter(r => r.cls === 'EXPOSED').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.inv.name || r.inv.label || '').toLowerCase().includes(s) ||
             (r.inv.description || r.inv.type || r.inv.asset_class || '').toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const summary = `Investments: ${rows.length}. Secured: ${counts.SECURED}. Covered: ${counts.COVERED}. Grounded: ${counts.GROUNDED}. Exposed: ${counts.EXPOSED}.`;
    const prompt = `JARVIS wealth defense coverage audit: ${summary}. Identify the most critical exposed investments — those with no defensive scenario, no graph trace, and no risk-signal monitoring. Provide 2-sentence advisory on wealth blind spots and recommended coverage improvements.`;
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
          position: 'fixed', bottom: 8, left: 112760, zIndex: 212,
          background: 'rgba(8,14,22,0.82)', border: '1px solid #EF444455',
          color: '#EF4444', borderRadius: 4, padding: '3px 7px',
          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, whiteSpace: 'nowrap',
        }}
      >◈ ISGRMX</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 212, background: 'rgba(4,7,11,0.93)',
      display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
      color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #EF444433', flexShrink: 0 }}>
        <span style={{ color: '#EF4444', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ ISGRMX</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Investment × Scenario × Graph × RiskSignal — Wealth Defense Coverage Map</span>
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
          { label: 'INVESTMENTS', val: rows.length,          color: '#94a3b8' },
          { label: 'SECURED',     val: counts.SECURED,       color: CLS_COLOR.SECURED },
          { label: 'COVERED',     val: counts.COVERED,       color: CLS_COLOR.COVERED },
          { label: 'GROUNDED',    val: counts.GROUNDED,      color: CLS_COLOR.GROUNDED },
          { label: 'EXPOSED',     val: counts.EXPOSED,       color: CLS_COLOR.EXPOSED, pulse: counts.EXPOSED > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            background: 'rgba(15,23,35,0.8)', border: `1px solid ${color}44`,
            borderRadius: 5, padding: '5px 12px', minWidth: 80, textAlign: 'center',
            animation: pulse ? 'isgrmx-pulse 2s ease-in-out infinite' : 'none',
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
          placeholder="search investments…"
          style={{ marginLeft: 'auto', background: 'rgba(15,23,35,0.7)', border: '1px solid #1e293b', color: '#DCEBF5', borderRadius: 3, padding: '2px 8px', fontSize: 10, width: 180 }}
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
                  {r.inv.name || r.inv.label || r.inv.ticker || r.inv.id || '(unnamed)'}
                </span>
                {(r.inv.type || r.inv.asset_class) && (
                  <span style={{ background: '#071428', border: '1px solid #075985', color: '#7dd3fc', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {r.inv.type || r.inv.asset_class}
                  </span>
                )}
                {r.inv.value != null && (
                  <span style={{ background: '#0a1a10', border: '1px solid #14532d', color: '#86efac', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>
                    {typeof r.inv.value === 'number' ? `$${r.inv.value.toLocaleString()}` : r.inv.value}
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[r.cls], letterSpacing: 1 }}>{r.cls}</span>
                <span style={{ fontSize: 10, color: '#334155' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${CLS_COLOR[r.cls]}22`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(r.inv.description || r.inv.summary) && (
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{r.inv.description || r.inv.summary}</div>
                  )}
                  {r.mScenarios.length > 0 && (
                    <div>
                      <div style={{ color: '#a78bfa', fontSize: 10, marginBottom: 3 }}>SCENARIOS ({r.mScenarios.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mScenarios.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#1a0e2e', border: '1px solid #4c1d95', color: '#c4b5fd', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.title || s.id}
                            {s.status && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{s.status}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mNodes.length > 0 && (
                    <div>
                      <div style={{ color: '#22d3ee', fontSize: 10, marginBottom: 3 }}>GRAPH NODES ({r.mNodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mNodes.slice(0, 8).map((n, k) => (
                          <span key={k} style={{ background: '#071420', border: '1px solid #0e7490', color: '#67e8f9', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {n.label || n.name || n.id}
                            {n.centrality != null && (
                              <span style={{ color: '#94a3b8', fontSize: 9 }}> [{typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}]</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#f87171', fontSize: 10, marginBottom: 3 }}>RISK SIGNALS ({r.mSignals.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.mSignals.slice(0, 8).map((s, k) => (
                          <span key={k} style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>
                            {s.name || s.id}
                            {s.severity && <span style={{ color: '#94a3b8', fontSize: 9 }}> [{s.severity}]</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.mScenarios.length === 0 && r.mNodes.length === 0 && r.mSignals.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>No scenario, graph trace, or risk-signal match — wealth blind spot.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes isgrmx-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
