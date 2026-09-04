import { useState, useEffect, useCallback } from 'react';

const API = '';

const GNRSTP_RE = /\b(graph[._-]?node[._-]?risk[._-]?swarm|gnrstp|node[._-]?risk[._-]?swarm|node[._-]?swarm[._-]?risk|node[._-]?defence[._-]?cover|network[._-]?defence[._-]?gap|defended[._-]?node|dark[._-]?node[._-]?swarm|node[._-]?triple|graph[._-]?defence)\b/i;

export function isGnrstpQuery(t) {
  return GNRSTP_RE.test(t || '');
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

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = ['risks', 'risk_signals', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.name || r.title || r.signal || `Risk ${i + 1}`,
    severity: r.severity || r.level || r.priority || '',
    category: r.category || r.type || r.kind || '',
    desc:     String(r.description || r.summary || r.source || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['jobs', 'swarm_jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.job || `Job ${i + 1}`,
    kind:   j.kind || j.type || j.job_type || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.summary || j.target || '').slice(0, 200),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(nodeToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.severity || other.kind || other.category || ''),
    ...tokens(other.status || other.type || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!nodeToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, otherToks.length);
}

function correlate(nodes, risks, jobs) {
  return nodes.map(node => {
    const nToks = new Set([
      ...tokens(node.name),
      ...tokens(node.type),
      ...tokens(node.description),
      ...tokens(node.tags),
    ].filter(Boolean));

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(nToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: matchScore(nToks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasRisk = matchedRisks.length > 0;
    const hasJob  = matchedJobs.length > 0;

    let coverage;
    if (hasRisk && hasJob) coverage = 'FULLY DEFENDED';
    else if (hasRisk)      coverage = 'RISK-ONLY';
    else if (hasJob)       coverage = 'SWARM-ONLY';
    else                   coverage = 'DARK';

    return { ...node, _risks: matchedRisks, _jobs: matchedJobs, _coverage: coverage };
  });
}

export async function buildGnrstpScript() {
  const [nR, rR, jR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
  const risks = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
  const jobs  = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
  const enriched = correlate(nodes, risks, jobs);
  const fd   = enriched.filter(n => n._coverage === 'FULLY DEFENDED').length;
  const ro   = enriched.filter(n => n._coverage === 'RISK-ONLY').length;
  const so   = enriched.filter(n => n._coverage === 'SWARM-ONLY').length;
  const dark = enriched.filter(n => n._coverage === 'DARK').length;
  return (
    `Graph Node × Risk Signal × SwarmJob Triple Coverage: ${nodes.length} top-influence nodes cross-referenced against ${risks.length} risk signals and ${jobs.length} swarm jobs. ` +
    `${fd} FULLY DEFENDED (risk-monitored + swarm-automated); ${ro} RISK-ONLY (risk signal found, no swarm); ` +
    `${so} SWARM-ONLY (swarm coverage, no risk signal); ${dark} DARK (no monitoring — network defence gap). ` +
    `Dark nodes: ${enriched.filter(n => n._coverage === 'DARK').slice(0, 3).map(n => n.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY DEFENDED': GR,
  'RISK-ONLY':      AM,
  'SWARM-ONLY':     LM,
  'DARK':           RD,
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

const TABS = ['ALL', 'FULLY DEFENDED', 'RISK-ONLY', 'SWARM-ONLY', 'DARK'];

export default function GraphNodeRiskSwarmTriple() {
  const [open, setOpen]       = useState(false);
  const [nodes, setNodes]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [nR, rR, jR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`).then(r => r.json()),
      ]);
      const raw_n = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
      const raw_r = normaliseRisks(rR.status === 'fulfilled' ? rR.value : []);
      const raw_j = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
      setNodes(correlate(raw_n, raw_r, raw_j));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnrstp-toggle', toggle);
    return () => window.removeEventListener('jarvis:gnrstp-toggle', toggle);
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
      const brief = await buildGnrstpScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Graph node × risk signal × swarm job triple coverage brief: ${brief}. Give a 2-sentence network defence coverage assessment.` }),
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
        title="Graph Node × Risk Signal × SwarmJob Triple Coverage (GNRSTP)"
        style={{
          position: 'fixed', left: 721600, bottom: 8, zIndex: 317,
          background: darkCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${darkCount > 0 ? RD : CY + '44'}`,
          color: darkCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GNRSTP{darkCount > 0 ? ` ⚠${darkCount}` : ''}
      </button>
    );
  }

  const fd   = nodes.filter(n => n._coverage === 'FULLY DEFENDED').length;
  const ro   = nodes.filter(n => n._coverage === 'RISK-ONLY').length;
  const so   = nodes.filter(n => n._coverage === 'SWARM-ONLY').length;
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ GRAPH NODE × RISK SIGNAL × SWARM JOB TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GNRSTP</span>
        {dark > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {dark} DARK</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['NODES',          nodes.length, CY],
          ['FULLY DEFENDED', fd,   GR],
          ['RISK-ONLY',      ro,   AM],
          ['SWARM-ONLY',     so,   LM],
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
            [fd, GR], [ro, AM], [so, LM], [dark, RD]
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
                  {/* Left: Risk Signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>RISK SIGNALS ({node._risks.length})</div>
                    {node._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No risk signal alignment</div>
                      : node._risks.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.severity && chip(r.severity, r.severity.toUpperCase() === 'CRITICAL' ? RD : AM)}
                            {r.category && chip(r.category, '#888')}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: SwarmJobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({node._jobs.length})</div>
                    {node._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm job alignment</div>
                      : node._jobs.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.kind && chip(j.kind, LM)}
                            {j.status && chip(j.status, '#888')}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
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
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
