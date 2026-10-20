/**
 * ReportGraphContactAttributionMap — F81
 *
 * Fetches /v1/reports + /v1/graph/centrality + /entities/Contact.
 * Keyword-matches each report against graph centrality nodes AND contacts to classify:
 *   ATTRIBUTED — report has both a graph node match AND a contact match (fully anchored)
 *   TRACED     — report matched graph nodes only (in the intelligence graph, no human link)
 *   LINKED     — report matched contacts only (human-linked, no graph node)
 *   ORPHAN     — no graph trace and no contact linkage (intelligence blind-spot)
 *
 * Toggle: ◈ RGCATTR button (fixed, bottom strip) left:93720, zIndex:178
 * Stat tiles: reports / nodes / contacts / attributed / traced / linked / orphan
 * Amber pulse on ORPHAN count.
 * Expandable rows: matched graph nodes with centrality score badge + matched contacts with role/org.
 * Filter tabs: ALL / ATTRIBUTED / TRACED / LINKED / ORPHAN + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "rgcattr"/"report attribution"/"report graph contact"/"orphan reports"/
 *        "report intelligence attribution"/"unattributed reports"/"report contact"/"report graph"
 * Event: jarvis:rgcattr-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ATTRIBUTED', 'TRACED', 'LINKED', 'ORPHAN'];

const CLS_COLOR = {
  ATTRIBUTED: '#00FF88',
  TRACED:     '#38BDF8',
  LINKED:     '#A78BFA',
  ORPHAN:     '#F59E0B',
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

export function isRgcattrQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'rgcattr', 'report attribution', 'report graph contact',
    'orphan reports', 'report intelligence attribution',
    'unattributed reports', 'report contact', 'report graph',
  ].some(k => s.includes(k));
}

export function buildRgcattrScript() {
  return `Fetch /v1/reports, /v1/graph/centrality, and /entities/Contact. ` +
    `Keyword-match each report title and content against graph centrality nodes AND contacts. ` +
    `Classify each report as ATTRIBUTED/TRACED/LINKED/ORPHAN. ` +
    `Report total ORPHAN (reports with no graph trace and no contact linkage), ` +
    `identify which intelligence reports lack human attribution or graph grounding, ` +
    `and recommend which contacts or graph nodes should be linked to bring orphaned reports ` +
    `to ATTRIBUTED status.`;
}

export default function ReportGraphContactAttributionMap() {
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
    reports:0, nodes:0, contacts:0, attributed:0, traced:0, linked:0, orphan:0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [rRaw, gRaw, cRaw] = await Promise.all([
        fetch(`${API}/v1/reports`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/v1/graph/centrality`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const reports  = normalizeArray(rRaw, ['items','reports','results','data']);
      const nodes    = normalizeArray(gRaw, ['items','nodes','results','data','centrality']);
      const contacts = normalizeArray(cRaw, ['items','contacts','results','data']);

      const built = reports.map(rep => {
        const repText = [
          rep.title, rep.name, rep.summary, rep.content, rep.category, rep.tags,
        ].filter(Boolean).join(' ');
        const rToks = tokens(repText);

        const matchedNodes = nodes.filter(n => {
          const nStr = [n.label, n.name, n.id, n.entity, n.type, n.description].filter(Boolean).join(' ');
          return overlaps(rToks, nStr);
        });
        const matchedContacts = contacts.filter(c => {
          const cStr = [c.name, c.full_name, c.org, c.organisation, c.role, c.title, c.tags, c.email].filter(Boolean).join(' ');
          return overlaps(rToks, cStr);
        });

        const hasNodes    = matchedNodes.length > 0;
        const hasContacts = matchedContacts.length > 0;
        const cls = hasNodes && hasContacts ? 'ATTRIBUTED'
                  : hasNodes               ? 'TRACED'
                  : hasContacts            ? 'LINKED'
                  :                          'ORPHAN';
        return {
          id:             rep.id || rep.report_id || String(Math.random()),
          title:          rep.title || rep.name || '(report)',
          date:           rep.date || rep.created_at || rep.timestamp || '',
          cls,
          matchedNodes,
          matchedContacts,
        };
      });

      const c = { reports: built.length, nodes: nodes.length, contacts: contacts.length,
                  attributed:0, traced:0, linked:0, orphan:0 };
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
    window.addEventListener('jarvis:rgcattr-toggle', handler);
    return () => window.removeEventListener('jarvis:rgcattr-toggle', handler);
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
        body: JSON.stringify({ message: buildRgcattrScript() }),
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
          position:'fixed', bottom:8, left:93720, zIndex:178,
          background:'rgba(0,10,30,0.85)', border:'1px solid #F59E0B',
          color:'#F59E0B', fontSize:9, padding:'3px 7px', borderRadius:3,
          cursor:'pointer', letterSpacing:1, fontFamily:'monospace',
          whiteSpace:'nowrap',
        }}
        title="Report × Graph × Contact Intelligence Attribution Map"
      >
        ◈ RGCATTR
        {counts.orphan > 0 && (
          <span style={{ marginLeft:4, color:'#F59E0B', animation:'pulse-amber 1.5s infinite' }}>
            {counts.orphan}▲
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
        <span style={{ color:'#F59E0B', fontWeight:700, letterSpacing:2, fontSize:12 }}>◈ RGCATTR</span>
        <span style={{ color:'#94A3B8', fontSize:10 }}>REPORT × GRAPH × CONTACT  INTELLIGENCE ATTRIBUTION MAP</span>
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
          { label:'REPORTS',    val: counts.reports,    col:'#94A3B8' },
          { label:'NODES',      val: counts.nodes,      col:'#94A3B8' },
          { label:'CONTACTS',   val: counts.contacts,   col:'#94A3B8' },
          { label:'ATTRIBUTED', val: counts.attributed, col: CLS_COLOR.ATTRIBUTED },
          { label:'TRACED',     val: counts.traced,     col: CLS_COLOR.TRACED     },
          { label:'LINKED',     val: counts.linked,     col: CLS_COLOR.LINKED     },
          { label:'ORPHAN',     val: counts.orphan,     col: CLS_COLOR.ORPHAN     },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background:'rgba(0,10,30,0.8)', border:`1px solid ${col}44`,
            borderRadius:4, padding:'4px 10px', textAlign:'center', minWidth:80 }}>
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
          placeholder="search reports…"
          style={{ marginLeft:'auto', background:'rgba(0,10,30,0.7)', border:'1px solid #334155',
            color:'#E2E8F0', padding:'2px 8px', borderRadius:3, fontSize:9, width:180, outline:'none' }} />
      </div>

      {/* Rows */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 16px' }}>
        {loading && <div style={{ color:'#64748B', fontSize:10, padding:8 }}>Loading…</div>}
        {error   && <div style={{ color:'#FF4444', fontSize:10, padding:8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color:'#475569', fontSize:10, padding:8 }}>No reports match the current filter.</div>
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
                {r.date && (
                  <span style={{ color:'#64748B', fontSize:9 }}>
                    {String(r.date).slice(0,10)}
                  </span>
                )}
                <span style={{ color:'#475569', fontSize:9 }}>
                  {r.matchedNodes.length}N · {r.matchedContacts.length}C
                </span>
                <span style={{ color:'#475569', fontSize:9 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background:'rgba(0,10,30,0.7)', border:`1px solid ${CLS_COLOR[r.cls]}22`,
                  borderRadius:'0 0 4px 4px', padding:'8px 12px', display:'flex', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#38BDF8', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED GRAPH NODES
                    </div>
                    {r.matchedNodes.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedNodes.map((n, ni) => (
                        <div key={ni} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {n.label || n.name || n.id || '(node)'}
                          </span>
                          {(n.centrality !== undefined || n.score !== undefined) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#38BDF833', color:'#38BDF8' }}>
                              {(n.centrality ?? n.score ?? 0).toFixed ? (n.centrality ?? n.score ?? 0).toFixed(3) : (n.centrality ?? n.score ?? 0)}
                            </span>
                          )}
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ color:'#A78BFA', fontSize:9, marginBottom:4, letterSpacing:1 }}>
                      MATCHED CONTACTS
                    </div>
                    {r.matchedContacts.length === 0
                      ? <div style={{ color:'#475569', fontSize:10 }}>None</div>
                      : r.matchedContacts.map((c, ci) => (
                        <div key={ci} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                          <span style={{ color:'#E2E8F0', fontSize:10 }}>
                            {c.name || c.full_name || c.id || '(contact)'}
                          </span>
                          {(c.role || c.org || c.organisation) && (
                            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:2,
                              background:'#A78BFA33', color:'#A78BFA' }}>
                              {[c.role, c.org || c.organisation].filter(Boolean).join(' · ')}
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
