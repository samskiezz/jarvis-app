import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const DIPSEEN_RE = /\b(dipseen|dataset\s+intel\s+(profile\s+)?scene|dataset\s+scene\s+(intel|profile)|profiled\s+dataset|uncharted\s+dataset|dataset\s+threat\s+scene|dataset\s+scene\s+profile|intel\s+scene\s+dataset|scene\s+profiled\s+dataset)\b/i;

const THRESHOLD = 0.07;
const SCENE_IDS = ['01_command_atrium','02_cyber_ops','03_threat_intel','04_data_nexus','05_comms_hub','06_field_ops','07_strategic_command','08_archives','09_black_site','10_emergence'];

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

function normaliseDatasets(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.datasets) ? data.datasets
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(d => ({
    id: d.id || d._id || d.datasetId || String(Math.random()),
    name: d.name || d.title || d.label || 'Untitled Dataset',
    description: d.description || d.summary || d.detail || '',
    category: d.category || d.type || d.kind || '',
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    rowCount: d.row_count || d.rowCount || d.rows || null,
    updatedAt: d.updated_at || d.updatedAt || d.lastModified || '',
    raw: d,
  }));
}

function normaliseIntelProfiles(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.intel_profiles) ? data.intel_profiles
    : Array.isArray(data.intelProfiles) ? data.intelProfiles
    : Array.isArray(data.profiles) ? data.profiles
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(p => ({
    id: p.id || p._id || p.profileId || String(Math.random()),
    name: p.name || p.subject || p.alias || p.label || 'Unknown Profile',
    category: p.category || p.type || p.threat_type || '',
    nationality: p.nationality || p.origin || p.country || '',
    description: p.description || p.bio || p.summary || '',
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    raw: p,
  }));
}

function normaliseScenes(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.scenes) ? data.scenes
    : data && typeof data === 'object' && data.id ? [data]
    : [];
  return arr.map(s => ({
    id: s.id || s.scene_id || s.sceneId || '',
    title: s.title || s.name || s.id || 'Scene',
    description: s.description || s.anchor || s.context || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(datasets, intelProfiles, scenes) {
  return datasets.map(ds => {
    const toks = tok([ds.name, ds.description, ds.category, ds.tags].join(' '));

    const matchedProfiles = intelProfiles
      .map(p => {
        const score = Math.max(
          matchScore(toks, p.name),
          matchScore(toks, p.category),
          matchScore(toks, p.nationality),
          matchScore(toks, p.description),
          matchScore(toks, p.tags),
        );
        return { ...p, matchScore: score };
      })
      .filter(p => p.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedScenes = scenes
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.title),
          matchScore(toks, s.description),
          matchScore(toks, s.tags),
        );
        return { ...s, matchScore: score };
      })
      .filter(s => s.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasProfile = matchedProfiles.length > 0;
    const hasScene = matchedScenes.length > 0;

    let state;
    if (hasProfile && hasScene) state = 'FULLY PROFILED';
    else if (hasProfile) state = 'INTEL-BACKED';
    else if (hasScene) state = 'SCENE-ANCHORED';
    else state = 'UNCHARTED';

    return { ds, matchedProfiles, matchedScenes, state };
  });
}

export function isDipseenQuery(t) {
  return DIPSEEN_RE.test(t || '');
}

export async function buildDipseenScript() {
  try {
    const sceneResults = await Promise.allSettled(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const scenes = normaliseScenes(
      sceneResults.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])
    );
    const [dsRes, ipRes] = await Promise.allSettled([
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : null),
    ]);
    const datasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : null);
    const intelProfiles = normaliseIntelProfiles(ipRes.status === 'fulfilled' ? ipRes.value : null);
    const rows = correlate(datasets, intelProfiles, scenes);
    const fullyProfiled = rows.filter(r => r.state === 'FULLY PROFILED').length;
    const intelBacked = rows.filter(r => r.state === 'INTEL-BACKED').length;
    const sceneAnchored = rows.filter(r => r.state === 'SCENE-ANCHORED').length;
    const uncharted = rows.filter(r => r.state === 'UNCHARTED').length;
    return `DIPSEEN Dataset×IntelProfile×Scene: ${rows.length} datasets analysed. ` +
      `${fullyProfiled} FULLY PROFILED (intel profile + scene), ` +
      `${intelBacked} INTEL-BACKED, ${sceneAnchored} SCENE-ANCHORED, ${uncharted} UNCHARTED. ` +
      (uncharted > 0
        ? `Top uncharted: "${rows.find(r => r.state === 'UNCHARTED')?.ds.name || 'see panel'}" — no intel profile or scene coverage.`
        : 'All datasets have intel profile or scene coverage.');
  } catch {
    return 'DIPSEEN: data fetch failed.';
  }
}

