import { useState, useEffect, useCallback } from 'react';

const API = '';
const RPLIVE_RE = /\b(report[s]?[._-]?live|live[._-]?report[s]?|rplive|triggered[._-]?report[s]?|live[._-]?triggered[._-]?report[s]?|world[._-]?report[s]?|report[s]?[._-]?world[._-]?event[s]?|intel[._-]?report[s]?[._-]?live|live[._-]?intel[._-]?report[s]?)\b/i;

export function isRpliveQuery(t) {
  return RPLIVE_RE.test(t || '');
}

export async function buildRpliveScript() {
  const [rpR, liR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const reports = normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const events = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
  const enriched = correlate(reports, events);
  const triggered = enriched.filter(r => r._linked).length;
  const stale = enriched.filter(r => !r._linked).length;
  return (
    `Live Intel × Report Coverage: ${reports.length} intelligence reports cross-matched against ${events.length} live world events. ` +
    `${triggered} reports are TRIGGERED (live world event aligns with report topic); ${stale} are STALE (no current live signal matches). ` +
    `Top triggered: ${enriched.filter(r => r._linked).slice(0, 3).map(r => r.title || r.name || '?').join(', ') || 'none'}.`
  );
}

function normaliseReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['reports', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const out = [];
  if (Array.isArray(raw)) {
    for (const ev of raw) out.push(ev);
    return out;
  }
  for (const key of ['earthquakes', 'quakes', 'seismic']) {
    if (Array.isArray(raw[key])) raw[key].forEach(e => out.push({ ...e, _type: 'SEISMIC' }));
  }
  for (const key of ['crypto', 'cryptocurrency']) {
    if (Array.isArray(raw[key])) raw[key].forEach(e => out.push({ ...e, _type: 'CRYPTO' }));
  }
  for (const key of ['fx', 'forex', 'currencies']) {
    if (Array.isArray(raw[key])) raw[key].forEach(e => out.push({ ...e, _type: 'FX' }));
  }
  if (!out.length) {
    for (const k of ['items', 'results', 'data', 'events']) {
      if (Array.isArray(raw[k])) { raw[k].forEach(e => out.push(e)); break; }
    }
  }
  return out;
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function eventLabel(ev) {
  return ev.place || ev.title || ev.name || ev.symbol || ev.currency || ev.pair || ev.description || '';
}

function matchScore(report, ev) {
  const rToks = new Set([
    ...tokens(report.title),
    ...tokens(report.name),
    ...tokens(report.summary),
    ...tokens(report.type),
    ...tokens(report.category),
    ...tokens(report.tags),
    ...tokens(report.description),
  ].filter(Boolean));
  const evToks = [
    ...tokens(eventLabel(ev)),
    ...tokens(ev.type),
    ...tokens(ev._type),
    ...tokens(ev.description),
    ...tokens(ev.region),
    ...tokens(ev.country),
  ].filter(Boolean);
  if (!rToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (rToks.has(t)) hits++;
  return hits / Math.max(rToks.size, evToks.length);
}

function correlate(reports, events) {
  return reports.map(rp => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(rp, ev) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...rp, _linked: scored.length > 0, _matches: scored };
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

const typeColor = t => ({ SEISMIC: RD, CRYPTO: CY, FX: GR })[String(t || '').toUpperCase()] || AM;

export default function LiveIntelReportCoverage() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
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
      const [rpR, liR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      setReports(normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []));
      setEvents(normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rplive-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rplive-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 60000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(reports, events);
  const triggered = enriched.filter(r => r._linked);
  const stale = enriched.filter(r => !r._linked);
  const badgeCount = triggered.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(r => tab === 'ALL' || (tab === 'TRIGGERED' ? r._linked : !r._linked))
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(r.title || '').toLowerCase().includes(q) ||
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.type || '').toLowerCase().includes(q) ||
        String(r.category || '').toLowerCase().includes(q) ||
        String(r.summary || '').toLowerCase().includes(q)
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
            `You have ${reports.length} intelligence reports cross-matched against ${events.length} live world events (seismic/crypto/FX). ` +
            `${triggered.length} reports are TRIGGERED (live world event aligns with this report's topic domain — time-critical intelligence). ` +
            `${stale.length} are STALE (no current live world event matches this report's domain). ` +
            `Top triggered reports: ${triggered.slice(0, 3).map(rp => rp.title || rp.name || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence report-world relevance brief: which reports are being activated by live events, and which reports are going stale due to no live signal.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const reportLabel = rp => rp.title || rp.name || rp.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Live Intel × Report Coverage (RPLIVE)"
        style={{
          position: 'fixed', left: 684080, bottom: 8, zIndex: 250,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ RPLIVE
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
              ◈ LIVE INTEL × REPORT COVERAGE
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
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'REPORTS', val: reports.length, col: CY },
              { label: 'LIVE EVENTS', val: events.length, col: PU },
              { label: 'TRIGGERED', val: triggered.length, col: AM },
              { label: 'STALE', val: stale.length, col: GR },
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
            {['ALL', 'TRIGGERED', 'STALE'].map(t => (
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
              placeholder="search reports…"
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
                {loading ? 'Loading…' : 'No reports found.'}
              </div>
            ) : filtered.map((rp, i) => {
              const isTriggered = rp._linked;
              const statusColor = isTriggered ? AM : GR;
              const isExp = expanded === i;
              return (
                <div key={rp.id || i} style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{reportLabel(rp)}</span>
                    {rp.type && chip(String(rp.type).slice(0, 14), CY)}
                    {rp.category && chip(String(rp.category).slice(0, 14), PU)}
                    {chip(isTriggered ? 'TRIGGERED' : 'STALE', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {rp._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING LIVE EVENTS
                          </div>
                          {rp._matches.map(({ ev, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {ev._type && chip(ev._type, typeColor(ev._type))}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {eventLabel(ev).slice(0, 60) || '—'}
                              </span>
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: GR, fontSize: 10 }}>No live world events match this report's domain.</div>
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
