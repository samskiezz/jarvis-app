import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGCR_RE = /\b(cgcr|contact\s+centrality\s+report|contact\s+graph\s+report|contact\s+node\s+report|centrality\s+contact\s+report|report\s+contact\s+centrality|contact\s+graph\s+coverage|mapped\s+contact\s+centrality|contact\s+centrality\s+coverage|dark\s+contact\s+report|contact\s+fully\s+mapped\s+report|contact\s+network\s+report|contact\s+graph\s+node\s+report)\b/i;
const THRESHOLD = 0.07;

export function isCgcrQuery(t) {
  return CGCR_RE.test(t || '');
}

export async function buildCgcrScript() {
  try {
    const [contactsRes, centralityRes, reportsRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(contactsRes);
    const nodes = normaliseNodes(centralityRes);
    const reports = normaliseReports(reportsRes);
    const classified = contacts.map(c => classifyContact(c, nodes, reports));
    const fullyMapped = classified.filter(c => c.state === 'FULLY_MAPPED').length;
    const nodeAligned = classified.filter(c => c.state === 'NODE_ALIGNED').length;
    const reportBacked = classified.filter(c => c.state === 'REPORT_BACKED').length;
    const dark = classified.filter(c => c.state === 'DARK').length;
    const pct = contacts.length ? Math.round((fullyMapped / contacts.length) * 100) : 0;
    const darkNames = classified.filter(c => c.state === 'DARK').slice(0, 3).map(c => c.name).join(', ') || 'none';
    return (
      `CGCR: ${contacts.length} contacts correlated against ${nodes.length} graph centrality nodes and ${reports.length} intelligence reports. ` +
      `${fullyMapped} (${pct}%) are FULLY_MAPPED — both network-centrality-aligned and report-documented. ` +
      `${nodeAligned} are NODE_ALIGNED (graph context without report), ${reportBacked} are REPORT_BACKED (documented but not graph-aligned), ${dark} are DARK with no coverage. ` +
      `Dark contacts: ${darkNames}.`
    );
  } catch {
    return 'CGCR data unavailable — check /entities/Contact, /v1/graph/centrality, /v1/reports endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    email:   c.email || '',
    company: c.company || c.organization || '',
    title:   c.title || c.role || c.job_title || '',
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
    desc:    String(c.description || c.bio || c.notes || '').slice(0, 200),
    _text:   `${c.name || ''} ${c.full_name || ''} ${c.email || ''} ${c.company || ''} ${c.organization || ''} ${c.title || ''} ${c.role || ''} ${c.description || ''} ${Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || '')}`,
  }));
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'items', 'results', 'data', 'records', 'centrality'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((n, i) => ({
    id:    n.id || n.node_id || String(i),
    name:  n.label || n.name || n.title || n.entity || `Node ${i + 1}`,
    type:  n.type || n.entity_type || n.category || '',
    score: n.score || n.centrality_score || n.betweenness || n.pagerank || 0,
    desc:  String(n.description || n.summary || '').slice(0, 200),
    _text: `${n.label || ''} ${n.name || ''} ${n.type || ''} ${n.entity_type || ''} ${n.description || ''} ${n.category || ''}`,
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:      r.id || String(i),
    name:    r.title || r.name || r.report_name || `Report ${i + 1}`,
    type:    r.type || r.report_type || r.category || '',
    summary: String(r.summary || r.description || r.abstract || '').slice(0, 200),
    _text:   `${r.title || ''} ${r.name || ''} ${r.type || ''} ${r.category || ''} ${r.summary || ''} ${r.description || ''} ${Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || '')}`,
  }));
}

