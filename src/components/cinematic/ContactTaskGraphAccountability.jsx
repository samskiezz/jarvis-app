/**
 * ContactTaskGraphAccountability — F73
 *
 * Fetches /entities/Contact + /entities/Task + /v1/graph/centrality
 * Keyword-matches each contact against tasks AND graph centrality nodes to classify:
 *   ACCOUNTABLE — matched both a task AND a graph node (person with footprint + mission)
 *   TASKED      — matched a task only (active but off the graph)
 *   TRACED      — matched a graph node only (graphed but no assigned task)
 *   GHOST       — no match to either (contact with zero operational footprint)
 *
 * Toggle: ◈ CTGACC button (fixed, bottom strip) left:89240, zIndex:170
 * Stat tiles: contacts / tasks / nodes / accountable / tasked / traced / ghost
 * Amber pulse on GHOST count.
 * Expandable rows: matched tasks with status badge
 *                  + matched graph nodes with centrality score badge.
 * Filter tabs: ALL / ACCOUNTABLE / TASKED / TRACED / GHOST + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "ctgacc"/"contact accountability"/"contact task graph"/"ghost contacts"/
 *        "unaccountable contacts"/"contact mission"/"contact footprint"/
 *        "contact graph task"/"contact tracing"/"accountable contacts"
 * Event: jarvis:ctgacc-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ACCOUNTABLE', 'TASKED', 'TRACED', 'GHOST'];

const CLS_COLOR = {
  ACCOUNTABLE: '#00FF88',
  TASKED:      '#38BDF8',
  TRACED:      '#A78BFA',
  GHOST:       '#FBBF24',
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

export function isCtgaccQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'ctgacc','contact accountability','contact task graph','ghost contacts',
    'unaccountable contacts','contact mission','contact footprint',
    'contact graph task','contact tracing','accountable contacts',
  ].some(k => s.includes(k));
}

export function buildCtgaccScript() {
  return `Fetch /entities/Contact, /entities/Task, /v1/graph/centrality. ` +
    `Keyword-match each contact against tasks AND graph centrality nodes. ` +
    `Classify as ACCOUNTABLE/TASKED/TRACED/GHOST. ` +
    `Report counts, highlight GHOST contacts with zero operational footprint, ` +
    `and suggest which unassigned contacts should be tasked or graphed to close accountability gaps.`;
}

export default function ContactTaskGraphAccountability() {
  const [open, setOpen]           = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [nodes, setNodes]         = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, tRes, gRes] = await Promise.all([
        fetch(`${API}/entities/Contact`,      { headers }),
        fetch(`${API}/entities/Task`,          { headers }),
        fetch(`${API}/v1/graph/centrality`,    { headers }),
      ]);
      const [cRaw, tRaw, gRaw] = await Promise.all([
        cRes.ok ? cRes.json() : {},
        tRes.ok ? tRes.json() : {},
        gRes.ok ? gRes.json() : {},
      ]);
      const cs = normalizeArray(cRaw, ['contacts','items','results','data']);
      const ts = normalizeArray(tRaw, ['tasks','items','results','data']);
      const ns = normalizeArray(gRaw, ['nodes','items','results','data']);
      setContacts(cs);
      setTasks(ts);
      setNodes(ns);

      const built = cs.map(c => {
        const label = [c.name, c.full_name, c.email, c.role, c.organisation, c.org, c.description].join(' ');
        const ctoks = tokens(label);
        const matchedTasks = ts.filter(t =>
          overlaps(ctoks, [t.title, t.description, t.assignee, t.owner, t.contact, t.name].join(' '))
        );
        const matchedNodes = ns.filter(n =>
          overlaps(ctoks, [n.id, n.label, n.name, n.type, n.description].join(' '))
        );
        let cls;
        if (matchedTasks.length > 0 && matchedNodes.length > 0) cls = 'ACCOUNTABLE';
        else if (matchedTasks.length > 0)                        cls = 'TASKED';
        else if (matchedNodes.length > 0)                        cls = 'TRACED';
        else                                                     cls = 'GHOST';
        return { ...c, _cls: cls, _tasks: matchedTasks, _nodes: matchedNodes, _label: label.trim() };
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
    window.addEventListener('jarvis:ctgacc-toggle', toggle);
    return () => window.removeEventListener('jarvis:ctgacc-toggle', toggle);
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
      const script = buildCtgaccScript();
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
        title="Contact × Task × Graph Mission Accountability Audit"
        style={{
          position:'fixed', bottom:8, left:89240, zIndex:170,
          background:'rgba(0,20,0,0.85)', border:'1px solid #00FF8866',
          color:'#00FF88', padding:'3px 8px', fontSize:9, borderRadius:3,
          cursor:'pointer', fontFamily:'monospace', whiteSpace:'nowrap',
        }}
      >
        ◈ CTGACC
      </button>
    );
  }

  const counts = { ACCOUNTABLE:0, TASKED:0, TRACED:0, GHOST:0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r._label.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div style={{
      position:'fixed', bottom:50, right:20, zIndex:9170,
      width:560, maxHeight:'78vh', overflow:'auto',
      background:'rgba(0,8,0,0.97)', border:'1px solid #00FF8833',
      borderRadius:8, padding:14, fontFamily:'monospace', fontSize:11, color:'#ccc',
    }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ color:'#00FF88', fontWeight:700, fontSize:12 }}>
          ◈ CONTACT × TASK × GRAPH — MISSION ACCOUNTABILITY AUDIT
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background:'none', border:'none', color:'#FF4444', cursor:'pointer', fontSize:14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        {[
          ['CONTACTS',     contacts.length, '#00FF88'],
          ['TASKS',        tasks.length,    '#38BDF8'],
          ['NODES',        nodes.length,    '#A78BFA'],
          ['ACCOUNTABLE',  counts.ACCOUNTABLE, '#00FF88'],
          ['TASKED',       counts.TASKED,   '#38BDF8'],
          ['TRACED',       counts.TRACED,   '#A78BFA'],
          ['GHOST',        counts.GHOST,    '#FBBF24'],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background:'rgba(0,20,0,0.6)', border:`1px solid ${color}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:64,
            animation: label === 'GHOST' && counts.GHOST > 0 ? 'pulse 1.4s ease-in-out infinite' : undefined,
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
          placeholder="search contacts…"
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
        <div key={i} style={{ borderBottom:'1px solid #111', paddingBottom:6, marginBottom:6 }}>
          <div
            onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
            style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
          >
            <span style={{
              color: CLS_COLOR[row._cls],
              background:`${CLS_COLOR[row._cls]}18`,
              border:`1px solid ${CLS_COLOR[row._cls]}44`,
              padding:'1px 6px', borderRadius:3, fontSize:8, fontWeight:700, minWidth:82,
            }}>{row._cls}</span>
            <span style={{ color:'#ddd', flex:1 }}>
              {row.name || row.full_name || row.email || row.id || '?'}
            </span>
            {(row.role || row.organisation || row.org) && (
              <span style={{ color:'#666', fontSize:9 }}>
                {[row.role, row.organisation || row.org].filter(Boolean).join(' · ')}
              </span>
            )}
            <span style={{ color:'#444', fontSize:8 }}>
              T:{row._tasks.length} G:{row._nodes.length}
            </span>
            <span style={{ color:'#444' }}>{expanded[i] ? '▲' : '▼'}</span>
          </div>

          {expanded[i] && (
            <div style={{ paddingLeft:12, marginTop:6, display:'flex', flexDirection:'column', gap:6 }}>
              {row._tasks.length > 0 && (
                <div>
                  <span style={{ color:'#38BDF8', fontWeight:700 }}>Tasks ({row._tasks.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._tasks.slice(0, 8).map((t, j) => (
                      <span key={j} style={{
                        background:'rgba(56,189,248,0.12)', border:'1px solid #38BDF844',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {t.title || t.name || t.id || '?'}
                        {t.status && (
                          <span style={{ color:'#38BDF8', marginLeft:4 }}>{t.status}</span>
                        )}
                      </span>
                    ))}
                    {row._tasks.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._tasks.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {row._nodes.length > 0 && (
                <div>
                  <span style={{ color:'#A78BFA', fontWeight:700 }}>Graph Nodes ({row._nodes.length}):</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:3 }}>
                    {row._nodes.slice(0, 8).map((n, j) => (
                      <span key={j} style={{
                        background:'rgba(167,139,250,0.12)', border:'1px solid #A78BFA44',
                        padding:'1px 6px', borderRadius:3, fontSize:9,
                      }}>
                        {n.label || n.name || n.id || '?'}
                        {n.centrality !== undefined && (
                          <span style={{ color:'#A78BFA', marginLeft:4 }}>
                            {typeof n.centrality === 'number' ? n.centrality.toFixed(3) : n.centrality}
                          </span>
                        )}
                      </span>
                    ))}
                    {row._nodes.length > 8 && (
                      <span style={{ fontSize:9, color:'#555' }}>+{row._nodes.length - 8}</span>
                    )}
                  </div>
                </div>
              )}
              {row._tasks.length === 0 && row._nodes.length === 0 && (
                <span style={{ color:'#FBBF24' }}>
                  No task or graph match — contact has zero operational footprint.
                </span>
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
