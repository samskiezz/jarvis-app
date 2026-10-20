/**
 * IntelProfileKnowledgeTaskExecutionMap — F70
 *
 * Fetches /entities/IntelProfile + /knowledge/ + /entities/Task
 * Keyword-matches each intel profile against knowledge articles AND tasks
 * to classify:
 *   EXECUTING — profile matched both a knowledge article AND a task (fully grounded)
 *   SCRIPTED  — profile matched a task only (active but undocumented)
 *   KNOWN     — profile matched a knowledge article only (documented but not tasked)
 *   DARK      — no match to either (orphan profile — blind spot)
 *
 * Toggle: ◈ IPKTEX button (fixed, bottom strip) left:87560, zIndex:167
 * Stat tiles: profiles / knowledge / tasks / executing / scripted / known / dark
 * Red pulse on DARK count.
 * Expandable rows: matched knowledge articles with category badge + matched tasks with status badge.
 * Filter tabs: ALL / EXECUTING / SCRIPTED / KNOWN / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ipktex"/"intel execution map"/"intel task knowledge"/"profile execution map"/
 *        "dark profiles"/"intel knowledge task"/"execution map"/"profile darkness"/
 *        "profile gap"/"intel grounding"
 * Event: jarvis:ipktex-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'EXECUTING', 'SCRIPTED', 'KNOWN', 'DARK'];

const CLS_COLOR = {
  EXECUTING: '#00FF88',
  SCRIPTED:  '#38BDF8',
  KNOWN:     '#A78BFA',
  DARK:      '#FF4444',
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

export function isIpktexQuery(q) {
  const s = (q || '').toLowerCase();
  return ['ipktex','intel execution map','intel task knowledge','profile execution map',
    'dark profiles','intel knowledge task','execution map','profile darkness',
    'profile gap','intel grounding'].some(k => s.includes(k));
}

export function buildIpktexScript() {
  return `Fetch /entities/IntelProfile, /knowledge/, /entities/Task. ` +
    `Keyword-match each intel profile against knowledge articles and tasks. ` +
    `Classify as EXECUTING/SCRIPTED/KNOWN/DARK. ` +
    `Report counts, highlight dark profiles with no knowledge or task grounding, and suggest remediation.`;
}

export default function IntelProfileKnowledgeTaskExecutionMap() {
  const [open, setOpen]         = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [articles, setArticles] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, kRes, tRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers }),
        fetch(`${API}/knowledge/`,            { headers }),
        fetch(`${API}/entities/Task`,         { headers }),
      ]);
      const [pRaw, kRaw, tRaw] = await Promise.all([
        pRes.ok ? pRes.json() : {},
        kRes.ok ? kRes.json() : {},
        tRes.ok ? tRes.json() : {},
      ]);
      const ps = normalizeArray(pRaw, ['profiles','items','results','data']);
      const ks = normalizeArray(kRaw, ['articles','items','results','data']);
      const ts = normalizeArray(tRaw, ['tasks','items','results','data']);
      setProfiles(ps);
      setArticles(ks);
      setTasks(ts);

      const built = ps.map(p => {
        const label = [p.name, p.title, p.subject, p.category, p.description].join(' ');
        const ptoks = tokens(label);
        const matchedArticles = ks.filter(k =>
          overlaps(ptoks, [k.title, k.content, k.summary, k.category, k.topic].join(' '))
        );
        const matchedTasks = ts.filter(t =>
          overlaps(ptoks, [t.name, t.title, t.description, t.type, t.tags].join(' '))
        );
        let cls;
        if (matchedArticles.length > 0 && matchedTasks.length > 0) cls = 'EXECUTING';
        else if (matchedTasks.length > 0)                           cls = 'SCRIPTED';
        else if (matchedArticles.length > 0)                        cls = 'KNOWN';
        else                                                         cls = 'DARK';
        return { ...p, _cls: cls, _articles: matchedArticles, _tasks: matchedTasks };
      });
      setRows(built);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ipktex-toggle', toggle);
    return () => window.removeEventListener('jarvis:ipktex-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildIpktexScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.answer || '';
      if (text && window._jarvisTTS) window._jarvisTTS(text);
    } catch {/* silent */}
    setAssessing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Knowledge × Task Execution Map"
        style={{
          position:'fixed', bottom:8, left:87560, zIndex:167,
          background:'rgba(0,20,0,0.85)', border:'1px solid #00FF8866',
          color:'#00FF88', padding:'3px 8px', fontSize:9, borderRadius:3,
          cursor:'pointer', fontFamily:'monospace', whiteSpace:'nowrap',
        }}
      >
        ◈ IPKTEX
      </button>
    );
  }

  const counts = { EXECUTING:0, SCRIPTED:0, KNOWN:0, DARK:0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = [r.name, r.title, r.subject, r.category].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{
      position:'fixed', bottom:50, right:20, zIndex:9167,
      width:560, maxHeight:'78vh', overflow:'auto',
      background:'rgba(0,8,0,0.97)', border:'1px solid #00FF8833',
      borderRadius:8, padding:14, fontFamily:'monospace', fontSize:11, color:'#ccc',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ color:'#00FF88', fontWeight:700, fontSize:12 }}>
          ◈ INTEL PROFILE × KNOWLEDGE × TASK — EXECUTION MAP
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background:'none', border:'none', color:'#FF4444', cursor:'pointer', fontSize:14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {[
          ['PROFILES', profiles.length, '#00FF88'],
          ['KNOWLEDGE', articles.length, '#A78BFA'],
          ['TASKS', tasks.length, '#38BDF8'],
          ['EXECUTING', counts.EXECUTING, '#00FF88'],
          ['SCRIPTED', counts.SCRIPTED, '#38BDF8'],
          ['KNOWN', counts.KNOWN, '#A78BFA'],
          ['DARK', counts.DARK, '#FF4444'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background:'rgba(0,20,0,0.6)', border:`1px solid ${color}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:64,
            animation: label === 'DARK' && counts.DARK > 0 ? 'pulse 1.4s ease-in-out infinite' : undefined,
          }}>
            <div style={{ color, fontWeight:700, fontSize:13 }}>{val}</div>
            <div style={{ color:'#555', fontSize:8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#00FF8822' : 'transparent',
            border: `1px solid ${tab === t ? '#00FF88' : '#333'}`,
            color: tab === t ? '#00FF88' : '#666',
            padding:'2px 8px', borderRadius:3, cursor:'pointer', fontSize:9,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{
            marginLeft:'auto', background:'rgba(0,20,0,0.6)', border:'1px solid #333',
            color:'#ccc', padding:'2px 8px', borderRadius:3, fontSize:9, width:140,
          }}
        />
      </div>

      {/* assess */}
      <button onClick={assess} disabled={assessing} style={{
        background:'rgba(0,40,0,0.8)', border:'1px solid #00FF8866',
        color:'#00FF88', padding:'3px 12px', borderRadius:3, cursor:'pointer',
        fontSize:9, marginBottom:10,
      }}>
        {assessing ? '…' : '▶ ASSESS'}
      </button>

      {loading && <div style={{ color:'#555', marginBottom:6 }}>loading…</div>}
      {error   && <div style={{ color:'#FF4444', marginBottom:6 }}>Error: {error}</div>}

      {/* rows */}
      {visible.map((row, i) => (
        <div key={i} style={{
          borderBottom:'1px solid #111', paddingBottom:6, marginBottom:6,
        }}>
          <div
            onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
            style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
          >
            <span style={{
              color: CLS_COLOR[row._cls],
              background:`${CLS_COLOR[row._cls]}18`,
              border:`1px solid ${CLS_COLOR[row._cls]}44`,
              padding:'1px 6px', borderRadius:3, fontSize:8, fontWeight:700, minWidth:64,
            }}>{row._cls}</span>
            <span style={{ color:'#ddd', flex:1 }}>
              {row.name || row.title || row.subject || row.id || '?'}
            </span>
            {(row.category || row.type) && (
              <span style={{ color:'#555', fontSize:8 }}>{row.category || row.type}</span>
            )}
            <span style={{ color:'#444', fontSize:8 }}>
              K:{row._articles.length} T:{row._tasks.length}
            </span>
            <span style={{ color:'#444' }}>{expanded[i] ? '▲' : '▼'}</span>
          </div>

          {expanded[i] && (
            <div style={{ paddingLeft:12, marginTop:6, display:'flex', flexDirection:'column', gap:6 }}>
              {row._articles.length > 0 && (
                <div>
                  <span style={{ color:'#A78BFA', fontWeight:700 }}>Knowledge ({row._articles.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._articles.slice(0, 8).map((a, j) => (
                      <span key={j} style={{
                        background:'rgba(167,139,250,0.12)', border:'1px solid #A78BFA44',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {a.title || a.name || '?'}
                        {(a.category || a.topic) && (
                          <span style={{ color:'#A78BFA', marginLeft:4 }}>{a.category || a.topic}</span>
                        )}
                      </span>
                    ))}
                    {row._articles.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._articles.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {row._tasks.length > 0 && (
                <div>
                  <span style={{ color:'#38BDF8', fontWeight:700 }}>Tasks ({row._tasks.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._tasks.slice(0, 8).map((t, j) => (
                      <span key={j} style={{
                        background:'rgba(56,189,248,0.12)', border:'1px solid #38BDF844',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {t.name || t.title || t.id || '?'}
                        {(t.status || t.type) && (
                          <span style={{ color:'#38BDF8', marginLeft:4 }}>{t.status || t.type}</span>
                        )}
                      </span>
                    ))}
                    {row._tasks.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._tasks.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {row._articles.length === 0 && row._tasks.length === 0 && (
                <span style={{ color:'#FF4444' }}>No knowledge or task match — dark profile (blind spot).</span>
              )}
            </div>
          )}
        </div>
      ))}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
      `}</style>
    </div>
  );
}
