/**
 * F73 — Scene × Dataset Coverage (SCDS)
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} anchor sets +
 * /v1/datasets, then keyword-correlates each scene's anchor texts
 * against the dataset catalog to surface:
 *   BACKED    — at least one dataset covers this scene's domain
 *   UNCHARTED — no dataset coverage found (intelligence gap)
 *
 * Stat tiles: scenes / datasets / backed / uncharted
 * Filter tabs: ALL | BACKED | UNCHARTED
 * Expand any scene → matched datasets with kind badge + row count + relevance score.
 * Amber badge on UNCHARTED count.
 * ▶ ASSESS: 2-sentence scene-dataset readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCDS  at bottom:8 left:687440, zIndex:256.
 * Event:   jarvis:scds-toggle
 * Voice:   "scene dataset / dataset scene / scds / data backed scene /
 *           scene data gap / scene data coverage / scene dataset coverage /
 *           which scenes have datasets / uncharted scenes"
 * Refresh: 120 s auto-poll (10 parallel scene fetches).
 */
import { useState, useEffect, useCallback } from 'react';

const API     = '';
const POLL_MS = 120_000;
const AM      = '#f59e0b';
const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCDS_RE =
  /\b(scene[._-]?dataset|dataset[._-]?scene|scds|data[._-]?backed[._-]?scene|scene[._-]?data[._-]?gap|scene[._-]?data[._-]?coverage|scene[._-]?dataset[._-]?coverage|which[._-]?scenes?[._-]?(have|got)[._-]?datasets?|uncharted[._-]?scenes?)\b/i;

export function isScdsQuery(t) {
  return SCDS_RE.test(t || '');
}

