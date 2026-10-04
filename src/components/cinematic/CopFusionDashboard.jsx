import { useState, useEffect, useCallback } from 'react';

const API = '';
const COP_RE = /\b(cop[._-]?fusion|common[._-]?operating[._-]?picture|cop[._-]?snapshot|cop[._-]?layers|fused[._-]?snapshot|cop[._-]?panel|cop[._-]?dashboard|cop[._-]?monitor|cop[._-]?view|ops[._-]?picture|operating[._-]?picture|cop)\b/i;

export function isCopQuery(t) {
  return COP_RE.test(t || '');
}

export async function buildCopScript() {
  try {
    const snap = await fetch(`${API}/v1/cop/snapshot`).then(r => r.json());
    const geo = snap?.geo?.count || (snap?.geo?.objects || []).length || 0;
    const graph = snap?.graph?.node_count || 0;
    const temporal = snap?.temporal?.event_count || (snap?.temporal?.events || []).length || 0;
    const metrics = snap?.metrics?.count || Object.keys(snap?.metrics || {}).length || 0;
    return `COP Fusion Dashboard: snapshot contains ${geo} geo objects, ${graph} graph nodes, ${temporal} temporal events, ${metrics} metric streams. ` +
      `All stores fused into one common operating picture. Toggle layers to filter the view.`;
  } catch {
    return 'COP Fusion Dashboard: unable to fetch fused snapshot from /v1/cop/snapshot.';
  }
}

function normaliseArray(raw, ...keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) { if (Array.isArray(raw[k])) return raw[k]; }
  for (const k of ['items', 'results', 'data', 'records']) { if (Array.isArray(raw[k])) return raw[k]; }
  return [];
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const ACCENT = '#06b6d4'; // cyan

function age(ts) {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 0) return '';
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3600_000) return `${Math.round(d / 60_000)}m ago`;
  return `${Math.round(d / 3600_000)}h ago`;
}

function layerColor(layerId) {
  if (!layerId) return '#64748b';
  const s = String(layerId).toLowerCase();
  if (s.includes('geo') || s.includes('map')) return '#059669';
  if (s.includes('graph') || s.includes('node')) return '#7c3aed';
  if (s.includes('temporal') || s.includes('time') || s.includes('event')) return '#f59e0b';
  if (s.includes('metric') || s.includes('stat')) return '#2563eb';
  return '#475569';
}

