/**
 * F451 — Live Intel × Ops Events × Risk Signal Convergence (LORSC)
 *
 * Answers: "For each live world event (seismic/crypto/FX), is it
 * corroborated by an active ops event AND an active risk signal —
 * or does it stand alone with no operational or risk backing?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /functions/getLiveIntel    → live seismic / crypto / FX events
 *   GET /v1/ops/events             → active operational events
 *   GET /entities/RiskSignal       → active risk signals
 *
 * Classification per live intel event:
 *   TRIPLE_HIT   — ops match AND risk signal match (highest confidence)
 *   OPS_ONLY     — ops event match, no risk signal
 *   RISK_ONLY    — risk signal match, no ops event
 *   SOLO         — neither — live event with no operational or risk corroboration
 *
 * Stat tiles:  live events / ops events / risk signals / triple-hit count
 * Badge:       amber on TRIPLE_HIT count (confirmed convergences)
 * Expand row:  matched ops events + matched risk signals with relevance bars
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ LORSC  at left:8100, bottom:18, zIndex:68
 * Event:   jarvis:lorsc-toggle
 * Voice:   "live ops risk / lorsc / triple hit / convergence intel /
 *           world ops risk / live corroboration / intel convergence /
 *           ops risk world / which events are confirmed / triple confirmed"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS = ['ALL', 'TRIPLE_HIT', 'OPS_ONLY', 'RISK_ONLY', 'SOLO'];
const CLASS_COLOR = {
  TRIPLE_HIT: GR,
  OPS_ONLY:   CY,
  RISK_ONLY:  AM,
  SOLO:       MU,
};

const LORSC_TRIGGERS = [
  'live ops risk', 'lorsc', 'triple hit', 'convergence intel',
  'world ops risk', 'live corroboration', 'intel convergence',
  'ops risk world', 'which events are confirmed', 'triple confirmed',
  'live event convergence', 'world event ops', 'world event risk',
];

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(s => s.length > 2);
}

function score(srcToks, target) {
  const tgt = tokens(
    [target.name, target.label, target.title, target.description,
     target.type, target.resource, target.source, target.category,
     target.severity, ...(target.tags || [])].join(' ')
  );
  if (!tgt.length) return 0;
  return srcToks.filter(t => tgt.includes(t)).length / Math.max(srcToks.length, 1);
}

function extractLiveEvents(data) {
  const events = [];
  if (!data) return events;
  const quakes = data.earthquakes || data.seismic || [];
  const crypto = data.crypto || data.market || [];
  const fx     = data.fx || data.forex || [];
  quakes.forEach(q => events.push({
    id: `seismic-${q.place || q.location || q.id}`,
    type: 'SEISMIC',
    title: q.place || q.location || 'Unknown',
    description: `M${q.magnitude ?? q.mag ?? '?'} — ${q.place || q.location || ''}`,
    tokens: tokens([q.place, q.location, 'seismic', 'earthquake', 'quake'].join(' ')),
  }));
  crypto.forEach(c => events.push({
    id: `crypto-${c.symbol || c.name || c.id}`,
    type: 'CRYPTO',
    title: c.symbol || c.name || 'Unknown',
    description: `${c.symbol || ''} ${c.change_pct != null ? (c.change_pct > 0 ? '+' : '') + c.change_pct.toFixed(2) + '%' : ''}`,
    tokens: tokens([c.symbol, c.name, c.id, 'crypto', 'currency'].join(' ')),
  }));
  fx.forEach(f => events.push({
    id: `fx-${f.pair || f.symbol || f.id}`,
    type: 'FX',
    title: f.pair || f.symbol || 'Unknown',
    description: `${f.pair || ''} ${f.rate != null ? f.rate : ''}`,
    tokens: tokens([f.pair, f.symbol, 'fx', 'forex', 'currency'].join(' ')),
  }));
  return events;
}

function classifyEvent(evToks, opsEvents, riskSignals) {
  const matchedOps = opsEvents
    .map(o => ({ ...o, _rel: score(evToks, o) }))
    .filter(o => o._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const matchedRisk = riskSignals
    .map(r => ({ ...r, _rel: score(evToks, r) }))
    .filter(r => r._rel > 0)
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 5);
  const hasOps  = matchedOps.length > 0;
  const hasRisk = matchedRisk.length > 0;
  const cls = hasOps && hasRisk ? 'TRIPLE_HIT'
            : hasOps            ? 'OPS_ONLY'
            : hasRisk           ? 'RISK_ONLY'
            :                     'SOLO';
  return { cls, matchedOps, matchedRisk };
}

function Bar({ v, max, color }) {
  return (
    <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, (v / Math.max(max, 0.01)) * 100)}%`, background: color, borderRadius: 3 }} />
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: MU, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function LiveIntelOpsRiskConvergence() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [stats, setStats]     = useState({ live: 0, ops: 0, risk: 0, triple: 0 });
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [liveRaw, opsRaw, riskRaw] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`, { headers: h }).then(r => r.json()).catch(() => ({})),
        fetch(`${API}/v1/ops/events?limit=200`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);

      const liveEvents  = extractLiveEvents(liveRaw);
      const opsEvents   = Array.isArray(opsRaw) ? opsRaw
                        : Array.isArray(opsRaw?.events) ? opsRaw.events
                        : Array.isArray(opsRaw?.items) ? opsRaw.items : [];
      const riskSignals = Array.isArray(riskRaw) ? riskRaw
                        : Array.isArray(riskRaw?.items) ? riskRaw.items
                        : Array.isArray(riskRaw?.results) ? riskRaw.results : [];

      let tripleCount = 0;
      const classified = liveEvents.map(ev => {
        const { cls, matchedOps, matchedRisk } = classifyEvent(ev.tokens, opsEvents, riskSignals);
        if (cls === 'TRIPLE_HIT') tripleCount++;
        return { ...ev, cls, matchedOps, matchedRisk };
      });

      setRows(classified);
      setStats({ live: liveEvents.length, ops: opsEvents.length, risk: riskSignals.length, triple: tripleCount });
    } catch (e) {
      console.error('LORSC load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:lorsc-toggle', toggle);
    return () => window.removeEventListener('jarvis:lorsc-toggle', toggle);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, 60_000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setAssessment('');
    try {
      const h = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const tripleRows = rows.filter(r => r.cls === 'TRIPLE_HIT').slice(0, 5);
      const prompt = `LORSC: ${stats.live} live world events cross-referenced against ${stats.ops} ops events and ${stats.risk} risk signals. ` +
        `${stats.triple} triple-confirmed convergences (live + ops + risk match). ` +
        `Top triple-hits: ${tripleRows.map(r => `${r.type}:${r.title}`).join(', ') || 'none'}. ` +
        `Provide a 2-sentence convergence intelligence summary including the significance of triple-hit events.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: h, body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const text = res.response || res.message || res.content || 'Assessment unavailable.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch { setAssessment('Assessment unavailable.'); }
    finally { setAssessing(false); }
  };

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.description.toLowerCase().includes(s) || r.type.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) return null;

  const TYPE_COLOR = { SEISMIC: RD, CRYPTO: AM, FX: CY };

  return (
    <div style={{
      position: 'fixed', left: 8100, bottom: 18, zIndex: 68,
      width: 480, maxHeight: '82vh', display: 'flex', flexDirection: 'column',
      background: BG, border: `1px solid ${BD}`, borderRadius: 14,
      fontFamily: MONO, fontSize: 12, color: '#DCEBF5',
      boxShadow: `0 0 40px ${AM}22`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 0', flexShrink: 0 }}>
        <span style={{ color: AM, fontSize: 11, letterSpacing: 2 }}>◈ LIVE INTEL × OPS × RISK CONVERGENCE</span>
        <span style={{ marginLeft: 'auto', background: AM + '22', color: AM, border: `1px solid ${AM}66`,
          borderRadius: 10, padding: '1px 7px', fontSize: 10 }}>{stats.triple} TRIPLE</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0', flexShrink: 0 }}>
        <Tile label="LIVE EVENTS" value={stats.live} color={CY} />
        <Tile label="OPS EVENTS"  value={stats.ops}  color={AM} />
        <Tile label="RISK SIGNALS" value={stats.risk} color={RD} />
        <Tile label="TRIPLE HITS" value={stats.triple} color={GR} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0', flexWrap: 'wrap', flexShrink: 0 }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? AM + '22' : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            color: filter === f ? AM : MU, borderRadius: 6, padding: '2px 8px',
            fontSize: 9, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search events…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`,
            borderRadius: 6, padding: '5px 8px', color: '#DCEBF5', fontSize: 11, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && <div style={{ color: MU, textAlign: 'center', padding: 16 }}>loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, textAlign: 'center', padding: 16 }}>no events match filter</div>
        )}
        {visible.map(row => {
          const isExp = expanded === row.id;
          const clsColor = CLASS_COLOR[row.cls] || MU;
          const typeColor = TYPE_COLOR[row.type] || MU;
          return (
            <div key={row.id} style={{ borderBottom: `1px solid ${BD}`, padding: '8px 0' }}>
              <div onClick={() => setExpanded(isExp ? null : row.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4,
                  background: typeColor + '22', color: typeColor, border: `1px solid ${typeColor}44` }}>{row.type}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4,
                  background: clsColor + '22', color: clsColor, border: `1px solid ${clsColor}44` }}>{row.cls}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {row.description && (
                <div style={{ fontSize: 10, color: MU, marginTop: 2, paddingLeft: 2 }}>{row.description}</div>
              )}
              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 4 }}>
                  {row.matchedOps.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: AM, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }}>OPS EVENTS ({row.matchedOps.length})</div>
                      {row.matchedOps.map((o, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3,
                            background: AM + '22', color: AM, border: `1px solid ${AM}44`, whiteSpace: 'nowrap' }}>
                            {(o.severity || o.type || 'OPS').toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.name || o.title || o.resource || o.type || 'Ops Event'}
                          </span>
                          <Bar v={o._rel} max={1} color={AM} />
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedRisk.length > 0 && (
                    <div>
                      <div style={{ color: RD, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }}>RISK SIGNALS ({row.matchedRisk.length})</div>
                      {row.matchedRisk.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3,
                            background: RD + '22', color: RD, border: `1px solid ${RD}44`, whiteSpace: 'nowrap' }}>
                            {(r.severity || 'RISK').toUpperCase()}
                          </span>
                          <span style={{ fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.name || r.title || r.description?.slice(0, 40) || 'Risk Signal'}
                          </span>
                          <Bar v={r._rel} max={1} color={RD} />
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedOps.length === 0 && row.matchedRisk.length === 0 && (
                    <div style={{ color: MU, fontSize: 10 }}>No ops or risk signal corroboration found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI assessment */}
      {assessment && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${BD}`, fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>
          {assessment}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${BD}`, display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: AM + '22', border: `1px solid ${AM}`, color: AM,
          borderRadius: 6, padding: '5px 0', cursor: 'pointer', fontSize: 10, letterSpacing: 1,
        }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={load} style={{
          background: 'none', border: `1px solid ${BD}`, color: MU,
          borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 10,
        }}>⟳</button>
      </div>
    </div>
  );
}

