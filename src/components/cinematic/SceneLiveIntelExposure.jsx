/**
 * F77 — Scene × Live Intel Exposure (SLIVE)
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} anchor sets +
 * /functions/getLiveIntel (quakes/crypto/FX), then keyword-correlates
 * each scene's anchor text against live world events to surface:
 *   LIVE  — at least one live world event aligns with this scene's domain
 *   QUIET — no live signal detected in this scene's operational space
 *
 * Stat tiles: scenes / live events / live / quiet
 * Filter tabs: ALL | LIVE | QUIET + text search
 * Expand any scene → matched live events with SEISMIC/CRYPTO/FX badge + relevance score.
 * Cyan badge on LIVE count.
 * ▶ ASSESS: 2-sentence scene-world exposure brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ SLIVE  at bottom:8 left:689120, zIndex:259.
 * Event:   jarvis:slive-toggle
 * Voice:   "scene live / live scene / slive / scene intel live /
 *           live scene exposure / scene world event / scene live intel /
 *           which scenes are live / active scenes"
 * Refresh: 60 s auto-poll (10 parallel scene fetches + live intel).
 */
import { useState, useEffect, useCallback } from 'react';

const API     = '';
const POLL_MS = 60_000;
const CY      = '#22d3ee';

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SLIVE_RE =
  /\b(scene[._-]?live|live[._-]?scene|slive|scene[._-]?intel[._-]?live|live[._-]?scene[._-]?exposure|scene[._-]?world[._-]?event|scene[._-]?live[._-]?intel|which[._-]?scenes?[._-]?are[._-]?(live|active|world)|active[._-]?scenes?[._-]?(live|world)?)\b/i;

export function isSliveQuery(t) {
  return SLIVE_RE.test(t || '');
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScene(raw) {
  if (!raw) return null;
  const anchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
  const anchorText = anchors
    .map(a => [a.label, a.value, a.title, a.name, a.description].filter(Boolean).join(' '))
    .join(' ');
  return {
    id:         raw.id    || raw.scene_id  || String(raw.index || '?'),
    title:      raw.title || raw.name      || raw.label || `Scene ${raw.id || '?'}`,
    category:   raw.category || raw.type   || raw.domain || '',
    anchorText,
  };
}

function normaliseIntel(raw) {
  if (!raw) return [];
  const out = [];
  if (raw.earthquakes) {
    for (const e of (Array.isArray(raw.earthquakes) ? raw.earthquakes : [])) {
      const place = e.place || e.location || '';
      const mag   = e.magnitude || e.mag || '';
      out.push({
        type: 'SEISMIC',
        label: `M${mag} ${place}`.trim(),
        tokens: tok(`${place} earthquake seismic quake tectonic geological`),
      });
    }
  }
  if (raw.crypto) {
    for (const c of (Array.isArray(raw.crypto) ? raw.crypto : [])) {
      const sym = c.symbol || c.name || '';
      out.push({
        type: 'CRYPTO',
        label: sym,
        tokens: tok(`${sym} crypto bitcoin blockchain digital currency asset finance market`),
      });
    }
  }
  if (raw.fx) {
    for (const f of (Array.isArray(raw.fx) ? raw.fx : [])) {
      const pair = f.pair || f.symbol || f.name || '';
      out.push({
        type: 'FX',
        label: pair,
        tokens: tok(`${pair} forex currency exchange rate finance market trade`),
      });
    }
  }
  return out;
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scene, events) {
  const sceneToks = new Set(tok(`${scene.title} ${scene.category} ${scene.anchorText}`).filter(Boolean));
  if (!sceneToks.size) return [];
  const matched = [];
  for (const ev of events) {
    let hits = 0;
    for (const t of ev.tokens) if (sceneToks.has(t)) hits++;
    if (hits > 0) matched.push({ ...ev, _score: hits / Math.max(sceneToks.size, ev.tokens.length) });
  }
  return matched.sort((a, b) => b._score - a._score).slice(0, 5);
}

function correlate(scenes, events) {
  return scenes.map(scene => {
    const matches = matchScore(scene, events);
    return { ...scene, _matches: matches, _live: matches.length > 0 };
  });
}

function typeColor(t) {
  if (t === 'SEISMIC') return '#f87171';
  if (t === 'CRYPTO')  return '#a78bfa';
  if (t === 'FX')      return '#34d399';
  return '#64748b';
}

export async function buildSliveScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [scenesRes, intelRes] = await Promise.allSettled([
      Promise.all(SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      )),
      fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
    ]);
    const rawScenes = scenesRes.status === 'fulfilled' ? scenesRes.value.filter(Boolean) : [];
    const scenes    = rawScenes.map(normaliseScene).filter(Boolean);
    const events    = normaliseIntel(intelRes.status === 'fulfilled' ? intelRes.value : {});
    const enriched  = correlate(scenes, events);
    const live  = enriched.filter(s => s._live).length;
    const quiet = enriched.length - live;
    const topLive = enriched
      .filter(s => s._live)
      .slice(0, 4)
      .map(s => s.title || s.id)
      .join(', ') || 'none';
    return (
      `Scene × Live Intel Exposure: ${scenes.length} cinematic scenes cross-matched against ` +
      `${events.length} live world events. ${live} scenes are LIVE (world event alignment detected — ` +
      `operational significance heightened); ${quiet} scenes are QUIET (no live signal). ` +
      `Live-activated scenes: ${topLive}.`
    );
  } catch {
    return 'Scene × Live Intel Exposure assessment unavailable at this time, sir.';
  }
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const TABS = ['ALL', 'LIVE', 'QUIET'];