export default function DatasetIntelProfileSceneTriple() {
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
    window.addEventListener('jarvis:dipseen-toggle', handler);
    return () => window.removeEventListener('jarvis:dipseen-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const sceneResults = await Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status)))
      );
      const scenes = normaliseScenes(
        sceneResults.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
      );
      const [dsRes, ipRes] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const datasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : null);
      const intelProfiles = normaliseIntelProfiles(ipRes.status === 'fulfilled' ? ipRes.value : null);
      if (!datasets.length && !intelProfiles.length && !scenes.length) {
        setErr('No data returned from Datasets, IntelProfile, or Scene endpoints.');
      }
      setRows(correlate(datasets, intelProfiles, scenes));
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

  const fullyProfiled = rows.filter(r => r.state === 'FULLY PROFILED').length;
  const intelBacked = rows.filter(r => r.state === 'INTEL-BACKED').length;
  const sceneAnchored = rows.filter(r => r.state === 'SCENE-ANCHORED').length;
  const uncharted = rows.filter(r => r.state === 'UNCHARTED').length;

  const TABS = ['ALL', 'FULLY PROFILED', 'INTEL-BACKED', 'SCENE-ANCHORED', 'UNCHARTED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.ds.name.toLowerCase().includes(q) ||
        r.ds.description.toLowerCase().includes(q) ||
        r.matchedProfiles.some(p => p.name.toLowerCase().includes(q)) ||
        r.matchedScenes.some(s => s.title.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Dataset "${row.ds.name}" [${row.state}]: ` +
      `intel profiles: ${row.matchedProfiles.map(p => p.name).join(', ') || 'none'}. ` +
      `scenes: ${row.matchedScenes.map(s => s.title).join(', ') || 'none'}. ` +
      `Category: ${row.ds.category || 'unknown'}. ` +
      `Give a 2-sentence dataset intelligence coverage brief — does this dataset have adequate threat actor profiling and operational scene context, or is it an uncharted intelligence gap?`;
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

  const STATE_COLOUR = {
    'FULLY PROFILED': '#f59e0b',
    'INTEL-BACKED': '#a855f7',
    'SCENE-ANCHORED': '#84cc16',
    'UNCHARTED': '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 775360,
          bottom: 8,
          zIndex: 413,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #00e5ff44',
          color: '#00e5ff',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ DIPSEEN
        {uncharted > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#f59e0b',
            color: '#000',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {uncharted}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00e5ff55',
      borderRadius: 8,
      zIndex: 413,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #00e5ff22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #00e5ff22',
        background: 'rgba(0,229,255,0.05)',
      }}>
        <span style={{ color: '#00e5ff', fontWeight: 700, letterSpacing: 1 }}>
          ◈ DATASET × INTEL PROFILE × SCENE
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #00e5ff44',
              color: '#00e5ff',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #00e5ff11' }}>
        {[
          { label: 'FULLY PROFILED', val: fullyProfiled, col: '#f59e0b' },
          { label: 'INTEL-BACKED', val: intelBacked, col: '#a855f7' },
          { label: 'SCENE-ANCHORED', val: sceneAnchored, col: '#84cc16' },
          { label: 'UNCHARTED', val: uncharted, col: '#888' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(0,229,255,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00e5ff11' }}>
          <div style={{ fontSize: 10, color: '#556', marginBottom: 3 }}>
            COVERAGE — {rows.length > 0 ? Math.round((fullyProfiled / rows.length) * 100) : 0}% fully profiled
          </div>
          <div style={{ height: 4, background: '#111', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${rows.length ? (fullyProfiled / rows.length) * 100 : 0}%`, background: '#f59e0b' }} />
            <div style={{ width: `${rows.length ? (intelBacked / rows.length) * 100 : 0}%`, background: '#a855f7' }} />
            <div style={{ width: `${rows.length ? (sceneAnchored / rows.length) * 100 : 0}%`, background: '#84cc16' }} />
            <div style={{ width: `${rows.length ? (uncharted / rows.length) * 100 : 0}%`, background: '#333' }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #00e5ff11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? 'rgba(0,229,255,0.18)' : 'none',
              border: `1px solid ${filter === t ? '#00e5ff' : '#00e5ff22'}`,
              color: filter === t ? '#00e5ff' : '#556',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid #00e5ff22',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ padding: '6px 12px', color: '#ff4444', fontSize: 11 }}>
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div style={{ padding: '16px 12px', color: '#556', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {/* Rows */}
      <div>
        {visible.map((row, i) => {
          const isExpanded = expanded === (row.ds.id + i);
          return (
            <div
              key={row.ds.id + i}
              style={{
                borderBottom: '1px solid #00e5ff0a',
                padding: '6px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : (row.ds.id + i))}
              >
                <span style={{
                  display: 'inline-block',
                  minWidth: 100,
                  fontSize: 9,
                  fontWeight: 700,
                  color: STATE_COLOUR[row.state],
                  background: `${STATE_COLOUR[row.state]}18`,
                  border: `1px solid ${STATE_COLOUR[row.state]}44`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.ds.name}
                </span>
                {row.ds.category && (
                  <span style={{ fontSize: 9, color: '#00e5ff88', background: 'rgba(0,229,255,0.08)', borderRadius: 3, padding: '1px 5px' }}>
                    {row.ds.category}
                  </span>
                )}
                {row.ds.rowCount != null && (
                  <span style={{ fontSize: 9, color: '#556' }}>
                    {row.ds.rowCount.toLocaleString()} rows
                  </span>
                )}
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Intel Profiles */}
                  <div style={{ flex: 1, background: 'rgba(168,85,247,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#a855f7', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      INTEL PROFILES ({row.matchedProfiles.length})
                    </div>
                    {row.matchedProfiles.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No intel profile match</div>
                    ) : (
                      row.matchedProfiles.slice(0, 5).map((p, j) => (
                        <div key={p.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{p.name}</div>
                          {(p.category || p.nationality) && (
                            <div style={{ fontSize: 9, color: '#a855f788' }}>
                              {[p.category, p.nationality].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(p.matchScore * 100)}%`, background: '#a855f7', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Scenes */}
                  <div style={{ flex: 1, background: 'rgba(132,204,22,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#84cc16', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      SCENES ({row.matchedScenes.length})
                    </div>
                    {row.matchedScenes.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No scene match</div>
                    ) : (
                      row.matchedScenes.slice(0, 5).map((s, j) => (
                        <div key={s.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{s.title}</div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s.matchScore * 100)}%`, background: '#84cc16', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(0,229,255,0.1)',
                      border: '1px solid #00e5ff44',
                      color: '#00e5ff',
                      padding: '3px 12px',
                      borderRadius: 3,
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