function classifyContact(contact, nodes, reports) {
  const toks = tok(contact._text);
  const matchedNodes = nodes
    .map(n => ({ ...n, score: Math.max(matchScore(toks, n._text), matchScore(tok(n._text), contact._text)) }))
    .filter(n => n.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedReports = reports
    .map(r => ({ ...r, score: Math.max(matchScore(toks, r._text), matchScore(tok(r._text), contact._text)) }))
    .filter(r => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const state = (matchedNodes.length > 0 && matchedReports.length > 0) ? 'FULLY_MAPPED'
    : matchedNodes.length > 0 ? 'NODE_ALIGNED'
    : matchedReports.length > 0 ? 'REPORT_BACKED' : 'DARK';
  return { ...contact, state, matchedNodes, matchedReports };
}

const STATE_COLOR = {
  FULLY_MAPPED:   '#06b6d4',
  NODE_ALIGNED:   '#10b981',
  REPORT_BACKED:  '#f59e0b',
  DARK:           '#6b7280',
};

const STATE_LABEL = {
  FULLY_MAPPED:   'FULLY MAPPED',
  NODE_ALIGNED:   'NODE ALIGNED',
  REPORT_BACKED:  'REPORT BACKED',
  DARK:           'DARK',
};

export default function ContactGraphCentralityReportTriple() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [contacts,   setContacts]   = useState([]);
  const [nodes,      setNodes]      = useState([]);
  const [reports,    setReports]    = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter,     setFilter]     = useState('ALL');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [contactsRes, centralityRes, reportsRes] = await Promise.all([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
      ]);
      const ct = normaliseContacts(contactsRes);
      const nd = normaliseNodes(centralityRes);
      const rp = normaliseReports(reportsRes);
      setContacts(ct);
      setNodes(nd);
      setReports(rp);
      setClassified(ct.map(c => classifyContact(c, nd, rp)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:cgcr-toggle', handler);
    return () => window.removeEventListener('jarvis:cgcr-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    const id = setInterval(fetchAll, 90000);
    return () => clearInterval(id);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      if (CGCR_RE.test(e.detail?.query || '')) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const counts = {
        FULLY_MAPPED:  classified.filter(c => c.state === 'FULLY_MAPPED').length,
        NODE_ALIGNED:  classified.filter(c => c.state === 'NODE_ALIGNED').length,
        REPORT_BACKED: classified.filter(c => c.state === 'REPORT_BACKED').length,
        DARK:          classified.filter(c => c.state === 'DARK').length,
      };
      const prompt = `CGCR Contact × Graph Centrality × Report Triple Coverage: ${contacts.length} contacts cross-referenced against ${nodes.length} graph centrality nodes and ${reports.length} intelligence reports. Coverage: FULLY_MAPPED=${counts.FULLY_MAPPED} (both network centrality alignment and documentary intelligence confirmed), NODE_ALIGNED=${counts.NODE_ALIGNED} (graph centrality matched but not report-documented), REPORT_BACKED=${counts.REPORT_BACKED} (report documented but not graph centrality aligned), DARK=${counts.DARK} (neither — contacts with no graph centrality or report coverage — critical intelligence gap). In 2 sentences, identify which contacts are most fully profiled across network and documentary dimensions versus those that are dark or missing either graph centrality context or report backing, and recommend priority intelligence collection actions.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || j.answer || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const counts = {
    FULLY_MAPPED:  classified.filter(c => c.state === 'FULLY_MAPPED').length,
    NODE_ALIGNED:  classified.filter(c => c.state === 'NODE_ALIGNED').length,
    REPORT_BACKED: classified.filter(c => c.state === 'REPORT_BACKED').length,
    DARK:          classified.filter(c => c.state === 'DARK').length,
  };
  const mappedPct  = classified.length ? Math.round((counts.FULLY_MAPPED  / classified.length) * 100) : 0;
  const nodePct    = classified.length ? Math.round((counts.NODE_ALIGNED  / classified.length) * 100) : 0;
  const reportPct  = classified.length ? Math.round((counts.REPORT_BACKED / classified.length) * 100) : 0;
  const darkPct    = classified.length ? Math.round((counts.DARK          / classified.length) * 100) : 0;

  const visible = classified.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q)
        || c.company.toLowerCase().includes(q)
        || c.email.toLowerCase().includes(q);
    }
    return true;
  });

  const mono = "'JetBrains Mono',monospace";

  return (
    <div style={{
      position: 'fixed', left: 853200, bottom: 8, zIndex: 552,
      width: 900, maxHeight: 680, background: '#0a0f1a',
      border: '1px solid #06b6d433', borderRadius: 10,
      fontFamily: mono, fontSize: 11, color: '#cbd5e1',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 0 24px #06b6d422',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', borderBottom: '1px solid #1e293b', background: '#060d18' }}>
        <span style={{ color: '#06b6d4', fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ CGCR
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>
          CONTACT × GRAPH CENTRALITY × REPORT
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {counts.FULLY_MAPPED > 0 && (
            <span style={{ background: '#06b6d422', color: '#06b6d4', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.FULLY_MAPPED} MAPPED
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#6b728022', color: '#9ca3af', borderRadius: 4, padding: '1px 7px', fontSize: 10 }}>
              {counts.DARK} DARK
            </span>
          )}
          {loading && <span style={{ color: '#64748b' }}>◌</span>}
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {error && (
        <div style={{ color: '#f87171', padding: '4px 12px', fontSize: 10, background: '#1a0a0a' }}>
          ⚠ {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4, padding: '8px 12px 0' }}>
        {[
          ['CONTACTS',  contacts.length,         '#94a3b8'],
          ['NODES',     nodes.length,            '#10b981'],
          ['REPORTS',   reports.length,          '#f59e0b'],
          ['MAPPED',    counts.FULLY_MAPPED,     '#06b6d4'],
          ['NODE ALN',  counts.NODE_ALIGNED,     '#10b981'],
          ['RPT BKCD', counts.REPORT_BACKED,    '#f59e0b'],
          ['DARK',      counts.DARK,             '#6b7280'],
          ['MAP%',      mappedPct + '%',         '#06b6d4'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ background: '#0f172a', borderRadius: 5, padding: '5px 4px', textAlign: 'center' }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {classified.length > 0 && (
        <div style={{ margin: '8px 12px 0', height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: mappedPct + '%',  background: '#06b6d4' }} title={`FULLY MAPPED ${mappedPct}%`} />
          <div style={{ width: nodePct   + '%',  background: '#10b981' }} title={`NODE ALIGNED ${nodePct}%`} />
          <div style={{ width: reportPct + '%',  background: '#f59e0b' }} title={`REPORT BACKED ${reportPct}%`} />
          <div style={{ width: darkPct   + '%',  background: '#374151' }} title={`DARK ${darkPct}%`} />
        </div>
      )}

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px 4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_MAPPED', 'NODE_ALIGNED', 'REPORT_BACKED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] || '#334155' : '#0f172a',
            color: filter === f ? '#000' : '#64748b',
            border: '1px solid ' + (filter === f ? STATE_COLOR[f] || '#475569' : '#1e293b'),
            borderRadius: 4, padding: '2px 9px', cursor: 'pointer', fontSize: 10, fontFamily: mono,
          }}>
            {f === 'ALL' ? 'ALL' : STATE_LABEL[f]}
            {f !== 'ALL' && <span style={{ marginLeft: 4, opacity: 0.8 }}>({counts[f] || 0})</span>}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b',
            color: '#94a3b8', borderRadius: 4, padding: '3px 8px', fontSize: 10,
            fontFamily: mono, outline: 'none', width: 160,
          }}
        />
      </div>

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 4px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#334155', padding: 16, textAlign: 'center' }}>
            {classified.length === 0 ? 'No contact data loaded.' : 'No contacts match filter.'}
          </div>
        )}
        {visible.map(contact => (
          <div key={contact.id}>
            <div
              onClick={() => setExpanded(expanded === contact.id ? null : contact.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
                borderRadius: 5, cursor: 'pointer', marginBottom: 2,
                background: expanded === contact.id ? '#0f172a' : 'transparent',
                borderLeft: `3px solid ${STATE_COLOR[contact.state]}`,
              }}
            >
              <span style={{ color: STATE_COLOR[contact.state], fontSize: 10, minWidth: 110, fontWeight: 600 }}>
                {STATE_LABEL[contact.state]}
              </span>
              <span style={{ color: '#e2e8f0', flex: 1, fontSize: 11 }}>{contact.name}</span>
              {contact.company && (
                <span style={{ color: '#64748b', fontSize: 10 }}>{contact.company}</span>
              )}
              <span style={{ color: '#475569', fontSize: 10 }}>
                N:{contact.matchedNodes.length} R:{contact.matchedReports.length}
              </span>
              <span style={{ color: '#334155', fontSize: 10 }}>{expanded === contact.id ? '▲' : '▼'}</span>
            </div>

            {expanded === contact.id && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: '6px 6px 8px', background: '#060d18', borderRadius: 5, marginBottom: 4,
              }}>
                {/* Graph Centrality Nodes */}
                <div>
                  <div style={{ color: '#10b981', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    CENTRALITY NODES ({contact.matchedNodes.length})
                  </div>
                  {contact.matchedNodes.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No node matches.</div>
                  ) : contact.matchedNodes.slice(0, 6).map(nd => (
                    <div key={nd.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#6ee7b7', fontSize: 10 }}>{nd.name}</span>
                        {nd.type && (
                          <span style={{ background: '#06402033', color: '#34d399', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                            {nd.type}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(nd.score * 100) + '%', background: '#10b981', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Intelligence Reports */}
                <div>
                  <div style={{ color: '#f59e0b', fontSize: 10, marginBottom: 4, fontWeight: 700 }}>
                    INTELLIGENCE REPORTS ({contact.matchedReports.length})
                  </div>
                  {contact.matchedReports.length === 0 ? (
                    <div style={{ color: '#374151', fontSize: 10 }}>No report matches.</div>
                  ) : contact.matchedReports.slice(0, 6).map(rp => (
                    <div key={rp.id} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#fcd34d', fontSize: 10 }}>{rp.name}</span>
                        {rp.type && (
                          <span style={{ background: '#78350f33', color: '#fbbf24', borderRadius: 3, padding: '0 4px', fontSize: 9 }}>
                            {rp.type}
                          </span>
                        )}
                      </div>
                      <div style={{ height: 3, background: '#1e293b', borderRadius: 2 }}>
                        <div style={{ height: 3, width: Math.round(rp.score * 100) + '%', background: '#f59e0b', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ASSESS footer */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #1e293b', background: '#060d18' }}>
        {assessment && (
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assessment}</div>
        )}
        <button onClick={assess} disabled={assessing || classified.length === 0} style={{
          background: assessing ? '#1e293b' : '#06b6d41a',
          border: '1px solid #06b6d444',
          color: '#06b6d4', borderRadius: 5, padding: '4px 14px',
          cursor: assessing ? 'default' : 'pointer', fontSize: 11,
          fontFamily: mono, letterSpacing: 1,
        }}>
          {assessing ? '◌ assessing…' : '▶ ASSESS'}
        </button>
      </div>
    </div>
  );
}
