import { useState, useEffect, useCallback } from 'react';

const API = '';

const IGNTRI_RE = /\b(investment[._-]?graph[._-]?risk|igntri|portfolio[._-]?triple|triple[._-]?exposure|invest[._-]?triple|graph[._-]?risk[._-]?invest|portfolio[._-]?graph[._-]?risk|invest[._-]?node[._-]?risk)\b/i;

export function isIgntriQuery(t) {
  return IGNTRI_RE.test(t || '');
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:          inv.id || String(i),
    name:        inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    sector:      inv.sector || inv.industry || inv.asset_class || inv.type || '',
    ticker:      inv.ticker || inv.symbol || '',
    notes:       String(inv.notes || inv.description || inv.summary || '').slice(0, 300),
    tags:        Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
    region:      inv.region || inv.country || inv.geography || '',
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'items', 'results', 'data', 'centrality', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((n, i) => ({
    id:        n.id || String(i),
    label:     n.label || n.name || n.entity || `Node ${i + 1}`,
    type:      n.type || n.category || n.kind || '',
    influence: typeof n.centrality === 'number' ? n.centrality : (typeof n.score === 'number' ? n.score : 0),
    summary:   String(n.summary || n.description || '').slice(0, 200),
    tags:      Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
  }));
}

function normaliseRisk(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'risks', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:          r.id || String(i),
    name:        r.name || r.title || `Risk ${i + 1}`,
    category:    r.category || r.type || r.sector || '',
    severity:    r.severity || r.level || r.priority || '',
    description: String(r.description || r.summary || r.source || '').slice(0, 300),
    tags:        Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(invToks, other) {
  const otherToks = [
    ...tokens(other.label || other.name || other.title),
    ...tokens(other.summary || other.description),
    ...tokens(other.type || other.category),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!invToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, otherToks.length);
}

function correlate(investments, nodes, risks) {
  return investments.map(inv => {
    const iToks = new Set([
      ...tokens(inv.name),
      ...tokens(inv.sector),
      ...tokens(inv.ticker),
      ...tokens(inv.notes),
      ...tokens(inv.tags),
      ...tokens(inv.region),
    ].filter(Boolean));

    const matchedNodes = nodes
      .map(n => ({ ...n, _score: matchScore(iToks, n) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(iToks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasNode = matchedNodes.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let coverage;
    if (hasNode && hasRisk)  coverage = 'FULLY EXPOSED';
    else if (hasNode)         coverage = 'GRAPH-LINKED';
    else if (hasRisk)         coverage = 'RISK-FLAGGED';
    else                      coverage = 'ISOLATED';

    return { ...inv, _nodes: matchedNodes, _risks: matchedRisks, _coverage: coverage };
  });
}

export async function buildIgntriScript() {
  const [iR, nR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const investments = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
  const nodes       = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
  const risks       = normaliseRisk(rR.status === 'fulfilled' ? rR.value : []);
  const enriched    = correlate(investments, nodes, risks);
  const fe  = enriched.filter(s => s._coverage === 'FULLY EXPOSED').length;
  const gl  = enriched.filter(s => s._coverage === 'GRAPH-LINKED').length;
  const rf  = enriched.filter(s => s._coverage === 'RISK-FLAGGED').length;
  const iso = enriched.filter(s => s._coverage === 'ISOLATED').length;
  return (
    `Investment × Graph Node × Risk Signal Triple Coverage: ${investments.length} investments cross-referenced against ${nodes.length} graph nodes and ${risks.length} risk signals. ` +
    `${fe} investments are FULLY EXPOSED (graph-connected + risk-signal alignment); ${gl} are GRAPH-LINKED (network presence, no active risk); ` +
    `${rf} are RISK-FLAGGED (active risk, no network node); ${iso} are ISOLATED (no intelligence coverage — portfolio intelligence gap). ` +
    `Top fully exposed: ${enriched.filter(s => s._coverage === 'FULLY EXPOSED').slice(0, 3).map(s => s.name || s.id || '?').join(', ') || 'none'}.`
  );
}

const PANEL_W = 660;
const PANEL_H = 600;
const CY  = '#00CFFF';
const TE  = '#14B8A6';
const AM  = '#F59E0B';
const RD  = '#EF4444';
const GR  = '#22C55E';
const PU  = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY EXPOSED': RD,
  'GRAPH-LINKED':  TE,
  'RISK-FLAGGED':  AM,
  'ISOLATED':      '#555',
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

const TABS = ['ALL', 'FULLY EXPOSED', 'GRAPH-LINKED', 'RISK-FLAGGED', 'ISOLATED'];

export default function InvestmentGraphRiskTriple() {
  const [open, setOpen]         = useState(false);
  const [investments, setInvs]  = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iR, nR, rR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const raw_i = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
      const raw_n = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
      const raw_r = normaliseRisk(rR.status === 'fulfilled' ? rR.value : []);
      setInvs(correlate(raw_i, raw_n, raw_r));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:igntri-toggle', toggle);
    return () => window.removeEventListener('jarvis:igntri-toggle', toggle);
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
      const brief = await buildIgntriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Investment × Graph × Risk triple coverage brief: ${brief}. Give a 2-sentence portfolio triple-exposure assessment.` }),
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
    const feCount = investments.filter(i => i._coverage === 'FULLY EXPOSED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Graph Node × Risk Signal Triple Coverage (IGNTRI)"
        style={{
          position: 'fixed', left: 715440, bottom: 8, zIndex: 306,
          background: feCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${feCount > 0 ? RD : CY + '44'}`,
          color: feCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ IGNTRI{feCount > 0 ? ` ⚠${feCount}` : ''}
      </button>
    );
  }

  const fe  = investments.filter(i => i._coverage === 'FULLY EXPOSED').length;
  const gl  = investments.filter(i => i._coverage === 'GRAPH-LINKED').length;
  const rf  = investments.filter(i => i._coverage === 'RISK-FLAGGED').length;
  const iso = investments.filter(i => i._coverage === 'ISOLATED').length;

  const visible = investments.filter(inv =>
    (tab === 'ALL' || inv._coverage === tab) &&
    (!search || inv.name.toLowerCase().includes(search.toLowerCase()) || inv.sector.toLowerCase().includes(search.toLowerCase()))
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
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ INVESTMENT × GRAPH NODE × RISK SIGNAL TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>IGNTRI</span>
        {fe > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {fe} FULLY EXPOSED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['INVESTMENTS', investments.length, CY],
          ['FULLY EXPOSED', fe, RD],
          ['GRAPH-LINKED', gl, TE],
          ['RISK-FLAGGED', rf, AM],
          ['ISOLATED', iso, '#555'],
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
          {investments.length > 0 && [
            [fe, RD], [gl, TE], [rf, AM], [iso, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${investments.filter(i => i._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investments…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No investments match filter.</div>}
        {visible.map(inv => {
          const color = COVERAGE_COLOR[inv._coverage] || CY;
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : inv.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                {inv.sector && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{inv.sector}</span>}
                {inv.ticker && chip(inv.ticker, CY)}
                {chip(inv._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: TE, marginBottom: 4, fontWeight: 700 }}>GRAPH NODES ({inv._nodes.length})</div>
                    {inv._nodes.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No graph node coverage</div>
                      : inv._nodes.map((n, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{n.label}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {n.type && chip(n.type, TE)}
                            {n.influence > 0 && chip(`inf ${n.influence.toFixed(2)}`, '#888')}
                          </div>
                          <ScoreBar score={n._score} color={TE} />
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>RISK SIGNALS ({inv._risks.length})</div>
                    {inv._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No risk signal alignment</div>
                      : inv._risks.map((r, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{r.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {r.category && chip(r.category, AM)}
                            {r.severity && chip(r.severity, r.severity === 'HIGH' || r.severity === 'CRITICAL' ? RD : AM)}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
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
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          padding: '4px 12px', fontSize: 10, background: assessing ? '#1a1a2a' : '#0a0a1a',
          border: `1px solid ${CY}44`, borderRadius: 4, color: CY, cursor: 'pointer',
        }}>
          {assessing ? 'ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={load} disabled={loading} style={{ padding: '4px 8px', fontSize: 10, background: '#0a0a1a', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}>↺</button>
        {assessText && <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>}
        <span style={{ fontSize: 9, color: '#444', flexShrink: 0 }}>{investments.length} investments · 90s</span>
      </div>
    </div>
  );
}
