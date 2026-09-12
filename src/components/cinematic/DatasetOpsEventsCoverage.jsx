/**
 * F286 — Dataset × Ops Events Coverage Monitor (DOEC)
 *
 * Answers: "For each dataset, are there current operational events that
 * touch it — or is it sitting idle with no active ops footprint?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/datasets          → dataset catalog (id, name, description, category, row_count)
 *   GET /v1/ops/events        → live ops events (title, description, service, severity)
 *
 * Classification:
 *   ACTIVE — dataset keyword-matches ≥1 live ops event
 *   IDLE   — no matching ops event references this dataset
 *
 * Stat tiles:  datasets / ops events / active / idle
 * Amber badge: active count on button (datasets with ops coverage)
 * Expand row:  matched ops events with severity badge + relevance score bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ DOEC  at left:6900 bottom:18, zIndex:68
 * Event:   jarvis:doec-toggle
 * Voice:   "dataset ops / ops dataset / doec / active datasets / idle datasets /
 *           dataset events / which datasets have ops / ops coverage / dataset ops coverage"
 * Refresh: 60 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

// ─── palette ─────────────────────────────────────────────────────────────────
const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const RD   = '#EF4444';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'ACTIVE', 'IDLE'];
const CLASS_COLOR = { ACTIVE: AM, IDLE: MU };

const SEV_COLOR = {
  CRITICAL: RD,
  ERROR:    RD,
  HIGH:     '#F97316',
  WARNING:  AM,
  WARN:     AM,
  INFO:     CY,
  LOW:      GR,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const DOEC_RE =
  /\b(dataset[._-]?ops?|ops?[._-]?dataset|doec|active[._-]?datasets?|idle[._-]?datasets?|dataset[._-]?events?|which[._-]?datasets?[._-]?have[._-]?ops?|ops?[._-]?coverage|dataset[._-]?ops?[._-]?coverage)\b/i;

export function isDoecQuery(t) {
  return DOEC_RE.test(t || '');
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normDatasets(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.datasets ?? raw?.data ?? []);
  return arr.map(d => ({
    id:       d.id ?? d._id ?? String(Math.random()),
    name:     d.name ?? d.title ?? '(dataset)',
    category: d.category ?? d.type ?? '',
    rows:     d.row_count ?? d.rows ?? d.count ?? null,
    tags:     [d.name, d.description, d.category, d.tags, d.source]
               .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function normEvents(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.items ?? raw?.events ?? raw?.data ?? []);
  return arr.map(e => ({
    id:       e.id ?? e._id ?? String(Math.random()),
    title:    e.title ?? e.name ?? e.event ?? '(ops event)',
    severity: (e.severity ?? e.level ?? e.type ?? 'INFO').toString().toUpperCase(),
    service:  e.service ?? e.source ?? '',
    tags:     [e.title, e.description, e.service, e.source, e.tags, e.component]
               .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function keywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(dsTags, evTags) {
  const dk = keywords(dsTags);
  const ek = keywords(evTags);
  return dk.filter(w => ek.includes(w)).length;
}

function enrich(datasets, events) {
  return datasets.map(d => {
    const scored = events
      .map(ev => ({ ...ev, _score: relevance(d.tags, ev.tags) }))
      .filter(ev => ev._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return {
      ...d,
      _events: scored,
      _class:  scored.length > 0 ? 'ACTIVE' : 'IDLE',
    };
  });
}

export async function buildDoecScript() {
  const [dsR, evR] = await Promise.allSettled([
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const datasets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const events   = normEvents(evR.status   === 'fulfilled' ? evR.value : []);
  const rows     = enrich(datasets, events);
  const active   = rows.filter(r => r._class === 'ACTIVE').length;
  const idle     = rows.filter(r => r._class === 'IDLE').length;
  const critical = events.filter(e => e.severity === 'CRITICAL' || e.severity === 'ERROR').length;
  try {
    const body = {
      message:
        `Dataset × Ops Events: ${datasets.length} datasets, ${active} touched by live ops events, ` +
        `${idle} with no ops coverage. ${events.length} ops events total, ${critical} critical/error. ` +
        `In 2 sentences, assess which datasets are most operationally active and whether any ` +
        `critical events point to datasets that need immediate attention.`,
    };
    const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    return (
      d.response ?? d.message ?? d.text ??
      `${active} of ${datasets.length} datasets have active ops events; ${idle} are operationally idle.`
    );
  } catch {
    return `${datasets.length} datasets: ${active} active in ops, ${idle} idle — ${critical} critical ops events.`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default function DatasetOpsEventsCoverage() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [datasets,  setDatasets]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [dsR, evR] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/ops/events`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const rawDs  = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      const rawEv  = normEvents(evR.status   === 'fulfilled' ? evR.value : []);
      setEvents(rawEv);
      setDatasets(enrich(rawDs, rawEv));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:doec-toggle', onToggle);
    return () => window.removeEventListener('jarvis:doec-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildDoecScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const active = datasets.filter(d => d._class === 'ACTIVE').length;
  const idle   = datasets.filter(d => d._class === 'IDLE').length;

  const visible = datasets.filter(d => {
    if (filter !== 'ALL' && d._class !== filter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Dataset × Ops Events Coverage Monitor (DOEC)"
        style={{
          position: 'fixed', left: 6900, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${active > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ DOEC
        {active > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{active}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 660, maxHeight: '75vh', zIndex: 9000,
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ DATASET × OPS EVENTS COVERAGE
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${AM}`, borderRadius: 4, color: AM, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} disabled={loading} style={{ background: 'none', border: `1px solid ${MU}`, borderRadius: 4, color: MU, fontFamily: MONO, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {loading ? '…' : '↺'}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, fontFamily: MONO, fontSize: 13, cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
        {[
          { label: 'DATASETS',   value: datasets.length, color: CY },
          { label: 'OPS EVENTS', value: events.length,   color: '#94A3B8' },
          { label: 'ACTIVE',     value: active,           color: AM },
          { label: 'IDLE',       value: idle,             color: MU },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.07)', borderBottom: `1px solid ${BD}`, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', color: RD, fontSize: 10 }}>{error}</div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${BD}` }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? AM : 'none',
            border: `1px solid ${filter === f ? AM : BD}`,
            borderRadius: 4, color: filter === f ? '#000' : MU,
            fontFamily: MONO, fontSize: 9, padding: '2px 8px', cursor: 'pointer',
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 4, color: '#CBD5E1', fontFamily: MONO, fontSize: 10, padding: '2px 8px', width: 120, outline: 'none' }}
        />
      </div>

      {/* Dataset rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && datasets.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>Loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>No datasets match filter.</div>
        )}
        {visible.map(d => {
          const classColor = CLASS_COLOR[d._class] ?? MU;
          const isEx = expanded[d.id];
          return (
            <div key={d.id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [d.id]: !p[d.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                {d.category && (
                  <span style={{ background: 'rgba(6,182,212,0.15)', color: CY, border: `1px solid ${CY}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{d.category.toUpperCase()}</span>
                )}
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                {d.rows !== null && (
                  <span style={{ color: MU, fontSize: 9 }}>{Number(d.rows).toLocaleString()} rows</span>
                )}
                <span style={{
                  background: classColor + '22',
                  color: classColor,
                  border: `1px solid ${classColor}`,
                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 6px',
                }}>{d._class}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${BD}` }}>
                  {d._events.length === 0 ? (
                    <div style={{ color: MU, fontSize: 10 }}>No matching ops events reference this dataset.</div>
                  ) : (
                    d._events.map(ev => {
                      const sevColor = SEV_COLOR[ev.severity] ?? MU;
                      const maxScore = d._events[0]?._score || 1;
                      return (
                        <div key={ev.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ background: sevColor + '22', color: sevColor, border: `1px solid ${sevColor}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{ev.severity}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                            {ev.service && <span style={{ color: MU, fontSize: 9 }}>{ev.service}</span>}
                            <span style={{ color: AM, fontSize: 9 }}>score {ev._score}</span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((ev._score / maxScore) * 100)}%`, background: AM, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: MU, fontSize: 9 }}>60 s auto-refresh · {datasets.length} datasets · {events.length} ops events</span>
        <span style={{ color: active > 0 ? AM : MU, fontSize: 9, fontWeight: 700 }}>
          {active > 0 ? `${active} ACTIVE` : 'ALL IDLE'}
        </span>
      </div>
    </div>
  );
}
