import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SGNITRI_RE = /\b(sgnitri|skill\s+graph\s+live|skill\s+node\s+live|live\s+skill\s+node|graph\s+skill\s+intel|skill\s+network\s+live)\b/i;

const THRESHOLD = 0.08;

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

function normaliseSkills(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.skills) ? data.skills
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || s.skillId || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Skill',
    description: s.description || s.desc || s.summary || '',
    category: s.category || s.type || s.domain || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function normaliseGraphNodes(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.nodes) ? data.nodes
    : Array.isArray(data.centrality) ? data.centrality
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(n => ({
    id: n.id || n._id || n.nodeId || String(Math.random()),
    name: n.name || n.label || n.entity || n.id || 'Graph Node',
    type: n.type || n.kind || n.entityType || '',
    score: typeof n.score === 'number' ? n.score
      : typeof n.centrality === 'number' ? n.centrality
      : typeof n.weight === 'number' ? n.weight
      : 0,
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags || ''),
    raw: n,
  }));
}

function normaliseLiveIntel(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.events) ? data.events
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.results) ? data.results
    : Array.isArray(data.intel) ? data.intel
    : [];
  return arr.map(e => ({
    id: e.id || e._id || e.eventId || String(Math.random()),
    label: e.label || e.title || e.name || e.type || 'Live Event',
    category: e.category || e.type || e.kind || '',
    region: e.region || e.location || e.area || '',
    summary: e.summary || e.description || e.detail || '',
    raw: e,
  }));
}

