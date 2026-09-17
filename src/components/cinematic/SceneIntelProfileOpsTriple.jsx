import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCINOPS_RE = /\b(scinops|scene\s+intel\s+ops|intel\s+ops\s+scene|scene\s+intel\s+profile\s+ops|scene\s+ops\s+intel|intel\s+profile\s+ops\s+scene|scene\s+ops\s+event\s+intel|scene\s+intel\s+ops\s+event|scene\s+operational\s+intel|cinematic\s+intel\s+ops|scene\s+threat\s+ops|scene\s+intel\s+threat\s+ops)\b/i;

const THRESHOLD = 0.07;
const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseScene(data, id) {
  if (!data) return null;
  const anchors = Array.isArray(data.anchors) ? data.anchors : [];
  const anchorText = anchors.map(a =>
    [a.label, a.value, a.text, a.title, a.description, a.content].filter(Boolean).join(' ')
  ).join(' ');
  return {
    id: data.id || id,
    name: data.name || data.title || `Scene ${id}`,
    description: data.description || data.summary || '',
    anchors,
    anchorText,
    tags: Array.isArray(data.tags) ? data.tags.join(' ') : String(data.tags || ''),
    raw: data,
  };
}

function normaliseIntelProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.intel_profiles) ? data.intel_profiles
    : Array.isArray(data.profiles) ? data.profiles
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(p => ({
    id: p.id || p._id || String(Math.random()),
    name: p.name || p.subject || p.title || 'Unnamed Profile',
    category: p.category || p.type || p.kind || '',
    nationality: p.nationality || p.country || '',
    description: p.description || p.summary || p.bio || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : String(p.aliases || ''),
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    raw: p,
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.ops_events) ? data.ops_events
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(e => ({
    id: e.id || e._id || String(Math.random()),
    name: e.name || e.title || e.label || 'Unnamed Event',
    type: e.type || e.kind || e.category || '',
    severity: e.severity || e.level || e.priority || '',
    description: e.description || e.summary || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    raw: e,
  }));
}

function correlate(scenes, intelProfiles, opsEvents) {
  return scenes.filter(Boolean).map(scene => {
    const toks = tok([scene.name, scene.description, scene.anchorText, scene.tags].join(' '));

    const matchedProfiles = intelProfiles
      .map(p => {
        const score = Math.max(
          matchScore(toks, p.name),
          matchScore(toks, p.category),
          matchScore(toks, p.nationality),
          matchScore(toks, p.description),
          matchScore(toks, p.aliases),
          matchScore(toks, p.tags),
        );
        return { ...p, score };
      })
      .filter(p => p.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedOpsEvents = opsEvents
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.name),
          matchScore(toks, e.type),
          matchScore(toks, e.severity),
          matchScore(toks, e.description),
          matchScore(toks, e.tags),
        );
        return { ...e, score };
      })
      .filter(e => e.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasProfile = matchedProfiles.length > 0;
    const hasOps = matchedOpsEvents.length > 0;

    let state;
    if (hasProfile && hasOps) state = 'FULLY ACTIVATED';
    else if (hasProfile) state = 'INTEL-PRIMED';
    else if (hasOps) state = 'OPS-TRIGGERED';
    else state = 'QUIET';

    return { scene, matchedProfiles, matchedOpsEvents, state };
  });
}

export function isScinopsQuery(t) {
  return SCINOPS_RE.test(t || '');
}

export async function buildScinopsScript() {
  try {
    const sceneResults = await Promise.allSettled(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const scenes = sceneResults.map((r, i) =>
      normaliseScene(r.status === 'fulfilled' ? r.value : null, SCENE_IDS[i])
    );

    const [ipRes, opsRes] = await Promise.allSettled([
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : null),
    ]);

    const intelProfiles = normaliseIntelProfiles(ipRes.status === 'fulfilled' ? ipRes.value : null);
    const opsEvents = normaliseOpsEvents(opsRes.status === 'fulfilled' ? opsRes.value : null);
    const rows = correlate(scenes, intelProfiles, opsEvents);

    const fullyActivated = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
    const intelPrimed = rows.filter(r => r.state === 'INTEL-PRIMED').length;
    const opsTrig = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
    const quiet = rows.filter(r => r.state === 'QUIET').length;

    return `SCINOPS Scene×IntelProfile×OpsEvent: ${rows.length} cinematic scenes analysed against ${intelProfiles.length} intel profiles and ${opsEvents.length} ops events. ` +
      `${fullyActivated} FULLY ACTIVATED (profile+ops), ` +
      `${intelPrimed} INTEL-PRIMED (profile only), ${opsTrig} OPS-TRIGGERED (event only), ${quiet} QUIET (no coverage). ` +
      (fullyActivated > 0 ? `Highest activation: ${rows.find(r => r.state === 'FULLY ACTIVATED')?.scene.name || 'see panel'}.` :
        quiet > 0 ? `${quiet} scenes have no intel profile or ops event coverage — operational blind spots.` :
        'Scene intel and ops coverage nominal.');
  } catch {
    return 'SCINOPS: data fetch failed.';
  }
}