// ── Standalone toggle button ──────────────────────────────────────────────────
export function LorscButton() {
  const [cnt, setCnt] = useState(0);
  useEffect(() => {
    const load = async () => {
      try {
        const h = { Authorization: `Bearer ${API_KEY}` };
        const [liveRaw, opsRaw, riskRaw] = await Promise.all([
          fetch(`${API}/functions/getLiveIntel`, { headers: h }).then(r => r.json()).catch(() => ({})),
          fetch(`${API}/v1/ops/events?limit=200`,  { headers: h }).then(r => r.json()).catch(() => []),
          fetch(`${API}/entities/RiskSignal`,      { headers: h }).then(r => r.json()).catch(() => []),
        ]);
        const liveEvents  = extractLiveEvents(liveRaw);
        const opsEvents   = Array.isArray(opsRaw) ? opsRaw : Array.isArray(opsRaw?.events) ? opsRaw.events : [];
        const riskSignals = Array.isArray(riskRaw) ? riskRaw : Array.isArray(riskRaw?.items) ? riskRaw.items : [];
        let t = 0;
        liveEvents.forEach(ev => { const { cls } = classifyEvent(ev.tokens, opsEvents, riskSignals); if (cls === 'TRIPLE_HIT') t++; });
        setCnt(t);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('jarvis:lorsc-toggle'))}
      title="Live Intel × Ops × Risk Convergence"
      style={{
        position: 'fixed', left: 8100, bottom: 18, zIndex: 68,
        background: 'rgba(10,12,20,0.82)', border: `1px solid ${AM}`,
        color: AM, borderRadius: 8, padding: '4px 9px',
        cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: 1,
        boxShadow: cnt > 0 ? `0 0 14px ${GR}55` : 'none',
      }}>
      ◈ LORSC{cnt > 0 && <span style={{ marginLeft: 5, background: GR + '33', color: GR, border: `1px solid ${GR}55`, borderRadius: 8, padding: '0 5px', fontSize: 9 }}>{cnt}</span>}
    </button>
  );
}

// ── JarvisBrain integration ───────────────────────────────────────────────────
export function isLorscQuery(q) {
  const lq = (q || '').toLowerCase();
  return LORSC_TRIGGERS.some(t => lq.includes(t));
}

export async function buildLorscScript() {
  try {
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [liveRaw, opsRaw, riskRaw] = await Promise.all([
      fetch(`${API}/functions/getLiveIntel`, { headers: h }).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/v1/ops/events?limit=200`, { headers: h }).then(r => r.json()).catch(() => []),
      fetch(`${API}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
    ]);
    const liveEvents  = extractLiveEvents(liveRaw);
    const opsEvents   = Array.isArray(opsRaw) ? opsRaw : Array.isArray(opsRaw?.events) ? opsRaw.events : [];
    const riskSignals = Array.isArray(riskRaw) ? riskRaw : Array.isArray(riskRaw?.items) ? riskRaw.items : [];

    let triple = 0, opsOnly = 0, riskOnly = 0, solo = 0;
    const tripleHits = [];
    liveEvents.forEach(ev => {
      const { cls } = classifyEvent(ev.tokens, opsEvents, riskSignals);
      if (cls === 'TRIPLE_HIT') { triple++; tripleHits.push(ev.title); }
      else if (cls === 'OPS_ONLY') opsOnly++;
      else if (cls === 'RISK_ONLY') riskOnly++;
      else solo++;
    });
    return `LORSC: ${liveEvents.length} live world events cross-referenced against ${opsEvents.length} ops events and ${riskSignals.length} risk signals. ` +
      `${triple} triple-confirmed convergences (world event backed by both ops and risk signal), ${opsOnly} ops-only, ${riskOnly} risk-only, ${solo} solo. ` +
      `${triple > 0 ? `Top triple hits: ${tripleHits.slice(0, 3).join(', ')}.` : 'No triple-confirmed convergences — live world events are not yet corroborated by operational and risk data.'}`;
  } catch {
    return 'LORSC: Unable to fetch live intel, ops events, or risk signals for convergence assessment.';
  }
}
