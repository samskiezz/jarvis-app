/**
 * SwarmScenarioKnowledgeReadiness — F71
 *
 * Fetches /entities/SwarmJob + /v1/scenario/list + /knowledge/
 * Keyword-matches each SwarmJob against scenarios AND knowledge articles
 * to classify:
 *   READY       — matched both a scenario AND a knowledge article (fully supported)
 *   OPERATIONAL — matched a scenario only (active but undocumented)
 *   PLANNED     — matched a knowledge article only (documented but not scripted)
 *   BLIND       — no match to either (unsupported automation blind spot)
 *
 * Toggle: ◈ SWSKRDY button (fixed, bottom strip) left:88120, zIndex:168
 * Stat tiles: jobs / scenarios / knowledge / ready / operational / planned / blind
 * Amber pulse on BLIND count.
 * Expandable rows: matched scenarios with status badge + matched knowledge articles with category badge.
 * Filter tabs: ALL / READY / OPERATIONAL / PLANNED / BLIND + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swskrdy"/"swarm readiness"/"swarm scenario knowledge"/"swarm tactical"/
 *        "tactical readiness"/"blind swarms"/"swarm blind"/"swarm knowledge"/"swarm scenario"
 * Event: jarvis:swskrdy-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'READY', 'OPERATIONAL', 'PLANNED', 'BLIND'];

const CLS_COLOR = {
  READY:       '#00FF88',
  OPERATIONAL: '#38BDF8',
  PLANNED:     '#A78BFA',
  BLIND:       '#FBBF24',
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

export function isSwskrdyQuery(q) {
  const s = (q || '').toLowerCase();
  return ['swskrdy','swarm readiness','swarm scenario knowledge','swarm tactical',
    'tactical readiness','blind swarms','swarm blind','swarm knowledge',
    'swarm scenario','swarm support'].some(k => s.includes(k));
}

export function buildSwskrdyScript() {
  return `Fetch /entities/SwarmJob, /v1/scenario/list, /knowledge/. ` +
    `Keyword-match each swarm job against scenarios and knowledge articles. ` +
    `Classify as READY/OPERATIONAL/PLANNED/BLIND. ` +
    `Report counts, highlight blind swarm jobs with no scenario or knowledge support, and suggest remediation.`;
}

export default function SwarmScenarioKnowledgeReadiness() {
  const [open, setOpen]         = useState(false);
  const [jobs, setJobs]         = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles] = useState([]);
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
      const [jRes, sRes, kRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`,    { headers }),
        fetch(`${API}/v1/scenario/list`,     { headers }),
        fetch(`${API}/knowledge/`,           { headers }),
      ]);
      const [jRaw, sRaw, kRaw] = await Promise.all([
        jRes.ok ? jRes.json() : {},
        sRes.ok ? sRes.json() : {},
        kRes.ok ? kRes.json() : {},
      ]);
      const js = normalizeArray(jRaw, ['jobs','items','results','data']);
      const ss = normalizeArray(sRaw, ['scenarios','items','results','data']);
      const ks = normalizeArray(kRaw, ['articles','items','results','data']);
      setJobs(js);
      setScenarios(ss);
      setArticles(ks);

      const built = js.map(j => {
        const label = [j.name, j.title, j.type, j.description, j.tags].join(' ');
        const jtoks = tokens(label);
        const matchedScenarios = ss.filter(sc =>
          overlaps(jtoks, [sc.name, sc.title, sc.description, sc.type, sc.tags].join(' '))
        );
        const matchedArticles = ks.filter(k =>
          overlaps(jtoks, [k.title, k.content, k.summary, k.category, k.topic].join(' '))
        );
        let cls;
        if (matchedScenarios.length > 0 && matchedArticles.length > 0) cls = 'READY';
        else if (matchedScenarios.length > 0)                           cls = 'OPERATIONAL';
        else if (matchedArticles.length > 0)                            cls = 'PLANNED';
        else                                                             cls = 'BLIND';
        return { ...j, _cls: cls, _scenarios: matchedScenarios, _articles: matchedArticles };
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
    window.addEventListener('jarvis:swskrdy-toggle', toggle);
    return () => window.removeEventListener('jarvis:swskrdy-toggle', toggle);
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
      const script = buildSwskrdyScript();
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
        title="SwarmJob × Scenario × Knowledge Tactical Readiness Index"
        style={{
          position:'fixed', bottom:8, left:88120, zIndex:168,
          background:'rgba(0,20,0,0.85)', border:'1px solid #00FF8866',
          color:'#00FF88', padding:'3px 8px', fontSize:9, borderRadius:3,
          cursor:'pointer', fontFamily:'monospace', whiteSpace:'nowrap',
        }}
      >
        ◈ SWSKRDY
      </button>
    );
  }

  const counts = { READY:0, OPERATIONAL:0, PLANNED:0, BLIND:0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = [r.name, r.title, r.type, r.description].join(' ').toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{
      position:'fixed', bottom:50, right:20, zIndex:9168,
      width:560, maxHeight:'78vh', overflow:'auto',
      background:'rgba(0,8,0,0.97)', border:'1px solid #00FF8833',
      borderRadius:8, padding:14, fontFamily:'monospace', fontSize:11, color:'#ccc',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ color:'#00FF88', fontWeight:700, fontSize:12 }}>
          ◈ SWARM × SCENARIO × KNOWLEDGE — TACTICAL READINESS
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background:'none', border:'none', color:'#FF4444', cursor:'pointer', fontSize:14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {[
          ['JOBS',        jobs.length,           '#00FF88'],
          ['SCENARIOS',   scenarios.length,       '#38BDF8'],
          ['KNOWLEDGE',   articles.length,        '#A78BFA'],
          ['READY',       counts.READY,           '#00FF88'],
          ['OPERATIONAL', counts.OPERATIONAL,     '#38BDF8'],
          ['PLANNED',     counts.PLANNED,         '#A78BFA'],
          ['BLIND',       counts.BLIND,           '#FBBF24'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background:'rgba(0,20,0,0.6)', border:`1px solid ${color}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:64,
            animation: label === 'BLIND' && counts.BLIND > 0 ? 'pulse 1.4s ease-in-out infinite' : undefined,
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
          placeholder="search swarm jobs…"
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
              padding:'1px 6px', borderRadius:3, fontSize:8, fontWeight:700, minWidth:72,
            }}>{row._cls}</span>
            <span style={{ color:'#ddd', flex:1 }}>
              {row.name || row.title || row.id || '?'}
            </span>
            {(row.type || row.status) && (
              <span style={{ color:'#555', fontSize:8 }}>{row.type || row.status}</span>
            )}
            <span style={{ color:'#444', fontSize:8 }}>
              S:{row._scenarios.length} K:{row._articles.length}
            </span>
            <span style={{ color:'#444' }}>{expanded[i] ? '▲' : '▼'}</span>
          </div>

          {expanded[i] && (
            <div style={{ paddingLeft:12, marginTop:6, display:'flex', flexDirection:'column', gap:6 }}>
              {row._scenarios.length > 0 && (
                <div>
                  <span style={{ color:'#38BDF8', fontWeight:700 }}>Scenarios ({row._scenarios.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._scenarios.slice(0, 8).map((sc, j) => (
                      <span key={j} style={{
                        background:'rgba(56,189,248,0.12)', border:'1px solid #38BDF844',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {sc.name || sc.title || sc.id || '?'}
                        {(sc.status || sc.type) && (
                          <span style={{ color:'#38BDF8', marginLeft:4 }}>{sc.status || sc.type}</span>
                        )}
                      </span>
                    ))}
                    {row._scenarios.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._scenarios.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
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
              {row._scenarios.length === 0 && row._articles.length === 0 && (
                <span style={{ color:'#FBBF24' }}>No scenario or knowledge match — blind swarm job (tactical gap).</span>
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
