/**
 * LiveIntelGraphDatasetEventSaturation — F72
 *
 * Fetches /functions/getLiveIntel + /v1/graph/centrality + /v1/datasets
 * Keyword-matches each live intel event (quake/crypto/fx) against graph
 * centrality nodes AND datasets to classify:
 *   MAPPED  — matched both a graph node AND a dataset (fully grounded)
 *   TRACED  — matched a graph node only (graph-present but no dataset)
 *   DATAED  — matched a dataset only (data-backed but off the graph)
 *   DARK    — no match to either (event with zero intelligence grounding)
 *
 * Toggle: ◈ LIGSAT button (fixed, bottom strip) left:88680, zIndex:169
 * Stat tiles: events / nodes / datasets / mapped / traced / dataed / dark
 * Amber pulse on DARK count.
 * Expandable rows: matched graph nodes with centrality score badge
 *                  + matched datasets with row-count badge.
 * Filter tabs: ALL / MAPPED / TRACED / DATAED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ligsat"/"live intel graph"/"event saturation"/"intel event map"/
 *        "dark events"/"unmapped events"/"live event graph"/"event dataset"/
 *        "event coverage"/"live graph dataset"/"intel saturation"
 * Event: jarvis:ligsat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'MAPPED', 'TRACED', 'DATAED', 'DARK'];

const CLS_COLOR = {
  MAPPED:  '#00FF88',
  TRACED:  '#38BDF8',
  DATAED:  '#A78BFA',
  DARK:    '#FBBF24',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
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

function extractEvents(raw) {
  const quakes   = normalizeArray(raw?.earthquakes, ['items','results','data']);
  const crypto   = normalizeArray(raw?.crypto,      ['items','results','data']);
  const fx       = normalizeArray(raw?.fx,          ['items','results','data']);
  const combined = [
    ...quakes.map(e => ({ ...e, _source: 'quake',  _label: e.place || e.location || e.title || String(e.magnitude || '') })),
    ...crypto.map(e => ({ ...e, _source: 'crypto', _label: e.symbol || e.name || e.id || '' })),
    ...fx.map(e    => ({ ...e, _source: 'fx',      _label: e.pair   || e.symbol || e.id || '' })),
  ];
  return combined;
}

export function isLigdsatQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ligsat','live intel graph','event saturation','intel event map',
    'dark events','unmapped events','live event graph','event dataset',
    'event coverage','live graph dataset','intel saturation',
  ].some(k => s.includes(k));
}

export function buildLigdsatScript() {
  return `Fetch /functions/getLiveIntel, /v1/graph/centrality, /v1/datasets. ` +
    `Keyword-match each live intel event (quake/crypto/fx) against graph centrality nodes AND datasets. ` +
    `Classify as MAPPED/TRACED/DATAED/DARK. ` +
    `Report counts, highlight DARK events with zero intelligence grounding, and suggest how to extend graph or dataset coverage to address blind spots.`;
}

export default function LiveIntelGraphDatasetEventSaturation() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [nodes, setNodes]         = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, gRes, dRes] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers }),
        fetch(`${API}/v1/graph/centrality`,    { headers }),
        fetch(`${API}/v1/datasets`,            { headers }),
      ]);
      const [iRaw, gRaw, dRaw] = await Promise.all([
        iRes.ok ? iRes.json() : {},
        gRes.ok ? gRes.json() : {},
        dRes.ok ? dRes.json() : {},
      ]);
      const evts = extractEvents(iRaw);
      const ns   = normalizeArray(gRaw, ['nodes','items','results','data']);
      const ds   = normalizeArray(dRaw, ['datasets','items','results','data']);
      setEvents(evts);
      setNodes(ns);
      setDatasets(ds);

      const built = evts.map(ev => {
        const label = [ev._label, ev.description, ev.type, ev.category].join(' ');
        const etoks = tokens(label);
        const matchedNodes = ns.filter(n =>
          overlaps(etoks, [n.id, n.label, n.name, n.type, n.description].join(' '))
        );
        const matchedDatasets = ds.filter(d =>
          overlaps(etoks, [d.name, d.title, d.description, d.category, d.topic].join(' '))
        );
        let cls;
        if (matchedNodes.length > 0 && matchedDatasets.length > 0) cls = 'MAPPED';
        else if (matchedNodes.length > 0)                           cls = 'TRACED';
        else if (matchedDatasets.length > 0)                        cls = 'DATAED';
        else                                                        cls = 'DARK';
        return { ...ev, _cls: cls, _nodes: matchedNodes, _datasets: matchedDatasets };
      });
      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ligsat-toggle', toggle);
    return () => window.removeEventListener('jarvis:ligsat-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildLigdsatScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.answer || '';
      if (text && window._jarvisTTS) window._jarvisTTS(text);
    } catch {/* silent */}
    setAssessing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Graph × Dataset Event Saturation Map"
        style={{
          position:'fixed', bottom:8, left:88680, zIndex:169,
          background:'rgba(0,20,0,0.85)', border:'1px solid #00FF8866',
          color:'#00FF88', padding:'3px 8px', fontSize:9, borderRadius:3,
          cursor:'pointer', fontFamily:'monospace', whiteSpace:'nowrap',
        }}
      >
        ◈ LIGSAT
      </button>
    );
  }

  const counts = { MAPPED:0, TRACED:0, DATAED:0, DARK:0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = [r._label, r.description, r.type, r._source].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{
      position:'fixed', bottom:50, right:20, zIndex:9169,
      width:560, maxHeight:'78vh', overflow:'auto',
      background:'rgba(0,8,0,0.97)', border:'1px solid #00FF8833',
      borderRadius:8, padding:14, fontFamily:'monospace', fontSize:11, color:'#ccc',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ color:'#00FF88', fontWeight:700, fontSize:12 }}>
          ◈ LIVE INTEL × GRAPH × DATASET — EVENT SATURATION MAP
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background:'none', border:'none', color:'#FF4444', cursor:'pointer', fontSize:14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {[
          ['EVENTS',   events.length,   '#00FF88'],
          ['NODES',    nodes.length,    '#38BDF8'],
          ['DATASETS', datasets.length, '#A78BFA'],
          ['MAPPED',   counts.MAPPED,   '#00FF88'],
          ['TRACED',   counts.TRACED,   '#38BDF8'],
          ['DATAED',   counts.DATAED,   '#A78BFA'],
          ['DARK',     counts.DARK,     '#FBBF24'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background:'rgba(0,20,0,0.6)', border:`1px solid ${color}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:64,
            animation: label === 'DARK' && counts.DARK > 0 ? 'pulse 1.4s ease-in-out infinite' : undefined,
          }}>
            <div style={{ color, fontWeight:700, fontSize:13 }}>{val}</div>
            <div style={{ color:'#555', fontSize:8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#00FF8822' : 'transparent',
            border: `1px solid ${tab === t ? '#00FF88' : '#333'}`,
            color: tab === t ? '#00FF88' : '#666',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{
            marginLeft:'auto', background:'rgba(0,20,0,0.6)', border:'1px solid #333',
            color:'#ccc', padding:'2px 8px', borderRadius:3, fontSize:9, width:140,
          }}
        />
      </div>

      {/* assess */}
      <button onClick={assess} disabled={assessing} style={{
        background:'rgba(0,40,0,0.8)', border:'1px solid #00FF8866',
        color:'#00FF88', padding:'3px 12px', borderRadius:3, cursor:'pointer',
        fontSize:9, marginBottom:10,
      }}>
        {assessing ? '…' : '▶ ASSESS'}
      </button>

      {loading && <div style={{ color:'#555', marginBottom:6 }}>loading…</div>}
      {error   && <div style={{ color:'#FF4444', marginBottom:6 }}>Error: {error}</div>}

      {/* rows */}
      {visible.map((row, i) => (
        <div key={i} style={{ borderBottom:'1px solid #111', paddingBottom:6, marginBottom:6 }}>
          <div
            onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
            style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
          >
            <span style={{
              color: CLS_COLOR[row._cls],
              background:`${CLS_COLOR[row._cls]}18`,
              border:`1px solid ${CLS_COLOR[row._cls]}44`,
              padding:'1px 6px', borderRadius:3, fontSize:8, fontWeight:700, minWidth:56,
            }}>{row._cls}</span>
            <span style={{ color:'#888', fontSize:8, minWidth:40 }}>{row._source}</span>
            <span style={{ color:'#ddd', flex:1 }}>{row._label || '?'}</span>
            <span style={{ color:'#444', fontSize:8 }}>
              G:{row._nodes.length} D:{row._datasets.length}
            </span>
            <span style={{ color:'#444' }}>{expanded[i] ? '▲' : '▼'}</span>
          </div>

          {expanded[i] && (
            <div style={{ paddingLeft:12, marginTop:6, display:'flex', flexDirection:'column', gap:6 }}>
              {row._nodes.length > 0 && (
                <div>
                  <span style={{ color:'#38BDF8', fontWeight:700 }}>Graph Nodes ({row._nodes.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._nodes.slice(0, 8).map((n, j) => (
                      <span key={j} style={{
                        background:'rgba(56,189,248,0.12)', border:'1px solid #38BDF844',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {n.label || n.name || n.id || '?'}
                        {n.centrality !== undefined && (
                          <span style={{ color:'#38BDF8', marginLeft:4 }}>
                            {typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}
                          </span>
                        )}
                      </span>
                    ))}
                    {row._nodes.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._nodes.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {row._datasets.length > 0 && (
                <div>
                  <span style={{ color:'#A78BFA', fontWeight:700 }}>Datasets ({row._datasets.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._datasets.slice(0, 8).map((d, j) => (
                      <span key={j} style={{
                        background:'rgba(167,139,250,0.12)', border:'1px solid #A78BFA44',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {d.name || d.title || d.id || '?'}
                        {d.row_count !== undefined && (
                          <span style={{ color:'#A78BFA', marginLeft:4 }}>{d.row_count}r</span>
                        )}
                      </span>
                    ))}
                    {row._datasets.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._datasets.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {row._nodes.length === 0 && row._datasets.length === 0 && (
                <span style={{ color:'#FBBF24' }}>
                  No graph node or dataset match — event intelligence blind spot.
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </div>
  );
}
