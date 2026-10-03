import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RGNTRI_RE = /\b(rgntri|report\s+graph\s+contact|graph\s+report\s+contact|contact\s+report\s+graph|untraced\s+report|report\s+intel\s+graph|report\s+node\s+contact|graph\s+contact\s+report)\b/i;

const THRESHOLD = 0.07;

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

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.reports) ? data.reports
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(r => ({
    id: r.id || r._id || r.reportId || String(Math.random()),
    title: r.title || r.name || r.subject || 'Untitled Report',
    summary: r.summary || r.description || r.content || r.body || '',
    category: r.category || r.type || r.kind || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    raw: r,
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

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.contacts) ? data.contacts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || c.contactId || String(Math.random()),
    name: c.name || c.fullName || c.displayName || 'Unknown Contact',
    title: c.title || c.role || c.position || '',
    company: c.company || c.org || c.organisation || c.organization || '',
    description: c.description || c.bio || c.notes || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    raw: c,
  }));
}

function correlate(reports, graphNodes, contacts) {
  return reports.map(report => {
    const toks = tok([report.title, report.summary, report.category, report.tags].join(' '));

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

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.title),
          matchScore(toks, c.company),
          matchScore(toks, c.description),
          matchScore(toks, c.tags),
        );
        return { ...c, matchScore: score };
      })
      .filter(c => c.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasNode = matchedNodes.length > 0;
    const hasContact = matchedContacts.length > 0;

    let state;
    if (hasNode && hasContact) state = 'FULLY TRACED';
    else if (hasNode) state = 'INTEL-GRAPHED';
    else if (hasContact) state = 'CONTACT-LINKED';
    else state = 'UNTRACED';

    return { report, matchedNodes, matchedContacts, state };
  });
}

export function isRgntriQuery(t) {
  return RGNTRI_RE.test(t || '');
}

export async function buildRgntriScript() {
  try {
    const [rRes, gRes, cRes] = await Promise.allSettled([
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
    ]);
    const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
    const graphNodes = normaliseGraphNodes(gRes.status === 'fulfilled' ? gRes.value : null);
    const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
    const rows = correlate(reports, graphNodes, contacts);
    const fullyTraced = rows.filter(r => r.state === 'FULLY TRACED').length;
    const intelGraphed = rows.filter(r => r.state === 'INTEL-GRAPHED').length;
    const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
    const untraced = rows.filter(r => r.state === 'UNTRACED').length;
    return `RGNTRI Report×GraphNode×Contact: ${rows.length} reports analysed. ` +
      `${fullyTraced} FULLY TRACED (graph node + contact), ` +
      `${intelGraphed} INTEL-GRAPHED, ${contactLinked} CONTACT-LINKED, ${untraced} UNTRACED. ` +
      (untraced > 0
        ? `Top untraced: "${rows.find(r => r.state === 'UNTRACED')?.report.title || 'see panel'}" — no graph or contact coverage.`
        : 'All reports have graph or contact coverage.');
  } catch {
    return 'RGNTRI: data fetch failed.';
  }
}

