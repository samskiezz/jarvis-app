import { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const RSKLISC_RE = /\b(rsklisc|risk\s+signal\s+live\s+scenario|risk\s+live\s+scenario|primed\s+risk|world\s+risk\s+scenario|risk\s+signal\s+primed|triggered\s+risk\s+scenario|dormant\s+risk\s+signal|risk\s+live\s+intel\s+scenario|risk\s+triple\s+coverage|risk\s+world\s+response)\b/i;

export function isRskliscQuery(t) { return RSKLISC_RE.test(t || ''); }

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx          :
                 Array.isArray(raw?.forex)        ? raw.forex       : [];
  const out = [];
  quakes.forEach((q, i) => {
    const mag = q.magnitude ?? q.mag ?? q.properties?.mag ?? '';
    const place = q.place ?? q.location ?? q.properties?.place ?? '';
    out.push({ id: `quake-${i}`, type: 'SEISMIC',
      title: String(q.title ?? q.properties?.title ?? `M${mag} ${place}`).slice(0, 120),
      body: `magnitude:${mag} region:${place} earthquake seismic disaster emergency relief geopolitical`.slice(0, 300) });
  });
  crypto.forEach((c, i) => {
    const sym = c.symbol ?? c.name ?? `CRYPTO${i}`;
    out.push({ id: `crypto-${i}`, type: 'CRYPTO',
      title: sym,
      body: `asset:${sym} cryptocurrency blockchain digital-asset defi token trading investment market finance`.slice(0, 300) });
  });
  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    out.push({ id: `fx-${i}`, type: 'FX',
      title: pair,
      body: `currency:${pair} forex exchange-rate international trade monetary FX market`.slice(0, 300) });
  });
  return out;
}

function kwRisk(r) {
  return [r?.name, r?.title, r?.description, r?.category, r?.type, r?.tags,
          r?.severity, r?.source, r?.domain, r?.region]
    .filter(Boolean).join(' ').toLowerCase();
}

function kwScen(s) {
  return [s?.name, s?.title, s?.description, s?.category, s?.tags, s?.kind]
    .filter(Boolean).join(' ').toLowerCase();
}

function relevance(needles, haystack) {
  if (!needles.length) return 0;
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0) / needles.length;
}

export async function buildRskliscScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [rskR, intR, scnR] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,     { headers: hdr }).then(r => r.json()),
  ]);

  const signals   = (rskR.status === 'fulfilled' ? (rskR.value?.data ?? rskR.value ?? []) : []).slice(0, 80);
  const events    = intR.status === 'fulfilled' ? normaliseEvents(intR.value) : [];
  const scenarios = (scnR.status === 'fulfilled' ? (scnR.value?.data ?? scnR.value ?? []) : []).slice(0, 80);

  let fullyPrimed = 0, worldTriggered = 0, scenBacked = 0, dormant = 0;
  for (const sig of signals) {
    const words = kwRisk(sig).split(/\s+/).filter(w => w.length > 3);
    const hasLive = events.some(e  => relevance(words, e.body + ' ' + e.title) > 0.12);
    const hasScen = scenarios.some(s => relevance(words, kwScen(s)) > 0.15);
    if (hasLive && hasScen) fullyPrimed++;
    else if (hasLive) worldTriggered++;
    else if (hasScen) scenBacked++;
    else dormant++;
  }

  return `RSKLISC: ${signals.length} risk signals × ${events.length} live world events × ${scenarios.length} scenarios. ` +
    `${fullyPrimed} FULLY PRIMED (live-world + scenario), ${worldTriggered} WORLD-TRIGGERED (live, no plan), ` +
    `${scenBacked} SCENARIO-BACKED (planned, not currently live), ${dormant} DORMANT (no live or scenario coverage). ` +
    (dormant > 0
      ? `${dormant} risk signals have no live world alignment or scenario response — monitoring gap.`
      : 'All risk signals have live world alignment or scenario coverage.');
}