function correlate(skills, graphNodes, liveIntel) {
  return skills.map(skill => {
    const toks = tok([skill.name, skill.description, skill.category, skill.tags].join(' '));

    const matchedNodes = graphNodes
      .map(n => {
        const score = Math.max(
          matchScore(toks, n.name),
          matchScore(toks, n.type),
          matchScore(toks, n.tags),
        );
        return { ...n, matchScore: score };
      })
      .filter(n => n.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedEvents = liveIntel
      .map(e => {
        const score = Math.max(
          matchScore(toks, e.label),
          matchScore(toks, e.category),
          matchScore(toks, e.region),
          matchScore(toks, e.summary),
        );
        return { ...e, matchScore: score };
      })
      .filter(e => e.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasNode = matchedNodes.length > 0;
    const hasEvent = matchedEvents.length > 0;

    let state;
    if (hasNode && hasEvent) state = 'FULLY ACTIVE';
    else if (hasNode) state = 'NODE-ALIGNED';
    else if (hasEvent) state = 'LIVE-TRIGGERED';
    else state = 'DORMANT';

    return { skill, matchedNodes, matchedEvents, state };
  });
}

export function isSkillGraphNodeLiveQuery(t) {
  return SGNITRI_RE.test(t || '');
}

export async function buildSkillGraphNodeLiveScript() {
  try {
    const [sRes, gRes, lRes] = await Promise.allSettled([
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : null),
    ]);
    const skills = normaliseSkills(sRes.status === 'fulfilled' ? sRes.value : null);
    const graphNodes = normaliseGraphNodes(gRes.status === 'fulfilled' ? gRes.value : null);
    const liveIntel = normaliseLiveIntel(lRes.status === 'fulfilled' ? lRes.value : null);
    const rows = correlate(skills, graphNodes, liveIntel);
    const fullyActive = rows.filter(r => r.state === 'FULLY ACTIVE').length;
    const nodeAligned = rows.filter(r => r.state === 'NODE-ALIGNED').length;
    const liveTriggered = rows.filter(r => r.state === 'LIVE-TRIGGERED').length;
    const dormant = rows.filter(r => r.state === 'DORMANT').length;
    return `SGNITRI Skill×GraphNode×LiveIntel: ${rows.length} skills analysed. ` +
      `${fullyActive} FULLY ACTIVE (skill+node+live event match), ` +
      `${nodeAligned} NODE-ALIGNED, ${liveTriggered} LIVE-TRIGGERED, ${dormant} DORMANT. ` +
      (fullyActive > 0
        ? `Top active: ${rows.find(r => r.state === 'FULLY ACTIVE')?.skill.name || 'see panel'}.`
        : 'No fully active skills at this time.');
  } catch {
    return 'SGNITRI: data fetch failed.';
  }
}

export default function SkillGraphNodeLiveIntelTriple() {
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
    window.addEventListener('jarvis:sgnitri-toggle', handler);
    return () => window.removeEventListener('jarvis:sgnitri-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sRes, gRes, lRes] = await Promise.allSettled([
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const skills = normaliseSkills(sRes.status === 'fulfilled' ? sRes.value : null);
      const graphNodes = normaliseGraphNodes(gRes.status === 'fulfilled' ? gRes.value : null);
      const liveIntel = normaliseLiveIntel(lRes.status === 'fulfilled' ? lRes.value : null);
      if (!skills.length && !graphNodes.length && !liveIntel.length) {
        setErr('No data returned from Skill, Graph/Centrality, or LiveIntel endpoints.');
      }
      setRows(correlate(skills, graphNodes, liveIntel));
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
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyActive = rows.filter(r => r.state === 'FULLY ACTIVE').length;
  const nodeAligned = rows.filter(r => r.state === 'NODE-ALIGNED').length;
  const liveTriggered = rows.filter(r => r.state === 'LIVE-TRIGGERED').length;
  const dormant = rows.filter(r => r.state === 'DORMANT').length;

  const TABS = ['ALL', 'FULLY ACTIVE', 'NODE-ALIGNED', 'LIVE-TRIGGERED', 'DORMANT'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.skill.name.toLowerCase().includes(q) ||
        r.skill.description.toLowerCase().includes(q) ||
        r.matchedNodes.some(n => n.name.toLowerCase().includes(q)) ||
        r.matchedEvents.some(e => e.label.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Skill "${row.skill.name}" [${row.state}]: ` +
      `graph nodes: ${row.matchedNodes.map(n => n.name).join(', ') || 'none'}. ` +
      `live events: ${row.matchedEvents.map(e => e.label).join(', ') || 'none'}. ` +
      `Category: ${row.skill.category || 'unknown'}. ` +
      `Give a 2-sentence operational readiness brief for this skill in the current network and live context.`;
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
    'FULLY ACTIVE': '#ff4444',
    'NODE-ALIGNED': '#00e5ff',
    'LIVE-TRIGGERED': '#ffbb00',
    'DORMANT': '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 774240,
          bottom: 8,
          zIndex: 411,
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
        ◈ SGNITRI
        {fullyActive > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#ff4444',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {fullyActive}
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
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00e5ff55',
      borderRadius: 8,
      zIndex: 411,
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
          ◈ SKILL × GRAPH NODE × LIVE INTEL
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
          { label: 'FULLY ACTIVE', val: fullyActive, col: '#ff4444' },
          { label: 'NODE-ALIGNED', val: nodeAligned, col: '#00e5ff' },
          { label: 'LIVE-TRIGGERED', val: liveTriggered, col: '#ffbb00' },
          { label: 'DORMANT', val: dormant, col: '#555' },
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

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#00e5ff22' : 'none',
              border: `1px solid ${filter === t ? '#00e5ff' : '#00e5ff33'}`,
              color: filter === t ? '#00e5ff' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
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
            border: '1px solid #00e5ff33',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching skills.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.skill.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.skill.id}
              style={{
                borderBottom: '1px solid #00e5ff0d',
                background: isExp ? 'rgba(0,229,255,0.04)' : 'transparent',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : row.skill.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.skill.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.skill.category && (
                  <span style={{ color: '#ffbb00', fontSize: 9, marginLeft: 4 }}>
                    {row.skill.category}
                  </span>
                )}
                <span style={{ color: '#00e5ff44', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.skill.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.skill.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched graph nodes */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#00e5ff', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        GRAPH NODES ({row.matchedNodes.length})
                      </div>
                      {row.matchedNodes.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No nodes matched.</div>
                      )}
                      {row.matchedNodes.slice(0, 5).map(n => (
                        <div key={n.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8e6ff', fontWeight: 600 }}>{n.name}</span>
                            <span style={{ color: '#00e5ff', fontSize: 10 }}>{(n.matchScore * 100).toFixed(0)}%</span>
                          </div>
                          {n.type && <div style={{ color: '#556', fontSize: 10 }}>{n.type}{n.score ? ` · centrality ${n.score.toFixed ? n.score.toFixed(3) : n.score}` : ''}</div>}
                          <div style={{ height: 3, background: '#001a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(n.matchScore * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #00e5ff, #0088aa)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched live events */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ffbb00', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        LIVE EVENTS ({row.matchedEvents.length})
                      </div>
                      {row.matchedEvents.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No live events matched.</div>
                      )}
                      {row.matchedEvents.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ffe066', fontWeight: 600 }}>{e.label}</span>
                            <span style={{ color: '#ffbb00', fontSize: 10 }}>{(e.matchScore * 100).toFixed(0)}%</span>
                          </div>
                          {(e.category || e.region) && (
                            <div style={{ color: '#556', fontSize: 10 }}>
                              {e.category}{e.region ? ` · ${e.region}` : ''}
                            </div>
                          )}
                          {e.summary && (
                            <div style={{ color: '#444', fontSize: 10, marginTop: 2 }}>
                              {e.summary.slice(0, 80)}{e.summary.length > 80 ? '…' : ''}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#001a2a', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(e.matchScore * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #ffbb00, #cc8800)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 10,
                      background: 'rgba(0,229,255,0.08)',
                      border: '1px solid #00e5ff44',
                      color: '#00e5ff',
                      cursor: assessing ? 'not-allowed' : 'pointer',
                      padding: '4px 14px',
                      borderRadius: 3,
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS →'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
