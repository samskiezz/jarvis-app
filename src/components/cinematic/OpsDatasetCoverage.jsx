import { useState, useEffect, useCallback } from 'react';

const API = '';
const EVTDS_RE = /\b(ops[._-]?dataset|event[._-]?data[._-]?gap|data[._-]?blind|evtds|ops[._-]?data[._-]?coverage|event[._-]?dataset|dataset[._-]?coverage[._-]?ops|data[._-]?for[._-]?ops)\b/i;

export function isEvtdsQuery(t) {
  return EVTDS_RE.test(t || '');
}

export async function buildEvtdsScript() {
  const [evR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/events?limit=200`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const events = normaliseArray(evR.status === 'fulfilled' ? evR.value : []);
  const datasets = normaliseArray(dsR.status === 'fulfilled' ? dsR.value : []);
  const enriched = correlate(events, datasets);
  const blind = enriched.filter(e => !e._covered).length;
  return `Ops Event × Dataset Coverage: ${events.length} events, ${datasets.length} datasets, ${blind} blind (no dataset coverage). ` +
    `Blind events: ${enriched.filter(e => !e._covered).slice(0, 5).map(e => e.type || e.name || e.id).join(', ') || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'events', 'datasets', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(ev, ds) {
  const evToks = new Set([
    ...tokens(ev.type),
    ...tokens(ev.name),
    ...tokens(ev.category),
    ...tokens(ev.source),
    ...tokens(ev.description),
  ].filter(Boolean));
  const dsToks = [
    ...tokens(ds.name),
    ...tokens(ds.title),
    ...tokens(ds.description),
    ...tokens(ds.tags),
    ...tokens(ds.category),
    ...tokens(ds.type),
  ].filter(Boolean);
  if (!evToks.size || !dsToks.length) return 0;
  let hits = 0;
  for (const t of dsToks) if (evToks.has(t)) hits++;
  return hits / Math.max(evToks.size, dsToks.length);
}

function correlate(events, datasets) {
  return events.map(ev => {
    const scored = datasets
      .map(ds => ({ ds, score: matchScore(ev, ds) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...ev, _matches: scored, _covered: scored.length > 0 };
  });
}

const PILL = { display:'inline-block', padding:'1px 7px', borderRadius:9, fontSize:11, fontWeight:600, marginRight:4 };
const ROW = { padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,0.06)', cursor:'pointer', transition:'background 0.15s' };
const TILE = { flex:'1 1 90px', background:'rgba(255,255,255,0.05)', borderRadius:8, padding:'10px 14px', textAlign:'center' };

export default function OpsDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [datasets, setDatasets] = useState([]);
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
      const [evR, dsR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events?limit=200`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      const evs = normaliseArray(evR.status === 'fulfilled' ? evR.value : []);
      const dss = normaliseArray(dsR.status === 'fulfilled' ? dsR.value : []);
      setEvents(evs);
      setDatasets(dss);
      setEnriched(correlate(evs, dss));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = e => { if (e?.detail?.open !== undefined ? e.detail.open : true) setOpen(v => !v); else setOpen(v => !v); };
    window.addEventListener('jarvis:evtds-toggle', h);
    return () => window.removeEventListener('jarvis:evtds-toggle', h);
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
    const blind = enriched.filter(e => !e._covered);
    const prompt = `Ops Event × Dataset Coverage: ${events.length} ops events, ${datasets.length} datasets. ` +
      `${enriched.filter(e => e._covered).length} events have dataset coverage, ${blind.length} are BLIND (no dataset). ` +
      `Blind events: ${blind.slice(0, 6).map(e => e.type || e.name || e.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence operational data-coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const blind = enriched.filter(e => !e._covered);
  const badge = blind.length > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(e => {
    const label = (e.type || e.name || e.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'DOCUMENTED') return e._covered;
    if (tab === 'BLIND') return !e._covered;
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ops Event × Dataset Coverage"
        style={{
          position: 'fixed', left: 347280, bottom: 8, zIndex: 169,
          background: 'rgba(0,0,0,0.85)', border: `1px solid ${badge}`,
          color: badge, borderRadius: 6, padding: '3px 9px', fontSize: 11,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          boxShadow: blind.length > 0 ? `0 0 8px ${badge}55` : 'none',
          fontFamily: 'monospace',
        }}
      >
        ◈ EVTDS
        {blind.length > 0 && (
          <span style={{ ...PILL, background: '#f59e0b22', color: '#f59e0b', marginLeft: 6 }}>
            {blind.length} blind
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', top: 60, right: 20, width: 600, maxHeight: '82vh',
          background: 'rgba(8,12,20,0.97)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 12, zIndex: 9200, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)', fontFamily: 'monospace',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ OPS × DATASET COVERAGE</span>
            <span style={{ ...PILL, background: '#f59e0b22', color: '#f59e0b' }}>{enriched.filter(e => e._covered).length} documented</span>
            {blind.length > 0 && <span style={{ ...PILL, background: '#ef444422', color: '#ef4444' }}>{blind.length} blind</span>}
            {loading && <span style={{ color: '#888', fontSize: 11 }}>loading…</span>}
            <span style={{ flex: 1 }} />
            <button onClick={assess} disabled={assessing} style={{ fontSize: 11, color: '#f59e0b', background: 'transparent', border: '1px solid #f59e0b55', borderRadius: 5, padding: '2px 9px', cursor: 'pointer' }}>
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            <button onClick={() => setOpen(false)} style={{ color: '#888', background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', marginLeft: 6 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { label: 'Events', val: events.length, color: '#60a5fa' },
              { label: 'Datasets', val: datasets.length, color: '#a78bfa' },
              { label: 'Documented', val: enriched.filter(e => e._covered).length, color: '#22c55e' },
              { label: 'Blind', val: blind.length, color: blind.length > 0 ? '#f59e0b' : '#555' },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ color: t.color, fontWeight: 700, fontSize: 18 }}>{t.val}</div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
            {['ALL', 'DOCUMENTED', 'BLIND'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
                background: tab === t ? 'rgba(245,158,11,0.18)' : 'transparent',
                border: tab === t ? '1px solid #f59e0b55' : '1px solid transparent',
                color: tab === t ? '#f59e0b' : '#888',
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="filter events…"
              style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc', borderRadius: 5, padding: '3px 9px', fontSize: 11, width: 160 }}
            />
          </div>

          {/* Assessment */}
          {assessment && (
            <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid rgba(245,158,11,0.15)', color: '#fcd34d', fontSize: 12 }}>
              {assessment}
            </div>
          )}

          {err && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 12 }}>{err}</div>}

          {/* Event list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: '#555', padding: 20, textAlign: 'center', fontSize: 12 }}>No events</div>
            )}
            {visible.map((ev, i) => {
              const key = ev.id || ev._id || i;
              const label = ev.type || ev.name || ev.id || `event-${i}`;
              const isOpen = expanded === key;
              return (
                <div key={key}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : key)}
                    style={{ ...ROW, background: isOpen ? 'rgba(245,158,11,0.06)' : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isOpen ? 'rgba(245,158,11,0.06)' : 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: ev._covered ? '#22c55e22' : '#ef444422', color: ev._covered ? '#22c55e' : '#ef4444' }}>
                        {ev._covered ? 'DOCUMENTED' : 'BLIND'}
                      </span>
                      <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1 }}>{label}</span>
                      {ev.source && <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>{ev.source}</span>}
                      {ev.category && <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>{ev.category}</span>}
                      <span style={{ color: '#555', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '8px 18px 12px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {ev.description && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{ev.description}</div>}
                      {ev._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>Dataset matches:</div>
                          {ev._matches.map(({ ds, score }, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ color: '#a78bfa', fontSize: 11, flex: 1 }}>{ds.name || ds.title || ds.id}</span>
                                <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No dataset coverage for this event type.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
