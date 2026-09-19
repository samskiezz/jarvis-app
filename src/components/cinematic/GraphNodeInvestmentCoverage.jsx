import { useState, useEffect, useCallback } from 'react';

const API = '';
const GNINV_RE = /\b(graph[._-]?node[._-]?invest|node[._-]?invest|gninv|invest[._-]?node|portfolio[._-]?node|node[._-]?portfolio|portfolio[._-]?graph|graph[._-]?invest|node[._-]?coverage[._-]?invest|invest[._-]?graph[._-]?node|which[._-]?nodes[._-]?have[._-]?invest)\b/i;

export function isGninvQuery(t) {
  return GNINV_RE.test(t || '');
}

function normaliseNodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'centrality', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['investments', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(node, inv) {
  const nToks = new Set([
    ...tokens(node.label),
    ...tokens(node.name),
    ...tokens(node.type),
    ...tokens(node.category),
  ].filter(Boolean));
  const iToks = [
    ...tokens(inv.name),
    ...tokens(inv.sector),
    ...tokens(inv.ticker),
    ...tokens(inv.notes),
    ...(Array.isArray(inv.tags) ? inv.tags.flatMap(tokens) : tokens(inv.tags)),
    ...tokens(inv.description),
    ...tokens(inv.asset_class),
  ].filter(Boolean);
  if (!nToks.size || !iToks.length) return 0;
  let hits = 0;
  for (const t of iToks) if (nToks.has(t)) hits++;
  return hits / Math.max(nToks.size, iToks.length);
}

function correlate(nodes, investments) {
  return nodes.map(node => {
    const scored = investments
      .map(inv => ({ inv, score: matchScore(node, inv) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...node, _linked: scored.length > 0, _matches: scored };
  });
}

export async function buildGninvScript() {
  const [grR, invR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/Investment`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(grR.status === 'fulfilled' ? grR.value : []);
  const investments = normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []);
  const enriched = correlate(nodes, investments);
  const aligned = enriched.filter(n => n._linked).length;
  const blind = enriched.length - aligned;
  const nodeLabel = n => n.label || n.name || n.id || '?';
  return (
    `Graph Node × Investment Coverage: ${nodes.length} top-influence nodes, ${investments.length} portfolio investments. ` +
    `${aligned} nodes are ALIGNED with investment positions; ${blind} are BLIND (no investment coverage). ` +
    `Top aligned nodes: ${enriched.filter(n => n._linked).slice(0, 4).map(nodeLabel).join(', ') || 'none'}.`
  );
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const TE = '#14B8A6';

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

export default function GraphNodeInvestmentCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grR, invR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/Investment`).then(r => r.json()),
      ]);
      setNodes(normaliseNodes(grR.status === 'fulfilled' ? grR.value : []));
      setInvestments(normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gninv-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gninv-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(nodes, investments);
  const aligned = enriched.filter(n => n._linked);
  const blind = enriched.filter(n => !n._linked);
  const badgeCount = aligned.length;
  const badgeColor = badgeCount > 0 ? AM : '#6E8AA0';

  const filtered = enriched
    .filter(n => tab === 'ALL' || (tab === 'ALIGNED' ? n._linked : !n._linked))
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
          message: `You have ${nodes.length} top-influence graph nodes and ${investments.length} portfolio investments. ${aligned.length} nodes are ALIGNED with investment positions; ${blind.length} are BLIND (no investment coverage in that network domain). Give a 2-sentence portfolio-network coverage brief identifying which high-centrality network domains are covered by investments and which represent unaddressed portfolio blind spots.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const nodeLabel = n => n.label || n.name || n.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Node × Investment Coverage (GNINV)"
        style={{
          position: 'fixed', left: 702560, bottom: 8, zIndex: 283,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ GNINV
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
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ GRAPH NODE × INVESTMENT
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${AM}55`,
                  background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'NODES', val: nodes.length, col: PR },
              { label: 'INVESTMENTS', val: investments.length, col: TE },
              { label: 'ALIGNED', val: aligned.length, col: AM },
              { label: 'BLIND', val: blind.length, col: '#6E8AA0' },
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
            {['ALL', 'ALIGNED', 'BLIND'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
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
                {loading ? 'Loading…' : 'No nodes found.'}
              </div>
            ) : filtered.map((node, i) => {
              const isExp = expanded === i;
              const statusColor = node._linked ? AM : '#6E8AA0';
              return (
                <div
                  key={node.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{nodeLabel(node)}</span>
                    {node.type && chip(node.type, PR)}
                    {node.score != null && (
                      <span style={{ color: '#6E8AA0', fontSize: 9, marginRight: 4 }}>
                        infl:{typeof node.score === 'number' ? node.score.toFixed(3) : node.score}
                      </span>
                    )}
                    {chip(node._linked ? 'ALIGNED' : 'BLIND', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {node._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INVESTMENTS
                          </div>
                          {node._matches.map(({ inv, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {inv.sector && chip(inv.sector, TE)}
                              {inv.asset_class && chip(inv.asset_class, CY)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {inv.name || inv.id || '?'}
                                {inv.ticker ? <span style={{ color: '#6E8AA0', marginLeft: 4 }}>({inv.ticker})</span> : null}
                              </span>
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: '#6E8AA0', fontSize: 10 }}>No investments matched this node domain.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${AM}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(245,158,11,0.03)',
            }}>
              <span style={{ color: AM, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
