/**
 * F280 — SwarmJob × Live Intel Pulse Monitor (SLIPM)
 *
 * Answers: "For each active SwarmJob, which live world events (seismic /
 * crypto / FX) are relevant to its objective — and which jobs have no
 * matching live signal at all?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob           → active/queued/running swarm jobs
 *   GET /functions/getLiveIntel      → live earthquakes, crypto tickers, FX rates
 *
 * Classification:
 *   TRIGGERED — swarm job keyword-matches ≥1 live world event
 *   HUNTING   — no matching live event (job objectives are not reflected in live intel)
 *
 * Stat tiles:  jobs / live events / triggered / hunting
 * Amber badge: triggered count on button (jobs with live signal hits)
 * Expand row:  matched live events with SEISMIC/CRYPTO/FX badge + relevance score bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ SLIPM  at left:6540 bottom:18, zIndex:68
 * Event:   jarvis:slipm-toggle
 * Voice:   "swarm pulse / live swarm / slipm / swarm intel / swarm triggers /
 *           triggered swarms / world swarm / swarm live intel / swarm world events"
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
const PU   = '#A855F7';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'TRIGGERED', 'HUNTING'];
const CLASS_COLOR = { TRIGGERED: AM, HUNTING: MU };
const TYPE_COLOR  = { SEISMIC: RD, CRYPTO: CY, FX: GR };

const STATUS_COLOR = {
  RUNNING:   GR,
  QUEUED:    CY,
  COMPLETED: PU,
  FAILED:    RD,
  STOPPED:   MU,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const SLIPM_RE =
  /\b(swarm[._-]?pulse|live[._-]?swarm|slipm|swarm[._-]?intel|swarm[._-]?triggers?|triggered[._-]?swarms?|world[._-]?swarm|swarm[._-]?live[._-]?intel|swarm[._-]?world[._-]?events?)\b/i;

export function isSlıpmQuery(t) {
  return SLIPM_RE.test(t || '');
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normJobs(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.jobs ?? raw?.data ?? []);
  return arr.map(j => ({
    id:     j.id ?? j._id ?? String(Math.random()),
    name:   j.name ?? j.title ?? j.objective ?? '(swarm job)',
    status: (j.status ?? j.state ?? 'UNKNOWN').toString().toUpperCase(),
    tags:   [j.name, j.description, j.objective, j.target, j.tags]
             .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function normIntel(raw) {
  const events = [];
  const quakes = raw?.earthquakes ?? raw?.seismic ?? raw?.events ?? [];
  (Array.isArray(quakes) ? quakes : []).forEach(q => {
    const label = q.place ?? q.location ?? q.region ?? 'Seismic event';
    const mag   = q.magnitude ?? q.mag ?? '';
    events.push({
      id:   `seismic-${q.id ?? label}`,
      type: 'SEISMIC',
      label: `M${mag} ${label}`,
      tags: `${label} earthquake seismic fault ${mag}`.toLowerCase(),
    });
  });
  const crypto = raw?.crypto ?? raw?.markets?.crypto ?? [];
  (Array.isArray(crypto) ? crypto : []).forEach(c => {
    const sym = c.symbol ?? c.ticker ?? c.name ?? 'CRYPTO';
    const chg = c.change_pct ?? c.change ?? c.pct ?? 0;
    events.push({
      id:   `crypto-${sym}`,
      type: 'CRYPTO',
      label: `${sym} ${chg >= 0 ? '+' : ''}${Number(chg).toFixed(2)}%`,
      tags: `${sym} crypto bitcoin ethereum token blockchain ${chg > 0 ? 'bull rise' : 'bear drop'}`.toLowerCase(),
    });
  });
  const fx = raw?.fx ?? raw?.forex ?? raw?.markets?.fx ?? [];
  (Array.isArray(fx) ? fx : []).forEach(f => {
    const pair = f.pair ?? f.symbol ?? f.name ?? 'FX';
    const rate = f.rate ?? f.price ?? '';
    events.push({
      id:   `fx-${pair}`,
      type: 'FX',
      label: `${pair} ${rate}`,
      tags: `${pair} forex currency exchange rate`.toLowerCase(),
    });
  });
  return events;
}

function keywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(jobTags, eventTags) {
  const jk = keywords(jobTags);
  const ek = keywords(eventTags);
  return jk.filter(w => ek.includes(w)).length;
}

function enrich(jobs, events) {
  return jobs.map(j => {
    const scored = events
      .map(ev => ({ ...ev, _score: relevance(j.tags, ev.tags) }))
      .filter(ev => ev._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return {
      ...j,
      _events: scored,
      _class:  scored.length > 0 ? 'TRIGGERED' : 'HUNTING',
    };
  });
}

export async function buildSlıpmScript() {
  const [jobR, intelR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const jobs    = normJobs(jobR.status    === 'fulfilled' ? jobR.value    : []);
  const events  = normIntel(intelR.status === 'fulfilled' ? intelR.value  : {});
  const rows    = enrich(jobs, events);
  const trigger = rows.filter(r => r._class === 'TRIGGERED').length;
  const hunting = rows.filter(r => r._class === 'HUNTING').length;
  const running = rows.filter(r => r.status === 'RUNNING').length;
  try {
    const body = {
      message: `SwarmJob × Live Intel: ${jobs.length} swarm jobs, ` +
        `${trigger} triggered by live world events, ${hunting} hunting with no live signal. ` +
        `${running} jobs currently running. Live world events: ${events.length}. ` +
        `In 2 sentences, assess swarm-to-live-intel alignment and recommend ` +
        `whether any swarm objectives should be redirected based on live signals.`,
    };
    const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    return d.response ?? d.message ?? d.text ??
      `${trigger} swarms triggered by live world events, ${hunting} hunting — ${trigger > 0 ? 'swarm-world alignment detected' : 'no current swarm triggers'}.`;
  } catch {
    return `${jobs.length} swarm jobs: ${trigger} triggered by live intel, ${hunting} hunting.`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default function SwarmLiveIntelPulseMonitor() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [jobs,      setJobs]      = useState([]);
  const [events,    setEvents]    = useState([]);
  const [filter,    setFilter]    = useState('ALL');
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [jobR, intelR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const rawJobs   = normJobs(jobR.status    === 'fulfilled' ? jobR.value    : []);
      const rawEvents = normIntel(intelR.status === 'fulfilled' ? intelR.value  : {});
      setEvents(rawEvents);
      setJobs(enrich(rawJobs, rawEvents));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:slipm-toggle', onToggle);
    return () => window.removeEventListener('jarvis:slipm-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildSlıpmScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const triggered = jobs.filter(j => j._class === 'TRIGGERED').length;
  const hunting   = jobs.filter(j => j._class === 'HUNTING').length;

  const visible = jobs.filter(j => {
    if (filter !== 'ALL' && j._class !== filter) return false;
    if (search && !j.name.toLowerCase().includes(search.toLowerCase()) &&
        !j.status.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="SwarmJob × Live Intel Pulse Monitor (SLIPM)"
        style={{
          position: 'fixed', left: 6540, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${triggered > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ SLIPM
        {triggered > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{triggered}</span>
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
          ◈ SWARM × LIVE INTEL PULSE
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
          { label: 'SWARM JOBS',   value: jobs.length,    color: CY },
          { label: 'LIVE EVENTS',  value: events.length,  color: '#94A3B8' },
          { label: 'TRIGGERED',    value: triggered,       color: AM },
          { label: 'HUNTING',      value: hunting,         color: MU },
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

      {/* Job rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && jobs.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>Loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>No swarm jobs match filter.</div>
        )}
        {visible.map(j => {
          const statusColor = STATUS_COLOR[j.status] ?? MU;
          const classColor  = CLASS_COLOR[j._class]  ?? MU;
          const isEx = expanded[j.id];
          return (
            <div key={j.id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [j.id]: !p[j.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}`, borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{j.status}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                <span style={{
                  background: classColor + '22',
                  color: classColor,
                  border: `1px solid ${classColor}`,
                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 6px',
                }}>{j._class}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${BD}` }}>
                  {j._events.length === 0 ? (
                    <div style={{ color: MU, fontSize: 10 }}>No matching live world events found for this job's objective.</div>
                  ) : (
                    j._events.map(ev => {
                      const typeColor = TYPE_COLOR[ev.type] ?? MU;
                      const maxScore  = j._events[0]?._score || 1;
                      return (
                        <div key={ev.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ background: typeColor, color: '#000', borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{ev.type}</span>
                            <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
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
        <span style={{ color: MU, fontSize: 9 }}>60 s auto-refresh · {jobs.length} jobs · {events.length} live events</span>
        <span style={{ color: triggered > 0 ? AM : MU, fontSize: 9, fontWeight: 700 }}>
          {triggered > 0 ? `${triggered} TRIGGERED` : 'NONE TRIGGERED'}
        </span>
      </div>
    </div>
  );
}