const GR = '#00FF88'; const RD = '#EF4444'; const CY2 = '#22D3EE'; const AM = '#F59E0B';
const BG = 'rgba(6,16,28,0.97)'; const BD = 'rgba(0,212,255,0.18)'; const CY = '#00D4FF';

const TYPE_COL = { SEISMIC: RD, CRYPTO: CY2, FX: '#A855F7' };

export default function RiskSignalLiveIntelScenarioTriple() {
  const [open, setOpen]         = useState(false);
  const [signals, setSignals]   = useState([]);
  const [events, setEvents]     = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:rsklisc-toggle', h);
    return () => window.removeEventListener('jarvis:rsklisc-toggle', h);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [rR, iR, sR] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,     { headers: hdr }).then(r => r.json()),
      ]);
      const sigs  = (rR.status === 'fulfilled' ? (rR.value?.data ?? rR.value ?? []) : []).slice(0, 80);
      const evts  = iR.status === 'fulfilled' ? normaliseEvents(iR.value) : [];
      const scens = (sR.status === 'fulfilled' ? (sR.value?.data ?? sR.value ?? []) : []).slice(0, 80);
      setSignals(sigs); setEvents(evts); setScenarios(scens);

      const built = sigs.map(sig => {
        const words = kwRisk(sig).split(/\s+/).filter(w => w.length > 3);
        const matchedEvents = evts
          .map(e => ({ ...e, _se: relevance(words, e.body + ' ' + e.title) }))
          .filter(e => e._se > 0.12)
          .sort((a, b) => b._se - a._se)
          .slice(0, 5);
        const matchedScenarios = scens
          .map(s => ({ ...s, _ss: relevance(words, kwScen(s)) }))
          .filter(s => s._ss > 0.15)
          .sort((a, b) => b._ss - a._ss)
          .slice(0, 5);
        const hasLive = matchedEvents.length > 0;
        const hasScen = matchedScenarios.length > 0;
        const state = hasLive && hasScen ? 'FULLY PRIMED'
          : hasLive ? 'WORLD-TRIGGERED'
          : hasScen ? 'SCENARIO-BACKED'
          : 'DORMANT';
        return { ...sig, matchedEvents, matchedScenarios, state };
      });
      setRows(built);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) { const s = search.toLowerCase(); return kwRisk(r).includes(s); }
    return true;
  });

  const fullyPrimed    = rows.filter(r => r.state === 'FULLY PRIMED').length;
  const worldTriggered = rows.filter(r => r.state === 'WORLD-TRIGGERED').length;
  const scenBacked     = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const dormant        = rows.filter(r => r.state === 'DORMANT').length;
  const total          = rows.length || 1;

  const assess = async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Summarise risk signal live-world and scenario coverage in 2 sentences: ${fullyPrimed} fully primed (live+scenario), ${worldTriggered} world-triggered (live, no plan), ${scenBacked} scenario-backed (planned, not live), ${dormant} dormant out of ${rows.length} risk signals.` }),
      });
      const d = await res.json();
      const txt = d?.response || d?.message || 'No brief available.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: txt }));
    } finally { setAssessing(false); }
  };

  const stateColor = s =>
    s === 'FULLY PRIMED'    ? GR :
    s === 'WORLD-TRIGGERED' ? RD :
    s === 'SCENARIO-BACKED' ? CY2 : AM;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', left: 801680, bottom: 8, zIndex: 460, width: 560,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#DCEBF5',
      boxShadow: `0 0 32px rgba(0,212,255,0.12)`, display: 'flex', flexDirection: 'column', maxHeight: 540 }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ RSKLISC</span>
        <span style={{ fontSize: 9, color: '#6E8AA0' }}>RISK-SIGNAL × LIVE-INTEL × SCENARIO</span>
        {fullyPrimed > 0 && (
          <span style={{ marginLeft: 'auto', background: GR, color: '#000', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{fullyPrimed} PRIMED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ marginLeft: fullyPrimed > 0 ? 4 : 'auto',
          background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        {[['SIGNALS', signals.length, CY], ['LIVE EVENTS', events.length, '#6E8AA0'],
          ['SCENARIOS', scenarios.length, '#6E8AA0'], ['PRIMED', fullyPrimed, GR],
          ['WORLD-TRIG', worldTriggered, RD], ['SCEN-BKD', scenBacked, CY2], ['DORMANT', dormant, AM]
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: 'rgba(0,212,255,0.05)', borderRadius: 6,
            padding: '4px 2px', textAlign: 'center' }}>
            <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{loading ? '…' : val}</div>
            <div style={{ color: '#4A6080', fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ display: 'flex', height: 4, margin: '0 12px 8px', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${(fullyPrimed    / total) * 100}%`, background: GR }} />
        <div style={{ width: `${(worldTriggered / total) * 100}%`, background: RD }} />
        <div style={{ width: `${(scenBacked     / total) * 100}%`, background: CY2 }} />
        <div style={{ width: `${(dormant        / total) * 100}%`, background: AM }} />
      </div>

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY PRIMED', 'WORLD-TRIGGERED', 'SCENARIO-BACKED', 'DORMANT'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9,
              background: filter === f ? CY : 'rgba(0,212,255,0.08)',
              color: filter === f ? '#000' : '#6E8AA0', fontWeight: filter === f ? 700 : 400 }}>
            {f}
          </button>
        ))}
        <button onClick={assess} disabled={assessing}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: `1px solid ${RD}`,
            background: 'transparent', color: RD, cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
      </div>

      {/* search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{ width: '100%', background: 'rgba(0,212,255,0.05)', border: `1px solid ${BD}`,
            borderRadius: 4, padding: '4px 8px', color: '#DCEBF5', fontSize: 10,
            outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#4A6080', padding: '12px 0', textAlign: 'center' }}>loading…</div>}
        {!loading && filtered.map((r, i) => {
          const id = r.id ?? r._id ?? i;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ borderBottom: `1px solid rgba(0,212,255,0.07)` }}>
              <div onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                <span style={{ color: stateColor(r.state), fontSize: 9, minWidth: 120,
                  fontWeight: 700, letterSpacing: 1 }}>{r.state}</span>
                <span style={{ flex: 1, color: '#DCEBF5', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || r.title || r.id || '—'}
                </span>
                {r.severity && <span style={{ color: RD, fontSize: 9 }}>{r.severity}</span>}
                <span style={{ color: '#4A6080', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', gap: 8, padding: '4px 0 8px' }}>
                  {/* live events pane */}
                  <div style={{ flex: 1, background: 'rgba(239,68,68,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: RD, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      LIVE EVENTS ({r.matchedEvents.length})
                    </div>
                    {r.matchedEvents.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>no live events matched</div>
                      : r.matchedEvents.map((e, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                            <span style={{ color: TYPE_COL[e.type] ?? '#6E8AA0', fontSize: 8,
                              background: `${TYPE_COL[e.type] ?? '#6E8AA0'}18`,
                              padding: '0 4px', borderRadius: 3, marginLeft: 4, flexShrink: 0 }}>{e.type}</span>
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(239,68,68,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Math.round(e._se * 100))}%`,
                              background: TYPE_COL[e.type] ?? RD, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>

                  {/* scenarios pane */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.06)', borderRadius: 6, padding: 8 }}>
                    <div style={{ color: CY2, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                      SCENARIOS ({r.matchedScenarios.length})
                    </div>
                    {r.matchedScenarios.length === 0
                      ? <div style={{ color: '#4A6080', fontSize: 9 }}>none matched</div>
                      : r.matchedScenarios.map((s, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ color: '#DCEBF5', fontSize: 9 }}>{s.name || s.title || '—'}</span>
                            {s.category && <span style={{ color: CY2, fontSize: 8, background: 'rgba(34,211,238,0.1)',
                              padding: '0 4px', borderRadius: 3 }}>{s.category}</span>}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: 'rgba(34,211,238,0.15)' }}>
                            <div style={{ height: '100%', width: `${Math.round(s._ss * 100)}%`,
                              background: CY2, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#4A6080', textAlign: 'center', padding: '12px 0' }}>no results</div>
        )}
      </div>
    </div>
  );
}
