/**
 * SwarmContactGraphOperationalNetwork — F84
 *
 * Fetches /entities/SwarmJob + /entities/Contact + /v1/graph/centrality.
 * Keyword-matches each swarm job against contact names/orgs AND graph node labels to classify:
 *   NETWORKED — job has both a matched contact AND a matched graph node (fully wired)
 *   CONNECTED — job matched contacts only (human link, no graph trace)
 *   TRACED    — job matched graph nodes only (graph trace, no human link)
 *   ISOLATED  — no contact and no graph match (operational blind spot)
 *
 * Toggle: ◈ SCGNET button (fixed, bottom strip) left:95400, zIndex:181
 * Stat tiles: jobs / contacts / nodes / networked / connected / traced / isolated
 * Red pulse on ISOLATED count.
 * Expandable rows: matched contacts with role/org + matched graph nodes with centrality score badge.
 * Filter tabs: ALL / NETWORKED / CONNECTED / TRACED / ISOLATED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "scgnet"/"swarm network"/"swarm contact graph"/"operational network"/"swarm contact"/
 *        "isolated swarm"/"swarm graph"/"swarm operational"/"contact swarm graph"
 * Event: jarvis:scgnet-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'NETWORKED', 'CONNECTED', 'TRACED', 'ISOLATED'];

const CLS_COLOR = {
  NETWORKED: '#22C55E',
  CONNECTED: '#38BDF8',
  TRACED:    '#A78BFA',
  ISOLATED:  '#EF4444',
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

export function isScgnetQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'scgnet', 'swarm network', 'swarm contact graph', 'operational network',
    'swarm contact', 'isolated swarm', 'swarm graph', 'swarm operational',
    'contact swarm graph',
  ].some(k => s.includes(k));
}

export function buildScgnetScript() {
  return `Fetch /entities/SwarmJob, /entities/Contact, and /v1/graph/centrality. ` +
    `Keyword-match each swarm job title/description against contact names and orgs AND graph node labels. ` +
    `Classify each swarm job as NETWORKED/CONNECTED/TRACED/ISOLATED. ` +
    `Report total ISOLATED count (swarm jobs with no contact owner and no graph trace — operational blind spots), ` +
    `identify which ISOLATED jobs are highest-risk, ` +
    `and recommend immediate contact assignment or graph anchoring to reduce blind spots.`;
}

export default function SwarmContactGraphOperationalNetwork() {
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
    jobs:0, contacts:0, nodes:0, networked:0, connected:0, traced:0, isolated:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [swRaw, coRaw, gRaw] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,  { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const jobs     = normalizeArray(swRaw, ['items','jobs','results','data']);
      const contacts = normalizeArray(coRaw, ['items','contacts','results','data']);
      const nodes    = normalizeArray(gRaw,  ['nodes','items','results','data','centrality']);

      const built = jobs.map(job => {
        const jobText = [
          job.title, job.name, job.description, job.type, job.tags, job.category, job.target,
        ].filter(Boolean).join(' ');
        const jToks = tokens(jobText);

        const matchedContacts = contacts.filter(c => {
          const cStr = [c.name, c.organisation, c.org, c.company, c.role, c.email, c.tags].filter(Boolean).join(' ');
          return overlaps(jToks, cStr);
        });
        const matchedNodes = nodes.filter(n => {
          const nStr = [n.label, n.name, n.entity_type, n.type, n.category, n.description].filter(Boolean).join(' ');
          return overlaps(jToks, nStr);
        });

        const hasContacts = matchedContacts.length > 0;
        const hasNodes    = matchedNodes.length > 0;
        const cls = hasContacts && hasNodes ? 'NETWORKED'
                  : hasContacts             ? 'CONNECTED'
                  : hasNodes                ? 'TRACED'
                  :                           'ISOLATED';
        return {
          id:             job.id || job.job_id || String(Math.random()),
          name:           job.title || job.name || job.id || '(job)',
          status:         job.status || job.state || '',
          progress:       job.progress ?? job.completion ?? null,
          cls,
          matchedContacts,
          matchedNodes,
        };
      });

      const c = { jobs: built.length, contacts: contacts.length, nodes: nodes.length,
                  networked:0, connected:0, traced:0, isolated:0 };
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
    window.addEventListener('jarvis:scgnet-toggle', handler);
    return () => window.removeEventListener('jarvis:scgnet-toggle', handler);
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
        body: JSON.stringify({ message: buildScgnetScript() }),
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
      return r.name.toLowerCase().includes(s) || r.status.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed', bottom:8, left:95400, zIndex:181,
          background:'rgba(0,10,30,0.85)', border:'1px solid #EF4444',
          color:'#EF4444', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="SwarmJob × Contact × Graph Operational Network"
      >
        ◈ SCGNET
        {counts.isolated > 0 && (
          <span style={{ marginLeft:4, color:'#EF4444', animation:'pulse-red 1.5s infinite' }}>
            {counts.isolated}▲
          </span>
        )}
        <style>{`@keyframes pulse-red{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
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
        <span style={{ color:'#EF4444', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ SCGNET</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>SWARMJOB × CONTACT × GRAPH  OPERATIONAL NETWORK</span>
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
          { label:'JOBS',      val: counts.jobs,      col:'#94A3B8' },
          { label:'CONTACTS',  val: counts.contacts,  col:'#94A3B8' },
          { label:'NODES',     val: counts.nodes,     col:'#94A3B8' },
          { label:'NETWORKED', val: counts.networked, col: CLS_COLOR.NETWORKED },
          { label:'CONNECTED', val: counts.connected, col: CLS_COLOR.CONNECTED },
          { label:'TRACED',    val: counts.traced,    col: CLS_COLOR.TRACED    },
          { label:'ISOLATED',  val: counts.isolated,  col: CLS_COLOR.ISOLATED  },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:80 }}>
            <div style={{ color: col, fontSize:16, fontWeight:700 }}>{val}</div>
            <div style={{ color:'#64748B', fontSize:8, letterSpacing:1 }}>{label}</div>
          </div>
        ))}

        <button onClick={assess} disabled={assessing} style={{
          marginLeft:'auto', background: assessing ? '#1e3a5f' : 'rgba(239,68,68,0.15)',
          border:'1px solid #EF4444', color:'#EF4444', padding:'4px 12px',
          borderRadius:3, cursor: assessing ? 'default' : 'pointer', fontSize:9, letterSpacing:1,
        }}>
          {assessing ? '…ASSESSING' : '▶ ASSESS'}
        </button>
      </div>

      {assessment && (
        <div style={{ margin:'6px 16px', padding:'8px 12px', background:'rgba(239,68,68,0.08)',
          border:'1px solid #EF444466', borderRadius:4, fontSize:10, color:'#E2E8F0',
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
          placeholder="search jobs…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No jobs match the current filter.</div>
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
                <span style={{ color:'#E2E8F0', fontSize:10, flex:1 }}>{r.name}</span>
                {r.status && (
                  <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                    background:'#33415544', color:'#94A3B8' }}>{r.status}</span>
                )}
                {r.progress !== null && (
                  <span style={{ color:'#475569', fontSize:9 }}>
                    {typeof r.progress === 'number' ? `${Math.round(r.progress)}%` : r.progress}
                  </span>
                )}
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedContacts.length}C · {r.matchedNodes.length}N
                </span>
                <span style={{ color:'#475569', fontSize:9 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background:'rgba(0,10,30,0.7)', border:`1px solid ${CLS_COLOR[r.cls]}22`,
                  borderRadius:'0 0 4px 4px', padding:'8px 12px', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#38BDF8', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED CONTACTS
                    </div>
                    {r.matchedContacts.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedContacts.map((c, ci) => (
                        <div key={ci} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {c.name || c.id || '(contact)'}
                          </span>
                          {(c.role || c.organisation || c.org || c.company) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {c.role || ''}{(c.role && (c.organisation || c.org || c.company)) ? ' · ' : ''}
                              {c.organisation || c.org || c.company || ''}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#A78BFA', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED GRAPH NODES
                    </div>
                    {r.matchedNodes.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedNodes.map((n, ni) => (
                        <div key={ni} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {n.label || n.name || n.entity_type || '(node)'}
                          </span>
                          {(n.centrality_score ?? n.score) !== undefined && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#A78BFA33', color:'#A78BFA' }}>
                              ◈{(typeof (n.centrality_score ?? n.score) === 'number')
                                ? (n.centrality_score ?? n.score).toFixed(3)
                                : (n.centrality_score ?? n.score)}
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
        @keyframes pulse-red {
          0%,100% { opacity:1; }
          50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
