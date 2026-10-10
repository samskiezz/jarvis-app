import { useState, useEffect, useCallback } from 'react';

const API = '';

const GNROET_RE = /\b(graph[._-]?node[._-]?report[._-]?ops|gnroet|node[._-]?report[._-]?ops|documented[._-]?node|ops[._-]?active[._-]?node|dark[._-]?network[._-]?node|node[._-]?intelligence[._-]?status|graph[._-]?network[._-]?coverage|node[._-]?report[._-]?ops[._-]?event|graph[._-]?intel[._-]?ops)\b/i;

export function isGnroetQuery(t) {
  return GNROET_RE.test(t || '');
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'centrality', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.slice(0, 40).map((n, i) => ({
    id:          n.id || n.node_id || String(i),
    name:        n.label || n.name || n.node || `Node ${i + 1}`,
    type:        n.type || n.node_type || n.category || '',
    influence:   typeof n.score === 'number' ? n.score : (typeof n.centrality === 'number' ? n.centrality : 0),
    description: String(n.description || n.summary || '').slice(0, 200),
    tags:        Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:      r.id || r.report_id || String(i),
    title:   r.title || r.name || `Report ${i + 1}`,
    type:    r.type || r.report_type || r.category || '',
    summary: String(r.summary || r.description || r.content || '').slice(0, 200),
    tags:    Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseOpsEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'ops_events', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.name || e.title || e.event || `Event ${i + 1}`,
    severity: e.severity || e.level || e.priority || '',
    type:     e.type || e.event_type || e.category || '',
    desc:     String(e.description || e.message || e.summary || '').slice(0, 200),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(nodeToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.type || other.category || other.severity || ''),
    ...tokens(other.desc || other.summary || other.description || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!nodeToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, otherToks.length);
}

function correlate(nodes, reports, opsEvents) {
  return nodes.map(node => {
    const nToks = new Set([
      ...tokens(node.name),
      ...tokens(node.type),
      ...tokens(node.description),
      ...tokens(node.tags),
    ].filter(Boolean));

    const matchedReports = reports
      .map(r => ({ ...r, _score: matchScore(nToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedOps = opsEvents
      .map(e => ({ ...e, _score: matchScore(nToks, e) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasReport = matchedReports.length > 0;
    const hasOps    = matchedOps.length > 0;

    let coverage;
    if (hasReport && hasOps)  coverage = 'FULLY EXPOSED';
    else if (hasReport)       coverage = 'DOCUMENTED';
    else if (hasOps)          coverage = 'OPS-ACTIVE';
    else                      coverage = 'DARK';

    return { ...node, _reports: matchedReports, _ops: matchedOps, _coverage: coverage };
  });
}

export async function buildGnroetScript() {
  const [nR, rR, eR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const nodes    = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
  const reports  = normaliseReports(rR.status === 'fulfilled' ? rR.value : []);
  const opsEvts  = normaliseOpsEvents(eR.status === 'fulfilled' ? eR.value : []);
  const enriched = correlate(nodes, reports, opsEvts);
  const fe   = enriched.filter(n => n._coverage === 'FULLY EXPOSED').length;
  const doc  = enriched.filter(n => n._coverage === 'DOCUMENTED').length;
  const ops  = enriched.filter(n => n._coverage === 'OPS-ACTIVE').length;
  const dark = enriched.filter(n => n._coverage === 'DARK').length;
  return (
    `Graph Node × Report × Ops Event Triple Coverage: ${nodes.length} top-influence nodes cross-referenced against ${reports.length} intelligence reports and ${opsEvts.length} ops events. ` +
    `${fe} FULLY EXPOSED (report documented + ops-monitored); ${doc} DOCUMENTED (report only — historically known); ` +
    `${ops} OPS-ACTIVE (ops event only — detected but undocumented); ${dark} DARK (neither — no intelligence or operational coverage). ` +
    `Dark nodes: ${enriched.filter(n => n._coverage === 'DARK').slice(0, 3).map(n => n.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';

const COVERAGE_COLOR = {
  'FULLY EXPOSED': AM,
  'DOCUMENTED':    CY,
  'OPS-ACTIVE':    GR,
  'DARK':          RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY EXPOSED', 'DOCUMENTED', 'OPS-ACTIVE', 'DARK'];

export default function GraphNodeReportOpsTriple() {
  const [open, setOpen]             = useState(false);
  const [nodes, setNodes]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [nR, rR, eR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      const raw_n = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
      const raw_r = normaliseReports(rR.status === 'fulfilled' ? rR.value : []);
      const raw_e = normaliseOpsEvents(eR.status === 'fulfilled' ? eR.value : []);
      setNodes(correlate(raw_n, raw_r, raw_e));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnroet-toggle', toggle);
    return () => window.removeEventListener('jarvis:gnroet-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildGnroetScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Graph node × report × ops event triple coverage: ${brief}. Give a 2-sentence network intelligence status assessment.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const darkCount = nodes.filter(n => n._coverage === 'DARK').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Node × Report × Ops Event Triple Coverage (GNROET)"
        style={{
          position: 'fixed', left: 732800, bottom: 8, zIndex: 337,
          background: darkCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${darkCount > 0 ? AM : CY + '44'}`,
          color: darkCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GNROET{darkCount > 0 ? ` ⚠${darkCount}` : ''}
      </button>
    );
  }

  const fe   = nodes.filter(n => n._coverage === 'FULLY EXPOSED').length;
  const doc  = nodes.filter(n => n._coverage === 'DOCUMENTED').length;
  const opsA = nodes.filter(n => n._coverage === 'OPS-ACTIVE').length;
  const dark = nodes.filter(n => n._coverage === 'DARK').length;

  const visible = nodes.filter(node =>
    (tab === 'ALL' || node._coverage === tab) &&
    (!search || node.name.toLowerCase().includes(search.toLowerCase()) || node.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ GRAPH NODE × REPORT × OPS EVENT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GNROET</span>
        {dark > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {dark} DARK</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['NODES',          nodes.length, CY],
          ['FULLY EXPOSED',  fe,   AM],
          ['DOCUMENTED',     doc,  CY],
          ['OPS-ACTIVE',     opsA, GR],
          ['DARK',           dark, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {nodes.length > 0 && [
            [fe, AM], [doc, CY], [opsA, GR], [dark, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${nodes.filter(n => n._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search graph nodes…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No graph nodes match filter.</div>}
        {visible.map(node => {
          const color = COVERAGE_COLOR[node._coverage] || CY;
          const isExp = expanded === node.id;
          return (
            <div key={node.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : node.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                {node.type && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{node.type}</span>}
                {node.influence > 0 && chip(`inf ${node.influence.toFixed ? node.influence.toFixed(2) : node.influence}`, CY)}
                {chip(node._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Reports */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>REPORTS ({node._reports.length})</div>
                    {node._reports.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No report documentation</div>
                      : node._reports.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                            {r.type && chip(r.type, AM)}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Ops Events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>OPS EVENTS ({node._ops.length})</div>
                    {node._ops.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No ops event alignment</div>
                      : node._ops.map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                            {e.severity && chip(e.severity, e.severity.toUpperCase() === 'CRITICAL' ? RD : GR)}
                            {e.type && chip(e.type, '#888')}
                          </div>
                          <ScoreBar score={e._score} color={GR} />
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

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
