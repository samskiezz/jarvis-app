import { useState, useEffect, useCallback } from 'react';

const API = '';
const ILIP_RE = /\b(investigation[._-]?intel|investigation[._-]?pulse|live[._-]?cases|case[._-]?pulse|ilip|cases[._-]?active|active[._-]?cases|investigation[._-]?live|case[._-]?world|cases[._-]?accelerating|open[._-]?case[._-]?intel|which[._-]?cases[._-]?are[._-]?live)\b/i;

export function isIlipQuery(t) {
  return ILIP_RE.test(t || '');
}

export async function buildIlipScript() {
  const [invR, liR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const cases = normaliseArray(invR.status === 'fulfilled' ? invR.value : []);
  const events = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
  const enriched = correlate(cases, events);
  const accelerating = enriched.filter(c => c._accelerating).length;
  const stalled = enriched.filter(c => !c._accelerating).length;
  const top = enriched.filter(c => c._accelerating).slice(0, 4)
    .map(c => c.title || c.name || c.id || '?').join(', ');
  return `Investigation × Live World Events: ${cases.length} open cases, ${events.length} live events indexed. ` +
    `${accelerating} cases are ACCELERATING (world-event alignment); ${stalled} are STALLED (no live signal). ` +
    `Top accelerating cases: ${top || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'investigations', 'cases', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseLiveIntel(raw) {
  if (!raw) return [];
  const out = [];
  if (Array.isArray(raw)) return raw;
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
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function eventLabel(ev) {
  return [ev.name, ev.title, ev.description, ev.location, ev.place, ev.symbol, ev.pair].filter(Boolean).join(' ');
}

function matchScore(inv, event) {
  const invToks = new Set([
    ...tokens(inv.title),
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.summary),
    ...tokens(inv.type),
    ...tokens(inv.category),
    ...tokens(inv.tags),
    ...tokens(inv.subject),
    ...tokens(inv.location),
  ].filter(Boolean));
  const evToks = tokens(eventLabel(event));
  if (!invToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, evToks.length);
}

function correlate(cases, events) {
  return cases.map(inv => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(inv, ev) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...inv, _matches: scored, _accelerating: scored.length > 0 };
  });
}

const TYPE_COLORS = { SEISMIC: '#f97316', CRYPTO: '#a78bfa', FX: '#22d3ee' };
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function InvestigationLiveIntelPulse() {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [events, setEvents] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [invR, liR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      const c = normaliseArray(invR.status === 'fulfilled' ? invR.value : []);
      const e = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
      setCases(c);
      setEvents(e);
      setEnriched(correlate(c, e));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:ilip-toggle', h);
    return () => window.removeEventListener('jarvis:ilip-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const accelerating = enriched.filter(c => c._accelerating);
    const stalled = enriched.filter(c => !c._accelerating);
    const prompt =
      `Investigation × Live World Events: ${cases.length} open cases, ${events.length} live events. ` +
      `${accelerating.length} cases are ACCELERATING (live world event overlap); ${stalled.length} are STALLED (no live signal). ` +
      `Top accelerating: ${accelerating.slice(0, 5).map(c => c.title || c.name || c.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence case-world pulse brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const acceleratingCount = enriched.filter(c => c._accelerating).length;
  const stalledCount = enriched.filter(c => !c._accelerating).length;
  const badge = acceleratingCount > 0 ? '#22d3ee' : '#64748b';

  const visible = enriched.filter(inv => {
    const label = (inv.title || inv.name || inv.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'ACCELERATING') return inv._accelerating;
    if (tab === 'STALLED') return !inv._accelerating;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigation × Live Intel Pulse"
        style={{
          position: 'fixed',
          left: 57880,
          bottom: 8,
          zIndex: 112,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: acceleratingCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        ILIP
        {acceleratingCount > 0 && (
          <span style={{ background: badge, color: '#0f172a', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {acceleratingCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9604,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#22d3ee' }}>◈ INVESTIGATION × LIVE INTEL PULSE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.35)', borderRadius: 6, color: '#22d3ee', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'CASES', val: cases.length, color: '#60a5fa' },
              { label: 'LIVE EVENTS', val: events.length, color: '#94a3b8' },
              { label: 'ACCELERATING', val: acceleratingCount, color: '#22d3ee' },
              { label: 'STALLED', val: stalledCount, color: stalledCount > 0 ? '#64748b' : '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 8, fontSize: 12, color: '#67e8f9', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'ACCELERATING', 'STALLED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#22d3ee' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cases…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No cases match the current filter.</div>
          )}

          <div>
            {visible.map((inv, i) => {
              const id = inv.id || inv.case_id || i;
              const label = inv.title || inv.name || `Case ${id}`;
              const status = inv.status || inv.state || '';
              const priority = inv.priority || inv.severity || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: inv._accelerating ? 'rgba(34,211,238,0.15)' : 'rgba(100,116,139,0.15)',
                      color: inv._accelerating ? '#22d3ee' : '#64748b',
                      border: `1px solid ${inv._accelerating ? 'rgba(34,211,238,0.3)' : 'rgba(100,116,139,0.25)'}`,
                    }}>
                      {inv._accelerating ? 'ACCELERATING' : 'STALLED'}
                    </span>
                    {status && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {status}
                      </span>
                    )}
                    {priority && (
                      <span style={{ ...PILL, background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                        {priority}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {inv._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched live world events:</div>
                          {inv._matches.map(({ ev, score }, j) => {
                            const evName = ev.name || ev.title || ev.description || ev.symbol || ev.pair || `event-${j}`;
                            const evType = ev._type || ev.type || 'EVENT';
                            const typeColor = TYPE_COLORS[evType] || '#94a3b8';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ ...PILL, background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}40` }}>
                                    {evType}
                                  </span>
                                  <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evName}</span>
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: typeColor, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: 11 }}>No live world event matched — case has no current world-state signal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} cases · {events.length} live events indexed · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
