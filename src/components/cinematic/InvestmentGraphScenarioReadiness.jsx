/**
 * F442 — Investment × Graph Centrality × Scenario Readiness (IGSR)
 *
 * Answers: "Which investments are both represented in the influence graph AND
 * covered by a response scenario — and which are completely unpositioned?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Investment      → investment portfolio
 *   GET /v1/graph/centrality      → top-influence graph nodes
 *   GET /v1/scenario/list         → response scenarios
 *
 * Classification:
 *   FULLY_POSITIONED — investment matches ≥1 graph node AND ≥1 scenario
 *   GRAPH_ONLY       — matches graph node(s) but no scenario coverage
 *   SCENARIO_ONLY    — matches scenario(s) but not in influence graph
 *   ISOLATED         — no graph match, no scenario match
 *
 * Stat tiles:  investments / graph nodes / scenarios / isolated
 * Amber badge: isolated count on button
 * Expand row:  matched graph nodes (influence score + relevance bar, max 5)
 *              matched scenarios (status badge + relevance bar, max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ IGSR  at left:7620 bottom:18, zIndex:68
 * Event:   jarvis:igsr-toggle
 * Voice:   "investment graph scenario / igsr / isolated investment /
 *           positioned investment / graph investment / scenario investment /
 *           investment readiness / investment coverage / investment graph centrality"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const PU   = '#8B5CF6';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'FULLY_POSITIONED', 'GRAPH_ONLY', 'SCENARIO_ONLY', 'ISOLATED'];
const CLASS_COLOR = {
  FULLY_POSITIONED: GR,
  GRAPH_ONLY:       CY,
  SCENARIO_ONLY:    PU,
  ISOLATED:         RD,
};
const CLASS_LABEL = {
  FULLY_POSITIONED: 'FULLY POSITIONED',
  GRAPH_ONLY:       'GRAPH ONLY',
  SCENARIO_ONLY:    'SCENARIO ONLY',
  ISOLATED:         'ISOLATED',
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const IGSR_RE =
  /\b(investment[._-]?graph[._-]?scenario|igsr|isolated[._-]?investment|positioned[._-]?investment|graph[._-]?investment|scenario[._-]?investment|investment[._-]?readiness|investment[._-]?coverage|investment[._-]?graph[._-]?centrality)\b/i;

export function isIgsrQuery(t) {
  return IGSR_RE.test(t || '');
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function keywords(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(invKw, otherText) {
  const otherKw = keywords(otherText);
  return invKw.filter(w => otherKw.includes(w)).length;
}

function investmentText(inv) {
  return [inv.name, inv.title, inv.description, inv.sector, inv.type,
          inv.ticker, inv.category, inv.region,
          Array.isArray(inv.tags) ? inv.tags.join(' ') : inv.tags]
    .filter(Boolean).join(' ');
}

function nodeText(node) {
  return [node.id, node.label, node.name, node.entity_type, node.description,
          Array.isArray(node.tags) ? node.tags.join(' ') : node.tags]
    .filter(Boolean).join(' ');
}

function scenarioText(sc) {
  return [sc.name, sc.title, sc.description, sc.type, sc.objective,
          Array.isArray(sc.tags) ? sc.tags.join(' ') : sc.tags]
    .filter(Boolean).join(' ');
}

function normInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.investments ?? raw?.data ?? []);
  return arr.map(i => ({
    id:     i.id ?? i._id ?? String(Math.random()),
    name:   i.name ?? i.title ?? '(investment)',
    sector: i.sector ?? i.category ?? i.type ?? '',
    _text:  investmentText(i),
  }));
}

function normNodes(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.nodes ?? raw?.items ?? raw?.data ?? []);
  return arr.map(n => ({
    id:        n.id ?? n._id ?? String(Math.random()),
    label:     n.label ?? n.name ?? n.id ?? '(node)',
    influence: n.centrality ?? n.score ?? n.influence ?? 0,
    _text:     nodeText(n),
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.scenarios ?? raw?.data ?? []);
  return arr.map(s => ({
    id:     s.id ?? s._id ?? String(Math.random()),
    name:   s.name ?? s.title ?? '(scenario)',
    status: (s.status ?? 'UNKNOWN').toUpperCase(),
    type:   s.type ?? s.scenario_type ?? '',
    _text:  scenarioText(s),
  }));
}

// ─── fetch helpers ────────────────────────────────────────────────────────────
async function fetchInvestments() {
  const r = await fetch(`${API}/entities/Investment?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/entities/Investment ${r.status}`);
  return r.json();
}

async function fetchNodes() {
  const r = await fetch(`${API}/v1/graph/centrality`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/graph/centrality ${r.status}`);
  return r.json();
}

async function fetchScenarios() {
  const r = await fetch(`${API}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/scenario/list ${r.status}`);
  return r.json();
}

// ─── JarvisBrain script ───────────────────────────────────────────────────────
export async function buildIgsrScript() {
  try {
    const [invRaw, nodeRaw, scenRaw] = await Promise.all([
      fetchInvestments(), fetchNodes(), fetchScenarios(),
    ]);
    const investments = normInvestments(invRaw);
    const nodes       = normNodes(nodeRaw);
    const scenarios   = normScenarios(scenRaw);

    let full = 0, graphOnly = 0, scenOnly = 0, isolated = 0;
    investments.forEach(inv => {
      const kw = keywords(inv._text);
      const hasGraph = nodes.some(n => relevance(kw, n._text) > 0);
      const hasScen  = scenarios.some(s => relevance(kw, s._text) > 0);
      if (hasGraph && hasScen) full++;
      else if (hasGraph) graphOnly++;
      else if (hasScen) scenOnly++;
      else isolated++;
    });

    const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `IGSR Investment Readiness: ${investments.length} investments correlated against ${nodes.length} graph centrality nodes and ${scenarios.length} response scenarios. Fully positioned (graph + scenario): ${full}, graph-only: ${graphOnly}, scenario-only: ${scenOnly}, isolated (no coverage): ${isolated}. Provide a 2-sentence investment strategic readiness brief.`,
        system_prompt: 'You are JARVIS. Be direct and technical. 2 sentences maximum.',
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response ?? d.message ?? d.content ?? `${full} fully positioned, ${isolated} isolated across ${investments.length} investments.`;
    }
  } catch {}
  return 'Investment graph scenario readiness data unavailable. Check /entities/Investment, /v1/graph/centrality, and /v1/scenario/list endpoints.';
}

// ─── component ───────────────────────────────────────────────────────────────
export default function InvestmentGraphScenarioReadiness() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [scenCount, setScenCount] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [brief,     setBrief]     = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [invRaw, nodeRaw, scenRaw] = await Promise.all([
        fetchInvestments(), fetchNodes(), fetchScenarios(),
      ]);
      const investments = normInvestments(invRaw);
      const nodes       = normNodes(nodeRaw);
      const scenarios   = normScenarios(scenRaw);
      setNodeCount(nodes.length);
      setScenCount(scenarios.length);

      const enriched = investments.map(inv => {
        const kw = keywords(inv._text);
        const matchedNodes = nodes
          .map(n => ({ ...n, _score: relevance(kw, n._text) }))
          .filter(n => n._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5);
        const matchedScen = scenarios
          .map(s => ({ ...s, _score: relevance(kw, s._text) }))
          .filter(s => s._score > 0)
          .sort((a, b) => b._score - a._score)
          .slice(0, 5);

        const hasGraph = matchedNodes.length > 0;
        const hasScen  = matchedScen.length > 0;
        const cls =
          hasGraph && hasScen ? 'FULLY_POSITIONED' :
          hasGraph             ? 'GRAPH_ONLY'        :
          hasScen              ? 'SCENARIO_ONLY'     :
                                 'ISOLATED';

        return { ...inv, _class: cls, _nodes: matchedNodes, _scen: matchedScen };
      });
      setRows(enriched);
    } catch (e) {
      setError(e.message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:igsr-toggle', onToggle);
    return () => window.removeEventListener('jarvis:igsr-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildIgsrScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const isolated = rows.filter(r => r._class === 'ISOLATED').length;
  const full     = rows.filter(r => r._class === 'FULLY_POSITIONED').length;
  const graphOnly = rows.filter(r => r._class === 'GRAPH_ONLY').length;
  const scenOnly  = rows.filter(r => r._class === 'SCENARIO_ONLY').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r._class !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => [...r._nodes, ...r._scen].map(x => x._score)));

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investment × Graph Centrality × Scenario Readiness (IGSR)"
        style={{
          position: 'fixed', left: 7620, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${isolated > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ IGSR
        {isolated > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{isolated}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 720, maxHeight: '76vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ INVESTMENT × GRAPH × SCENARIO READINESS
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${CY}`, borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: `1px solid ${MU}`, borderRadius: 4, color: MU, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, fontFamily: MONO, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap' }}>
        {[
          { label: 'INVESTMENTS',  val: rows.length, color: CY },
          { label: 'GRAPH NODES',  val: nodeCount,   color: GR },
          { label: 'SCENARIOS',    val: scenCount,   color: PU },
          { label: 'ISOLATED',     val: isolated,    color: RD },
          { label: 'FULL POS',     val: full,        color: GR },
          { label: 'GRAPH ONLY',   val: graphOnly,   color: CY },
          { label: 'SCEN ONLY',    val: scenOnly,    color: PU },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 6, padding: '4px 10px', minWidth: 60, textAlign: 'center' }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MU, fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '4px 14px 6px', display: 'flex', gap: 2, borderBottom: `1px solid ${BD}` }}>
          {[
            { cls: 'FULLY_POSITIONED', color: GR },
            { cls: 'GRAPH_ONLY',       color: CY },
            { cls: 'SCENARIO_ONLY',    color: PU },
            { cls: 'ISOLATED',         color: RD },
          ].map(({ cls, color }) => {
            const pct = (rows.filter(r => r._class === cls).length / rows.length) * 100;
            return pct > 0 ? (
              <div key={cls} title={cls} style={{ height: 4, borderRadius: 2, background: color, width: `${pct}%`, transition: 'width .4s' }} />
            ) : null;
          })}
        </div>
      )}

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${BD}`, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(6,182,212,0.15)' : 'none',
            border: `1px solid ${filter === f ? CY : BD}`,
            borderRadius: 4, color: filter === f ? CY : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 7px', cursor: 'pointer',
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 4, color: '#CBD5E1', fontFamily: MONO, fontSize: 10, padding: '2px 8px', outline: 'none', width: 160 }}
        />
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '6px 14px', background: 'rgba(6,182,212,0.06)', borderBottom: `1px solid ${BD}`, color: CY, fontSize: 10, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && <div style={{ padding: '6px 14px', color: RD, fontSize: 10 }}>{error}</div>}

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ padding: 20, textAlign: 'center', color: MU, fontSize: 11 }}>No investments found.</div>
        )}
        {visible.map(row => {
          const isExp = expanded[row.id];
          const clsColor = CLASS_COLOR[row._class] ?? MU;
          return (
            <div key={row.id} style={{ borderBottom: `1px solid ${BD}` }}>
              {/* Row header */}
              <div
                onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer' }}
              >
                <span style={{ color: clsColor, fontSize: 9, fontWeight: 700, minWidth: 110, textAlign: 'right', flexShrink: 0 }}>
                  {CLASS_LABEL[row._class]}
                </span>
                <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                {row.sector && (
                  <span style={{ background: 'rgba(16,185,129,0.12)', color: GR, fontSize: 8, padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                    {row.sector}
                  </span>
                )}
                <span style={{ color: MU, fontSize: 9, flexShrink: 0 }}>
                  {row._nodes.length}◈ {row._scen.length}▶
                </span>
                <span style={{ color: MU, fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 14px 10px 124px' }}>
                  {row._nodes.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 9, marginBottom: 4, fontWeight: 700 }}>GRAPH NODES ({row._nodes.length})</div>
                      {row._nodes.map(node => (
                        <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: MU, fontSize: 8, minWidth: 40, textAlign: 'right', flexShrink: 0 }}>
                            {typeof node.influence === 'number' ? node.influence.toFixed(3) : '—'}
                          </span>
                          <span style={{ color: '#CBD5E1', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
                          <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                            <div style={{ height: 3, borderRadius: 2, background: CY, width: `${(node._score / maxScore) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {row._scen.length > 0 && (
                    <div>
                      <div style={{ color: PU, fontSize: 9, marginBottom: 4, fontWeight: 700 }}>SCENARIOS ({row._scen.length})</div>
                      {row._scen.map(sc => (
                        <div key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {sc.status && (
                            <span style={{ background: 'rgba(139,92,246,0.15)', color: PU, fontSize: 8, padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                              {sc.status}
                            </span>
                          )}
                          <span style={{ color: '#CBD5E1', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
                          <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                            <div style={{ height: 3, borderRadius: 2, background: PU, width: `${(sc._score / maxScore) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {row._nodes.length === 0 && row._scen.length === 0 && (
                    <div style={{ color: MU, fontSize: 9 }}>No graph or scenario matches for this investment.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '4px 14px', borderTop: `1px solid ${BD}`, color: MU, fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
        <span>90 s auto-refresh · {rows.length} investments</span>
        <span>{visible.length} shown</span>
      </div>
    </div>
  );
}
