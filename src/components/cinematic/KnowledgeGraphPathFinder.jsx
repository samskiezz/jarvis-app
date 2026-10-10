import { useState, useEffect, useCallback } from 'react';

const API = '';
const KGPF_RE = /\b(graph[._-]?path|find[._-]?path|path[._-]?finder|kgpf|shortest[._-]?path|connect[._-]?nodes|path[._-]?between|how[._-]?are[._-]?connected|node[._-]?path|graph[._-]?route|link[._-]?path|object[._-]?path)\b/i;

export function isKgpfQuery(t) {
  return KGPF_RE.test(t || '');
}

export async function buildKgpfScript() {
  try {
    const r = await fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json());
    const objs = normaliseArray(r);
    const count = objs.length;
    const ctr = await fetch(`${API}/v1/graph/centrality`).then(r => r.json()).catch(() => null);
    const topNode = normaliseArray(ctr)[0];
    return `Knowledge Graph Path Finder: ${count} ontology objects available. ` +
      (topNode
        ? `Most central node: "${topNode.label || topNode.id || '?'}" (score ${typeof topNode.centrality === 'number' ? topNode.centrality.toFixed(3) : topNode.centrality || '?'}). `
        : '') +
      `Select two objects and click FIND to trace the shortest knowledge-graph path between them.`;
  } catch {
    return 'Knowledge Graph Path Finder: unable to load object catalog.';
  }
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'objects', 'nodes', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

const ACCENT = '#0ea5e9';

