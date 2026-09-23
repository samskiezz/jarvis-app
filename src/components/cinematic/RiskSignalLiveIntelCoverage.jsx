import { useState, useEffect, useCallback } from 'react';

const API = '';
const RSLIVE_RE = /\b(risk[._-]?live|live[._-]?risk|rslive|risk[._-]?signal[._-]?live|live[._-]?risk[._-]?signal|risk[._-]?world[._-]?event|live[._-]?risk[._-]?event|activated[._-]?risk|risk[._-]?activated|world[._-]?risk[._-]?signal|risk[._-]?signal[._-]?world)\b/i;

export function isRsliveQuery(t) {
  return RSLIVE_RE.test(t || '');
}

export async function buildRsliveScript() {
  const [rsR, liR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const signals = normaliseSignals(rsR.status === 'fulfilled' ? rsR.value : []);
  const events = normaliseEvents(liR.status === 'fulfilled' ? liR.value : []);
  const enriched = correlate(signals, events);
  const activated = enriched.filter(s => s._linked).length;
  const quiet = enriched.length - activated;
  return (
    `Risk Signal × Live Intel Coverage: ${signals.length} active risk signals, ${events.length} live world events. ` +
    `${activated} risk signals are ACTIVATED (live world event aligns); ${quiet} remain QUIET (no live match). ` +
    `Top activated signals: ${enriched.filter(s => s._linked).slice(0, 4).map(s => s.title || s.name || s.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['signals', 'risk_signals', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const flat = [];
  if (Array.isArray(raw.earthquakes)) flat.push(...raw.earthquakes.map(e => ({ ...e, _type: 'SEISMIC' })));
  if (Array.isArray(raw.crypto)) flat.push(...raw.crypto.map(e => ({ ...e, _type: 'CRYPTO' })));
  if (Array.isArray(raw.fx)) flat.push(...raw.fx.map(e => ({ ...e, _type: 'FX' })));
  if (flat.length) return flat;
  if (Array.isArray(raw)) return raw.map(e => ({ ...e, _type: e._type || 'INTEL' }));
  for (const k of ['events', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k].map(e => ({ ...e, _type: e._type || 'INTEL' }));
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(signal, event) {
  const sToks = new Set([
    ...tokens(signal.title),
    ...tokens(signal.name),
    ...tokens(signal.description),
    ...tokens(signal.category),
    ...tokens(signal.sector),
    ...tokens(signal.source),
  ].filter(Boolean));
  const eToks = [
    ...tokens(event.title),
    ...tokens(event.name),
    ...tokens(event.place),
    ...tokens(event.description),
    ...tokens(event.symbol),
    ...tokens(event.currency),
    ...tokens(event.pair),
  ].filter(Boolean);
  if (!sToks.size || !eToks.length) return 0;
  let hits = 0;
  for (const t of eToks) if (sToks.has(t)) hits++;
  return hits / Math.max(sToks.size, eToks.length);
}

function correlate(signals, events) {
  return signals.map(signal => {
    const scored = events
      .map(event => ({ event, score: matchScore(signal, event) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...signal, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const RD = '#F43F5E';
const OR = '#FB923C';

const TYPE_COLOR = { SEISMIC: OR, CRYPTO: CY, FX: GR, INTEL: PR };

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

export default function RiskSignalLiveIntelCoverage() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
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
      const [rsR, liR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      setSignals(normaliseSignals(rsR.status === 'fulfilled' ? rsR.value : []));
      setEvents(normaliseEvents(liR.status === 'fulfilled' ? liR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rslive-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rslive-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 60000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(signals, events);
  const activated = enriched.filter(s => s._linked);
  const quiet = enriched.filter(s => !s._linked);
  const badgeCount = activated.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(s => tab === 'ALL' || (tab === 'ACTIVATED' ? s._linked : !s._linked))
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(s.title || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.category || '').toLowerCase().includes(q) ||
        String(s.severity || '').toLowerCase().includes(q) ||
        String(s.sector || '').toLowerCase().includes(q)
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
          message: `You have ${signals.length} active risk signals and ${events.length} live world events (seismic, crypto, FX). ${activated.length} risk signals are ACTIVATED by live world events; ${quiet.length} are QUIET. Top activated: ${activated.slice(0, 4).map(s => s.title || s.name || s.id || '?').join(', ') || 'none'}. Give a 2-sentence risk-world alignment brief identifying which threat signals are being amplified by current live intelligence and what operational response is recommended.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const sigLabel = s => s.title || s.name || s.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Risk Signal × Live Intel Coverage (RSLIVE)"
        style={{
          position: 'fixed', left: 702000, bottom: 8, zIndex: 282,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ RSLIVE
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
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${RD}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${RD}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${RD}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: RD, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${RD}` }}>
              ◈ RISK SIGNAL × LIVE INTEL
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${RD}55`,
                  background: 'transparent', color: RD, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
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
              { label: 'RISK SIGNALS', val: signals.length, col: PR },
              { label: 'LIVE EVENTS', val: events.length, col: OR },
              { label: 'ACTIVATED', val: activated.length, col: RD },
              { label: 'QUIET', val: quiet.length, col: GR },
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
            {['ALL', 'ACTIVATED', 'QUIET'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? RD : '#2a3a4a'}`,
                  background: tab === t ? `${RD}22` : 'transparent',
                  color: tab === t ? RD : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search signals…"
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
                {loading ? 'Loading…' : 'No risk signals found.'}
              </div>
            ) : filtered.map((signal, i) => {
              const isExp = expanded === i;
              const statusColor = signal._linked ? RD : GR;
              const sevCol = SEV_COLOR[String(signal.severity || '').toLowerCase()] || AM;
              return (
                <div
                  key={signal.id || i}
                  style={{ borderBottom: `1px solid ${RD}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{sigLabel(signal)}</span>
                    {signal.severity && chip(signal.severity, sevCol)}
                    {signal.category && chip(signal.category, PR)}
                    {chip(signal._linked ? 'ACTIVATED' : 'QUIET', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {signal._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED LIVE EVENTS
                          </div>
                          {signal._matches.map(({ event, score }, j) => {
                            const typeCol = TYPE_COLOR[event._type] || CY;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {chip(event._type || 'INTEL', typeCol)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {event.title || event.name || event.place || event.symbol || event.pair || '?'}
                                </span>
                                {scorebar(score, RD)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No live world events matched this risk signal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${RD}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(244,63,94,0.03)',
            }}>
              <span style={{ color: RD, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
