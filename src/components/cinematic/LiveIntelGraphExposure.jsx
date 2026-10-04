import { useState, useEffect, useCallback } from 'react';

const API = '';
const LGCE_RE = /\b(live[._-]?graph|graph[._-]?exposure|graph[._-]?live|active[._-]?nodes?|world[._-]?graph|node[._-]?exposure|live[._-]?node|network[._-]?exposure|lgce|exposed[._-]?graph|graph[._-]?world[._-]?event|which[._-]?nodes?[._-]?are[._-]?active|graph[._-]?intel)\b/i;

export function isLgceQuery(t) {
  return LGCE_RE.test(t || '');
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'nodes', 'events', 'entities', 'records', 'centrality']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseIntel(raw) {
  if (!raw) return [];
  const out = [];
  if (raw.earthquakes) {
    for (const e of raw.earthquakes) {
      const place = e.place || e.location || '';
      const mag = e.magnitude || e.mag || '';
      out.push({ type: 'SEISMIC', label: `M${mag} ${place}`, tokens: tokenise(`${place} earthquake seismic quake`) });
    }
  }
  if (raw.crypto) {
    for (const c of raw.crypto) {
      const sym = c.symbol || c.name || '';
      out.push({ type: 'CRYPTO', label: sym, tokens: tokenise(`${sym} crypto bitcoin blockchain digital asset`) });
    }
  }
  if (raw.fx) {
    for (const f of raw.fx) {
      const pair = f.pair || f.symbol || f.name || '';
      out.push({ type: 'FX', label: pair, tokens: tokenise(`${pair} forex currency exchange rate`) });
    }
  }
  return out;
}

function tokenise(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(node, events) {
  const nodeToks = new Set([
    ...tokenise(node.id),
    ...tokenise(node.name),
    ...tokenise(node.label),
    ...tokenise(node.type),
    ...tokenise(node.description),
    ...tokenise(node.sector),
    ...tokenise(node.category),
  ].filter(Boolean));
  if (!nodeToks.size) return [];
  const matched = [];
  for (const ev of events) {
    let hits = 0;
    for (const t of ev.tokens) if (nodeToks.has(t)) hits++;
    if (hits > 0) matched.push({ ev, score: hits / Math.max(nodeToks.size, ev.tokens.length) });
  }
  return matched.sort((a, b) => b.score - a.score).slice(0, 4);
}

function correlate(nodes, events) {
  return nodes.map(node => {
    const matches = matchScore(node, events);
    return { ...node, _linked: matches.length > 0, _matches: matches };
  });
}

export async function buildLgceScript() {
  const [intelR, graphR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
  ]);
  const intel = normaliseIntel(intelR.status === 'fulfilled' ? intelR.value : {});
  const nodes = normaliseArray(graphR.status === 'fulfilled' ? graphR.value : []);
  const enriched = correlate(nodes, intel);
  const activated = enriched.filter(n => n._linked).length;
  const dormant = enriched.length - activated;
  return (
    `Live Intel × Graph Centrality: ${nodes.length} influence nodes, ${intel.length} live world events. ` +
    `${activated} high-centrality nodes are activated by live world events; ${dormant} are dormant. ` +
    `Top activated: ${enriched.filter(n => n._linked).slice(0, 4).map(n => n.name || n.id || n.label || '?').join(', ') || 'none'}.`
  );
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const VI = '#8B5CF6';

const TYPE_COLOR = { SEISMIC: RD, CRYPTO: CY, FX: AM };

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function LiveIntelGraphExposure() {
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
      const [intelR, graphR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
      ]);
      setEvents(normaliseIntel(intelR.status === 'fulfilled' ? intelR.value : {}));
      setNodes(normaliseArray(graphR.status === 'fulfilled' ? graphR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lgce-toggle', onToggle);
    return () => window.removeEventListener('jarvis:lgce-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 60000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(nodes, events);
  const activated = enriched.filter(n => n._linked);
  const dormant = enriched.filter(n => !n._linked);
  const badgeCount = activated.length;
  const badgeColor = badgeCount > 0 ? CY : GR;

  const filtered = enriched
    .filter(n => tab === 'ALL' || (tab === 'ACTIVATED' ? n._linked : !n._linked))
    .filter(n => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(n.name || '').toLowerCase().includes(s) ||
        String(n.id || '').toLowerCase().includes(s) ||
        String(n.label || '').toLowerCase().includes(s) ||
        String(n.type || '').toLowerCase().includes(s)
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
          message: `You have ${nodes.length} high-centrality graph nodes and ${events.length} live world events. ${activated.length} nodes are activated by current world events; ${dormant.length} are dormant. Give a 2-sentence network-exposure brief identifying the key activated domains and what it signals for operational priorities.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const nodeLabel = n => n.name || n.label || n.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Live Intel × Graph Exposure (LGCE)"
        style={{
          position: 'fixed', left: 598640, bottom: 8, zIndex: 225,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ LGCE
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
          width: PANEL_W, height: PANEL_H, zIndex: 9210,
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
              ◈ LIVE INTEL × GRAPH CENTRALITY EXPOSURE
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
              { label: 'GRAPH NODES', val: nodes.length, col: VI },
              { label: 'LIVE EVENTS', val: events.length, col: AM },
              { label: 'ACTIVATED', val: activated.length, col: CY },
              { label: 'DORMANT', val: dormant.length, col: GR },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'ACTIVATED', 'DORMANT'].map(t => (
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
            ) : filtered.map((node, i) => {
              const isExp = expanded === i;
              const statusColor = node._linked ? CY : GR;
              return (
                <div key={node.id || i} style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{nodeLabel(node)}</span>
                    {node.type && chip(node.type, VI)}
                    {node.score != null && (
                      <span style={{ color: '#6E8AA0', fontSize: 9 }}>
                        centrality {typeof node.score === 'number' ? node.score.toFixed(3) : node.score}
                      </span>
                    )}
                    {chip(node._linked ? 'ACTIVATED' : 'DORMANT', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {node._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED LIVE EVENTS
                          </div>
                          {node._matches.map(({ ev, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {chip(ev.type, TYPE_COLOR[ev.type] || AM)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{ev.label}</span>
                              {scorebar(score, TYPE_COLOR[ev.type] || AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No live events matched this node.</div>
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