const STATE_COLOUR = {
  'FULLY ACTIVATED': '#f44336',
  'INTEL-PRIMED': '#ffab40',
  'OPS-TRIGGERED': '#ff7043',
  'QUIET': '#455a64',
};

const SEVERITY_COLOUR = {
  CRITICAL: '#f44336',
  HIGH: '#ff7043',
  MEDIUM: '#ffab40',
  LOW: '#69f0ae',
  INFO: '#4fc3f7',
};

export default function SceneIntelProfileOpsTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:scinops-toggle', handler);
    return () => window.removeEventListener('jarvis:scinops-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const sceneResults = await Promise.allSettled(
        SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
        )
      );
      const scenes = sceneResults.map((r, i) =>
        normaliseScene(r.status === 'fulfilled' ? r.value : null, SCENE_IDS[i])
      );

      const [ipRes, opsRes] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const intelProfiles = normaliseIntelProfiles(ipRes.status === 'fulfilled' ? ipRes.value : null);
      const opsEvents = normaliseOpsEvents(opsRes.status === 'fulfilled' ? opsRes.value : null);

      if (!scenes.some(Boolean) && !intelProfiles.length && !opsEvents.length) {
        setErr('No data returned from Scene, IntelProfile, or Ops Events endpoints.');
      }

      setRows(correlate(scenes, intelProfiles, opsEvents));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyActivated = rows.filter(r => r.state === 'FULLY ACTIVATED').length;
  const intelPrimed = rows.filter(r => r.state === 'INTEL-PRIMED').length;
  const opsTrig = rows.filter(r => r.state === 'OPS-TRIGGERED').length;
  const quiet = rows.filter(r => r.state === 'QUIET').length;

  const TABS = ['ALL', 'FULLY ACTIVATED', 'INTEL-PRIMED', 'OPS-TRIGGERED', 'QUIET'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.scene.name.toLowerCase().includes(q) ||
        r.matchedProfiles.some(p => p.name.toLowerCase().includes(q)) ||
        r.matchedOpsEvents.some(e => e.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const cbw = total > 0 ? {
    activated: (fullyActivated / total) * 100,
    intel: (intelPrimed / total) * 100,
    ops: (opsTrig / total) * 100,
    quiet: (quiet / total) * 100,
  } : { activated: 0, intel: 0, ops: 0, quiet: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Cinematic scene "${row.scene.name}" [${row.state}]: ` +
      `matched intel profiles: ${row.matchedProfiles.map(p => p.name).join(', ') || 'none'}. ` +
      `matched ops events: ${row.matchedOpsEvents.map(e => e.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence scene intel profile and ops event coverage brief.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 816240,
          bottom: 8,
          zIndex: 486,
          background: 'rgba(0,8,20,0.85)',
          border: `1px solid ${fullyActivated > 0 ? '#f44336' : '#1a3050'}`,
          color: fullyActivated > 0 ? '#f44336' : '#2a6090',
          padding: '3px 7px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 10,
          letterSpacing: 1,
          fontFamily: 'monospace',
        }}
      >
        ◈ SCINOPS{fullyActivated > 0 ? ` [${fullyActivated}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      left: 20,
      top: 60,
      width: 640,
      maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(0,8,20,0.97)',
      border: '1px solid #1a3050',
      borderRadius: 8,
      zIndex: 9900,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1a3050',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ color: '#f44336', fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ SCINOPS</span>
        <span style={{ color: '#4a6fa0', fontSize: 10, flex: 1 }}>Scene × Intel Profile × Ops Event Triple Coverage</span>
        {loading && <span style={{ color: '#00e5ff', fontSize: 9 }}>LOADING…</span>}
        {lastRefresh && !loading && (
          <span style={{ color: '#2a4060', fontSize: 9 }}>
            {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={load}
          disabled={loading}
          style={{ background: 'none', border: '1px solid #1a3050', color: '#2a6090', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 9 }}
        >↺</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#2a4060', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
        >✕</button>
      </div>

      {err && (
        <div style={{ padding: '6px 14px', background: '#f4433612', color: '#f44336', fontSize: 10 }}>{err}</div>
      )}

      {/* Stat tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 1,
        padding: '8px 14px',
        borderBottom: '1px solid #1a3050',
        flexShrink: 0,
      }}>
        {[
          { label: 'SCENES', val: rows.length, col: '#4fc3f7' },
          { label: 'PROFILES', val: rows.reduce((acc, r) => acc + r.matchedProfiles.length, 0), col: '#ffab40' },
          { label: 'OPS', val: rows.reduce((acc, r) => acc + r.matchedOpsEvents.length, 0), col: '#ff7043' },
          { label: 'ACTIVATED', val: fullyActivated, col: '#f44336' },
          { label: 'INTEL-PRIMED', val: intelPrimed, col: '#ffab40' },
          { label: 'OPS-TRIG', val: opsTrig, col: '#ff7043' },
          { label: 'QUIET', val: quiet, col: '#455a64' },
        ].map(t => (
          <div key={t.label} style={{ textAlign: 'center' }}>
            <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#2a4060', fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ height: 4, display: 'flex', flexShrink: 0, margin: '0 14px 8px' }}>
        <div style={{ width: `${cbw.activated}%`, background: '#f44336', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.intel}%`, background: '#ffab40', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.ops}%`, background: '#ff7043', transition: 'width 0.4s' }} />
        <div style={{ width: `${cbw.quiet}%`, background: '#455a6480', transition: 'width 0.4s' }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: '0 14px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              background: filter === tab ? `${STATE_COLOUR[tab] || '#00e5ff'}22` : 'none',
              border: `1px solid ${filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#1a3050'}`,
              color: filter === tab ? (STATE_COLOUR[tab] || '#00e5ff') : '#2a6090',
              padding: '2px 7px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 9,
              letterSpacing: 0.5,
            }}
          >{tab}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,20,40,0.6)',
            border: '1px solid #1a3050',
            color: '#c8e6ff',
            padding: '2px 7px',
            borderRadius: 3,
            fontSize: 10,
            outline: 'none',
            width: 110,
          }}
        />
      </div>

      {/* Row list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#2a4060', fontSize: 11, padding: '20px 14px', textAlign: 'center' }}>
            No scenes match current filter.
          </div>
        )}
        {visible.map(row => (
          <div
            key={row.scene.id}
            style={{
              borderBottom: '1px solid #0d1e30',
              background: expanded === row.scene.id ? 'rgba(0,20,40,0.4)' : 'transparent',
            }}
          >
            <div
              onClick={() => setExpanded(expanded === row.scene.id ? null : row.scene.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                cursor: 'pointer',
              }}
            >
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: STATE_COLOUR[row.state],
                background: `${STATE_COLOUR[row.state]}22`,
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 1,
                minWidth: 120,
                textAlign: 'center',
              }}>{row.state}</span>
              <span style={{ color: '#c8e6ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.scene.name}
              </span>
              <span style={{ color: '#ffab40', fontSize: 9 }}>{row.matchedProfiles.length}P</span>
              <span style={{ color: '#ff7043', fontSize: 9 }}>{row.matchedOpsEvents.length}O</span>
              <button
                onClick={e => { e.stopPropagation(); assess(row); }}
                disabled={assessing}
                style={{
                  background: 'rgba(244,67,54,0.12)',
                  border: '1px solid #f4433655',
                  color: '#f44336',
                  padding: '2px 6px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >ASSESS</button>
              <span style={{ color: '#2a4060', fontSize: 10 }}>{expanded === row.scene.id ? '▲' : '▼'}</span>
            </div>

            {/* Expand: split pane */}
            {expanded === row.scene.id && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
                borderTop: `1px solid ${STATE_COLOUR[row.state]}22`,
                background: 'rgba(0,8,20,0.6)',
              }}>
                {/* Left: Intel Profiles */}
                <div style={{ padding: '8px 10px', borderRight: '1px solid #1a3050' }}>
                  <div style={{ color: '#ffab40', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    INTEL PROFILES ({row.matchedProfiles.length})
                  </div>
                  {row.matchedProfiles.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No profile match</div>
                  ) : row.matchedProfiles.slice(0, 5).map(p => (
                    <div key={p.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {p.category && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ffab4022', borderRadius: 2, padding: '0 3px' }}>
                            {p.category}
                          </span>
                        )}
                        {p.nationality && (
                          <span style={{ color: '#4a6fa0', fontSize: 9 }}>{p.nationality}</span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(p.score * 100)}%`, background: '#ffab40', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Ops Events */}
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ color: '#ff7043', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                    OPS EVENTS ({row.matchedOpsEvents.length})
                  </div>
                  {row.matchedOpsEvents.length === 0 ? (
                    <div style={{ color: '#2a4060', fontSize: 10 }}>No ops event match</div>
                  ) : row.matchedOpsEvents.slice(0, 5).map(e => (
                    <div key={e.id} style={{ marginBottom: 6 }}>
                      <div style={{ color: '#c8e6ff', fontSize: 11 }}>{e.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {e.type && (
                          <span style={{ color: '#4a6fa0', fontSize: 9, background: '#ff704322', borderRadius: 2, padding: '0 3px' }}>
                            {e.type}
                          </span>
                        )}
                        {e.severity && (
                          <span style={{
                            fontSize: 9,
                            color: SEVERITY_COLOUR[e.severity?.toUpperCase()] || '#ff7043',
                            background: `${SEVERITY_COLOUR[e.severity?.toUpperCase()] || '#ff7043'}22`,
                            borderRadius: 2,
                            padding: '0 3px',
                          }}>
                            {e.severity}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: '#111', marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(e.score * 100)}%`, background: '#ff7043', height: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scene description if available */}
                {row.scene.description && (
                  <div style={{ gridColumn: '1 / -1', padding: '6px 10px', borderTop: '1px solid #1a3050' }}>
                    <span style={{ color: '#2a4060', fontSize: 9 }}>SCENE: </span>
                    <span style={{ color: '#4a6fa0', fontSize: 10 }}>
                      {row.scene.description.slice(0, 200)}{row.scene.description.length > 200 ? '…' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