// ── component ─────────────────────────────────────────────────────────────────
export default function SceneLiveIntelExposure() {
  const [open,       setOpen]       = useState(false);
  const [scenes,     setScenes]     = useState([]);
  const [events,     setEvents]     = useState([]);
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
      const [scenesRes, intelRes] = await Promise.allSettled([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        )),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawScenes  = scenesRes.status === 'fulfilled' ? scenesRes.value.filter(Boolean) : [];
      const normScenes = rawScenes.map(normaliseScene).filter(Boolean);
      const normEvents = normaliseIntel(intelRes.status === 'fulfilled' ? intelRes.value : {});
      setScenes(normScenes);
      setEvents(normEvents);
      setEnriched(correlate(normScenes, normEvents));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:slive-toggle', h);
    return () => window.removeEventListener('jarvis:slive-toggle', h);
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
    const live  = enriched.filter(s => s._live).length;
    const quiet = enriched.filter(s => !s._live).length;
    const prompt =
      `Scene × Live Intel Exposure: ${scenes.length} cinematic scenes cross-matched against ` +
      `${events.length} live world events. ${live} scenes are LIVE (real-time world event alignment detected); ` +
      `${quiet} scenes are QUIET (no current live signal). ` +
      `Live-activated scenes: ${enriched.filter(s => s._live).slice(0, 5).map(s => s.title || s.id).join(', ') || 'none'}. ` +
      `Provide a 2-sentence scene-world exposure assessment: which operational domains are most activated ` +
      `by current live world events, and what heightened JARVIS attention is advisable.`;
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

  const liveCount  = enriched.filter(s => s._live).length;
  const badgeColor = liveCount > 0 ? CY : '#22c55e';

  const visible = enriched.filter(scene => {
    if (search && !(scene.title || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'LIVE')  return scene._live;
    if (tab === 'QUIET') return !scene._live;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Live Intel Exposure"
        style={{
          position: 'fixed',
          left: 689120,
          bottom: 8,
          zIndex: 259,
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
          boxShadow: liveCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        SLIVE
        {liveCount > 0 && (
          <span style={{ background: badgeColor, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {liveCount}
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
          zIndex: 9104,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(34,211,238,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(34,211,238,0.10)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ SCENE × LIVE INTEL EXPOSURE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${enriched.length} scenes · ${events.length} live events`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES',      val: enriched.length,                       color: '#94a3b8' },
              { label: 'LIVE EVENTS', val: events.length,                         color: '#94a3b8' },
              { label: 'LIVE',        val: liveCount,                             color: CY },
              { label: 'QUIET',       val: enriched.filter(s => !s._live).length, color: '#22c55e' },
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
                background: tab === t ? CY : 'rgba(255,255,255,0.06)',
                color: tab === t ? '#000' : '#94a3b8',
                border: 'none',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
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
            {visible.map(scene => {
              const isExp  = expanded === scene.id;
              const stClr  = scene._live ? CY : '#22c55e';
              return (
                <div key={scene.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : scene.id)}
                    style={{ ...ROW, background: isExp ? 'rgba(34,211,238,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(34,211,238,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {scene._live ? 'LIVE' : 'QUIET'}
                      </span>
                      {scene.category && (
                        <span style={{ ...PILL, background: 'rgba(34,211,238,0.12)', color: CY }}>{scene.category}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {scene.title || scene.id}
                      </span>
                      {scene._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {scene._matches.length} event{scene._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched live events */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {scene._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>
                          No live world events align with this scene — operational domain is quiet.
                        </div>
                      ) : (
                        scene._matches.map((ev, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ ...PILL, background: typeColor(ev.type) + '22', color: typeColor(ev.type), flexShrink: 0 }}>{ev.type}</span>
                            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, ev._score * 300)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(ev._score * 100).toFixed(0)}%</span>
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

          {/* assess + assessment */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${CY}44`,
                background: assessing ? 'rgba(34,211,238,0.15)' : 'rgba(34,211,238,0.08)',
                color: CY, cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: 1,
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
