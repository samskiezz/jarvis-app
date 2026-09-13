import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SCSWDS_RE = /\b(scswds|scene\s+swarm\s+dataset|swarm\s+scene\s+dataset|dataset\s+scene\s+swarm|scene\s+automation\s+data|automated\s+scene\s+data|scene\s+data\s+swarm|scene\s+swarm\s+coverage|dark\s+scene\s+triple)\b/i;

const THRESHOLD = 0.07;

const SCENE_IDS = [
  '01_command_atrium',
  '02_ai_core_chamber',
  '03_world_control_room',
  '04_intelligence_graph_space',
  '05_operations_war_room',
  '06_data_fusion_reactor',
  '07_document_intelligence_vault',
  '08_simulation_theatre',
  '09_analytics_observatory',
  '10_system_security_core',
];

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

function normaliseScene(data, sceneId) {
  if (!data) return { id: sceneId, label: sceneId.replace(/_/g, ' '), anchors: [], anchorText: '' };
  const anchors = Array.isArray(data.anchors) ? data.anchors
    : Array.isArray(data.data) ? data.data
    : [];
  const label = data.label || data.name || data.title || sceneId.replace(/_/g, ' ');
  const anchorText = anchors.map(a =>
    [a.key, a.label, a.value, a.description].filter(Boolean).join(' ')
  ).join(' ');
  return { id: sceneId, label, anchors, anchorText };
}

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.swarm_jobs) ? data.swarm_jobs
    : Array.isArray(data.swarmJobs) ? data.swarmJobs
    : Array.isArray(data.jobs) ? data.jobs
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(j => ({
    id: j.id || j._id || j.jobId || String(Math.random()),
    name: j.name || j.title || j.label || j.objective || 'Untitled Job',
    description: j.description || j.summary || j.objective || '',
    type: j.type || j.job_type || j.category || '',
    status: j.status || j.state || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    raw: j,
  }));
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
    description: d.description || d.summary || '',
    kind: d.kind || d.type || d.category || '',
    rows: d.rows || d.row_count || d.count || null,
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : String(d.tags || ''),
    raw: d,
  }));
}

