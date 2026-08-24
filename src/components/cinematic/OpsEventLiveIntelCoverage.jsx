/**
 * F79 — Ops Event × Live Intel World Trigger (OELIVE)
 *
 * Parallel-fetches /v1/ops/events + /functions/getLiveIntel (quakes/crypto/FX),
 * then keyword-correlates each ops event against live world events to surface:
 *   WORLD-TRIGGERED — at least one live world event aligns with this ops event's domain
 *   ISOLATED        — no live world signal matches (internally-sourced event)
 *
 * Stat tiles: ops events / live events / world-triggered / isolated
 * Filter tabs: ALL | WORLD-TRIGGERED | ISOLATED + text search
 * Expand any event → matched live events with SEISMIC/CRYPTO/FX type badge + relevance score bar.
 * Amber badge on WORLD-TRIGGERED count.
 * ▶ ASSESS: 2-sentence ops-world alignment brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ OELIVE  at bottom:8 left:690240, zIndex:261.
 * Event:   jarvis:oelive-toggle
 * Voice:   "ops live / live ops / oelive / world triggered ops / ops world event /
 *           world ops / ops live intel / live world ops / ops event live /
 *           ops world trigger / world triggered"
 * Refresh: 60 s auto-poll (live intel changes frequently).
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const POLL_MS = 60_000;
const AM = '#f59e0b';
const CY = '#22d3ee';

const OELIVE_RE =
  /\b(ops[._-]?live|live[._-]?ops|oelive|world[._-]?triggered[._-]?ops?|ops?[._-]?world[._-]?event|world[._-]?ops?|ops?[._-]?live[._-]?intel|live[._-]?world[._-]?ops?|ops?[._-]?event[._-]?live|ops?[._-]?world[._-]?trigger|world[._-]?triggered)\b/i;

export function isOeliveQuery(t) {
  return OELIVE_RE.test(t || '');
}

export async function buildOeliveScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [opsR, intelR] = await Promise.allSettled([
      fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
    ]);
    const events   = normaliseOps(opsR.status === 'fulfilled' ? opsR.value : []);
    const intel    = normaliseLive(intelR.status === 'fulfilled' ? intelR.value : {});
    const enriched = correlate(events, intel);
    const triggered = enriched.filter(e => e._triggered).length;
    const isolated  = enriched.length - triggered;
    const topTriggered = enriched
      .filter(e => e._triggered)
      .slice(0, 4)
      .map(e => e.name)
      .join(', ') || 'none';

    return (
      `Ops Event × Live Intel World Trigger: ${events.length} ops events cross-matched against ` +
      `${intel.length} live world events (seismic/crypto/FX). ` +
      `${triggered} ops events are WORLD-TRIGGERED (live world signal aligns); ` +
      `${isolated} are ISOLATED (no external world event match — internally-sourced). ` +
      `World-triggered ops: ${topTriggered}.`
    );
  } catch {
    return 'Ops Event × Live Intel World Trigger assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseOps(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.events)             ? raw.events
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.data)               ? raw.data
    : [];
  return arr.map((e, i) => ({
    id:          e.id || e.event_id || String(i),
    name:        e.name || e.title || e.event_name || e.type || `Event ${i + 1}`,
    type:        e.type || e.event_type || e.kind || '',
    severity:    e.severity || e.level || e.priority || '',
    description: (e.description || e.summary || e.details || e.message || '').toString().slice(0, 300),
    category:    e.category || e.domain || '',
    tags:        Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function normaliseLive(raw) {
  if (!raw) return [];
  const quakes = Array.isArray(raw?.quakes)     ? raw.quakes
    : Array.isArray(raw?.earthquakes)           ? raw.earthquakes
    : [];
  const crypto = Array.isArray(raw?.crypto)     ? raw.crypto
    : typeof raw?.crypto === 'object' && raw?.crypto ? Object.values(raw.crypto)
    : [];
  const fx     = Array.isArray(raw?.fx)         ? raw.fx
    : typeof raw?.fx === 'object' && raw?.fx    ? Object.values(raw.fx)
    : [];

  const results = [];

  quakes.forEach((q, i) => {
    const place = q.place || q.location || q.region || '';
    const mag   = q.magnitude || q.mag || '';
    results.push({
      id:    `q-${i}`,
      type:  'SEISMIC',
      label: place ? `Quake M${mag} – ${place}` : `Quake M${mag}`,
      text:  `${place} earthquake magnitude ${mag} seismic tremor geological`,
    });
  });

  crypto.forEach((c, i) => {
    const sym  = c.symbol || c.coin || c.ticker || c.id || `CRYPTO${i}`;
    const chg  = c.change_24h || c.change || c.percent_change || '';
    results.push({
      id:    `c-${i}`,
      type:  'CRYPTO',
      label: `${sym} ${chg ? (Number(chg) > 0 ? '▲' : '▼') + Math.abs(Number(chg)).toFixed(2) + '%' : ''}`.trim(),
      text:  `${sym} crypto cryptocurrency digital asset finance market volatile`,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency || `FX${i}`;
    const chg  = f.change || f.change_pct || f.percent_change || '';
    results.push({
      id:    `f-${i}`,
      type:  'FX',
      label: `${pair} ${chg ? (Number(chg) > 0 ? '▲' : '▼') + Math.abs(Number(chg)).toFixed(2) + '%' : ''}`.trim(),
      text:  `${pair} forex currency exchange rate financial market`,
    });
  });

  return results;
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function matchScore(opsEvent, liveEvent) {
  const opsToks = new Set([
    ...tokens(opsEvent.name),
    ...tokens(opsEvent.description),
    ...tokens(opsEvent.type),
    ...tokens(opsEvent.category),
    ...tokens(opsEvent.tags),
  ].filter(Boolean));
  const liveToks = tokens(liveEvent.text);
  if (!opsToks.size || !liveToks.length) return 0;
  let hits = 0;
  for (const t of liveToks) if (opsToks.has(t)) hits++;
  return hits / Math.max(opsToks.size, liveToks.length);
}

function correlate(opsEvents, liveEvents) {
  return opsEvents.map(ev => {
    const scored = liveEvents
      .map(le => ({ ...le, _score: matchScore(ev, le) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
    return { ...ev, _matches: scored, _triggered: scored.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s.includes('crit') || s.includes('high') || s === 'red')   return '#f87171';
  if (s.includes('warn') || s.includes('med') || s === 'amber')  return '#facc15';
  if (s.includes('info') || s.includes('low') || s === 'green')  return '#4ade80';
  return '#64748b';
}

function typeColor(t) {
  if (t === 'SEISMIC') return '#f97316';
  if (t === 'CRYPTO')  return '#a78bfa';
  if (t === 'FX')      return '#22d3ee';
  return '#94a3b8';
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const TABS = ['ALL', 'WORLD-TRIGGERED', 'ISOLATED'];

// ── component ─────────────────────────────────────────────────────────────────
export default function OpsEventLiveIntelCoverage() {
  const [open,       setOpen]       = useState(false);
  const [opsEvents,  setOpsEvents]  = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState('');
  const [tab,        setTab]        = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [opsR, intelR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawOps   = normaliseOps(opsR.status === 'fulfilled' ? opsR.value : []);
      const rawLive  = normaliseLive(intelR.status === 'fulfilled' ? intelR.value : {});
      setOpsEvents(rawOps);
      setLiveEvents(rawLive);
      setEnriched(correlate(rawOps, rawLive));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:oelive-toggle', h);
    return () => window.removeEventListener('jarvis:oelive-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const triggered = enriched.filter(e => e._triggered).length;
    const isolated  = enriched.filter(e => !e._triggered).length;
    const prompt =
      `Ops Event × Live Intel World Trigger: ${opsEvents.length} ops events cross-matched against ` +
      `${liveEvents.length} live world events. ${triggered} ops events are WORLD-TRIGGERED ` +
      `(live world signal found); ${isolated} are ISOLATED (no external world event match). ` +
      `World-triggered events: ${enriched.filter(e => e._triggered).slice(0, 5).map(e => e.name).join(', ') || 'none'}. ` +
      `Provide a 2-sentence ops-world alignment assessment: which ops events show external world trigger correlation, ` +
      `and what this suggests about the operational posture relative to live global events.`;
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

  const triggeredCount = enriched.filter(e => e._triggered).length;
  const badgeColor = triggeredCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(ev => {
    if (search && !ev.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'WORLD-TRIGGERED') return ev._triggered;
    if (tab === 'ISOLATED')        return !ev._triggered;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ops Event × Live Intel World Trigger"
        style={{
          position: 'fixed',
          left: 690240,
          bottom: 8,
          zIndex: 261,
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
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: triggeredCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        OELIVE
        {triggeredCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {triggeredCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9102,
          width: 'min(720px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: `1px solid ${AM}44`,
          borderRadius: 14,
          boxShadow: `0 0 60px ${AM}1a`,
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ OPS EVENT × LIVE INTEL WORLD TRIGGER</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${opsEvents.length} ops events · ${liveEvents.length} live signals`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'OPS EVENTS',      val: enriched.length,                           color: '#94a3b8' },
              { label: 'LIVE SIGNALS',    val: liveEvents.length,                         color: CY },
              { label: 'WORLD-TRIGGERED', val: triggeredCount,                            color: AM },
              { label: 'ISOLATED',        val: enriched.length - triggeredCount,          color: '#64748b' },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color: t.color }}>{t.val}</div>
                <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? AM : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#000' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search ops events…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 170,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map(ev => {
              const isExp  = expanded === ev.id;
              const stClr  = ev._triggered ? AM : '#475569';
              const sevClr = severityColor(ev.severity);
              return (
                <div key={ev.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : ev.id)}
                    style={{ ...ROW, background: isExp ? `${AM}0d` : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? `${AM}0d` : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {ev._triggered ? 'WORLD-TRIGGERED' : 'ISOLATED'}
                      </span>
                      {ev.severity && (
                        <span style={{ ...PILL, background: sevClr + '22', color: sevClr }}>{ev.severity}</span>
                      )}
                      {ev.type && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{ev.type}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</span>
                      {ev._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {ev._matches.length} signal{ev._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched live events */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {ev._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>
                          No live world events align with this ops event — internally-sourced.
                        </div>
                      ) : (
                        ev._matches.map(le => (
                          <div key={le.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ ...PILL, background: typeColor(le.type) + '22', color: typeColor(le.type), flexShrink: 0 }}>{le.type}</span>
                            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{le.label}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, le._score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(le._score * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${AM}44`,
                background: assessing ? `${AM}26` : `${AM}14`,
                color: AM, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
              }}
            >
              {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
            </button>
            {assessment && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
