import { useState, useEffect, useCallback } from 'react';

const API = '';

const RSOE_RE = /\b(risk[._-]?signal[._-]?ops?|ops?[._-]?risk[._-]?signal|rsoe|monitored[._-]?risks?|risk[._-]?ops?[._-]?coverage|unmonitored[._-]?risk[._-]?signal|risk[._-]?ops?[._-]?event|risk[._-]?ops?[._-]?monitoring|risk[._-]?ops?[._-]?track)\b/i;

export function isRsoeQuery(t) {
  return RSOE_RE.test(t || '');
}

export async function buildRsoeScript() {
  const [rskR, opsR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const signals  = normaliseSignals(rskR.status === 'fulfilled' ? rskR.value : []);
  const events   = normaliseEvents(opsR.status === 'fulfilled' ? opsR.value : []);
  const enriched = correlate(signals, events);
  const monitored   = enriched.filter(s => s._monitored).length;
  const unmonitored = enriched.length - monitored;
  return (
    `Risk Signal × Ops Event Coverage: ${signals.length} risk signals, ${events.length} ops events indexed. ` +
    `${monitored} signals are MONITORED (ops event coverage detected); ${unmonitored} are UNMONITORED (no ops tracking — operational gap). ` +
    `Top unmonitored: ${enriched.filter(s => !s._monitored).slice(0, 4).map(s => s.name || s.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'signals', 'entities', 'records', 'risks']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const arr = ['events', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:          e.id || String(i),
    name:        e.name || e.title || e.event || e.type || `Ops Event ${i + 1}`,
    description: String(e.description || e.message || e.summary || '').slice(0, 300),
    severity:    e.severity || e.level || e.priority || '',
    type:        e.type || e.kind || e.category || '',
    tags:        Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(signal, event) {
  const sigToks = new Set([
    ...tokens(signal.name || signal.title || signal.signal),
    ...tokens(signal.description),
    ...tokens(signal.category),
    ...tokens(signal.sector),
    ...tokens(signal.source),
    ...tokens(Array.isArray(signal.tags) ? signal.tags.join(' ') : (signal.tags || '')),
  ].filter(Boolean));
  const evToks = [
    ...tokens(event.name),
    ...tokens(event.description),
    ...tokens(event.type),
    ...tokens(event.tags),
  ].filter(Boolean);
  if (!sigToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (sigToks.has(t)) hits++;
  return hits / Math.max(sigToks.size, evToks.length);
}

function correlate(signals, events) {
  return signals.map(signal => {
    const scored = events
      .map(e => ({ ...e, _score: matchScore(signal, e) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...signal, _monitored: scored.length > 0, _matches: scored };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s.includes('critical') || s.includes('high')) return '#EF4444';
  if (s.includes('warn') || s.includes('medium'))   return '#F59E0B';
  if (s.includes('info') || s.includes('low'))      return '#22C55E';
  return '#6E8AA0';
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
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

export default function RiskSignalOpsEventCoverage() {
  const [open, setOpen]         = useState(false);
  const [signals, setSignals]   = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rskR, opsR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      setSignals(normaliseSignals(rskR.status === 'fulfilled' ? rskR.value : []));
      setEvents(normaliseEvents(opsR.status === 'fulfilled' ? opsR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rsoe-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rsoe-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched    = correlate(signals, events);
  const monitored   = enriched.filter(s => s._monitored);
  const unmonitored = enriched.filter(s => !s._monitored);
  const badgeCount  = unmonitored.length;
  const badgeColor  = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(s => tab === 'ALL' || (tab === 'MONITORED' ? s._monitored : !s._monitored))
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(s.name || s.title || s.signal || '').toLowerCase().includes(q) ||
        String(s.category || '').toLowerCase().includes(q) ||
        String(s.sector || '').toLowerCase().includes(q) ||
        String(s.source || '').toLowerCase().includes(q)
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
          message: `You have ${signals.length} risk signals and ${events.length} active ops events. ` +
            `${monitored.length} signals are MONITORED (ops event coverage detected); ` +
            `${unmonitored.length} are UNMONITORED (no ops tracking — operational gap). ` +
            `Give a 2-sentence risk-ops monitoring coverage brief highlighting the most critical unmonitored risks or coverage achievements.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = s => s.name || s.title || s.signal || s.id || '?';

  return (
    <>
      {/* Floating toggle button (far-left off-screen; toggled by voice/event) */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Risk Signal × Ops Event Coverage (RSOE)"
        style={{
          position: 'fixed', left: 712080, bottom: 8, zIndex: 300,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ RSOE
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
              ◈ RISK SIGNAL × OPS EVENT COVERAGE
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
              { label: 'RISK SIGNALS',  val: signals.length,     col: RD },
              { label: 'OPS EVENTS',    val: events.length,      col: '#A78BFA' },
              { label: 'MONITORED',     val: monitored.length,   col: GR },
              { label: 'UNMONITORED',   val: unmonitored.length, col: AM },
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
            {['ALL', 'MONITORED', 'UNMONITORED'].map(t => (
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
              placeholder="search risk signals…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No risk signals found.'}
              </div>
            ) : filtered.map((signal, i) => {
              const isExp     = expanded === i;
              const statusClr = signal._monitored ? GR : AM;
              const sev       = signal.severity || signal.level || signal.priority || '';
              return (
                <div
                  key={signal.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusClr,
                      boxShadow: `0 0 6px ${statusClr}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(signal)}</span>
                    {sev && chip(sev, severityColor(sev))}
                    {signal.category && chip(signal.category, '#A78BFA')}
                    {chip(signal._monitored ? 'MONITORED' : 'UNMONITORED', statusClr)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {signal._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED OPS EVENTS
                          </div>
                          {signal._matches.map((ev, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {ev.name || ev.id || '?'}
                              </span>
                              {ev.severity && chip(ev.severity, severityColor(ev.severity))}
                              {ev.type     && chip(ev.type, '#6E8AA0')}
                              {scorebar(ev._score, GR)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No ops events monitored this risk signal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
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
