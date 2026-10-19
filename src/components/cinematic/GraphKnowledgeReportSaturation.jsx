/**
 * GraphKnowledgeReportSaturation — F54
 *
 * Fetches /v1/graph/centrality + /knowledge/ + /v1/reports
 * Cross-references each graph node against knowledge articles AND intelligence reports:
 *   SATURATED — matched both a knowledge article AND a report (fully covered node)
 *   KNOWN     — matched knowledge only (documented but not yet reported)
 *   REPORTED  — matched a report only (reported but no knowledge base entry)
 *   DARK      — no match in either (blind spot — no knowledge, no report)
 *
 * Toggle: ◈ GKRSAT button (fixed, bottom strip) left:78600, zIndex:151
 * Stat tiles: nodes / knowledge / reports / saturated / known / reported / dark
 * Amber pulse on DARK count.
 * Expandable rows: matched knowledge articles with category badge + matched reports with date badge.
 * Filter tabs: ALL / SATURATED / KNOWN / REPORTED / DARK + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "graph knowledge report"/"graph saturation"/"gkrsat"/"knowledge graph"/
 *        "saturated nodes"/"report knowledge graph"/"intelligence saturation"/
 *        "graph blind spot"/"node coverage"/"knowledge gap graph"
 * Event: jarvis:gkrsat-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'SATURATED', 'KNOWN', 'REPORTED', 'DARK'];

const CLS_COLOR = {
  SATURATED: '#00E5A0',
  KNOWN:     '#29E7FF',
  REPORTED:  '#A78BFA',
  DARK:      '#FFB800',
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

function classifyNode(nodeToks, knowledge, reports) {
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(nodeToks, [k.title, k.name, k.content, k.summary, k.category, k.tags, k.type, k.topic, k.subject, k.domain, k.keywords].join(' '))
  );
  const matchedReports = reports.filter(r =>
    overlaps(nodeToks, [r.title, r.name, r.summary, r.description, r.category, r.tags, r.type, r.topic, r.subject, r.domain].join(' '))
  );
  const hasKnowledge = matchedKnowledge.length > 0;
  const hasReport    = matchedReports.length > 0;
  const cls = hasKnowledge && hasReport ? 'SATURATED'
            : hasKnowledge              ? 'KNOWN'
            : hasReport                 ? 'REPORTED'
            : 'DARK';
  return { cls, matchedKnowledge: matchedKnowledge.slice(0, 4), matchedReports: matchedReports.slice(0, 4) };
}

export function isGkrsatQuery(q) {
  return /\b(gkrsat|graph.knowl|graph.report|intelligence.satur|knowledge.graph|saturated.node|report.knowledge.graph|graph.blind.spot|node.coverage|knowledge.gap.graph|graph.satur)\b/i.test(q);
}
export function buildGkrsatScript() {
  return 'Opening Graph × Knowledge × Report Intelligence Saturation. Cross-referencing each graph centrality node against knowledge articles and intelligence reports to surface fully covered vs blind-spot nodes in the intelligence graph.';
}

export default function GraphKnowledgeReportSaturation() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [reportCount, setReportCount]       = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [grRes, knRes, rpRes] = await Promise.all([
        fetch(`${API}/v1/graph/centrality`, { headers: h }),
        fetch(`${API}/knowledge/`,          { headers: h }),
        fetch(`${API}/v1/reports`,          { headers: h }),
      ]);
      const [grRaw, knRaw, rpRaw] = await Promise.all([
        grRes.ok ? grRes.json() : [],
        knRes.ok ? knRes.json() : [],
        rpRes.ok ? rpRes.json() : [],
      ]);

      const nodes     = normalizeArray(grRaw, ['items','data','results','nodes','centrality','graph','entities']);
      const knowledge = normalizeArray(knRaw, ['items','data','results','articles','entries','knowledge','list','documents']);
      const reports   = normalizeArray(rpRaw, ['items','data','results','reports','list','documents']);

      setKnowledgeCount(knowledge.length);
      setReportCount(reports.length);

      const built = nodes.map((n, i) => {
        const id         = n.id || n.entity_id || n.node_id || `node-${i}`;
        const name       = n.name || n.label || n.entity || id;
        const nodeType   = n.type || n.category || n.domain || '';
        const centrality = n.centrality || n.score || n.betweenness || n.degree || null;
        const toks       = tokens([name, nodeType, n.description, n.tags, n.source, n.domain, n.attributes, n.subject].join(' '));
        const { cls, matchedKnowledge, matchedReports } = classifyNode(toks, knowledge, reports);
        return { id, name, nodeType, centrality, _cls: cls, _knowledge: matchedKnowledge, _reports: matchedReports };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:gkrsat-toggle', handler);
    return () => window.removeEventListener('jarvis:gkrsat-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { SATURATED: 0, KNOWN: 0, REPORTED: 0, DARK: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const darkNames = rows.filter(r => r._cls === 'DARK').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `Graph × Knowledge × Report Intelligence Saturation: ${rows.length} graph centrality nodes cross-referenced against ${knowledgeCount} knowledge articles and ${reportCount} intelligence reports. ${counts.SATURATED} nodes are SATURATED (covered by both knowledge and reports — fully documented). ${counts.KNOWN} are KNOWN (have knowledge articles but no intelligence reports — documented but not yet operationally reported). ${counts.REPORTED} are REPORTED (appear in intelligence reports but lack knowledge base entries — operationally active but undocumented). ${counts.DARK} nodes are DARK — no knowledge articles and no reports, representing the highest intelligence blind spots in the graph.${darkNames ? ` Dark nodes include: ${darkNames}.` : ''} Assess the overall intelligence saturation of the knowledge graph, identify which dark nodes are highest-centrality (most influential) and therefore highest priority to document, and recommend actions to close the knowledge and reporting gaps.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing, knowledgeCount, reportCount]);

  const counts = { SATURATED: 0, KNOWN: 0, REPORTED: 0, DARK: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.nodeType, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  const PANEL = {
    position: 'fixed', bottom: 50, left: '50%', transform: 'translateX(-50%)',
    width: 740, maxHeight: '78vh', zIndex: 151,
    background: 'rgba(8,12,20,0.97)', border: '1px solid #FFB800',
    borderRadius: 8, display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#ccc', overflow: 'hidden',
    boxShadow: '0 0 32px rgba(255,184,0,0.15)',
  };

  if (!open) {
    return (
      <>
        <style>{`@keyframes gkrsat-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 8, left: 78600, zIndex: 151,
            background: 'rgba(255,184,0,0.10)', border: '1px solid #FFB800',
            color: '#FFB800', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
            borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
          }}
        >
          ◈ GKRSAT{counts.DARK > 0 && (
            <span style={{
              marginLeft: 4, background: '#FFB800', color: '#000',
              borderRadius: 8, padding: '0 4px', fontSize: 8,
              animation: 'gkrsat-pulse 1.4s infinite',
            }}>{counts.DARK}</span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes gkrsat-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      <div style={PANEL}>
        {/* Header */}
        <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#FFB800', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>◈ GRAPH INTELLIGENCE SATURATION</span>
          <span style={{ fontSize: 10, color: '#888' }}>Graph × Knowledge × Report</span>
          <span style={{ flex: 1 }} />
          {loading && <span style={{ color: '#888', fontSize: 10 }}>loading…</span>}
          {error && <span style={{ color: '#FF4444', fontSize: 10 }}>{error}</span>}
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #222' }}>
          {[
            { label: 'NODES',     val: rows.length,           color: '#ccc' },
            { label: 'KNOWLEDGE', val: knowledgeCount,         color: '#29E7FF' },
            { label: 'REPORTS',   val: reportCount,            color: '#A78BFA' },
            { label: 'SATURATED', val: counts.SATURATED,      color: '#00E5A0' },
            { label: 'KNOWN',     val: counts.KNOWN,          color: '#29E7FF' },
            { label: 'REPORTED',  val: counts.REPORTED,       color: '#A78BFA' },
            { label: 'DARK',      val: counts.DARK,           color: '#FFB800', pulse: counts.DARK > 0 },
          ].map(({ label, val, color, pulse }) => (
            <div key={label} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 4,
              padding: '5px 4px', textAlign: 'center',
              border: `1px solid ${color}22`,
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color,
                animation: pulse ? 'gkrsat-pulse 1.4s infinite' : 'none',
              }}>{val}</div>
              <div style={{ fontSize: 8, color: '#666', letterSpacing: 0.5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter + search */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #222', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#FFB800'}22` : 'none',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#FFB800') : '#333'}`,
              color: tab === t ? (CLS_COLOR[t] || '#FFB800') : '#666',
              fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', fontSize: 10,
              padding: '3px 8px', borderRadius: 3, outline: 'none', width: 160,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#444', padding: 20, fontSize: 11 }}>No nodes match current filter.</div>
          )}
          {visible.map(row => (
            <div key={row.id}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 14px', cursor: 'pointer',
                  borderBottom: '1px solid #181c24',
                  background: expanded === row.id ? 'rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: `${CLS_COLOR[row._cls]}22`,
                  border: `1px solid ${CLS_COLOR[row._cls]}`,
                  color: CLS_COLOR[row._cls], letterSpacing: 0.5, minWidth: 72, textAlign: 'center',
                }}>{row._cls}</span>
                <span style={{ flex: 1, fontSize: 11, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                {row.nodeType && <span style={{ fontSize: 9, color: '#666' }}>{row.nodeType}</span>}
                {row.centrality != null && (
                  <span style={{ fontSize: 9, color: '#555' }}>
                    {typeof row.centrality === 'number' ? row.centrality.toFixed(3) : row.centrality}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#555' }}>
                  {row._knowledge.length}📖 {row._reports.length}📄
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>{expanded === row.id ? '▲' : '▼'}</span>
              </div>
              {expanded === row.id && (
                <div style={{ padding: '8px 20px 10px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #181c24' }}>
                  {row._knowledge.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>KNOWLEDGE ARTICLES ({row._knowledge.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._knowledge.map((k, i) => (
                          <span key={i} style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 10,
                            background: 'rgba(41,231,255,0.10)', border: '1px solid #29E7FF33',
                            color: '#29E7FF',
                          }}>
                            {k.title || k.name || 'Article'}
                            {(k.category || k.type) && (
                              <span style={{ marginLeft: 4, color: '#29E7FF88' }}>{k.category || k.type}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {row._reports.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: '#555', marginBottom: 4, letterSpacing: 0.5 }}>INTELLIGENCE REPORTS ({row._reports.length})</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row._reports.map((r, i) => {
                          const dateStr = r.date || r.created_at || r.published_at || r.timestamp || '';
                          const dateDisplay = dateStr ? new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
                          return (
                            <span key={i} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 10,
                              background: 'rgba(167,139,250,0.10)', border: '1px solid #A78BFA33',
                              color: '#A78BFA',
                            }}>
                              {r.title || r.name || 'Report'}
                              {dateDisplay && (
                                <span style={{ marginLeft: 4, color: '#A78BFA88' }}>{dateDisplay}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {row._knowledge.length === 0 && row._reports.length === 0 && (
                    <div style={{ color: '#FFB800', fontSize: 10 }}>⚠ No knowledge articles or reports found for this node — intelligence blind spot.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Assess footer */}
        <div style={{ borderTop: '1px solid #222', padding: '8px 14px' }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.05)' : 'rgba(255,184,0,0.12)',
              border: '1px solid #FFB800', color: '#FFB800',
              fontSize: 10, padding: '4px 14px', borderRadius: 3, cursor: assessing ? 'wait' : 'pointer',
              fontFamily: 'monospace', letterSpacing: 1,
            }}
          >{assessing ? '▶ ASSESSING…' : '▶ ASSESS INTELLIGENCE SATURATION'}</button>
          {assessment && (
            <div style={{
              marginTop: 8, fontSize: 10, color: '#bbb', lineHeight: 1.55,
              maxHeight: 90, overflowY: 'auto', background: 'rgba(255,184,0,0.05)',
              border: '1px solid #FFB80022', borderRadius: 4, padding: '6px 10px',
            }}>{assessment}</div>
          )}
        </div>
      </div>
    </>
  );
}
