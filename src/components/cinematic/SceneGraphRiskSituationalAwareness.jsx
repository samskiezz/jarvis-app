/**
 * SceneGraphRiskSituationalAwareness — F93
 *
 * Fetches all 10 cinematic scenes (/v1/cinematic/scene/{1..10}) +
 * /v1/graph/centrality + /entities/RiskSignal.
 *
 * Keyword-matches each scene's title/description/anchors against
 * graph centrality node labels AND risk signal names/categories to classify:
 *   AWARE    — scene matched both a graph node AND a risk signal (fully situated)
 *   TRACED   — scene matched a graph node only (graph-present, no threat coverage)
 *   SIGNALED — scene matched a risk signal only (threat-flagged, not in graph)
 *   BLIND    — no match (scene with no intelligence grounding — operational blind spot)
 *
 * Toggle: ◈ SGRSAW button (fixed, bottom strip) left:100440, zIndex:190
 * Stat tiles: scenes / graph nodes / signals / aware / traced / signaled / blind
 * Red pulse on BLIND count (operational blind spots).
 * Expandable rows: matched graph nodes with centrality score badge +
 *                  matched risk signals with severity badge.
 * Filter tabs: ALL / AWARE / TRACED / SIGNALED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sgrsaw"/"scene graph risk"/"situational awareness"/"scene risk"
 *        "scene blind spot"/"scene threat"/"scene intelligence"/"scene risk coverage"
 *        "scene situational"/"strategic awareness"/"blind scenes"/"scene grounding"
 * Event: jarvis:sgrsaw-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TABS = ['ALL', 'AWARE', 'TRACED', 'SIGNALED', 'BLIND'];

const CLS_COLOR = {
  AWARE:    '#22C55E',
  TRACED:   '#38BDF8',
  SIGNALED: '#F59E0B',
  BLIND:    '#EF4444',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function anchorsText(scene) {
  const anchors = scene?.anchors || scene?.anchor_data || scene?.data || {};
  if (typeof anchors === 'string') return anchors;
  if (Array.isArray(anchors)) return anchors.map(a => JSON.stringify(a)).join(' ');
  return Object.entries(anchors).map(([k, v]) => `${k} ${v}`).join(' ');
}

export function isSgrsawQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sgrsaw', 'scene graph risk', 'situational awareness', 'scene risk',
    'scene blind spot', 'scene threat', 'scene intelligence', 'scene risk coverage',
    'scene situational', 'strategic awareness', 'blind scenes', 'scene grounding',
  ].some(k => s.includes(k));
}

export function buildSgrsawScript() {
  return (
    'Fetch all 10 cinematic scenes from /v1/cinematic/scene/{1..10}, /v1/graph/centrality, and /entities/RiskSignal. ' +
    'Keyword-match each scene (title, description, anchor labels) against graph centrality node labels AND risk signal names/categories. ' +
    'Classify each scene as AWARE/TRACED/SIGNALED/BLIND. ' +
    'Report total BLIND count (scenes with no graph trace and no risk signal — operational blind spots), ' +
    'identify which blind scenes represent the greatest strategic exposure, ' +
    'and recommend graph node tagging or risk signal creation to improve situational coverage.'
  );
}

export default function SceneGraphRiskSituationalAwareness() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    scenes: 0, nodes: 0, signals: 0,
    aware: 0, traced: 0, signaled: 0, blind: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [scenesRaw, grRaw, rsRaw] = await Promise.all([
        Promise.all(
          SCENE_IDS.map(id =>
            fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdrs })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        ),
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/RiskSignal`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const scenes  = scenesRaw.map((raw, i) => raw ? { ...raw, _sceneId: SCENE_IDS[i] } : { _sceneId: SCENE_IDS[i] });
      const nodes   = normalizeArray(grRaw, ['items', 'nodes', 'results', 'data', 'entities']);
      const signals = normalizeArray(rsRaw, ['items', 'signals', 'results', 'data', 'entities']);

      const built = scenes.map(scene => {
        const sceneText = [
          scene.title, scene.name, scene.description, scene.theme, scene.subtitle,
          anchorsText(scene),
        ].filter(Boolean).join(' ');
        const scToks = tokens(sceneText);

        const matchedNodes = nodes.filter(nd => {
          const s = [nd.label, nd.name, nd.title, nd.type, nd.description, nd.id]
            .filter(Boolean).join(' ');
          return overlaps(scToks, s);
        });

        const matchedSignals = signals.filter(sig => {
          const s = [sig.name, sig.title, sig.category, sig.type, sig.description, sig.signal]
            .filter(Boolean).join(' ');
          return overlaps(scToks, s);
        });

        const hasNode   = matchedNodes.length > 0;
        const hasSignal = matchedSignals.length > 0;
        let cls;
        if (hasNode && hasSignal) cls = 'AWARE';
        else if (hasNode)         cls = 'TRACED';
        else if (hasSignal)       cls = 'SIGNALED';
        else                      cls = 'BLIND';

        return {
          id:            `scene-${scene._sceneId}`,
          sceneId:       scene._sceneId,
          name:          scene.title || scene.name || `Scene ${scene._sceneId}`,
          theme:         scene.theme || scene.subtitle || '',
          cls,
          matchedNodes,
          matchedSignals,
        };
      });

      const aware    = built.filter(r => r.cls === 'AWARE').length;
      const traced   = built.filter(r => r.cls === 'TRACED').length;
      const signaled = built.filter(r => r.cls === 'SIGNALED').length;
      const blind    = built.filter(r => r.cls === 'BLIND').length;

      setRows(built);
      setCounts({ scenes: built.length, nodes: nodes.length, signals: signals.length, aware, traced, signaled, blind });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sgrsaw-toggle', handler);
    return () => window.removeEventListener('jarvis:sgrsaw-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildSgrsawScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.blind > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#EF4444' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s)
        || r.theme.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 100440, zIndex: 190,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #EF4444',
          color: '#EF4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SGRSAW{counts.blind > 0 ? <span style={pulse}> {counts.blind}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 680, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #EF4444',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(239,68,68,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#EF4444', fontSize: 13, fontWeight: 'bold' }}>
            ◈ SGRSAW — Scene × Graph × Risk Situational Awareness
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
          >✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SCENES',   val: counts.scenes },
            { label: 'NODES',    val: counts.nodes },
            { label: 'SIGNALS',  val: counts.signals },
            { label: 'AWARE',    val: counts.aware,    color: '#22C55E' },
            { label: 'TRACED',   val: counts.traced,   color: '#38BDF8' },
            { label: 'SIGNALED', val: counts.signaled, color: '#F59E0B' },
            { label: 'BLIND',    val: counts.blind,    color: '#EF4444', doPulse: counts.blind > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.05)', borderRadius: 6,
              padding: '6px 12px', textAlign: 'center', minWidth: 72,
            }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: t.color || '#ccc', ...(t.doPulse ? pulse : {}) }}>
                {t.val}
              </div>
              <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${tab === t ? '#EF4444' : '#333'}`,
              color: tab === t ? '#EF4444' : '#aaa', padding: '3px 10px',
              borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', padding: '3px 8px',
              borderRadius: 4, fontSize: 11, marginLeft: 4,
            }}
          />
        </div>

        {/* Assess */}
        <div style={{ padding: '0 14px 10px' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: 'rgba(239,68,68,0.2)', border: '1px solid #EF4444',
            color: '#EF4444', padding: '4px 14px', borderRadius: 4,
            cursor: assessing ? 'wait' : 'pointer', fontSize: 11,
          }}>
            {assessing ? '…assessing' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, color: '#ccc', fontSize: 11,
              lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
            }}>
              {assessment}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0 14px 8px', color: '#F87171', fontSize: 11 }}>
            Error: {error}
          </div>
        )}

        {/* Rows */}
        <div style={{ padding: '0 14px 14px' }}>
          {loading && !rows.length && (
            <div style={{ color: '#888', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Loading…</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(ex => ({ ...ex, [row.id]: !ex[row.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}
              >
                <span style={{ color: '#888', fontSize: 10, minWidth: 48 }}>
                  S{row.sceneId}
                </span>
                <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 'bold', minWidth: 70 }}>
                  {row.cls}
                </span>
                <span style={{ color: '#eee', fontSize: 12, flex: 1 }}>{row.name}</span>
                {row.theme && (
                  <span style={{ color: '#888', fontSize: 10 }}>{row.theme}</span>
                )}
                <span style={{ color: '#555', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingBottom: 8 }}>
                  {/* Matched graph nodes */}
                  {row.matchedNodes.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4 }}>
                        Graph nodes ({row.matchedNodes.length})
                      </div>
                      {row.matchedNodes.slice(0, 5).map((nd, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#ccc', fontSize: 11 }}>
                            {nd.label || nd.name || nd.id || '—'}
                          </span>
                          {nd.centrality != null && (
                            <span style={{
                              background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            }}>
                              centrality:{typeof nd.centrality === 'number' ? nd.centrality.toFixed(3) : nd.centrality}
                            </span>
                          )}
                          {(nd.type || nd.kind) && (
                            <span style={{ color: '#888', fontSize: 9 }}>{nd.type || nd.kind}</span>
                          )}
                        </div>
                      ))}
                      {row.matchedNodes.length > 5 && (
                        <div style={{ color: '#555', fontSize: 10 }}>+{row.matchedNodes.length - 5} more</div>
                      )}
                    </div>
                  )}

                  {/* Matched risk signals */}
                  {row.matchedSignals.length > 0 && (
                    <div>
                      <div style={{ color: '#EF4444', fontSize: 10, marginBottom: 4 }}>
                        Risk signals ({row.matchedSignals.length})
                      </div>
                      {row.matchedSignals.slice(0, 5).map((sig, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#ccc', fontSize: 11 }}>
                            {sig.name || sig.title || sig.signal || '—'}
                          </span>
                          {(sig.severity || sig.level) && (
                            <span style={{
                              background: 'rgba(239,68,68,0.15)', color: '#EF4444',
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            }}>
                              {sig.severity || sig.level}
                            </span>
                          )}
                          {(sig.category || sig.type) && (
                            <span style={{ color: '#888', fontSize: 9 }}>{sig.category || sig.type}</span>
                          )}
                        </div>
                      ))}
                      {row.matchedSignals.length > 5 && (
                        <div style={{ color: '#555', fontSize: 10 }}>+{row.matchedSignals.length - 5} more</div>
                      )}
                    </div>
                  )}

                  {row.matchedNodes.length === 0 && row.matchedSignals.length === 0 && (
                    <div style={{ color: '#555', fontSize: 11 }}>No matching graph nodes or risk signals found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
              No scenes match this filter.
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}`}</style>
    </>
  );
}
