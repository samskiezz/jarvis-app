import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const GNOESTRI_RE = /\b(gnoestri|graph\s+node\s+ops\s+scen\w*|node\s+ops\s+scen\w*|dark\s+graph\s+node|node\s+operational\s+coverage|graph\s+node\s+coverage\s+triple|node\s+scen\w*\s+ops|ops\s+scen\w*\s+node|graph\s+ops\s+scen\w*|fully\s+covered\s+node|network\s+ops\s+scen\w*)\b/i;

export function isGnoestriQuery(t) { return GNOESTRI_RE.test(t || ''); }

export async function buildGnoestriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [nodeR, opsR, scenR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
  ]);
  const nodeRaw = nodeR.value ?? {};
  const nodes = Array.isArray(nodeRaw) ? nodeRaw : (nodeRaw.nodes ?? nodeRaw.data ?? nodeRaw.results ?? []);
  const opsRaw = opsR.value ?? {};
  const events = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);
  const scenRaw = scenR.value ?? {};
  const scenarios = Array.isArray(scenRaw) ? scenRaw : (scenRaw.scenarios ?? scenRaw.data ?? scenRaw.results ?? []);

  const opsText = events.map(e =>
    `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''} ${e.service ?? ''}`.toLowerCase()
  ).join(' ');
  const scenText = scenarios.map(s =>
    `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.tags ?? ''}`.toLowerCase()
  ).join(' ');

  let fully = 0, opsActive = 0, scenBacked = 0, dark = 0;
  for (const node of nodes) {
    const text = `${node.label ?? node.name ?? node.id ?? ''} ${node.type ?? ''} ${node.category ?? ''} ${node.tags ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasOps = tokens.some(tok => opsText.includes(tok));
    const hasScen = tokens.some(tok => scenText.includes(tok));
    if (hasOps && hasScen) fully++;
    else if (hasOps) opsActive++;
    else if (hasScen) scenBacked++;
    else dark++;
  }
  return `GNOESTRI Graph Node × Ops Event × Scenario: ${nodes.length} graph nodes assessed against ` +
    `${events.length} ops events and ${scenarios.length} scenario playbooks. ` +
    `FULLY COVERED: ${fully} (ops event triggered + scenario planned). OPS-ACTIVE: ${opsActive} (live trigger, no response plan). ` +
    `SCENARIO-BACKED: ${scenBacked} (plan exists, no live trigger). DARK: ${dark} (no operational or scenario coverage — network gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY COVERED': '#4ade80',
  'OPS-ACTIVE': '#fb923c',
  'SCENARIO-BACKED': '#818cf8',
  DARK: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreEvents(node, events) {
  const text = `${node.label ?? node.name ?? node.id ?? ''} ${node.type ?? ''} ${node.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const e of events) {
    const eText = `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''} ${e.service ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => eText.includes(tok));
    if (hits.length > 0) matched.push({ item: e, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreScenarios(node, scenarios) {
  const text = `${node.label ?? node.name ?? node.id ?? ''} ${node.type ?? ''} ${node.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const s of scenarios) {
    const sText = `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.tags ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => sText.includes(tok));
    if (hits.length > 0) matched.push({ item: s, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(node, events, scenarios) {
  const text = `${node.label ?? node.name ?? node.id ?? ''} ${node.type ?? ''} ${node.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const opsText = events.map(e => `${e.title ?? e.name ?? e.type ?? e.id ?? ''} ${e.description ?? ''} ${e.category ?? ''}`.toLowerCase()).join(' ');
  const scenText = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''}`.toLowerCase()).join(' ');
  const hasOps = tokens.some(tok => opsText.includes(tok));
  const hasScen = tokens.some(tok => scenText.includes(tok));
  if (hasOps && hasScen) return 'FULLY COVERED';
  if (hasOps) return 'OPS-ACTIVE';
  if (hasScen) return 'SCENARIO-BACKED';
  return 'DARK';
}

export default function GraphNodeOpsScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [nodeR, opsR, scenR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const nodeRaw = nodeR.value ?? {};
      const nds = Array.isArray(nodeRaw) ? nodeRaw : (nodeRaw.nodes ?? nodeRaw.data ?? nodeRaw.results ?? []);
      const opsRaw = opsR.value ?? {};
      const evts = Array.isArray(opsRaw) ? opsRaw : (opsRaw.events ?? opsRaw.data ?? opsRaw.results ?? []);
      const scenRaw = scenR.value ?? {};
      const scens = Array.isArray(scenRaw) ? scenRaw : (scenRaw.scenarios ?? scenRaw.data ?? scenRaw.results ?? []);
      setNodes(nds);
      setEvents(evts);
      setScenarios(scens);
      setRows(nds.map(n => ({
        n,
        state: correlate(n, evts, scens),
        leftMatched: scoreEvents(n, evts),
        rightMatched: scoreScenarios(n, scens),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnoestri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gnoestri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCount = rows.filter(r => r.state === 'FULLY COVERED').length;
  const opsCount = rows.filter(r => r.state === 'OPS-ACTIVE').length;
  const scenCount = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const darkCount = rows.filter(r => r.state === 'DARK').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const text = `${r.n.label ?? r.n.name ?? r.n.id ?? ''} ${r.n.type ?? ''} ${r.n.category ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.n.label ?? row.n.name ?? row.n.id ?? 'graph node';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const opsNames = row.leftMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.type ?? m.item.id ?? '?').join(', ');
      const scenNames = row.rightMatched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY COVERED'
        ? `has both ops event coverage (${opsNames || 'found'}) and scenario playbook alignment (${scenNames || 'found'})`
        : row.state === 'OPS-ACTIVE'
          ? `has active ops event coverage (${opsNames || 'found'}) but no scenario response plan`
          : row.state === 'SCENARIO-BACKED'
            ? `has scenario playbook alignment (${scenNames || 'found'}) but no active ops event trigger`
            : 'has NO ops event or scenario coverage — network operational gap';
      const prompt = `Graph node "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational coverage status of this network node.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 789360, bottom: 8, zIndex: 438,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ GNOESTRI — GRAPH NODE × OPS EVENT × SCENARIO</span>
        {darkCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{darkCount} DARK</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Graph Nodes', val: nodes.length },
          { label: 'Fully Covered', val: fullyCount, color: '#4ade80' },
          { label: 'Ops-Active', val: opsCount, color: '#fb923c' },
          { label: 'Scen-Backed', val: scenCount, color: '#818cf8' },
          { label: 'Dark', val: darkCount, color: '#ef4444' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyCount / rows.length) * 100)}%`, background: '#4ade80', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((opsCount / rows.length) * 100)}%`, background: '#fb923c', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((scenCount / rows.length) * 100)}%`, background: '#818cf8', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCount / rows.length) * 100) : 0}% fully covered · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY COVERED', 'OPS-ACTIVE', 'SCENARIO-BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'DARK' ? '#fff' : '#000') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search graph nodes…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no graph nodes match</div>
        )}
        {visible.map((row, i) => {
          const id = row.n.label ?? row.n.name ?? row.n.id ?? `node-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.n.type && (
                  <span style={{ fontSize: 10, color: '#22d3ee', background: 'rgba(34,211,238,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.n.type}</span>
                )}
                {row.n.category && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.n.category}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4, color: '#4ade80', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Ops Events */}
                    <div>
                      <div style={{ fontSize: 10, color: '#fb923c', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>OPS EVENTS ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no ops event matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.type ?? m.item.id ?? `event-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fdba74' }}>{n}</span>
                              {m.item.severity && (
                                <span style={{ fontSize: 9, color: '#fb923c', background: 'rgba(251,146,60,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.severity}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#fb923c', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Scenarios */}
                    <div>
                      <div style={{ fontSize: 10, color: '#818cf8', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>SCENARIOS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no scenario matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `scenario-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd' }}>{n}</span>
                              {m.item.status && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.status}</span>
                              )}
                              {m.item.category && !m.item.status && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#818cf8', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
