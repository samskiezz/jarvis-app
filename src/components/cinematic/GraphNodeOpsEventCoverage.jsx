import { useState, useEffect, useCallback } from 'react';

const API = '';
const GNOPS_RE = /\b(graph[._-]?ops?|ops?[._-]?graph|gnops?|graph[._-]?operational|node[._-]?ops?[._-]?coverage|graph[._-]?ops?[._-]?event[s]?|ops?[._-]?graph[._-]?node[s]?|graph[._-]?event[s]?[._-]?coverage|active[._-]?graph[._-]?node[s]?|operational[._-]?node[s]?)\b/i;

export function isGnopsQuery(t) {
  return GNOPS_RE.test(t || '');
}

export async function buildGnopsScript() {
  const [grR, opR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(grR.status === 'fulfilled' ? grR.value : []);
  const events = normaliseEvents(opR.status === 'fulfilled' ? opR.value : []);
  const enriched = correlate(nodes, events);
  const active = enriched.filter(n => n._linked).length;
  const dormant = enriched.filter(n => !n._linked).length;
  return (
    `Graph Node × Ops Event Coverage: ${nodes.length} top-influence graph nodes cross-matched against ${events.length} active ops events. ` +
    `${active} nodes are ACTIVE (at least one ops event covers this node's operational domain); ${dormant} are DORMANT (no ops event touches this node). ` +
    `Top active nodes: ${enriched.filter(n => n._linked).slice(0, 3).map(n => n.label || n.name || '?').join(', ') || 'none'}.`
  );
}

function normaliseNodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'centrality', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseEvents(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['events', 'items', 'results', 'data', 'ops_events']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(node, ev) {
  const nToks = new Set([
    ...tokens(node.label),
    ...tokens(node.name),
    ...tokens(node.type),
    ...tokens(node.category),
    ...tokens(node.description),
  ].filter(Boolean));
  const evToks = [
    ...tokens(ev.name),
    ...tokens(ev.title),
    ...tokens(ev.type),
    ...tokens(ev.category),
    ...tokens(ev.description),
    ...tokens(ev.severity),
  ].filter(Boolean);
  if (!nToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (nToks.has(t)) hits++;
  return hits / Math.max(nToks.size, evToks.length);
}

function correlate(nodes, events) {
  return nodes.map(nd => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(nd, ev) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...nd, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const PU = '#A78BFA';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = AM) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

function sevColor(sev) {
  const s = String(sev || '').toUpperCase();
  if (s === 'CRITICAL') return RD;
  if (s === 'HIGH') return AM;
  if (s === 'WARNING' || s === 'WARN') return AM;
  if (s === 'INFO') return CY;
  return PU;
}

export default function GraphNodeOpsEventCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grR, opR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      setNodes(normaliseNodes(grR.status === 'fulfilled' ? grR.value : []));
      setEvents(normaliseEvents(opR.status === 'fulfilled' ? opR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnops-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gnops-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(nodes, events);
  const active = enriched.filter(n => n._linked);
  const dormant = enriched.filter(n => !n._linked);
  const badgeCount = active.length;
  const badgeColor = badgeCount > 0 ? CY : GR;

  const filtered = enriched
    .filter(n => tab === 'ALL' || (tab === 'ACTIVE' ? n._linked : !n._linked))
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(n.label || '').toLowerCase().includes(q) ||
        String(n.name || '').toLowerCase().includes(q) ||
        String(n.type || '').toLowerCase().includes(q) ||
        String(n.category || '').toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message:
            `You have ${nodes.length} top-influence graph nodes cross-matched against ${events.length} active ops events. ` +
            `${active.length} nodes are ACTIVE (at least one ops event covers this node's operational domain). ` +
            `${dormant.length} are DORMANT (no ops event touches this node — operational blind spot). ` +
            `Top active nodes: ${active.slice(0, 3).map(n => n.label || n.name || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence graph-operational coverage brief: which high-influence nodes are operationally monitored, and which critical nodes have no ops coverage.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const nodeLabel = nd => nd.label || nd.name || nd.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Node × Ops Event Coverage (GNOPS)"
        style={{
          position: 'fixed', left: 684640, bottom: 8, zIndex: 251,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ GNOPS
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9211,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ GRAPH NODE × OPS EVENT COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'GRAPH NODES', val: nodes.length, col: CY },
              { label: 'OPS EVENTS', val: events.length, col: PU },
              { label: 'ACTIVE', val: active.length, col: GR },
              { label: 'DORMANT', val: dormant.length, col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'ACTIVE', 'DORMANT'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No graph nodes found.'}
              </div>
            ) : filtered.map((nd, i) => {
              const isActive = nd._linked;
              const statusColor = isActive ? GR : AM;
              const isExp = expanded === i;
              return (
                <div key={nd.id || i} style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{nodeLabel(nd)}</span>
                    {nd.type && chip(String(nd.type).slice(0, 14), CY)}
                    {nd.category && chip(String(nd.category).slice(0, 12), PU)}
                    {nd.centrality_score != null && (
                      <span style={{ color: '#6E8AA0', fontSize: 9 }}>
                        inf:{Number(nd.centrality_score).toFixed(2)}
                      </span>
                    )}
                    {chip(isActive ? 'ACTIVE' : 'DORMANT', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {nd._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING OPS EVENTS
                          </div>
                          {nd._matches.map(({ ev, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {ev.severity && chip(String(ev.severity).slice(0, 8).toUpperCase(), sevColor(ev.severity))}
                              {ev.type && chip(String(ev.type).slice(0, 12), PU)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {(ev.name || ev.title || ev.description || '—').slice(0, 55)}
                              </span>
                              {scorebar(score, CY)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No ops events match this graph node's domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
