/**
 * DatasetScenarioRiskThreatExposure — F85
 *
 * Fetches /v1/datasets + /v1/scenario/list + /entities/RiskSignal.
 * Keyword-matches each dataset against scenarios AND risk signals to classify:
 *   SECURED  — dataset has both a matched scenario AND a matched risk signal (covered)
 *   SCRIPTED — dataset matched scenarios only (operational script exists, no threat signal)
 *   SIGNALED — dataset matched risk signals only (threat known, no runnable scenario)
 *   EXPOSED  — no scenario and no risk signal match (full blind spot)
 *
 * Toggle: ◈ DSRTX button (fixed, bottom strip) left:95960, zIndex:182
 * Stat tiles: datasets / scenarios / signals / secured / scripted / signaled / exposed
 * Red pulse on EXPOSED count.
 * Expandable rows: matched scenarios with status badge + matched risk signals with severity badge.
 * Filter tabs: ALL / SECURED / SCRIPTED / SIGNALED / EXPOSED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dsrtx"/"dataset threat"/"dataset exposure"/"threat exposure coverage"/
 *        "exposed datasets"/"dataset risk scenario"/"scenario coverage datasets"/
 *        "threat scenario coverage"/"dataset threat exposure"
 * Event: jarvis:dsrtx-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SECURED', 'SCRIPTED', 'SIGNALED', 'EXPOSED'];

const CLS_COLOR = {
  SECURED:  '#22C55E',
  SCRIPTED: '#38BDF8',
  SIGNALED: '#F59E0B',
  EXPOSED:  '#EF4444',
};

const SEV_COLOR = { critical:'#EF4444', high:'#F97316', medium:'#F59E0B', low:'#22C55E' };

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isDsrtxQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'dsrtx', 'dataset threat', 'dataset exposure', 'threat exposure coverage',
    'exposed datasets', 'dataset risk scenario', 'scenario coverage datasets',
    'threat scenario coverage', 'dataset threat exposure',
  ].some(k => s.includes(k));
}

export function buildDsrtxScript() {
  return `Fetch /v1/datasets, /v1/scenario/list, and /entities/RiskSignal. ` +
    `Keyword-match each dataset name/description against scenario titles/descriptions AND risk signal names/descriptions. ` +
    `Classify each dataset as SECURED/SCRIPTED/SIGNALED/EXPOSED. ` +
    `Report total EXPOSED count (datasets with no scenario coverage and no threat signal — full blind spots), ` +
    `identify which EXPOSED datasets are highest-risk given their content, ` +
    `and recommend immediate scenario creation or threat signal assignment to reduce exposure.`;
}

export default function DatasetScenarioRiskThreatExposure() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    datasets:0, scenarios:0, signals:0, secured:0, scripted:0, signaled:0, exposed:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [dsRaw, scRaw, rsRaw] = await Promise.all([
        fetch(`${API}/v1/datasets`,         { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`,     { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/RiskSignal`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const datasets  = normalizeArray(dsRaw, ['items','datasets','results','data']);
      const scenarios = normalizeArray(scRaw, ['items','scenarios','results','data']);
      const signals   = normalizeArray(rsRaw, ['items','signals','results','data']);

      const built = datasets.map(ds => {
        const dsText = [
          ds.name, ds.title, ds.description, ds.type, ds.tags, ds.category, ds.source,
        ].filter(Boolean).join(' ');
        const dsToks = tokens(dsText);

        const matchedScenarios = scenarios.filter(sc => {
          const scStr = [sc.title, sc.name, sc.description, sc.type, sc.tags, sc.category].filter(Boolean).join(' ');
          return overlaps(dsToks, scStr);
        });
        const matchedSignals = signals.filter(sig => {
          const sigStr = [sig.name, sig.title, sig.description, sig.type, sig.category, sig.source].filter(Boolean).join(' ');
          return overlaps(dsToks, sigStr);
        });

        const hasScenarios = matchedScenarios.length > 0;
        const hasSignals   = matchedSignals.length > 0;
        const cls = hasScenarios && hasSignals ? 'SECURED'
                  : hasScenarios               ? 'SCRIPTED'
                  : hasSignals                 ? 'SIGNALED'
                  :                              'EXPOSED';
        return {
          id:               ds.id || ds.dataset_id || String(Math.random()),
          name:             ds.name || ds.title || ds.id || '(dataset)',
          rowCount:         ds.row_count ?? ds.rows ?? ds.count ?? null,
          cls,
          matchedScenarios,
          matchedSignals,
        };
      });

      const c = {
        datasets: built.length, scenarios: scenarios.length, signals: signals.length,
        secured:0, scripted:0, signaled:0, exposed:0,
      };
      built.forEach(r => { c[r.cls.toLowerCase()]++; });
      setRows(built);
      setCounts(c);
    } catch (e) {
      setError(e.message || 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:dsrtx-toggle', handler);
    return () => window.removeEventListener('jarvis:dsrtx-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: buildDsrtxScript() }),
      });
      const d = await res.json();
      const text = d?.response || d?.message || d?.content || 'No assessment returned.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', bottom:8, left:95960, zIndex:182,
          background:'rgba(0,10,30,0.85)', border:'1px solid #EF4444',
          color:'#EF4444', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="Dataset × Scenario × RiskSignal Threat Exposure Coverage Matrix"
      >
        ◈ DSRTX
        {counts.exposed > 0 && (
          <span style={{ marginLeft:4, color:'#EF4444', animation:'pulse-red 1.5s infinite' }}>
            {counts.exposed}▲
          </span>
        )}
        <style>{`@keyframes pulse-red{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9900,
      background:'rgba(0,0,10,0.92)', display:'flex', flexDirection:'column',
      fontFamily:'monospace', color:'#E2E8F0',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px',
                    borderBottom:'1px solid #1e3a5f', background:'rgba(0,5,20,0.95)' }}>
        <span style={{ color:'#EF4444', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ DSRTX</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>DATASET × SCENARIO × RISKSIGNAL  THREAT EXPOSURE COVERAGE</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchData} style={{ background:'transparent', border:'1px solid #334155',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ↺ REFRESH
          </button>
          <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'1px solid #475569',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display:'flex', gap:8, padding:'8px 16px', flexWrap:'wrap',
                    borderBottom:'1px solid #1e3a5f' }}>
        {[
          { label:'DATASETS',  val: counts.datasets,  col:'#94A3B8' },
          { label:'SCENARIOS', val: counts.scenarios, col:'#94A3B8' },
          { label:'SIGNALS',   val: counts.signals,   col:'#94A3B8' },
          { label:'SECURED',   val: counts.secured,   col: CLS_COLOR.SECURED  },
          { label:'SCRIPTED',  val: counts.scripted,  col: CLS_COLOR.SCRIPTED },
          { label:'SIGNALED',  val: counts.signaled,  col: CLS_COLOR.SIGNALED },
          { label:'EXPOSED',   val: counts.exposed,   col: CLS_COLOR.EXPOSED  },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:80 }}>
            <div style={{ color: col, fontSize:16, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#64748B', fontSize:8, letterSpacing:1 }}>{label}</div>
          </div>
        ))}

        <button onClick={assess} disabled={assessing} style={{
          marginLeft:'auto', background: assessing ? '#1e3a5f' : 'rgba(239,68,68,0.15)',
          border:'1px solid #EF4444', color:'#EF4444', padding:'4px 12px',
          borderRadius:3, cursor: assessing ? 'default' : 'pointer', fontSize:9, letterSpacing:1,
        }}>
          {assessing ? '…ASSESSING' : '▶ ASSESS'}
        </button>
      </div>

      {assessment && (
        <div style={{ margin:'6px 16px', padding:'8px 12px', background:'rgba(239,68,68,0.08)',
          border:'1px solid #EF444466', borderRadius:4, fontSize:10, color:'#E2E8F0',
          maxHeight:80, overflowY:'auto' }}>
          {assessment}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display:'flex', gap:4, padding:'6px 16px', alignItems:'center',
                    borderBottom:'1px solid #1e3a5f', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? `${CLS_COLOR[t] || '#334155'}22` : 'transparent',
            border: `1px solid ${tab===t ? (CLS_COLOR[t]||'#334155') : '#334155'}`,
            color: tab===t ? (CLS_COLOR[t]||'#E2E8F0') : '#64748B',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9, letterSpacing:1,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No datasets match the current filter.</div>
        )}
        {visible.map(r => {
          const isExp = !!expanded[r.id];
          return (
            <div key={r.id} style={{ marginBottom:3 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px',
                  background:'rgba(0,10,30,0.6)', border:`1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: isExp ? '4px 4px 0 0' : 4, cursor:'pointer' }}
              >
                <span style={{ fontSize:9, padding:'1px 6px', borderRadius:2,
                  background:`${CLS_COLOR[r.cls]}22`, color: CLS_COLOR[r.cls], letterSpacing:1 }}>
                  {r.cls}
                </span>
                <span style={{ color:'#E2E8F0', fontSize:10, flex:1 }}>{r.name}</span>
                {r.rowCount !== null && (
                  <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                    background:'#33415544', color:'#94A3B8' }}>
                    {typeof r.rowCount === 'number' ? r.rowCount.toLocaleString() + ' rows' : r.rowCount}
                  </span>
                )}
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedScenarios.length}S · {r.matchedSignals.length}R
                </span>
                <span style={{ color:'#475569', fontSize:9 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background:'rgba(0,10,30,0.7)', border:`1px solid ${CLS_COLOR[r.cls]}22`,
                  borderRadius:'0 0 4px 4px', padding:'8px 12px', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#38BDF8', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED SCENARIOS
                    </div>
                    {r.matchedScenarios.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedScenarios.map((sc, si) => (
                        <div key={si} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {sc.title || sc.name || sc.id || '(scenario)'}
                          </span>
                          {(sc.status || sc.state) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {sc.status || sc.state}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#F59E0B', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED RISK SIGNALS
                    </div>
                    {r.matchedSignals.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedSignals.map((sig, ri) => {
                        const sev = (sig.severity || sig.level || '').toLowerCase();
                        const sevCol = SEV_COLOR[sev] || '#94A3B8';
                        return (
                          <div key={ri} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                            <span style={{ color:'#E2E8F0', fontSize:10 }}>
                              {sig.name || sig.title || sig.id || '(signal)'}
                            </span>
                            {sev && (
                              <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                                background:`${sevCol}33`, color: sevCol }}>
                                {sev}
                              </span>
                            )}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-red {
          0%,100% { opacity:1; }
          50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