function correlate(scenes, swarmJobs, datasets) {
  return scenes.map(scene => {
    const toks = tok([scene.label, scene.anchorText].join(' '));

    const matchedSwarmJobs = swarmJobs
      .map(j => {
        const score = Math.max(
          matchScore(toks, j.name),
          matchScore(toks, j.description),
          matchScore(toks, j.type),
          matchScore(toks, j.tags),
        );
        return { ...j, matchScore: score };
      })
      .filter(j => j.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedDatasets = datasets
      .map(d => {
        const score = Math.max(
          matchScore(toks, d.name),
          matchScore(toks, d.description),
          matchScore(toks, d.kind),
          matchScore(toks, d.tags),
        );
        return { ...d, matchScore: score };
      })
      .filter(d => d.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasSwarm = matchedSwarmJobs.length > 0;
    const hasDataset = matchedDatasets.length > 0;

    let state;
    if (hasSwarm && hasDataset) state = 'FULLY AUTOMATED';
    else if (hasSwarm) state = 'SWARM-ONLY';
    else if (hasDataset) state = 'DATA-ONLY';
    else state = 'DARK';

    return { scene, matchedSwarmJobs, matchedDatasets, state };
  });
}

export function isScswdsQuery(t) {
  return SCSWDS_RE.test(t || '');
}

export async function buildScswdsScript() {
  try {
    const sceneResults = await Promise.allSettled(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const scenes = sceneResults.map((r, i) =>
      normaliseScene(r.status === 'fulfilled' ? r.value : null, SCENE_IDS[i])
    );

    const [swarmRes, dsRes] = await Promise.allSettled([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
    ]);

    const swarmJobs = normaliseSwarmJobs(swarmRes.status === 'fulfilled' ? swarmRes.value : null);
    const datasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : null);
    const rows = correlate(scenes, swarmJobs, datasets);

    const fullyAutomated = rows.filter(r => r.state === 'FULLY AUTOMATED').length;
    const swarmOnly = rows.filter(r => r.state === 'SWARM-ONLY').length;
    const dataOnly = rows.filter(r => r.state === 'DATA-ONLY').length;
    const dark = rows.filter(r => r.state === 'DARK').length;

    return `SCSWDS Scene×SwarmJob×Dataset: ${rows.length} scenes analysed. ` +
      `${fullyAutomated} FULLY AUTOMATED (swarm + dataset), ` +
      `${swarmOnly} SWARM-ONLY, ${dataOnly} DATA-ONLY, ${dark} DARK. ` +
      (dark > 0
        ? `Top dark: "${rows.find(r => r.state === 'DARK')?.scene.label || 'see panel'}" — no swarm or dataset coverage.`
        : 'All scenes have swarm or dataset coverage.');
  } catch {
    return 'SCSWDS: data fetch failed.';
  }
}

export default function SceneSwarmDatasetTriple() {
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
    window.addEventListener('jarvis:scswds-toggle', handler);
    return () => window.removeEventListener('jarvis:scswds-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const sceneResults = await Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status)))
      );
      const scenes = sceneResults.map((r, i) =>
        normaliseScene(r.status === 'fulfilled' ? r.value : null, SCENE_IDS[i])
      );

      const [swarmRes, dsRes] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const swarmJobs = normaliseSwarmJobs(swarmRes.status === 'fulfilled' ? swarmRes.value : null);
      const datasets = normaliseDatasets(dsRes.status === 'fulfilled' ? dsRes.value : null);

      setRows(correlate(scenes, swarmJobs, datasets));
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
    timerRef.current = setInterval(load, 120000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyAutomated = rows.filter(r => r.state === 'FULLY AUTOMATED').length;
  const swarmOnly = rows.filter(r => r.state === 'SWARM-ONLY').length;
  const dataOnly = rows.filter(r => r.state === 'DATA-ONLY').length;
  const dark = rows.filter(r => r.state === 'DARK').length;

  const TABS = ['ALL', 'FULLY AUTOMATED', 'SWARM-ONLY', 'DATA-ONLY', 'DARK'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.scene.label.toLowerCase().includes(q) ||
        r.matchedSwarmJobs.some(j => j.name.toLowerCase().includes(q)) ||
        r.matchedDatasets.some(d => d.name.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Cinematic scene "${row.scene.label}" [${row.state}]: ` +
      `matched swarm jobs: ${row.matchedSwarmJobs.map(j => j.name).join(', ') || 'none'}. ` +
      `matched datasets: ${row.matchedDatasets.map(d => d.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence scene automation and data-coverage brief — does this operational theatre have adequate swarm automation and dataset backing, or is it an unmapped gap?`;
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
    'FULLY AUTOMATED': '#84cc16',
    'SWARM-ONLY':      '#22d3ee',
    'DATA-ONLY':       '#34d399',
    'DARK':            '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 777040,
          bottom: 8,
          zIndex: 416,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #84cc1644',
          color: '#84cc16',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ SCSWDS
        {dark > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#888',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {dark}
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
      border: '1px solid #84cc1655',
      borderRadius: 8,
      zIndex: 416,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #84cc1622',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #84cc1622',
        background: 'rgba(132,204,22,0.05)',
      }}>
        <span style={{ color: '#84cc16', fontWeight: 700, letterSpacing: 1 }}>
          ◈ SCENE × SWARMJOB × DATASET
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
              border: '1px solid #84cc1644',
              color: '#84cc16',
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
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #84cc1611' }}>
        {[
          { label: 'FULLY AUTOMATED', val: fullyAutomated, col: '#84cc16' },
          { label: 'SWARM-ONLY',      val: swarmOnly,      col: '#22d3ee' },
          { label: 'DATA-ONLY',       val: dataOnly,       col: '#34d399' },
          { label: 'DARK',            val: dark,           col: '#888'    },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(132,204,22,0.04)',
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
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #84cc1611' }}>
          <div style={{ fontSize: 10, color: '#556', marginBottom: 3 }}>
            COVERAGE — {Math.round((fullyAutomated / rows.length) * 100)}% fully automated
          </div>
          <div style={{ height: 4, background: '#111', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${(fullyAutomated / rows.length) * 100}%`, background: '#84cc16' }} />
            <div style={{ width: `${(swarmOnly / rows.length) * 100}%`, background: '#22d3ee' }} />
            <div style={{ width: `${(dataOnly / rows.length) * 100}%`, background: '#34d399' }} />
            <div style={{ width: `${(dark / rows.length) * 100}%`, background: '#333' }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #84cc1611', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? 'rgba(132,204,22,0.18)' : 'none',
              border: `1px solid ${filter === t ? '#84cc16' : '#84cc1622'}`,
              color: filter === t ? '#84cc16' : '#556',
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
            background: 'rgba(132,204,22,0.05)',
            border: '1px solid #84cc1622',
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
          const key = row.scene.id + i;
          const isExpanded = expanded === key;
          return (
            <div
              key={key}
              style={{ borderBottom: '1px solid #84cc160a', padding: '6px 12px' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : key)}
              >
                <span style={{
                  display: 'inline-block',
                  minWidth: 118,
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
                  {row.scene.label}
                </span>
                <span style={{ fontSize: 9, color: '#22d3ee88' }}>
                  {row.matchedSwarmJobs.length}J
                </span>
                <span style={{ fontSize: 9, color: '#34d39988' }}>
                  {row.matchedDatasets.length}DS
                </span>
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Swarm Jobs */}
                  <div style={{ flex: 1, background: 'rgba(34,211,238,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#22d3ee', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      SWARM JOBS ({row.matchedSwarmJobs.length})
                    </div>
                    {row.matchedSwarmJobs.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No swarm job match</div>
                    ) : (
                      row.matchedSwarmJobs.slice(0, 5).map((j, k) => (
                        <div key={j.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{j.name}</span>
                            {j.type && (
                              <span style={{ fontSize: 9, color: '#22d3ee88' }}>{j.type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(j.matchScore * 100)}%`, background: '#22d3ee', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Datasets */}
                  <div style={{ flex: 1, background: 'rgba(52,211,153,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#34d399', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      DATASETS ({row.matchedDatasets.length})
                    </div>
                    {row.matchedDatasets.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No dataset match</div>
                    ) : (
                      row.matchedDatasets.slice(0, 5).map((d, k) => (
                        <div key={d.id + k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                            <span style={{ color: '#c8e6ff', fontSize: 10 }}>{d.name}</span>
                            {d.kind && (
                              <span style={{ fontSize: 9, color: '#34d39988' }}>{d.kind}</span>
                            )}
                            {d.rows != null && (
                              <span style={{ fontSize: 9, color: '#556' }}>{d.rows.toLocaleString()}r</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(d.matchScore * 100)}%`, background: '#34d399', height: '100%' }} />
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
                      background: 'rgba(132,204,22,0.1)',
                      border: '1px solid #84cc1644',
                      color: '#84cc16',
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
