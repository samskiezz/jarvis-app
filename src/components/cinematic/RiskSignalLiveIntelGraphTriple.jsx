import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const RSLGC_RE = /\b(rslgc|risk[\s_-]*signal[\s_-]*live[\s_-]*graph|risk[\s_-]*live[\s_-]*graph|live[\s_-]*risk[\s_-]*graph|graph[\s_-]*risk[\s_-]*live|risk[\s_-]*centrality[\s_-]*live|live[\s_-]*centrality[\s_-]*risk|risk[\s_-]*signal[\s_-]*centrality|signal[\s_-]*live[\s_-]*centrality|active[\s_-]*risk[\s_-]*graph|risk[\s_-]*world[\s_-]*graph|hot[\s_-]*risk[\s_-]*graph|risk[\s_-]*network[\s_-]*live|live[\s_-]*risk[\s_-]*centrality|centrality[\s_-]*risk[\s_-]*live)\b/i;

export function isRslgcQuery(t) { return RSLGC_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

const COV = {
  FULLY_ACTIVE: 'FULLY_ACTIVE',
  WORLD_TRIGGERED: 'WORLD_TRIGGERED',
  NODE_BACKED: 'NODE_BACKED',
  ISOLATED: 'ISOLATED',
};

function flattenLiveIntel(data) {
  const out = [];
  if (Array.isArray(data?.earthquakes)) out.push(...data.earthquakes.map(e => ({ ...e, _kind: 'SEISMIC' })));
  if (Array.isArray(data?.crypto)) out.push(...data.crypto.map(c => ({ ...c, _kind: 'CRYPTO' })));
  if (Array.isArray(data?.forex)) out.push(...data.forex.map(f => ({ ...f, _kind: 'FX' })));
  if (Array.isArray(data)) out.push(...data);
  return out;
}

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function classifyRisk(riskTokens, liveEvents, nodes) {
  let bestLiveScore = 0;
  let bestLiveEvent = null;
  for (const ev of liveEvents) {
    const et = tok([ev?.title, ev?.type, ev?.description, ev?.place?.name, ev?.place?.country, ev?.symbol, ev?.name].join(' '));
    const s = matchScore(riskTokens, et);
    if (s > bestLiveScore) { bestLiveScore = s; bestLiveEvent = ev; }
  }
  let bestNodeScore = 0;
  let bestNode = null;
  for (const n of nodes) {
    const nt = tok([n?.id, n?.entity_id, n?.name, n?.label, n?.type, n?.domain, (n?.aliases || []).join(' ')].join(' '));
    const s = matchScore(riskTokens, nt);
    if (s > bestNodeScore) { bestNodeScore = s; bestNode = n; }
  }
  const hasLive = bestLiveScore >= THRESHOLD;
  const hasNode = bestNodeScore >= THRESHOLD;
  let cov;
  if (hasLive && hasNode) cov = COV.FULLY_ACTIVE;
  else if (hasLive) cov = COV.WORLD_TRIGGERED;
  else if (hasNode) cov = COV.NODE_BACKED;
  else cov = COV.ISOLATED;
  return { cov, bestLiveEvent, bestLiveScore, bestNode, bestNodeScore };
}

export async function buildRslgcScript() {
  try {
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rsRes, intelRes, graphRes] = await Promise.allSettled([
      fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const risks = normaliseArray(rsRes.status === 'fulfilled' ? rsRes.value : [], 'items', 'data', 'signals', 'risks');
    const liveEvents = flattenLiveIntel(intelRes.status === 'fulfilled' ? intelRes.value : {});
    const nodes = normaliseArray(graphRes.status === 'fulfilled' ? graphRes.value : [], 'nodes', 'centrality', 'items', 'data');
    const counts = { [COV.FULLY_ACTIVE]: 0, [COV.WORLD_TRIGGERED]: 0, [COV.NODE_BACKED]: 0, [COV.ISOLATED]: 0 };
    for (const rs of risks) {
      const rt = tok([rs?.name, rs?.title, rs?.type, rs?.description, rs?.category, rs?.severity, (rs?.tags || []).join(' ')].join(' '));
      const { cov } = classifyRisk(rt, liveEvents, nodes);
      counts[cov]++;
    }
    const total = risks.length;
    const pct = total ? Math.round((counts[COV.FULLY_ACTIVE] / total) * 100) : 0;
    return `Risk signal live-intel/graph-centrality coverage: ${total} active risk signals across ${liveEvents.length} live world events and ${nodes.length} top-influence graph nodes. ${counts[COV.FULLY_ACTIVE]} fully active (${pct}%) — both real-world trigger and network centrality backing confirmed. ${counts[COV.WORLD_TRIGGERED]} world-triggered (live event match, no graph node), ${counts[COV.NODE_BACKED]} node-backed (centrality alignment, no live trigger), ${counts[COV.ISOLATED]} isolated — ${counts[COV.ISOLATED] ? `${counts[COV.ISOLATED]} risk signals lack both live-world and network backing` : 'all signals have at least partial real-world or network coverage'}, sir.`;
  } catch {
    return 'Risk signal live-intel graph centrality triple coverage check unavailable.';
  }
}

const RE  = '#ef4444';
const OR  = '#f97316';
const VI  = '#a855f7';
const SL  = '#64748b';
const CY  = '#29E7FF';
const KIND_COLOR = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#22c55e' };

function sevColor(sev) {
  if (!sev) return SL;
  const s = String(sev).toLowerCase();
  if (s === 'critical' || Number(sev) >= 80) return RE;
  if (s === 'high' || Number(sev) >= 60) return OR;
  if (s === 'medium' || Number(sev) >= 40) return '#f59e0b';
  return SL;
}

export default function RiskSignalLiveIntelGraphTriple() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [rsRes, intelRes, graphRes] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/centrality`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      const rks = normaliseArray(rsRes.status === 'fulfilled' ? rsRes.value : [], 'items', 'data', 'signals', 'risks');
      const evs = flattenLiveIntel(intelRes.status === 'fulfilled' ? intelRes.value : {});
      const nds = normaliseArray(graphRes.status === 'fulfilled' ? graphRes.value : [], 'nodes', 'centrality', 'items', 'data');
      setRisks(rks); setLiveEvents(evs); setNodes(nds);
      const computed = rks.map(rs => {
        const rt = tok([rs?.name, rs?.title, rs?.type, rs?.description, rs?.category, rs?.severity, (rs?.tags || []).join(' ')].join(' '));
        return { rs, ...classifyRisk(rt, evs, nds) };
      });
      setRows(computed);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || '';
      if (isRslgcQuery(q)) { setOpen(true); buildRslgcScript().then(s => window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: s } }))); }
    };
    window.addEventListener('jarvis:rslgc-toggle', onToggle);
    window.addEventListener('jarvis:ask', onAsk);
    return () => {
      window.removeEventListener('jarvis:rslgc-toggle', onToggle);
      window.removeEventListener('jarvis:ask', onAsk);
    };
  }, []);

  const counts = {
    [COV.FULLY_ACTIVE]:    rows.filter(r => r.cov === COV.FULLY_ACTIVE).length,
    [COV.WORLD_TRIGGERED]: rows.filter(r => r.cov === COV.WORLD_TRIGGERED).length,
    [COV.NODE_BACKED]:     rows.filter(r => r.cov === COV.NODE_BACKED).length,
    [COV.ISOLATED]:        rows.filter(r => r.cov === COV.ISOLATED).length,
  };
  const total = rows.length;
  const pct = total ? Math.round((counts[COV.FULLY_ACTIVE] / total) * 100) : 0;

  const visible = rows
    .filter(r => filter === 'ALL' || r.cov === filter)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      const rs = r.rs;
      return [rs?.name, rs?.title, rs?.type, rs?.category, rs?.severity].some(f => String(f || '').toLowerCase().includes(q));
    });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildRslgcScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 876720, bottom: 8, zIndex: 574,
          background: 'rgba(5,8,13,0.75)', border: `1px solid ${RE}55`,
          color: RE, borderRadius: 4, padding: '3px 7px', fontSize: 10,
          fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
        }}
        title="RiskSignal × Live Intel × Graph Centrality Triple Coverage (RSLGC)"
      >
        ◈ RSLGC
        {counts[COV.FULLY_ACTIVE] > 0 && (
          <span style={{ marginLeft: 4, background: RE, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {counts[COV.FULLY_ACTIVE]}
          </span>
        )}
      </button>
    );
  }

  const barPcts = total
    ? [
        { w: (counts[COV.FULLY_ACTIVE] / total) * 100, c: RE },
        { w: (counts[COV.WORLD_TRIGGERED] / total) * 100, c: OR },
        { w: (counts[COV.NODE_BACKED] / total) * 100, c: VI },
        { w: (counts[COV.ISOLATED] / total) * 100, c: SL },
      ]
    : [];

  return (
    <div style={{
      position: 'fixed', left: 876720, bottom: 36, zIndex: 574,
      width: 360, maxHeight: '72vh', overflowY: 'auto',
      background: 'rgba(5,8,13,0.95)', border: `1px solid ${RE}44`,
      borderRadius: 8, padding: 14, fontFamily: 'monospace',
      color: '#cdd6f4', backdropFilter: 'blur(10px)',
      boxShadow: `0 0 30px ${RE}22`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: RE, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ RSLGC</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>RiskSignal × Live Intel × Graph Centrality</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'risks', val: total, c: '#94a3b8' },
          { label: 'live events', val: liveEvents.length, c: OR },
          { label: 'nodes', val: nodes.length, c: VI },
          { label: 'active%', val: `${pct}%`, c: RE },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'fully active', val: counts[COV.FULLY_ACTIVE], c: RE },
          { label: 'world trig', val: counts[COV.WORLD_TRIGGERED], c: OR },
          { label: 'node backed', val: counts[COV.NODE_BACKED], c: VI },
          { label: 'isolated', val: counts[COV.ISOLATED], c: SL },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
          {barPcts.map((b, i) => <div key={i} style={{ width: `${b.w}%`, background: b.c }} />)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', COV.FULLY_ACTIVE, COV.WORLD_TRIGGERED, COV.NODE_BACKED, COV.ISOLATED].map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: filter === tab ? (tab === 'ALL' ? CY : tab === COV.FULLY_ACTIVE ? RE : tab === COV.WORLD_TRIGGERED ? OR : tab === COV.NODE_BACKED ? VI : SL) : '#1e293b',
            color: filter === tab ? '#fff' : '#94a3b8', border: 'none', letterSpacing: 0.5,
          }}>
            {tab === 'ALL' ? 'ALL' : tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="filter risks…"
        style={{
          width: '100%', boxSizing: 'border-box', background: '#1e293b',
          border: `1px solid ${RE}33`, color: '#cdd6f4', borderRadius: 4,
          padding: '4px 8px', fontSize: 10, marginBottom: 8,
        }}
      />

      <button onClick={assess} disabled={assessing} style={{
        width: '100%', marginBottom: 10, padding: '5px 0', fontSize: 10,
        background: assessing ? '#1e293b' : `${RE}22`, border: `1px solid ${RE}55`,
        color: RE, borderRadius: 4, cursor: assessing ? 'not-allowed' : 'pointer', letterSpacing: 1,
      }}>
        {assessing ? '◌ ASSESSING…' : '▶ ASSESS — AI brief + TTS'}
      </button>
      {assessText && (
        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 8, padding: '6px 8px', background: '#0f172a', borderRadius: 4, lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {loading && <div style={{ fontSize: 9, color: SL, marginBottom: 6 }}>◌ refreshing…</div>}

      <div>
        {visible.slice(0, 30).map((row, idx) => {
          const { rs, cov, bestLiveEvent, bestNode } = row;
          const name = rs?.name || rs?.title || rs?.type || `Signal #${idx + 1}`;
          const sev = rs?.severity || rs?.level;
          const isExp = expanded === idx;
          const covColor = cov === COV.FULLY_ACTIVE ? RE : cov === COV.WORLD_TRIGGERED ? OR : cov === COV.NODE_BACKED ? VI : SL;
          return (
            <div key={idx} onClick={() => setExpanded(isExp ? null : idx)} style={{
              borderRadius: 4, padding: '6px 8px', marginBottom: 4, cursor: 'pointer',
              background: '#0f172a', border: `1px solid ${covColor}33`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: sevColor(sev), fontSize: 9, fontWeight: 700, minWidth: 50 }}>
                  {String(sev || 'N/A').toUpperCase()}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </span>
                <span style={{ fontSize: 8, color: covColor, letterSpacing: 1, fontWeight: 700 }}>
                  {cov.replace('_', ' ')}
                </span>
              </div>
              {isExp && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 8, color: OR, letterSpacing: 1, marginBottom: 4 }}>LIVE INTEL</div>
                    {bestLiveEvent ? (
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>
                        <span style={{ color: KIND_COLOR[bestLiveEvent._kind] || OR, fontWeight: 700 }}>
                          {bestLiveEvent._kind}
                        </span>{' '}
                        {bestLiveEvent.title || bestLiveEvent.name || bestLiveEvent.symbol || 'Event'}
                        <div style={{ marginTop: 3, background: '#1e293b', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, row.bestLiveScore * 600)}%`, background: OR, height: '100%' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: SL }}>no match</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 8, color: VI, letterSpacing: 1, marginBottom: 4 }}>GRAPH NODE</div>
                    {bestNode ? (
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>
                        {bestNode.name || bestNode.label || bestNode.id || 'Node'}
                        <div style={{ fontSize: 8, color: SL }}>
                          {bestNode.type && <span>[{bestNode.type}] </span>}
                          centrality: {typeof bestNode.centrality === 'number' ? bestNode.centrality.toFixed(3) : bestNode.score?.toFixed(3) || '—'}
                        </div>
                        <div style={{ marginTop: 3, background: '#1e293b', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, row.bestNodeScore * 600)}%`, background: VI, height: '100%' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: SL }}>no match</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visible.length > 30 && (
          <div style={{ fontSize: 9, color: SL, textAlign: 'center', marginTop: 4 }}>
            +{visible.length - 30} more — refine filter
          </div>
        )}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 9, color: SL, textAlign: 'center', padding: 12 }}>no risks match</div>
        )}
      </div>
    </div>
  );
}
