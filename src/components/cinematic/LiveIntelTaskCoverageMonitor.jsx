/**
 * F279 — Live Intel × Task Coverage Monitor (LITCM)
 *
 * Answers: "For each live world event (seismic / crypto / FX), is there an
 * active Task that matches it — or is it going untracked in the task system?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /functions/getLiveIntel   → live earthquakes, crypto tickers, FX rates
 *   GET /entities/Task            → active task list
 *
 * Classification:
 *   COVERED   — live event keyword-matches at least 1 active task
 *   UNCOVERED — no matching task (potential operational gap)
 *
 * Stat tiles:  live events / tasks / covered / uncovered
 * Amber badge: uncovered count on button
 * Expand row:  matched tasks with status badge + relevance score bar (max 5)
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ LITCM  at left:6480 bottom:18, zIndex:68
 * Event:   jarvis:litcm-toggle
 * Voice:   "live intel task / task coverage / litcm / uncovered events /
 *           live events without tasks / which events have tasks /
 *           live world task / intel task gap / event task coverage"
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

const FILTERS    = ['ALL', 'COVERED', 'UNCOVERED'];
const CLASS_COLOR = { COVERED: GR, UNCOVERED: AM };

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const LITCM_RE =
  /\b(live[._-]?intel[._-]?task|task[._-]?coverage|litcm|uncovered[._-]?events?|live[._-]?events?[._-]?without[._-]?tasks?|which[._-]?events?[._-]?have[._-]?tasks?|live[._-]?world[._-]?task|intel[._-]?task[._-]?gap|event[._-]?task[._-]?coverage)\b/i;

export function isLitcmQuery(t) {
  return LITCM_RE.test(t || '');
}

// ─── normalizers ─────────────────────────────────────────────────────────────
function normTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.tasks ?? raw?.data ?? []);
  return arr.map(t => ({
    id:       t.id ?? t._id ?? String(Math.random()),
    name:     t.name ?? t.title ?? t.summary ?? '(task)',
    status:   (t.status ?? t.state ?? 'UNKNOWN').toString().toUpperCase(),
    priority: (t.priority ?? t.urgency ?? '').toString().toUpperCase(),
    tags:     [t.name, t.title, t.description, t.objective, t.tags]
               .filter(Boolean).join(' ').toLowerCase(),
  }));
}

function normIntel(raw) {
  const events = [];
  // Seismic
  const quakes = raw?.earthquakes ?? raw?.seismic ?? raw?.events ?? [];
  (Array.isArray(quakes) ? quakes : []).forEach(q => {
    const label = q.place ?? q.location ?? q.region ?? 'Seismic event';
    const mag   = q.magnitude ?? q.mag ?? '';
    events.push({
      id:       `seismic-${q.id ?? label}`,
      type:     'SEISMIC',
      label:    `M${mag} ${label}`,
      tags:     `${label} earthquake seismic fault ${mag}`.toLowerCase(),
    });
  });
  // Crypto
  const crypto = raw?.crypto ?? raw?.markets?.crypto ?? [];
  (Array.isArray(crypto) ? crypto : []).forEach(c => {
    const sym = c.symbol ?? c.ticker ?? c.name ?? 'CRYPTO';
    const chg = c.change_pct ?? c.change ?? c.pct ?? 0;
    events.push({
      id:       `crypto-${sym}`,
      type:     'CRYPTO',
      label:    `${sym} ${chg >= 0 ? '+' : ''}${Number(chg).toFixed(2)}%`,
      tags:     `${sym} crypto bitcoin ethereum token blockchain ${chg > 0 ? 'bull rise' : 'bear drop'}`.toLowerCase(),
    });
  });
  // FX
  const fx = raw?.fx ?? raw?.forex ?? raw?.markets?.fx ?? [];
  (Array.isArray(fx) ? fx : []).forEach(f => {
    const pair = f.pair ?? f.symbol ?? f.name ?? 'FX';
    const rate = f.rate ?? f.price ?? '';
    events.push({
      id:       `fx-${pair}`,
      type:     'FX',
      label:    `${pair} ${rate}`,
      tags:     `${pair} forex currency exchange rate`.toLowerCase(),
    });
  });
  return events;
}

function keywords(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function relevance(eventTags, taskTags) {
  const ek = keywords(eventTags);
  const tk = keywords(taskTags);
  const matches = ek.filter(w => tk.includes(w));
  return matches.length;
}

function enrich(events, tasks) {
  return events.map(ev => {
    const scored = tasks
      .map(t => ({ ...t, _score: relevance(ev.tags, t.tags) }))
      .filter(t => t._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return {
      ...ev,
      _tasks: scored,
      _class: scored.length > 0 ? 'COVERED' : 'UNCOVERED',
    };
  });
}

export async function buildLitcmScript() {
  const [intelR, taskR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const intel   = normIntel(intelR.status === 'fulfilled' ? intelR.value : {});
  const tasks   = normTasks(taskR.status  === 'fulfilled' ? taskR.value  : []);
  const rows    = enrich(intel, tasks);
  const uncov   = rows.filter(r => r._class === 'UNCOVERED').length;
  const cov     = rows.filter(r => r._class === 'COVERED').length;
  const seismic = rows.filter(r => r.type === 'SEISMIC');
  const uncovSeismic = seismic.filter(r => r._class === 'UNCOVERED').length;
  try {
    const body = {
      message: `Live Intel × Task Coverage: ${rows.length} live events, ` +
        `${cov} covered by tasks, ${uncov} uncovered. ` +
        `${uncovSeismic} seismic events have no matching task. ` +
        `Tasks total: ${tasks.length}. ` +
        `In 2 sentences, assess operational task coverage of live world events and ` +
        `recommend priority action if gaps exist.`,
    };
    const res  = await fetch(`${API}/v1/jarvis/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    return d.response ?? d.message ?? d.text ?? `${cov} events covered, ${uncov} uncovered — ${uncov > 0 ? 'gaps detected' : 'all tracked'}.`;
  } catch {
    return `${rows.length} live events: ${cov} covered, ${uncov} uncovered by task system.`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────
export default function LiveIntelTaskCoverageMonitor() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [events,   setEvents]   = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [filter,   setFilter]   = useState('ALL');
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [intelR, taskR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      const rawIntel = normIntel(intelR.status === 'fulfilled' ? intelR.value : {});
      const rawTasks = normTasks(taskR.status  === 'fulfilled' ? taskR.value  : []);
      setTasks(rawTasks);
      setEvents(enrich(rawIntel, rawTasks));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:litcm-toggle', onToggle);
    return () => window.removeEventListener('jarvis:litcm-toggle', onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief('');
    const script = await buildLitcmScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  };

  const uncov = events.filter(r => r._class === 'UNCOVERED').length;
  const cov   = events.filter(r => r._class === 'COVERED').length;

  const visible = events.filter(ev => {
    if (filter !== 'ALL' && ev._class !== filter) return false;
    if (search && !ev.label.toLowerCase().includes(search.toLowerCase()) &&
        !ev.type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const TYPE_COLOR = { SEISMIC: RD, CRYPTO: CY, FX: GR };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Live Intel × Task Coverage Monitor (LITCM)"
        style={{
          position: 'fixed', left: 6480, bottom: 18, zIndex: 68,
          background: 'rgba(10,12,20,0.85)',
          border: `1px solid ${uncov > 0 ? AM : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 6, color: '#CBD5E1', fontFamily: MONO, fontSize: 10,
          padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color .2s',
        }}
      >
        ◈ LITCM
        {uncov > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 10,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
          }}>{uncov}</span>
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
        <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          ◈ LIVE INTEL × TASK COVERAGE
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: 'none', border: `1px solid ${CY}`, borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>
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
          { label: 'LIVE EVENTS', value: events.length, color: CY },
          { label: 'TASKS',       value: tasks.length,  color: '#94A3B8' },
          { label: 'COVERED',     value: cov,            color: GR },
          { label: 'UNCOVERED',   value: uncov,          color: AM },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: MU, fontSize: 9, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ padding: '8px 14px', background: 'rgba(6,182,212,0.07)', borderBottom: `1px solid ${BD}`, color: '#CBD5E1', fontSize: 11, lineHeight: 1.5 }}>
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
            background: filter === f ? CY : 'none',
            border: `1px solid ${filter === f ? CY : BD}`,
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

      {/* Event rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px' }}>
        {loading && events.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>Loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MU, fontSize: 11, textAlign: 'center', paddingTop: 20 }}>No events match filter.</div>
        )}
        {visible.map(ev => {
          const typeColor = TYPE_COLOR[ev.type] ?? MU;
          const isEx = expanded[ev.id];
          return (
            <div key={ev.id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${BD}` }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [ev.id]: !p[ev.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ background: typeColor, color: '#000', borderRadius: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{ev.type}</span>
                <span style={{ color: '#E2E8F0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                <span style={{
                  background: CLASS_COLOR[ev._class] + '22',
                  color: CLASS_COLOR[ev._class],
                  border: `1px solid ${CLASS_COLOR[ev._class]}`,
                  borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 6px',
                }}>{ev._class}</span>
                <span style={{ color: MU, fontSize: 10 }}>{isEx ? '▲' : '▼'}</span>
              </div>
              {isEx && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${BD}` }}>
                  {ev._tasks.length === 0 ? (
                    <div style={{ color: AM, fontSize: 10 }}>No matching tasks found for this event.</div>
                  ) : (
                    ev._tasks.map(t => {
                      const maxScore = ev._tasks[0]?._score || 1;
                      return (
                        <div key={t.id} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ background: 'rgba(255,255,255,0.08)', color: '#94A3B8', borderRadius: 3, fontSize: 8, padding: '1px 5px' }}>{t.status}</span>
                            {t.priority && <span style={{ color: MU, fontSize: 8 }}>{t.priority}</span>}
                            <span style={{ color: '#CBD5E1', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            <span style={{ color: CY, fontSize: 9 }}>score {t._score}</span>
                          </div>
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((t._score / maxScore) * 100)}%`, background: GR, borderRadius: 2 }} />
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
        <span style={{ color: MU, fontSize: 9 }}>60 s auto-refresh · {events.length} events · {tasks.length} tasks</span>
        <span style={{ color: uncov > 0 ? AM : GR, fontSize: 9, fontWeight: 700 }}>
          {uncov > 0 ? `${uncov} UNCOVERED` : 'ALL TRACKED'}
        </span>
      </div>
    </div>
  );
}