export default function CopFusionDashboard() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('SNAPSHOT');
  const [snapshot, setSnapshot] = useState(null);
  const [layers, setLayers] = useState([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [layersLoading, setLayersLoading] = useState(false);
  const [toggling, setToggling] = useState('');
  const [err, setErr] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [search, setSearch] = useState('');

  const loadSnapshot = useCallback(async () => {
    setSnapLoading(true);
    setErr('');
    try {
      const r = await fetch(`${API}/v1/cop/snapshot`).then(r => r.json());
      setSnapshot(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSnapLoading(false);
    }
  }, []);

  const loadLayers = useCallback(async () => {
    setLayersLoading(true);
    try {
      const r = await fetch(`${API}/v1/cop/layers`).then(r => r.json());
      setLayers(normaliseArray(r, 'layers'));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLayersLoading(false);
    }
  }, []);

  const toggleLayer = async (layerId) => {
    setToggling(layerId);
    try {
      await fetch(`${API}/v1/cop/layers/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layer_id: layerId }),
      });
      await loadLayers();
    } catch (e) {
      setErr(e.message);
    } finally {
      setToggling('');
    }
  };

  const selectObject = async (objId, objType) => {
    try {
      await fetch(`${API}/v1/cop/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ object_id: objId, type: objType || '', source_pane: 'cop-fusion' }),
      });
    } catch {
      // selection is best-effort
    }
  };

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const geo = snapshot?.geo?.count || geoObjects.length;
    const graph = snapshot?.graph?.node_count || graphNodes.length;
    const temporal = temporalEvents.length;
    const prompt =
      `COP Fusion Dashboard: fused snapshot has ${geo} geo objects, ${graph} graph nodes, ` +
      `${temporal} temporal events, ${layers.length} layers (${layers.filter(l => l.visible !== false).length} visible). ` +
      `Give a 2-sentence common operating picture brief.`;
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

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:cop-toggle', h);
    return () => window.removeEventListener('jarvis:cop-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadSnapshot();
    loadLayers();
    const id = setInterval(loadSnapshot, 60_000);
    return () => clearInterval(id);
  }, [open, loadSnapshot, loadLayers]);

  const geoObjects = normaliseArray(snapshot?.geo, 'objects', 'features');
  const graphNodes = normaliseArray(snapshot?.graph, 'nodes');
  const temporalEvents = normaliseArray(snapshot?.temporal, 'events', 'items');
  const metricCards = (() => {
    const m = snapshot?.metrics;
    if (!m) return [];
    if (Array.isArray(m)) return m;
    return Object.entries(m).map(([k, v]) => ({ label: k, ...(typeof v === 'object' ? v : { value: v }) }));
  })();

  const activeLayers = layers.filter(l => l.visible !== false);
  const totalGeo = snapshot?.geo?.count ?? geoObjects.length;
  const totalGraph = snapshot?.graph?.node_count ?? graphNodes.length;
  const totalTemporal = snapshot?.temporal?.event_count ?? temporalEvents.length;
  const totalMetrics = metricCards.length;

  const badgeCount = activeLayers.length || 0;
  const badge = snapshot ? ACCENT : '#475569';

  const lowerSearch = search.toLowerCase();
  const visibleLayers = layers.filter(l => {
    if (!lowerSearch) return true;
    return (l.id || l.name || '').toLowerCase().includes(lowerSearch);
  });
  const visibleGeo = geoObjects.filter(o => {
    if (!lowerSearch) return true;
    return JSON.stringify(o).toLowerCase().includes(lowerSearch);
  });
  const visibleEvents = temporalEvents.filter(e => {
    if (!lowerSearch) return true;
    return JSON.stringify(e).toLowerCase().includes(lowerSearch);
  });

  const TABS = ['SNAPSHOT', 'LAYERS', 'GEO', 'TEMPORAL', 'METRICS'];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="COP Fusion Dashboard"
        style={{
          position: 'fixed',
          left: 365520,
          bottom: 8,
          zIndex: 173,
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
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: badge, boxShadow: `0 0 6px ${badge}`, display: 'inline-block' }} />
        COP
        {badgeCount > 0 && (
          <span style={{ background: ACCENT, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 620,
          maxHeight: '84vh',
          overflowY: 'auto',
          background: 'rgba(8,14,26,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9610,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>◈ COMMON OPERATING PICTURE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: `rgba(6,182,212,0.12)`, border: `1px solid rgba(6,182,212,0.35)`, borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'GEO', val: snapLoading ? '…' : totalGeo, color: '#059669' },
              { label: 'GRAPH', val: snapLoading ? '…' : totalGraph, color: '#7c3aed' },
              { label: 'TEMPORAL', val: snapLoading ? '…' : totalTemporal, color: '#f59e0b' },
              { label: 'METRICS', val: snapLoading ? '…' : totalMetrics, color: '#2563eb' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: `rgba(6,182,212,0.08)`, border: `1px solid rgba(6,182,212,0.2)`, borderRadius: 8, fontSize: 12, color: '#67e8f9', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `rgba(6,182,212,0.18)` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${tab === t ? `rgba(6,182,212,0.5)` : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6,
                color: tab === t ? ACCENT : '#94a3b8',
                padding: '3px 12px',
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: tab === t ? 700 : 400,
              }}>
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          {tab !== 'SNAPSHOT' && (
            <div style={{ padding: '0 16px 10px' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Filter ${tab.toLowerCase()}…`}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none' }}
              />
            </div>
          )}

          {err && <div style={{ padding: '4px 16px 8px', color: '#ef4444', fontSize: 11 }}>Error: {err}</div>}

          {/* ── SNAPSHOT tab ── */}
          {tab === 'SNAPSHOT' && (
            <div style={{ padding: '0 16px 12px' }}>
              {snapLoading && <div style={{ color: '#64748b', fontSize: 12, padding: '8px 0' }}>Loading fused snapshot…</div>}
              {!snapshot && !snapLoading && <div style={{ color: '#475569', fontSize: 12, padding: '8px 0' }}>No snapshot data yet.</div>}
              {snapshot && (
                <>
                  {/* Sync token */}
                  {snapshot.sync_token && (
                    <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
                      sync token: <span style={{ color: '#64748b' }}>{snapshot.sync_token}</span>
                    </div>
                  )}
                  {/* Active layers */}
                  {activeLayers.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: ACCENT, fontWeight: 600, marginBottom: 6 }}>ACTIVE LAYERS ({activeLayers.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {activeLayers.map((l, i) => {
                          const lid = l.id || l.name || `layer-${i}`;
                          return (
                            <span key={lid} style={{ ...PILL, background: `${layerColor(lid)}22`, color: layerColor(lid), border: `1px solid ${layerColor(lid)}55` }}>
                              {lid}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Raw snapshot fields */}
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>RAW SNAPSHOT FIELDS</div>
                  {Object.entries(snapshot).filter(([k]) => k !== 'layers').map(([k, v]) => {
                    const preview = typeof v === 'object'
                      ? (Array.isArray(v) ? `[${v.length} items]` : `{${Object.keys(v || {}).join(', ')}}`)
                      : String(v);
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5, fontSize: 12 }}>
                        <span style={{ color: '#475569', minWidth: 110 }}>{k}</span>
                        <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── LAYERS tab ── */}
          {tab === 'LAYERS' && (
            <div style={{ paddingBottom: 8 }}>
              {layersLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading layers…</div>}
              {!layersLoading && visibleLayers.length === 0 && (
                <div style={{ padding: '12px 18px', color: '#475569', fontSize: 12 }}>No layers found.</div>
              )}
              {visibleLayers.map((l, i) => {
                const lid = l.id || l.name || `layer-${i}`;
                const visible = l.visible !== false;
                const lc = layerColor(lid);
                return (
                  <div key={lid} style={{ ...ROW, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: visible ? lc : '#374151', boxShadow: visible ? `0 0 5px ${lc}` : 'none', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ ...PILL, background: `${lc}22`, color: lc, border: `1px solid ${lc}55`, fontSize: 10 }}>{lid}</span>
                      {l.label && l.label !== lid && (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{l.label}</span>
                      )}
                    </div>
                    <button
                      onClick={() => toggleLayer(lid)}
                      disabled={toggling === lid}
                      style={{
                        background: visible ? `rgba(6,182,212,0.12)` : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${visible ? `rgba(6,182,212,0.4)` : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 5,
                        color: visible ? ACCENT : '#64748b',
                        padding: '2px 8px',
                        fontSize: 10,
                        cursor: 'pointer',
                        fontWeight: 600,
                        letterSpacing: 0.5,
                      }}
                    >
                      {toggling === lid ? '…' : (visible ? '▼ HIDE' : '▲ SHOW')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── GEO tab ── */}
          {tab === 'GEO' && (
            <div style={{ paddingBottom: 8 }}>
              {snapLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
              {!snapLoading && visibleGeo.length === 0 && (
                <div style={{ padding: '12px 18px', color: '#475569', fontSize: 12 }}>No geo objects in snapshot.</div>
              )}
              {visibleGeo.slice(0, 50).map((obj, i) => {
                const id = obj.id || obj.object_id || `geo-${i}`;
                const label = obj.label || obj.name || obj.title || id;
                const type = obj.type || obj.type_id || obj.kind || '';
                const lat = obj.lat ?? obj.latitude ?? obj.location?.lat ?? null;
                const lon = obj.lon ?? obj.longitude ?? obj.location?.lon ?? null;
                return (
                  <div
                    key={id}
                    onClick={() => selectObject(id, type)}
                    style={{ ...ROW, cursor: 'pointer' }}
                  >
                    {type && <span style={{ ...PILL, background: 'rgba(5,150,105,0.15)', color: '#34d399', border: '1px solid rgba(5,150,105,0.3)', fontSize: 10 }}>{type}</span>}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {lat != null && lon != null && (
                      <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>{Number(lat).toFixed(3)},{Number(lon).toFixed(3)}</span>
                    )}
                  </div>
                );
              })}
              {visibleGeo.length > 50 && (
                <div style={{ padding: '6px 18px', color: '#475569', fontSize: 11 }}>+ {visibleGeo.length - 50} more</div>
              )}
            </div>
          )}

          {/* ── TEMPORAL tab ── */}
          {tab === 'TEMPORAL' && (
            <div style={{ paddingBottom: 8 }}>
              {snapLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
              {!snapLoading && visibleEvents.length === 0 && (
                <div style={{ padding: '12px 18px', color: '#475569', fontSize: 12 }}>No temporal events in snapshot.</div>
              )}
              {visibleEvents.slice(0, 60).map((ev, i) => {
                const kind = ev.kind || ev.type || ev.event_type || '';
                const series = ev.series_id || ev.series || '';
                const ts = ev.ts || ev.timestamp || ev.time || ev.created_at || '';
                const val = ev.value ?? ev.val ?? '';
                return (
                  <div key={i} style={ROW}>
                    {kind && <span style={{ ...PILL, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)', fontSize: 10 }}>{kind}</span>}
                    {series && <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{series}</span>}
                    {val !== '' && <span style={{ fontSize: 11, color: '#e2e8f0', flexShrink: 0, marginLeft: 4 }}>{typeof val === 'number' ? val.toFixed(2) : String(val)}</span>}
                    {ts && <span style={{ fontSize: 10, color: '#475569', flexShrink: 0, marginLeft: 6 }}>{age(ts)}</span>}
                  </div>
                );
              })}
              {visibleEvents.length > 60 && (
                <div style={{ padding: '6px 18px', color: '#475569', fontSize: 11 }}>+ {visibleEvents.length - 60} more</div>
              )}
            </div>
          )}

          {/* ── METRICS tab ── */}
          {tab === 'METRICS' && (
            <div style={{ paddingBottom: 8 }}>
              {snapLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
              {!snapLoading && metricCards.length === 0 && (
                <div style={{ padding: '12px 18px', color: '#475569', fontSize: 12 }}>No metric cards in snapshot.</div>
              )}
              {metricCards.map((m, i) => {
                const label = m.label || m.name || m.metric || `metric-${i}`;
                const value = m.value ?? m.val ?? m.current ?? '';
                const unit = m.unit || '';
                const trend = m.trend || m.slope || null;
                return (
                  <div key={i} style={{ ...ROW }}>
                    <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {value !== '' && (
                      <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, flexShrink: 0 }}>
                        {typeof value === 'number' ? value.toFixed(2) : String(value)}
                        {unit && <span style={{ fontSize: 10, color: '#475569', marginLeft: 3 }}>{unit}</span>}
                      </span>
                    )}
                    {trend != null && (
                      <span style={{ fontSize: 11, color: trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : '#475569', marginLeft: 6, flexShrink: 0 }}>
                        {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {activeLayers.length} visible layers · {totalGeo} geo · {totalGraph} graph · {totalTemporal} temporal · GET /v1/cop/snapshot · /v1/cop/layers
          </div>
        </div>
      )}
    </>
  );
}
