import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const TABS = ['ALL', 'FULLY_GROUNDED', 'KB_ONLY', 'GRAPH_ONLY', 'THEORETICAL'];
const SCENE_IDS = ['01_command_atrium','02_neural_core','03_threat_theatre','04_mission_ops',
  '05_data_vault','06_comms_hub','07_analytics_bay','08_sovereign_grid','09_deep_research','10_executive_bridge'];

function tokenise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function scoreAgainst(sourceTokens, targetText) {
  const tTokens = new Set(tokenise(targetText));
  return sourceTokens.filter(t => tTokens.has(t)).length;
}

function anchorText(anchor) {
  if (!anchor) return '';
  if (typeof anchor === 'string') return anchor;
  if (typeof anchor === 'object') return Object.values(anchor).map(v => String(v)).join(' ');
  return String(anchor);
}

function classifyScene(sceneTokens, kbArticles, graphNodes) {
  const matchedKb = kbArticles
    .map(a => {
      const s = scoreAgainst(sceneTokens, [a.title, a.content, a.topic, ...(a.tags || [])].filter(Boolean).join(' '));
      return s > 0 ? { ...a, _score: s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const matchedNodes = graphNodes
    .map(n => {
      const s = scoreAgainst(sceneTokens, [n.id, n.label, n.type, n.description].filter(Boolean).join(' '));
      return s > 0 ? { ...n, _score: s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasKb = matchedKb.length > 0;
  const hasGraph = matchedNodes.length > 0;
  let _class;
  if (hasKb && hasGraph) _class = 'FULLY_GROUNDED';
  else if (hasKb) _class = 'KB_ONLY';
  else if (hasGraph) _class = 'GRAPH_ONLY';
  else _class = 'THEORETICAL';

  return { matchedKb, matchedNodes, _class };
}

export function isSkgctQuery(q) {
  return /skgct|scene.{0,20}knowledge.{0,20}graph|scene.{0,20}graph.{0,20}kb|cinematic.{0,20}graph|scene.{0,20}ground|which.{0,20}scenes.{0,20}(have|are).{0,20}(knowledge|grounded|graph)/i.test(q);
}

export function buildSkgctScript() {
  return 'Opening Scene × Knowledge × Graph Centrality intelligence triple. Classifying each cinematic scene by KB coverage and graph influence grounding.';
}

export default function SceneKnowledgeGraphTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [kbRes, graphRes, ...sceneResults] = await Promise.all([
        fetch(`${API}/knowledge/`),
        fetch(`${API}/v1/graph/centrality`),
        ...SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)),
      ]);

      const kbData = kbRes.ok ? await kbRes.json() : {};
      const graphData = graphRes.ok ? await graphRes.json() : {};

      const kbArticles = kbData.items || kbData.articles || kbData.data || [];
      const graphNodes = graphData.nodes || graphData.items || graphData.data || [];

      const classified = SCENE_IDS.map((id, i) => {
        const scene = sceneResults[i];
        const anchors = scene?.anchors || scene?.data || {};
        const title = scene?.title || scene?.name || id.replace(/_/g, ' ').replace(/^\d+ /, '');
        const anchorStr = Object.entries(anchors).map(([k, v]) => `${k} ${anchorText(v)}`).join(' ');
        const sceneTokens = tokenise(`${title} ${anchorStr}`);
        const result = classifyScene(sceneTokens, kbArticles, graphNodes);
        return { id, title, anchors, sceneTokens, ...result };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:skgct-toggle', handler);
    return () => window.removeEventListener('jarvis:skgct-toggle', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      timerRef.current = setInterval(fetchData, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const counts = {
    ALL: rows.length,
    FULLY_GROUNDED: rows.filter(r => r._class === 'FULLY_GROUNDED').length,
    KB_ONLY: rows.filter(r => r._class === 'KB_ONLY').length,
    GRAPH_ONLY: rows.filter(r => r._class === 'GRAPH_ONLY').length,
    THEORETICAL: rows.filter(r => r._class === 'THEORETICAL').length,
  };

  const filtered = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const summary = `Cinematic scene coverage: ${counts.FULLY_GROUNDED} fully grounded (KB + graph), ${counts.KB_ONLY} KB-only, ${counts.GRAPH_ONLY} graph-only, ${counts.THEORETICAL} theoretical (no coverage).`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `JARVIS scene intelligence coverage: ${summary} Provide a 2-sentence brief on the grounding quality of the cinematic intelligence architecture.`,
          stream: false,
        }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || data.content || 'No brief available.';
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const classColor = {
    FULLY_GROUNDED: '#00ff88',
    KB_ONLY: '#00bfff',
    GRAPH_ONLY: '#ffd700',
    THEORETICAL: '#ff6600',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 8280, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.85)', border: '1px solid #a855f7',
          color: '#a855f7', padding: '6px 14px', borderRadius: 6,
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        ◈ SKGCT
        {counts.THEORETICAL > 0 && (
          <span style={{ background: '#a855f7', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
            {counts.THEORETICAL}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.93)', zIndex: 9100, display: 'flex',
      flexDirection: 'column', fontFamily: 'monospace', color: '#e0e0e0',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #1a2a3a',
        background: 'rgba(0,10,20,0.95)',
      }}>
        <div>
          <span style={{ color: '#a855f7', fontWeight: 700, fontSize: 16 }}>◈ SKGCT</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 12 }}>
            Scene × Knowledge × Graph Centrality Intelligence Triple
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing || loading}
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', color: '#00ff88', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
          </button>
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            ⟳
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: '1px solid #111', flexWrap: 'wrap' }}>
        {[
          { label: 'SCENES', val: counts.ALL, color: '#a855f7' },
          { label: 'FULLY GROUNDED', val: counts.FULLY_GROUNDED, color: '#00ff88' },
          { label: 'KB ONLY', val: counts.KB_ONLY, color: '#00bfff' },
          { label: 'GRAPH ONLY', val: counts.GRAPH_ONLY, color: '#ffd700' },
          { label: 'THEORETICAL', val: counts.THEORETICAL, color: '#ff6600' },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}44`, borderRadius: 6, padding: '8px 16px', minWidth: 100 }}>
            <div style={{ color: t.color, fontSize: 20, fontWeight: 700 }}>{loading ? '…' : t.val}</div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid #111', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? 'rgba(168,85,247,0.2)' : 'transparent',
              border: `1px solid ${tab === t ? '#a855f7' : '#333'}`,
              color: tab === t ? '#a855f7' : '#888',
              padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>
            {t} {t !== 'ALL' && `(${counts[t] ?? 0})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search scenes…"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid #333',
            color: '#e0e0e0', padding: '4px 10px', borderRadius: 4, fontSize: 11,
            marginLeft: 'auto', width: 200, outline: 'none',
          }}
        />
      </div>

      {brief && (
        <div style={{ padding: '8px 20px', background: 'rgba(0,255,136,0.05)', borderBottom: '1px solid #0a3a0a', color: '#00ff88', fontSize: 12 }}>
          {brief}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
        {loading && <div style={{ color: '#666', padding: 20 }}>Loading scenes, KB, and graph centrality…</div>}
        {err && <div style={{ color: '#ff4444', padding: 20 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: '#555', padding: 20 }}>No scenes match filter.</div>
        )}
        {filtered.map((scene, i) => {
          const isExp = expanded === i;
          const cls = scene._class || 'THEORETICAL';
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ borderBottom: '1px solid #1a1a1a', padding: '10px 0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: (classColor[cls] || '#888') + '22',
                  color: classColor[cls] || '#888',
                  border: `1px solid ${classColor[cls] || '#888'}`,
                  padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  {cls}
                </span>
                <span style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 600 }}>
                  {scene.title || scene.id}
                </span>
                <span style={{ color: '#666', fontSize: 11 }}>· {scene.id}</span>
                <span style={{ marginLeft: 'auto', color: '#444', fontSize: 10 }}>
                  {scene.matchedKb?.length || 0} KB / {scene.matchedNodes?.length || 0} nodes
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop: 10, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {scene.matchedKb?.length > 0 ? (
                    <div>
                      <div style={{ color: '#00bfff', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>MATCHED KB ARTICLES</div>
                      {scene.matchedKb.map((a, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ background: '#00bfff22', color: '#00bfff', border: '1px solid #00bfff', padding: '1px 6px', borderRadius: 8, fontSize: 10, whiteSpace: 'nowrap' }}>
                            {a.topic || 'article'}
                          </span>
                          <span style={{ color: '#ccc', fontSize: 12, flex: 1 }}>{a.title || a.id}</span>
                          <div style={{ width: 80, height: 4, background: '#1a1a2a', borderRadius: 2 }}>
                            <div style={{ width: `${Math.min(100, a._score * 20)}%`, height: '100%', background: '#00bfff', borderRadius: 2 }} />
                          </div>
                          <span style={{ color: '#555', fontSize: 10, width: 24, textAlign: 'right' }}>{a._score}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#444', fontSize: 11 }}>No matching KB articles.</div>
                  )}

                  {scene.matchedNodes?.length > 0 ? (
                    <div>
                      <div style={{ color: '#ffd700', fontSize: 11, marginBottom: 6, fontWeight: 600 }}>MATCHED GRAPH NODES</div>
                      {scene.matchedNodes.map((n, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ background: '#ffd70022', color: '#ffd700', border: '1px solid #ffd700', padding: '1px 6px', borderRadius: 8, fontSize: 10, whiteSpace: 'nowrap' }}>
                            {n.type || 'node'}
                          </span>
                          <span style={{ color: '#ccc', fontSize: 12, flex: 1 }}>{n.label || n.id}</span>
                          <div style={{ width: 80, height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                            <div style={{ width: `${Math.min(100, (n.centrality || n.score || 0) * 100)}%`, height: '100%', background: '#ffd700', borderRadius: 2 }} />
                          </div>
                          <span style={{ color: '#555', fontSize: 10, width: 24, textAlign: 'right' }}>{n._score}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#444', fontSize: 11 }}>No matching graph nodes.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
