import { useState, useEffect, useCallback } from 'react';

const API = '';
const DSLIVE_RE = /\b(live[._-]?dataset[s]?|dataset[s]?[._-]?live|dslive|reactive[._-]?dataset[s]?|live[._-]?data[._-]?coverage|active[._-]?dataset[s]?|dataset[s]?[._-]?live[._-]?intel|live[._-]?intel[._-]?dataset[s]?|which[._-]?datasets[._-]?are[._-]?live)\b/i;

export function isDsliveQuery(t) {
  return DSLIVE_RE.test(t || '');
}

export async function buildDsliveScript() {
  const [dsR, liR] = await Promise.allSettled([
    fetch(`${API}/v1/datasets`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const datasets = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const events = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
  const enriched = correlate(datasets, events);
  const reactive = enriched.filter(d => d._linked).length;
  const dormant = enriched.filter(d => !d._linked).length;
  return (
    `Live Intel × Dataset Coverage: ${datasets.length} datasets cross-matched against ${events.length} live world events. ` +
    `${reactive} datasets are REACTIVE (live world event overlaps this dataset's domain — data may be time-relevant); ${dormant} are DORMANT (no current live signal matches). ` +
    `Top reactive: ${enriched.filter(d => d._linked).slice(0, 3).map(d => d.name || d.title || '?').join(', ') || 'none'}.`
  );
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['datasets', 'items', 'results', 'data', 'records']) {
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

function matchScore(ds, ev) {
  const dsToks = new Set([
    ...tokens(ds.name),
    ...tokens(ds.title),
    ...tokens(ds.description),
    ...tokens(ds.kind),
    ...tokens(ds.type),
    ...tokens(ds.category),
    ...tokens(ds.tags),
    ...tokens(ds.domain),
  ].filter(Boolean));
  const evToks = [
    ...tokens(eventLabel(ev)),
    ...tokens(ev.type),
    ...tokens(ev._type),
    ...tokens(ev.description),
    ...tokens(ev.region),
    ...tokens(ev.country),
  ].filter(Boolean);
  if (!dsToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (dsToks.has(t)) hits++;
  return hits / Math.max(dsToks.size, evToks.length);
}

function correlate(datasets, events) {
  return datasets.map(ds => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(ds, ev) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...ds, _linked: scored.length > 0, _matches: scored };
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

export default function LiveIntelDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
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
      const [dsR, liR] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      setDatasets(normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []));
      setEvents(normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:dslive-toggle', onToggle);
    return () => window.removeEventListener('jarvis:dslive-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 60000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(datasets, events);
  const reactive = enriched.filter(d => d._linked);
  const dormant = enriched.filter(d => !d._linked);
  const badgeCount = reactive.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(d => tab === 'ALL' || (tab === 'REACTIVE' ? d._linked : !d._linked))
    .filter(d => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(d.name || '').toLowerCase().includes(q) ||
        String(d.title || '').toLowerCase().includes(q) ||
        String(d.kind || '').toLowerCase().includes(q) ||
        String(d.type || '').toLowerCase().includes(q) ||
        String(d.description || '').toLowerCase().includes(q)
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
            `You have ${datasets.length} datasets cross-matched against ${events.length} live world events (seismic/crypto/FX). ` +
            `${reactive.length} datasets are REACTIVE (live world event overlaps this dataset's domain — data may need attention or refresh). ` +
            `${dormant.length} are DORMANT (no current live world event matches this dataset's space). ` +
            `Top reactive datasets: ${reactive.slice(0, 3).map(d => d.name || d.title || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence live-data readiness brief: which datasets are being activated by live world events, and which data sources currently have no live signal relevance.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const dsLabel = ds => ds.name || ds.title || ds.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Live Intel × Dataset Coverage (DSLIVE)"
        style={{
          position: 'fixed', left: 692480, bottom: 8, zIndex: 265,
          width: 64, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ DSLIVE
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
          width: PANEL_W, height: PANEL_H, zIndex: 9215,
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
              ◈ LIVE INTEL × DATASET COVERAGE
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
              { label: 'DATASETS', val: datasets.length, col: CY },
              { label: 'LIVE EVENTS', val: events.length, col: PU },
              { label: 'REACTIVE', val: reactive.length, col: AM },
              { label: 'DORMANT', val: dormant.length, col: GR },
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
            {['ALL', 'REACTIVE', 'DORMANT'].map(t => (
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
              placeholder="search datasets…"
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
                {loading ? 'Loading…' : 'No datasets found.'}
              </div>
            ) : filtered.map((ds, i) => {
              const isReactive = ds._linked;
              const statusColor = isReactive ? AM : GR;
              const isExp = expanded === i;
              return (
                <div key={ds.id || i} style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{dsLabel(ds)}</span>
                    {ds.kind && chip(String(ds.kind).slice(0, 14), CY)}
                    {ds.type && chip(String(ds.type).slice(0, 14), PU)}
                    {ds.row_count != null && (
                      <span style={{ color: '#6E8AA0', fontSize: 9 }}>{Number(ds.row_count).toLocaleString()} rows</span>
                    )}
                    {chip(isReactive ? 'REACTIVE' : 'DORMANT', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {ds._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING LIVE EVENTS
                          </div>
                          {ds._matches.map(({ ev, score }, j) => (
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
                        <div style={{ color: GR, fontSize: 10 }}>No live world events match this dataset's domain.</div>
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
