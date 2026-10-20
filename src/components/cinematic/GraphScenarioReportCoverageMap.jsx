/**
 * GraphScenarioReportCoverageMap — F83
 *
 * Fetches /v1/graph/centrality + /v1/scenario/list + /v1/reports.
 * Keyword-matches each graph node against scenario scripts AND published reports to classify:
 *   MAPPED    — node has both a matched scenario AND a matched report (fully covered)
 *   SCRIPTED  — node matched scenarios only (planned but not yet reported)
 *   PUBLISHED — node matched reports only (reported but no active scenario script)
 *   DARK      — no scenario and no report match (blind-spot node)
 *
 * Toggle: ◈ GSRMAP button (fixed, bottom strip) left:94840, zIndex:180
 * Stat tiles: nodes / scenarios / reports / mapped / scripted / published / dark
 * Amber pulse on DARK count.
 * Expandable rows: matched scenarios with status badge + matched reports with date badge.
 * Filter tabs: ALL / MAPPED / SCRIPTED / PUBLISHED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "gsrmap"/"graph coverage"/"scenario report coverage"/"strategic coverage"/
 *        "dark graph"/"graph scenario report"/"node coverage"/"graph strategic"/
 *        "coverage map"/"node dark"
 * Event: jarvis:gsrmap-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'MAPPED', 'SCRIPTED', 'PUBLISHED', 'DARK'];

const CLS_COLOR = {
  MAPPED:    '#22C55E',
  SCRIPTED:  '#38BDF8',
  PUBLISHED: '#A78BFA',
  DARK:      '#F59E0B',
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
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isGsrmapQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'gsrmap', 'graph coverage', 'scenario report coverage',
    'strategic coverage', 'dark graph', 'graph scenario report',
    'node coverage', 'graph strategic', 'coverage map', 'node dark',
  ].some(k => s.includes(k));
}

export function buildGsrmapScript() {
  return `Fetch /v1/graph/centrality, /v1/scenario/list, and /v1/reports. ` +
    `Keyword-match each graph node label and entity type against scenario titles AND report titles. ` +
    `Classify each node as MAPPED/SCRIPTED/PUBLISHED/DARK. ` +
    `Report total DARK count (graph nodes with no scenario script and no published report — strategic blind spots), ` +
    `identify which high-centrality nodes lack coverage, ` +
    `and recommend which dark nodes should be prioritised for scenario scripting or report publication ` +
    `to bring them from DARK to MAPPED status.`;
}

export default function GraphScenarioReportCoverageMap() {
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
    nodes:0, scenarios:0, reports:0, mapped:0, scripted:0, published:0, dark:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [gRaw, sRaw, rRaw] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/scenario/list`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/reports`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const nodes     = normalizeArray(gRaw, ['nodes','items','results','data','centrality']);
      const scenarios = normalizeArray(sRaw, ['items','scenarios','results','data']);
      const reports   = normalizeArray(rRaw, ['items','reports','results','data']);

      const built = nodes.map(node => {
        const nodeText = [
          node.label, node.name, node.entity_type, node.type, node.category, node.description,
        ].filter(Boolean).join(' ');
        const nToks = tokens(nodeText);

        const matchedScenarios = scenarios.filter(s => {
          const sStr = [s.title, s.name, s.description, s.type, s.tags, s.category].filter(Boolean).join(' ');
          return overlaps(nToks, sStr);
        });
        const matchedReports = reports.filter(rep => {
          const rStr = [rep.title, rep.name, rep.description, rep.type, rep.tags, rep.category, rep.subject].filter(Boolean).join(' ');
          return overlaps(nToks, rStr);
        });

        const hasScenarios = matchedScenarios.length > 0;
        const hasReports   = matchedReports.length > 0;
        const cls = hasScenarios && hasReports ? 'MAPPED'
                  : hasScenarios               ? 'SCRIPTED'
                  : hasReports                 ? 'PUBLISHED'
                  :                              'DARK';
        return {
          id:               node.id || node.node_id || String(Math.random()),
          name:             node.label || node.name || node.entity_type || '(node)',
          entityType:       node.entity_type || node.type || '',
          centrality:       node.centrality_score ?? node.score ?? null,
          cls,
          matchedScenarios,
          matchedReports,
        };
      });

      const c = { nodes: built.length, scenarios: scenarios.length, reports: reports.length,
                  mapped:0, scripted:0, published:0, dark:0 };
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
    window.addEventListener('jarvis:gsrmap-toggle', handler);
    return () => window.removeEventListener('jarvis:gsrmap-toggle', handler);
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
        body: JSON.stringify({ message: buildGsrmapScript() }),
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
      return r.name.toLowerCase().includes(s) || r.entityType.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', bottom:8, left:94840, zIndex:180,
          background:'rgba(0,10,30,0.85)', border:'1px solid #F59E0B',
          color:'#F59E0B', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="Graph × Scenario × Report Strategic Coverage Map"
      >
        ◈ GSRMAP
        {counts.dark > 0 && (
          <span style={{ marginLeft:4, color:'#F59E0B', animation:'pulse-amber 1.5s infinite' }}>
            {counts.dark}▲
          </span>
        )}
        <style>{`@keyframes pulse-amber{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
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
        <span style={{ color:'#F59E0B', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ GSRMAP</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>GRAPH × SCENARIO × REPORT  STRATEGIC COVERAGE MAP</span>
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
          { label:'NODES',     val: counts.nodes,     col:'#94A3B8' },
          { label:'SCENARIOS', val: counts.scenarios,  col:'#94A3B8' },
          { label:'REPORTS',   val: counts.reports,   col:'#94A3B8' },
          { label:'MAPPED',    val: counts.mapped,    col: CLS_COLOR.MAPPED    },
          { label:'SCRIPTED',  val: counts.scripted,  col: CLS_COLOR.SCRIPTED  },
          { label:'PUBLISHED', val: counts.published, col: CLS_COLOR.PUBLISHED },
          { label:'DARK',      val: counts.dark,      col: CLS_COLOR.DARK      },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:80 }}>
            <div style={{ color: col, fontSize:16, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#64748B', fontSize:8, letterSpacing:1 }}>{label}</div>
          </div>
        ))}

        <button onClick={assess} disabled={assessing} style={{
          marginLeft:'auto', background: assessing ? '#1e3a5f' : 'rgba(245,158,11,0.15)',
          border:'1px solid #F59E0B', color:'#F59E0B', padding:'4px 12px',
          borderRadius:3, cursor: assessing ? 'default' : 'pointer', fontSize:9, letterSpacing:1,
        }}>
          {assessing ? '…ASSESSING' : '▶ ASSESS'}
        </button>
      </div>

      {assessment && (
        <div style={{ margin:'6px 16px', padding:'8px 12px', background:'rgba(245,158,11,0.08)',
          border:'1px solid #F59E0B66', borderRadius:4, fontSize:10, color:'#E2E8F0',
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
          placeholder="search nodes…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No nodes match the current filter.</div>
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
                {r.entityType && (
                  <span style={{ color:'#64748B', fontSize:9 }}>{r.entityType}</span>
                )}
                {r.centrality !== null && (
                  <span style={{ color:'#475569', fontSize:9 }}>
                    ◈{typeof r.centrality === 'number' ? r.centrality.toFixed(3) : r.centrality}
                  </span>
                )}
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedScenarios.length}S · {r.matchedReports.length}R
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
                      : r.matchedScenarios.map((s, si) => (
                        <div key={si} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {s.title || s.name || s.id || '(scenario)'}
                          </span>
                          {(s.status || s.state) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {s.status || s.state}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#A78BFA', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED REPORTS
                    </div>
                    {r.matchedReports.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedReports.map((rep, ri) => (
                        <div key={ri} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {rep.title || rep.name || rep.id || '(report)'}
                          </span>
                          {(rep.date || rep.created_at || rep.published_at) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#A78BFA33', color:'#A78BFA' }}>
                              {(rep.date || rep.created_at || rep.published_at || '').slice(0, 10)}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-amber {
          0%,100% { opacity:1; }
          50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
