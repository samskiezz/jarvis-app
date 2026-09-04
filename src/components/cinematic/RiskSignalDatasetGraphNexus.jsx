/**
 * F450 — Risk Signal × Dataset × Graph Centrality Intelligence Nexus (RDGN)
 *
 * Answers: "For each active risk signal, is there a dataset backing it
 * AND a high-centrality graph node representing it — or is it floating
 * with no data or graph foundation?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/RiskSignal      → active risk signals
 *   GET /v1/datasets              → dataset catalog
 *   GET /v1/graph/centrality      → top-centrality graph nodes
 *
 * Classification per risk signal:
 *   FULLY_GROUNDED — ≥1 dataset match AND ≥1 graph node match
 *   DATA_BACKED    — dataset match, no graph node
 *   GRAPH_MAPPED   — graph node match, no dataset
 *   FLOATING       — neither — risk with no data or graph foundation
 *
 * Stat tiles:  signals / datasets / nodes / floating
 * Red badge:   FLOATING count on button
 * Expand row:  matched datasets (max 5) + matched graph nodes (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ RDGN  at left:8040, bottom:18, zIndex:68
 * Event:   jarvis:rdgn-toggle
 * Voice:   "risk dataset graph / rdgn / floating risks / risk data foundation /
 *           risk graph / risk centrality / risk without data / risk dataset nexus /
 *           grounded risks / which risks have data / data-backed risks"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const RD   = '#EF4444';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULLY_GROUNDED', 'DATA_BACKED', 'GRAPH_MAPPED', 'FLOATING'];
const CLASS_COLOR = {
  FULLY_GROUNDED: GR,
  DATA_BACKED:    CY,
  GRAPH_MAPPED:   AM,
  FLOATING:       RD,
};
const CLASS_LABEL = {
  FULLY_GROUNDED: 'FULL',
  DATA_BACKED:    'DATA',
  GRAPH_MAPPED:   'GRAPH',
  FLOATING:       'FLOAT',
};

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(s => s.length > 2);
}

function score(srcTokens, target) {
  const tgt = tokens(
    [target.name, target.label, target.title, target.description, target.id,
     ...(target.tags || [])].join(' ')
  );
  if (!tgt.length) return 0;
  return srcTokens.filter(t => tgt.includes(t)).length / Math.max(srcTokens.length, 1);
}

function classify(sigToks, datasets, nodes) {
  const matchedDatasets = datasets
    .map(d => ({ ...d, _rel: score(sigToks, d) }))
    .filter(d => d._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const matchedNodes = nodes
    .map(n => ({ ...n, _rel: score(sigToks, n) }))
    .filter(n => n._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const hasData  = matchedDatasets.length > 0;
  const hasGraph = matchedNodes.length > 0;
  let cls;
  if (hasData && hasGraph)       cls = 'FULLY_GROUNDED';
  else if (hasData && !hasGraph) cls = 'DATA_BACKED';
  else if (!hasData && hasGraph) cls = 'GRAPH_MAPPED';
  else                           cls = 'FLOATING';
  return { cls, matchedDatasets, matchedNodes };
}

export default function RiskSignalDatasetGraphNexus() {
  const [visible, setVisible]       = useState(false);
  const [rows, setRows]             = useState([]);
  const [filter, setFilter]         = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(null);
  const [assessText, setAssessText] = useState({});
  const [stats, setStats]           = useState({ signals: 0, datasets: 0, nodes: 0, floating: 0 });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const itvRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [sigRaw, dsRaw, nodesRaw] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`,   { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/datasets`,           { headers: h }).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`,   { headers: h }).then(r => r.json()),
      ]);

      const signals = Array.isArray(sigRaw)             ? sigRaw
                    : Array.isArray(sigRaw?.items)       ? sigRaw.items
                    : Array.isArray(sigRaw?.results)     ? sigRaw.results : [];
      const datasets = Array.isArray(dsRaw)             ? dsRaw
                     : Array.isArray(dsRaw?.datasets)   ? dsRaw.datasets
                     : Array.isArray(dsRaw?.items)       ? dsRaw.items : [];
      const nodes    = Array.isArray(nodesRaw)          ? nodesRaw
                     : Array.isArray(nodesRaw?.nodes)   ? nodesRaw.nodes
                     : Array.isArray(nodesRaw?.items)   ? nodesRaw.items : [];

      const enriched = signals.map(sig => {
        const sigToks = tokens(
          [sig.name, sig.description, sig.source, sig.severity,
           ...(sig.tags || [])].join(' ')
        );
        const { cls, matchedDatasets, matchedNodes } = classify(sigToks, datasets, nodes);
        return { ...sig, _cls: cls, _datasets: matchedDatasets, _nodes: matchedNodes };
      });

      setRows(enriched);
      setStats({
        signals:  enriched.length,
        datasets: datasets.length,
        nodes:    nodes.length,
        floating: enriched.filter(r => r._cls === 'FLOATING').length,
      });
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setVisible(v => { if (!v) load(); return !v; }); };
    window.addEventListener('jarvis:rdgn-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rdgn-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!visible) return;
    itvRef.current = setInterval(load, 60000);
    return () => clearInterval(itvRef.current);
  }, [visible, load]);

  const assess = useCallback(async (sig) => {
    const key = sig.id || sig.name;
    setAssessing(key);
    try {
      const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const msg = `Risk signal "${sig.name}" (severity: ${sig.severity || 'unknown'}) is classified ${sig._cls}. ` +
        `Matched datasets: ${sig._datasets.map(d => d.name || d.title).join(', ') || 'none'}. ` +
        `Matched graph nodes: ${sig._nodes.map(n => n.id || n.label || n.name).join(', ') || 'none'}. ` +
        `Give a 2-sentence operational brief on the data and graph foundation for this risk signal.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h, body: JSON.stringify({ message: msg }),
      }).then(r => r.json());
      const txt = res.response || res.message || res.text || 'No assessment.';
      setAssessText(prev => ({ ...prev, [key]: txt }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessText(prev => ({ ...prev, [key]: 'Assessment unavailable.' }));
    }
    setAssessing(null);
  }, []);

  const displayed = rows.filter(r => {
    if (filter !== 'ALL' && r._cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || '').toLowerCase().includes(q) ||
             (r.description || '').toLowerCase().includes(q) ||
             (r.severity || '').toLowerCase().includes(q);
    }
    return true;
  });

  const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR, INFO: MU };

  if (!visible) {
    const floating = stats.floating;
    return (
      <button
        onClick={() => { setVisible(true); load(); }}
        title="Risk Signal × Dataset × Graph Centrality Intelligence Nexus"
        style={{
          position: 'fixed', left: 8040, bottom: 18, zIndex: 68,
          background: BG, border: `1px solid ${floating > 0 ? RD : BD}`,
          color: floating > 0 ? RD : MU, fontFamily: MONO,
          fontSize: 10, padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ◈ RDGN
        {floating > 0 && (
          <span style={{
            background: RD, color: '#fff', borderRadius: '50%',
            width: 16, height: 16, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 9, fontWeight: 700,
          }}>{floating > 99 ? '99+' : floating}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 8040, bottom: 50, zIndex: 68,
      width: 700, maxHeight: '80vh', background: BG,
      border: `1px solid ${BD}`, borderRadius: 8, display: 'flex',
      flexDirection: 'column', fontFamily: MONO, fontSize: 11, overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 12 }}>◈ RDGN — Risk × Dataset × Graph Nexus</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: MU, fontSize: 10 }}>loading…</span>}
          <button onClick={load} style={{ background: 'none', border: `1px solid ${BD}`, color: CY, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer', borderRadius: 3 }}>↻</button>
          <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'SIGNALS',  val: stats.signals,  col: RD },
          { label: 'DATASETS', val: stats.datasets,  col: CY },
          { label: 'NODES',    val: stats.nodes,     col: AM },
          { label: 'FLOATING', val: stats.floating,  col: MU },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${BD}`, overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(255,255,255,0.1)' : 'none',
            border: `1px solid ${filter === f ? BD : 'transparent'}`,
            color: filter === f ? '#fff' : MU, fontFamily: MONO, fontSize: 9,
            padding: '2px 7px', cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap',
          }}>{f}</button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: '6px 14px', borderBottom: `1px solid ${BD}` }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, color: '#fff', fontFamily: MONO, fontSize: 10, padding: '4px 8px', borderRadius: 3, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>

      {/* error */}
      {error && <div style={{ color: RD, padding: '6px 14px', fontSize: 10 }}>Error: {error}</div>}

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: MU, padding: '20px 14px', textAlign: 'center' }}>No signals match.</div>
        )}
        {displayed.map((sig, i) => {
          const key  = sig.id || sig.name || i;
          const isEx = expanded === key;
          const aKey = sig.id || sig.name;
          const sevColor = SEV_COLOR[(sig.severity || '').toUpperCase()] || MU;
          return (
            <div key={key} style={{ borderBottom: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(isEx ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', background: isEx ? 'rgba(255,255,255,0.04)' : 'none' }}
              >
                <span style={{ color: CLASS_COLOR[sig._cls], fontWeight: 700, fontSize: 9, minWidth: 40 }}>{CLASS_LABEL[sig._cls]}</span>
                <span style={{ color: sevColor, fontSize: 9, minWidth: 40 }}>{(sig.severity || '').toUpperCase()}</span>
                <span style={{ color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.name || '(unnamed)'}</span>
                <span style={{ color: MU, fontSize: 9 }}>ds:{sig._datasets.length} gn:{sig._nodes.length}</span>
                <span style={{ color: MU }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '8px 20px 12px', background: 'rgba(255,255,255,0.02)' }}>
                  {sig.description && (
                    <div style={{ color: MU, marginBottom: 8, fontSize: 10 }}>{sig.description.slice(0, 200)}</div>
                  )}

                  {/* matched datasets */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: CY, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>MATCHED DATASETS ({sig._datasets.length})</div>
                    {sig._datasets.length === 0
                      ? <div style={{ color: MU, fontSize: 9 }}>none</div>
                      : sig._datasets.map((d, di) => (
                          <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ color: CY, fontSize: 10, flex: 1 }}>{d.name || d.title || d.id}</span>
                            <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(d._rel * 100)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{Math.round(d._rel * 100)}%</span>
                          </div>
                        ))
                    }
                  </div>

                  {/* matched graph nodes */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: AM, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>MATCHED GRAPH NODES ({sig._nodes.length})</div>
                    {sig._nodes.length === 0
                      ? <div style={{ color: MU, fontSize: 9 }}>none</div>
                      : sig._nodes.map((n, ni) => (
                          <div key={ni} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ color: AM, fontSize: 10, flex: 1 }}>{n.id || n.label || n.name}</span>
                            <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(n._rel * 100)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: MU, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{Math.round(n._rel * 100)}%</span>
                          </div>
                        ))
                    }
                  </div>

                  {/* assess */}
                  <button
                    onClick={() => assess(sig)}
                    disabled={assessing === aKey}
                    style={{ background: 'none', border: `1px solid ${CY}`, color: CY, fontFamily: MONO, fontSize: 9, padding: '3px 8px', cursor: assessing === aKey ? 'wait' : 'pointer', borderRadius: 3 }}
                  >
                    {assessing === aKey ? '…assessing' : '▶ ASSESS'}
                  </button>
                  {assessText[aKey] && (
                    <div style={{ color: '#c0d4e0', marginTop: 8, fontSize: 10, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{assessText[aKey]}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: '5px 14px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', color: MU, fontSize: 9 }}>
        <span>showing {displayed.length} / {rows.length}</span>
        <span>60 s auto-refresh</span>
      </div>
    </div>
  );
}

// ── JarvisBrain integration ──────────────────────────────────────────────────

const RDGN_TRIGGERS = [
  'risk dataset graph', 'rdgn', 'floating risks', 'risk data foundation',
  'risk graph', 'risk centrality', 'risk without data', 'risk dataset nexus',
  'grounded risks', 'which risks have data', 'data-backed risks',
];

export function isRdgnQuery(q) {
  const lq = (q || '').toLowerCase();
  return RDGN_TRIGGERS.some(t => lq.includes(t));
}

export async function buildRdgnScript() {
  try {
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [sigRaw, dsRaw, nodesRaw] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.json()),
      fetch(`${API}/v1/datasets`,         { headers: h }).then(r => r.json()),
      fetch(`${API}/v1/graph/centrality`, { headers: h }).then(r => r.json()),
    ]);
    const signals  = Array.isArray(sigRaw)           ? sigRaw
                   : Array.isArray(sigRaw?.items)     ? sigRaw.items
                   : Array.isArray(sigRaw?.results)   ? sigRaw.results : [];
    const datasets = Array.isArray(dsRaw)            ? dsRaw
                   : Array.isArray(dsRaw?.datasets)  ? dsRaw.datasets
                   : Array.isArray(dsRaw?.items)      ? dsRaw.items : [];
    const nodes    = Array.isArray(nodesRaw)         ? nodesRaw
                   : Array.isArray(nodesRaw?.nodes)  ? nodesRaw.nodes
                   : Array.isArray(nodesRaw?.items)  ? nodesRaw.items : [];

    let fullG = 0, dataBacked = 0, graphMapped = 0, floating = 0;
    signals.forEach(sig => {
      const toks = tokens([sig.name, sig.description, sig.source, sig.severity, ...(sig.tags || [])].join(' '));
      const { cls } = classify(toks, datasets, nodes);
      if (cls === 'FULLY_GROUNDED') fullG++;
      else if (cls === 'DATA_BACKED') dataBacked++;
      else if (cls === 'GRAPH_MAPPED') graphMapped++;
      else floating++;
    });
    return `JARVIS RDGN REPORT: ${signals.length} risk signals assessed against ${datasets.length} datasets and ${nodes.length} graph centrality nodes. ` +
      `${fullG} fully grounded (data + graph), ${dataBacked} data-backed only, ${graphMapped} graph-mapped only. ` +
      `${floating} signals are floating with no dataset or graph representation — these require immediate data-source and graph-mapping attention.`;
  } catch {
    return 'RDGN: Unable to fetch risk signal, dataset, or graph data for nexus assessment.';
  }
}
