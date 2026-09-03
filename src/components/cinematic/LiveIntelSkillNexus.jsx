import { useState, useEffect, useCallback } from 'react';

const API = '';
const LISN_RE = /\b(live[._-]?intel[._-]?skill|skill[._-]?nexus|lisn|unresourced[._-]?events?|skill[._-]?for[._-]?live|live[._-]?skill|world[._-]?event[._-]?skill|aip[._-]?nexus|live[._-]?aip|intel[._-]?skill[._-]?gap|world[._-]?skill[._-]?gap)\b/i;

export function isLisnQuery(t) {
  return LISN_RE.test(t || '');
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'events', 'skills', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(ev, sk) {
  const evToks = new Set([
    ...tokens(ev.type),
    ...tokens(ev.title),
    ...tokens(ev.description),
    ...tokens(ev.category),
    ...tokens(ev.region),
    ...tokens(ev.sector),
  ].filter(Boolean));
  const skToks = [
    ...tokens(sk.name),
    ...tokens(sk.description),
    ...tokens(sk.category),
    ...tokens(Array.isArray(sk.tags) ? sk.tags.join(' ') : sk.tags),
  ].filter(Boolean);
  if (!evToks.size || !skToks.length) return 0;
  let hits = 0;
  for (const t of skToks) if (evToks.has(t)) hits++;
  return hits / Math.max(evToks.size, skToks.length);
}

function extractEvents(intel) {
  const evs = [];
  const quakes = normaliseArray(intel?.earthquakes || intel?.seismic);
  quakes.forEach(q => evs.push({ ...q, _type: 'SEISMIC', type: q.type || 'earthquake', title: q.location || q.place || q.title || 'Seismic Event' }));
  const crypto = normaliseArray(intel?.crypto || intel?.cryptocurrency);
  crypto.forEach(c => evs.push({ ...c, _type: 'CRYPTO', type: 'crypto', title: c.symbol || c.name || c.id || 'Crypto' }));
  const fx = normaliseArray(intel?.fx || intel?.forex || intel?.currency);
  fx.forEach(f => evs.push({ ...f, _type: 'FX', type: 'fx', title: (f.from && f.to) ? `${f.from}/${f.to}` : f.pair || f.symbol || 'FX Pair' }));
  return evs;
}

function correlate(events, skills) {
  return events.map(ev => {
    const scored = skills
      .map(sk => ({ sk, score: matchScore(ev, sk) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...ev, _matches: scored, _active: scored.length > 0 };
  });
}

export async function buildLisnScript() {
  const [intelR, skillR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`).then(r => r.json()),
  ]);
  const intel = intelR.status === 'fulfilled' ? intelR.value : {};
  const skills = normaliseArray(skillR.status === 'fulfilled' ? skillR.value : []);
  const events = extractEvents(intel);
  const enriched = correlate(events, skills);
  const unresourced = enriched.filter(e => !e._active);
  return `Live Intel × AIP Skill Nexus: ${events.length} live events, ${skills.length} skills. ` +
    `${enriched.filter(e => e._active).length} events have matching AIP skills; ${unresourced.length} are UNRESOURCED. ` +
    `Unresourced: ${unresourced.slice(0, 4).map(e => e.title || e.type).join(', ') || 'none'}.`;
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const TYPE_COLOR = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#22c55e' };

export default function LiveIntelSkillNexus() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [skills, setSkills] = useState([]);
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
      const [intelR, skillR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`).then(r => r.json()),
      ]);
      const intel = intelR.status === 'fulfilled' ? intelR.value : {};
      const sks = normaliseArray(skillR.status === 'fulfilled' ? skillR.value : []);
      const evs = extractEvents(intel);
      setEvents(evs);
      setSkills(sks);
      setEnriched(correlate(evs, sks));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:lisn-toggle', h);
    return () => window.removeEventListener('jarvis:lisn-toggle', h);
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
    const unresourced = enriched.filter(e => !e._active);
    const prompt = `Live Intel × AIP Skill Nexus: ${events.length} live world events, ${skills.length} AIP skills. ` +
      `${enriched.filter(e => e._active).length} events are covered by at least one skill; ${unresourced.length} are UNRESOURCED (no skill can handle them). ` +
      `Unresourced events: ${unresourced.slice(0, 5).map(e => e.title || e.type).join(', ') || 'none'}. ` +
      `Give a 2-sentence intelligence-skill coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const unresourced = enriched.filter(e => !e._active);
  const badge = unresourced.length > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(e => {
    const label = (e.title || e.type || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'ACTIVE') return e._active;
    if (tab === 'UNRESOURCED') return !e._active;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Live Intel × AIP Skill Nexus"
        style={{
          position: 'fixed', left: 5040, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: `1px solid ${badge}`,
          color: badge, borderRadius: 6, padding: '3px 9px', fontSize: 11,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          boxShadow: unresourced.length > 0 ? `0 0 8px ${badge}55` : 'none',
          fontFamily: 'monospace',
        }}
      >
        ◈ LISN
        {unresourced.length > 0 && (
          <span style={{ ...PILL, background: '#f59e0b22', color: '#f59e0b', marginLeft: 6 }}>
            {unresourced.length} unresourced
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: 60, right: 20, width: 620, maxHeight: '82vh',
          background: 'rgba(8,12,20,0.97)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 12, zIndex: 9200, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)', fontFamily: 'monospace',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ LIVE INTEL × AIP SKILL NEXUS</span>
            <span style={{ ...PILL, background: '#22c55e22', color: '#22c55e' }}>{enriched.filter(e => e._active).length} active</span>
            {unresourced.length > 0 && <span style={{ ...PILL, background: '#f59e0b22', color: '#f59e0b' }}>{unresourced.length} unresourced</span>}
            {loading && <span style={{ color: '#888', fontSize: 11 }}>loading…</span>}
            <span style={{ flex: 1 }} />
            <button onClick={assess} disabled={assessing} style={{ fontSize: 11, color: '#f59e0b', background: 'transparent', border: '1px solid #f59e0b55', borderRadius: 5, padding: '2px 9px', cursor: 'pointer' }}>
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            <button onClick={() => setOpen(false)} style={{ color: '#888', background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', marginLeft: 6 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { label: 'Live Events', val: events.length, color: '#60a5fa' },
              { label: 'AIP Skills', val: skills.length, color: '#a78bfa' },
              { label: 'Active', val: enriched.filter(e => e._active).length, color: '#22c55e' },
              { label: 'Unresourced', val: unresourced.length, color: unresourced.length > 0 ? '#f59e0b' : '#555' },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ color: t.color, fontWeight: 700, fontSize: 18 }}>{t.val}</div>
                <div style={{ color: '#888', fontSize: 10, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
            {['ALL', 'ACTIVE', 'UNRESOURCED'].map(t => (
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

          {assessment && (
            <div style={{ padding: '8px 14px', background: 'rgba(245,158,11,0.07)', borderBottom: '1px solid rgba(245,158,11,0.15)', color: '#fcd34d', fontSize: 12 }}>
              {assessment}
            </div>
          )}

          {err && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 12 }}>{err}</div>}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: '#555', padding: 20, textAlign: 'center', fontSize: 12 }}>No events</div>
            )}
            {visible.map((ev, i) => {
              const key = ev.id || ev._id || i;
              const label = ev.title || ev.type || `event-${i}`;
              const isEx = expanded === key;
              const typeColor = TYPE_COLOR[ev._type] || '#94a3b8';
              return (
                <div key={key}>
                  <div
                    onClick={() => setExpanded(isEx ? null : key)}
                    style={{ ...ROW, background: isEx ? 'rgba(245,158,11,0.06)' : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isEx ? 'rgba(245,158,11,0.06)' : 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: ev._active ? '#22c55e22' : '#f59e0b22', color: ev._active ? '#22c55e' : '#f59e0b' }}>
                        {ev._active ? 'ACTIVE' : 'UNRESOURCED'}
                      </span>
                      {ev._type && <span style={{ ...PILL, background: `${typeColor}22`, color: typeColor }}>{ev._type}</span>}
                      <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1 }}>{label}</span>
                      <span style={{ color: '#555', fontSize: 11 }}>{isEx ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {isEx && (
                    <div style={{ padding: '8px 18px 12px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {ev.description && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{ev.description}</div>}
                      {ev._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#888', fontSize: 11, marginBottom: 6 }}>Matching AIP skills:</div>
                          {ev._matches.map(({ sk, score }, j) => (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <span style={{ color: '#a78bfa', fontSize: 11, flex: 1 }}>{sk.name || sk.id}</span>
                                {sk.category && <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }}>{sk.category}</span>}
                                <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No AIP skill covers this live event type.</div>
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
