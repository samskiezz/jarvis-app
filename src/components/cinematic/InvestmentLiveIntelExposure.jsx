import { useState, useEffect, useCallback } from 'react';

const API = '';
const INVLIVE_RE = /\b(invest(?:ment)?[._-]?live|live[._-]?invest(?:ment)?|invlive|portfolio[._-]?live|live[._-]?portfolio|portfolio[._-]?events?|portfolio[._-]?world|exposed[._-]?invest(?:ment)?s?[._-]?live|which[._-]?invest(?:ment)?s?[._-]?are[._-]?affected|invest(?:ment)?[._-]?world[._-]?event|invest(?:ment)?[._-]?geo|portfolio[._-]?impact|market[._-]?portfolio[._-]?alert)\b/i;

export function isInvliveQuery(t) {
  return INVLIVE_RE.test(t || '');
}

export async function buildInvliveScript() {
  const [invR, liR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const investments = normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []);
  const events = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
  const enriched = correlate(investments, events);
  const exposed = enriched.filter(i => i._exposed).length;
  const stable = enriched.length - exposed;
  const top = enriched.filter(i => i._exposed).slice(0, 3)
    .map(i => i.name || i.title || i.id || '?').join(', ');
  return (
    `Investment × Live World Events: ${investments.length} investments, ${events.length} live events indexed. ` +
    `${exposed} holdings are EXPOSED (live world event overlap detected); ${stable} are STABLE. ` +
    (top ? `Exposed positions: ${top}.` : 'No investments matched live world events.')
  );
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['investments', 'items', 'results', 'data', 'entities', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const out = [];
  if (Array.isArray(raw.earthquakes)) out.push(...raw.earthquakes.map(e => ({ ...e, _type: 'SEISMIC' })));
  if (Array.isArray(raw.crypto)) out.push(...raw.crypto.map(e => ({ ...e, _type: 'CRYPTO' })));
  if (Array.isArray(raw.fx)) out.push(...raw.fx.map(e => ({ ...e, _type: 'FX' })));
  if (out.length > 0) return out;
  for (const k of ['events', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function eventLabel(ev) {
  return [ev.name, ev.title, ev.description, ev.location, ev.place, ev.symbol, ev.pair, ev.country].filter(Boolean).join(' ');
}

function matchScore(investment, event) {
  const iToks = new Set([
    ...tokens(investment.name),
    ...tokens(investment.title),
    ...tokens(investment.sector),
    ...tokens(investment.description),
    ...tokens(investment.notes),
    ...(Array.isArray(investment.tags) ? investment.tags.flatMap(tokens) : tokens(investment.tags)),
    ...tokens(investment.type),
    ...tokens(investment.ticker),
    ...tokens(investment.asset),
  ].filter(Boolean));
  const evToks = tokens(eventLabel(event));
  if (!iToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (iToks.has(t)) hits++;
  return hits / Math.max(iToks.size, evToks.length);
}

function correlate(investments, events) {
  return investments.map(inv => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(inv, ev) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...inv, _exposed: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#F43F5E';
const PU = '#A78BFA';

const TYPE_COLOR = { SEISMIC: RD, CRYPTO: AM, FX: CY };

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

export default function InvestmentLiveIntelExposure() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, liR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      setInvestments(normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []));
      setLiveEvents(normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []));
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener('jarvis:invlive-toggle', h);
    return () => window.removeEventListener('jarvis:invlive-toggle', h);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 60000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(investments, liveEvents);
  const exposed = enriched.filter(i => i._exposed);
  const stable = enriched.filter(i => !i._exposed);
  const badgeCount = exposed.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(i => tab === 'ALL' || (tab === 'EXPOSED' ? i._exposed : !i._exposed))
    .filter(i => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(i.name || '').toLowerCase().includes(s) ||
        String(i.sector || '').toLowerCase().includes(s) ||
        String(i.title || '').toLowerCase().includes(s) ||
        String(i.type || '').toLowerCase().includes(s)
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
          message: `You have a portfolio of ${investments.length} investments and ${liveEvents.length} live world events (seismic, crypto, FX). ${exposed.length} investments are EXPOSED to live world events; ${stable.length} are STABLE. Give a 2-sentence portfolio-world-risk brief highlighting the most significant exposures.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = i => i.name || i.title || i.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Investment × Live Intel Exposure (INVLIVE)"
        style={{
          position: 'fixed', left: 626000, bottom: 8, zIndex: 231,
          width: 68, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ INVLIVE
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
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ INVESTMENT × LIVE INTEL EXPOSURE
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

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'INVESTMENTS', val: investments.length, col: AM },
              { label: 'LIVE EVENTS', val: liveEvents.length, col: CY },
              { label: 'EXPOSED', val: exposed.length, col: RD },
              { label: 'STABLE', val: stable.length, col: GR },
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

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'EXPOSED', 'STABLE'].map(t => (
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
              placeholder="search investments…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: '1px solid #2a3a4a',
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 170,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No investments found.'}
              </div>
            ) : filtered.map((inv, i) => {
              const isExp = expanded === i;
              const statusColor = inv._exposed ? RD : GR;
              return (
                <div
                  key={inv.id || i}
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
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(inv)}</span>
                    {inv.sector && chip(inv.sector, PU)}
                    {inv.type && chip(inv.type, '#6E8AA0')}
                    {chip(inv._exposed ? 'EXPOSED' : 'STABLE', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {inv._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED LIVE EVENTS
                          </div>
                          {inv._matches.map(({ ev, score }, j) => {
                            const typeCol = TYPE_COLOR[ev._type] || CY;
                            const evName = ev.name || ev.title || ev.symbol || ev.pair || ev.description || '?';
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {chip(ev._type || 'EVENT', typeCol)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{evName}</span>
                                {scorebar(score, typeCol)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No live world events matched this investment.</div>
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