export default function KnowledgeGraphPathFinder() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('FIND PATH');
  const [objects, setObjects] = useState([]);
  const [centrality, setCentrality] = useState([]);
  const [objFilter, setObjFilter] = useState('');
  const [fromObj, setFromObj] = useState(null);
  const [toObj, setToObj] = useState(null);
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null
  const [path, setPath] = useState(null);
  const [finding, setFinding] = useState(false);
  const [err, setErr] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const loadObjects = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json());
      setObjects(normaliseArray(r));
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  const loadCentrality = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/graph/centrality`).then(r => r.json());
      setCentrality(normaliseArray(r).slice(0, 20));
    } catch {
      setCentrality([]);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:kgpf-toggle', h);
    return () => window.removeEventListener('jarvis:kgpf-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadObjects();
    loadCentrality();
  }, [open, loadObjects, loadCentrality]);

  const findPath = async () => {
    const fromId = fromObj?.id || fromObj?.object_id;
    const toId = toObj?.id || toObj?.object_id;
    if (!fromId || !toId) { setErr('Select both FROM and TO objects.'); return; }
    setFinding(true);
    setPath(null);
    setErr('');
    try {
      const r = await fetch(`${API}/v1/graph/path?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`).then(r => r.json());
      setPath(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setFinding(false);
    }
  };

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const fromLabel = fromObj?.label || fromObj?.id || '?';
    const toLabel = toObj?.label || toObj?.id || '?';
    const pathLen = pathNodes.length;
    const prompt = path
      ? `Knowledge Graph Path Finder: shortest path from "${fromLabel}" to "${toLabel}" has ${pathLen} nodes and ${pathLen - 1} hops. Give a 2-sentence brief on what this connection reveals about the knowledge graph.`
      : `Knowledge Graph Path Finder: ${objects.length} ontology objects indexed, ${centrality.length} high-centrality nodes. Give a 2-sentence brief on the graph topology.`;
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

  const pathNodes = (() => {
    if (!path) return [];
    if (Array.isArray(path)) return path;
    for (const k of ['path', 'nodes', 'route', 'items']) {
      if (Array.isArray(path[k])) return path[k];
    }
    return [];
  })();
  const pathFound = pathNodes.length > 0;
  const badge = pathFound ? ACCENT : (objects.length > 0 ? '#475569' : '#475569');

  const filteredObjects = objects.filter(o => {
    if (!objFilter) return true;
    const lbl = (o.label || o.title || o.name || o.id || '').toLowerCase();
    return lbl.includes(objFilter.toLowerCase());
  });

  const selectObj = (obj) => {
    if (picking === 'from') { setFromObj(obj); }
    else if (picking === 'to') { setToObj(obj); }
    setPicking(null);
    setObjFilter('');
    setPath(null);
  };

  const useCentralNode = (node, role) => {
    const obj = { id: node.id || node.node_id, label: node.label || node.id, type: node.type || '' };
    if (role === 'from') setFromObj(obj);
    else setToObj(obj);
    setPath(null);
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge Graph Path Finder"
        style={{
          position: 'fixed',
          left: 360960,
          bottom: 8,
          zIndex: 172,
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
        KGPF
        {pathFound && (
          <span style={{ background: ACCENT, color: '#000', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {pathNodes.length}
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
          width: 620,
          maxHeight: '84vh',
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
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>⬡ KNOWLEDGE GRAPH PATH FINDER</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: `rgba(14,165,233,0.12)`, border: `1px solid rgba(14,165,233,0.3)`, borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'OBJECTS', val: objects.length, color: ACCENT },
              { label: 'PATH NODES', val: pathNodes.length || '—', color: '#22c55e' },
              { label: 'HOPS', val: pathNodes.length > 1 ? pathNodes.length - 1 : '—', color: '#f59e0b' },
              { label: 'CENTRAL NODES', val: centrality.length, color: '#a78bfa' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: `rgba(14,165,233,0.07)`, border: `1px solid rgba(14,165,233,0.2)`, borderRadius: 8, fontSize: 12, color: '#7dd3fc', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 10px' }}>
            {['FIND PATH', 'CENTRALITY'].map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setPicking(null); setObjFilter(''); }}
                style={{
                  background: tab === t ? `rgba(14,165,233,0.18)` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(14,165,233,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? ACCENT : '#94a3b8',
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

          {/* ── FIND PATH tab ── */}
          {tab === 'FIND PATH' && (
            <div style={{ padding: '0 16px 16px' }}>

              {/* FROM / TO pickers */}
              {['from', 'to'].map(role => {
                const selected = role === 'from' ? fromObj : toObj;
                const isActive = picking === role;
                return (
                  <div key={role} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, letterSpacing: 1 }}>{role.toUpperCase()} OBJECT</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{
                        flex: 1, padding: '5px 10px', borderRadius: 6,
                        background: selected ? `rgba(14,165,233,0.1)` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${selected ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        fontSize: 11,
                        color: selected ? ACCENT : '#475569',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {selected ? (selected.label || selected.id) : `— click PICK to choose —`}
                      </div>
                      <button
                        onClick={() => { setPicking(isActive ? null : role); setObjFilter(''); }}
                        style={{
                          background: isActive ? `rgba(14,165,233,0.2)` : 'rgba(255,255,255,0.07)',
                          border: `1px solid ${isActive ? 'rgba(14,165,233,0.5)' : 'rgba(255,255,255,0.15)'}`,
                          borderRadius: 6, color: isActive ? ACCENT : '#94a3b8',
                          padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        {isActive ? 'CANCEL' : 'PICK'}
                      </button>
                      {selected && (
                        <button
                          onClick={() => { if (role === 'from') setFromObj(null); else setToObj(null); setPath(null); }}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}
                        >✕</button>
                      )}
                    </div>

                    {/* Object picker dropdown */}
                    {isActive && (
                      <div style={{ marginTop: 6, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                        <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <input
                            value={objFilter}
                            onChange={e => setObjFilter(e.target.value)}
                            placeholder="Filter objects…"
                            autoFocus
                            style={{ width: '100%', background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
                          />
                        </div>
                        {filteredObjects.length === 0 && (
                          <div style={{ padding: '8px 12px', color: '#475569', fontSize: 11 }}>No objects found.</div>
                        )}
                        {filteredObjects.slice(0, 30).map((obj, i) => {
                          const id = obj.id || obj.object_id || i;
                          const label = obj.label || obj.title || obj.name || id;
                          const type = obj.type || obj.type_id || '';
                          return (
                            <div
                              key={id}
                              onClick={() => selectObj(obj)}
                              style={{ ...ROW, display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              {type && (
                                <span style={{ ...PILL, background: 'rgba(14,165,233,0.12)', color: ACCENT, border: `1px solid rgba(14,165,233,0.25)`, fontSize: 10 }}>
                                  {type}
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Find button */}
              <button
                onClick={findPath}
                disabled={finding || !fromObj || !toObj}
                style={{
                  width: '100%', padding: '7px 0', borderRadius: 7,
                  background: fromObj && toObj ? `rgba(14,165,233,0.2)` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${fromObj && toObj ? 'rgba(14,165,233,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: fromObj && toObj ? ACCENT : '#475569',
                  fontWeight: 700, fontSize: 12, cursor: fromObj && toObj ? 'pointer' : 'default',
                  letterSpacing: 1, marginBottom: 14,
                }}
              >
                {finding ? 'FINDING PATH…' : '▶ FIND SHORTEST PATH'}
              </button>

              {/* Path result */}
              {path && !finding && (
                <div>
                  {pathFound ? (
                    <>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, letterSpacing: 1 }}>
                        PATH FOUND — {pathNodes.length} NODES · {pathNodes.length - 1} HOPS
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                        {pathNodes.map((node, i) => {
                          const label = node.label || node.title || node.name || node.id || `node-${i}`;
                          const type = node.type || node.type_id || '';
                          const isEnd = i === 0 || i === pathNodes.length - 1;
                          return (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{
                                ...PILL,
                                background: isEnd ? `rgba(14,165,233,0.2)` : 'rgba(255,255,255,0.07)',
                                color: isEnd ? ACCENT : '#e2e8f0',
                                border: `1px solid ${isEnd ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.12)'}`,
                                fontSize: 11, marginRight: 0,
                              }}>
                                {type ? <span style={{ color: '#7dd3fc', marginRight: 3 }}>[{type}]</span> : null}
                                {label}
                              </span>
                              {i < pathNodes.length - 1 && (
                                <span style={{ color: '#334155', fontSize: 11 }}>→</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '10px 0', color: '#f59e0b', fontSize: 12 }}>
                      No path found between these two objects in the current graph.
                    </div>
                  )}
                </div>
              )}

              {!path && !finding && fromObj && toObj && (
                <div style={{ color: '#475569', fontSize: 11 }}>Press FIND SHORTEST PATH to trace the knowledge-graph route.</div>
              )}
              {!path && !finding && (!fromObj || !toObj) && (
                <div style={{ color: '#334155', fontSize: 11 }}>Select FROM and TO objects to find the shortest knowledge-graph path between them.</div>
              )}
            </div>
          )}

          {/* ── CENTRALITY tab ── */}
          {tab === 'CENTRALITY' && (
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10, letterSpacing: 1 }}>
                TOP CENTRAL NODES — click ◀ FROM or TO ▶ to set as path endpoint
              </div>
              {centrality.length === 0 && (
                <div style={{ color: '#475569', fontSize: 12 }}>No centrality data available.</div>
              )}
              {centrality.map((node, i) => {
                const id = node.id || node.node_id || i;
                const label = node.label || node.id || `node-${i}`;
                const type = node.type || '';
                const score = node.centrality || node.score || node.degree || 0;
                const maxScore = centrality[0]?.centrality || centrality[0]?.score || 1;
                const pct = Math.min(100, Math.round(((typeof score === 'number' ? score : 0) / (typeof maxScore === 'number' ? maxScore : 1)) * 100));
                return (
                  <div key={id} style={{ ...ROW, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#475569', fontSize: 10, minWidth: 18 }}>#{i + 1}</span>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {type && (
                          <span style={{ ...PILL, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)', fontSize: 10, marginRight: 0 }}>
                            {type}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                        <span style={{ fontSize: 10, color: '#60a5fa', marginLeft: 'auto', flexShrink: 0 }}>
                          {typeof score === 'number' ? score.toFixed(3) : score}
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: ACCENT, borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => useCentralNode(node, 'from')}
                        title="Set as FROM"
                        style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 5, color: ACCENT, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
                      >◀ FROM</button>
                      <button
                        onClick={() => useCentralNode(node, 'to')}
                        title="Set as TO"
                        style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 5, color: ACCENT, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
                      >TO ▶</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {objects.length} objects · {centrality.length} central nodes · GET /v1/graph/path · /v1/ontology/objects · /v1/graph/centrality
          </div>
        </div>
      )}
    </>
  );
}
