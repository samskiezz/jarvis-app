import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const CSCR_RE = /\b(cross[._-]?store|correlate[._-]?object|knowledge[._-]?fusion|cscr|graph[._-]?fusion|vector[._-]?correlat|fuse[._-]?knowledge|object[._-]?correlat|cross[._-]?store[._-]?search|knowledge[._-]?graph[._-]?fusion|which[._-]?objects[._-]?link)\b/i;

export function isCscrQuery(t) {
  return CSCR_RE.test(t || '');
}

export async function buildCscrScript() {
  try {
    const r = await fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json());
    const objs = normaliseArray(r);
    const count = objs.length;
    const first = objs[0];
    let crossHits = 0;
    let neighbors = 0;
    if (first) {
      const id = first.id || first.object_id;
      const cr = await fetch(`${API}/v1/correlate/${encodeURIComponent(id)}`).then(r => r.json());
      neighbors = (cr?.graph?.nodes || []).length;
      crossHits = cr?.n_cross_store || 0;
    }
    return `Cross-Store Correlator: ${count} ontology objects indexed. ` +
      `Sample object "${first?.label || first?.id || '?'}" has ${neighbors} graph neighbors and ${crossHits} cross-store fusion hits. ` +
      `Select any object to fuse graph context with vector and full-text search across all knowledge stores.`;
  } catch {
    return 'Cross-Store Correlator: unable to fetch object catalog or correlation data.';
  }
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'objects', 'data', 'records', 'nodes']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseHits(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['hits', 'results', 'items', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const STORE_COLORS = { vector: '#7c3aed', fts: '#2563eb', graph: '#059669', ontology: '#d97706', default: '#475569' };

function storeColor(store) {
  const s = String(store || '').toLowerCase();
  return STORE_COLORS[s] || STORE_COLORS.default;
}

export default function CrossStoreCorrelator() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('OBJECTS');
  const [objects, setObjects] = useState([]);
  const [selectedObj, setSelectedObj] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [corrLoading, setCorrLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [objSearch, setObjSearch] = useState('');
  const [objsLoading, setObjsLoading] = useState(false);
  const [err, setErr] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const debounceRef = useRef(null);

  const loadObjects = useCallback(async () => {
    setObjsLoading(true);
    try {
      const r = await fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json());
      setObjects(normaliseArray(r));
    } catch (e) {
      setErr(e.message);
    } finally {
      setObjsLoading(false);
    }
  }, []);

  const loadCorrelation = useCallback(async (obj) => {
    const id = obj?.id || obj?.object_id;
    if (!id) return;
    setCorrLoading(true);
    setCorrelation(null);
    try {
      const r = await fetch(`${API}/v1/correlate/${encodeURIComponent(id)}`).then(r => r.json());
      setCorrelation(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setCorrLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const r = await fetch(`${API}/v1/correlate/search?q=${encodeURIComponent(q.trim())}&k=10`).then(r => r.json());
      setSearchResults(normaliseHits(r));
    } catch (e) {
      setErr(e.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:cscr-toggle', h);
    return () => window.removeEventListener('jarvis:cscr-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadObjects();
    const id = setInterval(loadObjects, 5 * 60_000);
    return () => clearInterval(id);
  }, [open, loadObjects]);

  useEffect(() => {
    if (tab !== 'SEARCH') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(searchQ), 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchQ, tab, runSearch]);

  const selectObject = (obj) => {
    setSelectedObj(obj);
    loadCorrelation(obj);
  };

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const count = objects.length;
    const nn = correlation?.graph?.n_nodes || 0;
    const ne = correlation?.graph?.n_edges || 0;
    const ch = correlation?.n_cross_store || 0;
    const label = selectedObj?.label || selectedObj?.id || '?';
    const prompt =
      `Cross-Store Correlator: ${count} ontology objects indexed. ` +
      (selectedObj
        ? `Selected "${label}": ${nn} graph neighbors, ${ne} edges, ${ch} cross-store fusion hits. `
        : '') +
      `Give a 2-sentence knowledge fusion brief.`;
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

  const totalCrossHits = correlation?.n_cross_store || 0;
  const badge = totalCrossHits > 0 ? '#22c55e' : (objects.length > 0 ? '#22c55e' : '#475569');
  const badgeCount = objects.length;

  const visibleObjects = objects.filter(o => {
    if (!objSearch) return true;
    const label = (o.label || o.title || o.id || '').toLowerCase();
    return label.includes(objSearch.toLowerCase());
  });

  const graphNodes = correlation?.graph?.nodes || [];
  const graphEdges = correlation?.graph?.edges || [];
  const crossHits = normaliseHits(correlation?.cross_store);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Cross-Store Correlator"
        style={{
          position: 'fixed',
          left: 356400,
          bottom: 8,
          zIndex: 171,
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
          boxShadow: `0 0 6px ${badge}`,
          display: 'inline-block',
        }} />
        CSCR
        {badgeCount > 0 && (
          <span style={{ background: badge, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#7c3aed' }}>◈ CROSS-STORE CORRELATOR</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 6, color: '#7c3aed', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'OBJECTS', val: objects.length, color: '#7c3aed' },
              { label: 'NEIGHBORS', val: graphNodes.length, color: '#22c55e' },
              { label: 'CROSS-HITS', val: crossHits.length, color: '#f59e0b' },
              { label: 'EDGES', val: graphEdges.length, color: '#60a5fa' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, fontSize: 12, color: '#a78bfa', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px' }}>
            {['OBJECTS', 'SEARCH'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#7c3aed' : '#94a3b8',
                  padding: '3px 12px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {err && <div style={{ padding: '4px 16px 8px', color: '#ef4444', fontSize: 11 }}>Error: {err}</div>}

          {/* ── OBJECTS tab ── */}
          {tab === 'OBJECTS' && (
            <>
              <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
                <input
                  value={objSearch}
                  onChange={e => setObjSearch(e.target.value)}
                  placeholder="Filter objects…"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none' }}
                />
              </div>

              {objsLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading objects…</div>}

              {/* Object picker */}
              <div style={{ maxHeight: 180, overflowY: 'auto', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {visibleObjects.length === 0 && !objsLoading && (
                  <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 12 }}>No objects found.</div>
                )}
                {visibleObjects.map((obj, i) => {
                  const id = obj.id || obj.object_id || i;
                  const label = obj.label || obj.title || obj.name || id;
                  const type = obj.type || obj.type_id || '';
                  const isSelected = (selectedObj?.id || selectedObj?.object_id) === id;
                  return (
                    <div
                      key={id}
                      onClick={() => selectObject(obj)}
                      style={{
                        ...ROW,
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: isSelected ? 'rgba(124,58,237,0.12)' : 'transparent',
                      }}
                    >
                      {type && (
                        <span style={{ ...PILL, background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}>
                          {type}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: isSelected ? '#a78bfa' : '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      {isSelected && <span style={{ color: '#7c3aed', fontSize: 10 }}>◆</span>}
                    </div>
                  );
                })}
              </div>

              {/* Correlation panel for selected object */}
              {selectedObj && (
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>
                    CORRELATING: {selectedObj.label || selectedObj.id}
                  </div>
                  {corrLoading && <div style={{ color: '#64748b', fontSize: 12 }}>Fusing stores…</div>}

                  {correlation && !corrLoading && (
                    <>
                      {/* Graph neighborhood */}
                      {graphNodes.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginBottom: 6 }}>
                            ⬡ GRAPH NEIGHBORS ({graphNodes.length} nodes, {graphEdges.length} edges)
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {graphNodes.slice(0, 20).map((n, i) => {
                              const lbl = n.label || n.title || n.id || `node-${i}`;
                              const typ = n.type || n.type_id || '';
                              return (
                                <span key={i} style={{
                                  ...PILL,
                                  background: 'rgba(5,150,105,0.12)',
                                  color: '#34d399',
                                  border: '1px solid rgba(5,150,105,0.3)',
                                  fontSize: 10,
                                }}>
                                  {typ ? `[${typ}] ` : ''}{lbl}
                                </span>
                              );
                            })}
                            {graphNodes.length > 20 && (
                              <span style={{ fontSize: 10, color: '#475569' }}>+{graphNodes.length - 20} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Cross-store hits */}
                      {crossHits.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginBottom: 6 }}>
                            ◈ CROSS-STORE HITS ({crossHits.length})
                          </div>
                          {crossHits.slice(0, 8).map((hit, i) => {
                            const title = hit.title || hit.label || hit.name || hit.id || `hit-${i}`;
                            const store = hit.store || hit.source || hit.kind || '';
                            const score = hit.score || hit._score || 0;
                            const snippet = hit.snippet || hit.excerpt || hit.description || '';
                            return (
                              <div key={i} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                  {store && (
                                    <span style={{ ...PILL, background: `${storeColor(store)}22`, color: storeColor(store), border: `1px solid ${storeColor(store)}55`, fontSize: 10 }}>
                                      {store}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                                  {score > 0 && (
                                    <span style={{ fontSize: 10, color: '#60a5fa' }}>{typeof score === 'number' ? score.toFixed(3) : score}</span>
                                  )}
                                </div>
                                {score > 0 && (
                                  <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(100, Math.round((typeof score === 'number' ? score : 0) * 100))}%`, height: '100%', background: storeColor(store), borderRadius: 2 }} />
                                  </div>
                                )}
                                {snippet && (
                                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {snippet}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {graphNodes.length === 0 && crossHits.length === 0 && (
                        <div style={{ color: '#475569', fontSize: 12 }}>No neighbors or cross-store hits for this object.</div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!selectedObj && !objsLoading && (
                <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 12 }}>
                  Select an object above to fuse graph neighbors with vector + FTS hits across all knowledge stores.
                </div>
              )}
            </>
          )}

          {/* ── SEARCH tab ── */}
          {tab === 'SEARCH' && (
            <>
              <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Free-text cross-store search…"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none' }}
                  autoFocus
                />
              </div>

              {searchLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Searching…</div>}

              {!searchLoading && searchQ && searchResults.length === 0 && (
                <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 12 }}>No results.</div>
              )}

              {!searchQ && (
                <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 12 }}>
                  Enter a query to search across all knowledge stores (vector + FTS + graph).
                </div>
              )}

              <div style={{ paddingBottom: 8 }}>
                {searchResults.map((hit, i) => {
                  const title = hit.title || hit.label || hit.name || hit.id || `result-${i}`;
                  const store = hit.store || hit.source || hit.kind || '';
                  const score = hit.score || hit._score || 0;
                  const snippet = hit.snippet || hit.excerpt || hit.description || '';
                  return (
                    <div key={i} style={{ ...ROW }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        {store && (
                          <span style={{ ...PILL, background: `${storeColor(store)}22`, color: storeColor(store), border: `1px solid ${storeColor(store)}55`, fontSize: 10 }}>
                            {store}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                        {score > 0 && (
                          <span style={{ fontSize: 10, color: '#60a5fa' }}>{typeof score === 'number' ? score.toFixed(3) : score}</span>
                        )}
                      </div>
                      {score > 0 && (
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                          <div style={{ width: `${Math.min(100, Math.round((typeof score === 'number' ? score : 0) * 100))}%`, height: '100%', background: storeColor(store), borderRadius: 2 }} />
                        </div>
                      )}
                      {snippet && (
                        <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snippet}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {objects.length} objects · {tab === 'SEARCH' ? `${searchResults.length} hits` : (selectedObj ? `${graphNodes.length} neighbors · ${crossHits.length} cross-store hits` : 'select object to correlate')} · GET /v1/ontology/objects · /v1/correlate/*
          </div>
        </div>
      )}
    </>
  );
}
