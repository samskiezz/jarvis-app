/**
 * SceneKnowledgeTaskMissionReadiness — F80
 *
 * Fetches all 10 cinematic scenes (/v1/cinematic/scene/{1..10}), /knowledge/,
 * and /entities/Task.  Keyword-matches each scene's title/anchors against
 * knowledge articles AND active tasks to classify:
 *   READY   — scene has both knowledge coverage AND active tasks (fully operational)
 *   KNOWN   — scene matched knowledge articles only (documented, no active tasks)
 *   TASKED  — scene matched active tasks only (in progress, no knowledge grounding)
 *   DARK    — no knowledge and no active tasks (mission blind-spot)
 *
 * Toggle: ◈ SKTMRD button (fixed, bottom strip) left:93160, zIndex:177
 * Stat tiles: scenes / knowledge / tasks / ready / known / tasked / dark
 * Amber pulse on DARK count (ungrounded scenes).
 * Expandable rows: matched knowledge articles with category badge + matched tasks with status badge.
 * Filter tabs: ALL / READY / KNOWN / TASKED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sktmrd"/"scene readiness"/"mission readiness"/"scene knowledge"/"scene task"/
 *        "dark scenes"/"ungrounded scenes"/"cinematic readiness"/"scene mission"/"scene coverage"
 * Event: jarvis:sktmrd-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const SCENE_IDS = [1,2,3,4,5,6,7,8,9,10];
const TABS = ['ALL', 'READY', 'KNOWN', 'TASKED', 'DARK'];

const CLS_COLOR = {
  READY:  '#00FF88',
  KNOWN:  '#38BDF8',
  TASKED: '#A78BFA',
  DARK:   '#F59E0B',
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

export function isSktmrdQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sktmrd', 'scene readiness', 'mission readiness', 'scene knowledge',
    'scene task', 'dark scenes', 'ungrounded scenes', 'cinematic readiness',
    'scene mission', 'scene coverage',
  ].some(k => s.includes(k));
}

export function buildSktmrdScript() {
  return `Fetch all 10 cinematic scenes, /knowledge/, and /entities/Task. ` +
    `Keyword-match each scene title and anchors against knowledge articles AND active tasks. ` +
    `Classify each scene as READY/KNOWN/TASKED/DARK. ` +
    `Report total DARK (scenes with no knowledge grounding and no active tasks), ` +
    `identify which scene domains are operational blind-spots, ` +
    `and recommend what knowledge articles or tasks should be created ` +
    `to bring those scenes to READY status.`;
}

export default function SceneKnowledgeTaskMissionReadiness() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]       = useState({ scenes:0, knowledge:0, tasks:0, ready:0, known:0, tasked:0, dark:0 });
  const timerRef                  = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };

      // Fetch all 10 scenes in parallel
      const sceneResults = await Promise.all(
        SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdrs })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      );
      const scenes = sceneResults.filter(Boolean);

      const [kRaw, tRaw] = await Promise.all([
        fetch(`${API}/knowledge/`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Task`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const knowledge = normalizeArray(kRaw, ['items','articles','results','data','knowledge']);
      const tasks     = normalizeArray(tRaw, ['items','tasks','results','data']);

      const built = scenes.map(scene => {
        const sceneText = [
          scene.title, scene.name, scene.id,
          ...(scene.anchors || []).map(a => typeof a === 'string' ? a : (a?.label || a?.title || '')),
          scene.description || '',
        ].join(' ');
        const sToks = tokens(sceneText);

        const matchedKnowledge = knowledge.filter(a => {
          const aStr = [a.title, a.name, a.content, a.summary, a.category, a.tags].filter(Boolean).join(' ');
          return overlaps(sToks, aStr);
        });
        const matchedTasks = tasks.filter(t => {
          const tStr = [t.title, t.name, t.description, t.status, t.tags].filter(Boolean).join(' ');
          return overlaps(sToks, tStr);
        });

        const hasKnowledge = matchedKnowledge.length > 0;
        const hasTasks     = matchedTasks.length > 0;
        const cls = hasKnowledge && hasTasks ? 'READY'
                  : hasKnowledge             ? 'KNOWN'
                  : hasTasks                 ? 'TASKED'
                  :                            'DARK';
        return {
          id:        scene.id || String(scene.scene_id || ''),
          title:     scene.title || scene.name || `Scene ${scene.id}`,
          cls,
          matchedKnowledge,
          matchedTasks,
        };
      });

      const c = { scenes: built.length, knowledge: knowledge.length, tasks: tasks.length,
                  ready:0, known:0, tasked:0, dark:0 };
      built.forEach(r => { c[r.cls.toLowerCase()]++; });
      setRows(built);
      setCounts(c);
    } catch (e) {
      setError(e.message || 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sktmrd-toggle', handler);
    return () => window.removeEventListener('jarvis:sktmrd-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: buildSktmrdScript() }),
      });
      const d = await res.json();
      const text = d?.response || d?.message || d?.content || 'No assessment returned.';
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.title.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', bottom:8, left:93160, zIndex:177,
          background:'rgba(0,10,30,0.85)', border:'1px solid #F59E0B',
          color:'#F59E0B', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="Scene × Knowledge × Task Mission Readiness"
      >
        ◈ SKTMRD
        {counts.dark > 0 && (
          <span style={{ marginLeft:4, color:'#F59E0B', animation:'pulse-amber 1.5s infinite' }}>
            {counts.dark}▲
          </span>
        )}
        <style>{`@keyframes pulse-amber{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9900,
      background:'rgba(0,0,10,0.92)', display:'flex', flexDirection:'column',
      fontFamily:'monospace', color:'#E2E8F0',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px',
                    borderBottom:'1px solid #1e3a5f', background:'rgba(0,5,20,0.95)' }}>
        <span style={{ color:'#F59E0B', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ SKTMRD</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>SCENE × KNOWLEDGE × TASK  MISSION READINESS</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchData} style={{ background:'transparent', border:'1px solid #334155',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ↺ REFRESH
          </button>
          <button onClick={() => setOpen(false)} style={{ background:'transparent', border:'1px solid #475569',
            color:'#94A3B8', padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9 }}>
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display:'flex', gap:8, padding:'8px 16px', flexWrap:'wrap',
                    borderBottom:'1px solid #1e3a5f' }}>
        {[
          { label:'SCENES',   val: counts.scenes,   col:'#94A3B8' },
          { label:'KNOWLEDGE',val: counts.knowledge, col:'#94A3B8' },
          { label:'TASKS',    val: counts.tasks,     col:'#94A3B8' },
          { label:'READY',    val: counts.ready,     col: CLS_COLOR.READY  },
          { label:'KNOWN',    val: counts.known,     col: CLS_COLOR.KNOWN  },
          { label:'TASKED',   val: counts.tasked,    col: CLS_COLOR.TASKED },
          { label:'DARK',     val: counts.dark,      col: CLS_COLOR.DARK   },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:72 }}>
            <div style={{ color: col, fontSize:16, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#64748B', fontSize:8, letterSpacing:1 }}>{label}</div>
          </div>
        ))}

        <button onClick={assess} disabled={assessing} style={{
          marginLeft:'auto', background: assessing ? '#1e3a5f' : 'rgba(245,158,11,0.15)',
          border:'1px solid #F59E0B', color:'#F59E0B', padding:'4px 12px',
          borderRadius:3, cursor: assessing ? 'default' : 'pointer', fontSize:9, letterSpacing:1,
        }}>
          {assessing ? '…ASSESSING' : '▶ ASSESS'}
        </button>
      </div>

      {assessment && (
        <div style={{ margin:'6px 16px', padding:'8px 12px', background:'rgba(245,158,11,0.08)',
          border:'1px solid #F59E0B66', borderRadius:4, fontSize:10, color:'#E2E8F0',
          maxHeight:80, overflowY:'auto' }}>
          {assessment}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display:'flex', gap:4, padding:'6px 16px', alignItems:'center',
                    borderBottom:'1px solid #1e3a5f', flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? `${CLS_COLOR[t] || '#334155'}22` : 'transparent',
            border: `1px solid ${tab===t ? (CLS_COLOR[t]||'#334155') : '#334155'}`,
            color: tab===t ? (CLS_COLOR[t]||'#E2E8F0') : '#64748B',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9, letterSpacing:1,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No scenes match the current filter.</div>
        )}
        {visible.map(r => {
          const isExp = !!expanded[r.id];
          return (
            <div key={r.id} style={{ marginBottom:3 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px',
                  background:'rgba(0,10,30,0.6)', border:`1px solid ${CLS_COLOR[r.cls]}33`,
                  borderRadius: isExp ? '4px 4px 0 0' : 4, cursor:'pointer' }}
              >
                <span style={{ fontSize:9, padding:'1px 6px', borderRadius:2,
                  background:`${CLS_COLOR[r.cls]}22`, color: CLS_COLOR[r.cls], letterSpacing:1 }}>
                  {r.cls}
                </span>
                <span style={{ color:'#E2E8F0', fontSize:10, flex:1 }}>{r.title}</span>
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedKnowledge.length}K · {r.matchedTasks.length}T
                </span>
                <span style={{ color:'#475569', fontSize:9 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background:'rgba(0,10,30,0.7)', border:`1px solid ${CLS_COLOR[r.cls]}22`,
                  borderRadius:'0 0 4px 4px', padding:'8px 12px', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#38BDF8', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED KNOWLEDGE
                    </div>
                    {r.matchedKnowledge.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedKnowledge.map((a, ai) => (
                        <div key={ai} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {a.title || a.name || a.id || '(article)'}
                          </span>
                          {(a.category || a.type) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {a.category || a.type}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#A78BFA', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED TASKS
                    </div>
                    {r.matchedTasks.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedTasks.map((t, ti) => (
                        <div key={ti} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {t.title || t.name || t.id || '(task)'}
                          </span>
                          {t.status && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#A78BFA33', color:'#A78BFA' }}>
                              {t.status}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-amber {
          0%,100% { opacity:1; }
          50% { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}