export async function buildScdsScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [scenesRes, dsRes] = await Promise.allSettled([
      Promise.all(SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )),
      fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    ]);
    const rawScenes  = scenesRes.status === 'fulfilled' ? scenesRes.value.filter(Boolean) : [];
    const rawDatasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : []);
    const scenes     = rawScenes.map(normaliseScene).filter(Boolean);
    const enriched   = correlate(scenes, rawDatasets);
    const backed     = enriched.filter(s => s._backed).length;
    const uncharted  = enriched.length - backed;
    const topUncharted = enriched
      .filter(s => !s._backed)
      .slice(0, 4)
      .map(s => s.title || s.id)
      .join(', ') || 'none';
    return (
      `Scene × Dataset Coverage: ${scenes.length} cinematic scenes cross-matched against ` +
      `${rawDatasets.length} datasets. ${backed} scenes are BACKED (dataset support found); ` +
      `${uncharted} scenes are UNCHARTED (no dataset coverage — intelligence gap). ` +
      `Uncharted scenes: ${topUncharted}.`
    );
  } catch {
    return 'Scene × Dataset Coverage assessment unavailable at this time, sir.';
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
    anchors,
  };
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.datasets)        ? raw.datasets
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.data)            ? raw.data
    : [];
  return arr.map((d, i) => ({
    id:      d.id          || d.dataset_id || String(i),
    title:   d.title       || d.name       || d.label || `Dataset ${i + 1}`,
    kind:    d.kind        || d.type       || d.format || d.category || '',
    rows:    d.row_count   || d.rows       || d.count  || d.records  || null,
    description: (d.description || d.summary || d.body || '').toString().slice(0, 300),
    tags:    Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
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

function sceneTokens(scene) {
  return new Set([
    ...tokens(scene.title),
    ...tokens(scene.category),
    ...tokens(scene.anchorText),
  ]);
}

function matchScore(scene, dataset) {
  const sToks = sceneTokens(scene);
  const dToks = [
    ...tokens(dataset.title),
    ...tokens(dataset.kind),
    ...tokens(dataset.description),
    ...tokens(dataset.tags),
  ].filter(Boolean);
  if (!sToks.size || !dToks.length) return 0;
  let hits = 0;
  for (const t of dToks) if (sToks.has(t)) hits++;
  return hits / Math.max(sToks.size, dToks.length);
}

function correlate(scenes, datasets) {
  return scenes.map(scene => {
    const scored = datasets
      .map(d => ({ ...d, _score: matchScore(scene, d) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...scene, _matches: scored, _backed: scored.length > 0 };
  });
}

// ── styles ────────────────────────────────────────────────────────────────────

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW  = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ['ALL', 'BACKED', 'UNCHARTED'];

export default function SceneDatasetCoverage() {
  const [open,       setOpen]       = useState(false);
  const [scenes,     setScenes]     = useState([]);
  const [datasets,   setDatasets]   = useState([]);
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
      const [scenesRes, dsRes] = await Promise.allSettled([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawScenes   = scenesRes.status === 'fulfilled' ? scenesRes.value.filter(Boolean) : [];
      const rawDatasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : []);
      const normScenes  = rawScenes.map(normaliseScene).filter(Boolean);
      setScenes(normScenes);
      setDatasets(rawDatasets);
      setEnriched(correlate(normScenes, rawDatasets));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:scds-toggle', h);
    return () => window.removeEventListener('jarvis:scds-toggle', h);
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
    const backed    = enriched.filter(s => s._backed).length;
    const uncharted = enriched.filter(s => !s._backed).length;
    const topUncharted = enriched
      .filter(s => !s._backed)
      .slice(0, 5)
      .map(s => s.title || s.id)
      .join(', ') || 'none';
    const topDs = enriched
      .filter(s => s._backed)
      .flatMap(s => s._matches.slice(0, 2).map(d => d.title))
      .slice(0, 5)
      .join(', ') || 'none';
    const prompt =
      `Scene × Dataset Coverage: ${scenes.length} cinematic scenes cross-matched against ` +
      `${datasets.length} datasets. ${backed} scenes are BACKED (dataset support found); ` +
      `${uncharted} scenes are UNCHARTED (no dataset coverage — intelligence gap). ` +
      `Uncharted scenes: ${topUncharted}. Top supporting datasets: ${topDs}. ` +
      `Give a 2-sentence scene-dataset readiness brief: which scene domains lack data ` +
      `and what operational risk that creates.`;
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

  const unchartedCount = enriched.filter(s => !s._backed).length;
  const badgeColor     = unchartedCount > 0 ? AM : '#22c55e';

  const visible = enriched.filter(scene => {
    const label = (scene.title || scene.id).toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'BACKED')    return scene._backed;
    if (tab === 'UNCHARTED') return !scene._backed;
    return true;
  });

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Dataset Coverage"
        style={{
          position: 'fixed',
          left: 687440,
          bottom: 8,
          zIndex: 256,
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
          boxShadow: unchartedCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        SCDS
        {unchartedCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unchartedCount}
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
          zIndex: 9112,
          width: 'min(700px, 96vw)',
          maxHeight: '82vh',
          background: 'rgba(8,14,24,0.96)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 14,
          boxShadow: '0 0 60px rgba(245,158,11,0.12)',
          backdropFilter: 'blur(16px)',
          fontFamily: "'JetBrains Mono',monospace",
          color: '#e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ SCENE × DATASET COVERAGE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b' }}>
              {loading ? 'loading…' : err ? '⚠ ' + err : `${enriched.length} scenes · ${datasets.length} datasets`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES',    val: enriched.length,                             color: '#94a3b8' },
              { label: 'DATASETS',  val: datasets.length,                             color: '#94a3b8' },
              { label: 'BACKED',    val: enriched.filter(s => s._backed).length,      color: '#22c55e' },
              { label: 'UNCHARTED', val: unchartedCount,                              color: AM },
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
              placeholder="search scenes…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, color: '#e2e8f0', padding: '3px 10px', fontSize: 11, outline: 'none', width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: 12 }}>No results</div>
            )}
            {visible.map((scene) => {
              const label = scene.title || scene.id;
              const isExp = expanded === scene.id;
              const stClr = scene._backed ? '#22c55e' : AM;
              return (
                <div key={scene.id}>
                  <div
                    onClick={() => setExpanded(isExp ? null : scene.id)}
                    style={{ ...ROW, background: isExp ? 'rgba(245,158,11,0.05)' : undefined }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = isExp ? 'rgba(245,158,11,0.05)' : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...PILL, background: stClr + '22', color: stClr }}>
                        {scene._backed ? 'BACKED' : 'UNCHARTED'}
                      </span>
                      {scene.category && (
                        <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{scene.category}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{label}</span>
                      {scene._matches?.length > 0 && (
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                          {scene._matches.length} dataset{scene._matches.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* expanded: matched datasets */}
                  {isExp && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 24px 10px' }}>
                      {scene._matches?.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#475569', padding: '6px 0' }}>No dataset matches — scene domain is uncharted.</div>
                      ) : (
                        scene._matches.map((ds) => (
                          <div key={ds.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {ds.kind && (
                              <span style={{ ...PILL, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>{ds.kind}</span>
                            )}
                            <span style={{ fontSize: 11, flex: 1 }}>{ds.title}</span>
                            {ds.rows != null && (
                              <span style={{ fontSize: 10, color: '#64748b', minWidth: 60, textAlign: 'right' }}>
                                {ds.rows.toLocaleString()} rows
                              </span>
                            )}
                            <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                <div style={{ width: `${Math.min(100, ds._score * 300)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 9, color: '#64748b', minWidth: 22 }}>{(ds._score * 100).toFixed(0)}%</span>
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
                padding: '5px 16px', borderRadius: 8, border: `1px solid ${AM}44`,
                background: assessing ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)',
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
