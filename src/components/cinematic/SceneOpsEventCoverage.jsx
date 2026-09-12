/**
 * F81 — Scene × Ops Event Coverage (SCOPS)
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} anchor sets +
 * /v1/ops/events, then keyword-correlates each scene's anchor texts
 * against active ops events to surface:
 *   ACTIVE — ops event domain coverage detected (scene operationally live)
 *   QUIET  — no ops event matches this scene domain (operational blind spot)
 *
 * Stat tiles: scenes / ops events / active / quiet
 * Filter tabs: ALL | ACTIVE | QUIET + text search
 * Expand any scene → matched ops events with severity badge + type badge + relevance score bar.
 * Cyan badge on ACTIVE count.
 * ▶ ASSESS: 2-sentence scene-ops coverage brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ SCOPS  at bottom:8 left:691360, zIndex:263.
 * Event:   jarvis:scops-toggle
 * Voice:   "scene ops / ops scene / scops / active ops scene / live ops scene /
 *           scene operational / ops event scene / which scenes have ops events /
 *           operationally live scenes"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API      = '';
const POLL_MS  = 90_000;
const CY       = '#22d3ee';
const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCOPS_RE =
  /\b(scene[._-]?ops?|ops?[._-]?scene|scops|active[._-]?ops?[._-]?scene|live[._-]?ops?[._-]?scene|scene[._-]?operational|ops?[._-]?event[._-]?scene|which[._-]?scenes?[._-]?have[._-]?ops?|operationally[._-]?live[._-]?scenes?)\b/i;

export function isScopsQuery(t) {
  return SCOPS_RE.test(t || '');
}

export async function buildScopsScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [scenesRes, opsRes] = await Promise.allSettled([
      Promise.all(SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )),
      fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    ]);
    const rawScenes = scenesRes.status === 'fulfilled' ? scenesRes.value.filter(Boolean) : [];
    const opsEvents = normaliseOps(opsRes.status === 'fulfilled' ? opsRes.value : []);
    const scenes    = rawScenes.map(normaliseScene).filter(Boolean);
    const enriched  = correlate(scenes, opsEvents);
    const active    = enriched.filter(s => s._active).length;
    const quiet     = enriched.length - active;
    const topActive = enriched
      .filter(s => s._active)
      .slice(0, 4)
      .map(s => s.title)
      .join(', ') || 'none';
    return (
      `Scene × Ops Event Coverage: ${scenes.length} cinematic scenes cross-matched against ` +
      `${opsEvents.length} ops events. ${active} scenes are ACTIVE (live ops event alignment found); ` +
      `${quiet} scenes are QUIET (no active ops event coverage). ` +
      `Operationally active scenes: ${topActive}.`
    );
  } catch {
    return 'Scene × Ops Event Coverage assessment unavailable at this time, sir.';
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScene(raw) {
  if (!raw) return null;
  const anchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
  const anchorText = anchors
    .map(a => [a.label, a.value, a.title, a.name, a.description].filter(Boolean).join(' '))
    .join(' ');
  return {
    id:         raw.id       || raw.scene_id  || String(raw.index || '?'),
    title:      raw.title    || raw.name      || raw.label || `Scene ${raw.id || '?'}`,
    category:   raw.category || raw.type      || raw.domain || '',
    anchorText,
  };
}

function normaliseOps(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.events)          ? raw.events
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.data)            ? raw.data
    : [];
  return arr.map((e, i) => ({
    id:          e.id       || e.event_id  || String(i),
    name:        e.name     || e.title     || e.event_name || e.type || `Event ${i + 1}`,
    type:        e.type     || e.event_type || e.kind      || '',
    severity:    e.severity || e.level     || e.priority   || '',
    description: (e.description || e.summary || e.details || '').toString().slice(0, 300),
    category:    e.category || e.domain    || '',
    tags:        Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function matchScore(scene, opsEvent) {
  const sToks = new Set([
    ...tokens(scene.title),
    ...tokens(scene.category),
    ...tokens(scene.anchorText),
  ]);
  const eToks = [
    ...tokens(opsEvent.name),
    ...tokens(opsEvent.type),
    ...tokens(opsEvent.description),
    ...tokens(opsEvent.category),
    ...tokens(opsEvent.tags),
  ];
  if (!sToks.size || !eToks.length) return 0;
  let hits = 0;
  for (const t of eToks) if (sToks.has(t)) hits++;
  return hits / Math.max(sToks.size, eToks.length);
}

function correlate(scenes, opsEvents) {
  return scenes.map(sc => {
    const scored = opsEvents
      .map(e => ({ ...e, _score: matchScore(sc, e) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
    return { ...sc, _matches: scored, _active: scored.length > 0 };
  });
}

function severityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s.includes('crit') || s.includes('high') || s === 'red')   return '#f87171';
  if (s.includes('warn') || s.includes('med')  || s === 'amber') return '#facc15';
  if (s.includes('info') || s.includes('low')  || s === 'green') return '#4ade80';
  return '#64748b';
}

// ── styles ────────────────────────────────────────────────────────────────────
const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const TABS = ['ALL', 'ACTIVE', 'QUIET'];

// ── component ─────────────────────────────────────────────────────────────────
export default function SceneOpsEventCoverage() {
  const [open,       setOpen]       = useState(false);
  const [opsEvents,  setOpsEvents]  = useState([]);
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
      const [scenesRes, opsRes] = await Promise.allSettled([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )),
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawScenes = scenesRes.status === 'fulfilled' ? scenesRes.value.filter(Boolean) : [];
      const rawOps    = normaliseOps(opsRes.status === 'fulfilled' ? opsRes.value : []);
      const scenes    = rawScenes.map(normaliseScene).filter(Boolean);
      setOpsEvents(rawOps);
      setEnriched(correlate(scenes, rawOps));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:scops-toggle', h);
    return () => window.removeEventListener('jarvis:scops-toggle', h);
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
    const activeCount = enriched.filter(s => s._active).length;
    const quietCount  = enriched.filter(s => !s._active).length;
    const prompt =
      `Scene × Ops Event Coverage: ${enriched.length} cinematic scenes cross-matched against ` +
      `${opsEvents.length} active ops events. ${activeCount} scenes are ACTIVE (live ops event ` +
      `domain alignment detected); ${quietCount} are QUIET (no active ops coverage — operational blind spot). ` +
      `Active scenes: ${enriched.filter(s => s._active).slice(0, 5).map(s => s.title).join(', ') || 'none'}. ` +
      `Provide a 2-sentence scene-ops coverage assessment: which scene domains are operationally active ` +
      `and what the quiet scenes imply for operational situational awareness.`;
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

  const activeCount = enriched.filter(s => s._active).length;
  const badgeColor  = activeCount > 0 ? CY : '#22c55e';

  const visible = enriched.filter(sc => {
    if (search && !sc.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'ACTIVE') return sc._active;
    if (tab === 'QUIET')  return !sc._active;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Ops Event Coverage"
        style={{
          position: 'fixed',
          left: 691360,
          bottom: 8,
          zIndex: 263,
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
          boxShadow: activeCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        SCOPS
        {activeCount > 0 && (
          <span style={{ background: badgeColor, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {activeCount}
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
          width: 'min(720px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: `1px solid ${CY}44`,
          borderRadius: 14,
          boxShadow: `0 0 60px ${CY}1a`,
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ SCENE × OPS EVENT COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${enriched.length} scenes · ${opsEvents.length} ops events`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES',     val: enriched.length,                         color: '#94a3b8' },
              { label: 'OPS EVENTS', val: opsEvents.length,                         color: '#f87171' },
              { label: 'ACTIVE',     val: activeCount,                              color: CY },
              { label: 'QUIET',      val: enriched.filter(s => !s._active).length,  color: '#64748b' },
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
            {visible.map(sc => {
              const isExp = expanded === sc.id;
              const stClr = sc._active ? CY : '#475569';
              return (
                <div key={sc.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : sc.id)}
                    style={{ ...ROW, background: isExp ? `${CY}0d` : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? `${CY}0d` : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {sc._active ? 'ACTIVE' : 'QUIET'}
                      </span>
                      {sc.category && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{sc.category}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.title}</span>
                      {sc._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                          {sc._matches.length} event{sc._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched ops events */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {sc._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>
                          No active ops events cover this scene's domain — operational blind spot.
                        </div>
                      ) : (
                        sc._matches.map(ev => {
                          const sevClr = severityColor(ev.severity);
                          return (
                            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              {ev.severity && (
                                <span style={{ ...PILL, background: sevClr + '22', color: sevClr, flexShrink: 0 }}>{ev.severity}</span>
                              )}
                              {ev.type && (
                                <span style={{ ...PILL, background: 'rgba(34,211,238,0.15)', color: CY, flexShrink: 0 }}>{ev.type}</span>
                              )}
                              <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</span>
                              <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, ev._score * 300)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(ev._score * 100).toFixed(0)}%</span>
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

          {/* assess */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={assess}
              disabled={assessing || enriched.length === 0}
              style={{
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${CY}44`,
                background: assessing ? `${CY}26` : `${CY}14`,
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
