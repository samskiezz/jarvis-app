/**
 * DatasetGraphInvestigationNexus — F53
 *
 * Fetches /v1/datasets + /v1/graph/centrality + /v1/investigations
 * Cross-references each dataset against graph centrality nodes AND investigations:
 *   ANCHORED — matched both a graph node AND an investigation (fully networked)
 *   TRACED   — matched a graph node only (in the graph, no open case)
 *   DATAED   — matched an investigation only (case exists, not in graph)
 *   DARK     — no match in either (isolated dataset — no graph presence, no investigation)
 *
 * Toggle: ◈ DGNEX button (fixed, bottom strip) left:78040, zIndex:150
 * Stat tiles: datasets / nodes / investigations / anchored / traced / dataed / dark
 * Amber pulse on DARK count.
 * Expandable rows: matched graph nodes with centrality score + matched investigations with status badge.
 * Filter tabs: ALL / ANCHORED / TRACED / DATAED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "dataset graph investigation"/"evidence network"/"dgnex"/"dataset network"/
 *        "dataset investigation graph"/"data network"/"graph dataset"/"evidence dataset"/"network coverage"
 * Event: jarvis:dgnex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ANCHORED', 'TRACED', 'DATAED', 'DARK'];

const CLS_COLOR = {
  ANCHORED: '#00E5A0',
  TRACED:   '#29E7FF',
  DATAED:   '#A78BFA',
  DARK:     '#FFB800',
};

const STATUS_COLOR = {
  open:        '#FF4444',
  active:      '#FF8800',
  closed:      '#00E5A0',
  completed:   '#00E5A0',
  resolved:    '#00E5A0',
  pending:     '#FFB800',
  in_progress: '#29E7FF',
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

function classifyDataset(dsToks, nodes, investigations) {
  const matchedNodes = nodes.filter(n =>
    overlaps(dsToks, [n.name, n.id, n.label, n.type, n.category, n.description, n.entity, n.domain, n.source].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(dsToks, [inv.title, inv.name, inv.description, inv.type, inv.category, inv.tags, inv.source, inv.subject, inv.domain].join(' '))
  );
  const hasNode = matchedNodes.length > 0;
  const hasInv  = matchedInvestigations.length > 0;
  const cls = hasNode && hasInv ? 'ANCHORED'
            : hasNode           ? 'TRACED'
            : hasInv            ? 'DATAED'
            : 'DARK';
  return { cls, matchedNodes: matchedNodes.slice(0, 4), matchedInvestigations: matchedInvestigations.slice(0, 4) };
}

export function isDgnexQuery(q) {
  return /\b(dgnex|dataset.graph.invest|evidence.network|dataset.network|data.network|graph.dataset|evidence.dataset|network.coverage|dataset.investigation.graph|graph.invest)\b/i.test(q);
}
export function buildDgnexScript() {
  return 'Opening Dataset × Graph × Investigation Evidence Network. Cross-referencing each dataset against graph centrality nodes and open investigations to identify which datasets are fully anchored in the knowledge network.';
}

export default function DatasetGraphInvestigationNexus() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [nodeCount, setNodeCount]   = useState(0);
  const [invCount, setInvCount]     = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [dsRes, grRes, invRes] = await Promise.all([
        fetch(`${API}/v1/datasets`,          { headers: h }),
        fetch(`${API}/v1/graph/centrality`,  { headers: h }),
        fetch(`${API}/v1/investigations`,    { headers: h }),
      ]);
      const [dsRaw, grRaw, invRaw] = await Promise.all([
        dsRes.ok  ? dsRes.json()  : [],
        grRes.ok  ? grRes.json()  : [],
        invRes.ok ? invRes.json() : [],
      ]);

      const datasets       = normalizeArray(dsRaw,  ['items','data','results','datasets','list']);
      const nodes          = normalizeArray(grRaw,  ['items','data','results','nodes','centrality','graph','entities']);
      const investigations = normalizeArray(invRaw, ['items','data','results','investigations','cases','list']);

      setNodeCount(nodes.length);
      setInvCount(investigations.length);

      const built = datasets.map((d, i) => {
        const id    = d.id || d.dataset_id || `ds-${i}`;
        const name  = d.name || d.title || d.label || id;
        const type  = d.type || d.category || d.format || '';
        const rows  = d.row_count || d.rows || d.record_count || d.count || null;
        const toks  = tokens([name, type, d.description, d.tags, d.source, d.domain, d.schema, d.table, d.subject].join(' '));
        const { cls, matchedNodes, matchedInvestigations } = classifyDataset(toks, nodes, investigations);
        return { id, name, type, rows, _cls: cls, _nodes: matchedNodes, _investigations: matchedInvestigations };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:dgnex-toggle', handler);
    return () => window.removeEventListener('jarvis:dgnex-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { ANCHORED: 0, TRACED: 0, DATAED: 0, DARK: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const darkNames = rows.filter(r => r._cls === 'DARK').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `Dataset × Graph × Investigation Evidence Network: ${rows.length} datasets cross-referenced against ${nodeCount} graph centrality nodes and ${invCount} open investigations. ${counts.ANCHORED} datasets are ANCHORED (present in both the graph and an investigation — fully networked evidence). ${counts.TRACED} are TRACED (in the graph but no investigation — graph-visible but not under active inquiry). ${counts.DATAED} are DATAED (in an investigation but absent from the graph — case exists but not graph-integrated). ${counts.DARK} datasets are DARK — no graph presence and no investigation linkage whatsoever, representing potential blind spots in the evidence network.${darkNames ? ` Dark datasets include: ${darkNames}.` : ''} Assess the overall evidence network coverage, identify which dark datasets pose the highest intelligence risk, and recommend priority actions to anchor them into the knowledge graph or open investigations.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing, nodeCount, invCount]);

  const counts = { ANCHORED: 0, TRACED: 0, DATAED: 0, DARK: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.type, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  const PANEL = {
    position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
    width: 740, maxHeight: '78vh', zIndex: 150,
    background: 'rgba(8,12,20,0.97)', border: '1px solid #FFB800',
    borderRadius: 8, display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#ccc', overflow: 'hidden',
    boxShadow: '0 0 32px rgba(255,184,0,0.15)',
  };

  if (!open) {
    return (
      <>
        <style>{`@keyframes dgnex-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 78040, zIndex: 150,
            background: 'rgba(255,184,0,0.10)', border: '1px solid #FFB800',
            color: '#FFB800', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ DGNEX{counts.DARK > 0 && (
            <span style={{
              marginLeft: 4, background: '#FFB800', color: '#000',
              borderRadius: 8, padding: '0 4px', fontSize: 8,
              animation: 'dgnex-pulse 1.4s infinite',
            }}>{counts.DARK}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes dgnex-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#FFB800', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ DATASET EVIDENCE NETWORK</span>
          <span style={{ fontSize: 10, color: '#888' }}>Dataset × Graph × Investigation</span>
          <span style={{ flex: 1 }} />
          {loading && <span style={{ color: '#888', fontSize: 10 }}>loading…</span>}
          {error && <span style={{ color: '#FF4444', fontSize: 10 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          {[
            { label: 'DATASETS',     val: rows.length,       color: '#ccc' },
            { label: 'NODES',        val: nodeCount,          color: '#29E7FF' },
            { label: 'CASES',        val: invCount,           color: '#A78BFA' },
            { label: 'ANCHORED',     val: counts.ANCHORED,   color: '#00E5A0' },
            { label: 'TRACED',       val: counts.TRACED,     color: '#29E7FF' },
            { label: 'DATAED',       val: counts.DATAED,     color: '#A78BFA' },
            { label: 'DARK',         val: counts.DARK,       color: '#FFB800', pulse: counts.DARK > 0 },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4,
              padding: '5px 4px', textAlign: 'center',
              border: `1px solid ${color}22`,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse ? 'dgnex-pulse 1.4s infinite' : 'none',
              }}>{val}</div>
              <div style={{ fontSize: 8, color: '#666', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter + search */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #222', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#FFB800'}22` : 'none',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#FFB800') : '#333'}`,
              color: tab === t ? (CLS_COLOR[t] || '#FFB800') : '#666',
              fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search datasets…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', fontSize: 10,
              padding: '3px 8px', borderRadius: 3, outline: 'none', width: 160,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#444', padding: 20, fontSize: 11 }}>No datasets match current filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 14px', cursor: 'pointer',
                  borderBottom: '1px solid #181c24',
                  background: expanded === row.id ? 'rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: `${CLS_COLOR[row._cls]}22`,
                  border: `1px solid ${CLS_COLOR[row._cls]}`,
                  color: CLS_COLOR[row._cls], letterSpacing: 0.5, minWidth: 68, textAlign: 'center',
                }}>{row._cls}</span>
                <span style={{ flex: 1, fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                {row.type && <span style={{ fontSize: 9, color: '#666' }}>{row.type}</span>}
                {row.rows != null && (
                  <span style={{ fontSize: 9, color: '#555' }}>{row.rows.toLocaleString()} rows</span>
                )}
                <span style={{ fontSize: 9, color: '#555' }}>
                  {row._nodes.length}◉ {row._investigations.length}⚑
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
              {expanded === row.id && (
                <div style={{ padding: '8px 20px 10px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #181c24' }}>
                  {row._nodes.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>GRAPH NODES ({row._nodes.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._nodes.map((n, i) => (
                          <span key={i} style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 10,
                            background: 'rgba(41,231,255,0.10)', border: '1px solid #29E7FF33',
                            color: '#29E7FF',
                          }}>
                            {n.name || n.label || n.id || 'Node'}
                            {(n.centrality != null || n.score != null) && (
                              <span style={{ marginLeft: 4, color: '#29E7FF88' }}>
                                {(n.centrality || n.score || 0).toFixed ? (n.centrality || n.score || 0).toFixed(3) : (n.centrality || n.score)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {row._investigations.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>INVESTIGATIONS ({row._investigations.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._investigations.map((inv, i) => {
                          const status = (inv.status || inv.state || '').toLowerCase();
                          const sc = STATUS_COLOR[status] || '#888';
                          return (
                            <span key={i} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 10,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33',
                              color: '#A78BFA',
                            }}>
                              {inv.title || inv.name || 'Untitled'}
                              {status && (
                                <span style={{ marginLeft: 4, color: sc }}>{status.toUpperCase()}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {row._nodes.length === 0 && row._investigations.length === 0 && (
                    <div style={{ color: '#FFB800', fontSize: 10 }}>⚠ No graph nodes or investigations found for this dataset — fully dark.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.05)' : 'rgba(255,184,0,0.12)',
              border: '1px solid #FFB800', color: '#FFB800',
              fontSize: 10, padding: '4px 14px', borderRadius: 3, cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS EVIDENCE NETWORK'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,184,0,0.05)',
              border: '1px solid #FFB80022', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
