import { useState, useEffect, useCallback } from 'react';

const API = '';
const RSGC_RE = /\b(risk[._-]?signal[._-]?centrality|risk[._-]?graph[._-]?centrality|graph[._-]?risk[._-]?signal|rsgc|high[._-]?centrality[._-]?risk|risk[._-]?network[._-]?rank|which[._-]?risks?[._-]?are[._-]?central|central[._-]?risk[._-]?signal|risk[._-]?network[._-]?link|network[._-]?risk[._-]?signal)\b/i;

export function isRsgcQuery(t) {
  return RSGC_RE.test(t || '');
}

export async function buildRsgcScript() {
  const [riskR, centR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
  ]);
  const risks = normaliseRisks(riskR.status === 'fulfilled' ? riskR.value : []);
  const nodes = normaliseCentrality(centR.status === 'fulfilled' ? centR.value : []);
  const enriched = correlate(risks, nodes);
  const high = enriched.filter(r => r._linked);
  return (
    `Risk Signal × Graph Centrality: ${risks.length} risk signals cross-referenced against ${nodes.length} central graph nodes. ` +
    `${high.length} risks are linked to highly-central network entities; ${enriched.length - high.length} appear peripheral. ` +
    `Top networked risks: ${high.slice(0, 4).map(r => r.name || r.title || r.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseRisks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'risks', 'entities', 'records', 'risk_signals']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseCentrality(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['nodes', 'items', 'results', 'data', 'centrality']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(risk, node) {
  const riskToks = new Set([
    ...tokens(risk.name),
    ...tokens(risk.title),
    ...tokens(risk.category),
    ...tokens(risk.sector),
    ...tokens(risk.description),
    ...tokens(risk.source),
  ].filter(Boolean));
  const nodeToks = [
    ...tokens(node.name),
    ...tokens(node.label),
    ...tokens(node.type),
    ...tokens(node.id),
  ].filter(Boolean);
  if (!riskToks.size || !nodeToks.length) return 0;
  let hits = 0;
  for (const t of nodeToks) if (riskToks.has(t)) hits++;
  return hits / Math.max(riskToks.size, nodeToks.length);
}

function correlate(risks, nodes) {
  return risks.map(risk => {
    const scored = nodes
      .map(n => ({ node: n, score: matchScore(risk, n) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...risk, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const PU = '#A78BFA';

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

const SEV_COLOR = { high: RD, medium: AM, low: GR, critical: RD };

export default function RiskSignalGraphCentrality() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [riskR, centR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
      ]);
      setRisks(normaliseRisks(riskR.status === 'fulfilled' ? riskR.value : []));
      setNodes(normaliseCentrality(centR.status === 'fulfilled' ? centR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rsgc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rsgc-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(risks, nodes);
  const high = enriched.filter(r => r._linked);
  const peripheral = enriched.filter(r => !r._linked);
  const badgeCount = high.length;
  const badgeColor = badgeCount > 0 ? GR : AM;

  const filtered = enriched
    .filter(r => tab === 'ALL' || (tab === 'HIGH-CENTRALITY' ? r._linked : !r._linked))
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.title || '').toLowerCase().includes(q) ||
        String(r.category || '').toLowerCase().includes(q) ||
        String(r.sector || '').toLowerCase().includes(q)
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
          message: `You have ${risks.length} risk signals cross-referenced against ${nodes.length} central graph nodes. ${high.length} risk signals are keyword-linked to highly-central network entities; ${peripheral.length} appear peripheral to the graph. Give a 2-sentence network risk coverage brief highlighting which categories of risks are most connected and what the peripheral risks represent.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = r => r.name || r.title || r.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Risk Signal × Graph Centrality (RSGC)"
        style={{
          position: 'fixed', left: 639120, bottom: 8, zIndex: 234,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        <span>◈</span>
        <span>RSGC</span>
        {badgeCount > 0 && (
          <span style={{
            background: GR, color: '#000', borderRadius: 8,
            fontSize: 8, padding: '0 4px', minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', right: 16, top: 52, zIndex: 234,
          width: PANEL_W, maxHeight: PANEL_H,
          background: 'rgba(5,10,18,0.97)', border: `1px solid ${GR}33`,
          borderRadius: 12, overflow: 'hidden',
          boxShadow: `0 0 60px ${GR}18, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace", display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${GR}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: GR, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>RISK SIGNAL × GRAPH CENTRALITY</span>
            <span style={{ marginLeft: 'auto', color: '#4E6070', fontSize: 10 }}>RSGC</span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#4E6070',
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${GR}11` }}>
            {[
              { label: 'RISK SIGNALS', value: risks.length, color: RD },
              { label: 'CENTRAL NODES', value: nodes.length, color: CY },
              { label: 'HIGH-CENTRALITY', value: high.length, color: GR },
              { label: 'PERIPHERAL', value: peripheral.length, color: AM },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: `${t.color}0A`, border: `1px solid ${t.color}22`,
                borderRadius: 6, padding: '5px 8px', textAlign: 'center',
              }}>
                <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{loading ? '…' : t.value}</div>
                <div style={{ color: '#4E6070', fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter + search */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${GR}11` }}>
            {['ALL', 'HIGH-CENTRALITY', 'PERIPHERAL'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${GR}18` : 'transparent',
                border: `1px solid ${tab === t ? GR : GR + '33'}`,
                borderRadius: 4, color: tab === t ? GR : '#4E6070',
                fontSize: 9, letterSpacing: 1, padding: '2px 8px', cursor: 'pointer',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search risk signals…"
              style={{
                marginLeft: 'auto', background: 'transparent', border: `1px solid ${GR}22`,
                borderRadius: 4, color: '#DCEBF5', fontSize: 10, padding: '2px 8px',
                outline: 'none', width: 150,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '20px', color: '#4E6070', fontSize: 11, textAlign: 'center' }}>
                {loading ? 'Loading risk signals…' : 'No risk signals match.'}
              </div>
            )}
            {filtered.map((risk, idx) => {
              const sevColor = SEV_COLOR[String(risk.severity || '').toLowerCase()] || AM;
              return (
                <div key={risk.id || idx}>
                  <div
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 14px', cursor: 'pointer',
                      background: expanded === idx ? `${GR}09` : 'transparent',
                      borderLeft: `2px solid ${risk._linked ? GR : AM}33`,
                    }}
                  >
                    <span style={{ color: risk._linked ? GR : AM, fontSize: 10 }}>{risk._linked ? '⬡' : '○'}</span>
                    <span style={{ flex: 1, color: '#DCEBF5', fontSize: 12 }}>{label(risk)}</span>
                    {risk.severity && chip(risk.severity.toUpperCase(), sevColor)}
                    {risk.category && chip(risk.category, CY)}
                    {risk._linked && chip(`c=${risk._matches[0]?.node?.centrality?.toFixed(3) || '?'}`, GR)}
                    <span style={{ color: '#2E4050', fontSize: 10 }}>{expanded === idx ? '▲' : '▼'}</span>
                  </div>
                  {expanded === idx && risk._matches.length > 0 && (
                    <div style={{ padding: '4px 28px 8px', borderBottom: `1px solid ${GR}11` }}>
                      {risk._matches.map((m, mi) => (
                        <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                          <span style={{ color: '#4E6070', fontSize: 10, flex: 1 }}>
                            {m.node.name || m.node.label || m.node.id || 'node'}
                          </span>
                          {m.node.type && chip(m.node.type, PU)}
                          <span style={{ color: GR, fontSize: 10, marginRight: 4 }}>
                            c={typeof m.node.centrality === 'number' ? m.node.centrality.toFixed(3) : '?'}
                          </span>
                          {scorebar(m.score, GR)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess footer */}
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${GR}22` }}>
            {brief && (
              <div style={{ color: '#9AB5C8', fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{brief}</div>
            )}
            <button onClick={assess} disabled={assessing} style={{
              background: `${GR}18`, border: `1px solid ${GR}44`, borderRadius: 5,
              color: GR, fontSize: 10, letterSpacing: 1, padding: '4px 14px', cursor: 'pointer',
            }}>
              {assessing ? 'ASSESSING…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
