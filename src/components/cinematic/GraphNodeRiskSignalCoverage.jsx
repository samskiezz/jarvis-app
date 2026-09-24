import { useState, useEffect, useCallback } from 'react';

const API = '';
const GNSRSK_RE = /\b(graph[._-]?node[._-]?risk|node[._-]?risk[._-]?signal|gnsrsk|graph[._-]?risk[._-]?exposure|node[._-]?risk[._-]?coverage|exposed[._-]?graph[._-]?nodes|graph[._-]?signal|node[._-]?signal[._-]?risk|risk[._-]?graph[._-]?node|which[._-]?nodes[._-]?have[._-]?risk)\b/i;

export function isGnsrskQuery(t) {
  return GNSRSK_RE.test(t || '');
}

export async function buildGnsrskScript() {
  const [grR, rsR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const nodes = normaliseNodes(grR.status === 'fulfilled' ? grR.value : []);
  const signals = normaliseSignals(rsR.status === 'fulfilled' ? rsR.value : []);
  const enriched = correlate(nodes, signals);
  const exposed = enriched.filter(n => n._linked).length;
  const clear = enriched.length - exposed;
  return (
    `Graph Node × Risk Signal Coverage: ${nodes.length} top-influence nodes, ${signals.length} active risk signals. ` +
    `${exposed} nodes are EXPOSED to active risk signals; ${clear} remain CLEAR. ` +
    `Top exposed nodes: ${enriched.filter(n => n._linked).slice(0, 4).map(n => n.label || n.name || n.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseNodes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'centrality', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['signals', 'risk_signals', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(node, signal) {
  const nToks = new Set([
    ...tokens(node.label),
    ...tokens(node.name),
    ...tokens(node.type),
    ...tokens(node.category),
  ].filter(Boolean));
  const sToks = [
    ...tokens(signal.title),
    ...tokens(signal.name),
    ...tokens(signal.description),
    ...tokens(signal.category),
    ...tokens(signal.sector),
    ...tokens(signal.source),
  ].filter(Boolean);
  if (!nToks.size || !sToks.length) return 0;
  let hits = 0;
  for (const t of sToks) if (nToks.has(t)) hits++;
  return hits / Math.max(nToks.size, sToks.length);
}

function correlate(nodes, signals) {
  return nodes.map(node => {
    const scored = signals
      .map(signal => ({ signal, score: matchScore(node, signal) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...node, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const RD = '#F43F5E';

const SEV_COLOR = {
  critical: RD, high: AM, medium: CY, low: GR,
  CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR,
};

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

export default function GraphNodeRiskSignalCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [grR, rsR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      setNodes(normaliseNodes(grR.status === 'fulfilled' ? grR.value : []));
      setSignals(normaliseSignals(rsR.status === 'fulfilled' ? rsR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnsrsk-toggle', onToggle);
    return () => window.removeEventListener('jarvis:gnsrsk-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(nodes, signals);
  const exposed = enriched.filter(n => n._linked);
  const clear = enriched.filter(n => !n._linked);
  const badgeCount = exposed.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(n => tab === 'ALL' || (tab === 'EXPOSED' ? n._linked : !n._linked))
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
          message: `You have ${nodes.length} top-influence graph nodes and ${signals.length} active risk signals. ${exposed.length} nodes are EXPOSED to risk signals; ${clear.length} are CLEAR. Give a 2-sentence graph-risk exposure brief identifying which high-centrality nodes are most at risk and what that means for operational resilience.`,
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
        title="Graph Node × Risk Signal Coverage (GNSRSK)"
        style={{
          position: 'fixed', left: 701440, bottom: 8, zIndex: 281,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ GNSRSK
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
              ◈ GRAPH NODE × RISK SIGNAL
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
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'NODES', val: nodes.length, col: PR },
              { label: 'RISK SIGNALS', val: signals.length, col: AM },
              { label: 'EXPOSED', val: exposed.length, col: RD },
              { label: 'CLEAR', val: clear.length, col: GR },
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
            {['ALL', 'EXPOSED', 'CLEAR'].map(t => (
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
                {loading ? 'Loading…' : 'No nodes found.'}
              </div>
            ) : filtered.map((node, i) => {
              const isExp = expanded === i;
              const statusColor = node._linked ? RD : GR;
              return (
                <div
                  key={node.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
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
                    {chip(node._linked ? 'EXPOSED' : 'CLEAR', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {node._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED RISK SIGNALS
                          </div>
                          {node._matches.map(({ signal, score }, j) => {
                            const sevCol = SEV_COLOR[String(signal.severity || '').toLowerCase()] || AM;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {signal.severity && chip(signal.severity, sevCol)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {signal.title || signal.name || signal.id || '?'}
                                </span>
                                {scorebar(score, RD)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No risk signals matched this node.</div>
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
