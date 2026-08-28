import { useState, useEffect, useCallback } from 'react';

const API = '';
const IPLIVE_RE = /\b(intel[._-]?profile[._-]?live|intel[._-]?profile[._-]?world|iplive|active[._-]?profiles|profiles[._-]?activated|profile[._-]?world[._-]?events|profile[._-]?geo|intel[._-]?profile[._-]?exposure|world[._-]?intel[._-]?profile|which[._-]?profiles[._-]?are[._-]?active|profile[._-]?live[._-]?intel)\b/i;

export function isIpliveQuery(t) {
  return IPLIVE_RE.test(t || '');
}

export async function buildIpliveScript() {
  const [ipR, liR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
  ]);
  const profiles = normaliseArray(ipR.status === 'fulfilled' ? ipR.value : []);
  const events = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
  const enriched = correlate(profiles, events);
  const activated = enriched.filter(p => p._activated).length;
  const dormant = enriched.filter(p => !p._activated).length;
  const top = enriched.filter(p => p._activated).slice(0, 4)
    .map(p => p.name || p.title || p.id || '?').join(', ');
  return `Intel Profile × Live World Events: ${profiles.length} profiles, ${events.length} live events indexed. ` +
    `${activated} profiles are ACTIVATED (live world event overlap); ${dormant} are DORMANT (no live alignment). ` +
    `Top activated profiles: ${top || 'none'}.`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'profiles', 'records', 'entities']) {
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

function matchScore(profile, event) {
  const pToks = new Set([
    ...tokens(profile.name),
    ...tokens(profile.title),
    ...tokens(profile.description),
    ...tokens(profile.type),
    ...tokens(profile.category),
    ...tokens(profile.tags),
    ...tokens(profile.location),
    ...tokens(profile.affiliation),
  ].filter(Boolean));
  const evToks = tokens(eventLabel(event));
  if (!pToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (pToks.has(t)) hits++;
  return hits / Math.max(pToks.size, evToks.length);
}

function correlate(profiles, events) {
  return profiles.map(profile => {
    const scored = events
      .map(ev => ({ ev, score: matchScore(profile, ev) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...profile, _matches: scored, _activated: scored.length > 0 };
  });
}

const TYPE_COLORS = { SEISMIC: '#f97316', CRYPTO: '#a78bfa', FX: '#22d3ee' };
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function IntelProfileLiveIntelExposure() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
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
      const [ipR, liR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
      ]);
      const p = normaliseArray(ipR.status === 'fulfilled' ? ipR.value : []);
      const e = normaliseLiveIntel(liR.status === 'fulfilled' ? liR.value : []);
      setProfiles(p);
      setEvents(e);
      setEnriched(correlate(p, e));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:iplive-toggle', h);
    return () => window.removeEventListener('jarvis:iplive-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const activated = enriched.filter(p => p._activated);
    const dormant = enriched.filter(p => !p._activated);
    const prompt =
      `Intel Profile × Live World Events: ${profiles.length} profiles, ${events.length} live events. ` +
      `${activated.length} profiles are ACTIVATED; ${dormant.length} are DORMANT. ` +
      `Top activated: ${activated.slice(0, 5).map(p => p.name || p.title || p.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence intelligence profile exposure brief.`;
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

  const activatedCount = enriched.filter(p => p._activated).length;
  const dormantCount = enriched.filter(p => !p._activated).length;
  const badge = activatedCount > 0 ? '#f59e0b' : '#64748b';

  const visible = enriched.filter(profile => {
    const label = (profile.name || profile.title || profile.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'ACTIVATED') return profile._activated;
    if (tab === 'DORMANT') return !profile._activated;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Intel Profile × Live Intel Exposure"
        style={{
          position: 'fixed',
          left: 57320,
          bottom: 8,
          zIndex: 111,
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
          boxShadow: activatedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        IPLIVE
        {activatedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {activatedCount}
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
          zIndex: 9603,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ INTEL PROFILE × LIVE WORLD EVENTS</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'PROFILES', val: profiles.length, color: '#60a5fa' },
              { label: 'LIVE EVENTS', val: events.length, color: '#94a3b8' },
              { label: 'ACTIVATED', val: activatedCount, color: '#f59e0b' },
              { label: 'DORMANT', val: dormantCount, color: dormantCount > 0 ? '#64748b' : '#22c55e' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'ACTIVATED', 'DORMANT'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
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
              placeholder="Search profiles…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No profiles match the current filter.</div>
          )}

          <div>
            {visible.map((profile, i) => {
              const id = profile.id || profile.profile_id || i;
              const label = profile.name || profile.title || `Profile ${id}`;
              const type = profile.type || profile.category || '';
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
                      background: profile._activated ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                      color: profile._activated ? '#f59e0b' : '#64748b',
                      border: `1px solid ${profile._activated ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.25)'}`,
                    }}>
                      {profile._activated ? 'ACTIVATED' : 'DORMANT'}
                    </span>
                    {type && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        {type}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {profile._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched live world events:</div>
                          {profile._matches.map(({ ev, score }, j) => {
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
                        <div style={{ color: '#64748b', fontSize: 11 }}>No live world event matched — profile is dormant to current world state.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} profiles · {events.length} live events indexed · auto-refresh 60s
          </div>
        </div>
      )}
    </>
  );
}