export default function ReportGraphNodeContactTriple() {
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
    window.addEventListener('jarvis:rgntri-toggle', handler);
    return () => window.removeEventListener('jarvis:rgntri-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [rRes, gRes, cRes] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const reports = normaliseReports(rRes.status === 'fulfilled' ? rRes.value : null);
      const graphNodes = normaliseGraphNodes(gRes.status === 'fulfilled' ? gRes.value : null);
      const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
      if (!reports.length && !graphNodes.length && !contacts.length) {
        setErr('No data returned from Reports, Graph/Centrality, or Contact endpoints.');
      }
      setRows(correlate(reports, graphNodes, contacts));
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
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyTraced = rows.filter(r => r.state === 'FULLY TRACED').length;
  const intelGraphed = rows.filter(r => r.state === 'INTEL-GRAPHED').length;
  const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
  const untraced = rows.filter(r => r.state === 'UNTRACED').length;

  const TABS = ['ALL', 'FULLY TRACED', 'INTEL-GRAPHED', 'CONTACT-LINKED', 'UNTRACED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.report.title.toLowerCase().includes(q) ||
        r.report.summary.toLowerCase().includes(q) ||
        r.matchedNodes.some(n => n.name.toLowerCase().includes(q)) ||
        r.matchedContacts.some(c => c.name.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Intelligence report "${row.report.title}" [${row.state}]: ` +
      `graph nodes: ${row.matchedNodes.map(n => n.name).join(', ') || 'none'}. ` +
      `contacts: ${row.matchedContacts.map(c => c.name).join(', ') || 'none'}. ` +
      `Category: ${row.report.category || 'unknown'}. ` +
      `Give a 2-sentence intelligence traceability brief — does this report have adequate graph and human coverage, or is it an untraced intelligence gap?`;
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
    'FULLY TRACED': '#22c55e',
    'INTEL-GRAPHED': '#00e5ff',
    'CONTACT-LINKED': '#a855f7',
    'UNTRACED': '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 774800,
          bottom: 8,
          zIndex: 412,
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
        ◈ RGNTRI
        {untraced > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#888',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {untraced}
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
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #00e5ff55',
      borderRadius: 8,
      zIndex: 412,
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
          ◈ REPORT × GRAPH NODE × CONTACT
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
          { label: 'FULLY TRACED', val: fullyTraced, col: '#22c55e' },
          { label: 'INTEL-GRAPHED', val: intelGraphed, col: '#00e5ff' },
          { label: 'CONTACT-LINKED', val: contactLinked, col: '#a855f7' },
          { label: 'UNTRACED', val: untraced, col: '#888' },
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

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #00e5ff11' }}>
          <div style={{ fontSize: 10, color: '#556', marginBottom: 3 }}>
            TRACEABILITY — {rows.length > 0 ? Math.round((fullyTraced / rows.length) * 100) : 0}% fully traced
          </div>
          <div style={{ height: 4, background: '#111', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${rows.length ? (fullyTraced / rows.length) * 100 : 0}%`, background: '#22c55e' }} />
            <div style={{ width: `${rows.length ? (intelGraphed / rows.length) * 100 : 0}%`, background: '#00e5ff' }} />
            <div style={{ width: `${rows.length ? (contactLinked / rows.length) * 100 : 0}%`, background: '#a855f7' }} />
            <div style={{ width: `${rows.length ? (untraced / rows.length) * 100 : 0}%`, background: '#333' }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #00e5ff11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? 'rgba(0,229,255,0.18)' : 'none',
              border: `1px solid ${filter === t ? '#00e5ff' : '#00e5ff22'}`,
              color: filter === t ? '#00e5ff' : '#556',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
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
            border: '1px solid #00e5ff22',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ padding: '6px 12px', color: '#ff4444', fontSize: 11 }}>
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div style={{ padding: '16px 12px', color: '#556', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {/* Rows */}
      <div>
        {visible.map((row, i) => {
          const isExpanded = expanded === (row.report.id + i);
          return (
            <div
              key={row.report.id + i}
              style={{
                borderBottom: '1px solid #00e5ff0a',
                padding: '6px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : (row.report.id + i))}
              >
                <span style={{
                  display: 'inline-block',
                  minWidth: 90,
                  fontSize: 9,
                  fontWeight: 700,
                  color: STATE_COLOUR[row.state],
                  background: `${STATE_COLOUR[row.state]}18`,
                  border: `1px solid ${STATE_COLOUR[row.state]}44`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.report.title}
                </span>
                {row.report.category && (
                  <span style={{ fontSize: 9, color: '#00e5ff88', background: 'rgba(0,229,255,0.08)', borderRadius: 3, padding: '1px 5px' }}>
                    {row.report.category}
                  </span>
                )}
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Graph nodes */}
                  <div style={{ flex: 1, background: 'rgba(0,229,255,0.04)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#00e5ff', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      GRAPH NODES ({row.matchedNodes.length})
                    </div>
                    {row.matchedNodes.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No graph node match</div>
                    ) : (
                      row.matchedNodes.slice(0, 5).map((n, j) => (
                        <div key={n.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 2 }}>{n.name}</div>
                          {n.type && <div style={{ fontSize: 9, color: '#00e5ff88' }}>{n.type}</div>}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(n.matchScore * 100)}%`, background: '#00e5ff', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Contacts */}
                  <div style={{ flex: 1, background: 'rgba(168,85,247,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#a855f7', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      CONTACTS ({row.matchedContacts.length})
                    </div>
                    {row.matchedContacts.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No contact match</div>
                    ) : (
                      row.matchedContacts.slice(0, 5).map((c, j) => (
                        <div key={c.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{c.name}</div>
                          {(c.title || c.company) && (
                            <div style={{ fontSize: 9, color: '#a855f788' }}>
                              {[c.title, c.company].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(c.matchScore * 100)}%`, background: '#a855f7', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(0,229,255,0.1)',
                      border: '1px solid #00e5ff44',
                      color: '#00e5ff',
                      padding: '3px 12px',
                      borderRadius: 3,
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
