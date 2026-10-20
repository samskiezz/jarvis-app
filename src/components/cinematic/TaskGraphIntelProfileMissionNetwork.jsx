/**
 * TaskGraphIntelProfileMissionNetwork — F69
 *
 * Fetches /entities/Task + /v1/graph/centrality + /entities/IntelProfile
 * Keyword-matches each task against graph centrality nodes AND intel profiles
 * to classify:
 *   NETWORKED — task matched both a graph node AND an intel profile (fully anchored)
 *   PROFILED  — task matched an intel profile only (known but no graph node)
 *   TRACED    — task matched a graph node only (in the graph, no profile)
 *   ORPHAN    — no graph or intel profile match (blind-spot task)
 *
 * Toggle: ◈ TGINET button (fixed, bottom strip) left:87000, zIndex:166
 * Stat tiles: tasks / nodes / profiles / networked / profiled / traced / orphan
 * Amber pulse on ORPHAN count.
 * Expandable rows: matched graph nodes with centrality score + matched intel profiles with category.
 * Filter tabs: ALL / NETWORKED / PROFILED / TRACED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tginet"/"task network"/"task graph"/"task intel profile"/"mission network"/
 *        "orphan tasks"/"task graph intel"/"networked tasks"/"mission intelligence network"/
 *        "task intelligence"/"task profile"/"task centrality"
 * Event: jarvis:tginet-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'NETWORKED', 'PROFILED', 'TRACED', 'ORPHAN'];

const CLS_COLOR = {
  NETWORKED: '#00FF88',
  PROFILED:  '#38BDF8',
  TRACED:    '#A78BFA',
  ORPHAN:    '#FFAA00',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
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

function buildLabel(obj, fields) {
  return fields.map(f => obj?.[f] || '').join(' ');
}

export function isTginetQuery(q) {
  const s = (q || '').toLowerCase();
  return ['tginet','task network','task graph','task intel profile','mission network',
    'orphan tasks','task graph intel','networked tasks','mission intelligence network',
    'task intelligence','task profile','task centrality'].some(k => s.includes(k));
}

export function buildTginetScript() {
  return `Fetch /entities/Task, /v1/graph/centrality, /entities/IntelProfile. ` +
    `Keyword-match each task against graph nodes and intel profiles. ` +
    `Classify as NETWORKED/PROFILED/TRACED/ORPHAN. ` +
    `Report counts, highlight orphan tasks with no graph or intel grounding, and suggest remediation.`;
}

export default function TaskGraphIntelProfileMissionNetwork() {
  const [open, setOpen]         = useState(false);
  const [tasks, setTasks]       = useState([]);
  const [nodes, setNodes]       = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const h = { Authorization: `Bearer ${API_KEY}` };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tRes, gRes, pRes] = await Promise.all([
        fetch(`${API}/entities/Task`, { headers: h }),
        fetch(`${API}/v1/graph/centrality`, { headers: h }),
        fetch(`${API}/entities/IntelProfile`, { headers: h }),
      ]);
      const [tJson, gJson, pJson] = await Promise.all([tRes.json(), gRes.json(), pRes.json()]);

      const rawTasks    = normalizeArray(tJson, ['tasks','items','data','results']);
      const rawNodes    = normalizeArray(gJson, ['nodes','centrality','items','data']);
      const rawProfiles = normalizeArray(pJson, ['profiles','items','data','results']);

      setTasks(rawTasks);
      setNodes(rawNodes);
      setProfiles(rawProfiles);

      const built = rawTasks.map(t => {
        const tLbl  = buildLabel(t, ['name','title','description','type','status','tags']);
        const tToks = tokens(tLbl);

        const matchedNodes = rawNodes.filter(n => {
          const nLbl = buildLabel(n, ['entity','name','label','type','id']);
          return overlaps(tToks, nLbl);
        });
        const matchedProfiles = rawProfiles.filter(p => {
          const pLbl = buildLabel(p, ['name','title','category','subject','alias','tags']);
          return overlaps(tToks, pLbl);
        });

        const hasNode    = matchedNodes.length > 0;
        const hasProfile = matchedProfiles.length > 0;
        const cls = hasNode && hasProfile ? 'NETWORKED'
                  : hasProfile            ? 'PROFILED'
                  : hasNode               ? 'TRACED'
                  :                         'ORPHAN';
        return { ...t, _cls: cls, _nodes: matchedNodes, _profiles: matchedProfiles };
      });
      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:tginet-toggle', handler);
    return () => window.removeEventListener('jarvis:tginet-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    NETWORKED: rows.filter(r => r._cls === 'NETWORKED').length,
    PROFILED:  rows.filter(r => r._cls === 'PROFILED').length,
    TRACED:    rows.filter(r => r._cls === 'TRACED').length,
    ORPHAN:    rows.filter(r => r._cls === 'ORPHAN').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const lbl = buildLabel(r, ['name','title','description','type','status']).toLowerCase();
      if (!lbl.includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const script = buildTginetScript() +
        ` Current counts: tasks=${rows.length}, networked=${counts.NETWORKED}, profiled=${counts.PROFILED}, traced=${counts.TRACED}, orphan=${counts.ORPHAN}.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: script }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.text || JSON.stringify(j);
      if (window.__jarvisSpeak) window.__jarvisSpeak(text.slice(0, 400));
    } catch (e) {
      console.error('TGINET assess error', e);
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 87000, zIndex: 166,
          background: 'rgba(0,20,40,0.85)', border: '1px solid #00FF88',
          color: '#00FF88', fontFamily: 'monospace', fontSize: 10,
          padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
        }}
        title="Task × Graph × IntelProfile Mission Network"
      >◈ TGINET</button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 54, right: 18, width: 680, maxHeight: '82vh',
      background: 'rgba(0,10,25,0.97)', border: '1px solid #00FF88',
      borderRadius: 8, zIndex: 9100, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#E0F8FF', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        padding: '8px 12px', borderBottom: '1px solid #00FF8844', background: 'rgba(0,255,136,0.07)' }}>
        <span style={{ fontSize: 12, color: '#00FF88', fontWeight: 700 }}>
          ◈ TASK × GRAPH × INTEL PROFILE — MISSION NETWORK
        </span>
        <div style={{ display:'flex', gap: 6 }}>
          <button onClick={assess} disabled={assessing}
            style={{ background:'rgba(0,255,136,0.15)', border:'1px solid #00FF8844',
              color:'#00FF88', fontSize:10, padding:'2px 8px', cursor:'pointer', borderRadius:3 }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
          <button onClick={load} style={{ background:'transparent', border:'none',
            color:'#38BDF8', fontSize:11, cursor:'pointer' }}>⟳</button>
          <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'none',
            color:'#FF4466', fontSize:13, cursor:'pointer' }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:8, padding:'8px 12px', borderBottom:'1px solid #00FF8822' }}>
        {[
          ['TASKS',     rows.length,        '#00FF88'],
          ['NODES',     nodes.length,       '#38BDF8'],
          ['PROFILES',  profiles.length,    '#A78BFA'],
          ['NETWORKED', counts.NETWORKED,   '#00FF88'],
          ['PROFILED',  counts.PROFILED,    '#38BDF8'],
          ['TRACED',    counts.TRACED,      '#A78BFA'],
          ['ORPHAN',    counts.ORPHAN,      '#FFAA00'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex:1, textAlign:'center', background:'rgba(0,0,0,0.3)',
            borderRadius:4, padding:'4px 2px', border:`1px solid ${col}33` }}>
            <div style={{ fontSize:16, fontWeight:700, color: col,
              animation: lbl === 'ORPHAN' && val > 0 ? 'pulse 2s infinite' : 'none' }}>{val}</div>
            <div style={{ fontSize:8, color:'#888', letterSpacing:1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter */}
      <div style={{ display:'flex', gap:6, padding:'6px 12px', alignItems:'center',
        borderBottom:'1px solid #00FF8822' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: tab===t ? 'rgba(0,255,136,0.2)' : 'transparent',
              border: `1px solid ${tab===t ? '#00FF88' : '#333'}`,
              color: tab===t ? '#00FF88' : '#888', fontSize:9, padding:'2px 6px',
              cursor:'pointer', borderRadius:3 }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft:'auto', background:'rgba(0,0,0,0.4)', border:'1px solid #333',
            color:'#E0F8FF', padding:'2px 6px', fontSize:10, borderRadius:3, width:120 }} />
      </div>

      {/* rows */}
      <div style={{ overflowY:'auto', flex:1, padding:'6px 0' }}>
        {loading && <div style={{ textAlign:'center', color:'#38BDF8', padding:16, fontSize:11 }}>Loading…</div>}
        {error   && <div style={{ textAlign:'center', color:'#FF4466', padding:16, fontSize:11 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ textAlign:'center', color:'#555', padding:16, fontSize:11 }}>No tasks match.</div>
        )}
        {visible.map((row, i) => {
          const id = row.id || row._id || i;
          const name = row.name || row.title || `Task ${i+1}`;
          const status = row.status || '';
          const isExp = !!expanded[id];
          return (
            <div key={id} style={{ borderBottom:'1px solid #ffffff08', margin:'0 8px' }}>
              <div onClick={() => toggleRow(id)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 6px',
                  cursor:'pointer', borderRadius:4,
                  background: isExp ? 'rgba(0,255,136,0.05)' : 'transparent' }}>
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3,
                  background: CLS_COLOR[row._cls] + '22', color: CLS_COLOR[row._cls],
                  border: `1px solid ${CLS_COLOR[row._cls]}44`, minWidth:70, textAlign:'center' }}>
                  {row._cls}
                </span>
                <span style={{ flex:1, fontSize:11, color:'#E0F8FF', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                {status && (
                  <span style={{ fontSize:9, color:'#888', background:'rgba(255,255,255,0.06)',
                    padding:'1px 5px', borderRadius:3 }}>{status}</span>
                )}
                <span style={{ fontSize:9, color:'#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding:'4px 12px 8px 12px', fontSize:10, color:'#AAA' }}>
                  {/* matched graph nodes */}
                  {row._nodes.length > 0 && (
                    <div style={{ marginBottom:4 }}>
                      <span style={{ color:'#38BDF8', fontWeight:700 }}>Graph nodes ({row._nodes.length}):</span>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                        {row._nodes.slice(0,8).map((n,j) => (
                          <span key={j} style={{ background:'rgba(56,189,248,0.12)',
                            border:'1px solid #38BDF844', padding:'1px 6px', borderRadius:3, fontSize:9 }}>
                            {n.entity || n.name || n.label || n.id || '?'}
                            {n.score != null && <span style={{ color:'#38BDF8', marginLeft:4 }}>
                              {typeof n.score === 'number' ? n.score.toFixed(3) : n.score}
                            </span>}
                          </span>
                        ))}
                        {row._nodes.length > 8 && <span style={{ fontSize:9, color:'#555' }}>+{row._nodes.length-8}</span>}
                      </div>
                    </div>
                  )}
                  {/* matched intel profiles */}
                  {row._profiles.length > 0 && (
                    <div>
                      <span style={{ color:'#A78BFA', fontWeight:700 }}>Intel profiles ({row._profiles.length}):</span>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                        {row._profiles.slice(0,8).map((p,j) => (
                          <span key={j} style={{ background:'rgba(167,139,250,0.12)',
                            border:'1px solid #A78BFA44', padding:'1px 6px', borderRadius:3, fontSize:9 }}>
                            {p.name || p.title || p.subject || '?'}
                            {(p.category || p.type) && (
                              <span style={{ color:'#A78BFA', marginLeft:4 }}>{p.category || p.type}</span>
                            )}
                          </span>
                        ))}
                        {row._profiles.length > 8 && <span style={{ fontSize:9, color:'#555' }}>+{row._profiles.length-8}</span>}
                      </div>
                    </div>
                  )}
                  {row._nodes.length === 0 && row._profiles.length === 0 && (
                    <span style={{ color:'#FFAA00' }}>No graph or intel profile match — orphan task.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </div>
  );
}
